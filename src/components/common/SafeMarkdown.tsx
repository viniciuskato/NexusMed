import React from 'react';

interface SafeMarkdownProps {
  content: string;
  className?: string;
}

/**
 * Safely parses inline markdown (bold, italic, inline code, links)
 * into React nodes WITHOUT dangerouslySetInnerHTML.
 */
function parseInline(text: string): React.ReactNode[] {
  // Regex matches:
  // 1. **bold**
  // 2. *italic* or _italic_
  // 3. `inline code`
  // 4. [text](url)
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
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
 * Safe markdown block parser.
 * Renders paragraphs, headings, bullet lists, ordered lists, tables, and blockquotes.
 */
export const SafeMarkdown: React.FC<SafeMarkdownProps> = ({ content, className = '' }) => {
  if (!content) return null;

  // Split by double newlines for block separation
  const blocks = content.split(/\n\n+/);

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
