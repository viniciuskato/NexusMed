import { Compendium, MaterialNavigationLink, TaxonomyKind } from '../types';
import { getAncestors, getDescendantIds } from './materialTree';

// ============================================================================
// Estado do bloco "Navegação do conteúdo" — compartilhado entre o formulário
// de edição do Admin e o modal "Importar material".
// ============================================================================
// Antes, a posição na árvore só podia ser definida pelo formulário de edição,
// então todo material importado exigia um segundo passo (abrir, posicionar,
// salvar). Agora os dois lugares usam o mesmo estado, a mesma validação e o
// mesmo componente (MaterialNavigationFields), e a importação já nasce na
// posição certa.
//
// A validação aqui é só UX — responde antes da viagem de rede com a mesma
// regra que o banco aplica. O Postgres continua a autoridade final (ciclo,
// disciplina, profundidade, par único): ver
// docs/operacao/standards/taxonomia-materiais.md §1.

export interface MaterialNavigationValue {
  /** '' = raiz (sem pai). */
  parentId: string;
  treeSortOrder: number;
  navShortTitle: string;
  taxonomyKind: TaxonomyKind | '';
  prerequisiteIds: string[];
  relatedIds: string[];
}

export function emptyNavigationValue(): MaterialNavigationValue {
  return { parentId: '', treeSortOrder: 0, navShortTitle: '', taxonomyKind: '', prerequisiteIds: [], relatedIds: [] };
}

export function navigationValueFromCompendium(c: Compendium): MaterialNavigationValue {
  const links = c.navigationLinks ?? [];
  return {
    parentId: c.parentMaterialId ?? '',
    treeSortOrder: c.treeSortOrder ?? 0,
    navShortTitle: c.navShortTitle ?? '',
    taxonomyKind: c.taxonomyKind ?? '',
    prerequisiteIds: links.filter((l) => l.linkType === 'prerequisite').map((l) => l.materialId),
    relatedIds: links.filter((l) => l.linkType === 'related').map((l) => l.materialId),
  };
}

/** Ligações no formato do Compendium, em passos de 10 dentro de cada tipo. */
export function navigationLinksFromValue(value: MaterialNavigationValue): MaterialNavigationLink[] {
  return [
    ...value.prerequisiteIds.map((materialId, i) => ({ materialId, linkType: 'prerequisite' as const, sortOrder: i * 10 })),
    ...value.relatedIds.map((materialId, i) => ({ materialId, linkType: 'related' as const, sortOrder: i * 10 })),
  ];
}

/** Os campos do Compendium que a navegação controla. */
export function navigationFieldsFromValue(value: MaterialNavigationValue): Pick<
  Compendium,
  'parentMaterialId' | 'treeSortOrder' | 'navShortTitle' | 'taxonomyKind' | 'navigationLinks'
> {
  return {
    parentMaterialId: value.parentId || null,
    treeSortOrder: Number(value.treeSortOrder) || 0,
    navShortTitle: value.navShortTitle.trim() || undefined,
    taxonomyKind: value.taxonomyKind || undefined,
    navigationLinks: navigationLinksFromValue(value),
  };
}

/**
 * Materiais que podem ser pai: mesma disciplina, e nunca o próprio material
 * nem um descendente dele (isso criaria ciclo).
 */
export function parentCandidates(compendiums: Compendium[], disciplineId: string, selfId: string | null): Compendium[] {
  const blocked = selfId ? getDescendantIds(compendiums, selfId) : new Set<string>();
  return compendiums
    .filter((c) => c.id !== selfId && c.disciplineId === disciplineId && !blocked.has(c.id))
    .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
}

/**
 * Mensagem para o administrador quando o valor viola uma regra da árvore, ou
 * null quando está tudo certo. Mesmas regras que o banco aplica.
 */
export function validateNavigationValue(
  value: MaterialNavigationValue,
  ctx: { compendiums: Compendium[]; selfId: string | null; disciplineId: string }
): string | null {
  const { compendiums, selfId, disciplineId } = ctx;
  const byId = new Map(compendiums.map((c) => [c.id, c]));

  if (value.parentId) {
    if (value.parentId === selfId) return 'Um material não pode ser pai de si mesmo.';
    if (selfId && getDescendantIds(compendiums, selfId).has(value.parentId)) {
      return 'O pai escolhido está abaixo deste material na árvore — escolha outro.';
    }
    const parent = byId.get(value.parentId);
    if (parent && parent.disciplineId !== disciplineId) {
      return `"${parent.title}" é de outra disciplina — pai e filho precisam ser da mesma disciplina.`;
    }
  }

  // Ancestral já é "Estude antes" implícito: a trilha mostra o caminho.
  const ancestorIds = new Set<string>();
  if (value.parentId) {
    ancestorIds.add(value.parentId);
    for (const a of getAncestors(compendiums, value.parentId)) ancestorIds.add(a.id);
  }
  const redundant = value.prerequisiteIds.find((id) => ancestorIds.has(id));
  if (redundant) {
    const title = byId.get(redundant)?.title ?? redundant;
    return `"${title}" já está acima deste material na árvore — a trilha mostra esse caminho, não precisa de "Estude antes".`;
  }

  const both = value.prerequisiteIds.find((id) => value.relatedIds.includes(id));
  if (both) {
    const title = byId.get(both)?.title ?? both;
    return `"${title}" está em "Estude antes" e em "Veja também" ao mesmo tempo — escolha um dos dois.`;
  }

  if (value.navShortTitle.trim().length > 40) return 'O rótulo curto tem no máximo 40 caracteres.';

  return null;
}

/**
 * O que precisa ser publicado ANTES deste material, já na ordem em que dá
 * para publicar: primeiro os ancestrais em rascunho, do mais alto para o
 * mais baixo (cada um só publica com os de cima já publicados), depois os
 * "Estude antes" em rascunho. Vazio = nada bloqueia pela árvore (ainda pode
 * faltar a atestação, que é outra checagem).
 */
export function publishPrerequisitesInOrder(compendiums: Compendium[], c: Compendium): Compendium[] {
  if (c.publicationStatus === 'published') return [];
  const byId = new Map(compendiums.map((x) => [x.id, x]));
  const draftAncestors = getAncestors(compendiums, c.id)
    .filter((a) => a.publicationStatus !== 'published')
    .reverse(); // getAncestors vem do pai para a raiz; publicação vai da raiz para baixo
  const draftPrerequisites = (c.navigationLinks ?? [])
    .filter((l) => l.linkType === 'prerequisite')
    .map((l) => byId.get(l.materialId))
    .filter((x): x is Compendium => !!x && x.publicationStatus !== 'published' && !draftAncestors.includes(x));
  return [...draftAncestors, ...draftPrerequisites];
}
