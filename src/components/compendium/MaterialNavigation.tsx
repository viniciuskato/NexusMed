import React, { useState } from 'react';
import { ChevronRight, ChevronDown, ArrowDownToLine, BookMarked, Link2 } from 'lucide-react';
import { Compendium } from '../../types';
import { getBreadcrumbTrail, breadcrumbLabel, getDirectChildren } from '../../utils/materialTree';

// ============================================================================
// Navegação da árvore para o ESTUDANTE (Fase 3)
// ============================================================================
// Três elementos, todos derivados do mesmo utilitário puro usado pelo Admin
// (src/utils/materialTree.ts):
//
//   1. MaterialBreadcrumb — trilha de navegação clicável (raiz → atual).
//   2. MaterialChildrenCards — "Aprofunde-se", DERIVADO dos filhos; não é um
//      terceiro tipo de link cadastrável (ver plano técnico §10.2).
//   3. MaterialLinkBoxes — "Estude antes" (prerequisite) e "Veja também"
//      (related), visualmente distintos entre si.
//
// Um link cujo material de destino não está na lista carregada é OMITIDO em
// silêncio: para o estudante isso significa que o destino ainda está em
// rascunho (a policy material_links_select_published já filtra a ligação, e a
// RLS de materials filtra o material), então nunca renderizamos link quebrado.

/** Rótulo visível de cada nível — nav_short_title quando existe, título completo como fallback. */
interface TrailProps {
  compendium: Compendium;
  compendiums: Compendium[];
  onOpenCompendium: (id: string) => void;
}

export const MaterialBreadcrumb: React.FC<TrailProps> = ({ compendium, compendiums, onOpenCompendium }) => {
  // No celular, uma trilha de seis níveis não cabe: por padrão mostramos só o
  // pai imediato e o atual, com um botão pra abrir o caminho completo. Nenhum
  // controle depende de hover (plano técnico §10.3).
  const [expanded, setExpanded] = useState(false);
  const trail = getBreadcrumbTrail(compendiums, compendium.id);

  // Material raiz (ou sem ancestral carregado): não há trilha a mostrar.
  if (trail.length <= 1) return null;

  const ancestors = trail.slice(0, -1);
  const collapsed = ancestors.length > 1 && !expanded;
  const visibleAncestors = collapsed ? ancestors.slice(-1) : ancestors;

  return (
    <nav aria-label="Trilha de navegação" className="flex items-center flex-wrap gap-x-1 gap-y-1 text-[11px] sm:text-xs">
      {collapsed && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="px-1.5 py-0.5 rounded-md text-[#64748B] dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-[#182235] font-medium cursor-pointer"
            aria-label={`Mostrar os ${ancestors.length} níveis anteriores da trilha`}
          >
            …
          </button>
          <ChevronRight className="w-3 h-3 text-[#94A3B8] dark:text-[#64748B] shrink-0" aria-hidden="true" />
        </>
      )}
      {visibleAncestors.map((ancestor) => (
        <React.Fragment key={ancestor.id}>
          <button
            type="button"
            onClick={() => onOpenCompendium(ancestor.id)}
            className="px-1.5 py-0.5 rounded-md text-[#0F766E] dark:text-[#14B8A6] hover:bg-teal-50 dark:hover:bg-teal-950/40 font-semibold cursor-pointer truncate max-w-[45vw] sm:max-w-none"
            title={ancestor.title}
          >
            {breadcrumbLabel(ancestor)}
          </button>
          <ChevronRight className="w-3 h-3 text-[#94A3B8] dark:text-[#64748B] shrink-0" aria-hidden="true" />
        </React.Fragment>
      ))}
      <span aria-current="page" className="px-1.5 py-0.5 text-[#64748B] dark:text-[#94A3B8] font-medium truncate max-w-[45vw] sm:max-w-none">
        {breadcrumbLabel(compendium)}
      </span>
    </nav>
  );
};

interface CardListProps {
  compendium: Compendium;
  compendiums: Compendium[];
  onOpenCompendium: (id: string) => void;
}

/** "Aprofunde-se": derivado dos materiais-filhos, nunca cadastrado à mão. */
export const MaterialChildrenCards: React.FC<CardListProps> = ({ compendium, compendiums, onOpenCompendium }) => {
  const children = getDirectChildren(compendiums, compendium.id);
  if (children.length === 0) return null;

  return (
    <section aria-labelledby="aprofunde-se-heading" className="mt-10">
      <h3 id="aprofunde-se-heading" className="flex items-center gap-2 text-sm font-bold text-[#172033] dark:text-[#E5E7EB] mb-3">
        <ArrowDownToLine className="w-4 h-4 text-[#0F766E] dark:text-[#14B8A6]" />
        <span>Aprofunde-se</span>
      </h3>
      {/* Uma coluna no celular, grade no desktop (plano técnico §10.3). */}
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {children.map((child) => (
          <li key={child.id}>
            <button
              type="button"
              onClick={() => onOpenCompendium(child.id)}
              className="w-full h-full text-left p-3.5 rounded-xl border border-[#E2E8F0] dark:border-[#263244] bg-white dark:bg-[#141f33] hover:border-[#0F766E] dark:hover:border-[#14B8A6] transition-colors cursor-pointer"
            >
              <span className="block text-xs font-bold text-[#172033] dark:text-[#E5E7EB]">{child.title}</span>
              {child.subtitle && (
                <span className="block text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-1 line-clamp-2">{child.subtitle}</span>
              )}
              {child.estimatedReadTimeMinutes > 0 && (
                <span className="block text-[10px] text-[#94A3B8] dark:text-[#64748B] mt-1.5">
                  {child.estimatedReadTimeMinutes} min
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

/** "Estude antes" e "Veja também", visualmente distintos (critério de aceite do piloto). */
export const MaterialLinkBoxes: React.FC<CardListProps> = ({ compendium, compendiums, onOpenCompendium }) => {
  const byId = new Map(compendiums.map((c) => [c.id, c]));
  const links = compendium.navigationLinks ?? [];

  // Destino ausente da lista carregada = ainda em rascunho para este leitor.
  // Omitir, nunca renderizar link que levaria a lugar nenhum.
  const resolve = (type: 'prerequisite' | 'related') =>
    links
      .filter((l) => l.linkType === type)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((l) => byId.get(l.materialId))
      .filter((c): c is Compendium => !!c);

  const prerequisites = resolve('prerequisite');
  const related = resolve('related');
  if (prerequisites.length === 0 && related.length === 0) return null;

  const box = (
    title: string,
    description: string,
    items: Compendium[],
    Icon: typeof BookMarked,
    tone: { border: string; bg: string; icon: string }
  ) => {
    if (items.length === 0) return null;
    const headingId = `nav-box-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
    return (
      <section aria-labelledby={headingId} className={`p-4 rounded-xl border ${tone.border} ${tone.bg}`}>
        <h3 id={headingId} className="flex items-center gap-2 text-xs font-bold text-[#172033] dark:text-[#E5E7EB]">
          <Icon className={`w-4 h-4 ${tone.icon}`} />
          <span>{title}</span>
        </h3>
        <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-0.5 mb-2.5">{description}</p>
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onOpenCompendium(item.id)}
                className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#141f33] border border-[#E2E8F0] dark:border-[#263244] hover:border-[#0F766E] dark:hover:border-[#14B8A6] text-[11px] font-semibold text-[#172033] dark:text-[#E5E7EB] transition-colors cursor-pointer text-left"
              >
                {item.title}
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  };

  return (
    <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
      {box(
        'Estude antes',
        'Base necessária para este conteúdo fazer sentido.',
        prerequisites,
        BookMarked,
        {
          border: 'border-amber-200 dark:border-amber-900/60',
          bg: 'bg-amber-50/60 dark:bg-amber-950/20',
          icon: 'text-amber-600 dark:text-amber-400',
        }
      )}
      {box(
        'Veja também',
        'Conteúdo relacionado, sem ordem obrigatória.',
        related,
        Link2,
        {
          border: 'border-indigo-200 dark:border-indigo-900/60',
          bg: 'bg-indigo-50/60 dark:bg-indigo-950/20',
          icon: 'text-indigo-600 dark:text-indigo-400',
        }
      )}
    </div>
  );
};

/** Árvore recolhível da biblioteca — raízes expansíveis até os filhos. */
interface TreeProps {
  nodes: { compendium: Compendium; children: TreeProps['nodes'] }[];
  activeId?: string;
  onOpenCompendium: (id: string) => void;
  depth?: number;
}

export const MaterialTreeList: React.FC<TreeProps> = ({ nodes, activeId, onOpenCompendium, depth = 0 }) => {
  return (
    <ul className={depth === 0 ? 'space-y-1' : 'mt-1 space-y-1 border-l border-[#E2E8F0] dark:border-[#263244] pl-3 ml-1.5'}>
      {nodes.map((node) => (
        <MaterialTreeItem
          key={node.compendium.id}
          node={node}
          activeId={activeId}
          onOpenCompendium={onOpenCompendium}
          depth={depth}
        />
      ))}
    </ul>
  );
};

const MaterialTreeItem: React.FC<{
  node: TreeProps['nodes'][number];
  activeId?: string;
  onOpenCompendium: (id: string) => void;
  depth: number;
}> = ({ node, activeId, onOpenCompendium, depth }) => {
  const hasChildren = node.children.length > 0;
  // Abre já expandido quando o material atual está neste ramo, pra o estudante
  // ver onde está sem precisar caçar.
  const containsActive = (n: TreeProps['nodes'][number]): boolean =>
    n.compendium.id === activeId || n.children.some(containsActive);
  const [open, setOpen] = useState(() => hasChildren && containsActive(node));
  const isActive = node.compendium.id === activeId;

  return (
    <li>
      <div className="flex items-stretch gap-0.5">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            /* Mesmo rótulo do item visível ao lado (rótulo curto quando existe):
               usar o título completo aqui faria o leitor de tela anunciar dois
               nomes diferentes para a mesma linha da árvore. */
            aria-label={`${open ? 'Recolher' : 'Expandir'} ${breadcrumbLabel(node.compendium)}`}
            className="w-7 shrink-0 flex items-center justify-center rounded-md text-[#64748B] dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-[#182235] cursor-pointer"
          >
            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-7 shrink-0" aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={() => onOpenCompendium(node.compendium.id)}
          className={`flex-1 min-w-0 text-left px-2 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
            isActive
              ? 'bg-teal-50 dark:bg-teal-950/40 text-[#0F766E] dark:text-[#14B8A6] font-bold'
              : 'text-[#172033] dark:text-[#E5E7EB] hover:bg-slate-100 dark:hover:bg-[#182235]'
          }`}
          aria-current={isActive ? 'page' : undefined}
        >
          <span className="block truncate">{breadcrumbLabel(node.compendium)}</span>
        </button>
      </div>
      {hasChildren && open && (
        <MaterialTreeList nodes={node.children} activeId={activeId} onOpenCompendium={onOpenCompendium} depth={depth + 1} />
      )}
    </li>
  );
};
