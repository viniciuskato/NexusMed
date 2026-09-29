import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { WifiOff, AlertTriangle } from 'lucide-react';
import { LoadStatus, requestRetryAll } from '../../services/connectivity';

// Aviso de carga que não veio do servidor (45-G, D-2). Sem leitura offline:
// a tela diz "sem conexão" em vez de mostrar dado vazio ou velho sem aviso, e
// tenta de novo sozinha (`useAutoRetry`).
//
// Um aviso por vez na tela: cada carga que falhou registra o seu aqui, mas só
// um aparece — com "sem conexão" se alguma das falhas for de rede. "Tentar
// agora" pede nova tentativa a TODAS as cargas que falharam, não só à do
// componente que desenhou o aviso.

const failing = new Map<number, LoadStatus>();
const listeners = new Set<() => void>();
let nextId = 0;

function emit() {
  listeners.forEach((fn) => fn());
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
/** `<id do aviso que aparece>|<status agregado>`, ou '' quando nada falhou. */
function snapshot(): string {
  const leader = failing.keys().next();
  if (leader.done) return '';
  const aggregated = Array.from(failing.values()).includes('offline') ? 'offline' : 'error';
  return `${leader.value}|${aggregated}`;
}

interface ConnectionNoticeProps {
  status: LoadStatus;
  className?: string;
}

export const ConnectionNotice: React.FC<ConnectionNoticeProps> = ({ status, className = '' }) => {
  const [id] = useState(() => ++nextId);

  useEffect(() => {
    if (status === 'ok') return;
    failing.set(id, status);
    emit();
    return () => {
      failing.delete(id);
      emit();
    };
  }, [id, status]);

  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (status === 'ok' || !current) return null;
  const [leader, aggregated] = current.split('|');
  if (Number(leader) !== id) return null;

  const offline = aggregated === 'offline';
  const Icon = offline ? WifiOff : AlertTriangle;
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200 ${className}`}
    >
      <Icon size={16} aria-hidden="true" />
      <span className="flex-1 min-w-0">
        {offline ? (
          <>
            <strong>Sem conexão.</strong> O que já está na tela continua aqui; o resto carrega sozinho quando a conexão voltar.
            Respostas, anotações, favoritos e leitura que você marcar agora sobem depois.
          </>
        ) : (
          <>
            <strong>Não foi possível carregar agora.</strong> Tentamos de novo sozinhos em instantes.
          </>
        )}
      </span>
      <button
        type="button"
        onClick={requestRetryAll}
        className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700"
      >
        Tentar agora
      </button>
    </div>
  );
};
