import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Compendium, Question } from '../../src/types';

// 43-B (revisão do PR #94, item 2): aberta a partir de um material, a lista de
// questões diz que está recortada, tem saída, e não soma o recorte aos filtros
// persistidos de uma visita anterior (senão a lista sai vazia sem motivo).

const uiState: Record<string, unknown> = {};
vi.mock('../../src/services/storage', () => ({
  StorageService: {
    getUIState: (k: string, d: unknown) => (k in uiState ? uiState[k] : d),
    setUIState: (k: string, v: unknown) => {
      uiState[k] = v;
    },
  },
}));
vi.mock('../../src/hooks/useScrollMemory', () => ({ useScrollMemory: vi.fn() }));
vi.mock('../../src/repositories/AnswersRepository', () => ({ answersRepository: { getAnswers: vi.fn().mockResolvedValue({}) } }));
vi.mock('../../src/repositories/BookmarksRepository', () => ({
  bookmarksRepository: { getBookmarks: vi.fn().mockResolvedValue({ questions: [], compendiums: [], flashcards: [] }) },
}));
vi.mock('../../src/repositories/QuestionReactionsRepository', () => ({
  questionReactionsRepository: { getMyReactions: vi.fn().mockResolvedValue({}) },
}));
vi.mock('../../src/components/questions/QuestionCard', () => ({
  QuestionCard: ({ question }: { question: Question }) => <div data-testid="card">{question.questionStem}</div>,
}));

const { QuestionsView } = await import('../../src/components/questions/QuestionsView');

const material: Compendium = {
  id: 'mat-a', disciplineId: 'd', themeId: 't', title: 'Ceftriaxona', subtitle: '', estimatedReadTimeMinutes: 10,
  lastUpdated: '', author: '', sections: [], references: [],
};
const q = (id: string, links: string[], themeId = 't'): Question => ({
  id, disciplineId: 'd', themeId, compendiumRefId: links[0] ?? '', materialLinks: links.map((m) => ({ materialId: m })),
  cycle: 'clinico', difficulty: 'medio', institution: '', year: 2026, clinicalVignette: '', questionStem: `Questão ${id}`,
  options: [], generalCommentary: '', highYieldSummary: '', tags: [],
});
const questions = [q('1', ['mat-a']), q('2', ['mat-b'], 'outro-tema')];

function renderView(props: Partial<React.ComponentProps<typeof QuestionsView>> = {}) {
  return render(
    <QuestionsView
      questions={questions}
      disciplines={[]}
      themes={[]}
      compendiums={[material]}
      onOpenCompendium={vi.fn()}
      onOpenCreateSimulado={vi.fn()}
      {...props}
    />
  );
}

afterEach(() => {
  cleanup();
  for (const k of Object.keys(uiState)) delete uiState[k];
});

describe('QuestionsView — recorte por material (43-B)', () => {
  it('avisa o recorte e oferece "Ver todas as questões", mesmo sem vir de um pack', () => {
    const onClearScope = vi.fn();
    renderView({ filterCompendiumId: 'mat-a', onClearScope });
    expect(screen.getByText(/Questões que cobram/)).toBeTruthy();
    expect(screen.getByText('Ceftriaxona')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ver todas as questões' }));
    expect(onClearScope).toHaveBeenCalled();
  });

  it('filtro de tema persistido de outra visita não esvazia o recorte por material', () => {
    uiState.questions_theme = 'outro-tema';
    renderView({ filterCompendiumId: 'mat-a', onClearScope: vi.fn() });
    expect(screen.getAllByTestId('card').map((c) => c.textContent)).toEqual(['Questão 1']);
  });
});

describe('QuestionsView — recorte "Testar o que li" (43-C)', () => {
  it('mostra só as questões escolhidas, avisa o recorte e oferece saída', () => {
    const onClearScope = vi.fn();
    renderView({ scopeQuestionIds: ['2'], onClearScope });
    expect(screen.getAllByTestId('card').map((c) => c.textContent)).toEqual(['Questão 2']);
    expect(screen.getByText(/Testar o que li/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ver todas as questões' }));
    expect(onClearScope).toHaveBeenCalled();
  });

  it('filtros persistidos de outra visita não esvaziam o recorte', () => {
    uiState.questions_theme = 't';
    uiState.questions_status = 'incorrect';
    renderView({ scopeQuestionIds: ['2'], onClearScope: vi.fn() });
    expect(screen.getAllByTestId('card').map((c) => c.textContent)).toEqual(['Questão 2']);
  });
});
