import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import type { Compendium, Flashcard, Question } from '../../src/types';
import { jaEntrouNestaAba, marcarEntradaNestaAba } from '../../src/utils/navEntrada';

// jsdom não tem ResizeObserver (usado pelo Header real) — stub mínimo.
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// 43-E: a tela "Hoje" no App — é a entrada do estudante ativo, sem tirar do
// reload a restauração da última tela (22-A), acessível pelo menu e ligada às
// telas de sempre (leitor, "Testar o que li", revisão de cards).

const authState: { user: { id: string } | null } = { user: { id: 'user-a' } };
vi.mock('../../src/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    user: authState.user,
    profile: { role: 'student', status: 'active' },
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
  institution: '',
  year: 2026,
  clinicalVignette: '',
  questionStem: 'Questão um',
  options: [],
  generalCommentary: '',
  highYieldSummary: '',
  tags: [],
};
const compendiums = [material];
const questions = [questao];
const themes = [{ id: 't1', disciplineId: 'd1', name: 'Tema Um' }];
vi.mock('../../src/hooks/useAppData', () => ({
  useAppData: (userId: string | null) => ({
    disciplines: [],
    themes,
    compendiums,
    questions,
    flashcards: [],
    answers: {},
    stats: { xp: 0, level: 1, streak: 0 },
    loading: false,
    ready: Boolean(userId),
    status: 'ok',
    refresh: vi.fn(),
  }),
}));

// O que a tela "Hoje" lê do servidor: leu o material hoje, tem 2 cards vencidos.
const cardVencido = (id: string): Flashcard => ({
  id,
  disciplineId: 'd1',
  themeId: 't1',
  front: `frente ${id}`,
  back: '',
  mechanismHighlight: '',
  tags: [],
  difficulty: 'medio',
  srs: { intervalDays: 1, repetitionCount: 1, easeFactor: 2.5, nextDueDate: '2020-01-01T00:00:00.000Z', state: 'review', reviewHistory: [] },
});
vi.mock('../../src/repositories/LeiturasRepository', () => ({
  leiturasRepository: {
    getLeituras: async () => [{ materialId: 'mat-1', secoesLidas: 1, ultimaLeitura: new Date().toISOString() }],
  },
}));
vi.mock('../../src/repositories/AnswersRepository', () => ({ answersRepository: { getAnswers: async () => ({}) } }));
vi.mock('../../src/repositories/FlashcardsRepository', () => ({
  flashcardsRepository: { getFlashcards: async () => [cardVencido('c1'), cardVencido('c2')] },
}));

// Telas de sempre, reduzidas ao que o teste precisa ver.
vi.mock('../../src/components/dashboard/DashboardView', () => ({
  DashboardView: () => <div data-testid="tela-inicio">inicio</div>,
}));
vi.mock('../../src/components/questions/QuestionsView', () => ({
  QuestionsView: () => <div data-testid="tela-questoes">questoes</div>,
}));
vi.mock('../../src/components/compendium/CompendiumReader', () => ({
  CompendiumReader: ({ compendium, targetSectionId }: { compendium: Compendium; targetSectionId?: string }) => (
    <div data-testid="leitor">{`${compendium.id}|${targetSectionId ?? ''}`}</div>
  ),
}));
vi.mock('../../src/components/flashcards/FlashcardReviewSession', () => ({
  FlashcardReviewSession: ({ cards, onFinishSession }: { cards: Flashcard[]; onFinishSession: () => void }) => (
    <div data-testid="revisao">
      <span>{cards.map((c) => c.id).join(',')}</span>
      <button type="button" onClick={onFinishSession}>
        encerrar-revisao
      </button>
    </div>
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
  authState.user = { id: 'user-a' };
  for (const k of Object.keys(ui)) delete ui[k];
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(cleanup);

describe('43-E — Hoje é a tela inicial', () => {
  it('estudante ativo que entra cai em Hoje', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Hoje', level: 1 })).toBeTruthy();
    await waitFor(() => expect(window.location.hash).toBe('#/today'));
    expect(screen.queryByTestId('tela-inicio')).toBeNull();
  });

  it('abertura nova da aba ignora a última tela salva e abre Hoje', async () => {
    ui['nav_active_view'] = 'questions';
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Hoje', level: 1 })).toBeTruthy();
    expect(screen.queryByTestId('tela-questoes')).toBeNull();
  });

  it('recarregar a página (a aba já entrou) restaura a última tela salva, como na 22-A', async () => {
    ui['nav_active_view'] = 'questions';
    marcarEntradaNestaAba('user-a');
    render(<App />);
    expect(await screen.findByTestId('tela-questoes')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Hoje', level: 1 })).toBeNull();
  });

  it('recarregar com tela salva inválida cai em Hoje, nunca numa tela inventada', async () => {
    ui['nav_active_view'] = 'tela-que-nao-existe';
    marcarEntradaNestaAba('user-a');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Hoje', level: 1 })).toBeTruthy();
  });

  it('a marca de entrada é de quem entrou: outra conta na mesma aba também entra por Hoje', async () => {
    ui['nav_active_view'] = 'questions';
    marcarEntradaNestaAba('user-b');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Hoje', level: 1 })).toBeTruthy();
    expect(jaEntrouNestaAba('user-a')).toBe(true);
    expect(jaEntrouNestaAba('user-b')).toBe(false);
  });

  it('a aba sobreviveu até o dia seguinte: abrir de novo entra por Hoje, não pela tela salva', async () => {
    ui['nav_active_view'] = 'questions';
    marcarEntradaNestaAba('user-a'); // entrou hoje
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(Date.now() + 24 * 60 * 60 * 1000)); // o relógio avança para o dia seguinte
      render(<App />);
      expect(await screen.findByRole('heading', { name: 'Hoje', level: 1 })).toBeTruthy();
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

  it('Hoje também abre pelo menu, e Início continua sendo outra tela', async () => {
    window.history.replaceState(null, '', '#/questions');
    render(<App />);
    await screen.findByTestId('tela-questoes');

    fireEvent.click(document.getElementById('nav-today') as HTMLElement);
    expect(await screen.findByRole('heading', { name: 'Hoje', level: 1 })).toBeTruthy();
    expect(document.getElementById('nav-today')?.getAttribute('aria-current')).toBe('page');

    fireEvent.click(document.getElementById('nav-dashboard') as HTMLElement);
    expect(await screen.findByTestId('tela-inicio')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Hoje', level: 1 })).toBeNull();
  });

  it('o dock do celular tem Hoje', async () => {
    window.history.replaceState(null, '', '#/questions');
    render(<App />);
    await screen.findByTestId('tela-questoes');
    fireEvent.click(document.getElementById('dock-nav-today') as HTMLElement);
    expect(await screen.findByRole('heading', { name: 'Hoje', level: 1 })).toBeTruthy();
  });
});

describe('43-E — Hoje liga às telas de sempre', () => {
  it('"Continuar lendo" abre o leitor no material, na seção onde parou', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar lendo' }));
    expect((await screen.findByTestId('leitor')).textContent).toBe('mat-1|sec-2');
  });

  it('"Testar o que li" abre o modal da 43-C', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Testar o que li' }));
    expect(screen.getByRole('dialog', { name: 'Testar o que li' })).toBeTruthy();
  });

  it('"Revisar N cards" abre a revisão com os cards vencidos e, ao terminar, volta para Hoje', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revisar 2 cards' }));
    const revisao = await screen.findByTestId('revisao');
    expect(within(revisao).getByText('c1,c2')).toBeTruthy();

    fireEvent.click(within(revisao).getByRole('button', { name: 'encerrar-revisao' }));
    expect(await screen.findByRole('heading', { name: 'Hoje', level: 1 })).toBeTruthy();
    expect(screen.queryByTestId('revisao')).toBeNull();
  });
});
