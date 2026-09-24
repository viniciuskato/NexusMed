import { Compendium } from '../types';
import { getAncestors, getDescendantIds } from './materialTree';

// ============================================================================
// Estado do bloco "Posição na árvore" — compartilhado entre o formulário de
// edição do Admin e o modal "Importar material".
// ============================================================================
// Antes, a posição na árvore só podia ser definida pelo formulário de edição,
// então todo material importado exigia um segundo passo (abrir, posicionar,
// salvar). Agora os dois lugares usam o mesmo estado, a mesma validação e o
// mesmo componente (MaterialNavigationFields), e a importação já nasce na
// posição certa.
//
// Desde a 43-A, "Tipo do nó", "Estude antes" e "Veja também" estão
// CONGELADOS: saíram da tela e da importação, e o que já existe continua
// valendo. Por isso eles não fazem parte deste valor — o formulário não tem
// como alterá-los, e eles atravessam o "Salvar" pelo material original
// (ver compendiumForm.ts).
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
}

export function emptyNavigationValue(): MaterialNavigationValue {
  return { parentId: '', treeSortOrder: 0, navShortTitle: '' };
}

export function navigationValueFromCompendium(c: Compendium): MaterialNavigationValue {
  return {
    parentId: c.parentMaterialId ?? '',
    treeSortOrder: c.treeSortOrder ?? 0,
    navShortTitle: c.navShortTitle ?? '',
  };
}

/** Os campos do Compendium que o bloco de posição controla. */
export function navigationFieldsFromValue(
  value: MaterialNavigationValue
): Pick<Compendium, 'parentMaterialId' | 'treeSortOrder' | 'navShortTitle'> {
  return {
    parentMaterialId: value.parentId || null,
    treeSortOrder: Number(value.treeSortOrder) || 0,
    navShortTitle: value.navShortTitle.trim() || undefined,
  };
}

/** "Estude antes" já cadastrados de um material — congelados, mas o banco ainda os confere ao mudar o pai. */
export function frozenPrerequisiteIds(c: Compendium | null): string[] {
  return (c?.navigationLinks ?? []).filter((l) => l.linkType === 'prerequisite').map((l) => l.materialId);
}

/**
 * Materiais que podem ser pai: de QUALQUER disciplina (escolher o pai define
 * a disciplina do material), nunca o próprio material nem um descendente dele
 * (isso criaria ciclo).
 */
export function parentCandidates(compendiums: Compendium[], selfId: string | null): Compendium[] {
  const blocked = selfId ? getDescendantIds(compendiums, selfId) : new Set<string>();
  return compendiums
    .filter((c) => c.id !== selfId && !blocked.has(c.id))
    .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
}

/** Ordem que põe o material depois do último irmão, em passos de 10 (o primeiro filho fica em 10). */
export function endOfSiblingsOrder(compendiums: Compendium[], parentId: string, selfId: string | null): number {
  const orders = compendiums
    .filter((c) => c.parentMaterialId === parentId && c.id !== selfId)
    .map((c) => c.treeSortOrder ?? 0);
  return (orders.length > 0 ? Math.max(...orders) : 0) + 10;
}

/**
 * Ordem entre irmãos depois de a pessoa escolher outro pai. A ordem deixou de
 * ser decisão obrigatória: sem ela ter sido tocada, o material vai para o fim
 * dos irmãos. Duas exceções — ordem digitada pela pessoa é respeitada, e
 * voltar ao pai com que o formulário abriu devolve a ordem original (senão um
 * "vai e volta" no seletor gravaria uma ordem nova sem ninguém querer).
 */
export function orderAfterParentChange(args: {
  compendiums: Compendium[];
  selfId: string | null;
  /** Valor com que o bloco abriu. */
  initial: MaterialNavigationValue;
  current: MaterialNavigationValue;
  nextParentId: string;
  orderTouched: boolean;
}): number {
  const { compendiums, selfId, initial, current, nextParentId, orderTouched } = args;
  if (orderTouched) return current.treeSortOrder;
  if (nextParentId === initial.parentId) return initial.treeSortOrder;
  if (!nextParentId) return current.treeSortOrder;
  return endOfSiblingsOrder(compendiums, nextParentId, selfId);
}

/**
 * Disciplina e tema do material depois de a pessoa escolher o pai (43-A).
 *
 * Material novo (importação, "Novo conteúdo"): os dois passam a ser os do pai.
 * Material que já existe: disciplina e tema entram no hash de atestação, então
 * reposicionar dentro da mesma disciplina NÃO mexe no tema — mover não pode
 * derrubar a revisão aprovada (decisão do dono, 24/09). O tema só acompanha o
 * pai quando a disciplina muda, porque o banco exige pai e filho na mesma
 * disciplina; voltar para a disciplina original recupera o tema original.
 */
export function disciplineAndThemeForParent(args: {
  parent: Compendium | null;
  current: { disciplineId: string; themeId: string };
  /** O material como está no banco; null quando ainda não existe. */
  original: Compendium | null;
}): { disciplineId: string; themeId: string } {
  const { parent, current, original } = args;
  if (!parent) return current;
  if (!original) return { disciplineId: parent.disciplineId, themeId: parent.themeId };
  if (parent.disciplineId === current.disciplineId) return current;
  if (parent.disciplineId === original.disciplineId) {
    return { disciplineId: original.disciplineId, themeId: original.themeId };
  }
  return { disciplineId: parent.disciplineId, themeId: parent.themeId };
}

/**
 * Mensagem para o administrador quando o valor viola uma regra da árvore, ou
 * null quando está tudo certo. Mesmas regras que o banco aplica.
 */
export function validateNavigationValue(
  value: MaterialNavigationValue,
  ctx: {
    compendiums: Compendium[];
    selfId: string | null;
    disciplineId: string;
    /** "Estude antes" antigos do material (ver frozenPrerequisiteIds). */
    frozenPrerequisiteIds?: string[];
  }
): string | null {
  const { compendiums, selfId, disciplineId, frozenPrerequisiteIds = [] } = ctx;
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

  // Pai de outra disciplina leva o material junto; o banco recusa se ele tiver
  // filhos, porque o ramo inteiro teria de mudar de disciplina.
  if (selfId && compendiums.some((c) => c.parentMaterialId === selfId && c.disciplineId !== disciplineId)) {
    return 'Este material tem outros abaixo dele na árvore, e um ramo inteiro não muda de disciplina por aqui — escolha um pai da disciplina atual.';
  }

  // Um "Estude antes" antigo não pode ficar acima do material na árvore (o
  // banco recusa). Com o campo congelado, a saída é escolher outro pai.
  if (value.parentId && frozenPrerequisiteIds.length > 0) {
    const ancestorIds = new Set<string>([value.parentId, ...getAncestors(compendiums, value.parentId).map((a) => a.id)]);
    const redundant = frozenPrerequisiteIds.find((id) => ancestorIds.has(id));
    if (redundant) {
      const title = byId.get(redundant)?.title ?? redundant;
      return `"${title}" é "Estude antes" deste material e ficaria acima dele na árvore — escolha outro pai.`;
    }
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
