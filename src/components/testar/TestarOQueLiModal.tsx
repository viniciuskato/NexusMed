import React, { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, HelpCircle, Play, X } from 'lucide-react';
import type { Compendium, Question, Theme } from '../../types';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { leiturasRepository } from '../../repositories/LeiturasRepository';
import { materiaisLidosHoje, questoesParaTestar } from '../../services/testarOQueLi';

// 43-C — "Testar o que li": os materiais lidos hoje, todos marcados; o
// estudante desmarca o que quiser, vê quantas questões entram e começa. A
// sessão é a lista de questões recortada (`onStart`), onde errar já gera
// flashcard como em qualquer questão.

interface TestarOQueLiModalProps {
  compendiums: Compendium[];
  themes: Theme[];
  questions: Question[];
  onClose: () => void;
  onStart: (questionIds: string[]) => void;
  onOpenQuestionsForTheme: (themeId: string) => void;
}

type Carga = { estado: 'carregando' } | { estado: 'erro' } | { estado: 'ok'; lidos: string[] };

export const TestarOQueLiModal: React.FC<TestarOQueLiModalProps> = ({
  compendiums,
  themes,
  questions,
  onClose,
  onStart,
  onOpenQuestionsForTheme,
}) => {
  const dialogRef = useDialogA11y<HTMLDivElement>({ onClose });
  const [carga, setCarga] = useState<Carga>({ estado: 'carregando' });
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setCarga({ estado: 'carregando' });
    leiturasRepository.getLeituras().then(
      (leituras) => {
        if (cancelled) return;
        // Só materiais que o estudante ainda consegue abrir.
        const ids = new Set(compendiums.map((c) => c.id));
        setCarga({ estado: 'ok', lidos: materiaisLidosHoje(leituras).filter((id) => ids.has(id)) });
      },
      () => {
        if (!cancelled) setCarga({ estado: 'erro' });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [compendiums, tentativa]);

  const lidos = useMemo(() => (carga.estado === 'ok' ? carga.lidos : []), [carga]);
  const marcados = useMemo(() => lidos.filter((id) => !desmarcados.has(id)), [lidos, desmarcados]);
  const selecionadas = useMemo(() => questoesParaTestar(questions, marcados), [questions, marcados]);

  const temasMarcados = [...new Set(marcados.map((id) => compendiums.find((c) => c.id === id)?.themeId).filter(Boolean))] as string[];

  const alternar = (id: string) =>
    setDesmarcados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="testar-o-que-li-title"
        className="w-full max-w-lg bg-white dark:bg-[#0F172A] rounded-3xl elev-2xl border border-slate-200 dark:border-[#243452] overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-5 bg-gradient-to-r from-teal-900 via-slate-900 to-teal-950 text-white flex items-center justify-between border-b border-teal-800/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-teal-500/20 text-teal-300 border border-teal-400/30">
              <BookOpenCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 id="testar-o-que-li-title" className="text-base font-bold">Testar o que li</h3>
              <p className="text-xs text-slate-300">Questões dos materiais que você leu hoje.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 rounded-full hover:bg-white/10 text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-sm text-slate-700 dark:text-slate-200">
          {carga.estado === 'carregando' && (
            <p role="status" className="text-slate-500 dark:text-slate-400">Carregando suas leituras de hoje…</p>
          )}

          {carga.estado === 'erro' && (
            <div role="alert" className="space-y-3">
              <p>Não foi possível carregar suas leituras de hoje. Confira a conexão e tente de novo.</p>
              <button
                type="button"
                onClick={() => setTentativa((n) => n + 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-[#263244] hover:bg-slate-50 dark:hover:bg-[#182235] text-xs font-semibold cursor-pointer"
              >
                Tentar de novo
              </button>
            </div>
          )}

          {carga.estado === 'ok' && lidos.length === 0 && (
            <p>
              Nenhum material lido hoje. Marque as seções como lidas no leitor e volte aqui para testar o que
              leu.
            </p>
          )}

          {carga.estado === 'ok' && lidos.length > 0 && (
            <>
              <fieldset className="space-y-2">
                <legend className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Lidos hoje
                </legend>
                {lidos.map((id) => {
                  const material = compendiums.find((c) => c.id === id);
                  return (
                    <label
                      key={id}
                      className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-[#243452] hover:bg-slate-50 dark:hover:bg-[#182235] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={!desmarcados.has(id)}
                        onChange={() => alternar(id)}
                        className="w-4 h-4 accent-teal-600"
                      />
                      <span className="font-medium">{material?.title ?? 'Material'}</span>
                    </label>
                  );
                })}
              </fieldset>

              {marcados.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400">Marque ao menos um material.</p>
              ) : selecionadas.length > 0 ? (
                <p className="font-semibold" aria-live="polite">
                  {selecionadas.length === 1 ? '1 questão disponível' : `${selecionadas.length} questões disponíveis`}
                </p>
              ) : (
                <div className="space-y-3" aria-live="polite">
                  <p>Nenhuma questão cobra os materiais marcados ainda.</p>
                  <div className="flex flex-wrap gap-2">
                    {temasMarcados.map((themeId) => (
                      <button
                        key={themeId}
                        type="button"
                        onClick={() => onOpenQuestionsForTheme(themeId)}
                        className="px-3 py-1.5 rounded-lg bg-[#0F766E] hover:bg-teal-800 dark:bg-[#14B8A6] dark:hover:bg-teal-400 text-white dark:text-[#0B1220] text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span>
                          Resolver questões do tema
                          {temasMarcados.length > 1 && `: ${themes.find((t) => t.id === themeId)?.name ?? ''}`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-[#243452] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 font-semibold text-xs transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          {selecionadas.length > 0 && (
            <button
              type="button"
              onClick={() => onStart(selecionadas.map((q) => q.id))}
              className="px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-bold text-xs elev-md transition-all flex items-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4" />
              Começar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
