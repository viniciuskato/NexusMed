import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Question } from '../../src/types';
import type { ReporteDeErro } from '../../src/repositories/MaterialErrorReportsRepository';

// 44-H2 — o selo "Revisado por IA — ainda não lido por uma pessoa" e o "Reportar erro"
// na questão publicada. O banco decide o selo (pgTAP); aqui se prova o que a tela mostra:
// um selo discreto só em questão com revisão de IA válida, o "Reportar erro" que vai para a
// Área Editorial (com o limite diário do banco) no lugar do antigo, e a aba de erros.

vi.mock('../../src/components/feedback/ContextualFeedbackPopover', () => ({
  ContextualFeedbackPopover: () => <button type="button" data-testid="feedback-antigo">Reportar erro (antigo)</button>,
}));
vi.mock('../../src/repositories/AnswersRepository', () => ({
  answersRepository: { getAnswers: vi.fn().mockResolvedValue({}), recordAnswer: vi.fn() },
}));
vi.mock('../../src/repositories/QuestionsRepository', () => ({
  questionsRepository: { getQuestions: vi.fn().mockResolvedValue([]), getQuestionReview: vi.fn() },
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
  flashcardsRepository: { createFlashcardFromQuestion: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../../src/services/gamification', () => ({
  GamificationService: { triggerCelebration: vi.fn() },
  CELEBRATION_STREAK_LENGTH: 5,
}));

const getSeals = vi.fn<() => Promise<Map<string, 'ia' | 'ia_e_pessoa'>>>();
vi.mock('../../src/repositories/QuestionSealRepository', () => ({
  questionSealsRepository: { getSeals: () => getSeals() },
}));

const report = vi.fn();
const listAll = vi.fn<() => Promise<ReporteDeErro[]>>();
vi.mock('../../src/repositories/MaterialErrorReportsRepository', () => ({
  LIMITE_DE_REPORTES_POR_DIA: 20,
  LIMITE_DO_TEXTO_DO_REPORTE: 2000,
  reportarErroDisponivel: true,
  mensagemDeErroDoReporte: (err: unknown) => (err as { hint?: string })?.hint === 'limite_reportes_por_dia'
    ? 'Você já enviou 20 reportes de erro hoje. Tente de novo amanhã.'
    : 'Não foi possível enviar o reporte agora.',
  materialErrorReportsRepository: { report: (...a: unknown[]) => report(...a), listAll: () => listAll(), resolve: vi.fn() },
}));

const { QuestionCard } = await import('../../src/components/questions/QuestionCard');
const { ErrosReportadosAdmin } = await import('../../src/components/admin/ErrosReportadosAdmin');
const { SeloDaQuestao } = await import('../../src/components/material/SeloDeRevisao');

const questao = (over: Partial<Question> = {}): Question => ({
  id: 'q-1',
  disciplineId: 'd1',
  themeId: 't1',
  compendiumRefId: '',
  cycle: 'internato_residencia',
  difficulty: 'medio',
  institution: 'NexusMed (questão autoral)',
  year: 0,
  clinicalVignette: 'Paciente com dispneia.',
  questionStem: 'Qual o padrão espirométrico esperado?',
  options: [
    { letter: 'A', text: 'Obstrutivo', isCorrect: true, explanation: 'Certa.' },
    { letter: 'B', text: 'Restritivo', isCorrect: false, explanation: 'Errada.' },
  ],
  generalCommentary: 'Comentário.',
  highYieldSummary: 'Pérola.',
  tags: [],
  ...over,
});

const renderCard = (q: Question) =>
  render(<QuestionCard question={q} onOpenCompendium={() => {}} hydrated={{ answer: null, bookmarked: false, reaction: null }} />);

beforeEach(() => {
  getSeals.mockReset().mockResolvedValue(new Map());
  report.mockReset().mockResolvedValue(undefined);
  listAll.mockReset().mockResolvedValue([]);
});
afterEach(() => cleanup());

describe('44-H2 — selo na questão', () => {
  it('questão com revisão de IA válida: mostra o selo discreto e o "Reportar erro" novo, no lugar do antigo', async () => {
    getSeals.mockResolvedValue(new Map([['q-1', 'ia']]));
    renderCard(questao());
    const selo = await screen.findByTestId('selo-da-questao');
    expect(selo.textContent).toBe('Revisado por IA — ainda não lido por uma pessoa');
    expect(selo.getAttribute('data-selo')).toBe('ia');
    expect(screen.getByTestId('btn-reportar-erro-da-questao')).toBeTruthy();
    expect(screen.queryByTestId('feedback-antigo')).toBeNull();
  });

  it('questão revisada por IA e atestada por uma pessoa: o selo diz as duas coisas', async () => {
    getSeals.mockResolvedValue(new Map([['q-1', 'ia_e_pessoa']]));
    renderCard(questao());
    expect((await screen.findByTestId('selo-da-questao')).textContent).toBe('Revisado por IA e por uma pessoa');
  });

  it('questão antiga (ou alterada depois da revisão): sem selo e com o "Reportar erro" de sempre', async () => {
    getSeals.mockResolvedValue(new Map([['outra-questao', 'ia']]));
    renderCard(questao());
    await waitFor(() => expect(getSeals).toHaveBeenCalled());
    expect(screen.queryByTestId('selo-da-questao')).toBeNull();
    expect(screen.getByTestId('feedback-antigo')).toBeTruthy();
    expect(screen.queryByTestId('btn-reportar-erro-da-questao')).toBeNull();
  });

  it('a consulta dos selos falhou: a questão aparece normalmente, sem selo (decorativo)', async () => {
    getSeals.mockRejectedValue(new Error('rede'));
    renderCard(questao());
    await waitFor(() => expect(getSeals).toHaveBeenCalled());
    expect(screen.queryByTestId('selo-da-questao')).toBeNull();
    expect(screen.getByText('Qual o padrão espirométrico esperado?')).toBeTruthy();
  });

  it('questão autoral (sem ano) não mostra "(0)" ao lado da banca', async () => {
    const { container } = renderCard(questao());
    await waitFor(() => expect(getSeals).toHaveBeenCalled());
    expect(container.textContent).toContain('NexusMed (questão autoral)');
    expect(container.textContent).not.toContain('(0)');
    cleanup();
    const outra = renderCard(questao({ institution: 'ENARE', year: 2024 }));
    expect(outra.container.textContent).toContain('ENARE (2024)');
  });

  it('o selo isolado', () => {
    render(<SeloDaQuestao selo="ia" />);
    expect(screen.getByTestId('selo-da-questao').textContent).toContain('ainda não lido por uma pessoa');
  });
});

describe('44-H2 — "Reportar erro" na questão', () => {
  const abrirFormulario = async () => {
    getSeals.mockResolvedValue(new Map([['q-1', 'ia']]));
    renderCard(questao());
    fireEvent.click(await screen.findByTestId('btn-reportar-erro-da-questao'));
    return screen.findByRole('dialog', { name: 'Reportar erro nesta questão' });
  };

  it('abre o formulário da questão e envia o reporte com o alvo certo (a questão, não um material)', async () => {
    const dialogo = await abrirFormulario();
    expect(dialogo.textContent).toContain('Qual o padrão espirométrico esperado?');
    fireEvent.change(within(dialogo).getByLabelText(/O que está errado/), { target: { value: 'O gabarito está errado.' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Enviar reporte' }));
    await waitFor(() => expect(report).toHaveBeenCalledTimes(1));
    expect(report).toHaveBeenCalledWith({ questionId: 'q-1', description: 'O gabarito está errado.', excerpt: null });
    expect(await screen.findByTestId('reporte-enviado')).toBeTruthy();
    expect(screen.getByTestId('reporte-enviado').textContent).toContain('vai conferir a questão');
  });

  it('o limite diário do banco vira uma frase leiga', async () => {
    report.mockRejectedValue({ hint: 'limite_reportes_por_dia' });
    const dialogo = await abrirFormulario();
    fireEvent.change(within(dialogo).getByLabelText(/O que está errado/), { target: { value: 'Erro.' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Enviar reporte' }));
    expect(await within(dialogo).findByRole('alert')).toBeTruthy();
    expect(within(dialogo).getByRole('alert').textContent).toBe('Você já enviou 20 reportes de erro hoje. Tente de novo amanhã.');
  });

  it('sem descrição, o botão de enviar fica desabilitado', async () => {
    const dialogo = await abrirFormulario();
    expect((within(dialogo).getByRole('button', { name: 'Enviar reporte' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('44-H2 — aba "Erros reportados" com questões', () => {
  it('mostra o reporte de uma questão junto dos de material, com o começo do enunciado', async () => {
    listAll.mockResolvedValue([
      {
        id: 'r1', materialId: null, questionId: 'q-1', materialTitle: 'Questão: Qual o padrão espirométrico esperado?',
        description: 'O gabarito está errado.', excerpt: null, status: 'aberto',
        createdAt: '2026-09-30T10:00:00.000Z', resolvedAt: null, reporter: { id: 'u1', name: 'Ana', email: 'a@x.test' },
      },
      {
        id: 'r2', materialId: 'm1', questionId: null, materialTitle: 'Material com erro',
        description: 'A dose está errada.', excerpt: null, status: 'aberto',
        createdAt: '2026-09-29T10:00:00.000Z', resolvedAt: null, reporter: null,
      },
    ]);
    render(<ErrosReportadosAdmin />);
    const lista = await waitFor(() => {
      const el = document.querySelector('#admin-erros-lista') as HTMLElement | null;
      if (!el) throw new Error('ainda não carregou');
      return el;
    });
    expect(lista.textContent).toContain('Questão: Qual o padrão espirométrico esperado?');
    expect(lista.textContent).toContain('Material com erro');
    expect(document.querySelector('#admin-erros-reportados')?.textContent).toContain('materiais e questões publicados');
    expect(screen.getByTestId('erros-abertos').textContent).toBe('2 abertos.');
  });
});
