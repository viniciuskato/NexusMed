import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Compendium, Discipline, Theme } from '../../src/types';

vi.mock('../../src/hooks/useScrollMemory', () => ({
  useScrollMemory: vi.fn(),
}));

vi.mock('../../src/components/feedback/ContextualFeedbackPopover', () => ({
  ContextualFeedbackPopover: () => null,
}));

vi.mock('../../src/services/storage', () => ({
  StorageService: {
    saveLastReadingSession: vi.fn(),
  },
}));

vi.mock('../../src/repositories/BookmarksRepository', () => ({
  bookmarksRepository: {
    getBookmarks: vi.fn().mockResolvedValue({ questions: [], compendiums: [], flashcards: [] }),
    setBookmark: vi.fn().mockResolvedValue(false),
  },
}));

vi.mock('../../src/repositories/NotesRepository', () => ({
  notesRepository: {
    getNotes: vi.fn().mockResolvedValue({}),
    getRemovedSectionNotes: vi.fn().mockResolvedValue({}),
    saveNote: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/repositories/FlashcardsRepository', () => ({
  flashcardsRepository: {
    saveFlashcard: vi.fn().mockResolvedValue(undefined),
    createFlashcardFromSection: vi.fn().mockResolvedValue({ card: {}, created: true }),
  },
}));

vi.mock('../../src/repositories/ReadingProgressRepository', () => ({
  readingProgressRepository: {
    getReadingProgress: vi.fn().mockResolvedValue({}),
    setSectionRead: vi.fn().mockResolvedValue(50),
  },
}));

const { CompendiumReader } = await import('../../src/components/compendium/CompendiumReader');
const { flashcardsRepository } = await import('../../src/repositories/FlashcardsRepository');

const discipline: Discipline = {
  id: 'disc-nefro',
  name: 'Nefrologia',
  code: 'NEFRO',
  icon: 'kidney',
  description: '',
  cycle: 'clinico',
  color: '#0F766E',
};

const theme: Theme = {
  id: 'theme-funcao-renal',
  disciplineId: discipline.id,
  name: 'Função renal',
  description: '',
  highYield: true,
  order: 1,
};

const compendium: Compendium = {
  id: 'comp-function-renal',
  disciplineId: discipline.id,
  themeId: theme.id,
  title: 'Avaliação da função renal',
  subtitle: 'Material de teste',
  estimatedReadTimeMinutes: 10,
  lastUpdated: '2026-09-21T12:00:00.000Z',
  author: 'Equipe Editorial',
  sections: [
    {
      id: 'sec-with-callouts',
      title: 'Aplicação prática',
      mechanismTag: 'Conduta',
      content: 'Conteúdo principal do primeiro tópico.',
      keyTakeaways: ['Ponto-chave final.'],
      clinicalPearl: 'Pérola clínica final.',
      warningAlert: 'Alerta final.',
      examConsensus: 'Consenso final.',
    },
    {
      id: 'sec-content-only',
      title: 'Segundo tópico',
      content: 'Conteúdo principal do segundo tópico.',
      keyTakeaways: [],
    },
  ],
  references: [],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CompendiumReader — ações de cada tópico', () => {
  it('renderiza Gerar flashcard e Marcar lida somente depois de todo o conteúdo da seção', () => {
    const { container } = render(
      <CompendiumReader
        compendium={compendium}
        compendiums={[compendium]}
        onOpenCompendium={vi.fn()}
        disciplines={[discipline]}
        themes={[theme]}
        onBack={vi.fn()}
        onOpenQuestionsForTheme={vi.fn()}
        onOpenQuestionsForMaterial={vi.fn()}
        onOpenFlashcardsForTheme={vi.fn()}
      />
    );

    for (const sectionData of compendium.sections) {
      const section = container.querySelector<HTMLElement>(`#${sectionData.id}`);
      expect(section).not.toBeNull();

      const sectionQueries = within(section!);
      const content = sectionQueries.getByText(sectionData.content);
      const generateFlashcard = sectionQueries.getByRole('button', { name: 'Gerar flashcard' });
      const markAsRead = sectionQueries.getByRole('button', { name: 'Marcar lida' });

      expect(content.compareDocumentPosition(generateFlashcard) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
      expect(content.compareDocumentPosition(markAsRead) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
      expect(generateFlashcard.parentElement).toBe(section!.lastElementChild);
      expect(markAsRead.parentElement).toBe(section!.lastElementChild);
    }

    const sectionWithCallouts = container.querySelector<HTMLElement>('#sec-with-callouts')!;
    const consensus = within(sectionWithCallouts).getByText('Consenso final.');
    const generateFlashcard = within(sectionWithCallouts).getByRole('button', { name: 'Gerar flashcard' });

    expect(consensus.compareDocumentPosition(generateFlashcard) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });
});

// P10: o card de seção guarda a seção (a revisão abre o material nela) e é um por seção.
describe('CompendiumReader — Gerar flashcard guarda a seção e não duplica (P10)', () => {
  function renderLeitor() {
    return render(
      <CompendiumReader
        compendium={compendium}
        compendiums={[compendium]}
        onOpenCompendium={vi.fn()}
        disciplines={[discipline]}
        themes={[theme]}
        onBack={vi.fn()}
        onOpenQuestionsForTheme={vi.fn()}
        onOpenQuestionsForMaterial={vi.fn()}
        onOpenFlashcardsForTheme={vi.fn()}
      />
    );
  }

  it('o card sai com o material e a seção da seção em que se clicou', async () => {
    const { container } = renderLeitor();
    const secao = container.querySelector<HTMLElement>('#sec-content-only')!;

    fireEvent.click(within(secao).getByRole('button', { name: 'Gerar flashcard' }));

    expect(await screen.findByText('Flashcard criado para o seu SRS')).toBeTruthy();
    expect(flashcardsRepository.createFlashcardFromSection).toHaveBeenCalledTimes(1);
    expect(flashcardsRepository.createFlashcardFromSection).toHaveBeenCalledWith(
      expect.objectContaining({
        compendiumRefId: 'comp-function-renal',
        compendiumSectionId: 'sec-content-only',
        front: '[Nefrologia] Segundo tópico',
      }),
    );
    expect(flashcardsRepository.saveFlashcard).not.toHaveBeenCalled();
  });

  it('a seção que já tem card: avisa, em vez de dizer que criou outro', async () => {
    vi.mocked(flashcardsRepository.createFlashcardFromSection).mockResolvedValueOnce({ card: {} as never, created: false });
    const { container } = renderLeitor();
    const secao = container.querySelector<HTMLElement>('#sec-with-callouts')!;

    fireEvent.click(within(secao).getByRole('button', { name: 'Gerar flashcard' }));

    expect(await screen.findByText('Esta seção já tem flashcard no seu SRS')).toBeTruthy();
    expect(screen.queryByText('Flashcard criado para o seu SRS')).toBeNull();
  });
});
