// ============================================================================
// Destaque do trecho da busca (43-D)
// ============================================================================
// A RPC search_materials devolve título, título da seção e trecho com os
// termos encontrados entre dois caracteres de uso privado do Unicode — nunca
// HTML. O texto vem do conteúdo escrito pelo admin, então a tela só separa os
// pedaços aqui e renderiza cada um como texto (AGENTS.md, risco 15). O banco
// remove esses caracteres do conteúdo antes de marcar: ninguém forja destaque.
// Ver supabase/migrations/20260924140000_busca_materiais.sql.

export const HIGHLIGHT_START = '\uE000';
export const HIGHLIGHT_END = '\uE001';

export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

/**
 * Separa o texto marcado em pedaços. Marcador de fechamento sem abertura é
 * descartado; abertura sem fechamento destaca até o fim.
 */
export function splitHighlight(marked: string | null | undefined): HighlightSegment[] {
  if (!marked) return [];
  const segments: HighlightSegment[] = [];
  let highlighted = false;
  let current = '';

  const flush = () => {
    if (!current) return;
    const last = segments[segments.length - 1];
    if (last && last.highlighted === highlighted) last.text += current;
    else segments.push({ text: current, highlighted });
    current = '';
  };

  for (const ch of marked) {
    if (ch === HIGHLIGHT_START) {
      if (!highlighted) {
        flush();
        highlighted = true;
      }
    } else if (ch === HIGHLIGHT_END) {
      if (highlighted) {
        flush();
        highlighted = false;
      }
    } else {
      current += ch;
    }
  }
  flush();
  return segments;
}
