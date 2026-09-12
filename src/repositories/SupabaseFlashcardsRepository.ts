import { sourceUrl } from '../utils/bibliographicSources';
import { Flashcard, FlashcardSRS, Question } from '../types';
import { supabase } from '../lib/supabaseClient';
import { calculateNextSRS, createInitialSRS } from '../services/srsAlgorithm';
import { FlashcardsRepository } from './FlashcardsRepository';

// ============================================================================
// Fase 4-5 wiring — Supabase-backed FlashcardsRepository
// ============================================================================
//
// `FlashcardsRepository` foi convertida para assíncrona e esta classe passou
// a declarar `implements FlashcardsRepository` e a ser o singleton
// `flashcardsRepository` consumido pelo app.
//
// Mapeamento de campos (frontend <-> banco):
//
// Flashcard <-> flashcards (+ flashcard_srs_state + flashcard_reviews)
//   id <-> id | disciplineId <-> discipline_id | themeId <-> theme_id
//   compendiumRefId <-> material_id | questionOriginId <-> question_origin_id
//   front <-> front | back <-> back
//   mechanismHighlight <-> mechanism_highlight | tags <-> tags
//   difficulty <-> difficulty | isCustom <-> is_custom
//
// FlashcardSRS <-> flashcard_srs_state (estado atual) + flashcard_reviews (histórico)
//   intervalDays <-> interval_days | repetitionCount <-> repetition_count
//   easeFactor <-> ease_factor | state <-> state
//   nextDueDate <-> next_due_date | lastReviewedDate <-> last_reviewed_date
//     (schema usa `date`, sem hora; a interface usa string ISO com hora —
//     gravação trunca para os 10 primeiros caracteres "YYYY-MM-DD", leitura
//     devolve a data como veio do banco, sem reconstituir a hora original.
//     Comparações de "vencido/não vencido" continuam corretas porque operam
//     em granularidade de dia.)
//   reviewHistory <-> flashcard_reviews (uma linha por revisão)
//     date <-> reviewed_at | rating <-> rating
//
// Campo do frontend SEM equivalente no schema atual (não persistido):
//   derivedFromQuestionId (schema só tem question_origin_id, que já cobre a
//   mesma finalidade de "flashcard gerado a partir de questão X").
//
// LACUNAS / DECISÕES CONHECIDAS:
//  - `saveFlashcard`/`saveFlashcards` gravam o estado atual do SRS
//    (flashcard_srs_state) mas NÃO reescrevem `flashcard_reviews`: o
//    histórico de revisões só cresce através de `reviewFlashcard`, que
//    reusa o mesmo algoritmo SM-2 (`calculateNextSRS`) do
//    LocalStorageFlashcardsRepository e insere exatamente 1 linha nova em
//    flashcard_reviews por chamada. Um `srs.reviewHistory` vindo de fora com
//    itens que ainda não existem na tabela (ex.: um objeto Flashcard
//    reconstruído a partir de outra fonte) não é reconciliado — é uma
//    lacuna aceita para não transformar um "save" de estado num diff de
//    histórico.
//  - `updateFlashcardSRS(cardId, srs: any)` (assinatura da interface usa
//    `any` de propósito) atualiza só `flashcard_srs_state`, pelo mesmo
//    motivo acima: não grava linhas em flashcard_reviews. Quem quiser um
//    evento de revisão auditável deve usar `reviewFlashcard`.
//  - `createFlashcardFromQuestion` usa `crypto.randomUUID()` para o id do
//    novo flashcard. O LocalStorageFlashcardsRepository usa uma chave de
//    texto opaca (`fc-from-q-${Date.now()}-...`), mas `flashcards.id` no
//    schema é `uuid` — não há como preservar o formato original.
// ============================================================================

interface FlashcardRow {
  id: string;
  discipline_id: string;
  theme_id: string;
  material_id: string | null;
  question_origin_id: string | null;
  front: string;
  back: string;
  mechanism_highlight: string | null;
  tags: string[];
  difficulty: Flashcard['difficulty'];
  is_custom: boolean;
}

interface SRSStateRow {
  flashcard_id: string;
  interval_days: number;
  repetition_count: number;
  ease_factor: number;
  next_due_date: string;
  last_reviewed_date: string | null;
  state: FlashcardSRS['state'];
}

interface ReviewRow {
  flashcard_id: string;
  reviewed_at: string;
  rating: 1 | 2 | 3 | 4;
}

function toDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function rowToSRS(srsRow: SRSStateRow | undefined, reviews: ReviewRow[]): FlashcardSRS {
  if (!srsRow) return createInitialSRS();
  return {
    intervalDays: srsRow.interval_days,
    repetitionCount: srsRow.repetition_count,
    easeFactor: Number(srsRow.ease_factor),
    nextDueDate: srsRow.next_due_date,
    lastReviewedDate: srsRow.last_reviewed_date ?? undefined,
    state: srsRow.state,
    reviewHistory: reviews
      .filter((r) => r.flashcard_id === srsRow.flashcard_id)
      .sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at))
      .map((r) => ({ date: r.reviewed_at, rating: r.rating })),
  };
}

interface BibliographicSource {
  verificacao?: string;
  sourceId: string;
  citationText: string;
  url?: string;
}

function rowToFlashcard(
  row: FlashcardRow,
  srsRow: SRSStateRow | undefined,
  reviews: ReviewRow[],
  bibliographicSourcesByQuestionId?: Map<string, BibliographicSource[]>
): Flashcard {
  return {
    id: row.id,
    disciplineId: row.discipline_id,
    themeId: row.theme_id,
    compendiumRefId: row.material_id ?? undefined,
    questionOriginId: row.question_origin_id ?? undefined,
    front: row.front,
    back: row.back,
    mechanismHighlight: row.mechanism_highlight ?? '',
    tags: row.tags ?? [],
    difficulty: row.difficulty,
    isCustom: row.is_custom,
    srs: rowToSRS(srsRow, reviews),
    bibliographicSources: row.question_origin_id
      ? bibliographicSourcesByQuestionId?.get(row.question_origin_id)
      : undefined,
  };
}

function srsToRow(flashcardId: string, srs: FlashcardSRS) {
  return {
    flashcard_id: flashcardId,
    interval_days: srs.intervalDays,
    repetition_count: srs.repetitionCount,
    ease_factor: srs.easeFactor,
    next_due_date: toDateOnly(srs.nextDueDate),
    last_reviewed_date: srs.lastReviewedDate ? toDateOnly(srs.lastReviewedDate) : null,
    state: srs.state,
  };
}

export class SupabaseFlashcardsRepository implements FlashcardsRepository {
  async getFlashcards(): Promise<Flashcard[]> {
    const [{ data: cards, error: cErr }, { data: srsStates, error: sErr }, { data: reviews, error: rErr }] =
      await Promise.all([
        supabase.from('flashcards').select('*'),
        supabase.from('flashcard_srs_state').select('*'),
        supabase.from('flashcard_reviews').select('flashcard_id, reviewed_at, rating').order('reviewed_at'),
      ]);
    if (cErr) throw cErr;
    if (sErr) throw sErr;
    if (rErr) throw rErr;

    const srsById = new Map(((srsStates ?? []) as SRSStateRow[]).map((s) => [s.flashcard_id, s]));

    // Fonte bibliográfica herdada da questão de origem (distinta do material
    // de origem, que já vem em material_id/compendiumRefId) — só busca para
    // as question_origin_id realmente presentes nesta leva de flashcards.
    const questionIds = [
      ...new Set(((cards ?? []) as FlashcardRow[]).map((c) => c.question_origin_id).filter((id): id is string => !!id)),
    ];
    let bibliographicSourcesByQuestionId: Map<string, BibliographicSource[]> | undefined;
    if (questionIds.length > 0) {
      const { data: refs, error: refErr } = await supabase
        .from('question_references')
        .select('question_id, source_id, sort_order, sources(citation_text, identificadores, verificacao)')
        .in('question_id', questionIds)
        .order('sort_order');
      if (refErr) throw refErr;
      bibliographicSourcesByQuestionId = new Map();
      for (const r of (refs ?? []) as unknown as {
        question_id: string;
        source_id: string;
        sources: { verificacao: string; citation_text: string; identificadores: Record<string, string> | null } | null;
      }[]) {
        const ids = r.sources?.identificadores;
        const url = sourceUrl(ids);
        const list = bibliographicSourcesByQuestionId.get(r.question_id) ?? [];
        list.push({ sourceId: r.source_id, citationText: r.sources?.citation_text ?? r.source_id, url, verificacao: r.sources?.verificacao });
        bibliographicSourcesByQuestionId.set(r.question_id, list);
      }
    }

    return ((cards ?? []) as FlashcardRow[]).map((c) =>
      rowToFlashcard(c, srsById.get(c.id), (reviews ?? []) as ReviewRow[], bibliographicSourcesByQuestionId)
    );
  }

  async saveFlashcards(flashcards: Flashcard[]): Promise<void> {
    for (const f of flashcards) {
      await this.saveFlashcard(f);
    }
  }

  async saveFlashcard(flashcard: Flashcard): Promise<Flashcard> {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;

    const cardRow = {
      id: flashcard.id,
      user_id: userData.user?.id,
      discipline_id: flashcard.disciplineId,
      theme_id: flashcard.themeId,
      material_id: flashcard.compendiumRefId || null,
      question_origin_id: flashcard.questionOriginId || null,
      front: flashcard.front,
      back: flashcard.back,
      mechanism_highlight: flashcard.mechanismHighlight || null,
      tags: flashcard.tags ?? [],
      difficulty: flashcard.difficulty,
      is_custom: flashcard.isCustom ?? true,
    };
    const { error: upErr } = await supabase.from('flashcards').upsert(cardRow);
    if (upErr) throw upErr;

    const { error: srsErr } = await supabase
      .from('flashcard_srs_state')
      .upsert(srsToRow(flashcard.id, flashcard.srs));
    if (srsErr) throw srsErr;

    return flashcard;
  }

  async deleteFlashcard(id: string): Promise<void> {
    // flashcard_srs_state/flashcard_reviews têm ON DELETE CASCADE em flashcard_id.
    const { error } = await supabase.from('flashcards').delete().eq('id', id);
    if (error) throw error;
  }

  async getDueFlashcards(): Promise<Flashcard[]> {
    const all = await this.getFlashcards();
    const now = new Date();
    return all.filter((c) => {
      if (!c.srs || !c.srs.nextDueDate) return true;
      const dueDate = new Date(c.srs.nextDueDate);
      return isNaN(dueDate.getTime()) || dueDate <= now || c.srs.state === 'new';
    });
  }

  async updateFlashcardSRS(cardId: string, srs: FlashcardSRS): Promise<void> {
    // Assinatura da interface original usa `srs: any` (FlashcardsRepository.ts);
    // aqui tipamos como FlashcardSRS por segurança de compilação — quem chama
    // hoje sempre passa um objeto desse formato.
    const { error } = await supabase.from('flashcard_srs_state').upsert(srsToRow(cardId, srs));
    if (error) throw error;
  }

  async createFlashcardFromQuestion(question: Question): Promise<Flashcard> {
    const template = question.flashcardTemplate || {
      front: `[${question.institution} ${question.year}] ${question.questionStem.slice(0, 180)}...`,
      back: `Resposta Correta:\n${question.options.find((o) => o.isCorrect)?.text || ''}\n\nExplicação:\n${question.highYieldSummary}`,
      mechanismNote: question.highYieldSummary,
    };

    const newCard: Flashcard = {
      id: crypto.randomUUID(),
      disciplineId: question.disciplineId,
      themeId: question.themeId,
      compendiumRefId: question.compendiumRefId,
      questionOriginId: question.id,
      front: template.front,
      back: template.back,
      mechanismHighlight: template.mechanismNote,
      tags: [...question.tags, 'Gerado de Questão'],
      difficulty: question.difficulty,
      isCustom: true,
      srs: createInitialSRS(),
    };

    return this.saveFlashcard(newCard);
  }

  // NOTA (Prompt 07-A): o caminho realmente usado em produção para revisão de
  // flashcard é a RPC `submit_flashcard_review` (via syncQueue/syncHandlers em
  // FlashcardsRepository.ts), que recalcula o SM-2 no servidor de forma
  // atômica e idempotente. Este método continua aqui só para satisfazer a
  // interface `FlashcardsRepository`; chamá-lo direto faz duas escritas
  // separadas sem lock nem client_op_id — não usar para revisão real.
  async reviewFlashcard(cardId: string, rating: 1 | 2 | 3 | 4): Promise<Flashcard | null> {
    const { data: cardRow, error: cErr } = await supabase.from('flashcards').select('*').eq('id', cardId).maybeSingle();
    if (cErr) throw cErr;
    if (!cardRow) return null;

    const { data: srsRow, error: sErr } = await supabase
      .from('flashcard_srs_state')
      .select('*')
      .eq('flashcard_id', cardId)
      .maybeSingle();
    if (sErr) throw sErr;

    const { data: reviews, error: rErr } = await supabase
      .from('flashcard_reviews')
      .select('flashcard_id, reviewed_at, rating')
      .eq('flashcard_id', cardId)
      .order('reviewed_at');
    if (rErr) throw rErr;

    const currentSRS = rowToSRS(srsRow ?? undefined, (reviews ?? []) as ReviewRow[]);
    const updatedSRS = calculateNextSRS(currentSRS, rating);
    const reviewedAt = updatedSRS.lastReviewedDate ?? new Date().toISOString();

    const { error: upsertSrsErr } = await supabase.from('flashcard_srs_state').upsert(srsToRow(cardId, updatedSRS));
    if (upsertSrsErr) throw upsertSrsErr;

    const { error: reviewErr } = await supabase
      .from('flashcard_reviews')
      .insert({ flashcard_id: cardId, rating, reviewed_at: reviewedAt });
    if (reviewErr) throw reviewErr;

    return { ...rowToFlashcard(cardRow as FlashcardRow, undefined, []), srs: updatedSRS };
  }
}

export const supabaseFlashcardsRepository = new SupabaseFlashcardsRepository();
