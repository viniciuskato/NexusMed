import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  PADRAO_DE_QUESTOES,
  PROMPT_CRIAR_QUESTOES,
  PROMPT_REVISAR_QUESTOES,
  TEXTO_COPIAR_CRIAR_QUESTOES,
  TEXTO_COPIAR_REVISAR_QUESTOES,
} from '../../src/content/padraoQuestoes';
import {
  MARCA_FIM_PADRAO_QUESTOES,
  MARCA_INICIO_PADRAO_QUESTOES,
  dividirEmBlocos,
  extrairPadraoDeQuestoes,
  montarTextoParaCopiar,
} from '../../src/utils/padraoMaterial';
import { parseQuestionsMarkdownText } from '../../src/utils/questionsImport';
import { avaliarLote, lerLoteDeQuestoes } from '../../src/utils/envioDeQuestoes';
import { lerVeredito } from '../../supabase/functions/revisar-envios/veredito.ts';
import { PROMPT_CRIAR_MATERIAL, PROMPT_REVISAR_MATERIAL } from '../../src/content/padraoMaterial';
import type { Discipline, Theme } from '../../src/types';

// 44-H1 — os textos de "Como escrever questões", lidos DOS ARQUIVOS de
// docs/editorial/: o padrão para quem escreve e os dois prompts. Provam: o padrão
// é o arquivo (e só a parte de quem escreve); o texto copiado é prompt + padrão;
// nenhum jargão interno chega a uma IA de fora (AGENTS.md, risco 19); o formato
// do padrão é o que o importador de questões aceita hoje; o prompt revisor usa
// as mesmas linhas de veredito que o revisor automático lê por máquina.

const RAIZ = process.cwd();
const ARQUIVO_PADRAO = path.resolve(RAIZ, 'docs/editorial/PADRAO-QUESTOES-PARA-QUEM-ESCREVE.md');
const ARQUIVO_PROMPT_CRIAR = path.resolve(RAIZ, 'docs/editorial/PROMPT-CRIAR-QUESTOES.txt');
const ARQUIVO_PROMPT_REVISAR = path.resolve(RAIZ, 'docs/editorial/PROMPT-REVISAR-QUESTOES.txt');
const ARQUIVO_PADRAO_DE_QUEM_OPERA = path.resolve(RAIZ, 'docs/editorial/PADRAO-NEXUSMED-QUESTOES.md');

// O mesmo detector de jargão interno da 44-D (tests/unit/padraoMaterialTexto44d.test.ts).
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
// Termos de quem OPERA a plataforma, que não pertencem a um texto para quem escreve.
const TERMOS_DE_OPERACAO: Array<[string, RegExp]> = [
  ['tela do Admin', /\badmin\b|área editorial|painel administrativo/i],
  ['passos de operar (Passo 1..4)', /\bpasso [1-4]\b/i],
  ['erro de ambiente', /PGRST|schema cache|migration/i],
  ['atestação', /atesta/i],
  ['botão do sistema', /publicar rascunhos|nova questão|importar questões/i],
];

function termosInternos(texto: string): string[] {
  return REGRAS_DE_JARGAO.filter(([, regra]) => regra.test(texto)).map(([nome]) => nome);
}

const disciplina: Discipline = { id: 'd1', name: 'Pneumologia', code: 'PN', icon: 'book', description: '', cycle: 'clinico', color: '#000' };
const tema: Theme = { id: 't1', disciplineId: 'd1', name: 'Espirometria', description: '', highYield: false, order: 1 };

describe('44-H1 — os arquivos e o recorte', () => {
  it('os três arquivos novos existem em docs/editorial, e o guia de quem opera continua intocado ao lado', () => {
    expect(existsSync(ARQUIVO_PADRAO)).toBe(true);
    expect(existsSync(ARQUIVO_PROMPT_CRIAR)).toBe(true);
    expect(existsSync(ARQUIVO_PROMPT_REVISAR)).toBe(true);
    expect(existsSync(ARQUIVO_PADRAO_DE_QUEM_OPERA)).toBe(true);
  });

  it('o padrão exibido é o arquivo, sem texto próprio', () => {
    const arquivo = readFileSync(ARQUIVO_PADRAO, 'utf8').replace(/\r\n/g, '\n').trim();
    expect(PADRAO_DE_QUESTOES).toBe(arquivo);
  });

  it('o padrão tem as cinco seções e nenhum texto de quem opera a plataforma', () => {
    for (const secao of [
      '# Padrão NexusMed de questões — para quem escreve',
      '## 1. Dois tipos de questão',
      '### 1.1 Banca real',
      '### 1.2 Autoral',
      '## 2. Regras de toda questão',
      '## 4. Formato do arquivo',
      '## 5. Checklist antes de entregar',
    ]) {
      expect(PADRAO_DE_QUESTOES, secao).toContain(secao);
    }
    for (const [nome, regra] of TERMOS_DE_OPERACAO) {
      expect(regra.test(PADRAO_DE_QUESTOES), nome).toBe(false);
    }
  });

  it('extrairPadraoDeQuestoes falha alto se o arquivo perder o título ou o formato', () => {
    expect(() => extrairPadraoDeQuestoes('# Outro título\n\n## 4. Formato do arquivo\n## 5. Checklist antes de entregar')).toThrow();
    expect(() => extrairPadraoDeQuestoes('# Padrão NexusMed de questões — para quem escreve\n\nsem formato')).toThrow();
    expect(() =>
      extrairPadraoDeQuestoes('# Padrão NexusMed de questões — para quem escreve\n\n## 4. Formato do arquivo\n\nsem checklist'),
    ).toThrow();
  });

  it('tolera fim de linha do Windows', () => {
    const bruto = '# Padrão NexusMed de questões — para quem escreve\r\n\r\n## 4. Formato do arquivo\r\n\r\n## 5. Checklist antes de entregar\r\n';
    expect(extrairPadraoDeQuestoes(bruto)).not.toContain('\r');
  });
});

describe('44-H1 — texto copiado = prompt + padrão de questões', () => {
  it('criação: começa pelo prompt, contém o padrão inteiro entre as marcas, não contém o prompt revisor nem os de material', () => {
    expect(TEXTO_COPIAR_CRIAR_QUESTOES.indexOf(PROMPT_CRIAR_QUESTOES)).toBe(0);
    expect(TEXTO_COPIAR_CRIAR_QUESTOES).toContain(PADRAO_DE_QUESTOES);
    expect(TEXTO_COPIAR_CRIAR_QUESTOES).not.toContain(PROMPT_REVISAR_QUESTOES.slice(0, 80));
    expect(TEXTO_COPIAR_CRIAR_QUESTOES).not.toContain(PROMPT_CRIAR_MATERIAL.slice(0, 80));
  });

  it('revisão: começa pelo prompt, contém o padrão inteiro entre as marcas, não contém o prompt de criação nem os de material', () => {
    expect(TEXTO_COPIAR_REVISAR_QUESTOES.indexOf(PROMPT_REVISAR_QUESTOES)).toBe(0);
    expect(TEXTO_COPIAR_REVISAR_QUESTOES).toContain(PADRAO_DE_QUESTOES);
    expect(TEXTO_COPIAR_REVISAR_QUESTOES).not.toContain(PROMPT_CRIAR_QUESTOES.slice(0, 80));
    expect(TEXTO_COPIAR_REVISAR_QUESTOES).not.toContain(PROMPT_REVISAR_MATERIAL.slice(0, 80));
  });

  it('cada prompt cita as duas linhas-marca do padrão de questões, e elas existem soltas no texto copiado', () => {
    for (const [prompt, copiado] of [
      [PROMPT_CRIAR_QUESTOES, TEXTO_COPIAR_CRIAR_QUESTOES],
      [PROMPT_REVISAR_QUESTOES, TEXTO_COPIAR_REVISAR_QUESTOES],
    ]) {
      expect(prompt).toContain(MARCA_INICIO_PADRAO_QUESTOES);
      expect(prompt).toContain(MARCA_FIM_PADRAO_QUESTOES);
      const linhas = copiado.split('\n');
      expect(linhas).toContain(MARCA_INICIO_PADRAO_QUESTOES);
      expect(linhas).toContain(MARCA_FIM_PADRAO_QUESTOES);
      const linhasPadrao = PADRAO_DE_QUESTOES.split('\n').length;
      expect(linhas.indexOf(MARCA_FIM_PADRAO_QUESTOES) - linhas.indexOf(MARCA_INICIO_PADRAO_QUESTOES)).toBe(linhasPadrao + 3);
    }
  });

  it('as marcas de questões não são as de conteúdos (as duas produções não se confundem)', () => {
    expect(MARCA_INICIO_PADRAO_QUESTOES).toContain('QUESTÕES');
    expect(montarTextoParaCopiar('P', 'X', { inicio: 'A', fim: 'B' })).toBe('P\n\nA\n\nX\n\nB');
    expect(montarTextoParaCopiar('P', 'X')).toContain('CONTEÚDOS — INÍCIO');
  });
});

describe('44-H1 — os textos são autocontidos para quem está de fora (AGENTS.md, risco 19)', () => {
  it('nenhum jargão interno no padrão, nos dois prompts nem nos textos completos que vão para a área de transferência', () => {
    expect(termosInternos(PADRAO_DE_QUESTOES), 'padrão').toEqual([]);
    expect(termosInternos(PROMPT_CRIAR_QUESTOES), 'prompt de criação').toEqual([]);
    expect(termosInternos(PROMPT_REVISAR_QUESTOES), 'prompt revisor').toEqual([]);
    expect(termosInternos(TEXTO_COPIAR_CRIAR_QUESTOES), 'texto de criação').toEqual([]);
    expect(termosInternos(TEXTO_COPIAR_REVISAR_QUESTOES), 'texto de revisão').toEqual([]);
  });

  it('nenhum dos dois prompts fala em atestação ou em pessoa que atesta (o revisor de IA é quem confere)', () => {
    expect(PROMPT_CRIAR_QUESTOES).not.toMatch(/ateste|atesta/i);
    expect(PROMPT_REVISAR_QUESTOES).not.toMatch(/ateste|atesta/i);
  });
});

describe('44-H1 — o formato do padrão é o que o importador de questões aceita hoje', () => {
  const blocos = dividirEmBlocos(PADRAO_DE_QUESTOES).filter((b) => b.tipo === 'codigo');

  it('o padrão traz dois modelos de arquivo: banca real e autoral', () => {
    expect(blocos).toHaveLength(2);
    expect(blocos[0].conteudo).toContain('**Ano:** 2024');
    expect(blocos[1].conteudo).toContain('**Instituição / Banca:** NexusMed (questão autoral)');
    expect(blocos[1].conteudo).not.toContain('**Ano:**');
  });

  it('os dois modelos, com os campos preenchidos, passam pelo importador e pela checagem do envio sem nenhuma pendência', () => {
    const preenchido = blocos
      .map((b, i) =>
        b.conteudo
          .replace('Nome exato da Disciplina', 'Pneumologia')
          .replace('Nome exato do Tema', 'Espirometria')
          .replace('Nome real da banca ou instituição', 'ENARE')
          .replace('Título exato de um material; Título exato de outro material', 'Material A; Material B')
          .replace('Título exato de um material', 'Material A')
          .replace('## Questão 1', `## Questão ${i + 1}`)
          .replace('## Questão 2', `## Questão ${i + 1}`),
      )
      .join('\n\n');
    const resultado = parseQuestionsMarkdownText(preenchido, [disciplina], [tema]);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.rows).toHaveLength(2);
    for (const linha of resultado.rows) {
      expect(linha.blockingErrors).toEqual([]);
      expect(linha.options.filter((o) => o.isCorrect)).toHaveLength(1);
      expect(linha.options.every((o) => o.explanation.length > 0)).toBe(true);
      expect(linha.disciplineId).toBe('d1');
      expect(linha.themeId).toBe('t1');
    }
    expect(resultado.rows[0]).toMatchObject({ institution: 'ENARE', year: 2024, difficulty: 'medio' });
    expect(resultado.rows[0].materialTitles).toEqual(['Material A', 'Material B']);
    expect(resultado.rows[1]).toMatchObject({ institution: 'NexusMed (questão autoral)', year: 0 });
    expect(resultado.rows[1].materialTitles).toEqual(['Material A']);

    const leitura = lerLoteDeQuestoes(preenchido, [disciplina], [tema]);
    const avaliacao = avaliarLote(leitura, [{ id: 'm1', title: 'Material A' }, { id: 'm2', title: 'Material B' }], []);
    expect(avaliacao.pendencias).toEqual([]);
    expect(avaliacao.aceito).toBe(true);
  });

  it('o padrão não manda escrever o campo Ciclo (o valor padrão vale) e não usa valor com sublinhado', () => {
    expect(PADRAO_DE_QUESTOES).toContain('Não escreva o campo Ciclo');
    expect(PADRAO_DE_QUESTOES).not.toMatch(/\*\*Ciclo:\*\*/);
  });
});

describe('44-H1 — conteúdo mínimo do padrão (regras do dono do produto)', () => {
  it('dois tipos: banca real (banca e ano verificáveis, gabarito oficial, anulação dita) e autoral (marcada, sem ano, original)', () => {
    for (const trecho of [
      'verdadeiros e verificáveis na internet',
      'O gabarito é o oficial',
      'foi anulada ou teve o gabarito alterado',
      'nunca apresente como "autoral" uma questão copiada de prova',
      'escreva exatamente: `NexusMed (questão autoral)`',
      'Nunca atribua a questão a uma banca e nunca escreva o campo **Ano**',
      'O caso clínico é original',
      'Na dúvida entre os dois tipos, é autoral',
    ]) {
      expect(PADRAO_DE_QUESTOES, trecho).toContain(trecho);
    }
  });

  it('toda questão: uma alternativa correta, comentário de cada uma, fonte on-line, sem livro-texto, alto risco, materiais pelo título exato', () => {
    for (const trecho of [
      '**Uma única alternativa correta**',
      'diz por que ela está certa ou por que está errada',
      'autores ou entidade responsável, título, ano ou versão, e DOI ou endereço (URL)',
      '**Nada de livro-texto**',
      'só com fonte primária pública identificável',
      '**Nunca invente**',
      '**Ligação com o material**',
      'o título exato de cada material do NexusMed',
    ]) {
      expect(PADRAO_DE_QUESTOES, trecho).toContain(trecho);
    }
  });
});

describe('44-H1 — prompt de criação de questões', () => {
  const p = PROMPT_CRIAR_QUESTOES;

  it('pede os dados que faltarem e mantém fontes, alto risco, banca real x autoral, entrega e ciclo de correção', () => {
    for (const trecho of [
      'Disciplina e o Tema',
      'nomes exatos do catálogo',
      'banca real ou autoral',
      'título exato de cada um',
      'Se faltar um dado, pergunte',
      'só material disponível on-line; nenhum livro-texto',
      'Nunca invente referência',
      'ALTO RISCO',
      'Na dúvida entre os dois tipos, é autoral',
      'nunca de memória',
      'NexusMed (questão autoral)',
      '```markdown',
      'PONTOS DE RISCO',
      'Corrija o material conforme os achados abaixo',
      'O QUE MUDEI',
    ]) {
      expect(p, trecho).toContain(trecho);
    }
  });

  it('sem navegação a IA não escreve as questões, e ela mesma busca as fontes', () => {
    expect(p).toContain('não escreva as questões: responda só pedindo que a pessoa use uma IA com acesso à internet ou cole aqui as fontes');
    expect(p).toContain('Você mesmo busca as fontes na internet');
    expect(p.indexOf('não escreva as questões: responda só pedindo')).toBeLessThan(p.indexOf('AO ENTREGAR'));
  });

  it('banca real: só transcreve o que abriu, com banca e ano da prova aberta; sem a prova, não escreve a questão', () => {
    expect(p).toContain('só transcreva uma questão que você encontrou e abriu na internet');
    expect(p).toContain('nunca de memória, nunca por semelhança');
    expect(p).toContain('não escreva a questão: diga o que faltou');
  });

  it('fonte colada pela pessoa pode ser citada com identificação completa; "não abriu, não entra" vale para o que a IA busca', () => {
    expect(p).toContain('Fonte que a pessoa colar nesta conversa');
    expect(p).toContain('A regra de só citar o que foi aberto vale para o que você busca sozinho');
    expect(p).toContain('Fonte que você busca e não abriu não entra no comentário');
  });

  it('o prompt de questões tem a mesma estrutura de regras do prompt de material (mesmos títulos de seção)', () => {
    for (const secao of ['ANTES DE ESCREVER', 'FONTES (só material disponível on-line; nenhum livro-texto)', 'ALTO RISCO', 'AO ESCREVER', 'AO ENTREGAR', 'QUANDO A PESSOA COLAR ACHADOS DE REVISÃO']) {
      expect(p, secao).toContain(secao);
      expect(PROMPT_CRIAR_MATERIAL, secao).toContain(secao);
    }
  });
});

describe('44-H1 — prompt revisor de questões', () => {
  const p = PROMPT_REVISAR_QUESTOES;

  it('fontes pela web, seis grupos na ordem pedida, regra e linhas exatas do veredito, bloco de devolução', () => {
    const ordem = [
      '1. Gabarito',
      '2. Referência',
      '3. Alto risco',
      '4. Transcrição e direitos',
      '5. Ligação com material e escopo',
      '6. Formato e língua',
    ].map((g) => p.indexOf(g));
    expect(ordem.every((i) => i > -1)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    for (const trecho of [
      'não conferida',
      'Nunca presuma que uma fonte confere',
      'Grave = grupos 1 a 4',
      'Qualquer achado grave (grupos 1 a 4) torna o lote NÃO APTO',
      'Gabarito não conferido conta como achado grave do grupo 1',
      'Fonte ou referência não conferida conta como achado grave do grupo 2',
      'Afirmação de alto risco não conferida conta como achado grave do grupo 3',
      'Banca ou ano não verificado conta como achado grave do grupo 4',
      'o veredito é obrigatoriamente NÃO APTO',
      'Corrija o material conforme os achados abaixo',
      'Se você não consegue abrir páginas da internet nesta conversa',
    ]) {
      expect(p, trecho).toContain(trecho);
    }
  });

  it('confere gabarito na fonte, banca e ano, comentário de cada alternativa, direitos e formato', () => {
    for (const trecho of [
      'confirme que ela sustenta a alternativa marcada com [GABARITO]',
      'cada Explicação diz de fato por que a alternativa está certa ou errada',
      'confirme banca, ano, enunciado e alternativas',
      'gabarito marcado é o oficial vigente',
      'foi anulada ou teve o gabarito alterado',
      '"NexusMed (questão autoral)"',
      'não é cópia de prova',
      'checklist da seção 5',
    ]) {
      expect(p, trecho).toContain(trecho);
    }
  });

  it('as linhas de veredito são as mesmas do prompt revisor de material (o revisor automático as lê por máquina)', () => {
    const linhaDoVeredito = (prompt: string) => {
      const inicio = prompt.indexOf('escrita exatamente numa destas formas:');
      return prompt.slice(inicio, prompt.indexOf('Escreva essa linha', inicio));
    };
    expect(linhaDoVeredito(p)).toBe(linhaDoVeredito(PROMPT_REVISAR_MATERIAL));
    expect(p).toContain('"NÃO APTO — 1 achado grave" (quando há um só)');
    expect(p).toContain('"NÃO APTO — N achados graves" (em que N é o número de achados graves, sempre 2 ou mais)');
    expect(p).toContain('nenhuma outra linha da resposta começa com "APTO" ou com "NÃO APTO"');
    const veredito = p.indexOf('(c) Veredito: uma linha só, a última antes do bloco de correção');
    const bloco = p.indexOf('(d) UM único bloco de código');
    expect(veredito).toBeGreaterThan(-1);
    expect(bloco).toBeGreaterThan(veredito);
    expect(p.indexOf('REGRA DO VEREDITO')).toBeLessThan(p.indexOf('COMO TERMINAR A RESPOSTA'));
  });

  it('o bloco de correção do prompt começa exatamente como o revisor automático espera (o mesmo do prompt de material)', () => {
    const inicioDoBloco = (prompt: string) => {
      const a = prompt.indexOf('começando por "') + 'começando por "'.length;
      return prompt.slice(a, prompt.indexOf('"', a));
    };
    expect(inicioDoBloco(p)).toBe(inicioDoBloco(PROMPT_REVISAR_MATERIAL));
    // O que o revisor automático (44-F) lê: a linha de veredito exata, depois um bloco que começa por esse texto.
    const bloco = inicioDoBloco(p);
    for (const [linha, veredito] of [
      ['APTO PARA ENVIAR', 'apto'],
      ['NÃO APTO — 1 achado grave', 'nao_apto'],
      ['NÃO APTO — 3 achados graves', 'nao_apto'],
    ] as const) {
      const leitura = lerVeredito({ stopReason: 'end_turn', texto: `1. Gabarito — questão 1: confere.\n\n${linha}\n\n\`\`\`\n${bloco}\nQuestão 1: trocar.\n\`\`\`` });
      expect(leitura.veredito, linha).toBe(veredito);
      expect(leitura.linhaDoVeredito).toBe(linha);
      expect(leitura.blocoDeCorrecao?.startsWith('Corrija o material conforme os achados abaixo')).toBe(true);
    }
  });

  it('a mesma exigência da 44-F vale: o material citado no prompt de criação e o do revisor falam do mesmo bloco de devolução', () => {
    expect(PROMPT_CRIAR_QUESTOES).toContain('Corrija o material conforme os achados abaixo');
    expect(PROMPT_CRIAR_MATERIAL).toContain('Corrija o material conforme os achados abaixo');
  });
});
