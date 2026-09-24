import { describe, it, expect } from 'vitest';
import { Compendium } from '../../src/types';
import {
  emptyNavigationValue,
  navigationValueFromCompendium,
  navigationFieldsFromValue,
  parentCandidates,
  endOfSiblingsOrder,
  orderAfterParentChange,
  disciplineAndThemeForParent,
  validateNavigationValue,
  publishPrerequisitesInOrder,
} from '../../src/utils/materialNavigation';

function mat(id: string, overrides: Partial<Compendium> = {}): Compendium {
  return {
    id,
    disciplineId: 'farmaco',
    themeId: 'atb',
    title: id,
    subtitle: '',
    estimatedReadTimeMinutes: 10,
    lastUpdated: '',
    author: '',
    publicationStatus: 'published',
    sections: [],
    references: [],
    ...overrides,
  };
}

// raiz → classe → folha ; fora (mesma disciplina, fora do ramo) ; outra (outra disciplina)
const raiz = mat('raiz');
const classe = mat('classe', { parentMaterialId: 'raiz' });
const folha = mat('folha', { parentMaterialId: 'classe' });
const fora = mat('fora');
const outra = mat('outra', { disciplineId: 'infecto' });
const acervo = [raiz, classe, folha, fora, outra];

describe('navegação: conversões', () => {
  it('valor ⇄ campos do material, ida e volta', () => {
    const c = mat('x', { parentMaterialId: 'raiz', treeSortOrder: 20, navShortTitle: 'X' });
    expect(navigationFieldsFromValue(navigationValueFromCompendium(c))).toEqual({
      parentMaterialId: 'raiz',
      treeSortOrder: 20,
      navShortTitle: 'X',
    });
  });

  it('valor vazio vira raiz', () => {
    expect(navigationFieldsFromValue(emptyNavigationValue())).toEqual({
      parentMaterialId: null,
      treeSortOrder: 0,
      navShortTitle: undefined,
    });
  });

  // 43-A: "Tipo do nó", "Estude antes" e "Veja também" saíram da tela. O bloco
  // de posição não os carrega mais — assim não há como o formulário alterá-los,
  // e eles atravessam o "Salvar" pelo material original (compendiumForm).
  it('tipo do nó e ligações não fazem parte do valor do bloco', () => {
    const c = mat('x', {
      taxonomyKind: 'classe',
      navigationLinks: [{ materialId: 'fora', linkType: 'prerequisite', sortOrder: 0 }],
    });
    const fields = navigationFieldsFromValue(navigationValueFromCompendium(c));
    expect(Object.keys(navigationValueFromCompendium(c)).sort()).toEqual(['navShortTitle', 'parentId', 'treeSortOrder']);
    expect('taxonomyKind' in fields).toBe(false);
    expect('navigationLinks' in fields).toBe(false);
  });
});

describe('parentCandidates', () => {
  // 43-A: escolher o pai define a disciplina, então a lista de pais atravessa
  // disciplinas. Continua de fora o próprio material e o que está abaixo dele.
  it('materiais de qualquer disciplina, sem o próprio material e sem descendentes', () => {
    const ids = parentCandidates(acervo, 'classe').map((c) => c.id);
    expect(ids).toContain('raiz');
    expect(ids).toContain('fora');
    expect(ids).toContain('outra'); // outra disciplina
    expect(ids).not.toContain('classe'); // ele mesmo
    expect(ids).not.toContain('folha'); // descendente — criaria ciclo
  });

  it('material novo (sem id) pode ter qualquer material como pai', () => {
    expect(parentCandidates(acervo, null).map((c) => c.id).sort()).toEqual(['classe', 'folha', 'fora', 'outra', 'raiz']);
  });
});

describe('endOfSiblingsOrder — "para o fim dos irmãos"', () => {
  it('um passo de 10 depois do último irmão', () => {
    const irmaos = [raiz, mat('a', { parentMaterialId: 'raiz', treeSortOrder: 10 }), mat('b', { parentMaterialId: 'raiz', treeSortOrder: 30 })];
    expect(endOfSiblingsOrder(irmaos, 'raiz', null)).toBe(40);
  });

  it('primeiro filho fica em 10', () => {
    expect(endOfSiblingsOrder(acervo, 'folha', null)).toBe(10);
  });

  it('o próprio material não conta como irmão (editar não o empurra um passo à frente)', () => {
    const irmaos = [raiz, mat('a', { parentMaterialId: 'raiz', treeSortOrder: 10 }), mat('eu', { parentMaterialId: 'raiz', treeSortOrder: 50 })];
    expect(endOfSiblingsOrder(irmaos, 'raiz', 'eu')).toBe(20);
  });
});

describe('orderAfterParentChange', () => {
  const irmaos = [raiz, mat('a', { parentMaterialId: 'raiz', treeSortOrder: 10 }), mat('b', { parentMaterialId: 'raiz', treeSortOrder: 20 })];
  const initial = { parentId: '', treeSortOrder: 0, navShortTitle: '' };

  it('sem mexer na ordem, escolher um pai leva o material para o fim dos irmãos', () => {
    expect(
      orderAfterParentChange({ compendiums: irmaos, selfId: null, initial, current: initial, nextParentId: 'raiz', orderTouched: false })
    ).toBe(30);
  });

  it('ordem digitada pela pessoa é respeitada', () => {
    const current = { ...initial, treeSortOrder: 15 };
    expect(
      orderAfterParentChange({ compendiums: irmaos, selfId: null, initial, current, nextParentId: 'raiz', orderTouched: true })
    ).toBe(15);
  });

  it('voltar ao pai com que o formulário abriu devolve a ordem original — nada muda sem querer', () => {
    const aberto = { parentId: 'raiz', treeSortOrder: 10, navShortTitle: '' };
    const current = { ...aberto, parentId: 'fora', treeSortOrder: 10 };
    expect(
      orderAfterParentChange({ compendiums: irmaos, selfId: 'a', initial: aberto, current, nextParentId: 'raiz', orderTouched: false })
    ).toBe(10);
  });
});

// Decisão do dono (24/09, execução da 43-A): disciplina e tema entram no hash
// de atestação. Em material NOVO o pai define os dois; em material que já
// existe, reposicionar dentro da disciplina não mexe no tema (senão derrubaria
// a atestação só por mover) — o tema só acompanha quando a disciplina muda,
// porque o banco exige pai e filho na mesma disciplina.
describe('disciplineAndThemeForParent', () => {
  const pai = mat('pai', { disciplineId: 'farmaco', themeId: 'atb' });
  const paiMesmaDisciplinaOutroTema = mat('pai2', { disciplineId: 'farmaco', themeId: 'farmaco-geral' });
  const paiOutraDisciplina = mat('pai3', { disciplineId: 'infecto', themeId: 'snc' });

  it('material novo: disciplina e tema passam a ser os do pai', () => {
    expect(
      disciplineAndThemeForParent({ parent: pai, current: { disciplineId: 'infecto', themeId: 'snc' }, original: null })
    ).toEqual({ disciplineId: 'farmaco', themeId: 'atb' });
  });

  it('sem pai (raiz), disciplina e tema ficam como estão', () => {
    const current = { disciplineId: 'infecto', themeId: 'snc' };
    expect(disciplineAndThemeForParent({ parent: null, current, original: null })).toEqual(current);
  });

  it('material existente, pai da mesma disciplina: o tema não muda', () => {
    const original = mat('eu', { disciplineId: 'farmaco', themeId: 'atb' });
    expect(
      disciplineAndThemeForParent({ parent: paiMesmaDisciplinaOutroTema, current: { disciplineId: 'farmaco', themeId: 'atb' }, original })
    ).toEqual({ disciplineId: 'farmaco', themeId: 'atb' });
  });

  it('material existente, pai de outra disciplina: disciplina e tema acompanham o pai', () => {
    const original = mat('eu', { disciplineId: 'farmaco', themeId: 'atb' });
    expect(
      disciplineAndThemeForParent({ parent: paiOutraDisciplina, current: { disciplineId: 'farmaco', themeId: 'atb' }, original })
    ).toEqual({ disciplineId: 'infecto', themeId: 'snc' });
  });

  it('material existente que volta para a disciplina original recupera o tema original', () => {
    const original = mat('eu', { disciplineId: 'farmaco', themeId: 'atb' });
    expect(
      disciplineAndThemeForParent({ parent: paiMesmaDisciplinaOutroTema, current: { disciplineId: 'infecto', themeId: 'snc' }, original })
    ).toEqual({ disciplineId: 'farmaco', themeId: 'atb' });
  });
});

describe('validateNavigationValue — mesmas regras do banco', () => {
  const ctx = { compendiums: acervo, selfId: null, disciplineId: 'farmaco' };

  it('valor válido não tem problema', () => {
    expect(validateNavigationValue({ ...emptyNavigationValue(), parentId: 'folha' }, ctx)).toBeNull();
  });

  // "Estude antes" saiu da tela (43-A), mas as ligações antigas continuam no
  // banco, e o banco recusa mover o material para baixo de um "Estude antes"
  // dele. O formulário avisa antes, com os ancestrais da posição NOVA.
  it('recusa pai que colocaria um "Estude antes" antigo acima do material — inclusive como avô', () => {
    const v = { ...emptyNavigationValue(), parentId: 'folha' };
    expect(validateNavigationValue(v, { ...ctx, selfId: 'fora', frozenPrerequisiteIds: ['raiz'] })).toMatch(
      /"Estude antes"/
    );
  });

  it('recusa pai de outra disciplina quando a disciplina não acompanhou', () => {
    const v = { ...emptyNavigationValue(), parentId: 'outra' };
    expect(validateNavigationValue(v, ctx)).toMatch(/outra disciplina/);
  });

  it('recusa descendente como pai', () => {
    const v = { ...emptyNavigationValue(), parentId: 'folha' };
    expect(validateNavigationValue(v, { ...ctx, selfId: 'raiz' })).toMatch(/abaixo deste material/);
  });

  // Pai de outra disciplina muda a disciplina do material; o banco recusa se
  // ele tiver filhos (o ramo inteiro teria de mudar junto).
  it('recusa mudar de disciplina um material que tem filhos', () => {
    const v = { ...emptyNavigationValue(), parentId: 'outra' };
    expect(validateNavigationValue(v, { compendiums: acervo, selfId: 'classe', disciplineId: 'infecto' })).toMatch(
      /abaixo dele/
    );
  });
});

describe('publishPrerequisitesInOrder', () => {
  it('lista ancestrais em rascunho de cima para baixo — a ordem em que cada publicação dá certo', () => {
    const acervoRascunho = [
      mat('avo', { publicationStatus: 'draft' }),
      mat('pai', { parentMaterialId: 'avo', publicationStatus: 'draft' }),
      mat('neto', { parentMaterialId: 'pai', publicationStatus: 'draft' }),
    ];
    const neto = acervoRascunho[2];
    expect(publishPrerequisitesInOrder(acervoRascunho, neto).map((c) => c.id)).toEqual(['avo', 'pai']);
  });

  it('inclui "Estude antes" em rascunho depois dos ancestrais', () => {
    const base = mat('base', { publicationStatus: 'draft' });
    const c = mat('c', {
      parentMaterialId: 'raiz',
      publicationStatus: 'draft',
      navigationLinks: [{ materialId: 'base', linkType: 'prerequisite', sortOrder: 0 }],
    });
    expect(publishPrerequisitesInOrder([raiz, base, c], c).map((x) => x.id)).toEqual(['base']);
  });

  it('nada a listar para material já publicado ou sem bloqueio', () => {
    expect(publishPrerequisitesInOrder(acervo, folha)).toEqual([]);
    expect(publishPrerequisitesInOrder(acervo, mat('solto', { publicationStatus: 'draft' }))).toEqual([]);
  });
});
