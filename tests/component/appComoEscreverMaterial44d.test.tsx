import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

// jsdom não tem ResizeObserver (usado pelo Header real).
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// 44-D, aceite 1 — usuário ATIVO não-admin vê no menu "Como escrever um
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
    compendiums: [],
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

// 43-E: a tela inicial agora é "Hoje", que lê estas três cargas do servidor.
vi.mock('../../src/repositories/LeiturasRepository', () => ({ leiturasRepository: { getLeituras: async () => [] } }));
vi.mock('../../src/repositories/AnswersRepository', () => ({ answersRepository: { getAnswers: async () => ({}) } }));
vi.mock('../../src/repositories/FlashcardsRepository', () => ({
  flashcardsRepository: { getFlashcards: async () => [] },
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

describe('44-D — "Como escrever um material" no app', () => {
  it('estudante ativo abre a página pelo menu do usuário', async () => {
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Hoje' });

    fireEvent.click(screen.getByRole('button', { name: 'Menu do perfil de usuário' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Como escrever um material' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Como escrever um material' })).toBeTruthy();
    expect(screen.getByText('Farmacologia')).toBeTruthy();
    expect(screen.getByText('Antimicrobianos')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copiar prompt para criar material' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copiar prompt revisor' })).toBeTruthy();
    expect(window.location.hash).toBe('#/como-escrever-material');
  });

  it('usuário pendente não vê a página nem o menu, mesmo com o endereço direto', async () => {
    authState.profile = { role: 'student', status: 'pending' };
    window.location.hash = '#/como-escrever-material';
    render(<App />);

    // Tela de espera de aprovação no lugar do app inteiro.
    expect(await screen.findByText(/aprova/i)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Como escrever um material' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Menu do perfil de usuário' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copiar prompt revisor' })).toBeNull();
  });

  it('usuário bloqueado ou sem status também não acessa', async () => {
    authState.profile = { role: 'student', status: 'blocked' };
    window.location.hash = '#/como-escrever-material';
    render(<App />);

    expect(await screen.findByText('Acesso bloqueado')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Como escrever um material' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copiar prompt revisor' })).toBeNull();
  });
});
