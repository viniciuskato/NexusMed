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
//
// Depois da leitura, uma conferência independente (`conferirLeitura`, IMPORT-2b)
// confere invariantes simples sobre o resultado; a questão que não passa fica
// bloqueada com "Leitura duvidosa — confira o texto: <motivo>".
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
  /** Leitura incerta que não impede a gravação, mas que o admin precisa conferir na prévia. */
  avisos: string[];
}

export interface ProvaLida {
  questoes: QuestaoDaProva[];
  /** Avisos do lote inteiro: numeração pulada ou repetida, gabarito que cita questão inexistente etc. */
  avisos: string[];
}

export type ResultadoDaProva = ({ ok: true } & ProvaLida) | { ok: false; errors: string[] };

const ANULADA = 'ANULADA';
const ERRO_ANULADA = 'Anulada no gabarito — não é importada.';
const PREFIXO_DUVIDA = 'Leitura duvidosa — confira o texto: ';

// Princípio desta leitura: leitura ambígua nunca vira questão "Pronta". Ou lê certo,
// ou a questão fica bloqueada com o motivo escrito (gravar gabarito errado em silêncio
// é o pior resultado possível).

// "Questão 1", "QUESTÃO 01", "Questão 1 -", "Questão 1." (o resto da linha é o começo do enunciado).
const INICIO_COM_PALAVRA = /^quest(?:ã|a)o\s+(\d{1,3})\b[\s.:)\-–—]*(.*)$/i;
// "1.", "1)", "01 -": o ponto exige espaço depois (para "37.5 mg" não virar questão 37).
const INICIO_NUMERICO = /^(\d{1,3})(?:\s*\)\s*|\.(?:\s+|$)|\s+[-–—]\s*)(.*)$/;

// "(A)", "A)", "a)" (marcadores fortes) e "A.", "A -" (fracos: "B. pertussis" também começa assim).
const ALTERNATIVA = /^(?:\(([A-Za-z])\)\s*|([A-Za-z])\s*\)\s*|([A-Za-z])\.(?:\s+|$)|([A-Za-z])\s+[-–—]\s*)(.*)$/;

const COMENTARIO = /^coment(?:á|a)rio\s*:\s*(.*)$/i;

// "Resposta: B", "Gabarito: B", "Alternativa correta: B", "Resposta correta: (B)", "Gabarito: ANULADA".
const GABARITO_DA_QUESTAO =
  /^(?:resposta(?:\s+correta)?|gabarito(?:\s+oficial)?|alternativa\s+correta)\s*[:\-–]\s*(?:alternativa\s+)?\(?(anulad[ao]|[A-Za-z*])\)?(?:\s*[).\-–—:,;].*)?$/i;

// Só a linha-título abre o bloco de gabarito: "Gabarito", "GABARITO OFICIAL:", "Respostas".
const TITULO_DO_BLOCO = /^(?:gabarito(?:\s+(?:oficial|final|preliminar|definitivo))?|respostas)\s*:?\s*$/i;
// Título e pares na mesma linha: "Gabarito: 1-B 2-C" (grupo 1: os dois-pontos, se houver; grupo 2: o resto).
const TITULO_COM_PARES = /^(?:gabarito(?:\s+(?:oficial|final|preliminar|definitivo))?|respostas)\b\s*(:?)\s*(\S.*)$/i;

// Um par do bloco: "1-B", "1 B", "1) B", "01. B", "7 ANULADA", "5 - *". Só letra MAIÚSCULA vale como resposta.
const PAR_DO_GABARITO = /(?<![\d.])(\d{1,3})\s*[-–—.):=]?\s*(ANULAD[AO]|Anulad[ao]|[A-Z*])(?![A-Za-z0-9*])/g;

// "Questões 1 e 2 anuladas", "3 anulada após recurso": só lista simples de números (sem "a"/intervalo) e sem outro número depois.
const ANULADAS_NA_LINHA =
  /^(?:quest(?:ões|oes|ão|ao)\s+)?(\d{1,3}(?:\s*(?:,|;|e)\s*\d{1,3})*)\s+(?:(?:foram|ficaram|estão)\s+)?anuladas?\b[^\d]*$/i;

const TERMINA_FRASE = /[.;!?]$/;

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

type EstiloDaAlternativa = 'parenteses' | 'ponto' | 'hifen';

interface Rascunho {
  numero: number;
  enunciado: Paragrafos;
  alternativas: AlternativaDaProva[];
  comentario: Paragrafos;
  fase: 'enunciado' | 'alternativas' | 'comentario';
  gabaritoDaQuestao: string | null; // letra ou ANULADA
  gabaritoDoBloco: string | null;
  estilo: EstiloDaAlternativa | null;
  /** Última linha de texto lida nesta questão (para decidir se uma alternativa terminou). */
  ultimaLinha: string;
  erros: string[];
  avisos: string[];
  /** O que a conferência final precisa saber da leitura (IMPORT-2b). */
  leitura: LeituraDaQuestao;
}

function novoRascunho(numero: number, abertaPorNumero: boolean): Rascunho {
  return {
    numero,
    enunciado: new Paragrafos(),
    alternativas: [],
    comentario: new Paragrafos(),
    fase: 'enunciado',
    gabaritoDaQuestao: null,
    gabaritoDoBloco: null,
    estilo: null,
    ultimaLinha: '',
    erros: [],
    avisos: [],
    leitura: { marcadores: [], juntadasComNumero: [], gabaritosDaQuestao: [], gabaritoDoBloco: null, abertaPorNumero },
  };
}

function proximaLetra(alternativas: AlternativaDaProva[]): string {
  if (alternativas.length === 0) return 'A';
  return String.fromCharCode(alternativas[alternativas.length - 1].letter.charCodeAt(0) + 1);
}

interface AlternativaLida {
  letter: string;
  texto: string;
  /** "A)", "(A)" e "a)" são marcadores fortes; "A." e "A -" também abrem frases comuns ("B. pertussis"). */
  forte: boolean;
  estilo: EstiloDaAlternativa;
  /** O marcador como está no texto, para a conferência: "(A)", "A)", "a)", "A.", "A -". */
  marcador: string;
}

function lerAlternativa(linha: string): AlternativaLida | null {
  const m = linha.match(ALTERNATIVA);
  if (!m) return null;
  const letter = (m[1] ?? m[2] ?? m[3] ?? m[4]).toUpperCase();
  const texto = m[5].trim();
  if (m[1] !== undefined) return { letter, texto, forte: true, estilo: 'parenteses', marcador: `(${m[1]})` };
  if (m[2] !== undefined) return { letter, texto, forte: true, estilo: 'parenteses', marcador: `${m[2]})` };
  if (m[3] !== undefined) return { letter, texto, forte: false, estilo: 'ponto', marcador: `${m[3]}.` };
  return { letter, texto, forte: false, estilo: 'hifen', marcador: `${m[4]} -` };
}

function comecaEmMinuscula(texto: string): boolean {
  return /^[a-zà-ÿ]/.test(texto);
}

/**
 * A linha é uma alternativa nova da questão ou continuação da anterior? Marcador forte ("A)", "(A)") vale
 * sempre que a letra é a esperada. "X." e "X -" só valem na lista do mesmo estilo (ou se a alternativa
 * anterior terminou com ponto final), e "B. pertussis" (minúscula logo depois do ponto) nunca vale sem isso.
 */
function decidirAlternativa(q: Rascunho, alt: AlternativaLida): { abre: boolean; duvida: boolean } {
  if (alt.forte) return { abre: true, duvida: false };
  const primeira = q.alternativas.length === 0;
  const anteriorTerminou = TERMINA_FRASE.test(q.ultimaLinha);
  if (primeira) {
    const suspeita = alt.estilo === 'ponto' && comecaEmMinuscula(alt.texto);
    return { abre: !suspeita, duvida: suspeita };
  }
  const mesmoEstilo = q.estilo === alt.estilo;
  if (!mesmoEstilo) return { abre: anteriorTerminou, duvida: !anteriorTerminou };
  const suspeita = alt.estilo === 'ponto' && comecaEmMinuscula(alt.texto) && !anteriorTerminou;
  return { abre: !suspeita, duvida: suspeita };
}

/** Pares "1-B" etc. e nada além de separadores na linha. */
function lerPares(texto: string): Array<{ numero: number; token: string }> {
  return Array.from(texto.matchAll(PAR_DO_GABARITO), (m) => ({ numero: parseInt(m[1], 10), token: m[2] }));
}

function ehLinhaSoDePares(linha: string): boolean {
  return lerPares(linha).length > 0 && linha.replace(PAR_DO_GABARITO, ' ').replace(/[\s,;|]+/g, '') === '';
}

function listaDeFaltantes(de: number, ate: number): string {
  const total = ate - de + 1;
  if (total <= 3) return Array.from({ length: total }, (_, i) => de + i).join(', ');
  return `${de} a ${ate}`;
}

/** Avisos de numeração e as posições (índices) das questões cuja numeração é ambígua e por isso fica bloqueada. */
function conferirNumeracao(numeros: number[]): { avisos: string[]; ambiguas: Set<number> } {
  const avisos: string[] = [];
  const ambiguas = new Set<number>();
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
        ambiguas.add(i);
        ambiguas.add(i - 1);
      }
    }
    vistos.add(n);
  });
  // Número repetido: todas as questões com ele, e a que vem logo antes da primeira (pode ter sido cortada
  // por uma falsa abertura, como "2 - 3 tomadas" no meio de uma alternativa).
  const primeiras = new Set<number>();
  numeros.forEach((n, i) => {
    if (!repetidos.has(n)) return;
    ambiguas.add(i);
    if (!primeiras.has(n)) {
      primeiras.add(n);
      if (i > 0) ambiguas.add(i - 1);
    }
  });
  return { avisos, ambiguas };
}

/** Lê o texto colado de uma prova. Só lê: banca, ano e disciplina vêm depois. */
export function lerProvaEmTexto(texto: string): ResultadoDaProva {
  const linhas = texto.replace(/\u00a0/g, ' ').split(/\r\n|\n|\r/);
  const rascunhos: Rascunho[] = [];
  const avisos: string[] = [];
  const linhasDoBloco: string[] = [];
  let atual: Rascunho | null = null;
  let noBloco = false;
  /** Questão aberta quando o bloco começou, e se o bloco engoliu texto que não era gabarito. */
  let questaoDoBloco: Rascunho | null = null;
  let tituloDoBloco = '';
  let sobraNoBloco = false;

  const abrirQuestao = (numero: number, resto: string, porNumero: boolean): Rascunho => {
    const nova = novoRascunho(numero, porNumero);
    rascunhos.push(nova);
    if (resto) {
      nova.enunciado.adicionar(resto);
      nova.ultimaLinha = resto;
    }
    return nova;
  };

  /** Há uma alternativa "A" logo adiante, antes de outro início de questão? (distingue questão pulada de item de lista) */
  const temAlternativaAAdiante = (de: number): boolean => {
    for (let j = de + 1; j < linhas.length && j <= de + 12; j++) {
      const l = linhas[j].trim();
      if (l === '') continue;
      if (INICIO_COM_PALAVRA.test(l) || INICIO_NUMERICO.test(l) || TITULO_DO_BLOCO.test(l)) return false;
      if (lerAlternativa(l)?.letter === 'A') return true;
    }
    return false;
  };

  /**
   * Início de questão? "Questão N" sempre. Número no começo da linha (1., 1), 01 -) só abre questão quando:
   * (a) é o seguinte ao da questão aberta E ela já tem 2 alternativas (uma questão de verdade termina com
   *     as alternativas; número logo depois do enunciado ou de uma só alternativa é item de lista ou quebra
   *     de linha do PDF, como "1. Tabagismo" ou "dividida em\n2 - 3 tomadas"); ou
   * (b) o número já foi usado (a repetição será bloqueada na conferência) ou a questão aberta já tem 2
   *     alternativas (questão pulada ou fora de ordem), e logo adiante vem a alternativa A.
   * Fora disso é continuação do texto da questão aberta (enunciado, alternativa ou comentário).
   */
  const lerInicio = (linha: string, i: number): { numero: number; resto: string; porNumero: boolean } | null => {
    const porPalavra = linha.match(INICIO_COM_PALAVRA);
    if (porPalavra) return { numero: parseInt(porPalavra[1], 10), resto: porPalavra[2].trim(), porNumero: false };
    const porNumero = linha.match(INICIO_NUMERICO);
    if (!porNumero) return null;
    const numero = parseInt(porNumero[1], 10);
    const resto = porNumero[2].trim();
    if (atual === null) return { numero, resto, porNumero: true };
    const completa = atual.alternativas.length >= 2;
    if (completa && numero === atual.numero + 1) return { numero, resto, porNumero: true };
    const jaUsado = rascunhos.some((r) => r.numero === numero);
    if ((jaUsado || completa) && temAlternativaAAdiante(i)) return { numero, resto, porNumero: true };
    return null;
  };

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i].trim();

    if (noBloco) {
      if (linha === '') continue;
      if (ehLinhaSoDePares(linha) || ANULADAS_NA_LINHA.test(linha)) {
        linhasDoBloco.push(linha);
        continue;
      }
      if (lerInicio(linha, i) === null) {
        linhasDoBloco.push(linha);
        sobraNoBloco = true;
        continue;
      }
      // Nova questão numerada: o bloco terminou. Se ele engoliu texto, a questão onde abriu pode ter perdido um pedaço.
      noBloco = false;
      if (sobraNoBloco && questaoDoBloco) {
        questaoDoBloco.erros.push(
          `O texto depois da linha "${tituloDoBloco}" foi tratado como gabarito e ignorado — confira o enunciado e as alternativas.`
        );
      }
      sobraNoBloco = false;
    }

    if (linha === '') {
      if (atual?.fase === 'enunciado') atual.enunciado.quebra();
      else if (atual?.fase === 'comentario') atual.comentario.quebra();
      continue;
    }

    // Bloco de gabarito: só a linha-título ("Gabarito", "Respostas") o abre. "Gabarito: B" é de uma questão só.
    if (atual && TITULO_DO_BLOCO.test(linha)) {
      noBloco = true;
      questaoDoBloco = atual;
      tituloDoBloco = linha;
      sobraNoBloco = false;
      continue;
    }

    // "Gabarito: 1-B 2-C": título e pares na mesma linha abrem o bloco só se o resto for só pares. Com "título:"
    // e pares mais alguma sobra, nenhum par vale e o aviso do lote aponta a linha (as questões ficam "Sem gabarito").
    const tituloComPares = atual ? linha.match(TITULO_COM_PARES) : null;
    if (atual && tituloComPares) {
      const resto = tituloComPares[2].trim();
      const soPares = ehLinhaSoDePares(resto);
      if (soPares || (tituloComPares[1] === ':' && lerPares(resto).length > 0)) {
        noBloco = true;
        questaoDoBloco = atual;
        tituloDoBloco = linha;
        sobraNoBloco = false;
        if (soPares) linhasDoBloco.push(resto);
        else {
          avisos.push(
            `A linha "${linha}" tem algo além do título e dos pares e não foi lida: as questões "Sem gabarito" podem depender dela.`
          );
        }
        continue;
      }
    }

    const inicio = lerInicio(linha, i);
    if (inicio) {
      atual = abrirQuestao(inicio.numero, inicio.resto, inicio.porNumero);
      continue;
    }

    if (!atual) continue; // título, instruções: antes da primeira questão não há o que ler
    const q: Rascunho = atual;

    const gabarito = linha.match(GABARITO_DA_QUESTAO);
    if (gabarito) {
      q.gabaritoDaQuestao = ehAnulada(gabarito[1]) ? ANULADA : gabarito[1].toUpperCase();
      q.leitura.gabaritosDaQuestao.push(q.gabaritoDaQuestao);
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
        const { abre, duvida } = decidirAlternativa(q, alternativa);
        if (abre) {
          q.fase = 'alternativas';
          if (q.alternativas.length === 0) q.estilo = alternativa.estilo;
          q.alternativas.push({ letter: alternativa.letter, text: alternativa.texto });
          q.leitura.marcadores.push(alternativa.marcador);
          q.ultimaLinha = alternativa.texto;
          continue;
        }
        if (duvida) {
          q.avisos.push(`A linha "${linha.slice(0, 50)}" foi lida como continuação do texto anterior, não como alternativa ${alternativa.letter} — confira.`);
        }
      }
    }

    // Continuação (quebra de linha do PDF). Linha que começa com número + separador e é juntada a uma
    // alternativa ou ao comentário fica anotada para a conferência (pode ser outra questão).
    const comNumero = INICIO_NUMERICO.test(linha);
    if (q.fase === 'enunciado') q.enunciado.adicionar(linha);
    else if (q.fase === 'comentario') {
      q.comentario.adicionar(linha);
      if (comNumero) q.leitura.juntadasComNumero.push({ linha, onde: 'ao comentário' });
    } else {
      const ultima = q.alternativas[q.alternativas.length - 1];
      ultima.text = ultima.text ? `${ultima.text} ${linha}` : linha;
      if (comNumero) q.leitura.juntadasComNumero.push({ linha, onde: `à alternativa ${ultima.letter}` });
    }
    q.ultimaLinha = linha;
  }

  if (rascunhos.length === 0) {
    return {
      ok: false,
      errors: [
        'Nenhuma questão encontrada no texto. Cada questão precisa começar numa linha nova com o número ("1.", "1)", "01 -") ou com "Questão 1". ' +
          "Numere as questões como '31.' ou 'Questão 31': o número sozinho na linha (\"31\") não é lido.",
      ],
    };
  }

  // Gabarito em bloco: cada par vale para a primeira questão com aquele número que ainda não recebeu.
  // Linha que não é só pares (nem "N e M anuladas") não aplica par nenhum: as questões ficam sem gabarito, bloqueadas.
  const aplicar = (numero: number, valor: string) => {
    const alvo = rascunhos.find((r) => r.numero === numero && r.gabaritoDoBloco === null);
    if (!alvo) {
      avisos.push(`O gabarito cita a questão ${numero}, que não está na prova (ou já tem gabarito).`);
      return;
    }
    alvo.gabaritoDoBloco = valor;
  };
  for (const linha of linhasDoBloco) {
    if (ehLinhaSoDePares(linha)) {
      for (const par of lerPares(linha)) aplicar(par.numero, ehAnulada(par.token) ? ANULADA : par.token.toUpperCase());
      continue;
    }
    const anuladas = linha.match(ANULADAS_NA_LINHA);
    if (anuladas) {
      for (const n of anuladas[1].match(/\d{1,3}/g) ?? []) aplicar(parseInt(n, 10), ANULADA);
      continue;
    }
    avisos.push(`Linha do gabarito não entendida (nenhum gabarito foi tirado dela): "${linha}".`);
  }

  const numeracao = conferirNumeracao(rascunhos.map((r) => r.numero));
  avisos.unshift(...numeracao.avisos);

  const lidas = rascunhos.map((r, indice): QuestaoLida => {
    const erros: string[] = [...r.erros];
    const enunciado = r.enunciado.texto();
    if (!enunciado) erros.push('Enunciado vazio.');
    if (r.alternativas.length < 2) {
      erros.push(`Menos de 2 alternativas (encontradas: ${r.alternativas.length}).`);
    }
    for (const a of r.alternativas) {
      if (!a.text.trim()) erros.push(`Alternativa ${a.letter} sem texto.`);
    }
    if (numeracao.ambiguas.has(indice)) erros.push('Numeração ambígua — confira o texto.');

    // Gabarito da questão diferente do bloco do fim: a conferência bloqueia (regra d).
    const bruto = r.gabaritoDaQuestao ?? r.gabaritoDoBloco;
    const anulada = bruto === ANULADA;
    let gabarito: string | null = null;
    if (anulada) {
      erros.push(ERRO_ANULADA);
    } else if (!bruto) {
      erros.push('Sem gabarito.');
    } else if (!r.alternativas.some((a) => a.letter === bruto)) {
      erros.push(`Gabarito "${bruto}" não é uma das alternativas desta questão.`);
    } else {
      gabarito = bruto;
    }

    return {
      questao: {
        numero: r.numero,
        enunciado,
        alternativas: r.alternativas,
        gabarito,
        anulada,
        comentario: r.comentario.texto(),
        erros,
        avisos: r.avisos,
      },
      leitura: { ...r.leitura, gabaritoDoBloco: r.gabaritoDoBloco },
    };
  });

  return { ok: true, questoes: conferirLeitura(lidas), avisos };
}

// ---------------------------------------------------------------------------
// Conferência final (IMPORT-2b): rede de segurança independente das heurísticas
// de leitura. Invariantes simples sobre o resultado; o que não passa é bloqueado
// com o motivo. Bloquear demais é aceitável; gravar errado em silêncio, não.
// ---------------------------------------------------------------------------

/** O que a conferência precisa saber de como a questão foi lida. */
export interface LeituraDaQuestao {
  /** O marcador de cada alternativa como estava no texto: "(A)", "A)", "a)", "A.", "A -". */
  marcadores: string[];
  /** Linhas começadas por número + separador ("11 - ", "2. ", "3) ") juntadas a uma alternativa ou ao comentário. */
  juntadasComNumero: Array<{ linha: string; onde: string }>;
  /** Cada gabarito escrito na própria questão ("Resposta: B"), na ordem em que apareceu. */
  gabaritosDaQuestao: string[];
  gabaritoDoBloco: string | null;
  /** A questão foi aberta por número ("12.", "12)", "12 -"), não por "Questão 12". */
  abertaPorNumero: boolean;
}

export interface QuestaoLida {
  questao: QuestaoDaProva;
  leitura: LeituraDaQuestao;
}

// Resíduo de marcador no meio de um campo: "(A)" ou "A)" (A–F, depois de início ou espaço; I, V e X ficam de
// fora para afirmativas em romano "I) … VI)" não bloquearem), "QUESTÃO 32" / "Questão32", ou "Resposta:",
// "Gabarito:", "Alternativa correta:" (não depois do artigo: "assinale a alternativa correta:" é enunciado comum).
const RESIDUO_DE_MARCADOR =
  /(?<!\S)\(?[A-Fa-f]\)|(?:QUEST[ÃA]O|Quest[ãa]o)\s*\d+|(?<!(?:^|\s)[Aa]\s)(?:(?:Resposta|RESPOSTA|Gabarito|GABARITO)(?:\s+(?:correta|CORRETA|oficial|OFICIAL))?|Alternativa correta|ALTERNATIVA CORRETA)\s*:/;

/** "(A)" → "(X)", "a)" → "x)", "A -" → "X -": o estilo do marcador, sem a letra. */
function estiloDoMarcador(marcador: string): string {
  return marcador.replace(/[A-Z]/, 'X').replace(/[a-z]/, 'x');
}

function motivosDeDuvida(q: QuestaoDaProva, leitura: LeituraDaQuestao): string[] {
  const motivos: string[] = [];

  // (a) letras de A em diante, em sequência, e um só estilo de marcador.
  const letras = q.alternativas.map((a) => a.letter);
  if (letras.some((letra, i) => letra !== String.fromCharCode(65 + i))) {
    motivos.push(`as letras das alternativas não seguem de A em diante (${letras.join(', ')})`);
  }
  const estilos = new Map<string, string>();
  for (const marcador of leitura.marcadores) {
    const estilo = estiloDoMarcador(marcador);
    if (!estilos.has(estilo)) estilos.set(estilo, marcador);
  }
  if (estilos.size > 1) {
    motivos.push(`marcadores de alternativa misturados (${Array.from(estilos.values(), (m) => `"${m}"`).join(' e ')})`);
  }

  // (b) resíduo de marcador forte, de início de questão ou de gabarito dentro de um campo.
  const campos: Array<[string, string]> = [
    ['do enunciado', q.enunciado],
    ...q.alternativas.map((a): [string, string] => [`da alternativa ${a.letter}`, a.text]),
    ['do comentário', q.comentario],
  ];
  for (const [onde, texto] of campos) {
    const residuo = texto.match(RESIDUO_DE_MARCADOR);
    if (residuo) motivos.push(`sobrou "${residuo[0].trim()}" no meio ${onde}`);
  }

  // (c) linha começada por número juntada a uma alternativa ou ao comentário.
  const juntada = leitura.juntadasComNumero[0];
  if (juntada) motivos.push(`a linha "${juntada.linha.slice(0, 40)}" começa com número e foi juntada ${juntada.onde}`);

  // (d) mais de um gabarito: duas respostas diferentes na questão, ou a da questão diferente da do bloco.
  const gabaritos = new Set(leitura.gabaritosDaQuestao);
  if (leitura.gabaritoDoBloco) gabaritos.add(leitura.gabaritoDoBloco);
  if (gabaritos.size > 1) motivos.push(`gabaritos diferentes (${Array.from(gabaritos).join(' e ')})`);

  return motivos;
}

/**
 * Conferência final, aplicada a toda questão depois da leitura. Regras (a) a (d) olham a própria questão;
 * a (e) bloqueia a questão quando a SEGUINTE foi aberta por número e ficou bloqueada por (a)–(d) ou pela
 * leitura (a abertura falsa pode ter cortado as alternativas desta). Anulada não conta como bloqueada, e a
 * regra (e) não se propaga em cadeia.
 */
export function conferirLeitura(lidas: QuestaoLida[]): QuestaoDaProva[] {
  const conferidas = lidas.map(({ questao, leitura }) => ({
    ...questao,
    erros: [...questao.erros, ...motivosDeDuvida(questao, leitura).map((m) => `${PREFIXO_DUVIDA}${m}.`)],
  }));
  return conferidas.map((q, i) => {
    const seguinte = conferidas[i + 1];
    if (!seguinte || !lidas[i + 1].leitura.abertaPorNumero) return q;
    if (!seguinte.erros.some((e) => e !== ERRO_ANULADA)) return q;
    return { ...q, erros: [...q.erros, `${PREFIXO_DUVIDA}a questão seguinte (${seguinte.numero}) ficou bloqueada e pode ter cortado esta.`] };
  });
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
      ...q.avisos,
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
