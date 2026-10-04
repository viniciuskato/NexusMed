import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useDialogA11y } from '../../hooks/useDialogA11y';

interface UnsyncedLogoutDialogProps {
  /** Quantas alterações ainda não chegaram ao servidor. */
  count: number;
  /** Voltar para a conta, sem sair. */
  onCancel: () => void;
  /** Sair, deixando no aparelho o que não subiu (sobe quando a pessoa entrar de novo). */
  onKeep: () => void;
  /** Sair e apagar tudo do aparelho, inclusive o que não subiu. */
  onDiscard: () => void;
}

/**
 * Aviso de "Sair" com progresso que ainda só existe neste aparelho (45-F,
 * AUD-27). Sair apaga os dados locais da pessoa; o que não foi enviado não pode
 * sumir sem ela saber.
 */
export const UnsyncedLogoutDialog: React.FC<UnsyncedLogoutDialogProps> = ({ count, onCancel, onKeep, onDiscard }) => {
  const dialogRef = useDialogA11y<HTMLDivElement>({ onClose: onCancel });
  const alteracoes = count === 1 ? '1 alteração' : `${count} alterações`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsynced-logout-title"
        className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl elev-2xl p-6 space-y-4"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <h3 id="unsynced-logout-title" className="text-base font-bold text-slate-900 dark:text-white">
              Ainda há coisa por enviar
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {alteracoes} (respostas, anotações, cards...) ainda não {count === 1 ? 'chegou' : 'chegaram'} ao servidor — não deu para
              enviar agora. Ao sair, os dados desta conta são apagados deste aparelho. O que você quer fazer com isso?
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer transition-colors"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={onKeep}
            className="h-10 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
          >
            Sair e manter no aparelho
          </button>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 -mt-1 px-1">
            O que não subiu fica guardado e é enviado quando você entrar de novo nesta conta.
          </p>
          <button
            type="button"
            onClick={onDiscard}
            className="h-10 rounded-xl border border-rose-300 dark:border-rose-900 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer transition-colors"
          >
            Sair e apagar
          </button>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 -mt-1 px-1">
            Apaga tudo deste aparelho, inclusive o que não foi enviado. Isso não dá para desfazer.
          </p>
        </div>
      </div>
    </div>
  );
};
