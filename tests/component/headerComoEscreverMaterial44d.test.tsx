import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// jsdom não tem ResizeObserver (usado pelo Header para a altura do cabeçalho).
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// 44-D — o item "Como escrever um material" e, desde a 44-E/44-H1, "Como escrever questões" e
// "Enviar material" estão no menu do usuário. P6 (03/10): só o dono (admin) envia, então esses três
// itens existem só para admin; para o amigo (estudante ativo) o menu de envio não aparece. O gate de
// status vive no App (testado em appComoEscreverMaterial44d.test.tsx).

const authState: { role: string } = { role: 'student' };

vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'a@b.c', user_metadata: {} },
    profile: { role: authState.role, status: 'active', displayName: 'Fulana' },
    logout: vi.fn(),
  }),
}));
vi.mock('../../src/components/common/SyncStatusIndicator', () => ({ SyncStatusIndicator: () => null }));

const { Header } = await import('../../src/components/Header');

function renderHeader(onSelectView = vi.fn(), activeView = 'dashboard') {
  render(
    <Header
      onOpenSearch={vi.fn()}
      stats={{ streakDays: 0 } as never}
      dueCardsCount={0}
      activeView={activeView}
      onSelectView={onSelectView}
      theme={'light' as never}
      onToggleTheme={vi.fn()}
    />,
  );
  return onSelectView;
}

afterEach(() => cleanup());

describe('44-D / P6 — itens de envio no menu do usuário', () => {
  it('P6: estudante (não admin) não vê nenhum item de envio, nem o de Área Editorial', () => {
    authState.role = 'student';
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Menu do perfil de usuário' }));
    expect(screen.queryByRole('menuitem', { name: 'Como escrever um material' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Como escrever questões' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Enviar material' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Área Editorial/ })).toBeNull();
    // O resto do menu continua: o amigo ainda pode mandar um feedback e sair.
    expect(screen.getByRole('menuitem', { name: /Sair/ })).toBeTruthy();
  });

  it('admin vê "Como escrever um material" e abre a tela certa', () => {
    authState.role = 'admin';
    const onSelectView = renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Menu do perfil de usuário' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Como escrever um material' }));
    expect(onSelectView).toHaveBeenCalledWith('como-escrever-material');
  });

  it('44-E: admin vê "Enviar material" no mesmo menu, e ele abre a tela de envio', () => {
    authState.role = 'admin';
    const onSelectView = renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Menu do perfil de usuário' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Enviar material' }));
    expect(onSelectView).toHaveBeenCalledWith('enviar-material');
  });

  it('admin também vê a Área Editorial', () => {
    authState.role = 'admin';
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Menu do perfil de usuário' }));
    expect(screen.getByRole('menuitem', { name: 'Como escrever um material' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Área Editorial/ })).toBeTruthy();
  });

  it('marca o item como página atual quando a tela está aberta', () => {
    authState.role = 'admin';
    renderHeader(vi.fn(), 'como-escrever-material');
    fireEvent.click(screen.getByRole('button', { name: 'Menu do perfil de usuário' }));
    expect(
      screen.getByRole('menuitem', { name: 'Como escrever um material' }).getAttribute('aria-current'),
    ).toBe('page');
  });

  it('44-H1: admin vê "Como escrever questões" no menu, e ele abre a página certa', () => {
    authState.role = 'admin';
    const onSelectView = renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Menu do perfil de usuário' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Como escrever questões' }));
    expect(onSelectView).toHaveBeenCalledWith('como-escrever-questoes');
  });

  it('44-H1: o item de questões é marcado como página atual só na página dele', () => {
    authState.role = 'admin';
    renderHeader(vi.fn(), 'como-escrever-questoes');
    fireEvent.click(screen.getByRole('button', { name: 'Menu do perfil de usuário' }));
    expect(screen.getByRole('menuitem', { name: 'Como escrever questões' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('menuitem', { name: 'Como escrever um material' }).getAttribute('aria-current')).toBeNull();
  });
});
