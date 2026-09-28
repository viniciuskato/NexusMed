import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';

// 45-G, revisão do #93:
// - item 2: o componente raiz continua montado entre logout e login. Se a
//   carga do NOVO usuário falha, os dados do anterior não podem ficar na tela.
// - item 5: `ready` só é verdadeiro quando os dados na tela são DESTE usuário
//   e vieram do servidor — quem julga algo a partir deles (o pack salvo)
//   espera por isso.

vi.mock('../../src/services/storage', () => ({ getStorageUser: () => null }));

let serverUp = true;
const offline = () => Promise.reject(new Error('Failed to fetch'));
const ok = <T,>(v: T) => (serverUp ? Promise.resolve(v) : offline());

vi.mock('../../src/repositories/MaterialsRepository', () => ({
  materialsRepository: {
    getDisciplines: () => ok([]),
    getThemes: () => ok([]),
    getCompendiums: () => ok([{ id: 'mat-1' }]),
  },
}));
vi.mock('../../src/repositories/QuestionsRepository', () => ({ questionsRepository: { getQuestions: () => ok([]) } }));
vi.mock('../../src/repositories/FlashcardsRepository', () => ({
  flashcardsRepository: { getFlashcards: () => ok([{ id: 'card-de-A', front: 'CARD DE A' }]) },
}));
vi.mock('../../src/repositories/AnswersRepository', () => ({
  answersRepository: {
    getAnswers: () =>
      ok({ 'q-1': { questionId: 'q-1', selectedOption: 'A', isCorrect: false, timestamp: 't', timeSpentSeconds: 1 } }),
  },
}));

const { useAppData } = await import('../../src/hooks/useAppData');

beforeEach(() => {
  serverUp = true;
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
});
afterEach(() => cleanup());

describe('useAppData', () => {
  it('troca de usuário com a carga do novo falhando: nada do anterior fica (item 2)', async () => {
    const { result, rerender } = renderHook(({ uid }) => useAppData(uid), { initialProps: { uid: 'user-a' as string | null } });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.flashcards).toHaveLength(1);
    expect(Object.keys(result.current.answers)).toEqual(['q-1']);

    serverUp = false; // erro transitório logo depois do login de B
    rerender({ uid: 'user-b' });
    await waitFor(() => expect(result.current.status).toBe('offline'));

    expect(result.current.ready).toBe(false);
    expect(result.current.flashcards).toEqual([]);
    expect(result.current.answers).toEqual({});
    expect(result.current.stats.totalAnswered ?? 0).toBe(0);
  });

  it('carga inicial que falha não fica "pronta" com lista vazia; fica quando a carga dá certo (item 5)', async () => {
    serverUp = false;
    const { result } = renderHook(() => useAppData('user-a'));
    await waitFor(() => expect(result.current.status).toBe('offline'));
    expect(result.current.loading).toBe(false);
    expect(result.current.ready).toBe(false); // vazio aqui não é "despublicado"
    expect(result.current.compendiums).toEqual([]);

    serverUp = true;
    await result.current.refresh();
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.compendiums).toEqual([{ id: 'mat-1' }]);
  });
});
