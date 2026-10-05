import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

vi.mock('../../src/repositories/FigurasRepository', () => ({ urlDaFigura: vi.fn().mockResolvedValue(null) }));

import { SafeMarkdown, parseInline } from '../../src/components/common/SafeMarkdown';
import { htmlComoNaTela, leitorMostraIgual, textoParaAbrirNoEditorVisual } from '../../src/components/compendium/normalizacaoDoTexto';
import { avaliarTextoParaEditorVisual, textoEhSeguroParaEditorVisual, type ModoDoTexto } from '../../src/utils/editorVisualMarkdown';
import { normalizarParaEditorVisual } from '../../src/utils/normalizarParaEditorVisual';
import { CORPUS_SEGURO } from '../unit/helpers/corpusEditorVisual';

// ED-2 — texto que o editor visual não aceita, mas que o leitor mostra igual a uma versão que ele aceita. Cada caso
// renderiza o leitor (`SafeMarkdown`, ou `parseInline` nos campos de uma linha) com o texto original e com o normalizado
// e compara o HTML. Os casos que o leitor NÃO mostra igual (ou que nenhuma regra conserta) ficam sem normalização.

afterEach(() => cleanup());

/** O HTML que o leitor renderiza (pelo React Testing Library, independente do módulo testado). */
function htmlRenderizado(texto: string, modo: ModoDoTexto = 'secao'): string {
  const { container, unmount } = render(modo === 'linha' ? <p>{parseInline(texto)}</p> : <SafeMarkdown content={texto} />);
  const html = container.innerHTML;
  unmount();
  return html;
}

interface Caso {
  nome: string;
  original: string;
  /** O texto que o editor visual passa a abrir. */
  normalizado: string;
  /** O HTML do leitor é idêntico byte a byte (senão, só depois de o navegador colapsar o espaço em branco). */
  htmlIgualAoByte: boolean;
}

const CASOS_DA_SECAO: Caso[] = [
  { nome: 'espaço no fim do texto', original: 'Um parágrafo.  ', normalizado: 'Um parágrafo.', htmlIgualAoByte: true },
  { nome: 'espaço no começo do texto', original: '   Um parágrafo recuado.', normalizado: 'Um parágrafo recuado.', htmlIgualAoByte: true },
  { nome: 'espaço no fim das linhas de uma lista', original: '- um \n- dois  ', normalizado: '- um\n- dois', htmlIgualAoByte: true },
  { nome: 'quebra de linha do Windows (\\r\\n)', original: 'Primeiro.\r\n\r\nSegundo.', normalizado: 'Primeiro.\n\nSegundo.', htmlIgualAoByte: true },
  { nome: 'lista com *', original: '* um\n* dois\n* três', normalizado: '- um\n- dois\n- três', htmlIgualAoByte: true },
  { nome: 'lista com •', original: '• um\n• dois', normalizado: '- um\n- dois', htmlIgualAoByte: true },
  { nome: 'lista com "-" e espaços a mais', original: '-   um\n-   dois', normalizado: '- um\n- dois', htmlIgualAoByte: true },
  { nome: 'lista numerada que não começa em 1', original: '3. um\n4. dois', normalizado: '1. um\n2. dois', htmlIgualAoByte: true },
  { nome: 'linha em branco faltando antes de lista', original: 'As causas são:\n- uma\n- outra', normalizado: 'As causas são:\n\n- uma\n- outra', htmlIgualAoByte: true },
  { nome: 'linha em branco faltando antes de lista com *', original: 'As causas são:\n* uma\n* outra', normalizado: 'As causas são:\n\n- uma\n- outra', htmlIgualAoByte: true },
  {
    nome: 'linha em branco faltando antes e depois de subtítulo',
    original: 'Texto antes\n#### Subtítulo\nTexto depois',
    normalizado: 'Texto antes\n\n#### Subtítulo\n\nTexto depois',
    htmlIgualAoByte: true,
  },
  { nome: 'subtítulo com espaços a mais depois do #', original: '####   Subtítulo\n\nTexto.', normalizado: '#### Subtítulo\n\nTexto.', htmlIgualAoByte: true },
  { nome: 'linhas em branco a mais entre parágrafos', original: 'Um.\n\n\n\nDois.', normalizado: 'Um.\n\nDois.', htmlIgualAoByte: true },
  { nome: 'citação sem espaço depois do >', original: '>uma citação', normalizado: '> uma citação', htmlIgualAoByte: true },
  {
    nome: 'caixa escrita em caixa alta e sem dois-pontos dentro do negrito',
    original: '> **CUIDADO**: atenção aqui',
    normalizado: '> **Cuidado:** atenção aqui',
    htmlIgualAoByte: true,
  },
  { nome: 'caixa "Raciocínio clínico"', original: '> **Raciocínio clínico:** passo a passo', normalizado: '> **Raciocínio:** passo a passo', htmlIgualAoByte: true },
  { nome: 'caixa "Para aprofundar"', original: '> **Para aprofundar:** leia mais', normalizado: '> **Aprofundar:** leia mais', htmlIgualAoByte: true },
  {
    nome: 'vários problemas juntos',
    original: 'Intro  \r\n* a \r\n* b\r\n\r\n\r\n> **cuidado:** x  ',
    normalizado: 'Intro\n\n- a\n- b\n\n> **Cuidado:** x',
    htmlIgualAoByte: true,
  },
];

const CASOS_DE_UMA_LINHA: Caso[] = [
  { nome: 'quebra de linha do Windows no fim', original: 'Alerta de armadilha\r\n', normalizado: 'Alerta de armadilha', htmlIgualAoByte: false },
  { nome: 'quebra de linha no fim', original: 'Pérola clínica [1](#ref-1)\n', normalizado: 'Pérola clínica [1](#ref-1)', htmlIgualAoByte: false },
  { nome: 'quebra de linha e espaços nas duas pontas', original: ' \n Ponto com **negrito** \r\n', normalizado: 'Ponto com **negrito**', htmlIgualAoByte: false },
];

describe('normalização para o editor visual — texto da seção: cada caso é aceito pelo editor e igual para o leitor', () => {
  for (const caso of CASOS_DA_SECAO) {
    it(caso.nome, async () => {
      // O original não é aceito pelo editor; o normalizado é.
      expect(textoEhSeguroParaEditorVisual(caso.original)).toBe(false);
      expect(normalizarParaEditorVisual(caso.original)).toBe(caso.normalizado);
      expect(avaliarTextoParaEditorVisual(caso.normalizado).seguro).toBe(true);

      // O leitor renderiza os dois do mesmo jeito (comparando o HTML de verdade).
      const antes = htmlRenderizado(caso.original);
      const depois = htmlRenderizado(caso.normalizado);
      if (caso.htmlIgualAoByte) expect(depois).toBe(antes);
      expect(htmlComoNaTela(depois)).toBe(htmlComoNaTela(antes));

      // E é o que o app oferece.
      expect(await leitorMostraIgual(caso.original, caso.normalizado)).toBe(true);
      expect(await textoParaAbrirNoEditorVisual(caso.original)).toBe(caso.normalizado);
    });
  }
});

describe('normalização para o editor visual — campos de uma linha (Pontos-chave, Pérola, Alerta)', () => {
  for (const caso of CASOS_DE_UMA_LINHA) {
    it(caso.nome, async () => {
      expect(textoEhSeguroParaEditorVisual(caso.original, 'linha')).toBe(false);
      expect(normalizarParaEditorVisual(caso.original, 'linha')).toBe(caso.normalizado);
      expect(avaliarTextoParaEditorVisual(caso.normalizado, 'linha').seguro).toBe(true);

      const antes = htmlRenderizado(caso.original, 'linha');
      const depois = htmlRenderizado(caso.normalizado, 'linha');
      if (caso.htmlIgualAoByte) expect(depois).toBe(antes);
      // A quebra de linha no fim de um campo de uma linha existe no HTML, mas não aparece na tela.
      expect(htmlComoNaTela(depois)).toBe(htmlComoNaTela(antes));

      expect(await textoParaAbrirNoEditorVisual(caso.original, 'linha')).toBe(caso.normalizado);
    });
  }
});

describe('normalização para o editor visual — o que NÃO se oferece', () => {
  it('linha só com espaço entre parágrafos: o leitor a junta ao parágrafo, normalizar mudaria o que se vê', async () => {
    // O espaço no fim do texto o torna inaceitável para o editor; consertá-lo parece simples...
    const original = 'Um parágrafo.\n \nOutro parágrafo.  ';
    expect(textoEhSeguroParaEditorVisual(original)).toBe(false);
    const proposta = normalizarParaEditorVisual(original);
    expect(proposta).toBe('Um parágrafo.\n\nOutro parágrafo.');
    // ...mas o leitor mostra um parágrafo só no original (a linha com espaço não separa blocos) e dois na proposta.
    expect(htmlComoNaTela(htmlRenderizado(proposta as string))).not.toBe(htmlComoNaTela(htmlRenderizado(original)));
    expect(await leitorMostraIgual(original, proposta as string)).toBe(false);
    expect(await textoParaAbrirNoEditorVisual(original)).toBeNull();
  });

  it('o conferidor de igualdade distingue textos que o leitor mostra diferente', async () => {
    expect(await leitorMostraIgual('**a**', 'a')).toBe(false);
    expect(await leitorMostraIgual('- a', '1. a')).toBe(false);
    expect(await leitorMostraIgual('um', 'um', 'linha')).toBe(true);
  });

  it('HTML no texto: nenhuma regra o conserta', async () => {
    const original = 'Texto com <b>negrito em HTML</b>.';
    expect(normalizarParaEditorVisual(original)).toBeNull();
    expect(await textoParaAbrirNoEditorVisual(original)).toBeNull();
  });

  it('caixa antiga do leitor (Atenção, Pegadinha): o editor não a mostra como caixa', async () => {
    for (const original of ['> **Atenção:** cuidado com isto', '> [!WARNING] cuidado com isto', '> **Fisiopatologia:** o mecanismo é este']) {
      expect(normalizarParaEditorVisual(original)).toBeNull();
      expect(await textoParaAbrirNoEditorVisual(original)).toBeNull();
    }
  });

  it('campo de uma linha com quebra de linha dentro: não é um campo de uma linha', async () => {
    const original = 'primeira linha \nsegunda linha';
    expect(normalizarParaEditorVisual(original, 'linha')).toBeNull();
    expect(await textoParaAbrirNoEditorVisual(original, 'linha')).toBeNull();
  });

  it('quebra de linha solta (\\r sozinho) não é normalizada', async () => {
    expect(normalizarParaEditorVisual('um\rdois')).toBeNull();
  });
});

describe('normalização para o editor visual — texto que o editor já aceita', () => {
  it('não propõe nada e abre o próprio texto, em todo o corpus de ida e volta', async () => {
    for (const grupo of CORPUS_SEGURO) {
      for (const texto of grupo.textos) {
        expect(normalizarParaEditorVisual(texto), texto).toBeNull();
        expect(await textoParaAbrirNoEditorVisual(texto), texto).toBe(texto);
      }
    }
  });

  it('a normalização é idempotente: o texto normalizado não propõe outra troca', () => {
    for (const caso of CASOS_DA_SECAO) expect(normalizarParaEditorVisual(caso.normalizado), caso.nome).toBeNull();
    for (const caso of CASOS_DE_UMA_LINHA) expect(normalizarParaEditorVisual(caso.normalizado, 'linha'), caso.nome).toBeNull();
  });
});
