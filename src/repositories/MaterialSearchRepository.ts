import { supabase } from '../lib/supabaseClient';

// ============================================================================
// Busca de materiais no banco (43-D)
// ============================================================================
// Chama a RPC search_materials (migration 20260924140000_busca_materiais.sql):
// busca textual do Postgres, sem acento/letra grega, por relevância, só o que
// o usuário pode ler (estudante: publicado; admin: também rascunho).
//
// De propósito NÃO há fallback local, ao contrário dos repositórios
// Resilient*: a busca roda no banco, não sobre o conteúdo baixado no
// navegador. Sem rede, a promessa rejeita e a tela diz que não conseguiu
// buscar.
// ============================================================================

export interface MaterialSearchResult {
  materialId: string;
  title: string;
  /** Título com os termos entre marcadores (ver utils/searchHighlight). */
  titleMarked: string;
  status: 'draft' | 'published' | 'archived';
  disciplineId: string;
  disciplineName: string;
  /** Disciplina e ancestrais na árvore, da raiz ao pai (rótulo curto quando existe). */
  treePath: string[];
  /** Seção que casou; null quando o clique deve abrir o material do topo. */
  sectionId: string | null;
  sectionTitleMarked: string | null;
  /** Trecho com os termos entre marcadores. */
  snippet: string;
  estimatedReadTimeMinutes: number;
}

export interface MaterialSearchFilters {
  disciplineId?: string;
  onlyUnread?: boolean;
}

interface SearchMaterialsRow {
  material_id: string;
  title: string;
  title_marked: string | null;
  status: string;
  discipline_id: string;
  discipline_name: string;
  tree_path: string[] | null;
  section_id: string | null;
  section_title_marked: string | null;
  snippet: string | null;
  estimated_read_time_minutes: number | null;
}

function rowToResult(row: SearchMaterialsRow): MaterialSearchResult {
  return {
    materialId: row.material_id,
    title: row.title,
    titleMarked: row.title_marked ?? row.title,
    status: (row.status as MaterialSearchResult['status']) ?? 'published',
    disciplineId: row.discipline_id,
    disciplineName: row.discipline_name,
    treePath: row.tree_path ?? [],
    sectionId: row.section_id,
    sectionTitleMarked: row.section_title_marked,
    snippet: row.snippet ?? '',
    estimatedReadTimeMinutes: row.estimated_read_time_minutes ?? 0,
  };
}

export async function searchMaterials(
  query: string,
  filters: MaterialSearchFilters = {}
): Promise<MaterialSearchResult[]> {
  const { data, error } = await supabase.rpc('search_materials', {
    p_query: query,
    p_discipline_id: filters.disciplineId ?? null,
    p_only_unread: filters.onlyUnread ?? false,
  });
  if (error) throw error;
  return ((data ?? []) as SearchMaterialsRow[]).map(rowToResult);
}
