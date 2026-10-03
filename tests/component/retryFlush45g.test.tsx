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
//
// Replanejamento (#93-R1): o timer também não relê enquanto houver gravação
// do estudante ainda pendente na fila — a releitura chegaria antes dela e a
// tela mostraria como atualizado o dado sem o que ele fez offline. O aviso
// fica até a operação sair de pendente (enviada, ou falha definitiva).

const flush = vi.fn(() => Promise.resolve());
const queue = { pending: 0, syncing: 0, failed: 0, synced: 0 };
vi.mock('../../src/services/syncQueue', () => ({
  flush: (...a: unknown[]) => flush(...(a as [])),
  classifySyncError: () => 'network',
  getSummary: () => ({ ...queue, failedNeedsLogin: false, failedNeedsSupport: 0, status: 'synced' }),
}));
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
  Object.assign(queue, { pending: 0, syncing: 0, failed: 0, synced: 0 });
});

async function renderFailingThenServerBack() {
  vi.useFakeTimers();
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  const view = render(<Probe />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(view.container.textContent).toBe('offline');
  up = true; // o servidor voltou
  return view;
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('45-G — flush forçado só nos sinais fortes, nunca no timer (item 3 / rodada 2 item 2)', () => {
  it('sem gravação pendente na fila, o timer relê sozinho e o aviso some, sem forçar a fila', async () => {
    const view = await renderFailingThenServerBack();
    const loadsBefore = load.mock.calls.length;

    await advance(5_000); // 1ª retentativa (AUTO_RETRY_DELAYS_MS[0])

    expect(load.mock.calls.length).toBeGreaterThan(loadsBefore); // relê sozinho
    expect(view.container.textContent).toBe('ok');
    expect(flush).not.toHaveBeenCalled(); // mas nunca força a fila
  });

  it.each([
    ['enviada', { pending: 0, synced: 1 }],
    ['falha definitiva', { pending: 0, failed: 1 }],
  ])(
    'com gravação pendente na fila, o timer não relê nem força a fila; quando a operação sai de pendente (%s), a tentativa seguinte relê',
    async (_label, after) => {
      queue.pending = 1;
      const view = await renderFailingThenServerBack();
      const loadsBefore = load.mock.calls.length;

      // 3 min de relógio: várias rodadas do timer, todas com a operação ainda
      // pendente — nenhuma relê, o aviso fica, a fila não é forçada.
      for (let i = 0; i < 36; i++) await advance(5_000);
      expect(load.mock.calls.length).toBe(loadsBefore);
      expect(view.container.textContent).toBe('offline');
      expect(flush).not.toHaveBeenCalled();

      // Em envio (`syncing`) ainda é pendente.
      Object.assign(queue, { pending: 0, syncing: 1 });
      await advance(60_000);
      expect(load.mock.calls.length).toBe(loadsBefore);
      expect(view.container.textContent).toBe('offline');

      Object.assign(queue, { syncing: 0 }, after);
      await advance(60_000); // no máximo a maior espera entre tentativas
      expect(load.mock.calls.length).toBeGreaterThan(loadsBefore);
      expect(view.container.textContent).toBe('ok');
      expect(flush).not.toHaveBeenCalled();
    }
  );

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
