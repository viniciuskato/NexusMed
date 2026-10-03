import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

// 44-G: o selo de revisão que o leitor mostra num material publicado.
// Acesso direto ao Supabase (sem o padrão "Resilient", AGENTS.md risco 8): é só
// leitura, decidida pelo banco (`selo_de_revisao`).
//   'ia'           revisado pela IA, ainda não lido por uma pessoa;
//   'ia_e_pessoa'  revisado pela IA e atestado por uma pessoa;
//   null           material antigo, ou alterado depois da revisão da IA: sem selo.

export type SeloDeRevisao = 'ia' | 'ia_e_pessoa';

export interface MaterialSealRepository {
  getSeal(materialId: string): Promise<SeloDeRevisao | null>;
}

class SupabaseMaterialSealRepository implements MaterialSealRepository {
  async getSeal(materialId: string): Promise<SeloDeRevisao | null> {
    const { data, error } = await supabase.rpc('selo_de_revisao', { p_material_id: materialId });
    if (error) throw error;
    return data === 'ia' || data === 'ia_e_pessoa' ? data : null;
  }
}

// Sem Supabase configurado (modo local de demonstração) não há revisão de IA.
class UnavailableMaterialSealRepository implements MaterialSealRepository {
  async getSeal(): Promise<SeloDeRevisao | null> {
    return null;
  }
}

export const materialSealRepository: MaterialSealRepository = isSupabaseConfigured
  ? new SupabaseMaterialSealRepository()
  : new UnavailableMaterialSealRepository();
