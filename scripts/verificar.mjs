#!/usr/bin/env node
// `npm run verificar` — o gate local dos agentes (NM-V): typecheck → lint →
// unit → pgTAP → build → debug-bundle. Para na primeira etapa que falhar. A
// saída inteira vai para `.verificar/saida.txt`; o terminal recebe UMA linha
// (exit 0 ou 1).
//
// O pgTAP é `npm run test` (scripts/run-db-tests.mjs), que já falha sem o
// Supabase LOCAL: a checagem não se repete aqui. `npm run verify` e o CI
// seguem como estão.
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contarTestesPgtap, contarTestesUnit, linhaDeFalha, linhaDeSucesso } from './lib/verificar.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const pasta = join(raiz, '.verificar');
const arquivo = join(pasta, 'saida.txt');

// etapa → script do package.json (os mesmos que o CI e o `verify` usam)
const PASSOS = [
  ['typecheck', 'typecheck'],
  ['lint', 'lint'],
  ['unit', 'test:unit'],
  ['pgTAP', 'test'],
  ['build', 'build'],
  ['debug-bundle', 'check:no-debug-bundle'],
];

function rodar(script) {
  // Sem cor: a saída é lida por gente e por regex. Dentro de `npm run`,
  // `npm_execpath` aponta para o npm-cli.js e dispensa o shell (e o .cmd).
  const env = { ...process.env, NO_COLOR: '1' };
  delete env.FORCE_COLOR;
  const opcoes = { cwd: raiz, env, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 };
  const npmCli = process.env.npm_execpath;
  return npmCli
    ? spawnSync(process.execPath, [npmCli, 'run', script], opcoes)
    : spawnSync(`npm run ${script}`, { ...opcoes, shell: true });
}

function anotar(texto) {
  appendFileSync(arquivo, texto);
}

mkdirSync(pasta, { recursive: true });
rmSync(arquivo, { force: true });
writeFileSync(arquivo, `verificar: início ${new Date().toISOString()}\n`);

const totais = {};
for (const [etapa, script] of PASSOS) {
  anotar(`\n===== ${etapa} (npm run ${script}) =====\n`);
  const r = rodar(script);
  const saida = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  anotar(saida);
  if (r.error != null) anotar(`\n[erro ao executar: ${r.error.message}]\n`);
  anotar(`\n----- ${etapa}: exit ${r.status ?? 'sem código'} -----\n`);
  if (r.error != null || r.status !== 0) {
    console.log(linhaDeFalha(etapa));
    process.exit(1);
  }
  if (etapa === 'unit') totais.unit = contarTestesUnit(saida);
  if (etapa === 'pgTAP') totais.pgtap = contarTestesPgtap(saida);
}

console.log(linhaDeSucesso(totais.unit ?? '?', totais.pgtap ?? '?'));
