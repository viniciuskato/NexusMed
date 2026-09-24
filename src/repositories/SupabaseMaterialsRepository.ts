import { sourceUrl } from '../utils/bibliographicSources';
import { Discipline, Theme, Compendium, CompendiumSection, CompendiumSectionSnapshot, MaterialSectionVersion } from '../types';
import { supabase } from '../lib/supabaseClient';
import { MaterialsRepository } from './MaterialsRepository';
import { fetchAllRows, fetchAllRowsByIds } from './supabasePaging';

// ============================================================================
// Fase 3 — Supabase-backed MaterialsRepository
// ============================================================================
//
// Fase 4-5 wiring: `MaterialsRepository` foi convertida para assíncrona e
// esta classe passou a declarar `implements MaterialsRepository` e a ser o
// singleton `materialsRepository` consumido pelo app.
//
// Mapeamento de campos (frontend <-> banco):
//
// Discipline <-> disciplines
//   id <-> id | name <-> name | code <-> code | icon <-> icon
//   description <-> description | cycle <-> cycle | color <-> color
//   themesCount: não persistido (derivado, calculado sob demanda se necessário)
//
// Theme <-> themes
//   id <-> id | disciplineId <-> discipline_id | name <-> name
//   description <-> description | highYield <-> high_yield | order <-> sort_order
//
// Compendium <-> materials (+ material_sections + material_references)
//   id <-> materials.id | disciplineId <-> discipline_id | themeId <-> theme_id
//   title <-> title | subtitle <-> subtitle
//   estimatedReadTimeMinutes <-> estimated_read_time_minutes
//   lastUpdated <-> updated_at (ISO string) | author <-> author
//   mode <-> mode | studyLens <-> study_lens | tags <-> tags
//   sections <-> material_sections (uma linha por seção, ordenada por sort_order)
//     CompendiumSection.id <-> id | title <-> title
//     mechanismTag <-> mechanism_tag | content <-> content
//     keyTakeaways <-> key_takeaways | clinicalPearl <-> clinical_pearl
//     warningAlert <-> warning_alert
//   references <-> material_references.citation_text (ordenada por sort_order)
//
//   Campos do frontend SEM equivalente no schema atual (não persistidos —
//   lacuna conhecida, não um bug de mapeamento):
//     editorialStatus (domínio 'completo'/'em_atualizacao'/'em_revisao' não
//       bate com materials.status 'draft'/'published'/'archived')
//     dependencies, diagramSvgKey (por seção), isPremiumOnly
//   material_references.url também não é populado a partir do frontend
//   (Compendium.references é só string[] de texto de citação).
// ============================================================================

interface DisciplineRow {
  id: string;
  name: string;
  code: string;
  icon: string | null;
  description: string | null;
  cycle: string;
  color: string | null;
  sort_order: number;
}

interface ThemeRow {
  id: string;
  discipline_id: string;
  name: string;
  description: string | null;
  high_yield: boolean;
  sort_order: number;
}

interface MaterialRow {
  id: string;
  discipline_id: string;
  theme_id: string;
  title: string;
  subtitle: string | null;
  mode: string | null;
  study_lens: string | null;
  module_number: number | null;
  estimated_read_time_minutes: number | null;
  author: string | null;
  tags: string[];
  updated_at: string;
  status: string;
  parent_material_id: string | null;
  tree_sort_order: number;
  nav_short_title: string | null;
  taxonomy_kind: string | null;
}

interface MaterialLinkRow {
  id: string;
  source_material_id: string;
  target_material_id: string;
  link_type: 'prerequisite' | 'related';
  sort_order: number;
}

interface MaterialSectionRow {
  id: string;
  material_id: string;
  sort_order: number;
  title: string;
  mechanism_tag: string | null;
  content: string;
  key_takeaways: string[];
  clinical_pearl: string | null;
  warning_alert: string | null;
}

interface MaterialReferenceRow {
  id: string;
  material_id: string;
  citation_text: string;
  url: string | null;
  source_id: string | null;
  sort_order: number;
}

interface SourceRow {
  id: string;
  citation_text: string;
  verificacao: string;
  identificadores: Record<string, string> | null;
}

interface MaterialSectionVersionRow {
  id: string;
  material_section_id: string;
  changed_by: string | null;
  changed_fields: string[];
  reason: string | null;
  before_snapshot: CompendiumSectionSnapshot;
  after_snapshot: CompendiumSectionSnapshot;
  created_at: string;
}

function rowToSectionVersion(row: MaterialSectionVersionRow): MaterialSectionVersion {
  return {
    id: row.id,
    materialSectionId: row.material_section_id,
    changedBy: row.changed_by,
    changedFields: row.changed_fields ?? [],
    reason: row.reason,
    beforeSnapshot: row.before_snapshot,
    afterSnapshot: row.after_snapshot,
    createdAt: row.created_at,
  };
}

// Campos de prosa editáveis pelo SectionEditor — mesmo conjunto persistido em
// cada snapshot de material_section_versions (ver plano da feature: histórico
// guarda o objeto completo da seção, não diff incremental).
const SECTION_SNAPSHOT_FIELDS = ['title', 'mechanismTag', 'content', 'keyTakeaways', 'clinicalPearl', 'warningAlert'] as const;

function sectionToSnapshot(row: {
  title: string;
  mechanism_tag: string | null;
  content: string;
  key_takeaways: string[];
  clinical_pearl: string | null;
  warning_alert: string | null;
}): CompendiumSectionSnapshot {
  return {
    title: row.title,
    mechanismTag: row.mechanism_tag ?? undefined,
    content: row.content,
    keyTakeaways: row.key_takeaways ?? [],
    clinicalPearl: row.clinical_pearl ?? undefined,
    warningAlert: row.warning_alert ?? undefined,
  };
}

function rowToDiscipline(row: DisciplineRow): Discipline {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    icon: row.icon ?? '',
    description: row.description ?? '',
    cycle: row.cycle as Discipline['cycle'],
    color: row.color ?? '',
  };
}

function disciplineToRow(d: Discipline, sortOrder: number): DisciplineRow {
  return {
    id: d.id,
    name: d.name,
    code: d.code,
    icon: d.icon || null,
    description: d.description || null,
    cycle: d.cycle,
    color: d.color || null,
    sort_order: sortOrder,
  };
}

function rowToTheme(row: ThemeRow): Theme {
  return {
    id: row.id,
    disciplineId: row.discipline_id,
    name: row.name,
    description: row.description ?? '',
    highYield: row.high_yield,
    order: row.sort_order,
  };
}

function themeToRow(t: Theme): ThemeRow {
  return {
    id: t.id,
    discipline_id: t.disciplineId,
    name: t.name,
    description: t.description || null,
    high_yield: t.highYield,
    sort_order: t.order,
  };
}

function rowToSection(row: MaterialSectionRow): CompendiumSection {
  return {
    id: row.id,
    title: row.title,
    mechanismTag: row.mechanism_tag ?? undefined,
    content: row.content,
    keyTakeaways: row.key_takeaways ?? [],
    clinicalPearl: row.clinical_pearl ?? undefined,
    warningAlert: row.warning_alert ?? undefined,
  };
}

// Só resolve um link quando a fonte curada tem um identificador reconhecido
// (mesma lógica de urlFromIdentificadores em questionReviewMapper.ts, mas
// sem importar de lá para não acoplar módulos de compêndio a questão) —
// nunca inventa DOI/URL para uma fonte que não os tem.

// A convenção de app.build_material_snapshot (RPC de navegação/hash) é
// sempre devolver "o outro lado" do vínculo: material_id = target quando o
// material é source, e vice-versa para related (simétrico, armazenado uma
// única vez em ordem canônica de uuid — ver material_taxonomy.sql). Mantida
// aqui para que Compendium.navigationLinks já venha pronto pro seletor.
function linksForMaterial(materialId: string, links: MaterialLinkRow[]): Compendium['navigationLinks'] {
  const own = links.filter(
    (l) => l.source_material_id === materialId || (l.link_type === 'related' && l.target_material_id === materialId)
  );
  if (own.length === 0) return undefined;
  return own
    .map((l) => ({
      materialId: l.source_material_id === materialId ? l.target_material_id : l.source_material_id,
      linkType: l.link_type,
      sortOrder: l.sort_order,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function buildCompendium(
  material: MaterialRow,
  sections: MaterialSectionRow[],
  references: MaterialReferenceRow[],
  sourcesById: Map<string, SourceRow>,
  links: MaterialLinkRow[]
): Compendium {
  const materialRefs = references.filter((r) => r.material_id === material.id).sort((a, b) => a.sort_order - b.sort_order);
  return {
    id: material.id,
    disciplineId: material.discipline_id,
    themeId: material.theme_id,
    title: material.title,
    subtitle: material.subtitle ?? '',
    moduleNumber: material.module_number ?? undefined,
    estimatedReadTimeMinutes: material.estimated_read_time_minutes ?? 0,
    lastUpdated: material.updated_at,
    author: material.author ?? '',
    mode: (material.mode as Compendium['mode']) ?? undefined,
    studyLens: (material.study_lens as Compendium['studyLens']) ?? undefined,
    publicationStatus: (material.status as Compendium['publicationStatus']) ?? 'draft',
    tags: material.tags ?? [],
    parentMaterialId: material.parent_material_id ?? null,
    treeSortOrder: material.tree_sort_order ?? 0,
    navShortTitle: material.nav_short_title ?? undefined,
    taxonomyKind: (material.taxonomy_kind as Compendium['taxonomyKind']) ?? undefined,
    navigationLinks: linksForMaterial(material.id, links),
    sections: sections
      .filter((s) => s.material_id === material.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(rowToSection),
    references: materialRefs.map((r) => r.citation_text),
    referenceSources: materialRefs.map((r) => {
      if (!r.source_id) return { id: r.id, linked: false };
      return {
        id: r.id,
        linked: true,
        sourceId: r.source_id,
        citationText: sourcesById.get(r.source_id)?.citation_text,
        url: sourceUrl(sourcesById.get(r.source_id)?.identificadores, r.url),
        verificacao: sourcesById.get(r.source_id)?.verificacao,
      };
    }),
  };
}

export class SupabaseMaterialsRepository implements MaterialsRepository {
  async getDisciplines(): Promise<Discipline[]> {
    const { data, error } = await supabase.from('disciplines').select('*').order('sort_order');
    if (error) throw error;
    return (data ?? []).map(rowToDiscipline);
  }

  async saveDisciplines(disciplines: Discipline[]): Promise<void> {
    const rows = disciplines.map((d, i) => disciplineToRow(d, i));
    const { error } = await supabase.from('disciplines').upsert(rows);
    if (error) throw error;
  }

  async getThemes(): Promise<Theme[]> {
    const { data, error } = await supabase.from('themes').select('*').order('sort_order');
    if (error) throw error;
    return (data ?? []).map(rowToTheme);
  }

  async saveThemes(themes: Theme[]): Promise<void> {
    const rows = themes.map(themeToRow);
    const { error } = await supabase.from('themes').upsert(rows);
    if (error) throw error;
  }

  async getCompendiums(): Promise<Compendium[]> {
    // Leitura completa (45-C): o acervo já passa de 800 seções; acima de
    // 1000, materiais apareceriam sem as últimas seções para todo mundo.
    // Materiais em ordem de criação, como o banco devolvia sem ordenação.
    const [materials, sections, refs, links] = await Promise.all([
      fetchAllRows<MaterialRow>((from, to) =>
        supabase
          .from('materials')
          .select('*')
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ),
      fetchAllRows<MaterialSectionRow>((from, to) =>
        supabase
          .from('material_sections')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ),
      fetchAllRows<MaterialReferenceRow>((from, to) =>
        supabase
          .from('material_references')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      ),
      // RLS de material_links já filtra pro estudante (só as duas pontas
      // publicadas); admin ativo enxerga tudo, inclusive rascunho — ver
      // policy material_links_select_published.
      fetchAllRows<MaterialLinkRow>((from, to) =>
        supabase.from('material_links').select('*').order('id', { ascending: true }).range(from, to)
      ),
    ]);

    // sources só é buscado para os ids realmente referenciados (hoje, tipicamente
    // nenhum — material_references.source_id é null para os 33 compêndios
    // carregados, ver AGENTS.md — mas a leitura já fica pronta para quando
    // houver curadoria).
    const sourceIds = [...new Set(refs.map((r) => r.source_id).filter((id): id is string => !!id))];
    let sourcesById = new Map<string, SourceRow>();
    if (sourceIds.length > 0) {
      const sources = await fetchAllRowsByIds<SourceRow>(sourceIds, (chunk, from, to) =>
        supabase
          .from('sources')
          .select('id, citation_text, identificadores, verificacao')
          .in('id', chunk)
          .order('id', { ascending: true })
          .range(from, to)
      );
      sourcesById = new Map(sources.map((s) => [s.id, s]));
    }

    return materials.map((m) => buildCompendium(m, sections, refs, sourcesById, links));
  }

  async saveCompendiums(compendiums: Compendium[]): Promise<void> {
    for (const c of compendiums) {
      await this.saveCompendium(c);
    }
  }

  /**
   * Missão 42-B: grava material + seções + referências numa ÚNICA chamada
   * RPC (`import_compendium_draft`), atômica no servidor. Usada só pelo
   * fluxo de importação assistida (ImportMaterialModal): só cria rascunho
   * novo e bloqueia título duplicado. O formulário manual de edição/criação
   * usa `saveCompendium` (RPC `save_compendium`, também atômica).
   */
  async importCompendiumDraft(compendium: Compendium): Promise<Compendium> {
    const sectionsPayload = compendium.sections.map((s) => ({
      id: s.id,
      title: s.title,
      mechanism_tag: s.mechanismTag ?? null,
      content: s.content,
      key_takeaways: s.keyTakeaways ?? [],
      clinical_pearl: s.clinicalPearl ?? null,
      warning_alert: s.warningAlert ?? null,
    }));

    const { data, error } = await supabase.rpc('import_compendium_draft', {
      p_id: compendium.id,
      p_discipline_id: compendium.disciplineId,
      p_theme_id: compendium.themeId,
      p_title: compendium.title,
      p_subtitle: compendium.subtitle || null,
      p_author: compendium.author || null,
      p_estimated_read_time_minutes: compendium.estimatedReadTimeMinutes ?? null,
      p_tags: compendium.tags ?? [],
      p_sections: sectionsPayload,
      p_references: compendium.references ?? [],
      // Posição na árvore na MESMA transação da importação (migration
      // 20260923120000): se o pai ou uma ligação violar uma regra da árvore,
      // nada é criado — não sobra rascunho pela metade.
      p_parent_material_id: compendium.parentMaterialId ?? null,
      p_tree_sort_order: compendium.treeSortOrder ?? 0,
      p_nav_short_title: compendium.navShortTitle?.trim() || null,
      p_taxonomy_kind: compendium.taxonomyKind ?? null,
      p_navigation_links: (compendium.navigationLinks ?? []).map((l) => ({
        material_id: l.materialId,
        link_type: l.linkType,
        sort_order: l.sortOrder,
      })),
    });
    if (error) throw error;
    const materialRow = data as MaterialRow;
    return {
      ...compendium,
      lastUpdated: materialRow.updated_at,
      publicationStatus: (materialRow.status as Compendium['publicationStatus']) ?? 'draft',
    };
  }

  async saveCompendium(compendium: Compendium): Promise<void> {
    // Gravação atômica via RPC save_compendium: seções existentes são
    // atualizadas por id (não apagadas e reinseridas), então anotações de
    // alunos, histórico de versões, imagens e vínculos de questões com a
    // seção sobrevivem ao salvar. Só as seções removidas do formulário são
    // apagadas. Referências preservam source_id/url quando já vinculadas.
    //
    // parent_material_id/tree_sort_order/nav_short_title/taxonomy_kind/
    // navigation_links vão SEMPRE (mesmo null/[]), porque desde a Fase 2 o
    // formulário do Admin é a fonte de verdade da navegação: omitir a chave
    // faria a RPC preservar o valor anterior (contrato pensado pra cliente
    // ANTIGO que não conhece esses campos — ver 20260922130000, bloco 10).
    // Quem ainda não conhece navegação é só importCompendiumDraft, que usa
    // outra RPC (import_compendium_draft) e não passa por aqui.
    const { error } = await supabase.rpc('save_compendium', {
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
      // Mandar source_id aqui era perigoso: referenceSources é alinhado por
      // ÍNDICE com as referências antigas, então inserir ou remover uma linha
      // no formulário desalinhava e podia pendurar o vínculo na referência errada.
      p_references: compendium.references.map((text) => ({ citation_text: text })),
    });
    if (error) throw error;
  }

  async deleteCompendium(id: string): Promise<void> {
    // material_sections/material_references têm ON DELETE CASCADE em material_id.
    const { error } = await supabase.from('materials').delete().eq('id', id);
    if (error) throw error;
  }

  async publishCompendium(id: string): Promise<void> {
    // Desde 23-B: publish_material() é a única via de transição para
    // 'published' (UPDATE direto agora é bloqueado por trigger). Exige uma
    // revisão aprovada (content_revisions/content_reviews) cujo hash bata
    // com o conteúdo atual — lança erro descritivo quando não há.
    const { error } = await supabase.rpc('publish_material', { p_material_id: id });
    if (error) throw error;
  }

  async unpublishCompendium(id: string): Promise<void> {
    // A RPC impede que a despublicação deixe um descendente publicado sem pai
    // visível ou quebre o pré-requisito de outro material publicado.
    const { error } = await supabase.rpc('unpublish_material', { p_material_id: id });
    if (error) throw error;
  }

  // Vincula (ou desvincula, com sourceId=null) uma referência de texto solto
  // já existente a uma fonte curada do catálogo — UPDATE direcionado só em
  // material_references.source_id/url, nunca reenvia citation_text/sort_order
  // nem toca em material_sections (mesmo motivo de updateSectionContent
  // abaixo: saveCompendium é "substitui tudo", risco alto demais pra uma
  // associação pontual — 21-D).
  async updateMaterialReferenceSource(referenceId: string, sourceId: string | null, url: string | null): Promise<void> {
    const { error } = await supabase
      .from('material_references')
      .update({ source_id: sourceId, url: sourceId ? url : null })
      .eq('id', referenceId);
    if (error) throw error;
  }

  // ── Edição segura de seção (piloto CMS) ──────────────────────────
  // Ao contrário de saveCompendium (que regrava o compêndio inteiro), estes
  // métodos fazem UPDATE direcionado só na seção em questão e registram a
  // versão em material_section_versions.

  async updateSectionContent(
    sectionId: string,
    patch: Partial<CompendiumSectionSnapshot>,
    reason?: string
  ): Promise<void> {
    const { data: current, error: readErr } = await supabase
      .from('material_sections')
      .select('title, mechanism_tag, content, key_takeaways, clinical_pearl, warning_alert')
      .eq('id', sectionId)
      .single();
    if (readErr) throw readErr;

    const before = sectionToSnapshot(current);
    const after: CompendiumSectionSnapshot = { ...before, ...patch };

    const changedFields = SECTION_SNAPSHOT_FIELDS.filter(
      (f) => JSON.stringify(before[f]) !== JSON.stringify(after[f])
    );
    if (changedFields.length === 0) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: versionErr } = await supabase.from('material_section_versions').insert({
      material_section_id: sectionId,
      changed_by: user?.id ?? null,
      changed_fields: changedFields,
      reason: reason ?? null,
      before_snapshot: before,
      after_snapshot: after,
    });
    if (versionErr) throw versionErr;

    const { error: updateErr } = await supabase
      .from('material_sections')
      .update({
        title: after.title,
        mechanism_tag: after.mechanismTag ?? null,
        content: after.content,
        key_takeaways: after.keyTakeaways,
        clinical_pearl: after.clinicalPearl ?? null,
        warning_alert: after.warningAlert ?? null,
      })
      .eq('id', sectionId);
    if (updateErr) throw updateErr;
  }

  async getSectionVersions(sectionId: string): Promise<MaterialSectionVersion[]> {
    const { data, error } = await supabase
      .from('material_section_versions')
      .select('*')
      .eq('material_section_id', sectionId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToSectionVersion);
  }

  async revertSectionToVersion(sectionId: string, versionId: string): Promise<void> {
    const { data: version, error } = await supabase
      .from('material_section_versions')
      .select('before_snapshot')
      .eq('id', versionId)
      .eq('material_section_id', sectionId)
      .single();
    if (error) throw error;

    // Reverter grava uma nova versão com o conteúdo antigo — nunca apaga
    // histórico existente, igual a um "revert" do git.
    await this.updateSectionContent(sectionId, version.before_snapshot as CompendiumSectionSnapshot, 'Revertido para versão anterior');
  }
}

export const supabaseMaterialsRepository = new SupabaseMaterialsRepository();
