import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// 45-E, revisão do f3bbf3e (item 8): com só falhas de sessão e sem sessão
// ativa, "Tentar novamente" não tem o que reenviar. O clique não pode ficar
// mudo — a tela diz o que fazer (entrar de novo) e oferece o caminho.

const logout = vi.fn(async () => {});
const retryAllFailed = vi.fn();

vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-a' }, logout }),
}));
vi.mock('../../src/hooks/useSyncQueueStatus', () => ({
  useSyncQueueStatus: () => ({
    pending: 0,
    syncing: 0,
    failed: 1,
    failedNeedsLogin: true,
    failedNeedsSupport: 0,
    synced: 0,
    status: 'error',
  }),
}));
vi.mock('../../src/hooks/useAmbiguousRecoveries', () => ({ useAmbiguousRecoveries: () => [] }));
vi.mock('../../src/services/syncQueue', () => ({ retryAllFailed: (...args: unknown[]) => retryAllFailed(...args) }));
vi.mock('../../src/components/common/LegacyRecoveryDialog', () => ({ LegacyRecoveryDialog: () => null }));

const { SyncStatusIndicator } = await import('../../src/components/common/SyncStatusIndicator');

beforeEach(() => {
  logout.mockClear();
  retryAllFailed.mockReset();
});

afterEach(() => cleanup());

describe('SyncStatusIndicator — falha de sessão', () => {
  it('"Tentar novamente" sem sessão ativa mostra que é preciso entrar de novo e oferece o botão', async () => {
    retryAllFailed.mockResolvedValue({ needsLogin: true });
    render(<SyncStatusIndicator />);

    fireEvent.click(screen.getByRole('button', { name: 'Faça login novamente para sincronizar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    const signInAgain = await screen.findByRole('button', { name: 'Entrar de novo' });
    expect(screen.getByText(/não há sessão ativa/i)).toBeTruthy();
    fireEvent.click(signInAgain);
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });

  it('quando o reenvio foi possível, não pede para entrar de novo', async () => {
    retryAllFailed.mockResolvedValue({ needsLogin: false });
    render(<SyncStatusIndicator />);

    fireEvent.click(screen.getByRole('button', { name: 'Faça login novamente para sincronizar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => expect(retryAllFailed).toHaveBeenCalledWith('user-a'));
    expect(screen.queryByRole('button', { name: 'Entrar de novo' })).toBeNull();
  });
});
