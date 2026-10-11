import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import type { Compendium, Question } from '../../src/types';
import { jaEntrouNestaAba, marcarEntradaNestaAba } from '../../src/utils/navEntrada';

// jsdom não tem ResizeObserver (usado pelo Header real) — stub mínimo.
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// 43-E / PAINEL-2 (D-14): o Início no App — é a entrada do estudante ativo, sem tirar do reload a
// restauração da última tela (22-A), acessível pelo menu e ligado às telas de sempre (leitor,
// "Testar o que li", caderno de erros). "Hoje" e "Meu desempenho" deixaram de ser telas: link e estado
// salvo deles caem no Início. CORTE-1 (D-14): sem cards.

const authState: { user: { id: string } | null; role: 'student' | 'admin' } = {
  user: { id: 'user-a' },
  role: 'student',
};
vi.mock('../../src/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    user: authState.user,
    profile: { role: authState.role, status: 'active' },
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

const material: Compendium = {
  id: 'mat-1',
  disciplineId: 'd1',
  themeId: 't1',
  title: 'Material Um',
  subtitle: '',
  estimatedReadTimeMinutes: 10,
  lastUpdated: '',
  author: '',
  sections: [{ id: 'sec-2', title: 'Segunda seção', content: '', keyTakeaways: [] }],
  references: [],
};
const questao: Question = {
  id: 'q-1',
  disciplineId: 'd1',
  themeId: 't1',
  compendiumRefId: 'mat-1',
  materialLinks: [{ materialId: 'mat-1' }],
  cycle: 'clinico',
  difficulty: 'medio',
  institution: 'ENARE',
  year: 2024,
  clinicalVignette: '',
  questionStem: 'Questão um',
  options: [],
  generalCommentary: '',
  highYieldSummary: '',
  tags: [],
};
const dados = { questions: [questao] as Question[] };
const compendiums = [material];
const themes = [{ id: 't1', disciplineId: 'd1', name: 'Tema Um' }];
vi.mock('../../src/hooks/useAppData', () => ({
  useAppData: (userId: string | null) => ({
    disciplines: [{ id: 'd1', name: 'Clínica Médica' }],
    themes,
    compendiums,
    questions: dados.questions,
    answers: {},
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
vi.mock('../../src/repositories/ReadingProgressRepository', () => ({
  readingProgressRepository: { getReadingProgress: async () => ({}) },
}));

// Telas de sempre, reduzidas ao que o teste precisa ver (o Início é o real).
vi.mock('../../src/components/questions/QuestionsView', () => ({
  QuestionsView: ({ onOpenSimulados }: { onOpenSimulados?: () => void }) => (
    <div data-testid="tela-questoes">
      <button type="button" onClick={onOpenSimulados}>
        abrir-simulados
      </button>
    </div>
  ),
}));
vi.mock('../../src/components/dashboard/IntegratedCadernoErros', () => ({
  IntegratedCadernoErros: ({ onSwitchToOverview }: { onSwitchToOverview: () => void }) => (
    <div data-testid="tela-caderno">
      <button type="button" onClick={onSwitchToOverview}>
        voltar-ao-inicio
      </button>
    </div>
  ),
}));
vi.mock('../../src/components/simulados/SimuladosView', () => ({
  SimuladosView: () => <div data-testid="tela-simulados">simulados</div>,
}));
vi.mock('../../src/components/admin/AdminCMSView', () => ({
  AdminCMSView: () => <div data-testid="tela-admin">admin</div>,
}));
vi.mock('../../src/components/compendium/CompendiumReader', () => ({
  CompendiumReader: ({ compendium, targetSectionId }: { compendium: Compendium; targetSectionId?: string }) => (
    <div data-testid="leitor">{`${compendium.id}|${targetSectionId ?? ''}`}</div>
  ),
}));
vi.mock('../../src/components/testar/TestarOQueLiModal', () => ({
  TestarOQueLiModal: () => <div role="dialog" aria-label="Testar o que li" />,
}));
vi.mock('../../src/components/AppErrorBoundary', () => ({
  AppErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

const ui = vi.hoisted(() => ({}) as Record<string, unknown>);
vi.mock('../../src/services/storage', () => ({
  StorageService: {
    getTheme: () => 'light',
    getLastReadingSession: () => ({
      compendiumId: 'mat-1',
      sectionId: 'sec-2',
      compendiumTitle: 'Material Um',
      updatedAt: 1,
    }),
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
    getUIState: (key: string, fallback: unknown) => (key in ui ? ui[key] : fallback),
    setUIState: (key: string, value: unknown) => {
      ui[key] = value;
    },
    setActiveUser: vi.fn(),
    setTheme: vi.fn(),
  },
}));

const { default: App } = await import('../../src/App');

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; // jsdom não implementa (useScrollMemory)
  authState.user = { id: 'user-a' };
  authState.role = 'student';
  dados.questions = [questao];
  for (const k of Object.keys(ui)) delete ui[k];
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(cleanup);

const inicio = () => screen.findByRole('heading', { name: 'Início', level: 1 });
const semInicio = () => expect(screen.queryByRole('heading', { name: 'Início', level: 1 })).toBeNull();

describe('PAINEL-2 — o Início é a tela inicial', () => {
  it('estudante ativo que entra cai no Início', async () => {
    render(<App />);
    expect(await inicio()).toBeTruthy();
    await waitFor(() => expect(window.location.hash).toBe('#/dashboard'));
  });

  it('abertura nova da aba ignora a última tela salva e abre o Início', async () => {
    ui['nav_active_view'] = 'questions';
    render(<App />);
    expect(await inicio()).toBeTruthy();
    expect(screen.queryByTestId('tela-questoes')).toBeNull();
  });

  it('recarregar a página (a aba já entrou) restaura a última tela salva, como na 22-A', async () => {
    ui['nav_active_view'] = 'questions';
    marcarEntradaNestaAba('user-a');
    render(<App />);
    expect(await screen.findByTestId('tela-questoes')).toBeTruthy();
    semInicio();
  });

  it('recarregar com tela salva inválida cai no Início, nunca numa tela inventada', async () => {
    ui['nav_active_view'] = 'tela-que-nao-existe';
    marcarEntradaNestaAba('user-a');
    render(<App />);
    expect(await inicio()).toBeTruthy();
  });

  it('a marca de entrada é de quem entrou: outra conta na mesma aba também entra pelo Início', async () => {
    ui['nav_active_view'] = 'questions';
    marcarEntradaNestaAba('user-b');
    render(<App />);
    expect(await inicio()).toBeTruthy();
    expect(jaEntrouNestaAba('user-a')).toBe(true);
    expect(jaEntrouNestaAba('user-b')).toBe(false);
  });

  it('a aba sobreviveu até o dia seguinte: abrir de novo entra pelo Início, não pela tela salva', async () => {
    ui['nav_active_view'] = 'questions';
    marcarEntradaNestaAba('user-a'); // entrou hoje
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(Date.now() + 24 * 60 * 60 * 1000)); // o relógio avança para o dia seguinte
      render(<App />);
      expect(await inicio()).toBeTruthy();
      expect(screen.queryByTestId('tela-questoes')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('link direto (#/questions) continua valendo sobre a tela inicial', async () => {
    window.history.replaceState(null, '', '#/questions');
    render(<App />);
    expect(await screen.findByTestId('tela-questoes')).toBeTruthy();
  });

  it('dia seguinte com link direto: o link continua vencendo', async () => {
    marcarEntradaNestaAba('user-a');
    window.history.replaceState(null, '', '#/questions');
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(Date.now() + 24 * 60 * 60 * 1000));
      render(<App />);
      expect(await screen.findByTestId('tela-questoes')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('PAINEL-2 — "Hoje" e "Meu desempenho" não existem mais', () => {
  it.each(['today', 'desempenho'])('link salvo #/%s cai no Início, sem erro, e o endereço vira #/dashboard', async (tela) => {
    window.history.replaceState(null, '', `#/${tela}`);
    render(<App />);
    expect(await inicio()).toBeTruthy();
    await waitFor(() => expect(window.location.hash).toBe('#/dashboard'));
    expect(screen.queryByText(/algo deu errado|erro inesperado/i)).toBeNull();
  });

  it.each(['today', 'desempenho'])('recarregar com "%s" salvo como última tela cai no Início, sem erro', async (tela) => {
    ui['nav_active_view'] = tela;
    marcarEntradaNestaAba('user-a');
    render(<App />);
    expect(await inicio()).toBeTruthy();
    expect(screen.queryByText(/algo deu errado|erro inesperado/i)).toBeNull();
    await waitFor(() => expect(ui['nav_active_view']).toBe('dashboard'));
  });

  it('o menu do topo e o dock têm exatamente Início, Biblioteca e Questões (CMS só para o admin)', async () => {
    const { unmount } = render(<App />);
    await inicio();
    const nomes = (rotulo: string) =>
      within(screen.getByRole('navigation', { name: rotulo }))
        .getAllByRole('button')
        .map((b) => b.textContent?.trim());
    expect(nomes('Navegação principal')).toEqual(['Início', 'Biblioteca', 'Questões']);
    expect(nomes('Navegação Principal')).toEqual(['Início', 'Biblioteca', 'Questões']);
    for (const id of ['nav-today', 'nav-desempenho', 'nav-resources', 'dock-nav-today', 'dock-nav-resources']) {
      expect(document.getElementById(id)).toBeNull();
    }
    expect(screen.queryByText(/^Hoje$|Meu desempenho|^Desempenho$/)).toBeNull();
    unmount();

    authState.role = 'admin';
    render(<App />);
    await inicio();
    expect(nomes('Navegação Principal')).toEqual(['Início', 'Biblioteca', 'Questões', 'CMS']);
  });

  it('o menu marca a tela atual, e o logotipo volta para o Início', async () => {
    window.history.replaceState(null, '', '#/questions');
    render(<App />);
    await screen.findByTestId('tela-questoes');
    expect(document.getElementById('nav-questions')?.getAttribute('aria-current')).toBe('page');
    expect(document.getElementById('dock-nav-questions')?.getAttribute('aria-current')).toBe('page');

    fireEvent.click(document.getElementById('nav-dashboard') as HTMLElement);
    expect(await inicio()).toBeTruthy();
    expect(document.getElementById('nav-dashboard')?.getAttribute('aria-current')).toBe('page');
    expect(document.getElementById('dock-nav-dashboard')?.getAttribute('aria-current')).toBe('page');

    fireEvent.click(document.getElementById('dock-nav-questions') as HTMLElement);
    await screen.findByTestId('tela-questoes');
    fireEvent.click(screen.getByText('NexusMed'));
    expect(await inicio()).toBeTruthy();
  });

  it('Simulados mora dentro de Questões: o botão leva à tela e o menu mantém Questões marcado', async () => {
    window.history.replaceState(null, '', '#/questions');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'abrir-simulados' }));
    expect(await screen.findByTestId('tela-simulados')).toBeTruthy();
    expect(document.getElementById('nav-questions')?.getAttribute('aria-current')).toBe('page');
    expect(document.getElementById('dock-nav-questions')?.getAttribute('aria-current')).toBe('page');
  });
});

describe('PAINEL-2 — o Início liga às telas de sempre', () => {
  it('"Continuar lendo" abre o leitor no material, na seção onde parou', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Continuar de onde parei/ }));
    expect((await screen.findByTestId('leitor')).textContent).toBe('mat-1|sec-2');
  });

  it('"Testar o que li" abre o modal da 43-C', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Testar o que li' }));
    expect(screen.getByRole('dialog', { name: 'Testar o que li' })).toBeTruthy();
  });

  it('"Fazer questões" e "Simulado" abrem as telas respectivas', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Fazer questões' }));
    expect(await screen.findByTestId('tela-questoes')).toBeTruthy();
    fireEvent.click(document.getElementById('nav-dashboard') as HTMLElement);
    fireEvent.click(await screen.findByRole('button', { name: 'Simulado' }));
    expect(await screen.findByTestId('tela-simulados')).toBeTruthy();
  });

  it('"Abrir caderno de erros" abre o caderno como tela própria, o Início fica marcado e "Início" volta', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir caderno de erros' }));
    expect(await screen.findByTestId('tela-caderno')).toBeTruthy();
    expect(window.location.hash).toBe('#/errors');
    expect(document.getElementById('nav-dashboard')?.getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: 'voltar-ao-inicio' }));
    expect(await inicio()).toBeTruthy();
  });

  it('o caderno de erros restaura no reload (é tela própria e permitida)', async () => {
    ui['nav_active_view'] = 'errors';
    marcarEntradaNestaAba('user-a');
    render(<App />);
    expect(await screen.findByTestId('tela-caderno')).toBeTruthy();
  });

  it('admin sem questão de residência: "Importar questões" abre a Área Editorial na aba de questões', async () => {
    authState.role = 'admin';
    dados.questions = [];
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Importar questões' }));
    expect(await screen.findByTestId('tela-admin')).toBeTruthy();
    expect(ui['admin_active_tab']).toBe('questions');
  });

  it('quem não é admin não vê "Importar questões" no estado vazio', async () => {
    dados.questions = [];
    render(<App />);
    expect(await screen.findByText('Ainda não há questões de residência publicadas.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Importar questões' })).toBeNull();
  });
});

describe('CORTE-1 — as telas de cartões e do Estudo Temático não abrem mais', () => {
  it.each(['flashcards', 'flashcard-session', 'thematic-study'])(
    'link direto #/%s cai na tela inicial, sem erro',
    async (tela) => {
      window.history.replaceState(null, '', `#/${tela}`);
      render(<App />);
      expect(await inicio()).toBeTruthy();
      await waitFor(() => expect(window.location.hash).toBe('#/dashboard'));
      expect(screen.queryByText(/algo deu errado|erro inesperado/i)).toBeNull();
    }
  );

  it.each(['flashcards', 'thematic-study'])(
    'recarregar com "%s" salvo como última tela cai na tela inicial, sem erro',
    async (tela) => {
      ui['nav_active_view'] = tela;
      marcarEntradaNestaAba('user-a');
      render(<App />);
      expect(await inicio()).toBeTruthy();
      expect(screen.queryByText(/algo deu errado|erro inesperado/i)).toBeNull();
    }
  );

  it('o menu não tem mais Estudo Temático nem Cards, nem no topo nem no dock', async () => {
    render(<App />);
    await inicio();
    expect(document.getElementById('nav-thematic-study')).toBeNull();
    expect(document.getElementById('dock-nav-thematic-study')).toBeNull();
    expect(screen.queryByText(/Estudo Temático|Temático/)).toBeNull();
    expect(screen.queryByText(/^Cards$/)).toBeNull();
  });

  it('o Início não fala de cards nem de pontos', async () => {
    render(<App />);
    await screen.findByRole('button', { name: /Continuar de onde parei/ });
    expect(screen.queryByText(/card|cartão|cartões|XP|ofensiva/i)).toBeNull();
  });
});
