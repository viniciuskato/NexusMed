import type { Flashcard } from '../types';

// CORTE-1 (D-14): os cartões saem da tela; o usuário leva os que já tem para o Anki.
//
// Formato: importação de texto do Anki (Arquivo > Importar). Um arquivo `.txt` separado por tabulação, uma linha por
// cartão, "frente<TAB>verso". O cabeçalho `#separator:tab` e `#html:false` é lido pelo próprio Anki: o texto entra
// como está, sem interpretar HTML. Como a tabulação separa os campos e a quebra de linha separa os cartões, os dois
// são trocados por espaço dentro do texto (o Anki, sem HTML, não tem como guardar uma quebra de linha no meio de um
// campo sem as aspas do CSV, e o pedido é uma linha por cartão).

export interface ArquivoAnki {
  /** Conteúdo do arquivo (UTF-8, quebras de linha `\n`). */
  texto: string;
  nomeDoArquivo: string;
  /** Quantos cartões foram para o arquivo. */
  total: number;
}

/** Texto de um campo: sem tabulação nem quebra de linha, espaços repetidos viram um e as pontas são aparadas. */
export function campoDoAnki(texto: string | null | undefined): string {
  return (texto ?? '').replace(/\s+/g, ' ').trim();
}

/** O verso que o usuário via na revisão: o verso e, se houver e não repetir o verso, o destaque do mecanismo. */
function versoDoCartao(card: Flashcard): string {
  const verso = campoDoAnki(card.back);
  const destaque = campoDoAnki(card.mechanismHighlight);
  if (!destaque || verso.includes(destaque)) return verso;
  return verso ? `${verso} — ${destaque}` : destaque;
}

function dataDeHoje(agora: Date): string {
  const duas = (n: number) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${duas(agora.getMonth() + 1)}-${duas(agora.getDate())}`;
}

/**
 * Monta o arquivo de importação do Anki com os cartões dados. Cartão sem frente não entra (o Anki o recusaria como
 * cartão vazio). Sem nenhum cartão, `total` é 0 e o chamador não baixa nada.
 */
export function montarArquivoAnki(cards: readonly Flashcard[], agora: Date = new Date()): ArquivoAnki {
  const linhas = cards
    .map((card) => ({ frente: campoDoAnki(card.front), verso: versoDoCartao(card) }))
    .filter((c) => c.frente !== '')
    .map((c) => `${c.frente}\t${c.verso}`);
  const cabecalho = ['#separator:tab', '#html:false'];
  return {
    texto: `${[...cabecalho, ...linhas].join('\n')}\n`,
    nomeDoArquivo: `cartoes-nexusmed-${dataDeHoje(agora)}.txt`,
    total: linhas.length,
  };
}
