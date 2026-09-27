import {
  ALERT_LABEL,
  blockBody,
  blockquoteLabelText,
  extractBacktickTags,
  extractMetadata,
  extractNumberedList,
  extractSectionParts,
  METADATA_LABELS,
  normalize,
  parseCompendiumMarkdownText,
  PEARL_LABEL,
  readMarkdownLayout,
  SECTION_NUMBER_PREFIX,
  TAKEAWAYS_LABEL,
  type MarkdownFileBlock,
} from './compendiumMarkdownImport';
import { extractTableCitations, splitReaderBlocks } from './markdownBlocks';

// ============================================================================
// Checagem do padrão de conteúdos sobre o arquivo `.md` (unidade 44-C1).
//
// Aponta, antes de importar, os erros mecânicos que o padrão
// (`docs/editorial/PADRAO-NEXUSMED-CONTEUDOS.md`, seções 1.5 a 1.8) proíbe e
// que a importação aceita em silêncio — para que a atenção de quem atesta vá
// para o conteúdo, não para o formato. Pendência orienta; não bloqueia nada e
// não corrige o arquivo. Regras de julgamento (profundidade, escopo do nível)
// ficam fora: são do checklist do padrão e da revisão.
//
// Nada da leitura é reimplementado aqui: a divisão do arquivo em título e
// blocos, a classificação dos blocos, os rótulos de Pontos-Chave/Pérola/Alerta
// e o que sobra como conteúdo vêm do importador (`compendiumMarkdownImport.ts`);
// a divisão em blocos que o leitor exibe e a legenda "Fonte" das tabelas vêm
// de `markdownBlocks.ts`, a mesma usada pelo `SafeMarkdown`. O que a
// importação recusaria vem como erro, com a mensagem dela.
//
// `REGRAS_DO_PADRAO` é a lista única de regras — a 44-C2 a reaplica sobre o
// conteúdo guardado, sem reescrever regra. Regra mecânica nova no padrão entra
// aqui, com teste que passa e teste que falha (AGENTS.md, risco 19).
// ============================================================================

export type RegraDoPadraoId =
  | 'citacao-malformada'
  | 'citacao-sem-referencia'
  | 'referencia-nao-citada'
  | 'tabela-sem-abertura-citada'
  | 'latex'
  | 'comparador-ascii'
  | 'lista-aninhada'
  | 'subtitulo-invalido'
  | 'texto-fora-de-secao'
  | 'bloco-repetido'
  | 'bloco-descartado'
  | 'item-obrigatorio-ausente'
  | 'versao-do-padrao-ausente'
  | 'tempo-fora-da-faixa'
  | 'sem-palavras-chave'
  | 'titulo-numerado'
  | 'remissao-a-outro-material';

export interface PendenciaDoPadrao {
  regra: RegraDoPadraoId;
  /** Título da seção onde está, ou "Cabeçalho" (título e metadados). */
  secao: string;
  /** Linha no arquivo, a partir de 1. */
  linha: number;
  /** O que está errado e como corrigir. */
  mensagem: string;
}

export interface ResultadoDaChecagem {
  /** Mensagens com que a importação recusaria o arquivo. */
  errosDeImportacao: string[];
  pendencias: PendenciaDoPadrao[];
}

export type SituacaoDaChecagem = 'conforme' | 'pendencias' | 'erro';

export function situacaoDaChecagem(r: ResultadoDaChecagem): SituacaoDaChecagem {
  if (r.errosDeImportacao.length > 0) return 'erro';
  return r.pendencias.length > 0 ? 'pendencias' : 'conforme';
}

// --- Modelo do arquivo ------------------------------------------------------

export interface SecaoDeConteudo {
  bloco: MarkdownFileBlock;
  /** Linhas do corpo como estão no arquivo, com o índice original. */
  linhas: Array<{ i: number; linha: string }>;
  /**
   * O que a importação guarda como texto da seção (sem Tag, Pontos-Chave,
   * Pérola e Alerta), linha a linha, com o índice original.
   */
  conteudo: Array<{ i: number; linha: string }>;
}

/** O arquivo lido uma vez; as regras só consultam. */
export interface ArquivoDeMaterial {
  linhas: string[];
  /** Índice da linha `# Título`, ou -1. */
  linhaDoTitulo: number;
  titulo: string;
  /** Índice da primeira linha `### `, ou o total de linhas. */
  inicioDasSecoes: number;
  blocos: MarkdownFileBlock[];
  secoes: SecaoDeConteudo[];
  /** Título da seção de cada linha ("Cabeçalho" antes da primeira). */
  secaoDaLinha: string[];
  /** Bloco de referências que a importação guarda (o último), se houver. */
  blocoDeReferencias?: MarkdownFileBlock;
  /** Bloco de palavras-chave que a importação guarda (o último), se houver. */
  blocoDePalavrasChave?: MarkdownFileBlock;
  referencias: string[];
  /** Números citados em `[N](#ref-N)` no texto das seções. */
  citadas: Set<number>;
}

const CABECALHO = 'Cabeçalho';
const CITACAO_VALIDA = /\[(\d+)\]\(#ref-(\d+)\)/g;

export function lerArquivoDeMaterial(texto: string): ArquivoDeMaterial {
  const layout = readMarkdownLayout(texto);
  const { lines: linhas, blocks: blocos } = layout;
  const inicioDasSecoes = blocos.length > 0 ? blocos[0].headerLine : linhas.length;

  const secaoDaLinha = linhas.map(() => CABECALHO);
  for (const b of blocos) for (let i = b.headerLine; i < b.endLine; i++) secaoDaLinha[i] = b.headerText;

  const secoes: SecaoDeConteudo[] = blocos
    .filter((b) => b.kind === 'content')
    .map((bloco) => {
      const inicio = bloco.headerLine + 1;
      const { contentLines } = extractSectionParts(blockBody(layout, bloco));
      return {
        bloco,
        linhas: linhas.slice(inicio, bloco.endLine).map((linha, k) => ({ i: inicio + k, linha })),
        conteudo: contentLines.map((linha, k) => ({ i: inicio + k, linha })),
      };
    });

  const ultimo = (kind: MarkdownFileBlock['kind']) => blocos.filter((b) => b.kind === kind).pop();
  const blocoDeReferencias = ultimo('references');
  const blocoDePalavrasChave = ultimo('tags');
  const referencias = blocoDeReferencias ? extractNumberedList(blockBody(layout, blocoDeReferencias)) : [];

  const citadas = new Set<number>();
  for (const s of secoes) for (const { linha } of s.linhas) for (const m of linha.matchAll(CITACAO_VALIDA)) citadas.add(Number(m[1]));

  return {
    linhas,
    linhaDoTitulo: layout.titleLine,
    titulo: layout.title,
    inicioDasSecoes,
    blocos,
    secoes,
    secaoDaLinha,
    blocoDeReferencias,
    blocoDePalavrasChave,
    referencias,
    citadas,
  };
}

function trecho(s: string, max = 60): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// --- Regras -----------------------------------------------------------------

export interface RegraDoPadrao {
  id: RegraDoPadraoId;
  /** Resumo da regra, para listagem. */
  descricao: string;
  verificar(arq: ArquivoDeMaterial): PendenciaDoPadrao[];
}

const LISTA = /^\s*([-*•]|\d+\.)\s+\S/;

function pendencia(arq: ArquivoDeMaterial, regra: RegraDoPadraoId, i: number, mensagem: string): PendenciaDoPadrao {
  return { regra, secao: arq.secaoDaLinha[i] ?? CABECALHO, linha: i + 1, mensagem };
}

function* linhasDasSecoes(arq: ArquivoDeMaterial): Generator<{ i: number; linha: string }> {
  for (const s of arq.secoes) yield* s.linhas;
}

// Colchete com números que parece citação sem link: "[12]", "[3, 7]". Não é
// citação: faixa com hífen ("[2-4]"), número 0, lista fora de ordem ("[10, 2]")
// ou colchete depois de "intervalo"/"faixa"/"entre"/"escala" ("intervalo [0, 10]").
const COLCHETE_NUMERICO = /\[(\d+(?:\s*,\s*\d+)*)\](\([^)\]]*[)\]])?/g;
// Palavra inteira: "mortalidade [1]" é citação sem link, não intervalo.
const ANTES_DE_INTERVALO = /\b(intervalo|faixa|entre|escala|de)\s*$/;

function pareceCitacao(numeros: string, antes: string): boolean {
  const ns = numeros.split(',').map((n) => Number(n.trim()));
  if (ns.some((n) => n < 1)) return false;
  if (ns.some((n, k) => k > 0 && n <= ns[k - 1])) return false;
  return !ANTES_DE_INTERVALO.test(normalize(antes));
}

const citacaoMalformada: RegraDoPadrao = {
  id: 'citacao-malformada',
  descricao: 'Citação fora do formato [N](#ref-N)',
  verificar(arq) {
    const out: PendenciaDoPadrao[] = [];
    for (const { i, linha } of linhasDasSecoes(arq)) {
      const problemas: string[] = [];
      // O que sobra depois de tirar as citações bem formadas.
      const resto = linha.replace(CITACAO_VALIDA, (m, n: string, alvo: string) => {
        if (n !== alvo) problemas.push(`"${m}" (o número e o #ref- não batem)`);
        return ' ';
      });
      // Cada trecho apontado sai do texto antes da busca seguinte, para não
      // ser contado duas vezes.
      const semColchetes = resto.replace(COLCHETE_NUMERICO, (m, numeros: string, link: string | undefined, pos: number) => {
        if (link === undefined && !pareceCitacao(numeros, resto.slice(0, pos))) return m;
        problemas.push(`"${m}"`);
        return ' ';
      });
      for (const m of semColchetes.matchAll(/\(#?ref-\d+[\])]?/g)) problemas.push(`"${m[0]}"`);
      if (problemas.length > 0) {
        out.push(
          pendencia(
            arq,
            'citacao-malformada',
            i,
            `Citação malformada: ${problemas.join(', ')}. Escreva cada citação como [N](#ref-N), com N na posição da referência na lista.`
          )
        );
      }
    }
    return out;
  },
};

const citacaoSemReferencia: RegraDoPadrao = {
  id: 'citacao-sem-referencia',
  descricao: 'Citação para referência que não existe na lista',
  verificar(arq) {
    const total = arq.referencias.length;
    const out: PendenciaDoPadrao[] = [];
    for (const { i, linha } of linhasDasSecoes(arq)) {
      const fora = new Set<number>();
      for (const m of linha.matchAll(CITACAO_VALIDA)) {
        for (const n of [Number(m[1]), Number(m[2])]) if (n < 1 || n > total) fora.add(n);
      }
      if (fora.size > 0) {
        const nums = [...fora].sort((a, b) => a - b).join(', ');
        out.push(
          pendencia(
            arq,
            'citacao-sem-referencia',
            i,
            `Citação para referência inexistente (${nums}): a lista tem ${total} referência${total === 1 ? '' : 's'}. Corrija o número ou inclua a referência.`
          )
        );
      }
    }
    return out;
  },
};

const referenciaNaoCitada: RegraDoPadrao = {
  id: 'referencia-nao-citada',
  descricao: 'Referência da lista nunca citada no texto',
  verificar(arq) {
    const bloco = arq.blocoDeReferencias;
    if (!bloco) return [];
    // Linha de cada item numerado da lista, na ordem.
    const linhasDosItens: number[] = [];
    for (let i = bloco.headerLine + 1; i < bloco.endLine; i++) {
      if (/^\d+\.\s+/.test(arq.linhas[i].trim())) linhasDosItens.push(i);
    }
    return linhasDosItens
      .map((i, k) => ({ i, n: k + 1 }))
      .filter(({ n }) => !arq.citadas.has(n))
      .map(({ i, n }) =>
        pendencia(arq, 'referencia-nao-citada', i, `A referência ${n} nunca é citada no texto. Cite-a onde ela sustenta uma afirmação, ou retire-a da lista.`)
      );
  },
};

const tabelaSemAberturaCitada: RegraDoPadrao = {
  id: 'tabela-sem-abertura-citada',
  descricao: 'Tabela sem frase de abertura citada logo acima',
  verificar(arq) {
    const out: PendenciaDoPadrao[] = [];
    for (const secao of arq.secoes) {
      // Exatamente o que o leitor faz com o conteúdo que a importação guarda:
      // mesma divisão em blocos e mesma derivação da legenda "Fonte".
      const blocos = splitReaderBlocks(secao.conteudo.map((c) => c.linha).join('\n'));
      let cursor = 0;
      blocos.forEach((bloco, k) => {
        const primeira = bloco.split('\n').find((l) => l.trim() !== '')?.trim();
        if (primeira === undefined) return;
        const achada = secao.conteudo.findIndex((c, idx) => idx >= cursor && c.linha.trim() === primeira);
        if (achada !== -1) cursor = achada + 1;
        if (!primeira.startsWith('|')) return;
        if (extractTableCitations(blocos[k - 1]).length > 0) return;
        const i = achada === -1 ? secao.bloco.headerLine : secao.conteudo[achada].i;
        out.push(
          pendencia(
            arq,
            'tabela-sem-abertura-citada',
            i,
            'Tabela sem frase de abertura citada: escreva, logo acima dela, uma frase que a apresente terminada pela citação [N](#ref-N), seguida de linha em branco — é ela que vira a legenda "Fonte" da tabela.'
          )
        );
      });
    }
    return out;
  },
};

const latex: RegraDoPadrao = {
  id: 'latex',
  descricao: 'LaTeX no texto',
  verificar(arq) {
    const out: PendenciaDoPadrao[] = [];
    for (let i = 0; i < arq.linhas.length; i++) {
      // "R$ 10 a R$ 20" não é fórmula: o cifrão de moeda sai antes da busca.
      const linha = arq.linhas[i].replace(/(R|US)\$(?=\s?\d)/g, '$1');
      const trechos = [
        ...[...linha.matchAll(/\$\$?[^$\n]+?\$\$?/g)].map((m) => m[0]),
        ...[...linha.replace(/\$\$?[^$\n]+?\$\$?/g, ' ').matchAll(/\\[a-zA-Z]+/g)].map((m) => m[0]),
      ];
      if (trechos.length === 0) continue;
      const lista = trechos.slice(0, 3).map((t) => `"${trecho(t, 40)}"`).join(', ');
      const mais = trechos.length > 3 ? ` e mais ${trechos.length - 3}` : '';
      out.push(
        pendencia(arq, 'latex', i, `LaTeX aparece literal na tela: ${lista}${mais}. Escreva em texto e Unicode (β, ≥, ≤, ×, Cmáx/CIM).`)
      );
    }
    return out;
  },
};

const comparadorAscii: RegraDoPadrao = {
  id: 'comparador-ascii',
  descricao: 'Uso de <= ou >=',
  verificar(arq) {
    const out: PendenciaDoPadrao[] = [];
    arq.linhas.forEach((linha, i) => {
      // Setas ("<=>", "<==", "==>") não são comparador: "≤" as corromperia.
      const semSetas = linha.replace(/<=+>|<==+|==+>/g, ' ');
      if (/<=|>=/.test(semSetas)) {
        out.push(pendencia(arq, 'comparador-ascii', i, 'Troque "<=" por "≤" e ">=" por "≥".'));
      }
    });
    return out;
  },
};

const listaAninhada: RegraDoPadrao = {
  id: 'lista-aninhada',
  descricao: 'Lista dentro de lista',
  verificar(arq) {
    const out: PendenciaDoPadrao[] = [];
    const recuo = (l: string) => (l.match(/^\s*/)?.[0] ?? '').replace(/\t/g, '    ').length;
    for (const secao of arq.secoes) {
      let anteriorELista = false;
      // Recuo do último item de lista: aninhado é o item mais recuado que ele,
      // não qualquer item recuado (uma lista inteira com 2 espaços é um nível só).
      let recuoDoItem = 0;
      for (const { i, linha } of secao.linhas) {
        if (linha.trim() === '') continue;
        const eItem = LISTA.test(linha);
        const aninhado = eItem && anteriorELista && recuo(linha) >= recuoDoItem + 2;
        if (aninhado) {
          out.push(
            pendencia(
              arq,
              'lista-aninhada',
              i,
              'Lista dentro de lista: o leitor não tem recuo de nível. Reescreva como itens do mesmo nível ou como frases dentro do item.'
            )
          );
        }
        if (eItem && !aninhado) recuoDoItem = recuo(linha);
        anteriorELista = eItem || (anteriorELista && /^\s+\S/.test(linha));
      }
    }
    return out;
  },
};

const subtituloInvalido: RegraDoPadrao = {
  id: 'subtitulo-invalido',
  descricao: 'Subtítulo que não é #### dentro da seção',
  verificar(arq) {
    const out: PendenciaDoPadrao[] = [];
    arq.linhas.forEach((linha, i) => {
      if (i === arq.linhaDoTitulo) return;
      const m = linha.trim().match(/^(#{1,2}|#{5,})\s+\S/);
      if (!m) return;
      out.push(
        pendencia(
          arq,
          'subtitulo-invalido',
          i,
          `Subtítulo com ${m[1].length} "#": dentro de uma seção, subtítulo é sempre "####" (e "###" abre uma seção nova).`
        )
      );
    });
    return out;
  },
};

const ROTULOS_DE_METADADO = new Set([...Object.keys(METADATA_LABELS), 'versao do padrao']);

const textoForaDeSecao: RegraDoPadrao = {
  id: 'texto-fora-de-secao',
  descricao: 'Texto antes do título ou entre os metadados e a primeira seção',
  verificar(arq) {
    const out: PendenciaDoPadrao[] = [];
    for (let i = 0; i < arq.inicioDasSecoes; i++) {
      if (i === arq.linhaDoTitulo) continue;
      const t = arq.linhas[i].trim();
      if (t === '' || /^(---+|\*\*\*+)$/.test(t)) continue;
      const m = t.match(/^\*\*([^*:]+):\*\*\s*(.*)$/);
      if (i > arq.linhaDoTitulo && m && ROTULOS_DE_METADADO.has(normalize(m[1]))) continue;
      const onde = i < arq.linhaDoTitulo ? 'antes do título' : 'entre os metadados e a primeira seção';
      const motivo = m && i > arq.linhaDoTitulo ? ` (o rótulo "${m[1]}" não é um metadado do padrão)` : '';
      out.push(
        pendencia(arq, 'texto-fora-de-secao', i, `Texto ${onde}${motivo}: a importação descarta tudo aí. Leve o texto para dentro de uma seção ou apague-o.`)
      );
    }
    return out;
  },
};

const blocoRepetido: RegraDoPadrao = {
  id: 'bloco-repetido',
  descricao: 'Mais de um bloco de Pontos-Chave, Pérola ou Alerta na mesma seção',
  verificar(arq) {
    const out: PendenciaDoPadrao[] = [];
    // Rótulos do próprio importador, e o que acontece com o bloco a mais.
    const tipos: Array<{ nome: string; teste: (t: string) => boolean; efeito: (primeira: number) => string }> = [
      {
        nome: 'Pontos-Chave',
        teste: (t) => TAKEAWAYS_LABEL.test(t),
        efeito: () => 'a importação guarda só o primeiro; este fica no texto como rótulo solto seguido de lista comum',
      },
      {
        nome: 'Pérola Clínica',
        teste: (t) => t.startsWith('>') && PEARL_LABEL.test(blockquoteLabelText(t)),
        efeito: (primeira) => `a importação guarda só o último e o da linha ${primeira} se perde`,
      },
      {
        nome: 'Alerta de Armadilha',
        teste: (t) => t.startsWith('>') && ALERT_LABEL.test(blockquoteLabelText(t)),
        efeito: (primeira) => `a importação guarda só o último e o da linha ${primeira} se perde`,
      },
    ];
    for (const secao of arq.secoes) {
      for (const { nome, teste, efeito } of tipos) {
        let primeira = -1;
        for (const { i, linha } of secao.linhas) {
          if (!teste(linha.trim())) continue;
          if (primeira === -1) {
            primeira = i;
            continue;
          }
          out.push(pendencia(arq, 'bloco-repetido', i, `Mais de um bloco de ${nome} na mesma seção: ${efeito(primeira + 1)}. Junte-os num só.`));
        }
      }
    }
    return out;
  },
};

/** Índice (base 0) da linha de metadado com o rótulo dado, ou -1. */
function linhaDoMetadado(arq: ArquivoDeMaterial, rotuloNormalizado: string): number {
  for (let i = arq.linhaDoTitulo + 1; i < arq.inicioDasSecoes; i++) {
    const m = arq.linhas[i].trim().match(/^\*\*([^*:]+):\*\*\s*(.*)$/);
    if (m && normalize(m[1]) === rotuloNormalizado) return i;
  }
  return -1;
}

/** Linha para apontar pendência do cabeçalho: a última linha de metadado, ou o título. */
function fimDoCabecalho(arq: ArquivoDeMaterial): number {
  let ultima = Math.max(arq.linhaDoTitulo, 0);
  for (let i = arq.linhaDoTitulo + 1; i < arq.inicioDasSecoes; i++) {
    if (/^\*\*[^*:]+:\*\*/.test(arq.linhas[i].trim())) ultima = i;
  }
  return ultima;
}

function metadados(arq: ArquivoDeMaterial) {
  return extractMetadata(arq.linhas.slice(arq.linhaDoTitulo + 1, arq.inicioDasSecoes).join('\n'));
}

const itemObrigatorioAusente: RegraDoPadrao = {
  id: 'item-obrigatorio-ausente',
  descricao: 'Sem subtítulo, sem referências ou sem nenhuma citação',
  verificar(arq) {
    const out: PendenciaDoPadrao[] = [];
    const { subtitle } = metadados(arq);
    if (typeof subtitle !== 'string' || subtitle.trim() === '') {
      out.push(
        pendencia(arq, 'item-obrigatorio-ausente', fimDoCabecalho(arq), 'Falta o subtítulo: escreva "**Subtítulo:** uma frase que resume o material" logo abaixo do título.')
      );
    }
    if (arq.referencias.length === 0) {
      const bloco = arq.blocoDeReferencias;
      out.push(
        pendencia(
          arq,
          'item-obrigatorio-ausente',
          bloco ? bloco.headerLine : arq.linhas.length - 1,
          bloco
            ? 'O bloco de referências não tem nenhuma referência numerada ("1. ...").'
            : 'Falta o bloco "### Referências Bibliográficas", com uma referência por item numerado.'
        )
      );
    }
    if (arq.citadas.size === 0 && arq.secoes.length > 0) {
      out.push(
        pendencia(
          arq,
          'item-obrigatorio-ausente',
          arq.secoes[0].bloco.headerLine,
          'Nenhuma citação no texto: toda afirmação de peso clínico leva [N](#ref-N), com N na posição da referência na lista.'
        )
      );
    }
    return out;
  },
};

const versaoAusente: RegraDoPadrao = {
  id: 'versao-do-padrao-ausente',
  descricao: 'Linha de versão do padrão ausente ou diferente de 2',
  verificar(arq) {
    const i = linhaDoMetadado(arq, 'versao do padrao');
    if (i === -1) {
      return [pendencia(arq, 'versao-do-padrao-ausente', fimDoCabecalho(arq), 'Falta a linha "**Versão do padrão:** 2" nos metadados, logo abaixo do título.')];
    }
    const valor = arq.linhas[i].trim().replace(/^\*\*[^*:]+:\*\*\s*/, '');
    if (valor === '2') return [];
    return [
      pendencia(arq, 'versao-do-padrao-ausente', i, `Versão do padrão "${trecho(valor, 20)}": o valor é sempre 2. Escreva "**Versão do padrão:** 2".`),
    ];
  },
};

const tempoForaDaFaixa: RegraDoPadrao = {
  id: 'tempo-fora-da-faixa',
  descricao: 'Tempo de leitura fora de 8–25 minutos',
  verificar(arq) {
    const minutos = metadados(arq).estimatedReadTimeMinutes;
    const i = linhaDoMetadado(arq, 'tempo estimado de leitura');
    if (typeof minutos === 'number' && minutos >= 8 && minutos <= 25) return [];
    const mensagem =
      typeof minutos === 'number'
        ? `Tempo de leitura de ${minutos} minutos, fora da faixa de 8 a 25: abaixo, o assunto cabe no material de cima; acima, o material deve ser dividido.`
        : 'Tempo de leitura ausente ou sem número: escreva "**Tempo estimado de leitura:** N minutos", com N entre 8 e 25.';
    return [pendencia(arq, 'tempo-fora-da-faixa', i === -1 ? fimDoCabecalho(arq) : i, mensagem)];
  },
};

const semPalavrasChave: RegraDoPadrao = {
  id: 'sem-palavras-chave',
  descricao: 'Sem palavras-chave',
  verificar(arq) {
    const bloco = arq.blocoDePalavrasChave;
    const tags = bloco ? extractBacktickTags(arq.linhas.slice(bloco.headerLine + 1, bloco.endLine).join('\n')) : [];
    if (tags.length > 0) return [];
    return [
      pendencia(
        arq,
        'sem-palavras-chave',
        bloco ? bloco.headerLine : fimDoCabecalho(arq),
        bloco
          ? 'O bloco "### Palavras-chave" não tem nenhuma palavra-chave entre crases (`assim`).'
          : 'Falta o bloco "### Palavras-chave", com sinônimos, siglas e nomes comerciais entre crases.'
      ),
    ];
  },
};

// Numeração de série no título: "3. Carbapenêmicos", "Módulo 2 — ...",
// "Parte II", e o numeral romano logo antes de ":" ou travessão
// ("Antimicrobianos I: Betalactâmicos"). Numeral romano no fim do título ou
// dentro do nome ("MHC classe I e II", "Bloqueio AV Mobitz II", "Nervo
// craniano VII: anatomia", "tipos I a IV") é parte do nome e não conta —
// a regra prefere deixar passar a pedir para mutilar um nome legítimo.
// Sem flag `i`: o numeral romano é maiúsculo ("volume x tempo", "parte v" não
// contam), e o número só conta no fim ou antes de separador ("volume 30 mL/kg"
// não conta; "Módulo 2 — ..." conta).
const NUMERACAO_EXPLICITA = [
  /^\d+[.)]\s/,
  /(?:^|\s)([Mm][oó]dulo|[Pp]arte|[Aa]ula|[Cc]ap[ií]tulo|[Uu]nidade|[Vv]olume)\s+(\d+|[IVXL]+)(?=\s*(?:$|[:—–-]))/,
];
const ROMANO_ANTES_DE_SEPARADOR = /(\S+)\s+([IVX]{1,4})\s*[:—–]/;
const FAZEM_PARTE_DO_NOME = new Set([
  'tipo', 'tipos', 'classe', 'classes', 'grau', 'graus', 'fase', 'fases', 'estagio', 'estadio', 'grupo', 'geracao',
  'nivel', 'fator', 'complexo', 'tabela', 'nyha', 'mobitz', 'craniano', 'cranianos', 'nervo', 'par', 'via', 'e', 'a', 'ou', 'ate',
  'ao', 'o', 'do', 'no', 'raio', 'raios', 'cromossomo', 'ligada', 'ligado',
]);

function tituloTemNumeracao(titulo: string): boolean {
  if (NUMERACAO_EXPLICITA.some((re) => re.test(titulo))) return true;
  const m = titulo.match(ROMANO_ANTES_DE_SEPARADOR);
  return m !== null && !FAZEM_PARTE_DO_NOME.has(normalize(m[1]));
}

const tituloNumerado: RegraDoPadrao = {
  id: 'titulo-numerado',
  descricao: 'Título com numeração',
  verificar(arq) {
    if (arq.linhaDoTitulo === -1) return [];
    if (!tituloTemNumeracao(arq.titulo)) return [];
    return [
      pendencia(
        arq,
        'titulo-numerado',
        arq.linhaDoTitulo,
        `Título com numeração ("${trecho(arq.titulo)}"): a ordem entre materiais é dada pela plataforma. Tire o número do título.`
      ),
    ];
  },
};

// Só remissão a outro material: "seção" e "como vimos acima" podem ser do
// próprio material, e "seguintes materiais" costuma ser material biológico.
const REMISSOES = [
  /\bvej[ae]\s+(o|a|os|as)\s+(material|materiais|modulo|aula|capitulo|pagina)/,
  /\bver\s+(o\s+)?(material|modulo|capitulo)\b/,
  /\b(proxim[oa]s?|anterior(es)?)\s+(material|materiais|modulos?|aulas?|capitulos?|paginas?)\b/,
  /\b(material|materiais|modulos?|aulas?|capitulos?|paginas?)\s+anterior(es)?\b/,
  /\bcomo\s+(ja\s+)?vimos\s+(n[oa]s?|em)\s+(outr[oa]s?\s+)?(material|materiais|modulos?|aulas?|capitulos?)\b/,
];

const remissao: RegraDoPadrao = {
  id: 'remissao-a-outro-material',
  descricao: 'Texto que remete a outro material',
  verificar(arq) {
    const out: PendenciaDoPadrao[] = [];
    for (const { i, linha } of linhasDasSecoes(arq)) {
      const n = normalize(linha);
      const achado = REMISSOES.map((re) => n.match(re)).find(Boolean);
      if (!achado) continue;
      out.push(
        pendencia(
          arq,
          'remissao-a-outro-material',
          i,
          `Remissão a outro material ("${achado[0]}"): quem liga os materiais é a plataforma. Mencione o assunto sem remeter a página, material ou módulo.`
        )
      );
    }
    return out;
  },
};

/** Título que é mesmo o de uma bibliografia ("Referências", "Referências Bibliográficas"). */
function eBibliografia(b: MarkdownFileBlock): boolean {
  // Numeração antes do título ("Seção 9 — ", "7. ") não muda o que o bloco é.
  const semNumero = b.headerText.replace(SECTION_NUMBER_PREFIX, '').replace(/^\d+[.)]\s*/, '');
  return /^referencias?\b/.test(normalize(semNumero));
}

const blocoDescartado: RegraDoPadrao = {
  id: 'bloco-descartado',
  descricao: 'Seção que a importação descarta (conexões, referências ou palavras-chave repetidas)',
  verificar(arq) {
    const out: PendenciaDoPadrao[] = [];
    const bibliografias = arq.blocos.filter((b) => b.kind === 'references' && eBibliografia(b));
    const bibliografia = bibliografias[bibliografias.length - 1];
    for (const b of arq.blocos) {
      let motivo: string | undefined;
      if (b.kind === 'dependencies') {
        motivo = 'o título tem "conexão" ou "pré-requisito", e a importação descarta essa seção inteira — o padrão não usa bloco de conexões';
      } else if (b.kind === 'references' && !eBibliografia(b)) {
        // Seção de conteúdo com "referência" no título: some do conteúdo e,
        // se for a última, substitui a lista de referências verdadeira.
        const substitui = b === arq.blocoDeReferencias && bibliografia !== undefined;
        motivo = `o título tem "referência", e a importação a lê como lista de referências${
          substitui ? `, no lugar da bibliografia da linha ${bibliografia.headerLine + 1}` : ''
        }. Se for conteúdo, tire "referência" do título`;
      } else if (b.kind === 'references' && b !== bibliografia) {
        motivo = 'a importação guarda só a última lista de referências — esta se perde. Junte as listas numa só';
      } else if (b.kind === 'tags' && b !== arq.blocoDePalavrasChave) {
        motivo = 'a importação guarda só o último bloco de palavras-chave — este se perde. Junte-os num só';
      }
      if (motivo) out.push(pendencia(arq, 'bloco-descartado', b.headerLine, `Seção "${trecho(b.headerText, 40)}" some na importação: ${motivo}.`));
    }
    return out;
  },
};

export const REGRAS_DO_PADRAO: readonly RegraDoPadrao[] = [
  blocoDescartado,
  itemObrigatorioAusente,
  textoForaDeSecao,
  versaoAusente,
  tempoForaDaFaixa,
  tituloNumerado,
  subtituloInvalido,
  citacaoMalformada,
  citacaoSemReferencia,
  referenciaNaoCitada,
  tabelaSemAberturaCitada,
  latex,
  comparadorAscii,
  listaAninhada,
  blocoRepetido,
  remissao,
  semPalavrasChave,
];

// --- Entrada ----------------------------------------------------------------

export function checarMaterialMarkdown(texto: string): ResultadoDaChecagem {
  // Recusa da importação: o mesmo parser do botão "Importar material". O
  // catálogo vazio não gera erro (disciplina/tema desconhecidos são avisos).
  const importacao = parseCompendiumMarkdownText(texto, [], [], []);
  const errosDeImportacao = importacao.ok ? [] : importacao.errors;

  const arq = lerArquivoDeMaterial(texto);
  const pendencias = REGRAS_DO_PADRAO.flatMap((r) => r.verificar(arq)).sort((a, b) => a.linha - b.linha);
  return { errosDeImportacao, pendencias };
}

export function formatarResumoDaChecagem(nome: string, r: ResultadoDaChecagem): string {
  const situacao = situacaoDaChecagem(r);
  if (situacao === 'erro') return `${nome}: ERRO — a importação recusaria (${r.errosDeImportacao.join(' ')})`;
  if (situacao === 'conforme') return `${nome}: Conforme`;
  const n = r.pendencias.length;
  return `${nome}: ${n} pendência${n === 1 ? '' : 's'}`;
}

export function formatarChecagemDetalhada(nome: string, r: ResultadoDaChecagem): string {
  const linhas = [formatarResumoDaChecagem(nome, r)];
  for (const e of r.errosDeImportacao) linhas.push(`  ERRO: ${e}`);
  for (const p of r.pendencias) linhas.push(`  linha ${p.linha} · ${p.secao} · ${p.mensagem}`);
  return linhas.join('\n');
}
