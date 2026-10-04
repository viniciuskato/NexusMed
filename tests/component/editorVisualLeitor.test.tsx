import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

vi.mock('../../src/repositories/FigurasRepository', () => ({ urlDaFigura: vi.fn().mockResolvedValue(null) }));

import { SafeMarkdown } from '../../src/components/common/SafeMarkdown';
import { splitReaderBlocks } from '../../src/utils/markdownBlocks';
import { avaliarTextoParaEditorVisual, hrefParaExibir, textoParaDoc, type NoVisual } from '../../src/utils/editorVisualMarkdown';
import { CORPUS_SEGURO } from '../unit/helpers/corpusEditorVisual';

// ED-1 — o editor visual precisa MOSTRAR o que o leitor mostra. A conversão repete as regras do leitor
// (`SafeMarkdown`); este teste confere, renderizando o leitor de verdade, que as duas leituras concordam: mesmo tipo de
// bloco e mesma sequência de negrito, itálico, código, link, citação e expoente no texto de cada bloco.

afterEach(() => cleanup());

const colapsar = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Assinatura do inline lida do que o leitor renderizou. */
function assinaturaDoLeitor(no: Node): string {
  let saida = '';
  no.childNodes.forEach((filho) => {
    if (filho.nodeType === Node.TEXT_NODE) {
      saida += filho.textContent ?? '';
      return;
    }
    const el = filho as HTMLElement;
    const interno = assinaturaDoLeitor(el);
    switch (el.tagName) {
      case 'STRONG':
        saida += `<b>${interno}</b>`;
        break;
      case 'EM':
        saida += `<i>${interno}</i>`;
        break;
      case 'CODE':
        saida += `<c>${interno}</c>`;
        break;
      case 'SUP':
        saida += `<s>${interno}</s>`;
        break;
      case 'A':
        saida += `<a ${el.getAttribute('href')}>${interno}</a>`;
        break;
      default:
        saida += interno;
    }
  });
  return saida;
}

/** A mesma assinatura, montada do documento do editor (marcas em camadas: negrito, itálico, link, código, expoente). */
function assinaturaDoDocumento(nos: NoVisual[] | undefined): string {
  const itens = (nos ?? []).map((n) => ({
    texto: n.type === 'quebraSuave' ? ' ' : (n.text ?? ''),
    marcas: n.marks ?? [],
  }));
  const camada = (lista: typeof itens, ordem: string[]): string => {
    if (ordem.length === 0) return lista.map((i) => i.texto).join('');
    const [tipo, ...resto] = ordem;
    const grupos: Array<{ chave: string | null; itens: typeof itens }> = [];
    for (const item of lista) {
      const marca = item.marcas.find((m) => m.type === tipo);
      const chave = marca ? JSON.stringify(marca.attrs ?? {}) : null;
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.chave === chave) ultimo.itens.push(item);
      else grupos.push({ chave, itens: [item] });
    }
    return grupos
      .map((g) => {
        const interno = camada(g.itens, resto);
        if (g.chave === null) return interno;
        if (tipo === 'bold') return `<b>${interno}</b>`;
        if (tipo === 'italic') return `<i>${interno}</i>`;
        if (tipo === 'code') return `<c>${interno}</c>`;
        if (tipo === 'expoente') return `<s>${interno}</s>`;
        return `<a ${hrefParaExibir((JSON.parse(g.chave) as { href: string }).href)}>${interno}</a>`;
      })
      .join('');
  };
  return camada(itens, ['bold', 'italic', 'link', 'code', 'expoente']);
}

const NIVEL_NO_LEITOR: Record<number, string> = { 1: 'H2', 2: 'H3', 3: 'H4', 4: 'H4' };

/** Compara um bloco do texto: o que o leitor renderiza × o nó que o editor teria. Devolve a divergência ou nulo. */
function divergencia(bloco: string, no: NoVisual): string | null {
  const { container } = render(<SafeMarkdown content={bloco} />);
  const raiz = container.firstElementChild as HTMLElement;
  const filhos = Array.from(raiz?.children ?? []);
  try {
    if (no.type === 'blocoProtegido') {
      const ok = filhos.some((f) => f.querySelector('.eq-box, table, figure') || f.matches('.eq-box, figure'));
      return ok ? null : `bloco protegido, mas o leitor não mostrou fórmula/tabela/figura: ${raiz?.innerHTML}`;
    }
    if (filhos.length !== 1) return `o leitor mostrou ${filhos.length} elementos para um bloco só: ${raiz?.innerHTML}`;
    const el = filhos[0] as HTMLElement;

    if (no.type === 'paragraph') {
      if (el.tagName !== 'P') return `esperava <p>, o leitor mostrou <${el.tagName.toLowerCase()}>`;
      return colapsar(assinaturaDoLeitor(el)) === colapsar(assinaturaDoDocumento(no.content))
        ? null
        : `inline: leitor "${colapsar(assinaturaDoLeitor(el))}" × editor "${colapsar(assinaturaDoDocumento(no.content))}"`;
    }
    if (no.type === 'heading') {
      const esperado = NIVEL_NO_LEITOR[Number(no.attrs?.level)];
      if (el.tagName !== esperado) return `esperava <${esperado}>, o leitor mostrou <${el.tagName}>`;
      return colapsar(assinaturaDoLeitor(el)) === colapsar(assinaturaDoDocumento(no.content)) ? null : 'inline do subtítulo diverge';
    }
    if (no.type === 'bulletList' || no.type === 'orderedList') {
      if (el.tagName !== (no.type === 'bulletList' ? 'UL' : 'OL')) return `lista de tipo errado: ${el.tagName}`;
      const itens = Array.from(el.children);
      if (itens.length !== (no.content ?? []).length) return `número de itens: leitor ${itens.length} × editor ${(no.content ?? []).length}`;
      for (let i = 0; i < itens.length; i++) {
        const alvo = no.type === 'bulletList' ? (itens[i].children[1] as HTMLElement) : (itens[i] as HTMLElement);
        const esperado = assinaturaDoDocumento(no.content?.[i].content?.[0].content);
        if (colapsar(assinaturaDoLeitor(alvo)) !== colapsar(esperado)) {
          return `item ${i + 1}: leitor "${colapsar(assinaturaDoLeitor(alvo))}" × editor "${colapsar(esperado)}"`;
        }
      }
      return null;
    }
    if (no.type === 'caixa') {
      if (el.getAttribute('data-caixa') !== no.attrs?.rotulo) return `caixa: leitor "${el.getAttribute('data-caixa')}" × editor "${String(no.attrs?.rotulo)}"`;
      const corpo = el.cloneNode(true) as HTMLElement;
      corpo.firstElementChild?.remove(); // o título da caixa
      const esperado = assinaturaDoDocumento(no.content?.[0].content);
      return colapsar(assinaturaDoLeitor(corpo)) === colapsar(esperado) ? null : `caixa: leitor "${colapsar(assinaturaDoLeitor(corpo))}" × editor "${colapsar(esperado)}"`;
    }
    if (no.type === 'blockquote') {
      if (el.tagName !== 'BLOCKQUOTE') return `esperava <blockquote>, o leitor mostrou <${el.tagName.toLowerCase()}>`;
      const esperado = assinaturaDoDocumento(no.content?.[0].content);
      return colapsar(assinaturaDoLeitor(el)) === colapsar(esperado) ? null : `citação: leitor "${colapsar(assinaturaDoLeitor(el))}" × editor "${colapsar(esperado)}"`;
    }
    return `tipo de nó sem comparação: ${no.type}`;
  } finally {
    cleanup();
  }
}

function compararTexto(texto: string): string[] {
  const doc = textoParaDoc(texto);
  if (!doc) return [];
  const blocos = splitReaderBlocks(texto).filter((b) => b.trim() !== '');
  if (blocos.length !== doc.content.length) return [`blocos: leitor ${blocos.length} × editor ${doc.content.length}`];
  return blocos.flatMap((bloco, i) => {
    const d = divergencia(bloco, doc.content[i]);
    return d ? [`${JSON.stringify(bloco)} → ${d}`] : [];
  });
}

describe('editor visual × leitor — o editor mostra o que o leitor mostra', () => {
  for (const grupo of CORPUS_SEGURO) {
    it(`${grupo.construcao}: mesmos blocos e mesma formatação`, () => {
      for (const texto of grupo.textos) {
        expect(compararTexto(texto), texto).toEqual([]);
      }
    });
  }

  it('amostra aleatória de textos com símbolos de formatação: onde o editor aceita, concorda com o leitor', () => {
    // Gerador determinístico (mulberry32): a mesma amostra em toda execução.
    let semente = 20261004;
    const aleatorio = () => {
      semente = (semente + 0x6d2b79f5) | 0;
      let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pecas = ['**', '*', '`', '[a](http://x.y)', '[1](#ref-1)', '^2', '^(a b)', 'x', 'palavra', ' ', ' ', ' ', '\n', '_', 'a*b', '(', ')', '[', ']', '^', '`c`', '**n**', '*i*'];
    const divergentes: string[] = [];
    let aceitos = 0;
    let recusados = 0;
    for (let n = 0; n < 1500; n++) {
      const tamanho = 1 + Math.floor(aleatorio() * 12);
      let texto = '';
      for (let k = 0; k < tamanho; k++) texto += pecas[Math.floor(aleatorio() * pecas.length)];
      if (!avaliarTextoParaEditorVisual(texto).seguro) {
        recusados++;
        continue;
      }
      aceitos++;
      divergentes.push(...compararTexto(texto));
    }
    console.info(`amostra aleatória: ${aceitos} aceitos, ${recusados} recusados, ${divergentes.length} divergências`);
    expect(aceitos).toBeGreaterThan(200);
    expect(divergentes.slice(0, 5)).toEqual([]);
  });
});
