import type { Compendium } from '../types';
import { diaLocal } from './diaLocal';

// ============================================================================
// MAT-1 — "Publicado em" e "Atualizado em" de um material, em dd/mm/aaaa.
//
// "Publicado em" é `materials.published_at` (a primeira vez que o material foi ao ar; o banco a grava uma vez só).
// "Atualizado em" é `materials.updated_at`, a última mudança de conteúdo. Se as duas caem no mesmo dia, a tela mostra só
// a de publicação. Data ausente ou que não se lê não é mostrada (nada de "Invalid Date").
// ============================================================================

/** dd/mm/aaaa no dia do calendário local, ou '' se o valor não é uma data. */
export function formatarDia(valor: string | null | undefined): string {
  if (!valor || !valor.trim()) return '';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export interface DatasDoMaterial {
  /** dd/mm/aaaa, ou '' quando não há (rascunho, ou material sem data registrada). */
  publicado: string;
  /** dd/mm/aaaa da última mudança de conteúdo; '' quando não há, ou quando cai no mesmo dia da publicação. */
  atualizado: string;
}

export function datasDoMaterial(c: Pick<Compendium, 'publishedAt' | 'lastUpdated'>): DatasDoMaterial {
  const publicado = formatarDia(c.publishedAt);
  const atualizado = formatarDia(c.lastUpdated);
  if (!atualizado) return { publicado, atualizado: '' };
  if (publicado) {
    // Mesmo dia (ou atualização anterior à publicação, que não faz sentido mostrar): só a publicação.
    const diaPub = diaLocal(c.publishedAt as string);
    const diaAtu = diaLocal(c.lastUpdated);
    if (diaAtu <= diaPub) return { publicado, atualizado: '' };
  }
  return { publicado, atualizado };
}
