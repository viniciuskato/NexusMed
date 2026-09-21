// ============================================================================
// crossRefLookup — busca de candidatos reais de DOI no CrossRef
// ============================================================================
//
// Complemento ao fallback de "Sugestão de busca" em bibliographicSources.ts:
// em vez de só mandar o leitor pra uma busca no Google, o Admin pode pedir
// pra consultar o registro oficial de DOIs (CrossRef, API pública, CORS
// liberado, sem chave) e tentar achar a fonte primária de verdade.
//
// Isto NUNCA decide sozinho qual candidato é a fonte certa — só devolve a
// lista, na ordem de relevância do CrossRef. Testado na prática: o
// resultado de maior score nem sempre é o documento original (reedições,
// traduções e resumos de terceiros por vezes indexam com o mesmo título e
// pontuam mais alto que a fonte primária). Por isso a escolha final é
// sempre humana — ver CrossRefSourceLookup.tsx.
// ============================================================================

interface CrossRefWorkItem {
  DOI?: string;
  title?: string[];
  'container-title'?: string[];
  issued?: { 'date-parts'?: number[][] };
}

interface CrossRefResponse {
  message?: {
    items?: CrossRefWorkItem[];
  };
}

export interface CrossRefCandidate {
  doi: string;
  title: string;
  containerTitle?: string;
  year?: number;
  url: string;
}

const CROSSREF_ENDPOINT = 'https://api.crossref.org/works';

export async function searchCrossRefCandidates(citationText: string, limit = 5): Promise<CrossRefCandidate[]> {
  const query = citationText.trim();
  if (!query) return [];

  const url = `${CROSSREF_ENDPOINT}?query.bibliographic=${encodeURIComponent(query)}&rows=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CrossRef respondeu ${res.status}`);

  const data = (await res.json()) as CrossRefResponse;
  const items = data.message?.items ?? [];

  return items
    .filter((item): item is CrossRefWorkItem & { DOI: string } => !!item.DOI)
    .map((item) => ({
      doi: item.DOI,
      title: item.title?.[0] ?? '(sem título)',
      containerTitle: item['container-title']?.[0],
      year: item.issued?.['date-parts']?.[0]?.[0],
      url: `https://doi.org/${item.DOI}`,
    }));
}
