import React from 'react';
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { DOMParser as PmDOMParser, DOMSerializer } from '@tiptap/pm/model';

vi.mock('../../src/repositories/FigurasRepository', () => ({ urlDaFigura: vi.fn().mockResolvedValue(null) }));

import EditorVisualDeSecao from '../../src/components/editor/EditorVisualDeSecao';
import { docParaTexto, type NoVisual } from '../../src/utils/editorVisualMarkdown';
import { CORPUS_SEGURO } from '../unit/helpers/corpusEditorVisual';

// ED-1 — o editor visual isolado: formata pelos botões gerando exatamente a sintaxe do leitor, mostra o texto sem os
// símbolos, protege tabela/fórmula/figura, recusa texto que não sabe representar e devolve o Markdown de hoje.

beforeAll(() => {
  // O jsdom não calcula layout; o ProseMirror pergunta por retângulos ao mover a seleção.
  const retangulo = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) };
  Range.prototype.getBoundingClientRect = () => retangulo as DOMRect;
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  document.elementFromPoint = () => null;
  // `view.pasteHTML` cria um ClipboardEvent, que o jsdom não tem.
  (globalThis as Record<string, unknown>).ClipboardEvent ??= class extends Event {};
});

afterEach(() => cleanup());

interface Aberto {
  editor: Editor;
  onChange: ReturnType<typeof vi.fn>;
  ultimo: () => string;
}

function abrir(texto: string, extras: Partial<React.ComponentProps<typeof EditorVisualDeSecao>> = {}): Aberto {
  const onChange = vi.fn();
  let criado: Editor | null = null;
  render(
    <EditorVisualDeSecao
      texto={texto}
      onChange={onChange}
      aoCriar={(e) => {
        criado = e;
      }}
      {...extras}
    />
  );
  if (!criado) throw new Error('editor não foi criado');
  return {
    editor: criado,
    onChange,
    ultimo: () => String(onChange.mock.calls[onChange.mock.calls.length - 1]?.[0]),
  };
}

const selecionar = (editor: Editor, from: number, to: number = from) => act(() => void editor.commands.setTextSelection({ from, to }));
const clicar = (nome: string) => fireEvent.click(screen.getByRole('button', { name: nome }));

describe('editor visual — abre o texto já formatado, sem símbolos', () => {
  it('mostra negrito, itálico, lista, caixa e citação formatados, sem nenhum "*", "-" ou ">" do Markdown', () => {
    abrir('Texto **forte** e *suave* com [1](#ref-1).\n\n- primeiro\n- segundo\n\n> **Cuidado:** atenção aqui\n\n> uma citação');
    const caixaDeTexto = screen.getByRole('textbox', { name: 'Texto da seção' });

    expect(caixaDeTexto.querySelector('strong')?.textContent).toBe('forte');
    expect(caixaDeTexto.querySelector('em')?.textContent).toBe('suave');
    expect(caixaDeTexto.querySelectorAll('ul li')).toHaveLength(2);
    expect(caixaDeTexto.querySelector('[data-caixa="Cuidado"]')?.textContent).toBe('atenção aqui');
    expect(caixaDeTexto.querySelector('blockquote')?.textContent).toBe('uma citação');
    expect(caixaDeTexto.querySelector('a[data-href="#ref-1"]')?.textContent).toBe('1');
    expect(caixaDeTexto.textContent).not.toMatch(/[*>]|\]\(|- primeiro/);
  });

  it('não chama onChange ao abrir (abrir não é editar)', () => {
    const { onChange } = abrir('Um texto **qualquer**.');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ao abrir, todos os botões já estão ligados (sem precisar clicar no texto antes)', () => {
    abrir('Um texto.\n\n- a\n- b');
    const desligados = screen.getAllByRole('button').filter((b) => (b as HTMLButtonElement).disabled);
    expect(desligados.map((b) => b.getAttribute('aria-label'))).toEqual([]);
  });

  it('a barra tem rótulos em português, com dica, para quem não programa', () => {
    abrir('x');
    const barra = screen.getByRole('toolbar', { name: 'Formatação do texto' });
    for (const nome of ['Negrito', 'Itálico', 'Subtítulo', 'Lista', 'Lista numerada', 'Citação em bloco', 'Cuidado', 'Raciocínio', 'Não confundir', 'Atualização', 'Aprofundar', 'Essencial', 'Referência', 'Link']) {
      const botao = screen.getByRole('button', { name: nome });
      expect(barra.contains(botao), nome).toBe(true);
      expect(botao.getAttribute('title'), nome).toMatch(/\S{3,}/);
    }
  });
});

describe('editor visual — os botões geram exatamente a sintaxe que o leitor entende', () => {
  it('negrito numa seleção gera **x**', () => {
    const { editor, ultimo } = abrir('x');
    selecionar(editor, 1, 2);
    clicar('Negrito');
    expect(ultimo()).toBe('**x**');
  });

  it('itálico numa seleção gera *x*', () => {
    const { editor, ultimo } = abrir('x');
    selecionar(editor, 1, 2);
    clicar('Itálico');
    expect(ultimo()).toBe('*x*');
  });

  it('negrito e itálico em parte do trecho de negrito geram o aninhado que o leitor lê, e é fiel', () => {
    const { editor, onChange, ultimo } = abrir('**um dois três**');
    selecionar(editor, 4, 8); // "dois"
    clicar('Itálico');
    expect(ultimo()).toBe('**um *dois* três**');
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toEqual({ fiel: true });
  });

  it('negrito e itálico no trecho inteiro não existem no leitor: avisa e marca como não fiel', () => {
    const { editor, onChange } = abrir('x');
    selecionar(editor, 1, 2);
    clicar('Negrito');
    clicar('Itálico');
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toEqual({ fiel: false });
    expect(screen.getByRole('alert').textContent).toMatch(/não aparece no leitor/);
    // Desfazendo um dos dois, volta ao normal.
    clicar('Itálico');
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toEqual({ fiel: true });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lista gera "- " e lista numerada gera "1. "', () => {
    const lista = abrir('x');
    selecionar(lista.editor, 1);
    clicar('Lista');
    expect(lista.ultimo()).toBe('- x');
    cleanup();

    const numerada = abrir('x');
    selecionar(numerada.editor, 1);
    clicar('Lista numerada');
    expect(numerada.ultimo()).toBe('1. x');
  });

  it('subtítulo gera "#### " e citação em bloco gera "> "', () => {
    const subtitulo = abrir('x');
    selecionar(subtitulo.editor, 1);
    clicar('Subtítulo');
    expect(subtitulo.ultimo()).toBe('#### x');
    cleanup();

    const citacao = abrir('x');
    selecionar(citacao.editor, 1);
    clicar('Citação em bloco');
    expect(citacao.ultimo()).toBe('> x');
  });

  it.each(['Cuidado', 'Raciocínio', 'Não confundir', 'Atualização', 'Aprofundar', 'Essencial'])('a caixa %s gera "> **%s:** "', (rotulo) => {
    const { editor, ultimo } = abrir('texto');
    selecionar(editor, 1);
    clicar(rotulo);
    expect(ultimo()).toBe(`> **${rotulo}:** texto`);
    // Clicar de novo tira a caixa.
    clicar(rotulo);
    expect(ultimo()).toBe('texto');
  });

  it('caixa sobre um parágrafo vazio gera exatamente "> **Cuidado:** " (com o espaço), e outra caixa troca o rótulo', () => {
    const { editor, ultimo } = abrir('');
    selecionar(editor, 1);
    clicar('Cuidado');
    expect(ultimo()).toBe('> **Cuidado:** ');
    clicar('Essencial');
    expect(ultimo()).toBe('> **Essencial:** ');
  });

  it('inserir referência gera [N](#ref-N), sem prender o texto seguinte ao link', () => {
    const { editor, ultimo } = abrir('Afirmação.');
    selecionar(editor, 11); // fim do parágrafo
    clicar('Referência');
    fireEvent.change(screen.getByLabelText('Número da referência'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inserir referência' }));
    expect(ultimo()).toBe('Afirmação.[3](#ref-3)');

    act(() => void editor.commands.insertContent(' E mais.'));
    expect(ultimo()).toBe('Afirmação.[3](#ref-3) E mais.');
  });

  it('número de referência inválido não insere nada e explica', () => {
    const { editor, onChange } = abrir('x');
    selecionar(editor, 2);
    clicar('Referência');
    fireEvent.change(screen.getByLabelText('Número da referência'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inserir referência' }));
    expect(screen.getByRole('alert').textContent).toMatch(/número da referência/);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('link numa seleção gera [texto](endereço); endereço sem https:// é recusado', () => {
    const { editor, ultimo, onChange } = abrir('ver site');
    selecionar(editor, 5, 9);
    clicar('Link');
    fireEvent.change(screen.getByLabelText('Endereço do link'), { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar link' }));
    expect(screen.getByRole('alert').textContent).toMatch(/https:\/\//);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Endereço do link'), { target: { value: 'https://example.com/a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar link' }));
    expect(ultimo()).toBe('ver [site](https://example.com/a)');
  });

  it('sobrescrito gera ^(x), que o leitor mostra como expoente', () => {
    const { editor, ultimo } = abrir('m2');
    selecionar(editor, 2, 3);
    clicar('Sobrescrito');
    expect(ultimo()).toBe('m^(2)');
  });

  it('o que sai nunca é HTML', () => {
    const { editor, ultimo } = abrir('a **b** *c* `d` [1](#ref-1)');
    act(() => void editor.commands.insertContentAt(1, 'z'));
    expect(ultimo()).toBe('za **b** *c* `d` [1](#ref-1)');
    expect(ultimo()).not.toMatch(/<[a-z]/i);
  });
});

describe('editor visual — tabela, fórmula e figura aparecem como bloco protegido', () => {
  const TABELA = '| Coluna A | Coluna B |\n|---|---|\n| valor 1 | valor 2 |';
  const FORMULA = 'eGFR = 142 × x^2';
  const FIGURA = '![Esquema](figura:PENDENTE)\n**Figura 1.** Legenda.\nFonte: [2](#ref-2)\nMostrar: o esquema.';

  it('mostra o resultado como o leitor mostra e guarda o texto original, intacto se ninguém mexe', async () => {
    const texto = `Antes.\n\n${TABELA}\n\n${FORMULA}\n\n${FIGURA}\n\nDepois.`;
    const { editor } = abrir(texto);
    const blocos = await screen.findAllByTestId('bloco-protegido');
    expect(blocos).toHaveLength(3);
    expect(blocos[0].querySelector('table th')?.textContent).toBe('Coluna A');
    expect(blocos[1].querySelector('.eq-box')).not.toBeNull();
    expect(blocos[2].textContent).toContain('Figura 1.');
    expect(blocos.map((b) => b.getAttribute('aria-label'))).toEqual(['Tabela (bloco protegido)', 'Fórmula (bloco protegido)', 'Figura (bloco protegido)']);
    expect(docParaTexto(editor.getJSON() as NoVisual)).toBe(texto);
  });

  it('o texto original é editável num campo próprio dentro do bloco, e só ele muda', async () => {
    const { ultimo } = abrir(`Antes.\n\n${TABELA}\n\nDepois.`);
    const bloco = await screen.findByTestId('bloco-protegido');
    expect(bloco.querySelector('textarea')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Editar texto' }));
    const campo = screen.getByLabelText('Texto original (Tabela)') as HTMLTextAreaElement;
    expect(campo.value).toBe(TABELA);

    fireEvent.change(campo, { target: { value: `${TABELA}\n| valor 3 | valor 4 |` } });
    expect(ultimo()).toBe(`Antes.\n\n${TABELA}\n| valor 3 | valor 4 |\n\nDepois.`);
    await waitFor(() => expect(screen.getByTestId('bloco-protegido').querySelectorAll('tbody tr')).toHaveLength(2));
  });
});

describe('editor visual — texto que não sabe representar não abre e não é alterado', () => {
  it.each([
    ['HTML cru', 'Texto <b>em HTML</b>.', /HTML/],
    ['caixa antiga do leitor', '> [!NOTE] diretriz', /caixa antiga/],
    ['lista com outro marcador', '* a\n* b', /marcador/],
  ])('%s: mostra o aviso, não cria editor, não chama onChange e avisa quem chamou', (_nome, texto, motivo) => {
    const onChange = vi.fn();
    const onNaoSeguro = vi.fn();
    const aoCriar = vi.fn();
    render(<EditorVisualDeSecao texto={texto} onChange={onChange} onNaoSeguro={onNaoSeguro} aoCriar={aoCriar} />);

    expect(screen.getByTestId('editor-visual-nao-seguro').textContent).toMatch(/não foi\s+aberto aqui/);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(aoCriar).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(onNaoSeguro).toHaveBeenCalledTimes(1);
    expect(onNaoSeguro.mock.calls[0][0]).toMatch(motivo);
  });
});

describe('editor visual — o texto passa pelo editor de verdade e volta idêntico', () => {
  const textos = CORPUS_SEGURO.flatMap((g) => g.textos.map((t) => ({ construcao: g.construcao, texto: t }))).filter((c) => c.texto !== '');

  it(`${textos.length} textos do corpus: abrir no editor e ler de volta devolve o mesmo texto, byte a byte`, () => {
    const falhas: string[] = [];
    for (const { construcao, texto } of textos) {
      const { editor } = abrir(texto);
      const volta = docParaTexto(editor.getJSON() as NoVisual);
      if (volta !== texto) falhas.push(`${construcao}: ${JSON.stringify(texto)} → ${JSON.stringify(volta)}`);
      cleanup();
    }
    expect(falhas).toEqual([]);
  });

  it('uma edição em texto longo mexe só no que foi editado: o resto fica byte a byte igual', () => {
    const base = CORPUS_SEGURO[CORPUS_SEGURO.length - 1].textos[0];
    const { editor, ultimo } = abrir(base);
    act(() => void editor.commands.insertContentAt(1, '>>'));
    expect(ultimo()).toBe(`>>${base}`);
  });
});

describe('editor visual — copiar, recortar e colar não mudam nenhum byte', () => {
  const TABELA = '| A | B |\n|---|---|\n| 1 | 2 |';

  it('recortar e colar um bloco protegido devolve o texto original igual', async () => {
    const original = `Antes.\n\n${TABELA}\n\nDepois.`;
    const { editor, ultimo } = abrir(original);
    await screen.findByTestId('bloco-protegido');
    let posicao = -1;
    editor.state.doc.descendants((no, pos) => {
      if (no.type.name === 'blocoProtegido') posicao = pos;
    });
    act(() => void editor.commands.setNodeSelection(posicao));
    const { dom } = editor.view.serializeForClipboard(editor.state.selection.content());
    act(() => void editor.commands.deleteSelection());
    expect(ultimo()).toBe('Antes.\n\nDepois.');
    act(() => void editor.view.pasteHTML(dom.innerHTML));
    expect(ultimo()).toBe(original);
  });

  it('copiar e colar texto com quebra de linha, expoente e caixa de várias linhas devolve os mesmos bytes', () => {
    const original = 'a\n  b x^2 e y^(a b)\n\n> **Cuidado:** um\n> dois';
    const { editor, ultimo } = abrir(original);
    act(() => void editor.commands.selectAll());
    const { dom } = editor.view.serializeForClipboard(editor.state.selection.content());
    act(() => void editor.commands.setContent('<p></p>', { emitUpdate: true }));
    act(() => void editor.view.pasteHTML(dom.innerHTML));
    expect(ultimo()).toBe(original);
  });

  it('todo atributo do esquema sobrevive a renderHTML → parseHTML: os textos do corpus voltam iguais por HTML', () => {
    const falhas: string[] = [];
    for (const { construcao, texto } of CORPUS_SEGURO.flatMap((g) => g.textos.map((t) => ({ construcao: g.construcao, texto: t }))).filter((c) => c.texto !== '')) {
      const { editor } = abrir(texto);
      const esquema = editor.schema;
      const recipiente = document.createElement('div');
      recipiente.appendChild(DOMSerializer.fromSchema(esquema).serializeFragment(editor.state.doc.content));
      const volta = PmDOMParser.fromSchema(esquema).parse(recipiente);
      const resultado = docParaTexto(volta.toJSON() as NoVisual);
      if (resultado !== texto) falhas.push(`${construcao}: ${JSON.stringify(texto)} → ${JSON.stringify(resultado)}`);
      cleanup();
    }
    expect(falhas).toEqual([]);
  });
});

describe('editor visual — lista numerada sempre começa em 1, como no leitor', () => {
  it('digitar "5. " cria a lista começando em 1, e o texto e o editor concordam', () => {
    const { editor, ultimo, onChange } = abrir('');
    selecionar(editor, 1);
    act(() => void editor.commands.insertContent('5.'));
    const pos = editor.state.selection.from;
    act(() => void editor.view.someProp('handleTextInput', (f) => f(editor.view, pos, pos, ' ', () => editor.state.tr)));
    act(() => void editor.commands.insertContent('item'));
    const lista = (editor.getJSON().content ?? [])[0];
    expect(lista.type).toBe('orderedList');
    expect(lista.attrs?.start).toBe(1);
    expect(ultimo()).toBe('1. item');
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toEqual({ fiel: true });
  });
});
