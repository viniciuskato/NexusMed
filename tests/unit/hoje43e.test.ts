import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Compendium, LastReadingSession, Question, QuestionAnswerRecord } from '../../src/types';
import { respondidaHoje, retomadaDeLeitura, testePendenteHoje } from '../../src/services/hoje';

// 43-E: as regras da tela "Hoje" — quando o "Testar o que li" ainda está por
// fazer, o que conta como respondido hoje e de onde o "Continuar lendo" retoma.

const originalTZ = process.env.TZ;
beforeEach(() => {
  process.env.TZ = 'America/Sao_Paulo';
});
afterEach(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

// 27/09 às 23h em Brasília = 28/09 02:00 UTC.
const agora = new Date('2026-09-28T02:00:00.000Z');
const hojeCedo = '2026-09-27T12:00:00.000Z';
const ontem = '2026-09-26T15:00:00.000Z';

const q = (id: string, links: string[]): Question => ({
  id,
  disciplineId: 'd',
  themeId: 't',
  compendiumRefId: links[0] ?? '',
  materialLinks: links.map((m) => ({ materialId: m })),
  cycle: 'clinico',
  difficulty: 'medio',
  institution: '',
  year: 2026,
  clinicalVignette: '',
  questionStem: `Questão ${id}`,
  options: [],
  generalCommentary: '',
  highYieldSummary: '',
  tags: [],
});

const resposta = (questionId: string, timestamp: string): QuestionAnswerRecord => ({
  questionId,
  selectedOption: 'A',
  isCorrect: true,
  timestamp,
  timeSpentSeconds: 10,
});

const leitura = (materialId: string, ultimaLeitura: string, secoesLidas = 1) => ({ materialId, secoesLidas, ultimaLeitura });

describe('respondidaHoje', () => {
  it('conta a resposta das 22h locais como hoje, mesmo com o dia UTC já virado', () => {
    expect(respondidaHoje(resposta('1', '2026-09-28T01:00:00.000Z'), agora)).toBe(true);
  });

  it('resposta de ontem, sem resposta e data inválida não contam', () => {
    expect(respondidaHoje(resposta('1', ontem), agora)).toBe(false);
    expect(respondidaHoje(undefined, agora)).toBe(false);
    expect(respondidaHoje(resposta('1', 'lixo'), agora)).toBe(false);
  });
});

describe('testePendenteHoje', () => {
  const questions = [q('1', ['a']), q('2', ['b']), q('3', ['a', 'b'])];

  it('leu A hoje: só a questão que cobra apenas A está por testar (a de A e B espera B)', () => {
    const r = testePendenteHoje({
      questions,
      leituras: [leitura('a', hojeCedo)],
      answers: {},
      materiaisExistentes: ['a', 'b'],
      agora,
    });
    expect(r.lidosHoje).toEqual(['a']);
    expect(r.pendentes.map((x) => x.id)).toEqual(['1']);
  });

  it('leu A e B hoje: as três entram', () => {
    const r = testePendenteHoje({
      questions,
      leituras: [leitura('a', hojeCedo), leitura('b', hojeCedo)],
      answers: {},
      materiaisExistentes: ['a', 'b'],
      agora,
    });
    expect(r.pendentes.map((x) => x.id).sort()).toEqual(['1', '2', '3']);
  });

  it('questão já respondida hoje sai; a respondida ontem continua por testar', () => {
    const r = testePendenteHoje({
      questions,
      leituras: [leitura('a', hojeCedo), leitura('b', hojeCedo)],
      answers: { '1': resposta('1', hojeCedo), '2': resposta('2', ontem) },
      materiaisExistentes: ['a', 'b'],
      agora,
    });
    expect(r.pendentes.map((x) => x.id).sort()).toEqual(['2', '3']);
  });

  it('testou tudo o que leu: nada por testar, mas o que foi lido continua listado', () => {
    const r = testePendenteHoje({
      questions,
      leituras: [leitura('a', hojeCedo)],
      answers: { '1': resposta('1', hojeCedo) },
      materiaisExistentes: ['a'],
      agora,
    });
    expect(r.lidosHoje).toEqual(['a']);
    expect(r.pendentes).toEqual([]);
  });

  it('nada lido hoje, leitura de ontem, e seção desmarcada (0 lidas) não geram teste', () => {
    const r = testePendenteHoje({
      questions,
      leituras: [leitura('a', ontem), leitura('b', hojeCedo, 0)],
      answers: {},
      materiaisExistentes: ['a', 'b'],
      agora,
    });
    expect(r.lidosHoje).toEqual([]);
    expect(r.pendentes).toEqual([]);
  });

  it('material lido hoje que o estudante já não vê (despublicado) é ignorado', () => {
    const r = testePendenteHoje({
      questions,
      leituras: [leitura('a', hojeCedo)],
      answers: {},
      materiaisExistentes: ['b'],
      agora,
    });
    expect(r.lidosHoje).toEqual([]);
    expect(r.pendentes).toEqual([]);
  });

  it('material lido sem nenhuma questão que o cobre: nada por testar', () => {
    const r = testePendenteHoje({
      questions,
      leituras: [leitura('c', hojeCedo)],
      answers: {},
      materiaisExistentes: ['a', 'b', 'c'],
      agora,
    });
    expect(r.lidosHoje).toEqual(['c']);
    expect(r.pendentes).toEqual([]);
  });
});

describe('retomadaDeLeitura', () => {
  const material = (id: string, sections: string[]): Compendium => ({
    id,
    disciplineId: 'd',
    themeId: 't',
    title: `Material ${id}`,
    subtitle: '',
    estimatedReadTimeMinutes: 10,
    lastUpdated: '',
    author: '',
    sections: sections.map((s) => ({ id: s, title: `Seção ${s}`, content: '', keyTakeaways: [] })),
    references: [],
  });
  const sessao = (compendiumId: string, sectionId?: string): LastReadingSession => ({
    compendiumId,
    sectionId,
    compendiumTitle: 'título antigo',
    sectionTitle: 'seção antiga',
    updatedAt: 1,
  });

  it('sem sessão de leitura, não há o que continuar', () => {
    expect(retomadaDeLeitura(null, [material('a', ['s1'])])).toBeNull();
  });

  it('retoma o material na seção onde parou, com os títulos de agora', () => {
    expect(retomadaDeLeitura(sessao('a', 's2'), [material('a', ['s1', 's2'])])).toEqual({
      compendiumId: 'a',
      compendiumTitle: 'Material a',
      sectionId: 's2',
      sectionTitle: 'Seção s2',
    });
  });

  it('seção que já não existe: abre o material, sem seção', () => {
    expect(retomadaDeLeitura(sessao('a', 'sumiu'), [material('a', ['s1'])])).toEqual({
      compendiumId: 'a',
      compendiumTitle: 'Material a',
    });
  });

  it('material que o estudante já não vê: não oferece continuar', () => {
    expect(retomadaDeLeitura(sessao('a', 's1'), [material('b', ['s1'])])).toBeNull();
  });
});
