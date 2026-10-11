import { describe, expect, it } from 'vitest';
import { acertosPorDisciplina } from '../../src/components/dashboard/painelDados';
import type { Discipline, Question, QuestionAnswerRecord } from '../../src/types';

// PAINEL-1 — a conta de acertos por disciplina (hoje no Início; ver painelDadosPainel2.test.ts para o resto).

const disc = (id: string, name: string): Discipline => ({ id, name }) as Discipline;
const q = (id: string, disciplineId: string): Question => ({ id, disciplineId }) as Question;
const resp = (questionId: string, isCorrect: boolean): QuestionAnswerRecord => ({
  questionId,
  selectedOption: 'A',
  isCorrect,
  timestamp: new Date().toISOString(),
  timeSpentSeconds: 1,
});
describe('acertosPorDisciplina', () => {
  const disciplinas = [disc('cm', 'Clínica Médica'), disc('pe', 'Pediatria'), disc('gi', 'Ginecologia'), disc('ci', 'Cirurgia')];
  const questoes = [q('1', 'cm'), q('2', 'cm'), q('3', 'cm'), q('4', 'pe'), q('5', 'pe'), q('6', 'gi'), q('7', 'ci')];

  it('só disciplinas com questão respondida, da menor para a maior taxa, com o percentual arredondado', () => {
    const respostas = {
      '1': resp('1', true),
      '2': resp('2', true),
      '3': resp('3', false), // clínica: 2 de 3 = 67%
      '4': resp('4', true),
      '5': resp('5', false), // pediatria: 1 de 2 = 50%
      '6': resp('6', true), // ginecologia: 1 de 1 = 100%
    };
    const lista = acertosPorDisciplina(disciplinas, questoes, respostas);
    expect(lista.map((i) => [i.nome, i.percentual])).toEqual([
      ['Pediatria', 50],
      ['Clínica Médica', 67],
      ['Ginecologia', 100],
    ]);
    // Cirurgia não tem resposta: fora do gráfico.
    expect(lista.some((i) => i.nome === 'Cirurgia')).toBe(false);
  });

  it('sem respostas, ou só de questão que não existe mais, a lista é vazia', () => {
    expect(acertosPorDisciplina(disciplinas, questoes, {})).toEqual([]);
    expect(acertosPorDisciplina(disciplinas, questoes, { x: resp('x', true) })).toEqual([]);
  });

  it('empate de taxa: mais respondidas primeiro, depois ordem alfabética', () => {
    const respostas = { '1': resp('1', true), '2': resp('2', true), '4': resp('4', true), '6': resp('6', true) };
    const lista = acertosPorDisciplina(disciplinas, questoes, respostas);
    expect(lista.map((i) => i.nome)).toEqual(['Clínica Médica', 'Ginecologia', 'Pediatria']);
  });
});
