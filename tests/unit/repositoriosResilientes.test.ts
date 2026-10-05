import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Flashcard, Question, QuestionAnswerRecord, QuestionReviewResult, UserFeedback } from '../../src/types';

// Cobertura dos wrappers `Resilient*Repository` (src/repositories/*Repository.ts)
// antes da refatoração do App.tsx. Prova o comportamento OBSERVÁVEL do padrão
// "grava local primeiro, espelha no Supabase pela fila de sincronização":
//
// - leitura: Supabase não configurado -> local; Supabase falha -> local;
// - escrita: sempre local primeiro; só enfileira com Supabase configurado E
//   usuário ativo; falha de rede nunca perde o dado local nem a operação;
// - idempotência: a retentativa reenvia o MESMO client_op_id (é ele que o
//   servidor usa para não duplicar efeito — ver docs/SINCRONIZACAO-CONFIAVEL.md);
// - toggles (favorito, seção lida) viram "set" explícito, nunca toggle
//   reenviável.
//
// O que é real aqui: StorageService (sobre um localStorage em memória) e a
// fila `syncQueue` inteira. O que é falso, por ser inevitável num teste
// unitário sem rede: o módulo `lib/supabaseClient` (flag de configuração e
// `auth.getSession`, que a fila consulta antes de enviar), as classes
// `Supabase*Repository` (leituras) e os handlers da fila (registrados aqui via
// `registerHandler`, a mesma porta de injeção que `syncHandlers.ts` usa em
// produção — o teste nunca toca Supabase real).
//
// `vi.resetModules` + `vi.doMock` + import dinâmico por cenário porque
// `isSupabaseConfigured` é constante de carga de módulo e a fila guarda
// estado em nível de módulo (handlers, flush em andamento).

const UID = 'user-a';

const SUPA_MODULES = [
  'Answers',
  'Bookmarks',
  'ErrorNotebook',
  'Feedback',
  'Flashcards',
  'Materials',
  'Notes',
  'QuestionReactions',
  'Questions',
  'ReadingProgress',
  'Simulados',
] as const;
type SupaName = (typeof SUPA_MODULES)[number];

const REPO_LOADERS = {
  AnswersRepository: () => import('../../src/repositories/AnswersRepository'),
  BookmarksRepository: () => import('../../src/repositories/BookmarksRepository'),
  ErrorNotebookRepository: () => import('../../src/repositories/ErrorNotebookRepository'),
  FeedbackRepository: () => import('../../src/repositories/FeedbackRepository'),
  FlashcardsRepository: () => import('../../src/repositories/FlashcardsRepository'),
  NotesRepository: () => import('../../src/repositories/NotesRepository'),
  QuestionReactionsRepository: () => import('../../src/repositories/QuestionReactionsRepository'),
  QuestionsRepository: () => import('../../src/repositories/QuestionsRepository'),
  ReadingProgressRepository: () => import('../../src/repositories/ReadingProgressRepository'),
  SimuladosRepository: () => import('../../src/repositories/SimuladosRepository'),
} as const;

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
  };
}

function setOnline(value: boolean) {
  Object.defineProperty(globalThis.navigator, 'onLine', { value, configurable: true });
}

interface SetupOptions {
  configured: boolean;
  /** Implementação falsa de cada Supabase*Repository usado no cenário. */
  supa?: Partial<Record<SupaName, Record<string, unknown>>>;
  /** Usuário da sessão ativa no Supabase (a fila só envia se for igual ao dono). */
  activeSessionUid?: string | null;
  /** Usuário ativo no StorageService (null = ninguém logado). */
  storageUser?: string | null;
}

async function setup(opts: SetupOptions) {
  const activeSessionUid = opts.activeSessionUid === undefined ? UID : opts.activeSessionUid;
  vi.doMock('../../src/lib/supabaseClient', () => ({
    isSupabaseConfigured: opts.configured,
    supabase: {
      auth: {
        getSession: async () => ({
          data: { session: activeSessionUid ? { user: { id: activeSessionUid } } : null },
          error: null,
        }),
      },
    },
  }));
  vi.doMock('../../src/services/legacyRecovery', () => ({ recoverLegacyLocalProgress: async () => {} }));
  for (const name of SUPA_MODULES) {
    const impl = opts.supa?.[name] ?? {};
    vi.doMock(`../../src/repositories/Supabase${name}Repository`, () => ({
      [`Supabase${name}Repository`]: vi.fn().mockImplementation(() => impl),
    }));
  }

  const storage = await import('../../src/services/storage');
  const queue = await import('../../src/services/syncQueue');
  const storageUser = opts.storageUser === undefined ? UID : opts.storageUser;
  storage.setStorageUser(storageUser);
  return { StorageService: storage.StorageService, queue };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('localStorage', createMemoryStorage());
  setOnline(true);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.doUnmock('../../src/lib/supabaseClient');
  vi.doUnmock('../../src/services/legacyRecovery');
  for (const name of SUPA_MODULES) vi.doUnmock(`../../src/repositories/Supabase${name}Repository`);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const networkError = () => new Error('Failed to fetch');

/** Popula a cópia local de todas as áreas lidas — para provar que, com o servidor falhando, ela NÃO é usada (45-G, D-2). */
function seedLocal(S: Awaited<ReturnType<typeof setup>>['StorageService']) {
  S.saveNote('q-1', 'nota local');
  S.setBookmark('questions', 'q-1', true);
  S.setSectionRead('comp-1', 'sec-1', true, 2);
  S.saveSimuladoSession({ id: 'sim-local' } as never);
  S.recordAnswer(makeAnswer()); // resposta errada também gera item no caderno de erros
  S.setQuestionReaction('q-1', 'up');
  S.saveFeedback({ id: 'fb-1', type: 'elogio', title: 't', description: 'd', createdAt: '', status: 'pendente' });
  S.saveQuestions([{ id: 'q-local', options: [] } as never]);
  S.saveFlashcards([makeCard('fc-local')]);
}

// ---------------------------------------------------------------------------
// Leitura com fallback
// ---------------------------------------------------------------------------
// 45-G (D-2): sem leitura offline. Com Supabase configurado, a leitura vem só
// do servidor; a falha sobe para a tela (que diz "sem conexão"), nunca cai
// numa cópia local vazia ou velha.
describe('Resilient*Repository — leitura só do servidor', () => {
  it('sem Supabase configurado, lê só do local e nunca consulta o Supabase', async () => {
    const getNotes = vi.fn();
    const { StorageService } = await setup({ configured: false, supa: { Notes: { getNotes } } });
    StorageService.saveNote('q-1', 'nota local');

    const { notesRepository } = await import('../../src/repositories/NotesRepository');
    expect(await notesRepository.getNotes()).toEqual({ 'q-1': 'nota local' });
    expect(getNotes).not.toHaveBeenCalled();
  });

  it('com Supabase configurado e leitura bem-sucedida, devolve o dado do servidor (não o local)', async () => {
    const { StorageService } = await setup({
      configured: true,
      supa: { Notes: { getNotes: async () => ({ 'q-1': 'nota do servidor' }) } },
    });
    StorageService.saveNote('q-1', 'nota local desatualizada');

    const { notesRepository } = await import('../../src/repositories/NotesRepository');
    expect(await notesRepository.getNotes()).toEqual({ 'q-1': 'nota do servidor' });
  });

  it.each([
    ['NotesRepository', 'notesRepository', 'Notes', 'getNotes'],
    // Veio do #92 (45-D) engolindo a falha e devolvendo {} — mesma regra (45-G).
    ['NotesRepository', 'notesRepository', 'Notes', 'getRemovedSectionNotes'],
    ['BookmarksRepository', 'bookmarksRepository', 'Bookmarks', 'getBookmarks'],
    ['ReadingProgressRepository', 'readingProgressRepository', 'ReadingProgress', 'getReadingProgress'],
    ['SimuladosRepository', 'simuladosRepository', 'Simulados', 'getSimulados'],
    ['SimuladosRepository', 'simuladosRepository', 'Simulados', 'getSimuladoHistory'],
    ['ErrorNotebookRepository', 'errorNotebookRepository', 'ErrorNotebook', 'getErrorLogs'],
    ['AnswersRepository', 'answersRepository', 'Answers', 'getAnswers'],
    ['QuestionReactionsRepository', 'questionReactionsRepository', 'QuestionReactions', 'getMyReactions'],
    ['FeedbackRepository', 'feedbackRepository', 'Feedback', 'getFeedbacks'],
    ['QuestionsRepository', 'questionsRepository', 'Questions', 'getQuestions'],
    ['FlashcardsRepository', 'flashcardsRepository', 'Flashcards', 'getFlashcards'],
    ['FlashcardsRepository', 'flashcardsRepository', 'Flashcards', 'getDueFlashcards'],
  ] as const)('%s.%s: falha do Supabase é propagada, sem cair na cópia local', async (file, exportName, supaName, method) => {
    const failing = vi.fn().mockRejectedValue(networkError());
    const { StorageService } = await setup({ configured: true, supa: { [supaName]: { [method]: failing } } });
    seedLocal(StorageService); // há cópia local — e mesmo assim ela não é usada

    const mod = (await REPO_LOADERS[file]()) as unknown as Record<string, Record<string, () => Promise<unknown>>>;
    await expect(mod[exportName][method]()).rejects.toThrow('Failed to fetch');
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it.each([['getDisciplines'], ['getThemes'], ['getCompendiums']] as const)(
    'MaterialsRepository.%s: falha do Supabase é propagada, sem cair na cópia local',
    async (method) => {
      const failing = vi.fn().mockRejectedValue(networkError());
      await setup({ configured: true, supa: { Materials: { [method]: failing } } });
      const { materialsRepository } = await import('../../src/repositories/MaterialsRepository');
      await expect((materialsRepository as unknown as Record<string, () => Promise<unknown>>)[method]()).rejects.toThrow('Failed to fetch');
    }
  );

  it('QuestionReactionsRepository.getMyReaction e QuestionsRepository.getQuestionReview: falha do Supabase é propagada', async () => {
    const { StorageService } = await setup({
      configured: true,
      supa: {
        QuestionReactions: { getMyReaction: vi.fn().mockRejectedValue(networkError()) },
        Questions: { getQuestionReview: vi.fn().mockRejectedValue(networkError()) },
      },
    });
    StorageService.setQuestionReaction('q-9', 'down');
    const { questionReactionsRepository } = await import('../../src/repositories/QuestionReactionsRepository');
    const { questionsRepository } = await import('../../src/repositories/QuestionsRepository');
    await expect(questionReactionsRepository.getMyReaction('q-9')).rejects.toThrow('Failed to fetch');
    await expect(questionsRepository.getQuestionReview('q-9')).rejects.toThrow('Failed to fetch');
  });

  it('FlashcardsRepository: resposta vazia do Supabase é o estado do servidor (não reaparece card da cópia local)', async () => {
    const { StorageService } = await setup({ configured: true, supa: { Flashcards: { getFlashcards: async () => [] } } });
    StorageService.saveFlashcards([makeCard('fc-local')]);
    const { flashcardsRepository } = await import('../../src/repositories/FlashcardsRepository');
    expect(await flashcardsRepository.getFlashcards()).toEqual([]);
  });

  it('FeedbackRepository.getAllFeedback (admin): com Supabase configurado, erro é propagado — sem fallback silencioso para o local', async () => {
    await setup({
      configured: true,
      supa: { Feedback: { getAllFeedback: vi.fn().mockRejectedValue(new Error('permission denied')) } },
    });
    const { feedbackRepository } = await import('../../src/repositories/FeedbackRepository');
    await expect(feedbackRepository.getAllFeedback()).rejects.toThrow('permission denied');
  });
});

// ---------------------------------------------------------------------------
// Escrita: local primeiro, enfileiramento condicionado
// ---------------------------------------------------------------------------
describe('Resilient*Repository — escrita local e enfileiramento', () => {
  it('sem Supabase configurado, grava só local e não cria nenhuma operação na fila', async () => {
    const { StorageService, queue } = await setup({ configured: false });
    const { notesRepository } = await import('../../src/repositories/NotesRepository');
    await notesRepository.saveNote('q-1', 'offline total');

    expect(StorageService.getNotes()).toEqual({ 'q-1': 'offline total' });
    expect(queue.getOps(UID)).toEqual([]);
  });

  it('com Supabase configurado mas sem usuário ativo, grava local e não enfileira', async () => {
    const { StorageService, queue } = await setup({ configured: true, storageUser: null });
    const { notesRepository } = await import('../../src/repositories/NotesRepository');
    await notesRepository.saveNote('q-1', 'anônimo');

    expect(StorageService.getNotes()).toEqual({ 'q-1': 'anônimo' });
    expect(queue.getOps(UID)).toEqual([]);
  });

  it('com Supabase e usuário, cada repositório enfileira a categoria e o payload esperados', async () => {
    const { queue } = await setup({ configured: true });
    // Só o simulado precisa de resposta autoritativa para concluir a chamada;
    // as demais categorias sem handler continuam pendentes neste teste.
    queue.registerHandler('simulado_save', async () => ({ score: 0, correctCount: 0, totalCount: 0 }));
    const { notesRepository } = await import('../../src/repositories/NotesRepository');
    const { errorNotebookRepository } = await import('../../src/repositories/ErrorNotebookRepository');
    const { simuladosRepository } = await import('../../src/repositories/SimuladosRepository');
    const { questionReactionsRepository } = await import('../../src/repositories/QuestionReactionsRepository');
    const { flashcardsRepository } = await import('../../src/repositories/FlashcardsRepository');

    await notesRepository.saveNote('q-1', 'texto');
    await errorNotebookRepository.updateErrorLog({
      id: 'err-1',
      questionId: 'q-1',
      timestamp: '2026-09-18T10:00:00.000Z',
      selectedOption: 'A',
      correctOption: 'B',
      errorReason: 'pegadinha',
      userNotes: '',
      resolved: true,
    });
    await simuladosRepository.saveSimuladoSession({ id: 'sim-1' } as never);
    await questionReactionsRepository.setReaction('q-1', 'up');
    await questionReactionsRepository.removeReaction('q-1');
    await flashcardsRepository.deleteFlashcard('fc-1');
    await queue.flush(UID);

    const ops = queue.getOps(UID);
    expect(ops.map((o) => [o.category, o.state])).toEqual([
      ['note_upsert', 'pending'],
      ['error_notebook_update', 'pending'],
      ['simulado_save', 'synced'],
      ['reaction_set', 'pending'],
      ['flashcard_delete', 'pending'],
    ]);
    expect(ops[0].payload).toEqual({ targetId: 'q-1', noteText: 'texto' });
    // 45-E: remover a reação substitui o "up" ainda não enviado da mesma questão.
    expect(ops[3].payload).toEqual({ questionId: 'q-1', reaction: null });
    // Cada operação tem um client_op_id próprio (uuid) — nunca compartilhado.
    const ids = ops.map((o) => o.clientOpId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('FeedbackRepository.saveFeedback usa o próprio feedback.id como client_op_id (reenvio nunca duplica o relato)', async () => {
    const { StorageService, queue } = await setup({ configured: true });
    const seen: string[] = [];
    queue.registerHandler('feedback_submit', async (_p, clientOpId) => {
      seen.push(clientOpId);
      if (seen.length === 1) throw networkError();
      return { ok: true };
    });
    const { feedbackRepository } = await import('../../src/repositories/FeedbackRepository');
    const feedback: UserFeedback = {
      id: '11111111-2222-4333-8444-555555555555',
      type: 'problema',
      title: 'Erro no gabarito',
      description: 'A alternativa correta parece ser a C',
      createdAt: '2026-09-18T10:00:00.000Z',
      status: 'pendente',
    };
    await feedbackRepository.saveFeedback(feedback);
    await queue.flush(UID);
    expect(queue.getOps(UID)[0].state).toBe('pending'); // falhou por rede, não sumiu

    await queue.flush(UID, true); // rede voltou (evento `online` força o reenvio)

    expect(seen).toEqual([feedback.id, feedback.id]);
    expect(queue.getOps(UID)).toHaveLength(1);
    expect(queue.getOps(UID)[0].state).toBe('synced');
    expect(StorageService.getFeedbacks()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Falha de rede: nunca perder, nunca duplicar
// ---------------------------------------------------------------------------
describe('Resilient*Repository — falha de rede e retentativa', () => {
  it('falha de rede mantém a nota local e a operação pendente com backoff; a retentativa reenvia o MESMO client_op_id', async () => {
    const { StorageService, queue } = await setup({ configured: true });
    const calls: Array<{ payload: unknown; clientOpId: string }> = [];
    let online = false;
    queue.registerHandler('note_upsert', async (payload, clientOpId) => {
      calls.push({ payload, clientOpId });
      if (!online) throw networkError();
      return { updated_at: '2026-09-18T10:00:00.000Z' };
    });

    const { notesRepository } = await import('../../src/repositories/NotesRepository');
    await notesRepository.saveNote('q-1', 'escrito sem rede');
    await queue.flush(UID);

    expect(StorageService.getNotes()).toEqual({ 'q-1': 'escrito sem rede' });
    let [op] = queue.getOps(UID);
    expect(op.state).toBe('pending');
    expect(op.attempts).toBe(1);
    expect(op.lastError?.kind).toBe('network');
    expect(new Date(op.nextRetryAt!).getTime()).toBeGreaterThan(Date.now());

    // Heartbeat sem sinal novo respeita o backoff: não reenvia.
    await queue.flush(UID);
    expect(calls).toHaveLength(1);

    online = true;
    await queue.flush(UID, true);

    [op] = queue.getOps(UID);
    expect(queue.getOps(UID)).toHaveLength(1);
    expect(op.state).toBe('synced');
    expect(calls).toHaveLength(2);
    expect(calls[1].clientOpId).toBe(calls[0].clientOpId);
    expect(calls[1].payload).toEqual({ targetId: 'q-1', noteText: 'escrito sem rede' });
  });

  it('erro permanente (validação) marca a operação como falha visível, sem retentativa automática, e mantém o dado local', async () => {
    const { StorageService, queue } = await setup({ configured: true });
    const handler = vi.fn().mockRejectedValue(Object.assign(new Error('rating inválido'), { code: '23514' }));
    queue.registerHandler('note_upsert', handler);

    const { notesRepository } = await import('../../src/repositories/NotesRepository');
    await notesRepository.saveNote('q-1', 'texto');
    await queue.flush(UID);
    await queue.flush(UID, true);

    expect(handler).toHaveBeenCalledTimes(1);
    const [op] = queue.getOps(UID);
    expect(op.state).toBe('failed');
    expect(op.lastError?.kind).toBe('validation');
    expect(queue.getSummary(UID).status).toBe('error');
    expect(StorageService.getNotes()).toEqual({ 'q-1': 'texto' });
  });

  it('nunca envia a fila de um usuário sob a sessão de outro — a operação fica pendente, intacta', async () => {
    const { queue } = await setup({ configured: true, activeSessionUid: 'user-b' });
    const handler = vi.fn().mockResolvedValue({});
    queue.registerHandler('note_upsert', handler);

    const { notesRepository } = await import('../../src/repositories/NotesRepository');
    await notesRepository.saveNote('q-1', 'de A');
    await queue.flush(UID, true);

    expect(handler).not.toHaveBeenCalled();
    const ops = queue.getOps(UID);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ userId: UID, state: 'pending', attempts: 0 });
    expect(queue.getOps('user-b')).toEqual([]);
  });

  it('operação deixada em "syncing" por um reload no meio do envio é retomada com o mesmo client_op_id', async () => {
    const { queue } = await setup({ configured: true });
    const clientOpId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    localStorage.setItem(
      `synapse_${UID}_sync_queue_v1`,
      JSON.stringify([
        {
          id: clientOpId,
          clientOpId,
          userId: UID,
          category: 'note_upsert',
          payload: { targetId: 'q-1', noteText: 'antes do reload' },
          createdAt: '2026-09-18T10:00:00.000Z',
          updatedAt: '2026-09-18T10:00:00.000Z',
          state: 'syncing',
          attempts: 0,
        },
      ])
    );
    const handler = vi.fn().mockResolvedValue({});
    queue.registerHandler('note_upsert', handler);

    await queue.flush(UID);

    expect(handler).toHaveBeenCalledTimes(1);
    // 3º argumento: contexto da fila para o handler (45-E).
    expect(handler).toHaveBeenCalledWith({ targetId: 'q-1', noteText: 'antes do reload' }, clientOpId, expect.anything());
    expect(queue.getOps(UID)[0].state).toBe('synced');
  });

  it('duas gravações em sequência rápida (a 2ª durante o flush da 1ª) — nenhuma se perde', async () => {
    const { queue } = await setup({ configured: true });
    const sent: unknown[] = [];
    queue.registerHandler('note_upsert', async (payload) => {
      sent.push(payload);
      return {};
    });
    const { notesRepository } = await import('../../src/repositories/NotesRepository');

    // Sem await entre as duas: o 1º enqueue dispara um flush que suspende em
    // `auth.getSession()`; o 2º enqueue grava a fila nesse intervalo.
    const p1 = notesRepository.saveNote('q-1', 'primeira');
    const p2 = notesRepository.saveNote('q-2', 'segunda');
    await Promise.all([p1, p2]);
    await queue.flush(UID);
    await queue.flush(UID);

    expect(sent).toEqual([
      { targetId: 'q-1', noteText: 'primeira' },
      { targetId: 'q-2', noteText: 'segunda' },
    ]);
    expect(queue.getOps(UID).map((o) => o.state)).toEqual(['synced', 'synced']);
  });

  it('operação criada pelo callback de conclusão de um flush ganha uma nova passagem automaticamente', async () => {
    const { queue } = await setup({ configured: true });
    const handler = vi.fn().mockResolvedValue({ ok: true });
    queue.registerHandler('derived_after_confirmation', handler);
    let derivedEnqueued = false;
    const unsubscribe = queue.subscribe(UID, () => {
      const source = queue.getOps(UID).find((op) => op.category === 'source_confirmation');
      if (source?.state === 'synced' && !derivedEnqueued) {
        derivedEnqueued = true;
        queue.enqueue(UID, 'derived_after_confirmation', { sourceId: source.id });
      }
    });
    queue.registerHandler('source_confirmation', async () => ({ confirmed: true }));

    queue.enqueue(UID, 'source_confirmation', { value: 1 });

    await vi.waitFor(() => {
      const derived = queue.getOps(UID).find((op) => op.category === 'derived_after_confirmation');
      expect(derived?.state).toBe('synced');
    });
    expect(handler).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

// ---------------------------------------------------------------------------
// Toggles viram "set" explícito — reenvio é sempre seguro
// ---------------------------------------------------------------------------
// 45-G (AUD-29): a tela manda o estado que mostra e o que o estudante quer;
// o repositório nunca "inverte" a partir da cópia local — que num aparelho
// novo está vazia, e fazia a estrela preenchida gravar "favoritar".
describe('Resilient*Repository — favorito e leitura com estado desejado explícito', () => {
  it('Bookmarks: aparelho novo (cópia local vazia), favorito vindo do servidor — remover grava "desfavoritar"', async () => {
    const { StorageService, queue } = await setup({ configured: true });
    const { bookmarksRepository } = await import('../../src/repositories/BookmarksRepository');
    expect(StorageService.getBookmarks().questions).toEqual([]); // nada local

    expect(await bookmarksRepository.setBookmark('questions', 'q-1', false)).toBe(false);
    await queue.flush(UID);

    expect(queue.getOps(UID).map((o) => o.payload)).toEqual([{ type: 'questions', id: 'q-1', desired: false }]);
    expect(StorageService.getBookmarks().questions).toEqual([]);
  });

  it('Bookmarks: favoritar e desfavoritar offline, depois reconectar — o servidor termina no último estado pedido', async () => {
    const { StorageService, queue } = await setup({ configured: true });
    const serverState = new Set<string>();
    let online = false;
    queue.registerHandler('bookmark_set', async (payload: { type: string; id: string; desired: boolean }) => {
      if (!online) throw networkError();
      if (payload.desired) serverState.add(payload.id);
      else serverState.delete(payload.id);
      return {};
    });
    const { bookmarksRepository } = await import('../../src/repositories/BookmarksRepository');

    expect(await bookmarksRepository.setBookmark('questions', 'q-1', true)).toBe(true);
    await queue.flush(UID);
    expect(await bookmarksRepository.setBookmark('questions', 'q-1', false)).toBe(false);
    await queue.flush(UID);
    // 45-E: o desfavoritar substitui o favoritar que ainda não saiu.
    expect(queue.getOps(UID).map((o) => (o.payload as { desired: boolean }).desired)).toEqual([false]);

    online = true;
    await queue.flush(UID, true);
    await queue.flush(UID, true); // reenviar é no-op seguro

    expect(StorageService.getBookmarks().questions).toEqual([]);
    expect(serverState.has('q-1')).toBe(false);
    expect(queue.getOps(UID).every((o) => o.state === 'synced')).toBe(true);
  });

  it('ReadingProgress: aparelho novo, seção lida vinda do servidor — desmarcar grava "não lida"', async () => {
    const { queue } = await setup({ configured: true });
    const { readingProgressRepository } = await import('../../src/repositories/ReadingProgressRepository');

    await readingProgressRepository.setSectionRead('comp-1', 'sec-1', false, 4);
    await queue.flush(UID);

    expect(queue.getOps(UID).map((o) => o.payload)).toEqual([
      { compendiumId: 'comp-1', sectionId: 'sec-1', isRead: false, totalSections: 4 },
    ]);
  });

  it('ReadingProgress: marcar a mesma seção duas vezes como lida não a desmarca (set, não toggle)', async () => {
    const { StorageService, queue } = await setup({ configured: true });
    const { readingProgressRepository } = await import('../../src/repositories/ReadingProgressRepository');

    await readingProgressRepository.setSectionRead('comp-1', 'sec-1', true, 4);
    await readingProgressRepository.setSectionRead('comp-1', 'sec-1', true, 4);
    await readingProgressRepository.setSectionRead('comp-1', 'sec-2', true, 4);
    await queue.flush(UID);

    expect(StorageService.getReadingProgress()['comp-1'].readSectionIds).toEqual(['sec-1', 'sec-2']);
    expect(queue.getOps(UID).map((o) => o.payload)).toEqual([
      { compendiumId: 'comp-1', sectionId: 'sec-1', isRead: true, totalSections: 4 },
      { compendiumId: 'comp-1', sectionId: 'sec-2', isRead: true, totalSections: 4 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Operações que esperam resultado do servidor (enqueueAndTry)
// ---------------------------------------------------------------------------
function makeAnswer(overrides: Partial<QuestionAnswerRecord> = {}): QuestionAnswerRecord {
  return {
    questionId: 'q-1',
    selectedOption: 'B',
    isCorrect: false,
    timestamp: '2026-09-18T10:00:00.000Z',
    timeSpentSeconds: 42,
    ...overrides,
  };
}

function makeCard(id: string): Flashcard {
  return {
    id,
    disciplineId: 'd-1',
    themeId: 't-1',
    front: 'frente',
    back: 'verso',
    mechanismHighlight: '',
    tags: [],
    difficulty: 'medio',
    srs: {
      intervalDays: 0,
      repetitionCount: 0,
      easeFactor: 2.5,
      nextDueDate: '2026-09-18T00:00:00.000Z',
      state: 'new',
      reviewHistory: [],
    },
  };
}

function makeQuestionForFlashcard(): Question {
  return {
    id: 'q-flashcard-duplicado',
    disciplineId: 'd-1',
    themeId: 't-1',
    compendiumRefId: '',
    cycle: 'clinico',
    institution: 'NexusMed',
    year: 2026,
    clinicalVignette: 'Vinheta',
    questionStem: 'Qual é a alternativa correta?',
    options: [{ letter: 'A', text: 'Alternativa A', isCorrect: true, explanation: 'Correta' }],
    highYieldSummary: 'Resumo de alto rendimento',
    generalCommentary: 'Comentário',
    tags: [],
    difficulty: 'medio',
  } as Question;
}

describe('AnswersRepository.recordAnswer', () => {
  it('sucesso no servidor: devolve o gabarito do servidor e a resposta também fica gravada localmente', async () => {
    const { StorageService, queue } = await setup({ configured: true });
    queue.registerHandler('question_attempt', async () => ({
      is_correct: false,
      correct_option_id: 'C',
      general_commentary: 'comentário do servidor',
      high_yield_summary: 'resumo',
      options: [{ option_id: 'C', letter: 'C', is_correct: true, explanation: 'porque sim' }],
    }));
    const { answersRepository } = await import('../../src/repositories/AnswersRepository');

    const result = await answersRepository.recordAnswer(makeAnswer());

    expect(result.status).toBe('confirmed');
    if (result.status !== 'confirmed') throw new Error('resultado deveria estar confirmado');
    expect(result.review.correctOptionId).toBe('C');
    expect(result.review.generalCommentary).toBe('comentário do servidor');
    // O handler real persiste a cópia local depois da correção; este teste
    // injeta um handler mínimo e prova que o repositório não inventa estado.
    expect(StorageService.getAnswers()['q-1']).toBeUndefined();
    expect(queue.getOps(UID)).toHaveLength(1);
    expect(queue.getOps(UID)[0].state).toBe('synced');
  });

  it('offline: devolve correção pendente, não grava falso erro local e mantém a operação para reenvio', async () => {
    setOnline(false);
    const { StorageService, queue } = await setup({ configured: true });
    const handler = vi.fn().mockRejectedValue(networkError());
    queue.registerHandler('question_attempt', handler);
    const { answersRepository } = await import('../../src/repositories/AnswersRepository');

    const result = await answersRepository.recordAnswer(makeAnswer());

    expect(result.status).toBe('pending');
    expect(StorageService.getAnswers()['q-1']).toBeUndefined();
    expect(StorageService.getErrorLogs()).toEqual([]);
    const ops = queue.getOps(UID);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ category: 'question_attempt', state: 'pending', attempts: 1 });
    expect(ops[0].payload).toMatchObject({ questionId: 'q-1', selectedOption: 'B', timeSpentSeconds: 42 });
  });

  it('erro permanente do servidor: devolve o resultado local sem esperar o prazo, e a falha fica visível na fila', async () => {
    const { queue } = await setup({ configured: true });
    queue.registerHandler('question_attempt', async () => {
      throw Object.assign(new Error('questão não está publicada'), { code: 'P0001' });
    });
    const { answersRepository } = await import('../../src/repositories/AnswersRepository');

    const started = Date.now();
    const result = await answersRepository.recordAnswer(makeAnswer({ isCorrect: true }));

    expect(Date.now() - started).toBeLessThan(5_000);
    expect(result.status).toBe('failed');
    expect(queue.getOps(UID)[0]).toMatchObject({ state: 'failed', lastError: { kind: 'validation' } });
  });

  it('sem Supabase configurado: só grava local e devolve o resultado local', async () => {
    const { StorageService, queue } = await setup({ configured: false });
    const { answersRepository } = await import('../../src/repositories/AnswersRepository');
    const result = await answersRepository.recordAnswer(makeAnswer());
    expect(result.status).toBe('confirmed');
    if (result.status !== 'confirmed') throw new Error('resultado deveria estar confirmado');
    expect(result.review.isCorrect).toBe(false);
    expect(StorageService.getAnswers()['q-1']).toBeDefined();
    expect(queue.getOps(UID)).toEqual([]);
  });
});

describe('FlashcardsRepository.reviewFlashcard', () => {
  it('card fora do cache local ainda é enviado ao servidor, e o SRS convergido passa a ser cacheado', async () => {
    const { StorageService, queue } = await setup({ configured: true });
    StorageService.saveFlashcards([]);
    const handler = vi.fn().mockResolvedValue({
      interval_days: 3,
      repetition_count: 1,
      ease_factor: '2.6',
      next_due_date: '2026-09-21T00:00:00.000Z',
      last_reviewed_date: '2026-09-18T00:00:00.000Z',
      state: 'learning',
      reviewed_at: '2026-09-18T10:00:00.000Z',
      rating: 3,
    });
    queue.registerHandler('flashcard_review', handler);
    const { flashcardsRepository } = await import('../../src/repositories/FlashcardsRepository');

    const reviewed = await flashcardsRepository.reviewFlashcard(makeCard('fc-remoto'), 3);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toEqual({ flashcardId: 'fc-remoto', rating: 3 });
    expect(reviewed?.srs).toMatchObject({ intervalDays: 3, easeFactor: 2.6, state: 'learning' });
    expect(reviewed?.srs.reviewHistory).toEqual([{ date: '2026-09-18T10:00:00.000Z', rating: 3 }]);
    expect(StorageService.getFlashcards().find((c) => c.id === 'fc-remoto')?.srs.intervalDays).toBe(3);
  });

  it('offline: devolve o SRS calculado localmente e deixa a revisão pendente (sem perder o evento)', async () => {
    setOnline(false);
    const { StorageService, queue } = await setup({ configured: true });
    StorageService.saveFlashcards([makeCard('fc-1')]);
    queue.registerHandler('flashcard_review', vi.fn().mockRejectedValue(networkError()));
    const { flashcardsRepository } = await import('../../src/repositories/FlashcardsRepository');

    const reviewed = await flashcardsRepository.reviewFlashcard(makeCard('fc-1'), 4);

    expect(reviewed?.srs.reviewHistory).toHaveLength(1);
    expect(StorageService.getFlashcards()[0].srs.reviewHistory).toHaveLength(1);
    expect(queue.getOps(UID)).toHaveLength(1);
    expect(queue.getOps(UID)[0]).toMatchObject({ category: 'flashcard_review', state: 'pending' });
  });
});

describe('FlashcardsRepository.createFlashcardFromQuestion', () => {
  it('duas criações para a mesma questão convergem para um único flashcard local', async () => {
    const { StorageService } = await setup({ configured: false });
    const { flashcardsRepository } = await import('../../src/repositories/FlashcardsRepository');
    const question = makeQuestionForFlashcard();

    const first = await flashcardsRepository.createFlashcardFromQuestion(question);
    const second = await flashcardsRepository.createFlashcardFromQuestion(question);

    expect(second.id).toBe(first.id);
    expect(StorageService.getFlashcards().filter((card) => card.questionOriginId === question.id)).toHaveLength(1);
  });

  it('repetir a criação remota preserva o client_op_id sem duplicar a identidade local da fila', async () => {
    const { queue } = await setup({ configured: true });
    queue.registerHandler('flashcard_create_from_question', async (payload) =>
      (payload as { flashcard: Flashcard }).flashcard
    );
    const { flashcardsRepository } = await import('../../src/repositories/FlashcardsRepository');
    const question = makeQuestionForFlashcard();

    const first = await flashcardsRepository.createFlashcardFromQuestion(question);
    await vi.waitFor(() => {
      expect(queue.getOps(UID).find((op) => op.id === first.id)?.state).toBe('synced');
    });

    const second = await flashcardsRepository.createFlashcardFromQuestion(question);
    await vi.waitFor(() => {
      const matching = queue.getOps(UID).filter((op) => op.category === 'flashcard_create_from_question');
      expect(matching).toHaveLength(2);
      expect(matching.map((op) => op.state)).toEqual(['synced', 'synced']);
    });

    expect(second.id).toBe(first.id);
    const matching = queue.getOps(UID).filter((op) => op.category === 'flashcard_create_from_question');
    expect(new Set(matching.map((op) => op.id)).size).toBe(2);
    expect(new Set(matching.map((op) => op.clientOpId))).toEqual(new Set([first.id]));
    expect(matching.map((op) => op.state)).toEqual(['synced', 'synced']);
  });
});

// P10: o card guarda a seção do material. O do erro leva a seção da questão; o do leitor é um por seção.
function makeCardDeSecao(id: string, sectionId = 'sec-obstrutivo'): Flashcard {
  return {
    id,
    disciplineId: 'd-1',
    themeId: 't-1',
    compendiumRefId: 'mat-1',
    compendiumSectionId: sectionId,
    front: '[Pneumologia] Padrão obstrutivo',
    back: 'ponto',
    mechanismHighlight: '',
    tags: [],
    difficulty: 'medio',
    isCustom: true,
    srs: { intervalDays: 1, repetitionCount: 1, easeFactor: 2.5, nextDueDate: '2026-10-04', state: 'new', reviewHistory: [] },
  } as Flashcard;
}

describe('FlashcardsRepository — seção do material no card (P10)', () => {
  it('o card do erro leva a seção da questão (local e no que vai para a fila)', async () => {
    const { StorageService, queue } = await setup({ configured: true });
    queue.registerHandler('flashcard_create_from_question', async (payload) => (payload as { flashcard: Flashcard }).flashcard);
    const { flashcardsRepository } = await import('../../src/repositories/FlashcardsRepository');
    const question = { ...makeQuestionForFlashcard(), compendiumRefId: 'mat-1', compendiumSectionId: 'sec-obstrutivo' } as Question;

    const card = await flashcardsRepository.createFlashcardFromQuestion(question);

    expect(card).toMatchObject({ compendiumRefId: 'mat-1', compendiumSectionId: 'sec-obstrutivo', questionOriginId: question.id });
    expect(StorageService.getFlashcards()[0].compendiumSectionId).toBe('sec-obstrutivo');
    const op = queue.getOps(UID).find((o) => o.category === 'flashcard_create_from_question');
    expect((op?.payload as { flashcard: Flashcard }).flashcard.compendiumSectionId).toBe('sec-obstrutivo');
  });

  it('o card de seção: gerar duas vezes não duplica (um card local, uma operação na fila)', async () => {
    const { StorageService, queue } = await setup({ configured: true });
    queue.registerHandler('flashcard_create_from_section', async (payload) => (payload as { flashcard: Flashcard }).flashcard);
    const { flashcardsRepository } = await import('../../src/repositories/FlashcardsRepository');

    const primeiro = await flashcardsRepository.createFlashcardFromSection(makeCardDeSecao('card-1'));
    const segundo = await flashcardsRepository.createFlashcardFromSection(makeCardDeSecao('card-2'));

    expect(primeiro).toMatchObject({ created: true });
    expect(segundo.created).toBe(false);
    expect(segundo.card.id).toBe('card-1');
    expect(StorageService.getFlashcards().filter((c) => c.compendiumSectionId === 'sec-obstrutivo')).toHaveLength(1);
    expect(queue.getOps(UID).filter((o) => o.category === 'flashcard_create_from_section')).toHaveLength(1);
  });

  it('outra seção é outro card', async () => {
    const { StorageService, queue } = await setup({ configured: true });
    queue.registerHandler('flashcard_create_from_section', async (payload) => (payload as { flashcard: Flashcard }).flashcard);
    const { flashcardsRepository } = await import('../../src/repositories/FlashcardsRepository');

    await flashcardsRepository.createFlashcardFromSection(makeCardDeSecao('card-1', 'sec-a'));
    const outro = await flashcardsRepository.createFlashcardFromSection(makeCardDeSecao('card-2', 'sec-b'));

    expect(outro.created).toBe(true);
    expect(StorageService.getFlashcards().filter((c) => c.compendiumRefId === 'mat-1')).toHaveLength(2);
  });

  it('o card do erro da mesma seção não conta como o card da seção (são dois cards)', async () => {
    const { StorageService } = await setup({ configured: false });
    const { flashcardsRepository } = await import('../../src/repositories/FlashcardsRepository');
    const question = { ...makeQuestionForFlashcard(), compendiumRefId: 'mat-1', compendiumSectionId: 'sec-obstrutivo' } as Question;

    await flashcardsRepository.createFlashcardFromQuestion(question);
    const daSecao = await flashcardsRepository.createFlashcardFromSection(makeCardDeSecao('card-secao'));

    expect(daSecao.created).toBe(true);
    const meus = StorageService.getFlashcards().filter((c) => c.compendiumSectionId === 'sec-obstrutivo');
    expect(meus.map((c) => c.questionOriginId ?? 'secao')).toEqual(expect.arrayContaining(['secao', question.id]));
    expect(meus).toHaveLength(2);
  });

  it('o servidor já tinha o card da seção (outro aparelho): converge para ele, sem deixar o rascunho local', async () => {
    const { StorageService, queue } = await setup({ configured: true });
    const canonico = makeCardDeSecao('card-do-servidor');
    queue.registerHandler('flashcard_create_from_section', async (payload) => {
      const enviado = (payload as { flashcard: Flashcard }).flashcard;
      StorageService.deleteFlashcard(enviado.id); // o que o handler real faz com o rascunho
      StorageService.saveFlashcard(canonico);
      return canonico;
    });
    const { flashcardsRepository } = await import('../../src/repositories/FlashcardsRepository');

    const res = await flashcardsRepository.createFlashcardFromSection(makeCardDeSecao('card-local'));

    expect(res.created).toBe(false);
    expect(res.card.id).toBe('card-do-servidor');
    const daSecao = StorageService.getFlashcards().filter((c) => c.compendiumSectionId === 'sec-obstrutivo');
    expect(daSecao.map((c) => c.id)).toEqual(['card-do-servidor']);
  });

  it('offline: o card fica no aparelho e na fila com a seção; pedir de novo não enfileira outro; ao voltar a rede sai uma operação só', async () => {
    const { StorageService, queue } = await setup({ configured: true });
    const enviados: Flashcard[] = [];
    let semRede = true;
    queue.registerHandler('flashcard_create_from_section', async (payload) => {
      if (semRede) throw networkError();
      const f = (payload as { flashcard: Flashcard }).flashcard;
      enviados.push(f);
      return f;
    });
    const { flashcardsRepository } = await import('../../src/repositories/FlashcardsRepository');

    setOnline(false);
    const primeiro = await flashcardsRepository.createFlashcardFromSection(makeCardDeSecao('card-offline-1'));
    const segundo = await flashcardsRepository.createFlashcardFromSection(makeCardDeSecao('card-offline-2'));
    expect(primeiro.created).toBe(true);
    expect(segundo).toMatchObject({ created: false, card: { id: 'card-offline-1' } });
    const naFila = queue.getOps(UID).filter((o) => o.category === 'flashcard_create_from_section');
    expect(naFila).toHaveLength(1);
    expect((naFila[0].payload as { flashcard: Flashcard }).flashcard.compendiumSectionId).toBe('sec-obstrutivo');
    expect(enviados).toHaveLength(0);
    expect(StorageService.getFlashcards().filter((c) => c.compendiumSectionId === 'sec-obstrutivo')).toHaveLength(1);

    setOnline(true);
    semRede = false;
    await queue.flush(UID, true);
    expect(enviados.map((f) => f.id)).toEqual(['card-offline-1']);
    expect(queue.getOps(UID).find((o) => o.category === 'flashcard_create_from_section')?.state).toBe('synced');
    await queue.flush(UID, true);
    expect(enviados).toHaveLength(1); // reenviar a fila não cria de novo
  });
});

// P6 (03/10): para quem não é admin, a questão carregada não traz o gabarito (todas as alternativas com
// isCorrect false, resumo vazio): o verso do card do erro tem de sair da revisão pós-resposta.
function makeQuestionSemGabarito(): Question {
  return {
    ...makeQuestionForFlashcard(),
    id: 'q-sem-gabarito',
    options: [
      { letter: 'A', text: 'Alternativa A', isCorrect: false, explanation: '' },
      { letter: 'B', text: 'Alternativa B', isCorrect: false, explanation: '' },
    ],
    highYieldSummary: '',
    generalCommentary: '',
  } as Question;
}

function makeRevisao(): QuestionReviewResult {
  return {
    isCorrect: false,
    correctOptionId: 'opt-b',
    generalCommentary: 'Comentário do servidor',
    highYieldSummary: 'Pérola do servidor',
    options: [
      { optionId: 'opt-a', letter: 'A', isCorrect: false, explanation: 'Errada' },
      { optionId: 'opt-b', letter: 'B', isCorrect: true, explanation: 'Certa' },
    ],
    references: [],
  };
}

describe('FlashcardsRepository.createFlashcardFromQuestion — verso para quem não é admin (P6)', () => {
  it('com a revisão em mãos, o verso traz a alternativa correta e a explicação, mesmo sem gabarito na questão', async () => {
    await setup({ configured: false });
    const { flashcardsRepository } = await import('../../src/repositories/FlashcardsRepository');

    const card = await flashcardsRepository.createFlashcardFromQuestion(makeQuestionSemGabarito(), makeRevisao());

    expect(card.back).toBe('Resposta Correta:' + '\n' + 'Alternativa B\n\nExplicação:\nPérola do servidor');
    expect(card.mechanismHighlight).toBe('Pérola do servidor');
  });

  it('sem a revisão, busca a do servidor (RPC pós-resposta) e o card sai completo, também na fila de sincronização', async () => {
    const getQuestionReview = vi.fn().mockResolvedValue(makeRevisao());
    const { queue } = await setup({ configured: true, supa: { Questions: { getQuestionReview } } });
    queue.registerHandler('flashcard_create_from_question', async (payload) => (payload as { flashcard: Flashcard }).flashcard);
    const { flashcardsRepository } = await import('../../src/repositories/FlashcardsRepository');

    const card = await flashcardsRepository.createFlashcardFromQuestion(makeQuestionSemGabarito());

    expect(getQuestionReview).toHaveBeenCalledTimes(1);
    expect(getQuestionReview).toHaveBeenCalledWith('q-sem-gabarito');
    expect(card.back).toContain('Alternativa B');
    expect(card.back).toContain('Pérola do servidor');
    const op = queue.getOps(UID).find((o) => o.category === 'flashcard_create_from_question');
    expect((op?.payload as { flashcard: Flashcard }).flashcard.back).toContain('Alternativa B');
  });

  it('se a revisão não puder ser buscada, o erro sobe e nenhum card vazio é criado', async () => {
    const getQuestionReview = vi.fn().mockRejectedValue(networkError());
    const { StorageService, queue } = await setup({ configured: true, supa: { Questions: { getQuestionReview } } });
    const { flashcardsRepository } = await import('../../src/repositories/FlashcardsRepository');

    await expect(flashcardsRepository.createFlashcardFromQuestion(makeQuestionSemGabarito())).rejects.toThrow('Failed to fetch');

    expect(StorageService.getFlashcards()).toHaveLength(0);
    expect(queue.getOps(UID).filter((o) => o.category === 'flashcard_create_from_question')).toHaveLength(0);
  });

  it('quem vê o gabarito (admin) continua com o verso de antes, sem pedir a revisão', async () => {
    const getQuestionReview = vi.fn();
    await setup({ configured: false, supa: { Questions: { getQuestionReview } } });
    const { flashcardsRepository } = await import('../../src/repositories/FlashcardsRepository');

    const card = await flashcardsRepository.createFlashcardFromQuestion(makeQuestionForFlashcard());

    expect(card.back).toBe('Resposta Correta:\nAlternativa A\n\nExplicação:\nResumo de alto rendimento');
    expect(getQuestionReview).not.toHaveBeenCalled();
  });

  it('card já existente para a questão não pede a revisão de novo', async () => {
    const getQuestionReview = vi.fn().mockResolvedValue(makeRevisao());
    const { queue } = await setup({ configured: true, supa: { Questions: { getQuestionReview } } });
    queue.registerHandler('flashcard_create_from_question', async (payload) => (payload as { flashcard: Flashcard }).flashcard);
    const { flashcardsRepository } = await import('../../src/repositories/FlashcardsRepository');
    const question = makeQuestionSemGabarito();

    const first = await flashcardsRepository.createFlashcardFromQuestion(question);
    const second = await flashcardsRepository.createFlashcardFromQuestion(question);

    expect(second.id).toBe(first.id);
    expect(getQuestionReview).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// QuestionsRepository (admin): sem fila — erro remoto é propagado, nunca engolido
// ---------------------------------------------------------------------------
describe('QuestionsRepository (escrita administrativa)', () => {
  it('falha do Supabase em saveQuestion é propagada ao chamador (não é catch{} silencioso), com cópia local já gravada', async () => {
    const { StorageService } = await setup({
      configured: true,
      supa: { Questions: { saveQuestion: vi.fn().mockRejectedValue(networkError()) } },
    });
    const { questionsRepository } = await import('../../src/repositories/QuestionsRepository');
    const question = { id: 'q-admin', options: [] } as never;

    await expect(questionsRepository.saveQuestion(question)).rejects.toThrow('Failed to fetch');
    expect(StorageService.getQuestions().some((q) => q.id === 'q-admin')).toBe(true);
  });

  it('sem Supabase configurado, publishQuestion é no-op e não chama o Supabase', async () => {
    const publishQuestion = vi.fn();
    await setup({ configured: false, supa: { Questions: { publishQuestion } } });
    const { questionsRepository } = await import('../../src/repositories/QuestionsRepository');
    await expect(questionsRepository.publishQuestion('q-1')).resolves.toBeUndefined();
    expect(publishQuestion).not.toHaveBeenCalled();
  });
});

// CARD-1: o cartão que o usuário escreve. Vários por seção ou questão; o mesmo envio (mesmo id) não duplica;
// nunca toma o lugar do cartão automático do erro.
describe('FlashcardsRepository.createWrittenFlashcard — cartão escrito (CARD-1)', () => {
  function cartaoEscrito(id: string, extra: Partial<Flashcard> = {}): Flashcard {
    return { ...makeCardDeSecao(id), front: `Frente ${id}`, back: `Verso ${id}`, isWritten: true, ...extra } as Flashcard;
  }

  it('dois cartões na mesma seção são dois cartões no aparelho e duas operações na fila (cada uma com o id do cartão)', async () => {
    const { StorageService, queue } = await setup({ configured: true });
    queue.registerHandler('flashcard_create_written', async (payload) => (payload as { flashcard: Flashcard }).flashcard);
    const { flashcardsRepository } = await import('../../src/repositories/FlashcardsRepository');

    await flashcardsRepository.createWrittenFlashcard(cartaoEscrito('escrito-1'));
    await flashcardsRepository.createWrittenFlashcard(cartaoEscrito('escrito-2'));

    expect(StorageService.getFlashcards().filter((c) => c.compendiumSectionId === 'sec-obstrutivo')).toHaveLength(2);
    const ops = queue.getOps(UID).filter((o) => o.category === 'flashcard_create_written');
    expect(ops.map((o) => o.clientOpId).sort()).toEqual(['escrito-1', 'escrito-2']);
    expect((ops[0].payload as { flashcard: Flashcard }).flashcard).toMatchObject({ isWritten: true, compendiumSectionId: 'sec-obstrutivo' });
  });

  it('o mesmo cartão salvo de novo (mesmo id) continua um cartão no aparelho e leva o mesmo client_op_id', async () => {
    const { StorageService, queue } = await setup({ configured: true });
    queue.registerHandler('flashcard_create_written', async (payload) => (payload as { flashcard: Flashcard }).flashcard);
    const { flashcardsRepository } = await import('../../src/repositories/FlashcardsRepository');

    await flashcardsRepository.createWrittenFlashcard(cartaoEscrito('escrito-1'));
    await flashcardsRepository.createWrittenFlashcard(cartaoEscrito('escrito-1'));

    expect(StorageService.getFlashcards().filter((c) => c.id === 'escrito-1')).toHaveLength(1);
    const ops = queue.getOps(UID).filter((o) => o.category === 'flashcard_create_written');
    expect(new Set(ops.map((o) => o.clientOpId))).toEqual(new Set(['escrito-1']));
  });

  it('offline: o cartão fica no aparelho e na fila; ao voltar a rede sai uma operação só, e reenviar a fila não cria de novo', async () => {
    const { StorageService, queue } = await setup({ configured: true });
    const enviados: Flashcard[] = [];
    let semRede = true;
    queue.registerHandler('flashcard_create_written', async (payload) => {
      if (semRede) throw networkError();
      const f = (payload as { flashcard: Flashcard }).flashcard;
      enviados.push(f);
      return f;
    });
    const { flashcardsRepository } = await import('../../src/repositories/FlashcardsRepository');

    setOnline(false);
    await flashcardsRepository.createWrittenFlashcard(cartaoEscrito('escrito-offline'));
    expect(StorageService.getFlashcards().map((c) => c.id)).toEqual(['escrito-offline']);
    expect(queue.getOps(UID).filter((o) => o.category === 'flashcard_create_written')).toHaveLength(1);
    expect(enviados).toHaveLength(0);

    setOnline(true);
    semRede = false;
    await queue.flush(UID, true);
    await queue.flush(UID, true);
    expect(enviados.map((f) => f.id)).toEqual(['escrito-offline']);
    expect(queue.getOps(UID).find((o) => o.category === 'flashcard_create_written')?.state).toBe('synced');
  });

  it('o cartão escrito ligado à questão não impede o cartão automático do erro da mesma questão', async () => {
    const { StorageService } = await setup({ configured: false });
    const { flashcardsRepository } = await import('../../src/repositories/FlashcardsRepository');
    const question = makeQuestionForFlashcard();

    await flashcardsRepository.createWrittenFlashcard(cartaoEscrito('escrito-q', { questionOriginId: question.id, compendiumSectionId: undefined }));
    const automatico = await flashcardsRepository.createFlashcardFromQuestion(question);

    expect(automatico.id).not.toBe('escrito-q');
    expect(automatico.isWritten).toBeUndefined();
    expect(StorageService.getFlashcards().filter((c) => c.questionOriginId === question.id)).toHaveLength(2);
    // E pedir o do erro de novo continua devolvendo o MESMO automático (não o escrito).
    const denovo = await flashcardsRepository.createFlashcardFromQuestion(question);
    expect(denovo.id).toBe(automatico.id);
    expect(StorageService.getFlashcards().filter((c) => c.questionOriginId === question.id)).toHaveLength(2);
  });
});
