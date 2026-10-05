import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Compendium, Discipline, Theme } from '../../src/types';
import { VERSAO_ATUAL_DO_PADRAO } from '../../src/utils/compendiumStandardCheck';

// MAT-1 — "Publicado em"/"Atualizado em" na biblioteca e na leitura (para qualquer pessoa) e o selo "Desatualizado" (só
// admin): os dois cartões da biblioteca (cartões e lista) e o cabeçalho do leitor. O banco é provado em pgTAP.

const { estado } = vi.hoisted(() => ({ estado: { admin: false } }));
vi.mock('../../src/hooks/useEhAdmin', () => ({ useEhAdmin: () => estado.admin }));
vi.mock('../../src/hooks/useScrollMemory', () => ({ useScrollMemory: vi.fn() }));
vi.mock('../../src/components/feedback/ContextualFeedbackPopover', () => ({ ContextualFeedbackPopover: () => null }));
vi.mock('../../src/services/storage', () => ({
  StorageService: {
    getHighlights: () => ({}),
    getUIState: (_k: string, d: unknown) => d,
    setUIState: () => {},
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
vi.mock('../../src/repositories/FlashcardsRepository', () => ({ flashcardsRepository: { saveFlashcard: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('../../src/repositories/ReadingProgressRepository', () => ({
  readingProgressRepository: {
    getReadingProgress: vi.fn().mockResolvedValue({}),
    setSectionRead: vi.fn().mockResolvedValue(50),
  },
}));
vi.mock('../../src/repositories/MaterialSealRepository', () => ({ materialSealRepository: { getSeal: vi.fn().mockResolvedValue(null) } }));
vi.mock('../../src/repositories/MaterialSubmissionsRepository', () => ({
  materialSubmissionsRepository: { podeAtualizar: vi.fn().mockResolvedValue(false) },
  envioDeMaterialDisponivel: true,
}));

const { CompendiumView } = await import('../../src/components/compendium/CompendiumView');
const { CompendiumReader } = await import('../../src/components/compendium/CompendiumReader');
const { DatasDoMaterial, SeloDesatualizado } = await import('../../src/components/material/DatasDoMaterial');

const discipline: Discipline = { id: 'd', name: 'Farmacologia', code: 'F', icon: 'pill', description: '', cycle: 'clinico', color: '#000' };
const theme: Theme = { id: 't', disciplineId: 'd', name: 'Antimicrobianos', description: '', highYield: false, order: 1 };

function material(over: Partial<Compendium> = {}): Compendium {
  return {
    id: 'm1',
    disciplineId: 'd',
    themeId: 't',
    title: 'Cardiac anatomy',
    subtitle: 'Material de teste',
    estimatedReadTimeMinutes: 10,
    // Meio-dia UTC: o mesmo dia do calendário em qualquer fuso do Brasil.
    publishedAt: '2026-09-10T15:00:00.000Z',
    lastUpdated: '2026-10-02T15:00:00.000Z',
    standardVersion: null,
    publicationStatus: 'published',
    author: 'Equipe',
    sections: [{ id: 's1', title: 'Primeiro tópico', content: 'Conteúdo.', keyTakeaways: [] }],
    references: [],
    ...over,
  };
}

function biblioteca(c: Compendium) {
  return render(
    <CompendiumView
      compendiums={[c]}
      disciplines={[discipline]}
      themes={[theme]}
      onOpenCompendium={vi.fn()}
      onOpenQuestionsForTheme={vi.fn()}
      initialDisciplineId="d"
    />,
  );
}

function leitor(c: Compendium) {
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

beforeEach(() => {
  estado.admin = false;
});
afterEach(cleanup);

describe('MAT-1 — datas na biblioteca', () => {
  it('cartão: qualquer pessoa vê "Publicado em" e "Atualizado em"', async () => {
    biblioteca(material());
    expect((await screen.findByTestId('publicado-em')).textContent).toBe('Publicado em 10/09/2026');
    expect(screen.getByTestId('atualizado-em').textContent).toBe('Atualizado em 02/10/2026');
  });

  it('lista: as mesmas datas', async () => {
    biblioteca(material());
    fireEvent.click(await screen.findByLabelText('Modo lista'));
    expect((await screen.findByTestId('publicado-em')).textContent).toBe('Publicado em 10/09/2026');
    expect(screen.getByTestId('atualizado-em').textContent).toBe('Atualizado em 02/10/2026');
  });

  it('atualização no mesmo dia da publicação: só "Publicado em"', async () => {
    biblioteca(material({ lastUpdated: '2026-09-10T18:00:00.000Z' }));
    expect((await screen.findByTestId('publicado-em')).textContent).toBe('Publicado em 10/09/2026');
    expect(screen.queryByTestId('atualizado-em')).toBeNull();
  });
});

describe('MAT-1 — selo "Desatualizado" na biblioteca', () => {
  it('admin: versão nula ou anterior à atual mostra o selo, nos dois cartões', async () => {
    estado.admin = true;
    const { unmount } = biblioteca(material({ standardVersion: null }));
    expect((await screen.findByTestId('selo-desatualizado')).textContent).toBe('Desatualizado');
    fireEvent.click(screen.getByLabelText('Modo lista'));
    expect((await screen.findByTestId('selo-desatualizado')).textContent).toBe('Desatualizado');
    unmount();
    biblioteca(material({ standardVersion: VERSAO_ATUAL_DO_PADRAO - 1 }));
    expect((await screen.findAllByTestId('selo-desatualizado')).length).toBeGreaterThan(0);
  });

  it('admin: na versão atual, nenhum selo', async () => {
    estado.admin = true;
    biblioteca(material({ standardVersion: VERSAO_ATUAL_DO_PADRAO }));
    await screen.findByTestId('publicado-em');
    expect(screen.queryByTestId('selo-desatualizado')).toBeNull();
  });

  it('quem não é admin nunca vê o selo, mesmo com material antigo', async () => {
    estado.admin = false;
    biblioteca(material({ standardVersion: null }));
    await screen.findByTestId('publicado-em');
    expect(screen.queryByTestId('selo-desatualizado')).toBeNull();
    expect(screen.queryByText('Desatualizado')).toBeNull();
  });
});

describe('MAT-1 — cabeçalho da leitura', () => {
  it('qualquer pessoa vê "Publicado em" e "Atualizado em"; o aluno não vê o selo', async () => {
    leitor(material());
    expect((await screen.findByTestId('publicado-em')).textContent).toBe('Publicado em 10/09/2026');
    expect(screen.getByTestId('atualizado-em').textContent).toBe('Atualizado em 02/10/2026');
    expect(screen.queryByTestId('selo-desatualizado')).toBeNull();
  });

  it('admin: material antigo mostra "Desatualizado"; na versão atual não mostra', async () => {
    estado.admin = true;
    const { unmount } = leitor(material({ standardVersion: 2 }));
    expect((await screen.findByTestId('selo-desatualizado')).textContent).toBe('Desatualizado');
    unmount();
    leitor(material({ standardVersion: VERSAO_ATUAL_DO_PADRAO }));
    await screen.findByTestId('publicado-em');
    expect(screen.queryByTestId('selo-desatualizado')).toBeNull();
  });
});

describe('MAT-1 — componentes', () => {
  it('sem nenhuma data legível, nada aparece (e nunca "Invalid Date")', () => {
    const { container } = render(<DatasDoMaterial compendium={{ publishedAt: null, lastUpdated: 'não é data' }} />);
    expect(container.textContent).toBe('');
  });

  it('só a atualização, quando o material não tem data de publicação', () => {
    render(<DatasDoMaterial compendium={{ publishedAt: null, lastUpdated: '2026-10-02T15:00:00.000Z' }} />);
    expect(screen.queryByTestId('publicado-em')).toBeNull();
    expect(within(screen.getByTestId('datas-do-material')).getByText('Atualizado em 02/10/2026')).toBeTruthy();
  });

  it('o selo depende de quem olha e da versão', () => {
    const { container, rerender } = render(<SeloDesatualizado compendium={{ standardVersion: undefined }} ehAdmin={false} />);
    expect(container.textContent).toBe('');
    rerender(<SeloDesatualizado compendium={{ standardVersion: undefined }} ehAdmin />);
    expect(container.textContent).toBe('Desatualizado');
    rerender(<SeloDesatualizado compendium={{ standardVersion: VERSAO_ATUAL_DO_PADRAO + 1 }} ehAdmin />);
    expect(container.textContent).toBe('');
  });
});
