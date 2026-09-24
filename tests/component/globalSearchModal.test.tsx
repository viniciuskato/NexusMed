import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Discipline } from '../../src/types';
import type { MaterialSearchResult } from '../../src/repositories/MaterialSearchRepository';

// 43-D — o Ctrl+K busca conteúdos no banco (RPC search_materials). Aqui a RPC
// é mockada: prova o que a tela faz com o resultado — trecho destacado sem
// HTML cru, caminho na árvore, clique que abre na seção, filtros e erro. A
// busca em si (acento, prefixo, relevância, visibilidade) está no pgTAP
// busca_materiais.test.sql; o fluxo real no navegador, no E2E busca-43d.

const searchMaterialsMock = vi.fn();
vi.mock('../../src/repositories/MaterialSearchRepository', () => ({
  searchMaterials: (...args: unknown[]) => searchMaterialsMock(...args),
}));

import { GlobalSearchModal } from '../../src/components/GlobalSearchModal';
import { HIGHLIGHT_END as E, HIGHLIGHT_START as S } from '../../src/utils/searchHighlight';

const disciplines: Discipline[] = [
  { id: 'disc-farmaco', name: 'Farmacologia', code: 'FARMACO', icon: '', description: '', cycle: 'basico', color: '' },
  { id: 'disc-infecto', name: 'Infectologia', code: 'INFECTO', icon: '', description: '', cycle: 'clinico', color: '' },
];

function result(overrides: Partial<MaterialSearchResult> = {}): MaterialSearchResult {
  return {
    materialId: 'mat-cef',
    title: 'Cefalosporinas',
    titleMarked: `${S}Cefalosporinas${E}`,
    status: 'published',
    disciplineId: 'disc-farmaco',
    disciplineName: 'Farmacologia',
    treePath: ['Farmacologia', 'Antimicrobianos', 'β-lactâmicos'],
    sectionId: 'sec-espectro',
    sectionTitleMarked: 'Espectro por geração',
    snippet: `… a ceftriaxona atravessa a barreira ${S}hematoencefálica${E}. <img src=x onerror="window.__xss=1">`,
    estimatedReadTimeMinutes: 12,
    ...overrides,
  };
}

function renderModal(overrides: Partial<React.ComponentProps<typeof GlobalSearchModal>> = {}) {
  const props: React.ComponentProps<typeof GlobalSearchModal> = {
    isOpen: true,
    onClose: vi.fn(),
    disciplines,
    questions: [],
    flashcards: [],
    onNavigateToCompendium: vi.fn(),
    onNavigateToQuestion: vi.fn(),
    onNavigateToFlashcards: vi.fn(),
    ...overrides,
  };
  render(<GlobalSearchModal {...props} />);
  return props;
}

function typeQuery(text: string) {
  fireEvent.change(screen.getByRole('textbox', { name: /Pesquisar/ }), { target: { value: text } });
}

beforeEach(() => {
  searchMaterialsMock.mockReset();
  searchMaterialsMock.mockResolvedValue([result()]);
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { __xss?: unknown }).__xss;
});

describe('GlobalSearchModal — conteúdos (43-D)', () => {
  it('busca no banco e mostra título, caminho na árvore, trecho destacado e tempo de leitura', async () => {
    renderModal();
    typeQuery('hematoencefalica');

    const item = await screen.findByRole('button', { name: /Cefalosporinas/ });
    expect(searchMaterialsMock).toHaveBeenCalledWith('hematoencefalica', { disciplineId: undefined, onlyUnread: false });

    expect(within(item).getByText('Farmacologia › Antimicrobianos › β-lactâmicos')).toBeTruthy();
    const marks = item.querySelectorAll('mark');
    expect(Array.from(marks).map((m) => m.textContent)).toEqual(['Cefalosporinas', 'hematoencefálica']);
    expect(within(item).getByText(/Espectro por geração/)).toBeTruthy();
    expect(within(item).getByText(/12 min de leitura/)).toBeTruthy();
  });

  it('HTML no trecho aparece como texto, nunca como elemento', async () => {
    renderModal();
    typeQuery('hematoencefalica');
    const item = await screen.findByRole('button', { name: /Cefalosporinas/ });

    expect(item.querySelector('img')).toBeNull();
    expect(item.textContent).toContain('<img src=x onerror="window.__xss=1">');
    expect((window as unknown as { __xss?: unknown }).__xss).toBeUndefined();
  });

  it('o clique abre o material direto na seção que casou', async () => {
    const props = renderModal();
    typeQuery('hematoencefalica');
    fireEvent.click(await screen.findByRole('button', { name: /Cefalosporinas/ }));
    expect(props.onNavigateToCompendium).toHaveBeenCalledWith('mat-cef', 'sec-espectro');
  });

  it('resultado sem seção abre o material do topo', async () => {
    searchMaterialsMock.mockResolvedValue([result({ sectionId: null, sectionTitleMarked: null })]);
    const props = renderModal();
    typeQuery('cefalosporinas');
    fireEvent.click(await screen.findByRole('button', { name: /Cefalosporinas/ }));
    expect(props.onNavigateToCompendium).toHaveBeenCalledWith('mat-cef', undefined);
  });

  it('filtros de disciplina e "só o que ainda não li" vão para a busca', async () => {
    renderModal();
    typeQuery('cefalosporinas');
    await screen.findByRole('button', { name: /Cefalosporinas/ });

    fireEvent.change(screen.getByRole('combobox', { name: 'Filtrar por disciplina' }), {
      target: { value: 'disc-infecto' },
    });
    await waitFor(() =>
      expect(searchMaterialsMock).toHaveBeenLastCalledWith('cefalosporinas', {
        disciplineId: 'disc-infecto',
        onlyUnread: false,
      })
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Só o que ainda não li' }));
    await waitFor(() =>
      expect(searchMaterialsMock).toHaveBeenLastCalledWith('cefalosporinas', {
        disciplineId: 'disc-infecto',
        onlyUnread: true,
      })
    );
  });

  it('rascunho aparece marcado (visão do administrador)', async () => {
    searchMaterialsMock.mockResolvedValue([result({ status: 'draft' })]);
    renderModal();
    typeQuery('cefalosporinas');
    const item = await screen.findByRole('button', { name: /Cefalosporinas/ });
    expect(within(item).getByText('Rascunho')).toBeTruthy();
  });

  it('falha da busca aparece na tela, sem resultado antigo', async () => {
    searchMaterialsMock.mockRejectedValue(new Error('Failed to fetch'));
    renderModal();
    typeQuery('cefalosporinas');
    expect(await screen.findByText(/Não foi possível buscar os conteúdos agora/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Cefalosporinas/ })).toBeNull();
  });

  it('resposta atrasada de uma busca anterior não sobrescreve a atual', async () => {
    let releaseFirst: (value: MaterialSearchResult[]) => void = () => undefined;
    searchMaterialsMock
      .mockImplementationOnce(() => new Promise<MaterialSearchResult[]>((resolve) => (releaseFirst = resolve)))
      .mockResolvedValueOnce([result({ materialId: 'mat-carba', title: 'Carbapenêmicos', titleMarked: 'Carbapenêmicos' })]);
    renderModal();
    typeQuery('cefalosporinas');
    await waitFor(() => expect(searchMaterialsMock).toHaveBeenCalledTimes(1));
    typeQuery('carbapenemicos');
    await screen.findByRole('button', { name: /Carbapenêmicos/ });

    releaseFirst([result()]);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('button', { name: /Cefalosporinas/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Carbapenêmicos/ })).toBeTruthy();
  });

  it('menos de 2 letras não busca', async () => {
    renderModal();
    typeQuery('c');
    await new Promise((r) => setTimeout(r, 400));
    expect(searchMaterialsMock).not.toHaveBeenCalled();
  });
});
