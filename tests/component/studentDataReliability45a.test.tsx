import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Flashcard, Question, QuestionReviewResult } from '../../src/types';

const recordAnswerMock = vi.fn();
const subscribeToCorrectionMock = vi.fn();
const createFlashcardMock = vi.fn();
const reviewFlashcardMock = vi.fn();

vi.mock('../../src/components/feedback/ContextualFeedbackPopover', () => ({
  ContextualFeedbackPopover: () => null,
}));
vi.mock('../../src/repositories/AnswersRepository', () => ({
  answersRepository: {
    getAnswers: vi.fn().mockResolvedValue({}),
    recordAnswer: (...args: unknown[]) => recordAnswerMock(...args),
    subscribeToCorrection: (...args: unknown[]) => subscribeToCorrectionMock(...args),
  },
}));
vi.mock('../../src/repositories/QuestionsRepository', () => ({
  questionsRepository: {
    getQuestions: vi.fn().mockResolvedValue([]),
    getQuestionReview: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('../../src/repositories/BookmarksRepository', () => ({
  bookmarksRepository: {
    getBookmarks: vi.fn().mockResolvedValue({ questions: [], compendiums: [], flashcards: [] }),
    toggleBookmark: vi.fn().mockResolvedValue(false),
  },
}));
vi.mock('../../src/repositories/QuestionReactionsRepository', () => ({
  questionReactionsRepository: {
    getMyReaction: vi.fn().mockResolvedValue(null),
    setReaction: vi.fn().mockResolvedValue(undefined),
    removeReaction: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../../src/repositories/FlashcardsRepository', () => ({
  flashcardsRepository: {
    createFlashcardFromQuestion: (...args: unknown[]) => createFlashcardMock(...args),
    reviewFlashcard: (...args: unknown[]) => reviewFlashcardMock(...args),
  },
}));
vi.mock('../../src/services/gamification', () => ({
  GamificationService: { triggerCelebration: vi.fn() },
  CELEBRATION_STREAK_LENGTH: 5,
}));
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

const { QuestionCard } = await import('../../src/components/questions/QuestionCard');
const { FlashcardReviewSession } = await import('../../src/components/flashcards/FlashcardReviewSession');

const question: Question = {
  id: 'q-45a',
  disciplineId: 'disc-1',
  themeId: 'theme-1',
  compendiumRefId: '',
  cycle: 'clinico',
  difficulty: 'medio',
  institution: 'NexusMed',
  year: 2026,
  clinicalVignette: '',
  questionStem: 'Enunciado 45-A',
  options: [
    { letter: 'A', text: 'Alternativa A', isCorrect: false, explanation: '' },
    { letter: 'B', text: 'Alternativa B', isCorrect: true, explanation: '' },
  ],
  generalCommentary: '',
  highYieldSummary: '',
  tags: [],
};

const incorrectReview: QuestionReviewResult = {
  isCorrect: false,
  correctOptionId: 'B',
  generalCommentary: 'Comentário confirmado',
  highYieldSummary: 'Resumo',
  options: [
    { optionId: 'opt-a', letter: 'A', isCorrect: false, explanation: 'Distrator' },
    { optionId: 'opt-b', letter: 'B', isCorrect: true, explanation: 'Correta' },
  ],
  references: [],
};

const flashcard: Flashcard = {
  id: 'fc-45a',
  disciplineId: 'disc-1',
  themeId: 'theme-1',
  front: 'Frente',
  back: 'Verso',
  mechanismHighlight: '',
  tags: [],
  difficulty: 'medio',
  srs: {
    intervalDays: 0,
    repetitionCount: 0,
    easeFactor: 2.5,
    nextDueDate: '2026-09-24',
    state: 'new',
    reviewHistory: [],
  },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('45-A parte 2 — confirmação de resposta', () => {
  it('bloqueia clique duplo enquanto envia a mesma ação', async () => {
    let resolveSubmission!: (value: unknown) => void;
    recordAnswerMock.mockReturnValue(new Promise((resolve) => { resolveSubmission = resolve; }));

    render(
      <QuestionCard
        question={question}
        onOpenCompendium={vi.fn()}
        hydrated={{ answer: null, bookmarked: false, reaction: null }}
      />
    );
    fireEvent.click(screen.getByText('Alternativa A'));
    const confirm = screen.getByRole('button', { name: 'Confirmar Resposta' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(recordAnswerMock).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: 'Corrigindo…' }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      resolveSubmission({ status: 'confirmed', clientOpId: 'op-confirmada', review: incorrectReview });
    });
  });

  it('mostra correção pendente sem marcar erro nem criar flashcard; aplica o resultado quando a mesma operação sincroniza', async () => {
    let onCorrection!: (outcome: { status: 'confirmed'; review: QuestionReviewResult }) => void;
    subscribeToCorrectionMock.mockImplementation((_opId: string, callback: typeof onCorrection) => {
      onCorrection = callback;
      return vi.fn();
    });
    recordAnswerMock.mockResolvedValue({ status: 'pending', clientOpId: 'op-pendente' });
    createFlashcardMock.mockResolvedValue(undefined);
    const onAnswerRecorded = vi.fn();

    render(
      <QuestionCard
        question={question}
        onOpenCompendium={vi.fn()}
        onAnswerRecorded={onAnswerRecorded}
        hydrated={{ answer: null, bookmarked: false, reaction: null }}
      />
    );
    fireEvent.click(screen.getByText('Alternativa A'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Resposta' }));

    await waitFor(() => expect(screen.getByText(/correção pendente/i)).toBeTruthy());
    expect(createFlashcardMock).not.toHaveBeenCalled();
    expect(onAnswerRecorded).not.toHaveBeenCalled();
    expect(screen.queryByText(/Resposta incorreta/i)).toBeNull();
    expect(subscribeToCorrectionMock).toHaveBeenCalledWith('op-pendente', expect.any(Function));

    await act(async () => onCorrection({ status: 'confirmed', review: incorrectReview }));

    await waitFor(() => expect(screen.getByText(/Resposta incorreta/i)).toBeTruthy());
    expect(createFlashcardMock).toHaveBeenCalledTimes(1);
    expect(onAnswerRecorded).toHaveBeenCalledTimes(1);
  });

  it('falha definitiva libera a resposta para nova tentativa e nunca fica como correção pendente', async () => {
    recordAnswerMock.mockResolvedValue({
      status: 'failed',
      clientOpId: 'op-falhou',
      errorKind: 'validation',
    });

    render(
      <QuestionCard
        question={question}
        onOpenCompendium={vi.fn()}
        hydrated={{ answer: null, bookmarked: false, reaction: null }}
      />
    );
    fireEvent.click(screen.getByText('Alternativa A'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Resposta' }));

    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Confirmar Resposta' }) as HTMLButtonElement).disabled).toBe(false);
    });
    expect(screen.getByText(/não foi possível confirmar a resposta/i)).toBeTruthy();
    expect(screen.queryByText(/correção pendente/i)).toBeNull();
    expect(subscribeToCorrectionMock).not.toHaveBeenCalled();
    expect(createFlashcardMock).not.toHaveBeenCalled();
  });

  it('uma operação pendente que termina em falha também libera a resposta', async () => {
    let onCorrection!: (outcome: { status: 'failed'; errorKind: 'permission' }) => void;
    subscribeToCorrectionMock.mockImplementation((_opId: string, callback: typeof onCorrection) => {
      onCorrection = callback;
      return vi.fn();
    });
    recordAnswerMock.mockResolvedValue({ status: 'pending', clientOpId: 'op-pendente-falha' });

    render(
      <QuestionCard
        question={question}
        onOpenCompendium={vi.fn()}
        hydrated={{ answer: null, bookmarked: false, reaction: null }}
      />
    );
    fireEvent.click(screen.getByText('Alternativa A'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Resposta' }));
    await waitFor(() => expect(screen.getByText(/correção pendente/i)).toBeTruthy());

    await act(async () => onCorrection({ status: 'failed', errorKind: 'permission' }));

    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Confirmar Resposta' }) as HTMLButtonElement).disabled).toBe(false);
    });
    expect(screen.getByText(/não foi possível confirmar a resposta/i)).toBeTruthy();
  });
});

describe('45-A parte 2 — nota do flashcard', () => {
  it('bloqueia clique duplo e desativa as quatro notas enquanto a revisão grava', async () => {
    let resolveReview!: (value: Flashcard) => void;
    reviewFlashcardMock.mockReturnValue(new Promise((resolve) => { resolveReview = resolve; }));

    render(
      <FlashcardReviewSession
        cards={[flashcard]}
        disciplines={[]}
        themes={[]}
        onFinishSession={vi.fn()}
        onOpenCompendium={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Revelar Resposta/ }));
    const rating = screen.getByRole('button', { name: /3\. Bom/ });
    fireEvent.click(rating);
    fireEvent.click(rating);

    expect(reviewFlashcardMock).toHaveBeenCalledTimes(1);
    for (const label of [/1\. Errei/, /2\. Difícil/, /3\. Bom/, /4\. Fácil/]) {
      expect((screen.getByRole('button', { name: label }) as HTMLButtonElement).disabled).toBe(true);
    }

    await act(async () => resolveReview(flashcard));
  });
});
