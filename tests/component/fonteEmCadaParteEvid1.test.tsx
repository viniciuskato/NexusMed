import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { Compendium, Discipline, Theme } from '../../src/types';

// EVID-1 — a leitura mostra, para qualquer pessoa, em quantas referências o material se baseia e quantas partes têm
// citação; só o admin vê o selo "Sem fonte nesta parte" nas partes sem citação.

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

const { CompendiumReader } = await import('../../src/components/compendium/CompendiumReader');

const discipline: Discipline = { id: 'd', name: 'Farmacologia', code: 'F', icon: 'pill', description: '', cycle: 'clinico', color: '#000' };
const theme: Theme = { id: 't', disciplineId: 'd', name: 'Antimicrobianos', description: '', highYield: false, order: 1 };

const REFERENCIAS = ['Fonte 1.', 'Fonte 2.', 'Fonte 3.', 'Fonte 4.'];

function material(over: Partial<Compendium> = {}): Compendium {
  return {
    id: 'm1',
    disciplineId: 'd',
    themeId: 't',
    title: 'Cefalosporinas',
    subtitle: 'Material de teste',
    estimatedReadTimeMinutes: 10,
    publishedAt: '2026-09-10T15:00:00.000Z',
    lastUpdated: '2026-10-02T15:00:00.000Z',
    standardVersion: 3,
    publicationStatus: 'published',
    author: 'Equipe',
    sections: [
      { id: 's1', title: 'Espectro', content: 'Cobre gram-positivos [1](#ref-1).', keyTakeaways: [] },
      { id: 's2', title: 'Resistência', content: 'Texto sem nenhuma citação.', keyTakeaways: ['Ponto sem citação'] },
      { id: 's3', title: 'Doses', content: 'Texto sem citação.', keyTakeaways: [], clinicalPearl: 'Pérola com fonte [3](#ref-3).' },
    ],
    references: REFERENCIAS,
    ...over,
  };
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
    />,
  );
}

beforeEach(() => {
  estado.admin = false;
});
afterEach(cleanup);

describe('EVID-1 — resumo das fontes no topo da leitura', () => {
  it('4 referências e 2 de 3 partes com citação: o texto exato, visível a quem lê', async () => {
    leitor(material());
    expect((await screen.findByTestId('base-de-evidencias')).textContent).toBe('Baseado em 4 referências · 2 de 3 partes com citação');
  });

  it('o resumo fica junto das datas do material', async () => {
    leitor(material());
    const resumo = await screen.findByTestId('base-de-evidencias');
    expect(resumo.closest('div')).toBe(screen.getByTestId('datas-do-material').closest('div'));
  });

  it('sem referências: "Este material ainda não tem referências."', async () => {
    leitor(material({ references: [] }));
    expect((await screen.findByTestId('base-de-evidencias')).textContent).toBe('Este material ainda não tem referências.');
  });

  it('material com referências e nenhuma seção: só "Baseado em N referências"', async () => {
    leitor(material({ sections: [] }));
    expect((await screen.findByTestId('base-de-evidencias')).textContent).toBe('Baseado em 4 referências');
  });

  it('o singular não vira "1 referências"', async () => {
    leitor(material({ references: ['Fonte 1.'], sections: [material().sections[0]] }));
    expect((await screen.findByTestId('base-de-evidencias')).textContent).toBe('Baseado em 1 referência · 1 de 1 parte com citação');
  });
});

describe('EVID-1 — selo "Sem fonte nesta parte"', () => {
  it('admin: o selo aparece junto do título só nas partes sem citação', async () => {
    estado.admin = true;
    leitor(material());
    await screen.findByTestId('base-de-evidencias');
    const selos = screen.getAllByText('Sem fonte nesta parte');
    expect(selos).toHaveLength(1);
    const secao = document.getElementById('s2') as HTMLElement;
    expect(within(secao).getByText('Sem fonte nesta parte')).toBeTruthy();
    expect(within(secao).getByRole('heading', { name: 'Resistência' }).parentElement).toBe(selos[0].parentElement);
    expect(within(document.getElementById('s1') as HTMLElement).queryByText('Sem fonte nesta parte')).toBeNull();
    expect(within(document.getElementById('s3') as HTMLElement).queryByText('Sem fonte nesta parte')).toBeNull();
  });

  it('estudante: nenhum selo, mesmo com partes sem citação', async () => {
    estado.admin = false;
    leitor(material());
    await screen.findByTestId('base-de-evidencias');
    expect(screen.queryByText('Sem fonte nesta parte')).toBeNull();
  });
});
