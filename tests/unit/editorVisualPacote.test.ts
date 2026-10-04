import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// ED-1 — o editor visual não entra no carregamento inicial do app. A biblioteca (TipTap/ProseMirror) só pode ser alcançada
// por um `import()` dinâmico, a partir de `EditorVisualCarregavel`; o módulo de conversão (usado pela guarda na tela de
// leitura) não pode depender dela. O tamanho dos pedaços é conferido no build (ver o RETORNO da ORDEM ED-1).

const RAIZ = path.resolve(process.cwd(), 'src');
const PASTA_DO_EDITOR = path.join(RAIZ, 'components', 'editor');

function arquivos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = path.join(pasta, nome);
    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
  });
}

const fonte = (caminho: string) => readFileSync(caminho, 'utf8');
const codigo = arquivos(RAIZ).filter((f) => /\.(ts|tsx)$/.test(f));
const relativo = (f: string) => path.relative(process.cwd(), f).replaceAll('\\', '/');

/** Importações estáticas (não `import type`) do arquivo. */
function importacoesEstaticas(texto: string): string[] {
  return Array.from(texto.matchAll(/^\s*import\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm)).map((m) => m[1] ?? m[2]);
}

describe('editor visual — fora do carregamento inicial', () => {
  it('nenhum arquivo fora de src/components/editor/ importa @tiptap/* nem o editor carregado direto', () => {
    const infratores: string[] = [];
    for (const arquivo of codigo) {
      if (arquivo.startsWith(PASTA_DO_EDITOR)) continue;
      for (const origem of importacoesEstaticas(fonte(arquivo))) {
        if (origem.startsWith('@tiptap/') || origem.startsWith('prosemirror-')) infratores.push(`${relativo(arquivo)} → ${origem}`);
        if (/components\/editor\/(?!EditorVisualCarregavel|tipos)/.test(origem)) infratores.push(`${relativo(arquivo)} → ${origem}`);
      }
    }
    expect(infratores).toEqual([]);
  });

  it('o carregável só alcança o editor por import() dinâmico; os tipos não puxam a biblioteca', () => {
    const carregavel = fonte(path.join(PASTA_DO_EDITOR, 'EditorVisualCarregavel.tsx'));
    expect(carregavel).toMatch(/import\(\s*['"]\.\/EditorVisualDeSecao['"]\s*\)/);
    expect(importacoesEstaticas(carregavel).filter((o) => o.startsWith('@tiptap/') || o.includes('EditorVisualDeSecao'))).toEqual([]);
    expect(importacoesEstaticas(fonte(path.join(PASTA_DO_EDITOR, 'tipos.ts')))).toEqual([]);
  });

  it('a conversão em src/utils não depende de editor nem de React (a guarda roda sem baixar o editor)', () => {
    const importadas = importacoesEstaticas(fonte(path.join(RAIZ, 'utils', 'editorVisualMarkdown.ts')));
    expect(importadas.sort()).toEqual(['./figuraDoMaterial', './markdownBlocks']);
  });

  it('o que o app inicial importa do editor é só o carregável, os tipos e a conversão', () => {
    const usadoFora = new Set<string>();
    for (const arquivo of codigo) {
      if (arquivo.startsWith(PASTA_DO_EDITOR)) continue;
      for (const origem of importacoesEstaticas(fonte(arquivo))) {
        if (/components\/editor\//.test(origem)) usadoFora.add(origem.split('/').pop() as string);
      }
    }
    // Nesta ORDEM nenhuma tela usa o editor ainda; quando usar (ED-2), só o carregável.
    expect([...usadoFora].filter((n) => n !== 'EditorVisualCarregavel' && n !== 'tipos')).toEqual([]);
  });
});
