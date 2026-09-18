import { describe, it, expect } from 'vitest';
import { calculateNextSRS, createInitialSRS } from '../../src/services/srsAlgorithm';

// SM-2 adaptado (escala 1-4). A mesma lógica está portada para SQL em
// submit_flashcard_review (20260909120000_sync_reliability.sql) — se uma
// regra mudar aqui, mudar lá também. Exceção conhecida: o teto de 36500 dias
// (MAX_INTERVAL_DAYS) ainda não existe na versão SQL.

const DAY = new Date('2026-09-18T12:00:00Z');

describe('calculateNextSRS', () => {
  it('aceita estado nulo (card nunca revisado) sem quebrar', () => {
    const next = calculateNextSRS(null, 3, DAY);
    expect(next.intervalDays).toBe(1);
    expect(next.repetitionCount).toBe(1);
    expect(next.state).toBe('review');
    expect(next.reviewHistory).toEqual([{ date: DAY.toISOString(), rating: 3 }]);
  });

  it('progride os intervalos 1 → 2 → round(2 × EF) com "Bom"', () => {
    const r1 = calculateNextSRS(createInitialSRS(), 3, DAY);
    const r2 = calculateNextSRS(r1, 3, DAY);
    const r3 = calculateNextSRS(r2, 3, DAY);
    expect([r1.intervalDays, r2.intervalDays]).toEqual([1, 2]);
    expect(r3.intervalDays).toBe(Math.round(2 * r2.easeFactor));
    expect(r3.reviewHistory).toHaveLength(3);
  });

  it('"Fácil" na segunda revisão pula para 4 dias', () => {
    const r1 = calculateNextSRS(null, 4, DAY);
    const r2 = calculateNextSRS(r1, 4, DAY);
    expect(r2.intervalDays).toBe(4);
  });

  it('"Errei" reinicia repetições e volta para aprendizado', () => {
    let srs = createInitialSRS();
    for (let i = 0; i < 4; i++) srs = calculateNextSRS(srs, 3, DAY);
    const failed = calculateNextSRS(srs, 1, DAY);
    expect(failed.repetitionCount).toBe(0);
    expect(failed.intervalDays).toBe(1);
    expect(failed.state).toBe('learning');
    expect(failed.easeFactor).toBeLessThan(srs.easeFactor);
  });

  it('mantém o fator de facilidade entre 1.3 e 3.0', () => {
    let easy = createInitialSRS();
    let hard = createInitialSRS();
    for (let i = 0; i < 20; i++) {
      easy = calculateNextSRS(easy, 4, DAY);
      hard = calculateNextSRS(hard, 1, DAY);
    }
    expect(easy.easeFactor).toBe(3);
    expect(hard.easeFactor).toBe(1.3);
  });

  it('marca como dominado a partir de 21 dias e agenda a próxima data', () => {
    let srs = createInitialSRS();
    while (srs.state !== 'mastered') srs = calculateNextSRS(srs, 4, DAY);
    expect(srs.intervalDays).toBeGreaterThanOrEqual(21);
    const expected = new Date(DAY);
    expected.setDate(expected.getDate() + srs.intervalDays);
    expect(srs.nextDueDate).toBe(expected.toISOString());
  });
});
