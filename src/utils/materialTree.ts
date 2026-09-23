import { Compendium } from '../types';

// ============================================================================
// Utilitário puro de árvore de materiais (Fase 2)
// ============================================================================
// O Postgres é a autoridade final para ciclo/disciplina/profundidade (ver
// supabase/migrations/20260922130000_material_taxonomy_hardening.sql). Este
// módulo é só a contraparte de leitura no cliente: construir a árvore a
// partir da lista plana, montar a trilha de navegação, e blindar o Admin
// contra dado inconsistente (pai ausente da lista carregada, ciclo que
// escapou por algum motivo) sem nunca travar a tela.
//
// Teto de profundidade espelha app.material_max_depth() no banco — ver
// docs/operacao/standards/taxonomia-materiais.md §3.
export const MATERIAL_TREE_MAX_DEPTH = 8;

export interface MaterialTreeNode {
  compendium: Compendium;
  children: MaterialTreeNode[];
  /** true quando parentMaterialId aponta para um id fora da lista carregada. */
  isOrphanedParent: boolean;
}

/**
 * Constrói a árvore a partir da lista plana. Um material cujo pai não está
 * na lista (fallback local, filtro parcial, etc.) vira RAIZ — nunca
 * desaparece da árvore. Ver taxonomia-materiais.md §7.
 */
export function buildMaterialTree(compendiums: Compendium[]): MaterialTreeNode[] {
  const byId = new Map(compendiums.map((c) => [c.id, c]));
  const nodeById = new Map<string, MaterialTreeNode>();
  for (const c of compendiums) {
    nodeById.set(c.id, { compendium: c, children: [], isOrphanedParent: false });
  }

  const roots: MaterialTreeNode[] = [];
  const visiting = new Set<string>();

  function isAncestorCycle(id: string, parentId: string): boolean {
    // Defesa contra ciclo que não deveria existir (o banco bloqueia na
    // escrita) — sem isto, uma corrida de dados poderia travar o Admin numa
    // recursão infinita ao montar a árvore para renderizar.
    let cursor: string | undefined = parentId;
    let steps = 0;
    while (cursor && steps < compendiums.length + 1) {
      if (cursor === id) return true;
      cursor = byId.get(cursor)?.parentMaterialId ?? undefined;
      steps++;
    }
    return false;
  }

  for (const c of compendiums) {
    const node = nodeById.get(c.id)!;
    const parentId = c.parentMaterialId;
    if (!parentId) {
      roots.push(node);
      continue;
    }
    const parentNode = nodeById.get(parentId);
    if (!parentNode || isAncestorCycle(c.id, parentId) || visiting.has(c.id)) {
      // Pai fora da lista carregada, ou ciclo: material vira raiz visível em
      // vez de sumir da tela.
      roots.push({ ...node, isOrphanedParent: !!parentId && !parentNode });
      continue;
    }
    parentNode.children.push(node);
  }

  const sortByOrder = (nodes: MaterialTreeNode[]) => {
    nodes.sort((a, b) => {
      const orderDiff = (a.compendium.treeSortOrder ?? 0) - (b.compendium.treeSortOrder ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return a.compendium.title.localeCompare(b.compendium.title, 'pt-BR');
    });
    for (const n of nodes) sortByOrder(n.children);
  };
  sortByOrder(roots);

  return roots;
}

/** Filhos diretos, já ordenados por (treeSortOrder, título) — para o cartão "Aprofunde-se". */
export function getDirectChildren(compendiums: Compendium[], materialId: string): Compendium[] {
  return compendiums
    .filter((c) => c.parentMaterialId === materialId)
    .sort((a, b) => {
      const diff = (a.treeSortOrder ?? 0) - (b.treeSortOrder ?? 0);
      return diff !== 0 ? diff : a.title.localeCompare(b.title, 'pt-BR');
    });
}

/**
 * Ancestrais do material, do pai imediato até a raiz — usado para a trilha de
 * navegação e para impedir, no cliente, selecionar um descendente como pai
 * (o banco também recusa; isto é só UX, não é a garantia de integridade).
 * Para no teto de profundidade ou ao detectar ciclo, o que vier primeiro —
 * nunca entra em loop infinito mesmo com dado corrompido.
 */
export function getAncestors(compendiums: Compendium[], materialId: string): Compendium[] {
  const byId = new Map(compendiums.map((c) => [c.id, c]));
  const ancestors: Compendium[] = [];
  const seen = new Set<string>([materialId]);
  let cursor = byId.get(materialId)?.parentMaterialId ?? undefined;
  while (cursor && ancestors.length <= MATERIAL_TREE_MAX_DEPTH) {
    if (seen.has(cursor)) break; // ciclo — não deveria acontecer, mas não trava a tela
    const parent = byId.get(cursor);
    if (!parent) break; // pai fora da lista carregada
    ancestors.push(parent);
    seen.add(cursor);
    cursor = parent.parentMaterialId ?? undefined;
  }
  return ancestors;
}

/** Todos os descendentes (qualquer profundidade), sem ordem garantida — para bloquear "escolher um descendente como pai" no seletor. */
export function getDescendantIds(compendiums: Compendium[], materialId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const c of compendiums) {
    if (!c.parentMaterialId) continue;
    const list = childrenByParent.get(c.parentMaterialId) ?? [];
    list.push(c.id);
    childrenByParent.set(c.parentMaterialId, list);
  }
  const result = new Set<string>();
  const queue = [...(childrenByParent.get(materialId) ?? [])];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (result.has(id)) continue; // guarda de ciclo
    result.add(id);
    queue.push(...(childrenByParent.get(id) ?? []));
  }
  return result;
}

/** Trilha de navegação (raiz → material), pronta para renderizar como breadcrumb. Usa navShortTitle quando existe. */
export function getBreadcrumbTrail(compendiums: Compendium[], materialId: string): Compendium[] {
  const self = compendiums.find((c) => c.id === materialId);
  if (!self) return [];
  return [...getAncestors(compendiums, materialId)].reverse().concat(self);
}

export function breadcrumbLabel(compendium: Compendium): string {
  return compendium.navShortTitle?.trim() || compendium.title;
}
