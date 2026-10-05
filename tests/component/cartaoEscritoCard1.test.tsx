import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Question, QuestionReviewResult } from '../../src/types';

// CARD-1: o diálogo "Criar cartão" (Frente, Verso, Salvar, Cancelar) e o botão nas questões respondidas.
// - diálogo: role/aria, foco na Frente, Esc, Salvar desligado com campo vazio, texto exatamente como digitado,
//   falha mantém o diálogo aberto e o reenvio usa o MESMO id (idempotência), clique duplo envia uma vez;
// - questões: "Criar cartão" só depois de responder (inclusive questão acertada), ligado à questão.

vi.mock('../../src/components/feedback/ContextualFeedbackPopover', () => ({
  ContextualFeedbackPopover: () => null,
}));
vi.mock('../../src/repositories/AnswersRepository', () => ({
  answersRepository: { getAnswers: vi.fn().mockResolvedValue({}), recordAnswer: vi.fn() },
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
    createWrittenFlashcard: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock('../../src/services/gamification', () => ({
  GamificationService: { triggerCelebration: vi.fn() },
  CELEBRATION_STREAK_LENGTH: 5,
}));

const { CriarCartao } = await import('../../src/components/flashcards/CriarCartao');
const { QuestionCard } = await import('../../src/components/questions/QuestionCard');
const { flashcardsRepository } = await import('../../src/repositories/FlashcardsRepository');

const criarMock = vi.mocked(flashcardsRepository.createWrittenFlashcard);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  criarMock.mockResolvedValue({} as never);
});

const origemDaSecao = { disciplineId: 'd-1', themeId: 't-1', materialId: 'mat-1', sectionId: 'sec-1', tags: ['Nefrologia'] };

function abrir(onCriado = vi.fn(), origem = origemDaSecao) {
  render(<CriarCartao origem={origem} onCriado={onCriado} />);
  fireEvent.click(screen.getByRole('button', { name: 'Criar cartão' }));
  return { onCriado, dialogo: screen.getByRole('dialog') };
}

describe('CriarCartao — o diálogo', () => {
  it('é um diálogo acessível com exatamente dois campos (Frente e Verso) e os botões Salvar e Cancelar', () => {
    const { dialogo } = abrir();

    expect(dialogo.getAttribute('aria-modal')).toBe('true');
    const titulo = document.getElementById(dialogo.getAttribute('aria-labelledby')!);
    expect(titulo?.textContent).toBe('Novo cartão');

    const campos = within(dialogo).getAllByRole('textbox');
    expect(campos.map((c) => c.getAttribute('id'))).toHaveLength(2);
    expect(within(dialogo).getByRole('textbox', { name: 'Frente' })).toBeTruthy();
    expect(within(dialogo).getByRole('textbox', { name: 'Verso' })).toBeTruthy();
    expect(within(dialogo).getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancelar', 'Salvar']);
  });

  it('abre com o foco no campo Frente', () => {
    const { dialogo } = abrir();
    expect(document.activeElement).toBe(within(dialogo).getByRole('textbox', { name: 'Frente' }));
  });

  it('cabe numa tela de 360 px: largura própria limitada à da tela, sem rolagem lateral no diálogo', () => {
    const { dialogo } = abrir();
    expect(dialogo.className).toContain('w-full');
    expect(dialogo.className).toContain('max-w-md');
    expect(dialogo.className).toContain('overflow-x-hidden');
    for (const campo of within(dialogo).getAllByRole('textbox')) expect(campo.className).toContain('min-w-0');
  });

  it('Esc fecha o diálogo, sem criar nada', () => {
    abrir();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(criarMock).not.toHaveBeenCalled();
  });

  it('Salvar fica desligado com a frente ou o verso vazios (ou só espaços)', () => {
    const { dialogo } = abrir();
    const salvar = within(dialogo).getByRole('button', { name: 'Salvar' }) as HTMLButtonElement;
    const frente = within(dialogo).getByRole('textbox', { name: 'Frente' });
    const verso = within(dialogo).getByRole('textbox', { name: 'Verso' });

    expect(salvar.disabled).toBe(true);
    fireEvent.change(frente, { target: { value: 'Pergunta' } });
    expect(salvar.disabled).toBe(true);
    fireEvent.change(verso, { target: { value: '   ' } });
    expect(salvar.disabled).toBe(true);
    fireEvent.change(verso, { target: { value: 'Resposta' } });
    expect(salvar.disabled).toBe(false);
    fireEvent.change(frente, { target: { value: '' } });
    expect(salvar.disabled).toBe(true);
  });

  it('salva frente e verso exatamente como digitados, ligados à seção, e avisa quem chamou', async () => {
    const { dialogo, onCriado } = abrir();
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Frente' }), { target: { value: 'Frente do aluno' } });
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Verso' }), { target: { value: 'Verso do aluno\nsegunda linha' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onCriado).toHaveBeenCalledTimes(1));
    expect(criarMock).toHaveBeenCalledTimes(1);
    const cartao = criarMock.mock.calls[0][0];
    expect(cartao.front).toBe('Frente do aluno');
    expect(cartao.back).toBe('Verso do aluno\nsegunda linha');
    expect(cartao).toMatchObject({
      disciplineId: 'd-1',
      themeId: 't-1',
      compendiumRefId: 'mat-1',
      compendiumSectionId: 'sec-1',
      mechanismHighlight: '',
      isWritten: true,
      isCustom: true,
      tags: ['Nefrologia'],
    });
    expect(cartao.questionOriginId).toBeUndefined();
    expect(cartao.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('falha ao salvar: avisa, mantém o diálogo e o texto, e a nova tentativa reenvia o MESMO id', async () => {
    criarMock.mockRejectedValueOnce(new Error('sem rede'));
    const { dialogo, onCriado } = abrir();
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Frente' }), { target: { value: 'F' } });
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Verso' }), { target: { value: 'V' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onCriado).not.toHaveBeenCalled();
    expect((within(dialogo).getByRole('textbox', { name: 'Frente' }) as HTMLTextAreaElement).value).toBe('F');

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(onCriado).toHaveBeenCalledTimes(1));
    expect(criarMock).toHaveBeenCalledTimes(2);
    expect(criarMock.mock.calls[1][0].id).toBe(criarMock.mock.calls[0][0].id);
  });

  it('dois cliques seguidos em Salvar enviam um só cartão', async () => {
    let resolver: (v: never) => void = () => {};
    criarMock.mockReturnValueOnce(new Promise((r) => (resolver = r as never)));
    const { dialogo, onCriado } = abrir();
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Frente' }), { target: { value: 'F' } });
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Verso' }), { target: { value: 'V' } });
    const salvar = within(dialogo).getByRole('button', { name: 'Salvar' });
    fireEvent.click(salvar);
    fireEvent.click(salvar);
    resolver({} as never);

    await waitFor(() => expect(onCriado).toHaveBeenCalledTimes(1));
    expect(criarMock).toHaveBeenCalledTimes(1);
  });
});

// ----------------------------------------------------------------------------
// Questões
// ----------------------------------------------------------------------------

const questao: Question = {
  id: 'q-card1',
  disciplineId: 'disc-nefro',
  themeId: 'tema-tfg',
  compendiumRefId: 'mat-1',
  compendiumSectionId: 'sec-1',
  cycle: 'internato_residencia',
  difficulty: 'medio',
  institution: 'ENARE',
  year: 2025,
  clinicalVignette: 'Paciente com DRC.',
  questionStem: 'Qual o corte da TFG?',
  options: [
    { letter: 'A', text: '60', isCorrect: true, explanation: 'Certa.' },
    { letter: 'B', text: '90', isCorrect: false, explanation: 'Errada.' },
  ],
  generalCommentary: 'Comentário.',
  highYieldSummary: 'Pérola.',
  tags: [],
};

function revisao(certa: boolean): QuestionReviewResult {
  return {
    isCorrect: certa,
    correctOptionId: 'A',
    generalCommentary: 'Comentário.',
    highYieldSummary: 'Pérola.',
    options: [
      { optionId: 'A', letter: 'A', isCorrect: true, explanation: 'Certa.' },
      { optionId: 'B', letter: 'B', isCorrect: false, explanation: 'Errada.' },
    ],
    references: [],
  };
}

function renderQuestao(resposta: 'A' | 'B' | null) {
  getQuestionReviewMock.mockResolvedValue(revisao(resposta === 'A'));
  return render(
    <QuestionCard
      question={questao}
      onOpenCompendium={() => {}}
      hydrated={{
        answer: resposta
          ? { questionId: questao.id, selectedOption: resposta, isCorrect: resposta === 'A', timestamp: new Date().toISOString(), timeSpentSeconds: 9 }
          : null,
        bookmarked: false,
        reaction: null,
      }}
    />
  );
}

describe('QuestionCard — Criar cartão (CARD-1)', () => {
  it('antes de responder não aparece', async () => {
    renderQuestao(null);
    expect(await screen.findByText('Qual o corte da TFG?')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Criar cartão' })).toBeNull();
  });

  it.each([
    ['acertada', 'A'],
    ['errada', 'B'],
  ] as const)('questão %s: aparece e o cartão sai ligado à questão (e ao material e à seção dela)', async (_nome, resposta) => {
    renderQuestao(resposta);
    fireEvent.click(await screen.findByRole('button', { name: 'Criar cartão' }));
    const dialogo = screen.getByRole('dialog');
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Frente' }), { target: { value: 'TFG da DRC?' } });
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Verso' }), { target: { value: '< 60 por 3 meses' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Cartão criado')).toBeTruthy();
    expect(criarMock).toHaveBeenCalledTimes(1);
    expect(criarMock.mock.calls[0][0]).toMatchObject({
      disciplineId: 'disc-nefro',
      themeId: 'tema-tfg',
      compendiumRefId: 'mat-1',
      compendiumSectionId: 'sec-1',
      questionOriginId: 'q-card1',
      front: 'TFG da DRC?',
      back: '< 60 por 3 meses',
      isWritten: true,
    });
    // O cartão automático do erro é outro caminho: este botão não o cria.
    expect(flashcardsRepository.createFlashcardFromQuestion).not.toHaveBeenCalled();
  });
});
