import { SimuladoSessionData } from '../types';
import { StorageService, getStorageUser } from '../services/storage';
import { SupabaseSimuladosRepository } from './SupabaseSimuladosRepository';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { enqueueAndTryTracked, getOps, subscribe } from '../services/syncQueue';
import { SimuladoSaveOpPayload } from '../services/syncHandlers';

export interface SimuladosRepository {
  getSimulados(): Promise<SimuladoSessionData[]>;
  saveSimuladoSession(session: SimuladoSessionData): Promise<SimuladoSaveOutcome>;
  subscribeToResult(clientOpId: string, listener: (result: SimuladoServerResult) => void): () => void;
  getSimuladoHistory(): Promise<SimuladoSessionData[]>;
}

export interface SimuladoServerResult {
  score: number;
  correctCount: number;
  totalCount: number;
}

export type SimuladoSaveOutcome =
  | { status: 'confirmed'; result: SimuladoServerResult; clientOpId?: string }
  | { status: 'pending'; clientOpId: string };

class LocalStorageSimuladosRepository implements SimuladosRepository {
  async getSimulados(): Promise<SimuladoSessionData[]> {
    return StorageService.getSimulados();
  }
  async saveSimuladoSession(session: SimuladoSessionData): Promise<SimuladoSaveOutcome> {
    const answers = StorageService.getAnswers();
    const correctCount = session.questionIds.filter((id) => answers[id]?.isCorrect).length;
    const totalCount = session.questionIds.length;
    const score = Math.round((correctCount / Math.max(1, totalCount)) * 100);
    StorageService.saveSimuladoSession({ ...session, score });
    return { status: 'confirmed', result: { score, correctCount, totalCount } };
  }
  subscribeToResult(): () => void {
    return () => undefined;
  }
  async getSimuladoHistory(): Promise<SimuladoSessionData[]> {
    return StorageService.getSimuladoHistory();
  }
}

class ResilientSimuladosRepository implements SimuladosRepository {
  private supa = new SupabaseSimuladosRepository();
  private local = new LocalStorageSimuladosRepository();

  async getSimulados(): Promise<SimuladoSessionData[]> {
    if (!isSupabaseConfigured) return this.local.getSimulados();
    try {
      return await this.supa.getSimulados();
    } catch {
      return this.local.getSimulados();
    }
  }

  async saveSimuladoSession(session: SimuladoSessionData): Promise<SimuladoSaveOutcome> {
    // Grava local primeiro (nunca perde o resultado do simulado). Envio ao
    // Supabase passa pela fila e por uma RPC transacional
    // (`save_simulado_session`, migration sync_reliability_categorias_3_a_7)
    // em vez das 4 operações separadas sem transação de antes (upsert de
    // simulations + delete/insert de simulation_questions + insert de
    // simulation_answers) — uma falha entre essas etapas deixava o simulado
    // sem perguntas/respostas no servidor, sem erro visível (catch{}
    // silencioso) e sem retry. A RPC substitui tudo numa única transação
    // (tudo ou nada) e é idempotente por construção: reenviar o MESMO
    // payload sempre chega ao mesmo estado final (substituição total, não um
    // evento incremental) — não precisa de client_op_id para correção.
    if (!isSupabaseConfigured) return this.local.saveSimuladoSession(session);
    StorageService.saveSimuladoSession(session);
    const userId = getStorageUser();
    if (userId) {
      const payload: SimuladoSaveOpPayload = { session };
      const { op, result } = await enqueueAndTryTracked(userId, 'simulado_save', payload);
      if (result) {
        return { status: 'confirmed', clientOpId: op.id, result: result as SimuladoServerResult };
      }
      return { status: 'pending', clientOpId: op.id };
    }
    return this.local.saveSimuladoSession(session);
  }

  subscribeToResult(clientOpId: string, listener: (result: SimuladoServerResult) => void): () => void {
    const userId = getStorageUser();
    if (!userId) return () => undefined;
    let delivered = false;
    const deliverIfReady = () => {
      if (delivered) return;
      const op = getOps(userId).find((candidate) => candidate.id === clientOpId);
      if (op?.state !== 'synced' || !op.result) return;
      delivered = true;
      listener(op.result as SimuladoServerResult);
    };
    const unsubscribe = subscribe(userId, deliverIfReady);
    deliverIfReady();
    return unsubscribe;
  }

  async getSimuladoHistory(): Promise<SimuladoSessionData[]> {
    if (!isSupabaseConfigured) return this.local.getSimuladoHistory();
    try {
      return await this.supa.getSimuladoHistory();
    } catch {
      return this.local.getSimuladoHistory();
    }
  }
}

export const simuladosRepository: SimuladosRepository = new ResilientSimuladosRepository();
