import { createPortal } from 'react-dom';
import React, { useEffect, useRef, useCallback } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { AmbiguousRecoveryEntry, resolveAmbiguousSubmitAsNew, resolveAmbiguousKeepLocalOnly } from '../../services/legacyRecovery';

// ============================================================================
// Diálogo de recuperação legada ambígua (Prompt 07-C, Problema 2).
//
// Cobre o caso em que existe progresso local de resposta a uma questão que
// não pôde ser comparado com segurança ao histórico remoto (ver
// src/services/legacyRecovery.ts, `compareAttempt`). Antes desta entrega
// isso só aparecia em `console.warn` — o estudante nunca sabia que havia
// uma decisão pendente. Nunca expõe questionId/clientOpId; nenhuma opção
// apaga o registro local original.
// ============================================================================

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function formatApproxDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'data desconhecida';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface LegacyRecoveryDialogProps {
  userId: string;
  items: AmbiguousRecoveryEntry[];
  onClose: () => void;
}

export const LegacyRecoveryDialog: React.FC<LegacyRecoveryDialogProps> = ({ userId, items, onClose }) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    // Guardado antes de tornar #root inerte: é para onde o foco volta ao fechar.
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const appRoot = document.getElementById('root');
    const wasInert = appRoot?.inert ?? false;
    if (appRoot) appRoot.inert = true;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const getFocusable = (): HTMLElement[] =>
      dialogRef.current ? Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : [];
    const raf = requestAnimationFrame(() => (getFocusable()[0] ?? dialogRef.current)?.focus());

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = getFocusable();
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', handleKeyDown, true);
      if (appRoot) appRoot.inert = wasInert;
      document.body.style.overflow = oldOverflow;
      // Só depois de remover o inert — foco em elemento inerte é ignorado.
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [handleClose]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100] bg-black/30" onClick={handleClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="legacy-recovery-title"
        tabIndex={-1}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[min(28rem,calc(100vw-2rem))] bg-white dark:bg-[#0F172A] rounded-2xl border border-slate-200 dark:border-[#243452] elev-lg p-4 text-sm max-h-[calc(100dvh-2rem)] overflow-y-auto focus:outline-hidden"
      >
        <div className="flex items-start justify-between mb-3 gap-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p id="legacy-recovery-title" className="font-bold text-slate-800 dark:text-slate-100">Progresso antigo para revisar</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Encontramos {items.length === 1 ? 'uma resposta' : `${items.length} respostas`} salva{items.length === 1 ? '' : 's'} só
                neste dispositivo que não {items.length === 1 ? 'pôde' : 'puderam'} ser comparada{items.length === 1 ? '' : 's'} com
                segurança ao seu histórico já sincronizado. Nada foi apagado — escolha o que fazer com cada uma.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fechar"
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.questionId} className="rounded-xl border border-slate-200 dark:border-[#243452] p-3">
              <p className="font-medium text-slate-700 dark:text-slate-200 text-sm line-clamp-2">
                {item.questionStem ?? 'Uma questão do banco de questões'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Sua resposta local: <span className="font-semibold">alternativa {item.local.selectedOption}</span>, em{' '}
                {formatApproxDate(item.local.timestamp)}
              </p>
              <div className="flex flex-wrap gap-2 mt-2.5">
                <button
                  type="button"
                  onClick={() => resolveAmbiguousSubmitAsNew(userId, item.questionId)}
                  title="Entra no seu histórico normalmente e pode afetar XP e o caderno de erros"
                  className="min-h-9 px-3 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold"
                >
                  Enviar como nova tentativa
                </button>
                <button
                  type="button"
                  onClick={() => resolveAmbiguousKeepLocalOnly(userId, item.questionId)}
                  className="min-h-9 px-3 rounded-lg bg-slate-100 dark:bg-[#1A2845] text-slate-700 dark:text-slate-200 text-xs font-semibold"
                >
                  Manter somente neste dispositivo
                </button>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                Enviar como nova tentativa entra no seu histórico e pode afetar XP e o caderno de erros. Se preferir não decidir agora,
                fechar esta janela mantém a pendência para depois — nada é perdido.
              </p>
            </li>
          ))}
        </ul>

        <div className="flex justify-end mt-3">
          <button
            type="button"
            onClick={handleClose}
            className="min-h-9 px-3 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Decidir depois
          </button>
        </div>
      </div>
    </>,
    document.body
  );
};
