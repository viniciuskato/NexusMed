import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import type { ErrorLogItem, Question, QuestionAnswerRecord } from '../../src/types';

// RESID-1 (D-14) — as contas das telas de estudo olham só as questões de residência, e sem nenhuma
// questão de residência publicada as telas dizem isso em vez de mostrar zeros.

const TEXTO_VAZIO = 'Ainda não há questões de residência publicadas.';

const getAnswers = vi.fn();
const getReadingProgress = vi.fn();
const getErrorLogs = vi.fn();
const getQuestionReview = vi.fn();
vi.mock('../../src/repositories/AnswersRepository', () => ({ answersRepository: { getAnswers: () => getAnswers() } }));
vi.mock('../../src/repositories/ReadingProgressRepository', () => ({
  readingProgressRepository: { getReadingProgress: () => getReadingProgress() },
}));
vi.mock('../../src/repositories/ErrorNotebookRepository', () => ({
  errorNotebookRepository: { getErrorLogs: () => getErrorLogs(), updateErrorLog: vi.fn() },
}));
vi.mock('../../src/repositories/QuestionsRepository', () => ({
  questionsRepository: { getQuestionReview: (id: string) => getQuestionReview(id) },
}));
vi.mock('../../src/repositories/BookmarksRepository', () => ({
  bookmarksRepository: { getBookmarks: async () => ({ questions: [], compendiums: [], flashcards: [] }) },
}));
vi.mock('../../src/repositories/QuestionReactionsRepository', () => ({
  questionReactionsRepository: { getMyReactions: async () => ({}) },
}));
vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', user_metadata: {} }, profile: { displayName: 'Fulana', role: 'student', status: 'active' } }),
}));
vi.mock('../../src/components/dashboard/ExportCadernoModal', () => ({ ExportCadernoModal: () => null }));
vi.mock('../../src/components/questions/QuestionCard', () => ({
  QuestionCard: ({ question }: { question: Question }) => <div data-testid="cartao-de-questao">{question.id}</div>,
}));

const { QuestionsView } = await import('../../src/components/questions/QuestionsView');
const { DashboardView } = await import('../../src/components/dashboard/DashboardView');
const { DesempenhoView } = await import('../../src/components/dashboard/DesempenhoView');
const { IntegratedCadernoErros } = await import('../../src/components/dashboard/IntegratedCadernoErros');

const q = (id: string, institution: string, year: number): Question =>
  ({
    id,
    disciplineId: 'cm',
    themeId: 't1',
    cycle: 'clinico',
    difficulty: 'medio',
    institution,
    year,
    clinicalVignette: '',
    questionStem: `Enunciado ${id}`,
    tags: [],
    options: [],
  }) as unknown as Question;
// O App entrega às telas só estas 3; as respostas abaixo incluem as de fora.
const residencia = [q('r1', 'ENARE', 2024), q('r2', 'USP', 2019), q('r3', 'AOCP / EBSERH', 2014)];
const resposta = (questionId: string, isCorrect: boolean): QuestionAnswerRecord => ({
  questionId,
  selectedOption: 'A',
  isCorrect,
  timestamp: new Date().toISOString(),
  timeSpentSeconds: 3,
});
const respostasMistas = {
  r1: resposta('r1', true),
  r2: resposta('r2', false),
  r3: resposta('r3', true),
  // respostas antigas a questões de estudo: não entram em nenhuma conta
  e1: resposta('e1', false),
  e2: resposta('e2', false),
  a1: resposta('a1', false),
};
const erro = (questionId: string): ErrorLogItem => ({
  id: `log-${questionId}`,
  questionId,
  timestamp: new Date().toISOString(),
  selectedOption: 'A',
  correctOption: 'B',
  errorReason: 'lacuna_teorica',
  userNotes: '',
  resolved: false,
});
const disciplinas = [{ id: 'cm', name: 'Clínica Médica' }] as never[];

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; // jsdom não implementa (useScrollMemory)
  getAnswers.mockReset().mockResolvedValue(respostasMistas);
  getReadingProgress.mockReset().mockResolvedValue({});
  getErrorLogs.mockReset().mockResolvedValue([erro('r2'), erro('e1'), erro('a1')]);
  getQuestionReview.mockReset().mockImplementation(async (id: string) => ({
    questionId: id,
    isCorrect: false,
    options: [],
    highYieldSummary: `Gabarito de ${id}`,
  }));
});
afterEach(cleanup);

describe('Questões (RESID-1)', () => {
  const renderQuestoes = (props: Partial<React.ComponentProps<typeof QuestionsView>> = {}) =>
    render(
      <QuestionsView
        questions={residencia}
        disciplines={disciplinas}
        themes={[]}
        compendiums={[]}
        onOpenCompendium={vi.fn()}
        onOpenCreateSimulado={vi.fn()}
        {...props}
      />
    );

  it('lista as 3 e conta como erro só a resposta a questão de residência', async () => {
    renderQuestoes();
    expect(screen.getAllByTestId('cartao-de-questao').map((c) => c.textContent)).toEqual(['r1', 'r2', 'r3']);
    expect(screen.getByText('Exibindo', { exact: false }).textContent).toContain('3 questões');
    // 3 respostas erradas gravadas (r2, e1, a1), só 1 é de residência.
    expect(await screen.findByRole('button', { name: 'Erros (1)' })).toBeTruthy();
  });

  it('sem nenhuma questão de residência: estado vazio claro, sem filtros nem lista', async () => {
    renderQuestoes({ questions: [] });
    expect(screen.getByText(TEXTO_VAZIO)).toBeTruthy();
    expect(screen.queryByTestId('cartao-de-questao')).toBeNull();
    expect(screen.queryByText(/Nenhuma questão encontrada com estes filtros/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Criar Simulado/ })).toBeNull();
  });

  it('enquanto os dados não vieram do servidor, não afirma que não há questão', () => {
    renderQuestoes({ questions: [], dadosProntos: false });
    expect(screen.queryByText(TEXTO_VAZIO)).toBeNull();
  });
});

describe('Início (RESID-1)', () => {
  const renderInicio = (props: Partial<React.ComponentProps<typeof DashboardView>> = {}) =>
    render(
      <DashboardView
        disciplines={disciplinas}
        questions={residencia}
        compendiums={[]}
        lastReadingSession={null}
        onSelectView={vi.fn()}
        onOpenCompendium={vi.fn()}
        {...props}
      />
    );

  it('acerto por disciplina só sobre as 3 de residência: 2 de 3 = 67%', async () => {
    renderInicio();
    const grafico = await screen.findByLabelText(/Percentual de acerto por disciplina/);
    const item = within(grafico).getByText('Clínica Médica').closest('li') as HTMLElement;
    expect(within(item).getByText('67%')).toBeTruthy();
    expect(item.getAttribute('title')).toContain('3 questões respondidas');
  });

  it('sem questão de residência publicada: diz isso, em vez de "nenhuma respondida"', async () => {
    renderInicio({ questions: [] });
    expect(await screen.findByText(TEXTO_VAZIO)).toBeTruthy();
    expect(screen.queryByText('Nenhuma questão respondida ainda')).toBeNull();
  });

  it('carga ainda sem dados do servidor: não afirma que não há questão', async () => {
    renderInicio({ questions: [], dadosProntos: false });
    await screen.findByText('Nenhum material em andamento');
    expect(screen.queryByText(TEXTO_VAZIO)).toBeNull();
  });
});

describe('Meu desempenho (RESID-1)', () => {
  const renderDesempenho = (props: Partial<React.ComponentProps<typeof DesempenhoView>> = {}) =>
    render(
      <DesempenhoView
        disciplines={disciplinas}
        themes={[]}
        questions={residencia}
        compendiums={[]}
        onSelectView={vi.fn()}
        onOpenCompendium={vi.fn()}
        onOpenQuestion={vi.fn()}
        {...props}
      />
    );

  it('acurácia, respondidas, erros e caderno contam só as 3 de residência', async () => {
    renderDesempenho();
    await screen.findByText('Desempenho por Especialidade Médica');
    // 2 acertos em 3 respondidas (e não 2 em 6): 67%, 3 questões, 1 erro.
    await waitFor(() => expect(screen.getByText('3 questões respondidas')).toBeTruthy());
    expect(screen.getByText('2 acertos')).toBeTruthy();
    expect(screen.getAllByText('1 erros').length).toBeGreaterThan(0);
    expect(screen.getAllByText('67%').length).toBeGreaterThan(0);
    // O caderno tem 3 entradas gravadas (r2, e1, a1), só 1 é de residência.
    expect(screen.getByRole('button', { name: /Caderno de Erros & Metacognição/ }).textContent).toContain('1');
    expect(screen.getByRole('button', { name: /Caderno de Erros & Metacognição/ }).textContent).not.toContain('3');
    expect(screen.getByText('3 de 3 questões respondidas (100%)', { exact: false })).toBeTruthy();
  });

  it('sem questão de residência publicada: estado vazio claro, sem zeros enganosos', async () => {
    renderDesempenho({ questions: [] });
    expect(await screen.findByText(TEXTO_VAZIO)).toBeTruthy();
    expect(screen.queryByText(/Acurácia Geral/)).toBeNull();
    expect(screen.queryByText(/Nenhuma vulnerabilidade crítica/)).toBeNull();
  });

  it('carga ainda sem dados do servidor: não afirma que não há questão', async () => {
    renderDesempenho({ questions: [], dadosProntos: false });
    await waitFor(() => expect(getAnswers).toHaveBeenCalled());
    expect(screen.queryByText(TEXTO_VAZIO)).toBeNull();
  });
});

describe('Caderno de Erros (RESID-1)', () => {
  it('lista só o erro da questão de residência e não busca gabarito de questão de fora', async () => {
    render(
      <IntegratedCadernoErros
        questions={residencia}
        disciplines={disciplinas}
        themes={[]}
        compendiums={[]}
        onOpenCompendium={vi.fn()}
        onOpenQuestion={vi.fn()}
        onStartErrorSimulado={vi.fn()}
        onUpdate={vi.fn()}
      />
    );
    await waitFor(() => expect(getQuestionReview).toHaveBeenCalledWith('r2'));
    expect(getQuestionReview).toHaveBeenCalledTimes(1);
    expect(getQuestionReview).not.toHaveBeenCalledWith('e1');
    expect(getQuestionReview).not.toHaveBeenCalledWith('a1');
    expect(await screen.findByText('Enunciado r2', { exact: false })).toBeTruthy();
    expect(screen.queryByText('Enunciado e1', { exact: false })).toBeNull();
    expect(screen.queryByText('Enunciado a1', { exact: false })).toBeNull();
  });
});
