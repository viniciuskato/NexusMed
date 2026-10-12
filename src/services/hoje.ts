import type { Compendium, LastReadingSession } from '../types';

// 43-E / PAINEL-2 — regra do "Continuar lendo" do Início. (O "Testar o que li"
// do dia e a tela "Hoje" saíram na PAINEL-2, D-14: o atalho "Testar o que li"
// continua, sem a conta de pendentes.)

/** Onde o "Continuar lendo" retoma: o material e, se ainda existir, a seção. */
export interface RetomadaDeLeitura {
  compendiumId: string;
  compendiumTitle: string;
  sectionId?: string;
  sectionTitle?: string;
}

/**
 * Último material aberto, na seção onde parou. Vale só se o material ainda está
 * entre os que o estudante vê (despublicado ou removido não se abre) e usa os
 * títulos de agora; seção que sumiu abre o material do início.
 */
export function retomadaDeLeitura(
  sessao: LastReadingSession | null,
  compendiums: Compendium[]
): RetomadaDeLeitura | null {
  if (!sessao?.compendiumId) return null;
  const material = compendiums.find((c) => c.id === sessao.compendiumId);
  if (!material) return null;
  const secao = sessao.sectionId ? material.sections.find((s) => s.id === sessao.sectionId) : undefined;
  return {
    compendiumId: material.id,
    compendiumTitle: material.title,
    ...(secao ? { sectionId: secao.id, sectionTitle: secao.title } : {}),
  };
}
