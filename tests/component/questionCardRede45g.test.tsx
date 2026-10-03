import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('../../src/components/feedback/ContextualFeedbackPopover', () => ({ ContextualFeedbackPopover: () => null }));
vi.mock('../../src/services/storage', () => ({ getStorageUser: () => null }));

let up = true;
const off = () => Promise.reject(new Error('Failed to fetch'));
const getQuestionReview = vi.fn();
const setReaction = vi.fn().mockResolvedValue(undefined);
const removeReaction = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/repositories/AnswersRepository', () => ({
  answersRepository: {
    getAnswers: () =>
      up
        ? Promise.resolve({
            'q-1': { questionId: 'q-1', selectedOption: 'A', isCorrect: true, timestamp: '2026-09-01T00:00:00Z' },
          })
        : off(),
    recordAnswer: vi.fn(),
    subscribeToCorrection: vi.fn(() => () => {}),
  },
}));
vi.mock('../../src/repositories/QuestionsRepository', () => ({
  questionsRepository: { getQuestions: vi.fn().mockResolvedValue([]), getQuestionReview: (...a: unknown[]) => getQuestionReview(...a) },
}));
vi.mock('../../src/repositories/BookmarksRepository', () => ({
  bookmarksRepository: {
    getBookmarks: () => (up ? Promise.resolve({ questions: [], compendiums: [], flashcards: [] }) : off()),
    setBookmark: vi.fn(),
  },
}));
vi.mock('../../src/repositories/QuestionReactionsRepository', () => ({
  questionReactionsRepository: {
    getMyReaction: () => (up ? Promise.resolve('up') : off()),
    setReaction: (...a: unknown[]) => setReaction(...a),
    removeReaction: (...a: unknown[]) => removeReaction(...a),
  },
}));
vi.mock('../../src/repositories/FlashcardsRepository', () => ({ flashcardsRepository: { createFlashcardFromQuestion: vi.fn() } }));
vi.mock('../../src/services/gamification', () => ({ GamificationService: { triggerCelebration: vi.fn() }, CELEBRATION_STREAK_LENGTH: 5 }));

const { QuestionCard } = await import('../../src/components/questions/QuestionCard');

const mk = (id: string, stem: string) =>
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
    questionStem: stem,
    options: [
      { letter: 'A', text: 'Alt A de ' + id, isCorrect: false, explanation: '' },
      { letter: 'B', text: 'Alt B de ' + id, isCorrect: false, explanation: '' },
    ],
    generalCommentary: '',
    highYieldSummary: '',
    tags: [],
  }) as never;

const review = {
  isCorrect: true,
  correctOptionId: 'A',
  generalCommentary: 'COMENTARIO',
  highYieldSummary: 'HY',
  options: [
    { optionId: 'A', letter: 'A', isCorrect: true, explanation: '' },
    { optionId: 'B', letter: 'B', isCorrect: false, explanation: '' },
  ],
  references: [],
};

beforeEach(() => {
  up = true;
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  getQuestionReview.mockResolvedValue(review);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('45-G — QuestionCard, revisão do #93', () => {
  it('item 4: gabarito de questão já respondida falha ao carregar — nunca o quadro vermelho sem o gabarito', async () => {
    getQuestionReview.mockImplementation(off);
    render(
      <QuestionCard
        question={mk('q-1', 'Enunciado Q1')}
        onOpenCompendium={() => {}}
        hydrated={{
          answer: { questionId: 'q-1', selectedOption: 'A', isCorrect: true, timestamp: '2026-09-01T00:00:00Z' } as never,
          bookmarked: false,
          reaction: null,
          known: true,
        }}
      />
    );

    await screen.findByText(/Sem conex/); // aviso de rede + tenta de novo

    // Sem o gabarito (a carga falhou), nenhum dos dois quadros aparece —
    // nunca o vermelho ("Mecanismo Negligenciado") por a resposta certa
    // (isCorrect vindo do hidratado) não ter sido lida ainda.
    expect(screen.queryByText(/Mecanismo Negligenciado/)).toBeNull();
    expect(screen.queryByText(/Confirmação Clínica/)).toBeNull();
  });

  it('item 5: card reaproveitado (sem key, como em SimuladoSession) não herda seleção/resposta/reação da questão anterior quando a leitura da nova falha', async () => {
    const v = render(<QuestionCard question={mk('q-1', 'Enunciado Q1')} onOpenCompendium={() => {}} />);
    await screen.findByText(/COMENTARIO/); // Q1 respondida e com gabarito carregado

    up = false;
    v.rerender(<QuestionCard question={mk('q-2', 'Enunciado Q2')} onOpenCompendium={() => {}} />);
    await screen.findByText(/Sem conex/);

    // Q2 aparece em branco e respondível — nunca "respondida" com a
    // seleção/reação de Q1.
    expect(screen.getByRole('button', { name: 'Confirmar Resposta' })).toBeTruthy();
    const pressed = screen
      .queryAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(0);

    // Q2 não está respondida: o painel de reação (👍/👎) nem aparece — ele só
    // existe depois de confirmar uma resposta. Nada da reação de Q1 sobrou
    // gravável.
    expect(screen.queryByTitle('Explicação útil')).toBeNull();
    expect(setReaction).not.toHaveBeenCalled();
    expect(removeReaction).not.toHaveBeenCalled();
  });
});
