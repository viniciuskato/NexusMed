import React, { useState } from 'react';
import { Wand2, Loader2, ExternalLink, Check } from 'lucide-react';
import { searchCrossRefCandidates, CrossRefCandidate } from '../../utils/crossRefLookup';
import { contentProvenanceRepository } from '../../repositories/ContentProvenanceRepository';
import { materialsRepository } from '../../repositories/MaterialsRepository';
import { getErrorMessage } from '../../utils/errorMessage';

// ============================================================================
// CrossRefSourceLookup
// ============================================================================
//
// Complemento ao SourceSelector dentro de MaterialReferencesPanel: quando a
// referência não está no catálogo interno (`sources`), busca candidatos
// reais no CrossRef a partir do texto da citação. A busca nunca decide
// sozinha — sempre mostra os candidatos (título, periódico, ano, DOI) e
// exige que um humano escolha qual (ou nenhum) corresponde de fato à
// citação, e qual `tipo` de documento é (a API não classifica isso). Só ao
// confirmar cria uma fonte nova no catálogo (verificacao =
// 'verificada_por_busca_resumo') e associa a esta referência.
// ============================================================================

const TIPO_OPTIONS: { value: string; label: string }[] = [
  { value: 'diretriz_consenso', label: 'Diretriz/Consenso' },
  { value: 'ensaio_clinico_randomizado', label: 'Ensaio clínico randomizado' },
  { value: 'revisao_sistematica_com_metanalise', label: 'Revisão sistemática com metanálise' },
  { value: 'revisao_sistematica', label: 'Revisão sistemática' },
  { value: 'revisao_narrativa', label: 'Revisão narrativa' },
  { value: 'artigo_revisao', label: 'Artigo de revisão' },
  { value: 'livro_texto', label: 'Livro-texto' },
  { value: 'material_de_aula', label: 'Material de aula' },
  { value: 'material_interno', label: 'Material interno' },
  { value: 'padrao_tecnico', label: 'Padrão técnico' },
  { value: 'ensaio', label: 'Ensaio' },
];

interface CrossRefSourceLookupProps {
  referenceId: string;
  citationText: string;
  onLinked: () => void;
}

export default function CrossRefSourceLookup({ referenceId, citationText, onLinked }: CrossRefSourceLookupProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'results' | 'error'>('idle');
  const [candidates, setCandidates] = useState<CrossRefCandidate[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [chosen, setChosen] = useState<CrossRefCandidate | null>(null);
  const [tipo, setTipo] = useState('');
  const [confirming, setConfirming] = useState(false);

  const runSearch = async () => {
    setState('loading');
    setErrorMsg(null);
    try {
      const results = await searchCrossRefCandidates(citationText);
      setCandidates(results);
      setState('results');
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
      setState('error');
    }
  };

  const confirm = async () => {
    if (!chosen || !tipo) return;
    setConfirming(true);
    setErrorMsg(null);
    try {
      const source = await contentProvenanceRepository.createSourceFromLookup({
        citationText,
        tipo,
        doi: chosen.doi,
      });
      await materialsRepository.updateMaterialReferenceSource(referenceId, source.id, null);
      onLinked();
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setConfirming(false);
    }
  };

  if (state === 'idle') {
    return (
      <button
        type="button"
        onClick={runSearch}
        className="px-2.5 py-1.5 rounded border border-teal-300 dark:border-teal-800 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
      >
        <Wand2 className="w-3.5 h-3.5" />
        Buscar automaticamente (CrossRef)
      </button>
    );
  }

  if (state === 'loading') {
    return (
      <p className="flex items-center gap-1.5 text-stone-500 dark:text-slate-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando no CrossRef…
      </p>
    );
  }

  if (state === 'error') {
    return (
      <div className="space-y-1.5">
        <p className="text-red-600 dark:text-red-400">Busca falhou: {errorMsg}</p>
        <button type="button" onClick={runSearch} className="text-teal-700 dark:text-teal-400 underline cursor-pointer">
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-stone-200 dark:border-[#243452] p-2.5">
      {candidates.length === 0 ? (
        <p className="text-stone-500 dark:text-slate-400">Nenhum candidato encontrado no CrossRef para este texto.</p>
      ) : (
        <>
          <p className="text-[10px] text-amber-700 dark:text-amber-400">
            Confira com atenção: buscas bibliográficas às vezes retornam reedições, traduções ou resumos de
            terceiros em vez do documento original. Só confirme se tiver certeza de que é a fonte primária.
          </p>
          <ul className="space-y-1.5">
            {candidates.map((c) => (
              <li key={c.doi}>
                <button
                  type="button"
                  onClick={() => {
                    setChosen(c);
                    setTipo('');
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded border cursor-pointer ${
                    chosen?.doi === c.doi
                      ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/40'
                      : 'border-stone-200 dark:border-[#243452] hover:bg-stone-50 dark:hover:bg-[#1A2845]'
                  }`}
                >
                  <p className="text-stone-800 dark:text-slate-200 font-semibold">{c.title}</p>
                  <p className="text-[10px] text-stone-400 flex flex-wrap items-center gap-x-2">
                    {c.containerTitle && <span>{c.containerTitle}</span>}
                    {c.year && <span>{c.year}</span>}
                    <span className="flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" />
                      {c.doi}
                    </span>
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {chosen && (
        <div className="flex items-center gap-1.5 pt-1 border-t border-stone-200 dark:border-[#243452]">
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="flex-1 px-2 py-1.5 rounded border border-stone-200 dark:border-[#243452] bg-white dark:bg-[#0B1424] text-stone-900 dark:text-slate-100"
          >
            <option value="">Tipo de documento…</option>
            {TIPO_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!tipo || confirming}
            onClick={confirm}
            className="px-2.5 py-1.5 rounded bg-teal-700 hover:bg-teal-800 text-white font-semibold cursor-pointer disabled:opacity-50 flex items-center gap-1 shrink-0"
          >
            <Check className="w-3.5 h-3.5" /> Confirmar e criar fonte
          </button>
        </div>
      )}

      {errorMsg && state === 'results' && <p className="text-red-600 dark:text-red-400">{errorMsg}</p>}
    </div>
  );
}
