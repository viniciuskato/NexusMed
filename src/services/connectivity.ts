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
 * Tenta subir o que ficou pendente na fila offline (`flush(uid, force:
 * true)`, ignorando o backoff normal de cada operação — só se justifica
 * pelos MESMOS sinais fortes e explícitos que `syncQueue.flush` documenta:
 * o evento `online` real, a aba voltando a ficar visível, ou um clique
 * explícito em "Tentar agora") e só então chama `callback` — nunca relê o
 * servidor antes disso: a releitura podia chegar antes da gravação feita
 * offline, e a tela desfaria o que o estudante acabou de marcar. O timer
 * automático de `useAutoRetry` NUNCA passa por aqui: forçar a cada 5-60s só
 * por tempo passando gastaria tentativa da fila sem um sinal real de que a
 * causa do erro mudou (revisão do #93/rodada 2, item 2) — esse caso já é
 * coberto pelo heartbeat de 60s da própria fila, que respeita o backoff.
 */
export function retryWithFlush(callback: () => void): void {
  const uid = getStorageUser();
  void (uid ? flush(uid, true) : Promise.resolve())
    .catch(() => undefined)
    .then(() => callback());
}

/**
 * Chama `callback` quando o navegador avisa que a rede voltou — depois de a
 * fila tentar enviar o que ficou pendente (`retryWithFlush`). Devolve o
 * cancelamento.
 */
export function onReconnect(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  let active = true;
  const handler = () => retryWithFlush(() => {
    if (active) callback();
  });
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
