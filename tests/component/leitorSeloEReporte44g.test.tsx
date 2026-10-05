import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { Compendium, Discipline, Theme } from '../../src/types';

// 44-G — no leitor: material publicado mostra o selo de revisão (se houver) e o
// botão "Reportar erro"; rascunho e material sem estado de publicação não.

// ED-2: o leitor pergunta se a pessoa é admin (botão "Editar"); aqui o leitor é de quem só lê.
vi.mock('../../src/hooks/useEhAdmin', () => ({ useEhAdmin: () => false }));
vi.mock('../../src/hooks/useScrollMemory', () => ({ useScrollMemory: vi.fn() }));
vi.mock('../../src/components/feedback/ContextualFeedbackPopover', () => ({ ContextualFeedbackPopover: () => null }));
vi.mock('../../src/services/storage', () => ({ StorageService: { saveLastReadingSession: vi.fn() } }));
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
vi.mock('../../src/repositories/FlashcardsRepository', () => ({ flashcardsRepository: { saveFlashcard: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('../../src/repositories/ReadingProgressRepository', () => ({
  readingProgressRepository: {
    getReadingProgress: vi.fn().mockResolvedValue({}),
    setSectionRead: vi.fn().mockResolvedValue(50),
  },
}));

const getSeal = vi.fn<(id: string) => Promise<'ia' | 'ia_e_pessoa' | null>>();
vi.mock('../../src/repositories/MaterialSealRepository', () => ({ materialSealRepository: { getSeal } }));
vi.mock('../../src/repositories/MaterialErrorReportsRepository', async () => {
  const real = await vi.importActual<typeof import('../../src/repositories/MaterialErrorReportsRepository')>(
    '../../src/repositories/MaterialErrorReportsRepository',
  );
  return { ...real, reportarErroDisponivel: true };
});

const { CompendiumReader } = await import('../../src/components/compendium/CompendiumReader');

const discipline: Discipline = { id: 'd1', name: 'Nefrologia', code: 'NEFRO', icon: 'kidney', description: '', cycle: 'clinico', color: '#0F766E' };
const theme: Theme = { id: 't1', disciplineId: 'd1', name: 'Função renal', description: '', highYield: true, order: 1 };

function material(over: Partial<Compendium> = {}): Compendium {
  return {
    id: 'm1',
    disciplineId: 'd1',
    themeId: 't1',
    title: 'Avaliação da função renal',
    subtitle: 'Material de teste',
    estimatedReadTimeMinutes: 10,
    lastUpdated: '2026-09-21T12:00:00.000Z',
    author: 'Equipe Editorial',
    sections: [{ id: 's1', title: 'Primeiro tópico', content: 'Conteúdo principal.', keyTakeaways: [] }],
    references: [],
    ...over,
  };
}

function renderizar(c: Compendium) {
  return render(
    <CompendiumReader
      compendium={c}
      compendiums={[c]}
      onOpenCompendium={vi.fn()}
      disciplines={[discipline]}
      themes={[theme]}
      onBack={vi.fn()}
      onOpenQuestionsForTheme={vi.fn()}
      onOpenQuestionsForMaterial={vi.fn()}
      onOpenFlashcardsForTheme={vi.fn()}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('44-G — leitor: selo de revisão e Reportar erro', () => {
  it('material publicado por revisão de IA: mostra o selo e o botão "Reportar erro"', async () => {
    getSeal.mockResolvedValue('ia');
    renderizar(material({ publicationStatus: 'published' }));
    const selo = await screen.findByTestId('selo-de-revisao');
    expect(selo.textContent).toBe('Revisado por IA — ainda não lido por uma pessoa');
    expect(screen.getByRole('button', { name: 'Reportar erro' })).toBeTruthy();
    expect(getSeal).toHaveBeenCalledWith('m1');
  });

  it('depois da atestação de uma pessoa, o selo é o mais forte', async () => {
    getSeal.mockResolvedValue('ia_e_pessoa');
    renderizar(material({ publicationStatus: 'published' }));
    expect((await screen.findByTestId('selo-de-revisao')).textContent).toBe('Revisado por IA e por uma pessoa');
  });

  it('material antigo publicado: sem selo novo, mas o botão "Reportar erro" continua (vale para todo material publicado)', async () => {
    getSeal.mockResolvedValue(null);
    renderizar(material({ publicationStatus: 'published' }));
    await waitFor(() => expect(getSeal).toHaveBeenCalled());
    expect(screen.queryByTestId('selo-de-revisao')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reportar erro' })).toBeTruthy();
  });

  it('material que não está publicado (rascunho, prévia do admin): nem selo nem "Reportar erro", e nem consulta o servidor', () => {
    renderizar(material({ publicationStatus: 'draft' }));
    expect(screen.queryByRole('button', { name: 'Reportar erro' })).toBeNull();
    expect(screen.queryByTestId('selo-de-revisao')).toBeNull();
    expect(getSeal).not.toHaveBeenCalled();
  });
});
