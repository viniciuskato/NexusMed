import { beforeEach, describe, expect, it } from 'vitest';
import { jaEntrouNestaAba, marcarEntradaNestaAba, NAV_ENTRADA_KEY } from '../../src/utils/navEntrada';

// 43-E: a marca de entrada da aba vale por usuário e por dia local.

describe('navEntrada (43-E)', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('sem marca: não entrou', () => {
    expect(jaEntrouNestaAba('u1')).toBe(false);
  });

  it('mesmo usuário no mesmo dia: já entrou (reload restaura)', () => {
    marcarEntradaNestaAba('u1', new Date(2026, 8, 30, 8, 0));
    expect(jaEntrouNestaAba('u1', new Date(2026, 8, 30, 23, 59))).toBe(true);
  });

  it('virada do dia local: entrada nova', () => {
    marcarEntradaNestaAba('u1', new Date(2026, 8, 30, 23, 59));
    expect(jaEntrouNestaAba('u1', new Date(2026, 9, 1, 0, 1))).toBe(false);
  });

  it('outro usuário na mesma aba: entrada nova', () => {
    marcarEntradaNestaAba('u1');
    expect(jaEntrouNestaAba('u2')).toBe(false);
  });

  it('marca ilegível ou no formato antigo: entrada nova, sem quebrar', () => {
    window.sessionStorage.setItem(NAV_ENTRADA_KEY, 'u1');
    expect(jaEntrouNestaAba('u1')).toBe(false);
    window.sessionStorage.setItem(NAV_ENTRADA_KEY, 'null');
    expect(jaEntrouNestaAba('u1')).toBe(false);
  });
});
