import {
  DEFAULT_CYCLE,
  DEFAULT_DIFFICULTY,
  DEFAULT_GENERAL_COMMENTARY,
  DEFAULT_HIGH_YIELD_SUMMARY,
  DEFAULT_TAGS,
  type QuestionImportPreview,
} from './questionsImport';
import { ehQuestaoDeResidencia } from './questoesDeResidencia';

// ============================================================================
// IMPORT-2 (D-14) — "Colar o texto da prova": lê o texto de uma prova de
// residência como sai de um PDF (copiado e colado) e separa questão por
// questão: enunciado, alternativas e gabarito. Função pura, sem React nem
// banco. O resultado vira o mesmo `QuestionImportPreview` do import por
// arquivo `.md`, então a prévia e a gravação (RPC `import_question_draft`) são
// as que já existem.
//
// Formatos aceitos (detalhe e exemplos em
// docs/editorial/PADRAO-NEXUSMED-QUESTOES.md, "Colar o texto da prova"):
// - início de questão, no começo da linha: "1.", "1)", "01 -", "Questão 1",
//   "QUESTÃO 01";
// - alternativas, no começo da linha, de A em diante e em sequência, sem teto:
//   "A)", "A.", "(A)", "a)", "A -";
// - gabarito por questão ("Resposta: B", "Gabarito: B", "Alternativa correta:
//   B") ou em bloco no fim ("Gabarito" e pares "1-B", "1 B", "1) B", "01. B");
// - anulada no gabarito ("ANULADA", "*", "X"): marcada, não importa;
// - "Comentário:" opcional, até a próxima questão.
// ============================================================================

export interface AlternativaDaProva {
  letter: string;
  text: string;
}

export interface QuestaoDaProva {
  /** Número como está escrito na prova (pode repetir ou pular). */
  numero: number;
  enunciado: string;
  alternativas: AlternativaDaProva[];
  /** Letra do gabarito (maiúscula); null se a questão não tem gabarito ou foi anulada. */
  gabarito: string | null;
  anulada: boolean;
  comentario: string;
  /** Impedem a gravação desta questão. */
  erros: string[];
}

export interface ProvaLida {
  questoes: QuestaoDaProva[];
  /** Avisos do lote inteiro: numeração pulada ou repetida, gabarito que cita questão inexistente etc. */
  avisos: string[];
}

export type ResultadoDaProva = ({ ok: true } & ProvaLida) | { ok: false; errors: string[] };

const ANULADA = 'ANULADA';

// "Questão 1", "QUESTÃO 01", "Questão 1 -", "Questão 1." (o resto da linha é o começo do enunciado).
const INICIO_COM_PALAVRA = /^quest(?:ã|a)o\s+(\d{1,3})\b[\s.:)\-–—]*(.*)$/i;
// "1.", "1)", "01 -": o ponto exige espaço depois (para "37.5 mg" não virar questão 37).
const INICIO_NUMERICO = /^(\d{1,3})(?:\s*\)\s*|\.(?:\s+|$)|\s+[-–—]\s*)(.*)$/;

// "A)", "(A)", "a)", "A.", "A -". O ponto e o hífen exigem espaço depois ("E. coli" só vale se for a próxima letra).
const ALTERNATIVA = /^(?:\(([A-Za-z])\)\s*|([A-Za-z])\s*\)\s*|([A-Za-z])\.(?:\s+|$)|([A-Za-z])\s+[-–—]\s*)(.*)$/;

const COMENTARIO = /^coment(?:á|a)rio\s*:\s*(.*)$/i;

// "Resposta: B", "Gabarito: B", "Alternativa correta: B", "Resposta correta: (B)", "Gabarito: ANULADA".
const GABARITO_DA_QUESTAO =
  /^(?:resposta(?:\s+correta)?|gabarito(?:\s+oficial)?|alternativa\s+correta)\s*[:\-–]\s*(?:alternativa\s+)?\(?(anulad[ao]|[A-Za-z*])\)?(?:\s*[).\-–—:,;].*)?$/i;

// "Gabarito", "GABARITO OFICIAL:", "Respostas" e, na mesma linha, os primeiros pares.
const CABECALHO_DO_BLOCO = /^(?:gabarito(?:\s+(?:oficial|final|preliminar|definitivo))?|respostas)\s*:?\s*(.*)$/i;

// Um par do bloco: "1-B", "1 B", "1) B", "01. B", "7 ANULADA", "5 - *".
const PAR_DO_GABARITO = /(?<![\d.])(\d{1,3})\s*[-–—.):=]?\s*(anulad[ao]|[A-Za-z*])(?![A-Za-z0-9*])/gi;

function ehAnulada(token: string): boolean {
  const t = token.toUpperCase();
  return t === '*' || t === 'X' || t.startsWith('ANULAD');
}

/** Parágrafos: linhas seguidas se juntam por espaço; linha em branco abre outro parágrafo. */
class Paragrafos {
  private pars: string[] = [];
  private novo = false;

  adicionar(texto: string): void {
    if (this.pars.length === 0 || this.novo) {
      this.pars.push(texto);
      this.novo = false;
    } else {
      this.pars[this.pars.length - 1] += ` ${texto}`;
    }
  }

  quebra(): void {
    this.novo = true;
  }

  texto(): string {
    return this.pars.join('\n\n');
  }
}

interface Rascunho {
  numero: number;
  enunciado: Paragrafos;
  alternativas: AlternativaDaProva[];
  comentario: Paragrafos;
  fase: 'enunciado' | 'alternativas' | 'comentario';
  gabaritoDaQuestao: string | null; // letra ou ANULADA
  gabaritoDoBloco: string | null;
}

function novoRascunho(numero: number): Rascunho {
  return {
    numero,
    enunciado: new Paragrafos(),
    alternativas: [],
    comentario: new Paragrafos(),
    fase: 'enunciado',
    gabaritoDaQuestao: null,
    gabaritoDoBloco: null,
  };
}

function proximaLetra(alternativas: AlternativaDaProva[]): string {
  if (alternativas.length === 0) return 'A';
  return String.fromCharCode(alternativas[alternativas.length - 1].letter.charCodeAt(0) + 1);
}

function lerAlternativa(linha: string): { letter: string; texto: string } | null {
  const m = linha.match(ALTERNATIVA);
  if (!m) return null;
  const letter = (m[1] ?? m[2] ?? m[3] ?? m[4]).toUpperCase();
  return { letter, texto: m[5].trim() };
}

function lerPares(texto: string): Array<{ numero: number; token: string }> {
  return Array.from(texto.matchAll(PAR_DO_GABARITO), (m) => ({ numero: parseInt(m[1], 10), token: m[2] }));
}

function listaDeFaltantes(de: number, ate: number): string {
  const total = ate - de + 1;
  if (total <= 3) return Array.from({ length: total }, (_, i) => de + i).join(', ');
  return `${de} a ${ate}`;
}

function avisosDeNumeracao(numeros: number[]): string[] {
  const avisos: string[] = [];
  const vistos = new Set<number>();
  const repetidos = new Set<number>();
  numeros.forEach((n, i) => {
    if (vistos.has(n)) {
      if (!repetidos.has(n)) {
        repetidos.add(n);
        avisos.push(`Numeração repetida: a questão ${n} aparece mais de uma vez.`);
      }
    } else if (i > 0) {
      const anterior = numeros[i - 1];
      if (n > anterior + 1) {
        avisos.push(`Numeração pulada: depois da questão ${anterior} vem a ${n} (faltam ${listaDeFaltantes(anterior + 1, n - 1)}).`);
      } else if (n < anterior) {
        avisos.push(`Numeração fora de ordem: a questão ${n} vem depois da ${anterior}.`);
      }
    }
    vistos.add(n);
  });
  return avisos;
}

/** Lê o texto colado de uma prova. Só lê: banca, ano e disciplina vêm depois. */
export function lerProvaEmTexto(texto: string): ResultadoDaProva {
  const linhas = texto.replace(/\u00a0/g, ' ').split(/\r\n|\n|\r/);
  const rascunhos: Rascunho[] = [];
  const avisos: string[] = [];
  const linhasDoBloco: string[] = [];
  let atual: Rascunho | null = null;
  let noBloco = false;

  const abrirQuestao = (numero: number, resto: string): Rascunho => {
    const nova = novoRascunho(numero);
    rascunhos.push(nova);
    if (resto) nova.enunciado.adicionar(resto);
    return nova;
  };

  for (const bruta of linhas) {
    const linha = bruta.trim();

    if (noBloco) {
      if (linha) linhasDoBloco.push(linha);
      continue;
    }

    if (linha === '') {
      if (atual?.fase === 'enunciado') atual.enunciado.quebra();
      else if (atual?.fase === 'comentario') atual.comentario.quebra();
      continue;
    }

    // Bloco de gabarito no fim: "Gabarito" sozinho ou seguido de pares. "Gabarito: B" é de uma questão só.
    const cabecalho = linha.match(CABECALHO_DO_BLOCO);
    if (cabecalho && atual && (cabecalho[1].trim() === '' || lerPares(cabecalho[1]).length > 0)) {
      noBloco = true;
      if (cabecalho[1].trim()) linhasDoBloco.push(cabecalho[1].trim());
      continue;
    }

    // Início de questão.
    const porPalavra = linha.match(INICIO_COM_PALAVRA);
    const porNumero = porPalavra ? null : linha.match(INICIO_NUMERICO);
    if (porPalavra) {
      atual = abrirQuestao(parseInt(porPalavra[1], 10), porPalavra[2].trim());
      continue;
    }
    if (porNumero) {
      const numero = parseInt(porNumero[1], 10);
      const anterior: Rascunho | null = atual;
      // Dentro do enunciado, um número fora da sequência é item de lista do próprio enunciado ("1. Fumo").
      const itemDeLista = anterior !== null && anterior.fase === 'enunciado' && anterior.alternativas.length === 0 && numero !== anterior.numero + 1;
      if (!itemDeLista) {
        atual = abrirQuestao(numero, porNumero[2].trim());
        continue;
      }
    }

    if (!atual) continue; // título, instruções: antes da primeira questão não há o que ler
    const q: Rascunho = atual;

    const gabarito = linha.match(GABARITO_DA_QUESTAO);
    if (gabarito) {
      q.gabaritoDaQuestao = ehAnulada(gabarito[1]) ? ANULADA : gabarito[1].toUpperCase();
      continue;
    }

    const comentario = linha.match(COMENTARIO);
    if (comentario) {
      q.fase = 'comentario';
      if (comentario[1].trim()) q.comentario.adicionar(comentario[1].trim());
      continue;
    }

    if (q.fase !== 'comentario') {
      const alternativa = lerAlternativa(linha);
      if (alternativa && alternativa.letter === proximaLetra(q.alternativas)) {
        q.fase = 'alternativas';
        q.alternativas.push({ letter: alternativa.letter, text: alternativa.texto });
        continue;
      }
    }

    // Continuação (quebra de linha do PDF).
    if (q.fase === 'enunciado') q.enunciado.adicionar(linha);
    else if (q.fase === 'comentario') q.comentario.adicionar(linha);
    else {
      const ultima = q.alternativas[q.alternativas.length - 1];
      ultima.text = ultima.text ? `${ultima.text} ${linha}` : linha;
    }
  }

  if (rascunhos.length === 0) {
    return {
      ok: false,
      errors: [
        'Nenhuma questão encontrada no texto. Cada questão precisa começar numa linha nova com o número ("1.", "1)", "01 -") ou com "Questão 1".',
      ],
    };
  }

  // Gabarito em bloco: cada par vale para a primeira questão com aquele número que ainda não recebeu.
  for (const linha of linhasDoBloco) {
    const pares = lerPares(linha);
    const sobra = linha.replace(PAR_DO_GABARITO, ' ').replace(/[\s,;|]+/g, '');
    if (sobra !== '') avisos.push(`Linha do gabarito não entendida: "${linha}".`);
    for (const par of pares) {
      const alvo = rascunhos.find((r) => r.numero === par.numero && r.gabaritoDoBloco === null);
      if (!alvo) {
        avisos.push(`O gabarito cita a questão ${par.numero}, que não está na prova (ou já tem gabarito).`);
        continue;
      }
      alvo.gabaritoDoBloco = ehAnulada(par.token) ? ANULADA : par.token.toUpperCase();
    }
  }

  avisos.unshift(...avisosDeNumeracao(rascunhos.map((r) => r.numero)));

  const questoes = rascunhos.map((r): QuestaoDaProva => {
    const erros: string[] = [];
    const enunciado = r.enunciado.texto();
    if (!enunciado) erros.push('Enunciado vazio.');
    if (r.alternativas.length < 2) {
      erros.push(`Menos de 2 alternativas (encontradas: ${r.alternativas.length}).`);
    }
    for (const a of r.alternativas) {
      if (!a.text.trim()) erros.push(`Alternativa ${a.letter} sem texto.`);
    }

    const bruto = r.gabaritoDaQuestao ?? r.gabaritoDoBloco;
    if (r.gabaritoDaQuestao && r.gabaritoDoBloco && r.gabaritoDaQuestao !== r.gabaritoDoBloco) {
      avisos.push(
        `Questão ${r.numero}: o gabarito da questão (${r.gabaritoDaQuestao}) difere do bloco do fim (${r.gabaritoDoBloco}); valeu o da questão.`
      );
    }
    const anulada = bruto === ANULADA;
    let gabarito: string | null = null;
    if (anulada) {
      erros.push('Anulada no gabarito — não é importada.');
    } else if (!bruto) {
      erros.push('Sem gabarito.');
    } else if (!r.alternativas.some((a) => a.letter === bruto)) {
      erros.push(`Gabarito "${bruto}" não é uma das alternativas desta questão.`);
    } else {
      gabarito = bruto;
    }

    return {
      numero: r.numero,
      enunciado,
      alternativas: r.alternativas,
      gabarito,
      anulada,
      comentario: r.comentario.texto(),
      erros,
    };
  });

  return { ok: true, questoes, avisos };
}

/** O texto colado já está no formato `.md` do import por arquivo (blocos "## Questão N")? */
export function textoEhMarkdownDeQuestoes(texto: string): boolean {
  return /^##\s+\S/m.test(texto);
}

// ---------------------------------------------------------------------------
// Banca e ano do lote
// ---------------------------------------------------------------------------

export type LoteDaProva = { ok: true; institution: string; year: number } | { ok: false; motivos: string[] };

/**
 * Banca e ano valem para o lote inteiro e são obrigatórios. A regra de
 * "residência" é a única (`ehQuestaoDeResidencia`): banca que começa com
 * "NexusMed" é questão autoral e some das telas de estudo, então é recusada.
 */
export function validarLoteDaProva(banca: string, anoTexto: string, anoAtual: number = new Date().getFullYear()): LoteDaProva {
  const institution = banca.trim().replace(/\s+/g, ' ');
  const motivos: string[] = [];
  if (!institution) {
    motivos.push('Informe a banca / instituição da prova.');
  } else if (institution.toLowerCase().startsWith('nexusmed')) {
    motivos.push('A banca não pode começar com "NexusMed": questão autoral não é questão de residência.');
  }
  const anoLimpo = anoTexto.trim();
  const year = /^\d{4}$/.test(anoLimpo) ? parseInt(anoLimpo, 10) : 0;
  if (!year || year < 1950 || year > anoAtual) {
    motivos.push(`Informe o ano da prova com 4 dígitos (de 1950 a ${anoAtual}).`);
  }
  if (motivos.length === 0 && !ehQuestaoDeResidencia({ institution, year }, anoAtual)) {
    motivos.push('Banca e ano não formam uma questão de residência.');
  }
  return motivos.length > 0 ? { ok: false, motivos } : { ok: true, institution, year };
}

// ---------------------------------------------------------------------------
// Da prova lida para a prévia (mesma forma do import por arquivo)
// ---------------------------------------------------------------------------

export function previewsDaProva(questoes: QuestaoDaProva[], institution: string, year: number): QuestionImportPreview[] {
  return questoes.map((q) => ({
    index: q.numero,
    disciplineName: '',
    themeName: '',
    disciplineId: null,
    themeId: null,
    institution,
    year,
    cycle: DEFAULT_CYCLE,
    difficulty: DEFAULT_DIFFICULTY,
    clinicalVignette: '',
    questionStem: q.enunciado,
    options: q.alternativas.map((a) => ({
      letter: a.letter,
      text: a.text,
      explanation: '',
      isCorrect: q.gabarito === a.letter,
    })),
    generalCommentary: q.comentario || DEFAULT_GENERAL_COMMENTARY,
    highYieldSummary: DEFAULT_HIGH_YIELD_SUMMARY,
    tags: DEFAULT_TAGS,
    materialTitles: [],
    materialLinks: [],
    missingFields: [
      q.comentario
        ? 'Sem explicação por alternativa nem pérola: o rascunho fica com o texto padrão e precisa ser completado antes de publicar.'
        : 'Sem explicações, comentário e pérola: o rascunho fica com o texto padrão e precisa ser completado antes de publicar.',
    ],
    blockingErrors: q.erros,
    anulada: q.anulada,
  }));
}

/**
 * Texto `.md` colado: banca e ano do lote entram só onde a questão não traz os
 * seus (o que o arquivo diz continua valendo).
 */
export function completarBancaEAno(rows: QuestionImportPreview[], institution: string, year: number): QuestionImportPreview[] {
  return rows.map((row) => {
    const semBanca = !row.institution;
    const semAno = !row.year;
    if (!semBanca && !semAno) return row;
    return {
      ...row,
      institution: semBanca ? institution : row.institution,
      year: semAno ? year : row.year,
      missingFields: row.missingFields.filter(
        (f) => !(semBanca && f === 'Instituição / Banca vazia.') && !(semAno && (f === 'Ano vazio.' || f.startsWith('Ano "')))
      ),
    };
  });
}

// ---------------------------------------------------------------------------
// Questão repetida
// ---------------------------------------------------------------------------

function normalizarParaRepeticao(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

type DadosDaQuestao = { clinicalVignette?: string | null; questionStem?: string | null; institution?: string | null; year?: number | null };

/** Enunciado (vinheta + comando) normalizado + banca + ano: minúsculas, espaços repetidos viram um. */
export function chaveDeRepeticao(q: DadosDaQuestao): string {
  const enunciado = normalizarParaRepeticao(`${q.clinicalVignette ?? ''} ${q.questionStem ?? ''}`);
  return `${enunciado}|${normalizarParaRepeticao(q.institution ?? '')}|${q.year ?? 0}`;
}

export function chavesDasQuestoes(questoes: DadosDaQuestao[]): Set<string> {
  return new Set(questoes.map(chaveDeRepeticao));
}
