import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

// 45-G, revisão do #93, item 3 (e correção da rodada 2, item 2): só sinais
// fortes e explícitos de que a causa do erro mudou — o evento `online`, a
// aba voltando a ficar visível, e "Tentar agora" (clique explícito) —
// passam pelo flush forçado da fila offline antes de reler, como o próprio
// `syncQueue.flush` documenta. O TIMER periódico de retentativa NUNCA força
// esse flush (o heartbeat de 60s da própria fila já cuida disso, respeitando
// o backoff normal) — sem isto, cada tela com uma carga falhando forçava a
// fila a cada 5-60s, gastando tentativas retentáveis sem um sinal real de
// que a causa do erro mudou (podendo até esgotar o limite e marcar a
// operação como `failed`).

const flush = vi.fn(() => Promise.resolve());
vi.mock('../../src/services/syncQueue', () => ({ flush: (...a: unknown[]) => flush(...(a as [])), classifySyncError: () => 'network' }));
vi.mock('../../src/services/storage', () => ({ getStorageUser: () => 'u1' }));

const { useServerLoad } = await import('../../src/hooks/useServerLoad');
const { requestRetryAll } = await import('../../src/services/connectivity');

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
  up = false;
});

describe('45-G — flush forçado só nos sinais fortes, nunca no timer (item 3 / rodada 2 item 2)', () => {
  it('o timer de retentativa relê sozinho, sem forçar a fila', async () => {
    vi.useFakeTimers();
    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
    render(<Probe />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const loadsBefore = load.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000); // 1ª retentativa (AUTO_RETRY_DELAYS_MS[0])
    });

    expect(load.mock.calls.length).toBeGreaterThan(loadsBefore); // relê sozinho
    expect(flush).not.toHaveBeenCalled(); // mas nunca força a fila
  });

  it('aba voltando a ficar visível força a fila antes de reler', async () => {
    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
    render(<Probe />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(flush).not.toHaveBeenCalled();

    up = true;
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(flush).toHaveBeenCalledWith('u1', true);
  });

  it('"Tentar agora" força a fila antes de reler', async () => {
    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
    render(<Probe />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(flush).not.toHaveBeenCalled();

    up = true;
    await act(async () => {
      requestRetryAll();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(flush).toHaveBeenCalledWith('u1', true);
  });

  it('a releitura espera o flush terminar mesmo quando a operação segue pendente depois dele', async () => {
    let resolveFlush: () => void = () => {};
    flush.mockImplementation(() => new Promise<void>((resolve) => { resolveFlush = resolve; }));
    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
    render(<Probe />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const loadsBefore = load.mock.calls.length;

    up = true;
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // O flush ainda não terminou (a operação segue pendente na fila) — a
    // releitura não pode ter acontecido antes disso.
    expect(load.mock.calls.length).toBe(loadsBefore);

    resolveFlush();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(load.mock.calls.length).toBeGreaterThan(loadsBefore);
  });
});
