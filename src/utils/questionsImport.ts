import { DifficultyLevel, Discipline, MedicalCycle, Question, QuestionOption, Theme } from '../types';

// ============================================================================
// Importação de questões a partir de Markdown — equivalente de
// `compendiumMarkdownImport.ts` para o banco de questões comentadas. Antes
// desta missão não existia NENHUM import de arquivo para questão (ver
// `docs/editorial/PADRAO-NEXUSMED-QUESTOES.md`); o formulário "Nova Questão"
// continua existindo, inalterado, para cadastro unitário.
//
// Diferença estrutural do import de conteúdo: um arquivo de conteúdo é UMA
// entidade (material) com várias seções; um arquivo de questões é um LOTE de
// entidades independentes (cada "## Questão N" vira uma linha própria em
// `questions`). Por isso o resultado aqui é sempre uma LISTA de linhas, cada
// uma com sua própria validação/resolução de disciplina e tema — nunca um
// "tudo ou nada" por arquivo.
//
// Convenção esperada (pensada para o que uma IA de fontes como o NotebookLM
// produz quando pedida no formato descrito em
// `docs/editorial/PADRAO-NEXUSMED-QUESTOES.md`; o parser é tolerante a
// variações razoáveis — um campo que não for encontrado só entra como
// "ausente" no preview daquela questão, nunca trava o arquivo inteiro):
//
//   ## Questão 1
//
//   **Disciplina:** Nome da Disciplina
//   **Tema:** Nome do Tema (opcional — sem isto, exige escolha manual, nunca
//   um palpite silencioso)
//   **Instituição / Banca:** ENARE
//   **Ano:** 2025
//   **Ciclo:** internato_residencia (opcional; padrão internato_residencia)
//   **Dificuldade:** medio (opcional; padrão medio)
//
//   **Enunciado Clínico (Caso / Vinheta):** (opcional)
//   Texto da vinheta...
//
//   **Comando da Questão (Pergunta):**
//   Texto da pergunta...
//
//   **A)** Texto da alternativa A
//   **Explicação A:** ...
//   **B)** Texto da alternativa B [GABARITO]
//   **Explicação B:** ...
//   **C)** Texto da alternativa C
//   **Explicação C:** ...
//   **D)** Texto da alternativa D
//   **Explicação D:** ...
//
//   **Comentário Geral:** (opcional)
//   **Pérola High-Yield:** ...
//
//   ### Tags
//   `tag1` `tag2`
// ============================================================================

const VALID_CYCLES: MedicalCycle[] = ['basico', 'clinico', 'internato_residencia'];
const VALID_DIFFICULTIES: DifficultyLevel[] = ['facil', 'medio', 'dificil'];
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;

const DEFAULT_CYCLE: MedicalCycle = 'internato_residencia';
const DEFAULT_DIFFICULTY: DifficultyLevel = 'medio';
const DEFAULT_TAGS = ['Admin', 'CMS', 'Custom'];
const DEFAULT_GENERAL_COMMENTARY = 'Comentário cadastrado via Painel Administrativo.';
const DEFAULT_HIGH_YIELD_SUMMARY = 'Conceito chave adicionado pelo autor.';

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalizeLabel(s: string): string {
  return stripAccents(s).toLowerCase().trim();
}

function isNonEmptyString(v: string | undefined): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export interface QuestionImportOption {
  letter: (typeof OPTION_LETTERS)[number];
  text: string;
  explanation: string;
  isCorrect: boolean;
}

export interface QuestionImportPreview {
  /** Posição no arquivo (1-based), só para exibição ("Questão 3") — nunca persistida. */
  index: number;
  disciplineName: string;
  themeName: string;
  /** Resolvido por nome (case-insensitive) contra o catálogo já carregado; null se não encontrado/ausente. */
  disciplineId: string | null;
  themeId: string | null;
  institution: string;
  year: number;
  cycle: MedicalCycle;
  difficulty: DifficultyLevel;
  clinicalVignette: string;
  questionStem: string;
  options: QuestionImportOption[];
  generalCommentary: string;
  highYieldSummary: string;
  tags: string[];
  /** Tudo que não pôde ser importado, está ausente ou usou um valor padrão — sempre mostrado, nunca escondido. */
  missingFields: string[];
  /** Torna esta linha impossível de importar, mesmo com disciplina/tema escolhidos manualmente. */
  blockingErrors: string[];
}

export interface QuestionsImportSuccess {
  ok: true;
  rows: QuestionImportPreview[];
}

export interface QuestionsImportFailure {
  ok: false;
  errors: string[];
}

export type QuestionsImportResult = QuestionsImportSuccess | QuestionsImportFailure;

function resolveByName<T extends { name: string }>(name: string, list: T[]): T | undefined {
  const norm = name.trim().toLowerCase();
  if (!norm) return undefined;
  return list.find((item) => item.name.trim().toLowerCase() === norm);
}

interface LabelMatch {
  /** Rótulo já normalizado (sem acento, minúsculo). */
  label: string;
  /** Letra da alternativa, quando o rótulo for "A)".."E)" ou "Explicação X". */
  letter?: (typeof OPTION_LETTERS)[number];
  kind: 'field' | 'optionText' | 'optionExplanation';
  line: number;
  inline: string;
}

const OPTION_TEXT_RE = /^\*\*([A-E])\)\*\*\s*(.*)$/;
// [cç][aã] (não c?a?) porque a forma correta é "Explicação" — com cedilha e
// til — não "Explicacao"; um regex sem os dois acentos combinados nunca
// bate com o rótulo do jeito que o guia e os próprios exemplos deste
// arquivo escrevem (achado real: nenhum teste unitário conferia o texto de
// `explanation`, só a existência da opção — o gap passou pela suíte até
// ser conferido manualmente).
const OPTION_EXPLANATION_RE = /^\*\*explica[cç][aã]o\s+([a-e]):?\*\*\s*(.*)$/i;
const GENERIC_LABEL_RE = /^\*\*([^*:]+):?\*\*\s*(.*)$/;

/** Rótulos reconhecidos (já normalizados) e o campo do preview a que correspondem. */
const FIELD_LABELS: Record<string, keyof QuestionImportPreview | 'clinicalVignette' | 'questionStem'> = {
  disciplina: 'disciplineName',
  tema: 'themeName',
  'instituicao / banca': 'institution',
  instituicao: 'institution',
  banca: 'institution',
  ano: 'year',
  ciclo: 'cycle',
  dificuldade: 'difficulty',
  'enunciado clinico (caso / vinheta)': 'clinicalVignette',
  'enunciado clinico': 'clinicalVignette',
  vinheta: 'clinicalVignette',
  'comando da questao (pergunta)': 'questionStem',
  'comando da questao': 'questionStem',
  pergunta: 'questionStem',
  'comentario geral': 'generalCommentary',
  'perola high-yield (resumo para fixacao rapida)': 'highYieldSummary',
  'perola high-yield': 'highYieldSummary',
  perola: 'highYieldSummary',
};

function findLabelMatches(lines: string[]): LabelMatch[] {
  const matches: LabelMatch[] = [];
  lines.forEach((rawLine, i) => {
    const line = rawLine.trim();
    const optText = line.match(OPTION_TEXT_RE);
    if (optText) {
      matches.push({ label: 'optionText', letter: optText[1] as LabelMatch['letter'], kind: 'optionText', line: i, inline: optText[2] });
      return;
    }
    const optExp = line.match(OPTION_EXPLANATION_RE);
    if (optExp) {
      matches.push({
        label: 'optionExplanation',
        letter: optExp[1].toUpperCase() as LabelMatch['letter'],
        kind: 'optionExplanation',
        line: i,
        inline: optExp[2],
      });
      return;
    }
    const generic = line.match(GENERIC_LABEL_RE);
    if (generic) {
      const norm = normalizeLabel(generic[1]);
      if (norm in FIELD_LABELS) {
        matches.push({ label: norm, kind: 'field', line: i, inline: generic[2] });
      }
    }
  });
  return matches;
}

/** Valor de um rótulo = texto inline (se houver) + linhas seguintes até o próximo rótulo reconhecido. */
function collectValue(lines: string[], match: LabelMatch, nextLine: number): string {
  const continuation = lines.slice(match.line + 1, nextLine).join('\n');
  return `${match.inline}\n${continuation}`.trim();
}

function isTagsHeader(line: string): boolean {
  return normalizeLabel(line.replace(/^###\s+/, '')) === 'tags';
}

function extractBacktickTags(body: string): string[] {
  const found = body.match(/`([^`\n]+)`/g) ?? [];
  return found.map((m) => m.slice(1, -1).trim()).filter(Boolean);
}

/** Divide o arquivo inteiro em blocos por heading `## `, descartando qualquer preâmbulo antes do primeiro. */
function splitByH2(text: string): string[] {
  const lines = text.split(/\r\n|\n/);
  const headingIdx: number[] = [];
  lines.forEach((line, i) => {
    if (/^##\s+.+/.test(line.trim())) headingIdx.push(i);
  });
  const blocks: string[] = [];
  headingIdx.forEach((idx, i) => {
    const end = i + 1 < headingIdx.length ? headingIdx[i + 1] : lines.length;
    blocks.push(lines.slice(idx + 1, end).join('\n'));
  });
  return blocks;
}

function parseQuestionBlock(
  block: string,
  index: number,
  disciplines: Discipline[],
  themes: Theme[]
): QuestionImportPreview {
  // Um bloco `### Tags` é retirado ANTES da varredura de rótulos genéricos —
  // senão o conteúdo dele (texto com crase) poderia colidir com o parser de
  // rótulo de campo.
  const lines = block.split(/\r\n|\n/);
  let tags: string[] = [];
  const tagsHeaderIdx = lines.findIndex((l) => /^###\s+/.test(l.trim()) && isTagsHeader(l));
  let contentLines = lines;
  if (tagsHeaderIdx !== -1) {
    const nextHeadingRel = lines.slice(tagsHeaderIdx + 1).findIndex((l) => /^#{2,3}\s+/.test(l.trim()));
    const tagsEnd = nextHeadingRel === -1 ? lines.length : tagsHeaderIdx + 1 + nextHeadingRel;
    tags = extractBacktickTags(lines.slice(tagsHeaderIdx + 1, tagsEnd).join('\n'));
    contentLines = [...lines.slice(0, tagsHeaderIdx), ...lines.slice(tagsEnd)];
  }

  const matches = findLabelMatches(contentLines);
  const values: Partial<Record<string, string>> = {};
  const optionTextByLetter: Partial<Record<string, string>> = {};
  const optionExplanationByLetter: Partial<Record<string, string>> = {};
  const gabaritoLetters: string[] = [];

  matches.forEach((match, i) => {
    const nextLine = i + 1 < matches.length ? matches[i + 1].line : contentLines.length;
    const value = collectValue(contentLines, match, nextLine);
    if (match.kind === 'field') {
      values[match.label] = value;
    } else if (match.kind === 'optionText' && match.letter) {
      const hasGabarito = /\[\s*gabarito\s*\]/i.test(value);
      const cleanText = value.replace(/\[\s*gabarito\s*\]/gi, '').trim();
      optionTextByLetter[match.letter] = cleanText;
      if (hasGabarito) gabaritoLetters.push(match.letter);
    } else if (match.kind === 'optionExplanation' && match.letter) {
      optionExplanationByLetter[match.letter] = value;
    }
  });

  const missingFields: string[] = [];
  const blockingErrors: string[] = [];

  const disciplineName = values.disciplina?.trim() ?? '';
  if (!disciplineName) blockingErrors.push('Disciplina não informada — questão não pode ser criada.');

  const themeName = values.tema?.trim() ?? '';
  const discipline = resolveByName(disciplineName, disciplines);
  const theme = resolveByName(themeName, discipline ? themes.filter((t) => t.disciplineId === discipline.id) : themes);

  if (discipline && !themeName) {
    missingFields.push('Tema não informado — selecione um manualmente antes de confirmar.');
  } else if (themeName && !theme) {
    missingFields.push(`Tema "${themeName}" não encontrado no catálogo atual — selecione um manualmente antes de confirmar.`);
  } else if (!discipline) {
    missingFields.push(`Disciplina "${disciplineName}" não encontrada no catálogo atual — selecione uma manualmente antes de confirmar.`);
  }

  const institution = values['instituicao / banca']?.trim() || values.instituicao?.trim() || values.banca?.trim() || '';
  if (!institution) missingFields.push('Instituição / Banca vazia.');

  const yearRaw = values.ano?.trim() ?? '';
  const yearNum = parseInt(yearRaw, 10);
  const year = Number.isFinite(yearNum) && yearNum >= 1980 && yearNum <= 2100 ? yearNum : 0;
  if (!year) missingFields.push(yearRaw ? `Ano "${yearRaw}" inválido — ignorado.` : 'Ano vazio.');

  const cycleRaw = normalizeLabel(values.ciclo ?? '');
  const cycle = (VALID_CYCLES as string[]).includes(cycleRaw) ? (cycleRaw as MedicalCycle) : DEFAULT_CYCLE;
  if (values.ciclo && cycle === DEFAULT_CYCLE && cycleRaw !== DEFAULT_CYCLE) {
    missingFields.push(`Ciclo "${values.ciclo}" inválido — usando padrão "${DEFAULT_CYCLE}".`);
  }

  const difficultyRaw = normalizeLabel(values.dificuldade ?? '');
  const difficulty = (VALID_DIFFICULTIES as string[]).includes(difficultyRaw)
    ? (difficultyRaw as DifficultyLevel)
    : DEFAULT_DIFFICULTY;
  if (values.dificuldade && difficulty === DEFAULT_DIFFICULTY && difficultyRaw !== DEFAULT_DIFFICULTY) {
    missingFields.push(`Dificuldade "${values.dificuldade}" inválida — usando padrão "${DEFAULT_DIFFICULTY}".`);
  }

  const clinicalVignette = values['enunciado clinico (caso / vinheta)']?.trim() || values['enunciado clinico']?.trim() || values.vinheta?.trim() || '';
  if (!clinicalVignette) missingFields.push('Enunciado Clínico (Vinheta) vazio (ok se a questão realmente não tiver caso clínico).');

  const questionStem =
    values['comando da questao (pergunta)']?.trim() || values['comando da questao']?.trim() || values.pergunta?.trim() || '';
  if (!questionStem) blockingErrors.push('Comando da Questão (Pergunta) vazio — questão não pode ser criada.');

  const options: QuestionImportOption[] = OPTION_LETTERS.filter((letter) => isNonEmptyString(optionTextByLetter[letter])).map(
    (letter) => ({
      letter,
      text: (optionTextByLetter[letter] ?? '').trim(),
      explanation: (optionExplanationByLetter[letter] ?? '').trim(),
      isCorrect: gabaritoLetters.includes(letter),
    })
  );

  if (options.length < 2) {
    blockingErrors.push(`Menos de 2 alternativas com texto (encontradas: ${options.length}) — questão não pode ser criada.`);
  }
  const correctCount = options.filter((o) => o.isCorrect).length;
  if (correctCount === 0 && options.length >= 2) {
    blockingErrors.push('Nenhuma alternativa marcada com [GABARITO] — marque exatamente uma.');
  } else if (correctCount > 1) {
    blockingErrors.push(`Mais de uma alternativa marcada com [GABARITO] (${correctCount}) — deixe só uma.`);
  }
  const lettersWithoutExplanation = options.filter((o) => !o.explanation).map((o) => o.letter);
  if (lettersWithoutExplanation.length > 0) {
    missingFields.push(
      `Explicação vazia nas alternativas: ${lettersWithoutExplanation.join(', ')} — obrigatória antes de publicar.`
    );
  }

  const generalCommentary = values['comentario geral']?.trim() || '';
  if (!generalCommentary) missingFields.push('Comentário Geral vazio — usando texto padrão.');

  const highYieldSummary =
    values['perola high-yield (resumo para fixacao rapida)']?.trim() ||
    values['perola high-yield']?.trim() ||
    values.perola?.trim() ||
    '';
  if (!highYieldSummary) missingFields.push('Pérola High-Yield vazia — usando texto padrão.');

  if (tags.length === 0) missingFields.push('Tags não informadas — usando padrão (Admin, CMS, Custom).');

  return {
    index,
    disciplineName,
    themeName,
    disciplineId: discipline?.id ?? null,
    themeId: theme?.id ?? null,
    institution,
    year,
    cycle,
    difficulty,
    clinicalVignette,
    questionStem,
    options,
    generalCommentary: generalCommentary || DEFAULT_GENERAL_COMMENTARY,
    highYieldSummary: highYieldSummary || DEFAULT_HIGH_YIELD_SUMMARY,
    tags: tags.length > 0 ? tags : DEFAULT_TAGS,
    missingFields,
    blockingErrors,
  };
}

export function parseQuestionsMarkdownText(
  text: string,
  disciplines: Discipline[],
  themes: Theme[]
): QuestionsImportResult {
  const blocks = splitByH2(text);
  if (blocks.length === 0) {
    return {
      ok: false,
      errors: [
        'Nenhum bloco "## Questão" encontrado no arquivo. Cada questão precisa começar com um heading de nível 2 (ex.: "## Questão 1").',
      ],
    };
  }

  const rows = blocks.map((block, i) => parseQuestionBlock(block, i + 1, disciplines, themes));
  return { ok: true, rows };
}

/** Monta o `Question` final de uma linha já válida (sem blockingErrors) com disciplina/tema resolvidos. */
export function buildQuestionFromImportRow(
  row: QuestionImportPreview,
  resolvedDisciplineId: string | null,
  resolvedThemeId: string | null
): Question {
  if (row.blockingErrors.length > 0) {
    throw new Error('Esta linha tem erros que impedem a criação da questão.');
  }
  if (!resolvedDisciplineId || !resolvedThemeId) {
    throw new Error('Disciplina e tema precisam estar resolvidos antes de criar a questão.');
  }
  const options: QuestionOption[] = row.options.map((o) => ({
    letter: o.letter,
    text: o.text,
    isCorrect: o.isCorrect,
    explanation: o.explanation,
  }));
  return {
    id: crypto.randomUUID(),
    disciplineId: resolvedDisciplineId,
    themeId: resolvedThemeId,
    compendiumRefId: '',
    cycle: row.cycle,
    difficulty: row.difficulty,
    institution: row.institution,
    year: row.year,
    clinicalVignette: row.clinicalVignette,
    questionStem: row.questionStem,
    options,
    generalCommentary: row.generalCommentary,
    highYieldSummary: row.highYieldSummary,
    tags: row.tags,
  };
}
