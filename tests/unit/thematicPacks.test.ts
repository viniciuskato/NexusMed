import { describe, it, expect } from 'vitest';
import {
  buildThematicStudyData,
  findPackById,
  listPacks,
  packIdForCompendium,
} from '../../src/services/thematicPacks';
import type { Compendium, Discipline, Flashcard, Question, Theme } from '../../src/types';

// Provas da regra central do Estudo Temático (Prompt 22-A): um item pertence a
// um pack SÓ com referência explícita ao material. O protótipo do AI Studio
// adotava, em cada pack, qualquer conteúdo do mesmo tema sem referência — com
// dois materiais no tema, o mesmo conteúdo era exibido duas vezes como se
// fossem coisas diferentes. Os testes abaixo cobrem os cenários 2 a 5 da lista
// obrigatória do prompt sem precisar de navegador.

const discipline: Discipline = {
  id: 'disc-cardio',
  name: 'Cardiologia',
  code: 'CARDIO',
  icon: 'heart',
  description: '',
  cycle: 'clinico',
  color: '#000',
};

const theme: Theme = {
  id: 'tema-ic',
  disciplineId: 'disc-cardio',
  name: 'Insuficiência Cardíaca',
  description: 'Tema de teste',
  highYield: true,
  order: 1,
};

function makeCompendium(id: string, title: string): Compendium {
  return {
    id,
    disciplineId: discipline.id,
    themeId: theme.id,
    title,
    subtitle: '',
    estimatedReadTimeMinutes: 5,
    lastUpdated: '2026-09-13',
    author: 'Teste',
    sections: [],
    references: [],
  };
}

function makeQuestion(id: string, compendiumRefId: string, themeId = theme.id): Question {
  return {
    id,
    disciplineId: discipline.id,
    themeId,
    compendiumRefId,
    cycle: 'clinico',
    difficulty: 'medio',
    institution: 'TESTE',
    year: 2026,
    clinicalVignette: '',
    questionStem: '',
    options: [],
    generalCommentary: '',
    highYieldSummary: '',
    tags: [],
  };
}

function makeFlashcard(id: string, partial: Partial<Flashcard> = {}): Flashcard {
  return {
    id,
    disciplineId: discipline.id,
    themeId: theme.id,
    front: 'frente',
    back: 'verso',
    mechanismHighlight: '',
    tags: [],
    difficulty: 'medio',
    srs: {
      intervalDays: 0,
      repetitionCount: 0,
      easeFactor: 2.5,
      nextDueDate: '2026-09-13',
      state: 'new',
      reviewHistory: [],
    },
    ...partial,
  };
}

const compA = makeCompendium('comp-a', 'Material A');
const compB = makeCompendium('comp-b', 'Material B');

function build(overrides: Partial<Parameters<typeof buildThematicStudyData>[0]> = {}) {
  return buildThematicStudyData({
    disciplines: [discipline],
    themes: [theme],
    compendiums: [compA, compB],
    questions: [],
    flashcards: [],
    answers: {},
    ...overrides,
  });
}

describe('buildThematicStudyData', () => {
  it('gera um pack por compêndio, agrupados sob o mesmo tema (cenário 2)', () => {
    const data = build();
    expect(data.groups).toHaveLength(1);
    expect(data.groups[0].themeId).toBe(theme.id);
    expect(data.groups[0].disciplineName).toBe('Cardiologia');
    expect(data.groups[0].packs.map((p) => p.compendiumId)).toEqual(['comp-a', 'comp-b']);
    expect(data.totals.packs).toBe(2);
  });

  it('coloca conteúdo referenciado só no pack correto (cenário 3)', () => {
    const data = build({
      questions: [makeQuestion('q-a', 'comp-a'), makeQuestion('q-b', 'comp-b')],
      flashcards: [makeFlashcard('f-a', { compendiumRefId: 'comp-a' })],
    });
    const [packA, packB] = data.groups[0].packs;
    expect(packA.questions.map((q) => q.id)).toEqual(['q-a']);
    expect(packB.questions.map((q) => q.id)).toEqual(['q-b']);
    expect(packA.flashcards.map((f) => f.id)).toEqual(['f-a']);
    expect(packB.flashcards).toHaveLength(0);
  });

  it('conteúdo do tema sem referência aparece uma única vez, fora dos packs (cenário 4)', () => {
    const data = build({
      questions: [makeQuestion('q-solta', '')],
      flashcards: [makeFlashcard('f-solto', { compendiumRefId: undefined })],
    });
    const group = data.groups[0];
    expect(group.packs.every((p) => p.questions.length === 0 && p.flashcards.length === 0)).toBe(true);
    expect(group.looseQuestions.map((q) => q.id)).toEqual(['q-solta']);
    expect(group.looseFlashcards.map((f) => f.id)).toEqual(['f-solto']);
    expect(data.totals.looseQuestions).toBe(1);
  });

  it('card personalizado fica só em Meus Cards Personalizados (cenário 5)', () => {
    const data = build({
      flashcards: [makeFlashcard('f-custom', { isCustom: true, compendiumRefId: 'comp-a' })],
    });
    expect(data.customFlashcards.map((f) => f.id)).toEqual(['f-custom']);
    expect(listPacks(data).every((p) => p.flashcards.length === 0)).toBe(true);
  });

  it('referência para material indisponível vai para a seção avulsa, sem inferir vínculo', () => {
    const data = build({
      questions: [makeQuestion('q-orfa', 'comp-inexistente')],
      flashcards: [makeFlashcard('f-orfo', { compendiumRefId: 'comp-inexistente' })],
    });
    expect(data.invalidRefQuestions.map((q) => q.id)).toEqual(['q-orfa']);
    expect(data.invalidRefFlashcards.map((f) => f.id)).toEqual(['f-orfo']);
    expect(listPacks(data).every((p) => p.questions.length === 0)).toBe(true);
  });

  it('conteúdo sem material e com tema inexistente fica na seção sem tema', () => {
    const data = build({
      questions: [makeQuestion('q-sem-tema', '', 'tema-que-nao-existe')],
      flashcards: [makeFlashcard('f-sem-tema', { themeId: 'tema-que-nao-existe' })],
    });
    expect(data.unthemedQuestions.map((q) => q.id)).toEqual(['q-sem-tema']);
    expect(data.unthemedFlashcards.map((f) => f.id)).toEqual(['f-sem-tema']);
  });

  it('cada questão e cada card aparecem em exatamente um lugar (invariante anti-duplicação)', () => {
    const questions = [
      makeQuestion('q-a', 'comp-a'),
      makeQuestion('q-b', 'comp-b'),
      makeQuestion('q-solta', ''),
      makeQuestion('q-orfa', 'comp-x'),
      makeQuestion('q-sem-tema', '', 'tema-x'),
    ];
    const flashcards = [
      makeFlashcard('f-a', { compendiumRefId: 'comp-a' }),
      makeFlashcard('f-solto'),
      makeFlashcard('f-custom', { isCustom: true }),
      makeFlashcard('f-orfo', { compendiumRefId: 'comp-x' }),
    ];
    const data = build({ questions, flashcards });

    const questionAppearances = [
      ...listPacks(data).flatMap((p) => p.questions.map((q) => q.id)),
      ...data.groups.flatMap((g) => g.looseQuestions.map((q) => q.id)),
      ...data.invalidRefQuestions.map((q) => q.id),
      ...data.unthemedQuestions.map((q) => q.id),
    ];
    const cardAppearances = [
      ...listPacks(data).flatMap((p) => p.flashcards.map((f) => f.id)),
      ...data.groups.flatMap((g) => g.looseFlashcards.map((f) => f.id)),
      ...data.customFlashcards.map((f) => f.id),
      ...data.invalidRefFlashcards.map((f) => f.id),
      ...data.unthemedFlashcards.map((f) => f.id),
    ];

    expect(questionAppearances.sort()).toEqual(questions.map((q) => q.id).sort());
    expect(new Set(questionAppearances).size).toBe(questions.length);
    expect(cardAppearances.sort()).toEqual(flashcards.map((f) => f.id).sort());
    expect(new Set(cardAppearances).size).toBe(flashcards.length);
  });

  it('calcula progresso, acerto e pendências de SRS a partir dos dados reais', () => {
    const dueCard = makeFlashcard('f-due', {
      compendiumRefId: 'comp-a',
      srs: {
        intervalDays: 1,
        repetitionCount: 1,
        easeFactor: 2.5,
        nextDueDate: '2020-01-01',
        lastReviewedDate: '2019-12-31',
        state: 'review',
        reviewHistory: [],
      },
    });
    const data = build({
      questions: [makeQuestion('q-a', 'comp-a'), makeQuestion('q-a2', 'comp-a')],
      flashcards: [dueCard],
      answers: {
        'q-a': {
          questionId: 'q-a',
          selectedOption: 'A',
          isCorrect: true,
          timestamp: '2026-09-13T00:00:00.000Z',
          timeSpentSeconds: 10,
        },
      },
      readingProgress: { 'comp-a': { readSectionIds: ['s1'], percent: 50 } },
    });
    const packA = findPackById(data, packIdForCompendium('comp-a'));
    expect(packA).not.toBeNull();
    expect(packA?.readPercent).toBe(50);
    expect(packA?.answeredCount).toBe(1);
    expect(packA?.accuracyPercent).toBe(100);
    expect(packA?.dueCards.map((c) => c.id)).toEqual(['f-due']);
    expect(packA?.isUnstarted).toBe(false);
    expect(packA?.isCompleted).toBe(false);
    expect(data.totals.dueCards).toBe(1);
  });

  it('valida id de pack salvo contra os dados atuais (cenário 6, parte pura)', () => {
    const data = build();
    expect(findPackById(data, packIdForCompendium('comp-a'))?.compendiumId).toBe('comp-a');
    expect(findPackById(data, packIdForCompendium('comp-removido'))).toBeNull();
    expect(findPackById(data, null)).toBeNull();
  });
});
