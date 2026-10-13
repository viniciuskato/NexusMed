// Funções puras do `npm run verificar` (NM-V): leitura dos totais de teste nas
// saídas do vitest e do pgTAP, e as linhas finais. Provadas em
// tests/unit/verificar.test.ts, com trechos reais das duas saídas.

export const ETAPAS = ['typecheck', 'lint', 'unit', 'pgTAP', 'build', 'debug-bundle'];

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

function semCor(texto) {
  return String(texto ?? '').replace(ANSI, '');
}

// vitest: "      Tests  2140 passed (2140)" ou "Tests  1 failed | 2139 passed
// (2140)". O total é o número entre parênteses. "Test Files" não casa.
export function contarTestesUnit(saida) {
  const achou = /^\s*Tests\s+.*\((\d+)\)\s*$/m.exec(semCor(saida));
  return achou?.[1] ?? '?';
}

// `supabase test db`: "Files=21, Tests=747,  2 wallclock secs (...)".
export function contarTestesPgtap(saida) {
  const achou = /\bFiles=\d+,\s*Tests=(\d+)\b/.exec(semCor(saida));
  return achou?.[1] ?? '?';
}

export function linhaDeSucesso(unit, pgtap) {
  return `verificar: OK — unit ${unit} testes, pgTAP ${pgtap} testes (saída em .verificar/saida.txt)`;
}

export function linhaDeFalha(etapa) {
  return `verificar: FALHOU ${etapa} — ver .verificar/saida.txt`;
}
