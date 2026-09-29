import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Compendium } from '../../src/types';

// 45-G, revisão do #93 (item 1): o leitor é reaproveitado ao navegar entre
// materiais. Se a carga do NOVO material falha (sem rede), a anotação, o
// favorito e as seções lidas do ANTERIOR não podem ficar na tela — nem ser
// gravados no novo.

vi.mock('../../src/hooks/useScrollMemory', () => ({ useScrollMemory: vi.fn() }));
vi.mock('../../src/components/feedback/ContextualFeedbackPopover', () => ({ ContextualFeedbackPopover: () => null }));
vi.mock('../../src/services/storage', () => ({
  StorageService: { saveLastReadingSession: vi.fn() },
  getStorageUser: () => null,
}));

let serverUp = true;
const offline = () => Promise.reject(new Error('Failed to fetch'));
const getBookmarks = vi.fn();
const getNotes = vi.fn();
const getProgress = vi.fn();
const setBookmark = vi.fn().mockResolvedValue(true);
const saveNote = vi.fn().mockResolvedValue(undefined);
const setSectionRead = vi.fn().mockResolvedValue(0);

vi.mock('../../src/repositories/BookmarksRepository', () => ({
  bookmarksRepository: { getBookmarks: () => getBookmarks(), setBookmark: (...a: unknown[]) => setBookmark(...a) },
}));
vi.mock('../../src/repositories/NotesRepository', () => ({
  notesRepository: {
    getNotes: () => getNotes(),
    getRemovedSectionNotes: () => (serverUp ? Promise.resolve({}) : offline()),
    saveNote: (...a: unknown[]) => saveNote(...a),
  },
}));
vi.mock('../../src/repositories/FlashcardsRepository', () => ({ flashcardsRepository: { saveFlashcard: vi.fn() } }));
vi.mock('../../src/repositories/ReadingProgressRepository', () => ({
  readingProgressRepository: {
    getReadingProgress: () => getProgress(),
    setSectionRead: (...a: unknown[]) => setSectionRead(...a),
  },
}));

const { CompendiumReader } = await import('../../src/components/compendium/CompendiumReader');

function material(id: string, title: string): Compendium {
  return {
    id,
    disciplineId: 'disc',
    themeId: 'theme',
    title,
    subtitle: '',
    estimatedReadTimeMinutes: 5,
    lastUpdated: '2026-09-21T12:00:00.000Z',
    author: 'E',
    sections: [{ id: `${id}-sec`, title: `Seção de ${title}`, content: 'Conteúdo.', keyTakeaways: [] }],
    references: [],
  } as unknown as Compendium;
}

const A = material('mat-a', 'Material A');
const B = material('mat-b', 'Material B');

beforeEach(() => {
  serverUp = true;
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  getBookmarks.mockImplementation(() =>
    serverUp ? Promise.resolve({ questions: [], compendiums: ['mat-a'], flashcards: [] }) : offline()
  );
  getNotes.mockImplementation(() => (serverUp ? Promise.resolve({ 'mat-a': 'NOTA-DO-MATERIAL-A' }) : offline()));
  getProgress.mockImplementation(() =>
    serverUp ? Promise.resolve({ 'mat-a': { readSectionIds: ['mat-a-sec'], percent: 100 } }) : offline()
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderReader(c: Compendium) {
  return (
    <CompendiumReader
      compendium={c}
      compendiums={[A, B]}
      onOpenCompendium={() => {}}
      disciplines={[]}
      themes={[]}
      onBack={() => {}}
      onOpenQuestionsForTheme={() => {}}
      onOpenQuestionsForMaterial={() => {}}
      onOpenFlashcardsForTheme={() => {}}
    />
  );
}

describe('CompendiumReader — troca de material sem rede', () => {
  it('não mostra nem grava no material novo a anotação, o favorito e a leitura do anterior', async () => {
    const view = render(renderReader(A));
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Favoritado' }).length).toBeGreaterThan(0));

    serverUp = false; // a rede cai; o estudante abre o material B pelos cards
    view.rerender(renderReader(B));
    await screen.findByText(/Sem conexão/);

    // Nada de A na tela de B.
    expect(screen.queryAllByRole('button', { name: 'Favoritado' })).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Lida', exact: true } as never)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Anotações/ }));
    const note = screen.getByPlaceholderText(/Escreva suas correlações/) as HTMLTextAreaElement;
    expect(note.value).toBe('');

    // E nada é gravado em B a partir de um estado que a tela não conhece.
    for (const btn of screen.getAllByRole('button', { name: 'Favoritar' })) fireEvent.click(btn);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar anotação' }));
    fireEvent.click(screen.getByRole('button', { name: 'Marcar lida' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(setBookmark).not.toHaveBeenCalled();
    expect(saveNote).not.toHaveBeenCalled();
    expect(setSectionRead).not.toHaveBeenCalled();
  });

  // Revisão do #93, item 1: A -> B (carga falha) -> A (carga falha de novo).
  // A troca zera o que a tela mostra (anotação, favorito, seções lidas),
  // mas, antes deste conserto, não zerava `loadedFor` — que continuava com
  // o id de A desde a primeira carga (bem-sucedida). Ao voltar para A,
  // `dataReady` (`loadedFor === compendium.id`) dava `true` de novo sobre o
  // estado que tinha acabado de ser zerado, liberando "Salvar" pra gravar
  // um texto novo por cima da anotação real de A, sem nunca ter recarregado
  // nada.
  it('A -> B (carga falha) -> A (carga falha de novo): não grava por cima da anotação de A', async () => {
    const view = render(renderReader(A));
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Favoritado' }).length).toBeGreaterThan(0));

    serverUp = false;
    view.rerender(renderReader(B));
    await screen.findByText(/Sem conex/);

    view.rerender(renderReader(A));
    // 3 chamadas: carga inicial de A, troca para B, volta para A.
    await waitFor(() => expect(getNotes).toHaveBeenCalledTimes(3));

    fireEvent.click(screen.getByRole('button', { name: /Anota/ }));
    const note = screen.getByPlaceholderText(/Escreva suas correla/) as HTMLTextAreaElement;

    // Estado zerado (não mostra a nota de A vinda da carga anterior) E
    // bloqueado (a carga de A, desta vez, também falhou) — nunca "vazia e
    // editável", que permitiria digitar e salvar por cima da nota real.
    expect(note.value).toBe('');
    expect(note.disabled).toBe(true);

    fireEvent.change(note, { target: { value: 'TEXTO NOVO' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar anotação' }));
    await new Promise((r) => setTimeout(r, 0));

    expect(saveNote).not.toHaveBeenCalled();
  });
});
