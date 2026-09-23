import { Compendium, CompendiumSection } from '../types';
import {
  MaterialNavigationValue,
  emptyNavigationValue,
  navigationFieldsFromValue,
  navigationValueFromCompendium,
} from './materialNavigation';

// ============================================================================
// Formulário de conteúdo do Admin ⇄ Compendium, SEM PERDA na ida e volta
// ============================================================================
// Regra: abrir um material e clicar "Salvar" sem mudar nada tem que gravar
// EXATAMENTE o que já estava no banco. Antes não gravava, e cada diferença
// mudava o hash de atestação (invalidando a revisão aprovada) ou apagava dado:
//
//   - `mode` nulo virava "mecanismos" (o select não tinha opção vazia) — os
//     38 materiais de produção têm mode nulo, então TODO primeiro "Salvar"
//     invalidava a atestação;
//   - `studyLens` não existe no formulário e era gravado como nulo — apagado;
//   - tags com vírgula dentro eram quebradas ao reparsear o texto;
//   - referências eram recriadas com ids novos e perdiam o vínculo com fonte
//     curada (isso é corrigido no banco, 20260923120000 — aqui só avisamos
//     quando uma referência VINCULADA vai deixar de existir).
//
// A garantia fica em tests/unit/compendiumForm.test.ts: para qualquer
// material, compendiumFromFormState(formStateFromCompendium(c), c) preserva
// todo campo que chega ao banco.

export interface CompendiumFormState {
  title: string;
  subtitle: string;
  disciplineId: string;
  themeId: string;
  /** '' = não definido (nulo no banco). */
  mode: 'atlas' | 'mecanismos' | '';
  author: string;
  moduleNumber: string;
  estimatedTime: number;
  tagsStr: string;
  referencesStr: string;
  sections: CompendiumSection[];
  navigation: MaterialNavigationValue;
}

export function formStateFromCompendium(c: Compendium): CompendiumFormState {
  return {
    title: c.title,
    subtitle: c.subtitle ?? '',
    disciplineId: c.disciplineId,
    themeId: c.themeId,
    mode: c.mode ?? '',
    author: c.author ?? '',
    moduleNumber: c.moduleNumber ? String(c.moduleNumber) : '',
    estimatedTime: c.estimatedReadTimeMinutes ?? 0,
    tagsStr: (c.tags ?? []).join(', '),
    referencesStr: c.references.join('\n'),
    sections: c.sections.map((s) => ({ ...s, id: s.id || crypto.randomUUID() })),
    navigation: navigationValueFromCompendium(c),
  };
}

/** Estado inicial de um conteúdo novo (criado à mão, não importado). */
export function newCompendiumFormState(defaults: { disciplineId: string; themeId: string }): CompendiumFormState {
  return {
    title: '',
    subtitle: '',
    disciplineId: defaults.disciplineId,
    themeId: defaults.themeId,
    mode: 'mecanismos',
    author: 'Equipe Editorial NexusMed',
    moduleNumber: '',
    estimatedTime: 15,
    tagsStr: '',
    referencesStr: '',
    sections: [],
    navigation: emptyNavigationValue(),
  };
}

function parseTags(tagsStr: string): string[] {
  return tagsStr
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseReferences(referencesStr: string): string[] {
  return referencesStr
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean);
}

/**
 * Monta o Compendium a gravar. Com `original` (edição), parte dele: todo
 * campo que o formulário não edita (studyLens, vínculos de referência,
 * status de publicação...) atravessa intacto.
 */
export function compendiumFromFormState(
  state: CompendiumFormState,
  original: Compendium | null,
  id: string
): Compendium {
  const tags =
    original && state.tagsStr === (original.tags ?? []).join(', ')
      ? original.tags ?? [] // texto intocado: não reparseia (tag com vírgula sobrevive)
      : parseTags(state.tagsStr);

  const base: Partial<Compendium> = original ? { ...original } : {};

  return {
    ...base,
    id,
    disciplineId: state.disciplineId,
    themeId: state.themeId || 'geral',
    title: state.title.trim(),
    subtitle: state.subtitle.trim(),
    moduleNumber: state.moduleNumber.trim() ? Number(state.moduleNumber) : undefined,
    // Conteúdo novo sem tempo informado assume 15 min; material existente
    // mantém o que tem (0 = desconhecido, gravado como nulo pelo repositório).
    estimatedReadTimeMinutes: Number(state.estimatedTime) || (original ? 0 : 15),
    lastUpdated: original?.lastUpdated ?? new Date().toISOString(),
    author: state.author.trim(),
    mode: state.mode || undefined,
    tags,
    sections: state.sections,
    references: parseReferences(state.referencesStr),
    ...navigationFieldsFromValue(state.navigation),
  } as Compendium;
}

/**
 * Referências hoje vinculadas a uma fonte curada que vão deixar de existir
 * ao salvar (o texto sumiu ou foi editado). O banco casa referência por
 * texto idêntico, então editar o texto de uma referência vinculada cria uma
 * nova e o vínculo não acompanha — o formulário avisa antes de salvar.
 */
export function linkedReferencesThatWillBeLost(original: Compendium | null, referencesStr: string): string[] {
  if (!original) return [];
  const remaining = parseReferences(referencesStr);
  const lost: string[] = [];
  original.references.forEach((text, i) => {
    const linked = original.referenceSources?.[i]?.linked;
    const idx = remaining.indexOf(text);
    if (idx >= 0) {
      remaining.splice(idx, 1); // mesmo casamento do banco: primeira ocorrência ainda livre
    } else if (linked) {
      lost.push(text);
    }
  });
  return lost;
}
