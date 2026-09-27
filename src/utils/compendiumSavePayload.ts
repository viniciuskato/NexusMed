import type { Compendium, CompendiumSection, MaterialNavigationLink } from '../types';

// Carga do `save_compendium` — montada aqui, e não no repositório, porque a
// 45-K guarda essa mesma carga como edição pendente de material publicado, e
// o formulário precisa reabri-la. Ida (material → carga) e volta (carga →
// material) moram juntas: reabrir e salvar sem mexer tem de reenviar a mesma
// carga (AGENTS.md, risco 17).

export interface SaveCompendiumPayload {
  p_material: Record<string, unknown>;
  p_sections: Array<Record<string, unknown>>;
  p_references: Array<Record<string, unknown>>;
}

export function buildSaveCompendiumPayload(compendium: Compendium): SaveCompendiumPayload {
  return {
    // parent_material_id/tree_sort_order/nav_short_title/taxonomy_kind/
    // navigation_links vão SEMPRE (mesmo null/[]): desde a Fase 2 o
    // formulário do Admin é a fonte de verdade da navegação; omitir a chave
    // faria a RPC preservar o valor anterior (ver 20260922130000, bloco 10).
    p_material: {
      id: compendium.id,
      discipline_id: compendium.disciplineId,
      theme_id: compendium.themeId,
      title: compendium.title,
      subtitle: compendium.subtitle || null,
      mode: compendium.mode ?? null,
      study_lens: compendium.studyLens ?? null,
      module_number: compendium.moduleNumber ?? null,
      // 0 é "desconhecido": a leitura mapeia nulo → 0 (o tipo é number), então
      // gravar 0 de volta trocaria nulo por 0 e mudaria o hash atestado.
      estimated_read_time_minutes: compendium.estimatedReadTimeMinutes || null,
      author: compendium.author || null,
      tags: compendium.tags ?? [],
      parent_material_id: compendium.parentMaterialId ?? null,
      tree_sort_order: compendium.treeSortOrder ?? 0,
      nav_short_title: compendium.navShortTitle?.trim() || null,
      taxonomy_kind: compendium.taxonomyKind ?? null,
      navigation_links: (compendium.navigationLinks ?? []).map((l) => ({
        material_id: l.materialId,
        link_type: l.linkType,
        sort_order: l.sortOrder,
      })),
    },
    p_sections: compendium.sections.map((s) => ({
      id: s.id,
      title: s.title,
      mechanism_tag: s.mechanismTag ?? null,
      content: s.content,
      key_takeaways: s.keyTakeaways ?? [],
      clinical_pearl: s.clinicalPearl ?? null,
      warning_alert: s.warningAlert ?? null,
    })),
    // Só o texto. O banco casa cada referência com a existente de texto
    // idêntico e preserva id e vínculo com fonte curada; o vínculo é gerido
    // exclusivamente pelo painel de referências (updateMaterialReferenceSource).
    p_references: compendium.references.map((text) => ({ citation_text: text })),
  };
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

/**
 * Material como a edição pendente o deixaria, a partir da carga guardada e do
 * material atestado (que fornece o que a carga não carrega: status, data,
 * vínculos de referência com fonte curada).
 */
export function compendiumFromSavePayload(
  current: Compendium,
  payload: { material: Record<string, unknown>; sections: Array<Record<string, unknown>>; references: Array<Record<string, unknown>> }
): Compendium {
  const m = payload.material;
  const sections: CompendiumSection[] = payload.sections.map((s) => ({
    id: String(s.id),
    title: String(s.title ?? ''),
    content: String(s.content ?? ''),
    keyTakeaways: Array.isArray(s.key_takeaways) ? (s.key_takeaways as string[]) : [],
    ...(str(s.mechanism_tag) ? { mechanismTag: str(s.mechanism_tag) } : {}),
    ...(str(s.clinical_pearl) ? { clinicalPearl: str(s.clinical_pearl) } : {}),
    ...(str(s.warning_alert) ? { warningAlert: str(s.warning_alert) } : {}),
  }));
  const links = Array.isArray(m.navigation_links) ? (m.navigation_links as Array<Record<string, unknown>>) : [];
  return {
    ...current,
    disciplineId: String(m.discipline_id ?? current.disciplineId),
    themeId: String(m.theme_id ?? current.themeId),
    title: String(m.title ?? ''),
    subtitle: str(m.subtitle) ?? '',
    mode: str(m.mode) as Compendium['mode'],
    studyLens: str(m.study_lens) as Compendium['studyLens'],
    moduleNumber: num(m.module_number),
    estimatedReadTimeMinutes: num(m.estimated_read_time_minutes) ?? 0,
    author: str(m.author) ?? '',
    tags: Array.isArray(m.tags) ? (m.tags as string[]) : [],
    parentMaterialId: str(m.parent_material_id) ?? null,
    treeSortOrder: num(m.tree_sort_order) ?? 0,
    navShortTitle: str(m.nav_short_title),
    taxonomyKind: str(m.taxonomy_kind) as Compendium['taxonomyKind'],
    navigationLinks: links.map(
      (l): MaterialNavigationLink => ({
        materialId: String(l.material_id),
        linkType: l.link_type as MaterialNavigationLink['linkType'],
        sortOrder: Number(l.sort_order ?? 0),
      })
    ),
    sections,
    references: payload.references.map((r) => String(r.citation_text ?? '')),
    // Alinhado por índice às referências atestadas: não vale para a edição.
    referenceSources: undefined,
  };
}
