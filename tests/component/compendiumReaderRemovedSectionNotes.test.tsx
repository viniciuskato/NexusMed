import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Compendium } from '../../src/types';

// 45-D: a anotação de uma seção que saiu do material continua aparecendo para
// o aluno, no próprio material, indicada como de uma seção removida — e não
// se mistura com a anotação do material, que ele continua editando.

vi.mock('../../src/hooks/useScrollMemory', () => ({ useScrollMemory: vi.fn() }));
vi.mock('../../src/components/feedback/ContextualFeedbackPopover', () => ({ ContextualFeedbackPopover: () => null }));
vi.mock('../../src/services/storage', () => ({ StorageService: { saveLastReadingSession: vi.fn() } }));
vi.mock('../../src/repositories/BookmarksRepository', () => ({
  bookmarksRepository: {
    getBookmarks: vi.fn().mockResolvedValue({ questions: [], compendiums: [], flashcards: [] }),
    toggleBookmark: vi.fn(),
  },
}));
vi.mock('../../src/repositories/NotesRepository', () => ({
  notesRepository: {
    getNotes: vi.fn().mockResolvedValue({ 'comp-1': 'Minha anotação do material' }),
    getRemovedSectionNotes: vi.fn().mockResolvedValue([
      { sectionTitle: 'Seção que saiu', noteText: 'Anotei aqui antes da edição' },
    ]),
    saveNote: vi.fn(),
  },
}));
vi.mock('../../src/repositories/FlashcardsRepository', () => ({ flashcardsRepository: { saveFlashcard: vi.fn() } }));
vi.mock('../../src/repositories/ReadingProgressRepository', () => ({
  readingProgressRepository: { getReadingProgress: vi.fn().mockResolvedValue({}), toggleSectionRead: vi.fn() },
}));

const { CompendiumReader } = await import('../../src/components/compendium/CompendiumReader');
const { notesRepository } = await import('../../src/repositories/NotesRepository');

const compendium: Compendium = {
  id: 'comp-1',
  disciplineId: 'd',
  themeId: 't',
  title: 'Material',
  subtitle: '',
  estimatedReadTimeMinutes: 10,
  lastUpdated: '',
  author: '',
  sections: [{ id: 'sec-1', title: 'Seção que ficou', content: 'Texto.', keyTakeaways: [] }],
  references: [],
};

afterEach(() => {
  cleanup();
});

function renderReader() {
  return render(
    <CompendiumReader
      compendium={compendium}
      compendiums={[compendium]}
      onOpenCompendium={vi.fn()}
      disciplines={[]}
      themes={[]}
      onBack={vi.fn()}
      onOpenQuestionsForTheme={vi.fn()}
      onOpenFlashcardsForTheme={vi.fn()}
    />
  );
}

describe('CompendiumReader — anotação de seção removida (45-D)', () => {
  it('aparece nas anotações do material, indicada como de seção removida e só para leitura', async () => {
    renderReader();
    expect(notesRepository.getRemovedSectionNotes).toHaveBeenCalledWith('comp-1');

    fireEvent.click(screen.getAllByRole('button', { name: /Anotações pessoais/ })[0]);

    const aviso = await screen.findByText(/De uma seção removida: Seção que saiu/);
    expect(aviso).toBeTruthy();
    const texto = screen.getByText('Anotei aqui antes da edição');
    expect(texto.closest('textarea')).toBeNull();
    // A anotação do material continua no campo editável, sem mistura.
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Minha anotação do material');
  });
});
