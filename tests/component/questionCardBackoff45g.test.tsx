import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

// 45-G, revisão do #93/rodada 2 (item 3): a cada nova tentativa, `hydrateStatus`
// voltava a 'ok' antes de buscar o gabarito e virava 'offline' de novo quando
// a busca falhava — como `useAutoRetry` depende de `[status]`, esse "flip"
// reiniciava o backoff do zero em toda tentativa (sempre ~5-6s, nunca
// crescendo) e o aviso de conexão piscava. Agora `hydrateStatus` só muda de
// valor quando o resultado realmente muda — setar o MESMO status de erro de
// novo não gera re-render, então o mesmo efeito de `useAutoRetry` continua
// contando o backoff crescente (5, 10, 20, 40, 60s).

vi.mock('../../src/components/feedback/ContextualFeedbackPopover', () => ({ ContextualFeedbackPopover: () => null }));
const flush = vi.fn(() => Promise.resolve());
vi.mock('../../src/services/syncQueue', () => ({ flush: (...a: unknown[]) => flush(...(a as [])), classifySyncError: () => 'network' }));
vi.mock('../../src/services/storage', () => ({ getStorageUser: () => 'u1' }));
const getQuestionReview = vi.fn(() => Promise.reject(new Error('Failed to fetch')));
vi.mock('../../src/repositories/AnswersRepository', () => ({
  answersRepository: { getAnswers: vi.fn(), recordAnswer: vi.fn(), subscribeToCorrection: vi.fn(() => () => {}) },
}));
vi.mock('../../src/repositories/QuestionsRepository', () => ({
  questionsRepository: { getQuestions: vi.fn().mockResolvedValue([]), getQuestionReview: () => getQuestionReview() },
}));
vi.mock('../../src/repositories/BookmarksRepository', () => ({ bookmarksRepository: { getBookmarks: vi.fn(), setBookmark: vi.fn() } }));
vi.mock('../../src/repositories/QuestionReactionsRepository', () => ({
  questionReactionsRepository: { getMyReaction: vi.fn(), setReaction: vi.fn(), removeReaction: vi.fn() },
}));
vi.mock('../../src/repositories/FlashcardsRepository', () => ({ flashcardsRepository: { createFlashcardFromQuestion: vi.fn() } }));
vi.mock('../../src/services/gamification', () => ({ GamificationService: { triggerCelebration: vi.fn() }, CELEBRATION_STREAK_LENGTH: 5 }));

const { QuestionCard } = await import('../../src/components/questions/QuestionCard');
const mk = (id: string) =>
  ({
    id,
    disciplineId: 'd',
    themeId: 't',
    compendiumRefId: '',
    cycle: 'clinico',
    difficulty: 'medio',
    institution: 'X',
    year: 2024,
    clinicalVignette: '',
    questionStem: 'S' + id,
    options: [
      { letter: 'A', text: 'A' + id, isCorrect: false, explanation: '' },
      { letter: 'B', text: 'B' + id, isCorrect: false, explanation: '' },
    ],
    generalCommentary: '',
    highYieldSummary: '',
    tags: [],
  }) as never;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('45-G — QuestionCard, gabarito falhando não reinicia o backoff (rodada 2, item 3)', () => {
  it('aviso de rede fica constante e as buscas do gabarito seguem espera crescente (no máx. 5 em 2 min)', async () => {
    vi.useFakeTimers();
    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
    render(
      <QuestionCard
        question={mk('q1')}
        onOpenCompendium={() => {}}
        hydrated={{
          answer: { questionId: 'q1', selectedOption: 'A', isCorrect: false, timestamp: '2026-09-01T00:00:00Z' } as never,
          bookmarked: false,
          reaction: null,
          known: true,
        }}
      />
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    const callsAfterFirstLoad = getQuestionReview.mock.calls.length;
    expect(callsAfterFirstLoad).toBe(1); // carga inicial

    // "Sem conexão" tem que estar presente já na primeira falha, e continuar
    // presente (nunca desaparecer/piscar) pelos 2 minutos seguintes.
    expect(screen.getByText(/Sem conex/)).toBeTruthy();

    let sawGone = false;
    for (let i = 0; i < 24; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000); // 24 * 5s = 120s (2 min)
      });
      if (!screen.queryByText(/Sem conex/)) sawGone = true;
    }

    expect(sawGone).toBe(false); // nunca piscou
    // Backoff 5,10,20,40,60s -> tentativas cumulativas em t=5,15,35,75,135s.
    // Em 120s (t=125 no total, incluindo a carga inicial em t=0), no máximo
    // 5 buscas do gabarito (inicial + 4 retentativas).
    expect(getQuestionReview.mock.calls.length).toBeLessThanOrEqual(5);
    // A fila offline não é tocada pelas retentativas periódicas deste card
    // (nenhum sinal forte aconteceu: sem `online`, sem aba mudando, sem
    // clique em "Tentar agora").
    expect(flush).not.toHaveBeenCalled();
  });
});
