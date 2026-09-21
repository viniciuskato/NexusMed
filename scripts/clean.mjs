#!/usr/bin/env node
// Substitui o antigo `rm -rf dist server.js` (não funciona no PowerShell
// oficial do projeto — ver AGENTS.md, armadilha #2) por uma remoção
// multiplataforma limitada a artefatos GERADOS do projeto. Nunca apaga
// código-fonte, lockfile, .env* ou dados do usuário.
import { rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');

// Lista fechada de artefatos descartáveis e recriáveis por `npm run build`
// ou por scripts operacionais do projeto — nada aqui é fonte.
const targets = [
  'dist',
  'dist-e2e',
  'playwright-report',
  'test-results',
  'server.js',
  'load-pilot-cardiologia.report.txt',
  'recover-question-references.dry-run.report.txt',
  'recover-question-references.execute.report.txt',
];

for (const target of targets) {
  const fullPath = resolve(projectRoot, target);
  // Trava de segurança: nunca operar fora da raiz do projeto.
  if (!fullPath.startsWith(projectRoot)) {
    console.error(`Recusando remover caminho fora do projeto: ${fullPath}`);
    process.exit(1);
  }
  if (existsSync(fullPath)) {
    rmSync(fullPath, { recursive: true, force: true });
    console.log(`removido: ${target}`);
  }
}

console.log('clean: concluído');
