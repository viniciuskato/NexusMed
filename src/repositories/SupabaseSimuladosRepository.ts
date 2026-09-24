import { SimuladoSessionData } from '../types';
import { supabase } from '../lib/supabaseClient';
import { SimuladosRepository } from './SimuladosRepository';
import { fetchAllRows, fetchAllRowsByIds } from './supabasePaging';

// ============================================================================
// Fase 4-5 wiring — Supabase-backed SimuladosRepository
// ============================================================================
//
// `SimuladosRepository` foi convertida para assíncrona e esta classe passou
// a declarar `implements SimuladosRepository` e a ser o singleton
// `simuladosRepository` consumido pelo app.
//
// Mapeamento de campos (frontend <-> banco):
//
// SimuladoSessionData <-> simulations (+ simulation_questions + simulation_answers)
//   id <-> simulations.id | config <-> simulations.config (jsonb, gravado
//     como o objeto SimuladoConfig inteiro, sem achatar campos)
//   config.name <-> simulations.name (redundante com config.name, mas a
//     coluna existe no schema e é preenchida a partir do mesmo valor)
//   startedAt <-> started_at | completedAt <-> completed_at
//   score <-> score | totalTimeSeconds <-> total_time_seconds
//   questionIds <-> simulation_questions (uma linha por questão, ordenada
//     por position)
//   answers <-> simulation_answers, associada via simulation_questions
//     (chave simulation_question_id, não question_id diretamente)
//     answers[questionId].selectedOption (letra) <-> resolvida via
//       question_options.letter a partir de selected_option_id
//     answers[questionId].timeSpent <-> time_spent_seconds
//
// LACUNAS / DECISÕES CONHECIDAS:
//  - saveSimuladoSession substitui simulation_questions/simulation_answers
//    por completo a cada chamada (delete + insert), mesma semântica de
//    "substituição total" usada em SupabaseMaterialsRepository.saveCompendium
//    e SupabaseQuestionsRepository.saveQuestion — o frontend não rastreia
//    diffs incrementais de sessão de simulado.
//  - Uma resposta cujo questionId não está entre os questionIds da própria
//    sessão, ou cuja letra não corresponde a nenhuma alternativa real da
//    questão, é silenciosamente ignorada na gravação (não lança erro) —
//    mesmo efeito prático de o localStorage aceitar qualquer objeto sem
//    validação estrutural.
// ============================================================================

interface SimulationRow {
  id: string;
  config: SimuladoSessionData['config'];
  started_at: string;
  completed_at: string | null;
  score: number | null;
  total_time_seconds: number;
}

interface SimulationQuestionRow {
  id: string;
  simulation_id: string;
  question_id: string;
  position: number;
}

interface SimulationAnswerRow {
  simulation_question_id: string;
  selected_option_id: string;
  time_spent_seconds: number;
}

function buildSession(
  sim: SimulationRow,
  allQuestions: SimulationQuestionRow[],
  allAnswers: SimulationAnswerRow[],
  letterById: Map<string, string>
): SimuladoSessionData {
  const questions = allQuestions
    .filter((q) => q.simulation_id === sim.id)
    .sort((a, b) => a.position - b.position);

  const answers: SimuladoSessionData['answers'] = {};
  for (const sq of questions) {
    const ans = allAnswers.find((a) => a.simulation_question_id === sq.id);
    if (ans) {
      answers[sq.question_id] = {
        selectedOption: letterById.get(ans.selected_option_id) ?? 'A',
        timeSpent: ans.time_spent_seconds,
      };
    }
  }

  return {
    id: sim.id,
    config: sim.config,
    questionIds: questions.map((q) => q.question_id),
    answers,
    startedAt: sim.started_at,
    completedAt: sim.completed_at ?? undefined,
    score: sim.score ?? undefined,
    totalTimeSeconds: sim.total_time_seconds,
  };
}

export class SupabaseSimuladosRepository implements SimuladosRepository {
  async getSimulados(): Promise<SimuladoSessionData[]> {
    // Leitura completa (45-C): 20 simulados de 50 questões já são 1000 linhas
    // de simulation_questions — o corte fazia simulados antigos voltarem
    // incompletos.
    const [sims, sqs, answerRows] = await Promise.all([
      fetchAllRows<SimulationRow>((from, to) =>
        supabase
          .from('simulations')
          .select('*')
          .order('started_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to)
      ),
      fetchAllRows<SimulationQuestionRow>((from, to) =>
        supabase
          .from('simulation_questions')
          .select('*')
          .order('position', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ),
      fetchAllRows<SimulationAnswerRow>((from, to) =>
        supabase.from('simulation_answers').select('*').order('id', { ascending: true }).range(from, to)
      ),
    ]);

    let letterById = new Map<string, string>();
    const optionIds = Array.from(new Set(answerRows.map((a) => a.selected_option_id)));
    if (optionIds.length > 0) {
      const options = await fetchAllRowsByIds<{ id: string; letter: string }>(optionIds, (chunk, from, to) =>
        supabase.from('question_options').select('id, letter').in('id', chunk).order('id', { ascending: true }).range(from, to)
      );
      letterById = new Map(options.map((o) => [o.id, o.letter]));
    }

    return sims.map((sim) => buildSession(sim, sqs, answerRows, letterById));
  }

  async saveSimuladoSession(session: SimuladoSessionData): Promise<void> {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;

    const simRow = {
      id: session.id,
      user_id: userData.user?.id,
      name: session.config.name,
      config: session.config,
      started_at: session.startedAt,
      completed_at: session.completedAt ?? null,
      score: session.score ?? null,
      total_time_seconds: session.totalTimeSeconds,
    };
    const { error: upErr } = await supabase.from('simulations').upsert(simRow);
    if (upErr) throw upErr;

    const { error: delErr } = await supabase.from('simulation_questions').delete().eq('simulation_id', session.id);
    if (delErr) throw delErr;

    if (session.questionIds.length === 0) return;

    const sqRows = session.questionIds.map((qid, i) => ({
      simulation_id: session.id,
      question_id: qid,
      position: i,
    }));
    const { data: insertedSQ, error: insErr } = await supabase
      .from('simulation_questions')
      .insert(sqRows)
      .select('*');
    if (insErr) throw insErr;

    const answerEntries = Object.entries(session.answers);
    if (answerEntries.length === 0) return;

    const questionIdsWithAnswers = answerEntries.map(([qid]) => qid);
    const { data: options, error: optErr } = await supabase
      .from('question_options')
      .select('id, question_id, letter')
      .in('question_id', questionIdsWithAnswers);
    if (optErr) throw optErr;

    const answerRows: { simulation_question_id: string; selected_option_id: string; time_spent_seconds: number }[] =
      [];
    for (const [questionId, ans] of answerEntries) {
      const sq = (insertedSQ ?? []).find((row: SimulationQuestionRow) => row.question_id === questionId);
      const opt = (options ?? []).find((o) => o.question_id === questionId && o.letter === ans.selectedOption);
      if (!sq || !opt) continue;
      answerRows.push({
        simulation_question_id: sq.id,
        selected_option_id: opt.id,
        time_spent_seconds: ans.timeSpent,
      });
    }
    if (answerRows.length > 0) {
      const { error: saErr } = await supabase.from('simulation_answers').insert(answerRows);
      if (saErr) throw saErr;
    }
  }

  async getSimuladoHistory(): Promise<SimuladoSessionData[]> {
    return this.getSimulados();
  }
}

export const supabaseSimuladosRepository = new SupabaseSimuladosRepository();
