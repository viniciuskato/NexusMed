import type { ErrorLogItem, Question, QuestionAnswerRecord, SimuladoSessionData } from '../types';

// RESID-1 (D-14, 11/10/2026) — nas telas de estudo só aparecem, e só contam no
// desempenho, as questões de residência: as que têm banca/instituição e ano de
// prova reais. Questão autoral ou sem banca/ano continua no banco (a Área
// Editorial vê e edita todas), mas sai das telas do estudante.

const PRIMEIRO_ANO_DE_PROVA = 1950;

/** Marca que o padrão de questões manda pôr na instituição de questão autoral. */
const MARCA_DE_QUESTAO_AUTORAL = 'nexusmed';

/** O que a regra lê da questão (aceita o que o banco devolve: instituição nula, ano nulo ou 0). */
type DadosDeProva = { institution?: string | null; year?: number | null };

/**
 * Residência = instituição com texto (depois de aparar os espaços) que NÃO
 * começa com "NexusMed" (qualquer caixa) e ano inteiro entre 1950 e o ano atual.
 * É a única definição: toda tela de estudo passa por aqui.
 */
export function ehQuestaoDeResidencia(q: DadosDeProva, anoAtual: number = new Date().getFullYear()): boolean {
  const instituicao = typeof q.institution === 'string' ? q.institution.trim() : '';
  if (instituicao === '') return false;
  if (instituicao.toLowerCase().startsWith(MARCA_DE_QUESTAO_AUTORAL)) return false;
  const ano = q.year;
  return typeof ano === 'number' && Number.isInteger(ano) && ano >= PRIMEIRO_ANO_DE_PROVA && ano <= anoAtual;
}

/** Só as questões de residência, na mesma ordem. */
export function soQuestoesDeResidencia<T extends DadosDeProva>(questions: T[], anoAtual?: number): T[] {
  return questions.filter((q) => ehQuestaoDeResidencia(q, anoAtual));
}

/**
 * Respostas que valem para as questões dadas: a resposta antiga a uma questão
 * de fora (estudo, autoral, despublicada) não entra em nenhuma conta.
 */
export function respostasDasQuestoes(
  answers: Record<string, QuestionAnswerRecord>,
  questions: Pick<Question, 'id'>[]
): Record<string, QuestionAnswerRecord> {
  const ids = new Set(questions.map((q) => q.id));
  const resultado: Record<string, QuestionAnswerRecord> = {};
  for (const [chave, resposta] of Object.entries(answers)) {
    if (ids.has(resposta.questionId)) resultado[chave] = resposta;
  }
  return resultado;
}

/** Entradas do caderno de erros que são das questões dadas. */
export function errosDasQuestoes(errorLogs: ErrorLogItem[], questions: Pick<Question, 'id'>[]): ErrorLogItem[] {
  const ids = new Set(questions.map((q) => q.id));
  return errorLogs.filter((log) => ids.has(log.questionId));
}

/** Sessão do histórico de simulados, só com a parte de residência. */
export interface SessaoDeResidencia {
  sessao: SimuladoSessionData;
  /** Quantas questões da sessão são de residência. */
  totalQuestoes: number;
  /** Aproveitamento em %, sobre as questões de residência da sessão. */
  aproveitamento: number;
}

/**
 * Histórico de simulados só com o que é de residência: a sessão sem nenhuma
 * questão de residência some. Sessão toda de residência mantém a nota gravada.
 * Sessão mista tem a nota recalculada pelas respostas (a sessão não guarda o
 * acerto por questão): acertos entre as questões de residência dela, sem
 * resposta contando como erro, sobre o total dessas questões.
 */
export function sessoesDeResidencia(
  history: SimuladoSessionData[],
  questions: Pick<Question, 'id'>[],
  answers: Record<string, QuestionAnswerRecord>
): SessaoDeResidencia[] {
  const ids = new Set(questions.map((q) => q.id));
  const lista: SessaoDeResidencia[] = [];
  for (const sessao of history) {
    const dentro = sessao.questionIds.filter((id) => ids.has(id));
    if (dentro.length === 0) continue;
    const aproveitamento =
      dentro.length === sessao.questionIds.length
        ? sessao.score || 0
        : Math.round((dentro.filter((id) => answers[id]?.isCorrect).length / dentro.length) * 100);
    lista.push({ sessao, totalQuestoes: dentro.length, aproveitamento });
  }
  return lista;
}

/** Texto do estado vazio das telas de estudo (D-14). */
export const TEXTO_SEM_QUESTOES_DE_RESIDENCIA = 'Ainda não há questões de residência publicadas.';
