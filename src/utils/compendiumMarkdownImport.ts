import { Compendium, Discipline, Theme } from '../types';
import {
  buildCompendiumImportResult,
  CompendiumImportFailure,
  CompendiumImportSuccess,
  RawCompendiumInput,
} from './compendiumImport';

// ============================================================================
// Importação de conteúdo a partir de Markdown — segunda porta de entrada além
// do `.compendium.yaml`, pensada para o fluxo real de quem gera o rascunho
// com uma IA de fontes (NotebookLM e similares): essas ferramentas produzem
// Markdown nativamente, nunca YAML. Em vez de pedir pra converter à mão,
// este parser reconhece a convenção descrita em
// `docs/editorial/PADRAO-NEXUSMED-CONTEUDOS.md` e entrega o mesmo formato
// intermediário que o parser de YAML já usa — toda a validação de campos
// obrigatórios/opcionais continua sendo UMA SÓ, em `buildCompendiumImportResult`.
//
// Convenção esperada (ver exemplo real gerado em conversa — o parser é
// tolerante a variações razoáveis, nunca trava por formatação; campos que
// não forem encontrados só entram como "ausente" no preview, igual ao YAML):
//
//   # Título completo
//
//   **Subtítulo:** ...
//   **Disciplina:** ...
//   **Tema:** ...
//   **Autor:** ... (opcional)
//   **Tempo estimado de leitura:** 18 minutos (opcional)
//
//   ### Seção 1 — Título da Seção
//   **Tag de Mecanismo:** Fisiopatologia (opcional)
//
//   Corpo em markdown simples...
//
//   **Pontos-Chave:**
//   *   Frase 1
//   *   Frase 2
//
//   > 💡 **Pérola Clínica:** texto (opcional)
//   > ⚠️ **Alerta de Armadilha:** texto (opcional)
//
//   ### Palavras-chave        (ou `### Tags`, o nome antigo — os dois valem)
//   `tag1` `tag2`
//
//   ### Referências Bibliográficas
//   1. Referência completa [tipo de evidência entre colchetes]
// ============================================================================

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normalize(s: string): string {
  return stripAccents(s).toLowerCase().trim();
}

export type MarkdownBlockKind = 'content' | 'references' | 'tags' | 'dependencies';

export interface MarkdownFileBlock {
  headerText: string;
  kind: MarkdownBlockKind;
  /** Índice (base 0) da linha `### `. */
  headerLine: number;
  /** Índice (base 0) da primeira linha depois do bloco. */
  endLine: number;
}

export interface MarkdownFileLayout {
  lines: string[];
  /** Índice da primeira linha `# `, ou -1. */
  titleLine: number;
  title: string;
  /** Blocos `### `, em ordem. De referências e palavras-chave, a importação guarda o último. */
  blocks: MarkdownFileBlock[];
}

/**
 * Divide o arquivo como a importação o lê: o título é a primeira linha `# `,
 * e cada linha `### ` depois dele abre um bloco, classificado pelo título.
 * Exportado para a checagem do padrão (`compendiumStandardCheck.ts`) apontar
 * linhas sem reimplementar a leitura.
 */
export function readMarkdownLayout(text: string): MarkdownFileLayout {
  const lines = text.split(/\r\n|\n/);
  const titleLine = lines.findIndex((l) => /^#\s+.+/.test(l.trim()));
  const title = titleLine === -1 ? '' : lines[titleLine].trim().replace(/^#\s+/, '').trim();
  const starts: number[] = [];
  lines.forEach((line, i) => {
    if (i > titleLine && /^###\s+.+/.test(line.trim())) starts.push(i);
  });
  const blocks = starts.map((headerLine, k): MarkdownFileBlock => {
    const headerText = lines[headerLine].trim().replace(/^###\s+/, '').trim();
    const n = normalize(headerText);
    const kind: MarkdownBlockKind = isReferencesHeader(n)
      ? 'references'
      : isTagsHeader(n)
        ? 'tags'
        : isDependenciesHeader(n)
          ? 'dependencies'
          : 'content';
    return { headerText, kind, headerLine, endLine: k + 1 < starts.length ? starts[k + 1] : lines.length };
  });
  return { lines, titleLine, title, blocks };
}

export function blockBody(layout: MarkdownFileLayout, block: MarkdownFileBlock): string {
  return layout.lines.slice(block.headerLine + 1, block.endLine).join('\n');
}

export const METADATA_LABELS: Record<string, keyof RawCompendiumInput> = {
  subtitulo: 'subtitle',
  disciplina: 'disciplineName',
  tema: 'themeName',
  autor: 'author',
  'tempo estimado de leitura': 'estimatedReadTimeMinutes',
};

/** Lê `**Rótulo:** valor` de cada linha, até o primeiro heading `### `. */
export function extractMetadata(text: string): Partial<RawCompendiumInput> {
  const beforeFirstH3 = text.split(/\r\n|\n/);
  const out: Partial<RawCompendiumInput> = {};
  for (const line of beforeFirstH3) {
    if (/^###\s+/.test(line.trim())) break;
    const m = line.trim().match(/^\*\*([^*:]+):\*\*\s*(.*)$/);
    if (!m) continue;
    const label = normalize(m[1]);
    const field = METADATA_LABELS[label];
    if (!field) continue;
    const value = m[2].trim();
    if (field === 'estimatedReadTimeMinutes') {
      const num = parseInt(value, 10);
      out.estimatedReadTimeMinutes = Number.isFinite(num) ? num : undefined;
    } else {
      (out as Record<string, string>)[field] = value;
    }
  }
  return out;
}

/** Remove um trecho (por índice de linha) do corpo, deixando linha em branco no lugar. */
function blankLines(lines: string[], start: number, end: number): void {
  for (let i = start; i < end && i < lines.length; i++) lines[i] = '';
}

interface ExtractedSection {
  title: string;
  content: string;
  keyTakeaways: string[];
  mechanismTag?: string;
  clinicalPearl?: string;
  warningAlert?: string;
}

/** Rótulos que a importação tira do corpo da seção (ver `extractSectionParts`). */
export const TAKEAWAYS_LABEL = /^\*\*Pontos-?Chave:?\*\*\s*$/i;
export const PEARL_LABEL = /^\*\*P[eé]rola Cl[ií]nica:?\*\*\s*(.*)$/i;
export const ALERT_LABEL = /^\*\*Alerta(?: de Armadilha)?:?\*\*\s*(.*)$/i;

/** Texto de uma linha de citação `> ` sem o `>` e sem o emoji antes do rótulo. */
export function blockquoteLabelText(line: string): string {
  return line.trim().replace(/^>\s?/, '').replace(/^[^\w*]*/u, '');
}

export interface SectionParts extends Omit<ExtractedSection, 'title' | 'content'> {
  /** Linhas do corpo, na posição original, com o que a importação extrai trocado por linha vazia. */
  contentLines: string[];
}

/**
 * Separa do corpo da seção o que vira campo próprio (Tag de Mecanismo,
 * Pontos-Chave, Pérola, Alerta). As linhas ficam na posição original, para a
 * checagem do padrão apontar a linha do arquivo.
 */
export function extractSectionParts(rawBody: string): SectionParts {
  const lines = rawBody.split(/\r\n|\n/);
  let mechanismTag: string | undefined;
  let clinicalPearl: string | undefined;
  let warningAlert: string | undefined;
  const keyTakeaways: string[] = [];

  // Separador visual (--- ou ***) entre seções não é conteúdo.
  lines.forEach((line, i) => {
    if (/^(---+|\*\*\*+)$/.test(line.trim())) lines[i] = '';
  });

  // Tag de Mecanismo: linha isolada "**Tag de Mecanismo:** valor".
  lines.forEach((line, i) => {
    const m = line.trim().match(/^\*\*Tag de Mecanismo:?\*\*\s*(.*)$/i);
    if (m && !mechanismTag) {
      mechanismTag = m[1].trim() || undefined;
      lines[i] = '';
    }
  });

  // Pontos-Chave: rótulo em negrito seguido de itens de lista.
  const takeawaysLabelIdx = lines.findIndex((l) => TAKEAWAYS_LABEL.test(l.trim()));
  if (takeawaysLabelIdx !== -1) {
    let end = takeawaysLabelIdx + 1;
    while (end < lines.length) {
      const trimmed = lines[end].trim();
      if (trimmed === '') {
        end++;
        continue;
      }
      const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
      if (!bulletMatch) break;
      keyTakeaways.push(bulletMatch[1].trim());
      end++;
    }
    blankLines(lines, takeawaysLabelIdx, end);
  }

  // Blockquotes (linhas "> "): agrupa consecutivas e classifica por rótulo.
  let i = 0;
  while (i < lines.length) {
    if (!/^>\s?/.test(lines[i].trim())) {
      i++;
      continue;
    }
    const start = i;
    let j = i + 1;
    // Uma nova linha "> **Pérola Clínica:**"/"> **Alerta...**" sempre abre um
    // grupo novo, mesmo colada na anterior sem linha em branco — só uma
    // continuação de frase quebrada (sem rótulo novo) entra no mesmo grupo.
    while (j < lines.length && /^>\s?/.test(lines[j].trim())) {
      const nextStripped = blockquoteLabelText(lines[j]);
      if (/^\*\*(P[eé]rola|Alerta)/i.test(nextStripped)) break;
      j++;
    }
    const joined = lines
      .slice(start, j)
      .map((l) => l.trim().replace(/^>\s?/, ''))
      .join(' ')
      .trim();
    // Emoji opcional antes do rótulo (💡, ⚠️, etc.) — descartado junto com o rótulo.
    const label = joined.replace(/^[^\w*]*/u, '');
    const pearlMatch = label.match(PEARL_LABEL);
    const alertMatch = label.match(ALERT_LABEL);
    if (pearlMatch) {
      clinicalPearl = pearlMatch[1].trim() || undefined;
      blankLines(lines, start, j);
    } else if (alertMatch) {
      warningAlert = alertMatch[1].trim() || undefined;
      blankLines(lines, start, j);
    }
    // Blockquote não reconhecido: mantém como conteúdo normal.
    i = j;
  }

  return { contentLines: lines, keyTakeaways, mechanismTag, clinicalPearl, warningAlert };
}

function parseSectionBody(rawBody: string): Omit<ExtractedSection, 'title'> {
  const { contentLines, ...parts } = extractSectionParts(rawBody);
  const content = contentLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { content, ...parts };
}

/** Junta linhas de continuação de um item de lista numerada (mesma ideia do SafeMarkdown). */
export function extractNumberedList(body: string): string[] {
  const lines = body.split(/\r\n|\n/);
  const items: string[] = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^\d+\.\s+(.*)$/);
    if (m) {
      items.push(m[1].trim());
    } else if (items.length > 0) {
      items[items.length - 1] += ' ' + trimmed;
    }
  }
  return items;
}

export function extractBacktickTags(body: string): string[] {
  const matches = body.match(/`([^`\n]+)`/g) ?? [];
  return matches.map((m) => m.slice(1, -1).trim()).filter(Boolean);
}

export function isReferencesHeader(headerNorm: string): boolean {
  return headerNorm.includes('referencia');
}

/** `### Palavras-chave` é o nome do campo na plataforma desde a 43-A; `### Tags` segue aceito. */
export function isTagsHeader(headerNorm: string): boolean {
  return headerNorm === 'tags' || /^palavras[\s-]?chave$/.test(headerNorm);
}

export function isDependenciesHeader(headerNorm: string): boolean {
  return (
    headerNorm.includes('conexao') || headerNorm.includes('pre-requisito') || headerNorm.includes('pre requisito')
  );
}

const SECTION_NUMBER_PREFIX = /^se[cç][aã]o\s*\d+\s*[—\-:]\s*/i;

export function parseCompendiumMarkdownText(
  text: string,
  disciplines: Discipline[],
  themes: Theme[],
  existingCompendiums: Compendium[]
): CompendiumImportSuccess | CompendiumImportFailure {
  const layout = readMarkdownLayout(text);
  const { title } = layout;
  const metadata = extractMetadata(layout.lines.slice(layout.titleLine + 1).join('\n'));

  const sections: Array<{ title: string; content: string; keyTakeaways: string[]; mechanismTag?: string; clinicalPearl?: string; warningAlert?: string }> = [];
  let references: string[] = [];
  let tags: string[] = [];

  for (const block of layout.blocks) {
    const body = blockBody(layout, block);
    if (block.kind === 'references') {
      references = extractNumberedList(body);
    } else if (block.kind === 'tags') {
      tags = extractBacktickTags(body);
    } else if (block.kind === 'dependencies') {
      // Não há campo equivalente aceito hoje pela importação (mesma
      // lacuna já existe no formato YAML) — ignorado deliberadamente.
      continue;
    } else {
      const sectionTitle = block.headerText.replace(SECTION_NUMBER_PREFIX, '').trim();
      const parsed = parseSectionBody(body);
      sections.push({ title: sectionTitle, ...parsed });
    }
  }

  const data: RawCompendiumInput = {
    title,
    subtitle: metadata.subtitle,
    disciplineName: metadata.disciplineName,
    themeName: metadata.themeName,
    author: metadata.author,
    estimatedReadTimeMinutes: metadata.estimatedReadTimeMinutes,
    tags,
    sections,
    references,
  };

  return buildCompendiumImportResult(data, disciplines, themes, existingCompendiums);
}
