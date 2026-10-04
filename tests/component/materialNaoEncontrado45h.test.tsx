import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import type { Compendium } from '../../src/types';

// jsdom não tem ResizeObserver (usado pelo Header real) — stub mínimo.
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// 45-H: um link para material inexistente ou despublicado mostra "material não
// encontrado". Antes, o App abria o PRIMEIRO material da lista no lugar dele
// (`compendiums.find(...) || compendiums[0]`).

vi.mock('../../src/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    user: { id: 'user-a' },
    profile: { role: 'student', status: 'active' },
    loading: false,
    loginError: null,
    isConfigured: true,
    isEmailVerified: true,
    logout: vi.fn(),
    clearError: vi.fn(),
  }),
}));

const material = (id: string, title: string): Compendium => ({
  id,
  disciplineId: 'd1',
  themeId: 't1',
  title,
  subtitle: '',
  estimatedReadTimeMinutes: 10,
  lastUpdated: '',
  author: '',
  sections: [],
  references: [],
});
const compendiums = [material('primeiro', 'Primeiro material'), material('segundo', 'Segundo material')];
vi.mock('../../src/hooks/useAppData', () => ({
  useAppData: (userId: string | null) => ({
    disciplines: [],
    themes: [],
    compendiums,
    questions: [],
    flashcards: [],
    answers: {},
    stats: { xp: 0, level: 1, streak: 0 },
    loading: false,
    ready: Boolean(userId),
    status: 'ok',
    refresh: vi.fn(),
  }),
}));

// Um botão por destino: material que existe e material que não existe (mais).
vi.mock('../../src/components/questions/QuestionsView', () => ({
  QuestionsView: ({ onOpenCompendium }: { onOpenCompendium: (id?: string) => void }) => (
    <div>
      <button type="button" onClick={() => onOpenCompendium('segundo')}>abrir-existente</button>
      <button type="button" onClick={() => onOpenCompendium('despublicado')}>abrir-inexistente</button>
    </div>
  ),
}));
vi.mock('../../src/components/compendium/CompendiumReader', () => ({
  CompendiumReader: ({ compendium }: { compendium: Compendium }) => <div data-testid="leitor">{compendium.title}</div>,
}));
vi.mock('../../src/components/compendium/CompendiumView', () => ({
  CompendiumView: () => <div data-testid="biblioteca">biblioteca</div>,
}));
vi.mock('../../src/components/AppErrorBoundary', () => ({
  AppErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../../src/services/storage', () => ({
  StorageService: {
    getTheme: () => 'light',
    getLastReadingSession: () => null,
    saveLastReadingSession: vi.fn(),
    checkLegacyDataSummary: () => ({ hasLegacyData: false }),
    getUIState: (_k: string, fallback: unknown) => fallback,
    setUIState: vi.fn(),
    setActiveUser: vi.fn(),
    setTheme: vi.fn(),
  },
}));

const { default: App } = await import('../../src/App');

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '#/questions');
});
afterEach(cleanup);

describe('45-H — link para material que não existe', () => {
  it('material inexistente ou despublicado mostra "Material não encontrado" e não abre outro no lugar', async () => {
    render(<App />);
    fireEvent.click(await screen.findByText('abrir-inexistente'));

    expect(await screen.findByRole('heading', { name: 'Material não encontrado' })).toBeTruthy();
    expect(screen.queryByTestId('leitor')).toBeNull();
    expect(screen.queryByText('Primeiro material')).toBeNull();
  });

  it('a saída da tela de "não encontrado" é a biblioteca, e o material inexistente não fica preso', async () => {
    render(<App />);
    fireEvent.click(await screen.findByText('abrir-inexistente'));
    fireEvent.click(await screen.findByRole('button', { name: 'Ir para a Biblioteca' }));

    expect(await screen.findByTestId('biblioteca')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Material não encontrado' })).toBeNull();
  });

  it('material que existe continua abrindo o próprio material (não o primeiro da lista)', async () => {
    render(<App />);
    fireEvent.click(await screen.findByText('abrir-existente'));

    expect((await screen.findByTestId('leitor')).textContent).toBe('Segundo material');
    expect(screen.queryByRole('heading', { name: 'Material não encontrado' })).toBeNull();
  });
});
