import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Question, SimuladoConfig } from '../../src/types';

// ============================================================================
// Unidade 45-A, parte 1 (AUD-17 e o clique duplo em "Finalizar Prova" da
// AUD-18): o simulado não perde respostas.
//
// No Modo Prova, o cronômetro chamava a versão de `handleFinishExam` do
// primeiro render — com as respostas ainda vazias e o tempo inicial. Quando o
// tempo acabava, nenhuma resposta era gravada, a nota ficava 0 e o rascunho
// local era apagado. E "Finalizar Prova" só se desligava depois de gravar
// tudo: um segundo clique durante a gravação gravava tudo de novo.
// ============================================================================

const recordAnswerMock = vi.fn();
const saveSimuladoSessionMock = vi.fn();

vi.mock('../../src/repositories/AnswersRepository', () => ({
  answersRepository: {
    recordAnswer: (...args: unknown[]) => recordAnswerMock(...args),
    getAnswers: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock('../../src/repositories/SimuladosRepository', () => ({
  simuladosRepository: {
    saveSimuladoSession: (...args: unknown[]) => saveSimuladoSessionMock(...args),
  },
}));
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
// O cartão da questão não entra neste teste: a seleção é feita pelo atalho de
// teclado, que é tratado pelo próprio simulado.
vi.mock('../../src/components/questions/QuestionCard', () => ({
  QuestionCard: ({ question }: { question: { id: string } }) => <div data-testid={`card-${question.id}`} />,
}));

import { SimuladoSession } from '../../src/components/questions/SimuladoSession';

function question(id: string): Question {
  return {
    id,
    disciplineId: 'd',
    themeId: 't',
    compendiumRefId: '',
    cycle: 'clinico',
    difficulty: 'medio',
    institution: 'Teste',
    year: 2026,
    clinicalVignette: `Vinheta ${id}`,
    questionStem: `Enunciado ${id}`,
    options: ['A', 'B', 'C', 'D'].map((letter) => ({ letter, text: `Alternativa ${letter}`, explanation: '' })),
    generalCommentary: '',
    highYieldSummary: '',
    tags: [],
  } as unknown as Question;
}

const questions = [question('q1'), question('q2')];

function config(overrides: Partial<SimuladoConfig> = {}): SimuladoConfig {
  return {
    id: 'sim-teste',
    name: 'Simulado de teste',
    disciplineIds: [],
    themeIds: [],
    difficulties: [],
    cycles: [],
    onlyMistakes: false,
    questionCount: 2,
    timeLimitMinutes: 1,
    isExamMode: true,
    ...overrides,
  };
}

function renderSession(cfg: SimuladoConfig) {
  return render(
    <SimuladoSession
      config={cfg}
      questions={questions}
      disciplines={[]}
      themes={[]}
      onFinishSession={vi.fn()}
      onOpenCompendium={vi.fn()}
    />
  );
}

const review = (isCorrect: boolean) => ({ isCorrect, correctOption: 'A', options: [], generalCommentary: '' });

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  saveSimuladoSessionMock.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('45-A — tempo esgotado no Modo Prova', () => {
  it('grava as respostas marcadas, e a nota e o tempo correspondem a elas', async () => {
    vi.useFakeTimers();
    recordAnswerMock.mockResolvedValue(review(true));
    renderSession(config());

    // Marca "A" na primeira questão (atalho de teclado do simulado).
    fireEvent.keyDown(window, { key: 'A' });
    expect(screen.getByText(/1 respondidas/)).toBeTruthy();

    // O tempo de 1 minuto acaba.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });

    expect(recordAnswerMock).toHaveBeenCalledTimes(1);
    expect(recordAnswerMock).toHaveBeenCalledWith(expect.objectContaining({ questionId: 'q1', selectedOption: 'A' }));
    expect(saveSimuladoSessionMock).toHaveBeenCalledTimes(1);
    const saved = saveSimuladoSessionMock.mock.calls[0][0];
    expect(saved.answers).toEqual({ q1: expect.objectContaining({ selectedOption: 'A' }) });
    expect(saved.score).toBe(50); // 1 certa de 2
    expect(saved.totalTimeSeconds).toBe(60);
  });
});

describe('45-A — "Finalizar Prova" grava uma vez só', () => {
  it('clicar duas vezes durante a gravação não grava de novo, e o botão fica desativado enquanto grava', async () => {
    let resolveRecord: (v: ReturnType<typeof review>) => void = () => undefined;
    recordAnswerMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRecord = resolve;
        })
    );
    renderSession(config({ timeLimitMinutes: 30 }));
    fireEvent.keyDown(window, { key: 'B' });

    const finish = screen.getByRole('button', { name: /Finalizar Prova/ }) as HTMLButtonElement;
    fireEvent.click(finish);
    fireEvent.click(finish);

    const busy = screen.getByRole('button', { name: /Gravando|Finalizar Prova/ }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(recordAnswerMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRecord(review(false));
    });

    expect(saveSimuladoSessionMock).toHaveBeenCalledTimes(1);
    expect(recordAnswerMock).toHaveBeenCalledTimes(1);
  });

  it('se a gravação falhar, o rascunho fica e dá para tentar de novo', async () => {
    recordAnswerMock.mockRejectedValueOnce(new Error('rede caiu')).mockResolvedValue(review(true));
    renderSession(config({ timeLimitMinutes: 30 }));
    fireEvent.keyDown(window, { key: 'C' });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Finalizar Prova/ }));
    });
    expect(saveSimuladoSessionMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/Não foi possível gravar a prova/);

    const retry = screen.getByRole('button', { name: /Finalizar Prova/ }) as HTMLButtonElement;
    expect(retry.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(retry);
    });
    expect(saveSimuladoSessionMock).toHaveBeenCalledTimes(1);
    expect(saveSimuladoSessionMock.mock.calls[0][0].answers).toEqual({ q1: expect.objectContaining({ selectedOption: 'C' }) });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
