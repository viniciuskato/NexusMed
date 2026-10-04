// Esquema do editor visual (ED-1): só o que o leitor (`SafeMarkdown`) sabe mostrar — negrito, itálico, código, link,
// citação `[N](#ref-N)`, expoente, subtítulo (#### e acima), lista, lista numerada, citação comum, as seis caixas com
// função e o bloco protegido (tabela, fórmula, figura: mostra o resultado e guarda o texto original). Nada de sublinhado,
// riscado, bloco de código, linha horizontal ou quebra forçada: não existem no leitor, então não existem aqui.

import { Extension, Mark, Node, mergeAttributes } from '@tiptap/core';
import type { Command, Extensions } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { findWrapping } from '@tiptap/pm/transform';
import { hrefParaExibir, ROTULOS_DAS_CAIXAS } from '../../utils/editorVisualMarkdown';
import { BlocoProtegidoView } from './BlocoProtegidoView';

/** Código inline: aceita negrito e itálico por fora (`**`código`**`), mas nunca link nem expoente dentro (o leitor não os lê ali). */
const Codigo = Mark.create({
  name: 'code',
  excludes: 'link expoente',
  parseHTML: () => [{ tag: 'code' }],
  renderHTML: ({ HTMLAttributes }) => ['code', mergeAttributes({ class: 'ev-codigo' }, HTMLAttributes), 0],
  addKeyboardShortcuts() {
    return { 'Mod-e': () => this.editor.commands.toggleMark(this.name) };
  },
});

/** Link e citação (`[3](#ref-3)`): o mesmo mark, o leitor é que distingue pelo endereço. O texto do link é cru no leitor. */
const Ligacao = Mark.create({
  name: 'link',
  inclusive: false,
  excludes: 'code expoente',
  addAttributes() {
    return { href: { default: '' } };
  },
  parseHTML: () => [
    {
      tag: 'a[href]',
      getAttrs: (el) => ({ href: (el as HTMLElement).getAttribute('data-href') ?? (el as HTMLElement).getAttribute('href') ?? '' }),
    },
  ],
  renderHTML({ HTMLAttributes }) {
    const href = String(HTMLAttributes.href ?? '');
    return [
      'a',
      {
        href: hrefParaExibir(href),
        'data-href': href,
        class: href.startsWith('#ref-') ? 'ev-citacao' : 'ev-link',
        rel: 'noopener noreferrer',
      },
      0,
    ];
  },
});

/** Expoente (`x^2`, `10^(9−pH)`): mostrado como sobrescrito, sem o `^`. `parenteses` guarda a forma original. */
const Expoente = Mark.create({
  name: 'expoente',
  inclusive: false,
  excludes: 'code link',
  addAttributes() {
    return {
      parenteses: {
        default: true,
        parseHTML: (el) => el.getAttribute('data-parenteses') !== 'false',
        renderHTML: (attrs) => ({ 'data-parenteses': String(attrs.parenteses) }),
      },
    };
  },
  parseHTML: () => [{ tag: 'sup' }],
  renderHTML: ({ HTMLAttributes }) => ['sup', mergeAttributes({ class: 'ev-expoente' }, HTMLAttributes), 0],
});

/**
 * Quebra de linha simples dentro de um parágrafo, que o leitor mostra como espaço. Guarda o separador original (com os
 * espaços em volta) para o texto voltar igual; não se cria à mão.
 */
const QuebraSuave = Node.create({
  name: 'quebraSuave',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  addAttributes() {
    // Todo atributo do esquema sobrevive a renderHTML → parseHTML (copiar e colar dentro do editor não muda bytes).
    return {
      raw: {
        default: '\n',
        parseHTML: (el) => el.getAttribute('data-raw') ?? '\n',
        renderHTML: (attrs) => ({ 'data-raw': String(attrs.raw) }),
      },
    };
  },
  parseHTML: () => [{ tag: 'span[data-quebra-suave]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes({ 'data-quebra-suave': '', class: 'ev-quebra' }, HTMLAttributes), ' '],
});

/** Citação comum (`> texto`): um parágrafo só, como o leitor a lê. */
const Citacao = Node.create({
  name: 'blockquote',
  group: 'block',
  content: 'paragraph',
  defining: true,
  parseHTML: () => [{ tag: 'blockquote' }],
  renderHTML: ({ HTMLAttributes }) => ['blockquote', mergeAttributes({ class: 'ev-citacao-bloco' }, HTMLAttributes), 0],
});

/** Item de lista: um parágrafo só (o leitor não tem lista dentro de lista nem parágrafo dentro de item). */
const ItemDeLista = Node.create({
  name: 'listItem',
  content: 'paragraph',
  defining: true,
  parseHTML: () => [{ tag: 'li' }],
  renderHTML: ({ HTMLAttributes }) => ['li', HTMLAttributes, 0],
  addKeyboardShortcuts() {
    return { Enter: () => this.editor.commands.splitListItem(this.name) };
  },
});

/** As seis caixas com função: o rótulo aparece como título da caixa (CSS) e vira `> **Rótulo:** texto` no Markdown. */
const Caixa = Node.create({
  name: 'caixa',
  group: 'block',
  content: 'paragraph',
  defining: true,
  addAttributes() {
    return {
      rotulo: {
        default: ROTULOS_DAS_CAIXAS[0],
        parseHTML: (el) => el.getAttribute('data-caixa') ?? ROTULOS_DAS_CAIXAS[0],
        renderHTML: (attrs) => ({ 'data-caixa': String(attrs.rotulo) }),
      },
    };
  },
  parseHTML: () => [{ tag: 'div[data-caixa]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes({ class: 'ev-caixa' }, HTMLAttributes), 0],
});

/** Tabela, fórmula ou figura: o editor mostra o resultado (como o leitor) e guarda o texto original, editável à parte. */
const BlocoProtegido = Node.create({
  name: 'blocoProtegido',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      raw: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-raw') ?? '',
        renderHTML: (attrs) => ({ 'data-raw': String(attrs.raw) }),
      },
    };
  },
  parseHTML: () => [{ tag: 'div[data-bloco-protegido]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes({ 'data-bloco-protegido': '' }, HTMLAttributes)],
  addNodeView() {
    return ReactNodeViewRenderer(BlocoProtegidoView);
  },
});

/**
 * O leitor numera a lista de 1 em diante, qualquer que seja o número digitado. Digitar "5. " no editor cria uma lista
 * que começa em 5; aqui ela volta a começar em 1, para o que se vê ser o que o texto guarda.
 */
const ListaNumeradaDesde1 = Extension.create({
  name: 'listaNumeradaDesde1',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('listaNumeradaDesde1'),
        appendTransaction: (_transacoes, _antes, depois) => {
          const tr = depois.tr;
          depois.doc.descendants((no, pos) => {
            if (no.type.name === 'orderedList' && (no.attrs.start ?? 1) !== 1) tr.setNodeMarkup(pos, undefined, { ...no.attrs, start: 1 });
          });
          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
});

export function criarExtensoes(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      // O que o leitor não tem:
      codeBlock: false,
      horizontalRule: false,
      hardBreak: false,
      strike: false,
      underline: false,
      // Trocados por versões do esquema acima:
      blockquote: false,
      listItem: false,
      code: false,
      link: false,
    }),
    Codigo,
    Ligacao,
    Expoente,
    QuebraSuave,
    Citacao,
    ItemDeLista,
    Caixa,
    BlocoProtegido,
    ListaNumeradaDesde1,
  ];
}

/**
 * Põe o parágrafo do cursor dentro de um contêiner (caixa ou citação), tira dele se já está lá com os mesmos atributos,
 * ou troca o rótulo se é outra caixa. Contêiner com um parágrafo só: seleção de vários parágrafos vale pelo primeiro.
 */
export function alternarContainer(tipo: 'caixa' | 'blockquote', attrs?: Record<string, unknown>): Command {
  return ({ state, tr, dispatch }) => {
    let { $from } = state.selection;
    // "Selecionar tudo" começa fora de qualquer bloco: vale o primeiro bloco do texto.
    if ($from.depth === 0 && state.doc.content.size > 0) $from = state.doc.resolve(1);
    for (let d = $from.depth; d > 0; d--) {
      const no = $from.node(d);
      if (no.type.name !== tipo) continue;
      const mesmoRotulo = tipo === 'blockquote' || no.attrs.rotulo === attrs?.rotulo;
      if (mesmoRotulo) {
        // Tira o parágrafo de dentro do contêiner.
        const inicio = $from.before(d);
        if (dispatch) tr.replaceWith(inicio, inicio + no.nodeSize, no.content);
        return true;
      }
      if (dispatch) tr.setNodeMarkup($from.before(d), undefined, { ...no.attrs, ...attrs });
      return true;
    }
    const intervalo = $from.blockRange($from);
    const nodeType = state.schema.nodes[tipo];
    if (!intervalo) return false;
    const embrulho = findWrapping(intervalo, nodeType, attrs);
    if (!embrulho) return false;
    if (dispatch) tr.wrap(intervalo, embrulho);
    return true;
  };
}
