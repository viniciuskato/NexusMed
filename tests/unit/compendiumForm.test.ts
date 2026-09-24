import { describe, it, expect } from 'vitest';
import { Compendium } from '../../src/types';
import {
  formStateFromCompendium,
  compendiumFromFormState,
  linkedReferencesThatWillBeLost,
} from '../../src/utils/compendiumForm';

// A garantia central: abrir um material e clicar "Salvar" sem mudar nada grava
// EXATAMENTE o que já estava. Qualquer diferença num campo que chega ao banco
// muda o hash de atestação (revisão aprovada invalidada) ou apaga dado.

/** Material como o repositório devolve para um conteúdo IMPORTADO: mode nulo, sem studyLens. */
function importado(overrides: Partial<Compendium> = {}): Compendium {
  return {
    id: 'mat-1',
    disciplineId: 'farmaco',
    themeId: 'atb',
    title: 'Ceftriaxona',
    subtitle: '',
    estimatedReadTimeMinutes: 12,
    lastUpdated: '2026-09-23T00:00:00Z',
    author: 'Autor',
    publicationStatus: 'published',
    tags: ['farmacologia', 'β-lactâmico'],
    sections: [{ id: 'sec-1', title: 'Mecanismo', content: 'Texto.', keyTakeaways: ['ponto'] }],
    references: ['Diretriz X', 'Livro Y'],
    referenceSources: [
      { id: 'ref-1', linked: true, sourceId: 'fonte-x', url: 'https://x.org' },
      { id: 'ref-2', linked: false },
    ],
    ...overrides,
  };
}

/** Os campos que o repositório envia ao banco em save_compendium. */
function persisted(c: Compendium) {
  return {
    disciplineId: c.disciplineId,
    themeId: c.themeId,
    title: c.title,
    subtitle: c.subtitle || null,
    mode: c.mode ?? null,
    studyLens: c.studyLens ?? null,
    moduleNumber: c.moduleNumber ?? null,
    estimatedReadTimeMinutes: c.estimatedReadTimeMinutes || null,
    author: c.author || null,
    tags: c.tags ?? [],
    sections: c.sections,
    references: c.references,
    parentMaterialId: c.parentMaterialId ?? null,
    treeSortOrder: c.treeSortOrder ?? 0,
    navShortTitle: c.navShortTitle?.trim() || null,
    taxonomyKind: c.taxonomyKind ?? null,
    navigationLinks: c.navigationLinks ?? [],
  };
}

describe('formulário ⇄ material, ida e volta', () => {
  it('Salvar sem mudança grava exatamente o que estava (material importado, mode nulo)', () => {
    const original = importado();
    const salvo = compendiumFromFormState(formStateFromCompendium(original), original, original.id);
    expect(persisted(salvo)).toEqual(persisted(original));
  });

  // Os 38 materiais de produção têm mode nulo. O select do formulário não
  // tinha opção vazia e gravava "mecanismos" no primeiro Salvar.
  it('mode nulo continua nulo', () => {
    const original = importado({ mode: undefined });
    const salvo = compendiumFromFormState(formStateFromCompendium(original), original, original.id);
    expect(salvo.mode).toBeUndefined();
  });

  it('studyLens, que o formulário não edita, atravessa intacto', () => {
    const original = importado({ studyLens: 'farmacologia' });
    const salvo = compendiumFromFormState(formStateFromCompendium(original), original, original.id);
    expect(salvo.studyLens).toBe('farmacologia');
  });

  it('tag com vírgula dentro não é quebrada quando o campo de tags não foi tocado', () => {
    const original = importado({ tags: ['Cefalosporinas, 3ª geração', 'prova'] });
    const salvo = compendiumFromFormState(formStateFromCompendium(original), original, original.id);
    expect(salvo.tags).toEqual(['Cefalosporinas, 3ª geração', 'prova']);
  });

  it('tempo de leitura desconhecido (0) continua desconhecido, não vira 15', () => {
    const original = importado({ estimatedReadTimeMinutes: 0 });
    const salvo = compendiumFromFormState(formStateFromCompendium(original), original, original.id);
    expect(persisted(salvo).estimatedReadTimeMinutes).toBeNull();
  });

  it('posição na árvore e ligações atravessam', () => {
    const original = importado({
      parentMaterialId: 'cef3',
      treeSortOrder: 10,
      navShortTitle: 'Ceftriaxona',
      taxonomyKind: 'farmaco',
      navigationLinks: [
        { materialId: 'betalact', linkType: 'prerequisite', sortOrder: 0 },
        { materialId: 'meningite', linkType: 'related', sortOrder: 0 },
      ],
    });
    const salvo = compendiumFromFormState(formStateFromCompendium(original), original, original.id);
    expect(persisted(salvo)).toEqual(persisted(original));
  });

  // 43-A: "Congelar não é apagar". Tipo do nó, "Estude antes" e "Veja também"
  // saíram do formulário; o que já existe atravessa o "Salvar" exatamente como
  // está — inclusive a ordem gravada, que o formulário antigo renumerava em
  // passos de 10.
  it('tipo do nó e ligações congeladas atravessam intactos, com a ordem gravada', () => {
    const original = importado({
      parentMaterialId: 'cef3',
      treeSortOrder: 10,
      taxonomyKind: 'classe',
      navigationLinks: [
        { materialId: 'betalact', linkType: 'prerequisite', sortOrder: 0 },
        { materialId: 'parede', linkType: 'prerequisite', sortOrder: 5 },
        { materialId: 'meningite', linkType: 'related', sortOrder: 7 },
      ],
    });
    const salvo = compendiumFromFormState(formStateFromCompendium(original), original, original.id);
    expect(persisted(salvo)).toEqual(persisted(original));
  });

  it('mudar o pai não mexe no tipo do nó nem nas ligações congeladas', () => {
    const original = importado({
      parentMaterialId: 'cef3',
      taxonomyKind: 'farmaco',
      navigationLinks: [{ materialId: 'meningite', linkType: 'related', sortOrder: 0 }],
    });
    const form = formStateFromCompendium(original);
    const salvo = compendiumFromFormState(
      { ...form, navigation: { ...form.navigation, parentId: 'cef4', treeSortOrder: 30 } },
      original,
      original.id
    );
    expect(salvo.parentMaterialId).toBe('cef4');
    expect(salvo.treeSortOrder).toBe(30);
    expect(salvo.taxonomyKind).toBe('farmaco');
    expect(salvo.navigationLinks).toEqual(original.navigationLinks);
  });

  it('conteúdo novo nasce sem tipo do nó e sem ligações', () => {
    const form = formStateFromCompendium(importado({ taxonomyKind: 'classe' }));
    const novo = compendiumFromFormState(form, null, 'novo');
    expect(persisted(novo).taxonomyKind).toBeNull();
    expect(persisted(novo).navigationLinks).toEqual([]);
  });

  it('o que o formulário edita é aplicado', () => {
    const original = importado();
    const form = formStateFromCompendium(original);
    const salvo = compendiumFromFormState({ ...form, title: '  Ceftriaxona (revisado)  ', tagsStr: 'a, b' }, original, original.id);
    expect(salvo.title).toBe('Ceftriaxona (revisado)');
    expect(salvo.tags).toEqual(['a', 'b']);
  });

  it('conteúdo novo sem tempo informado assume 15 minutos', () => {
    const form = formStateFromCompendium(importado());
    const novo = compendiumFromFormState({ ...form, estimatedTime: 0 }, null, 'novo');
    expect(novo.estimatedReadTimeMinutes).toBe(15);
  });
});

describe('linkedReferencesThatWillBeLost', () => {
  it('nada a avisar quando as referências vinculadas continuam com o mesmo texto', () => {
    expect(linkedReferencesThatWillBeLost(importado(), 'Livro Y\nDiretriz X')).toEqual([]);
  });

  it('avisa quando o texto de uma referência vinculada foi editado', () => {
    expect(linkedReferencesThatWillBeLost(importado(), 'Diretriz X (2024)\nLivro Y')).toEqual(['Diretriz X']);
  });

  it('avisa quando uma referência vinculada foi removida', () => {
    expect(linkedReferencesThatWillBeLost(importado(), 'Livro Y')).toEqual(['Diretriz X']);
  });

  it('não avisa sobre referência sem vínculo', () => {
    expect(linkedReferencesThatWillBeLost(importado(), 'Diretriz X')).toEqual([]);
  });

  it('não avisa em conteúdo novo', () => {
    expect(linkedReferencesThatWillBeLost(null, '')).toEqual([]);
  });
});
