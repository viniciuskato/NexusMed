import { describe, it, expect, afterEach } from 'vitest';
import { diaLocal } from '../../src/utils/diaLocal';

const originalTZ = process.env.TZ;
afterEach(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

describe('diaLocal', () => {
  it('em America/Sao_Paulo, 22h local continua sendo o mesmo dia (o dia UTC já virou)', () => {
    process.env.TZ = 'America/Sao_Paulo';
    expect(diaLocal('2026-09-19T01:00:00.000Z')).toBe('2026-09-18');
    expect(diaLocal(new Date('2026-09-19T01:00:00.000Z'))).toBe('2026-09-18');
  });

  it('meia-noite local já é o dia seguinte', () => {
    process.env.TZ = 'America/Sao_Paulo';
    expect(diaLocal('2026-09-19T03:00:00.000Z')).toBe('2026-09-19');
  });

  it('timestamp inválido devolve string vazia', () => {
    expect(diaLocal('lixo')).toBe('');
  });
});
