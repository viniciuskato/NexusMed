import { StorageService, getStorageUser } from '../services/storage';
import { SupabaseNotesRepository } from './SupabaseNotesRepository';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { enqueue } from '../services/syncQueue';
import { NoteUpsertOpPayload } from '../services/syncHandlers';

/** Anotação de uma seção que saiu do material (45-D): só leitura. */
export interface RemovedSectionNote {
  sectionTitle: string;
  noteText: string;
}

export interface NotesRepository {
  getNotes(): Promise<Record<string, string>>;
  saveNote(targetId: string, noteText: string): Promise<void>;
  /** Anotações do aluno em seções que saíram deste material. */
  getRemovedSectionNotes(materialId: string): Promise<RemovedSectionNote[]>;
}

class LocalStorageNotesRepository implements NotesRepository {
  async getNotes(): Promise<Record<string, string>> {
    return StorageService.getNotes();
  }
  // A remoção de seção acontece no banco; sem ele, não há o que mostrar.
  async getRemovedSectionNotes(): Promise<RemovedSectionNote[]> {
    return [];
  }
  async saveNote(targetId: string, noteText: string): Promise<void> {
    StorageService.saveNote(targetId, noteText);
  }
}

class ResilientNotesRepository implements NotesRepository {
  private supa = new SupabaseNotesRepository();
  private local = new LocalStorageNotesRepository();

  async getNotes(): Promise<Record<string, string>> {
    if (!isSupabaseConfigured) return this.local.getNotes();
    try {
      return await this.supa.getNotes();
    } catch {
      return this.local.getNotes();
    }
  }

  async getRemovedSectionNotes(materialId: string): Promise<RemovedSectionNote[]> {
    if (!isSupabaseConfigured) return this.local.getRemovedSectionNotes();
    try {
      return await this.supa.getRemovedSectionNotes(materialId);
    } catch {
      return [];
    }
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
