import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, configure, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

// As telas abrem por import dinâmico (lazy): com a suíte inteira rodando em paralelo o
// padrão de 1 s é curto e o teste falha sem defeito nenhum.
configure({ asyncUtilTimeout: 8000 });
vi.setConfig({ testTimeout: 30000 });

// jsdom não tem ResizeObserver (usado pelo Header real).
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// 44-H1 (cópia do molde da 44-D) — usuário ATIVO não-admin vê no menu "Como escrever um
// material" e a página abre; pendente e bloqueado não chegam à página, mesmo
// com o endereço direto (mesmo gate do resto do app).

const authState: { profile: { role: string; status: string } | null } = {
  profile: { role: 'student', status: 'active' },
};

vi.mock('../../src/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    user: { id: 'user-a', email: 'a@b.c', user_metadata: {}, email_confirmed_at: '2026-01-01' },
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

vi.mock('../../src/hooks/useAppData', () => ({
  useAppData: () => ({
    disciplines: [{ id: 'd1', name: 'Farmacologia', code: 'FARM', icon: 'book', description: '', cycle: 'basico', color: '#000' }],
    themes: [{ id: 't1', disciplineId: 'd1', name: 'Antimicrobianos', description: '', highYield: false, order: 1 }],
    compendiums: [{ id: 'm1', disciplineId: 'd1', themeId: 't1', title: 'Material publicado do app', publicationStatus: 'published', sections: [], references: [], tags: [] }],
    questions: [],
    flashcards: [],
    answers: {},
    stats: { xp: 0, level: 1, streak: 0, streakDays: 0 },
    loading: false,
    ready: true,
    status: 'ok',
    refresh: vi.fn(),
  }),
}));

vi.mock('../../src/repositories/MaterialSubmissionsRepository', () => ({
  materialSubmissionsRepository: {
    listMine: vi.fn().mockResolvedValue([]),
    listAll: vi.fn().mockResolvedValue([]),
    submit: vi.fn(),
    replaceText: vi.fn(),
    retry: vi.fn(),
    situacaoDaRevisao: vi.fn().mockResolvedValue(null),
  },
  envioDeMaterialDisponivel: true,
}));
vi.mock('../../src/repositories/QuestionSubmissionsRepository', () => ({
  questionSubmissionsRepository: { listMine: vi.fn().mockResolvedValue([]), submit: vi.fn() },
}));
vi.mock('../../src/components/dashboard/DashboardView', () => ({
  DashboardView: () => <div data-testid="painel">painel</div>,
}));
vi.mock('../../src/components/AppErrorBoundary', () => ({
  AppErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../../src/services/storage', () => ({
  StorageService: {
    getTheme: () => 'light',
    getUserPlan: () => 'free',
    setUserPlan: vi.fn(),
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
    getUIState: () => null,
    setUIState: vi.fn(),
    setActiveUser: vi.fn(),
    setTheme: vi.fn(),
  },
}));

const { default: App } = await import('../../src/App');

beforeEach(() => {
  authState.profile = { role: 'student', status: 'active' };
  window.location.hash = '';
});
afterEach(() => {
  cleanup();
  window.location.hash = '';
});

describe('44-H1 — "Como escrever questões" no app', () => {
  it('estudante ativo abre a página pelo menu do usuário', async () => {
    render(<App />);
    await screen.findByTestId('painel');

    fireEvent.click(screen.getByRole('button', { name: 'Menu do perfil de usuário' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Como escrever questões' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Como escrever questões' })).toBeTruthy();
    expect(screen.getByText('Farmacologia')).toBeTruthy();
    expect(screen.getByText('Antimicrobianos')).toBeTruthy();
    expect(screen.getByText('Material publicado do app')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copiar prompt para criar questões' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copiar prompt revisor de questões' })).toBeTruthy();
    expect(window.location.hash).toBe('#/como-escrever-questoes');
  });

  it('o link da página leva a "Enviar material" já na aba de questões, e de lá volta às instruções', async () => {
    render(<App />);
    await screen.findByTestId('painel');
    fireEvent.click(screen.getByRole('button', { name: 'Menu do perfil de usuário' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Como escrever questões' }));
    await screen.findByRole('heading', { level: 1, name: 'Como escrever questões' });

    fireEvent.click(screen.getByRole('button', { name: 'Enviar material, na aba Questões' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Enviar material' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Novo envio de questões' })).toBeTruthy();
    expect(window.location.hash).toBe('#/enviar-material');

    fireEvent.click(screen.getByRole('button', { name: 'Veja como escrever questões' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Como escrever questões' })).toBeTruthy();
  });

  it('usuário pendente não vê a página, mesmo com o endereço direto', async () => {
    authState.profile = { role: 'student', status: 'pending' };
    window.location.hash = '#/como-escrever-questoes';
    render(<App />);
    expect(await screen.findByText(/aprova/i)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Como escrever questões' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copiar prompt revisor de questões' })).toBeNull();
  });

  it('usuário bloqueado também não acessa', async () => {
    authState.profile = { role: 'student', status: 'blocked' };
    window.location.hash = '#/como-escrever-questoes';
    render(<App />);
    expect(await screen.findByText('Acesso bloqueado')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Como escrever questões' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copiar prompt para criar questões' })).toBeNull();
  });
});
