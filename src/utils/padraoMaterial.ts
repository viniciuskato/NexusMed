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

/**
 * Texto que vai para a área de transferência: o prompt, uma linha-marca de
 * início, o padrão e uma linha-marca de fim. O prompt cita essas duas linhas,
 * para a IA saber onde o padrão começa e termina.
 */
export function montarTextoParaCopiar(prompt: string, parte1: string): string {
  return [prompt, '', MARCA_INICIO_PADRAO, '', parte1, '', MARCA_FIM_PADRAO].join('\n');
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
