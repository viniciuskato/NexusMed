import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

// 45-G, revisão do #93 (item 3): toda nova tentativa de carga (timer, aba
// voltando a ficar visível, "Tentar agora") passa pelo flush da fila
// offline antes de reler — como o evento `online` (`onReconnect`) já fazia.
// Sem isto, a releitura automática podia chegar ao servidor antes da
// gravação feita offline, e a tela desfaria o que o estudante acabou de
// marcar.

const flush = vi.fn(() => Promise.resolve());
vi.mock('../../src/services/syncQueue', () => ({ flush: (...a: unknown[]) => flush(...(a as [])), classifySyncError: () => 'network' }));
vi.mock('../../src/services/storage', () => ({ getStorageUser: () => 'u1' }));

const { useServerLoad } = await import('../../src/hooks/useServerLoad');

let up = false;
const load = vi.fn(async () => {
  if (!up) throw new Error('Failed to fetch');
  return () => {};
});
function Probe() {
  const { status } = useServerLoad(load);
  return <span>{status}</span>;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('45-G — nova tentativa automática passa pelo flush da fila (item 3)', () => {
  it('o timer de retentativa flusha a fila antes de reler', async () => {
    vi.useFakeTimers();
    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
    render(<Probe />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(flush).not.toHaveBeenCalled(); // ainda não houve nova tentativa

    up = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000); // 1ª retentativa (AUTO_RETRY_DELAYS_MS[0])
    });

    expect(flush).toHaveBeenCalledWith('u1', true);
    expect(load.mock.calls.length).toBeGreaterThanOrEqual(2); // carga inicial + retentativa
  });
});
