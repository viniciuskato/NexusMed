import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { Compendium, Discipline, Theme } from '../../src/types';

// ED-2: o leitor pergunta se a pessoa é admin (botão "Editar"); aqui o leitor é de quem só lê.
vi.mock('../../src/hooks/useEhAdmin', () => ({ useEhAdmin: () => false }));
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

vi.mock('../../src/repositories/ReadingProgressRepository', () => ({
  readingProgressRepository: {
    getReadingProgress: vi.fn().mockResolvedValue({}),
    setSectionRead: vi.fn().mockResolvedValue(50),
  },
}));

const { CompendiumReader } = await import('../../src/components/compendium/CompendiumReader');

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
  it('renderiza Marcar lida somente depois de todo o conteúdo da seção', () => {
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
      />
    );

    for (const sectionData of compendium.sections) {
      const section = container.querySelector<HTMLElement>(`#${sectionData.id}`);
      expect(section).not.toBeNull();

      const sectionQueries = within(section!);
      const content = sectionQueries.getByText(sectionData.content);
      const markAsRead = sectionQueries.getByRole('button', { name: 'Marcar lida' });

      expect(content.compareDocumentPosition(markAsRead) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
      expect(markAsRead.parentElement).toBe(section!.lastElementChild);
    }

    const sectionWithCallouts = container.querySelector<HTMLElement>('#sec-with-callouts')!;
    const consensus = within(sectionWithCallouts).getByText('Consenso final.');
    const markAsRead = within(sectionWithCallouts).getByRole('button', { name: 'Marcar lida' });

    expect(consensus.compareDocumentPosition(markAsRead) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });
});

// CORTE-1 (D-14): os cartões saíram da tela. O leitor não oferece "Criar cartão" nem "Gerar flashcard", nem leva a
// uma tela de flashcards: só questões.
describe('CompendiumReader — sem cartões (CORTE-1)', () => {
  it('nenhuma seção tem "Criar cartão", e o fim do material não oferece flashcards', () => {
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
      />
    );
    expect(screen.queryByRole('button', { name: /Criar cartão|Gerar flashcard|Flashcards|Revisar Flashcards/i })).toBeNull();
    expect(container.textContent).not.toMatch(/cartão|cartões|flashcard/i);
    expect(screen.getAllByRole('button', { name: /Resolver Questões deste Tema/ }).length).toBeGreaterThan(0);
  });
});
