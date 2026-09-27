import React from 'react';
import { WifiOff, AlertTriangle } from 'lucide-react';
import { LoadStatus } from '../../services/connectivity';

// Aviso de carga que não veio do servidor (45-G, D-2). Sem leitura offline:
// a tela diz "sem conexão" em vez de mostrar dado vazio ou velho sem aviso, e
// recarrega sozinha quando a rede volta (quem usa passa `onRetry`, e o
// `useServerLoad` já refaz a carga no evento `online`).

interface ConnectionNoticeProps {
  status: LoadStatus;
  onRetry: () => void;
  className?: string;
}

export const ConnectionNotice: React.FC<ConnectionNoticeProps> = ({ status, onRetry, className = '' }) => {
  if (status === 'ok') return null;
  const offline = status === 'offline';
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
            <strong>Sem conexão.</strong> O que já está na tela continua aqui; o resto carrega sozinho quando a rede voltar. Respostas,
            anotações, favoritos e leitura que você marcar agora sobem depois.
          </>
        ) : (
          <>
            <strong>Não foi possível carregar agora.</strong> Tente de novo em instantes.
          </>
        )}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700"
      >
        Tentar agora
      </button>
    </div>
  );
};
