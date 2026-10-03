import { supabase } from '../lib/supabaseClient';
import { ReadingProgressRepository } from './ReadingProgressRepository';

// ============================================================================
// Fase 4-5 wiring — Supabase-backed ReadingProgressRepository
// ============================================================================
//
// `ReadingProgressRepository` foi convertida para assíncrona e esta classe
// passou a declarar `implements ReadingProgressRepository` e a ser o
// singleton `readingProgressRepository` consumido pelo app.
//
// Mapeamento de campos (frontend <-> banco):
//
// Record<compendiumId, { readSectionIds, percent }> <-> reading_progress
//   compendiumId (chave do Record) <-> material_id
//   readSectionIds <-> read_section_ids (uuid[])
//   percent <-> percent
//   unique (user_id, material_id): no máximo uma linha de progresso por
//   compêndio por usuário. A gravação é só pela RPC set_section_read (45-H).
// ============================================================================

interface ReadingProgressRow {
  id: string;
  material_id: string;
  read_section_ids: string[];
  percent: number;
}

export class SupabaseReadingProgressRepository implements Pick<ReadingProgressRepository, 'getReadingProgress'> {
  // O app só usa a leitura daqui: a gravação vai pela fila (handler em
  // syncHandlers.ts), com o estado desejado explícito (45-G, AUD-29). O toggle
  // abaixo lê o servidor e inverte; fica só para scripts/validate-personal-repos.ts.
  async getReadingProgress(): Promise<Record<string, { readSectionIds: string[]; percent: number }>> {
    const { data, error } = await supabase.from('reading_progress').select('material_id, read_section_ids, percent');
    if (error) throw error;

    const result: Record<string, { readSectionIds: string[]; percent: number }> = {};
    for (const row of (data ?? []) as Pick<ReadingProgressRow, 'material_id' | 'read_section_ids' | 'percent'>[]) {
      result[row.material_id] = { readSectionIds: row.read_section_ids ?? [], percent: row.percent };
    }
    return result;
  }

  async toggleSectionRead(compendiumId: string, sectionId: string, totalSections: number): Promise<number> {
    const { data: existing, error: selErr } = await supabase
      .from('reading_progress')
      .select('read_section_ids')
      .eq('material_id', compendiumId)
      .maybeSingle();
    if (selErr) throw selErr;

    const isRead = !((existing?.read_section_ids ?? []) as string[]).includes(sectionId);
    // Só pela RPC (45-H): ela valida que a seção é do material e calcula o
    // percentual no servidor; o INSERT/UPDATE direto em reading_progress foi
    // revogado de `authenticated`.
    const { data, error } = await supabase.rpc('set_section_read', {
      p_material_id: compendiumId,
      p_section_id: sectionId,
      p_is_read: isRead,
      p_total_sections: totalSections,
    });
    if (error) throw error;
    return Number((data as { percent?: number } | null)?.percent ?? 0);
  }
}

export const supabaseReadingProgressRepository = new SupabaseReadingProgressRepository();
