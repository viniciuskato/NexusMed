import { describe, expect, it } from 'vitest';
import type { Compendium, LastReadingSession } from '../../src/types';
import { retomadaDeLeitura } from '../../src/services/hoje';

// 43-E / PAINEL-2: de onde o "Continuar lendo" do Início retoma. (As contas do
// "Testar o que li" do dia saíram junto com a tela "Hoje".)

describe('retomadaDeLeitura', () => {
  const material = (id: string, sections: string[]): Compendium => ({
    id,
    disciplineId: 'd',
    themeId: 't',
    title: `Material ${id}`,
    subtitle: '',
    estimatedReadTimeMinutes: 10,
    lastUpdated: '',
    author: '',
    sections: sections.map((s) => ({ id: s, title: `Seção ${s}`, content: '', keyTakeaways: [] })),
    references: [],
  });
  const sessao = (compendiumId: string, sectionId?: string): LastReadingSession => ({
    compendiumId,
    sectionId,
    compendiumTitle: 'título antigo',
    sectionTitle: 'seção antiga',
    updatedAt: 1,
  });

  it('sem sessão de leitura, não há o que continuar', () => {
    expect(retomadaDeLeitura(null, [material('a', ['s1'])])).toBeNull();
  });

  it('retoma o material na seção onde parou, com os títulos de agora', () => {
    expect(retomadaDeLeitura(sessao('a', 's2'), [material('a', ['s1', 's2'])])).toEqual({
      compendiumId: 'a',
      compendiumTitle: 'Material a',
      sectionId: 's2',
      sectionTitle: 'Seção s2',
    });
  });

  it('seção que já não existe: abre o material, sem seção', () => {
    expect(retomadaDeLeitura(sessao('a', 'sumiu'), [material('a', ['s1'])])).toEqual({
      compendiumId: 'a',
      compendiumTitle: 'Material a',
    });
  });

  it('material que o estudante já não vê: não oferece continuar', () => {
    expect(retomadaDeLeitura(sessao('a', 's1'), [material('b', ['s1'])])).toBeNull();
  });
});
