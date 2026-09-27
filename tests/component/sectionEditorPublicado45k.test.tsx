import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Compendium } from '../../src/types';

// 45-K: o editor de seção gravava direto na tabela — em material publicado,
// isso ia ao ar sem revisão. Agora ele explica que material publicado se edita
// pelo formulário (a edição fica pendente até ser atestada) e não grava.

vi.mock('../../src/repositories/MaterialsRepository', () => ({
  materialsRepository: {
    updateSectionContent: vi.fn(),
    revertSectionToVersion: vi.fn(),
    getSectionVersions: vi.fn().mockResolvedValue([]),
  },
}));

const { default: SectionEditor } = await import('../../src/components/admin/SectionEditor');

const material = (publicationStatus: Compendium['publicationStatus']): Compendium => ({
  id: 'm', disciplineId: 'd', themeId: 't', title: 'Ceftriaxona', subtitle: '', estimatedReadTimeMinutes: 10,
  lastUpdated: '', author: '', references: [], publicationStatus,
  sections: [{ id: 's1', title: 'Espectro', content: 'Texto.', keyTakeaways: [] }],
});

afterEach(() => cleanup());

describe('SectionEditor — material publicado (45-K)', () => {
  it('explica o caminho e não oferece gravação direta', () => {
    render(<SectionEditor compendium={material('published')} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByText(/material publicado se edita pelo formulário/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Salvar alterações/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('rascunho continua editável aqui', () => {
    render(<SectionEditor compendium={material('draft')} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByText(/material publicado se edita pelo formulário/i)).toBeNull();
    expect((screen.getByRole('button', { name: /Salvar alterações/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});
