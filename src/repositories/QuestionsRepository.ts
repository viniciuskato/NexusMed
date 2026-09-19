import { Question, QuestionReviewResult } from '../types';
import { StorageService } from '../services/storage';
import { SupabaseQuestionsRepository } from './SupabaseQuestionsRepository';

import { isSupabaseConfigured } from '../lib/supabaseClient';

export interface QuestionsRepository {
  getQuestions(): Promise<Question[]>;
  saveQuestions(questions: Question[]): Promise<void>;
  saveQuestion(question: Question): Promise<void>;
  deleteQuestion(id: string): Promise<void>;
  saveCustomQuestion(question: Question): Promise<void>;
  getQuestionReview(questionId: string): Promise<QuestionReviewResult>;
  publishQuestion(id: string): Promise<void>;
  unpublishQuestion(id: string): Promise<void>;
  /**
   * Altera SÓ o vínculo material_id/material_section_id de uma questão já
   * existente — nunca reenvia/sobrescreve stem, opções, gabarito,
   * explicações, referências ou status (21-D: reusar saveQuestion inteiro
   * pra isso ampliaria o risco). materialId null = "Sem material" (limpa
   * também materialSectionId, já que uma seção não existe sem material).
   */
  updateQuestionMaterialLink(questionId: string, materialId: string | null, materialSectionId: string | null): Promise<void>;
}

class LocalStorageQuestionsRepository implements QuestionsRepository {
  async getQuestions(): Promise<Question[]> {
    return StorageService.getQuestions();
  }
  async saveQuestions(questions: Question[]): Promise<void> {
    StorageService.saveQuestions(questions);
  }
  async saveQuestion(question: Question): Promise<void> {
    StorageService.saveQuestion(question);
  }
  async deleteQuestion(id: string): Promise<void> {
    StorageService.deleteQuestion(id);
  }
  async saveCustomQuestion(question: Question): Promise<void> {
    StorageService.saveCustomQuestion(question);
  }
  async getQuestionReview(questionId: string): Promise<QuestionReviewResult> {
    const question = StorageService.getQuestions().find((q) => q.id === questionId);
    const options = question?.options ?? [];
    const correct = options.find((o) => o.isCorrect);
    return {
      isCorrect: true,
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
    };
  }
  async publishQuestion(_id: string): Promise<void> {}
  async unpublishQuestion(_id: string): Promise<void> {}
  async updateQuestionMaterialLink(questionId: string, materialId: string | null, materialSectionId: string | null): Promise<void> {
    const question = StorageService.getQuestions().find((q) => q.id === questionId);
    if (!question) return;
    StorageService.saveQuestion({
      ...question,
      compendiumRefId: materialId ?? '',
      compendiumSectionId: materialSectionId ?? undefined,
    });
  }
}

class ResilientQuestionsRepository implements QuestionsRepository {
  private supa = new SupabaseQuestionsRepository();
  private local = new LocalStorageQuestionsRepository();

  async getQuestions(): Promise<Question[]> {
    if (!isSupabaseConfigured) return this.local.getQuestions();
    try {
      const res = await this.supa.getQuestions();
      return res;
    } catch {
      return this.local.getQuestions();
    }
  }

  async saveQuestions(questions: Question[]): Promise<void> {
    this.local.saveQuestions(questions);
    if (isSupabaseConfigured) {
      try { await this.supa.saveQuestions(questions); } catch (err) { console.error(`[QuestionsRepository] falha ao sincronizar saveQuestions com Supabase:`, err); throw err; }
    }
  }

  async saveQuestion(question: Question): Promise<void> {
    this.local.saveQuestion(question);
    if (isSupabaseConfigured) {
      try { await this.supa.saveQuestion(question); } catch (err) { console.error(`[QuestionsRepository] falha ao sincronizar saveQuestion com Supabase:`, err); throw err; }
    }
  }

  async deleteQuestion(id: string): Promise<void> {
    this.local.deleteQuestion(id);
    if (isSupabaseConfigured) {
      try { await this.supa.deleteQuestion(id); } catch (err) { console.error(`[QuestionsRepository] falha ao sincronizar deleteQuestion com Supabase:`, err); throw err; }
    }
  }

  async saveCustomQuestion(question: Question): Promise<void> {
    this.local.saveCustomQuestion(question);
    if (isSupabaseConfigured) {
      try { await this.supa.saveCustomQuestion(question); } catch (err) { console.error(`[QuestionsRepository] falha ao sincronizar saveCustomQuestion com Supabase:`, err); throw err; }
    }
  }

  async getQuestionReview(questionId: string): Promise<QuestionReviewResult> {
    if (!isSupabaseConfigured) return this.local.getQuestionReview(questionId);
    try {
      return await this.supa.getQuestionReview(questionId);
    } catch {
      return this.local.getQuestionReview(questionId);
    }
  }

  async publishQuestion(id: string): Promise<void> {
    if (isSupabaseConfigured) {
      try { await this.supa.publishQuestion(id); } catch (err) { console.error(`[QuestionsRepository] falha ao sincronizar publishQuestion com Supabase:`, err); throw err; }
    }
  }

  async unpublishQuestion(id: string): Promise<void> {
    if (isSupabaseConfigured) {
      try { await this.supa.unpublishQuestion(id); } catch (err) { console.error(`[QuestionsRepository] falha ao sincronizar unpublishQuestion com Supabase:`, err); throw err; }
    }
  }

  async updateQuestionMaterialLink(questionId: string, materialId: string | null, materialSectionId: string | null): Promise<void> {
    await this.local.updateQuestionMaterialLink(questionId, materialId, materialSectionId);
    if (isSupabaseConfigured) {
      try {
        await this.supa.updateQuestionMaterialLink(questionId, materialId, materialSectionId);
      } catch (err) {
        console.error(`[QuestionsRepository] falha ao sincronizar updateQuestionMaterialLink com Supabase:`, err);
        throw err;
      }
    }
  }
}

export const questionsRepository: QuestionsRepository = new ResilientQuestionsRepository();
