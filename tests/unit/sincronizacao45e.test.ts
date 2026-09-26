import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Unidade 45-E — sincronização que não perde nem reordena.
//
// - AUD-19: operação de estado desejado ("set": nota, favorito, seção lida,
//   reação, item do caderno de erros) nunca chega ao servidor antes de uma
//   mais antiga do mesmo alvo, e a mais nova substitui as antigas ainda não
//   enviadas.
// - AUD-25: falha de sessão (`auth`) volta a pendente quando o usuário entra
//   de novo, sem ação manual.
// - AUD-28: a recuperação de progresso legado não enfileira de novo uma
//   resposta que já está na fila, nem roda duas vezes ao mesmo tempo.
//
// Real: a fila `syncQueue` inteira sobre um localStorage em memória. Falso:
// o cliente Supabase (sessão ativa e consultas da recuperação legada) e os
// handlers, registrados pela mesma porta que `syncHandlers.ts` usa.

const UID = 'user-a';

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

interface Remote {
  sessionUid: string | null;
  /** Linhas de `question_attempts` devolvidas pela recuperação legada. */
  attempts: unknown[];
  attemptQueries: number;
}

async function loadQueue(remote: Remote) {
  vi.doMock('../../src/lib/supabaseClient', () => ({
    isSupabaseConfigured: true,
    supabase: {
      auth: {
        getSession: async () => ({
          data: { session: remote.sessionUid ? { user: { id: remote.sessionUid } } : null },
          error: null,
        }),
      },
      from: () => ({
        select: () => ({
          eq: async () => {
            remote.attemptQueries += 1;
            // Simula a latência da rede: é aqui que as duas execuções do
            // boot se sobrepõem.
            await new Promise((r) => setTimeout(r, 5));
            return { data: remote.attempts, error: null };
          },
          // Leitura paginada dos ids de flashcards (recuperação legada): nenhum no servidor.
          order: () => ({ range: async () => ({ data: [], error: null }) }),
        }),
      }),
    },
  }));
  return import('../../src/services/syncQueue');
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('localStorage', createMemoryStorage());
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.doUnmock('../../src/lib/supabaseClient');
  vi.doUnmock('../../src/services/storage');
  vi.doUnmock('../../src/repositories/SupabaseFlashcardsRepository');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const networkError = () => new Error('Failed to fetch');

describe('AUD-19 — a fila não reordena gravações do mesmo alvo', () => {
  it('edição antiga em backoff não é enviada depois da nova (ordem aplicada termina no texto novo)', async () => {
    const remote: Remote = { sessionUid: UID, attempts: [], attemptQueries: 0 };
    const queue = await loadQueue(remote);
    const applied: string[] = [];
    let failNext = true;
    queue.registerHandler<{ targetId: string; noteText: string }>('note_upsert', async (p) => {
      if (failNext) {
        failNext = false;
        throw networkError();
      }
      applied.push(p.noteText);
      return null;
    });

    queue.enqueue(UID, 'note_upsert', { targetId: 'q-1', noteText: 'versao-1' });
    await queue.flush(UID);
    // versao-1 falhou por rede e ficou em backoff; a rede volta e o estudante edita de novo.
    queue.enqueue(UID, 'note_upsert', { targetId: 'q-1', noteText: 'versao-2' });
    await queue.flush(UID);
    await queue.retryAllFailed(UID);
    await queue.flush(UID, true);
    await queue.flush(UID, true);

    expect(applied.at(-1)).toBe('versao-2');
    expect(applied).not.toEqual(['versao-2', 'versao-1']);
    expect(queue.getOps(UID).filter((o) => o.state !== 'synced')).toEqual([]);
  });

  it('a operação nova substitui as antigas do mesmo alvo que ainda não saíram', async () => {
    const remote: Remote = { sessionUid: null, attempts: [], attemptQueries: 0 };
    const queue = await loadQueue(remote);
    const applied: boolean[] = [];
    queue.registerHandler<{ type: string; id: string; desired: boolean }>('bookmark_set', async (p) => {
      applied.push(p.desired);
      return null;
    });

    // Sem sessão ativa: nada sai, tudo fica pendente.
    queue.enqueue(UID, 'bookmark_set', { type: 'questions', id: 'q-1', desired: true });
    queue.enqueue(UID, 'bookmark_set', { type: 'questions', id: 'q-1', desired: false });
    queue.enqueue(UID, 'bookmark_set', { type: 'questions', id: 'q-2', desired: true });
    await queue.flush(UID);
    expect(queue.getOps(UID).filter((o) => o.state === 'pending')).toHaveLength(2);

    remote.sessionUid = UID;
    await queue.flush(UID, true);
    expect(applied).toEqual([false, true]);
  });

  it('falha permanente antiga não prende a edição nova do mesmo alvo', async () => {
    const remote: Remote = { sessionUid: UID, attempts: [], attemptQueries: 0 };
    const queue = await loadQueue(remote);
    const applied: string[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let first = true;
    queue.registerHandler<{ targetId: string; noteText: string }>('note_upsert', async (p) => {
      if (first) {
        first = false;
        await gate; // em voo enquanto o estudante edita de novo
        const err: Error & { code?: string } = new Error('conflito');
        err.code = 'SYNC_CONFLICT';
        throw err;
      }
      applied.push(p.noteText);
      return null;
    });

    queue.enqueue(UID, 'note_upsert', { targetId: 'q-1', noteText: 'versao-1' });
    await new Promise((r) => setTimeout(r, 0));
    queue.enqueue(UID, 'note_upsert', { targetId: 'q-1', noteText: 'versao-2' });
    release();
    await queue.flush(UID);
    await queue.flush(UID);

    expect(applied).toEqual(['versao-2']);
    expect(queue.getOps(UID).filter((o) => o.state === 'failed')).toEqual([]);
  });

  it('operações de alvos diferentes e tentativas de questão não são fundidas', async () => {
    const remote: Remote = { sessionUid: null, attempts: [], attemptQueries: 0 };
    const queue = await loadQueue(remote);
    queue.enqueue(UID, 'reading_progress_set', { compendiumId: 'c-1', sectionId: 's-1', isRead: true, totalSections: 2 });
    queue.enqueue(UID, 'reading_progress_set', { compendiumId: 'c-1', sectionId: 's-2', isRead: true, totalSections: 2 });
    queue.enqueue(UID, 'question_attempt', { questionId: 'q-1', selectedOption: 'A', timeSpentSeconds: 1, timestamp: 't1' });
    queue.enqueue(UID, 'question_attempt', { questionId: 'q-1', selectedOption: 'B', timeSpentSeconds: 1, timestamp: 't2' });
    expect(queue.getOps(UID)).toHaveLength(4);
  });
});

describe('AUD-25 — "faça login novamente" se resolve ao entrar de novo', () => {
  it('ao entrar de novo, o que falhou por sessão sobe sozinho', async () => {
    const remote: Remote = { sessionUid: UID, attempts: [], attemptQueries: 0 };
    const queue = await loadQueue(remote);
    const applied: string[] = [];
    let expired = true;
    queue.registerHandler<{ targetId: string; noteText: string }>('note_upsert', async (p) => {
      if (expired) throw new Error('JWT expired');
      applied.push(p.noteText);
      return null;
    });

    queue.enqueue(UID, 'note_upsert', { targetId: 'q-1', noteText: 'texto' });
    await queue.flush(UID);
    expect(queue.getSummary(UID).failedNeedsLogin).toBe(true);

    // Sai e entra de novo: a sessão nova é válida.
    expired = false;
    queue.onActiveUserChanged(null);
    queue.onActiveUserChanged(UID);
    await queue.flush(UID);

    expect(applied).toEqual(['texto']);
    expect(queue.getSummary(UID)).toMatchObject({ failed: 0, pending: 0, failedNeedsLogin: false });
  });
});

describe('AUD-28 — recuperação legada não duplica tentativa feita offline', () => {
  async function loadRecovery(remote: Remote, answers: Record<string, unknown>) {
    vi.doMock('../../src/services/storage', () => ({
      StorageService: { getAnswers: () => answers, getFlashcards: () => [] },
    }));
    const queue = await loadQueue(remote);
    const recovery = await import('../../src/services/legacyRecovery');
    return { queue, recovery };
  }

  const answer = {
    questionId: 'q-1',
    selectedOption: 'A',
    isCorrect: false,
    timestamp: '2026-09-25T10:00:00.000Z',
    timeSpentSeconds: 30,
    answerMode: 'study',
    answerStrategy: 'direct',
  };

  it('resposta offline ainda na fila não ganha segunda operação ao reabrir online', async () => {
    const remote: Remote = { sessionUid: null, attempts: [], attemptQueries: 0 };
    const { queue, recovery } = await loadRecovery(remote, { 'q-1': answer });
    // Respondeu offline: a operação normal (AnswersRepository) está na fila, o servidor não tem a linha.
    queue.enqueue(UID, 'question_attempt', { questionId: 'q-1', selectedOption: 'A', timeSpentSeconds: 30, timestamp: answer.timestamp });

    // Reabre online: o boot chama setActiveUser duas vezes (getSession e INITIAL_SESSION).
    await Promise.all([recovery.recoverLegacyLocalProgress(UID), recovery.recoverLegacyLocalProgress(UID)]);

    expect(queue.getOps(UID).filter((o) => o.category === 'question_attempt')).toHaveLength(1);
  });

  it('duas execuções concorrentes no boot enfileiram a resposta legada uma vez só', async () => {
    const remote: Remote = { sessionUid: null, attempts: [], attemptQueries: 0 };
    const { queue, recovery } = await loadRecovery(remote, { 'q-1': answer });

    await Promise.all([recovery.recoverLegacyLocalProgress(UID), recovery.recoverLegacyLocalProgress(UID)]);

    expect(queue.getOps(UID).filter((o) => o.category === 'question_attempt')).toHaveLength(1);
    expect(remote.attemptQueries).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Achados da revisão do PR #86
// ---------------------------------------------------------------------------
describe('45-E, revisão do #86 — alvos além das notas e favoritos', () => {
  it('apagar um card não sai antes da criação que ficou em backoff (sem ressuscitar o card)', async () => {
    const remote: Remote = { sessionUid: UID, attempts: [], attemptQueries: 0 };
    const queue = await loadQueue(remote);
    const applied: string[] = [];
    let failUpsert = true;
    queue.registerHandler('flashcard_upsert', async () => {
      if (failUpsert) {
        failUpsert = false;
        throw networkError();
      }
      applied.push('upsert');
      return null;
    });
    queue.registerHandler('flashcard_delete', async () => {
      applied.push('delete');
      return null;
    });

    queue.enqueue(UID, 'flashcard_upsert', { flashcard: { id: 'fc-1' } });
    await queue.flush(UID);
    queue.enqueue(UID, 'flashcard_delete', { id: 'fc-1' });
    await queue.flush(UID);
    expect(applied).toEqual([]); // o delete espera a criação
    await queue.flush(UID, true);

    expect(applied).toEqual(['upsert', 'delete']);
  });

  it('SRS do card não substitui a criação do mesmo card', async () => {
    const remote: Remote = { sessionUid: null, attempts: [], attemptQueries: 0 };
    const queue = await loadQueue(remote);
    queue.enqueue(UID, 'flashcard_upsert', { flashcard: { id: 'fc-1' } });
    queue.enqueue(UID, 'flashcard_srs_upsert', { flashcardId: 'fc-1', srs: {} });
    expect(queue.getOps(UID).map((o) => o.category)).toEqual(['flashcard_upsert', 'flashcard_srs_upsert']);
  });

  it('gravação de simulado acompanhada pelo id não some da fila quando a mesma sessão é gravada de novo (revisão do f3bbf3e, item 4)', async () => {
    const remote: Remote = { sessionUid: null, attempts: [], attemptQueries: 0 };
    const queue = await loadQueue(remote);
    // SimuladoSession acompanha o resultado pelo id da operação (subscribeToResult).
    const tracked = queue.enqueue(UID, 'simulado_save', { session: { id: 'sim-1', score: 1 } });
    queue.enqueue(UID, 'simulado_save', { session: { id: 'sim-1', score: 2 } });
    expect(queue.getOps(UID).map((o) => o.id)).toContain(tracked.id);
  });

  it('gravações da mesma sessão de simulado saem na ordem, mesmo com a primeira em backoff', async () => {
    const remote: Remote = { sessionUid: UID, attempts: [], attemptQueries: 0 };
    const queue = await loadQueue(remote);
    const applied: number[] = [];
    let fail = true;
    queue.registerHandler<{ session: { score: number } }>('simulado_save', async (p) => {
      if (fail) {
        fail = false;
        throw networkError();
      }
      applied.push(p.session.score);
      return null;
    });
    queue.enqueue(UID, 'simulado_save', { session: { id: 'sim-1', score: 1 } });
    await queue.flush(UID);
    queue.enqueue(UID, 'simulado_save', { session: { id: 'sim-1', score: 2 } });
    await queue.flush(UID);
    expect(applied).toEqual([]);
    await queue.flush(UID, true);
    expect(applied).toEqual([1, 2]);
  });

  it('payload sem id não vira alvo comum: itens diferentes não se substituem', async () => {
    const remote: Remote = { sessionUid: null, attempts: [], attemptQueries: 0 };
    const queue = await loadQueue(remote);
    queue.enqueue(UID, 'error_notebook_update', { errorItem: { resolved: true } });
    queue.enqueue(UID, 'error_notebook_update', { errorItem: { resolved: false } });
    queue.enqueue(UID, 'bookmark_set', { id: 'q-1', desired: true });
    queue.enqueue(UID, 'bookmark_set', { id: 'q-2', desired: true });
    expect(queue.getOps(UID)).toHaveLength(4);
  });

  it('fila antiga com [falha permanente, mais nova do mesmo alvo]: a nova sai sozinha e a antiga não volta depois dela', async () => {
    const remote: Remote = { sessionUid: UID, attempts: [], attemptQueries: 0 };
    const queue = await loadQueue(remote);
    const applied: boolean[] = [];
    queue.registerHandler<{ desired: boolean }>('bookmark_set', async (p) => {
      applied.push(p.desired);
      return null;
    });
    const base = { userId: UID, category: 'bookmark_set', createdAt: 't', updatedAt: 't', attempts: 1 };
    localStorage.setItem(
      `synapse_${UID}_sync_queue_v1`,
      JSON.stringify([
        {
          ...base,
          id: 'old',
          clientOpId: 'old',
          payload: { type: 'questions', id: 'q-1', desired: true },
          state: 'failed',
          lastError: { kind: 'permission', message: 'x' },
        },
        { ...base, id: 'new', clientOpId: 'new', payload: { type: 'questions', id: 'q-1', desired: false }, state: 'pending', attempts: 0 },
      ])
    );

    await queue.flush(UID);
    await queue.retryAllFailed(UID);
    await queue.flush(UID);

    expect(applied).toEqual([false]);
    expect(queue.getOps(UID).map((o) => o.id)).toEqual(['new']);
  });
});

describe('45-E, revisão do #86 — falha de sessão', () => {
  it('"Tentar novamente" sem sessão válida mantém o aviso de entrar de novo', async () => {
    const remote: Remote = { sessionUid: UID, attempts: [], attemptQueries: 0 };
    const queue = await loadQueue(remote);
    queue.registerHandler('note_upsert', async () => {
      throw new Error('JWT expired');
    });
    queue.enqueue(UID, 'note_upsert', { targetId: 'q-1', noteText: 'texto' });
    await queue.flush(UID);

    remote.sessionUid = null; // refresh token inválido: não há sessão
    await queue.retryAllFailed(UID);
    await queue.flush(UID);

    expect(queue.getSummary(UID)).toMatchObject({ failed: 1, failedNeedsLogin: true });
  });

  it('entrar de novo durante um flush em andamento reenvia na mesma rodada, sem esperar o heartbeat', async () => {
    const remote: Remote = { sessionUid: UID, attempts: [], attemptQueries: 0 };
    const queue = await loadQueue(remote);
    const applied: string[] = [];
    let expired = true;
    let release: () => void = () => {};
    queue.registerHandler<{ targetId: string; noteText: string }>('note_upsert', async (p) => {
      if (expired) throw new Error('JWT expired');
      applied.push(p.noteText);
      return null;
    });
    queue.registerHandler('bookmark_set', async () => {
      await new Promise<void>((r) => (release = r));
      return null;
    });
    queue.enqueue(UID, 'note_upsert', { targetId: 'q-1', noteText: 'texto' });
    await queue.flush(UID);
    expect(queue.getSummary(UID).failedNeedsLogin).toBe(true);

    // Um flush fica em andamento (favorito em voo) quando a sessão nova chega.
    queue.enqueue(UID, 'bookmark_set', { type: 'questions', id: 'q-9', desired: true });
    const running = queue.flush(UID);
    await new Promise((r) => setTimeout(r, 0));
    expired = false;
    queue.onActiveUserChanged(UID);
    release();
    await running;

    expect(applied).toEqual(['texto']);
  });
});

describe('45-E, revisão do #86 — nota em conflito substituída por edição nova', () => {
  it('o texto do outro dispositivo não se perde quando a edição em voo esgota as fusões e a nova a substitui', async () => {
    const server = { text: 'outro-0', updatedAt: 't1' };
    let conflictsLeft = 2; // o outro dispositivo grava nas duas primeiras rodadas da edição A; a terceira só conflita
    let releaseFirstCall: () => void = () => {};
    const firstCall = new Promise<void>((r) => (releaseFirstCall = r));
    let calls = 0;
    const local = { notes: {} as Record<string, string>, base: { 'q-1': 't0' } as Record<string, string> };

    vi.doMock('../../src/services/storage', () => ({
      StorageService: {
        saveNote: (id: string, text: string) => (local.notes[id] = text),
        getNoteBaseVersion: (id: string) => local.base[id] ?? null,
        setNoteBaseVersion: (id: string, v: string) => (local.base[id] = v),
      },
    }));
    vi.doMock('../../src/repositories/SupabaseFlashcardsRepository', () => ({ supabaseFlashcardsRepository: {} }));
    vi.doMock('../../src/lib/supabaseClient', () => ({
      isSupabaseConfigured: true,
      supabase: {
        auth: { getSession: async () => ({ data: { session: { user: { id: UID } } }, error: null }) },
        from: (table: string) => ({
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: table === 'questions' ? { id: 'q-1' } : null, error: null }) }),
          }),
        }),
        // Mesma regra do `upsert_note`: base conhecida mais antiga que a do servidor = conflito, sem gravar.
        rpc: async (_fn: string, args: { p_note_text: string; p_base_updated_at: string | null }) => {
          calls += 1;
          if (calls === 1) await firstCall;
          if (args.p_base_updated_at && server.updatedAt > args.p_base_updated_at) {
            const reply = { data: { conflict: true, server_text: server.text, server_updated_at: server.updatedAt }, error: null };
            if (conflictsLeft > 0) {
              conflictsLeft -= 1;
              server.text = `outro-${2 - conflictsLeft}`;
              server.updatedAt = `t${5 - conflictsLeft}`;
            }
            return reply;
          }
          server.text = args.p_note_text;
          server.updatedAt = `t9${calls}`;
          return { data: { conflict: false, updated_at: server.updatedAt }, error: null };
        },
      },
    }));
    const queue = await import('../../src/services/syncQueue');
    const { registerSyncHandlers } = await import('../../src/services/syncHandlers');
    registerSyncHandlers();

    queue.enqueue(UID, 'note_upsert', { targetId: 'q-1', noteText: 'A' });
    await new Promise((r) => setTimeout(r, 0));
    // Edição B enfileirada com A em voo, antes de A fundir o texto do outro dispositivo.
    queue.enqueue(UID, 'note_upsert', { targetId: 'q-1', noteText: 'A B' });
    releaseFirstCall();
    await queue.flush(UID);
    await queue.flush(UID);

    expect(queue.getOps(UID).filter((o) => o.state !== 'synced')).toEqual([]);
    expect(server.text).toContain('A B');
    expect(server.text).toContain('outro-2'); // o que o outro dispositivo gravou por último continua no servidor
    expect(local.notes['q-1']).toBe(server.text);
  });
});

// ---------------------------------------------------------------------------
// Revisão do f3bbf3e (triagem da diretoria no PR #86)
// ---------------------------------------------------------------------------
describe('45-E, revisão do f3bbf3e', () => {
  it('item 1 — edição enfileirada com A em voo não apaga o texto do outro dispositivo quando a fusão de A é ACEITA', async () => {
    const server = { text: 'outro-0', updatedAt: 't1' };
    let releaseFirstCall: () => void = () => {};
    const firstCall = new Promise<void>((r) => (releaseFirstCall = r));
    let calls = 0;
    const local = { notes: {} as Record<string, string>, base: { 'q-1': 't0' } as Record<string, string> };

    vi.doMock('../../src/services/storage', () => ({
      StorageService: {
        saveNote: (id: string, text: string) => (local.notes[id] = text),
        getNoteBaseVersion: (id: string) => local.base[id] ?? null,
        setNoteBaseVersion: (id: string, v: string) => (local.base[id] = v),
      },
    }));
    vi.doMock('../../src/repositories/SupabaseFlashcardsRepository', () => ({ supabaseFlashcardsRepository: {} }));
    vi.doMock('../../src/lib/supabaseClient', () => ({
      isSupabaseConfigured: true,
      supabase: {
        auth: { getSession: async () => ({ data: { session: { user: { id: UID } } }, error: null }) },
        from: (table: string) => ({
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: table === 'questions' ? { id: 'q-1' } : null, error: null }) }),
          }),
        }),
        // Regra do `upsert_note`: base mais antiga que a do servidor = conflito, sem gravar.
        rpc: async (_fn: string, args: { p_note_text: string; p_base_updated_at: string | null }) => {
          calls += 1;
          if (calls === 1) await firstCall;
          if (args.p_base_updated_at && server.updatedAt > args.p_base_updated_at) {
            return { data: { conflict: true, server_text: server.text, server_updated_at: server.updatedAt }, error: null };
          }
          server.text = args.p_note_text;
          server.updatedAt = `t${calls + 1}`;
          return { data: { conflict: false, updated_at: server.updatedAt }, error: null };
        },
      },
    }));
    const queue = await import('../../src/services/syncQueue');
    const { registerSyncHandlers } = await import('../../src/services/syncHandlers');
    registerSyncHandlers();

    queue.enqueue(UID, 'note_upsert', { targetId: 'q-1', noteText: 'A' });
    await new Promise((r) => setTimeout(r, 0));
    queue.enqueue(UID, 'note_upsert', { targetId: 'q-1', noteText: 'A B' }); // antes da fusão de A
    releaseFirstCall();
    await queue.flush(UID);
    await queue.flush(UID);

    expect(queue.getOps(UID).filter((o) => o.state !== 'synced')).toEqual([]);
    expect(server.text).toContain('A B');
    expect(server.text).toContain('outro-0');
    expect(server.text.split('outro-0')).toHaveLength(2); // o texto do outro aparece uma vez só
    expect(local.notes['q-1']).toBe(server.text);
  });

  it('item 2 — criação de card com falha permanente segura o delete do mesmo card, e o reenvio manual mantém a ordem', async () => {
    const remote: Remote = { sessionUid: UID, attempts: [], attemptQueries: 0 };
    const queue = await loadQueue(remote);
    const applied: string[] = [];
    let rejectUpsert = true;
    queue.registerHandler('flashcard_upsert', async () => {
      if (rejectUpsert) {
        rejectUpsert = false;
        throw Object.assign(new Error('permission denied'), { code: '42501' });
      }
      applied.push('upsert');
      return null;
    });
    queue.registerHandler('flashcard_delete', async () => {
      applied.push('delete');
      return null;
    });

    queue.enqueue(UID, 'flashcard_upsert', { flashcard: { id: 'fc-1' } });
    await queue.flush(UID);
    queue.enqueue(UID, 'flashcard_delete', { id: 'fc-1' });
    await queue.flush(UID);
    expect(applied).toEqual([]);

    await queue.retryAllFailed(UID);
    await queue.flush(UID);
    expect(applied).toEqual(['upsert', 'delete']);
  });

  it('item 3 — tirar da fila uma falha antiga substituída não apaga a operação que um listener acabou de enfileirar', async () => {
    const remote: Remote = { sessionUid: UID, attempts: [], attemptQueries: 0 };
    const queue = await loadQueue(remote);
    queue.registerHandler('note_upsert', async () => null);
    queue.registerHandler('bookmark_set', async () => null);
    const base = { userId: UID, createdAt: 't', updatedAt: 't' };
    localStorage.setItem(
      `synapse_${UID}_sync_queue_v1`,
      JSON.stringify([
        { ...base, id: 'x', clientOpId: 'x', category: 'note_upsert', payload: { targetId: 'q-5', noteText: 'x' }, state: 'pending', attempts: 0 },
        {
          ...base,
          id: 'old',
          clientOpId: 'old',
          category: 'bookmark_set',
          payload: { type: 'questions', id: 'q-1', desired: true },
          state: 'failed',
          attempts: 1,
          lastError: { kind: 'permission', message: 'x' },
        },
        { ...base, id: 'new', clientOpId: 'new', category: 'bookmark_set', payload: { type: 'questions', id: 'q-1', desired: false }, state: 'pending', attempts: 0 },
      ])
    );
    // Como no app: a confirmação de uma operação faz um listener enfileirar outra (ex.: card do erro).
    let spawned: string | null = null;
    let fired = false;
    queue.subscribe(UID, () => {
      if (!fired && queue.getOps(UID).some((o) => o.id === 'x' && o.state === 'synced')) {
        fired = true; // o enqueue abaixo avisa os listeners de novo, na mesma pilha
        spawned = queue.enqueue(UID, 'reaction_set', { questionId: 'q-7', reaction: 'up' }).id;
      }
    });
    queue.registerHandler('reaction_set', async () => null); // sincronizada, continua registrada na fila

    await queue.flush(UID);

    expect(spawned).not.toBeNull();
    expect(queue.getOps(UID).map((o) => o.id)).toContain(spawned);
  });

  it('item 5 — recuperação legada não enfileira de novo um card que já tem operação na fila', async () => {
    const card = { id: '11111111-1111-4111-8111-111111111111', isCustom: true, front: 'f', back: 'b' };
    vi.doMock('../../src/services/storage', () => ({
      StorageService: { getAnswers: () => ({}), getFlashcards: () => [card] },
    }));
    const remote: Remote = { sessionUid: null, attempts: [], attemptQueries: 0 };
    const queue = await loadQueue(remote);
    const recovery = await import('../../src/services/legacyRecovery');
    queue.enqueue(UID, 'flashcard_upsert', { flashcard: card }); // criado offline, ainda na fila
    queue.enqueue(UID, 'flashcard_srs_upsert', { flashcardId: card.id, srs: {} });

    await recovery.recoverLegacyLocalProgress(UID);

    expect(queue.getOps(UID).map((o) => o.category)).toEqual(['flashcard_upsert', 'flashcard_srs_upsert']);
  });

  it('item 6 — a recuperação lê a fila uma vez, não uma vez por resposta local', async () => {
    const answers: Record<string, unknown> = {};
    for (let i = 0; i < 300; i++) {
      answers[`q-${i}`] = { questionId: `q-${i}`, selectedOption: 'A', isCorrect: false, timestamp: 't', timeSpentSeconds: 1 };
    }
    vi.doMock('../../src/services/storage', () => ({
      StorageService: { getAnswers: () => answers, getFlashcards: () => [] },
    }));
    const remote: Remote = { sessionUid: null, attempts: [], attemptQueries: 0 };
    const queue = await loadQueue(remote);
    const recovery = await import('../../src/services/legacyRecovery');
    for (let i = 0; i < 300; i++) {
      queue.enqueue(UID, 'question_attempt', { questionId: `q-${i}`, selectedOption: 'A', timeSpentSeconds: 1, timestamp: 't' });
    }
    // Espera os flushes disparados pelos enqueues acima: só as leituras da recuperação contam.
    await queue.flush(UID);
    await new Promise((r) => setTimeout(r, 10));
    const getItem = vi.spyOn(localStorage, 'getItem');

    await recovery.recoverLegacyLocalProgress(UID);

    const queueReads = getItem.mock.calls.filter(([k]) => k === `synapse_${UID}_sync_queue_v1`).length;
    expect(queueReads).toBeLessThan(10);
    expect(queue.getOps(UID)).toHaveLength(300); // e continua sem duplicar
  });
});
