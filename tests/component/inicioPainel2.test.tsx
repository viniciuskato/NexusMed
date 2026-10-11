import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Compendium, Discipline, LastReadingSession, Question, QuestionAnswerRecord } from '../../src/types';

// PAINEL-2 (D-14) — o Início: os cinco blocos, com números calculados à mão, os estados vazios e o
// que acontece quando a carga falha (nenhum bloco afirma "0").

const getAnswers = vi.fn();
const getReadingProgress = vi.fn();
vi.mock('../../src/repositories/AnswersRepository', () => ({ answersRepository: { getAnswers: () => getAnswers() } }));
vi.mock('../../src/repositories/ReadingProgressRepository', () => ({
  readingProgressRepository: { getReadingProgress: () => getReadingProgress() },
}));

const { DashboardView } = await import('../../src/components/dashboard/DashboardView');

const TEXTO_VAZIO = 'Ainda não há questões de residência publicadas.';

const disciplinas = [{ id: 'cm', name: 'Clínica Médica' }, { id: 'pe', name: 'Pediatria' }] as Discipline[];
const questao = (id: string, disciplineId: string, institution: string): Question =>
  ({ id, disciplineId, institution, year: 2024, themeId: 't1', questionStem: `Questão ${id}` }) as Question;
const material = (id: string, disciplineId: string, secoes: number): Compendium =>
  ({
    id,
    disciplineId,
    title: `Material ${id.toUpperCase()}`,
    sections: Array.from({ length: secoes }, (_, i) => ({ id: `${id}${i + 1}`, title: `Seção ${id}${i + 1}` })),
  }) as unknown as Compendium;

// Domingo, 11/10/2026, meio-dia: a semana atual começa na segunda 05/10.
const AGORA = new Date(2026, 9, 11, 12, 0);
const resposta = (questionId: string, isCorrect: boolean, mes: number, dia: number): QuestionAnswerRecord => ({
  questionId,
  selectedOption: 'A',
  isCorrect,
  timestamp: new Date(2026, mes - 1, dia, 10, 0).toISOString(),
  timeSpentSeconds: 3,
});

// 7 questões de residência, 2 bancas, 2 disciplinas, respostas em 3 semanas (contas à mão no teste).
const questoes = [
  questao('r1', 'cm', 'ENARE'),
  questao('r2', 'cm', 'ENARE'),
  questao('r3', 'pe', 'USP'),
  questao('r4', 'pe', 'USP'),
  questao('r5', 'cm', 'USP'),
  questao('r6', 'pe', 'ENARE'),
  questao('r7', 'pe', 'USP'),
  questao('r8', 'cm', 'ENARE'), // sem resposta
];
const respostas = {
  r1: resposta('r1', true, 10, 6), // semana de 05/10
  r2: resposta('r2', false, 10, 7), // semana de 05/10
  r3: resposta('r3', true, 9, 29), // semana de 28/09
  r4: resposta('r4', false, 9, 30), // semana de 28/09
  r5: resposta('r5', true, 9, 15), // semana de 14/09
  r6: resposta('r6', false, 10, 8), // semana de 05/10
  r7: resposta('r7', true, 9, 30), // semana de 28/09
  // resposta antiga a questão de fora da residência: não entra em conta nenhuma
  estudo1: resposta('estudo1', false, 10, 9),
};

// Leitura: A 0 de 4 (0%), B 2 de 4 (50%), C 2 de 2 (100%).
const materiais = [material('a', 'cm', 4), material('b', 'cm', 4), material('c', 'pe', 2)];
const progresso = {
  b: { readSectionIds: ['b1', 'b2'], percent: 50 },
  c: { readSectionIds: ['c1', 'c2'], percent: 100 },
};
const sessao: LastReadingSession = { compendiumId: 'b', sectionId: 'b3', compendiumTitle: 'Material B', updatedAt: 1 };

function renderInicio(props: Partial<React.ComponentProps<typeof DashboardView>> = {}) {
  const handlers = {
    onSelectView: vi.fn(),
    onOpenCompendium: vi.fn(),
    onTestarOQueLi: vi.fn(),
  };
  render(
    <DashboardView
      disciplines={disciplinas}
      questions={questoes}
      compendiums={materiais}
      lastReadingSession={sessao}
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

const bloco = (nome: string) => document.querySelector(`[data-painel-bloco="${nome}"]`) as HTMLElement;
const esperarCarga = () => screen.findByText(/Você leu/);

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; // jsdom não implementa (useScrollMemory)
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AGORA);
  getAnswers.mockReset().mockResolvedValue(respostas);
  getReadingProgress.mockReset().mockResolvedValue(progresso);
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('Início — estrutura', () => {
  it('um título "Início" e os cinco blocos, nesta ordem, com os títulos exatos', async () => {
    renderInicio();
    await esperarCarga();
    expect(screen.getByRole('heading', { level: 1, name: 'Início' })).toBeTruthy();
    const secoes = Array.from(document.querySelectorAll('#painel-view [data-painel-bloco]'));
    expect(secoes.map((s) => s.getAttribute('data-painel-bloco'))).toEqual(['continuar', 'leitura', 'questoes', 'erros', 'atalhos']);
    expect(secoes.slice(0, 4).map((s) => s.querySelector('h2')?.textContent)).toEqual([
      'Continuar lendo',
      'Minha leitura',
      'Questões de residência',
      'Erros para revisar',
    ]);
  });

  it('não traz mais o que sobrou do painel antigo: Missão, perfil cognitivo, Passagem de Plantão, KPIs, "Hoje", "Meu desempenho"', async () => {
    renderInicio();
    await esperarCarga();
    const texto = document.getElementById('painel-view')?.textContent ?? '';
    expect(texto).not.toMatch(/Missão|Perfil Cognitivo|Passagem de Plant|Acurácia|Meu desempenho|Ver meu desempenho/i);
    expect(screen.queryByRole('heading', { name: 'Hoje' })).toBeNull();
    expect(texto).not.toMatch(/card|cartão|cartões|XP|ofensiva/i);
  });
});

describe('Início — 1. Continuar lendo', () => {
  it('mostra o último material e a seção, e o botão abre no ponto onde parou', async () => {
    const { onOpenCompendium } = renderInicio({
      lastReadingSession: sessao,
      compendiums: [
        material('a', 'cm', 4),
        { ...material('b', 'cm', 4), sections: [{ id: 'b3', title: 'Terceira seção' }] } as unknown as Compendium,
      ],
    });
    const bl = bloco('continuar');
    expect(within(bl).getByText('Material B')).toBeTruthy();
    expect(within(bl).getByText('Você parou em: Terceira seção')).toBeTruthy();
    fireEvent.click(within(bl).getByRole('button', { name: /Continuar de onde parei/ }));
    expect(onOpenCompendium).toHaveBeenCalledWith('b', 'b3');
  });

  it('sem leitura, o bloco some; material que o estudante já não vê também não é oferecido', async () => {
    renderInicio({ lastReadingSession: null });
    await esperarCarga();
    expect(bloco('continuar')).toBeNull();
    cleanup();
    renderInicio({ lastReadingSession: { ...sessao, compendiumId: 'despublicado' } });
    await esperarCarga();
    expect(bloco('continuar')).toBeNull();
  });
});

describe('Início — 2. Minha leitura', () => {
  it('"Você leu 4 de 10 partes", barra por disciplina e estado de cada material', async () => {
    renderInicio();
    expect((await esperarCarga()).textContent).toBe('Você leu 4 de 10 partes');
    const disciplinasDaLeitura = Array.from(document.querySelectorAll('[data-leitura-disciplina]'));
    expect(disciplinasDaLeitura.map((li) => li.textContent)).toEqual([
      'Clínica Médica25%2 de 8 partes',
      'Pediatria100%2 de 2 partes',
    ]);
    expect(
      within(bloco('leitura'))
        .getAllByRole('progressbar')
        .map((b) => b.getAttribute('aria-valuenow'))
    ).toEqual(['40', '25', '100']);

    const estados = Array.from(document.querySelectorAll('[data-material-leitura]')).map((b) => [
      b.querySelector('span')?.textContent,
      b.querySelector('[data-estado-leitura]')?.textContent,
    ]);
    expect(estados).toEqual([
      ['Material A', 'Não comecei'],
      ['Material B', 'Lendo — 50%'],
      ['Material C', 'Lido'],
    ]);
  });

  it('cada material é um botão que o abre', async () => {
    const { onOpenCompendium } = renderInicio({ lastReadingSession: null });
    await esperarCarga();
    fireEvent.click(within(bloco('leitura')).getByRole('button', { name: /Material C/ }));
    expect(onOpenCompendium).toHaveBeenCalledWith('c');
  });

  it('filtro "Falta ler" esconde o que já foi lido; "Todos" traz de volta', async () => {
    renderInicio({ lastReadingSession: null });
    await esperarCarga();
    const bl = bloco('leitura');
    const lista = () => Array.from(bl.querySelectorAll('[data-material-leitura]')).map((b) => b.getAttribute('data-material-leitura'));
    expect(lista()).toEqual(['a', 'b', 'c']);

    fireEvent.click(within(bl).getByRole('button', { name: 'Falta ler' }));
    expect(within(bl).getByRole('button', { name: 'Falta ler' }).getAttribute('aria-pressed')).toBe('true');
    expect(lista()).toEqual(['a', 'b']);
    // O grupo de Pediatria some junto, sem título solto.
    expect(bl.querySelector('[data-leitura-grupo="pe"]')).toBeNull();

    fireEvent.click(within(bl).getByRole('button', { name: 'Todos' }));
    expect(lista()).toEqual(['a', 'b', 'c']);
  });

  it('tudo lido: "Falta ler" avisa que não sobrou nada', async () => {
    getReadingProgress.mockResolvedValue({ c: progresso.c });
    renderInicio({ lastReadingSession: null, compendiums: [material('c', 'pe', 2)] });
    await esperarCarga();
    fireEvent.click(screen.getByRole('button', { name: 'Falta ler' }));
    expect(screen.getByText('Você já leu todos os materiais publicados.')).toBeTruthy();
  });

  it('sem material publicado: diz isso, sem "0 de 0"', async () => {
    renderInicio({ compendiums: [], lastReadingSession: null });
    expect(await screen.findByText('Ainda não há materiais publicados.')).toBeTruthy();
    expect(screen.queryByText(/Você leu/)).toBeNull();
  });
});

describe('Início — 3. Questões de residência', () => {
  it('acerto geral, por disciplina, por banca e evolução, com os números certos', async () => {
    renderInicio();
    await esperarCarga();
    // 4 certas (r1, r3, r5, r7) em 7 respondidas = 57%; a resposta a questão de fora não conta.
    expect(document.getElementById('painel-acerto-geral')?.textContent).toBe('57%');
    expect(document.getElementById('painel-respondidas')?.textContent).toBe('7 respondidas');

    // Disciplina: Pediatria 2 de 4 = 50% (vem primeiro, é a menor), Clínica Médica 2 de 3 = 67%.
    const porDisciplina = Array.from(document.querySelectorAll('[data-acerto-disciplina]')).map((li) => li.textContent);
    expect(porDisciplina).toEqual(['Pediatria50%4 respondidas', 'Clínica Médica67%3 respondidas']);

    // Banca: USP 3 de 4 = 75% (4 respondidas), ENARE 1 de 3 = 33% (3 respondidas).
    const porBanca = Array.from(document.querySelectorAll('[data-acerto-banca]')).map((li) => li.textContent);
    expect(porBanca).toEqual(['USP4 respondidas75%', 'ENARE3 respondidas33%']);

    // Evolução: 8 semanas; 14/09 = 100% (r5), 21/09 vazia, 28/09 = 2 de 3 = 67%, 05/10 = 1 de 3 = 33%.
    const semanas = Array.from(document.querySelectorAll('#painel-evolucao [data-semana]'));
    expect(semanas).toHaveLength(8);
    expect(semanas.map((li) => li.getAttribute('aria-label'))).toEqual([
      'Semana de 17/08: sem respostas',
      'Semana de 24/08: sem respostas',
      'Semana de 31/08: sem respostas',
      'Semana de 07/09: sem respostas',
      'Semana de 14/09: 100% de acerto em 1 respondida',
      'Semana de 21/09: sem respostas',
      'Semana de 28/09: 67% de acerto em 3 respondidas',
      'Semana de 05/10: 33% de acerto em 3 respondidas',
    ]);
    // Semana sem resposta aparece vazia (tracejada), não como 0%.
    expect(document.querySelectorAll('#painel-evolucao [data-semana-vazia]')).toHaveLength(5);
    expect(document.getElementById('painel-evolucao')?.textContent).not.toMatch(/(^|\D)0%/);
  });

  it('sem questão de residência publicada: o texto do estado vazio, sem zeros; o admin ganha "Importar questões"', async () => {
    const importar = vi.fn();
    renderInicio({ questions: [], onImportarQuestoes: importar });
    expect(await screen.findByText(TEXTO_VAZIO)).toBeTruthy();
    expect(document.getElementById('painel-acerto-geral')).toBeNull();
    fireEvent.click(within(bloco('questoes')).getByRole('button', { name: 'Importar questões' }));
    expect(importar).toHaveBeenCalledTimes(1);
  });

  it('quem não é admin não vê "Importar questões"', async () => {
    renderInicio({ questions: [] });
    expect(await screen.findByText(TEXTO_VAZIO)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Importar questões' })).toBeNull();
  });

  it('com questões mas nenhuma resposta: diz "Nenhuma questão respondida ainda" e leva às questões', async () => {
    getAnswers.mockResolvedValue({ estudo1: respostas.estudo1 });
    const { onSelectView } = renderInicio();
    expect(await screen.findByText('Nenhuma questão respondida ainda')).toBeTruthy();
    fireEvent.click(within(bloco('questoes')).getByRole('button', { name: 'Responder questões' }));
    expect(onSelectView).toHaveBeenCalledWith('questions');
  });
});

describe('Início — 4. Erros para revisar', () => {
  it('conta só os erros em questões de residência (3: r2, r4, r6) e abre o caderno de erros', async () => {
    const { onSelectView } = renderInicio();
    await esperarCarga();
    const bl = bloco('erros');
    expect(within(bl).getByText('3 erros em questões de residência')).toBeTruthy();
    fireEvent.click(within(bl).getByRole('button', { name: 'Abrir caderno de erros' }));
    expect(onSelectView).toHaveBeenCalledWith('errors');
  });

  it('1 erro no singular; nenhum erro diz "Nenhum erro para revisar." e o caderno continua acessível', async () => {
    getAnswers.mockResolvedValue({ r1: respostas.r1, r2: respostas.r2 });
    renderInicio();
    await esperarCarga();
    expect(within(bloco('erros')).getByText('1 erro em questões de residência')).toBeTruthy();
    cleanup();

    getAnswers.mockResolvedValue({ r1: respostas.r1 });
    renderInicio();
    await esperarCarga();
    expect(within(bloco('erros')).getByText('Nenhum erro para revisar.')).toBeTruthy();
    expect(within(bloco('erros')).getByRole('button', { name: 'Abrir caderno de erros' })).toBeTruthy();
  });
});

describe('Início — 5. Atalhos', () => {
  it('"Testar o que li", "Fazer questões" e "Simulado" levam aos destinos de sempre', async () => {
    const { onSelectView, onTestarOQueLi } = renderInicio();
    await esperarCarga();
    const bl = bloco('atalhos');
    fireEvent.click(within(bl).getByRole('button', { name: 'Testar o que li' }));
    expect(onTestarOQueLi).toHaveBeenCalledTimes(1);
    fireEvent.click(within(bl).getByRole('button', { name: 'Fazer questões' }));
    expect(onSelectView).toHaveBeenLastCalledWith('questions');
    fireEvent.click(within(bl).getByRole('button', { name: 'Simulado' }));
    expect(onSelectView).toHaveBeenLastCalledWith('simulados');
  });
});

describe('Início — carga que falha ou que ainda não veio (D-2)', () => {
  it('sem conexão: o aviso aparece e nenhum bloco afirma número, nem "0"', async () => {
    getAnswers.mockRejectedValue(new TypeError('Failed to fetch'));
    renderInicio();
    expect(await screen.findByText('Sem conexão.')).toBeTruthy();
    const texto = document.getElementById('painel-view')?.textContent ?? '';
    expect(texto).not.toMatch(/Você leu|\d+%|respondida|erro em|Nenhum erro|Nenhuma questão|Ainda não há/);
    expect(document.getElementById('painel-erros-total')).toBeNull();
    expect(document.getElementById('painel-acerto-geral')).toBeNull();
  });

  it('dados do app ainda não prontos: espera, sem afirmar "não há questões" nem "não há materiais"', async () => {
    renderInicio({ questions: [], compendiums: [], dadosProntos: false });
    await waitFor(() => expect(getReadingProgress).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText('Carregando…').length).toBeGreaterThan(0));
    const texto = document.getElementById('painel-view')?.textContent ?? '';
    expect(texto).not.toMatch(/Ainda não há|Nenhum erro|Nenhuma questão|Você leu/);
  });
});
