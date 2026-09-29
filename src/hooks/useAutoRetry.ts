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
    // Toda nova tentativa relê só depois de a fila offline tentar subir o
    // que está pendente — como o evento `online` (`onReconnect`) já fazia
    // (revisão do #93, item 3).
    const fire = () => retryWithFlush(() => retryRef.current());
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

    const offReconnect = onReconnect(() => retryRef.current());
    const offRetryAll = onRetryAll(fire);
    const onVisible = () => {
      if (document.visibilityState === 'visible') fire();
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
