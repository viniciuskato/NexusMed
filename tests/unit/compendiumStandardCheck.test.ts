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
    expect(ids).toHaveLength(17);
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

  it('cada trecho malformado aparece uma vez, mesmo contido em outro', () => {
    const [p] = checarMaterialMarkdown(material({ corpo: 'A [1](#ref-1)[2](#ref-2) (#ref-1 e [3](#ref-12].' })).pendencias;
    expect(p.mensagem).toContain('"[3](#ref-12]"');
    expect(p.mensagem).toContain('"(#ref-1"');
  });

  it('as referências contadas são as do último bloco, como na importação', () => {
    const texto = material().replace('### Palavras-chave', '### Valores de referência\nTabela de valores.\n\n### Palavras-chave');
    const r = regras(texto);
    expect(r).not.toContain('citacao-sem-referencia');
    expect(r).not.toContain('referencia-nao-citada');
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
    expect(regras(material({ corpo: `- Um\n\nFrase que apresenta a tabela [1](#ref-1)[2](#ref-2).\n\n${tabela}` }))).toEqual([]);
  });
  it('frase citada colada no fim de uma lista não abre a tabela', () => {
    expect(regras(material({ corpo: `- Um\nFrase da tabela [1](#ref-1)[2](#ref-2).\n\n${tabela}` }))).toContain('tabela-sem-abertura-citada');
  });
});

describe('checagem do padrão — escrita', () => {
  it('LaTeX', () => {
    expect(regras(material({ corpo: 'Inibe a $\\beta$-lactamase [1](#ref-1)[2](#ref-2).' }))).toContain('latex');
    expect(regras(material({ corpo: 'Razão \\frac{a}{b} [1](#ref-1)[2](#ref-2).' }))).toContain('latex');
    expect(regras(material({ corpo: 'Inibe a β-lactamase; custa R$ 10 [1](#ref-1)[2](#ref-2).' }))).not.toContain('latex');
    expect(regras(material({ corpo: 'Custa R$ 10 a R$ 20 [1](#ref-1)[2](#ref-2).' }))).not.toContain('latex');
  });

  it('<= e >=', () => {
    expect(regras(material({ corpo: 'ClCr >= 60 [1](#ref-1)[2](#ref-2).' }))).toContain('comparador-ascii');
    expect(regras(material({ corpo: 'ClCr ≥ 60 [1](#ref-1)[2](#ref-2).' }))).toEqual([]);
  });

  it('lista dentro de lista', () => {
    expect(regras(material({ corpo: 'Itens [1](#ref-1)[2](#ref-2):\n\n- Um\n  - Sub-item\n- Dois' }))).toContain('lista-aninhada');
    expect(regras(material({ corpo: 'Itens [1](#ref-1)[2](#ref-2):\n\n- Um\n- Dois\n\n1. Três\n2. Quatro' }))).toEqual([]);
    expect(regras(material({ corpo: 'Itens [1](#ref-1)[2](#ref-2):\n\n  - Um\n  - Dois' }))).toEqual([]);
    expect(regras(material({ corpo: 'Itens [1](#ref-1)[2](#ref-2):\n\n  - Um\n    - Sub-item' }))).toContain('lista-aninhada');
  });

  it('subtítulo que não é ####', () => {
    expect(regras(material({ corpo: 'A [1](#ref-1)[2](#ref-2).\n\n## Sub' }))).toContain('subtitulo-invalido');
    expect(regras(material({ corpo: 'A [1](#ref-1)[2](#ref-2).\n\n##### Sub' }))).toContain('subtitulo-invalido');
    expect(regras(material({ corpo: 'A [1](#ref-1)[2](#ref-2).\n\n#### Sub\n\nB.' }))).toEqual([]);
  });

  it('texto que remete a outro material', () => {
    expect(regras(material({ corpo: 'Veja o material de penicilinas [1](#ref-1)[2](#ref-2).' }))).toContain('remissao-a-outro-material');
    expect(regras(material({ corpo: 'Isso será aprofundado no próximo módulo [1](#ref-1)[2](#ref-2).' }))).toContain('remissao-a-outro-material');
    expect(regras(material({ corpo: 'Como vimos no material de penicilinas, a ceftriaxona [1](#ref-1)[2](#ref-2).' }))).toContain('remissao-a-outro-material');
    expect(regras(material({ corpo: 'Como vimos acima, colete os seguintes materiais [1](#ref-1)[2](#ref-2).' }))).toEqual([]);
    expect(regras(material({ corpo: 'Veja a seção de dosagem [1](#ref-1)[2](#ref-2).' }))).toEqual([]);
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
    expect(regras(material({ corpo: `${base}> **Alerta importante:** um\n\n> ⚠️ **Alerta de Armadilha:** dois` }))).toEqual([]);
    const [p] = checarMaterialMarkdown(material({ corpo: `${base}> 💡 **Pérola Clínica:** um\n\n> 💡 **Pérola Clínica:** dois` })).pendencias;
    expect(p.mensagem).toMatch(/guarda só o último e o da linha \d+ se perde/);
    expect(regras(material({ corpo: `${base}**Pontos-Chave:**\n- Um\n\n> 💡 **Pérola Clínica:** um\n\n> ⚠️ **Alerta de Armadilha:** um` }))).toEqual([]);
  });

  it('linha de versão do padrão ausente', () => {
    const cabecalho = '**Subtítulo:** S\n**Disciplina:** Farmacologia\n**Tema:** Clínica\n**Tempo estimado de leitura:** 12 minutos';
    expect(regras(material({ cabecalho }))).toEqual(['versao-do-padrao-ausente']);
    for (const v of ['1', '', 'v2']) {
      expect(regras(material({ cabecalho: `${cabecalho}\n**Versão do padrão:** ${v}` }))).toEqual(['versao-do-padrao-ausente']);
    }
  });

  it('seção que a importação descarta', () => {
    const antesDasPalavras = (bloco: string) => material().replace('### Palavras-chave', `${bloco}\n\n### Palavras-chave`);
    expect(regras(antesDasPalavras('### Conexão neuromuscular\nTexto [1](#ref-1).'))).toEqual(['bloco-descartado']);
    expect(regras(antesDasPalavras('### Valores de referência\nTabela de valores.'))).toEqual(['bloco-descartado']);
    expect(regras(material().replace('### Referências', '### Palavras-chave\n`C3G`\n\n### Referências'))).toEqual(['bloco-descartado']);
  });

  it('tempo fora de 8–25 minutos, ou ausente', () => {
    const com = (t: string) => `**Subtítulo:** S\n**Disciplina:** Farmacologia\n**Tema:** Clínica\n${t}**Versão do padrão:** 2`;
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
    expect(regras(material({ titulo: 'Herança ligada ao X' }))).toEqual([]);
    expect(regras(material({ titulo: 'Radiologia: princípios dos raios X' }))).toEqual([]);
  });

  it('numeral romano que faz parte do nome não é numeração', () => {
    for (const titulo of [
      'Reações de hipersensibilidade tipos I e II',
      'MHC classe I e II',
      'Insuficiência cardíaca: classes NYHA I a IV',
      'Bloqueio AV Mobitz II',
      'Nervo craniano VII: anatomia',
      'Hidratação por via IV',
      '5 momentos da higiene das mãos',
    ]) {
      expect(regras(material({ titulo })), titulo).toEqual([]);
    }
  });
});

describe('checagem do padrão — achados da segunda revisão do #85', () => {
  it('sem subtítulo, sem referências ou sem nenhuma citação', () => {
    expect(regras(material().replace('**Subtítulo:** Espectro e uso\n', ''))).toEqual(['item-obrigatorio-ausente']);
    const semBibliografia = material({ corpo: 'Texto sem citação.' }).replace(/### Referências Bibliográficas[\s\S]*$/, '');
    const r = checarMaterialMarkdown(semBibliografia).pendencias.filter((p) => p.regra === 'item-obrigatorio-ausente');
    expect(r.map((p) => p.mensagem)).toEqual([
      expect.stringMatching(/Nenhuma citação no texto/),
      expect.stringMatching(/Falta o bloco "### Referências Bibliográficas"/),
    ]);
  });

  it('seção com "referência" depois da bibliografia: aponta a seção culpada, não a bibliografia', () => {
    const texto = `${material()}\n### Valores de referência laboratoriais\n| A | B |\n`;
    const ps = checarMaterialMarkdown(texto).pendencias.filter((p) => p.regra === 'bloco-descartado');
    expect(ps).toHaveLength(1);
    expect(ps[0].secao).toBe('Valores de referência laboratoriais');
    expect(ps[0].mensagem).toMatch(/no lugar da bibliografia da linha \d+/);
  });

  it('tabela: vale o conteúdo que a importação entrega ao leitor', () => {
    const tabela = '| A | B |\n|---|---|\n| 1 | 2 |';
    // A importação tira os Pontos-Chave; a frase vira parágrafo próprio e abre a tabela.
    expect(regras(material({ corpo: `**Pontos-Chave:**\n- a\nFrase que apresenta [1](#ref-1)[2](#ref-2).\n\n${tabela}` }))).toEqual([]);
    // Rótulo em negrito colado abaixo da frase: o leitor ainda gera a legenda.
    expect(regras(material({ corpo: `Frase [1](#ref-1)[2](#ref-2).\n**Classificação:**\n\n${tabela}` }))).toEqual([]);
  });

  it('intervalo numérico entre colchetes não é citação', () => {
    expect(regras(material({ corpo: 'Escore no intervalo [0, 10] [1](#ref-1)[2](#ref-2).' }))).toEqual([]);
    expect(regras(material({ corpo: 'Faixa [2-4] de pontos [1](#ref-1)[2](#ref-2).' }))).toEqual([]);
    expect(regras(material({ corpo: 'Afirmação [3, 7] [1](#ref-1)[2](#ref-2).' }))).toContain('citacao-malformada');
  });

  it('"<=>" de equilíbrio não é comparador', () => {
    expect(regras(material({ corpo: 'CO2 + H2O <=> H2CO3 [1](#ref-1)[2](#ref-2).' }))).toEqual([]);
  });
});
