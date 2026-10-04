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
import { montarTrechoDaFigura } from '../../src/utils/figuraDoMaterial';

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
    cabecalho = '**Subtítulo:** Espectro e uso\n**Disciplina:** Farmacologia\n**Tema:** Clínica\n**Tempo estimado de leitura:** 12 minutos\n**Versão do padrão:** 3',
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
  it('o exemplo da seção 1.7 do padrão só tem a pendência da figura pendente (a IA marca o lugar; a imagem é da pessoa)', () => {
    const r = checarMaterialMarkdown(exemploDoPadrao());
    expect(r.errosDeImportacao).toEqual([]);
    expect(r.pendencias.map((p) => p.regra)).toEqual(['figura-pendente']);
    expect(situacaoDaChecagem(r)).toBe('pendencias');
  });

  it('o exemplo da seção 1.7, com o bloco pendente trocado pelo trecho que o botão "Enviar imagem" devolve, sai Conforme', () => {
    // O arquivo do padrão pode estar com fim de linha do Windows na pasta de trabalho.
    const exemplo = exemploDoPadrao().replace(/\r\n/g, '\n');
    const pendente = exemplo.match(/!\[[^\]]*\]\(figura:PENDENTE\)\n(?:.+\n)*?Mostrar:.*/);
    expect(pendente).not.toBeNull();
    const trecho = montarTrechoDaFigura({
      id: '0b9f1a0e-5c2d-4e8a-9a41-3d6b7c8e9f10',
      alt: 'Descrição da imagem',
      legenda: 'Legenda da figura.',
      fonte: 'Autor, título, 2024.',
      numero: 1,
    });
    const r = checarMaterialMarkdown(exemplo.replace(pendente![0], trecho));
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
    expect(ids).toHaveLength(23);
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
    const cabecalho = '**Disciplina:** Farmacologia\n**Tema:** Clínica\n**Tempo estimado de leitura:** 12 minutos\n**Versão do padrão:** 3\n\nIntrodução solta.';
    expect(regras(material({ cabecalho }))).toContain('texto-fora-de-secao');
    const rotuloDesconhecido = '**Disciplina:** Farmacologia\n**Tema:** Clínica\n**Nível:** Subclasse\n**Tempo estimado de leitura:** 12 minutos\n**Versão do padrão:** 3';
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
    for (const v of ['1', '2', '', 'v3']) {
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
    const com = (t: string) => `**Subtítulo:** S\n**Disciplina:** Farmacologia\n**Tema:** Clínica\n${t}**Versão do padrão:** 3`;
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

  it('[N] solto depois de palavra terminada em "de" é citação malformada', () => {
    for (const antes of ['Reduz a mortalidade', 'Na saúde', 'Com a idade', 'Por toxicidade', 'Pode']) {
      expect(regras(material({ corpo: `${antes} [1] e mais [1](#ref-1)[2](#ref-2).` })), antes).toContain('citacao-malformada');
    }
    expect(regras(material({ corpo: 'Nota de [0, 10] no escore [1](#ref-1)[2](#ref-2).' }))).toEqual([]);
  });

  it('bibliografia com título numerado não é seção descartada', () => {
    for (const titulo of ['Seção 9 — Referências Bibliográficas', '7. Referências']) {
      const texto = material().replace('### Referências Bibliográficas', `### ${titulo}`);
      expect(regras(texto), titulo).toEqual([]);
    }
  });

  it('"volume x", "parte v" em minúscula não são numeração', () => {
    for (const titulo of ['Espirometria: curva volume x tempo', 'Anatomia da parte v do nervo', 'Reposição de volume 30 mL/kg']) {
      expect(regras(material({ titulo })), titulo).toEqual([]);
    }
    expect(regras(material({ titulo: 'Farmacologia — Parte II' }))).toEqual(['titulo-numerado']);
  });

  it('"<=>" de equilíbrio não é comparador', () => {
    expect(regras(material({ corpo: 'CO2 + H2O <=> H2CO3 [1](#ref-1)[2](#ref-2).' }))).toEqual([]);
  });
});

// P9 — figuras (padrão v3): toda figura tem texto alternativo, legenda e fonte e aponta para uma imagem do próprio
// site; imagem fora do bloco de figura e HTML cru são pendências.
describe('checagem do padrão — figuras e imagens (P9)', () => {
  const ID = '0b9f1a0e-5c2d-4e8a-9a41-3d6b7c8e9f10';
  const figura = (linhas: string[]) => `Frase que abre a figura [1](#ref-1).\n\n${linhas.join('\n')}\n\nTexto depois [2](#ref-2).`;
  const CONFORME = [`![Curva fluxo-volume](figura:${ID})`, '**Figura 1.** Curva fluxo-volume normal e obstrutiva.', 'Fonte: Diretriz GOLD, 2024.'];

  it('figura completa, do próprio site, passa sem pendência', () => {
    expect(regras(material({ corpo: figura(CONFORME) }))).toEqual([]);
  });

  it('a citação na linha da fonte conta como citação da referência', () => {
    const corpo = `Frase [1](#ref-1).\n\n![a](figura:${ID})\n**Figura 1.** Legenda.\nFonte: [2](#ref-2)`;
    expect(regras(material({ corpo }))).toEqual([]);
  });

  it('sem legenda, sem fonte ou sem texto alternativo: figura-incompleta, com o que falta', () => {
    const semLegenda = checarMaterialMarkdown(material({ corpo: figura([`![a](figura:${ID})`, 'Fonte: X, 2024.']) })).pendencias;
    expect(semLegenda.map((p) => p.regra)).toEqual(['figura-incompleta']);
    expect(semLegenda[0].mensagem).toContain('falta a legenda');
    const semFonte = checarMaterialMarkdown(material({ corpo: figura([`![a](figura:${ID})`, '**Figura 1.** Legenda.']) })).pendencias;
    expect(semFonte.map((p) => p.regra)).toEqual(['figura-incompleta']);
    expect(semFonte[0].mensagem).toContain('falta a linha "Fonte');
    const semAlt = checarMaterialMarkdown(material({ corpo: figura([`![](figura:${ID})`, '**Figura 1.** Legenda.', 'Fonte: X.']) })).pendencias;
    expect(semAlt.map((p) => p.regra)).toEqual(['figura-incompleta']);
    expect(semAlt[0].mensagem).toContain('texto alternativo');
    const soImagem = checarMaterialMarkdown(material({ corpo: figura([`![a](figura:${ID})`]) })).pendencias;
    expect(soImagem[0].mensagem).toMatch(/falta a legenda.*falta a linha "Fonte/);
  });

  it('a pendência aponta a linha da figura no arquivo', () => {
    const texto = material({ corpo: figura([`![a](figura:${ID})`, 'Fonte: X.']) });
    const [p] = checarMaterialMarkdown(texto).pendencias;
    expect(texto.split('\n')[p.linha - 1]).toContain(`figura:${ID}`);
    expect(p.secao).toBe('Espectro');
  });

  it('figura pendente (a IA marcou o lugar): pendência até a imagem ser enviada', () => {
    const pendente = [
      '![Fluxograma de tratamento](figura:PENDENTE)',
      '**Figura 2.** Escolha do tratamento inicial.',
      'Fonte: sugerida — GOLD 2024.',
      'Mostrar: fluxograma com os grupos A, B e E.',
    ];
    const pend = checarMaterialMarkdown(material({ corpo: figura(pendente) })).pendencias;
    expect(pend.map((p) => p.regra)).toEqual(['figura-pendente']);
    expect(pend[0].mensagem).toContain('Enviar imagem');
    // Identificador trocado, mas a linha "Mostrar:" ficou: também é pendência.
    const resto = [`![a](figura:${ID})`, '**Figura 2.** Legenda.', 'Fonte: X.', 'Mostrar: o esquema.'];
    expect(regras(material({ corpo: figura(resto) }))).toEqual(['figura-pendente']);
  });

  it.each([
    ['endereço externo', 'https://exemplo.com/a.png'],
    ['caminho de arquivo', '/imagens/a.png'],
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:image/png;base64,AAAA'],
    ['identificador malformado', 'figura:123'],
  ])('imagem que não é do site (%s): figura-fora-do-site', (_nome, destino) => {
    const [p, ...resto] = checarMaterialMarkdown(material({ corpo: figura([`![a](${destino})`, '**Figura 1.** L.', 'Fonte: X.']) })).pendencias;
    expect(resto).toEqual([]);
    expect(p.regra).toBe('figura-fora-do-site');
    expect(p.mensagem).toContain('Enviar imagem');
  });

  it('imagem no meio de um parágrafo, numa lista, numa citação ou nos Pontos-Chave: imagem-fora-do-formato', () => {
    const casos = [
      `Texto com ![a](figura:${ID}) no meio [1](#ref-1)[2](#ref-2).`,
      `- item com ![a](figura:${ID}) [1](#ref-1)[2](#ref-2)`,
      `> ![a](figura:${ID}) [1](#ref-1)[2](#ref-2)`,
      `Texto [1](#ref-1)[2](#ref-2).\n\n**Pontos-Chave:**\n- Veja ![a](figura:${ID})`,
      `Texto [1](#ref-1)[2](#ref-2).\n\n> 💡 **Pérola Clínica:** ![a](figura:${ID})`,
      `Texto [1](#ref-1)[2](#ref-2).\n\n![a](https://exemplo.com/a.png) com texto depois`,
    ];
    for (const corpo of casos) {
      expect(regras(material({ corpo })), corpo).toContain('imagem-fora-do-formato');
    }
  });

  it('HTML cru no texto: html-no-texto; sinais de menor e maiúsculas de fórmula não são HTML', () => {
    for (const corpo of [
      'Veja <img src="x.png"> [1](#ref-1)[2](#ref-2).',
      'Texto <script>alert(1)</script> [1](#ref-1)[2](#ref-2).',
      'Texto <b>negrito</b> [1](#ref-1)[2](#ref-2).',
      'Quebra<br/>de linha [1](#ref-1)[2](#ref-2).',
    ]) {
      expect(regras(material({ corpo })), corpo).toEqual(['html-no-texto']);
    }
    expect(regras(material({ corpo: 'Significativo se p<0,05 e tamanho <5 mm; grupo A<B e C>D [1](#ref-1)[2](#ref-2).' }))).toEqual([]);
  });

  it('materiais sem figura continuam sem pendência de figura', () => {
    expect(regras(material())).toEqual([]);
  });
});

// P9 — bloco Atualização: o que mudou e desde quando.
describe('checagem do padrão — bloco Atualização (P9)', () => {
  const com = (bloco: string) => material({ corpo: `Texto [1](#ref-1).\n\n${bloco}\n\nOutro texto [2](#ref-2).` });

  it('com ano ou versão no bloco, passa', () => {
    expect(regras(com('> **Atualização:** a partir de 2023 o grupo E passou a existir [1](#ref-1).'))).toEqual([]);
    expect(regras(com('> **Atualização:** na versão 2.1 da diretriz o corte mudou.'))).toEqual([]);
    expect(regras(com('> **Atualização**: desde 1998 a conduta é outra.'))).toEqual([]);
  });

  it('sem ano nem versão, é pendência na linha do bloco', () => {
    const texto = com('> **Atualização:** a diretriz mudou o corte [1](#ref-1).');
    const [p, ...resto] = checarMaterialMarkdown(texto).pendencias;
    expect(resto).toEqual([]);
    expect(p.regra).toBe('atualizacao-sem-data');
    expect(texto.split('\n')[p.linha - 1]).toContain('**Atualização:**');
    expect(p.mensagem).toMatch(/desde quando/);
  });

  it('bloco de várias linhas e rótulo sem acento ou em minúsculas', () => {
    expect(regras(com('> **Atualização:** a diretriz mudou\n> o corte e o exame.'))).toEqual(['atualizacao-sem-data']);
    expect(regras(com('> **Atualizacao:** mudou o corte.'))).toEqual(['atualizacao-sem-data']);
    expect(regras(com('> **Atualização:** mudou\n> a partir de 2024.'))).toEqual([]);
  });

  it('o ano de outro bloco não vale para este; cada Atualização é conferida', () => {
    expect(regras(com('> **Atualização:** mudou em 2023.\n> **Atualização:** mudou de novo.'))).toEqual(['atualizacao-sem-data']);
  });

  it('as outras caixas com função não exigem data', () => {
    for (const rotulo of ['Cuidado', 'Raciocínio', 'Não confundir', 'Aprofundar', 'Essencial']) {
      expect(regras(com(`> **${rotulo}:** texto sem ano.`)), rotulo).toEqual([]);
    }
  });
});
