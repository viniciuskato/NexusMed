import { StorageService, getStorageUser } from '../services/storage';
import { SupabaseReadingProgressRepository } from './SupabaseReadingProgressRepository';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { enqueue } from '../services/syncQueue';
import { ReadingProgressSetOpPayload } from '../services/syncHandlers';

export interface ReadingProgressRepository {
  getReadingProgress(): Promise<Record<string, { readSectionIds: string[]; percent: number }>>;
  /**
   * Grava o estado que o estudante pediu (`isRead`), decidido pela tela a
   * partir do que ela MOSTRA — nunca invertido a partir da cópia local (45-G,
   * AUD-29). Devolve o percentual local depois da mudança.
   */
  setSectionRead(compendiumId: string, sectionId: string, isRead: boolean, totalSections: number): Promise<number>;
}

class LocalStorageReadingProgressRepository implements ReadingProgressRepository {
  async getReadingProgress(): Promise<Record<string, { readSectionIds: string[]; percent: number }>> {
    return StorageService.getReadingProgress();
  }
  async setSectionRead(compendiumId: string, sectionId: string, isRead: boolean, totalSections: number): Promise<number> {
    return StorageService.setSectionRead(compendiumId, sectionId, isRead, totalSections);
  }
}

// Leitura (45-G, D-2): com Supabase configurado, só do servidor. A falha sobe
// para a tela, que diz "sem conexão" — nunca cai numa cópia local vazia ou velha.
class ResilientReadingProgressRepository implements ReadingProgressRepository {
  private supa = new SupabaseReadingProgressRepository();
  private local = new LocalStorageReadingProgressRepository();

  async getReadingProgress(): Promise<Record<string, { readSectionIds: string[]; percent: number }>> {
    if (!isSupabaseConfigured) return this.local.getReadingProgress();
    return this.supa.getReadingProgress();
  }

  async setSectionRead(compendiumId: string, sectionId: string, isRead: boolean, totalSections: number): Promise<number> {
    // Mesmo problema/solução dos favoritos: nunca reenviado como toggle. O
    // estado desejado vem da tela e vira um "set" explícito na fila — o merge
    // do array acontece no servidor (RPC set_section_read), nunca um array
    // calculado a partir de uma cópia local que num aparelho novo está vazia
    // (45-G, AUD-29).
    const desiredIsRead = isRead;
    const localPercent = await this.local.setSectionRead(compendiumId, sectionId, isRead, totalSections);

    const userId = getStorageUser();
    if (isSupabaseConfigured && userId) {
      const payload: ReadingProgressSetOpPayload = {
        compendiumId,
        sectionId,
        isRead: desiredIsRead,
        totalSections,
      };
      enqueue(userId, 'reading_progress_set', payload);
    }
    return localPercent;
  }
}

export const readingProgressRepository: ReadingProgressRepository = new ResilientReadingProgressRepository();
