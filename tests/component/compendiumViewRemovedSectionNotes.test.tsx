import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Compendium, Discipline, Theme } from '../../src/types';

// 45-D (revisão do a4af38c, item 4): na biblioteca, o indicador de anotação
// conta também a anotação de uma seção que saiu do material — senão o aluno
// acha que perdeu a anotação, que é o que a 45-D promete que não acontece.

vi.mock('../../src/hooks/useScrollMemory', () => ({ useScrollMemory: vi.fn() }));
vi.mock('../../src/services/storage', () => ({
  StorageService: { getHighlights: () => ({}), getUIState: (_k: string, d: unknown) => d, setUIState: () => {} },
}));
vi.mock('../../src/repositories/BookmarksRepository', () => ({
  bookmarksRepository: { getBookmarks: vi.fn().mockResolvedValue({ questions: [], compendiums: [], flashcards: [] }) },
}));
vi.mock('../../src/repositories/ReadingProgressRepository', () => ({
  readingProgressRepository: { getReadingProgress: vi.fn().mockResolvedValue({}) },
}));
vi.mock('../../src/repositories/NotesRepository', () => ({
  notesRepository: {
    getNotes: vi.fn().mockResolvedValue({}),
    getRemovedSectionNotes: vi.fn().mockResolvedValue({
      'comp-1': [{ sectionTitle: 'Seção que saiu', noteText: 'Anotei aqui' }],
    }),
  },
}));

const { CompendiumView } = await import('../../src/components/compendium/CompendiumView');

const discipline: Discipline = { id: 'd', name: 'Farmacologia', code: 'F', icon: 'pill', description: '', cycle: 'clinico', color: '#000' };
const theme: Theme = { id: 't', disciplineId: 'd', name: 'Antimicrobianos', description: '', highYield: false, order: 1 };
const compendium: Compendium = {
  id: 'comp-1',
  disciplineId: 'd',
  themeId: 't',
  title: 'Material com anotação de seção removida',
  subtitle: '',
  estimatedReadTimeMinutes: 10,
  lastUpdated: '',
  author: '',
  sections: [{ id: 's', title: 'S', content: 'C', keyTakeaways: [] }],
  references: [],
};

afterEach(() => cleanup());

describe('CompendiumView — indicador de anotação (45-D)', () => {
  it('mostra o indicador quando a única anotação do material é de seção removida', async () => {
    render(
      <CompendiumView
        compendiums={[compendium]}
        disciplines={[discipline]}
        themes={[theme]}
        onOpenCompendium={vi.fn()}
        onOpenQuestionsForTheme={vi.fn()}
        initialDisciplineId="d"
      />
    );
    expect(await screen.findByTitle('Anotação vinculada')).toBeTruthy();
  });
});
