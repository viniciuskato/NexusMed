import { UserFeedback } from '../types';
import { StorageService, getStorageUser } from '../services/storage';
import { SupabaseFeedbackRepository } from './SupabaseFeedbackRepository';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { enqueue } from '../services/syncQueue';
import { FeedbackSubmitOpPayload } from '../services/syncHandlers';

export interface FeedbackRepository {
  getFeedbacks(): Promise<UserFeedback[]>;
  saveFeedback(feedback: UserFeedback): Promise<void>;
  getAllFeedback(): Promise<UserFeedback[]>;
  updateFeedbackStatus(id: string, status: UserFeedback['status']): Promise<void>;
}

class LocalStorageFeedbackRepository implements FeedbackRepository {
  async getFeedbacks(): Promise<UserFeedback[]> {
    return StorageService.getFeedbacks();
  }
  async saveFeedback(feedback: UserFeedback): Promise<void> {
    StorageService.saveFeedback(feedback);
  }
  async getAllFeedback(): Promise<UserFeedback[]> {
    return StorageService.getFeedbacks();
  }
  async updateFeedbackStatus(id: string, status: UserFeedback['status']): Promise<void> {
    const list = await StorageService.getFeedbacks();
    const item = list.find((f) => f.id === id);
    if (item) {
      item.status = status;
      item.updatedAt = new Date().toISOString();
    }
  }
}

// Leitura (45-G, D-2): com Supabase configurado, só do servidor. A falha sobe
// para a tela, que diz "sem conexão" — nunca cai numa cópia local vazia ou velha.
class ResilientFeedbackRepository implements FeedbackRepository {
  private supa = new SupabaseFeedbackRepository();
  private local = new LocalStorageFeedbackRepository();

  async getFeedbacks(): Promise<UserFeedback[]> {
    if (!isSupabaseConfigured) return this.local.getFeedbacks();
    return this.supa.getFeedbacks();
  }

  // Categoria 9 (feedback, envio) — Prompt 07-F. Antes desta correção, uma
  // falha de rede era engolida em `catch {}` sem NENHUMA retentativa: o
  // relato ficava salvo só localmente (`this.local.saveFeedback` acima),
  // nunca chegando ao Supabase, sem qualquer sinal disso para o usuário ou
  // para o admin. Corrigido enfileirando com `client_op_id` estável = o
  // próprio `feedback.id` (gerado uma única vez no componente, antes de
  // qualquer tentativa de rede — ver ContextualFeedbackPopover.tsx e
  // FeedbackModal.tsx) — reenviar o MESMO relato depois de uma falha nunca
  // duplica linha (ver registerHandler('feedback_submit', ...) em
  // syncHandlers.ts e o comentário completo na migration
  // 20260910120000_sync_reliability_categorias_8_9.sql).
  async saveFeedback(feedback: UserFeedback): Promise<void> {
    this.local.saveFeedback(feedback);
    const userId = getStorageUser();
    if (isSupabaseConfigured && userId) {
      const payload: FeedbackSubmitOpPayload = { feedback };
      enqueue(userId, 'feedback_submit', payload, feedback.id);
    }
  }

  async getAllFeedback(): Promise<UserFeedback[]> {
    if (!isSupabaseConfigured) return this.local.getAllFeedback();
    return this.supa.getAllFeedback();
  }

  async updateFeedbackStatus(id: string, status: UserFeedback['status']): Promise<void> {
    if (!isSupabaseConfigured) return this.local.updateFeedbackStatus(id, status);
    return this.supa.updateFeedbackStatus(id, status);
  }
}

export const feedbackRepository: FeedbackRepository = new ResilientFeedbackRepository();
