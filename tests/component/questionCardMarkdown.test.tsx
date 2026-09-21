import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Question, QuestionReviewResult } from '../../src/types';

// Achado revisando a Revisão editorial de uma questão real: o preview de
// claim (ProvenanceReviewPanel) já renderiza enunciado/alternativa via
// SafeMarkdown, mas QuestionCard.tsx — a tela que o estudante realmente vê —
// interpolava questionStem/clinicalVignette/opt.text/explanation/
// generalCommentary/highYieldSummary crus, sem nenhum parser. Mesma classe
// de defeito do INC-2026-002 (compêndio), nunca corrigida do lado de
// questão. Este teste trava que esses campos passam por `parseInline`.

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

const getQuestionReviewMock = vi.fn();
vi.mock('../../src/repositories/QuestionsRepository', () => ({
  questionsRepository: {
    getQuestions: vi.fn().mockResolvedValue([]),
    getQuestionReview: (...args: unknown[]) => getQuestionReviewMock(...args),
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

const { QuestionCard } = await import('../../src/components/questions/QuestionCard');

const baseQuestion: Question = {
  id: 'q-md-1',
  disciplineId: 'disc-pneumo',
  themeId: 'tema-espirometria',
  compendiumRefId: '',
  cycle: 'internato_residencia',
  difficulty: 'medio',
  institution: 'ENARE',
  year: 2025,
  clinicalVignette: 'Paciente com **DPOC** grave em acompanhamento ambulatorial.',
  questionStem: 'Qual o padrão espirométrico esperado?',
  options: [
    { letter: 'A', text: 'Padrão **obstrutivo**', isCorrect: true, explanation: 'Correto conforme [1](#ref-1).' },
    { letter: 'B', text: 'Padrão restritivo', isCorrect: false, explanation: 'Incorreto.' },
  ],
  generalCommentary: 'Comentário geral.',
  highYieldSummary: 'Pérola.',
  tags: [],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('QuestionCard — Markdown de questão renderiza, não aparece cru', () => {
  it('vinheta e alternativa: "**negrito**" vira <strong>, não asteriscos literais', async () => {
    const { container } = render(
      <QuestionCard
        question={baseQuestion}
        onOpenCompendium={() => {}}
        hydrated={{ answer: null, bookmarked: false, reaction: null }}
      />
    );

    expect(await screen.findByText('DPOC')).toBeTruthy();
    expect(screen.getByText('DPOC').tagName).toBe('STRONG');
    expect(screen.getByText('obstrutivo').tagName).toBe('STRONG');
    expect(container.textContent).not.toContain('**');
  });

  it('explicação pós-resposta: "[N](#ref-N)" vira link de citação, não colchete cru', async () => {
    const review: QuestionReviewResult = {
      isCorrect: true,
      correctOptionId: 'A',
      generalCommentary: baseQuestion.generalCommentary,
      highYieldSummary: baseQuestion.highYieldSummary,
      options: [
        { optionId: 'A', letter: 'A', isCorrect: true, explanation: baseQuestion.options[0].explanation },
        { optionId: 'B', letter: 'B', isCorrect: false, explanation: baseQuestion.options[1].explanation },
      ],
      references: [],
    };
    getQuestionReviewMock.mockResolvedValue(review);

    const { container } = render(
      <QuestionCard
        question={baseQuestion}
        onOpenCompendium={() => {}}
        hydrated={{
          answer: {
            questionId: baseQuestion.id,
            selectedOption: 'A',
            isCorrect: true,
            timestamp: new Date().toISOString(),
            timeSpentSeconds: 10,
          },
          bookmarked: false,
          reaction: null,
        }}
      />
    );

    const citation = await screen.findByText('1');
    expect(citation.tagName).toBe('A');
    expect(citation.getAttribute('href')).toBe('#ref-1');
    expect(container.textContent).not.toContain('[1](#ref-1)');
  });
});
