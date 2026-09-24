import { QuestionAnswerRecord, QuestionReviewResult } from '../types';
import { supabase } from '../lib/supabaseClient';
import { AnswersRepository } from './AnswersRepository';
import { mapQuestionReviewPayload } from './questionReviewMapper';
import { fetchAllRows } from './supabasePaging';

// ============================================================================
// Fase 4 — Supabase-backed AnswersRepository
// ============================================================================
//
// Fase 4-5 wiring: `AnswersRepository` foi convertida para assíncrona e
// esta classe passou a declarar `implements AnswersRepository` e a ser o
// singleton `answersRepository` consumido pelo app.
//
// Mapeamento de campos (frontend <-> banco):
//
// QuestionAnswerRecord <-> question_attempts (+ question_options para a letra)
//   questionId <-> question_id | isCorrect <-> is_correct
//   timestamp <-> answered_at | timeSpentSeconds <-> time_spent_seconds
//   errorReason <-> error_reason | userNotes <-> user_notes
//   answerMode <-> answer_mode | answerStrategy <-> answer_strategy
//   selectedOption (letra) <-> resolvida via question_options.letter, pois
//     question_attempts guarda selected_option_id (uuid), não a letra.
//
// LACUNAS / DECISÕES CONHECIDAS:
//  - `question_attempts` NÃO tem UNIQUE em (user_id, question_id): um mesmo
//    usuário pode responder a mesma questão várias vezes (histórico real),
//    diferente do localStorage, que sobrescreve `answers[questionId]` a cada
//    resposta. Para reproduzir a mesma semântica de "resposta mais recente
//    vale", getAnswers() ordena por answered_at desc e mantém só a primeira
//    ocorrência de cada questionId.
//  - recordAnswer NÃO faz INSERT direto: a tabela tem INSERT/UPDATE
//    revogados de `authenticated` de propósito (ver rls_policies.sql linha
//    ~892). O único caminho é a RPC `submit_question_attempt`, que também
//    popula `error_notebook` automaticamente quando a resposta é incorreta,
//    calcula `is_correct` no servidor (a partir do gabarito real) e usa
//    `now()` para `answered_at` — os campos `record.isCorrect` e
//    `record.timestamp` do QuestionAnswerRecord de entrada são ignorados,
//    pois o servidor é a fonte de verdade para ambos.
// ============================================================================

interface QuestionAttemptRow {
  question_id: string;
  is_correct: boolean;
  answered_at: string;
  time_spent_seconds: number;
  error_reason: QuestionAnswerRecord['errorReason'] | null;
  user_notes: string | null;
  answer_mode: QuestionAnswerRecord['answerMode'] | null;
  answer_strategy: QuestionAnswerRecord['answerStrategy'] | null;
  question_options: { letter: string } | { letter: string }[] | null;
}

function extractLetter(joined: QuestionAttemptRow['question_options']): string {
  if (!joined) return 'A';
  if (Array.isArray(joined)) return joined[0]?.letter ?? 'A';
  return joined.letter;
}

export class SupabaseAnswersRepository implements AnswersRepository {
  async getAnswers(): Promise<Record<string, QuestionAnswerRecord>> {
    // Todas as tentativas, não só as 1000 mais recentes (45-C): com o corte,
    // uma questão respondida só antes delas voltava como "não respondida".
    const rows = await fetchAllRows<QuestionAttemptRow>((from, to) =>
      supabase
        .from('question_attempts')
        .select(
          'question_id, is_correct, answered_at, time_spent_seconds, error_reason, user_notes, answer_mode, answer_strategy, question_options(letter)'
        )
        .order('answered_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)
    );

    const result: Record<string, QuestionAnswerRecord> = {};
    for (const row of rows) {
      if (result[row.question_id]) continue; // mantém só a tentativa mais recente
      result[row.question_id] = {
        questionId: row.question_id,
        selectedOption: extractLetter(row.question_options) as QuestionAnswerRecord['selectedOption'],
        isCorrect: row.is_correct,
        timestamp: row.answered_at,
        timeSpentSeconds: row.time_spent_seconds,
        errorReason: row.error_reason ?? undefined,
        userNotes: row.user_notes ?? undefined,
        answerMode: row.answer_mode ?? undefined,
        answerStrategy: row.answer_strategy ?? undefined,
      };
    }
    return result;
  }

  async recordAnswer(record: QuestionAnswerRecord): Promise<QuestionReviewResult> {
    const { data: option, error: optErr } = await supabase
      .from('question_options')
      .select('id')
      .eq('question_id', record.questionId)
      .eq('letter', record.selectedOption)
      .single();
    if (optErr) throw optErr;

    const { data, error } = await supabase.rpc('submit_question_attempt', {
      p_question_id: record.questionId,
      p_selected_option_id: option.id,
      p_time_spent_seconds: record.timeSpentSeconds,
      p_error_reason: record.errorReason ?? null,
      p_user_notes: record.userNotes ?? null,
      p_answer_mode: record.answerMode ?? null,
      p_answer_strategy: record.answerStrategy ?? null,
    });
    if (error) throw error;
    return mapQuestionReviewPayload(data);
  }
}

export const supabaseAnswersRepository = new SupabaseAnswersRepository();
