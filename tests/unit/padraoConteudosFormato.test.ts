import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseCompendiumMarkdownText } from '../../src/utils/compendiumMarkdownImport';
import type { Discipline, Theme } from '../../src/types';

// O padrão de conteúdos é entregue a uma IA sem contexto, que devolve um `.md`
// exatamente no formato do bloco da seção 1.7. Se o importador e o padrão
// divergirem, o arquivo produzido "certo" entra errado — e ninguém percebe até
// olhar o material na tela (AGENTS.md, risco 19). Este teste roda o próprio
// bloco de formato do documento pelo importador.

// Vitest roda a partir da raiz do repositório.
const PADRAO = path.resolve(process.cwd(), 'docs/editorial/PADRAO-NEXUSMED-CONTEUDOS.md');

function exemploDeFormato(): string {
  const doc = readFileSync(PADRAO, 'utf8');
  const m = doc.match(/## 1\.7[^\n]*\n[\s\S]*?````markdown\r?\n([\s\S]*?)\r?\n````/);
  if (!m) throw new Error('bloco de formato da seção 1.7 não encontrado no padrão');
  return m[1];
}

const discipline: Discipline = {
  id: 'disc',
  name: 'Nome exato da disciplina no catálogo',
  code: 'X',
  icon: 'book',
  description: '',
  cycle: 'basico',
  color: '#000',
};

const theme: Theme = {
  id: 'tema',
  disciplineId: 'disc',
  name: 'Nome exato do tema no catálogo',
  description: '',
  highYield: false,
  order: 1,
};

describe('padrão de conteúdos — o exemplo da seção 1.7 passa pelo importador', () => {
  it('extrai metadados, seções, palavras-chave e referências sem sobras', () => {
    const result = parseCompendiumMarkdownText(exemploDeFormato(), [discipline], [theme], []);
    expect(result.ok).toBe(true);
    if (result.ok === false) throw new Error(result.errors.join('; '));

    expect(result.preview.title).toBe('Título completo do material');
    expect(result.preview.disciplineId).toBe('disc');
    expect(result.preview.themeId).toBe('tema');
    expect(result.preview.estimatedReadTimeMinutes).toBe(18);

    expect(result.sections.map((s) => s.title)).toEqual(['Título da primeira seção', 'Título da segunda seção']);
    expect(result.tags).toEqual(['palavra-chave 1', 'sigla', 'sinônimo', 'nome comercial']);
    expect(result.references).toHaveLength(2);

    const [primeira] = result.sections;
    expect(primeira.mechanismTag).toBe('Mecanismo de ação');
    expect(primeira.keyTakeaways).toHaveLength(2);
    expect(primeira.clinicalPearl).toBeTruthy();
    expect(primeira.warningAlert).toBeTruthy();
    // Nada do bloco de palavras-chave vaza para o corpo de uma seção.
    expect(result.sections.every((s) => !s.content.includes('`sigla`'))).toBe(true);
  });
});
