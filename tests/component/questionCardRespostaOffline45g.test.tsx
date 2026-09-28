import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Question } from '../../src/types';

// 45-G, revisão do #93 (item 3): card avulso (simulado, caderno) aberto sem
// rede. O estudante responde; a resposta fica na fila com a correção
// pendente. A nova tentativa de carga ("Tentar agora" ou a volta da rede) lê
// o servidor, que ainda não tem a resposta — e não pode apagá-la da tela nem
// cancelar a espera pela correção.

vi.mock('../../src/components/feedback/ContextualFeedbackPopover', () => ({ ContextualFeedbackPopover: () => null }));
vi.mock('../../src/services/storage', () => ({ getStorageUser: () => null }));

let serverUp = false;
const offline = () => Promise.reject(new Error('Failed to fetch'));
const unsubscribe = vi.fn();
const subscribeToCorrection = vi.fn(() => unsubscribe);

vi.mock('../../src/repositories/AnswersRepository', () => ({
  answersRepository: {
    getAnswers: () => (serverUp ? Promise.resolve({}) : offline()),
    recordAnswer: vi.fn().mockResolvedValue({ status: 'pending', clientOpId: 'op-offline' }),
    subscribeToCorrection: (...a: unknown[]) => subscribeToCorrection(...(a as [])),
  },
}));
vi.mock('../../src/repositories/QuestionsRepository', () => ({
  questionsRepository: { getQuestions: vi.fn().mockResolvedValue([]), getQuestionReview: vi.fn().mockResolvedValue(null) },
}));
vi.mock('../../src/repositories/BookmarksRepository', () => ({
  bookmarksRepository: {
    getBookmarks: () => (serverUp ? Promise.resolve({ questions: [], compendiums: [], flashcards: [] }) : offline()),
    setBookmark: vi.fn(),
  },
}));
vi.mock('../../src/repositories/QuestionReactionsRepository', () => ({
  questionReactionsRepository: {
    getMyReaction: () => (serverUp ? Promise.resolve(null) : offline()),
    setReaction: vi.fn(),
    removeReaction: vi.fn(),
  },
}));
vi.mock('../../src/repositories/FlashcardsRepository', () => ({ flashcardsRepository: { createFlashcardFromQuestion: vi.fn() } }));
vi.mock('../../src/services/gamification', () => ({
  GamificationService: { triggerCelebration: vi.fn() },
  CELEBRATION_STREAK_LENGTH: 5,
}));

const { QuestionCard } = await import('../../src/components/questions/QuestionCard');

const question: Question = {
  id: 'q-1',
  disciplineId: 'disc',
  themeId: 'tema',
  compendiumRefId: '',
  cycle: 'clinico',
  difficulty: 'medio',
  institution: 'USP',
  year: 2024,
  clinicalVignette: '',
  questionStem: 'Enunciado de teste',
  options: [
    { letter: 'A', text: 'Alternativa A', isCorrect: false, explanation: '' },
    { letter: 'B', text: 'Alternativa B', isCorrect: true, explanation: '' },
  ],
  generalCommentary: '',
  highYieldSummary: '',
  tags: [],
} as unknown as Question;

beforeEach(() => {
  serverUp = false;
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('QuestionCard avulso — resposta dada sem rede', () => {
  it('"Tentar agora" não apaga a resposta nem cancela a espera pela correção', async () => {
    render(<QuestionCard question={question} onOpenCompendium={() => {}} />);
    await screen.findByText(/Sem conexão/);

    fireEvent.click(screen.getByText('Alternativa B'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Resposta' }));
    expect(await screen.findByRole('button', { name: 'Correção pendente' })).toBeTruthy();
    expect(subscribeToCorrection).toHaveBeenCalledTimes(1);

    // A rede volta; o servidor ainda não tem a resposta que está na fila.
    serverUp = true;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar agora' }));
    await waitFor(() => expect(screen.queryByText(/Sem conexão/)).toBeNull());

    expect(screen.getByRole('button', { name: 'Correção pendente' })).toBeTruthy();
    expect(unsubscribe).not.toHaveBeenCalled();
  });
});
