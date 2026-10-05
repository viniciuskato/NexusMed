import React, { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Layers } from 'lucide-react';
import type { DifficultyLevel, Flashcard } from '../../types';
import { flashcardsRepository } from '../../repositories/FlashcardsRepository';
import { createInitialSRS } from '../../services/srsAlgorithm';
import { useDialogA11y } from '../../hooks/useDialogA11y';

// ============================================================================
// CARD-1 — "Criar cartão": o usuário escreve a frente e o verso do próprio
// cartão, na leitura (ligado à seção) e nas questões já respondidas (ligado à
// questão). Duas caixas, Salvar e Cancelar; nada de texto automático.
//
// O id do cartão nasce quando o diálogo abre: tentar salvar de novo depois de
// uma falha reenvia o MESMO id, que o servidor trata como o mesmo cartão.
// ============================================================================

export interface OrigemDoCartao {
  disciplineId: string;
  themeId: string;
  /** Material do cartão (a seção ou a questão está ligada a ele). */
  materialId?: string;
  /** Leitura: a seção de onde o cartão veio. */
  sectionId?: string;
  /** Questões: a questão de onde o cartão veio. */
  questionId?: string;
  tags?: string[];
  difficulty?: DifficultyLevel;
}

interface CriarCartaoProps {
  origem: OrigemDoCartao;
  /** Chamado depois de o cartão ser salvo (o dono da tela mostra a confirmação). */
  onCriado: () => void;
  className?: string;
}

const BOTAO_PADRAO =
  'px-2 py-1 rounded-md text-xs font-medium text-[#64748B] dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-[#182235] flex items-center gap-1 cursor-pointer transition-colors';

const CAMPO =
  'w-full min-w-0 p-3 rounded-xl border border-slate-200 dark:border-[#243452] bg-slate-50 dark:bg-[#142038] focus:bg-white dark:focus:bg-[#1A2845] focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm text-slate-900 dark:text-slate-100';

export const CriarCartao: React.FC<CriarCartaoProps> = ({ origem, onCriado, className }) => {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className={className ?? BOTAO_PADRAO}>
        <Layers className="w-3.5 h-3.5 text-[#0F766E] dark:text-[#14B8A6]" />
        <span>Criar cartão</span>
      </button>
      {aberto &&
        createPortal(
          <DialogoDoCartao
            origem={origem}
            onFechar={() => setAberto(false)}
            onCriado={() => {
              setAberto(false);
              onCriado();
            }}
          />,
          document.body
        )}
    </>
  );
};

const DialogoDoCartao: React.FC<{ origem: OrigemDoCartao; onFechar: () => void; onCriado: () => void }> = ({
  origem,
  onFechar,
  onCriado,
}) => {
  const [frente, setFrente] = useState('');
  const [verso, setVerso] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const idDoCartao = useRef(crypto.randomUUID());
  const salvandoRef = useRef(false);
  const frenteRef = useRef<HTMLTextAreaElement>(null);
  const ids = useId();
  const tituloId = `${ids}-titulo`;
  const frenteId = `${ids}-frente`;
  const versoId = `${ids}-verso`;

  const dialogRef = useDialogA11y<HTMLDivElement>({ onClose: onFechar, initialFocusRef: frenteRef });

  const completo = frente.trim() !== '' && verso.trim() !== '';

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completo || salvandoRef.current) return;
    salvandoRef.current = true;
    setSalvando(true);
    setFalhou(false);

    const cartao: Flashcard = {
      id: idDoCartao.current,
      disciplineId: origem.disciplineId,
      themeId: origem.themeId,
      compendiumRefId: origem.materialId || undefined,
      compendiumSectionId: origem.sectionId || undefined,
      questionOriginId: origem.questionId || undefined,
      front: frente,
      back: verso,
      mechanismHighlight: '',
      tags: origem.tags ?? [],
      difficulty: origem.difficulty ?? 'medio',
      isCustom: true,
      isWritten: true,
      srs: createInitialSRS(),
    };

    try {
      await flashcardsRepository.createWrittenFlashcard(cartao);
      onCriado();
    } catch {
      salvandoRef.current = false;
      setSalvando(false);
      setFalhou(true);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden bg-white dark:bg-[#0F172A] rounded-2xl elev-2xl border border-slate-200 dark:border-[#243452] p-4 sm:p-5"
      >
        <h2 id={tituloId} className="text-base font-bold text-slate-900 dark:text-slate-100 mb-3">
          Novo cartão
        </h2>
        <form onSubmit={salvar} className="space-y-3">
          <div>
            <label htmlFor={frenteId} className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Frente
            </label>
            <textarea
              id={frenteId}
              ref={frenteRef}
              rows={3}
              value={frente}
              onChange={(e) => setFrente(e.target.value)}
              className={CAMPO}
            />
          </div>
          <div>
            <label htmlFor={versoId} className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Verso
            </label>
            <textarea
              id={versoId}
              rows={4}
              value={verso}
              onChange={(e) => setVerso(e.target.value)}
              className={CAMPO}
            />
          </div>
          {falhou && (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
              Não foi possível salvar. Tente de novo.
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onFechar}
              className="px-4 py-2 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!completo || salvando}
              className="px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
