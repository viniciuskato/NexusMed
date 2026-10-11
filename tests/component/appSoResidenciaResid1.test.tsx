import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import type { Question, QuestionAnswerRecord, SimuladoConfig } from '../../src/types';

// As telas abrem por import dinâmico (lazy): com a suíte inteira em paralelo o padrão de 1 s é curto.
configure({ asyncUtilTimeout: 8000 });
vi.setConfig({ testTimeout: 30000 });

// jsdom não tem ResizeObserver (usado pelo Header real) — stub mínimo.
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// RESID-1 (D-14): nas telas de estudo só entram questões de residência (banca e ano de prova reais); a
// Área Editorial continua com todas. Aqui, o App com um conjunto misto — 3 de residência, 2 sem banca
// nem ano e 1 autoral — e cada tela de estudo reduzida a mostrar o que recebeu.

const sessao = vi.hoisted(() => ({ role: 'student' as 'student' | 'admin' }));

vi.mock('../../src/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    user: { id: 'user-a' },
    profile: { role: sessao.role, status: 'active' },
    loading: false,
    loginError: null,
    isConfigured: true,
    isEmailVerified: true,
    loginWithGoogle: vi.fn(),
    loginWithDemo: vi.fn(),
    loginWithEmail: vi.fn(),
    registerWithEmail: vi.fn(),
    sendPasswordReset: vi.fn(),
    sendVerificationEmail: vi.fn(),
    reloadUser: vi.fn(),
    logout: vi.fn(),
    clearError: vi.fn(),
  }),
}));

const q = (id: string, institution: string, year: number): Question =>
  ({
    id,
    disciplineId: 'd1',
    themeId: 't1',
    compendiumRefId: 'mat-1',
    materialLinks: [{ materialId: 'mat-1' }],
    cycle: 'clinico',
    difficulty: 'medio',
    institution,
    year,
    clinicalVignette: '',
    questionStem: `Enunciado ${id}`,
    options: [],
    generalCommentary: '',
    highYieldSummary: '',
    tags: [],
  }) as Question;

const conjuntoMisto: Question[] = [
  q('r1', 'ENARE', 2024),
  q('e1', '', 0),
  q('r2', 'USP', 2019),
  q('e2', '', 0),
  q('a1', 'NexusMed (questão autoral, não extraída de prova real)', 2024),
  q('r3', 'AOCP / EBSERH', 2014),
];
const resposta = (questionId: string, isCorrect: boolean): QuestionAnswerRecord => ({
  questionId,
  selectedOption: 'A',
  isCorrect,
  timestamp: new Date().toISOString(),
  timeSpentSeconds: 1,
});
// Erros: um de residência (r2) e dois de fora (e1, a1); nenhum deles do mesmo tipo conta.
const respostas = {
  r1: resposta('r1', true),
  r2: resposta('r2', false),
  r3: resposta('r3', true),
  e1: resposta('e1', false),
  a1: resposta('a1', false),
};

const dados = vi.hoisted(() => ({ questions: [] as Question[] }));

vi.mock('../../src/hooks/useAppData', () => ({
  useAppData: (userId: string | null) => ({
    disciplines: [{ id: 'd1', name: 'Clínica' }],
    themes: [{ id: 't1', disciplineId: 'd1', name: 'Tema Um' }],
    compendiums: [
      { id: 'mat-1', disciplineId: 'd1', themeId: 't1', title: 'Material Um', sections: [], references: [] },
    ],
    questions: dados.questions,
    answers: respostas,
    loading: false,
    ready: Boolean(userId),
    status: 'ok',
    refresh: vi.fn(),
  }),
}));

vi.mock('../../src/repositories/LeiturasRepository', () => ({
  leiturasRepository: {
    getLeituras: async () => [{ materialId: 'mat-1', secoesLidas: 1, ultimaLeitura: new Date().toISOString() }],
  },
}));
vi.mock('../../src/repositories/AnswersRepository', () => ({ answersRepository: { getAnswers: async () => ({}) } }));
const saveSimuladoSession = vi.hoisted(() => vi.fn());
vi.mock('../../src/repositories/SimuladosRepository', () => ({
  simuladosRepository: {
    getSimuladoHistory: async () => [],
    saveSimuladoSession: (...a: unknown[]) => saveSimuladoSession(...a),
  },
}));
vi.mock('../../src/repositories/MaterialSearchRepository', () => ({ searchMaterials: async () => [] }));

const ids = (lista: Question[]) => lista.map((x) => x.id).join(',');

// Telas de estudo e a Área Editorial, reduzidas ao que elas receberam.
vi.mock('../../src/components/questions/QuestionsView', () => ({
  QuestionsView: ({ questions, onOpenCreateSimulado }: { questions: Question[]; onOpenCreateSimulado: () => void }) => (
    <div>
      <div data-testid="lista-de-questoes">{ids(questions)}</div>
      <button type="button" onClick={onOpenCreateSimulado}>
        abrir-simulado
      </button>
    </div>
  ),
}));
vi.mock('../../src/components/dashboard/DashboardView', () => ({
  DashboardView: ({ questions }: { questions: Question[] }) => <div data-testid="inicio-questoes">{ids(questions)}</div>,
}));
vi.mock('../../src/components/dashboard/DesempenhoView', () => ({
  DesempenhoView: ({ questions }: { questions: Question[] }) => (
    <div data-testid="desempenho-questoes">{ids(questions)}</div>
  ),
}));
vi.mock('../../src/components/hoje/HojeView', () => ({
  HojeView: ({ questions, onTestarOQueLi }: { questions: Question[]; onTestarOQueLi: () => void }) => (
    <div>
      <div data-testid="hoje-questoes">{ids(questions)}</div>
      <button type="button" onClick={onTestarOQueLi}>
        abrir-testar
      </button>
    </div>
  ),
}));
vi.mock('../../src/components/testar/TestarOQueLiModal', () => ({
  TestarOQueLiModal: ({ questions }: { questions: Question[] }) => <div data-testid="testar-questoes">{ids(questions)}</div>,
}));
vi.mock('../../src/components/questions/CreateSimuladoModal', () => ({
  CreateSimuladoModal: ({
    isOpen,
    totalAvailableQuestions,
    mistakesCount,
    onStartSimulado,
  }: {
    isOpen: boolean;
    totalAvailableQuestions: number;
    mistakesCount: number;
    onStartSimulado: (config: SimuladoConfig) => void;
  }) =>
    isOpen ? (
      <div>
        <div data-testid="simulado-total">{totalAvailableQuestions}</div>
        <div data-testid="simulado-erros">{mistakesCount}</div>
        <button
          type="button"
          onClick={() =>
            onStartSimulado({
              id: 'sim-1',
              disciplineIds: [],
              themeIds: [],
              difficulties: [],
              cycles: [],
              onlyMistakes: false,
              questionCount: 20,
            } as unknown as SimuladoConfig)
          }
        >
          iniciar-simulado
        </button>
        <button
          type="button"
          onClick={() =>
            onStartSimulado({
              id: 'sim-vazio',
              disciplineIds: ['disciplina-que-nao-existe'],
              themeIds: [],
              difficulties: [],
              cycles: [],
              onlyMistakes: false,
              questionCount: 20,
            } as unknown as SimuladoConfig)
          }
        >
          iniciar-simulado-vazio
        </button>
      </div>
    ) : null,
}));
vi.mock('../../src/components/questions/SimuladoSession', () => ({
  SimuladoSession: ({ questions }: { questions: Question[] }) => <div data-testid="sessao-simulado">{ids(questions)}</div>,
}));
vi.mock('../../src/components/admin/AdminCMSView', () => ({
  AdminCMSView: ({ questions }: { questions: Question[] }) => <div data-testid="admin-questoes">{ids(questions)}</div>,
}));
vi.mock('../../src/components/AppErrorBoundary', () => ({
  AppErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../src/services/storage', () => ({
  StorageService: {
    getTheme: () => 'light',
    getLastReadingSession: () => null,
    saveLastReadingSession: vi.fn(),
    checkLegacyDataSummary: () => ({
      hasLegacyData: false,
      answersCount: 0,
      flashcardsCount: 0,
      simuladosCount: 0,
      bookmarksCount: 0,
      notesCount: 0,
      readingProgressCount: 0,
    }),
    getUIState: (_key: string, fallback: unknown) => fallback,
    setUIState: vi.fn(),
    setActiveUser: vi.fn(),
    setTheme: vi.fn(),
  },
}));

const { default: App } = await import('../../src/App');

beforeEach(() => {
  sessao.role = 'student';
  dados.questions = conjuntoMisto;
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(cleanup);

describe('RESID-1 — telas de estudo só com questões de residência', () => {
  it('Questões: exatamente as 3 de residência', async () => {
    window.history.replaceState(null, '', '#/questions');
    render(<App />);
    expect((await screen.findByTestId('lista-de-questoes')).textContent).toBe('r1,r2,r3');
  });

  it('Início, Meu desempenho e Hoje recebem as mesmas 3', async () => {
    window.history.replaceState(null, '', '#/dashboard');
    const { unmount } = render(<App />);
    expect((await screen.findByTestId('inicio-questoes')).textContent).toBe('r1,r2,r3');
    unmount();

    window.history.replaceState(null, '', '#/desempenho');
    const segunda = render(<App />);
    expect((await screen.findByTestId('desempenho-questoes')).textContent).toBe('r1,r2,r3');
    segunda.unmount();

    window.history.replaceState(null, '', '#/today');
    render(<App />);
    expect((await screen.findByTestId('hoje-questoes')).textContent).toBe('r1,r2,r3');
  });

  it('"Testar o que li" recebe as 3', async () => {
    window.history.replaceState(null, '', '#/today');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'abrir-testar' }));
    expect((await screen.findByTestId('testar-questoes')).textContent).toBe('r1,r2,r3');
  });

  it('Simulado: o total oferecido e a sessão têm só as 3, e o erro de questão de fora não conta', async () => {
    window.history.replaceState(null, '', '#/questions');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'abrir-simulado' }));
    expect((await screen.findByTestId('simulado-total')).textContent).toBe('3');
    // Os 3 erros gravados: r2 (residência), e1 e a1 (de fora). Só 1 conta.
    expect(screen.getByTestId('simulado-erros').textContent).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: 'iniciar-simulado' }));
    const sessaoDoSimulado = await screen.findByTestId('sessao-simulado');
    expect(sessaoDoSimulado.textContent?.split(',').sort().join(',')).toBe('r1,r2,r3');
  });

  it('simulado sem nenhuma questão elegível não abre a sessão nem grava nada, e a tela Simulados avisa', async () => {
    saveSimuladoSession.mockClear();
    window.history.replaceState(null, '', '#/questions');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'abrir-simulado' }));
    fireEvent.click(await screen.findByRole('button', { name: 'iniciar-simulado-vazio' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Nenhuma questão de residência corresponde');
    expect(screen.queryByTestId('sessao-simulado')).toBeNull();
    expect(saveSimuladoSession).not.toHaveBeenCalled();
  });

  it('sem nenhuma questão de residência: Simulados mostra o texto, sem presets, e o simulado não abre', async () => {
    dados.questions = [q('e1', '', 0), q('a1', 'NexusMed (questão autoral)', 2024)];
    saveSimuladoSession.mockClear();
    window.history.replaceState(null, '', '#/simulados');
    render(<App />);
    expect(await screen.findByText('Ainda não há questões de residência publicadas.')).toBeTruthy();
    expect(screen.queryByText('Iniciar Agora')).toBeNull();
    expect(screen.queryByRole('button', { name: /Criar Simulado Personalizado/ })).toBeNull();
    expect(screen.queryByTestId('sessao-simulado')).toBeNull();
    expect(saveSimuladoSession).not.toHaveBeenCalled();
  });

  it('busca global: só 3 resultados de questão', async () => {
    window.history.replaceState(null, '', '#/today');
    render(<App />);
    await screen.findByTestId('hoje-questoes');
    fireEvent.click(screen.getAllByTitle(/Buscar compêndios, questões ou temas/)[0]);
    const campo = await screen.findByRole('textbox');
    fireEvent.change(campo, { target: { value: 'Enunciado' } });
    await waitFor(() => expect(screen.getByText('Questões (3)')).toBeTruthy());
  });

  it('Área Editorial (admin) continua com as 6, inclusive as sem banca e a autoral', async () => {
    sessao.role = 'admin';
    window.history.replaceState(null, '', '#/admin');
    render(<App />);
    expect((await screen.findByTestId('admin-questoes')).textContent).toBe('r1,e1,r2,e2,a1,r3');
  });

  it('o admin também vê só as 3 nas telas de estudo', async () => {
    sessao.role = 'admin';
    window.history.replaceState(null, '', '#/questions');
    render(<App />);
    expect((await screen.findByTestId('lista-de-questoes')).textContent).toBe('r1,r2,r3');
  });
});
