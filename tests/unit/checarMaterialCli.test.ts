import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Script `checar:material` (44-C1): arquivo que não pode ser lido é relatado
// e a checagem segue para os demais, com saída 2.

const RAIZ = process.cwd();
const TSX = path.join(RAIZ, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const SCRIPT = path.join(RAIZ, 'scripts', 'checar-material.ts');

let pasta: string;

beforeAll(() => {
  pasta = mkdtempSync(path.join(tmpdir(), 'checar-material-'));
  // Uma pasta com nome de `.md` no meio da lista: ler dá EISDIR.
  mkdirSync(path.join(pasta, 'a-notas.md'));
  writeFileSync(path.join(pasta, 'b-material.md'), '# Só título\n');
});

afterAll(() => {
  rmSync(pasta, { recursive: true, force: true });
});

describe('checar:material — arquivo ilegível', () => {
  it('relata o arquivo, checa os seguintes e sai com 2', () => {
    const r = spawnSync(process.execPath, [TSX, SCRIPT, pasta], { encoding: 'utf8' });
    expect(r.stderr).toMatch(/a-notas\.md/);
    expect(r.stdout).toMatch(/b-material\.md: ERRO/);
    expect(r.status).toBe(2);
  }, 30000);
});
