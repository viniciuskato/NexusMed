import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import type { Compendium, Question, Theme } from '../../src/types';

// As telas abrem por import dinâmico (lazy): com a suíte inteira em paralelo o padrão de
// 1 s do Testing Library é curto e este teste falhava só por carga (passa sozinho em 0,5 s).
configure({ asyncUtilTimeout: 8000 });
vi.setConfig({ testTimeout: 30000 });

// jsdom não tem ResizeObserver (usado pelo Header real) — stub mínimo.
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// 45-G (revisão do #93, depois do merge do #96): a troca de conta zera todo o
// estado de sessão do `AuthenticatedApp` (ver appTrocaUsuario45g.test.tsx). O
// "Testar o que li" (43-C) acrescentou dois estados ao App — o recorte de
// questões escolhido e o modal aberto — que também são da conta: a conta B não
// pode herdar o recorte feito a partir das leituras de A, nem ver o modal de A
// aberto com os materiais que A leu hoje.

const authState: { user: { id: string } | null; profile: { role: string; status: string } | null } = {
  user: { id: 'user-a' },
  profile: { role: 'student', status: 'active' },
};

vi.mock('../../src/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    user: authState.user,
    profile: authState.profile,
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

// Conteúdo publicado, o mesmo para as duas contas; a carga dá certo para ambas.
const compendiums: Compendium[] = [
  {
    id: 'mat-1', disciplineId: 'd1', themeId: 't1', title: 'Material Um', subtitle: '', estimatedReadTimeMinutes: 10,
    lastUpdated: '', author: '', sections: [], references: [],
  },
];
const themes: Theme[] = [{ id: 't1', disciplineId: 'd1', name: 'Tema Um' } as Theme];
const questions: Question[] = [
  {
    id: 'q-1', disciplineId: 'd1', themeId: 't1', compendiumRefId: 'mat-1', materialLinks: [{ materialId: 'mat-1' }],
    cycle: 'clinico', difficulty: 'medio', institution: '', year: 2026, clinicalVignette: '', questionStem: 'Questão um',
    options: [], generalCommentary: '', highYieldSummary: '', tags: [],
  },
];
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

// Leituras de hoje: só a conta A leu o material.
const leiturasByUser: Record<string, Array<{ materialId: string; secoesLidas: number; ultimaLeitura: string }>> = {
  'user-a': [{ materialId: 'mat-1', secoesLidas: 1, ultimaLeitura: new Date().toISOString() }],
  'user-b': [],
};
vi.mock('../../src/repositories/LeiturasRepository', () => ({
  leiturasRepository: { getLeituras: async () => leiturasByUser[authState.user?.id ?? ''] ?? [] },
}));

// QuestionsView real (é nela que está o aviso do recorte); só a rede dela e o
// cartão de questão são trocados.
vi.mock('../../src/repositories/AnswersRepository', () => ({ answersRepository: { getAnswers: vi.fn().mockResolvedValue({}) } }));
vi.mock('../../src/repositories/BookmarksRepository', () => ({
  bookmarksRepository: { getBookmarks: vi.fn().mockResolvedValue({ questions: [], compendiums: [], flashcards: [] }) },
}));
vi.mock('../../src/repositories/QuestionReactionsRepository', () => ({
  questionReactionsRepository: { getMyReactions: vi.fn().mockResolvedValue({}) },
}));
vi.mock('../../src/hooks/useScrollMemory', () => ({ useScrollMemory: vi.fn() }));
vi.mock('../../src/components/questions/QuestionCard', () => ({
  QuestionCard: ({ question }: { question: Question }) => <div data-testid="card">{question.questionStem}</div>,
}));

// DesempenhoView real arrasta uma árvore grande — só o botão que abre o modal.
// (Desde o PAINEL-1 o botão "Testar o que li" do painel antigo mora em "Meu desempenho".)
vi.mock('../../src/components/dashboard/DesempenhoView', () => ({
  DesempenhoView: ({ onTestarOQueLi }: { onTestarOQueLi?: () => void }) => (
    <button type="button" onClick={onTestarOQueLi}>
      abrir-testar-teste
    </button>
  ),
}));

// AppErrorBoundary lê `__APP_RELEASE__`, que só existe no build.
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
  authState.user = { id: 'user-a' };
  window.history.replaceState(null, '', '#/desempenho');
});
afterEach(() => {
  cleanup();
});

// Logout de A e login de B sem desmontar <AuthenticatedApp/>, como no app real.
async function trocarParaB(view: ReturnType<typeof render>) {
  authState.user = null;
  view.rerender(<App />);
  authState.user = { id: 'user-b' };
  view.rerender(<App />);
  await waitFor(() => {});
}

describe('45-G — troca de conta e o "Testar o que li" (43-C)', () => {
  it('a conta B não herda o recorte nem o aviso "Testar o que li" da conta A', async () => {
    const view = render(<App />);

    // Conta A: abre o modal, começa pelo material lido hoje e cai em Questões
    // com o recorte e o aviso.
    fireEvent.click(await screen.findByText('abrir-testar-teste'));
    await screen.findByText('Material Um');
    fireEvent.click(screen.getByRole('button', { name: /Começar/ }));
    await screen.findByText('Testar o que li:');
    expect(window.location.hash).toBe('#/questions');

    await trocarParaB(view);

    // Conta B: a restauração de navegação segue o hash (#/questions) e abre a
    // lista de questões — sem o recorte nem o aviso escolhidos por A.
    await screen.findByText('Questão um');
    expect(screen.queryByText('Testar o que li:')).toBeNull();
    expect(document.getElementById('questions-testar-scope')).toBeNull();
  });

  it('o modal "Testar o que li" aberto pela conta A fecha na troca, e nada das leituras de A aparece para B', async () => {
    const view = render(<App />);

    fireEvent.click(await screen.findByText('abrir-testar-teste'));
    await screen.findByText('Material Um');
    expect(screen.getByRole('dialog', { name: 'Testar o que li' })).toBeTruthy();

    await trocarParaB(view);

    expect(screen.queryByRole('dialog', { name: 'Testar o que li' })).toBeNull();
    expect(screen.queryByText('Material Um')).toBeNull();

    // Aberto de novo por B, o modal busca as leituras de B (nenhuma hoje).
    fireEvent.click(await screen.findByText('abrir-testar-teste'));
    await screen.findByText(/Nenhum material lido hoje/);
    expect(screen.queryByText('Material Um')).toBeNull();
  });
});
