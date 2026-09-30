import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  PARTE_1_DO_PADRAO,
  PROMPT_CRIAR_MATERIAL,
  PROMPT_REVISAR_MATERIAL,
  TEXTO_COPIAR_CRIAR,
  TEXTO_COPIAR_REVISAR,
} from '../../src/content/padraoMaterial';
import {
  dividirEmBlocos,
  extrairParte1,
  montarTextoParaCopiar,
} from '../../src/utils/padraoMaterial';

// 44-D — a página "Como escrever um material" lê o padrão de conteúdos e os
// dois prompts DOS ARQUIVOS do repositório (import ?raw), sem cópia do texto em
// outro lugar. Estes testes provam: (1) a Parte 1 sai inteira e a Parte 2 não
// vaza; (2) o texto copiado é prompt + Parte 1; (3) os arquivos de texto que
// uma IA de fora recebe não carregam jargão interno (AGENTS.md, risco 19).

const RAIZ = process.cwd();
const ARQUIVO_PADRAO = path.resolve(RAIZ, 'docs/editorial/PADRAO-NEXUSMED-CONTEUDOS.md');
const ARQUIVO_PROMPT_CRIAR = path.resolve(RAIZ, 'docs/editorial/PROMPT-CRIAR-MATERIAL.txt');
const ARQUIVO_PROMPT_REVISAR = path.resolve(RAIZ, 'docs/editorial/PROMPT-REVISAR-MATERIAL.txt');

// Detector de jargão interno. Cada regra tem um nome para a mensagem de falha.
// Mecanismo, não só texto: roda sobre os arquivos reais e também sobre amostras
// que DEVEM ser pegas (teste do detector abaixo), para ele não virar letra morta.
const REGRAS_DE_JARGAO: Array<[string, RegExp]> = [
  ['"Supabase"', /supabase/i],
  ['"Gemini"', /gemini/i],
  ['"pedido.txt"', /pedido\.txt/i],
  ['"diretoria"', /diretoria/i],
  ['"dono"', /\bdono\b/i],
  ['"RPC"', /\brpc\b/i],
  ['nome de arquivo interno (.txt, .ts, .tsx, .sql, .mjs, .json, .yaml)', /\b[\w-]+\.(txt|tsx?|sql|mjs|cjs|json|ya?ml)\b/i],
  ['caminho de pasta do repositório', /\b(src|docs|tests|scripts|supabase|node_modules)\//i],
  ['comando de terminal (npm, npx, git)', /\b(npm|npx|git)\s+\w+/i],
  ['nome de função ou de identificador (chamada com parênteses, camelCase ou snake_case)', /\b[a-z]+[A-Z]\w*\(|\b\w+\(\)|\b[a-z]+_[a-z_]+\b|\b[a-z]+[a-z0-9]*[A-Z][a-zA-Z0-9]+\b/],
  ['nomes de ferramenta de trabalho interna (AGENTS, CLAUDE, Codex)', /\b(AGENTS|CLAUDE|Codex)\b/],
];

function termosInternos(texto: string): string[] {
  return REGRAS_DE_JARGAO.filter(([, regra]) => regra.test(texto)).map(([nome]) => nome);
}

describe('44-D — detector de jargão interno', () => {
  it('pega cada tipo de termo proibido (senão o teste dos arquivos não prova nada)', () => {
    const amostras: Array<[string, string]> = [
      ['"Supabase"', 'guardado no Supabase'],
      ['"Gemini"', 'escrito pelo Gemini'],
      ['"pedido.txt"', 'leia o pedido.txt'],
      ['"diretoria"', 'a diretoria revisa'],
      ['"dono"', 'o dono atesta'],
      ['"RPC"', 'chama a RPC de importação'],
      ['nome de arquivo interno', 'veja compendiumMarkdownImport.ts'],
      ['caminho de pasta do repositório', 'em docs/editorial/PADRAO'],
      ['comando de terminal', 'rode npm run checar'],
      ['nome de função', 'a função import_question_draft'],
    ];
    for (const [rotulo, texto] of amostras) {
      expect(termosInternos(texto).length, rotulo).toBeGreaterThan(0);
    }
  });

  it('não pega texto comum de material (.md, siglas, nomes próprios)', () => {
    const limpo =
      'Entregue um arquivo .md com [1](#ref-1). Consulte o Bulário Eletrônico da ANVISA, o BrCAST e a OMS. PubMed e LaTeX não valem.';
    expect(termosInternos(limpo)).toEqual([]);
  });
});

describe('44-D — a Parte 1 do padrão, lida do mesmo arquivo', () => {
  it('os três arquivos existem em docs/editorial', () => {
    expect(existsSync(ARQUIVO_PADRAO)).toBe(true);
    expect(existsSync(ARQUIVO_PROMPT_CRIAR)).toBe(true);
    expect(existsSync(ARQUIVO_PROMPT_REVISAR)).toBe(true);
  });

  it('contém "1.7 Formato do arquivo" e NÃO contém a Parte 2', () => {
    expect(PARTE_1_DO_PADRAO).toContain('1.7 Formato do arquivo');
    expect(PARTE_1_DO_PADRAO).toContain('1.9 Checklist antes de entregar');
    expect(PARTE_1_DO_PADRAO).not.toContain('Parte 2 — Para quem opera');
    expect(PARTE_1_DO_PADRAO).not.toMatch(/^# Parte 2/m);
    expect(PARTE_1_DO_PADRAO).not.toContain('2.1 Fluxo completo');
  });

  it('é um recorte do arquivo do padrão, sem texto próprio: cada linha existe lá', () => {
    const arquivo = readFileSync(ARQUIVO_PADRAO, 'utf8').replace(/\r\n/g, '\n');
    expect(arquivo).toContain(PARTE_1_DO_PADRAO);
  });

  it('extrairParte1 falha alto se o padrão perder os marcos, em vez de exibir a Parte 2', () => {
    expect(() => extrairParte1('# Como produzir\n\nsem partes')).toThrow();
    expect(extrairParte1('# Intro\n\n# Parte 1 — A\n\ntexto\n\n---\n\n# Parte 2 — B\n\nsegredo')).toBe(
      '# Parte 1 — A\n\ntexto',
    );
  });

  it('tolera fim de linha do Windows', () => {
    expect(extrairParte1('# Parte 1 — A\r\n\r\ntexto\r\n\r\n# Parte 2 — B\r\n')).toBe('# Parte 1 — A\n\ntexto');
  });
});

describe('44-D — dividirEmBlocos separa código de texto', () => {
  it('preserva o bloco de formato (cerca de 4 crases) como código, sem interpretá-lo', () => {
    const md = ['Antes.', '', '````markdown', '# Título completo', '', '### Seção', '````', '', 'Depois.'].join('\n');
    expect(dividirEmBlocos(md)).toEqual([
      { tipo: 'texto', conteudo: 'Antes.' },
      { tipo: 'codigo', conteudo: '# Título completo\n\n### Seção', linguagem: 'markdown' },
      { tipo: 'texto', conteudo: 'Depois.' },
    ]);
  });

  it('a Parte 1 real tem os dois blocos de código (árvore e formato) e o formato começa por "# Título"', () => {
    const codigos = dividirEmBlocos(PARTE_1_DO_PADRAO).filter((b) => b.tipo === 'codigo');
    expect(codigos).toHaveLength(2);
    expect(codigos[1].conteudo.startsWith('# Título completo do material')).toBe(true);
  });
});

describe('44-D — texto copiado = prompt + Parte 1', () => {
  it('criação: começa pelo prompt, contém a Parte 1 inteira, não contém a Parte 2', () => {
    expect(TEXTO_COPIAR_CRIAR.startsWith(PROMPT_CRIAR_MATERIAL.slice(0, 80))).toBe(true);
    expect(TEXTO_COPIAR_CRIAR).toContain(PARTE_1_DO_PADRAO);
    expect(TEXTO_COPIAR_CRIAR).not.toContain('Parte 2 — Para quem opera');
    expect(TEXTO_COPIAR_CRIAR).not.toContain(PROMPT_REVISAR_MATERIAL.slice(0, 80));
    expect(TEXTO_COPIAR_CRIAR.indexOf(PROMPT_CRIAR_MATERIAL)).toBe(0);
  });

  it('revisão: começa pelo prompt, contém a Parte 1 inteira, não contém a Parte 2', () => {
    expect(TEXTO_COPIAR_REVISAR.startsWith(PROMPT_REVISAR_MATERIAL.slice(0, 80))).toBe(true);
    expect(TEXTO_COPIAR_REVISAR).toContain(PARTE_1_DO_PADRAO);
    expect(TEXTO_COPIAR_REVISAR).not.toContain('Parte 2 — Para quem opera');
    expect(TEXTO_COPIAR_REVISAR).not.toContain(PROMPT_CRIAR_MATERIAL.slice(0, 80));
    expect(TEXTO_COPIAR_REVISAR.indexOf(PROMPT_REVISAR_MATERIAL)).toBe(0);
  });

  it('o prompt cita as duas linhas-marca que delimitam o padrão, e elas existem no texto copiado', () => {
    for (const [prompt, copiado] of [
      [PROMPT_CRIAR_MATERIAL, TEXTO_COPIAR_CRIAR],
      [PROMPT_REVISAR_MATERIAL, TEXTO_COPIAR_REVISAR],
    ]) {
      const inicio = '=== PADRÃO NEXUSMED DE CONTEÚDOS — INÍCIO ===';
      const fim = '=== PADRÃO NEXUSMED DE CONTEÚDOS — FIM ===';
      expect(prompt).toContain(inicio);
      expect(prompt).toContain(fim);
      expect(copiado.split('\n')).toContain(inicio);
      expect(copiado.split('\n')).toContain(fim);
      // O prompt cita as marcas entre aspas; o que conta são as linhas soltas.
      const linhas = copiado.split('\n');
      const linhasPadrao = PARTE_1_DO_PADRAO.split('\n').length;
      // marca de início, linha em branco, Parte 1, linha em branco, marca de fim
      expect(linhas.indexOf(fim) - linhas.indexOf(inicio)).toBe(linhasPadrao + 3);
    }
  });

  it('montarTextoParaCopiar é só prompt + marcas + padrão', () => {
    const texto = montarTextoParaCopiar('PROMPT', 'PADRAO');
    expect(texto.startsWith('PROMPT\n')).toBe(true);
    expect(texto.endsWith('=== PADRÃO NEXUSMED DE CONTEÚDOS — FIM ===')).toBe(true);
    expect(texto).toContain('PADRAO');
  });
});

describe('44-D — os textos são autocontidos para quem está de fora (AGENTS.md, risco 19)', () => {
  it('nenhum jargão interno no prompt de criação, no prompt revisor nem na Parte 1', () => {
    expect(termosInternos(PROMPT_CRIAR_MATERIAL), 'prompt de criação').toEqual([]);
    expect(termosInternos(PROMPT_REVISAR_MATERIAL), 'prompt revisor').toEqual([]);
    expect(termosInternos(PARTE_1_DO_PADRAO), 'Parte 1 do padrão').toEqual([]);
  });

  it('o mesmo vale para o texto completo que vai para a área de transferência', () => {
    expect(termosInternos(TEXTO_COPIAR_CRIAR)).toEqual([]);
    expect(termosInternos(TEXTO_COPIAR_REVISAR)).toEqual([]);
  });
});

describe('44-D — conteúdo mínimo de cada prompt', () => {
  it('criação: pede os dados que faltarem e mantém fontes, alto risco, entrega e ciclo de correção', () => {
    const p = PROMPT_CRIAR_MATERIAL;
    for (const trecho of [
      'título',
      'Disciplina e o Tema',
      'nomes exatos do catálogo',
      'nível',
      'tempo-alvo',
      'lugar na árvore',
      'o que o material deve cobrir',
      'Se faltar um dado, pergunte',
      'nenhum livro-texto',
      'Nunca invente referência',
      'LACUNA_DOCUMENTAL',
      'ALTO RISCO',
      '```markdown',
      'PONTOS DE RISCO',
      'Corrija o material conforme os achados abaixo',
      'O QUE MUDEI',
    ]) {
      expect(p, trecho).toContain(trecho);
    }
  });

  it('revisão: fontes pela web, seis grupos, regra e linhas exatas do veredito, bloco de devolução', () => {
    const p = PROMPT_REVISAR_MATERIAL;
    for (const trecho of [
      'não conferida',
      'Nunca presuma que uma fonte confere',
      '1. Fato',
      '2. Referência',
      '3. Ponto de risco',
      '4. Transcrição',
      '5. Escopo do nível',
      '6. Formato e língua',
      '"APTO PARA ENVIAR"',
      '"NÃO APTO — N achados graves"',
      'Qualquer achado grave (grupos 1 a 4) ou qualquer afirmação de alto risco não conferida torna o material NÃO APTO',
      'Corrija o material conforme os achados abaixo',
    ]) {
      expect(p, trecho).toContain(trecho);
    }
  });

  it('revisão: a linha de veredito é a última antes do bloco de correção e única (o revisor automático a lê por máquina)', () => {
    const p = PROMPT_REVISAR_MATERIAL;
    const veredito = p.indexOf('(c) Veredito: uma linha só, a última antes do bloco de correção');
    const bloco = p.indexOf('(d) UM único bloco de código');
    expect(veredito).toBeGreaterThan(-1);
    expect(bloco).toBeGreaterThan(veredito);
    expect(p).toContain('nenhuma outra linha da resposta começa com "APTO" ou com "NÃO APTO"');
    // Nada entre as duas exigências que pudesse ficar depois do veredito e antes do bloco.
    expect(p.indexOf('(b) O que você não conseguiu conferir')).toBeLessThan(veredito);
    // A regra do veredito vem antes de a resposta ser montada.
    expect(p.indexOf('REGRA DO VEREDITO')).toBeLessThan(p.indexOf('COMO TERMINAR A RESPOSTA'));
  });

  it('nenhum dos dois prompts fala em atestação ou em pessoa que atesta (o revisor de IA é quem confere)', () => {
    expect(PROMPT_CRIAR_MATERIAL).not.toMatch(/ateste|atesta/i);
    expect(PROMPT_REVISAR_MATERIAL).not.toMatch(/ateste|atesta/i);
  });
});
