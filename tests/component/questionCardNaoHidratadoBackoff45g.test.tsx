import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

// 45-G, replanejamento (#93-R1): card de questão SEM a prop `hydrated`
// (SimuladoSession, estudo, revisão depois de terminar) — ele mesmo busca
// respostas, favorito e reação e, com a questão já respondida, o gabarito.
// Com o gabarito falhando, o status ia para 'ok' assim que os três chegavam e
// voltava ao erro quando o gabarito falhava: o aviso piscava e, como o
// `useAutoRetry` depende de `[status]`, a espera entre tentativas voltava a
// 5 s em toda rodada (20 buscas do gabarito em 2 min). O status só pode ir
// para 'ok' quando o gabarito chega.

vi.mock('../../src/components/feedback/ContextualFeedbackPopover', () => ({ ContextualFeedbackPopover: () => null }));
const flush = vi.fn(() => Promise.resolve());
vi.mock('../../src/services/syncQueue', () => ({
  flush: (...a: unknown[]) => flush(...(a as [])),
  classifySyncError: () => 'network',
  getSummary: () => ({ pending: 0, syncing: 0, failed: 0, synced: 0, failedNeedsLogin: false, failedNeedsSupport: 0, status: 'synced' }),
}));
vi.mock('../../src/services/storage', () => ({ getStorageUser: () => 'u1' }));

// Cada status que o aviso recebe, em todo render — pega qualquer volta a 'ok'
// entre tentativas, não só a que durasse até uma amostra.
const notice = vi.hoisted(() => ({ statuses: [] as string[] }));
vi.mock('../../src/components/common/ConnectionNotice', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/components/common/ConnectionNotice')>();
  const Recorder: typeof actual.ConnectionNotice = (props) => {
    notice.statuses.push(props.status);
    return React.createElement(actual.ConnectionNotice, props);
  };
  return { ...actual, ConnectionNotice: Recorder };
});

let reviewUp = false;
const getQuestionReview = vi.fn(
  () =>
    new Promise((resolve, reject) =>
      setTimeout(
        () =>
          reviewUp
            ? resolve({ isCorrect: false, correctOptionId: 'B', generalCommentary: '', highYieldSummary: '', options: [], references: [] })
            : reject(new Error('Failed to fetch')),
        800
      )
    )
);
vi.mock('../../src/repositories/AnswersRepository', () => ({
  answersRepository: {
    getAnswers: () =>
      Promise.resolve({ q1: { questionId: 'q1', selectedOption: 'A', isCorrect: false, timestamp: '2026-09-01T00:00:00Z' } }),
    recordAnswer: vi.fn(),
    subscribeToCorrection: vi.fn(() => () => {}),
  },
}));
vi.mock('../../src/repositories/QuestionsRepository', () => ({
  questionsRepository: { getQuestions: vi.fn().mockResolvedValue([]), getQuestionReview: () => getQuestionReview() },
}));
vi.mock('../../src/repositories/BookmarksRepository', () => ({
  bookmarksRepository: { getBookmarks: () => Promise.resolve({ questions: [], compendiums: [], flashcards: [] }), setBookmark: vi.fn() },
}));
vi.mock('../../src/repositories/QuestionReactionsRepository', () => ({
  questionReactionsRepository: { getMyReaction: () => Promise.resolve(null), setReaction: vi.fn(), removeReaction: vi.fn() },
}));
vi.mock('../../src/repositories/FlashcardsRepository', () => ({ flashcardsRepository: { createFlashcardFromQuestion: vi.fn() } }));
vi.mock('../../src/services/gamification', () => ({ GamificationService: { triggerCelebration: vi.fn() }, CELEBRATION_STREAK_LENGTH: 5 }));

const { QuestionCard } = await import('../../src/components/questions/QuestionCard');
const question = {
  id: 'q1',
  disciplineId: 'd',
  themeId: 't',
  compendiumRefId: '',
  cycle: 'clinico',
  difficulty: 'medio',
  institution: 'X',
  year: 2024,
  clinicalVignette: '',
  questionStem: 'Sq1',
  options: [
    { letter: 'A', text: 'Aq1', isCorrect: false, explanation: '' },
    { letter: 'B', text: 'Bq1', isCorrect: false, explanation: '' },
  ],
  generalCommentary: '',
  highYieldSummary: '',
  tags: [],
} as never;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  notice.statuses.length = 0;
  reviewUp = false;
});

describe('45-G — QuestionCard sem `hydrated`, gabarito falhando (replanejamento #93-R1)', () => {
  it('o aviso não pisca e as buscas do gabarito seguem a espera crescente (no máx. 5 em 2 min)', async () => {
    vi.useFakeTimers();
    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
    render(<QuestionCard question={question} onOpenCompendium={() => {}} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000); // a primeira busca do gabarito falha (800 ms)
    });
    expect(getQuestionReview).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Sem conex/)).toBeTruthy();

    for (let t = 0; t < 120; t++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
    }

    const firstFailure = notice.statuses.indexOf('offline');
    expect(firstFailure).toBeGreaterThanOrEqual(0);
    expect(notice.statuses.slice(firstFailure).filter((s) => s === 'ok')).toEqual([]); // nunca volta a 'ok'
    expect(getQuestionReview.mock.calls.length).toBeLessThanOrEqual(5);
    expect(flush).not.toHaveBeenCalled();

    // O gabarito voltou: na tentativa seguinte o aviso some.
    reviewUp = true;
    for (let t = 0; t < 61; t++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
    }
    expect(screen.queryByText(/Sem conex/)).toBeNull();
  });
});
