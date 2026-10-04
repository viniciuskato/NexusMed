import React from 'react';
import { WifiOff } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Aviso discreto de quando a leitura do perfil falhou agora, mas a pessoa já
 * estava ativa (45-F, AUD-26): ela segue no app, sem perder o que fazia, e a
 * leitura é refeita sozinha.
 */
export const ProfileRefreshNotice: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { profileRefreshFailed, retryProfile } = useAuth();
  if (!profileRefreshFailed) return null;
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200 ${className}`}
    >
      <WifiOff size={16} aria-hidden="true" />
      <span className="flex-1 min-w-0">
        <strong>Não deu para confirmar sua conta agora.</strong> Você continua aqui, sem perder o que estava fazendo; tentamos de
        novo sozinhos.
      </span>
      <button
        type="button"
        onClick={() => void retryProfile()}
        className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700"
      >
        Tentar agora
      </button>
    </div>
  );
};
