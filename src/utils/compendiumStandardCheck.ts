import {
  extractBacktickTags,
  extractMetadata,
  extractNumberedList,
  isDependenciesHeader,
  isReferencesHeader,
  isTagsHeader,
  METADATA_LABELS,
  normalize,
  parseCompendiumMarkdownText,
} from './compendiumMarkdownImport';

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
// O arquivo é lido pelo mesmo caminho da importação: o título é a primeira
// linha `# `, cada linha `### ` abre um bloco, e os blocos de palavras-chave,
// referências e conexões são reconhecidos pelos mesmos predicados do
// importador. O que a importação recusaria vem como erro, com a mensagem dela.
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

export type TipoDeBloco = 'conteudo' | 'palavras-chave' | 'referencias' | 'conexoes';

export interface BlocoDoArquivo {
  titulo: string;
  tipo: TipoDeBloco;
  /** Índice (base 0) da linha `### `. */
  inicio: number;
  /** Índice (base 0) da primeira linha depois do bloco. */
  fim: number;
}

export interface ArquivoDeMaterial {
  linhas: string[];
  /** Índice da linha `# Título`, ou -1. */
  linhaDoTitulo: number;
  titulo: string;
  /** Índice da primeira linha `### `, ou o total de linhas. */
  inicioDasSecoes: number;
  blocos: BlocoDoArquivo[];
}

const CABECALHO = 'Cabeçalho';

export function lerArquivoDeMaterial(texto: string): ArquivoDeMaterial {
  const linhas = texto.split(/\r\n|\n/);
  // Mesmos critérios de `extractTitle` e `splitByH3` no importador.
  const linhaDoTitulo = linhas.findIndex((l) => /^#\s+.+/.test(l.trim()));
  const titulo = linhaDoTitulo === -1 ? '' : linhas[linhaDoTitulo].trim().replace(/^#\s+/, '').trim();
  const inicios: number[] = [];
  linhas.forEach((l, i) => {
    if (i > linhaDoTitulo && /^###\s+.+/.test(l.trim())) inicios.push(i);
  });
  const blocos = inicios.map((inicio, k): BlocoDoArquivo => {
    const tituloDoBloco = linhas[inicio].trim().replace(/^###\s+/, '').trim();
    const n = normalize(tituloDoBloco);
    const tipo: TipoDeBloco = isReferencesHeader(n)
      ? 'referencias'
      : isTagsHeader(n)
        ? 'palavras-chave'
        : isDependenciesHeader(n)
          ? 'conexoes'
          : 'conteudo';
    return { titulo: tituloDoBloco, tipo, inicio, fim: k + 1 < inicios.length ? inicios[k + 1] : linhas.length };
  });
  return {
    linhas,
    linhaDoTitulo,
    titulo,
    inicioDasSecoes: inicios.length > 0 ? inicios[0] : linhas.length,
    blocos,
  };
}

/** Linhas do corpo de cada seção de conteúdo, com o índice original. */
function linhasDeConteudo(arq: ArquivoDeMaterial): Array<{ bloco: BlocoDoArquivo; i: number; linha: string }> {
  const out: Array<{ bloco: BlocoDoArquivo; i: number; linha: string }> = [];
  for (const bloco of arq.blocos) {
    if (bloco.tipo !== 'conteudo') continue;
    for (let i = bloco.inicio + 1; i < bloco.fim; i++) out.push({ bloco, i, linha: arq.linhas[i] });
  }
  return out;
}

function secaoDaLinha(arq: ArquivoDeMaterial, i: number): string {
  const bloco = arq.blocos.find((b) => i >= b.inicio && i < b.fim);
  return bloco ? bloco.titulo : CABECALHO;
}

function referencias(arq: ArquivoDeMaterial): string[] {
  const bloco = arq.blocos.find((b) => b.tipo === 'referencias');
  if (!bloco) return [];
  return extractNumberedList(arq.linhas.slice(bloco.inicio + 1, bloco.fim).join('\n'));
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

const CITACAO_VALIDA = /\[(\d+)\]\(#ref-(\d+)\)/g;
const LISTA = /^\s*([-*•]|\d+\.)\s+\S/;

function pendencia(
  arq: ArquivoDeMaterial,
  regra: RegraDoPadraoId,
  i: number,
  mensagem: string
): PendenciaDoPadrao {
  return { regra, secao: secaoDaLinha(arq, i), linha: i + 1, mensagem };
}

const citacaoMalformada: RegraDoPadrao = {
  id: 'citacao-malformada',
  descricao: 'Citação fora do formato [N](#ref-N)',
  verificar(arq) {
    const out: PendenciaDoPadrao[] = [];
    for (const { i, linha } of linhasDeConteudo(arq)) {
      const problemas: string[] = [];
      // O que sobra depois de tirar as citações bem formadas.
      const resto = linha.replace(CITACAO_VALIDA, (m, n: string, alvo: string) => {
        if (n !== alvo) problemas.push(`"${m}" (o número e o #ref- não batem)`);
        return ' ';
      });
      for (const m of resto.matchAll(/\[\d+(?:\s*[,–-]\s*\d+)*\](?:\([^)\]]*[)\]])?/g)) {
        problemas.push(`"${m[0]}"`);
      }
      for (const m of resto.matchAll(/\(#?ref-\d+[\])]?/g)) {
        if (!problemas.some((p) => p.includes(m[0]))) problemas.push(`"${m[0]}"`);
      }
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
    const total = referencias(arq).length;
    const out: PendenciaDoPadrao[] = [];
    for (const { i, linha } of linhasDeConteudo(arq)) {
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
    const bloco = arq.blocos.find((b) => b.tipo === 'referencias');
    if (!bloco) return [];
    const citadas = new Set<number>();
    for (const { linha } of linhasDeConteudo(arq)) {
      for (const m of linha.matchAll(CITACAO_VALIDA)) citadas.add(Number(m[1]));
    }
    // Linha de cada item numerado da lista, na ordem.
    const linhasDosItens: number[] = [];
    for (let i = bloco.inicio + 1; i < bloco.fim; i++) {
      if (/^\d+\.\s+/.test(arq.linhas[i].trim())) linhasDosItens.push(i);
    }
    return linhasDosItens
      .map((i, k) => ({ i, n: k + 1 }))
      .filter(({ n }) => !citadas.has(n))
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
    const eTabela = (l: string | undefined) => l !== undefined && /^\|.*\|\s*$/.test(l.trim());
    for (const bloco of arq.blocos) {
      if (bloco.tipo !== 'conteudo') continue;
      for (let i = bloco.inicio + 1; i < bloco.fim; i++) {
        if (!eTabela(arq.linhas[i]) || eTabela(arq.linhas[i - 1])) continue;
        // Mesmo critério da legenda "Fonte: [N]" do leitor: o bloco logo acima
        // da tabela precisa ser parágrafo comum com ao menos uma citação.
        let j = i - 1;
        while (j > bloco.inicio && arq.linhas[j].trim() === '') j--;
        const paragrafo: string[] = [];
        while (j > bloco.inicio && arq.linhas[j].trim() !== '') {
          const t = arq.linhas[j].trim();
          if (/^[#|>]/.test(t) || LISTA.test(arq.linhas[j]) || /^\*\*[^*]+:\*\*\s*$/.test(t)) break;
          paragrafo.unshift(t);
          j--;
        }
        const ultimaAcima = arq.linhas.slice(bloco.inicio + 1, i).reverse().find((l) => l.trim() !== '');
        const paragrafoLogoAcima = ultimaAcima !== undefined && paragrafo.length > 0 && paragrafo[paragrafo.length - 1] === ultimaAcima.trim();
        if (!paragrafoLogoAcima || !/\[\d+\]\(#ref-\d+\)/.test(paragrafo.join(' '))) {
          out.push(
            pendencia(
              arq,
              'tabela-sem-abertura-citada',
              i,
              'Tabela sem frase de abertura citada: escreva, logo acima dela, uma frase que a apresente terminada pela citação [N](#ref-N), seguida de linha em branco — é ela que vira a legenda "Fonte" da tabela.'
            )
          );
        }
      }
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
      const linha = arq.linhas[i];
      const trechos = [
        ...[...linha.matchAll(/\$\$?[^$\n]+?\$\$?/g)].map((m) => m[0]),
        ...[...linha.replace(/\$\$?[^$\n]+?\$\$?/g, ' ').matchAll(/\\[a-zA-Z]+/g)].map((m) => m[0]),
      ];
      if (trechos.length === 0) continue;
      const lista = trechos.slice(0, 3).map((t) => `"${trecho(t, 40)}"`).join(', ');
      const mais = trechos.length > 3 ? ` e mais ${trechos.length - 3}` : '';
      out.push(
        pendencia(
          arq,
          'latex',
          i,
          `LaTeX aparece literal na tela: ${lista}${mais}. Escreva em texto e Unicode (β, ≥, ≤, ×, Cmáx/CIM).`
        )
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
      if (/<=|>=/.test(linha)) {
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
    let anteriorELista = false;
    let blocoAnterior: BlocoDoArquivo | undefined;
    for (const { bloco, i, linha } of linhasDeConteudo(arq)) {
      if (bloco !== blocoAnterior) {
        anteriorELista = false;
        blocoAnterior = bloco;
      }
      if (linha.trim() === '') continue;
      const recuada = /^(\s{2,}|\t)([-*•]|\d+\.)\s+\S/.test(linha);
      if (recuada && anteriorELista) {
        out.push(
          pendencia(
            arq,
            'lista-aninhada',
            i,
            'Lista dentro de lista: o leitor não tem recuo de nível. Reescreva como itens do mesmo nível ou como frases dentro do item.'
          )
        );
      }
      anteriorELista = LISTA.test(linha) || (anteriorELista && /^\s+\S/.test(linha));
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
    const tipos: Array<{ nome: string; teste: (t: string) => boolean }> = [
      { nome: 'Pontos-Chave', teste: (t) => /^\*\*Pontos-?Chave:?\*\*\s*$/i.test(t) },
      // Mesmo reconhecimento de rótulo do importador: citação `> ` com emoji opcional.
      { nome: 'Pérola Clínica', teste: (t) => /^>/.test(t) && /^\*\*P[eé]rola Cl[ií]nica/i.test(t.replace(/^>\s?/, '').replace(/^[^\w*]*/u, '')) },
      { nome: 'Alerta de Armadilha', teste: (t) => /^>/.test(t) && /^\*\*Alerta/i.test(t.replace(/^>\s?/, '').replace(/^[^\w*]*/u, '')) },
    ];
    for (const bloco of arq.blocos) {
      if (bloco.tipo !== 'conteudo') continue;
      for (const { nome, teste } of tipos) {
        let vistos = 0;
        for (let i = bloco.inicio + 1; i < bloco.fim; i++) {
          if (!teste(arq.linhas[i].trim())) continue;
          vistos++;
          if (vistos === 2) {
            out.push(
              pendencia(
                arq,
                'bloco-repetido',
                i,
                `Segundo bloco de ${nome} na mesma seção: a importação guarda só um e o outro se perde. Junte os dois num só.`
              )
            );
          }
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

const versaoAusente: RegraDoPadrao = {
  id: 'versao-do-padrao-ausente',
  descricao: 'Linha de versão do padrão ausente',
  verificar(arq) {
    if (linhaDoMetadado(arq, 'versao do padrao') !== -1) return [];
    return [
      pendencia(
        arq,
        'versao-do-padrao-ausente',
        fimDoCabecalho(arq),
        'Falta a linha "**Versão do padrão:** 2" nos metadados, logo abaixo do título.'
      ),
    ];
  },
};

const tempoForaDaFaixa: RegraDoPadrao = {
  id: 'tempo-fora-da-faixa',
  descricao: 'Tempo de leitura fora de 8–25 minutos',
  verificar(arq) {
    const cabecalho = arq.linhas.slice(arq.linhaDoTitulo + 1, arq.inicioDasSecoes).join('\n');
    const minutos = extractMetadata(cabecalho).estimatedReadTimeMinutes;
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
    const bloco = arq.blocos.find((b) => b.tipo === 'palavras-chave');
    const tags = bloco ? extractBacktickTags(arq.linhas.slice(bloco.inicio + 1, bloco.fim).join('\n')) : [];
    if (tags.length > 0) return [];
    return [
      pendencia(
        arq,
        'sem-palavras-chave',
        bloco ? bloco.inicio : fimDoCabecalho(arq),
        bloco
          ? 'O bloco "### Palavras-chave" não tem nenhuma palavra-chave entre crases (`assim`).'
          : 'Falta o bloco "### Palavras-chave", com sinônimos, siglas e nomes comerciais entre crases.'
      ),
    ];
  },
};

// Numeração no título: número no início, "Módulo 2"/"Parte II"..., ou numeral
// romano solto no fim ou antes de ":"/"—" ("Antimicrobianos I: ...") — exceto
// quando qualifica o termo anterior ("Hipersensibilidade tipo I").
const NUMERACAO_EXPLICITA = [/^\d+[.)]?\s/, /(?:^|\s)(m[oó]dulo|parte|aula|cap[ií]tulo|unidade|volume)\s+(\d+|[IVXL]+)(?=$|[\s:—–-])/i];
const ROMANO_SOLTO = /(\S+)\s+([IVX]{1,4})(?=\s*[:—–-]|\s*$)/g;
const QUALIFICAM_NUMERAL = new Set(['tipo', 'tipos', 'classe', 'classes', 'grau', 'fase', 'estagio', 'estadio', 'grupo', 'geracao', 'nivel', 'fator', 'complexo', 'tabela']);

function tituloTemNumeracao(titulo: string): boolean {
  if (NUMERACAO_EXPLICITA.some((re) => re.test(titulo))) return true;
  return [...titulo.matchAll(ROMANO_SOLTO)].some((m) => !QUALIFICAM_NUMERAL.has(normalize(m[1])));
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

const REMISSOES = [
  /\bvej[ae]\s+(o|a|os|as)\s+(material|materiais|modulo|aula|capitulo|secao|pagina)/,
  /\bver\s+(o\s+)?(material|modulo|capitulo)\b/,
  /\b(proxim[oa]s?|anterior(es)?|seguintes?)\s+(material|materiais|modulos?|aulas?|capitulos?|paginas?)\b/,
  /\b(material|materiais|modulos?|aulas?|capitulos?|paginas?)\s+(anterior(es)?|seguintes?)\b/,
  /\bcomo\s+(ja\s+)?vimos\b/,
];

const remissao: RegraDoPadrao = {
  id: 'remissao-a-outro-material',
  descricao: 'Texto que remete a outro material',
  verificar(arq) {
    const out: PendenciaDoPadrao[] = [];
    for (const { i, linha } of linhasDeConteudo(arq)) {
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

export const REGRAS_DO_PADRAO: readonly RegraDoPadrao[] = [
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
