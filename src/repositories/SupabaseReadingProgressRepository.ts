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
//   compêndio por usuário — toggleSectionRead faz upsert lógico
//   (update se já existir linha, insert caso contrário).
//   user_id não tem default no schema: buscado via supabase.auth.getUser()
//   apenas no caminho de insert (update não precisa, RLS já filtra por dono).
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
      .select('id, read_section_ids')
      .eq('material_id', compendiumId)
      .maybeSingle();
    if (selErr) throw selErr;

    const current: string[] = existing?.read_section_ids ?? [];
    const idx = current.indexOf(sectionId);
    const updated = idx >= 0 ? current.filter((_, i) => i !== idx) : [...current, sectionId];
    const percent = Math.round((updated.length / Math.max(1, totalSections)) * 100);

    if (existing) {
      const { error } = await supabase
        .from('reading_progress')
        .update({ read_section_ids: updated, percent })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;

      const { error } = await supabase.from('reading_progress').insert({
        user_id: userData.user?.id,
        material_id: compendiumId,
        read_section_ids: updated,
        percent,
      });
      if (error) throw error;
    }

    return percent;
  }
}

export const supabaseReadingProgressRepository = new SupabaseReadingProgressRepository();
