import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { Compendium, Discipline, Flashcard, Theme } from '../../src/types';

// P10: ao revisar um card que guarda a seção, "ver no material" abre o material NAQUELA seção.
// Card sem seção (os antigos) continua abrindo o material do começo.

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('../../src/repositories/FlashcardsRepository', () => ({
  flashcardsRepository: { reviewFlashcard: vi.fn() },
}));
vi.mock('../../src/services/storage', () => ({ StorageService: {}, getStorageUser: () => null }));

const { FlashcardReviewSession } = await import('../../src/components/flashcards/FlashcardReviewSession');

const disciplina = { id: 'd-1', name: 'Pneumologia' } as Discipline;
const tema = { id: 't-1', disciplineId: 'd-1', name: 'Espirometria' } as Theme;
const material = {
  id: 'mat-1',
  disciplineId: 'd-1',
  themeId: 't-1',
  title: 'Espirometria: como interpretar',
  sections: [
    { id: 'sec-obs', title: 'Padrão obstrutivo', content: 'x', keyTakeaways: [] },
    { id: 'sec-res', title: 'Padrão restritivo', content: 'y', keyTakeaways: [] },
  ],
  references: [],
} as unknown as Compendium;

function card(extra: Partial<Flashcard>): Flashcard {
  return {
    id: 'c-1',
    disciplineId: 'd-1',
    themeId: 't-1',
    front: 'Frente do card',
    back: 'Verso do card',
    mechanismHighlight: '',
    tags: [],
    difficulty: 'medio',
    srs: { intervalDays: 0, repetitionCount: 0, easeFactor: 2.5, nextDueDate: '2026-01-01', state: 'new', reviewHistory: [] },
    ...extra,
  } as Flashcard;
}

function renderSessao(c: Flashcard, onOpenCompendium = vi.fn()) {
  render(
    <FlashcardReviewSession
      cards={[c]}
      disciplines={[disciplina]}
      themes={[tema]}
      compendiums={[material]}
      onFinishSession={() => {}}
      onOpenCompendium={onOpenCompendium}
    />
  );
  fireEvent.click(screen.getByText('Frente do card')); // vira o card
  return onOpenCompendium;
}

afterEach(() => cleanup());

// O cartão inteiro é um role="button" (vira o card), então o nome do botão é achado pelo texto, não pelo papel.
const clicarNoTexto = (texto: string | RegExp) => fireEvent.click(screen.getByText(texto).closest('button') as HTMLElement);

describe('FlashcardReviewSession — ver no material, na seção (P10)', () => {
  it('card com seção: o botão diz a seção e abre o material nela (nos dois pontos de entrada)', () => {
    const abrir = renderSessao(card({ compendiumRefId: 'mat-1', compendiumSectionId: 'sec-res' }));
    clicarNoTexto('Ver no material: Padrão restritivo');
    expect(abrir).toHaveBeenLastCalledWith('mat-1', 'sec-res');
    clicarNoTexto('Ver no material');
    expect(abrir).toHaveBeenLastCalledWith('mat-1', 'sec-res');
    expect(abrir).toHaveBeenCalledTimes(2);
  });

  it('card sem seção (antigo): abre o material do começo, como antes', () => {
    const abrir = renderSessao(card({ compendiumRefId: 'mat-1' }));
    clicarNoTexto(/Estudar Teoria na Biblioteca/);
    expect(abrir).toHaveBeenLastCalledWith('mat-1', undefined);
    clicarNoTexto('Ver na Biblioteca');
    expect(abrir).toHaveBeenLastCalledWith('mat-1', undefined);
  });

  it('a seção só vale com o material do card: seção sem material não é aberta às cegas', () => {
    const abrir = renderSessao(card({ compendiumSectionId: 'sec-res' }));
    clicarNoTexto(/Estudar Teoria na Biblioteca/);
    expect(abrir).toHaveBeenLastCalledWith('mat-1', undefined); // material achado pelo tema, sem a seção
  });
});
