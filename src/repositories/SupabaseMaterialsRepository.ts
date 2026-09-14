import { sourceUrl } from '../utils/bibliographicSources';
import { Discipline, Theme, Compendium, CompendiumSection, CompendiumSectionSnapshot, MaterialSectionVersion } from '../types';
import { supabase } from '../lib/supabaseClient';
import { MaterialsRepository } from './MaterialsRepository';

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

function buildCompendium(
  material: MaterialRow,
  sections: MaterialSectionRow[],
  references: MaterialReferenceRow[],
  sourcesById: Map<string, SourceRow>
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
    sections: sections
      .filter((s) => s.material_id === material.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(rowToSection),
    references: materialRefs.map((r) => r.citation_text),
    referenceSources: materialRefs.map((r) => {
      if (!r.source_id) return { linked: false };
      return { linked: true, sourceId: r.source_id, url: sourceUrl(sourcesById.get(r.source_id)?.identificadores, r.url), verificacao: sourcesById.get(r.source_id)?.verificacao };
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
    const [{ data: materials, error: mErr }, { data: sections, error: sErr }, { data: refs, error: rErr }] =
      await Promise.all([
        supabase.from('materials').select('*'),
        supabase.from('material_sections').select('*').order('sort_order'),
        supabase.from('material_references').select('*').order('sort_order'),
      ]);
    if (mErr) throw mErr;
    if (sErr) throw sErr;
    if (rErr) throw rErr;

    // sources só é buscado para os ids realmente referenciados (hoje, tipicamente
    // nenhum — material_references.source_id é null para os 33 compêndios
    // carregados, ver AGENTS.md — mas a leitura já fica pronta para quando
    // houver curadoria).
    const sourceIds = [...new Set((refs ?? []).map((r) => r.source_id).filter((id): id is string => !!id))];
    let sourcesById = new Map<string, SourceRow>();
    if (sourceIds.length > 0) {
      const { data: sources, error: srcErr } = await supabase
        .from('sources')
        .select('id, identificadores, verificacao')
        .in('id', sourceIds);
      if (srcErr) throw srcErr;
      sourcesById = new Map((sources ?? []).map((s) => [s.id as string, s as SourceRow]));
    }

    return (materials ?? []).map((m) => buildCompendium(m, sections ?? [], refs ?? [], sourcesById));
  }

  async saveCompendiums(compendiums: Compendium[]): Promise<void> {
    for (const c of compendiums) {
      await this.saveCompendium(c);
    }
  }

  async saveCompendium(compendium: Compendium): Promise<void> {
    const materialRow = {
      id: compendium.id,
      discipline_id: compendium.disciplineId,
      theme_id: compendium.themeId,
      title: compendium.title,
      subtitle: compendium.subtitle || null,
      mode: compendium.mode ?? null,
      study_lens: compendium.studyLens ?? null,
      module_number: compendium.moduleNumber ?? null,
      estimated_read_time_minutes: compendium.estimatedReadTimeMinutes ?? null,
      author: compendium.author || null,
      tags: compendium.tags ?? [],
    };
    const { error: upsertErr } = await supabase.from('materials').upsert(materialRow);
    if (upsertErr) throw upsertErr;

    // Substitui seções e referências por completo (o modelo de frontend não
    // rastreia diffs incrementais — mesma semântica do LocalStorageRepository,
    // que sobrescreve o compêndio inteiro a cada save).
    const { error: delSecErr } = await supabase
      .from('material_sections')
      .delete()
      .eq('material_id', compendium.id);
    if (delSecErr) throw delSecErr;

    const { error: delRefErr } = await supabase
      .from('material_references')
      .delete()
      .eq('material_id', compendium.id);
    if (delRefErr) throw delRefErr;

    if (compendium.sections.length > 0) {
      const sectionRows = compendium.sections.map((s, i) => ({
        id: s.id,
        material_id: compendium.id,
        sort_order: i,
        title: s.title,
        mechanism_tag: s.mechanismTag ?? null,
        content: s.content,
        key_takeaways: s.keyTakeaways ?? [],
        clinical_pearl: s.clinicalPearl ?? null,
        warning_alert: s.warningAlert ?? null,
      }));
      const { error } = await supabase.from('material_sections').insert(sectionRows);
      if (error) throw error;
    }

    if (compendium.references.length > 0) {
      // Preserva o vínculo estruturado (source_id/url) quando o item de
      // referência já tinha um — antes, saveCompendium sempre reinseria só
      // citation_text (fallback genérico), apagando source_id/url mesmo
      // quando o admin nunca tocou naquela referência (23-B, achado do
      // 23-A: "perda de material_references.source_id no salvamento").
      const refRows = compendium.references.map((text, i) => {
        const linked = compendium.referenceSources?.[i];
        return {
          material_id: compendium.id,
          citation_text: text,
          sort_order: i,
          source_id: linked?.linked ? linked.sourceId ?? null : null,
          url: linked?.linked ? linked.url ?? null : null,
        };
      });
      const { error } = await supabase.from('material_references').insert(refRows);
      if (error) throw error;
    }
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
    const { error } = await supabase.from('materials').update({ status: 'draft' }).eq('id', id);
    if (error) throw error;
  }

  // ── Edição segura de seção (piloto CMS) ──────────────────────────
  // Ao contrário de saveCompendium (delete-all + insert de todas as seções e
  // referências do compêndio), estes métodos fazem UPDATE direcionado só na
  // seção em questão — não tocam em material_references, preservando
  // source_id/url estruturados que o form grande de AdminCMSView perderia.

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
