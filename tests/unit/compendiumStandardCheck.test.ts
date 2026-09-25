import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  checarMaterialMarkdown,
  formatarChecagemDetalhada,
  formatarResumoDaChecagem,
  REGRAS_DO_PADRAO,
  situacaoDaChecagem,
  type RegraDoPadraoId,
} from '../../src/utils/compendiumStandardCheck';
import { parseCompendiumMarkdownText } from '../../src/utils/compendiumMarkdownImport';

// Unidade 44-C1: cada regra mecânica do padrão tem um caso que passa e um que
// falha; o exemplo da seção 1.7 do padrão sai "Conforme".

const PADRAO = path.resolve(process.cwd(), 'docs/editorial/PADRAO-NEXUSMED-CONTEUDOS.md');

function exemploDoPadrao(): string {
  const doc = readFileSync(PADRAO, 'utf8');
  const m = doc.match(/## 1\.7[^\n]*\n[\s\S]*?````markdown\r?\n([\s\S]*?)\r?\n````/);
  if (!m) throw new Error('bloco de formato da seção 1.7 não encontrado no padrão');
  return m[1];
}

/** Material mínimo conforme; `corpo` substitui o texto da primeira seção. */
function material(opcoes: { titulo?: string; cabecalho?: string; corpo?: string; extra?: string; refs?: number } = {}): string {
  const {
    titulo = 'Cefalosporinas de terceira geração',
    cabecalho = '**Subtítulo:** Espectro e uso\n**Disciplina:** Farmacologia\n**Tema:** Clínica\n**Tempo estimado de leitura:** 12 minutos\n**Versão do padrão:** 2',
    corpo = 'Texto com citação [1](#ref-1) e outra [2](#ref-2).',
    extra = '',
    refs = 2,
  } = opcoes;
  const lista = Array.from({ length: refs }, (_, k) => `${k + 1}. Fonte ${k + 1}. [Livro-texto]`).join('\n');
  return `# ${titulo}\n\n${cabecalho}\n\n### Espectro\n**Tag de Mecanismo:** Espectro de ação\n\n${corpo}\n${extra}\n### Palavras-chave\n\`C3G\` \`ceftriaxona\`\n\n### Referências Bibliográficas\n${lista}\n`;
}

function regras(texto: string): RegraDoPadraoId[] {
  return checarMaterialMarkdown(texto).pendencias.map((p) => p.regra);
}

describe('checagem do padrão — base', () => {
  it('o exemplo da seção 1.7 do padrão sai Conforme', () => {
    const r = checarMaterialMarkdown(exemploDoPadrao());
    expect(r.pendencias).toEqual([]);
    expect(r.errosDeImportacao).toEqual([]);
    expect(situacaoDaChecagem(r)).toBe('conforme');
    expect(formatarResumoDaChecagem('exemplo.md', r)).toBe('exemplo.md: Conforme');
  });

  it('o material mínimo dos testes também sai Conforme', () => {
    expect(checarMaterialMarkdown(material()).pendencias).toEqual([]);
  });

  it('a lista de regras cobre todos os ids, sem repetição', () => {
    const ids = REGRAS_DO_PADRAO.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(15);
  });

  it('cada pendência traz seção, linha e o que corrigir', () => {
    const texto = material({ corpo: 'Dose ajustada se ClCr <= 30 [1](#ref-1)[2](#ref-2).' });
    const [p] = checarMaterialMarkdown(texto).pendencias;
    expect(p).toMatchObject({ regra: 'comparador-ascii', secao: 'Espectro' });
    expect(texto.split('\n')[p.linha - 1]).toContain('<=');
    expect(p.mensagem).toMatch(/≤/);
    expect(formatarChecagemDetalhada('x.md', checarMaterialMarkdown(texto))).toContain(`linha ${p.linha} · Espectro · `);
  });
});

describe('checagem do padrão — arquivo que a importação recusa', () => {
  it('aparece como erro, com a mesma mensagem da importação', () => {
    const semTema = material().replace('**Tema:** Clínica\n', '');
    const importacao = parseCompendiumMarkdownText(semTema, [], [], []);
    expect(importacao.ok).toBe(false);
    const r = checarMaterialMarkdown(semTema);
    expect(situacaoDaChecagem(r)).toBe('erro');
    expect(r.errosDeImportacao).toEqual(importacao.ok ? [] : importacao.errors);
    expect(formatarResumoDaChecagem('x.md', r)).toContain('O arquivo não informa o tema');
  });

  it('arquivo sem seção de conteúdo é erro', () => {
    const r = checarMaterialMarkdown('# Só título\n\n**Disciplina:** X\n**Tema:** Y\n');
    expect(r.errosDeImportacao[0]).toMatch(/nenhuma seção de conteúdo/);
  });
});

describe('checagem do padrão — citações', () => {
  it('[N] solto e (#ref-N] são citação malformada', () => {
    expect(regras(material({ corpo: 'Afirmação [1] e outra [2](#ref-2).' }))).toContain('citacao-malformada');
    expect(regras(material({ corpo: 'Afirmação [1](#ref-1), [2](#ref-2].' }))).toContain('citacao-malformada');
    expect(regras(material({ corpo: 'Afirmação [1](#ref-2)[2](#ref-2) [1](#ref-1).' }))).toContain('citacao-malformada');
  });

  it('citação bem formada e colchete de texto não são pendência', () => {
    expect(regras(material({ corpo: 'Afirmação [1](#ref-1)[2](#ref-2) e [nota] de texto.' }))).toEqual([]);
  });

  it('citação para referência que não existe', () => {
    expect(regras(material({ corpo: 'A [1](#ref-1)[2](#ref-2)[3](#ref-3).' }))).toContain('citacao-sem-referencia');
    expect(regras(material({ corpo: 'A [1](#ref-1)[2](#ref-2).' }))).not.toContain('citacao-sem-referencia');
  });

  it('referência nunca citada aponta a linha dela na lista', () => {
    const texto = material({ corpo: 'Só a primeira [1](#ref-1).' });
    const p = checarMaterialMarkdown(texto).pendencias.find((x) => x.regra === 'referencia-nao-citada');
    expect(p?.secao).toBe('Referências Bibliográficas');
    expect(texto.split('\n')[(p?.linha ?? 0) - 1]).toMatch(/^2\. Fonte 2/);
    expect(regras(material())).not.toContain('referencia-nao-citada');
  });
});

describe('checagem do padrão — tabelas', () => {
  const tabela = '| A | B |\n|---|---|\n| 1 | 2 |';
  it('tabela sem frase de abertura citada', () => {
    expect(regras(material({ corpo: `Citação [1](#ref-1)[2](#ref-2).\n\n#### Sub\n\n${tabela}` }))).toContain('tabela-sem-abertura-citada');
    expect(regras(material({ corpo: `Citação [1](#ref-1)[2](#ref-2).\n\nFrase sem citação.\n\n${tabela}` }))).toContain('tabela-sem-abertura-citada');
  });
  it('tabela com frase de abertura citada passa', () => {
    expect(regras(material({ corpo: `Frase que apresenta a tabela [1](#ref-1)[2](#ref-2).\n\n${tabela}` }))).toEqual([]);
  });
});

describe('checagem do padrão — escrita', () => {
  it('LaTeX', () => {
    expect(regras(material({ corpo: 'Inibe a $\\beta$-lactamase [1](#ref-1)[2](#ref-2).' }))).toContain('latex');
    expect(regras(material({ corpo: 'Razão \\frac{a}{b} [1](#ref-1)[2](#ref-2).' }))).toContain('latex');
    expect(regras(material({ corpo: 'Inibe a β-lactamase; custa R$ 10 [1](#ref-1)[2](#ref-2).' }))).not.toContain('latex');
  });

  it('<= e >=', () => {
    expect(regras(material({ corpo: 'ClCr >= 60 [1](#ref-1)[2](#ref-2).' }))).toContain('comparador-ascii');
    expect(regras(material({ corpo: 'ClCr ≥ 60 [1](#ref-1)[2](#ref-2).' }))).toEqual([]);
  });

  it('lista dentro de lista', () => {
    expect(regras(material({ corpo: 'Itens [1](#ref-1)[2](#ref-2):\n\n- Um\n  - Sub-item\n- Dois' }))).toContain('lista-aninhada');
    expect(regras(material({ corpo: 'Itens [1](#ref-1)[2](#ref-2):\n\n- Um\n- Dois\n\n1. Três\n2. Quatro' }))).toEqual([]);
  });

  it('subtítulo que não é ####', () => {
    expect(regras(material({ corpo: 'A [1](#ref-1)[2](#ref-2).\n\n## Sub' }))).toContain('subtitulo-invalido');
    expect(regras(material({ corpo: 'A [1](#ref-1)[2](#ref-2).\n\n##### Sub' }))).toContain('subtitulo-invalido');
    expect(regras(material({ corpo: 'A [1](#ref-1)[2](#ref-2).\n\n#### Sub\n\nB.' }))).toEqual([]);
  });

  it('texto que remete a outro material', () => {
    expect(regras(material({ corpo: 'Veja o material de penicilinas [1](#ref-1)[2](#ref-2).' }))).toContain('remissao-a-outro-material');
    expect(regras(material({ corpo: 'Isso será aprofundado no próximo módulo [1](#ref-1)[2](#ref-2).' }))).toContain('remissao-a-outro-material');
    expect(regras(material({ corpo: 'Como vimos, a ceftriaxona [1](#ref-1)[2](#ref-2).' }))).toContain('remissao-a-outro-material');
    expect(regras(material({ corpo: 'A meningite bacteriana exige penetração liquórica [1](#ref-1)[2](#ref-2).' }))).toEqual([]);
  });
});

describe('checagem do padrão — estrutura', () => {
  it('texto entre os metadados e a primeira seção', () => {
    const cabecalho = '**Disciplina:** Farmacologia\n**Tema:** Clínica\n**Tempo estimado de leitura:** 12 minutos\n**Versão do padrão:** 2\n\nIntrodução solta.';
    expect(regras(material({ cabecalho }))).toContain('texto-fora-de-secao');
    const rotuloDesconhecido = '**Disciplina:** Farmacologia\n**Tema:** Clínica\n**Nível:** Subclasse\n**Tempo estimado de leitura:** 12 minutos\n**Versão do padrão:** 2';
    expect(regras(material({ cabecalho: rotuloDesconhecido }))).toContain('texto-fora-de-secao');
  });

  it('mais de um bloco de Pontos-Chave, Pérola ou Alerta na mesma seção', () => {
    const base = 'A [1](#ref-1)[2](#ref-2).\n\n';
    expect(regras(material({ corpo: `${base}**Pontos-Chave:**\n- Um\n\n**Pontos-Chave:**\n- Dois` }))).toContain('bloco-repetido');
    expect(regras(material({ corpo: `${base}> 💡 **Pérola Clínica:** um\n\n> 💡 **Pérola Clínica:** dois` }))).toContain('bloco-repetido');
    expect(regras(material({ corpo: `${base}> ⚠️ **Alerta de Armadilha:** um\n\n> **Alerta:** dois` }))).toContain('bloco-repetido');
    expect(regras(material({ corpo: `${base}**Pontos-Chave:**\n- Um\n\n> 💡 **Pérola Clínica:** um\n\n> ⚠️ **Alerta de Armadilha:** um` }))).toEqual([]);
  });

  it('linha de versão do padrão ausente', () => {
    const cabecalho = '**Disciplina:** Farmacologia\n**Tema:** Clínica\n**Tempo estimado de leitura:** 12 minutos';
    expect(regras(material({ cabecalho }))).toEqual(['versao-do-padrao-ausente']);
  });

  it('tempo fora de 8–25 minutos, ou ausente', () => {
    const com = (t: string) => `**Disciplina:** Farmacologia\n**Tema:** Clínica\n${t}**Versão do padrão:** 2`;
    expect(regras(material({ cabecalho: com('**Tempo estimado de leitura:** 30 minutos\n') }))).toEqual(['tempo-fora-da-faixa']);
    expect(regras(material({ cabecalho: com('**Tempo estimado de leitura:** 5 minutos\n') }))).toEqual(['tempo-fora-da-faixa']);
    expect(regras(material({ cabecalho: com('') }))).toEqual(['tempo-fora-da-faixa']);
    expect(regras(material({ cabecalho: com('**Tempo estimado de leitura:** 8 minutos\n') }))).toEqual([]);
    expect(regras(material({ cabecalho: com('**Tempo estimado de leitura:** 25 minutos\n') }))).toEqual([]);
  });

  it('sem palavras-chave', () => {
    expect(regras(material().replace('`C3G` `ceftriaxona`', 'C3G, ceftriaxona'))).toEqual(['sem-palavras-chave']);
    expect(regras(material().replace(/### Palavras-chave\n.*\n\n/, ''))).toEqual(['sem-palavras-chave']);
  });

  it('título com numeração', () => {
    expect(regras(material({ titulo: 'Antimicrobianos I: Betalactâmicos' }))).toEqual(['titulo-numerado']);
    expect(regras(material({ titulo: 'Módulo 2 — Penicilinas' }))).toEqual(['titulo-numerado']);
    expect(regras(material({ titulo: '3. Carbapenêmicos' }))).toEqual(['titulo-numerado']);
    expect(regras(material({ titulo: 'Reação de hipersensibilidade tipo I' }))).toEqual([]);
    expect(regras(material({ titulo: 'Unidade vascular e parte distal' }))).toEqual([]);
  });
});
