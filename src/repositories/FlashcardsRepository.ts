import { Flashcard, FlashcardSRS, Question, QuestionReviewResult } from '../types';
import { StorageService, getStorageUser } from '../services/storage';
import { SupabaseFlashcardsRepository } from './SupabaseFlashcardsRepository';
import { enqueue, enqueueAndTry } from '../services/syncQueue';
import { FlashcardCreateFromQuestionOpPayload, FlashcardReviewOpPayload } from '../services/syncHandlers';

import { isSupabaseConfigured } from '../lib/supabaseClient';
import { questionsRepository } from './QuestionsRepository';
import { questaoTraGabarito } from '../utils/flashcardDoErro';

interface FlashcardReviewRpcResult {
  interval_days: number;
  repetition_count: number;
  ease_factor: number;
  next_due_date: string;
  last_reviewed_date: string | null;
  state: FlashcardSRS['state'];
  reviewed_at: string;
  rating: 1 | 2 | 3 | 4;
}

function rpcResultToSRS(prev: FlashcardSRS, r: FlashcardReviewRpcResult): FlashcardSRS {
  return {
    intervalDays: r.interval_days,
    repetitionCount: r.repetition_count,
    easeFactor: Number(r.ease_factor),
    nextDueDate: r.next_due_date,
    lastReviewedDate: r.last_reviewed_date ?? undefined,
    state: r.state,
    reviewHistory: [...(prev.reviewHistory || []), { date: r.reviewed_at, rating: r.rating }],
  };
}

export interface FlashcardsRepository {
  getFlashcards(): Promise<Flashcard[]>;
  saveFlashcards(flashcards: Flashcard[]): Promise<void>;
  saveFlashcard(flashcard: Flashcard): Promise<Flashcard>;
  deleteFlashcard(id: string): Promise<void>;
  getDueFlashcards(): Promise<Flashcard[]>;
  updateFlashcardSRS(cardId: string, srs: FlashcardSRS): Promise<void>;
  /**
   * Cria o card do erro. O verso traz a alternativa correta e a explicação: para quem não é admin elas
   * não vêm na questão carregada, e saem da revisão pós-resposta (`review`, ou buscada aqui quando falta).
   */
  createFlashcardFromQuestion(question: Question, review?: QuestionReviewResult): Promise<Flashcard>;
  reviewFlashcard(card: Flashcard, rating: 1 | 2 | 3 | 4): Promise<Flashcard | null>;
}

class LocalStorageFlashcardsRepository implements FlashcardsRepository {
  async getFlashcards(): Promise<Flashcard[]> {
    return StorageService.getFlashcards();
  }
  async saveFlashcards(flashcards: Flashcard[]): Promise<void> {
    StorageService.saveFlashcards(flashcards);
  }
  async saveFlashcard(flashcard: Flashcard): Promise<Flashcard> {
    return StorageService.saveFlashcard(flashcard);
  }
  async deleteFlashcard(id: string): Promise<void> {
    StorageService.deleteFlashcard(id);
  }
  async getDueFlashcards(): Promise<Flashcard[]> {
    return StorageService.getDueFlashcards();
  }
  async updateFlashcardSRS(cardId: string, srs: FlashcardSRS): Promise<void> {
    StorageService.updateFlashcardSRS(cardId, srs);
  }
  async createFlashcardFromQuestion(question: Question, review?: QuestionReviewResult): Promise<Flashcard> {
    return StorageService.createFlashcardFromQuestion(question, review);
  }
  async reviewFlashcard(card: Flashcard, rating: 1 | 2 | 3 | 4): Promise<Flashcard | null> {
    return StorageService.reviewFlashcard(card.id, rating);
  }
}

// Leitura (45-G, D-2): com Supabase configurado, só do servidor. A falha sobe
// para a tela, que diz "sem conexão" — nunca cai numa cópia local vazia ou velha.
class ResilientFlashcardsRepository implements FlashcardsRepository {
  private supa = new SupabaseFlashcardsRepository();
  private local = new LocalStorageFlashcardsRepository();

  async getFlashcards(): Promise<Flashcard[]> {
    if (!isSupabaseConfigured) return this.local.getFlashcards();
    return this.supa.getFlashcards();
  }

  // As gravações abaixo passam pela fila de sincronização (syncQueue): grava
  // local primeiro (nunca perde o card/estado do estudante), enfileira com
  // client_op_id idempotente e deixa retry/backoff/estado visível cuidarem do
  // resto — não é mais um catch{} silencioso. `saveFlashcard`/`deleteFlashcard`
  // já eram naturalmente idempotentes (upsert/delete por id gerado no
  // cliente); `reviewFlashcard` é o caso sensível a ordem/concorrência (ver
  // docs/SINCRONIZACAO-CONFIAVEL.md) e por isso usa uma RPC dedicada que
  // recalcula o SRS no servidor a partir do estado autoritativo atual.

  async saveFlashcards(flashcards: Flashcard[]): Promise<void> {
    this.local.saveFlashcards(flashcards);
    const userId = getStorageUser();
    if (isSupabaseConfigured && userId) {
      for (const f of flashcards) enqueue(userId, 'flashcard_upsert', { flashcard: f });
    }
  }

  async saveFlashcard(flashcard: Flashcard): Promise<Flashcard> {
    const localRes = await this.local.saveFlashcard(flashcard);
    const userId = getStorageUser();
    if (isSupabaseConfigured && userId) {
      enqueue(userId, 'flashcard_upsert', { flashcard });
    }
    return localRes;
  }

  async deleteFlashcard(id: string): Promise<void> {
    this.local.deleteFlashcard(id);
    const userId = getStorageUser();
    if (isSupabaseConfigured && userId) {
      enqueue(userId, 'flashcard_delete', { id });
    }
  }

  async getDueFlashcards(): Promise<Flashcard[]> {
    if (!isSupabaseConfigured) return this.local.getDueFlashcards();
    return this.supa.getDueFlashcards();
  }

  async updateFlashcardSRS(cardId: string, srs: FlashcardSRS): Promise<void> {
    // Só usado para ajustes administrativos de estado (não é um evento de
    // revisão auditável — isso é reviewFlashcard). Upsert direto na tabela de
    // estado, idempotente por natureza (chave primária = flashcard_id).
    this.local.updateFlashcardSRS(cardId, srs);
    const userId = getStorageUser();
    if (isSupabaseConfigured && userId) {
      enqueue(userId, 'flashcard_srs_upsert', { flashcardId: cardId, srs });
    }
  }

  async createFlashcardFromQuestion(question: Question, review?: QuestionReviewResult): Promise<Flashcard> {
    // Quem não é admin não recebe o gabarito junto com a questão: sem a revisão em mãos, busca a do
    // servidor (que só responde depois de a pessoa ter respondido). Se a busca falhar, o erro sobe e
    // nenhum card sai: um card criado sem o verso ficaria vazio para sempre (a criação é idempotente).
    const jaExiste = (await this.local.getFlashcards()).some((card) => card.questionOriginId === question.id);
    const revisao =
      review ?? (jaExiste || questaoTraGabarito(question) ? undefined : await questionsRepository.getQuestionReview(question.id));
    const localRes = await this.local.createFlashcardFromQuestion(question, revisao);
    const userId = getStorageUser();
    if (isSupabaseConfigured && userId) {
      const payload: FlashcardCreateFromQuestionOpPayload = { flashcard: localRes };
      enqueue(userId, 'flashcard_create_from_question', payload, localRes.id);
    }
    return localRes;
  }

  async reviewFlashcard(card: Flashcard, rating: 1 | 2 | 3 | 4): Promise<Flashcard | null> {
    // O card pode não estar no cache local (ex.: veio só da leitura do
    // Supabase, que nunca hidrata esse cache) — `localRes` é só uma
    // otimização de eco local, nunca um pré-requisito para contatar o
    // servidor. A RPC é a fonte de verdade e recalcula o SRS a partir do
    // estado autoritativo; gatear a chamada em `localRes` fazia a revisão
    // ser descartada em silêncio sempre que o card não estivesse cacheado
    // (achado do Prompt 13-B, revisão pós-publicação).
    const localRes = await this.local.reviewFlashcard(card, rating);
    const userId = getStorageUser();
    if (isSupabaseConfigured && userId) {
      const payload: FlashcardReviewOpPayload = { flashcardId: card.id, rating };
      const serverResult = await enqueueAndTry(userId, 'flashcard_review', payload);
      if (serverResult) {
        const baseCard = localRes ?? card;
        const converged: Flashcard = { ...baseCard, srs: rpcResultToSRS(baseCard.srs, serverResult as FlashcardReviewRpcResult) };
        this.local.saveFlashcard(converged); // popula o cache local para a próxima revisão
        return converged;
      }
    }
    return localRes ?? card;
  }
}

export const flashcardsRepository: FlashcardsRepository = new ResilientFlashcardsRepository();
