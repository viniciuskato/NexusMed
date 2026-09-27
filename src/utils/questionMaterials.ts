import type { Question } from '../types';

// 43-B: a questão cobra um ou vários materiais. Quem pergunta "que materiais
// esta questão cobra?" passa por aqui, nunca direto por `compendiumRefId`
// (que é só o primeiro, para quem abre um material só).

/**
 * Escopo "sem material" aceito por QuestionsView/FlashcardsView no lugar de um
 * id de compêndio (reexportado por thematicPacks). Prefixado com `__` para
 * nunca colidir com um id real (uuid).
 */
export const SCOPE_UNLINKED = '__sem-material__';

/** Ids dos materiais que a questão cobra, na ordem escolhida. */
export function questionMaterialIds(question: Question): string[] {
  if (question.materialLinks) return question.materialLinks.map((l) => l.materialId);
  const legacy = (question.compendiumRefId ?? '').trim();
  return legacy ? [legacy] : [];
}

/**
 * A questão entra no recorte? `scope` é o id de um material ou a sentinela de
 * "sem material" (questão sem nenhum vínculo).
 */
export function questionMatchesMaterialScope(question: Question, scope: string): boolean {
  const ids = questionMaterialIds(question);
  if (scope === SCOPE_UNLINKED) return ids.length === 0;
  return ids.includes(scope);
}
