// Conversão texto (Markdown do material) ⇄ documento do editor visual (ED-1).
//
// O editor visual mostra o texto de uma seção já formatado (negrito, listas, caixas) e devolve o MESMO Markdown que
// o leitor (`SafeMarkdown`) entende hoje — nunca HTML, nunca uma sintaxe nova. Este módulo é a ponte: não depende de
// biblioteca de editor nem de React, então a guarda `textoEhSeguroParaEditorVisual` pode ser chamada na tela de leitura
// sem baixar o editor.
//
// Regra de ouro (AGENTS.md, item 17: salvar sem mudança é no-op): o editor só abre um texto cuja ida e volta devolve
// os mesmos bytes. Texto com qualquer construção que o editor não sabe representar é "não seguro": fica como está,
// e quem edita usa o editor de texto. A guarda é a própria ida e volta (`docParaTexto(textoParaDoc(t)) === t`), mais
// algumas recusas explícitas de coisas que a ida e volta deixaria passar mas que o editor mostraria diferente do leitor
// (HTML cru, caixas antigas do leitor).
//
// A leitura do texto repete, na mesma ordem, a decisão do leitor (`SafeMarkdown`): figura, tabela, subtítulo, citação
// (caixa de função, caixas antigas, fórmula, citação comum), lista com marcador, lista numerada, parágrafo com fórmula,
// parágrafo. As expressões e as regras de `parseInline` são cópias das do leitor — `tests/component/editorVisualLeitor.test.tsx`
// confere, renderizando o leitor, que as duas leituras concordam. Mudou o leitor: este módulo muda junto (AGENTS.md, item 19).

import { lerBlocoDeFigura } from './figuraDoMaterial';
import { normalizeBlockBoundaries } from './markdownBlocks';

// --- Tipos do documento ----------------------------------------------------------------------------------------------
// Mesma forma do JSON do ProseMirror/TipTap (`editor.getJSON()`), sem importar a biblioteca.

export interface MarcaVisual {
  type: 'bold' | 'italic' | 'code' | 'link' | 'expoente';
  attrs?: { href?: string; parenteses?: boolean };
}

export interface NoVisual {
  type: string;
  attrs?: Record<string, unknown>;
  content?: NoVisual[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

export interface DocumentoVisual extends NoVisual {
  type: 'doc';
  content: NoVisual[];
}

/** `secao`: o texto inteiro de uma seção (blocos). `linha`: campo curto com Markdown inline (Pérola, Alerta, item de Pontos-Chave). */
export type ModoDoTexto = 'secao' | 'linha';

export type AvaliacaoDoTexto = { seguro: true; documento: DocumentoVisual } | { seguro: false; motivo: string };

/** As seis caixas com função do padrão v3, na ordem em que o leitor as testa. */
export const ROTULOS_DAS_CAIXAS = ['Cuidado', 'Raciocínio', 'Não confundir', 'Atualização', 'Aprofundar', 'Essencial'] as const;
export type RotuloDaCaixa = (typeof ROTULOS_DAS_CAIXAS)[number];

// --- Cópias das regras do leitor (SafeMarkdown) ------------------------------------------------------------------------

/** `SafeMarkdown`, `CAIXAS_DE_FUNCAO.padrao`: o que o leitor reconhece como caixa (variações de acento, caixa alta e dois-pontos incluídas). */
export const PADROES_DAS_CAIXAS: ReadonlyArray<{ padrao: RegExp; rotulo: RotuloDaCaixa }> = [
  { padrao: /^\s*\*\*Cuidado:?\*\*:?\s*/i, rotulo: 'Cuidado' },
  { padrao: /^\s*\*\*Racioc[ií]nio(?: cl[ií]nico)?:?\*\*:?\s*/i, rotulo: 'Raciocínio' },
  { padrao: /^\s*\*\*N[aã]o confundir:?\*\*:?\s*/i, rotulo: 'Não confundir' },
  { padrao: /^\s*\*\*Atualiza[cç][aã]o:?\*\*:?\s*/i, rotulo: 'Atualização' },
  { padrao: /^\s*\*\*(?:Para )?aprofundar:?\*\*:?\s*/i, rotulo: 'Aprofundar' },
  { padrao: /^\s*\*\*Essencial:?\*\*:?\s*/i, rotulo: 'Essencial' },
];

/** `SafeMarkdown`: caixas antigas do leitor (conduta de ouro, armadilha, fisiopatologia, consenso). O editor não as mostra como caixa. */
const CAIXAS_ANTIGAS: readonly RegExp[] = [
  /^\s*\[!(NOTE|TIP)\]/i,
  /^\s*\*\*(Diretriz|Conduta de Ouro|Ponto Chave)/i,
  /^\s*\[!(WARNING|CAUTION)\]/i,
  /^\s*\*\*(Pegadinha|Armadilha|Atenção|Alerta)/i,
  /^\s*\*\*(Fisiopatologia|Mecanismo|Farmacologia)/i,
  /^\s*\*\*(Consenso de Prova|Prova vs\.? Plantão|Prática vs\.? Prova|Consenso vs\.? Prática|Pérola de Prova)/i,
];

/** `SafeMarkdown`, `isFormulaLine`. */
function eLinhaDeFormula(linha: string): boolean {
  return linha.includes('=') && linha.length <= 220 && !/[.,;:]$/.test(linha);
}

/** `SafeMarkdown`, `parseInline`. */
const INLINE = /(\*\*(?:\*(?!\*)|[^*])+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/;
/** `SafeMarkdown`, `SUPERSCRIPT_SPLIT`. */
const EXPOENTE = /(\^(?:\([^()]+\)|[^\s×÷/+\-=,()[\]]+))/;

const MARCADOR_DE_LISTA = /^\s*[-*•]\s+/;
const MARCADOR_NUMERADO = /^\s*\d+\.\s+/;

// --- Leitura: texto → documento ----------------------------------------------------------------------------------------

class NaoSeguro extends Error {
  constructor(readonly motivo: string) {
    super(motivo);
  }
}

const recusar = (motivo: string): never => {
  throw new NaoSeguro(motivo);
};

/** Marca de uma quebra de linha dentro do bloco. É espaço em branco (`\s`) para o leitor, como a quebra é. */
const QUEBRA = ' ';

/** Quebra de linha simples dentro de um parágrafo ou item de lista, com o espaço que a cerca. */
const SEPARADOR_DE_LINHA = /[ \t]*\n[ \t]*/g;
/** Quebra de linha dentro de uma citação: a linha seguinte começa com `>` (e um espaço opcional). */
const SEPARADOR_DE_CITACAO = /[ \t]*\n>(?: )?/g;

interface Folha {
  texto: string;
  marcas: MarcaVisual[];
}

const ORDEM_DAS_MARCAS: Record<MarcaVisual['type'], number> = { bold: 0, italic: 1, link: 2, code: 3, expoente: 4 };

function ordenar(marcas: MarcaVisual[]): MarcaVisual[] {
  return [...marcas].sort((a, b) => ORDEM_DAS_MARCAS[a.type] - ORDEM_DAS_MARCAS[b.type]);
}

/** Repete `parseInline` do leitor, registrando em `saida` cada trecho de texto com as marcas que o leitor aplicaria. */
function lerInline(texto: string, marcas: MarcaVisual[], saida: Folha[]): boolean {
  const tem = (tipo: MarcaVisual['type']) => marcas.some((m) => m.type === tipo);
  for (const parte of texto.split(INLINE)) {
    if (!parte) continue;

    if (parte.startsWith('**') && parte.endsWith('**') && parte.length >= 4) {
      const interno = parte.slice(2, -2);
      if (!interno || tem('bold') || !lerInline(interno, [...marcas, { type: 'bold' }], saida)) return false;
      continue;
    }

    if (parte.startsWith('*') && parte.endsWith('*') && parte.length >= 2) {
      const interno = parte.slice(1, -1);
      if (!interno || tem('italic') || !lerInline(interno, [...marcas, { type: 'italic' }], saida)) return false;
      continue;
    }

    if (parte.startsWith('`') && parte.endsWith('`') && parte.length >= 2) {
      const interno = parte.slice(1, -1);
      if (!interno) return false;
      saida.push({ texto: interno, marcas: [...marcas, { type: 'code' }] });
      continue;
    }

    if (parte.startsWith('[') && parte.includes('](') && parte.endsWith(')')) {
      const m = parte.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (m) {
        // O endereço é lido inteiro, sem quebra dentro: o separador de linha não pode se perder nele.
        if (m[2].includes(QUEBRA)) return false;
        saida.push({ texto: m[1], marcas: [...marcas, { type: 'link', attrs: { href: m[2] } }] });
        continue;
      }
    }

    // Texto comum: pode ter expoente (`x^2`, `10^(9-pH)`), decodificado como o leitor faz.
    for (const pedaco of parte.split(EXPOENTE)) {
      if (!pedaco) continue;
      const m = pedaco.match(/^\^(?:\(([^()]+)\)|(.+))$/);
      if (m) {
        saida.push({
          texto: m[1] ?? m[2],
          marcas: [...marcas, { type: 'expoente', attrs: { parenteses: m[1] !== undefined } }],
        });
      } else if (pedaco.startsWith('^') && pedaco.includes(QUEBRA)) {
        // O `.` do leitor atravessa o espaço que aqui é a marca de quebra: a leitura divergiria.
        return false;
      } else {
        saida.push({ texto: pedaco, marcas });
      }
    }
  }
  return true;
}

const igualMarcas = (a?: NoVisual['marks'], b?: NoVisual['marks']) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

/** Junta texto vizinho com as mesmas marcas (o ProseMirror também o faz). */
function juntarTextos(nos: NoVisual[]): NoVisual[] {
  const saida: NoVisual[] = [];
  for (const no of nos) {
    const ultimo = saida[saida.length - 1];
    if (no.type === 'text' && ultimo?.type === 'text' && igualMarcas(ultimo.marks, no.marks)) {
      ultimo.text = (ultimo.text ?? '') + (no.text ?? '');
    } else {
      saida.push({ ...no });
    }
  }
  return saida;
}

function paraNos(folhas: Folha[], separadores: string[]): NoVisual[] {
  const nos: NoVisual[] = [];
  let k = 0;
  for (const folha of folhas) {
    const marcas = ordenar(folha.marcas);
    const marks = marcas.length > 0 ? marcas : undefined;
    folha.texto.split(QUEBRA).forEach((pedaco, i) => {
      if (i > 0) nos.push({ type: 'quebraSuave', attrs: { raw: separadores[k++] }, ...(marks ? { marks } : {}) });
      if (pedaco) nos.push({ type: 'text', text: pedaco, ...(marks ? { marks } : {}) });
    });
  }
  if (k !== separadores.length) recusar('quebra de linha dentro de um endereço');
  return juntarTextos(nos);
}

/** Texto de um bloco → nós inline. `separador` casa as quebras de linha internas do bloco. */
function inlineDe(texto: string, separador: RegExp = SEPARADOR_DE_LINHA): NoVisual[] {
  const separadores: string[] = [];
  const comMarca = texto.replace(separador, (s) => {
    separadores.push(s);
    return QUEBRA;
  });
  if (comMarca.includes('\n')) recusar('quebra de linha fora do formato do leitor');
  const folhas: Folha[] = [];
  if (!lerInline(comMarca, [], folhas)) recusar('formatação que o leitor trata de forma incomum');
  return paraNos(folhas, separadores);
}

const paragrafo = (content: NoVisual[]): NoVisual => (content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' });
const protegido = (raw: string): NoVisual => ({ type: 'blocoProtegido', attrs: { raw } });

function lerLista(linhas: string[], numerada: boolean): NoVisual {
  const itens: string[] = [];
  for (const linha of linhas) {
    if ((numerada ? MARCADOR_NUMERADO : MARCADOR_DE_LISTA).test(linha)) {
      const prefixo = numerada ? `${itens.length + 1}. ` : '- ';
      if (!linha.startsWith(prefixo) || (linha.length > prefixo.length && /\s/.test(linha[prefixo.length]))) {
        recusar(numerada ? 'lista numerada fora do formato "1. 2. 3."' : 'lista com marcador diferente de "- "');
      }
      // Item vazio: o leitor apara a linha ("- " vira "-") e mostra o próprio marcador como texto do item.
      if (linha.length === prefixo.length) recusar('item de lista vazio');
      itens.push(linha.slice(prefixo.length));
    } else {
      // Linha de continuação (sem marcador): fica no item anterior, como o leitor faz.
      itens[itens.length - 1] += '\n' + linha;
    }
  }
  return {
    type: numerada ? 'orderedList' : 'bulletList',
    content: itens.map((item) => ({ type: 'listItem', content: [paragrafo(inlineDe(item))] })),
  };
}

function lerCitacao(bloco: string): NoVisual {
  const linhas = bloco.split('\n');
  const textoDoLeitor = linhas.map((l) => l.replace(/^>\s?/, '')).join(' ');

  const caixa = PADROES_DAS_CAIXAS.find((c) => c.padrao.test(textoDoLeitor));
  if (caixa) {
    const prefixo = `> **${caixa.rotulo}:**`;
    if (!bloco.startsWith(prefixo)) recusar(`caixa "${caixa.rotulo}" fora do formato "> **${caixa.rotulo}:** texto"`);
    const resto = bloco.slice(prefixo.length);
    if (resto !== '' && !resto.startsWith(' ')) recusar(`caixa "${caixa.rotulo}" fora do formato`);
    const corpo = resto.slice(1);
    return {
      type: 'caixa',
      attrs: { rotulo: caixa.rotulo },
      content: [paragrafo(inlineDe(corpo, SEPARADOR_DE_CITACAO))],
    };
  }

  if (CAIXAS_ANTIGAS.some((p) => p.test(textoDoLeitor))) {
    recusar('caixa antiga do leitor (o editor visual não a mostra como caixa)');
  }

  // Fórmula citada como citação (`> TFG = ... [1](#ref-1)`): o leitor a exibe como fórmula.
  const cauda = textoDoLeitor.match(/((?:\s*\[\d+\]\(#ref-\d+\))+)\s*$/);
  const candidata = cauda ? textoDoLeitor.slice(0, cauda.index).trimEnd() : textoDoLeitor;
  if (eLinhaDeFormula(candidata)) return protegido(bloco);

  const corpo = bloco.slice(bloco.startsWith('> ') ? 2 : 1);
  return { type: 'blockquote', content: [paragrafo(inlineDe(corpo, SEPARADOR_DE_CITACAO))] };
}

function lerBloco(bloco: string): NoVisual {
  // Figura (`![alt](figura:<id>)`, legenda e `Fonte:`).
  if (bloco.startsWith('![') && lerBlocoDeFigura(bloco)) return protegido(bloco);

  // Tabela: o leitor ignora toda linha que não começa com `|`; aqui, bloco misto não é seguro.
  if (bloco.startsWith('|')) {
    if (!bloco.split('\n').every((l) => /^\|.*\|\s*$/.test(l))) recusar('tabela com linha fora do formato');
    return protegido(bloco);
  }

  if (bloco.startsWith('#')) {
    const m = bloco.match(/^(#{1,4})\s+(.+)$/);
    if (m) return { type: 'heading', attrs: { level: m[1].length }, content: inlineDe(m[2]) };
  }

  if (bloco.startsWith('>')) return lerCitacao(bloco);

  const linhas = bloco.split('\n');
  if (MARCADOR_DE_LISTA.test(linhas[0])) return lerLista(linhas, false);
  if (MARCADOR_NUMERADO.test(linhas[0])) return lerLista(linhas, true);

  // Fórmula de exibição numa linha própria dentro do parágrafo.
  if (linhas.map((l) => l.trim()).filter(Boolean).some(eLinhaDeFormula)) return protegido(bloco);

  return paragrafo(inlineDe(bloco));
}

function lerTexto(texto: string, modo: ModoDoTexto): DocumentoVisual {
  if (texto === '') return { type: 'doc', content: [] };
  if (texto.includes('\r') || texto.includes(QUEBRA) || texto.includes(' ')) {
    recusar('quebra de linha ou separador de parágrafo fora do padrão');
  }
  if (/<\/?[A-Za-z][^<>]*>|<!--/.test(texto)) recusar('HTML no texto (o leitor o mostra como texto, não como formatação)');

  if (modo === 'linha') {
    if (texto.includes('\n')) recusar('o campo tem mais de uma linha');
    return { type: 'doc', content: [paragrafo(inlineDe(texto))] };
  }

  if (normalizeBlockBoundaries(texto) !== texto) {
    recusar('falta linha em branco entre blocos (o leitor corrige sozinho; o editor visual não)');
  }
  const blocos = texto.split('\n\n').map((b) => {
    const caixaVazia = /^> \*\*[^*:]+:\*\* $/.test(b);
    if (b === '' || (b !== b.trim() && !caixaVazia)) recusar('linhas em branco a mais ou espaço sobrando entre blocos');
    return b;
  });
  return { type: 'doc', content: blocos.map(lerBloco) };
}

// --- Escrita: documento → texto ----------------------------------------------------------------------------------------

interface Item {
  texto: string;
  negrito: boolean;
  italico: boolean;
  codigo: boolean;
  href: string | null;
  expoente: boolean | null; // null: sem expoente; booleano: se leva parênteses
}

function itemDe(no: NoVisual): Item | null {
  const marca = (tipo: string) => no.marks?.find((m) => m.type === tipo);
  const link = marca('link');
  const expoente = marca('expoente');
  const base = {
    negrito: !!marca('bold'),
    italico: !!marca('italic'),
    codigo: !!marca('code'),
    href: link ? String(link.attrs?.href ?? '') : null,
    expoente: expoente ? !!expoente.attrs?.parenteses : null,
  };
  if (no.type === 'text') return { texto: no.text ?? '', ...base };
  if (no.type === 'quebraSuave') return { texto: String(no.attrs?.raw ?? '\n'), ...base };
  return null;
}

function agrupar(itens: Item[], chave: (i: Item) => string | boolean | null): Array<{ chave: string | boolean | null; itens: Item[] }> {
  const grupos: Array<{ chave: string | boolean | null; itens: Item[] }> = [];
  for (const item of itens) {
    const k = chave(item);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.chave === k) ultimo.itens.push(item);
    else grupos.push({ chave: k, itens: [item] });
  }
  return grupos;
}

const bruto = (itens: Item[]) => itens.map((i) => i.texto).join('');

/** Camadas, de fora para dentro: negrito, itálico, link, código, expoente — a ordem em que o leitor sabe ler. */
function escreverCamada(itens: Item[], camada: number): string {
  if (camada === 0) {
    return agrupar(itens, (i) => i.negrito)
      .map((g) => (g.chave ? `**${escreverCamada(g.itens.map((i) => ({ ...i, negrito: false })), 1)}**` : escreverCamada(g.itens, 1)))
      .join('');
  }
  if (camada === 1) {
    return agrupar(itens, (i) => i.italico)
      .map((g) => (g.chave ? `*${escreverCamada(g.itens.map((i) => ({ ...i, italico: false })), 2)}*` : escreverCamada(g.itens, 2)))
      .join('');
  }
  if (camada === 2) {
    return agrupar(itens, (i) => i.href)
      .map((g) => (g.chave === null ? escreverCamada(g.itens, 3) : `[${bruto(g.itens)}](${String(g.chave)})`))
      .join('');
  }
  if (camada === 3) {
    return agrupar(itens, (i) => i.codigo)
      .map((g) => (g.chave ? `\`${bruto(g.itens)}\`` : escreverCamada(g.itens, 4)))
      .join('');
  }
  return agrupar(itens, (i) => i.expoente)
    .map((g) => (g.chave === null ? bruto(g.itens) : g.chave ? `^(${bruto(g.itens)})` : `^${bruto(g.itens)}`))
    .join('');
}

function escreverInline(nos: NoVisual[] | undefined): string {
  const itens = (nos ?? []).map(itemDe).filter((i): i is Item => i !== null);
  return escreverCamada(itens, 0);
}

const textoDoParagrafo = (no: NoVisual | undefined) => escreverInline(no?.content?.find((n) => n.type === 'paragraph')?.content);

function escreverBloco(no: NoVisual): string {
  switch (no.type) {
    case 'paragraph':
      return escreverInline(no.content);
    case 'heading':
      return `${'#'.repeat(Number(no.attrs?.level ?? 1))} ${escreverInline(no.content)}`;
    case 'bulletList':
      return (no.content ?? []).map((item) => `- ${textoDoParagrafo(item)}`).join('\n');
    case 'orderedList':
      return (no.content ?? []).map((item, i) => `${i + 1}. ${textoDoParagrafo(item)}`).join('\n');
    case 'blockquote': {
      const texto = textoDoParagrafo(no);
      return texto ? `> ${texto}` : '>';
    }
    case 'caixa':
      return `> **${String(no.attrs?.rotulo ?? '')}:** ${textoDoParagrafo(no)}`;
    case 'blocoProtegido':
      return String(no.attrs?.raw ?? '');
    default:
      return '';
  }
}

/** O Markdown do documento. Parágrafo vazio no topo não gera bloco (o leitor o ignoraria). */
export function docParaTexto(doc: NoVisual, modo: ModoDoTexto = 'secao'): string {
  const blocos = doc.content ?? [];
  if (modo === 'linha') return escreverInline(blocos[0]?.content);
  return blocos
    .filter((b) => !(b.type === 'paragraph' && (b.content ?? []).length === 0))
    .map(escreverBloco)
    .join('\n\n');
}

// --- Guarda ----------------------------------------------------------------------------------------------------------

/**
 * Lê o texto para o editor visual e confere a ida e volta. `seguro: true` traz o documento; `seguro: false` traz o
 * motivo e NÃO traz documento: o texto original segue intacto com quem o chamou.
 */
export function avaliarTextoParaEditorVisual(texto: string, modo: ModoDoTexto = 'secao'): AvaliacaoDoTexto {
  try {
    const documento = lerTexto(texto, modo);
    if (docParaTexto(documento, modo) !== texto) {
      return { seguro: false, motivo: 'o editor visual não devolveria este texto exatamente igual' };
    }
    return { seguro: true, documento };
  } catch (e) {
    if (e instanceof NaoSeguro) return { seguro: false, motivo: e.motivo };
    throw e;
  }
}

/** A guarda pública: o texto pode ser aberto no editor visual sem que nenhum byte mude? */
export function textoEhSeguroParaEditorVisual(texto: string, modo: ModoDoTexto = 'secao'): boolean {
  return avaliarTextoParaEditorVisual(texto, modo).seguro;
}

/** O documento do texto (vazio vira um parágrafo vazio, que o editor exige), ou nulo se o texto não é seguro. */
export function textoParaDoc(texto: string, modo: ModoDoTexto = 'secao'): DocumentoVisual | null {
  const avaliacao = avaliarTextoParaEditorVisual(texto, modo);
  return avaliacao.seguro ? avaliacao.documento : null;
}

// --- Fidelidade do que o editor produz --------------------------------------------------------------------------------

function simplificar(no: NoVisual): unknown {
  if (no.type === 'text') {
    const marcas = (no.marks ?? []).map((m) => `${m.type}:${m.attrs?.href ?? ''}:${m.attrs?.parenteses ?? ''}`).sort();
    return { t: 'text', text: no.text ?? '', m: marcas };
  }
  const filhos = juntarSimplificados((no.content ?? []).map(simplificar));
  const marcas = (no.marks ?? []).map((m) => m.type).sort();
  if (no.type === 'quebraSuave') return { t: no.type, raw: no.attrs?.raw ?? '\n', m: marcas };
  if (no.type === 'heading') return { t: no.type, level: no.attrs?.level, c: filhos };
  if (no.type === 'caixa') return { t: no.type, rotulo: no.attrs?.rotulo, c: filhos };
  if (no.type === 'blocoProtegido') return { t: no.type, raw: no.attrs?.raw };
  // A lista numerada do leitor sempre começa em 1: outro começo no editor não é o que o texto guarda.
  if (no.type === 'orderedList') return { t: no.type, start: no.attrs?.start ?? 1, c: filhos };
  return { t: no.type, c: filhos };
}

function juntarSimplificados(nos: unknown[]): unknown[] {
  const saida: Array<{ t: string; text?: string; m?: string[] }> = [];
  for (const n of nos as Array<{ t: string; text?: string; m?: string[] }>) {
    const ultimo = saida[saida.length - 1];
    if (n.t === 'text' && ultimo?.t === 'text' && JSON.stringify(ultimo.m) === JSON.stringify(n.m)) {
      ultimo.text = (ultimo.text ?? '') + (n.text ?? '');
    } else {
      saida.push({ ...n });
    }
  }
  return saida;
}

const semParagrafoVazioNoTopo = (doc: NoVisual): NoVisual[] =>
  (doc.content ?? []).filter((b) => !(b.type === 'paragraph' && (b.content ?? []).length === 0));

/**
 * O que o editor produziu volta, lido pelo leitor, como o mesmo documento? Falso quando a formatação aplicada não
 * existe em Markdown do leitor (ex.: negrito e itálico no mesmo trecho inteiro, `***x***`, que o leitor lê torto) ou
 * quando o texto digitado seria lido como outra coisa (um `*` solto que fecha com outro mais adiante). Quem salva
 * deve tratar falso como "não salvar".
 */
export function documentoEhFiel(doc: NoVisual, modo: ModoDoTexto = 'secao'): boolean {
  const avaliacao = avaliarTextoParaEditorVisual(docParaTexto(doc, modo), modo);
  if (!avaliacao.seguro) return false;
  const a = JSON.stringify(semParagrafoVazioNoTopo(avaliacao.documento).map(simplificar));
  const b = JSON.stringify(semParagrafoVazioNoTopo(doc).map(simplificar));
  return a === b;
}

/** Tipo do bloco protegido, para o título que o editor mostra. */
export function tipoDoBlocoProtegido(raw: string): 'Figura' | 'Tabela' | 'Fórmula' {
  if (raw.startsWith('![')) return 'Figura';
  if (raw.startsWith('|')) return 'Tabela';
  return 'Fórmula';
}

const ORIGEM_DE_TESTE = 'https://app.nexusmed.invalid';

/**
 * O endereço que o editor pode pôr num `<a href>`: o mesmo critério do leitor (`parseInline`) — http(s), âncora da
 * página ou caminho interno; qualquer outra coisa (`javascript:`, `//outro.site`) vira `#`. O texto guardado não muda.
 */
export function hrefParaExibir(href: string): string {
  if (Array.from(href).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return '#';
  if (/^https?:\/\//i.test(href) || href.startsWith('#')) return href;
  if (href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/\\')) {
    try {
      if (new URL(href, ORIGEM_DE_TESTE).origin === ORIGEM_DE_TESTE) return href;
    } catch {
      return '#';
    }
  }
  return '#';
}
