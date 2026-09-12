#!/usr/bin/env node
// `npm run test` — testes existentes do projeto são os pgTAP em
// supabase/tests/database/*.test.sql, executados via `supabase test db`
// contra o Supabase LOCAL (nunca o remoto — ver AGENTS.md).
//
// Por padrão (`npm run test`, e portanto `npm run verify`) CLI/stack
// ausentes são um FALHA (exit != 0) — um gate que "passa" sem rodar teste
// nenhum é pior que nenhum gate, porque some silenciosamente com a barreira
// pgTAP. Para uma conveniência explícita em ambiente sem Docker/CLI (ex.:
// só quer validar TypeScript/lint/build), use `npm run test:optional`
// (`--optional`), que pula com aviso e exit 0 — mas esse comando NÃO faz
// parte de `npm run verify` e não deve ser tratado como equivalente a rodar
// os testes de verdade.
import { spawnSync } from 'node:child_process';

const optional = process.argv.includes('--optional');

function run(command, args) {
  return spawnSync(command, args, { shell: true, encoding: 'utf8' });
}

function skip(message) {
  if (optional) {
    console.warn(`test:optional: ${message} — pulando pgTAP (modo opcional, exit 0).`);
    process.exit(0);
  }
  console.error(
    `test: ${message} — pgTAP (supabase/tests/database) é obrigatório para \`npm run test\`/` +
      '`npm run verify`. Rode `supabase start` e tente de novo, ou use `npm run test:optional` ' +
      'deliberadamente para pular (nunca dentro de `npm run verify`).',
  );
  process.exit(1);
}

const status = run('supabase', ['status']);

const supabaseCliMissing = status.error != null;
const localStackDown =
  status.status !== 0 ||
  /DB_URL/.test(status.stdout ?? '') === false;

if (supabaseCliMissing) {
  skip('CLI da Supabase não encontrada no PATH');
}

if (localStackDown) {
  skip('Supabase LOCAL não está rodando (`supabase status` não retornou DB_URL)');
}

console.log('test: Supabase local detectado — rodando `supabase test db` (pgTAP)...');
const result = run('supabase', ['test', 'db']);
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
process.exit(result.status ?? 1);
