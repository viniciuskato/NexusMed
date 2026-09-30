import type { Discipline, Theme } from '../types';
import { parseQuestionsMarkdownText, type QuestionImportPreview } from './questionsImport';
import { LIMITE_TEXTO_BYTES, tamanhoEmBytes, tamanhoLegivel } from './envioDeMaterial';

// ============================================================================
// Envio de questões pelo site (44-H1) — regras que a tela aplica ao vivo.
//
// Nada da leitura é reimplementado: o importador é o mesmo do botão "Importar
// questões" do Admin (`parseQuestionsMarkdownText`). O que este módulo
// acrescenta é só o que é do envio: tamanho, Disciplina e Tema pelo catálogo (sem
// escolha manual: o envio guarda o texto, não uma escolha por questão), o tipo da
// questão (banca real ou autoral), a fonte on-line no comentário e o material a
// que cada questão se liga. O banco é a autoridade nos limites (300 KB e 3 lotes
// esperando revisão, migration 20260930140000): a tela só antecipa a resposta.
// ============================================================================

/** O campo Instituição / Banca de uma questão autoral, como o padrão manda. */
export const INSTITUICAO_AUTORAL = 'NexusMed (questão autoral)';
export const LIMITE_MATERIAIS_POR_ENVIO = 10;
export const MIN_TAGS = 2;
export const MAX_TAGS = 5;

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** A questão declara, no campo de banca, que é autoral do NexusMed (ou tenta declarar). */
export function mencionaAutoral(instituicao: string): boolean {
  const n = normalizar(instituicao);
  return n.includes('nexusmed') || n.includes('autoral');
}

export function ehAutoralExata(instituicao: string): boolean {
  return normalizar(instituicao) === normalizar(INSTITUICAO_AUTORAL);
}

const FONTE_ON_LINE = /https?:\/\/\S+|\bdoi:\s*10\.\d{4,9}\/\S+|\b10\.\d{4,9}\/\S+/i;

/** O texto de comentário da questão (geral + explicações) cita ao menos um endereço ou DOI. */
export function comentarioTemFonteOnLine(linha: Pick<QuestionImportPreview, 'generalCommentary' | 'options'>): boolean {
  const texto = [linha.generalCommentary, ...linha.options.map((o) => o.explanation)].join('\n');
  return FONTE_ON_LINE.test(texto);
}

/** Avisos do importador que não são defeito do arquivo no envio pelo site. */
function avisoIgnorado(aviso: string, linha: QuestionImportPreview): boolean {
  // Vinheta vazia: o próprio importador diz "ok se a questão realmente não tiver caso clínico".
  if (aviso.startsWith('Enunciado Clínico')) return true;
  // Disciplina e Tema são conferidos à parte, sem escolha manual.
  if (/^(Tema|Disciplina) /.test(aviso)) return true;
  // Questão autoral não leva Ano.
  if (aviso === 'Ano vazio.' && ehAutoralExata(linha.institution)) return true;
  return false;
}

export interface LeituraDoLote {
  texto: string;
  bytes: number;
  /** Recusa do importador para o arquivo inteiro (nenhum "## Questão"), ou vazio. */
  errosDeImportacao: string[];
  linhas: QuestionImportPreview[];
}

/** Lê o arquivo uma vez (a parte cara); `avaliarLote` só compara com o que a pessoa escolheu. */
export function lerLoteDeQuestoes(texto: string, disciplines: Discipline[], themes: Theme[]): LeituraDoLote {
  const bytes = tamanhoEmBytes(texto);
  if (texto.trim().length === 0) return { texto, bytes, errosDeImportacao: [], linhas: [] };
  const resultado = parseQuestionsMarkdownText(texto, disciplines, themes);
  if (resultado.ok === false) return { texto, bytes, errosDeImportacao: resultado.errors, linhas: [] };
  return { texto, bytes, errosDeImportacao: [], linhas: resultado.rows };
}

export interface PendenciaDeQuestao {
  /** Número da questão no arquivo (1, 2, ...). */
  questao: number;
  mensagem: string;
}

export interface MaterialPublicado {
  id: string;
  title: string;
}

export interface AvaliacaoDoLote {
  vazio: boolean;
  bytes: number;
  tamanhoExcedido: boolean;
  errosDeImportacao: string[];
  totalDeQuestoes: number;
  pendencias: PendenciaDeQuestao[];
  /** Só com tudo acima limpo o botão Enviar habilita. */
  aceito: boolean;
}

/** Um material publicado tem exatamente este título (espaços repetidos não contam)? */
function achaMaterial(titulo: string, publicados: MaterialPublicado[]): MaterialPublicado | undefined {
  const alvo = titulo.replace(/\s+/g, ' ').trim();
  return publicados.find((m) => m.title.replace(/\s+/g, ' ').trim() === alvo);
}

export function avaliarLote(
  leitura: LeituraDoLote,
  /**
   * Materiais publicados (para conferir os títulos que o arquivo cita). `null` não confere os
   * títulos nem a falta de material: é o servidor, que os confere no banco, no momento de publicar.
   */
  publicados: MaterialPublicado[] | null,
  /** Materiais que a pessoa escolheu na tela para as questões que não citam nenhum. */
  materiaisEscolhidos: string[],
): AvaliacaoDoLote {
  const vazio = leitura.texto.trim().length === 0;
  const tamanhoExcedido = leitura.bytes > LIMITE_TEXTO_BYTES;
  const pendencias: PendenciaDeQuestao[] = [];

  for (const linha of leitura.linhas) {
    const q = linha.index;
    const add = (mensagem: string) => pendencias.push({ questao: q, mensagem });

    for (const erro of linha.blockingErrors) add(erro);
    for (const aviso of linha.missingFields) {
      if (!avisoIgnorado(aviso, linha)) add(aviso);
    }

    // Disciplina e Tema pelo nome do arquivo, sem escolha manual.
    if (linha.disciplineName && !linha.disciplineId) {
      add(
        `A Disciplina escrita no arquivo (“${linha.disciplineName}”) não existe no catálogo. Use o nome exato da lista da página “Como escrever questões”.`,
      );
    } else if (linha.disciplineId && !linha.themeName) {
      add('O Tema não foi informado. Escreva o nome exato de um Tema da Disciplina.');
    } else if (linha.disciplineId && !linha.themeId) {
      add(
        `O Tema escrito no arquivo (“${linha.themeName}”) não existe nessa Disciplina. Use o nome exato da lista da página “Como escrever questões”.`,
      );
    }

    // Tipo da questão: autoral exata, ou banca real com banca e ano.
    if (linha.institution && mencionaAutoral(linha.institution) && !ehAutoralExata(linha.institution)) {
      add(`Questão autoral: escreva exatamente “${INSTITUICAO_AUTORAL}” no campo Instituição / Banca.`);
    }
    if (ehAutoralExata(linha.institution) && linha.year > 0) {
      add('Questão autoral não leva Ano: tire o campo Ano (ou, se é de prova real, escreva a banca verdadeira).');
    }

    // Tags: de duas a cinco (quando informadas; a falta já vem do importador).
    const semTags = linha.missingFields.some((m) => m.startsWith('Tags não informadas'));
    if (!semTags && (linha.tags.length < MIN_TAGS || linha.tags.length > MAX_TAGS)) {
      add(`Use de ${MIN_TAGS} a ${MAX_TAGS} Tags (encontradas: ${linha.tags.length}).`);
    }

    // Fonte on-line no comentário.
    if (linha.blockingErrors.length === 0 && !comentarioTemFonteOnLine(linha)) {
      add('O comentário não cita nenhuma fonte on-line identificável (endereço ou DOI).');
    }

    // Ligação com material: pelo título no arquivo ou pelo material escolhido na tela.
    if (publicados !== null && linha.materialTitles.length === 0 && materiaisEscolhidos.length === 0) {
      add('Sem material: escreva “Materiais cobertos” na questão ou escolha o material abaixo.');
    }
    for (const titulo of publicados === null ? [] : linha.materialTitles) {
      if (!achaMaterial(titulo, publicados ?? [])) {
        add(`O material “${titulo}” não é o título exato de um material publicado.`);
      }
    }
  }

  const aceito =
    !vazio &&
    !tamanhoExcedido &&
    leitura.errosDeImportacao.length === 0 &&
    leitura.linhas.length > 0 &&
    pendencias.length === 0;

  return {
    vazio,
    bytes: leitura.bytes,
    tamanhoExcedido,
    errosDeImportacao: vazio ? [] : leitura.errosDeImportacao,
    totalDeQuestoes: leitura.linhas.length,
    pendencias,
    aceito,
  };
}

/** Uma sugestão de nome para o lote, pela primeira questão do arquivo. */
export function nomeSugeridoDoLote(leitura: LeituraDoLote): string {
  const primeira = leitura.linhas[0];
  if (!primeira || !primeira.themeName) return '';
  const n = leitura.linhas.length;
  return `Questões de ${primeira.themeName} (${n} ${n === 1 ? 'questão' : 'questões'})`;
}

/** Por que o arquivo não pode ser enviado, em frases (para a tela e para os testes). */
export function motivosDaRecusaDoLote(av: AvaliacaoDoLote): string[] {
  const motivos: string[] = [];
  if (av.vazio) motivos.push('O texto do lote está vazio.');
  if (av.tamanhoExcedido) motivos.push(`O texto tem ${tamanhoLegivel(av.bytes)} e o limite é ${tamanhoLegivel(LIMITE_TEXTO_BYTES)}.`);
  motivos.push(...av.errosDeImportacao);
  motivos.push(...av.pendencias.map((p) => `Questão ${p.questao}: ${p.mensagem}`));
  return motivos;
}

/**
 * A questão que o servidor cria quando a revisão de IA aprova o envio (44-H2): a mesma que o
 * importador da tela leu, no formato que a função do banco `revisao_publicar_questoes` recebe.
 * Os materiais escolhidos na tela vêm do próprio envio; aqui só os títulos que o arquivo cita.
 */
export interface QuestaoParaPublicar {
  discipline_id: string;
  theme_id: string;
  cycle: string;
  difficulty: string;
  institution: string;
  year: number | null;
  clinical_vignette: string;
  question_stem: string;
  general_commentary: string;
  high_yield_summary: string;
  tags: string[];
  material_titles: string[];
  options: Array<{ letter: string; text: string; explanation: string; is_correct: boolean }>;
}

export type LeituraDasQuestoes = { ok: true; questoes: QuestaoParaPublicar[] } | { ok: false; motivos: string[] };

/** Lê o texto aprovado com o importador da tela e devolve as questões que viram publicadas. */
export function lerQuestoesParaPublicar(texto: string, disciplines: Discipline[], themes: Theme[]): LeituraDasQuestoes {
  const leitura = lerLoteDeQuestoes(texto, disciplines, themes);
  // Sem lista de materiais aqui: o banco confere os títulos (e a falta de material) ao publicar.
  const avaliacao = avaliarLote(leitura, null, []);
  if (!avaliacao.aceito) return { ok: false, motivos: motivosDaRecusaDoLote(avaliacao) };
  return {
    ok: true,
    questoes: leitura.linhas.map((l) => ({
      discipline_id: l.disciplineId as string,
      theme_id: l.themeId as string,
      cycle: l.cycle,
      difficulty: l.difficulty,
      institution: l.institution,
      year: l.year > 0 ? l.year : null,
      clinical_vignette: l.clinicalVignette,
      question_stem: l.questionStem,
      general_commentary: l.generalCommentary,
      high_yield_summary: l.highYieldSummary,
      tags: l.tags,
      material_titles: l.materialTitles,
      options: l.options.map((o) => ({
        letter: o.letter,
        text: o.text,
        explanation: o.explanation,
        is_correct: o.isCorrect,
      })),
    })),
  };
}
