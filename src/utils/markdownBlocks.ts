// Divisão em blocos do leitor de Markdown (`SafeMarkdown`), sem React: o
// leitor renderiza a partir dela, e a checagem do padrão
// (`compendiumStandardCheck.ts`) a usa para saber o que o leitor vai ver —
// uma fonte só, para as duas não divergirem.

/**
 * O parser de blocos do leitor (`SafeMarkdown`) (e o split por `\n\n+`) só reconhece heading/
 * tabela/lista/blockquote quando o bloco INTEIRO começa com
 * `#`/`|`/marcador/`>` — ou seja, exige uma linha em branco antes deles.
 * Conteúdo real (Markdown gerado por IA externa, colado no form de edição,
 * ou vindo do importador em `compendiumMarkdownImport.ts`) nem sempre
 * respeita isso: um `#### Subtítulo` colado direto acima do parágrafo
 * seguinte, uma tabela ou uma lista com marcadores (`*   item`) começando
 * na linha seguinte a uma frase, sem linha em branco — tudo isso cai no
 * MESMO bloco que o texto vizinho, e o bloco inteiro vira parágrafo comum:
 * `####`/`|`/`*` aparecem como texto literal em vez de virar
 * heading/tabela/lista (achado revisando visualmente um compêndio real — o
 * padrão "parágrafo seguido de lista sem linha em branco" é o mais comum
 * dos casos, ver AGENTS.md/TASKS.md). Blockquote (Pérola Clínica/Alerta de
 * Armadilha) tem a mesma vulnerabilidade estrutural, ainda sem caso
 * observado em conteúdo real — coberto aqui por precaução, mesma causa
 * raiz. Correção na raiz seria mudar todo autor de conteúdo pra sempre
 * deixar linha em branco ao redor desses elementos; mais robusto (e menos
 * frágil a esquecimento futuro, em qualquer fonte de conteúdo) é normalizar
 * aqui: insere a linha em branco que falta nessas fronteiras, então o split
 * por `\n\n+` passa a separar os blocos do jeito que o parser do leitor espera.
 *
 * Para lista, só a fronteira de ABERTURA é corrigida (parágrafo -> lista) —
 * a de fechamento não, de propósito: uma vez dentro de uma lista, uma linha
 * sem marcador é tratada como CONTINUAÇÃO do item anterior (mesma pessoa
 * digitando um item em várias linhas — ver `reflowMarkedLines` no `SafeMarkdown`), e
 * inserir uma linha em branco ali quebraria esse reflow. Como no conteúdo
 * real o fim de lista sempre veio com linha em branco de qualquer forma,
 * essa lacuna não tem caso conhecido — mas fechar via heurística também
 * arriscaria falso positivo pior (cortar um item legítimo de várias linhas).
 * Limitação conhecida e não coberta aqui: listas aninhadas (sub-item
 * indentado dentro de um item numerado) — o parser do leitor não suporta
 * aninhamento, então o sub-item acaba virando texto corrido dentro do item
 * pai. Ver orientação em PADRAO-NEXUSMED-CONTEUDOS.md pra evitar aninhar.
 */
export function normalizeBlockBoundaries(content: string): string {
  const lines = content.split(/\r\n|\n/);
  const isHeadingLine = (l: string) => /^#{1,4}\s+\S/.test(l.trim());
  const isTableRowLine = (l: string) => /^\|.*\|\s*$/.test(l.trim());
  const isListMarkerLine = (l: string) => /^\s*([-*•]|\d+\.)\s+\S/.test(l);
  const isBlockquoteLine = (l: string) => /^>/.test(l.trim());

  const out: string[] = [];
  let inList = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isBlank = line.trim() === '';
    if (isBlank) {
      inList = false;
      out.push(line);
      continue;
    }

    const prev = out.length > 0 ? out[out.length - 1] : undefined;
    const prevIsBlank = prev === undefined || prev.trim() === '';
    const prevIsTableRow = prev !== undefined && isTableRowLine(prev);
    const prevIsBlockquote = prev !== undefined && isBlockquoteLine(prev);

    const startsHeading = isHeadingLine(line) && !prevIsBlank;
    const startsTable = isTableRowLine(line) && !prevIsTableRow && !prevIsBlank;
    const startsList = isListMarkerLine(line) && !inList && !prevIsBlank;
    const startsBlockquote = isBlockquoteLine(line) && !prevIsBlockquote && !prevIsBlank;
    if (startsHeading || startsTable || startsList || startsBlockquote) out.push('');

    if (isHeadingLine(line) || isTableRowLine(line)) inList = false;
    if (isListMarkerLine(line)) inList = true;

    out.push(line);

    // Linha em branco depois de um heading, antes do próximo conteúdo (a
    // menos que já seja outro heading ou já esteja em branco).
    const next = lines[i + 1];
    if (isHeadingLine(line) && next !== undefined && next.trim() !== '' && !isHeadingLine(next)) {
      out.push('');
    }
    // Linha em branco depois do fim de um bloco de tabela, antes de texto
    // comum (a linha atual É tabela, a próxima NÃO é nem está em branco).
    if (
      isTableRowLine(line) &&
      next !== undefined &&
      next.trim() !== '' &&
      !isTableRowLine(next)
    ) {
      out.push('');
    }
    // Linha em branco depois do fim de um blockquote, antes de texto comum
    // (mesma lógica da tabela — protege contra o mesmo padrão de falha
    // ainda não observado em conteúdo real, mas com a mesma causa raiz).
    if (
      isBlockquoteLine(line) &&
      next !== undefined &&
      next.trim() !== '' &&
      !isBlockquoteLine(next)
    ) {
      out.push('');
    }
  }
  return out.join('\n');
}

export const TABLE_CITATION_PATTERN = /\[(\d+)\]\((#ref-\d+)\)/g;

/**
 * PADRAO-NEXUSMED-CONTEUDOS.md pede citação de tabela na frase que a
 * introduz, não em cada célula — mas isso deixa a citação fisicamente longe
 * da tabela (um bloco de parágrafo acima, sem nenhum `[N]` na tabela em si).
 * Lida como "tabela sem referência" por quem está estudando, mesmo a citação
 * existindo (achado real: compêndio de Espirometria, 3 tabelas já citadas na
 * frase de abertura, mas nenhuma citação visível grudada na tabela). Deriva
 * uma legenda "Fonte: [N]" automaticamente do bloco imediatamente anterior —
 * sem exigir reescrever conteúdo já correto, e sem duplicar convenção nova
 * pro autor lembrar.
 */
export function extractTableCitations(prevBlock: string | undefined): { num: string; href: string }[] {
  if (!prevBlock) return [];
  const trimmed = prevBlock.trim();
  // Só deriva legenda se o bloco anterior for parágrafo comum — heading,
  // lista, blockquote ou outra tabela não contam como "frase que introduz
  // esta tabela".
  if (!trimmed || /^[#|>]/.test(trimmed) || /^\s*([-*•]|\d+\.)\s+/.test(trimmed)) return [];

  const citations: { num: string; href: string }[] = [];
  const seen = new Set<string>();
  for (const match of trimmed.matchAll(TABLE_CITATION_PATTERN)) {
    if (seen.has(match[1])) continue;
    seen.add(match[1]);
    citations.push({ num: match[1], href: match[2] });
  }
  return citations;
}

/** Blocos na ordem em que o leitor os renderiza. */
export function splitReaderBlocks(content: string): string[] {
  return normalizeBlockBoundaries(content).split(/\n\n+/);
}
