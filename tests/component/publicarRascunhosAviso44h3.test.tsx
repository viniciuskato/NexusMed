import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, configure, fireEvent, render, screen, within } from '@testing-library/react';
import type { Compendium, Discipline, Question, Theme } from '../../src/types';

configure({ asyncUtilTimeout: 8000 });
vi.setConfig({ testTimeout: 30000 });

// 44-H3 — os botões "Publicar rascunhos" (material e questões) da Área Editorial não publicam
// conteúdo novo: o banco só aceita o que passou pelo revisor de IA (ou o que já esteve no ar e não
// mudou). A tela diz isso ANTES do clique (aviso ao lado do botão, dica do botão e texto da
// confirmação), em vez de deixar o admin descobrir pelas falhas.

vi.mock('../../src/repositories/ContentProvenanceRepository', () => ({
  contentProvenanceRepository: {
    getProvenanceStatus: vi.fn().mockResolvedValue('legacy_unmapped'),
    listRevisions: vi.fn().mockResolvedValue([]),
    listClaims: vi.fn().mockResolvedValue([]),
    listClaimSources: vi.fn().mockResolvedValue([]),
    getSourcesByIds: vi.fn().mockResolvedValue(new Map()),
    searchSources: vi.fn().mockResolvedValue([]),
  },
}));

import { AdminCMSView } from '../../src/components/admin/AdminCMSView';

const discipline = { id: 'farmaco', name: 'Farmacologia', code: 'FARM', icon: 'pill', description: '', cycle: 'basico', color: 'teal' } as unknown as Discipline;
const theme: Theme = { id: 'atb', disciplineId: 'farmaco', name: 'Antibióticos', description: '', highYield: false, order: 1 };
const material = {
  id: 'mat-a', disciplineId: 'farmaco', themeId: 'atb', title: 'Material A', subtitle: '', estimatedReadTimeMinutes: 10,
  lastUpdated: '', author: '', publicationStatus: 'draft', sections: [], references: [], referenceSources: [],
} as unknown as Compendium;
const questao = {
  id: 'q-a', disciplineId: 'farmaco', themeId: 'atb', compendiumRefId: '', cycle: 'internato_residencia', difficulty: 'medio',
  institution: 'ENARE', year: 2024, clinicalVignette: '', questionStem: 'Enunciado de rascunho', options: [],
  generalCommentary: '', highYieldSummary: '', tags: [], publicationStatus: 'draft',
} as unknown as Question;

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const renderAdmin = () =>
  render(
    <AdminCMSView
      disciplines={[discipline]}
      themes={[theme]}
      questions={[questao]}
      compendiums={[material]}
      flashcards={[]}
      onRefreshData={vi.fn()}
      onOpenCompendium={vi.fn()}
    />,
  );

describe('44-H3 — "Publicar rascunhos" explica antes do clique', () => {
  it('material: o aviso está na tela, a dica do botão diz o mesmo e a confirmação repete', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin();
    const aviso = await screen.findByTestId('aviso-publicar-rascunhos-material');
    expect(aviso.textContent).toContain('Conteúdo novo só vai ao ar pelo revisor de IA');
    expect(aviso.textContent).toContain('“Enviar material”');
    const botao = screen.getByRole('button', { name: /Publicar rascunhos/ });
    expect(botao.getAttribute('title')).toContain('só vai ao ar pelo revisor de IA');
    fireEvent.click(botao);
    expect(confirmar).toHaveBeenCalledTimes(1);
    expect(String(confirmar.mock.calls[0][0])).toContain('Conteúdo novo só vai ao ar pelo revisor de IA');
  });

  it('questões: idem, na aba de Questões', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin();
    const abas = await screen.findAllByRole('button', { name: /^Questões/ });
    fireEvent.click(abas[0]);
    const aviso = await screen.findByTestId('aviso-publicar-rascunhos-questoes');
    expect(aviso.textContent).toContain('Questão nova só vai ao ar pelo revisor de IA');
    expect(aviso.textContent).toContain('na aba Questões');
    expect(screen.queryByTestId('aviso-publicar-rascunhos-material')).toBeNull();
    const botao = within(aviso.closest('div')?.parentElement as HTMLElement).getByRole('button', { name: /Publicar rascunhos/ });
    expect(botao.getAttribute('title')).toContain('questão nova só vai ao ar pelo revisor de IA');
    fireEvent.click(botao);
    expect(confirmar).toHaveBeenCalledTimes(1);
    expect(String(confirmar.mock.calls[0][0])).toContain('Questão nova só vai ao ar pelo revisor de IA');
  });
});
