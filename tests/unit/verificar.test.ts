import { describe, expect, it } from 'vitest';
import {
  ETAPAS,
  contarTestesPgtap,
  contarTestesUnit,
  linhaDeFalha,
  linhaDeSucesso,
} from '../../scripts/lib/verificar.mjs';

// `npm run verificar` (NM-V): a extração dos totais é função pura. Os trechos
// abaixo são cópias das saídas reais do vitest (com as cores ANSI que ele põe
// quando a saída não é um terminal) e do `supabase test db`.
const ESC = String.fromCharCode(27);

const VITEST_COM_COR =
  ` ${ESC}[32m✓${ESC}[39m ${ESC}[30m${ESC}[42m unit ${ESC}[49m${ESC}[39m tests/unit/syncQueue.classifySyncError.test.ts ${ESC}[2m(${ESC}[22m${ESC}[2m8 tests${ESC}[22m${ESC}[2m)${ESC}[22m${ESC}[32m 9${ESC}[2mms${ESC}[22m${ESC}[39m\n` +
  `\n` +
  `${ESC}[2m Test Files ${ESC}[22m ${ESC}[1m${ESC}[32m140 passed${ESC}[39m${ESC}[22m${ESC}[90m (140)${ESC}[39m\n` +
  `${ESC}[2m      Tests ${ESC}[22m ${ESC}[1m${ESC}[32m1753 passed${ESC}[39m${ESC}[22m${ESC}[90m (1753)${ESC}[39m\n` +
  `${ESC}[2m   Start at ${ESC}[22m 08:27:56\n` +
  `${ESC}[2m   Duration ${ESC}[22m 121.01s${ESC}[2m (transform 61.59s)${ESC}[22m\n`;

const VITEST_SEM_COR = ` Test Files  140 passed (140)\n      Tests  1753 passed (1753)\n   Start at  08:27:56\n`;

const VITEST_COM_FALHA = ` Test Files  1 failed | 139 passed (140)\n      Tests  1 failed | 1752 passed (1753)\n`;

const VITEST_COM_PULADOS = ` Test Files  140 passed (140)\n      Tests  2 skipped | 1751 passed (1753)\n`;

const PGTAP = `test: Supabase local detectado — rodando \`supabase test db\` (pgTAP)...
/Users/x/supabase/tests/database/agendar_revisor_44f.test.sql .............. ok
/Users/x/supabase/tests/database/sync_reliability_categorias_8_9.test.sql ... ok
All tests successful.
Files=35, Tests=1756,  9 wallclock secs ( 0.37 usr  0.19 sys +  0.47 cusr  0.40 csys =  1.43 CPU)
Result: PASS
A new version of Supabase CLI is available: v2.120.0 (currently installed v2.116.0)
`;

describe('contarTestesUnit', () => {
  it('lê o total da linha "Tests" do vitest, com cor ANSI', () => {
    expect(contarTestesUnit(VITEST_COM_COR)).toBe('1753');
  });

  it('lê o total da linha "Tests" sem cor', () => {
    expect(contarTestesUnit(VITEST_SEM_COR)).toBe('1753');
  });

  it('o total é o do parêntese, mesmo com falhos e pulados', () => {
    expect(contarTestesUnit(VITEST_COM_FALHA)).toBe('1753');
    expect(contarTestesUnit(VITEST_COM_PULADOS)).toBe('1753');
  });

  it('não confunde "Test Files" com "Tests"', () => {
    expect(contarTestesUnit(' Test Files  140 passed (140)\n')).toBe('?');
  });

  it('número ausente → "?"', () => {
    expect(contarTestesUnit('')).toBe('?');
    expect(contarTestesUnit('nada que se pareça com o resumo')).toBe('?');
  });
});

describe('contarTestesPgtap', () => {
  it('lê o total da linha "Files=…, Tests=…" do pgTAP', () => {
    expect(contarTestesPgtap(PGTAP)).toBe('1756');
  });

  it('número ausente → "?"', () => {
    expect(contarTestesPgtap('')).toBe('?');
    expect(contarTestesPgtap('All tests successful.\nResult: PASS\n')).toBe('?');
  });
});

describe('linhas finais', () => {
  it('sucesso, no formato exigido', () => {
    expect(linhaDeSucesso('1753', '1756')).toBe(
      'verificar: OK — unit 1753 testes, pgTAP 1756 testes (saída em .verificar/saida.txt)',
    );
  });

  it('sucesso com número que não deu para extrair', () => {
    expect(linhaDeSucesso('?', '?')).toBe(
      'verificar: OK — unit ? testes, pgTAP ? testes (saída em .verificar/saida.txt)',
    );
  });

  it('falha, no formato exigido', () => {
    expect(linhaDeFalha('typecheck')).toBe('verificar: FALHOU typecheck — ver .verificar/saida.txt');
  });

  it('as etapas, em ordem', () => {
    expect(ETAPAS).toEqual(['typecheck', 'lint', 'unit', 'pgTAP', 'build', 'debug-bundle']);
  });
});
