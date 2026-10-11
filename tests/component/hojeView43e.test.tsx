import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Compendium, LastReadingSession, Question, QuestionAnswerRecord } from '../../src/types';

// 43-E: a tela "Hoje" — continuar lendo, testar o que li e o aviso de "tudo
// feito"; e o que ela nunca finge quando a carga falha. CORTE-1 (D-14): sem cards.

const getLeituras = vi.fn();
const getAnswers = vi.fn();
vi.mock('../../src/repositories/LeiturasRepository', () => ({
  leiturasRepository: { getLeituras: () => getLeituras() },
}));
vi.mock('../../src/repositories/AnswersRepository', () => ({
  answersRepository: { getAnswers: () => getAnswers() },
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
    onOpenLibrary: vi.fn(),
  };
  render(
    <HojeView
      compendiums={compendiums}
      questions={questions}
      lastReadingSession={sessao}
      dataReady
      dataStatus="ok"
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

beforeEach(() => {
  getLeituras.mockReset().mockResolvedValue([]);
  getAnswers.mockReset().mockResolvedValue({});
});
afterEach(cleanup);

describe('HojeView (43-E)', () => {
  it('mostra as duas frentes do dia: continuar lendo e testar o que li, sem cards', async () => {
    getLeituras.mockResolvedValue([{ materialId: 'a', secoesLidas: 1, ultimaLeitura: agora }]);
    renderHoje();

    // Continuar lendo: o último material, na seção onde parou.
    const continuar = screen.getByRole('region', { name: 'Continuar lendo' });
    expect(within(continuar).getByText('Penicilinas')).toBeTruthy();
    expect(within(continuar).getByText(/Seção s2/)).toBeTruthy();

    // Testar o que li: leu A hoje, as 2 questões que cobrem A ainda não foram respondidas.
    const testar = await screen.findByRole('region', { name: 'Testar o que li' });
    expect(within(testar).getByText('2 questões dos materiais que você leu hoje')).toBeTruthy();

    // CORTE-1: nada de cards vencidos nesta tela.
    expect(screen.queryByRole('region', { name: /Cards/ })).toBeNull();
    expect(screen.queryByText(/\bcards?\b/i)).toBeNull();

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

  it('usa o singular com uma questão', async () => {
    getLeituras.mockResolvedValue([{ materialId: 'b', secoesLidas: 1, ultimaLeitura: agora }]);
    renderHoje();
    expect(await screen.findByText('1 questão dos materiais que você leu hoje')).toBeTruthy();
  });

  it('com tudo feito no dia, a tela diz isso e some com os botões de tarefa', async () => {
    getLeituras.mockResolvedValue([{ materialId: 'a', secoesLidas: 1, ultimaLeitura: agora }]);
    getAnswers.mockResolvedValue({ '1': resposta('1', agora), '2': resposta('2', agora) });
    renderHoje();

    expect(await screen.findByText('Tudo feito por hoje')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Testar o que li' })).toBeNull();
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

  it('sem nada lido e sem sessão de leitura: diz que está tudo feito e oferece a biblioteca', async () => {
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

  it('falha em qualquer das cargas: não mostra parte do dia como se fosse o dia inteiro', async () => {
    getAnswers.mockRejectedValue(new TypeError('Failed to fetch'));
    getLeituras.mockResolvedValue([{ materialId: 'a', secoesLidas: 1, ultimaLeitura: agora }]);
    renderHoje();
    expect(await screen.findByText(/Sem conexão/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Testar o que li' })).toBeNull();
    expect(screen.queryByText(/Tudo feito/)).toBeNull();
  });

  // Questões e materiais vêm do App: sem eles prontos, lista vazia não é "nada a fazer".
  it('dados do App com falha (sem questões nem materiais): não afirma "tudo feito" e avisa a conexão', async () => {
    getLeituras.mockResolvedValue([{ materialId: 'a', secoesLidas: 1, ultimaLeitura: agora }]);
    renderHoje({ questions: [], compendiums: [], lastReadingSession: null, dataReady: false, dataStatus: 'error' });
    expect(await screen.findByText(/Não foi possível carregar/)).toBeTruthy();
    await waitFor(() => expect(getAnswers).toHaveBeenCalled());
    // Dá tempo de as cargas da própria tela terminarem.
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/Tudo feito/)).toBeNull();
    expect(screen.queryByRole('region', { name: 'Testar o que li' })).toBeNull();
  });

  it('dados do App ainda carregando: mostra carregando, sem "tudo feito"; quando chegam, calcula', async () => {
    getLeituras.mockResolvedValue([{ materialId: 'a', secoesLidas: 1, ultimaLeitura: agora }]);
    const props = {
      compendiums: [] as Compendium[],
      questions: [] as Question[],
      lastReadingSession: null,
      onResumeReading: vi.fn(),
      onTestarOQueLi: vi.fn(),
      onOpenLibrary: vi.fn(),
    };
    const { rerender } = render(<HojeView {...props} dataReady={false} dataStatus="ok" />);
    await waitFor(() => expect(getAnswers).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText(/Carregando/)).toBeTruthy();
    expect(screen.queryByText(/Tudo feito/)).toBeNull();

    rerender(<HojeView {...props} compendiums={compendiums} questions={questions} dataReady dataStatus="ok" />);
    expect(await screen.findByText('2 questões dos materiais que você leu hoje')).toBeTruthy();
    expect(screen.queryByText(/Carregando/)).toBeNull();
  });
});
