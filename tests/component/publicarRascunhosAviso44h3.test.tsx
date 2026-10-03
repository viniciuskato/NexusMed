import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, configure, fireEvent, render, screen } from '@testing-library/react';
import type { Compendium, Discipline, Question, Theme } from '../../src/types';

configure({ asyncUtilTimeout: 8000 });
vi.setConfig({ testTimeout: 30000 });

// 44-H3, revisto pela P6 (03/10) — os botões "Publicar rascunhos" (material e questões) da Área Editorial
// voltam a publicar conteúdo novo: o parecer do revisor de IA aconselha, não trava. A tela não pode mais
// dizer que "conteúdo novo só vai ao ar pelo revisor de IA" (nem na dica do botão, nem na confirmação),
// e o texto da confirmação não manda o dono "enviar o arquivo" para publicar.

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

describe('P6 — "Publicar rascunhos" não promete mais a trava do revisor', () => {
  it('material: sem o aviso antigo; a dica diz que o revisor aconselha; a confirmação não cita a trava', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin();
    const botao = await screen.findByRole('button', { name: /Publicar rascunhos/ });
    expect(screen.queryByTestId('aviso-publicar-rascunhos-material')).toBeNull();
    expect(screen.queryByText(/só vai ao ar pelo revisor de IA/i)).toBeNull();
    expect(botao.getAttribute('title')).toContain('aconselha, não trava');
    expect(botao.getAttribute('title')).not.toContain('só vai ao ar pelo revisor');
    fireEvent.click(botao);
    expect(confirmar).toHaveBeenCalledTimes(1);
    const texto = String(confirmar.mock.calls[0][0]);
    expect(texto).toContain('Publicar os 1 conteúdos em rascunho?');
    expect(texto).not.toContain('revisor de IA');
    expect(texto).not.toContain('Enviar material');
  });

  it('questões: idem, na aba de Questões', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin();
    const abas = await screen.findAllByRole('button', { name: /^Questões/ });
    fireEvent.click(abas[0]);
    const botoes = await screen.findAllByRole('button', { name: /Publicar rascunhos/ });
    const botao = botoes[botoes.length - 1];
    expect(screen.queryByTestId('aviso-publicar-rascunhos-questoes')).toBeNull();
    expect(botao.getAttribute('title')).toContain('aconselha, não trava');
    fireEvent.click(botao);
    expect(confirmar).toHaveBeenCalledTimes(1);
    const texto = String(confirmar.mock.calls[0][0]);
    expect(texto).toContain('Tentar publicar as 1 questões em rascunho?');
    expect(texto).not.toContain('revisor de IA');
    expect(texto).not.toContain('Enviar material');
  });
});
