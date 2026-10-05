import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Compendium, Discipline, Flashcard, LastReadingSession, Question, QuestionAnswerRecord } from '../../src/types';

// PAINEL-1 — o painel enxuto (3 blocos), os estados vazios e a tela "Meu desempenho"
// com tudo o que saiu dele.

const getAnswers = vi.fn();
const getReadingProgress = vi.fn();
const getErrorLogs = vi.fn();
vi.mock('../../src/repositories/AnswersRepository', () => ({ answersRepository: { getAnswers: () => getAnswers() } }));
vi.mock('../../src/repositories/ReadingProgressRepository', () => ({
  readingProgressRepository: { getReadingProgress: () => getReadingProgress() },
}));
vi.mock('../../src/repositories/ErrorNotebookRepository', () => ({
  errorNotebookRepository: { getErrorLogs: () => getErrorLogs() },
}));
vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', user_metadata: {} }, profile: { displayName: 'Fulana', role: 'student', status: 'active' } }),
}));
// O caderno de erros tem testes próprios; aqui só interessa que a tela o abre.
vi.mock('../../src/components/dashboard/IntegratedCadernoErros', () => ({
  IntegratedCadernoErros: ({ onSwitchToOverview }: { onSwitchToOverview: () => void }) => (
    <div data-testid="caderno-de-erros">
      <button type="button" onClick={onSwitchToOverview}>
        voltar-ao-desempenho
      </button>
    </div>
  ),
}));

const { DashboardView } = await import('../../src/components/dashboard/DashboardView');
const { DesempenhoView } = await import('../../src/components/dashboard/DesempenhoView');

const disciplina = (id: string, name: string): Discipline => ({ id, name }) as Discipline;
const questao = (id: string, disciplineId: string): Question => ({ id, disciplineId, themeId: 't1', questionStem: `Questão ${id}` }) as Question;
const resposta = (questionId: string, isCorrect: boolean, timestamp = new Date().toISOString()): QuestionAnswerRecord => ({
  questionId,
  selectedOption: 'A',
  isCorrect,
  timestamp,
  timeSpentSeconds: 3,
});
const material = (id: string, title: string, secoes: string[] = []): Compendium =>
  ({ id, title, sections: secoes.map((s) => ({ id: s, title: `Seção ${s}` })) }) as unknown as Compendium;
const cartao = (id: string, vencido: boolean): Flashcard =>
  ({
    id,
    tags: [],
    srs: {
      intervalDays: 1,
      repetitionCount: 1,
      easeFactor: 2.5,
      nextDueDate: new Date(Date.now() + (vencido ? -1 : 10) * 86_400_000).toISOString(),
      state: 'review',
      reviewHistory: [],
    },
  }) as unknown as Flashcard;

const disciplinas = [disciplina('cm', 'Clínica Médica'), disciplina('pe', 'Pediatria'), disciplina('ci', 'Cirurgia')];
const questoes = [questao('1', 'cm'), questao('2', 'cm'), questao('3', 'pe'), questao('4', 'pe'), questao('5', 'ci')];
const materiais = [material('a', 'Penicilinas', ['s1', 's2']), material('b', 'Cefalosporinas'), material('c', 'Macrolídeos'), material('d', 'Quinolonas'), material('e', 'Lido por inteiro')];

function renderPainel(props: Partial<React.ComponentProps<typeof DashboardView>> = {}) {
  const handlers = { onSelectView: vi.fn(), onOpenCompendium: vi.fn(), onStartSRS: vi.fn() };
  render(
    <DashboardView
      disciplines={disciplinas}
      questions={questoes}
      compendiums={materiais}
      flashcards={[]}
      lastReadingSession={null}
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; // jsdom não implementa (useScrollMemory)
  getAnswers.mockReset().mockResolvedValue({});
  getReadingProgress.mockReset().mockResolvedValue({});
  getErrorLogs.mockReset().mockResolvedValue([]);
});
afterEach(cleanup);

describe('Painel enxuto (PAINEL-1)', () => {
  const cincoCartoes = [cartao('1', true), cartao('2', true), cartao('3', true), cartao('4', false), cartao('5', false)];

  async function renderComDados(extra: Partial<React.ComponentProps<typeof DashboardView>> = {}) {
    getAnswers.mockResolvedValue({
      '1': resposta('1', true),
      '2': resposta('2', false),
      '3': resposta('3', true),
      '4': resposta('4', true),
    });
    getReadingProgress.mockResolvedValue({
      a: { readSectionIds: ['s1'], percent: 50 },
      b: { readSectionIds: ['x'], percent: 80 },
      c: { readSectionIds: ['x'], percent: 20 },
      d: { readSectionIds: ['x'], percent: 10 },
      e: { readSectionIds: ['x'], percent: 100 },
    });
    const handlers = renderPainel({ flashcards: cincoCartoes, ...extra });
    await screen.findByRole('list', { name: /Percentual de acerto/ });
    return handlers;
  }

  it('tem exatamente 3 blocos, nesta ordem, e nada dos blocos antigos', async () => {
    await renderComDados();
    const blocos = Array.from(document.querySelectorAll('#painel-view section'));
    expect(blocos).toHaveLength(3);
    expect(blocos.map((b) => b.querySelector('h2')?.textContent)).toEqual(['Hoje', 'Acertos por disciplina', 'Continue lendo']);
    expect(blocos.map((b) => b.getAttribute('data-painel-bloco'))).toEqual(['hoje', 'acertos', 'leitura']);

    for (const antigo of [
      /Acurácia Geral/,
      /Ofensiva de Estudo/,
      /Missão Prioritária/,
      /XP/,
      /Nível/,
      /Perfil Cognitivo|Motor de Identidade/,
      /Banca/,
      /Radar de Vulnerabilidades/,
      /Refazer Questões Recentes/,
      /Desafios do Dia/,
      /Circuito de Flashcards/,
      /Medalhas|Conquistas/,
      /Caderno de Erros/,
      /Visão Geral & Desempenho/,
    ]) {
      expect(screen.queryByText(antigo), String(antigo)).toBeNull();
    }
    // O único caminho para o resto é o link do fim.
    expect(screen.getByRole('button', { name: 'Ver meu desempenho' })).toBeTruthy();
  });

  it('Hoje: 3 cartões vencidos de 5 mostram "3", e os botões levam aos mesmos destinos de sempre', async () => {
    const { onSelectView, onStartSRS } = await renderComDados();
    const hoje = screen.getByRole('region', { name: 'Hoje' });
    expect(within(hoje).getByText('3').textContent).toBe('3');
    expect(hoje.querySelector('#painel-cartoes-numero')?.textContent).toBe('3');
    expect(within(hoje).getByText('cartões para revisar')).toBeTruthy();

    fireEvent.click(within(hoje).getByRole('button', { name: 'Revisar cartões' }));
    expect(onStartSRS).toHaveBeenCalledTimes(1);
    fireEvent.click(within(hoje).getByRole('button', { name: 'Fazer questões' }));
    expect(onSelectView).toHaveBeenCalledWith('questions');
    fireEvent.click(screen.getByRole('button', { name: 'Ver meu desempenho' }));
    expect(onSelectView).toHaveBeenCalledWith('desempenho');
  });

  it('Hoje: a sequência de dias vem da atividade real (respostas de hoje e de ontem = 2 dias)', async () => {
    const ontem = new Date(Date.now() - 86_400_000).toISOString();
    getAnswers.mockResolvedValue({ '1': resposta('1', true), '2': resposta('2', true, ontem) });
    renderPainel();
    await waitFor(() => expect(document.getElementById('painel-sequencia-numero')?.textContent).toBe('2'));
    expect(screen.getByText('dias seguidos')).toBeTruthy();
  });

  it('Acertos por disciplina: barras da menor para a maior, só disciplinas com resposta, com o número em cada barra', async () => {
    await renderComDados();
    const itens = within(screen.getByRole('list', { name: /Percentual de acerto/ })).getAllByRole('listitem');
    // Clínica: 1 de 2 = 50%; Pediatria: 2 de 2 = 100%; Cirurgia sem resposta não aparece.
    expect(itens.map((i) => i.textContent)).toEqual(['Clínica Médica50%', 'Pediatria100%']);
    const larguras = Array.from(document.querySelectorAll<HTMLElement>('[data-barra-acerto]')).map((b) => b.style.width);
    expect(larguras).toEqual(['50%', '100%']);
  });

  it('Continue lendo: até 3 materiais iniciados e não concluídos, com progresso, e o clique abre o material', async () => {
    const sessao: LastReadingSession = { compendiumId: 'a', sectionId: 's2', compendiumTitle: 'Penicilinas', updatedAt: 1 };
    const { onOpenCompendium } = await renderComDados({ lastReadingSession: sessao });
    const leitura = screen.getByRole('region', { name: 'Continue lendo' });
    const botoes = within(leitura).getAllByRole('button');
    expect(botoes).toHaveLength(3); // 4 iniciados, um é cortado; o concluído nunca entra
    expect(botoes.map((b) => b.getAttribute('data-material-em-andamento'))).toEqual(['a', 'b', 'c']);
    expect(within(leitura).queryByText('Lido por inteiro')).toBeNull();
    expect(within(leitura).queryByText('Quinolonas')).toBeNull();
    expect(within(leitura).getByRole('progressbar', { name: /Penicilinas/ }).getAttribute('aria-valuenow')).toBe('50');
    expect(within(leitura).getByText('80%')).toBeTruthy();

    fireEvent.click(botoes[0]);
    expect(onOpenCompendium).toHaveBeenCalledWith('a', 's2');
    fireEvent.click(botoes[1]);
    expect(onOpenCompendium).toHaveBeenCalledWith('b', undefined);
  });

  it('usuário novo: cada bloco tem uma frase curta e um botão, e nada quebra', async () => {
    const { onSelectView } = renderPainel({ disciplines: [], questions: [], compendiums: [] });
    await screen.findByText('Nenhum material em andamento');
    expect(screen.getByText('Nenhuma questão respondida ainda')).toBeTruthy();
    expect(screen.getByText('Nenhum cartão para hoje')).toBeTruthy();
    expect(document.getElementById('painel-cartoes-numero')?.textContent).toBe('0');
    expect(screen.getByText('Estude hoje para começar')).toBeTruthy();
    expect(document.querySelectorAll('#painel-view section')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir biblioteca' }));
    expect(onSelectView).toHaveBeenCalledWith('compendiums');
    fireEvent.click(screen.getByRole('button', { name: 'Responder questões' }));
    expect(onSelectView).toHaveBeenCalledWith('questions');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir cartões' }));
    expect(onSelectView).toHaveBeenCalledWith('flashcards');
    expect(screen.queryByRole('button', { name: 'Revisar cartões' })).toBeNull();
  });

  it('se a carga falha, o painel avisa e não afirma que não há questão nem material', async () => {
    getAnswers.mockRejectedValue(new TypeError('Failed to fetch'));
    renderPainel();
    await waitFor(() => expect(screen.getByText(/Sem conexão/)).toBeTruthy());
    expect(screen.queryByText('Nenhuma questão respondida ainda')).toBeNull();
    expect(screen.queryByText('Nenhum material em andamento')).toBeNull();
    expect(document.getElementById('painel-sequencia-numero')?.textContent).toBe('—');
  });
});

describe('Meu desempenho (PAINEL-1)', () => {
  function renderDesempenho(props: Partial<React.ComponentProps<typeof DesempenhoView>> = {}) {
    const handlers = {
      onSelectView: vi.fn(),
      onOpenCompendium: vi.fn(),
      onOpenQuestion: vi.fn(),
      onStartSRS: vi.fn(),
      onTestarOQueLi: vi.fn(),
    };
    render(
      <DesempenhoView
        disciplines={disciplinas}
        themes={[]}
        questions={questoes}
        compendiums={materiais}
        flashcards={[cartao('1', true)]}
        {...handlers}
        {...props}
      />
    );
    return handlers;
  }

  it('reúne o que saiu do painel: nível/XP, KPIs, missão, perfil, banca, especialidades, radar, desafios, SRS e conquistas', async () => {
    getAnswers.mockResolvedValue({ '1': resposta('1', false), '3': resposta('3', true) });
    renderDesempenho();
    expect(screen.getByRole('heading', { level: 1, name: 'Meu desempenho' })).toBeTruthy();
    await screen.findByText('Desempenho por Especialidade Médica');
    for (const texto of [
      /Progresso do Nível/,
      /XP Acumulado/,
      /Acurácia Geral/,
      /Ofensiva de Estudo/,
      /Missão Prioritária de Hoje/,
      /Radar de Vulnerabilidades/,
      /Desafios do Dia/,
      /Circuito de Flashcards/,
      /Medalhas & Conquistas/,
    ]) {
      expect(screen.getAllByText(texto).length, String(texto)).toBeGreaterThan(0);
    }
    expect(screen.getByRole('button', { name: /Caderno de Erros & Metacognição/ })).toBeTruthy();
  });

  it('o caderno de erros continua a um clique, dentro de Meu desempenho', async () => {
    renderDesempenho();
    fireEvent.click(screen.getByRole('button', { name: /Caderno de Erros & Metacognição/ }));
    expect(await screen.findByTestId('caderno-de-erros')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'voltar-ao-desempenho' }));
    expect(await screen.findByText('Desempenho por Especialidade Médica')).toBeTruthy();
  });
});
