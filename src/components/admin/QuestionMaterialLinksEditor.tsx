import React from 'react';
import { Compendium, QuestionMaterialLink } from '../../types';
import { MaterialMultiSelect } from './MaterialMultiSelect';

interface QuestionMaterialLinksEditorProps {
  compendiums: Compendium[];
  value: QuestionMaterialLink[];
  onChange: (links: QuestionMaterialLink[]) => void;
  htmlId: string;
  label?: string;
  helperText?: string;
  /** Sem seletor de seção (ex.: o lote da importação, que vale para várias questões). */
  withoutSections?: boolean;
}

/**
 * Materiais que a questão cobra (43-B): um ou vários, escolhidos por busca e
 * clique — nunca por título digitado —, com seção opcional por material. A
 * ordem da escolha é a ordem do vínculo; o primeiro é o material que o
 * cartão da questão abre.
 */
export function QuestionMaterialLinksEditor({
  compendiums,
  value,
  onChange,
  htmlId,
  label = 'Materiais cobrados',
  helperText = 'Busque e clique para escolher; a questão aparece a partir de cada material escolhido.',
  withoutSections = false,
}: QuestionMaterialLinksEditorProps) {
  const selectedIds = value.map((l) => l.materialId);

  const handleIds = (ids: string[]) => {
    // Mantém a seção já escolhida de quem continua na lista, na ordem nova.
    onChange(ids.map((id) => value.find((l) => l.materialId === id) ?? { materialId: id }));
  };

  const handleSection = (materialId: string, sectionId: string) => {
    onChange(value.map((l) => (l.materialId === materialId ? (sectionId ? { materialId, sectionId } : { materialId }) : l)));
  };

  return (
    <div className="space-y-2">
      <MaterialMultiSelect
        label={label}
        helperText={helperText}
        options={compendiums}
        selectedIds={selectedIds}
        onChange={handleIds}
        excludeIds={[]}
        htmlId={htmlId}
      />
      {!withoutSections &&
        value.map((link) => {
          const material = compendiums.find((c) => c.id === link.materialId);
          if (!material || material.sections.length === 0) return null;
          const selectId = `${htmlId}-section-${link.materialId}`;
          return (
            <div key={link.materialId}>
              <label className="font-bold text-stone-700 dark:text-slate-300 block mb-1" htmlFor={selectId}>
                Seção de {material.title} (opcional)
              </label>
              <select
                id={selectId}
                value={link.sectionId ?? ''}
                onChange={(e) => handleSection(link.materialId, e.target.value)}
                className="w-full p-2 rounded-lg border border-stone-200 dark:border-[#243452] bg-white dark:bg-[#0F172A] text-stone-900 dark:text-slate-100"
              >
                <option value="">Material inteiro</option>
                {material.sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
    </div>
  );
}
