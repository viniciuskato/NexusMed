import { Question, QuestionOption, QuestionReviewResult } from '../types';
import { supabase } from '../lib/supabaseClient';
import { QuestionsRepository } from './QuestionsRepository';
import { mapQuestionReviewPayload } from './questionReviewMapper';

// ============================================================================
// Fase 3 — Supabase-backed QuestionsRepository
// ============================================================================
//
// Fase 4-5 wiring: `QuestionsRepository` foi convertida para assíncrona e
// esta classe passou a declarar `implements QuestionsRepository` e a ser o
// singleton `questionsRepository` consumido pelo app.
//
// Mapeamento de campos (frontend <-> banco):
//
// Question <-> questions (+ question_options + question_option_keys + question_answer_keys)
//   id <-> id | disciplineId <-> discipline_id | themeId <-> theme_id
//   compendiumRefId <-> material_id | compendiumSectionId <-> material_section_id
//   cycle <-> cycle | difficulty <-> difficulty | institution <-> institution
//   year <-> year | clinicalVignette <-> clinical_vignette
//   questionStem <-> question_stem | tags <-> tags
//   generalCommentary <-> question_answer_keys.general_commentary
//   highYieldSummary <-> question_answer_keys.high_yield_summary
//   options <-> question_options (join question_option_keys)
//     letter <-> letter | text <-> option_text
//     isCorrect <-> question_option_keys.is_correct
//     explanation <-> question_option_keys.explanation
//
//   Campos do frontend SEM equivalente no schema atual (não persistidos):
//     options[].mechanismReference, flashcardTemplate, isPremiumOnly
//
//   `saveCustomQuestion` não tem tabela/flag equivalente a "custom" para
//   questions no schema (isso existe só em `flashcards.is_custom`). Aqui é
//   implementado como um alias de `saveQuestion` — mesmo comportamento do
//   LocalStorageQuestionsRepository, que também delega para saveQuestion.
//
//   IDs de question_options são gerados pelo banco (gen_random_uuid()) e não
//   são expostos no tipo QuestionOption do frontend (que só tem `letter` como
//   chave natural dentro da questão). Por isso, saveQuestion sempre apaga e
//   reinsere as opções da questão (mesma semântica de "substituição total" do
//   LocalStorageQuestionsRepository).
// ============================================================================

// Paginação defensiva (Prompt 11-B, gate 3): o PostgREST/Supabase limita a
// resposta padrão de qualquer `select` a um teto de linhas (tipicamente
// 1000), mesmo sem `.limit()` explícito no código. `question_options` tem 5
// linhas por questão — com o acervo de ~393+ questões (~1965+ linhas) esse
// teto já é ultrapassado, e como a query só ordenava por `sort_order` (que é
// por-questão, não global), o corte no meio da paginação deixava muitas
// questões truncadas com 2 ou 3 alternativas em vez de 5. Corrigido
// buscando em páginas até esgotar os resultados, com ordenação total
// determinística antes do `.range()` (offset sem ordenação única pode
// omitir ou repetir linhas entre páginas mesmo com o teto corrigido).
const SUPABASE_PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  queryBuilder: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await queryBuilder(from, to);
    if (error) throw error;
    const page = data ?? [];
    all.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }
  return all;
}

interface QuestionRow {
  id: string;
  discipline_id: string;
  theme_id: string;
  material_id: string | null;
  material_section_id: string | null;
  cycle: string;
  difficulty: string;
  institution: string | null;
  year: number | null;
  clinical_vignette: string;
  question_stem: string;
  tags: string[];
  status: string;
}

interface QuestionOptionRow {
  id: string;
  question_id: string;
  letter: string;
  option_text: string;
  sort_order: number;
}

interface QuestionOptionKeyRow {
  option_id: string;
  question_id: string;
  is_correct: boolean;
  explanation: string;
}

interface QuestionAnswerKeyRow {
  question_id: string;
  general_commentary: string;
  high_yield_summary: string;
}

function buildQuestion(
  q: QuestionRow,
  options: QuestionOptionRow[],
  optionKeys: QuestionOptionKeyRow[],
  answerKeys: QuestionAnswerKeyRow[]
): Question {
  const answerKey = answerKeys.find((a) => a.question_id === q.id);
  const opts: QuestionOption[] = options
    .filter((o) => o.question_id === q.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((o) => {
      const key = optionKeys.find((k) => k.option_id === o.id);
      return {
        letter: o.letter as QuestionOption['letter'],
        text: o.option_text,
        isCorrect: key?.is_correct ?? false,
        explanation: key?.explanation ?? '',
      };
    });

  return {
    id: q.id,
    disciplineId: q.discipline_id,
    themeId: q.theme_id,
    compendiumRefId: q.material_id ?? '',
    compendiumSectionId: q.material_section_id ?? undefined,
    cycle: q.cycle as Question['cycle'],
    difficulty: q.difficulty as Question['difficulty'],
    institution: q.institution ?? '',
    year: q.year ?? 0,
    clinicalVignette: q.clinical_vignette,
    questionStem: q.question_stem,
    options: opts,
    generalCommentary: answerKey?.general_commentary ?? '',
    highYieldSummary: answerKey?.high_yield_summary ?? '',
    tags: q.tags ?? [],
    publicationStatus: (q.status as Question['publicationStatus']) ?? 'draft',
  };
}

export class SupabaseQuestionsRepository implements QuestionsRepository {
  async getQuestions(): Promise<Question[]> {
    const [questions, options, optionKeys, answerKeys] = await Promise.all([
      fetchAllRows<QuestionRow>((from, to) =>
        supabase.from('questions').select('*').order('id', { ascending: true }).range(from, to)
      ),
      fetchAllRows<QuestionOptionRow>((from, to) =>
        supabase
          .from('question_options')
          .select('*')
          .order('question_id', { ascending: true })
          .order('sort_order', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ),
      fetchAllRows<QuestionOptionKeyRow>((from, to) =>
        supabase
          .from('question_option_keys')
          .select('*')
          .order('question_id', { ascending: true })
          .order('option_id', { ascending: true })
          .range(from, to)
      ),
      fetchAllRows<QuestionAnswerKeyRow>((from, to) =>
        supabase.from('question_answer_keys').select('*').order('question_id', { ascending: true }).range(from, to)
      ),
    ]);

    return questions.map((q) => buildQuestion(q, options, optionKeys, answerKeys));
  }

  async saveQuestions(questions: Question[]): Promise<void> {
    for (const q of questions) {
      await this.saveQuestion(q);
    }
  }

  async saveQuestion(question: Question): Promise<void> {
    const questionRow = {
      id: question.id,
      discipline_id: question.disciplineId,
      theme_id: question.themeId,
      material_id: question.compendiumRefId || null,
      material_section_id: question.compendiumSectionId || null,
      cycle: question.cycle,
      difficulty: question.difficulty,
      institution: question.institution || null,
      year: question.year || null,
      clinical_vignette: question.clinicalVignette,
      question_stem: question.questionStem,
      tags: question.tags ?? [],
    };
    const { error: qErr } = await supabase.from('questions').upsert(questionRow);
    if (qErr) throw qErr;

    const { error: akErr } = await supabase.from('question_answer_keys').upsert({
      question_id: question.id,
      general_commentary: question.generalCommentary || '',
      high_yield_summary: question.highYieldSummary || '',
    });
    if (akErr) throw akErr;

    // question_option_keys referencia question_options.id via FK com
    // ON DELETE CASCADE, então apagar as opções já limpa as chaves.
    const { error: delErr } = await supabase.from('question_options').delete().eq('question_id', question.id);
    if (delErr) throw delErr;

    if (question.options.length === 0) return;

    const optionRows = question.options.map((o, i) => ({
      question_id: question.id,
      letter: o.letter,
      option_text: o.text,
      sort_order: i,
    }));
    const { data: insertedOptions, error: insErr } = await supabase
      .from('question_options')
      .insert(optionRows)
      .select('*');
    if (insErr) throw insErr;

    const optionKeyRows = (insertedOptions ?? []).map((row: QuestionOptionRow) => {
      const original = question.options.find((o) => o.letter === row.letter);
      return {
        option_id: row.id,
        is_correct: original?.isCorrect ?? false,
        explanation: original?.explanation ?? '',
      };
    });
    if (optionKeyRows.length > 0) {
      const { error: okErr } = await supabase.from('question_option_keys').upsert(optionKeyRows);
      if (okErr) throw okErr;
    }
  }

  async deleteQuestion(id: string): Promise<void> {
    // question_options/question_answer_keys têm ON DELETE CASCADE em question_id.
    const { error } = await supabase.from('questions').delete().eq('id', id);
    if (error) throw error;
  }

  /**
   * Cria uma questão nova via RPC `import_question_draft` — toda a gravação
   * (questions + question_options + question_option_keys +
   * question_answer_keys) acontece dentro de uma ÚNICA chamada PL/pgSQL
   * (mesmo padrão de `import_compendium_draft`, Missão 42-B), ao contrário
   * de `saveQuestion` acima (5 requisições HTTP independentes). Usada só
   * pelo importador em lote — o formulário "Nova Questão" continua usando
   * `saveCustomQuestion`.
   */
  async importQuestionDraft(question: Question): Promise<Question> {
    const optionsPayload = question.options.map((o) => ({
      letter: o.letter,
      text: o.text,
      explanation: o.explanation,
      is_correct: o.isCorrect,
    }));

    const { data, error } = await supabase.rpc('import_question_draft', {
      p_id: question.id,
      p_discipline_id: question.disciplineId,
      p_theme_id: question.themeId,
      p_cycle: question.cycle,
      p_difficulty: question.difficulty,
      p_institution: question.institution || null,
      p_year: question.year || null,
      p_clinical_vignette: question.clinicalVignette || '',
      p_question_stem: question.questionStem,
      p_general_commentary: question.generalCommentary || '',
      p_high_yield_summary: question.highYieldSummary || '',
      p_tags: question.tags ?? [],
      p_options: optionsPayload,
    });
    if (error) throw error;
    const row = data as QuestionRow;
    return {
      ...question,
      publicationStatus: (row.status as Question['publicationStatus']) ?? 'draft',
    };
  }

  async saveCustomQuestion(question: Question): Promise<void> {
    // Sem equivalente de "custom" para questions no schema atual — mesmo
    // comportamento do LocalStorageQuestionsRepository (delega a saveQuestion).
    await this.saveQuestion(question);
  }

  async getQuestionReview(questionId: string): Promise<QuestionReviewResult> {
    const { data, error } = await supabase.rpc('get_question_review', {
      p_question_id: questionId,
    });
    if (error) throw error;
    return mapQuestionReviewPayload(data);
  }

  async publishQuestion(id: string): Promise<void> {
    // Única via de transição para 'published' — valida (>=2 alternativas,
    // question_option_keys completo, exatamente 1 correta, comentários
    // preenchidos) antes de liberar. Lança erro descritivo se a questão
    // estiver incompleta.
    const { error } = await supabase.rpc('publish_question', { p_question_id: id });
    if (error) throw error;
  }

  async unpublishQuestion(id: string): Promise<void> {
    // Sem RPC dedicada para o caminho inverso — não há validação necessária
    // para tirar de circulação, só materials_admin_write/questions_admin_write
    // ("for all") permitindo o UPDATE direto.
    const { error } = await supabase.from('questions').update({ status: 'draft' }).eq('id', id);
    if (error) throw error;
  }

  // UPDATE direcionado só em material_id/material_section_id — nunca chama
  // saveQuestion (que apaga+reinsere opções e reescreve toda a linha de
  // questions) pra evitar risco de sobrescrever stem/gabarito/explicações
  // (21-D). guard_question_content_immutable no banco já rejeita esse UPDATE
  // com erro descritivo se a questão estiver published/archived — propagado
  // como está, sem tentar "consertar" mudando status sozinho aqui.
  async updateQuestionMaterialLink(questionId: string, materialId: string | null, materialSectionId: string | null): Promise<void> {
    const { error } = await supabase
      .from('questions')
      .update({ material_id: materialId, material_section_id: materialSectionId })
      .eq('id', questionId);
    if (error) throw error;
  }
}

export const supabaseQuestionsRepository = new SupabaseQuestionsRepository();
