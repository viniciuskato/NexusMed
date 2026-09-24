import { QuestionAnswerRecord, QuestionReviewResult, Question } from '../types';
import { StorageService, getStorageUser } from '../services/storage';
import { SupabaseAnswersRepository } from './SupabaseAnswersRepository';
import { mapQuestionReviewPayload } from './questionReviewMapper';
import { enqueueAndTryTracked, getOps, subscribe } from '../services/syncQueue';
import { QuestionAttemptOpPayload } from '../services/syncHandlers';

import { isSupabaseConfigured } from '../lib/supabaseClient';

export interface AnswersRepository {
  getAnswers(): Promise<Record<string, QuestionAnswerRecord>>;
  recordAnswer(record: QuestionAnswerRecord): Promise<QuestionAnswerSubmission>;
  subscribeToCorrection(clientOpId: string, listener: (review: QuestionReviewResult) => void): () => void;
}

export type QuestionAnswerSubmission =
  | { status: 'confirmed'; review: QuestionReviewResult; clientOpId?: string; serverClientOpId?: string }
  | { status: 'pending'; clientOpId: string; serverClientOpId?: string };

class LocalStorageAnswersRepository implements AnswersRepository {
  async getAnswers(): Promise<Record<string, QuestionAnswerRecord>> {
    return StorageService.getAnswers();
  }
  async recordAnswer(record: QuestionAnswerRecord): Promise<QuestionAnswerSubmission> {
    const question: Question | undefined = StorageService.getQuestions().find(
      (q) => q.id === record.questionId
    );
    const options = question?.options ?? [];
    const correct = options.find((o) => o.isCorrect);
    const isCorrect = correct?.letter === record.selectedOption;
    StorageService.recordAnswer({
      ...record,
      isCorrect,
      errorReason: isCorrect ? undefined : record.errorReason,
    });
    return { status: 'confirmed', review: {
      isCorrect,
      correctOptionId: correct?.letter ?? '',
      generalCommentary: question?.generalCommentary ?? '',
      highYieldSummary: question?.highYieldSummary ?? '',
      options: options.map((o) => ({
        optionId: o.letter,
        letter: o.letter,
        isCorrect: o.isCorrect,
        explanation: o.explanation,
      })),
      references: [], // LocalStorage não tem sources/question_references — não inventar.
    } };
  }

  subscribeToCorrection(): () => void {
    return () => undefined;
  }
}

class ResilientAnswersRepository implements AnswersRepository {
  private supa = new SupabaseAnswersRepository();
  private local = new LocalStorageAnswersRepository();

  async getAnswers(): Promise<Record<string, QuestionAnswerRecord>> {
    if (!isSupabaseConfigured) return this.local.getAnswers();
    try {
      return await this.supa.getAnswers();
    } catch {
      return this.local.getAnswers();
    }
  }

  async recordAnswer(record: QuestionAnswerRecord): Promise<QuestionAnswerSubmission> {
    const userId = getStorageUser();
    if (isSupabaseConfigured && userId) {
      const payload: QuestionAttemptOpPayload = {
        questionId: record.questionId,
        selectedOption: record.selectedOption,
        timeSpentSeconds: record.timeSpentSeconds,
        errorReason: record.errorReason,
        userNotes: record.userNotes,
        answerMode: record.answerMode,
        answerStrategy: record.answerStrategy,
        timestamp: record.timestamp,
      };
      const { op, result } = await enqueueAndTryTracked(userId, 'question_attempt', payload);
      if (result) {
        return {
          status: 'confirmed',
          clientOpId: op.id,
          serverClientOpId: op.clientOpId,
          review: mapQuestionReviewPayload(result as Parameters<typeof mapQuestionReviewPayload>[0]),
        };
      }
      // A fila já persistiu payload + client_op_id. Não gravamos um
      // `isCorrect=false` provisório no cache: isso contaminava estatísticas,
      // caderno de erros e flashcards antes de existir correção do servidor.
      return { status: 'pending', clientOpId: op.id, serverClientOpId: op.clientOpId };
    }
    return this.local.recordAnswer(record);
  }

  subscribeToCorrection(clientOpId: string, listener: (review: QuestionReviewResult) => void): () => void {
    const userId = getStorageUser();
    if (!userId) return () => undefined;
    let delivered = false;
    const deliverIfReady = () => {
      if (delivered) return;
      const op = getOps(userId).find((candidate) => candidate.id === clientOpId);
      if (op?.state !== 'synced' || !op.result) return;
      delivered = true;
      listener(mapQuestionReviewPayload(op.result as Parameters<typeof mapQuestionReviewPayload>[0]));
    };
    const unsubscribe = subscribe(userId, deliverIfReady);
    deliverIfReady();
    return unsubscribe;
  }
}

export const answersRepository: AnswersRepository = new ResilientAnswersRepository();
