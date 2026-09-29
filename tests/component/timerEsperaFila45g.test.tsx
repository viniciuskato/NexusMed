import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

// 45-G, replanejamento (#93-R1), com a fila de verdade: o estudante gravou
// offline (a operação ficou pendente na fila) e o servidor voltou. A nova
// tentativa pelo relógio não relê o servidor enquanto a operação estiver
// pendente — a releitura chegaria antes dela e a tela mostraria como
// atualizado o dado sem o que ele fez (ex.: seção lida voltando a "não lida").
// Quem sobe a operação é o heartbeat da própria fila, no ritmo dela (o relógio
// não força nada; ver filaTimerNaoForca45g). Saída a operação de pendente
// (enviada, ou falha definitiva), a tentativa seguinte relê e o aviso some.

vi.mock('../../src/lib/supabaseClient', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } }, error: null }) } },
}));
vi.mock('../../src/services/storage', () => ({ getStorageUser: () => 'u1' }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
  vi.resetModules();
});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function scenario(serverAnswer: 'aceita' | 'recusa') {
  vi.resetModules();
  localStorage.clear();
  vi.useFakeTimers();
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  const sq = await import('../../src/services/syncQueue');
  const { useServerLoad } = await import('../../src/hooks/useServerLoad');

  let serverUp = false;
  sq.registerHandler('x', async () => {
    if (!serverUp) throw new Error('Failed to fetch');
    if (serverAnswer === 'recusa') throw { code: '42501', message: 'permission denied' };
    return {};
  });
  sq.enqueue('u1', 'x', { a: 1 }); // gravação feita sem servidor: fica pendente
  await advance(10);
  expect(sq.getOps('u1')[0]?.state).toBe('pending');

  const load = vi.fn(async () => {
    if (!serverUp) throw new Error('Failed to fetch');
    return () => {};
  });
  function Probe() {
    const { status } = useServerLoad(load);
    return <span>{status}</span>;
  }
  const view = render(<Probe />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(view.container.textContent).toBe('offline');
  const loadsBefore = load.mock.calls.length;

  serverUp = true;
  // Até o heartbeat de 60s da fila, a operação continua pendente: nenhuma
  // rodada do relógio relê, e o aviso fica.
  for (let i = 0; i < 11; i++) {
    await advance(5_000);
    expect(sq.getOps('u1')[0]?.state).toBe('pending');
    expect(load.mock.calls.length).toBe(loadsBefore);
    expect(view.container.textContent).toBe('offline');
  }

  // O heartbeat sobe a operação; na tentativa seguinte do relógio, relê.
  for (let i = 0; i < 24 && view.container.textContent !== 'ok'; i++) await advance(5_000);
  return { state: sq.getOps('u1')[0]?.state, status: view.container.textContent, reloaded: load.mock.calls.length > loadsBefore };
}

describe('45-G — o relógio espera a fila sem forçá-la (replanejamento #93-R1)', () => {
  it('operação pendente enviada pela fila: só depois disso o relógio relê e o aviso some', async () => {
    expect(await scenario('aceita')).toEqual({ state: 'synced', status: 'ok', reloaded: true });
  });

  it('operação pendente com falha definitiva: depois disso o relógio relê e o aviso some', async () => {
    expect(await scenario('recusa')).toEqual({ state: 'failed', status: 'ok', reloaded: true });
  });
});
