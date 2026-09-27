import { StorageService, getStorageUser } from '../services/storage';
import { SupabaseNotesRepository } from './SupabaseNotesRepository';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { enqueue } from '../services/syncQueue';
import { NoteUpsertOpPayload } from '../services/syncHandlers';

export interface NotesRepository {
  getNotes(): Promise<Record<string, string>>;
  saveNote(targetId: string, noteText: string): Promise<void>;
}

class LocalStorageNotesRepository implements NotesRepository {
  async getNotes(): Promise<Record<string, string>> {
    return StorageService.getNotes();
  }
  async saveNote(targetId: string, noteText: string): Promise<void> {
    StorageService.saveNote(targetId, noteText);
  }
}

// Leitura (45-G, D-2): com Supabase configurado, só do servidor. A falha sobe
// para a tela, que diz "sem conexão" — nunca cai numa cópia local vazia ou velha.
class ResilientNotesRepository implements NotesRepository {
  private supa = new SupabaseNotesRepository();
  private local = new LocalStorageNotesRepository();

  async getNotes(): Promise<Record<string, string>> {
    if (!isSupabaseConfigured) return this.local.getNotes();
    return this.supa.getNotes();
  }

  async saveNote(targetId: string, noteText: string): Promise<void> {
    // Grava local primeiro. Envio ao Supabase passa pela fila — o handler
    // (`note_upsert`, src/services/syncHandlers.ts) usa upsert real (single
    // round-trip) contra os índices únicos parciais da migration
    // sync_reliability_categorias_3_a_7, em vez do delete+insert anterior
    // (não atômico, sem constraint — podia deixar 0 ou 2 linhas para o mesmo
    // alvo). "Última gravação vence" é aceitável aqui: é o próprio dono
    // editando a própria nota, sem edição concorrente esperada na prática.
    this.local.saveNote(targetId, noteText);
    const userId = getStorageUser();
    if (isSupabaseConfigured && userId) {
      const payload: NoteUpsertOpPayload = { targetId, noteText };
      enqueue(userId, 'note_upsert', payload);
    }
  }
}

export const notesRepository: NotesRepository = new ResilientNotesRepository();
