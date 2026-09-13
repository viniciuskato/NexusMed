import { describe, it, expect } from 'vitest';
import { buildSimuladoSelection, selectEligibleQuestions } from '../../src/services/simuladoSelection';
import type { Question, QuestionAnswerRecord, SimuladoConfig } from '../../src/types';

// Regressão direta da armadilha #17 (AGENTS.md): handleStartCustomSimulado
// ignorava disciplineIds/onlyMistakes/questionCount e rodava contra o banco
// inteiro. Estes testes provam a função pura que corrigiu isso, sem precisar
// de navegador — a parte de "chamar isso a partir de uma única ação do
// usuário, sem re-sortear a cada render" continua exigindo Playwright (ver
// tests/e2e).

function makeQuestion(partial: Partial<Question> & { id: string }): Question {
  return {
    disciplineId: 'disc-a',
    themeId: 'tema-a',
    compendiumRefId: 'comp-1',
    cycle: 'internato',
    difficulty: 'medio',
    institution: 'ENARE',
    year: 2024,
    clinicalVignette: 'Vinheta',
    questionStem: 'Enunciado',
    options: [],
    generalCommentary: '',
    highYieldSummary: '',
    tags: [],
    ...partial,
  } as Question;
}

function makeConfig(partial: Partial<SimuladoConfig>): SimuladoConfig {
  return {
    id: 'config-1',
    name: 'Simulado teste',
    disciplineIds: [],
    themeIds: [],
    difficulties: [],
    cycles: [],
    onlyMistakes: false,
    questionCount: 10,
    timeLimitMinutes: 20,
    isExamMode: false,
    ...partial,
  };
}

const answers: Record<string, QuestionAnswerRecord> = {};

describe('selectEligibleQuestions', () => {
  it('lista vazia de filtro = sem restrição (não filtra nada)', () => {
    const questions = [makeQuestion({ id: 'q1', disciplineId: 'cardio' }), makeQuestion({ id: 'q2', disciplineId: 'infecto' })];
    const config = makeConfig({});
    expect(selectEligibleQuestions(questions, config, answers)).toHaveLength(2);
  });

  it('filtra por disciplineIds quando informado', () => {
    const questions = [makeQuestion({ id: 'q1', disciplineId: 'cardio' }), makeQuestion({ id: 'q2', disciplineId: 'infecto' })];
    const config = makeConfig({ disciplineIds: ['cardio'] });
    const result = selectEligibleQuestions(questions, config, answers);
    expect(result.map((q) => q.id)).toEqual(['q1']);
  });

  it('onlyMistakes exige resposta existente E incorreta', () => {
    const questions = [makeQuestion({ id: 'q1' }), makeQuestion({ id: 'q2' }), makeQuestion({ id: 'q3' })];
    const withAnswers: Record<string, QuestionAnswerRecord> = {
      q1: { questionId: 'q1', selectedOption: 'A', isCorrect: false, timestamp: '', timeSpentSeconds: 1 },
      q2: { questionId: 'q2', selectedOption: 'A', isCorrect: true, timestamp: '', timeSpentSeconds: 1 },
      // q3 nunca respondida
    };
    const config = makeConfig({ onlyMistakes: true });
    const result = selectEligibleQuestions(questions, config, withAnswers);
    expect(result.map((q) => q.id)).toEqual(['q1']);
  });
});

describe('buildSimuladoSelection', () => {
  it('corta pela quantidade pedida quando há mais elegíveis que questionCount', () => {
    const questions = Array.from({ length: 20 }, (_, i) => makeQuestion({ id: `q${i}` }));
    const config = makeConfig({ questionCount: 5 });
    const result = buildSimuladoSelection(questions, config, answers);
    expect(result.selected).toHaveLength(5);
    expect(result.eligibleCount).toBe(20);
    expect(result.requestedCount).toBe(5);
  });

  it('nunca lança e devolve todas as elegíveis quando há menos que o pedido', () => {
    const questions = [makeQuestion({ id: 'q1' }), makeQuestion({ id: 'q2' })];
    const config = makeConfig({ questionCount: 50 });
    const result = buildSimuladoSelection(questions, config, answers);
    expect(result.selected).toHaveLength(2);
    expect(result.eligibleCount).toBe(2);
  });

  it('é determinístico: mesma config.id sempre produz a mesma seleção/ordem', () => {
    const questions = Array.from({ length: 30 }, (_, i) => makeQuestion({ id: `q${i}` }));
    const config = makeConfig({ id: 'sessao-fixa-123', questionCount: 8 });
    const r1 = buildSimuladoSelection(questions, config, answers);
    const r2 = buildSimuladoSelection(questions, config, answers);
    expect(r1.selected.map((q) => q.id)).toEqual(r2.selected.map((q) => q.id));
  });

  it('duas sessões com ids diferentes tendem a sortear subconjuntos diferentes', () => {
    const questions = Array.from({ length: 50 }, (_, i) => makeQuestion({ id: `q${i}` }));
    const configA = makeConfig({ id: 'sessao-a', questionCount: 10 });
    const configB = makeConfig({ id: 'sessao-b', questionCount: 10 });
    const rA = buildSimuladoSelection(questions, configA, answers);
    const rB = buildSimuladoSelection(questions, configB, answers);
    expect(rA.selected.map((q) => q.id)).not.toEqual(rB.selected.map((q) => q.id));
  });
});
