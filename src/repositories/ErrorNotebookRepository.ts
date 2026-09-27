import { ErrorLogItem } from '../types';
import { StorageService, getStorageUser } from '../services/storage';
import { SupabaseErrorNotebookRepository } from './SupabaseErrorNotebookRepository';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { enqueue } from '../services/syncQueue';
import { ErrorNotebookUpdateOpPayload } from '../services/syncHandlers';

export interface ErrorNotebookRepository {
  getErrorLogs(): Promise<ErrorLogItem[]>;
  updateErrorLog(errorItem: ErrorLogItem): Promise<void>;
}

class LocalStorageErrorNotebookRepository implements ErrorNotebookRepository {
  async getErrorLogs(): Promise<ErrorLogItem[]> {
    return StorageService.getErrorLogs();
  }
  async updateErrorLog(errorItem: ErrorLogItem): Promise<void> {
    StorageService.updateErrorLog(errorItem);
  }
}

// Leitura (45-G, D-2): com Supabase configurado, só do servidor. A falha sobe
// para a tela, que diz "sem conexão" — nunca cai numa cópia local vazia ou velha.
class ResilientErrorNotebookRepository implements ErrorNotebookRepository {
  private supa = new SupabaseErrorNotebookRepository();
  private local = new LocalStorageErrorNotebookRepository();

  async getErrorLogs(): Promise<ErrorLogItem[]> {
    if (!isSupabaseConfigured) return this.local.getErrorLogs();
    return this.supa.getErrorLogs();
  }

  async updateErrorLog(errorItem: ErrorLogItem): Promise<void> {
    // Grava local primeiro (nunca perde a marcação de resolvido/nota do
    // estudante). Envio ao Supabase passa pela fila (retry/backoff/estado
    // visível) em vez do catch{} silencioso anterior — update por id já é
    // idempotente por natureza (reenviar os mesmos valores tem o mesmo
    // efeito), então não precisa de client_op_id para segurança, só de
    // visibilidade quando falha.
    this.local.updateErrorLog(errorItem);
    const userId = getStorageUser();
    if (isSupabaseConfigured && userId) {
      const payload: ErrorNotebookUpdateOpPayload = { errorItem };
      enqueue(userId, 'error_notebook_update', payload);
    }
  }
}

export const errorNotebookRepository: ErrorNotebookRepository = new ResilientErrorNotebookRepository();
