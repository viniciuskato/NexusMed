import { StorageService, getStorageUser } from '../services/storage';
import { SupabaseBookmarksRepository } from './SupabaseBookmarksRepository';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { enqueue } from '../services/syncQueue';
import { BookmarkSetOpPayload } from '../services/syncHandlers';

export interface BookmarksRepository {
  getBookmarks(): Promise<{
    questions: string[];
    compendiums: string[];
    flashcards: string[];
  }>;
  /**
   * Grava o estado que o estudante pediu (`desired`), decidido pela tela a
   * partir do que ela MOSTRA — nunca invertido a partir da cópia local, que
   * num aparelho novo está vazia (45-G, AUD-29). Devolve `desired`.
   */
  setBookmark(type: 'questions' | 'compendiums' | 'flashcards', id: string, desired: boolean): Promise<boolean>;
}

class LocalStorageBookmarksRepository implements BookmarksRepository {
  async getBookmarks(): Promise<{
    questions: string[];
    compendiums: string[];
    flashcards: string[];
  }> {
    return StorageService.getBookmarks();
  }
  async setBookmark(type: 'questions' | 'compendiums' | 'flashcards', id: string, desired: boolean): Promise<boolean> {
    return StorageService.setBookmark(type, id, desired);
  }
}

// Leitura (45-G, D-2): com Supabase configurado, só do servidor. A falha sobe
// para a tela, que diz "sem conexão" — nunca cai numa cópia local vazia ou velha.
class ResilientBookmarksRepository implements BookmarksRepository {
  private supa = new SupabaseBookmarksRepository();
  private local = new LocalStorageBookmarksRepository();

  async getBookmarks(): Promise<{
    questions: string[];
    compendiums: string[];
    flashcards: string[];
  }> {
    if (!isSupabaseConfigured) return this.local.getBookmarks();
    return this.supa.getBookmarks();
  }

  async setBookmark(type: 'questions' | 'compendiums' | 'flashcards', id: string, desired: boolean): Promise<boolean> {
    // Favoritar/desfavoritar é um "toggle" na interface, mas NÃO pode ser
    // enviado ao servidor como toggle: reenviar a mesma operação depois de
    // uma falha de rede inverteria o estado errado. O estado desejado vem da
    // tela (o contrário do que ela mostra) e entra na fila como um "set"
    // explícito, idempotente por natureza — reenviar o MESMO `desired` é
    // sempre um no-op seguro. Antes da 45-G o toggle era feito aqui, sobre a
    // cópia local; num aparelho novo ela está vazia e a estrela preenchida
    // gravava "favoritar" (AUD-29).
    await this.local.setBookmark(type, id, desired);
    const userId = getStorageUser();
    if (isSupabaseConfigured && userId) {
      const payload: BookmarkSetOpPayload = { type, id, desired };
      enqueue(userId, 'bookmark_set', payload);
    }
    return desired;
  }
}

export const bookmarksRepository: BookmarksRepository = new ResilientBookmarksRepository();
