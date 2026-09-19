import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Question } from '../../src/types';

// Prompt 41-B (gate final da auditoria fe20832): a 41-A suprimiu
// `react-hooks/exhaustive-deps` no useEffect dos atalhos de teclado do
// QuestionCard, alegando que reinstalar o listener a cada render era
// desnecessário. A 41-B substitui a supressão por `useCallback` com deps
// reais em handleConfirmAnswer/handleSelectOption (ver QuestionCard.tsx).
//
// Este teste prova objetivamente a ausência de closure obsoleta: troca uma
// prop lida por handleConfirmAnswer/handleSelectOption (onAnswerRecorded /
// onSelectOptionInExam) SEM tocar nas deps que já estavam listadas
// (isSubmitted, isHovered, selectedOption, isExamMode, question.options) e
// confirma que Enter/tecla de letra, após o rerender, chamam a versão NOVA
// da prop — nunca a closure antiga. Com a supressão da 41-A (listener preso
// ao closure do render em que foi montado), este teste falha.

vi.mock('../../src/components/feedback/ContextualFeedbackPopover', () => ({
  ContextualFeedbackPopover: () => null,
}));

const recordAnswerMock = vi.fn();
vi.mock('../../src/repositories/AnswersRepository', () => ({
  answersRepository: {
    getAnswers: vi.fn().mockResolvedValue({}),
    recordAnswer: (...args: unknown[]) => recordAnswerMock(...args),
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
    createFlashcardFromQuestion: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/services/gamification', () => ({
  GamificationService: { triggerCelebration: vi.fn() },
  CELEBRATION_STREAK_LENGTH: 5,
}));

// Importado só depois dos mocks acima (padrão vitest de hoisting de vi.mock).
const { QuestionCard } = await import('../../src/components/questions/QuestionCard');

const baseQuestion: Question = {
  id: 'q-1',
  disciplineId: 'disc-cardio',
  themeId: 'tema-ic',
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
    { letter: 'C', text: 'Alternativa C', isCorrect: false, explanation: '' },
  ],
  generalCommentary: '',
  highYieldSummary: '',
  tags: [],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('QuestionCard - atalhos de teclado sobrevivem a rerender (41-B)', () => {
  it('Enter chama o onAnswerRecorded ATUAL após rerender, nunca o closure antigo', async () => {
    recordAnswerMock.mockResolvedValue({
      isCorrect: true,
      generalCommentary: '',
      highYieldSummary: '',
      options: [],
      references: [],
    });

    const onAnswerRecordedOld = vi.fn();
    const onAnswerRecordedNew = vi.fn();

    const { container, rerender } = render(
      <QuestionCard
        question={baseQuestion}
        onOpenCompendium={() => {}}
        onAnswerRecorded={onAnswerRecordedOld}
        hydrated={{ answer: null, bookmarked: false, reaction: null }}
      />
    );

    const card = container.querySelector(`#question-${baseQuestion.id}`) as HTMLElement;
    expect(card).toBeTruthy();

    // Ativa o listener de teclado (o useEffect só liga com isHovered=true).
    fireEvent.mouseEnter(card);
    // Seleciona a alternativa B clicando (equivalente a apertar a tecla B).
    fireEvent.click(screen.getByText('Alternativa B'));

    // Rerender com uma NOVA função onAnswerRecorded — sem tocar em nenhuma
    // das deps que a 41-A já listava (isSubmitted/isHovered/selectedOption/
    // isExamMode/question.options seguem idênticas). Isso é exatamente o
    // cenário que a supressão da 41-A não cobria: o pai troca uma prop lida
    // pela callback sem que o listener seja avisado.
    rerender(
      <QuestionCard
        question={baseQuestion}
        onOpenCompendium={() => {}}
        onAnswerRecorded={onAnswerRecordedNew}
        hydrated={{ answer: null, bookmarked: false, reaction: null }}
      />
    );

    fireEvent.keyDown(window, { key: 'Enter' });

    await waitFor(() => expect(recordAnswerMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onAnswerRecordedNew).toHaveBeenCalledTimes(1));
    expect(onAnswerRecordedOld).not.toHaveBeenCalled();
  });

  it('tecla de letra chama o onSelectOptionInExam ATUAL após rerender, nunca o closure antigo', () => {
    const onSelectOld = vi.fn();
    const onSelectNew = vi.fn();

    const { container, rerender } = render(
      <QuestionCard
        question={baseQuestion}
        onOpenCompendium={() => {}}
        isExamMode
        onSelectOptionInExam={onSelectOld}
        hydrated={{ answer: null, bookmarked: false, reaction: null }}
      />
    );

    const card = container.querySelector(`#question-${baseQuestion.id}`) as HTMLElement;
    fireEvent.mouseEnter(card);

    rerender(
      <QuestionCard
        question={baseQuestion}
        onOpenCompendium={() => {}}
        isExamMode
        onSelectOptionInExam={onSelectNew}
        hydrated={{ answer: null, bookmarked: false, reaction: null }}
      />
    );

    fireEvent.keyDown(window, { key: 'c' });

    expect(onSelectNew).toHaveBeenCalledWith('C');
    expect(onSelectOld).not.toHaveBeenCalled();
  });
});
