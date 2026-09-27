import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Question } from '../../src/types';
import {
  juntarLeiturasPendentes,
  materiaisLidosHoje,
  questoesParaTestar,
  type LeituraDeMaterial,
} from '../../src/services/testarOQueLi';

// 43-C: "Testar o que li" — o que conta como lido hoje e quais questões entram.

const originalTZ = process.env.TZ;
beforeEach(() => {
  process.env.TZ = 'America/Sao_Paulo';
});
afterEach(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

const leitura = (materialId: string, ultimaLeitura: string, secoesLidas = 1): LeituraDeMaterial => ({
  materialId,
  secoesLidas,
  ultimaLeitura,
});

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

describe('materiaisLidosHoje', () => {
  // 27/09 às 23h em Brasília = 28/09 02:00 UTC.
  const agora = new Date('2026-09-28T02:00:00.000Z');

  it('conta a leitura das 22h locais como hoje, mesmo com o dia UTC já virado', () => {
    expect(materiaisLidosHoje([leitura('a', '2026-09-28T01:00:00.000Z')], agora)).toEqual(['a']);
  });

  it('deixa de fora a leitura de ontem no fuso do estudante', () => {
    // 27/09 01:00 UTC = 26/09 22h em Brasília.
    expect(materiaisLidosHoje([leitura('a', '2026-09-27T01:00:00.000Z')], agora)).toEqual([]);
  });

  it('deixa de fora material mexido hoje mas sem nenhuma seção lida', () => {
    expect(materiaisLidosHoje([leitura('a', '2026-09-28T01:00:00.000Z', 0)], agora)).toEqual([]);
  });

  it('ordena da leitura mais recente para a mais antiga', () => {
    const lidos = materiaisLidosHoje(
      [leitura('a', '2026-09-27T12:00:00.000Z'), leitura('b', '2026-09-28T01:00:00.000Z')],
      agora
    );
    expect(lidos).toEqual(['b', 'a']);
  });
});

describe('juntarLeiturasPendentes', () => {
  it('seção marcada como lida que ainda não subiu conta como leitura agora', () => {
    const juntas = juntarLeiturasPendentes(
      [leitura('a', '2026-09-20T12:00:00.000Z', 2)],
      [
        { materialId: 'a', isRead: true, criadaEm: '2026-09-28T01:00:00.000Z' },
        { materialId: 'b', isRead: true, criadaEm: '2026-09-28T01:30:00.000Z' },
      ]
    );
    expect(juntas).toEqual([
      leitura('a', '2026-09-28T01:00:00.000Z', 3),
      leitura('b', '2026-09-28T01:30:00.000Z', 1),
    ]);
  });

  it('desmarcar pendente não transforma o material em lido', () => {
    const juntas = juntarLeiturasPendentes([], [{ materialId: 'a', isRead: false, criadaEm: '2026-09-28T01:00:00.000Z' }]);
    expect(juntas).toEqual([]);
  });
});

describe('questoesParaTestar', () => {
  const questoes = [q('so-a', ['a']), q('so-b', ['b']), q('a-e-b', ['a', 'b']), q('sem', [])];

  it('traz as questões que cobram os materiais marcados', () => {
    expect(questoesParaTestar(questoes, ['a']).map((x) => x.id)).toEqual(['so-a']);
  });

  it('questão que cobra vários materiais só entra com todos marcados', () => {
    expect(questoesParaTestar(questoes, ['a', 'b']).map((x) => x.id)).toEqual(['so-a', 'so-b', 'a-e-b']);
  });

  it('questão sem vínculo nunca entra', () => {
    expect(questoesParaTestar(questoes, ['a', 'b']).some((x) => x.id === 'sem')).toBe(false);
  });

  it('nada marcado, nenhuma questão', () => {
    expect(questoesParaTestar(questoes, [])).toEqual([]);
  });
});
