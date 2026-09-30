// 44-D — recorte e montagem dos textos da página "Como escrever um material".
//
// Tudo aqui é função pura sobre texto. O texto em si vive nos arquivos de
// docs/editorial/ (ver src/content/padraoMaterial.ts): esta página nunca guarda
// uma cópia do padrão nem dos prompts.

const CRLF = /\r\n/g;

export const MARCA_INICIO_PADRAO = '=== PADRÃO NEXUSMED DE CONTEÚDOS — INÍCIO ===';
export const MARCA_FIM_PADRAO = '=== PADRÃO NEXUSMED DE CONTEÚDOS — FIM ===';

/**
 * Devolve a Parte 1 do padrão de conteúdos: do título "# Parte 1" até antes de
 * "# Parte 2", sem o traço separador que fecha a Parte 1.
 *
 * O recorte começa em "# Parte 1" (e não no início do arquivo) porque a
 * abertura do documento apresenta as duas partes e cita a Parte 2, que é de
 * quem opera a plataforma e não pode aparecer para quem escreve.
 *
 * Falha alto se algum dos dois marcos sumir: melhor quebrar o teste e o build
 * do que exibir a Parte 2, ou nada, sem ninguém notar.
 */
export function extrairParte1(padrao: string): string {
  const texto = padrao.replace(CRLF, '\n');
  const inicio = texto.search(/^# Parte 1\b/m);
  if (inicio < 0) throw new Error('Padrão de conteúdos: título "# Parte 1" não encontrado.');
  const resto = texto.slice(inicio);
  const fim = resto.search(/^# Parte 2\b/m);
  if (fim < 0) throw new Error('Padrão de conteúdos: título "# Parte 2" não encontrado.');
  return resto
    .slice(0, fim)
    .replace(/\n-{3,}\s*$/, '')
    .trim();
}

/** Texto de um arquivo de prompt: fim de linha unificado, sem branco nas pontas. */
export function normalizarTexto(bruto: string): string {
  return bruto.replace(CRLF, '\n').trim();
}

export const MARCA_INICIO_PADRAO_QUESTOES = '=== PADRÃO NEXUSMED DE QUESTÕES — INÍCIO ===';
export const MARCA_FIM_PADRAO_QUESTOES = '=== PADRÃO NEXUSMED DE QUESTÕES — FIM ===';

/**
 * Texto que vai para a área de transferência: o prompt, uma linha-marca de
 * início, o padrão e uma linha-marca de fim. O prompt cita essas duas linhas,
 * para a IA saber onde o padrão começa e termina. Sem `marcas`, valem as do
 * padrão de conteúdos; o de questões (44-H1) passa as suas.
 */
export function montarTextoParaCopiar(
  prompt: string,
  parte1: string,
  marcas: { inicio: string; fim: string } = { inicio: MARCA_INICIO_PADRAO, fim: MARCA_FIM_PADRAO },
): string {
  return [prompt, '', marcas.inicio, '', parte1, '', marcas.fim].join('\n');
}

/**
 * O padrão de questões para quem escreve (44-H1). Diferente do de conteúdos, o
 * arquivo inteiro é para quem escreve (não há parte de quem opera), então o
 * "recorte" é o arquivo todo, com fim de linha unificado. Falha alto se o
 * arquivo perder o título ou o formato: melhor quebrar o teste e o build do que
 * exibir, ou entregar a uma IA, um texto sem o formato.
 */
export function extrairPadraoDeQuestoes(padrao: string): string {
  const texto = normalizarTexto(padrao);
  if (!/^# Padrão NexusMed de questões — para quem escreve/m.test(texto)) {
    throw new Error('Padrão de questões: título "# Padrão NexusMed de questões — para quem escreve" não encontrado.');
  }
  if (!/^## 4\. Formato do arquivo/m.test(texto)) {
    throw new Error('Padrão de questões: seção "## 4. Formato do arquivo" não encontrada.');
  }
  if (!/^## 5\. Checklist antes de entregar/m.test(texto)) {
    throw new Error('Padrão de questões: seção "## 5. Checklist antes de entregar" não encontrada.');
  }
  return texto;
}

/**
 * O texto da Parte 1 como aparece na tela: o item de checklist `- [ ] ...` do
 * padrão vira `- ☐ ...`, porque o leitor de Markdown do site não desenha
 * caixa de seleção e mostraria o "[ ]" literal. Só para exibição — o texto
 * copiado para a IA continua sendo o do arquivo.
 */
export function paraExibicao(markdown: string): string {
  return markdown.replace(/^(\s*)[-*]\s+\[ \]\s+/gm, '$1- ☐ ');
}

export type BlocoPadrao =
  | { tipo: 'texto'; conteudo: string }
  | { tipo: 'codigo'; conteudo: string; linguagem: string };

/**
 * Separa o markdown em trechos de texto e blocos de código (cercas de 3 ou
 * mais crases). O leitor de Markdown do site não conhece cerca de código; o
 * padrão a usa para mostrar a árvore de exemplo e o modelo do arquivo `.md`,
 * que precisam aparecer literais, sem virar títulos e tabelas.
 */
export function dividirEmBlocos(markdown: string): BlocoPadrao[] {
  const linhas = markdown.replace(CRLF, '\n').split('\n');
  const blocos: BlocoPadrao[] = [];
  let texto: string[] = [];
  let codigo: string[] | null = null;
  let cerca = '';
  let linguagem = '';

  const fecharTexto = () => {
    const conteudo = texto.join('\n').trim();
    if (conteudo) blocos.push({ tipo: 'texto', conteudo });
    texto = [];
  };

  for (const linha of linhas) {
    if (codigo === null) {
      const abre = linha.match(/^(`{3,})\s*([\w-]*)\s*$/);
      if (abre) {
        fecharTexto();
        codigo = [];
        cerca = abre[1];
        linguagem = abre[2];
      } else {
        texto.push(linha);
      }
    } else if (linha.trim().startsWith(cerca) && /^`+$/.test(linha.trim())) {
      blocos.push({ tipo: 'codigo', conteudo: codigo.join('\n'), linguagem });
      codigo = null;
    } else {
      codigo.push(linha);
    }
  }
  if (codigo !== null) blocos.push({ tipo: 'codigo', conteudo: codigo.join('\n'), linguagem });
  fecharTexto();
  return blocos;
}
