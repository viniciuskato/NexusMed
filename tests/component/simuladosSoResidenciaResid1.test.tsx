import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Question, QuestionAnswerRecord, SimuladoConfig, SimuladoSessionData } from '../../src/types';

// RESID-1 (D-14) — Simulados: sem questão de residência a tela diz isso e não oferece nada para iniciar; o
// histórico só tem o que é de residência, com o aproveitamento recalculado se a sessão é mista; e
// sessão sem questão nunca é gravada.

const TEXTO_VAZIO = 'Ainda não há questões de residência publicadas.';

const getSimuladoHistory = vi.fn();
const saveSimuladoSession = vi.fn();
vi.mock('../../src/repositories/SimuladosRepository', () => ({
  simuladosRepository: {
    getSimuladoHistory: () => getSimuladoHistory(),
    saveSimuladoSession: (...a: unknown[]) => saveSimuladoSession(...a),
    subscribeToResult: vi.fn(),
  },
}));
vi.mock('../../src/repositories/AnswersRepository', () => ({
  answersRepository: { getAnswers: async () => ({}), recordAnswer: vi.fn(), subscribeToCorrection: vi.fn() },
}));
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('../../src/components/questions/QuestionCard', () => ({
  QuestionCard: ({ question }: { question: { id: string } }) => <div data-testid={`card-${question.id}`} />,
}));

const { SimuladosView } = await import('../../src/components/simulados/SimuladosView');
const { SimuladoSession } = await import('../../src/components/questions/SimuladoSession');

const q = (id: string): Question => ({ id, disciplineId: 'cm', institution: 'ENARE', year: 2024 }) as Question;
const resposta = (questionId: string, isCorrect: boolean): QuestionAnswerRecord => ({
  questionId,
  selectedOption: 'A',
  isCorrect,
  timestamp: new Date().toISOString(),
  timeSpentSeconds: 1,
});
const config = (name: string): SimuladoConfig =>
  ({
    id: `cfg-${name}`,
    name,
    disciplineIds: [],
    themeIds: [],
    difficulties: [],
    cycles: [],
    onlyMistakes: false,
    questionCount: 5,
    timeLimitMinutes: 10,
    isExamMode: true,
  }) as SimuladoConfig;
const sessao = (name: string, questionIds: string[], score: number): SimuladoSessionData => ({
  id: `sess-${name}`,
  config: config(name),
  questionIds,
  answers: {},
  startedAt: '2026-10-01T10:00:00.000Z',
  completedAt: '2026-10-01T10:10:00.000Z',
  score,
  totalTimeSeconds: 600,
});

// Residência: r1, r2, r3. De fora: e1, e2.
const residencia = [q('r1'), q('r2'), q('r3')];
const respostas = {
  r1: resposta('r1', true),
  r2: resposta('r2', false),
  r3: resposta('r3', true),
  e1: resposta('e1', true),
  e2: resposta('e2', true),
};

function renderSimulados(props: Partial<React.ComponentProps<typeof SimuladosView>> = {}) {
  const handlers = { onOpenCreateModal: vi.fn(), onStartCustomSimulado: vi.fn(), onUpdate: vi.fn() };
  render(
    <SimuladosView
      disciplines={[{ id: 'cm', name: 'Clínica' } as never]}
      themes={[]}
      questions={residencia}
      answers={respostas}
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

beforeEach(() => {
  getSimuladoHistory.mockReset().mockResolvedValue([]);
  saveSimuladoSession.mockReset();
});
afterEach(cleanup);

describe('Simulados sem questão de residência', () => {
  it('diz que não há questões e não oferece presets nem "Criar Simulado"', async () => {
    renderSimulados({ questions: [] });
    expect(screen.getByText(TEXTO_VAZIO)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Criar Simulado/ })).toBeNull();
    expect(screen.queryByText('Simulado Express Misto')).toBeNull();
    expect(screen.queryByText('Iniciar Agora')).toBeNull();
    await waitFor(() => expect(getSimuladoHistory).toHaveBeenCalled());
  });

  it('com a carga ainda sem dados do servidor, não afirma que não há questão nem que o histórico está vazio', async () => {
    renderSimulados({ questions: [], dadosProntos: false });
    await waitFor(() => expect(getSimuladoHistory).toHaveBeenCalled());
    expect(screen.queryByText(TEXTO_VAZIO)).toBeNull();
    expect(screen.queryByText(/Nenhum simulado finalizado ainda/)).toBeNull();
  });

  it('com questões de residência, os presets e o botão aparecem', () => {
    renderSimulados();
    expect(screen.queryByText(TEXTO_VAZIO)).toBeNull();
    expect(screen.getByRole('button', { name: /Criar Simulado Personalizado/ })).toBeTruthy();
    expect(screen.getAllByText('Iniciar Agora')).toHaveLength(3);
  });

  it('mostra o recado de um simulado que não abriu', () => {
    renderSimulados({ aviso: 'Nenhuma questão de residência corresponde a este simulado.' });
    expect(screen.getByRole('alert').textContent).toContain('Nenhuma questão de residência corresponde');
  });
});

describe('Histórico de simulados só de residência', () => {
  it('sessão mista tem o aproveitamento recalculado; a só de estudo some; a só de residência mantém a nota', async () => {
    getSimuladoHistory.mockResolvedValue([
      // 3 de residência + 2 de estudo, nota gravada 80%. Residência: r1 certa, r2 errada, r3 certa = 67%.
      sessao('Mista', ['r1', 'r2', 'r3', 'e1', 'e2'], 80),
      // Só questões de estudo: não aparece.
      sessao('So estudo', ['e1', 'e2'], 100),
      // Só residência: mantém a nota gravada.
      sessao('So residencia', ['r1', 'r2'], 50),
    ]);
    renderSimulados();

    const mista = (await screen.findByText('Mista')).closest('.p-4') as HTMLElement;
    expect(within(mista).getByText('67%')).toBeTruthy();
    expect(within(mista).queryByText('80%')).toBeNull();
    expect(within(mista).getByText('3 questões')).toBeTruthy();

    const soResidencia = screen.getByText('So residencia').closest('.p-4') as HTMLElement;
    expect(within(soResidencia).getByText('50%')).toBeTruthy();
    expect(within(soResidencia).getByText('2 questões')).toBeTruthy();

    expect(screen.queryByText('So estudo')).toBeNull();
    expect(screen.getByText('2 provas arquivadas')).toBeTruthy();
  });

  it('só sessões de estudo no histórico: diz que não há simulado finalizado', async () => {
    getSimuladoHistory.mockResolvedValue([sessao('So estudo', ['e1', 'e2'], 100)]);
    renderSimulados();
    expect(await screen.findByText('Nenhum simulado finalizado ainda.')).toBeTruthy();
    expect(screen.queryByText('So estudo')).toBeNull();
  });
});

describe('SimuladoSession sem questão', () => {
  it('nunca grava a sessão', async () => {
    render(
      <SimuladoSession
        config={config('Vazio')}
        questions={[]}
        eligibleCount={0}
        requestedCount={5}
        disciplines={[]}
        themes={[]}
        onFinishSession={vi.fn()}
        onOpenCompendium={vi.fn()}
      />
    );
    const finalizar = screen.queryByRole('button', { name: /Finalizar/ });
    if (finalizar) fireEvent.click(finalizar);
    await new Promise((r) => setTimeout(r, 50));
    expect(saveSimuladoSession).not.toHaveBeenCalled();
  });
});
