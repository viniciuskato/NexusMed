import { parse as parseYaml } from 'yaml';
import { Compendium, CompendiumSection, Discipline, Theme } from '../types';

// ============================================================================
// Missão 42-A — Entrada assistida de materiais
// ============================================================================
// Interpreta o formato de AUTORIA `.compendium.yaml` (disciplineName/themeName
// em texto, ids em slug legível — ver cabeçalho de qualquer arquivo desse
// formato) e converte para o schema real `Compendium` (disciplineId/themeId
// em UUID, ids gerados por crypto.randomUUID()). Lógica pura, sem I/O, para
// ser testável sem DOM/Supabase e reutilizável pelo componente de import.
// ============================================================================

export interface CompendiumImportSection {
  id: string;
  title: string;
  content: string;
  keyTakeaways: string[];
  mechanismTag?: string;
  clinicalPearl?: string;
  warningAlert?: string;
}

export interface CompendiumImportPreview {
  title: string;
  subtitle: string;
  author: string;
  estimatedReadTimeMinutes: number;
  disciplineName: string;
  themeName: string;
  /** Resolvido por nome (case-insensitive) contra o catálogo já carregado; null se não encontrado. */
  disciplineId: string | null;
  themeId: string | null;
  tags: string[];
  sectionsCount: number;
  referencesCount: number;
  /** Tudo que não pôde ser importado ou está ausente — sempre mostrado ao usuário, nunca escondido. */
  missingFields: string[];
  isDuplicate: boolean;
  duplicateOfId?: string;
  duplicateOfTitle?: string;
}

export interface CompendiumImportSuccess {
  ok: true;
  errors: [];
  preview: CompendiumImportPreview;
  sections: CompendiumImportSection[];
  references: string[];
  tags: string[];
}

export interface CompendiumImportFailure {
  ok: false;
  /** Mensagens já em linguagem simples, para exibição direta ao usuário. */
  errors: string[];
  /** Mensagem técnica original (ex. erro de sintaxe YAML) — nunca a mensagem principal. */
  technicalDetail?: string;
}

export type CompendiumImportResult = CompendiumImportSuccess | CompendiumImportFailure;

export function normalizeTitle(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function findDuplicateCompendium(title: string, existing: Compendium[]): Compendium | undefined {
  const norm = normalizeTitle(title);
  return existing.find((c) => normalizeTitle(c.title) === norm);
}

function resolveByName<T extends { name: string }>(name: string, list: T[]): T | undefined {
  const norm = name.trim().toLowerCase();
  return list.find((item) => item.name.trim().toLowerCase() === norm);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Dados já extraídos do arquivo de origem (YAML ou Markdown), antes de
 * validar campos obrigatórios e resolver disciplina/tema. Compartilhado
 * pelos dois formatos de importação — cada um só precisa produzir este
 * formato intermediário; a validação (e a mensagem exibida) é uma só.
 */
export interface RawCompendiumInput {
  title?: unknown;
  subtitle?: unknown;
  disciplineName?: unknown;
  themeName?: unknown;
  author?: unknown;
  estimatedReadTimeMinutes?: unknown;
  tags?: unknown;
  sections?: unknown;
  references?: unknown;
}

const LEGACY_CITATION_PATTERN = /\[\d+(?:\s*,\s*\d+)*\](?!\()/;

export function buildCompendiumImportResult(
  data: RawCompendiumInput,
  disciplines: Discipline[],
  themes: Theme[],
  existingCompendiums: Compendium[]
): CompendiumImportSuccess | CompendiumImportFailure {
  const errors: string[] = [];
  const missingFields: string[] = [];

  const title = isNonEmptyString(data.title) ? data.title.trim() : '';
  if (!title) errors.push('O arquivo não tem título — não é possível criar o material.');

  const subtitle = isNonEmptyString(data.subtitle) ? data.subtitle.trim() : '';
  if (!subtitle) missingFields.push('Subtítulo');

  const disciplineName = isNonEmptyString(data.disciplineName) ? data.disciplineName.trim() : '';
  if (!disciplineName) errors.push('O arquivo não informa a disciplina — não é possível criar o material.');

  const themeName = isNonEmptyString(data.themeName) ? data.themeName.trim() : '';
  if (!themeName) errors.push('O arquivo não informa o tema — não é possível criar o material.');

  const author = isNonEmptyString(data.author) ? data.author.trim() : '';
  if (!author) missingFields.push('Autor');

  const estimatedReadTimeMinutes = Number(data.estimatedReadTimeMinutes) || 0;
  if (!estimatedReadTimeMinutes) missingFields.push('Tempo estimado de leitura');

  const tags = Array.isArray(data.tags) ? data.tags.filter(isNonEmptyString).map((t) => t.trim()) : [];
  if (tags.length === 0) missingFields.push('Palavras-chave');

  const sectionsRaw = Array.isArray(data.sections) ? data.sections : [];
  if (sectionsRaw.length === 0) {
    errors.push('O arquivo não tem nenhuma seção de conteúdo — não é possível criar o material.');
  }

  const sections: CompendiumImportSection[] = [];
  sectionsRaw.forEach((s, idx) => {
    const sec = (s ?? {}) as Record<string, unknown>;
    const secTitle = isNonEmptyString(sec.title) ? sec.title.trim() : '';
    const secContent = isNonEmptyString(sec.content) ? sec.content.trim() : '';
    if (!secTitle || !secContent) {
      errors.push(`A seção ${idx + 1} do arquivo está incompleta (falta título ou conteúdo) — corrija o arquivo antes de importar.`);
      return;
    }
    sections.push({
      id: crypto.randomUUID(),
      title: secTitle,
      content: secContent,
      keyTakeaways: Array.isArray(sec.keyTakeaways) ? sec.keyTakeaways.filter(isNonEmptyString).map((k) => k.trim()) : [],
      mechanismTag: isNonEmptyString(sec.mechanismTag) ? sec.mechanismTag.trim() : undefined,
      clinicalPearl: isNonEmptyString(sec.clinicalPearl) ? sec.clinicalPearl.trim() : undefined,
      warningAlert: isNonEmptyString(sec.warningAlert) ? sec.warningAlert.trim() : undefined,
    });
  });

  const references = Array.isArray(data.references) ? data.references.filter(isNonEmptyString).map((r) => r.trim()) : [];
  if (references.length === 0) missingFields.push('Referências bibliográficas');

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Marcador tipo "[268]" ou "[84, 265]" sem virar link [N](#ref-N) não é
  // clicável no CompendiumReader e, na prática, quase sempre é numeração
  // interna de outra ferramenta (ex.: citação automática do NotebookLM
  // sobre as fontes carregadas nela) que não bate com a posição real na
  // lista de referências deste arquivo — nunca corrigido automaticamente
  // aqui, porque isso seria inventar a que referência cada afirmação
  // pertence. Só sinaliza para revisão manual antes de publicar.
  if (sections.some((s) => LEGACY_CITATION_PATTERN.test(s.content))) {
    missingFields.push(
      'Citações em formato antigo (ex.: "[12]", sem link) encontradas no texto — troque por "[N](#ref-N)", com N na posição correta da lista de referências, antes de publicar'
    );
  }

  const discipline = resolveByName(disciplineName, disciplines);
  const theme = resolveByName(
    themeName,
    discipline ? themes.filter((t) => t.disciplineId === discipline.id) : themes
  );

  if (!discipline) {
    missingFields.push(`Disciplina "${disciplineName}" não encontrada no catálogo atual — selecione uma manualmente antes de confirmar`);
  }
  if (!theme) {
    missingFields.push(`Tema "${themeName}" não encontrado no catálogo atual — selecione um manualmente antes de confirmar`);
  }

  const duplicate = findDuplicateCompendium(title, existingCompendiums);

  const preview: CompendiumImportPreview = {
    title,
    subtitle,
    author: author || '',
    estimatedReadTimeMinutes: estimatedReadTimeMinutes || 15,
    disciplineName,
    themeName,
    disciplineId: discipline?.id ?? null,
    themeId: theme?.id ?? null,
    tags,
    sectionsCount: sections.length,
    referencesCount: references.length,
    missingFields,
    isDuplicate: !!duplicate,
    duplicateOfId: duplicate?.id,
    duplicateOfTitle: duplicate?.title,
  };

  return { ok: true, errors: [], preview, sections, references, tags };
}

export function parseCompendiumYamlText(
  text: string,
  disciplines: Discipline[],
  themes: Theme[],
  existingCompendiums: Compendium[]
): CompendiumImportSuccess | CompendiumImportFailure {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    return {
      ok: false,
      errors: ['Não foi possível interpretar este arquivo como um conteúdo válido. Confira se é o arquivo correto e se não foi editado de forma incompleta.'],
      technicalDetail: err instanceof Error ? err.message : String(err),
    };
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: false,
      errors: ['O arquivo está vazio ou não tem o formato esperado de um conteúdo.'],
    };
  }

  return buildCompendiumImportResult(raw as RawCompendiumInput, disciplines, themes, existingCompendiums);
}

/** Monta o `Compendium` final só quando disciplina/tema já estão resolvidos (auto ou escolha manual). */
export function buildCompendiumFromImport(
  preview: CompendiumImportPreview,
  sections: CompendiumImportSection[],
  references: string[],
  tags: string[],
  resolvedDisciplineId: string | null,
  resolvedThemeId: string | null
): Compendium {
  if (!resolvedDisciplineId || !resolvedThemeId) {
    throw new Error('Disciplina e tema precisam estar resolvidos antes de criar o rascunho.');
  }
  const compendiumSections: CompendiumSection[] = sections.map((s) => ({
    id: s.id,
    title: s.title,
    mechanismTag: s.mechanismTag,
    content: s.content,
    keyTakeaways: s.keyTakeaways,
    clinicalPearl: s.clinicalPearl,
    warningAlert: s.warningAlert,
  }));
  return {
    id: crypto.randomUUID(),
    disciplineId: resolvedDisciplineId,
    themeId: resolvedThemeId,
    title: preview.title,
    subtitle: preview.subtitle,
    estimatedReadTimeMinutes: preview.estimatedReadTimeMinutes,
    lastUpdated: new Date().toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
    author: preview.author,
    tags: tags.length > 0 ? tags : ['Geral'],
    sections: compendiumSections,
    references,
  };
}
