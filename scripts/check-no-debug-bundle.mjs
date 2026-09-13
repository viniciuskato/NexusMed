#!/usr/bin/env node
// ============================================================================
// Gate: nenhuma instrumentação de debug/teste no bundle de PRODUÇÃO.
// ============================================================================
//
// Roda depois de `npm run build` (build de produção real — sem `--mode
// test`, sem VITE_SUPABASE_URL local). Verifica textualmente `dist/assets/*.js`
// em busca de strings que só deveriam existir atrás de `import.meta.env.DEV`
// (ver src/App.tsx e src/services/syncQueue.ts): `__syncDebug` e
// `__setTestBackoffOverride`. Confirmado pelo histórico do projeto
// (docs/SINCRONIZACAO-CONFIAVEL.md, Prompt 07-C2) que o Vite/Rollup remove
// esse bloco por tree-shaking quando `import.meta.env.DEV === false` — este
// script prova isso a cada build, em vez de confiar só na memória do time.
//
// Uso: node scripts/check-no-debug-bundle.mjs [outDir]
// Saída: exit 0 se limpo; exit 1 e lista dos arquivos/strings encontrados
// caso contrário (falha o gate de CI).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2] ?? 'dist';
const forbidden = ['__syncDebug', '__setTestBackoffOverride'];

function listJsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listJsFiles(full));
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

let files;
try {
  files = listJsFiles(join(outDir, 'assets'));
} catch (e) {
  console.error(`[check-no-debug-bundle] não foi possível ler ${outDir}/assets — rode "npm run build" antes. (${e.message})`);
  process.exit(1);
}

if (files.length === 0) {
  console.error(`[check-no-debug-bundle] nenhum arquivo .js encontrado em ${outDir}/assets — build vazio/incompleto?`);
  process.exit(1);
}

const findings = [];
for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  for (const needle of forbidden) {
    if (content.includes(needle)) {
      findings.push({ file, needle });
    }
  }
}

if (findings.length > 0) {
  console.error('[check-no-debug-bundle] FALHOU — instrumentação de debug encontrada no bundle de produção:');
  for (const f of findings) {
    console.error(`  - "${f.needle}" em ${f.file}`);
  }
  process.exit(1);
}

console.log(
  `[check-no-debug-bundle] OK — 0 ocorrências de ${forbidden.map((s) => `"${s}"`).join('/')} em ${files.length} arquivo(s) JS de ${outDir}/assets.`
);
