import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

vi.mock('../../src/repositories/FlashcardsRepository', () => ({
  flashcardsRepository: {
    saveFlashcard: vi.fn().mockResolvedValue(undefined),
    createFlashcardFromSection: vi.fn().mockResolvedValue({ card: {}, created: true }),
    createWrittenFlashcard: vi.fn().mockResolvedValue({}),
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
  it('renderiza Criar cartão e Marcar lida somente depois de todo o conteúdo da seção', () => {
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
      const generateFlashcard = sectionQueries.getByRole('button', { name: 'Criar cartão' });
      const markAsRead = sectionQueries.getByRole('button', { name: 'Marcar lida' });

      expect(content.compareDocumentPosition(generateFlashcard) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
      expect(content.compareDocumentPosition(markAsRead) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
      expect(generateFlashcard.parentElement).toBe(section!.lastElementChild);
      expect(markAsRead.parentElement).toBe(section!.lastElementChild);
    }

    const sectionWithCallouts = container.querySelector<HTMLElement>('#sec-with-callouts')!;
    const consensus = within(sectionWithCallouts).getByText('Consenso final.');
    const generateFlashcard = within(sectionWithCallouts).getByRole('button', { name: 'Criar cartão' });

    expect(consensus.compareDocumentPosition(generateFlashcard) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });
});

// CARD-1: o "Gerar flashcard" automático saiu; cada seção tem "Criar cartão", que abre uma caixa com Frente e
// Verso, e o cartão sai ligado ao material e à seção, com o texto exatamente como foi digitado.
describe('CompendiumReader — Criar cartão (CARD-1)', () => {
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

  it('cada seção tem "Criar cartão" e o "Gerar flashcard" não existe mais', () => {
    const { container } = renderLeitor();
    expect(screen.queryByRole('button', { name: /Gerar flashcard/ })).toBeNull();
    expect(container.textContent).not.toContain('Gerar flashcard');
    for (const sec of compendium.sections) {
      const secao = container.querySelector<HTMLElement>(`#${sec.id}`)!;
      expect(within(secao).getAllByRole('button', { name: 'Criar cartão' })).toHaveLength(1);
    }
  });

  it('o cartão sai com o material e a seção em que se clicou, com frente e verso como foram digitados', async () => {
    const { container } = renderLeitor();
    const secao = container.querySelector<HTMLElement>('#sec-content-only')!;

    fireEvent.click(within(secao).getByRole('button', { name: 'Criar cartão' }));
    const dialogo = screen.getByRole('dialog');
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Frente' }), { target: { value: 'Qual o corte da TFG?' } });
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Verso' }), { target: { value: '60 mL/min por mais de 3 meses' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Cartão criado')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(flashcardsRepository.createWrittenFlashcard).toHaveBeenCalledTimes(1);
    const enviado = vi.mocked(flashcardsRepository.createWrittenFlashcard).mock.calls[0][0];
    expect(enviado).toMatchObject({
      disciplineId: 'disc-nefro',
      themeId: 'theme-funcao-renal',
      compendiumRefId: 'comp-function-renal',
      compendiumSectionId: 'sec-content-only',
      front: 'Qual o corte da TFG?',
      back: '60 mL/min por mais de 3 meses',
      isWritten: true,
    });
    expect(enviado.questionOriginId).toBeUndefined();
    expect(flashcardsRepository.createFlashcardFromSection).not.toHaveBeenCalled();
    expect(flashcardsRepository.saveFlashcard).not.toHaveBeenCalled();
  });

  it('Cancelar fecha sem criar nada', () => {
    const { container } = renderLeitor();
    const secao = container.querySelector<HTMLElement>('#sec-with-callouts')!;
    fireEvent.click(within(secao).getByRole('button', { name: 'Criar cartão' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Frente' }), { target: { value: 'algo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(flashcardsRepository.createWrittenFlashcard).not.toHaveBeenCalled();
  });
});
