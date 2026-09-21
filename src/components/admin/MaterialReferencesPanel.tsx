import React, { useRef, useState } from 'react';
import { BookMarked, X, Link2 } from 'lucide-react';
import { Compendium, SourceSummary } from '../../types';
import { materialsRepository } from '../../repositories/MaterialsRepository';
import { getErrorMessage } from '../../utils/errorMessage';
import SourceSelector from './SourceSelector';
import CrossRefSourceLookup from './CrossRefSourceLookup';

// ============================================================================
// MaterialReferencesPanel (Prompt 21-D)
// ============================================================================
//
// Para referências de material (bibliografia em texto livre,
// material_references.citation_text) ainda sem source_id, oferece
// associação explícita a uma fonte já cadastrada em `sources` — nunca
// matching automático, sempre escolha humana via SourceSelector. Quando o
// catálogo não tem a fonte (caso mais comum), CrossRefSourceLookup
// complementa buscando candidatos reais no CrossRef — mesma regra de nunca
// decidir sozinho, só que criando a fonte no catálogo ao confirmar em vez
// de só selecionar uma já existente. Preserva texto/ordem/URL: usa
// updateMaterialReferenceSource (UPDATE direcionado por id), nunca
// saveCompendium (que reinsere seções e referências inteiras).
// ============================================================================

interface MaterialReferencesPanelProps {
  compendium: Compendium;
  onClose: () => void;
  onSaved?: () => void;
}

export default function MaterialReferencesPanel({ compendium, onClose, onSaved }: MaterialReferencesPanelProps) {
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingByIndex, setPendingByIndex] = useState<Record<number, SourceSummary | null>>({});
  const panelRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const references = compendium.references ?? [];
  const referenceSources = compendium.referenceSources ?? [];

  const handleAssociate = async (index: number) => {
    const ref = referenceSources[index];
    const chosen = pendingByIndex[index];
    if (!ref?.id || !chosen) return;
    setBusyIndex(index);
    try {
      await materialsRepository.updateMaterialReferenceSource(ref.id, chosen.id, chosen.url ?? null);
      showToast('Referência associada à fonte.');
      onSaved?.();
    } catch (err) {
      showToast(`Erro ao associar fonte: ${getErrorMessage(err)}`);
    } finally {
      setBusyIndex(null);
    }
  };

  return (
    <div
      id="material-references-panel"
      ref={panelRef}
      tabIndex={-1}
      className="bg-white dark:bg-[#0F172A] rounded-2xl border-2 border-teal-500/50 dark:border-teal-500/60 p-6 sm:p-8 elev-md space-y-5 text-xs animate-in fade-in focus:outline-none"
    >
      <div className="flex items-center justify-between border-b border-stone-200 dark:border-[#243452] pb-3">
        <div className="flex items-center gap-2">
          <BookMarked className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <h3 className="font-serif-reading text-lg font-bold text-stone-900 dark:text-slate-100">
            Referências bibliográficas — {compendium.title}
          </h3>
        </div>
        <button
          type="button"
          id="material-references-close"
          onClick={onClose}
          className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-slate-200 hover:bg-stone-100 dark:hover:bg-[#142038] cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {toast && (
        <div className="px-3 py-2 rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-semibold">
          {toast}
        </div>
      )}

      {references.length === 0 ? (
        <p className="text-stone-500 dark:text-slate-400">Este compêndio não tem referências cadastradas.</p>
      ) : (
        <ul className="space-y-3">
          {references.map((text, i) => {
            const ref = referenceSources[i];
            return (
              <li key={i} className="rounded-lg border border-stone-200 dark:border-[#243452] p-3 space-y-2">
                <p className="text-stone-700 dark:text-slate-300">{text}</p>
                {ref?.linked ? (
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold">
                    <Link2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{ref.citationText ?? ref.sourceId}</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1">
                        <SourceSelector
                          id={`material-ref-source-${i}`}
                          selected={pendingByIndex[i] ?? null}
                          onSelect={(s) => setPendingByIndex((prev) => ({ ...prev, [i]: s }))}
                          onClear={() => setPendingByIndex((prev) => ({ ...prev, [i]: null }))}
                          disabled={busyIndex === i}
                        />
                      </div>
                      <button
                        type="button"
                        disabled={busyIndex === i || !pendingByIndex[i]}
                        onClick={() => handleAssociate(i)}
                        className="px-2.5 py-1.5 rounded bg-teal-700 hover:bg-teal-800 text-white font-semibold cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        Associar
                      </button>
                    </div>
                    {!pendingByIndex[i] && ref?.id && (
                      <>
                        <p className="text-stone-400">Fonte não cadastrada no catálogo?</p>
                        <CrossRefSourceLookup
                          referenceId={ref.id}
                          citationText={text}
                          onLinked={() => {
                            showToast('Fonte criada a partir do CrossRef e associada à referência.');
                            onSaved?.();
                          }}
                        />
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
