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

interface MdSection {
  headerText: string;
  body: string;
}

/** Quebra o corpo em blocos por heading `### `, preservando a ordem. */
function splitByH3(text: string): MdSection[] {
  const lines = text.split(/\r\n|\n/);
  const headingIdx: number[] = [];
  lines.forEach((line, i) => {
    if (/^###\s+.+/.test(line.trim())) headingIdx.push(i);
  });

  const blocks: MdSection[] = [];
  headingIdx.forEach((idx, i) => {
    const headerText = lines[idx].trim().replace(/^###\s+/, '').trim();
    const end = i + 1 < headingIdx.length ? headingIdx[i + 1] : lines.length;
    const body = lines.slice(idx + 1, end).join('\n');
    blocks.push({ headerText, body });
  });
  return blocks;
}

function extractTitle(text: string): { title: string; rest: string } {
  const lines = text.split(/\r\n|\n/);
  const idx = lines.findIndex((l) => /^#\s+.+/.test(l.trim()));
  if (idx === -1) return { title: '', rest: text };
  const title = lines[idx].trim().replace(/^#\s+/, '').trim();
  return { title, rest: lines.slice(idx + 1).join('\n') };
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

function parseSectionBody(rawBody: string): Omit<ExtractedSection, 'title'> {
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
  const takeawaysLabelIdx = lines.findIndex((l) => /^\*\*Pontos-?Chave:?\*\*\s*$/i.test(l.trim()));
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
      const nextStripped = lines[j].trim().replace(/^>\s?/, '').replace(/^[^\w*]*/u, '');
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
    const pearlMatch = label.match(/^\*\*P[eé]rola Cl[ií]nica:?\*\*\s*(.*)$/i);
    const alertMatch = label.match(/^\*\*Alerta(?: de Armadilha)?:?\*\*\s*(.*)$/i);
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

  const content = lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { content, keyTakeaways, mechanismTag, clinicalPearl, warningAlert };
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
  const { title, rest } = extractTitle(text);
  const metadata = extractMetadata(rest);
  const blocks = splitByH3(rest);

  const sections: Array<{ title: string; content: string; keyTakeaways: string[]; mechanismTag?: string; clinicalPearl?: string; warningAlert?: string }> = [];
  let references: string[] = [];
  let tags: string[] = [];

  for (const block of blocks) {
    const headerNorm = normalize(block.headerText);
    if (isReferencesHeader(headerNorm)) {
      references = extractNumberedList(block.body);
    } else if (isTagsHeader(headerNorm)) {
      tags = extractBacktickTags(block.body);
    } else if (isDependenciesHeader(headerNorm)) {
      // Não há campo equivalente aceito hoje pela importação (mesma
      // lacuna já existe no formato YAML) — ignorado deliberadamente.
      continue;
    } else {
      const sectionTitle = block.headerText.replace(SECTION_NUMBER_PREFIX, '').trim();
      const parsed = parseSectionBody(block.body);
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
