import React from 'react';
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Editor } from '@tiptap/core';

vi.mock('../../src/repositories/FigurasRepository', () => ({ urlDaFigura: vi.fn().mockResolvedValue(null) }));

import EditorVisualDeSecao from '../../src/components/editor/EditorVisualDeSecao';

// ED-2 — dois cliques numa palavra seleciona também o espaço depois dela (no Windows). Negrito e itálico não podem levar
// esse espaço: `**alvo **texto` não é negrito para quem lê Markdown de verdade (achado ao rodar o fluxo real no navegador).

beforeAll(() => {
  const retangulo = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) };
  Range.prototype.getBoundingClientRect = () => retangulo as DOMRect;
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  document.elementFromPoint = () => null;
  (globalThis as Record<string, unknown>).ClipboardEvent ??= class extends Event {};
});

afterEach(() => cleanup());

function abrir(texto: string, modo: 'secao' | 'linha' = 'secao') {
  const onChange = vi.fn();
  let criado: Editor | null = null;
  render(
    <EditorVisualDeSecao
      texto={texto}
      modo={modo}
      onChange={onChange}
      aoCriar={(e) => {
        criado = e;
      }}
    />
  );
  if (!criado) throw new Error('editor não foi criado');
  return { editor: criado as Editor, ultimo: () => String(onChange.mock.calls[onChange.mock.calls.length - 1]?.[0]), onChange };
}

const selecionar = (editor: Editor, from: number, to: number) => act(() => void editor.commands.setTextSelection({ from, to }));
const clicar = (nome: string) => fireEvent.click(screen.getAllByRole('button', { name: nome })[0]);

// "A palavra alvo precisa." — posições: A=1, espaço=2, p=3 ... "palavra" = 3..9, espaço=10, "alvo" = 11..14, espaço=15, "precisa." = 16..
const TEXTO = 'A palavra alvo precisa.';

describe('editor visual — o espaço das pontas fica fora do negrito e do itálico', () => {
  it('palavra com o espaço depois (dois cliques no Windows): o negrito fica só na palavra', () => {
    const { editor, ultimo } = abrir(TEXTO);
    selecionar(editor, 11, 16); // "alvo "
    clicar('Negrito');
    expect(ultimo()).toBe('A palavra **alvo** precisa.');
  });

  it('com o espaço antes, e com os dois lados', () => {
    const antes = abrir(TEXTO);
    selecionar(antes.editor, 10, 15); // " alvo"
    clicar('Negrito');
    expect(antes.ultimo()).toBe('A palavra **alvo** precisa.');
    cleanup();

    const dois = abrir(TEXTO);
    selecionar(dois.editor, 10, 16); // " alvo "
    clicar('Itálico');
    expect(dois.ultimo()).toBe('A palavra *alvo* precisa.');
  });

  it('seleção de várias palavras: o espaço no meio continua dentro, só as pontas saem', () => {
    const { editor, ultimo } = abrir(TEXTO);
    selecionar(editor, 3, 16); // "palavra alvo "
    clicar('Negrito');
    expect(ultimo()).toBe('A **palavra alvo** precisa.');
  });

  it('só espaço selecionado: o negrito não cria "** **"', () => {
    const { editor, ultimo, onChange } = abrir(TEXTO);
    selecionar(editor, 10, 11); // " "
    clicar('Negrito');
    expect(onChange.mock.calls.length === 0 || ultimo() === TEXTO).toBe(true);
  });

  it('o atalho do teclado (Ctrl+B) também deixa o espaço de fora', () => {
    const { editor, ultimo } = abrir(TEXTO);
    selecionar(editor, 11, 16);
    act(() => void editor.chain().focus().toggleBold().run());
    expect(ultimo()).toBe('A palavra **alvo** precisa.');
  });

  it('no campo de uma linha também', () => {
    const { editor, ultimo } = abrir(TEXTO, 'linha');
    selecionar(editor, 11, 16);
    clicar('Negrito');
    expect(ultimo()).toBe('A palavra **alvo** precisa.');
  });

  it('negrito sem espaço nas pontas continua igual (a palavra inteira, o trecho inteiro)', () => {
    const palavra = abrir('x');
    selecionar(palavra.editor, 1, 2);
    clicar('Negrito');
    expect(palavra.ultimo()).toBe('**x**');
  });
});
