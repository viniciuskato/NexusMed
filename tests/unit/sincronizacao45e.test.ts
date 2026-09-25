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
    queue.retryAllFailed(UID);
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
