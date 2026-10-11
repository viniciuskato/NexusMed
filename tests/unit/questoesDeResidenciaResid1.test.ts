import { describe, expect, it } from 'vitest';
import {
  ehQuestaoDeResidencia,
  errosDasQuestoes,
  respostasDasQuestoes,
  soQuestoesDeResidencia,
} from '../../src/utils/questoesDeResidencia';
import { acertosPorDisciplina } from '../../src/components/dashboard/painelDados';
import { buildSimuladoSelection } from '../../src/services/simuladoSelection';
import { questoesParaTestar } from '../../src/services/testarOQueLi';
import type { Discipline, ErrorLogItem, Question, QuestionAnswerRecord, SimuladoConfig } from '../../src/types';

// RESID-1 (D-14) — o que é "questão de residência" e que as contas só olham para elas.

const ANO = 2026;

describe('ehQuestaoDeResidencia', () => {
  it.each([
    ['ENARE', 2024],
    ['AOCP / EBSERH', 2014],
    ['  USP  ', 1950],
    ['UNIFESP', ANO],
  ])('é de residência: %s %i', (institution, year) => {
    expect(ehQuestaoDeResidencia({ institution, year }, ANO)).toBe(true);
  });

  it.each([
    ['instituição nula', { institution: null, year: 2024 }],
    ['instituição ausente', { year: 2024 }],
    ['instituição vazia', { institution: '', year: 2024 }],
    ['instituição só com espaços', { institution: '   ', year: 2024 }],
    [
      'instituição autoral do padrão',
      { institution: 'NexusMed (questão autoral, não extraída de prova real)', year: 2024 },
    ],
    ['nexusmed em minúsculas', { institution: 'nexusmed', year: 2024 }],
    ['NEXUSMED com espaço na frente', { institution: '  NEXUSMED autoral', year: 2024 }],
    ['ano nulo', { institution: 'ENARE', year: null }],
    ['ano ausente', { institution: 'ENARE' }],
    ['ano 0 (o que o banco devolve sem ano)', { institution: 'ENARE', year: 0 }],
    ['ano futuro', { institution: 'ENARE', year: ANO + 1 }],
    ['ano antes de 1950', { institution: 'ENARE', year: 1949 }],
    ['ano com casas decimais', { institution: 'ENARE', year: 2020.5 }],
    ['ano que não é número', { institution: 'ENARE', year: Number.NaN }],
  ])('não é de residência: %s', (_nome, dados) => {
    expect(ehQuestaoDeResidencia(dados, ANO)).toBe(false);
  });

  it('o ano atual vem do relógio quando não é informado', () => {
    const anoDoRelogio = new Date().getFullYear();
    expect(ehQuestaoDeResidencia({ institution: 'ENARE', year: anoDoRelogio })).toBe(true);
    expect(ehQuestaoDeResidencia({ institution: 'ENARE', year: anoDoRelogio + 1 })).toBe(false);
  });
});

const questao = (id: string, extra: Partial<Question> = {}): Question =>
  ({
    id,
    disciplineId: 'cm',
    themeId: 't',
    cycle: 'clinico',
    difficulty: 'medio',
    institution: 'ENARE',
    year: 2024,
    ...extra,
  }) as Question;

// 3 de residência + 2 sem banca/ano + 1 autoral.
const conjuntoMisto: Question[] = [
  questao('r1'),
  questao('e1', { institution: '', year: 0 }),
  questao('r2', { institution: 'USP', year: 2019 }),
  questao('e2', { institution: '', year: 0 }),
  questao('a1', { institution: 'NexusMed (questão autoral, não extraída de prova real)', year: 2024 }),
  questao('r3', { institution: 'AOCP / EBSERH', year: 2014 }),
];

const resposta = (questionId: string, isCorrect: boolean): QuestionAnswerRecord => ({
  questionId,
  selectedOption: 'A',
  isCorrect,
  timestamp: new Date().toISOString(),
  timeSpentSeconds: 1,
});

describe('soQuestoesDeResidencia', () => {
  it('fica só com as 3 de residência, na mesma ordem', () => {
    expect(soQuestoesDeResidencia(conjuntoMisto, ANO).map((q) => q.id)).toEqual(['r1', 'r2', 'r3']);
  });

  it('não altera a lista de entrada (a Área Editorial continua com todas)', () => {
    soQuestoesDeResidencia(conjuntoMisto, ANO);
    expect(conjuntoMisto).toHaveLength(6);
  });
});

describe('contas só sobre residência', () => {
  const residencia = soQuestoesDeResidencia(conjuntoMisto, ANO);
  const respostas = {
    r1: resposta('r1', true),
    r2: resposta('r2', false),
    r3: resposta('r3', true),
    // respostas antigas a questões de estudo e autoral: não entram em conta nenhuma
    e1: resposta('e1', false),
    e2: resposta('e2', false),
    a1: resposta('a1', false),
  };

  it('respostasDasQuestoes tira a resposta antiga a questão de fora', () => {
    const validas = respostasDasQuestoes(respostas, residencia);
    expect(Object.keys(validas).sort()).toEqual(['r1', 'r2', 'r3']);
    const certas = Object.values(validas).filter((a) => a.isCorrect).length;
    expect(Math.round((certas / Object.keys(validas).length) * 100)).toBe(67);
  });

  it('acerto por disciplina: 2 de 3 = 67%, sem contar as 3 respostas de fora', () => {
    const disciplinas = [{ id: 'cm', name: 'Clínica Médica' } as Discipline];
    expect(acertosPorDisciplina(disciplinas, residencia, respostas)).toEqual([
      { disciplineId: 'cm', nome: 'Clínica Médica', percentual: 67, respondidas: 3 },
    ]);
  });

  it('errosDasQuestoes tira do caderno de erros o que é de fora', () => {
    const log = (questionId: string) => ({ id: `log-${questionId}`, questionId }) as ErrorLogItem;
    const logs = [log('r2'), log('e1'), log('a1')];
    expect(errosDasQuestoes(logs, residencia).map((l) => l.questionId)).toEqual(['r2']);
  });

  it('montagem do simulado: exatamente as 3 de residência', () => {
    const config = {
      id: 'sim-1',
      disciplineIds: [],
      themeIds: [],
      difficulties: [],
      cycles: [],
      onlyMistakes: false,
      questionCount: 20,
    } as unknown as SimuladoConfig;
    const selecao = buildSimuladoSelection(residencia, config, respostas);
    expect(selecao.eligibleCount).toBe(3);
    expect(selecao.selected.map((q) => q.id).sort()).toEqual(['r1', 'r2', 'r3']);
  });

  it('"Testar o que li": só as de residência entre as que cobram o material', () => {
    const cobram = conjuntoMisto.map((q) => ({ ...q, compendiumRefId: 'm1' }));
    const lista = soQuestoesDeResidencia(cobram, ANO);
    expect(questoesParaTestar(lista, ['m1']).map((q) => q.id)).toEqual(['r1', 'r2', 'r3']);
  });
});
