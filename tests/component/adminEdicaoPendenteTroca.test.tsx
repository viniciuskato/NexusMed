import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Compendium, Discipline, Theme } from '../../src/types';

// 45-K (revisão do 8e71e5f, item 8): abrir a edição de A (que espera a edição
// pendente vir do banco) e logo depois a de B não pode deixar a resposta
// atrasada de A tomar o formulário de B — salvar gravaria em A.

let resolvePendingA: (c: Compendium) => void = () => {};
const getPendingEditMock = vi.fn(
  (current: Compendium) =>
    new Promise<Compendium | null>((resolve) => {
      if (current.id === 'mat-a') resolvePendingA = resolve;
      else resolve(null);
    })
);

vi.mock('../../src/repositories/MaterialsRepository', () => ({
  materialsRepository: {
    getPendingEdit: (c: Compendium) => getPendingEditMock(c),
    saveCompendium: vi.fn(),
    discardPendingEdit: vi.fn(),
  },
}));

const { AdminCMSView } = await import('../../src/components/admin/AdminCMSView');

const discipline = { id: 'd', name: 'Farmacologia', code: 'F', icon: 'pill', description: '', cycle: 'basico', color: 'teal' } as unknown as Discipline;
const theme: Theme = { id: 't', disciplineId: 'd', name: 'Antibióticos', description: '', highYield: false, order: 1 };
const material = (id: string, title: string, extra: Partial<Compendium> = {}): Compendium => ({
  id, disciplineId: 'd', themeId: 't', title, subtitle: 's', estimatedReadTimeMinutes: 10, lastUpdated: '', author: '',
  sections: [{ id: `${id}-s`, title: 'Seção', content: 'Texto.', keyTakeaways: [] }], references: [], ...extra,
});

const matA = material('mat-a', 'Material A', { publicationStatus: 'published', hasPendingEdit: true });
const matB = material('mat-b', 'Material B', { publicationStatus: 'draft' });

function cardOf(materialId: string) {
  return within(screen.getByText(`ID: ${materialId}`).parentElement as HTMLElement);
}

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => cleanup());

describe('AdminCMSView — troca rápida de material com edição pendente (45-K)', () => {
  it('a resposta atrasada de A não toma o formulário de B', async () => {
    render(
      <AdminCMSView disciplines={[discipline]} themes={[theme]} questions={[]} compendiums={[matA, matB]} flashcards={[]}
        onRefreshData={vi.fn()} onOpenCompendium={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: /Conteúdos/ }));

    fireEvent.click(cardOf('mat-a').getByRole('button', { name: /Editar/ }));
    fireEvent.click(cardOf('mat-a').getByRole('button', { name: /Conteúdo/ }));
    fireEvent.click(cardOf('mat-b').getByRole('button', { name: /Editar/ }));
    fireEvent.click(cardOf('mat-b').getByRole('button', { name: /Metadados/ }));

    const title = () => (document.getElementById('admincmsview-titulo-principal-do-compendio-1') as HTMLInputElement).value;
    expect(title()).toBe('Material B');

    await act(async () => resolvePendingA({ ...matA, title: 'Material A (edição pendente)' }));
    expect(title()).toBe('Material B');
  });
});
