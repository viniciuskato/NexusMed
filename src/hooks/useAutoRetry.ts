import { useEffect, useLayoutEffect, useRef } from 'react';
import { LoadStatus, onReconnect, onRetryAll, retryWithFlush } from '../services/connectivity';

/** Espera entre as novas tentativas automáticas, crescendo até o teto. */
export const AUTO_RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 40_000, 60_000] as const;

/**
 * Enquanto `status` não for `ok`, chama `retry` sozinho (45-G, D-2):
 * - quando o navegador avisa que a rede voltou (`online`);
 * - de tempos em tempos, com espera crescente — o servidor pode estar fora com
 *   `navigator.onLine` verdadeiro (Supabase fora, DNS, portal cativo), e aí o
 *   evento `online` nunca chega;
 * - quando a aba volta a ficar visível;
 * - quando o estudante toca em "Tentar agora" em qualquer aviso da tela.
 * Uma só implementação para todas as cargas da tela.
 */
export function useAutoRetry(status: LoadStatus, retry: () => void): void {
  const retryRef = useRef(retry);
  useLayoutEffect(() => {
    retryRef.current = retry;
  });

  useEffect(() => {
    if (status === 'ok') return;
    // O heartbeat periódico (60s, `syncQueue.ts`) já flusha a fila sozinho,
    // respeitando o backoff de cada operação pendente. O timer daqui embaixo
    // NUNCA força esse flush (`force`, em `syncQueue.flush`, é só pra sinais
    // fortes e explícitos: `online` real e a aba voltando a ficar visível —
    // ver o comentário de `flush` em syncQueue.ts) — forçar a cada 5-60s só
    // por tempo passando gastaria tentativa da fila sem motivo (revisão do
    // #93/rodada 2, item 2) e não é o que este timer decide: ele só relê.
    const fire = () => retryRef.current();
    let round = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      const delay = AUTO_RETRY_DELAYS_MS[Math.min(round, AUTO_RETRY_DELAYS_MS.length - 1)];
      timer = setTimeout(() => {
        round += 1;
        fire();
        schedule();
      }, delay);
    };
    schedule();

    // `online` (`onReconnect`) e a aba voltando a ficar visível são os dois
    // sinais fortes que force o flush antes de reler (mesma lista do
    // `syncQueue.flush`); "Tentar agora" é um clique explícito do estudante,
    // tratado com a mesma força.
    const offReconnect = onReconnect(() => retryRef.current());
    const offRetryAll = onRetryAll(() => retryWithFlush(() => retryRef.current()));
    const onVisible = () => {
      if (document.visibilityState === 'visible') retryWithFlush(() => retryRef.current());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      offReconnect();
      offRetryAll();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [status]);
}
