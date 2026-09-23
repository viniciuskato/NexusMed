import React from 'react';
import { Link, AlertTriangle } from 'lucide-react';
import { Compendium, TaxonomyKind } from '../../types';
import { getBreadcrumbTrail, breadcrumbLabel } from '../../utils/materialTree';
import { MaterialNavigationValue, parentCandidates, validateNavigationValue } from '../../utils/materialNavigation';
import { MaterialMultiSelect } from './MaterialMultiSelect';

// ============================================================================
// Bloco "Navegação do conteúdo" — usado IGUAL no formulário de edição e no
// modal "Importar material". Um lugar só para os campos, a validação ao vivo e
// a trilha resultante: antes o bloco vivia inline no AdminCMSView e a
// importação não tinha nenhum deles, o que obrigava a abrir cada material
// importado de novo só para posicioná-lo.
// ============================================================================

interface MaterialNavigationFieldsProps {
  value: MaterialNavigationValue;
  onChange: (next: MaterialNavigationValue) => void;
  compendiums: Compendium[];
  /** Disciplina do material em edição/importação — o pai precisa ser da mesma. */
  disciplineId: string;
  /** null quando o material ainda não existe (importação, criação). */
  selfId: string | null;
  /** Título atual, só para a prévia da trilha. */
  currentTitle: string;
  /** Prefixo dos ids de input — dois blocos na mesma página não podem colidir. */
  idPrefix: string;
}

const inputClass =
  'w-full p-2.5 rounded-lg border border-stone-200 dark:border-[#243452] bg-stone-50 dark:bg-[#142038] text-stone-900 dark:text-slate-100 text-xs';
const labelClass = 'font-bold text-stone-700 dark:text-slate-300 block mb-1';
const helpClass = 'text-[11px] text-stone-500 dark:text-slate-400 mt-1';

export const MaterialNavigationFields: React.FC<MaterialNavigationFieldsProps> = ({
  value,
  onChange,
  compendiums,
  disciplineId,
  selfId,
  currentTitle,
  idPrefix,
}) => {
  const set = <K extends keyof MaterialNavigationValue>(key: K, v: MaterialNavigationValue[K]) =>
    onChange({ ...value, [key]: v });

  const candidates = parentCandidates(compendiums, disciplineId, selfId);
  const linkOptions = compendiums.filter((c) => c.id !== selfId);
  const problem = validateNavigationValue(value, { compendiums, selfId, disciplineId });

  const trail = value.parentId ? getBreadcrumbTrail(compendiums, value.parentId).map(breadcrumbLabel) : [];
  const selfLabel = value.navShortTitle.trim() || currentTitle.trim() || '(este material)';

  return (
    <section aria-labelledby={`${idPrefix}-nav-heading`} className="space-y-4">
      <div>
        <h4 id={`${idPrefix}-nav-heading`} className="font-bold text-sm text-stone-900 dark:text-slate-100 flex items-center gap-2">
          <Link className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <span>Posição na árvore</span>
        </h4>
        <p className="text-[11px] text-stone-500 dark:text-slate-400">
          Onde este material aparece para o estudante e com quais outros ele se liga. Tudo opcional — sem pai, ele
          fica como raiz. Pode ser ajustado depois sem precisar reatestar.
        </p>
      </div>

      {/* Caminho resultante primeiro: é a resposta à pergunta "onde isto vai
          aparecer?", e se atualiza enquanto os campos abaixo mudam. */}
      <div className="p-2.5 rounded-lg bg-stone-50 dark:bg-[#142038] border border-stone-200 dark:border-[#243452]">
        <span className="text-[11px] font-semibold text-stone-500 dark:text-slate-400 block mb-0.5">Caminho resultante</span>
        <p className="text-xs text-stone-900 dark:text-slate-100" data-testid={`${idPrefix}-nav-trail`}>
          {trail.length > 0 ? (
            <>
              {trail.join(' › ')} › <span className="font-semibold">{selfLabel}</span>
            </>
          ) : (
            <>
              <span className="font-semibold">{selfLabel}</span>{' '}
              <span className="text-stone-500 dark:text-slate-400">(raiz — sem material acima)</span>
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor={`${idPrefix}-parent`}>
            Material-pai
          </label>
          <select
            id={`${idPrefix}-parent`}
            value={value.parentId}
            onChange={(e) => set('parentId', e.target.value)}
            className={inputClass}
          >
            <option value="">— Nenhum (raiz) —</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
                {c.publicationStatus !== 'published' ? ' (rascunho)' : ''}
              </option>
            ))}
          </select>
          <p className={helpClass}>Só aparecem materiais da mesma disciplina.</p>
        </div>

        <div>
          <label className={labelClass} htmlFor={`${idPrefix}-order`}>
            Ordem entre os irmãos
          </label>
          <input
            id={`${idPrefix}-order`}
            type="number"
            min={0}
            step={10}
            value={value.treeSortOrder}
            onChange={(e) => set('treeSortOrder', Number(e.target.value))}
            className={inputClass}
          />
          <p className={helpClass}>Use 10, 20, 30… para sobrar espaço de inserir entre dois depois.</p>
        </div>

        <div>
          <label className={labelClass} htmlFor={`${idPrefix}-short`}>
            Rótulo curto (opcional)
          </label>
          <input
            id={`${idPrefix}-short`}
            type="text"
            maxLength={40}
            value={value.navShortTitle}
            onChange={(e) => set('navShortTitle', e.target.value)}
            placeholder="Ex.: Terceira geração"
            className={inputClass}
          />
          <p className={helpClass}>Aparece na trilha no lugar do título completo. Vazio = título completo.</p>
        </div>

        <div>
          <label className={labelClass} htmlFor={`${idPrefix}-kind`}>
            Tipo do nó (opcional)
          </label>
          <select
            id={`${idPrefix}-kind`}
            value={value.taxonomyKind}
            onChange={(e) => set('taxonomyKind', e.target.value as TaxonomyKind | '')}
            className={inputClass}
          >
            <option value="">— Não classificado —</option>
            <option value="visao_geral">Visão geral</option>
            <option value="mecanismo">Mecanismo</option>
            <option value="classe">Classe</option>
            <option value="subclasse">Subclasse</option>
            <option value="farmaco">Fármaco</option>
            <option value="condicao">Condição</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <MaterialMultiSelect
          label="Estude antes"
          helperText="Base necessária que está FORA deste ramo. O que está acima na árvore já aparece na trilha."
          options={linkOptions}
          selectedIds={value.prerequisiteIds}
          onChange={(ids) => set('prerequisiteIds', ids)}
          excludeIds={value.relatedIds}
          htmlId={`${idPrefix}-prerequisite`}
        />
        <MaterialMultiSelect
          label="Veja também"
          helperText="Relacionado, sem ordem obrigatória. Aparece nos dois materiais. Rascunho fica invisível até ser publicado."
          options={linkOptions}
          selectedIds={value.relatedIds}
          onChange={(ids) => set('relatedIds', ids)}
          excludeIds={value.prerequisiteIds}
          htmlId={`${idPrefix}-related`}
        />
      </div>

      {problem && (
        <p
          role="alert"
          className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{problem}</span>
        </p>
      )}
    </section>
  );
};
