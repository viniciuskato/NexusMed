import React, { useRef, useState } from 'react';
import { Link, AlertTriangle } from 'lucide-react';
import { Compendium, Discipline } from '../../types';
import { getBreadcrumbTrail, breadcrumbLabel } from '../../utils/materialTree';
import {
  MaterialNavigationValue,
  orderAfterParentChange,
  parentCandidates,
  validateNavigationValue,
} from '../../utils/materialNavigation';

// ============================================================================
// Bloco "Posição na árvore" — usado IGUAL no formulário de edição e no modal
// "Importar material". Um lugar só para os campos, a validação ao vivo e a
// trilha resultante: antes o bloco vivia inline no AdminCMSView e a
// importação não tinha nenhum deles, o que obrigava a abrir cada material
// importado de novo só para posicioná-lo.
//
// 43-A: sem "Tipo do nó", "Estude antes" e "Veja também" (congelados — o que
// já existe segue valendo e visível para o estudante). O pai pode ser de
// qualquer disciplina: quem hospeda o bloco recebe o pai escolhido em
// `onParentChange` e aplica disciplina e tema (disciplineAndThemeForParent).
// A ordem deixou de ser decisão obrigatória: sem ser tocada, o material vai
// para o fim dos irmãos.
// ============================================================================

interface MaterialNavigationFieldsProps {
  value: MaterialNavigationValue;
  onChange: (next: MaterialNavigationValue) => void;
  /** Pai escolhido pela pessoa (null = raiz) — o host aplica disciplina e tema dele. */
  onParentChange?: (parent: Compendium | null) => void;
  compendiums: Compendium[];
  /** Para agrupar a lista de pais por disciplina. */
  disciplines: Discipline[];
  /** Disciplina atual do material — o pai precisa ser da mesma. */
  disciplineId: string;
  /** null quando o material ainda não existe (importação, criação). */
  selfId: string | null;
  /** "Estude antes" antigos do material: não aparecem, mas o banco os confere ao mudar o pai. */
  frozenPrerequisiteIds?: string[];
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
  onParentChange,
  compendiums,
  disciplines,
  disciplineId,
  selfId,
  frozenPrerequisiteIds,
  currentTitle,
  idPrefix,
}) => {
  // Posição com que o bloco abriu: voltar ao pai original devolve a ordem original.
  const initial = useRef(value);
  const [orderTouched, setOrderTouched] = useState(false);

  const candidates = parentCandidates(compendiums, selfId);
  const candidateGroups = disciplines
    .map((d) => ({ discipline: d, items: candidates.filter((c) => c.disciplineId === d.id) }))
    .filter((g) => g.items.length > 0)
    .sort((a, b) => a.discipline.name.localeCompare(b.discipline.name, 'pt-BR'));
  const problem = validateNavigationValue(value, { compendiums, selfId, disciplineId, frozenPrerequisiteIds });

  const chooseParent = (parentId: string) => {
    const treeSortOrder = orderAfterParentChange({
      compendiums,
      selfId,
      initial: initial.current,
      current: value,
      nextParentId: parentId,
      orderTouched,
    });
    onChange({ ...value, parentId, treeSortOrder });
    onParentChange?.(parentId ? compendiums.find((c) => c.id === parentId) ?? null : null);
  };

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
          Onde este material aparece para o estudante. Tudo opcional — sem pai, ele fica como raiz. Mudar de
          posição não pede nova atestação, salvo quando o pai é de outra disciplina.
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
            onChange={(e) => chooseParent(e.target.value)}
            className={inputClass}
          >
            <option value="">— Nenhum (raiz) —</option>
            {candidateGroups.map((g) => (
              <optgroup key={g.discipline.id} label={g.discipline.name}>
                {g.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                    {c.publicationStatus !== 'published' ? ' (rascunho)' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className={helpClass}>De qualquer disciplina — o material passa para a disciplina do pai.</p>
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
            onChange={(e) => {
              setOrderTouched(true);
              onChange({ ...value, treeSortOrder: Number(e.target.value) });
            }}
            className={inputClass}
          />
          <p className={helpClass}>
            Ao escolher o pai, o material vai para o fim dos irmãos. Mude só se quiser outra posição (10, 20, 30…).
          </p>
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
            onChange={(e) => onChange({ ...value, navShortTitle: e.target.value })}
            placeholder="Ex.: Terceira geração"
            className={inputClass}
          />
          <p className={helpClass}>Aparece na trilha no lugar do título completo. Vazio = título completo.</p>
        </div>
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
