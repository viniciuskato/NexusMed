import { describe, expect, it } from 'vitest';
import {
  acertosPorDisciplina,
  cartoesParaHoje,
  materiaisEmAndamento,
  resumoDoBaralho,
} from '../../src/components/dashboard/painelDados';
import type { Compendium, Discipline, Flashcard, Question, QuestionAnswerRecord } from '../../src/types';

// PAINEL-1 — as contas do painel enxuto e do "Meu desempenho".

const disc = (id: string, name: string): Discipline => ({ id, name }) as Discipline;
const q = (id: string, disciplineId: string): Question => ({ id, disciplineId }) as Question;
const resp = (questionId: string, isCorrect: boolean): QuestionAnswerRecord => ({
  questionId,
  selectedOption: 'A',
  isCorrect,
  timestamp: new Date().toISOString(),
  timeSpentSeconds: 1,
});
const material = (id: string, title: string, secoes: string[] = []): Compendium =>
  ({ id, title, sections: secoes.map((s) => ({ id: s, title: s })) }) as unknown as Compendium;
const card = (id: string, extra: Partial<Flashcard> = {}, intervalDays = 1, vencido = false): Flashcard =>
  ({
    id,
    tags: [],
    srs: {
      intervalDays,
      repetitionCount: 1,
      easeFactor: 2.5,
      nextDueDate: new Date(Date.now() + (vencido ? -1 : 10) * 86_400_000).toISOString(),
      state: 'review',
      reviewHistory: [],
    },
    ...extra,
  }) as Flashcard;

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

describe('materiaisEmAndamento', () => {
  const materiais = [
    material('a', 'Alfa', ['a1', 'a2']),
    material('b', 'Beta'),
    material('c', 'Gama'),
    material('d', 'Delta'),
    material('e', 'Épsilon'),
  ];
  const progresso = {
    a: { readSectionIds: ['a1'], percent: 50 },
    b: { readSectionIds: ['x'], percent: 80 },
    c: { readSectionIds: [], percent: 0 },
    d: { readSectionIds: ['x', 'y'], percent: 100 },
    e: { readSectionIds: ['x'], percent: 20 },
    removido: { readSectionIds: ['x'], percent: 30 },
  };

  it('só leitura iniciada e não concluída, do mais adiantado para o menos, no máximo 3; material que não existe mais não entra', () => {
    const lista = materiaisEmAndamento(materiais, progresso, null);
    expect(lista.map((m) => [m.titulo, m.percentual])).toEqual([
      ['Beta', 80],
      ['Alfa', 50],
      ['Épsilon', 20],
    ]);
  });

  it('o material da última sessão vem primeiro, na seção onde parou (se ela ainda existe)', () => {
    const sessao = { compendiumId: 'a', sectionId: 'a2', compendiumTitle: 'Alfa', updatedAt: 1 };
    const lista = materiaisEmAndamento(materiais, progresso, sessao);
    expect(lista[0]).toMatchObject({ compendiumId: 'a', sectionId: 'a2' });
    expect(lista.map((m) => m.compendiumId)).toEqual(['a', 'b', 'e']);

    const secaoQueSumiu = materiaisEmAndamento(materiais, progresso, { ...sessao, sectionId: 'sumiu' });
    expect(secaoQueSumiu[0].sectionId).toBeUndefined();
  });

  it('sem progresso nenhum, a lista é vazia', () => {
    expect(materiaisEmAndamento(materiais, {}, null)).toEqual([]);
  });
});

describe('cartões do painel', () => {
  it('cartoesParaHoje conta só os vencidos (3 de 5)', () => {
    const baralho = [card('1', {}, 1, true), card('2', {}, 1, true), card('3', {}, 1, true), card('4'), card('5')];
    expect(cartoesParaHoje(baralho)).toHaveLength(3);
  });

  it('resumoDoBaralho: cartão escrito pelo usuário não conta como "nascido de um erro", mesmo com questão de origem', () => {
    const baralho = [
      card('de-erro', { questionOriginId: 'q1' }),
      card('escrito-com-origem', { questionOriginId: 'q2', isWritten: true }),
      card('escrito-sem-origem', { isWritten: true }),
      card('err-antigo'),
      card('com-tag', { tags: ['erro'] }),
      card('dominado', {}, 30),
    ];
    const resumo = resumoDoBaralho(baralho, 2, 1);
    expect(resumo.errorLinked).toBe(3); // de-erro, err-antigo, com-tag
    expect(resumo).toMatchObject({ total: 6, due: 2, reviewedToday: 1, mastered: 1, inProgress: 5 });
  });
});
