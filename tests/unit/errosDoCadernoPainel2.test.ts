import { describe, expect, it } from 'vitest';
import { contagemDosErros } from '../../src/utils/errosDoCaderno';
import { tentativasDasQuestoes } from '../../src/utils/questoesDeResidencia';
import type { ErrorLogItem, QuestionAnswerRecord, QuestionAttemptSummary } from '../../src/types';

// PAINEL-2 — a conta dos erros do Caderno, a mesma do "Erros para revisar" do Início.

const resp = (questionId: string, isCorrect: boolean): QuestionAnswerRecord => ({
  questionId,
  selectedOption: 'A',
  isCorrect,
  timestamp: '2026-10-06T12:00:00.000Z',
  timeSpentSeconds: 1,
});
const log = (id: string, questionId: string, resolved: boolean): ErrorLogItem => ({
  id,
  questionId,
  timestamp: '2026-10-06T12:00:00.000Z',
  selectedOption: 'A',
  correctOption: 'B',
  errorReason: 'lacuna_teorica',
  userNotes: '',
  resolved,
});
const questoes = ['q1', 'q2', 'q3', 'q4'].map((id) => ({ id }));

describe('contagemDosErros', () => {
  it('3 erros, 1 dominado: 2 pendentes (os "erros para revisar")', () => {
    const respostas = { q1: resp('q1', false), q2: resp('q2', false), q3: resp('q3', false), q4: resp('q4', true) };
    const logs = [log('l1', 'q1', false), log('l2', 'q2', true), log('l3', 'q3', false)];
    expect(contagemDosErros(respostas, questoes, logs)).toEqual({ total: 3, dominados: 1, pendentes: 2 });
  });

  it('erro sem entrada no caderno conta como pendente; a entrada mais recente da questão é a que vale', () => {
    const respostas = { q1: resp('q1', false), q2: resp('q2', false) };
    // A lista vem da mais nova para a mais velha: a de cima (não dominada) vale; a de baixo, dominada, não.
    const logs = [log('novo', 'q1', false), log('velho', 'q1', true)];
    expect(contagemDosErros(respostas, questoes, logs)).toEqual({ total: 2, dominados: 0, pendentes: 2 });
  });

  it('resposta a questão de fora da lista e questão acertada não entram', () => {
    const respostas = { q1: resp('q1', true), fora: resp('fora', false), q2: resp('q2', false) };
    expect(contagemDosErros(respostas, questoes, [])).toEqual({ total: 1, dominados: 0, pendentes: 1 });
  });

  it('sem nenhum erro, tudo zero', () => {
    expect(contagemDosErros({}, questoes, [])).toEqual({ total: 0, dominados: 0, pendentes: 0 });
  });
});

describe('tentativasDasQuestoes', () => {
  it('só as tentativas das questões dadas, todas elas (inclusive as repetidas da mesma questão)', () => {
    const t = (questionId: string): QuestionAttemptSummary => ({ questionId, isCorrect: true, timestamp: '2026-10-06T12:00:00.000Z' });
    expect(tentativasDasQuestoes([t('q1'), t('q1'), t('fora'), t('q2')], questoes).map((x) => x.questionId)).toEqual([
      'q1',
      'q1',
      'q2',
    ]);
  });
});
