import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import type { Compendium, Discipline, Theme } from '../../src/types';

// ED-2 — a página de leitura com o editor visual DE VERDADE (TipTap), sem trocá-lo por uma caixa de texto: o texto da
// seção abre já formatado, os campos curtos abrem no editor de uma linha, a barra aplica negrito e caixa, e "Salvar" grava
// o Markdown de hoje, só do que mudou. O resto da tela (botão, salvar, cancelar, erro) é conferido em
// editarNaLeituraED2.test.tsx com um editor de mentira.

const estado = vi.hoisted(() => ({ admin: true }));

vi.mock('../../src/hooks/useEhAdmin', () => ({ useEhAdmin: () => estado.admin }));
vi.mock('../../src/hooks/useScrollMemory', () => ({ useScrollMemory: vi.fn() }));
vi.mock('../../src/components/feedback/ContextualFeedbackPopover', () => ({ ContextualFeedbackPopover: () => null }));
vi.mock('../../src/services/storage', () => ({ StorageService: { saveLastReadingSession: vi.fn() } }));
vi.mock('../../src/repositories/FigurasRepository', () => ({ urlDaFigura: vi.fn().mockResolvedValue(null) }));
vi.mock('../../src/repositories/BookmarksRepository', () => ({
  bookmarksRepository: { getBookmarks: vi.fn().mockResolvedValue({ questions: [], compendiums: [], flashcards: [] }), setBookmark: vi.fn() },
}));
vi.mock('../../src/repositories/NotesRepository', () => ({
  notesRepository: { getNotes: vi.fn().mockResolvedValue({}), getRemovedSectionNotes: vi.fn().mockResolvedValue({}), saveNote: vi.fn() },
}));
vi.mock('../../src/repositories/FlashcardsRepository', () => ({ flashcardsRepository: { createFlashcardFromSection: vi.fn() } }));
vi.mock('../../src/repositories/ReadingProgressRepository', () => ({
  readingProgressRepository: { getReadingProgress: vi.fn().mockResolvedValue({}), setSectionRead: vi.fn() },
}));
vi.mock('../../src/repositories/MaterialsRepository', () => ({
  materialsRepository: { updateSectionContent: vi.fn().mockResolvedValue(undefined) },
}));

const { CompendiumReader } = await import('../../src/components/compendium/CompendiumReader');
const { materialsRepository } = await import('../../src/repositories/MaterialsRepository');
const { esquecerEdicoesSalvas } = await import('../../src/components/compendium/secoesEditadas');
const atualizar = vi.mocked(materialsRepository.updateSectionContent);

beforeAll(() => {
  // O jsdom não calcula layout; o ProseMirror pergunta por retângulos ao mover a seleção.
  const retangulo = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) };
  Range.prototype.getBoundingClientRect = () => retangulo as DOMRect;
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  document.elementFromPoint = () => null;
  (globalThis as Record<string, unknown>).ClipboardEvent ??= class extends Event {};
});

const discipline: Discipline = { id: 'd1', name: 'Nefrologia', code: 'NEFRO', icon: 'kidney', description: '', cycle: 'clinico', color: '#0F766E' };
const theme: Theme = { id: 't1', disciplineId: 'd1', name: 'Função renal', description: '', highYield: true, order: 1 };

const material: Compendium = {
  id: 'c1',
  disciplineId: 'd1',
  themeId: 't1',
  title: 'Avaliação da função renal',
  subtitle: 'Material de teste',
  estimatedReadTimeMinutes: 10,
  lastUpdated: '2026-09-21T12:00:00.000Z',
  author: 'Equipe Editorial',
  sections: [
    {
      id: 's1',
      title: 'Primeira seção',
      content: 'Texto com **forte** e *suave* [1](#ref-1).\n\n- primeiro\n- segundo\n\n> **Cuidado:** atenção aqui',
      keyTakeaways: ['Ponto com **negrito**.'],
      clinicalPearl: 'Pérola com [2](#ref-2).',
      warningAlert: 'Alerta simples.',
    },
    { id: 's2', title: 'Segunda seção', content: 'Texto da segunda seção.', keyTakeaways: [] },
  ],
  references: [],
};

function abrirLeitor() {
  return render(
    <CompendiumReader
      compendium={material}
      compendiums={[material]}
      onOpenCompendium={vi.fn()}
      disciplines={[discipline]}
      themes={[theme]}
      onBack={vi.fn()}
      onOpenQuestionsForTheme={vi.fn()}
      onOpenQuestionsForMaterial={vi.fn()}
      onOpenFlashcardsForTheme={vi.fn()}
    />
  );
}

const secao = (id: string) => document.getElementById(id) as HTMLElement;
const editorDe = (el: Element) => (el as unknown as { editor: Editor }).editor;
const textos = () => Array.from(secao('s1').querySelectorAll<HTMLElement>('.ev-conteudo'));

async function abrirEdicao() {
  abrirLeitor();
  fireEvent.click(screen.getByRole('button', { name: 'Editar a seção Primeira seção' }));
  // O editor é baixado sob demanda (import dinâmico): a primeira abertura pode demorar.
  await waitFor(() => expect(textos()).toHaveLength(4), { timeout: 15_000 }); // texto, 1 ponto-chave, Pérola, Alerta
}

beforeEach(() => {
  estado.admin = true;
  esquecerEdicoesSalvas();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ED-2 — a página de leitura com o editor visual de verdade', () => {
  it('o texto da seção abre já formatado, sem símbolo nenhum, e os campos curtos abrem no editor de uma linha', async () => {
    await abrirEdicao();
    const [principal, ponto, perola, alerta] = textos();

    expect(principal.querySelector('strong')?.textContent).toBe('forte');
    expect(principal.querySelector('em')?.textContent).toBe('suave');
    expect(principal.querySelector('a[data-href="#ref-1"]')?.textContent).toBe('1');
    expect(principal.querySelectorAll('ul li')).toHaveLength(2);
    expect(principal.querySelector('[data-caixa="Cuidado"]')?.textContent).toBe('atenção aqui');
    expect(principal.textContent).not.toMatch(/[*>]|\]\(/);

    expect(ponto.querySelector('strong')?.textContent).toBe('negrito');
    expect(perola.querySelector('a[data-href="#ref-2"]')?.textContent).toBe('2');
    expect(alerta.textContent).toBe('Alerta simples.');
    expect(secao('s1').querySelectorAll('.ev-editor--linha')).toHaveLength(3);

    // Cada campo é um campo de texto com nome, para leitores de tela.
    for (const nome of ['Texto da seção', 'Ponto-chave 1', 'Pérola clínica', 'Alerta de armadilha']) {
      expect(within(secao('s1')).getByRole('textbox', { name: nome }), nome).toBeTruthy();
    }
  });

  it('a barra do texto da seção tem blocos e caixas; a dos campos de uma linha só tem o formato dentro da linha', async () => {
    await abrirEdicao();
    const barras = within(secao('s1')).getAllByRole('toolbar', { name: 'Formatação do texto' });
    expect(barras).toHaveLength(4);

    const [principal, ...curtas] = barras;
    for (const nome of ['Negrito', 'Itálico', 'Subtítulo', 'Lista', 'Lista numerada', 'Citação em bloco', 'Cuidado', 'Essencial', 'Referência', 'Link']) {
      expect(within(principal).getByRole('button', { name: nome }), nome).toBeTruthy();
    }
    for (const barra of curtas) {
      for (const nome of ['Negrito', 'Itálico', 'Código', 'Referência', 'Link']) expect(within(barra).getByRole('button', { name: nome }), nome).toBeTruthy();
      for (const nome of ['Subtítulo', 'Lista', 'Lista numerada', 'Citação em bloco', 'Cuidado', 'Raciocínio', 'Essencial']) {
        expect(within(barra).queryByRole('button', { name: nome }), nome).toBeNull();
      }
    }
  });

  it('abrir e salvar sem mexer em nada não grava (o texto sai do editor igual ao que entrou)', async () => {
    await abrirEdicao();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Nenhuma alteração para salvar.')).toBeTruthy();
    expect(atualizar).not.toHaveBeenCalled();
  });

  it('negrito numa palavra e uma caixa "Cuidado" pelos botões: grava o Markdown de hoje, só em content', async () => {
    await abrirEdicao();
    const principal = textos()[0];
    const editor = editorDe(principal);

    // Põe o cursor num parágrafo novo no fim do texto, escreve e aplica a caixa; depois negrito numa palavra.
    act(() => void editor.commands.focus('end'));
    act(() => void editor.commands.insertContentAt(editor.state.doc.content.size, { type: 'paragraph', content: [{ type: 'text', text: 'Novo aviso importante' }] }));
    act(() => void editor.commands.setTextSelection(editor.state.doc.content.size - 1));
    fireEvent.click(within(secao('s1')).getAllByRole('button', { name: 'Cuidado' })[0]);

    // Seleciona "Novo" (a primeira palavra do aviso) e aplica negrito.
    let inicio = -1;
    editor.state.doc.descendants((no, pos) => {
      if (no.isText && no.text === 'Novo aviso importante') inicio = pos;
    });
    expect(inicio).toBeGreaterThan(0);
    act(() => void editor.commands.setTextSelection({ from: inicio, to: inicio + 'Novo'.length }));
    fireEvent.click(within(secao('s1')).getAllByRole('button', { name: 'Negrito' })[0]);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(atualizar).toHaveBeenCalledTimes(1));
    const [id, patch] = atualizar.mock.calls[0];
    expect(id).toBe('s1');
    expect(Object.keys(patch as object)).toEqual(['content']);
    expect((patch as { content: string }).content).toBe(`${material.sections[0].content}\n\n> **Cuidado:** **Novo** aviso importante`);

    // Voltou à leitura: a caixa aparece formatada pelo leitor, e o negrito também.
    expect(await screen.findByText('Seção salva')).toBeTruthy();
    const caixa = secao('s1').querySelectorAll('[data-caixa="Cuidado"]');
    expect(caixa).toHaveLength(2);
    expect(caixa[1].querySelector('strong')?.textContent).toBe('Novo');
  });

  it('campo de uma linha: negrito pelo botão grava no ponto-chave; Enter não abre outro parágrafo', async () => {
    await abrirEdicao();
    const ponto = textos()[1];
    const editor = editorDe(ponto);

    fireEvent.keyDown(ponto, { key: 'Enter', code: 'Enter', keyCode: 13 });
    expect(editor.getJSON().content).toHaveLength(1);

    act(() => void editor.commands.setTextSelection({ from: 1, to: 6 })); // "Ponto"
    const barraDoPonto = within(secao('s1')).getAllByRole('toolbar', { name: 'Formatação do texto' })[1];
    fireEvent.click(within(barraDoPonto).getByRole('button', { name: 'Itálico' }));

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(atualizar).toHaveBeenCalledTimes(1));
    expect(atualizar.mock.calls[0][1]).toStrictEqual({ keyTakeaways: ['*Ponto* com **negrito**.'] });
  });

  it('negrito e itálico no trecho inteiro não existem no leitor: o editor avisa e "Salvar" fica desligado', async () => {
    await abrirEdicao();
    const alerta = textos()[3];
    const editor = editorDe(alerta);
    act(() => void editor.commands.selectAll());
    const barraDoAlerta = within(secao('s1')).getAllByRole('toolbar', { name: 'Formatação do texto' })[3];
    fireEvent.click(within(barraDoAlerta).getByRole('button', { name: 'Negrito' }));
    fireEvent.click(within(barraDoAlerta).getByRole('button', { name: 'Itálico' }));

    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Salvar está desligado/)).toBeTruthy();

    fireEvent.click(within(barraDoAlerta).getByRole('button', { name: 'Itálico' }));
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
