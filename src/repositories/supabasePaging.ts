// ============================================================================
// Leitura completa do Supabase, sem o corte silencioso em 1000 linhas
// ============================================================================
//
// O PostgREST limita a resposta de qualquer `select` a um teto de linhas
// (`max_rows`: 1000 no local e no padrão do Supabase), mesmo sem `.limit()`
// no código — e corta em silêncio, sem erro. Um aluno que faz 50 questões por
// dia passa de 1000 tentativas em cerca de 3 semanas; o acervo publicado já
// passa de 800 seções de material (unidade 45-C, AUD-21).
//
// Duas regras, e toda leitura de lista que pode crescer passa por elas:
//
// 1. `fetchAllRows` busca em páginas até esgotar. A consulta TEM de ter
//    ordenação total (terminar num campo único, em geral `id`): offset sem
//    ordem única pode pular ou repetir linhas entre páginas.
//    Premissa: o teto do servidor é >= SUPABASE_PAGE_SIZE. Uma página menor
//    que SUPABASE_PAGE_SIZE é tratada como a última; com um teto menor, a
//    leitura voltaria a cortar. Evidência a favor em produção: as ~2000
//    alternativas de questão, lidas assim desde o 11-B, aparecem completas.
//
// 2. `fetchAllRowsByIds` para filtros `.in(coluna, ids)`: com milhares de ids
//    a URL estoura o limite do servidor e a resposta ainda seria cortada. Os
//    ids vão em lotes de IN_FILTER_CHUNK_SIZE, cada lote lido por inteiro.
// ============================================================================

export const SUPABASE_PAGE_SIZE = 1000;
export const IN_FILTER_CHUNK_SIZE = 100;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

export async function fetchAllRows<T>(queryBuilder: (from: number, to: number) => PageResult<T>): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await queryBuilder(from, to);
    if (error) throw error;
    const page = data ?? [];
    all.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }
  return all;
}

export async function fetchAllRowsByIds<T>(
  ids: readonly string[],
  queryBuilder: (chunk: string[], from: number, to: number) => PageResult<T>
): Promise<T[]> {
  const all: T[] = [];
  for (let i = 0; i < ids.length; i += IN_FILTER_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + IN_FILTER_CHUNK_SIZE);
    all.push(...(await fetchAllRows<T>((from, to) => queryBuilder(chunk, from, to))));
  }
  return all;
}
