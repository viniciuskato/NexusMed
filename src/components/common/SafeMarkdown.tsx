import React from 'react';

interface SafeMarkdownProps {
  content: string;
  className?: string;
}

/**
 * Safely parses inline markdown (bold, italic, inline code, links)
 * into React nodes WITHOUT dangerouslySetInnerHTML.
 *
 * Exportado à parte de `SafeMarkdown` (que faz split em blocos — parágrafo/
 * heading/tabela/lista) porque campos curtos de uma seção (Pontos-Chave,
 * Pérola Clínica, Alerta de Armadilha, Consenso de Prova, e os flashcards
 * derivados deles) também carregam Markdown inline (negrito e sobretudo
 * `[N](#ref-N)` de citação — a convenção editorial pede citação em
 * qualquer afirmação de peso clínico, sem exceção pra esses campos) mas
 * NUNCA precisam de heading/tabela — usar o `SafeMarkdown` inteiro ali
 * geraria markup de bloco (`<div>`/`<p>`) onde o layout já é uma `<li>`/
 * `<span>`/`<p>` existente. Renderizar esses campos como string crua (sem
 * chamar nem isso nem `SafeMarkdown`) deixa o `[N](#ref-N)` literal na
 * tela — achado real revisando o compêndio de Espirometria publicado: o
 * corpo do texto (via `SafeMarkdown`) já citava certo, mas o box
 * "Pontos-Chave & Mecanismos" mostrava a sintaxe Markdown crua.
 */
export function parseInline(text: string): React.ReactNode[] {
  // Regex matches:
  // 1. **bold**, admitindo *itálico* aninhado dentro (ex.: "**Ponto de Igual
  //    Pressão (*Equal Pressure Point*)**", padrão real do conteúdo médico)
  //    — o conteúdo de `**...**` é "qualquer char que não é asterisco, OU um
  //    asterisco isolado que não é seguido de outro asterisco". Sem o
  //    lookahead negativo, `[^*]+` simples para no primeiro asterisco
  //    interno e o "**" de fechamento nunca é alcançado: o par externo não
  //    casa, os asteriscos do itálico aninhado viram texto literal solto, e
  //    o negrito nem chega a ser aplicado (achado revisando visualmente um
  //    compêndio real — ver AGENTS.md/TASKS.md).
  // 2. *italic* ou _italic_
  // 3. `inline code`
  // 4. [text](url)
  const regex = /(\*\*(?:\*(?!\*)|[^*])+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(regex);

  return parts.map((part, idx) => {
    if (!part) return null;

    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-900 dark:text-slate-100">
          {parseInline(part.slice(2, -2))}
        </strong>
      );
    }

    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <em key={idx} className="italic text-slate-800 dark:text-slate-200">
          {parseInline(part.slice(1, -1))}
        </em>
      );
    }

    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[13px] font-mono text-teal-800 dark:text-teal-300 border border-slate-200/60 dark:border-slate-700/60"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
      const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (match) {
        const linkText = match[1];
        const href = match[2];
        // Only allow safe protocols, same-page paths, or same-page anchors
        // (ex.: [3](#ref-3) — usado para citação inline apontar pra
        // referência correspondente no rodapé, sem depender de HTML bruto).
        const isAnchor = href.startsWith('#');
        const isSafe = /^https?:\/\//i.test(href) || href.startsWith('/') || isAnchor;
        // Citação inline (ex.: [3](#ref-3)) recebe estilo distinto do link
        // comum — menor, sobrescrito, com colchete visual via CSS (não faz
        // parte do texto do link, então nunca "gruda" em outra citação
        // adjacente nem no texto ao redor, ex. "...mais alto[1](#ref-1)[2]
        // (#ref-2)." virando "12." colado). Mesma linguagem visual do badge
        // "[1]" já usado no rodapé de referências (CompendiumReader).
        const isCitation = isAnchor && href.startsWith('#ref-');
        if (isCitation) {
          // Sobrescrito discreto: `align-super` do navegador levanta demais
          // e junto com font-semibold chamava mais atenção que o texto ao
          // redor (feedback do usuário vendo em produção). Ajuste manual
          // fino (-top, tamanho, peso) pra ficar perto da linha de base,
          // do tamanho de uma citação acadêmica comum, sem quebrar o ritmo
          // da leitura.
          return (
            <a
              key={idx}
              href={href}
              className="relative -top-[0.5em] text-[0.68em] leading-none text-teal-600/90 dark:text-teal-400/90 hover:text-teal-700 dark:hover:text-teal-300 hover:underline font-normal mx-px before:content-['['] after:content-[']']"
            >
              {linkText}
            </a>
          );
        }
        return (
          <a
            key={idx}
            href={isSafe ? href : '#'}
            target={href.startsWith('/') || isAnchor ? undefined : '_blank'}
            rel="noopener noreferrer"
            className="text-teal-700 dark:text-teal-400 hover:underline font-medium"
          >
            {linkText}
          </a>
        );
      }
    }

    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

/**
 * Junta linhas de continuação (quebradas só por legibilidade na fonte, ex.
 * um item de lista digitado em 3 linhas de ~70 caracteres no YAML) na linha
 * de marcador anterior — quebra de linha simples é espaço, como em markdown
 * padrão; só `\n\n` (bloco novo) é quebra de verdade. Sem isso, uma linha de
 * continuação que não começa com o marcador ("- "/"1. ") derrubava a
 * detecção de lista inteira (every() falhava) e o bloco virava parágrafo
 * comum com o marcador aparecendo como texto literal.
 */
function reflowMarkedLines(lines: string[], markerRegex: RegExp): string[] | null {
  if (!markerRegex.test(lines[0])) return null;
  const merged: string[] = [];
  for (const raw of lines) {
    if (markerRegex.test(raw)) {
      merged.push(raw.trim());
    } else if (merged.length > 0) {
      merged[merged.length - 1] += ' ' + raw.trim();
    }
  }
  return merged;
}

/**
 * O parser de blocos abaixo (e o split por `\n\n+`) só reconhece heading/
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
 * por `\n\n+` passa a separar os blocos do jeito que o parser abaixo espera.
 *
 * Para lista, só a fronteira de ABERTURA é corrigida (parágrafo -> lista) —
 * a de fechamento não, de propósito: uma vez dentro de uma lista, uma linha
 * sem marcador é tratada como CONTINUAÇÃO do item anterior (mesma pessoa
 * digitando um item em várias linhas — ver `reflowMarkedLines` abaixo), e
 * inserir uma linha em branco ali quebraria esse reflow. Como no conteúdo
 * real o fim de lista sempre veio com linha em branco de qualquer forma,
 * essa lacuna não tem caso conhecido — mas fechar via heurística também
 * arriscaria falso positivo pior (cortar um item legítimo de várias linhas).
 * Limitação conhecida e não coberta aqui: listas aninhadas (sub-item
 * indentado dentro de um item numerado) — o parser abaixo não suporta
 * aninhamento, então o sub-item acaba virando texto corrido dentro do item
 * pai. Ver orientação em PADRAO-NEXUSMED-CONTEUDOS.md pra evitar aninhar.
 */
function normalizeBlockBoundaries(content: string): string {
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

/**
 * Safe markdown block parser.
 * Renders paragraphs, headings, bullet lists, ordered lists, tables, and blockquotes.
 */
export const SafeMarkdown: React.FC<SafeMarkdownProps> = ({ content, className = '' }) => {
  if (!content) return null;

  // Split by double newlines for block separation
  const blocks = normalizeBlockBoundaries(content).split(/\n\n+/);

  return (
    <div className={`space-y-4 text-slate-800 dark:text-slate-200 ${className}`}>
      {blocks.map((block, bIdx) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        // Table detection
        if (trimmed.startsWith('|')) {
          const lines = trimmed.split('\n').filter((l) => l.trim().startsWith('|'));
          if (lines.length > 0) {
            const headerLine = lines[0];
            const dataLines = lines.slice(1).filter((l) => !l.includes('---'));

            const parseCells = (line: string) =>
              line
                .split('|')
                .map((c) => c.trim())
                .filter((_, i, arr) => i > 0 && i < arr.length - 1);

            const headers = parseCells(headerLine);

            return (
              <div
                key={bIdx}
                className="my-5 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800"
              >
                <table className="w-full text-xs text-left border-collapse">
                  {headers.length > 0 && (
                    <thead className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-semibold">
                      <tr>
                        {headers.map((h, hIdx) => (
                          <th key={hIdx} className="px-3.5 py-2.5">
                            {parseInline(h)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70 bg-white dark:bg-slate-900">
                    {dataLines.map((row, rIdx) => {
                      const cells = parseCells(row);
                      return (
                        <tr
                          key={rIdx}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          {cells.map((c, cIdx) => (
                            <td
                              key={cIdx}
                              className="px-3.5 py-2.5 text-slate-700 dark:text-slate-300"
                            >
                              {parseInline(c)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          }
        }

        // Headings (#, ##, ###)
        if (trimmed.startsWith('#')) {
          const match = trimmed.match(/^(#{1,4})\s+(.+)$/);
          if (match) {
            const level = match[1].length;
            const headingText = match[2];
            if (level === 1) {
              return (
                <h2
                  key={bIdx}
                  className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 pt-4 pb-1 border-b border-slate-200 dark:border-slate-800"
                >
                  {parseInline(headingText)}
                </h2>
              );
            }
            if (level === 2) {
              return (
                <h3
                  key={bIdx}
                  className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 pt-3"
                >
                  {parseInline(headingText)}
                </h3>
              );
            }
            return (
              <h4
                key={bIdx}
                className="text-base font-semibold text-slate-900 dark:text-slate-100 pt-2"
              >
                {parseInline(headingText)}
              </h4>
            );
          }
        }

        // Blockquote (> ...) e Destaques Editoriais Clínicos
        if (trimmed.startsWith('>')) {
          const quoteLines = trimmed
            .split('\n')
            .map((l) => l.replace(/^>\s?/, ''))
            .join(' ');

          const isGoldRule =
            /^\s*\[!(NOTE|TIP)\]/i.test(quoteLines) ||
            /^\s*\*\*(Diretriz|Conduta de Ouro|Ponto Chave)/i.test(quoteLines);

          const isTrap =
            /^\s*\[!(WARNING|CAUTION)\]/i.test(quoteLines) ||
            /^\s*\*\*(Pegadinha|Armadilha|Atenção|Alerta)/i.test(quoteLines);

          const isPhysio =
            /^\s*\*\*(Fisiopatologia|Mecanismo|Farmacologia)/i.test(quoteLines);

          const isConsensus =
            /^\s*\*\*(Consenso de Prova|Prova vs\.? Plantão|Prática vs\.? Prova|Consenso vs\.? Prática|Pérola de Prova)/i.test(
              quoteLines
            );

          if (isGoldRule) {
            const cleanText = quoteLines.replace(/^\s*\[!(NOTE|TIP)\]\s*/i, '');
            return (
              <div key={bIdx} className="box-gold-rule my-3 text-sm text-slate-800 dark:text-slate-200">
                <div className="font-bold text-emerald-800 dark:text-emerald-300 text-xs mb-1 uppercase tracking-wider flex items-center gap-1.5">
                  <span>✦ Conduta de Ouro / Diretriz Oficial</span>
                </div>
                {parseInline(cleanText)}
              </div>
            );
          }

          if (isTrap) {
            const cleanText = quoteLines.replace(/^\s*\[!(WARNING|CAUTION)\]\s*/i, '');
            return (
              <div key={bIdx} className="box-trap my-3 text-sm text-slate-800 dark:text-slate-200">
                <div className="font-bold text-rose-800 dark:text-rose-300 text-xs mb-1 uppercase tracking-wider flex items-center gap-1.5">
                  <span>⚠ Armadilha da Banca / Pegadinha Frequente</span>
                </div>
                {parseInline(cleanText)}
              </div>
            );
          }

          if (isPhysio) {
            return (
              <div key={bIdx} className="box-physio my-3 text-sm text-slate-800 dark:text-slate-200">
                <div className="font-bold text-amber-800 dark:text-amber-300 text-xs mb-1 uppercase tracking-wider flex items-center gap-1.5">
                  <span>⚙ Fisiopatologia & Mecanismo de Ação</span>
                </div>
                {parseInline(quoteLines)}
              </div>
            );
          }

          if (isConsensus) {
            return (
              <div key={bIdx} className="box-consensus my-3.5 text-sm text-slate-800 dark:text-slate-200">
                <div className="font-bold text-indigo-800 dark:text-indigo-300 text-xs mb-1 uppercase tracking-wider flex items-center gap-1.5">
                  <span>✦ Consenso de Prova vs. Prática de Plantão</span>
                </div>
                {parseInline(quoteLines)}
              </div>
            );
          }

          return (
            <blockquote
              key={bIdx}
              className="my-3 pl-4 border-l-2 border-teal-600 dark:border-teal-500 italic text-slate-600 dark:text-slate-300 text-sm leading-relaxed"
            >
              {parseInline(quoteLines)}
            </blockquote>
          );
        }

        // Bullet list (- or * or •) — linhas de continuação (sem marcador)
        // são juntadas na linha do marcador anterior antes de renderizar.
        const lines = trimmed.split('\n');
        const bulletLines = reflowMarkedLines(lines, /^\s*[-*•]\s+/);
        if (bulletLines) {
          return (
            <ul key={bIdx} className="space-y-1.5 my-3 pl-4 list-none text-sm leading-relaxed">
              {bulletLines.map((line, lIdx) => {
                const itemText = line.replace(/^\s*[-*•]\s+/, '');
                return (
                  <li key={lIdx} className="flex items-start gap-2">
                    <span className="text-teal-600 dark:text-teal-400 mt-1 shrink-0">•</span>
                    <span>{parseInline(itemText)}</span>
                  </li>
                );
              })}
            </ul>
          );
        }

        // Numbered list (1. 2. ...) — mesma lógica de reflow acima.
        const numberedLines = reflowMarkedLines(lines, /^\s*\d+\.\s+/);
        if (numberedLines) {
          return (
            <ol key={bIdx} className="space-y-1.5 my-3 pl-5 list-decimal text-sm leading-relaxed">
              {numberedLines.map((line, lIdx) => {
                const itemText = line.replace(/^\s*\d+\.\s+/, '');
                return <li key={lIdx}>{parseInline(itemText)}</li>;
              })}
            </ol>
          );
        }

        // Standard paragraph: quebra de linha simples na fonte vira espaço
        // (markdown padrão), não quebra forçada — deixa o navegador quebrar
        // a linha naturalmente na largura real da coluna, o que também é
        // necessário pra text-justify funcionar de verdade (justificar uma
        // linha curta cortada à força no meio da frase fica ruim).
        return (
          <p key={bIdx} className="leading-[1.7] text-slate-800 dark:text-slate-200 text-base text-justify [text-justify:inter-word]">
            {parseInline(lines.map((l) => l.trim()).join(' '))}
          </p>
        );
      })}
    </div>
  );
};
