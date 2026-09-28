// ============================================================================
// connectivity — leitura do servidor sem cópia local (45-G, D-2)
// ============================================================================
//
// Desde a 45-G a leitura não cai mais numa cópia local quando o servidor
// falha (D-2: sem leitura offline, por ora). A tela que precisa buscar dado
// mostra "sem conexão", mantém o que já estava na tela e carrega sozinha
// quando a rede volta. Este módulo diz se a falha foi de rede e avisa quando
// vale tentar de novo; `useAutoRetry`, `useServerLoad` e `ConnectionNotice`
// usam isso nas telas.
//
// A gravação offline não passa por aqui: continua na fila (`syncQueue`).
// ============================================================================

import { classifySyncError, flush } from './syncQueue';
import { getStorageUser } from './storage';

/** Resultado da última carga: `ok`, sem rede (`offline`) ou outro erro (`error`). */
export type LoadStatus = 'ok' | 'offline' | 'error';

/** A falha de leitura foi por falta de rede (ou o navegador está sem rede agora). */
export function isConnectionError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return classifySyncError(err) === 'network';
}

export function loadStatusOf(err: unknown): LoadStatus {
  return isConnectionError(err) ? 'offline' : 'error';
}

/**
 * Chama `callback` quando o navegador avisa que a rede voltou — depois de a
 * fila tentar enviar o que ficou pendente. Sem essa espera, a recarga podia
 * ler o servidor antes de a gravação feita offline chegar lá, e a tela
 * desfaria o que o estudante acabou de marcar. Devolve o cancelamento.
 */
export function onReconnect(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  let active = true;
  const handler = () => {
    const uid = getStorageUser();
    void (uid ? flush(uid, true) : Promise.resolve())
      .catch(() => undefined)
      .then(() => {
        if (active) callback();
      });
  };
  window.addEventListener('online', handler);
  return () => {
    active = false;
    window.removeEventListener('online', handler);
  };
}

// "Tentar agora" do aviso vale para todas as cargas que falharam na tela, não
// só para a do componente que desenhou o aviso (só um aviso aparece por vez —
// ver ConnectionNotice).
const RETRY_ALL_EVENT = 'synapse:retry-failed-loads';

/** Pede a todas as cargas que falharam na tela que tentem de novo agora. */
export function requestRetryAll(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(RETRY_ALL_EVENT));
}

export function onRetryAll(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(RETRY_ALL_EVENT, callback);
  return () => window.removeEventListener(RETRY_ALL_EVENT, callback);
}
