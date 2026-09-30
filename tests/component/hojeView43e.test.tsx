import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Compendium, Flashcard, LastReadingSession, Question, QuestionAnswerRecord } from '../../src/types';

// 43-E: a tela "Hoje" — continuar lendo, testar o que li, cards para hoje e o
// aviso de "tudo feito"; e o que ela nunca finge quando a carga falha.

const getLeituras = vi.fn();
const getAnswers = vi.fn();
const getFlashcards = vi.fn();
vi.mock('../../src/repositories/LeiturasRepository', () => ({
  leiturasRepository: { getLeituras: () => getLeituras() },
}));
vi.mock('../../src/repositories/AnswersRepository', () => ({
  answersRepository: { getAnswers: () => getAnswers() },
}));
vi.mock('../../src/repositories/FlashcardsRepository', () => ({
  flashcardsRepository: { getFlashcards: () => getFlashcards() },
}));

const { HojeView } = await import('../../src/components/hoje/HojeView');

const material = (id: string, title: string, sections: string[] = []): Compendium => ({
  id,
  disciplineId: 'd',
  themeId: 't',
  title,
  subtitle: '',
  estimatedReadTimeMinutes: 10,
  lastUpdated: '',
  author: '',
  sections: sections.map((s) => ({ id: s, title: `Seção ${s}`, content: '', keyTakeaways: [] })),
  references: [],
});
const q = (id: string, links: string[]): Question => ({
  id,
  disciplineId: 'd',
  themeId: 't',
  compendiumRefId: links[0] ?? '',
  materialLinks: links.map((m) => ({ materialId: m })),
  cycle: 'clinico',
  difficulty: 'medio',
  institution: '',
  year: 2026,
  clinicalVignette: '',
  questionStem: `Questão ${id}`,
  options: [],
  generalCommentary: '',
  highYieldSummary: '',
  tags: [],
});
const card = (id: string, vencido: boolean): Flashcard => ({
  id,
  disciplineId: 'd',
  themeId: 't',
  front: `frente ${id}`,
  back: `verso ${id}`,
  mechanismHighlight: '',
  tags: [],
  difficulty: 'medio',
  srs: {
    intervalDays: 6,
    repetitionCount: 2,
    easeFactor: 2.5,
    nextDueDate: new Date(Date.now() + (vencido ? -1 : 10) * 24 * 60 * 60 * 1000).toISOString(),
    state: 'review',
    reviewHistory: [],
  },
});
const resposta = (questionId: string, timestamp: string): QuestionAnswerRecord => ({
  questionId,
  selectedOption: 'A',
  isCorrect: true,
  timestamp,
  timeSpentSeconds: 5,
});

const compendiums = [material('a', 'Penicilinas', ['s1', 's2']), material('b', 'Cefalosporinas')];
const questions = [q('1', ['a']), q('2', ['a']), q('3', ['b'])];
const agora = new Date().toISOString();
const ontem = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
const sessao: LastReadingSession = { compendiumId: 'a', sectionId: 's2', compendiumTitle: 'Penicilinas', updatedAt: 1 };

function renderHoje(props: Partial<React.ComponentProps<typeof HojeView>> = {}) {
  const handlers = {
    onResumeReading: vi.fn(),
    onTestarOQueLi: vi.fn(),
    onStartReview: vi.fn(),
    onOpenLibrary: vi.fn(),
  };
  render(
    <HojeView
      compendiums={compendiums}
      questions={questions}
      lastReadingSession={sessao}
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

beforeEach(() => {
  getLeituras.mockReset().mockResolvedValue([]);
  getAnswers.mockReset().mockResolvedValue({});
  getFlashcards.mockReset().mockResolvedValue([]);
});
afterEach(cleanup);

describe('HojeView (43-E)', () => {
  it('mostra as três frentes do dia: continuar lendo, testar o que li e os cards para hoje', async () => {
    getLeituras.mockResolvedValue([{ materialId: 'a', secoesLidas: 1, ultimaLeitura: agora }]);
    getFlashcards.mockResolvedValue([card('c1', true), card('c2', true), card('c3', true), card('c4', false)]);
    renderHoje();

    // Continuar lendo: o último material, na seção onde parou.
    const continuar = screen.getByRole('region', { name: 'Continuar lendo' });
    expect(within(continuar).getByText('Penicilinas')).toBeTruthy();
    expect(within(continuar).getByText(/Seção s2/)).toBeTruthy();

    // Testar o que li: leu A hoje, as 2 questões que cobrem A ainda não foram respondidas.
    const testar = await screen.findByRole('region', { name: 'Testar o que li' });
    expect(within(testar).getByText('2 questões dos materiais que você leu hoje')).toBeTruthy();

    // Cards para hoje: 3 vencidos (o quarto só vence daqui a dias).
    const cards = screen.getByRole('region', { name: 'Cards para hoje' });
    expect(within(cards).getByText('3 cards para hoje')).toBeTruthy();

    expect(screen.queryByText(/Tudo feito/)).toBeNull();
  });

  it('o botão de continuar lendo abre o material na seção onde parou', () => {
    const h = renderHoje();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar lendo' }));
    expect(h.onResumeReading).toHaveBeenCalledWith('a', 's2');
  });

  it('o botão de testar abre o "Testar o que li"', async () => {
    getLeituras.mockResolvedValue([{ materialId: 'a', secoesLidas: 1, ultimaLeitura: agora }]);
    const h = renderHoje();
    fireEvent.click(await screen.findByRole('button', { name: 'Testar o que li' }));
    expect(h.onTestarOQueLi).toHaveBeenCalledTimes(1);
  });

  it('o botão dos cards abre a revisão só com os cards vencidos', async () => {
    getFlashcards.mockResolvedValue([card('c1', true), card('c2', false), card('c3', true)]);
    const h = renderHoje();
    fireEvent.click(await screen.findByRole('button', { name: 'Revisar 2 cards' }));
    expect(h.onStartReview).toHaveBeenCalledTimes(1);
    expect(h.onStartReview.mock.calls[0][0].map((c: Flashcard) => c.id)).toEqual(['c1', 'c3']);
  });

  it('usa o singular com um card e uma questão', async () => {
    getLeituras.mockResolvedValue([{ materialId: 'b', secoesLidas: 1, ultimaLeitura: agora }]);
    getFlashcards.mockResolvedValue([card('c1', true)]);
    renderHoje();
    expect(await screen.findByText('1 questão dos materiais que você leu hoje')).toBeTruthy();
    expect(screen.getByText('1 card para hoje')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Revisar 1 card' })).toBeTruthy();
  });

  it('com tudo feito no dia, a tela diz isso e some com os botões de tarefa', async () => {
    getLeituras.mockResolvedValue([{ materialId: 'a', secoesLidas: 1, ultimaLeitura: agora }]);
    getAnswers.mockResolvedValue({ '1': resposta('1', agora), '2': resposta('2', agora) });
    getFlashcards.mockResolvedValue([card('c1', false)]);
    renderHoje();

    expect(await screen.findByText('Tudo feito por hoje')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Testar o que li' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Revisar \d+ card/ })).toBeNull();
    // A leitura continua disponível: retomar não é pendência.
    expect(screen.getByRole('button', { name: 'Continuar lendo' })).toBeTruthy();
  });

  it('resposta de ontem não conta como testado: o teste continua pendente', async () => {
    getLeituras.mockResolvedValue([{ materialId: 'a', secoesLidas: 1, ultimaLeitura: agora }]);
    getAnswers.mockResolvedValue({ '1': resposta('1', ontem), '2': resposta('2', agora) });
    renderHoje();
    expect(await screen.findByText('1 questão dos materiais que você leu hoje')).toBeTruthy();
    expect(screen.queryByText(/Tudo feito/)).toBeNull();
  });

  it('leu só o que nenhuma questão cobre: não há o que testar, e a tela diz que está tudo feito', async () => {
    getLeituras.mockResolvedValue([{ materialId: 'a', secoesLidas: 1, ultimaLeitura: agora }]);
    renderHoje({ questions: [q('9', ['b'])] });
    expect(await screen.findByText('Tudo feito por hoje')).toBeTruthy();
  });

  it('sem nada lido, sem cards e sem sessão de leitura: diz que está tudo feito e oferece a biblioteca', async () => {
    const h = renderHoje({ lastReadingSession: null });
    expect(await screen.findByText('Tudo feito por hoje')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Continuar lendo' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir a biblioteca' }));
    expect(h.onOpenLibrary).toHaveBeenCalledTimes(1);
  });

  it('material da última leitura que o estudante já não vê: não oferece continuar', async () => {
    renderHoje({ lastReadingSession: { ...sessao, compendiumId: 'despublicado' } });
    await screen.findByText('Tudo feito por hoje');
    expect(screen.queryByRole('button', { name: 'Continuar lendo' })).toBeNull();
  });

  it('enquanto carrega, não afirma que está tudo feito', async () => {
    let resolver: (v: unknown[]) => void = () => undefined;
    getLeituras.mockReturnValue(new Promise((r) => (resolver = r)));
    renderHoje();
    expect(screen.getByText(/Carregando/)).toBeTruthy();
    expect(screen.queryByText(/Tudo feito/)).toBeNull();
    resolver([]);
    expect(await screen.findByText('Tudo feito por hoje')).toBeTruthy();
  });

  it('sem conexão: avisa e nunca diz que está tudo feito', async () => {
    getLeituras.mockRejectedValue(new TypeError('Failed to fetch'));
    renderHoje();
    expect(await screen.findByText(/Sem conexão/)).toBeTruthy();
    await waitFor(() => expect(getLeituras).toHaveBeenCalled());
    expect(screen.queryByText(/Tudo feito/)).toBeNull();
    // O que não depende do servidor continua ali.
    expect(screen.getByRole('button', { name: 'Continuar lendo' })).toBeTruthy();
  });

  it('falha em qualquer das três cargas: não mostra parte do dia como se fosse o dia inteiro', async () => {
    getFlashcards.mockRejectedValue(new TypeError('Failed to fetch'));
    getLeituras.mockResolvedValue([{ materialId: 'a', secoesLidas: 1, ultimaLeitura: agora }]);
    renderHoje();
    expect(await screen.findByText(/Sem conexão/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Testar o que li' })).toBeNull();
    expect(screen.queryByText(/Tudo feito/)).toBeNull();
  });
});
