// O status descreve a revisão editorial da fonte, não valida cada afirmação.
export function sourceVerificationLabel(status?: string): string {
  const labels: Record<string, string> = {
    verificada: 'Fonte verificada',
    nao_verificavel_externamente: 'Fonte não verificável externamente',
    vaga_pendente: 'Verificação pendente',
    verificada_por_busca_resumo: 'Verificada por busca ou resumo',
    verificada_texto_integral_e_inspecao_visual: 'Texto integral e inspeção visual verificados',
    verificada_texto_integral: 'Texto integral verificado',
  };
  return labels[status ?? ''] ?? 'Verificação não informada';
}

export function sourceUrl(ids?: Record<string, string> | null, referenceUrl?: string | null): string | undefined {
  const candidate = referenceUrl || ids?.url || (ids?.doi ? `https://doi.org/${ids.doi}`
    : ids?.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${ids.pmid}/`
    : ids?.pmcid ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${ids.pmcid}/` : undefined);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
}

// Muitas referências trazem o tipo de estudo já anotado pelo autor do
// compêndio entre colchetes no fim da citação (ex.: "... DOI: 10.1056/
// NEJMoa1615664 [Ensaio clínico randomizado, fase 3 — FOURIER]"). Isso é
// dado real já presente no texto, não uma classificação inferida — por
// isso é extraído e usado como documentType em vez do rótulo genérico fixo
// ("Artigo Científico"/"Artigo Indexado") que só refletia qual identificador
// foi encontrado (DOI/PMID), não o tipo do estudo em si.
function extractStudyTypeAnnotation(citationText: string): string | undefined {
  const match = citationText.match(/\[([^[\]]+)\]\s*$/);
  return match ? match[1].trim() : undefined;
}

export interface OpenAccessReferenceLink {
  url: string;
  badgeLabel: string;
  documentType: string;
  isOpenAccess: boolean;
  // Rótulo honesto para o botão de ação — nunca promete "íntegra"/"acesso
  // aberto" quando a fonte do link é só um identificador (DOI/PMID) ou uma
  // sugestão de busca, não uma URL curada de verdade.
  actionLabel: string;
}

/**
 * Resolve, quando possível, um link clicável para a citação — SEM inventar
 * metadados nem "adivinhar" a fonte pelo assunto do texto (esse
 * mapeamento por palavra-chave existia antes e foi removido: uma citação
 * que só mencionasse "SBC" ou "sepse" de passagem recebia uma URL e um
 * texto ABNT inteiramente fabricados, sem relação real com a referência).
 *
 * Prioridade: (1) URL curada explícita já registrada para essa fonte; (2)
 * URL embutida no próprio texto da citação; (3) DOI embutido; (4) PMID
 * embutido; (5) como último recurso, uma busca no Google — sempre rotulada
 * como sugestão, nunca como acesso confirmado.
 * Só os casos (1) e (2) são "acesso aberto" de verdade (URL curada/
 * verificada); (3) e (4) são identificadores reais e clicáveis, mas não
 * são promessa de texto gratuito (muitos DOIs levam a paywall); (5) não é
 * nem uma coisa nem outra — é só um ponto de partida de busca. Usa a busca
 * web geral do Google, não o Google Scholar: para diretrizes/consensos de
 * sociedade médica (o caso mais comum de citação sem DOI/PMID neste
 * projeto) o site oficial da entidade costuma ficar no topo da busca geral,
 * enquanto o Scholar prioriza indexação acadêmica e frequentemente não
 * lista a página oficial do documento.
 */
export function resolveOpenAccessReferenceLink(
  citationText: string,
  existingUrl?: string
): OpenAccessReferenceLink {
  const studyType = extractStudyTypeAnnotation(citationText);

  // 1. URL curada explícita — estado editorial real, preservado como está.
  if (existingUrl) {
    try {
      const parsed = new URL(existingUrl);
      if (['http:', 'https:'].includes(parsed.protocol)) {
        return {
          url: existingUrl,
          badgeLabel: 'Fonte curada',
          documentType: studyType ?? 'Documento Oficial',
          isOpenAccess: true,
          actionLabel: 'Acessar fonte',
        };
      }
    } catch {
      // URL inválida — cai para as heurísticas abaixo.
    }
  }

  // 2. URL embutida no texto de citação.
  const urlMatch = citationText.match(/https?:\/\/[^\s)\]]+/i);
  if (urlMatch) {
    return {
      url: urlMatch[0],
      badgeLabel: 'Link direto na citação',
      documentType: studyType ?? 'Documento Oficial',
      isOpenAccess: true,
      actionLabel: 'Acessar fonte',
    };
  }

  // 3. DOI embutido — identificador real e clicável, mas não é garantia de
  // texto gratuito (muitos periódicos são pagos mesmo tendo DOI).
  const doiMatch = citationText.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  if (doiMatch) {
    return {
      url: `https://doi.org/${doiMatch[0]}`,
      badgeLabel: 'DOI',
      documentType: studyType ?? 'Artigo Científico',
      isOpenAccess: false,
      actionLabel: 'Abrir DOI',
    };
  }

  // 4. PMID embutido — mesma lógica do DOI: identificador real, sem
  // promessa de acesso gratuito.
  const pmidMatch = citationText.match(/PMID:?\s*(\d+)/i);
  if (pmidMatch) {
    return {
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmidMatch[1]}/`,
      badgeLabel: 'PMID',
      documentType: studyType ?? 'Artigo Indexado',
      isOpenAccess: false,
      actionLabel: 'Abrir no PubMed',
    };
  }

  // 5. Nenhum identificador real encontrado: sugestão de busca na web geral
  // do Google (não Scholar — ver comentário do JSDoc acima), explicitamente
  // rotulada como sugestão — nunca apresentada como acesso confirmado,
  // texto integral ou fonte verificada.
  const cleanTitle = citationText
    .replace(/^\[?\d+\]?\s*/, '')
    .replace(/^(autor|autores|ref|fonte):\s*/i, '')
    .trim();

  return {
    url: `https://www.google.com/search?q=${encodeURIComponent(cleanTitle)}`,
    badgeLabel: 'Sugestão de busca',
    documentType: studyType ?? 'Referência sem identificador confirmado',
    isOpenAccess: false,
    actionLabel: 'Pesquisar referência (Google)',
  };
}

export interface FormattedAbntReference {
  author: string;
  title: string;
  publicationDetails: string;
  fullAbntText: string;
  accessUrl: string;
  badgeLabel: string;
  documentType: string;
  // Campos novos, aditivos (não quebram nenhum consumidor existente que só
  // lia os campos acima): permitem a UI decidir o rótulo/selo honesto do
  // botão de acesso sem duplicar a lógica de resolveOpenAccessReferenceLink.
  isOpenAccess: boolean;
  actionLabel: string;
}

/**
 * Padroniza qualquer citação médica no formato ABNT NBR 6023, na medida do
 * que o texto livre da citação realmente permite — nunca fabrica autor,
 * editora, ano ou fonte que não estejam no texto original (o banco não
 * guarda esses campos estruturados separadamente, então qualquer "parsing"
 * de autor/título/ano a partir de um trecho igual a "SBC" ou "sepse"
 * seria inventado, não extraído).
 */
export function formatToAbntCitation(
  citationText: string,
  existingUrl?: string
): FormattedAbntReference {
  const resolved = resolveOpenAccessReferenceLink(citationText, existingUrl);

  const cleanRaw = citationText
    .replace(/^\[?\d+\]?\s*/, '')
    .replace(/^(autor|autores|ref|fonte):\s*/i, '')
    .trim();

  // Tenta extrair Autor e Título quando o texto já vem no padrão
  // "Autor(es). Título. Detalhes de publicação." — comum em citações
  // médicas (Vancouver/ABNT). Quando não segue esse padrão, mostra o
  // texto completo como título e marca a autoria como não identificada
  // no texto, em vez de adivinhar.
  const parts = cleanRaw.split(/\.\s+/);
  let author = 'Autoria não identificada no texto da citação.';
  let title = cleanRaw;
  let pubDetails = '';

  if (parts.length >= 2) {
    author = parts[0].toUpperCase() + '.';
    title = parts[1];
    if (parts.length > 2) {
      pubDetails = parts.slice(2).join('. ');
    }
  }

  const fullAbnt = pubDetails ? `${author} ${title}. ${pubDetails}` : `${author} ${title}.`;

  return {
    author,
    title,
    publicationDetails: pubDetails,
    fullAbntText: fullAbnt,
    accessUrl: resolved.url,
    badgeLabel: resolved.badgeLabel,
    documentType: resolved.documentType,
    isOpenAccess: resolved.isOpenAccess,
    actionLabel: resolved.actionLabel,
  };
}
