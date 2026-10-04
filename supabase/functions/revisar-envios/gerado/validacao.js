/* eslint-disable */
// GERADO por scripts/gerar-revisor.ts (empacota src/utils/envioDeMaterial.ts e envioDeQuestoes.ts). NÃO EDITE: rode `npm run gerar:revisor`.
// src/utils/compendiumImport.ts
function normalizeTitle(t) {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}
function findDuplicateCompendium(title, existing) {
  const norm = normalizeTitle(title);
  return existing.find((c) => normalizeTitle(c.title) === norm);
}
function resolveByName(name, list) {
  const norm = name.trim().toLowerCase();
  return list.find((item) => item.name.trim().toLowerCase() === norm);
}
function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}
var LEGACY_CITATION_PATTERN = /\[\d+(?:\s*,\s*\d+)*\](?!\()/;
function buildCompendiumImportResult(data, disciplines, themes, existingCompendiums) {
  const errors = [];
  const missingFields = [];
  const title = isNonEmptyString(data.title) ? data.title.trim() : "";
  if (!title) errors.push("O arquivo não tem título — não é possível criar o material.");
  const subtitle = isNonEmptyString(data.subtitle) ? data.subtitle.trim() : "";
  if (!subtitle) missingFields.push("Subtítulo");
  const disciplineName = isNonEmptyString(data.disciplineName) ? data.disciplineName.trim() : "";
  if (!disciplineName) errors.push("O arquivo não informa a disciplina — não é possível criar o material.");
  const themeName = isNonEmptyString(data.themeName) ? data.themeName.trim() : "";
  if (!themeName) errors.push("O arquivo não informa o tema — não é possível criar o material.");
  const author = isNonEmptyString(data.author) ? data.author.trim() : "";
  if (!author) missingFields.push("Autor");
  const estimatedReadTimeMinutes = Number(data.estimatedReadTimeMinutes) || 0;
  if (!estimatedReadTimeMinutes) missingFields.push("Tempo estimado de leitura");
  const tags = Array.isArray(data.tags) ? data.tags.filter(isNonEmptyString).map((t) => t.trim()) : [];
  if (tags.length === 0) missingFields.push("Palavras-chave");
  const sectionsRaw = Array.isArray(data.sections) ? data.sections : [];
  if (sectionsRaw.length === 0) {
    errors.push("O arquivo não tem nenhuma seção de conteúdo — não é possível criar o material.");
  }
  const sections = [];
  sectionsRaw.forEach((s, idx) => {
    const sec = s ?? {};
    const secTitle = isNonEmptyString(sec.title) ? sec.title.trim() : "";
    const secContent = isNonEmptyString(sec.content) ? sec.content.trim() : "";
    if (!secTitle || !secContent) {
      errors.push(`A seção ${idx + 1} do arquivo está incompleta (falta título ou conteúdo) — corrija o arquivo antes de importar.`);
      return;
    }
    sections.push({
      id: crypto.randomUUID(),
      title: secTitle,
      content: secContent,
      keyTakeaways: Array.isArray(sec.keyTakeaways) ? sec.keyTakeaways.filter(isNonEmptyString).map((k) => k.trim()) : [],
      mechanismTag: isNonEmptyString(sec.mechanismTag) ? sec.mechanismTag.trim() : void 0,
      clinicalPearl: isNonEmptyString(sec.clinicalPearl) ? sec.clinicalPearl.trim() : void 0,
      warningAlert: isNonEmptyString(sec.warningAlert) ? sec.warningAlert.trim() : void 0
    });
  });
  const references = Array.isArray(data.references) ? data.references.filter(isNonEmptyString).map((r) => r.trim()) : [];
  if (references.length === 0) missingFields.push("Referências bibliográficas");
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  if (sections.some((s) => LEGACY_CITATION_PATTERN.test(s.content))) {
    missingFields.push(
      'Citações em formato antigo (ex.: "[12]", sem link) encontradas no texto — troque por "[N](#ref-N)", com N na posição correta da lista de referências, antes de publicar'
    );
  }
  const discipline = resolveByName(disciplineName, disciplines);
  const theme = resolveByName(
    themeName,
    discipline ? themes.filter((t) => t.disciplineId === discipline.id) : themes
  );
  if (!discipline) {
    missingFields.push(`Disciplina "${disciplineName}" não encontrada no catálogo atual — selecione uma manualmente antes de confirmar`);
  }
  if (!theme) {
    missingFields.push(`Tema "${themeName}" não encontrado no catálogo atual — selecione um manualmente antes de confirmar`);
  }
  const duplicate = findDuplicateCompendium(title, existingCompendiums);
  const preview = {
    title,
    subtitle,
    author: author || "",
    estimatedReadTimeMinutes: estimatedReadTimeMinutes || 15,
    disciplineName,
    themeName,
    disciplineId: discipline?.id ?? null,
    themeId: theme?.id ?? null,
    tags,
    sectionsCount: sections.length,
    referencesCount: references.length,
    missingFields,
    isDuplicate: !!duplicate,
    duplicateOfId: duplicate?.id,
    duplicateOfTitle: duplicate?.title
  };
  return { ok: true, errors: [], preview, sections, references, tags };
}

// src/utils/compendiumMarkdownImport.ts
function stripAccents(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function normalize(s) {
  return stripAccents(s).toLowerCase().trim();
}
function readMarkdownLayout(text) {
  const lines = text.split(/\r\n|\n/);
  const titleLine = lines.findIndex((l) => /^#\s+.+/.test(l.trim()));
  const title = titleLine === -1 ? "" : lines[titleLine].trim().replace(/^#\s+/, "").trim();
  const starts = [];
  lines.forEach((line, i) => {
    if (i > titleLine && /^###\s+.+/.test(line.trim())) starts.push(i);
  });
  const blocks = starts.map((headerLine, k) => {
    const headerText = lines[headerLine].trim().replace(/^###\s+/, "").trim();
    const n = normalize(headerText);
    const kind = isReferencesHeader(n) ? "references" : isTagsHeader(n) ? "tags" : isDependenciesHeader(n) ? "dependencies" : "content";
    return { headerText, kind, headerLine, endLine: k + 1 < starts.length ? starts[k + 1] : lines.length };
  });
  return { lines, titleLine, title, blocks };
}
function blockBody(layout, block) {
  return layout.lines.slice(block.headerLine + 1, block.endLine).join("\n");
}
var METADATA_LABELS = {
  subtitulo: "subtitle",
  disciplina: "disciplineName",
  tema: "themeName",
  autor: "author",
  "tempo estimado de leitura": "estimatedReadTimeMinutes"
};
function extractMetadata(text) {
  const beforeFirstH3 = text.split(/\r\n|\n/);
  const out = {};
  for (const line of beforeFirstH3) {
    if (/^###\s+/.test(line.trim())) break;
    const m = line.trim().match(/^\*\*([^*:]+):\*\*\s*(.*)$/);
    if (!m) continue;
    const label = normalize(m[1]);
    const field = METADATA_LABELS[label];
    if (!field) continue;
    const value = m[2].trim();
    if (field === "estimatedReadTimeMinutes") {
      const num = parseInt(value, 10);
      out.estimatedReadTimeMinutes = Number.isFinite(num) ? num : void 0;
    } else {
      out[field] = value;
    }
  }
  return out;
}
function blankLines(lines, start, end) {
  for (let i = start; i < end && i < lines.length; i++) lines[i] = "";
}
var TAKEAWAYS_LABEL = /^\*\*Pontos-?Chave:?\*\*\s*$/i;
var PEARL_LABEL = /^\*\*P[eé]rola Cl[ií]nica:?\*\*\s*(.*)$/i;
var ALERT_LABEL = /^\*\*Alerta(?: de Armadilha)?:?\*\*\s*(.*)$/i;
function blockquoteLabelText(line) {
  return line.trim().replace(/^>\s?/, "").replace(/^[^\w*]*/u, "");
}
function extractSectionParts(rawBody) {
  const lines = rawBody.split(/\r\n|\n/);
  let mechanismTag;
  let clinicalPearl;
  let warningAlert;
  const keyTakeaways = [];
  lines.forEach((line, i2) => {
    if (/^(---+|\*\*\*+)$/.test(line.trim())) lines[i2] = "";
  });
  lines.forEach((line, i2) => {
    const m = line.trim().match(/^\*\*Tag de Mecanismo:?\*\*\s*(.*)$/i);
    if (m && !mechanismTag) {
      mechanismTag = m[1].trim() || void 0;
      lines[i2] = "";
    }
  });
  const takeawaysLabelIdx = lines.findIndex((l) => TAKEAWAYS_LABEL.test(l.trim()));
  if (takeawaysLabelIdx !== -1) {
    let end = takeawaysLabelIdx + 1;
    while (end < lines.length) {
      const trimmed = lines[end].trim();
      if (trimmed === "") {
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
  let i = 0;
  while (i < lines.length) {
    if (!/^>\s?/.test(lines[i].trim())) {
      i++;
      continue;
    }
    const start = i;
    let j = i + 1;
    while (j < lines.length && /^>\s?/.test(lines[j].trim())) {
      const nextStripped = blockquoteLabelText(lines[j]);
      if (/^\*\*(P[eé]rola|Alerta)/i.test(nextStripped)) break;
      j++;
    }
    const joined = lines.slice(start, j).map((l) => l.trim().replace(/^>\s?/, "")).join(" ").trim();
    const label = joined.replace(/^[^\w*]*/u, "");
    const pearlMatch = label.match(PEARL_LABEL);
    const alertMatch = label.match(ALERT_LABEL);
    if (pearlMatch) {
      clinicalPearl = pearlMatch[1].trim() || void 0;
      blankLines(lines, start, j);
    } else if (alertMatch) {
      warningAlert = alertMatch[1].trim() || void 0;
      blankLines(lines, start, j);
    }
    i = j;
  }
  return { contentLines: lines, keyTakeaways, mechanismTag, clinicalPearl, warningAlert };
}
function parseSectionBody(rawBody) {
  const { contentLines, ...parts } = extractSectionParts(rawBody);
  const content = contentLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { content, ...parts };
}
function extractNumberedList(body) {
  const lines = body.split(/\r\n|\n/);
  const items = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^\d+\.\s+(.*)$/);
    if (m) {
      items.push(m[1].trim());
    } else if (items.length > 0) {
      items[items.length - 1] += " " + trimmed;
    }
  }
  return items;
}
function extractBacktickTags(body) {
  const matches = body.match(/`([^`\n]+)`/g) ?? [];
  return matches.map((m) => m.slice(1, -1).trim()).filter(Boolean);
}
function isReferencesHeader(headerNorm) {
  return headerNorm.includes("referencia");
}
function isTagsHeader(headerNorm) {
  return headerNorm === "tags" || /^palavras[\s-]?chave$/.test(headerNorm);
}
function isDependenciesHeader(headerNorm) {
  return headerNorm.includes("conexao") || headerNorm.includes("pre-requisito") || headerNorm.includes("pre requisito");
}
var SECTION_NUMBER_PREFIX = /^se[cç][aã]o\s*\d+\s*[—\-:]\s*/i;
function parseCompendiumMarkdownText(text, disciplines, themes, existingCompendiums) {
  const layout = readMarkdownLayout(text);
  const { title } = layout;
  const metadata = extractMetadata(layout.lines.slice(layout.titleLine + 1).join("\n"));
  const sections = [];
  let references = [];
  let tags = [];
  for (const block of layout.blocks) {
    const body = blockBody(layout, block);
    if (block.kind === "references") {
      references = extractNumberedList(body);
    } else if (block.kind === "tags") {
      tags = extractBacktickTags(body);
    } else if (block.kind === "dependencies") {
      continue;
    } else {
      const sectionTitle = block.headerText.replace(SECTION_NUMBER_PREFIX, "").trim();
      const parsed = parseSectionBody(body);
      sections.push({ title: sectionTitle, ...parsed });
    }
  }
  const data = {
    title,
    subtitle: metadata.subtitle,
    disciplineName: metadata.disciplineName,
    themeName: metadata.themeName,
    author: metadata.author,
    estimatedReadTimeMinutes: metadata.estimatedReadTimeMinutes,
    tags,
    sections,
    references
  };
  return buildCompendiumImportResult(data, disciplines, themes, existingCompendiums);
}

// src/utils/figuraDoMaterial.ts
var FIGURA_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
var FIGURA_PENDENTE = "PENDENTE";
var LINHA_DA_IMAGEM = /^!\[([^\]]*)\]\((.*)\)\s*$/;
var ROTULO_DA_FONTE = /^(?:\*\*)?Fonte:(?:\*\*)?\s*(.*)$/i;
var ROTULO_DO_MOSTRAR = /^(?:\*\*)?Mostrar:(?:\*\*)?\s*(.*)$/i;
function eLinhaDeFigura(linha) {
  return LINHA_DA_IMAGEM.test(linha.trim());
}
function destinoDaFigura(bruto) {
  if (bruto === `figura:${FIGURA_PENDENTE}`) return { tipo: "pendente" };
  const m = bruto.match(/^figura:(.+)$/);
  if (m && FIGURA_ID.test(m[1])) return { tipo: "figura", id: m[1] };
  return { tipo: "invalido", bruto };
}
function lerFigura(linhas) {
  if (linhas.length === 0) return null;
  const abertura = linhas[0].trim().match(LINHA_DA_IMAGEM);
  if (!abertura) return null;
  const legendaLinhas = [];
  let fonte = "";
  let mostrar = "";
  let temFonte = false;
  let lidas = 1;
  for (let k = 1; k < linhas.length; k++) {
    const linha = linhas[k].trim();
    if (linha === "") break;
    const rotuloMostrar = linha.match(ROTULO_DO_MOSTRAR);
    if (temFonte && !rotuloMostrar) break;
    if (rotuloMostrar) {
      mostrar = rotuloMostrar[1].trim();
      lidas = k + 1;
      break;
    }
    const rotuloFonte = linha.match(ROTULO_DA_FONTE);
    if (rotuloFonte) {
      fonte = rotuloFonte[1].trim();
      temFonte = true;
    } else {
      legendaLinhas.push(linha);
    }
    lidas = k + 1;
  }
  return {
    alt: abertura[1].trim(),
    destino: destinoDaFigura(abertura[2]),
    legenda: legendaLinhas.join(" ").trim(),
    fonte,
    mostrar,
    linhas: lidas
  };
}
var LIMITE_DA_IMAGEM_BYTES = 10 * 1024 * 1024;

// src/utils/markdownBlocks.ts
function normalizeBlockBoundaries(content) {
  const lines = content.split(/\r\n|\n/);
  const isHeadingLine = (l) => /^#{1,4}\s+\S/.test(l.trim());
  const isTableRowLine = (l) => /^\|.*\|\s*$/.test(l.trim());
  const isListMarkerLine = (l) => /^\s*([-*•]|\d+\.)\s+\S/.test(l);
  const isBlockquoteLine = (l) => /^>/.test(l.trim());
  const isFigureLine = (l) => eLinhaDeFigura(l);
  const isFigureSourceLine = (l) => /^(\*\*)?Fonte:/i.test(l.trim());
  const isFigureShowLine = (l) => /^(\*\*)?Mostrar:/i.test(l.trim());
  const out = [];
  let inList = false;
  let inFigure = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isBlank = line.trim() === "";
    if (isBlank) {
      inList = false;
      inFigure = false;
      out.push(line);
      continue;
    }
    const prev = out.length > 0 ? out[out.length - 1] : void 0;
    const prevIsBlank = prev === void 0 || prev.trim() === "";
    const prevIsTableRow = prev !== void 0 && isTableRowLine(prev);
    const prevIsBlockquote = prev !== void 0 && isBlockquoteLine(prev);
    const startsHeading = isHeadingLine(line) && !prevIsBlank;
    const startsTable = isTableRowLine(line) && !prevIsTableRow && !prevIsBlank;
    const startsList = isListMarkerLine(line) && !inList && !prevIsBlank;
    const startsBlockquote = isBlockquoteLine(line) && !prevIsBlockquote && !prevIsBlank;
    const startsFigure = isFigureLine(line) && !prevIsBlank;
    if (startsHeading || startsTable || startsList || startsBlockquote || startsFigure) out.push("");
    if (isFigureLine(line)) inFigure = true;
    if (isHeadingLine(line) || isTableRowLine(line)) inList = false;
    if (isListMarkerLine(line)) inList = true;
    out.push(line);
    const next = lines[i + 1];
    if (isHeadingLine(line) && next !== void 0 && next.trim() !== "" && !isHeadingLine(next)) {
      out.push("");
    }
    if (inFigure && next !== void 0 && next.trim() !== "") {
      if (isFigureShowLine(line) || isFigureSourceLine(line) && !isFigureShowLine(next)) {
        out.push("");
        inFigure = false;
      }
    }
    if (isTableRowLine(line) && next !== void 0 && next.trim() !== "" && !isTableRowLine(next)) {
      out.push("");
    }
    if (isBlockquoteLine(line) && next !== void 0 && next.trim() !== "" && !isBlockquoteLine(next)) {
      out.push("");
    }
  }
  return out.join("\n");
}
var TABLE_CITATION_PATTERN = /\[(\d+)\]\((#ref-\d+)\)/g;
function extractTableCitations(prevBlock) {
  if (!prevBlock) return [];
  const trimmed = prevBlock.trim();
  if (!trimmed || /^[#|>]/.test(trimmed) || /^\s*([-*•]|\d+\.)\s+/.test(trimmed)) return [];
  const citations = [];
  const seen = /* @__PURE__ */ new Set();
  for (const match of trimmed.matchAll(TABLE_CITATION_PATTERN)) {
    if (seen.has(match[1])) continue;
    seen.add(match[1]);
    citations.push({ num: match[1], href: match[2] });
  }
  return citations;
}
function splitReaderBlocks(content) {
  return normalizeBlockBoundaries(content).split(/\n\n+/);
}

// src/utils/compendiumStandardCheck.ts
var CABECALHO = "Cabeçalho";
var CITACAO_VALIDA = /\[(\d+)\]\(#ref-(\d+)\)/g;
function lerArquivoDeMaterial(texto) {
  const layout = readMarkdownLayout(texto);
  const { lines: linhas, blocks: blocos } = layout;
  const inicioDasSecoes = blocos.length > 0 ? blocos[0].headerLine : linhas.length;
  const secaoDaLinha = linhas.map(() => CABECALHO);
  for (const b of blocos) for (let i = b.headerLine; i < b.endLine; i++) secaoDaLinha[i] = b.headerText;
  const secoes = blocos.filter((b) => b.kind === "content").map((bloco) => {
    const inicio = bloco.headerLine + 1;
    const { contentLines } = extractSectionParts(blockBody(layout, bloco));
    return {
      bloco,
      linhas: linhas.slice(inicio, bloco.endLine).map((linha, k) => ({ i: inicio + k, linha })),
      conteudo: contentLines.map((linha, k) => ({ i: inicio + k, linha }))
    };
  });
  const ultimo = (kind) => blocos.filter((b) => b.kind === kind).pop();
  const blocoDeReferencias = ultimo("references");
  const blocoDePalavrasChave = ultimo("tags");
  const referencias = blocoDeReferencias ? extractNumberedList(blockBody(layout, blocoDeReferencias)) : [];
  const citadas = /* @__PURE__ */ new Set();
  for (const s of secoes) for (const { linha } of s.linhas) for (const m of linha.matchAll(CITACAO_VALIDA)) citadas.add(Number(m[1]));
  return {
    linhas,
    linhaDoTitulo: layout.titleLine,
    titulo: layout.title,
    inicioDasSecoes,
    blocos,
    secoes,
    secaoDaLinha,
    blocoDeReferencias,
    blocoDePalavrasChave,
    referencias,
    citadas
  };
}
function trecho(s, max = 60) {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
var LISTA = /^\s*([-*•]|\d+\.)\s+\S/;
function pendencia(arq, regra, i, mensagem) {
  return { regra, secao: arq.secaoDaLinha[i] ?? CABECALHO, linha: i + 1, mensagem };
}
function* linhasDasSecoes(arq) {
  for (const s of arq.secoes) yield* s.linhas;
}
var COLCHETE_NUMERICO = /\[(\d+(?:\s*,\s*\d+)*)\](\([^)\]]*[)\]])?/g;
var ANTES_DE_INTERVALO = /\b(intervalo|faixa|entre|escala|de)\s*$/;
function pareceCitacao(numeros, antes) {
  const ns = numeros.split(",").map((n) => Number(n.trim()));
  if (ns.some((n) => n < 1)) return false;
  if (ns.some((n, k) => k > 0 && n <= ns[k - 1])) return false;
  return !ANTES_DE_INTERVALO.test(normalize(antes));
}
var citacaoMalformada = {
  id: "citacao-malformada",
  descricao: "Citação fora do formato [N](#ref-N)",
  verificar(arq) {
    const out = [];
    for (const { i, linha } of linhasDasSecoes(arq)) {
      const problemas = [];
      const resto = linha.replace(CITACAO_VALIDA, (m, n, alvo) => {
        if (n !== alvo) problemas.push(`"${m}" (o número e o #ref- não batem)`);
        return " ";
      });
      const semColchetes = resto.replace(COLCHETE_NUMERICO, (m, numeros, link, pos) => {
        if (link === void 0 && !pareceCitacao(numeros, resto.slice(0, pos))) return m;
        problemas.push(`"${m}"`);
        return " ";
      });
      for (const m of semColchetes.matchAll(/\(#?ref-\d+[\])]?/g)) problemas.push(`"${m[0]}"`);
      if (problemas.length > 0) {
        out.push(
          pendencia(
            arq,
            "citacao-malformada",
            i,
            `Citação malformada: ${problemas.join(", ")}. Escreva cada citação como [N](#ref-N), com N na posição da referência na lista.`
          )
        );
      }
    }
    return out;
  }
};
var citacaoSemReferencia = {
  id: "citacao-sem-referencia",
  descricao: "Citação para referência que não existe na lista",
  verificar(arq) {
    const total = arq.referencias.length;
    const out = [];
    for (const { i, linha } of linhasDasSecoes(arq)) {
      const fora = /* @__PURE__ */ new Set();
      for (const m of linha.matchAll(CITACAO_VALIDA)) {
        for (const n of [Number(m[1]), Number(m[2])]) if (n < 1 || n > total) fora.add(n);
      }
      if (fora.size > 0) {
        const nums = [...fora].sort((a, b) => a - b).join(", ");
        out.push(
          pendencia(
            arq,
            "citacao-sem-referencia",
            i,
            `Citação para referência inexistente (${nums}): a lista tem ${total} referência${total === 1 ? "" : "s"}. Corrija o número ou inclua a referência.`
          )
        );
      }
    }
    return out;
  }
};
var referenciaNaoCitada = {
  id: "referencia-nao-citada",
  descricao: "Referência da lista nunca citada no texto",
  verificar(arq) {
    const bloco = arq.blocoDeReferencias;
    if (!bloco) return [];
    const linhasDosItens = [];
    for (let i = bloco.headerLine + 1; i < bloco.endLine; i++) {
      if (/^\d+\.\s+/.test(arq.linhas[i].trim())) linhasDosItens.push(i);
    }
    return linhasDosItens.map((i, k) => ({ i, n: k + 1 })).filter(({ n }) => !arq.citadas.has(n)).map(
      ({ i, n }) => pendencia(arq, "referencia-nao-citada", i, `A referência ${n} nunca é citada no texto. Cite-a onde ela sustenta uma afirmação, ou retire-a da lista.`)
    );
  }
};
var tabelaSemAberturaCitada = {
  id: "tabela-sem-abertura-citada",
  descricao: "Tabela sem frase de abertura citada logo acima",
  verificar(arq) {
    const out = [];
    for (const secao of arq.secoes) {
      const blocos = splitReaderBlocks(secao.conteudo.map((c) => c.linha).join("\n"));
      let cursor = 0;
      blocos.forEach((bloco, k) => {
        const primeira = bloco.split("\n").find((l) => l.trim() !== "")?.trim();
        if (primeira === void 0) return;
        const achada = secao.conteudo.findIndex((c, idx) => idx >= cursor && c.linha.trim() === primeira);
        if (achada !== -1) cursor = achada + 1;
        if (!primeira.startsWith("|")) return;
        if (extractTableCitations(blocos[k - 1]).length > 0) return;
        const i = achada === -1 ? secao.bloco.headerLine : secao.conteudo[achada].i;
        out.push(
          pendencia(
            arq,
            "tabela-sem-abertura-citada",
            i,
            'Tabela sem frase de abertura citada: escreva, logo acima dela, uma frase que a apresente terminada pela citação [N](#ref-N), seguida de linha em branco — é ela que vira a legenda "Fonte" da tabela.'
          )
        );
      });
    }
    return out;
  }
};
var latex = {
  id: "latex",
  descricao: "LaTeX no texto",
  verificar(arq) {
    const out = [];
    for (let i = 0; i < arq.linhas.length; i++) {
      const linha = arq.linhas[i].replace(/(R|US)\$(?=\s?\d)/g, "$1");
      const trechos = [
        ...[...linha.matchAll(/\$\$?[^$\n]+?\$\$?/g)].map((m) => m[0]),
        ...[...linha.replace(/\$\$?[^$\n]+?\$\$?/g, " ").matchAll(/\\[a-zA-Z]+/g)].map((m) => m[0])
      ];
      if (trechos.length === 0) continue;
      const lista = trechos.slice(0, 3).map((t) => `"${trecho(t, 40)}"`).join(", ");
      const mais = trechos.length > 3 ? ` e mais ${trechos.length - 3}` : "";
      out.push(
        pendencia(arq, "latex", i, `LaTeX aparece literal na tela: ${lista}${mais}. Escreva em texto e Unicode (β, ≥, ≤, ×, Cmáx/CIM).`)
      );
    }
    return out;
  }
};
var comparadorAscii = {
  id: "comparador-ascii",
  descricao: "Uso de <= ou >=",
  verificar(arq) {
    const out = [];
    arq.linhas.forEach((linha, i) => {
      const semSetas = linha.replace(/<=+>|<==+|==+>/g, " ");
      if (/<=|>=/.test(semSetas)) {
        out.push(pendencia(arq, "comparador-ascii", i, 'Troque "<=" por "≤" e ">=" por "≥".'));
      }
    });
    return out;
  }
};
var listaAninhada = {
  id: "lista-aninhada",
  descricao: "Lista dentro de lista",
  verificar(arq) {
    const out = [];
    const recuo = (l) => (l.match(/^\s*/)?.[0] ?? "").replace(/\t/g, "    ").length;
    for (const secao of arq.secoes) {
      let anteriorELista = false;
      let recuoDoItem = 0;
      for (const { i, linha } of secao.linhas) {
        if (linha.trim() === "") continue;
        const eItem = LISTA.test(linha);
        const aninhado = eItem && anteriorELista && recuo(linha) >= recuoDoItem + 2;
        if (aninhado) {
          out.push(
            pendencia(
              arq,
              "lista-aninhada",
              i,
              "Lista dentro de lista: o leitor não tem recuo de nível. Reescreva como itens do mesmo nível ou como frases dentro do item."
            )
          );
        }
        if (eItem && !aninhado) recuoDoItem = recuo(linha);
        anteriorELista = eItem || anteriorELista && /^\s+\S/.test(linha);
      }
    }
    return out;
  }
};
var subtituloInvalido = {
  id: "subtitulo-invalido",
  descricao: "Subtítulo que não é #### dentro da seção",
  verificar(arq) {
    const out = [];
    arq.linhas.forEach((linha, i) => {
      if (i === arq.linhaDoTitulo) return;
      const m = linha.trim().match(/^(#{1,2}|#{5,})\s+\S/);
      if (!m) return;
      out.push(
        pendencia(
          arq,
          "subtitulo-invalido",
          i,
          `Subtítulo com ${m[1].length} "#": dentro de uma seção, subtítulo é sempre "####" (e "###" abre uma seção nova).`
        )
      );
    });
    return out;
  }
};
var ROTULOS_DE_METADADO = /* @__PURE__ */ new Set([...Object.keys(METADATA_LABELS), "versao do padrao"]);
var textoForaDeSecao = {
  id: "texto-fora-de-secao",
  descricao: "Texto antes do título ou entre os metadados e a primeira seção",
  verificar(arq) {
    const out = [];
    for (let i = 0; i < arq.inicioDasSecoes; i++) {
      if (i === arq.linhaDoTitulo) continue;
      const t = arq.linhas[i].trim();
      if (t === "" || /^(---+|\*\*\*+)$/.test(t)) continue;
      const m = t.match(/^\*\*([^*:]+):\*\*\s*(.*)$/);
      if (i > arq.linhaDoTitulo && m && ROTULOS_DE_METADADO.has(normalize(m[1]))) continue;
      const onde = i < arq.linhaDoTitulo ? "antes do título" : "entre os metadados e a primeira seção";
      const motivo = m && i > arq.linhaDoTitulo ? ` (o rótulo "${m[1]}" não é um metadado do padrão)` : "";
      out.push(
        pendencia(arq, "texto-fora-de-secao", i, `Texto ${onde}${motivo}: a importação descarta tudo aí. Leve o texto para dentro de uma seção ou apague-o.`)
      );
    }
    return out;
  }
};
var blocoRepetido = {
  id: "bloco-repetido",
  descricao: "Mais de um bloco de Pontos-Chave, Pérola ou Alerta na mesma seção",
  verificar(arq) {
    const out = [];
    const tipos = [
      {
        nome: "Pontos-Chave",
        teste: (t) => TAKEAWAYS_LABEL.test(t),
        efeito: () => "a importação guarda só o primeiro; este fica no texto como rótulo solto seguido de lista comum"
      },
      {
        nome: "Pérola Clínica",
        teste: (t) => t.startsWith(">") && PEARL_LABEL.test(blockquoteLabelText(t)),
        efeito: (primeira) => `a importação guarda só o último e o da linha ${primeira} se perde`
      },
      {
        nome: "Alerta de Armadilha",
        teste: (t) => t.startsWith(">") && ALERT_LABEL.test(blockquoteLabelText(t)),
        efeito: (primeira) => `a importação guarda só o último e o da linha ${primeira} se perde`
      }
    ];
    for (const secao of arq.secoes) {
      for (const { nome, teste, efeito } of tipos) {
        let primeira = -1;
        for (const { i, linha } of secao.linhas) {
          if (!teste(linha.trim())) continue;
          if (primeira === -1) {
            primeira = i;
            continue;
          }
          out.push(pendencia(arq, "bloco-repetido", i, `Mais de um bloco de ${nome} na mesma seção: ${efeito(primeira + 1)}. Junte-os num só.`));
        }
      }
    }
    return out;
  }
};
function linhaDoMetadado(arq, rotuloNormalizado) {
  for (let i = arq.linhaDoTitulo + 1; i < arq.inicioDasSecoes; i++) {
    const m = arq.linhas[i].trim().match(/^\*\*([^*:]+):\*\*\s*(.*)$/);
    if (m && normalize(m[1]) === rotuloNormalizado) return i;
  }
  return -1;
}
function fimDoCabecalho(arq) {
  let ultima = Math.max(arq.linhaDoTitulo, 0);
  for (let i = arq.linhaDoTitulo + 1; i < arq.inicioDasSecoes; i++) {
    if (/^\*\*[^*:]+:\*\*/.test(arq.linhas[i].trim())) ultima = i;
  }
  return ultima;
}
function metadados(arq) {
  return extractMetadata(arq.linhas.slice(arq.linhaDoTitulo + 1, arq.inicioDasSecoes).join("\n"));
}
var itemObrigatorioAusente = {
  id: "item-obrigatorio-ausente",
  descricao: "Sem subtítulo, sem referências ou sem nenhuma citação",
  verificar(arq) {
    const out = [];
    const { subtitle } = metadados(arq);
    if (typeof subtitle !== "string" || subtitle.trim() === "") {
      out.push(
        pendencia(arq, "item-obrigatorio-ausente", fimDoCabecalho(arq), 'Falta o subtítulo: escreva "**Subtítulo:** uma frase que resume o material" logo abaixo do título.')
      );
    }
    if (arq.referencias.length === 0) {
      const bloco = arq.blocoDeReferencias;
      out.push(
        pendencia(
          arq,
          "item-obrigatorio-ausente",
          bloco ? bloco.headerLine : arq.linhas.length - 1,
          bloco ? 'O bloco de referências não tem nenhuma referência numerada ("1. ...").' : 'Falta o bloco "### Referências Bibliográficas", com uma referência por item numerado.'
        )
      );
    }
    if (arq.citadas.size === 0 && arq.secoes.length > 0) {
      out.push(
        pendencia(
          arq,
          "item-obrigatorio-ausente",
          arq.secoes[0].bloco.headerLine,
          "Nenhuma citação no texto: toda afirmação de peso clínico leva [N](#ref-N), com N na posição da referência na lista."
        )
      );
    }
    return out;
  }
};
var VERSAO_ATUAL_DO_PADRAO = 3;
var versaoAusente = {
  id: "versao-do-padrao-ausente",
  descricao: `Linha de versão do padrão ausente ou diferente de ${VERSAO_ATUAL_DO_PADRAO}`,
  verificar(arq) {
    const i = linhaDoMetadado(arq, "versao do padrao");
    if (i === -1) {
      return [
        pendencia(
          arq,
          "versao-do-padrao-ausente",
          fimDoCabecalho(arq),
          `Falta a linha "**Versão do padrão:** ${VERSAO_ATUAL_DO_PADRAO}" nos metadados, logo abaixo do título.`
        )
      ];
    }
    const valor = arq.linhas[i].trim().replace(/^\*\*[^*:]+:\*\*\s*/, "");
    if (valor === String(VERSAO_ATUAL_DO_PADRAO)) return [];
    return [
      pendencia(
        arq,
        "versao-do-padrao-ausente",
        i,
        `Versão do padrão "${trecho(valor, 20)}": o valor é sempre ${VERSAO_ATUAL_DO_PADRAO}. Escreva "**Versão do padrão:** ${VERSAO_ATUAL_DO_PADRAO}".`
      )
    ];
  }
};
var TEMPO_MAXIMO_DE_LEITURA = 60;
var tempoForaDaFaixa = {
  id: "tempo-fora-da-faixa",
  descricao: "Tempo de leitura fora de 8–60 minutos",
  verificar(arq) {
    const minutos = metadados(arq).estimatedReadTimeMinutes;
    const i = linhaDoMetadado(arq, "tempo estimado de leitura");
    if (typeof minutos === "number" && minutos >= 8 && minutos <= TEMPO_MAXIMO_DE_LEITURA) return [];
    const mensagem = typeof minutos === "number" ? `Tempo de leitura de ${minutos} minutos, fora da faixa de 8 a ${TEMPO_MAXIMO_DE_LEITURA}: abaixo, o assunto cabe no material de cima; acima, o material deve ser dividido.` : `Tempo de leitura ausente ou sem número: escreva "**Tempo estimado de leitura:** N minutos", com N entre 8 e ${TEMPO_MAXIMO_DE_LEITURA}.`;
    return [pendencia(arq, "tempo-fora-da-faixa", i === -1 ? fimDoCabecalho(arq) : i, mensagem)];
  }
};
var semPalavrasChave = {
  id: "sem-palavras-chave",
  descricao: "Sem palavras-chave",
  verificar(arq) {
    const bloco = arq.blocoDePalavrasChave;
    const tags = bloco ? extractBacktickTags(arq.linhas.slice(bloco.headerLine + 1, bloco.endLine).join("\n")) : [];
    if (tags.length > 0) return [];
    return [
      pendencia(
        arq,
        "sem-palavras-chave",
        bloco ? bloco.headerLine : fimDoCabecalho(arq),
        bloco ? 'O bloco "### Palavras-chave" não tem nenhuma palavra-chave entre crases (`assim`).' : 'Falta o bloco "### Palavras-chave", com sinônimos, siglas e nomes comerciais entre crases.'
      )
    ];
  }
};
var NUMERACAO_EXPLICITA = [
  /^\d+[.)]\s/,
  /(?:^|\s)([Mm][oó]dulo|[Pp]arte|[Aa]ula|[Cc]ap[ií]tulo|[Uu]nidade|[Vv]olume)\s+(\d+|[IVXL]+)(?=\s*(?:$|[:—–-]))/
];
var ROMANO_ANTES_DE_SEPARADOR = /(\S+)\s+([IVX]{1,4})\s*[:—–]/;
var FAZEM_PARTE_DO_NOME = /* @__PURE__ */ new Set([
  "tipo",
  "tipos",
  "classe",
  "classes",
  "grau",
  "graus",
  "fase",
  "fases",
  "estagio",
  "estadio",
  "grupo",
  "geracao",
  "nivel",
  "fator",
  "complexo",
  "tabela",
  "nyha",
  "mobitz",
  "craniano",
  "cranianos",
  "nervo",
  "par",
  "via",
  "e",
  "a",
  "ou",
  "ate",
  "ao",
  "o",
  "do",
  "no",
  "raio",
  "raios",
  "cromossomo",
  "ligada",
  "ligado"
]);
function tituloTemNumeracao(titulo) {
  if (NUMERACAO_EXPLICITA.some((re) => re.test(titulo))) return true;
  const m = titulo.match(ROMANO_ANTES_DE_SEPARADOR);
  return m !== null && !FAZEM_PARTE_DO_NOME.has(normalize(m[1]));
}
var tituloNumerado = {
  id: "titulo-numerado",
  descricao: "Título com numeração",
  verificar(arq) {
    if (arq.linhaDoTitulo === -1) return [];
    if (!tituloTemNumeracao(arq.titulo)) return [];
    return [
      pendencia(
        arq,
        "titulo-numerado",
        arq.linhaDoTitulo,
        `Título com numeração ("${trecho(arq.titulo)}"): a ordem entre materiais é dada pela plataforma. Tire o número do título.`
      )
    ];
  }
};
var REMISSOES = [
  /\bvej[ae]\s+(o|a|os|as)\s+(material|materiais|modulo|aula|capitulo|pagina)/,
  /\bver\s+(o\s+)?(material|modulo|capitulo)\b/,
  /\b(proxim[oa]s?|anterior(es)?)\s+(material|materiais|modulos?|aulas?|capitulos?|paginas?)\b/,
  /\b(material|materiais|modulos?|aulas?|capitulos?|paginas?)\s+anterior(es)?\b/,
  /\bcomo\s+(ja\s+)?vimos\s+(n[oa]s?|em)\s+(outr[oa]s?\s+)?(material|materiais|modulos?|aulas?|capitulos?)\b/
];
var remissao = {
  id: "remissao-a-outro-material",
  descricao: "Texto que remete a outro material",
  verificar(arq) {
    const out = [];
    for (const { i, linha } of linhasDasSecoes(arq)) {
      const n = normalize(linha);
      const achado = REMISSOES.map((re) => n.match(re)).find(Boolean);
      if (!achado) continue;
      out.push(
        pendencia(
          arq,
          "remissao-a-outro-material",
          i,
          `Remissão a outro material ("${achado[0]}"): quem liga os materiais é a plataforma. Mencione o assunto sem remeter a página, material ou módulo.`
        )
      );
    }
    return out;
  }
};
function* figurasDoConteudo(arq) {
  for (const secao of arq.secoes) {
    const linhas = secao.conteudo;
    for (let k = 0; k < linhas.length; k++) {
      if (!eLinhaDeFigura(linhas[k].linha)) continue;
      const resto = [];
      for (let j = k; j < linhas.length && (j === k || linhas[j].linha.trim() !== ""); j++) resto.push(linhas[j].linha);
      yield { i: linhas[k].i, linhas: resto };
    }
  }
}
var figuraIncompleta = {
  id: "figura-incompleta",
  descricao: "Figura sem legenda, sem fonte ou sem texto alternativo",
  verificar(arq) {
    const out = [];
    for (const { i, linhas } of figurasDoConteudo(arq)) {
      const figura = lerFigura(linhas);
      if (!figura) continue;
      const faltas = [
        figura.alt === "" ? "o texto alternativo, entre os colchetes da primeira linha" : null,
        figura.legenda === "" ? "a legenda (**Figura N.** frase que diz o que a figura mostra)" : null,
        figura.fonte === "" ? 'a linha "Fonte: autor ou entidade, título, ano"' : null
      ].filter((f) => f !== null);
      if (faltas.length > 0) {
        out.push(pendencia(arq, "figura-incompleta", i, `Figura incompleta: falta ${faltas.join("; falta ")}. Toda figura leva texto alternativo, legenda e fonte.`));
      }
    }
    return out;
  }
};
var figuraPendente = {
  id: "figura-pendente",
  descricao: "Figura marcada como pendente (a imagem ainda não foi enviada)",
  verificar(arq) {
    const out = [];
    for (const { i, linhas } of figurasDoConteudo(arq)) {
      const figura = lerFigura(linhas);
      if (!figura) continue;
      if (figura.destino.tipo === "pendente") {
        out.push(
          pendencia(
            arq,
            "figura-pendente",
            i,
            'Figura pendente: a imagem ainda não foi enviada. Envie a imagem pelo botão "Enviar imagem" e troque este bloco pelo trecho que ele devolve (ou troque "figura:PENDENTE" pelo identificador e apague a linha "Mostrar:").'
          )
        );
      } else if (figura.mostrar !== "") {
        out.push(pendencia(arq, "figura-pendente", i, 'A linha "Mostrar:" é só uma instrução para quem insere a imagem: apague-a do bloco da figura.'));
      }
    }
    return out;
  }
};
var figuraForaDoSite = {
  id: "figura-fora-do-site",
  descricao: "Figura que não aponta para uma imagem enviada ao site",
  verificar(arq) {
    const out = [];
    for (const { i, linhas } of figurasDoConteudo(arq)) {
      const figura = lerFigura(linhas);
      if (!figura || figura.destino.tipo !== "invalido") continue;
      out.push(
        pendencia(
          arq,
          "figura-fora-do-site",
          i,
          `A imagem aponta para "${trecho(figura.destino.bruto, 50)}", que não é uma imagem enviada ao site: o leitor não a mostra. Envie a imagem pelo botão "Enviar imagem" e use o destino "figura:<identificador>" que ele devolve (endereço de outro site, caminho de arquivo e "data:" não valem).`
        )
      );
    }
    return out;
  }
};
var IMAGEM_MARKDOWN = /!\[[^\]]*\]\(/;
var imagemForaDoFormato = {
  id: "imagem-fora-do-formato",
  descricao: "Imagem escrita fora do bloco de figura",
  verificar(arq) {
    const out = [];
    const inicios = /* @__PURE__ */ new Set();
    for (const { i } of figurasDoConteudo(arq)) inicios.add(i);
    for (const { i, linha } of linhasDasSecoes(arq)) {
      if (!IMAGEM_MARKDOWN.test(linha) || inicios.has(i)) continue;
      out.push(
        pendencia(
          arq,
          "imagem-fora-do-formato",
          i,
          'Imagem fora do formato de figura: ela só aparece num bloco próprio, com a imagem sozinha na primeira linha, a legenda e a linha "Fonte:" logo abaixo, e linha em branco antes e depois.'
        )
      );
    }
    return out;
  }
};
var ETIQUETA_HTML = /<\/?(?:img|script|style|iframe|object|embed|svg|a|div|span|br|hr|p|b|i|u|em|strong|sup|sub|font|center|table|thead|tbody|tr|td|th|ul|ol|li|h[1-6]|link|meta|form|input|button|video|audio|source|details|summary)(?:\s+[a-z][\w:-]*\s*=[^<>]*)?\s*\/?>/i;
var htmlNoTexto = {
  id: "html-no-texto",
  descricao: "HTML cru no texto",
  verificar(arq) {
    const out = [];
    for (const { i, linha } of linhasDasSecoes(arq)) {
      const m = linha.match(ETIQUETA_HTML);
      if (!m) continue;
      out.push(pendencia(arq, "html-no-texto", i, `HTML no texto ("${trecho(m[0], 40)}"): o leitor não o interpreta. Use só o Markdown do padrão.`));
    }
    return out;
  }
};
var ROTULO_DA_ATUALIZACAO = /^\*\*Atualiza[cç][aã]o:?\*\*/i;
var DATA_OU_VERSAO = /\b(?:19|20)\d{2}\b|\bvers[aã]o\s*\d/i;
var atualizacaoSemData = {
  id: "atualizacao-sem-data",
  descricao: "Bloco Atualização sem ano ou versão",
  verificar(arq) {
    const out = [];
    for (const secao of arq.secoes) {
      const linhas = secao.conteudo;
      let k = 0;
      while (k < linhas.length) {
        if (!linhas[k].linha.trim().startsWith(">")) {
          k++;
          continue;
        }
        let fim = k + 1;
        while (fim < linhas.length && linhas[fim].linha.trim().startsWith(">") && !ROTULO_DA_ATUALIZACAO.test(blockquoteLabelText(linhas[fim].linha))) fim++;
        const texto = linhas.slice(k, fim).map((l) => blockquoteLabelText(l.linha)).join(" ");
        if (ROTULO_DA_ATUALIZACAO.test(texto) && !DATA_OU_VERSAO.test(texto)) {
          out.push(
            pendencia(
              arq,
              "atualizacao-sem-data",
              linhas[k].i,
              'Bloco Atualização sem data: diga o que mudou e desde quando, com o ano ou a versão no próprio bloco ("a partir de 2023", "na versão 2024"). Sem data, não é atualização.'
            )
          );
        }
        k = fim;
      }
    }
    return out;
  }
};
function eBibliografia(b) {
  const semNumero = b.headerText.replace(SECTION_NUMBER_PREFIX, "").replace(/^\d+[.)]\s*/, "");
  return /^referencias?\b/.test(normalize(semNumero));
}
var blocoDescartado = {
  id: "bloco-descartado",
  descricao: "Seção que a importação descarta (conexões, referências ou palavras-chave repetidas)",
  verificar(arq) {
    const out = [];
    const bibliografias = arq.blocos.filter((b) => b.kind === "references" && eBibliografia(b));
    const bibliografia = bibliografias[bibliografias.length - 1];
    for (const b of arq.blocos) {
      let motivo;
      if (b.kind === "dependencies") {
        motivo = 'o título tem "conexão" ou "pré-requisito", e a importação descarta essa seção inteira — o padrão não usa bloco de conexões';
      } else if (b.kind === "references" && !eBibliografia(b)) {
        const substitui = b === arq.blocoDeReferencias && bibliografia !== void 0;
        motivo = `o título tem "referência", e a importação a lê como lista de referências${substitui ? `, no lugar da bibliografia da linha ${bibliografia.headerLine + 1}` : ""}. Se for conteúdo, tire "referência" do título`;
      } else if (b.kind === "references" && b !== bibliografia) {
        motivo = "a importação guarda só a última lista de referências — esta se perde. Junte as listas numa só";
      } else if (b.kind === "tags" && b !== arq.blocoDePalavrasChave) {
        motivo = "a importação guarda só o último bloco de palavras-chave — este se perde. Junte-os num só";
      }
      if (motivo) out.push(pendencia(arq, "bloco-descartado", b.headerLine, `Seção "${trecho(b.headerText, 40)}" some na importação: ${motivo}.`));
    }
    return out;
  }
};
var REGRAS_DO_PADRAO = [
  blocoDescartado,
  itemObrigatorioAusente,
  textoForaDeSecao,
  versaoAusente,
  tempoForaDaFaixa,
  tituloNumerado,
  subtituloInvalido,
  citacaoMalformada,
  citacaoSemReferencia,
  referenciaNaoCitada,
  tabelaSemAberturaCitada,
  latex,
  comparadorAscii,
  listaAninhada,
  blocoRepetido,
  remissao,
  semPalavrasChave,
  figuraIncompleta,
  figuraPendente,
  figuraForaDoSite,
  imagemForaDoFormato,
  htmlNoTexto,
  atualizacaoSemData
];
function checarMaterialMarkdown(texto) {
  const importacao = parseCompendiumMarkdownText(texto, [], [], []);
  const errosDeImportacao = importacao.ok ? [] : importacao.errors;
  const arq = lerArquivoDeMaterial(texto);
  const pendencias = REGRAS_DO_PADRAO.flatMap((r) => r.verificar(arq)).sort((a, b) => a.linha - b.linha);
  return { errosDeImportacao, pendencias };
}

// src/utils/envioDeMaterial.ts
var LIMITE_TEXTO_BYTES = 307200;
var LIMITE_TITULO_CARACTERES = 300;
var LIMITE_LEITURA_DE_ARQUIVO_BYTES = LIMITE_TEXTO_BYTES * 4;
function tamanhoEmBytes(texto) {
  return new TextEncoder().encode(texto).length;
}
function tamanhoLegivel(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  return `${(bytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB`;
}
function avisoIgnorado(aviso) {
  return /^Autor$/i.test(aviso) || /^Disciplina ".*" não encontrada/.test(aviso) || /^Tema ".*" não encontrado/.test(aviso);
}
function lerArquivoParaEnvio(texto, disciplines, themes) {
  const checagem = checarMaterialMarkdown(texto);
  const importacao = parseCompendiumMarkdownText(texto, disciplines, themes, []);
  const preview = importacao.ok ? importacao.preview : null;
  return {
    texto,
    bytes: tamanhoEmBytes(texto),
    titulo: preview?.title ?? "",
    checagem,
    avisosDaImportacao: preview ? preview.missingFields.filter((a) => !avisoIgnorado(a)) : [],
    disciplinaDoArquivo: preview ? { nome: preview.disciplineName, id: preview.disciplineId } : null,
    temaDoArquivo: preview ? { nome: preview.themeName, id: preview.themeId } : null
  };
}
function avaliarEnvio(leitura, escolha, disciplines, themes) {
  const vazio = leitura.texto.trim().length === 0;
  const tamanhoExcedido = leitura.bytes > LIMITE_TEXTO_BYTES;
  const errosDeImportacao = vazio ? [] : leitura.checagem.errosDeImportacao;
  const pendencias = vazio ? [] : leitura.checagem.pendencias;
  const avisosDaImportacao = vazio ? [] : leitura.avisosDaImportacao;
  const tituloLongo = leitura.titulo.trim().length > LIMITE_TITULO_CARACTERES;
  const problemasDeCatalogo = [];
  if (!vazio) {
    const disciplinaEscolhida = disciplines.find((d) => d.id === escolha.disciplineId);
    const temaEscolhido = themes.find((t) => t.id === escolha.themeId && t.disciplineId === escolha.disciplineId);
    if (!disciplinaEscolhida) problemasDeCatalogo.push("Escolha a Disciplina do material.");
    else if (!temaEscolhido) problemasDeCatalogo.push("Escolha o Tema do material.");
    const { disciplinaDoArquivo, temaDoArquivo } = leitura;
    if (disciplinaDoArquivo) {
      if (!disciplinaDoArquivo.id) {
        problemasDeCatalogo.push(
          `A Disciplina escrita no arquivo (“${disciplinaDoArquivo.nome}”) não existe no catálogo. Use o nome exato da lista da página “Como escrever um material”.`
        );
      } else if (disciplinaEscolhida && disciplinaDoArquivo.id !== disciplinaEscolhida.id) {
        problemasDeCatalogo.push(
          `A Disciplina escrita no arquivo (“${disciplinaDoArquivo.nome}”) não é a que você escolheu (“${disciplinaEscolhida.name}”).`
        );
      }
    }
    if (temaDoArquivo) {
      if (!temaDoArquivo.id) {
        problemasDeCatalogo.push(
          `O Tema escrito no arquivo (“${temaDoArquivo.nome}”) não existe no catálogo. Use o nome exato da lista da página “Como escrever um material”.`
        );
      } else if (temaEscolhido && temaDoArquivo.id !== temaEscolhido.id) {
        problemasDeCatalogo.push(
          `O Tema escrito no arquivo (“${temaDoArquivo.nome}”) não é o que você escolheu (“${temaEscolhido.name}”).`
        );
      }
    }
  }
  const aceito = !vazio && !tamanhoExcedido && errosDeImportacao.length === 0 && pendencias.length === 0 && avisosDaImportacao.length === 0 && !tituloLongo && problemasDeCatalogo.length === 0 && leitura.titulo.trim().length > 0;
  return {
    vazio,
    bytes: leitura.bytes,
    tamanhoExcedido,
    errosDeImportacao,
    pendencias,
    avisosDaImportacao,
    tituloLongo,
    problemasDeCatalogo,
    aceito
  };
}
function lerMaterialParaPublicar(texto, disciplines, themes) {
  const importacao = parseCompendiumMarkdownText(texto, disciplines, themes, []);
  if (!importacao.ok) return { ok: false, motivos: importacao.errors };
  const { preview } = importacao;
  return {
    ok: true,
    material: {
      title: preview.title,
      subtitle: preview.subtitle || null,
      author: preview.author || null,
      estimated_read_time_minutes: preview.estimatedReadTimeMinutes || null,
      // Como o botão "Importar material" (buildCompendiumFromImport): sem palavra-chave, "Geral".
      tags: importacao.tags.length > 0 ? importacao.tags : ["Geral"],
      sections: importacao.sections.map((s) => ({
        title: s.title,
        content: s.content,
        key_takeaways: s.keyTakeaways,
        mechanism_tag: s.mechanismTag ?? null,
        clinical_pearl: s.clinicalPearl ?? null,
        warning_alert: s.warningAlert ?? null
      })),
      references: importacao.references
    }
  };
}
function descreverAvisoDaImportacao(aviso) {
  return /^[^—.]{1,40}$/.test(aviso) ? `Falta o campo “${aviso}”.` : aviso;
}
function frasesDoTituloLongo() {
  return `O título passa de ${LIMITE_TITULO_CARACTERES} caracteres. Encurte-o (uma linha só, direto ao assunto).`;
}
function motivosDaReprovacao(av) {
  const motivos = [];
  if (av.vazio) motivos.push("O texto do material está vazio.");
  if (av.tamanhoExcedido) {
    motivos.push(`O texto tem ${tamanhoLegivel(av.bytes)} e o limite é ${tamanhoLegivel(LIMITE_TEXTO_BYTES)}.`);
  }
  motivos.push(...av.errosDeImportacao);
  motivos.push(...av.problemasDeCatalogo);
  if (av.tituloLongo) motivos.push(frasesDoTituloLongo());
  motivos.push(...av.avisosDaImportacao.map(descreverAvisoDaImportacao));
  motivos.push(...av.pendencias.map((p) => `Linha ${p.linha} · ${p.secao}: ${p.mensagem}`));
  return motivos;
}

// src/utils/questionsImport.ts
var VALID_CYCLES = ["basico", "clinico", "internato_residencia"];
var VALID_DIFFICULTIES = ["facil", "medio", "dificil"];
var DEFAULT_CYCLE = "internato_residencia";
var DEFAULT_DIFFICULTY = "medio";
var DEFAULT_TAGS = ["Admin", "CMS", "Custom"];
var DEFAULT_GENERAL_COMMENTARY = "Comentário cadastrado via Painel Administrativo.";
var DEFAULT_HIGH_YIELD_SUMMARY = "Conceito chave adicionado pelo autor.";
function stripAccents2(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function normalizeLabel(s) {
  return stripAccents2(s).toLowerCase().trim();
}
function isNonEmptyString2(v) {
  return typeof v === "string" && v.trim().length > 0;
}
function resolveByName2(name, list) {
  const norm = name.trim().toLowerCase();
  if (!norm) return void 0;
  return list.find((item) => item.name.trim().toLowerCase() === norm);
}
var OPTION_TEXT_RE = /^\*\*([A-Za-z]+)\)\*\*\s*(.*)$/i;
var OPTION_EXPLANATION_RE = /^\*\*explica[cç][aã]o\s+([A-Za-z]+):?\*\*\s*(.*)$/i;
var GENERIC_LABEL_RE = /^\*\*([^*:]+):?\*\*\s*(.*)$/;
var FIELD_LABELS = {
  disciplina: "disciplineName",
  tema: "themeName",
  "instituicao / banca": "institution",
  instituicao: "institution",
  banca: "institution",
  ano: "year",
  ciclo: "cycle",
  dificuldade: "difficulty",
  "enunciado clinico (caso / vinheta)": "clinicalVignette",
  "enunciado clinico": "clinicalVignette",
  vinheta: "clinicalVignette",
  "comando da questao (pergunta)": "questionStem",
  "comando da questao": "questionStem",
  pergunta: "questionStem",
  "materiais cobertos": "materialTitles",
  "material coberto": "materialTitles",
  "comentario geral": "generalCommentary",
  "perola high-yield (resumo para fixacao rapida)": "highYieldSummary",
  "perola high-yield": "highYieldSummary",
  perola: "highYieldSummary"
};
function findLabelMatches(lines) {
  const matches = [];
  lines.forEach((rawLine, i) => {
    const line = rawLine.trim();
    const optText = line.match(OPTION_TEXT_RE);
    if (optText) {
      matches.push({ label: "optionText", letter: optText[1].toUpperCase(), kind: "optionText", line: i, inline: optText[2] });
      return;
    }
    const optExp = line.match(OPTION_EXPLANATION_RE);
    if (optExp) {
      matches.push({
        label: "optionExplanation",
        letter: optExp[1].toUpperCase(),
        kind: "optionExplanation",
        line: i,
        inline: optExp[2]
      });
      return;
    }
    const generic = line.match(GENERIC_LABEL_RE);
    if (generic) {
      const norm = normalizeLabel(generic[1]);
      if (norm in FIELD_LABELS) {
        matches.push({ label: norm, kind: "field", line: i, inline: generic[2] });
      }
    }
  });
  return matches;
}
function collectValue(lines, match, nextLine) {
  const continuation = lines.slice(match.line + 1, nextLine).join("\n");
  return `${match.inline}
${continuation}`.trim();
}
function isTagsHeader2(line) {
  return normalizeLabel(line.replace(/^###\s+/, "")) === "tags";
}
function extractBacktickTags2(body) {
  const found = body.match(/`([^`\n]+)`/g) ?? [];
  return found.map((m) => m.slice(1, -1).trim()).filter(Boolean);
}
function splitByH2(text) {
  const lines = text.split(/\r\n|\n/);
  const headingIdx = [];
  lines.forEach((line, i) => {
    if (/^##\s+.+/.test(line.trim())) headingIdx.push(i);
  });
  const blocks = [];
  headingIdx.forEach((idx, i) => {
    const end = i + 1 < headingIdx.length ? headingIdx[i + 1] : lines.length;
    blocks.push(lines.slice(idx + 1, end).join("\n"));
  });
  return blocks;
}
function parseQuestionBlock(block, index, disciplines, themes) {
  const lines = block.split(/\r\n|\n/);
  let tags = [];
  const tagsHeaderIdx = lines.findIndex((l) => /^###\s+/.test(l.trim()) && isTagsHeader2(l));
  let contentLines = lines;
  if (tagsHeaderIdx !== -1) {
    const nextHeadingRel = lines.slice(tagsHeaderIdx + 1).findIndex((l) => /^#{2,3}\s+/.test(l.trim()));
    const tagsEnd = nextHeadingRel === -1 ? lines.length : tagsHeaderIdx + 1 + nextHeadingRel;
    tags = extractBacktickTags2(lines.slice(tagsHeaderIdx + 1, tagsEnd).join("\n"));
    contentLines = [...lines.slice(0, tagsHeaderIdx), ...lines.slice(tagsEnd)];
  }
  const matches = findLabelMatches(contentLines);
  const values = {};
  const optionTextByLetter = {};
  const optionExplanationByLetter = {};
  const gabaritoLetters = [];
  const letterOrder = [];
  matches.forEach((match, i) => {
    const nextLine = i + 1 < matches.length ? matches[i + 1].line : contentLines.length;
    const value = collectValue(contentLines, match, nextLine);
    if (match.kind === "field") {
      values[match.label] = value;
    } else if (match.kind === "optionText" && match.letter) {
      if (!letterOrder.includes(match.letter)) letterOrder.push(match.letter);
      const hasGabarito = /\[\s*gabarito\s*\]/i.test(value);
      const cleanText = value.replace(/\[\s*gabarito\s*\]/gi, "").trim();
      optionTextByLetter[match.letter] = cleanText;
      if (hasGabarito) gabaritoLetters.push(match.letter);
    } else if (match.kind === "optionExplanation" && match.letter) {
      optionExplanationByLetter[match.letter] = value;
    }
  });
  const missingFields = [];
  const blockingErrors = [];
  const disciplineName = values.disciplina?.trim() ?? "";
  if (!disciplineName) blockingErrors.push("Disciplina não informada — questão não pode ser criada.");
  const themeName = values.tema?.trim() ?? "";
  const discipline = resolveByName2(disciplineName, disciplines);
  const theme = resolveByName2(themeName, discipline ? themes.filter((t) => t.disciplineId === discipline.id) : themes);
  if (discipline && !themeName) {
    missingFields.push("Tema não informado — selecione um manualmente antes de confirmar.");
  } else if (themeName && !theme) {
    missingFields.push(`Tema "${themeName}" não encontrado no catálogo atual — selecione um manualmente antes de confirmar.`);
  } else if (!discipline) {
    missingFields.push(`Disciplina "${disciplineName}" não encontrada no catálogo atual — selecione uma manualmente antes de confirmar.`);
  }
  const institution = values["instituicao / banca"]?.trim() || values.instituicao?.trim() || values.banca?.trim() || "";
  if (!institution) missingFields.push("Instituição / Banca vazia.");
  const yearRaw = values.ano?.trim() ?? "";
  const yearNum = parseInt(yearRaw, 10);
  const year = Number.isFinite(yearNum) && yearNum >= 1980 && yearNum <= 2100 ? yearNum : 0;
  if (!year) missingFields.push(yearRaw ? `Ano "${yearRaw}" inválido — ignorado.` : "Ano vazio.");
  const cycleRaw = normalizeLabel(values.ciclo ?? "");
  const cycle = VALID_CYCLES.includes(cycleRaw) ? cycleRaw : DEFAULT_CYCLE;
  if (values.ciclo && cycle === DEFAULT_CYCLE && cycleRaw !== DEFAULT_CYCLE) {
    missingFields.push(`Ciclo "${values.ciclo}" inválido — usando padrão "${DEFAULT_CYCLE}".`);
  }
  const difficultyRaw = normalizeLabel(values.dificuldade ?? "");
  const difficulty = VALID_DIFFICULTIES.includes(difficultyRaw) ? difficultyRaw : DEFAULT_DIFFICULTY;
  if (values.dificuldade && difficulty === DEFAULT_DIFFICULTY && difficultyRaw !== DEFAULT_DIFFICULTY) {
    missingFields.push(`Dificuldade "${values.dificuldade}" inválida — usando padrão "${DEFAULT_DIFFICULTY}".`);
  }
  const clinicalVignette = values["enunciado clinico (caso / vinheta)"]?.trim() || values["enunciado clinico"]?.trim() || values.vinheta?.trim() || "";
  if (!clinicalVignette) missingFields.push("Enunciado Clínico (Vinheta) vazio (ok se a questão realmente não tiver caso clínico).");
  const questionStem = values["comando da questao (pergunta)"]?.trim() || values["comando da questao"]?.trim() || values.pergunta?.trim() || "";
  if (!questionStem) blockingErrors.push("Comando da Questão (Pergunta) vazio — questão não pode ser criada.");
  const options = letterOrder.filter((letter) => isNonEmptyString2(optionTextByLetter[letter])).map((letter) => ({
    letter,
    text: (optionTextByLetter[letter] ?? "").trim(),
    explanation: (optionExplanationByLetter[letter] ?? "").trim(),
    isCorrect: gabaritoLetters.includes(letter)
  }));
  if (options.length < 2) {
    blockingErrors.push(`Menos de 2 alternativas com texto (encontradas: ${options.length}) — questão não pode ser criada.`);
  }
  const correctCount = options.filter((o) => o.isCorrect).length;
  if (correctCount === 0 && options.length >= 2) {
    blockingErrors.push("Nenhuma alternativa marcada com [GABARITO] — marque exatamente uma.");
  } else if (correctCount > 1) {
    blockingErrors.push(`Mais de uma alternativa marcada com [GABARITO] (${correctCount}) — deixe só uma.`);
  }
  const lettersWithoutExplanation = options.filter((o) => !o.explanation).map((o) => o.letter);
  if (lettersWithoutExplanation.length > 0) {
    missingFields.push(
      `Explicação vazia nas alternativas: ${lettersWithoutExplanation.join(", ")} — obrigatória antes de publicar.`
    );
  }
  const generalCommentary = values["comentario geral"]?.trim() || "";
  if (!generalCommentary) missingFields.push("Comentário Geral vazio — usando texto padrão.");
  const highYieldSummary = values["perola high-yield (resumo para fixacao rapida)"]?.trim() || values["perola high-yield"]?.trim() || values.perola?.trim() || "";
  if (!highYieldSummary) missingFields.push("Pérola High-Yield vazia — usando texto padrão.");
  const materialTitles = [
    ...new Set(
      (values["materiais cobertos"] ?? values["material coberto"] ?? "").split(/[;\n]/).map((t) => t.trim()).filter(Boolean)
    )
  ];
  if (tags.length === 0) missingFields.push("Tags não informadas — usando padrão (Admin, CMS, Custom).");
  return {
    index,
    disciplineName,
    themeName,
    disciplineId: discipline?.id ?? null,
    themeId: theme?.id ?? null,
    institution,
    year,
    cycle,
    difficulty,
    clinicalVignette,
    questionStem,
    options,
    generalCommentary: generalCommentary || DEFAULT_GENERAL_COMMENTARY,
    highYieldSummary: highYieldSummary || DEFAULT_HIGH_YIELD_SUMMARY,
    tags: tags.length > 0 ? tags : DEFAULT_TAGS,
    materialTitles,
    missingFields,
    blockingErrors
  };
}
function parseQuestionsMarkdownText(text, disciplines, themes) {
  const blocks = splitByH2(text);
  if (blocks.length === 0) {
    return {
      ok: false,
      errors: [
        'Nenhum bloco "## Questão" encontrado no arquivo. Cada questão precisa começar com um heading de nível 2 (ex.: "## Questão 1").'
      ]
    };
  }
  const rows = blocks.map((block, i) => parseQuestionBlock(block, i + 1, disciplines, themes));
  return { ok: true, rows };
}

// src/utils/envioDeQuestoes.ts
var INSTITUICAO_AUTORAL = "NexusMed (questão autoral)";
var MIN_TAGS = 2;
var MAX_TAGS = 5;
function normalizar(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function mencionaAutoral(instituicao) {
  const n = normalizar(instituicao);
  return n.includes("nexusmed") || n.includes("autoral");
}
function ehAutoralExata(instituicao) {
  return normalizar(instituicao) === normalizar(INSTITUICAO_AUTORAL);
}
var FONTE_ON_LINE = /https?:\/\/\S+|\bdoi:\s*10\.\d{4,9}\/\S+|\b10\.\d{4,9}\/\S+/i;
function comentarioTemFonteOnLine(linha) {
  const texto = [linha.generalCommentary, ...linha.options.map((o) => o.explanation)].join("\n");
  return FONTE_ON_LINE.test(texto);
}
function avisoIgnorado2(aviso, linha) {
  if (aviso.startsWith("Enunciado Clínico")) return true;
  if (/^(Tema|Disciplina) /.test(aviso)) return true;
  if (aviso === "Ano vazio." && ehAutoralExata(linha.institution)) return true;
  return false;
}
function lerLoteDeQuestoes(texto, disciplines, themes) {
  const bytes = tamanhoEmBytes(texto);
  if (texto.trim().length === 0) return { texto, bytes, errosDeImportacao: [], linhas: [] };
  const resultado = parseQuestionsMarkdownText(texto, disciplines, themes);
  if (resultado.ok === false) return { texto, bytes, errosDeImportacao: resultado.errors, linhas: [] };
  return { texto, bytes, errosDeImportacao: [], linhas: resultado.rows };
}
function achaMaterial(titulo, publicados) {
  const alvo = titulo.replace(/\s+/g, " ").trim();
  return publicados.find((m) => m.title.replace(/\s+/g, " ").trim() === alvo);
}
function avaliarLote(leitura, publicados, materiaisEscolhidos) {
  const vazio = leitura.texto.trim().length === 0;
  const tamanhoExcedido = leitura.bytes > LIMITE_TEXTO_BYTES;
  const pendencias = [];
  for (const linha of leitura.linhas) {
    const q = linha.index;
    const add = (mensagem) => pendencias.push({ questao: q, mensagem });
    for (const erro of linha.blockingErrors) add(erro);
    for (const aviso of linha.missingFields) {
      if (!avisoIgnorado2(aviso, linha)) add(aviso);
    }
    if (linha.disciplineName && !linha.disciplineId) {
      add(
        `A Disciplina escrita no arquivo (“${linha.disciplineName}”) não existe no catálogo. Use o nome exato da lista da página “Como escrever questões”.`
      );
    } else if (linha.disciplineId && !linha.themeName) {
      add("O Tema não foi informado. Escreva o nome exato de um Tema da Disciplina.");
    } else if (linha.disciplineId && !linha.themeId) {
      add(
        `O Tema escrito no arquivo (“${linha.themeName}”) não existe nessa Disciplina. Use o nome exato da lista da página “Como escrever questões”.`
      );
    }
    if (linha.institution && mencionaAutoral(linha.institution) && !ehAutoralExata(linha.institution)) {
      add(`Questão autoral: escreva exatamente “${INSTITUICAO_AUTORAL}” no campo Instituição / Banca.`);
    }
    if (ehAutoralExata(linha.institution) && linha.year > 0) {
      add("Questão autoral não leva Ano: tire o campo Ano (ou, se é de prova real, escreva a banca verdadeira).");
    }
    const semTags = linha.missingFields.some((m) => m.startsWith("Tags não informadas"));
    if (!semTags && (linha.tags.length < MIN_TAGS || linha.tags.length > MAX_TAGS)) {
      add(`Use de ${MIN_TAGS} a ${MAX_TAGS} Tags (encontradas: ${linha.tags.length}).`);
    }
    if (linha.blockingErrors.length === 0 && !comentarioTemFonteOnLine(linha)) {
      add("O comentário não cita nenhuma fonte on-line identificável (endereço ou DOI).");
    }
    if (publicados !== null && linha.materialTitles.length === 0 && materiaisEscolhidos.length === 0) {
      add("Sem material: escreva “Materiais cobertos” na questão ou escolha o material abaixo.");
    }
    for (const titulo of publicados === null ? [] : linha.materialTitles) {
      if (!achaMaterial(titulo, publicados ?? [])) {
        add(`O material “${titulo}” não é o título exato de um material publicado.`);
      }
    }
  }
  const aceito = !vazio && !tamanhoExcedido && leitura.errosDeImportacao.length === 0 && leitura.linhas.length > 0 && pendencias.length === 0;
  return {
    vazio,
    bytes: leitura.bytes,
    tamanhoExcedido,
    errosDeImportacao: vazio ? [] : leitura.errosDeImportacao,
    totalDeQuestoes: leitura.linhas.length,
    pendencias,
    aceito
  };
}
function motivosDaRecusaDoLote(av) {
  const motivos = [];
  if (av.vazio) motivos.push("O texto do lote está vazio.");
  if (av.tamanhoExcedido) motivos.push(`O texto tem ${tamanhoLegivel(av.bytes)} e o limite é ${tamanhoLegivel(LIMITE_TEXTO_BYTES)}.`);
  motivos.push(...av.errosDeImportacao);
  motivos.push(...av.pendencias.map((p) => `Questão ${p.questao}: ${p.mensagem}`));
  return motivos;
}
function lerQuestoesParaPublicar(texto, disciplines, themes) {
  const leitura = lerLoteDeQuestoes(texto, disciplines, themes);
  const avaliacao = avaliarLote(leitura, null, []);
  if (!avaliacao.aceito) return { ok: false, motivos: motivosDaRecusaDoLote(avaliacao) };
  return {
    ok: true,
    questoes: leitura.linhas.map((l) => ({
      discipline_id: l.disciplineId,
      theme_id: l.themeId,
      cycle: l.cycle,
      difficulty: l.difficulty,
      institution: l.institution,
      year: l.year > 0 ? l.year : null,
      clinical_vignette: l.clinicalVignette,
      question_stem: l.questionStem,
      general_commentary: l.generalCommentary,
      high_yield_summary: l.highYieldSummary,
      tags: l.tags,
      material_titles: l.materialTitles,
      options: l.options.map((o) => ({
        letter: o.letter,
        text: o.text,
        explanation: o.explanation,
        is_correct: o.isCorrect
      }))
    }))
  };
}
export {
  avaliarEnvio,
  avaliarLote,
  lerArquivoParaEnvio,
  lerLoteDeQuestoes,
  lerMaterialParaPublicar,
  lerQuestoesParaPublicar,
  motivosDaRecusaDoLote,
  motivosDaReprovacao
};
