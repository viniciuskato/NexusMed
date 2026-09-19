import { createPortal } from 'react-dom';
import React, { useState, useRef, useEffect, useCallback, useId } from 'react';
import { AlertCircle, X, Send, CheckCircle2 } from 'lucide-react';
import { feedbackRepository } from '../../repositories/FeedbackRepository';
import { useAuth } from '../../contexts/AuthContext';

const TAGS = [
  'Gabarito errado',
  'Explicação confusa',
  'Questão ambígua',
  'Erro de digitação',
  'Imagem não carrega',
  'Outro',
] as const;

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ContextualFeedbackPopoverProps {
  questionId?: string;
  materialId?: string;
  label?: string;
  variant?: 'pill' | 'subtle' | 'compact';
  className?: string;
}

// Botão de feedback contextual: visível, acolhedor e de baixíssima fricção (1-2 cliques)
// para que quem identificar um erro possa reportá-lo imediatamente sem esforço.
export const ContextualFeedbackPopover: React.FC<ContextualFeedbackPopoverProps> = ({
  questionId,
  materialId,
  label,
  variant = 'pill',
  className,
}) => {
  const { user, profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<(typeof TAGS)[number] | null>(null);
  const [freeText, setFreeText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogTitleId = useId();

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSelectedTag(null);
    setFreeText('');
    setSubmitted(false);
  }, []);

  const handleSubmit = async () => {
    if (!selectedTag) return;
    setIsSubmitting(true);
    try {
      await feedbackRepository.saveFeedback({
        id: crypto.randomUUID(),
        type: 'problema',
        title: selectedTag,
        description: freeText.trim() || selectedTag,
        createdAt: new Date().toISOString(),
        userId: user?.id || null,
        userEmail: user?.email || profile?.email || null,
        questionId: questionId ?? null,
        materialId: materialId ?? null,
        status: 'pendente',
      });
      setSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Diálogo modal: foco inicial no primeiro controle, Tab/Shift+Tab presos
  // dentro do diálogo, Escape fecha, e o foco volta ao gatilho ao fechar
  // (clique fora, X, Escape ou envio) — vale tanto no leitor de compêndio
  // quanto no cartão de questão, os dois usos deste componente.
  useEffect(() => {
    if (!isOpen) return;

    const appRoot = document.getElementById('root');
    const wasInert = appRoot?.inert ?? false;
    if (appRoot) appRoot.inert = true;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const getFocusable = (): HTMLElement[] => {
      if (!dialogRef.current) return [];
      return Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    };

    const focusFirst = () => {
      const items = getFocusable();
      (items[0] ?? dialogRef.current)?.focus();
    };
    // Aguarda o próximo frame para garantir que o diálogo já está no DOM.
    const raf = requestAnimationFrame(focusFirst);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
        return;
      }
      if (e.key === 'Tab') {
        const items = getFocusable();
        if (items.length === 0) return;
        const first: HTMLElement = items[0];
        const last: HTMLElement = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
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
      triggerRef.current?.focus();
    };
  }, [isOpen, submitted, handleClose]);

  return (
    <div className="relative inline-block">
      {variant === 'pill' && (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          style={{ minHeight: 36 }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200/90 dark:border-[#243452] bg-white dark:bg-[#142038] hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 dark:hover:bg-rose-950/40 dark:hover:text-rose-300 dark:hover:border-rose-800 text-xs font-semibold text-slate-600 dark:text-slate-300 transition-all cursor-pointer shadow-2xs ${className || ''}`}
          title={questionId ? 'Reportar erro ou inconsistência nesta questão' : 'Reportar erro ou inconsistência neste conteúdo'}
        >
          <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          <span>{label || 'Reportar erro'}</span>
        </button>
      )}

      {variant === 'subtle' && (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          style={{ minHeight: 36 }}
          className={`inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 font-medium transition-colors cursor-pointer py-1 px-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 ${className || ''}`}
          title={questionId ? 'Reportar erro ou inconsistência nesta questão' : 'Reportar erro ou inconsistência neste conteúdo'}
        >
          <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          <span>{label || 'Identificou um erro? Avise-nos'}</span>
        </button>
      )}

      {variant === 'compact' && (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          style={{ minWidth: 36, minHeight: 36 }}
          className={`p-1.5 rounded-xl border border-slate-200 dark:border-[#243452] hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 text-slate-400 dark:text-slate-400 flex items-center justify-center transition-colors cursor-pointer ${className || ''}`}
          title={label || 'Reportar erro neste item'}
        >
          <AlertCircle className="w-4 h-4 text-rose-500" />
        </button>
      )}

      {isOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[100] bg-slate-900/40 dark:bg-black/60 backdrop-blur-2xs" onClick={handleClose} aria-hidden="true" />
          {/* Modal centralizado na viewport, fora de qualquer containing block
              criado por backdrop-filter nos pais. */}
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            tabIndex={-1}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[min(22rem,calc(100vw-2rem))] sm:w-80 bg-white dark:bg-[#0F172A] rounded-2xl border border-slate-200 dark:border-[#243452] elev-2xl p-4 sm:p-5 text-xs animate-in fade-in max-h-[calc(100dvh-2rem)] overflow-y-auto focus:outline-hidden shadow-2xl"
          >
            {submitted ? (
              <div className="text-center py-4 space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-300 dark:border-emerald-800">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 id={dialogTitleId} className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Obrigado! Relato registrado.
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Nossa equipe médica/editorial analisa cada apontamento para manter a precisão do NexusMed.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#142038] dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer"
                >
                  Concluir
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-[#243452]">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center border border-rose-200 dark:border-rose-900/60">
                      <AlertCircle className="w-4 h-4" />
                    </div>
                    <div>
                      <span id={dialogTitleId} className="font-bold text-xs text-slate-900 dark:text-slate-100 block">
                        {questionId ? 'Reportar Erro na Questão' : 'Reportar Inconsistência'}
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                        Aviso direto à equipe editorial
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    aria-label="Fechar"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1.5 mb-3">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                    Selecione o problema identificado:
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {TAGS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setSelectedTag(tag)}
                        className={`min-h-10 py-1.5 px-2 rounded-xl text-left text-[11px] font-semibold border transition-all cursor-pointer flex items-center justify-between gap-1 ${
                          selectedTag === tag
                            ? 'bg-rose-50 text-rose-900 border-rose-300 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-800 shadow-xs'
                            : 'bg-slate-50/80 dark:bg-[#142038] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#243452] hover:bg-slate-100 dark:hover:bg-[#1A2845]'
                        }`}
                      >
                        <span className="line-clamp-1">{tag}</span>
                        {selectedTag === tag && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1 mb-3">
                  <textarea
                    value={freeText}
                    onChange={(e) => setFreeText(e.target.value)}
                    placeholder="Mais detalhes (opcional — você já pode enviar com 1 toque no botão abaixo)"
                    aria-label="Detalhes do problema (opcional)"
                    rows={2}
                    maxLength={500}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-[#243452] bg-slate-50 dark:bg-[#0B1220] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 text-[11px] resize-none focus:outline-hidden focus:ring-1 focus:ring-rose-500"
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-[#243452]">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    {!selectedTag ? 'Escolha uma tag acima' : 'Pronto para enviar'}
                  </span>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!selectedTag || isSubmitting}
                    className="min-h-10 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSubmitting ? 'Enviando...' : 'Enviar Relato'}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </>, document.body
      )}
    </div>
  );
};
