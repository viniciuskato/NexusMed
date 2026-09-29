import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// jsdom não tem ResizeObserver (usado pelo Header real para a altura do
// cabeçalho fixo) — stub mínimo, só pra não estourar no mount.
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// 45-G, revisão do #93 (item 2): o componente raiz (`AuthenticatedApp`) nunca
// desmonta entre logout e login (App() monta `<AuthenticatedApp />` uma
// única vez, dentro de `<AuthProvider>`). O estado de sessão (activeView,
// reviewCardsQueue, activeSimuladoSelection, ...) vive nele, sem reset ligado
// à troca de usuário. Hoje, o único portão antes de renderizar a tela normal
// é `if (dataLoading) return <LoadingScreen/>` — e `useAppData` marca
// `loading=false` ao FIM de toda tentativa de carga, mesmo que ela falhe
// (`.finally(() => setLoading(false))`). Então: usuário A abre uma sessão de
// flashcards (activeView='flashcard-session', reviewCardsQueue=[cartões de
// A]); A faz logout, B faz login; a carga dos dados de B falha (sem rede) —
// `dataLoading` volta a `false`, `dataReady` nunca fica `true` pra B, mas
// nada bloqueia o render normal, que mostra os cartões de A pra B.

const authState: { user: { id: string } | null; profile: { role: string; status: string } | null } = {
  user: { id: 'user-a' },
  profile: { role: 'student', status: 'active' },
};

vi.mock('C:/Users/vinic/dev/NexusMed/.claude/worktrees/trilha-1/src/contexts/AuthContext', () => ({
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

// useAppData controlado por teste: dataReady/dataLoading/status conforme o
// `userId` pedido — sem isto, teríamos que simular rede real por baixo de
// materialsRepository/questionsRepository/flashcardsRepository/answersRepository.
const appDataByUser: Record<string, { ready: boolean; loading: boolean; status: 'ok' | 'offline' | 'error' }> = {
  'user-a': { ready: true, loading: false, status: 'ok' },
  'user-b': { ready: false, loading: false, status: 'offline' }, // carga de B falhou
};
vi.mock('C:/Users/vinic/dev/NexusMed/.claude/worktrees/trilha-1/src/hooks/useAppData', () => ({
  useAppData: (userId: string | null) => {
    const st = (userId && appDataByUser[userId]) || { ready: false, loading: true, status: 'ok' };
    return {
      disciplines: [],
      themes: [],
      compendiums: [],
      questions: [],
      flashcards: [],
      answers: {},
      stats: { xp: 0, level: 1, streak: 0 },
      loading: st.loading,
      ready: st.ready,
      status: st.status,
      refresh: vi.fn(),
    };
  },
}));

// DashboardView real arrasta uma árvore grande de widgets — só precisamos de
// um jeito de disparar `onStartSRS`, exatamente como o botão real faz.
vi.mock('C:/Users/vinic/dev/NexusMed/.claude/worktrees/trilha-1/src/components/dashboard/DashboardView', () => ({
  DashboardView: ({ onStartSRS }: { onStartSRS: (cards: unknown[]) => void }) => (
    <button onClick={() => onStartSRS([{ id: 'card-de-A', front: 'DA CONTA A' }])}>
      iniciar-srs-teste
    </button>
  ),
}));

vi.mock('C:/Users/vinic/dev/NexusMed/.claude/worktrees/trilha-1/src/components/flashcards/FlashcardReviewSession', () => ({
  FlashcardReviewSession: ({ cards }: { cards: Array<{ id: string; front: string }> }) => (
    <div data-testid="flashcard-session">
      {cards.map((c) => (
        <span key={c.id}>{c.front}</span>
      ))}
    </div>
  ),
}));

// AppErrorBoundary importa clientErrorReporter, que lê `__APP_RELEASE__`
// (definido só em tempo de build pelo Vite, ver vite.config.ts) — não
// precisamos do boundary real neste teste.
vi.mock('C:/Users/vinic/dev/NexusMed/.claude/worktrees/trilha-1/src/components/AppErrorBoundary', () => ({
  AppErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('C:/Users/vinic/dev/NexusMed/.claude/worktrees/trilha-1/src/services/storage', () => ({
  StorageService: {
    getTheme: () => 'light',
    getUserPlan: () => 'free',
    setUserPlan: vi.fn(),
    getLastReadingSession: () => null,
    saveLastReadingSession: vi.fn(),
    checkLegacyDataSummary: () => ({ hasLegacyData: false }),
    getUIState: () => null,
    setUIState: vi.fn(),
    setActiveUser: vi.fn(),
    setTheme: vi.fn(),
  },
}));

const { default: App } = await import(
  'C:/Users/vinic/dev/NexusMed/.claude/worktrees/trilha-1/src/App'
);

beforeEach(() => {
  authState.user = { id: 'user-a' };
});
afterEach(() => {
  cleanup();
});

describe('45-G — troca de usuário com a carga do novo falhando', () => {
  it('nao mostra flashcard-session da conta anterior pra conta nova', async () => {
    const view = render(<App />);

    // Conta A: abre uma sessão de flashcards.
    fireEvent.click(screen.getByText('iniciar-srs-teste'));
    await screen.findByTestId('flashcard-session');
    expect(screen.getByText('DA CONTA A')).toBeTruthy();

    // Logout + login da conta B, cuja carga falha (offline) — sem
    // desmontar <AuthenticatedApp/>, exatamente como acontece hoje.
    authState.user = null;
    view.rerender(<App />);
    authState.user = { id: 'user-b' };
    view.rerender(<App />);
    await waitFor(() => {});

    expect(screen.queryByTestId('flashcard-session')).toBeNull();
    expect(screen.queryByText('DA CONTA A')).toBeNull();
  });
});
