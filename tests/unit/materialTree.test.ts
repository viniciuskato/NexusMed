import { describe, it, expect } from 'vitest';
import { Compendium } from '../../src/types';
import {
  buildMaterialTree,
  getAncestors,
  getDescendantIds,
  getBreadcrumbTrail,
  breadcrumbLabel,
  getDirectChildren,
} from '../../src/utils/materialTree';

function mat(id: string, overrides: Partial<Compendium> = {}): Compendium {
  return {
    id,
    disciplineId: 'disc-1',
    themeId: 'theme-1',
    title: id,
    subtitle: '',
    estimatedReadTimeMinutes: 10,
    lastUpdated: '',
    author: '',
    sections: [],
    references: [],
    ...overrides,
  };
}

// Árvore: A (raiz) -> B -> C ; D (raiz solta)
const A = mat('A');
const B = mat('B', { parentMaterialId: 'A', treeSortOrder: 10 });
const C = mat('C', { parentMaterialId: 'B', treeSortOrder: 10 });
const D = mat('D');

describe('buildMaterialTree', () => {
  it('monta a árvore aninhada corretamente', () => {
    const tree = buildMaterialTree([A, B, C, D]);
    expect(tree.map((n) => n.compendium.id).sort()).toEqual(['A', 'D']);
    const nodeA = tree.find((n) => n.compendium.id === 'A')!;
    expect(nodeA.children.map((n) => n.compendium.id)).toEqual(['B']);
    expect(nodeA.children[0].children.map((n) => n.compendium.id)).toEqual(['C']);
  });

  it('material com pai fora da lista carregada vira raiz visível, não desaparece', () => {
    const orphan = mat('E', { parentMaterialId: 'nao-existe' });
    const tree = buildMaterialTree([A, orphan]);
    const node = tree.find((n) => n.compendium.id === 'E');
    expect(node).toBeDefined();
    expect(node!.isOrphanedParent).toBe(true);
  });

  it('ordena irmãos por treeSortOrder e depois por título', () => {
    const c1 = mat('Zebra', { parentMaterialId: 'A', treeSortOrder: 10 });
    const c2 = mat('Abelha', { parentMaterialId: 'A', treeSortOrder: 10 });
    const c3 = mat('Meio', { parentMaterialId: 'A', treeSortOrder: 5 });
    const tree = buildMaterialTree([A, c1, c2, c3]);
    const nodeA = tree.find((n) => n.compendium.id === 'A')!;
    expect(nodeA.children.map((n) => n.compendium.id)).toEqual(['Meio', 'Abelha', 'Zebra']);
  });

  it('não trava em ciclo corrompido (defesa client-side; o banco é quem impede na escrita)', () => {
    const x = mat('X', { parentMaterialId: 'Y' });
    const y = mat('Y', { parentMaterialId: 'X' });
    expect(() => buildMaterialTree([x, y])).not.toThrow();
  });
});

describe('getAncestors / getBreadcrumbTrail', () => {
  it('devolve a cadeia do pai imediato até a raiz', () => {
    const ancestors = getAncestors([A, B, C, D], 'C');
    expect(ancestors.map((a) => a.id)).toEqual(['B', 'A']);
  });

  it('trilha completa vai da raiz até o próprio material, nessa ordem', () => {
    const trail = getBreadcrumbTrail([A, B, C, D], 'C');
    expect(trail.map((t) => t.id)).toEqual(['A', 'B', 'C']);
  });

  it('material raiz tem trilha de um item só (ele mesmo)', () => {
    expect(getBreadcrumbTrail([A, D], 'D').map((t) => t.id)).toEqual(['D']);
  });

  it('não entra em loop com ciclo corrompido', () => {
    const x = mat('X', { parentMaterialId: 'Y' });
    const y = mat('Y', { parentMaterialId: 'X' });
    expect(() => getAncestors([x, y], 'X')).not.toThrow();
  });
});

describe('getDescendantIds', () => {
  it('inclui todos os níveis abaixo, não só filhos diretos', () => {
    const ids = getDescendantIds([A, B, C, D], 'A');
    expect([...ids].sort()).toEqual(['B', 'C']);
  });

  it('material sem filhos devolve conjunto vazio', () => {
    expect(getDescendantIds([A, B, C, D], 'C').size).toBe(0);
  });
});

describe('getDirectChildren', () => {
  it('só filhos diretos, ordenados', () => {
    const children = getDirectChildren([A, B, C, D], 'A');
    expect(children.map((c) => c.id)).toEqual(['B']);
  });
});

describe('breadcrumbLabel', () => {
  it('usa navShortTitle quando presente', () => {
    expect(breadcrumbLabel(mat('X', { title: 'Cefalosporinas de terceira geração', navShortTitle: 'Terceira geração' }))).toBe(
      'Terceira geração'
    );
  });

  it('cai para o título completo quando navShortTitle está ausente ou em branco', () => {
    expect(breadcrumbLabel(mat('X', { title: 'Título completo' }))).toBe('Título completo');
    expect(breadcrumbLabel(mat('X', { title: 'Título completo', navShortTitle: '   ' }))).toBe('Título completo');
  });
});
