import React, { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { SourceSummary } from '../../types';
import { contentProvenanceRepository } from '../../repositories/ContentProvenanceRepository';

// ============================================================================
// SourceSelector (Prompt 21-D)
// ============================================================================
//
// Seletor pesquisável de `sources`, reusado pelo painel de revisão (vínculo
// claim -> fonte) e pela associação de referência de material -> fonte.
// Busca por título/autoria/ano (embutidos em citation_text, o catálogo não
// tem campos estruturados separados) ou DOI/URL. Sem CRUD de fontes — se o
// catálogo não tiver a fonte procurada, mostra "fonte não cadastrada" e para
// por aí (nenhuma criação nem metadado inventado).
// ============================================================================

interface SourceSelectorProps {
  id?: string;
  selected: SourceSummary | null;
  onSelect: (source: SourceSummary) => void;
  onClear?: () => void;
  disabled?: boolean;
}

export default function SourceSelector({ id, selected, onSelect, onClear, disabled }: SourceSelectorProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SourceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [searched, setSearched] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const r = await contentProvenanceRepository.searchSources(query);
        if (!cancelled) setResults(r);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setSearched(true);
        }
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, open]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {selected ? (
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded border border-teal-200 dark:border-teal-900 bg-teal-50 dark:bg-teal-950/40">
          <div className="flex-1 min-w-0">
            <p className="text-stone-800 dark:text-slate-200 font-semibold truncate">{selected.citationText}</p>
            {selected.url && (
              <a
                href={selected.url}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-teal-700 dark:text-teal-400 underline"
              >
                {selected.url}
              </a>
            )}
          </div>
          {!disabled && onClear && (
            <button
              type="button"
              onClick={onClear}
              className="p-1 rounded text-stone-400 hover:text-stone-700 dark:hover:text-slate-200 cursor-pointer shrink-0"
              title="Trocar fonte"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2 top-2" />
          <input
            id={id}
            type="text"
            disabled={disabled}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="Buscar fonte por título, autoria, ano, DOI ou URL..."
            className="w-full pl-7 pr-2 py-1.5 rounded border border-stone-200 dark:border-[#243452] bg-white dark:bg-[#0B1424] text-stone-900 dark:text-slate-100 disabled:opacity-50"
          />
        </div>
      )}

      {open && !selected && (
        <div className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-stone-200 dark:border-[#243452] bg-white dark:bg-[#0F172A] elev-md">
          {loading ? (
            <p className="px-3 py-2 text-stone-500 dark:text-slate-400">Buscando…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-stone-500 dark:text-slate-400">
              {searched ? 'Fonte não cadastrada.' : 'Digite para buscar.'}
            </p>
          ) : (
            <ul>
              {results.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(s);
                      setQuery('');
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-stone-100 dark:hover:bg-[#1A2845] border-b border-stone-100 dark:border-[#243452] last:border-b-0 cursor-pointer"
                  >
                    <p className="text-stone-800 dark:text-slate-200 font-semibold truncate">{s.citationText}</p>
                    <p className="text-[10px] text-stone-400 flex items-center gap-2">
                      <span>{s.tipo}</span>
                      {s.url && <span className="truncate">{s.url}</span>}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
