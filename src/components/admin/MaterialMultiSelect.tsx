import React, { useState } from 'react';
import { Search, X } from 'lucide-react';
import { Compendium } from '../../types';

interface MaterialMultiSelectProps {
  label: string;
  helperText?: string;
  options: Compendium[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Materiais já escolhidos na OUTRA lista (prerequisite/related) — um par só pode ter uma relação (ver material_links_pair_unique). */
  excludeIds: string[];
  htmlId: string;
}

/**
 * Seletor de materiais por busca + checkbox — usado pelos dois multi-select
 * de navegação (Estude antes / Veja também). Sempre seleção por id, nunca
 * título digitado (renomear um material não pode quebrar o vínculo).
 * Checkboxes nativos: acessível sem precisar de useDialogA11y (não é modal).
 */
export function MaterialMultiSelect({ label, helperText, options, selectedIds, onChange, excludeIds, htmlId }: MaterialMultiSelectProps) {
  const [query, setQuery] = useState('');

  const selected = options.filter((o) => selectedIds.includes(o.id));
  const filtered = options
    .filter((o) => !selectedIds.includes(o.id))
    .filter((o) => !excludeIds.includes(o.id))
    .filter((o) => o.title.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))
    .slice(0, 30);

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  return (
    <div>
      <label className="font-bold text-stone-700 dark:text-slate-300 block mb-1" htmlFor={`${htmlId}-search`}>
        {label}
      </label>
      {helperText && <p className="text-[11px] text-stone-500 dark:text-slate-400 mb-1.5">{helperText}</p>}

      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => toggle(s.id)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300 text-[11px] font-medium cursor-pointer"
                title="Remover"
              >
                <span>{s.title}</span>
                {s.publicationStatus !== 'published' && (
                  <span className="text-amber-600 dark:text-amber-400" title="Rascunho — fica invisível para o estudante até ser publicado">
                    (rascunho)
                  </span>
                )}
                <X className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 dark:text-slate-500" />
        <input
          id={`${htmlId}-search`}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar material para selecionar..."
          className="w-full pl-8 pr-2.5 py-2 rounded-lg border border-stone-200 dark:border-[#243452] bg-stone-50 dark:bg-[#142038] text-stone-900 dark:text-slate-100 text-xs"
        />
      </div>
      {query.trim() && (
        <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-stone-200 dark:border-[#243452] divide-y divide-stone-100 dark:divide-[#1a2740]">
          {filtered.length === 0 ? (
            <li className="p-2 text-[11px] text-stone-500 dark:text-slate-400">Nenhum material encontrado.</li>
          ) : (
            filtered.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => {
                    toggle(o.id);
                    setQuery('');
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-stone-800 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-[#1a2740] cursor-pointer flex items-center justify-between gap-2"
                >
                  <span>{o.title}</span>
                  {o.publicationStatus !== 'published' && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0">rascunho</span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
