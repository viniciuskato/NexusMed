import { describe, it, expect } from 'vitest';
import { Compendium } from '../../src/types';
import {
  emptyNavigationValue,
  navigationValueFromCompendium,
  navigationFieldsFromValue,
  parentCandidates,
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
    const c = mat('x', {
      parentMaterialId: 'raiz',
      treeSortOrder: 20,
      navShortTitle: 'X',
      taxonomyKind: 'classe',
      navigationLinks: [
        { materialId: 'fora', linkType: 'prerequisite', sortOrder: 0 },
        { materialId: 'outra', linkType: 'related', sortOrder: 0 },
      ],
    });
    expect(navigationFieldsFromValue(navigationValueFromCompendium(c))).toEqual({
      parentMaterialId: 'raiz',
      treeSortOrder: 20,
      navShortTitle: 'X',
      taxonomyKind: 'classe',
      navigationLinks: c.navigationLinks,
    });
  });

  it('valor vazio vira raiz sem ligações', () => {
    expect(navigationFieldsFromValue(emptyNavigationValue())).toEqual({
      parentMaterialId: null,
      treeSortOrder: 0,
      navShortTitle: undefined,
      taxonomyKind: undefined,
      navigationLinks: [],
    });
  });
});

describe('parentCandidates', () => {
  it('só mesma disciplina, sem o próprio material e sem descendentes', () => {
    const ids = parentCandidates(acervo, 'farmaco', 'classe').map((c) => c.id);
    expect(ids).toContain('raiz');
    expect(ids).toContain('fora');
    expect(ids).not.toContain('classe'); // ele mesmo
    expect(ids).not.toContain('folha'); // descendente — criaria ciclo
    expect(ids).not.toContain('outra'); // outra disciplina
  });

  it('material novo (sem id) pode ter qualquer um da disciplina como pai', () => {
    expect(parentCandidates(acervo, 'farmaco', null).map((c) => c.id).sort()).toEqual(['classe', 'folha', 'fora', 'raiz']);
  });
});

describe('validateNavigationValue — mesmas regras do banco', () => {
  const ctx = { compendiums: acervo, selfId: null, disciplineId: 'farmaco' };

  it('valor válido não tem problema', () => {
    expect(validateNavigationValue({ ...emptyNavigationValue(), parentId: 'folha', prerequisiteIds: ['fora'] }, ctx)).toBeNull();
  });

  it('recusa ancestral como "Estude antes" — inclusive o avô, não só o pai', () => {
    const v = { ...emptyNavigationValue(), parentId: 'folha', prerequisiteIds: ['raiz'] };
    expect(validateNavigationValue(v, ctx)).toMatch(/já está acima deste material/);
  });

  // Regressão: a versão anterior checava os ancestrais da posição SALVA, não
  // da posição nova — trocar o pai e cadastrar o novo avô como "Estude antes"
  // no mesmo salvamento passava pelo formulário e só era barrado no banco.
  it('usa os ancestrais da posição NOVA, não da posição salva', () => {
    const v = { ...emptyNavigationValue(), parentId: 'classe', prerequisiteIds: ['raiz'] };
    expect(validateNavigationValue(v, { compendiums: acervo, selfId: 'fora', disciplineId: 'farmaco' })).toMatch(
      /já está acima/
    );
  });

  it('recusa pai de outra disciplina', () => {
    const v = { ...emptyNavigationValue(), parentId: 'outra' };
    expect(validateNavigationValue(v, ctx)).toMatch(/outra disciplina/);
  });

  it('recusa descendente como pai', () => {
    const v = { ...emptyNavigationValue(), parentId: 'folha' };
    expect(validateNavigationValue(v, { ...ctx, selfId: 'raiz' })).toMatch(/abaixo deste material/);
  });

  it('recusa o mesmo material em "Estude antes" e "Veja também"', () => {
    const v = { ...emptyNavigationValue(), prerequisiteIds: ['fora'], relatedIds: ['fora'] };
    expect(validateNavigationValue(v, ctx)).toMatch(/ao mesmo tempo/);
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
