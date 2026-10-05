// Texto que o editor visual não aceita como está, mas que o leitor (`SafeMarkdown`) mostra igual a uma versão que o editor
// aceita (ED-2). Exemplos: espaço no fim da linha, quebra de linha do Windows (`\r\n`), lista com `*` ou `•`, linha em
// branco que falta antes de uma lista, `>texto` sem o espaço, caixa escrita como `**CUIDADO**` ou `**Raciocínio clínico:**`.
//
// Este módulo só PROPÕE um texto: sem React e sem biblioteca de editor, como `editorVisualMarkdown.ts`. Quem o usa
// (`src/components/compendium/normalizacaoDoTexto.ts`) só oferece a troca quando o leitor renderiza o texto proposto
// igual ao original — conferido de verdade, renderizando o leitor nos dois textos. A proposta nunca é gravada sozinha:
// só vale se a pessoa abrir o editor visual e salvar.
//
// Cada regra abaixo repete uma decisão do leitor (`SafeMarkdown`, `markdownBlocks.ts`); mudou o leitor, mude aqui
// (AGENTS.md, itens 19 e 21). `tests/component/normalizacaoEditorVisual.test.tsx` renderiza o leitor para cada caso.

import { avaliarTextoParaEditorVisual, PADROES_DAS_CAIXAS, type ModoDoTexto } from './editorVisualMarkdown';
import { normalizeBlockBoundaries } from './markdownBlocks';

const MARCADOR_DE_LISTA = /^\s*[-*•]\s+/;
const MARCADOR_NUMERADO = /^\s*\d+\.\s+/;

/** O leitor apara cada bloco e cada linha de parágrafo/lista; espaço no fim da linha nunca aparece. */
const semEspacoNoFim = (texto: string) => texto.replace(/[ \t]+$/gm, '');

/** Linha só com espaço separa parágrafos para quem lê com os olhos, mas não para o separador de blocos do leitor (`\n\n`). */
const linhasEmBrancoVazias = (texto: string) => texto.replace(/^[ \t]+$/gm, '');

const umaLinhaEmBranco = (texto: string) => texto.replace(/\n{3,}/g, '\n\n');

function normalizarBloco(bloco: string): string {
  // O leitor trabalha com o bloco aparado (`block.trim()`).
  const b = bloco.trim();
  if (b === '') return b;

  // Figura e tabela: o editor as guarda como estão.
  if (b.startsWith('![') || b.startsWith('|')) return b;

  // Subtítulo: `#   Título` → `# Título` (o leitor lê `^(#{1,4})\s+(.+)$` e descarta os espaços).
  if (b.startsWith('#')) {
    const m = b.match(/^(#{1,4})\s+(.+)$/);
    return m ? `${m[1]} ${m[2]}` : b;
  }

  // Citação e caixa.
  if (b.startsWith('>')) {
    const linhas = b.split('\n');
    const textoDoLeitor = linhas.map((l) => l.replace(/^>\s?/, '')).join(' ');
    const caixa = PADROES_DAS_CAIXAS.find((c) => c.padrao.test(textoDoLeitor));
    // Caixa com função: o leitor mostra o rótulo certo, qualquer que seja a grafia (acento, caixa alta, dois-pontos).
    if (caixa) return `> **${caixa.rotulo}:** ${textoDoLeitor.replace(caixa.padrao, '')}`;
    // Citação comum: o leitor tira o `>` com ou sem espaço depois dele.
    return linhas.map((l) => l.replace(/^>(?=\S)/, '> ')).join('\n');
  }

  const linhas = b.split('\n');

  // Lista com marcador (`-`, `*` ou `•`): o leitor desenha o seu próprio marcador e descarta o do texto.
  if (MARCADOR_DE_LISTA.test(linhas[0])) {
    return linhas.map((l) => (MARCADOR_DE_LISTA.test(l) ? `- ${l.replace(MARCADOR_DE_LISTA, '')}` : l.trim())).join('\n');
  }

  // Lista numerada: o leitor numera de 1 em diante, qualquer que seja o número digitado.
  if (MARCADOR_NUMERADO.test(linhas[0])) {
    let n = 0;
    return linhas.map((l) => (MARCADOR_NUMERADO.test(l) ? `${++n}. ${l.replace(MARCADOR_NUMERADO, '')}` : l.trim())).join('\n');
  }

  // Parágrafo: o leitor apara cada linha e junta com espaço.
  return linhas.map((l) => l.trim()).join('\n');
}

/**
 * Uma versão do texto que o editor visual aceita, ou `null` quando não há (o texto já é aceito, ou nenhuma das regras
 * acima o deixa aceitável). NÃO garante que o leitor o renderize igual ao original: confira antes de oferecer.
 */
export function normalizarParaEditorVisual(texto: string, modo: ModoDoTexto = 'secao'): string | null {
  if (avaliarTextoParaEditorVisual(texto, modo).seguro) return null;
  let t = texto.replace(/\r\n/g, '\n');
  t = semEspacoNoFim(t);

  if (modo === 'linha') {
    // Campo de uma linha só: só o espaço e a quebra de linha nas pontas se perdem (na tela, nada deles aparece).
    t = t.trim();
  } else {
    t = linhasEmBrancoVazias(t);
    t = umaLinhaEmBranco(t.trim());
    // O leitor insere sozinho a linha em branco que falta antes de lista, subtítulo, tabela, citação e figura.
    t = normalizeBlockBoundaries(t);
    t = umaLinhaEmBranco(t);
    t = t
      .split('\n\n')
      .map(normalizarBloco)
      .filter((b) => b !== '')
      .join('\n\n');
  }

  if (t === texto) return null;
  return avaliarTextoParaEditorVisual(t, modo).seguro ? t : null;
}
