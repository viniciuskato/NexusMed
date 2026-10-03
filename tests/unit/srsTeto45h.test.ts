import { describe, expect, it } from 'vitest';
import { MAX_INTERVAL_DAYS, calculateNextSRS } from '../../src/services/srsAlgorithm';
import type { FlashcardSRS } from '../../src/types';

// 45-H (AUD-08): o teto de intervalo da repetição espaçada é igual no cliente e
// no servidor. O lado do servidor (36500 em `submit_flashcard_review`) é
// conferido em supabase/tests/database/hardening_45h.test.sql.

const base = (over: Partial<FlashcardSRS>): FlashcardSRS => ({
  intervalDays: 0,
  repetitionCount: 0,
  easeFactor: 2.5,
  nextDueDate: new Date().toISOString(),
  state: 'new',
  reviewHistory: [],
  ...over,
});

describe('teto do intervalo (SRS)', () => {
  it('é 36500 dias, o mesmo do SQL', () => {
    expect(MAX_INTERVAL_DAYS).toBe(36500);
  });

  it('"Fácil" sobre um intervalo enorme fica no teto', () => {
    const r = calculateNextSRS(base({ intervalDays: 30000, repetitionCount: 5, easeFactor: 3, state: 'mastered' }), 4);
    expect(r.intervalDays).toBe(36500);
  });
});
