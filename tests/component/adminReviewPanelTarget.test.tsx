import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Claim, Compendium, ContentRevision, Discipline, Theme } from '../../src/types';

// ============================================================================
// Unidade 45-B (AUD-23): a revisão atesta o item certo.
//
// A Área Editorial tem um painel de revisão único, reaproveitado para
// qualquer item. Com o painel aberto no material A, abrir "Revisão" do
// material B trocava só o título: status, claims e a revisão carregada
// continuavam os de A — e "Aprovar"/"Atestar" agiam sobre A. O mesmo valia
// para o painel de referências, com as fontes escolhidas indexadas por
// posição. Estes testes montam a Área Editorial de verdade, com o
// repositório de proveniência simulado, e trocam de item com o painel aberto.
// ============================================================================

const revisionA: ContentRevision = {
  id: 'rev-a',
  materialId: 'mat-a',
  questionId: null,
  revisionNumber: 1,
  snapshotHash: 'hash-a',
  policyVersion: 'v1',
  createdBy: 'admin',
  createdAt: '2026-09-23T00:00:00Z',
};

const claimA: Claim = {
  id: 'claim-a',
  contentRevisionId: 'rev-a',
  claimText: 'Afirmação que só existe no material A',
  claimKind: 'synthesized_claim',
  contentLocator: 'section:sec-a',
  riskCategory: null,
  requiresSource: false,
  decision: 'pendente',
  decidedBy: null,
  decidedAt: null,
  sortOrder: 0,
};

const getProvenanceStatusMock = vi.fn();
const listRevisionsMock = vi.fn();
const listClaimsMock = vi.fn();

vi.mock('../../src/repositories/ContentProvenanceRepository', () => ({
  contentProvenanceRepository: {
    getProvenanceStatus: (...args: unknown[]) => getProvenanceStatusMock(...args),
    listRevisions: (...args: unknown[]) => listRevisionsMock(...args),
    listClaims: (...args: unknown[]) => listClaimsMock(...args),
    listClaimSources: vi.fn().mockResolvedValue([]),
    getSourcesByIds: vi.fn().mockResolvedValue(new Map()),
    searchSources: vi.fn().mockResolvedValue([
      { id: 'src-x', citationText: 'Fonte escolhida para A', tipo: 'livro', verificacao: 'verificada' },
    ]),
  },
}));

import { AdminCMSView } from '../../src/components/admin/AdminCMSView';

const discipline = {
  id: 'farmaco',
  name: 'Farmacologia',
  code: 'FARM',
  icon: 'pill',
  description: '',
  cycle: 'basico',
  color: 'teal',
} as unknown as Discipline;

const theme: Theme = {
  id: 'atb',
  disciplineId: 'farmaco',
  name: 'Antibióticos',
  description: '',
  highYield: false,
  order: 1,
};

function material(id: string, title: string, references: string[] = []): Compendium {
  return {
    id,
    disciplineId: 'farmaco',
    themeId: 'atb',
    title,
    subtitle: '',
    estimatedReadTimeMinutes: 10,
    lastUpdated: '',
    author: '',
    publicationStatus: 'draft',
    sections: [],
    references,
    referenceSources: references.map((text, i) => ({
      id: `${id}-ref-${i}`,
      citationText: text,
      linked: false,
    })),
  } as Compendium;
}

const matA = material('mat-a', 'Material A', ['Referência de A']);
const matB = material('mat-b', 'Material B', ['Referência de B']);

function renderAdmin() {
  return render(
    <AdminCMSView
      disciplines={[discipline]}
      themes={[theme]}
      questions={[]}
      compendiums={[matA, matB]}
      flashcards={[]}
      onRefreshData={vi.fn()}
      onOpenCompendium={vi.fn()}
    />
  );
}

/** Botões do cartão de um material, achados pelo "ID: …" que o cartão mostra. */
function cardOf(materialId: string) {
  const idLabel = screen.getByText(`ID: ${materialId}`);
  return within(idLabel.parentElement as HTMLElement);
}

beforeEach(() => {
  localStorage.clear();
  // jsdom não implementa scrollIntoView; o painel de revisão o chama ao abrir.
  Element.prototype.scrollIntoView = vi.fn();
  getProvenanceStatusMock.mockImplementation(async (target: { materialId?: string }) =>
    target.materialId === 'mat-a' ? 'em_revisao' : 'legacy_unmapped'
  );
  listRevisionsMock.mockImplementation(async (target: { materialId?: string }) =>
    target.materialId === 'mat-a' ? [revisionA] : []
  );
  listClaimsMock.mockImplementation(async (revisionId: string) => (revisionId === 'rev-a' ? [claimA] : []));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('45-B — o painel de revisão sempre mostra o item aberto por último', () => {
  it('abrir a revisão de B com o painel aberto em A mostra status e claims de B, nunca os de A', async () => {
    renderAdmin();

    fireEvent.click(cardOf('mat-a').getByRole('button', { name: /Revisão/ }));
    const panelA = await screen.findByText('Revisão editorial — Material A');
    await waitFor(() => expect(screen.getByText('Afirmação que só existe no material A')).toBeTruthy());
    expect(within(panelA.closest('[data-provenance-status]') as HTMLElement).getByText('Em revisão')).toBeTruthy();

    fireEvent.click(cardOf('mat-b').getByRole('button', { name: /Revisão/ }));
    await screen.findByText('Revisão editorial — Material B');

    // O painel carregou B de fato — não só trocou o título.
    await waitFor(() =>
      expect(getProvenanceStatusMock).toHaveBeenLastCalledWith({ materialId: 'mat-b' })
    );
    const panelB = screen.getByText('Revisão editorial — Material B').closest('[data-provenance-status]') as HTMLElement;
    await waitFor(() => expect(panelB.getAttribute('data-provenance-status')).toBe('legacy_unmapped'));
    expect(within(panelB).getByText('Legado não mapeado')).toBeTruthy();

    // Nada de A sobra no painel de B: nem o claim, nem a revisão que "Aprovar" atestaria.
    expect(screen.queryByText('Afirmação que só existe no material A')).toBeNull();
    expect(within(panelB).queryByRole('button', { name: /Aprovar/ })).toBeNull();
  });
});

describe('45-B — o painel de referências sempre mostra o material aberto por último', () => {
  it('a fonte escolhida (e ainda não associada) numa referência de A não aparece pronta para "Associar" em B', async () => {
    renderAdmin();

    const openReferences = (materialId: string) => {
      const card = cardOf(materialId);
      // As referências ficam no menu "Editar" do cartão.
      fireEvent.click(card.getByRole('button', { name: /Editar/ }));
      fireEvent.click(screen.getByRole('button', { name: /Referências/ }));
    };
    const associar = () => screen.getByRole('button', { name: 'Associar' }) as HTMLButtonElement;

    openReferences('mat-a');
    expect(await screen.findByText('Referências bibliográficas — Material A')).toBeTruthy();
    // Escolhe uma fonte para a referência de A, sem associar ainda.
    fireEvent.focus(screen.getByPlaceholderText(/Buscar fonte/));
    fireEvent.click(await screen.findByRole('button', { name: /Fonte escolhida para A/ }));
    expect(associar().disabled).toBe(false);

    openReferences('mat-b');
    expect(await screen.findByText('Referências bibliográficas — Material B')).toBeTruthy();
    expect(screen.getByText('Referência de B')).toBeTruthy();
    // A escolha feita em A não pode virar a escolha da referência de B:
    // "Associar" gravaria em B uma fonte que ninguém escolheu para ela.
    expect(screen.queryByText('Fonte escolhida para A')).toBeNull();
    expect(associar().disabled).toBe(true);
  });
});
