import { Compendium, Discipline, Flashcard, Question, QuestionAnswerRecord, Theme } from '../types';
import { isCardDueToday } from './srsAlgorithm';

// ============================================================================
// Estudo Temático — construção dos packs (Prompt 22-A)
//
// Regra central, e a diferença mais importante em relação ao protótipo do AI
// Studio que originou esta tela: um item de conteúdo pertence a um pack SOMENTE
// quando ele declara a referência explícita (`compendiumRefId === compendium.id`).
// O protótipo também "adotava" qualquer questão/card do mesmo tema que não
// tivesse referência nenhuma — com dois ou mais compêndios no mesmo tema, o
// MESMO conteúdo aparecia duplicado em todos os packs daquele tema, sugerindo
// ao estudante que era material distinto. Aqui, conteúdo sem referência aparece
// UMA única vez, na seção temática avulsa do próprio tema.
//
// Nada é associado por nome, título ou similaridade — só por identificador.
//
// Invariante garantida (e coberta por teste): toda questão e todo flashcard
// recebidos aparecem em EXATAMENTE um lugar do resultado.
// ============================================================================

export interface ThematicPack {
  /** Prefixado para nunca colidir com um id de compêndio/tema cru. */
  id: string;
  compendiumId: string;
  compendium: Compendium;
  themeId: string;
  themeName: string;
  disciplineId: string;
  disciplineName: string;
  moduleNumber?: number;
  highYield: boolean;
  questions: Question[];
  flashcards: Flashcard[];
  readSectionIds: string[];
  readPercent: number;
  answeredCount: number;
  correctCount: number;
  accuracyPercent: number;
  dueCards: Flashcard[];
  masteredCards: Flashcard[];
  isCompleted: boolean;
  isUnstarted: boolean;
}

export interface ThematicGroup {
  themeId: string;
  themeName: string;
  themeDescription: string;
  disciplineId: string;
  disciplineName: string;
  highYield: boolean;
  packs: ThematicPack[];
  /**
   * Conteúdo do tema que não declara material de origem. Aparece uma única vez
   * aqui — nunca dentro de um pack, nunca repetido entre packs.
   */
  looseQuestions: Question[];
  looseFlashcards: Flashcard[];
}

export interface ThematicStudyData {
  groups: ThematicGroup[];
  /** `isCustom` — cards criados pelo próprio usuário, sempre em "Meus Cards Personalizados". */
  customFlashcards: Flashcard[];
  /** Declaram `compendiumRefId`, mas o id não corresponde a nenhum compêndio disponível. */
  invalidRefQuestions: Question[];
  invalidRefFlashcards: Flashcard[];
  /** Sem material e com tema que não corresponde a nenhum tema disponível. */
  unthemedQuestions: Question[];
  unthemedFlashcards: Flashcard[];
  totals: {
    packs: number;
    completedPacks: number;
    dueCards: number;
    linkedQuestions: number;
    looseQuestions: number;
    looseFlashcards: number;
  };
}

export interface BuildThematicStudyInput {
  disciplines: Discipline[];
  themes: Theme[];
  compendiums: Compendium[];
  questions: Question[];
  flashcards: Flashcard[];
  answers: Record<string, QuestionAnswerRecord>;
  readingProgress?: Record<string, { readSectionIds: string[]; percent: number }>;
}

export const THEMATIC_PACK_ID_PREFIX = 'pack-';

/**
 * Escopos especiais aceitos por QuestionsView/FlashcardsView no lugar de um id
 * de compêndio. Prefixados com `__` para nunca colidirem com um id real (uuid).
 */
export const SCOPE_UNLINKED = '__sem-material__';
export const SCOPE_CUSTOM = '__meus-cards__';

export function packIdForCompendium(compendiumId: string): string {
  return `${THEMATIC_PACK_ID_PREFIX}${compendiumId}`;
}

/** Referência explícita normalizada, ou `null` quando o item não declara nenhuma. */
function explicitRef(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

export function buildThematicStudyData({
  disciplines,
  themes,
  compendiums,
  questions,
  flashcards,
  answers,
  readingProgress = {},
}: BuildThematicStudyInput): ThematicStudyData {
  const disciplineNameById = new Map(disciplines.map((d) => [d.id, d.name]));
  const themeById = new Map(themes.map((t) => [t.id, t]));
  const compendiumById = new Map(compendiums.map((c) => [c.id, c]));

  const questionsByCompendium = new Map<string, Question[]>();
  const flashcardsByCompendium = new Map<string, Flashcard[]>();
  const looseQuestionsByTheme = new Map<string, Question[]>();
  const looseFlashcardsByTheme = new Map<string, Flashcard[]>();

  const invalidRefQuestions: Question[] = [];
  const invalidRefFlashcards: Flashcard[] = [];
  const unthemedQuestions: Question[] = [];
  const unthemedFlashcards: Flashcard[] = [];
  const customFlashcards: Flashcard[] = [];

  const pushTo = <T>(map: Map<string, T[]>, key: string, item: T) => {
    const current = map.get(key);
    if (current) current.push(item);
    else map.set(key, [item]);
  };

  for (const question of questions) {
    const ref = explicitRef(question.compendiumRefId);
    if (ref) {
      if (compendiumById.has(ref)) pushTo(questionsByCompendium, ref, question);
      else invalidRefQuestions.push(question);
      continue;
    }
    if (themeById.has(question.themeId)) pushTo(looseQuestionsByTheme, question.themeId, question);
    else unthemedQuestions.push(question);
  }

  for (const card of flashcards) {
    // Card personalizado tem uma casa só ("Meus Cards Personalizados"), mesmo
    // quando declara material de origem — evita que o mesmo card apareça
    // também dentro de um pack editorial.
    if (card.isCustom) {
      customFlashcards.push(card);
      continue;
    }
    const ref = explicitRef(card.compendiumRefId);
    if (ref) {
      if (compendiumById.has(ref)) pushTo(flashcardsByCompendium, ref, card);
      else invalidRefFlashcards.push(card);
      continue;
    }
    if (themeById.has(card.themeId)) pushTo(looseFlashcardsByTheme, card.themeId, card);
    else unthemedFlashcards.push(card);
  }

  const buildPack = (compendium: Compendium): ThematicPack => {
    const theme = themeById.get(compendium.themeId);
    const packQuestions = questionsByCompendium.get(compendium.id) ?? [];
    const packFlashcards = flashcardsByCompendium.get(compendium.id) ?? [];

    const progress = readingProgress[compendium.id];
    const readSectionIds = progress?.readSectionIds ?? [];
    const readPercent = progress?.percent ?? 0;

    const answered = packQuestions.filter((q) => Boolean(answers[q.id]));
    const correct = answered.filter((q) => answers[q.id]?.isCorrect);
    const dueCards = packFlashcards.filter((card) => isCardDueToday(card));
    const masteredCards = packFlashcards.filter((card) => card.srs?.state === 'mastered');

    return {
      id: packIdForCompendium(compendium.id),
      compendiumId: compendium.id,
      compendium,
      themeId: compendium.themeId,
      themeName: theme?.name ?? 'Tema não identificado',
      disciplineId: compendium.disciplineId,
      disciplineName: disciplineNameById.get(compendium.disciplineId) ?? 'Disciplina não identificada',
      moduleNumber: compendium.moduleNumber,
      highYield: Boolean(theme?.highYield),
      questions: packQuestions,
      flashcards: packFlashcards,
      readSectionIds,
      readPercent,
      answeredCount: answered.length,
      correctCount: correct.length,
      accuracyPercent: answered.length > 0 ? Math.round((correct.length / answered.length) * 100) : 0,
      dueCards,
      masteredCards,
      isCompleted:
        readPercent >= 100 &&
        (packQuestions.length === 0 || answered.length === packQuestions.length) &&
        (packFlashcards.length === 0 || masteredCards.length === packFlashcards.length),
      isUnstarted:
        readPercent === 0 &&
        answered.length === 0 &&
        packFlashcards.every((card) => !card.srs?.lastReviewedDate),
    };
  };

  // Um grupo por tema que tenha compêndio ou conteúdo avulso. Temas sem nada
  // não viram seção vazia — a tela mostraria uma linha sem conteúdo algum.
  const themeIdsWithContent = new Set<string>([
    ...compendiums.filter((c) => themeById.has(c.themeId)).map((c) => c.themeId),
    ...looseQuestionsByTheme.keys(),
    ...looseFlashcardsByTheme.keys(),
  ]);

  const groups: ThematicGroup[] = [];
  for (const themeId of themeIdsWithContent) {
    const theme = themeById.get(themeId);
    if (!theme) continue;
    groups.push({
      themeId,
      themeName: theme.name,
      themeDescription: theme.description,
      disciplineId: theme.disciplineId,
      disciplineName: disciplineNameById.get(theme.disciplineId) ?? 'Disciplina não identificada',
      highYield: theme.highYield,
      packs: compendiums.filter((c) => c.themeId === themeId).map(buildPack),
      looseQuestions: looseQuestionsByTheme.get(themeId) ?? [],
      looseFlashcards: looseFlashcardsByTheme.get(themeId) ?? [],
    });
  }

  // Compêndio cujo tema não existe mais nos dados atuais ainda precisa de um
  // pack alcançável — vai para um grupo próprio, rotulado como tal, em vez de
  // sumir da tela.
  const orphanCompendiums = compendiums.filter((c) => !themeById.has(c.themeId));
  if (orphanCompendiums.length > 0) {
    groups.push({
      themeId: '',
      themeName: 'Materiais sem tema identificado',
      themeDescription: 'Materiais cujo tema não está disponível nos dados carregados.',
      disciplineId: '',
      disciplineName: '',
      highYield: false,
      packs: orphanCompendiums.map(buildPack),
      looseQuestions: [],
      looseFlashcards: [],
    });
  }

  groups.sort((a, b) => {
    const byDiscipline = a.disciplineName.localeCompare(b.disciplineName, 'pt-BR');
    if (byDiscipline !== 0) return byDiscipline;
    return a.themeName.localeCompare(b.themeName, 'pt-BR');
  });
  for (const group of groups) {
    group.packs.sort((a, b) => a.compendium.title.localeCompare(b.compendium.title, 'pt-BR'));
  }

  const allPacks = groups.flatMap((g) => g.packs);

  return {
    groups,
    customFlashcards,
    invalidRefQuestions,
    invalidRefFlashcards,
    unthemedQuestions,
    unthemedFlashcards,
    totals: {
      packs: allPacks.length,
      completedPacks: allPacks.filter((p) => p.isCompleted).length,
      dueCards: allPacks.reduce((acc, p) => acc + p.dueCards.length, 0),
      linkedQuestions: allPacks.reduce((acc, p) => acc + p.questions.length, 0),
      looseQuestions: groups.reduce((acc, g) => acc + g.looseQuestions.length, 0),
      looseFlashcards: groups.reduce((acc, g) => acc + g.looseFlashcards.length, 0),
    },
  };
}

/** Todos os packs, em ordem de exibição. */
export function listPacks(data: ThematicStudyData): ThematicPack[] {
  return data.groups.flatMap((g) => g.packs);
}

/**
 * Valida um id de pack salvo (localStorage) contra os dados atuais. Um material
 * despublicado/removido entre sessões deixa de existir — o id salvo então não
 * pode ser restaurado, e quem chama precisa saber disso para avisar em vez de
 * abrir uma tela vazia.
 */
export function findPackById(data: ThematicStudyData, packId: string | null): ThematicPack | null {
  if (!packId) return null;
  return listPacks(data).find((p) => p.id === packId) ?? null;
}
