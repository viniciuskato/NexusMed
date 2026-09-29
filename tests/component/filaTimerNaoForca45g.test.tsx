import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

// 45-G, revisão do #93/rodada 2 (item 2): o timer periódico de
// `useAutoRetry` NUNCA força o flush da fila offline (`syncQueue.flush(uid,
// true)`, que ignora o backoff) — só sinais fortes e explícitos (`online`,
// aba voltando a ficar visível, "Tentar agora") fazem isso, como o próprio
// `syncQueue.ts` documenta ("nunca pelo heartbeat periódico"). Ter mais
// telas com uma carga falhando (cada uma com seu próprio `useAutoRetry`)
// não pode mudar em nada o ritmo de retentativa de uma operação pendente na
// fila: o número de tentativas e o estado dela têm que ser EXATAMENTE os
// mesmos do controle, sem nenhuma tela aberta.

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

async function scenario(withFailingScreens: number) {
  // Módulo e localStorage do zero a cada cenário — sem isto, chamar
  // `scenario` duas vezes no mesmo teste (controle + com telas) reusaria a
  // MESMA fila em memória da chamada anterior (a mesma operação, mais uma
  // rodada de tentativas em cima).
  vi.resetModules();
  localStorage.clear();
  vi.useFakeTimers();
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  const sq = await import('../../src/services/syncQueue');
  const { useServerLoad } = await import('../../src/hooks/useServerLoad');

  sq.registerHandler('x', async () => {
    throw new Error('Failed to fetch');
  });
  sq.enqueue('u1', 'x', { a: 1 });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });

  function Probe() {
    const { status } = useServerLoad(async () => {
      throw new Error('Failed to fetch');
    });
    return <span>{status}</span>;
  }
  const views: ReturnType<typeof render>[] = [];
  for (let i = 0; i < withFailingScreens; i++) views.push(render(<Probe />));
  // Deixa a primeira carga de cada tela (que falha e chama `setStatus`) de
  // fato assentar — sem isto, o efeito de `useAutoRetry` ainda não tinha
  // visto `status !== 'ok'` quando o salto de tempo abaixo começava, e o
  // teste passava mesmo com o defeito (nenhuma tela chegava a agendar nada).
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  // Em passos de 5s (o menor intervalo de AUTO_RETRY_DELAYS_MS), não num
  // salto único: um timer novo, criado por um `setTimeout` que dispara
  // durante um salto grande, corre risco de não sobrar tempo suficiente
  // dentro do MESMO salto pra ser executado de novo.
  for (let i = 0; i < 60; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
  }

  const op = sq.getOps('u1')[0];
  return { state: op?.state, attempts: op?.attempts, ops: sq.getOps('u1').length };
}

describe('45-G — timer de useAutoRetry não força a fila (rodada 2, item 2)', () => {
  it('1 tela falhando, 5 min: mesmo estado e mesma contagem de tentativas do controle sem tela', async () => {
    const control = await scenario(0);
    const withOneScreen = await scenario(1);
    expect(withOneScreen).toEqual(control);
  });

  it('3 telas falhando, 5 min: mesmo estado e mesma contagem de tentativas do controle sem tela', async () => {
    const control = await scenario(0);
    const withThreeScreens = await scenario(3);
    expect(withThreeScreens).toEqual(control);
  });
});
