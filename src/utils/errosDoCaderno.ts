import type { ErrorLogItem, Question, QuestionAnswerRecord } from '../types';

// A conta dos erros do Caderno de Erros — uma só, usada pelo próprio caderno
// (`IntegratedCadernoErros`: "Pendentes", "Dominadas") e pelo Início
// ("Erros para revisar", PAINEL-2). Quem chama passa só questões de residência,
// as respostas a elas e as entradas do caderno que são delas (AGENTS.md item 24).

export interface ContagemDosErros {
  /** Questões cuja resposta mais recente está errada (e que ainda existem na lista). */
  total: number;
  /** Dessas, as marcadas como "Dominada" no caderno. */
  dominados: number;
  /** As que ainda pedem fixação: o que o Início chama de "erros para revisar". */
  pendentes: number;
}

export function contagemDosErros(
  answers: Record<string, QuestionAnswerRecord>,
  questions: Pick<Question, 'id'>[],
  errorLogs: ErrorLogItem[]
): ContagemDosErros {
  const existentes = new Set(questions.map((q) => q.id));
  // Entrada mais recente do caderno por questão (a lista vem da mais nova para a mais velha).
  const logDaQuestao = new Map<string, ErrorLogItem>();
  for (const log of errorLogs) {
    if (!logDaQuestao.has(log.questionId)) logDaQuestao.set(log.questionId, log);
  }

  let total = 0;
  let dominados = 0;
  for (const resposta of Object.values(answers)) {
    if (resposta.isCorrect || !existentes.has(resposta.questionId)) continue;
    total += 1;
    if (logDaQuestao.get(resposta.questionId)?.resolved) dominados += 1;
  }
  return { total, dominados, pendentes: total - dominados };
}
