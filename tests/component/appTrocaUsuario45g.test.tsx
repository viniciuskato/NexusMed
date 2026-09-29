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

// 45-G, revisão do #93 (item 2, e rodada 2 item 4): o componente raiz
// (`AuthenticatedApp`) nunca desmonta entre logout e login (App() monta
// `<AuthenticatedApp />` uma única vez, dentro de `<AuthProvider>`). O
// estado de sessão (activeView, reviewCardsQueue, activeSimuladoSelection,
// "continuar lendo", aviso de dados antigos, modais abertos, ...) vive nele,
// sem reset ligado à troca de usuário. Hoje, o único portão antes de
// renderizar a tela normal é `if (dataLoading) return <LoadingScreen/>` — e
// `useAppData` marca `loading=false` ao FIM de toda tentativa de carga,
// mesmo que ela falhe (`.finally(() => setLoading(false))`). Então: usuário
// A abre uma sessão de flashcards, deixa "continuar lendo" e o aviso de
// dados antigos na tela, e um modal aberto; A faz logout, B faz login; a
// carga dos dados de B falha (sem rede) — nada bloqueia o render normal, que
// mostraria tudo isso da conta A pra B.

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

// useAppData controlado por teste: dataReady/dataLoading/status conforme o
// `userId` pedido — sem isto, teríamos que simular rede real por baixo de
// materialsRepository/questionsRepository/flashcardsRepository/answersRepository.
const appDataByUser: Record<string, { ready: boolean; loading: boolean; status: 'ok' | 'offline' | 'error' }> = {
  'user-a': { ready: true, loading: false, status: 'ok' },
  'user-b': { ready: false, loading: false, status: 'offline' }, // carga de B falhou
};
vi.mock('../../src/hooks/useAppData', () => ({
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
vi.mock('../../src/components/dashboard/DashboardView', () => ({
  DashboardView: ({ onStartSRS }: { onStartSRS: (cards: unknown[]) => void }) => (
    <button onClick={() => onStartSRS([{ id: 'card-de-A', front: 'DA CONTA A' }])}>
      iniciar-srs-teste
    </button>
  ),
}));

vi.mock('../../src/components/flashcards/FlashcardReviewSession', () => ({
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
vi.mock('../../src/components/AppErrorBoundary', () => ({
  AppErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

// "Continuar lendo" (MobileBottomNav) e o aviso de dados antigos
// (MigrateDataModal, via `checkLegacyDataSummary`) são conteúdo real da
// conta: só a conta A tem os dois.
const lastReadingSessionByUser: Record<string, { compendiumId: string; compendiumTitle: string } | undefined> = {
  'user-a': { compendiumId: 'mat-a', compendiumTitle: 'Material da conta A' },
};
const legacySummaryByUser: Record<string, { hasLegacyData: boolean }> = {
  'user-a': { hasLegacyData: true },
};

vi.mock('../../src/services/storage', () => ({
  StorageService: {
    getTheme: () => 'light',
    getUserPlan: () => 'free',
    setUserPlan: vi.fn(),
    getLastReadingSession: () => lastReadingSessionByUser[authState.user?.id ?? ''] ?? null,
    saveLastReadingSession: vi.fn(),
    checkLegacyDataSummary: (uid: string) =>
      legacySummaryByUser[uid] ?? {
        hasLegacyData: false,
        answersCount: 0,
        flashcardsCount: 0,
        simuladosCount: 0,
        bookmarksCount: 0,
        notesCount: 0,
        readingProgressCount: 0,
      },
    getUIState: () => null,
    setUIState: vi.fn(),
    setActiveUser: vi.fn(),
    setTheme: vi.fn(),
  },
}));

const { default: App } = await import('../../src/App');

beforeEach(() => {
  authState.user = { id: 'user-a' };
});
afterEach(() => {
  cleanup();
});

describe('45-G — troca de usuário com a carga do novo falhando', () => {
  it('nao mostra sessao, "continuar lendo", aviso de dados antigos nem modal aberto da conta anterior pra conta nova', async () => {
    const view = render(<App />);

    // Conta A: "continuar lendo" e o aviso de dados antigos aparecem sozinhos
    // (efeito de carregamento), abre uma sessão de flashcards e deixa um
    // modal aberto (busca).
    await waitFor(() => expect(screen.getByText('Histórico Local Encontrado')).toBeTruthy());
    expect(screen.getByTitle(/Retomar leitura: Material da conta A/)).toBeTruthy();

    fireEvent.click(screen.getByText('iniciar-srs-teste'));
    await screen.findByTestId('flashcard-session');
    expect(screen.getByText('DA CONTA A')).toBeTruthy();

    fireEvent.click(screen.getAllByTitle(/Buscar/)[0]);
    expect(screen.getByPlaceholderText(/Pesquisar mecanismo/)).toBeTruthy();

    // Logout + login da conta B, cuja carga falha (offline) — sem
    // desmontar <AuthenticatedApp/>, exatamente como acontece hoje.
    authState.user = null;
    view.rerender(<App />);
    authState.user = { id: 'user-b' };
    view.rerender(<App />);
    await waitFor(() => {});

    expect(screen.queryByTestId('flashcard-session')).toBeNull();
    expect(screen.queryByText('DA CONTA A')).toBeNull();
    expect(screen.queryByText('Histórico Local Encontrado')).toBeNull();
    expect(screen.queryByTitle(/Retomar leitura: Material da conta A/)).toBeNull();
    expect(screen.queryByPlaceholderText(/Pesquisar mecanismo/)).toBeNull();
  });
});
