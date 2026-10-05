import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// jsdom não tem ResizeObserver (usado pelo Header para a altura do cabeçalho).
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// PAINEL-1 — "Meu desempenho" abre pelo menu Recursos, no topo (desktop) e no dock (celular).

vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'a@b.c', user_metadata: {} },
    profile: { role: 'student', status: 'active', displayName: 'Fulana' },
    logout: vi.fn(),
  }),
}));
vi.mock('../../src/components/common/SyncStatusIndicator', () => ({ SyncStatusIndicator: () => null }));

const { Header } = await import('../../src/components/Header');
const { MobileBottomNav } = await import('../../src/components/navigation/MobileBottomNav');

afterEach(cleanup);

describe('PAINEL-1 — menu leva a "Meu desempenho"', () => {
  it('topo: Recursos → Meu desempenho', () => {
    const onSelectView = vi.fn();
    render(
      <Header
        onOpenSearch={vi.fn()}
        stats={{ streakDays: 0 } as never}
        dueCardsCount={0}
        activeView="dashboard"
        onSelectView={onSelectView}
        theme={'light' as never}
        onToggleTheme={vi.fn()}
      />
    );
    fireEvent.click(document.getElementById('nav-resources') as HTMLElement);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Meu desempenho' }));
    expect(onSelectView).toHaveBeenCalledWith('desempenho');
  });

  it('dock do celular: Recursos → Meu desempenho; a tela do caderno de erros também marca Recursos', () => {
    const onSelectView = vi.fn();
    const { rerender } = render(<MobileBottomNav activeView="dashboard" onSelectView={onSelectView} />);
    expect(document.getElementById('dock-nav-resources')?.getAttribute('aria-current')).toBeNull();
    fireEvent.click(document.getElementById('dock-nav-resources') as HTMLElement);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Meu desempenho' }));
    expect(onSelectView).toHaveBeenCalledWith('desempenho');

    rerender(<MobileBottomNav activeView="desempenho" onSelectView={onSelectView} />);
    expect(document.getElementById('dock-nav-resources')?.className).toContain('bg-teal-600/15');
    // O painel enxuto segue sendo "Início".
    expect(document.getElementById('dock-nav-dashboard')?.getAttribute('aria-current')).toBeNull();
  });
});
