import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import { getStorageUser, StorageService } from '../services/storage';
import { getOps } from '../services/syncQueue';
import type { ReadingProgressSetOpPayload } from '../services/syncHandlers';
import { juntarLeiturasPendentes, LeituraDeMaterial, MarcacaoPendente } from '../services/testarOQueLi';

// 43-C: o que o estudante leu e quando — só leitura, para "Testar o que li".
// Separado do ReadingProgressRepository de propósito: aquele devolve seções e
// percentual para o leitor; este precisa da data da última leitura
// (`reading_progress.updated_at`, que `set_section_read` atualiza a cada
// marcação). Com Supabase, lê só do servidor e a falha sobe para a tela, que
// diz "sem conexão" — nunca cai numa cópia local vazia ou velha (45-G, D-2).

export interface LeiturasRepository {
  getLeituras(): Promise<LeituraDeMaterial[]>;
}

function marcacoesPendentes(userId: string | null): MarcacaoPendente[] {
  if (!userId) return [];
  return getOps(userId)
    // Só o que ainda vai chegar ao servidor: a que falhou de vez não conta.
    .filter((op) => op.category === 'reading_progress_set' && (op.state === 'pending' || op.state === 'syncing'))
    .map((op) => {
      const payload = op.payload as ReadingProgressSetOpPayload;
      return {
        materialId: payload.compendiumId,
        sectionId: payload.sectionId,
        isRead: payload.isRead,
        criadaEm: op.createdAt,
      };
    });
}

class SupabaseLeiturasRepository implements LeiturasRepository {
  async getLeituras(): Promise<LeituraDeMaterial[]> {
    const { data, error } = await supabase.from('reading_progress').select('material_id, read_section_ids, updated_at');
    if (error) throw error;
    const doServidor = ((data ?? []) as { material_id: string; read_section_ids: string[] | null; updated_at: string }[]).map(
      (row) => ({
        materialId: row.material_id,
        secaoIds: row.read_section_ids ?? [],
        ultimaLeitura: row.updated_at,
      })
    );
    return juntarLeiturasPendentes(doServidor, marcacoesPendentes(getStorageUser()));
  }
}

// Sem Supabase (modo local), o progresso guardado não tem data: a única
// leitura datada é a sessão de leitura mais recente.
class LocalLeiturasRepository implements LeiturasRepository {
  async getLeituras(): Promise<LeituraDeMaterial[]> {
    const session = StorageService.getLastReadingSession();
    if (!session?.compendiumId || !session.updatedAt) return [];
    const secoesLidas = StorageService.getReadingProgress()[session.compendiumId]?.readSectionIds.length ?? 0;
    return [{ materialId: session.compendiumId, secoesLidas, ultimaLeitura: new Date(session.updatedAt).toISOString() }];
  }
}

export const leiturasRepository: LeiturasRepository = isSupabaseConfigured
  ? new SupabaseLeiturasRepository()
  : new LocalLeiturasRepository();
