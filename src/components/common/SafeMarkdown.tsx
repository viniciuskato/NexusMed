import React from 'react';
import { extractTableCitations, splitReaderBlocks, TABLE_CITATION_PATTERN } from '../../utils/markdownBlocks';

interface SafeMarkdownProps {
  content: string;
  className?: string;
}

/**
 * Notação de expoente em texto puro (ex.: "0,9938^Idade",
 * "max(SCr/κ, 1)^(-1,200)") — convenção usada no conteúdo porque o
 * SafeMarkdown não interpreta LaTeX (ver nota em `fix-tfge-compendio-
 * latex.sql`). Sem decodificar o "^", ele ficava literal na tela em vez de
 * virar um expoente legível (achado revisando o compêndio de TFGe
 * publicado: a fórmula CKD-EPI 2021 mostrava "^α"/"^(-1,200)"/"^Idade"
 * cru). O grupo entre parênteses cobre expoente composto (sinal, vírgula
 * decimal); o token solto cobre variável/letra grega isolada — ambos param
 * em qualquer espaço/operador/fechamento, então nunca engolem o resto da
 * frase. `tokenizeSuperscripts` é o núcleo compartilhado por
 * `decodeSuperscripts` (prosa comum, via `parseInline`) e `renderFormula`
 * (bloco de fórmula em destaque, com operadores também estilizados).
 */
const SUPERSCRIPT_SPLIT = /(\^(?:\([^()]+\)|[^\s×÷/+\-=,()[\]]+))/g;

type FormulaToken = string | { sup: string };

function tokenizeSuperscripts(text: string): FormulaToken[] {
  return text
    .split(SUPERSCRIPT_SPLIT)
    .filter((part) => part !== '')
    .map((part): FormulaToken => {
      const match = part.match(/^\^(?:\(([^()]+)\)|(.+))$/);
      return match ? { sup: match[1] ?? match[2] } : part;
    });
}

function decodeSuperscripts(text: string): React.ReactNode[] {
  return tokenizeSuperscripts(text).map((token, idx) =>
    typeof token === 'string' ? (
      <React.Fragment key={idx}>{token}</React.Fragment>
    ) : (
      <sup key={idx} className="text-[0.72em] font-medium">
        {token.sup}
      </sup>
    )
  );
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

    // Texto comum: ainda pode carregar notação de expoente solta (ex. uma
    // fórmula curta citada dentro de uma frase, "10^(9−pH)") — decodifica
    // pro mesmo `<sup>` usado no bloco de fórmula em destaque.
    return <React.Fragment key={idx}>{decodeSuperscripts(part)}</React.Fragment>;
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

const FORMULA_OPERATOR_SPLIT = /([×÷=≥≤≈])/g;
const FORMULA_TERM_BOUNDARY = new Set(['=', '×', '÷', '/']);

/**
 * Quebra a fórmula em "termos" (ex. "eGFRcr" | "= 142" | "× min(SCr/κ, 1)^α"
 * | ...) nos operadores de topo (fora de `()`/`[]`) — cada termo vira depois
 * um `<span>` sem quebra interna, então o navegador só quebra linha ENTRE
 * termos, nunca no meio de um parêntese ou de um expoente. Sem isso, uma
 * fórmula mais longa que a coluna de leitura (comum no celular) ou vazava
 * do card ou cortava um termo ao meio de forma ilegível. Respeitar
 * profundidade de parênteses é necessário porque `÷`/`/` aparecem às vezes
 * DENTRO de um termo entre colchetes (ex. "[ASC real (m²) ÷ 1,73]") — ali
 * não é fronteira de termo, é parte do mesmo termo.
 */
function splitFormulaTerms(text: string): string[] {
  const splitPositions: number[] = [];
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (depth === 0 && FORMULA_TERM_BOUNDARY.has(ch) && text[i - 1] === ' ' && text[i + 1] === ' ') {
      splitPositions.push(i - 1);
    }
  }
  const terms: string[] = [];
  let start = 0;
  for (const pos of splitPositions) {
    terms.push(text.slice(start, pos).trim());
    start = pos;
  }
  terms.push(text.slice(start).trim());
  return terms.filter(Boolean);
}

/**
 * Mesmo `tokenizeSuperscripts` de `decodeSuperscripts`, mas para o bloco de
 * fórmula em destaque (`FormulaDisplay`): além do expoente, os operadores
 * (×÷=≥≤≈) também ganham destaque de cor — a fórmula inteira é o conteúdo
 * principal do bloco, então vale a estilização extra que seria ruído em
 * texto corrido comum.
 */
function renderFormulaTerm(term: string): React.ReactNode[] {
  return tokenizeSuperscripts(term).map((token, idx) => {
    if (typeof token !== 'string') {
      return (
        <sup
          key={idx}
          className="ml-px text-[0.68em] font-semibold text-teal-700 dark:text-teal-300"
        >
          {token.sup}
        </sup>
      );
    }
    return (
      <React.Fragment key={idx}>
        {token.split(FORMULA_OPERATOR_SPLIT).map((seg, sIdx) =>
          /^[×÷=≥≤≈]$/.test(seg) ? (
            <span key={sIdx} className="mx-0.5 font-semibold text-teal-600 dark:text-teal-400">
              {seg}
            </span>
          ) : (
            seg
          )
        )}
      </React.Fragment>
    );
  });
}

function renderFormula(text: string): React.ReactNode[] {
  return splitFormulaTerms(text).map((term, idx) => (
    <span key={idx} className="eq-term">
      {renderFormulaTerm(term)}
    </span>
  ));
}

/**
 * Uma linha isolada (quebra simples `\n`, dentro do mesmo bloco/parágrafo —
 * sem linha em branco ao redor) conta como fórmula de exibição quando
 * contém "=" e não termina como frase (".", ",", ";" ou ":"). "=" sozinho
 * já é sinal suficiente: não ocorre em prosa médica em português fora de
 * equação — conferido varrendo toda a base publicada (132 linhas com "="),
 * nenhuma delas prosa comum caindo neste ramo por engano (as que usam "="
 * como mnemônico curto, ex. "Tumor = instalação gradual.", sempre terminam
 * em pontuação de frase, e as que ficam dentro de tabela/lista/blockquote
 * já são tratadas por um ramo anterior deste parser).
 */
function isFormulaLine(line: string): boolean {
  return line.includes('=') && line.length <= 220 && !/[.,;:]$/.test(line);
}

function FormulaDisplay({ formula }: { formula: string }) {
  return (
    <div className="eq-box my-4">
      <div className="eq-box__label">
        <span aria-hidden="true">∑</span> Fórmula
      </div>
      <div className="eq-box__formula">{renderFormula(formula)}</div>
    </div>
  );
}

/**
 * Safe markdown block parser.
 * Renders paragraphs, headings, bullet lists, ordered lists, tables, and blockquotes.
 */
export const SafeMarkdown: React.FC<SafeMarkdownProps> = ({ content, className = '' }) => {
  if (!content) return null;

  // Split by double newlines for block separation
  const blocks = splitReaderBlocks(content);

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
            const tableCitations = extractTableCitations(blocks[bIdx - 1]);

            return (
              <div key={bIdx} className="my-5">
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
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
                {tableCitations.length > 0 && (
                  <div className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>Fonte:</span>
                    {tableCitations.map((c) => (
                      <a
                        key={c.num}
                        href={c.href}
                        className="text-teal-600/90 dark:text-teal-400/90 hover:underline font-medium"
                      >
                        [{c.num}]
                      </a>
                    ))}
                  </div>
                )}
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

          // Fórmula citada como blockquote (ex.: "> Escore Z = (Valor
          // Medido − Valor Previsto) ÷ Desvio Padrão da População de
          // Referência [1](#ref-1)[3](#ref-3)", padrão real do compêndio de
          // Espirometria) — mesmo `FormulaDisplay` do parágrafo comum, só
          // que aqui a citação vem grudada no fim da própria linha (não
          // numa frase antes/depois) e precisa ser destacada da fórmula
          // antes do teste de `isFormulaLine`, senão o "[1](#ref-1)" cru
          // vazaria dentro do card (renderFormula não interpreta link).
          const citationTailMatch = quoteLines.match(/((?:\s*\[\d+\]\(#ref-\d+\))+)\s*$/);
          const formulaCandidate = citationTailMatch
            ? quoteLines.slice(0, citationTailMatch.index).trimEnd()
            : quoteLines;
          if (isFormulaLine(formulaCandidate)) {
            const citations = citationTailMatch
              ? Array.from(citationTailMatch[1].matchAll(TABLE_CITATION_PATTERN)).map((m) => ({
                  num: m[1],
                  href: m[2],
                }))
              : [];
            return (
              <div key={bIdx}>
                <FormulaDisplay formula={formulaCandidate} />
                {citations.length > 0 && (
                  <div className="mt-1.5 flex items-center justify-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>Fonte:</span>
                    {citations.map((c) => (
                      <a
                        key={c.num}
                        href={c.href}
                        className="text-teal-600/90 dark:text-teal-400/90 hover:underline font-medium"
                      >
                        [{c.num}]
                      </a>
                    ))}
                  </div>
                )}
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

        // Fórmula de exibição isolada em sua própria linha dentro do bloco
        // (ex.: "...expressa matematicamente por:\neGFRcr = 142 × ...\nonde
        // SCr representa...", padrão real do compêndio de TFGe) — separa em
        // segmentos de prosa/fórmula preservando a ordem, em vez de achatar
        // tudo numa única frase corrida onde a fórmula ficava ilegível.
        const trimmedLines = lines.map((l) => l.trim()).filter(Boolean);
        if (trimmedLines.some(isFormulaLine)) {
          const segments: { formula: boolean; lines: string[] }[] = [];
          for (const line of trimmedLines) {
            const formula = isFormulaLine(line);
            const last = segments[segments.length - 1];
            if (last && last.formula === formula) {
              last.lines.push(line);
            } else {
              segments.push({ formula, lines: [line] });
            }
          }
          return (
            <React.Fragment key={bIdx}>
              {segments.map((seg, sIdx) =>
                seg.formula ? (
                  seg.lines.map((formulaLine, fIdx) => (
                    <FormulaDisplay key={`${bIdx}-${sIdx}-${fIdx}`} formula={formulaLine} />
                  ))
                ) : (
                  <p
                    key={`${bIdx}-${sIdx}`}
                    className="leading-[1.7] text-slate-800 dark:text-slate-200 text-base text-justify [text-justify:inter-word]"
                  >
                    {parseInline(seg.lines.join(' '))}
                  </p>
                )
              )}
            </React.Fragment>
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
