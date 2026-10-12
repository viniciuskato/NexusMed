import { describe, expect, it } from 'vitest';
import {
  acertoGeral,
  acertosPorBanca,
  evolucaoSemanal,
  minhaLeitura,
} from '../../src/components/dashboard/painelDados';
import type { Compendium, Discipline, Question, QuestionAnswerRecord, QuestionAttemptSummary } from '../../src/types';

// PAINEL-2 — as contas do Início, com números calculados à mão.

const disc = (id: string, name: string): Discipline => ({ id, name }) as Discipline;
const material = (
  id: string,
  disciplineId: string,
  secoes: number,
  extra: Partial<Compendium> = {}
): Compendium =>
  ({
    id,
    disciplineId,
    title: `Material ${id.toUpperCase()}`,
    sections: Array.from({ length: secoes }, (_, i) => ({ id: `${id}${i + 1}`, title: `${id}${i + 1}` })),
    ...extra,
  }) as unknown as Compendium;
const q = (id: string, disciplineId: string, institution: string): Question =>
  ({ id, disciplineId, institution }) as Question;
const tentativa = (questionId: string, isCorrect: boolean, quando: Date): QuestionAttemptSummary => ({
  questionId,
  isCorrect,
  timestamp: quando.toISOString(),
});
const resp = (questionId: string, isCorrect: boolean, quando: Date = new Date()): QuestionAnswerRecord => ({
  questionId,
  selectedOption: 'A',
  isCorrect,
  timestamp: quando.toISOString(),
  timeSpentSeconds: 1,
});

describe('minhaLeitura', () => {
  const disciplinas = [disc('cm', 'Clínica Médica'), disc('pe', 'Pediatria'), disc('ci', 'Cirurgia')];
  // A: 4 seções, nenhuma lida (0%). B: 4 seções, 2 lidas (50%). C: 2 seções, 2 lidas (100%).
  const materiais = [material('a', 'cm', 4), material('b', 'cm', 4), material('c', 'pe', 2)];
  const progresso = {
    b: { readSectionIds: ['b1', 'b2'], percent: 50 },
    c: { readSectionIds: ['c1', 'c2'], percent: 100 },
  };

  it('total de partes, por disciplina e por material, com estado exato', () => {
    const leitura = minhaLeitura(disciplinas, materiais, progresso);
    expect([leitura.lidas, leitura.total, leitura.percentual]).toEqual([4, 10, 40]);
    // Cirurgia não tem material: fica fora.
    expect(leitura.disciplinas.map((d) => [d.nome, d.lidas, d.total, d.percentual])).toEqual([
      ['Clínica Médica', 2, 8, 25],
      ['Pediatria', 2, 2, 100],
    ]);
    const todos = leitura.disciplinas.flatMap((d) => d.materiais);
    expect(todos.map((m) => [m.titulo, m.lidas, m.total, m.percentual, m.estado])).toEqual([
      ['Material A', 0, 4, 0, 'nao-comecei'],
      ['Material B', 2, 4, 50, 'lendo'],
      ['Material C', 2, 2, 100, 'lido'],
    ]);
  });

  it('seção marcada que o material não tem mais não conta; rascunho, arquivado e material sem seção ficam de fora', () => {
    const leitura = minhaLeitura(
      disciplinas,
      [
        material('b', 'cm', 4),
        material('d', 'cm', 3, { publicationStatus: 'draft' }),
        material('e', 'cm', 3, { publicationStatus: 'archived' }),
        material('f', 'cm', 0),
        material('g', 'cm', 2, { publicationStatus: 'published' }),
      ],
      {
        b: { readSectionIds: ['b1', 'removida', 'outra-removida'], percent: 75 },
        d: { readSectionIds: ['d1'], percent: 33 },
      }
    );
    expect([leitura.lidas, leitura.total]).toEqual([1, 6]);
    expect(leitura.disciplinas[0].materiais.map((m) => m.titulo)).toEqual(['Material B', 'Material G']);
  });

  it('nunca mostra 0% com algo lido nem 100% com algo faltando', () => {
    const muitas = material('m', 'cm', 300);
    const um = minhaLeitura(disciplinas, [muitas], { m: { readSectionIds: ['m1'], percent: 0 } });
    expect(um.disciplinas[0].materiais[0]).toMatchObject({ lidas: 1, percentual: 1, estado: 'lendo' });
    const quase = minhaLeitura(disciplinas, [muitas], {
      m: { readSectionIds: muitas.sections.slice(0, 299).map((s) => s.id), percent: 99 },
    });
    expect(quase.disciplinas[0].materiais[0]).toMatchObject({ lidas: 299, percentual: 99, estado: 'lendo' });
  });

  it('material de disciplina desconhecida vai para "Outros materiais", e a soma fecha', () => {
    const leitura = minhaLeitura(disciplinas, [material('a', 'cm', 2), material('z', 'sumiu', 2)], {
      z: { readSectionIds: ['z1'], percent: 50 },
    });
    expect(leitura.disciplinas.map((d) => [d.nome, d.lidas, d.total])).toEqual([
      ['Clínica Médica', 0, 2],
      ['Outros materiais', 1, 2],
    ]);
    expect([leitura.lidas, leitura.total]).toEqual([1, 4]);
  });

  it('sem material publicado, o total é 0 de 0', () => {
    expect(minhaLeitura(disciplinas, [], {})).toMatchObject({ lidas: 0, total: 0, percentual: 0, disciplinas: [] });
  });
});

describe('acertoGeral', () => {
  it('3 certas em 4: 75%; sem resposta nenhuma, o percentual é nulo (nunca 0%)', () => {
    const respostas = {
      '1': resp('1', true),
      '2': resp('2', true),
      '3': resp('3', true),
      '4': resp('4', false),
    };
    expect(acertoGeral(respostas)).toEqual({ respondidas: 4, certas: 3, percentual: 75 });
    expect(acertoGeral({})).toEqual({ respondidas: 0, certas: 0, percentual: null });
  });
});

describe('acertosPorBanca', () => {
  const questoes = [
    q('1', 'cm', 'ENARE'),
    q('2', 'cm', 'ENARE'),
    q('3', 'pe', 'ENARE'),
    q('4', 'pe', ' USP '),
    q('5', 'pe', 'USP'),
    q('6', 'cm', 'UNICAMP'),
  ];

  it('só bancas com resposta, da que mais respondeu para a que menos, com o percentual arredondado', () => {
    const respostas = {
      '1': resp('1', true),
      '2': resp('2', false),
      '3': resp('3', true), // ENARE: 2 de 3 = 67%
      '4': resp('4', true),
      '5': resp('5', true), // USP: 2 de 2 = 100% (o espaço do nome não separa a banca)
      // UNICAMP: sem resposta, fora da lista
      sumiu: resp('sumiu', true), // questão que não existe mais: não conta
    };
    expect(acertosPorBanca(questoes, respostas)).toEqual([
      { nome: 'ENARE', respondidas: 3, certas: 2, percentual: 67 },
      { nome: 'USP', respondidas: 2, certas: 2, percentual: 100 },
    ]);
    expect(acertosPorBanca(questoes, {})).toEqual([]);
  });

  it('empate de respondidas: maior acerto primeiro e, depois, ordem alfabética', () => {
    const respostas = {
      '1': resp('1', false),
      '4': resp('4', true),
      '6': resp('6', true),
    };
    expect(acertosPorBanca(questoes, respostas).map((b) => b.nome)).toEqual(['UNICAMP', 'USP', 'ENARE']);
  });
});

describe('evolucaoSemanal', () => {
  // Domingo, 11/10/2026, ao meio-dia (relógio local): a semana atual vai de segunda 05/10 a domingo 11/10.
  const agora = new Date(2026, 9, 11, 12, 0);
  const em = (mes: number, dia: number, hora = 10, minuto = 0) => new Date(2026, mes - 1, dia, hora, minuto);

  it('8 semanas, a atual por último, com os rótulos das segundas-feiras', () => {
    const semanas = evolucaoSemanal([], agora);
    expect(semanas.map((s) => s.rotulo)).toEqual(['17/08', '24/08', '31/08', '07/09', '14/09', '21/09', '28/09', '05/10']);
    expect(semanas[7].inicio).toBe('2026-10-05');
    // Sem resposta nenhuma, toda semana está vazia (nulo), nunca 0%.
    expect(semanas.every((s) => s.percentual === null && s.respondidas === 0)).toBe(true);
  });

  it('percentual por semana, semana sem resposta vazia, e o que está fora da janela não entra', () => {
    const respostas = [
      tentativa('a', true, em(10, 5)), // segunda 05/10 → semana atual
      tentativa('b', false, em(10, 11, 23, 30)), // domingo 11/10 23h30 → semana atual: 1 de 2 = 50%
      tentativa('c', true, em(9, 28, 0, 30)), // segunda 28/09 00h30 → 100%
      tentativa('d', true, em(9, 14)),
      tentativa('e', true, em(9, 16)),
      tentativa('f', false, em(9, 20, 23, 59)), // 14/09: 2 de 3 = 67% (domingo 20/09 ainda é a semana de 14/09)
      tentativa('g', false, em(8, 18)), // 17/08: 0 de 1 = 0% de verdade (respondeu e errou)
      tentativa('h', true, em(8, 16)), // domingo 16/08: semana de 10/08, fora das 8
      tentativa('i', true, em(10, 12)), // segunda 12/10: semana que vem, fora
      { ...tentativa('j', true, em(10, 6)), timestamp: 'lixo' }, // data inválida: fora
    ];
    const semanas = evolucaoSemanal(respostas, agora);
    expect(semanas.map((s) => s.percentual)).toEqual([0, null, null, null, 67, null, 100, 50]);
    expect(semanas.map((s) => s.respondidas)).toEqual([1, 0, 0, 0, 3, 0, 1, 2]);
    expect(semanas.map((s) => s.certas)).toEqual([0, 0, 0, 0, 2, 0, 1, 1]);
  });

  it('usa TODAS as tentativas: errar numa semana e acertar a mesma questão depois dá 0% numa e 100% na outra, não 100% nas duas', () => {
    // Errou na semana de 21/09 e acertou a mesma questão na semana de 05/10.
    const semanas = evolucaoSemanal(
      [tentativa('q1', false, em(9, 22)), tentativa('q1', true, em(10, 6))],
      agora
    );
    expect(semanas.map((s) => s.percentual)).toEqual([null, null, null, null, null, 0, null, 100]);
    expect(semanas.map((s) => s.respondidas)).toEqual([0, 0, 0, 0, 0, 1, 0, 1]);
  });
});
