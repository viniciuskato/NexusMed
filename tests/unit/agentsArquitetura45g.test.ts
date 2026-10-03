import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 45-G (D-2), revisão do #93 (item 9): o AGENTS.md é o índice que toda sessão
// lê primeiro. Ele não pode descrever a leitura dos repositórios como "cai pra
// localStorage em erro" — a 45-G tirou justamente essa queda.
describe('AGENTS.md — arquitetura da camada de dados', () => {
  const agents = readFileSync(resolve(__dirname, '../../AGENTS.md'), 'utf-8');

  it('não descreve mais a leitura caindo no localStorage em erro', () => {
    expect(agents).not.toMatch(/cai pra localStorage em erro/);
  });

  it('diz que a leitura é só do servidor e que a tela avisa "sem conexão"', () => {
    expect(agents).toMatch(/só do servidor/);
    expect(agents).toMatch(/sem conexão/);
  });
});
