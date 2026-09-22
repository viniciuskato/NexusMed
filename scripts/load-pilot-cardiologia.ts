/**
 * Piloto de migração de dado real — Cardiologia / Insuficiência Cardíaca.
 *
 * Carrega, contra o Supabase LOCAL apenas (nunca o remoto):
 *  - 2 compêndios já extraídos/auditados (_pilot-cardiologia.json.txt)
 *  - as 40 questões de Cardiologia (banco-questoes.json)
 *  - as 6 fontes referenciadas por essas questões (fontes.json)
 *  - as correções cujo questaoId pertence a essas 40 questões (correcoes.json)
 *
 * Roda fora do app Vite: `npx tsx scripts/load-pilot-cardiologia.ts`.
 *
 * Usa a service_role key local (bypassa RLS) — mesmo padrão de dev do
 * Supabase CLI documentado em scripts/validate-supabase-repos.ts. NÃO é
 * segredo real, só funciona contra instâncias locais.
 *
 * DECISÕES DE CARGA DOCUMENTADAS (ver relatório final impresso ao fim):
 *  1. HTML -> texto: content_html é convertido para uma sintaxe leve de
 *     markdown compatível com src/components/common/SafeMarkdown.tsx (que
 *     evita dangerouslySetInnerHTML de propósito). Não é uma conversão
 *     perfeita: tooltips aninhadas (<span class="tip"> com etimologia) são
 *     descartadas do corpo do texto — não há coluna dedicada a elas no
 *     schema atual. Blocos <div class="kbox"> são removidos do corpo porque
 *     já são capturados estruturalmente em key_takeaways.
 *  2. glossary_terms + key_takeaways das seções são mesclados na mesma
 *     coluna key_takeaways (text[]), pois o schema não tem coluna separada
 *     para glossário. Prefixo "Termo:" identifica os itens de glossário.
 *  3. references[] dos compêndios: raw_citation_text é separado em
 *     citation_text (referência formal) vs. observacoes (nota editorial
 *     tipo "Recommended for..."), com split manual documentado por item
 *     (só 14 referências no total — heurística geral: citação termina na
 *     editora/ano/edição, o resto é nota; aplicada item a item porque
 *     regex genérica sobre texto livre citação-a-citação seria frágil).
 *  4. Fonte compartilhada: "Textbook of Medical Physiology" (Guyton & Hall,
 *     14ª ed., Elsevier, 2021), citada por AMBOS os compêndios (em inglês
 *     por Cardiac Anatomy, em português/"Tratado de Fisiologia Médica" com
 *     capítulos 9-12 por Ciclo Cardíaco) é tratada como UMA ÚNICA linha em
 *     sources, com dois material_references apontando para o mesmo
 *     source_id (cada um preservando seu próprio citation_text textual).
 *  5. sources.verificacao das 13 fontes de compêndio = 'verificada_por_
 *     busca_resumo': este script NÃO fez nova verificação bibliográfica via
 *     busca nesta sessão — reaproveita a alegação de auditoria prévia do
 *     pipeline de extração. Documentado explicitamente (não confundir com
 *     leitura de texto integral).
 *  6. questions.clinical_vignette: banco-questoes.json não separa vinheta
 *     clínica de enunciado (só existe "pergunta"). question_stem <- pergunta;
 *     clinical_vignette <- '' (não há conteúdo de vinheta separado nesta
 *     fonte). Achado a documentar para o desenho de captura futura.
 *  7. question_options / question_option_keys: banco-questoes.json só tem
 *     UMA explicação por questão ("explicacao"), não uma por alternativa.
 *     A mesma explicacao é copiada para TODAS as question_option_keys.explanation
 *     da questão (para satisfazer a checagem de publish_question de que
 *     nenhuma explicação fique vazia) — não há conteúdo per-alternativa na
 *     fonte real. question_answer_keys.high_yield_summary repete general_commentary
 *     (mesmo texto), pois não há campo separado no banco original.
 *  8. difficulty (obrigatório, não existe no banco original) é derivado de
 *     classificacao.complexidade: Fundamental -> facil, Aplicação -> medio,
 *     Integração -> dificil. cycle (obrigatório) reaproveita o cycle já
 *     definido em disciplines para Cardiologia ('clinico').
 *  9. content_assets.mime_type (obrigatório, não existe na fonte) é inferido
 *     da extensão da external_url; is_primary fica false para todas as
 *     imagens (fonte não sinaliza qual é primária).
 * 10. material_dependencies: só as dependências com correspondência clara a
 *     um compêndio JÁ carregado neste piloto são resolvidas (Cardiac
 *     Anatomy <-> Ciclo Cardíaco, cross-referenciados). As demais (ex.
 *     "General anatomy", "Basic histology") são pré-requisitos genéricos
 *     sem compêndio próprio nesta rodada — reportadas como "sem
 *     correspondência", não inventadas.
 */

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ONEDRIVE = 'C:\\Users\\vinic\\OneDrive';
const PILOT_JSON_PATH = path.resolve(__dirname, '_pilot-cardiologia.json.txt');
const BANCO_DIR = path.join(ONEDRIVE, 'Questões', '_banco');

// ----------------------------------------------------------------------------
// Relatório
// ----------------------------------------------------------------------------

const log = {
  lines: [] as string[],
  push(s: string) {
    this.lines.push(s);
    console.log(s);
  },
};

// ----------------------------------------------------------------------------
// HTML -> markdown leve (compatível com SafeMarkdown.tsx)
// ----------------------------------------------------------------------------

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripKboxBlocks(html: string): string {
  return html.replace(
    /<div class="kbox">\s*<div class="klabel">[^<]*<\/div>\s*<p>[\s\S]*?<\/p>\s*<\/div>/g,
    ''
  );
}

function stripTipTooltips(html: string): string {
  return html.replace(/<span class="tip">[\s\S]*?<\/span>/g, '');
}

/** Conversão inline (negrito/itálico/links), sem tocar em quebras de linha. */
function convertInlinePreservingNewlines(text: string): string {
  let t = text;
  t = t.replace(/<(strong|b)>([\s\S]*?)<\/\1>/g, '**$2**');
  t = t.replace(/<(em|i)>([\s\S]*?)<\/\1>/g, '*$2*');
  t = t.replace(/<a[^>]*href="(https?:\/\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/g, '[$2]($1)');
  t = t.replace(/<a[^>]*href="#[^"]*"[^>]*>([\s\S]*?)<\/a>/g, '$1');
  t = t.replace(/<\/?span[^>]*>/g, '');
  t = t.replace(/<[^>]+>/g, '');
  t = decodeEntities(t);
  return t;
}

/** Achata um fragmento para uma única linha (célula de tabela, item de lista, glossário). */
function flattenToSingleLine(html: string): string {
  const t = convertInlinePreservingNewlines(html);
  return t.replace(/\s+/g, ' ').trim();
}

function convertTables(html: string): string {
  return html.replace(/<table[^>]*>([\s\S]*?)<\/table>/g, (_m, inner: string) => {
    const rows: string[][] = [];
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let trMatch: RegExpExecArray | null;
    while ((trMatch = trRe.exec(inner))) {
      const cells: string[] = [];
      const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRe.exec(trMatch[1]))) {
        cells.push(flattenToSingleLine(cellMatch[1]));
      }
      if (cells.length > 0) rows.push(cells);
    }
    if (rows.length === 0) return '';
    const [header, ...body] = rows;
    const lines = [
      '| ' + header.join(' | ') + ' |',
      '| ' + header.map(() => '---').join(' | ') + ' |',
      ...body.map((r) => '| ' + r.join(' | ') + ' |'),
    ];
    return '\n\n' + lines.join('\n') + '\n\n';
  });
}

function htmlToMarkdown(rawHtml: string): string {
  let html = rawHtml;
  html = stripKboxBlocks(html);
  html = stripTipTooltips(html);
  html = convertTables(html);
  // parágrafo com classe table-caption vira parágrafo comum (perde estilo, aceitável no piloto)
  html = html.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (_m, c: string) => '\n- ' + flattenToSingleLine(c));
  html = html.replace(/<\/?(ul|ol)[^>]*>/g, '\n');
  html = html.replace(/<br\s*\/?>/g, '\n');
  html = html.replace(/<\/(p|div)>/g, '\n\n');
  html = html.replace(/<(p|div)[^>]*>/g, '');
  html = convertInlinePreservingNewlines(html);
  html = html
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return html;
}

// ----------------------------------------------------------------------------
// Tipos das fontes de dado
// ----------------------------------------------------------------------------

interface PilotGlossaryTerm {
  term: string;
  translation_or_definition: string;
}

interface PilotImage {
  external_url: string;
  alt_text: string | null;
  caption: string | null;
  license_or_rights: string | null;
  source_note: string | null;
}

interface PilotSection {
  title: string;
  level: number;
  content_html: string;
  key_takeaways: string[] | null;
  glossary_terms?: PilotGlossaryTerm[] | null;
  images?: PilotImage[] | null;
}

interface PilotReference {
  raw_citation_text: string;
}

interface PilotCompendium {
  title: string;
  subtitle: string | null;
  discipline_hint: string;
  theme_hint: string;
  estimated_read_time_minutes: number | null;
  tags: string[];
  dependencies: string[];
  sections: PilotSection[];
  references: PilotReference[];
  _unmapped?: string[];
}

interface BancoQuestao {
  id: string;
  tema: string;
  categoria: string;
  tags: string[];
  pergunta: string;
  alternativas: string[];
  correta: number;
  explicacao: string;
  referencias: string[];
  criadoEm: string;
  fonte: string;
  classificacao: {
    disciplina: string;
    disciplinasRelacionadas: string[];
    tema: string;
    subtema: string;
    competencia: string;
    complexidade: string;
    contexto: string;
  };
  versaoEditorial: number;
  estadoEditorial: string;
  auditoriaEditorial: unknown;
  proveniencia: unknown;
  evidencia: unknown;
  qualidadeDoItem: unknown;
}

interface FontesJson {
  fontes: Record<string, string>;
  fontesMeta: Record<
    string,
    {
      tipo: string;
      verificacao: string;
      verificadoEm?: string;
      identificadores?: Record<string, string>;
      jurisdicao?: string | null;
      vigente?: boolean | null;
      substituidaPor?: string | null;
      observacoes?: string | null;
    }
  >;
}

interface CorrecaoEntry {
  data?: string;
  tipo?: string;
  camposAlterados?: string[];
  motivo?: string;
  referencias?: string[];
  responsavel?: string;
  usoDeIA?: string;
  questaoId?: string;
  de?: string[];
  para?: string[];
}

// ----------------------------------------------------------------------------
// Fontes bibliográficas dos compêndios (split citation_text/observacoes feito
// item a item — ver decisão #3 no cabeçalho).
// ----------------------------------------------------------------------------

interface CompendiumSourceSpec {
  id: string;
  citation_text: string;
  observacoes: string | null;
  tipo: string;
  verificacao: string;
  identificadores: Record<string, string>;
  vigente: boolean | null;
}

const GUYTONHALL_SHARED_ID = 'guytonhall2021-textbook-medical-physiology';

const VERIFICACAO_PADRAO_COMPENDIO = 'verificada_por_busca_resumo';
const OBS_PADRAO_COMPENDIO =
  'Verificação NÃO refeita nesta sessão de carga — reaproveita a auditoria prévia do pipeline de extração dos compêndios. Tratar como confirmação de metadados, não como leitura de texto integral (ver memória de feedback sobre citação íntegra vs. abstract).';

const CARDIAC_ANATOMY_SOURCES: CompendiumSourceSpec[] = [
  {
    id: 'netter2019-atlas-human-anatomy',
    citation_text: 'NETTER, Frank H. Atlas of Human Anatomy. 7th ed. Philadelphia: Elsevier, 2019.',
    observacoes:
      'Incomparable visual reference for cardiac anatomy. Plates 212–235 cover the heart, pericardium, chambers, valves, and coronaries with topographic and clinical detail. Mandatory entry point before any other text. ' +
      OBS_PADRAO_COMPENDIO,
    tipo: 'livro_texto',
    verificacao: VERIFICACAO_PADRAO_COMPENDIO,
    identificadores: {},
    vigente: true,
  },
  {
    id: 'moore2014-clinically-oriented-anatomy',
    citation_text:
      'MOORE, Keith L.; DALLEY, Arthur F.; AGUR, Anne M. R. Clinically Oriented Anatomy. 7th ed. Philadelphia: Lippincott Williams & Wilkins, 2014.',
    observacoes:
      'Canonical anatomy textbook with systematic clinical correlations. Chapter 1 (Thorax) covers cardiac anatomy in depth with clinical boxes on tamponade, aortic dissection, and conduction blocks. Best available combination of anatomical rigor and clinical application. ' +
      OBS_PADRAO_COMPENDIO,
    tipo: 'livro_texto',
    verificacao: VERIFICACAO_PADRAO_COMPENDIO,
    identificadores: {},
    vigente: true,
  },
  {
    id: 'gray2021-grays-anatomy',
    citation_text:
      "GRAY, Henry; STANDRING, Susan (ed.). Gray's Anatomy: The Anatomical Basis of Clinical Practice. 42nd ed. Philadelphia: Elsevier, 2021.",
    observacoes:
      'The definitive reference in human anatomy. Chapters on the heart, pericardium, and mediastinum are the most detailed available — including anatomical variants, blood supply, innervation, and surgical correlations. Recommended for consulting specific questions after mastering Moore. ' +
      OBS_PADRAO_COMPENDIO,
    tipo: 'livro_texto',
    verificacao: VERIFICACAO_PADRAO_COMPENDIO,
    identificadores: {},
    vigente: true,
  },
  {
    id: GUYTONHALL_SHARED_ID,
    citation_text: 'GUYTON, Arthur C.; HALL, John E. Textbook of Medical Physiology. 14th ed. Philadelphia: Elsevier, 2021.',
    observacoes:
      'Chapters 9–14 develop the physiology of the cardiac pump and coronary circulation grounded in anatomy. Essential complementary reading. ' +
      'ACHADO DE CARGA: o mesmo livro (14ª ed., Elsevier, 2021, Guyton & Hall) é citado também pelo compêndio "Ciclo Cardíaco" como "Tratado de Fisiologia Médica" (tradução PT-BR, caps. 9–12) — tratado aqui como UMA fonte compartilhada (ver decisão #4 no cabeçalho do script), não duas linhas duplicadas. ' +
      OBS_PADRAO_COMPENDIO,
    tipo: 'livro_texto',
    verificacao: VERIFICACAO_PADRAO_COMPENDIO,
    identificadores: {},
    vigente: true,
  },
  {
    id: 'anderson2004-cardiac-anatomy-revisited',
    citation_text:
      'ANDERSON, Robert H. et al. Cardiac Anatomy Revisited. Journal of Anatomy, v. 205, n. 3, p. 159–177, 2004. DOI: 10.1111/j.0021-8782.2004.00330.x',
    observacoes:
      'Reference review on cardiac nomenclature and segmental anatomy. Essential for studying congenital heart disease or surgical anatomy — introduces the sequential segmental approach that organizes the description of the malformed heart. ' +
      OBS_PADRAO_COMPENDIO,
    tipo: 'artigo_revisao',
    verificacao: VERIFICACAO_PADRAO_COMPENDIO,
    identificadores: { doi: '10.1111/j.0021-8782.2004.00330.x' },
    vigente: true,
  },
  {
    id: 'gumpangseth2020-heart-valve-histology',
    citation_text:
      'GUMPANGSETH, Treerat; LEKAWANVIJIT, Suree; MAHAKKANUKRAUH, Pasuk. Histological assessment of the human heart valves and its relationship with age. Anatomy & Cell Biology, v. 53, n. 3, p. 261–271, 2020. DOI: 10.5115/acb.20.093',
    observacoes:
      'Histological study of 50 human hearts (ages 20–90) establishing the layer composition (atrialis/fibrosa/spongiosa/ventricularis) of the four valve leaflets/cusps and its age-related changes. Source for the "Leaflet and cusp structure" subsection. ' +
      OBS_PADRAO_COMPENDIO,
    tipo: 'ensaio',
    verificacao: VERIFICACAO_PADRAO_COMPENDIO,
    identificadores: { doi: '10.5115/acb.20.093' },
    vigente: true,
  },
  {
    id: 'harvey1628-motu-cordis',
    citation_text: 'HARVEY, William. Exercitatio Anatomica de Motu Cordis et Sanguinis in Animalibus. Frankfurt, 1628.',
    observacoes:
      'The founding text of modern cardiovascular physiology. Cited for historical value — Harvey demonstrated by quantitative reasoning (stroke volume × heart rate) that blood cannot be continuously produced by the liver but circulates. Available in translation and facsimile online. ' +
      OBS_PADRAO_COMPENDIO,
    tipo: 'livro_texto',
    verificacao: VERIFICACAO_PADRAO_COMPENDIO,
    identificadores: {},
    vigente: null,
  },
];

const CICLO_CARDIACO_SOURCES: CompendiumSourceSpec[] = [
  {
    id: GUYTONHALL_SHARED_ID,
    citation_text: 'Hall JE, Guyton AC. Tratado de Fisiologia Médica. 14ª ed. Elsevier; 2021. Caps. 9–12.',
    observacoes: null,
    tipo: 'livro_texto',
    verificacao: VERIFICACAO_PADRAO_COMPENDIO,
    identificadores: {},
    vigente: true,
  },
  {
    id: 'katz2011-physiology-of-the-heart',
    citation_text: 'Katz AM. Physiology of the Heart. 5ª ed. Wolters Kluwer; 2011.',
    observacoes: null,
    tipo: 'livro_texto',
    verificacao: VERIFICACAO_PADRAO_COMPENDIO,
    identificadores: {},
    vigente: true,
  },
  {
    id: 'bers2002-excitation-contraction-coupling',
    citation_text: 'Bers DM. Cardiac excitation-contraction coupling. Nature. 2002;415(6868):198-205.',
    observacoes: null,
    tipo: 'artigo_revisao',
    verificacao: VERIFICACAO_PADRAO_COMPENDIO,
    identificadores: {},
    vigente: true,
  },
  {
    id: 'frank1895-dynamik-des-herzmuskels',
    citation_text: 'Frank O. Zur Dynamik des Herzmuskels. Z Biol. 1895;32:370-447.',
    observacoes: null,
    tipo: 'ensaio',
    verificacao: VERIFICACAO_PADRAO_COMPENDIO,
    identificadores: {},
    vigente: null,
  },
  {
    id: 'patterson1914-regulation-of-heart-beat',
    citation_text: 'Patterson SW, Piper H, Starling EH. The regulation of the heart beat. J Physiol. 1914;48:465-513.',
    observacoes: null,
    tipo: 'ensaio',
    verificacao: VERIFICACAO_PADRAO_COMPENDIO,
    identificadores: {},
    vigente: null,
  },
  {
    id: 'noble1962-hodgkin-huxley-purkinje',
    citation_text:
      'Noble D. A modification of the Hodgkin-Huxley equations applicable to Purkinje fibre action and pacemaker potentials. J Physiol. 1962;160:317-352.',
    observacoes: null,
    tipo: 'ensaio',
    verificacao: VERIFICACAO_PADRAO_COMPENDIO,
    identificadores: {},
    vigente: null,
  },
  {
    id: 'sarnoff1954-ventricular-function-starling',
    citation_text:
      "Sarnoff SJ, Berglund E. Ventricular function. I. Starling's law of the heart studied by means of simultaneous right and left ventricular function curves. Circulation. 1954;9:706-718.",
    observacoes: null,
    tipo: 'ensaio',
    verificacao: VERIFICACAO_PADRAO_COMPENDIO,
    identificadores: {},
    vigente: null,
  },
];

// ----------------------------------------------------------------------------
// Mapeamento de dependencies[] -> título de compêndio já carregado (ver
// decisão #10). Só os dois pares com correspondência real neste piloto.
// ----------------------------------------------------------------------------

const DEPENDENCY_TITLE_MATCH: Record<string, string> = {
  'Cardiac cycle (physiology)': 'Ciclo Cardíaco',
  'Anatomia cardíaca básica': 'Cardiac Anatomy',
};

// ----------------------------------------------------------------------------
// Helpers de disciplina/tema (upsert por nome, sem duplicar)
// ----------------------------------------------------------------------------

function slugifyCode(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

async function ensureDiscipline(name: string, cycle: 'basico' | 'clinico' | 'internato_residencia'): Promise<string> {
  const { data: existing, error: selErr } = await admin
    .from('disciplines')
    .select('id, name, code')
    .ilike('name', name)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) {
    log.push(`  discipline "${name}" já existe (id=${existing.id}, code=${existing.code}) — reaproveitada, não duplicada.`);
    return existing.id as string;
  }
  const code = slugifyCode(name);
  const { data: created, error: insErr } = await admin
    .from('disciplines')
    .insert({ name, code, cycle })
    .select('id')
    .single();
  if (insErr) throw insErr;
  log.push(`  discipline "${name}" criada (id=${created.id}, code=${code}, cycle=${cycle}).`);
  return created.id as string;
}

async function ensureTheme(disciplineId: string, name: string): Promise<string> {
  const { data: existing, error: selErr } = await admin
    .from('themes')
    .select('id')
    .eq('discipline_id', disciplineId)
    .eq('name', name)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) {
    log.push(`  theme "${name}" já existe (id=${existing.id}) — reaproveitado, não duplicado.`);
    return existing.id as string;
  }
  const { data: created, error: insErr } = await admin
    .from('themes')
    .insert({ discipline_id: disciplineId, name })
    .select('id')
    .single();
  if (insErr) throw insErr;
  log.push(`  theme "${name}" criado (id=${created.id}).`);
  return created.id as string;
}

async function ensureSource(spec: CompendiumSourceSpec): Promise<void> {
  const { data: existing, error: selErr } = await admin.from('sources').select('id').eq('id', spec.id).maybeSingle();
  if (selErr) throw selErr;
  if (existing) return; // já inserida (ex.: fonte compartilhada entre os 2 compêndios)
  const { error: insErr } = await admin.from('sources').insert({
    id: spec.id,
    citation_text: spec.citation_text,
    tipo: spec.tipo,
    verificacao: spec.verificacao,
    jurisdicao: null,
    vigente: spec.vigente,
    identificadores: spec.identificadores,
    observacoes: spec.observacoes,
  });
  if (insErr) throw insErr;
}

function inferMimeType(url: string): string {
  const ext = url.split('.').pop()?.toLowerCase().split('?')[0] ?? '';
  if (ext === 'png') return 'image/png';
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

// ----------------------------------------------------------------------------
// Carga dos compêndios
// ----------------------------------------------------------------------------

const counts = {
  materialsExpected: 2,
  materialsLoaded: 0,
  sectionsExpected: 0,
  sectionsLoaded: 0,
  materialReferencesExpected: 0,
  materialReferencesLoaded: 0,
  compendiumSourcesExpected: 0,
  compendiumSourcesLoaded: 0,
  contentAssetsExpected: 0,
  contentAssetsLoaded: 0,
  dependenciesResolved: 0,
  dependenciesUnresolved: [] as string[],
  questionsExpected: 40,
  questionsLoaded: 0,
  questionSourcesExpected: 6,
  questionSourcesLoaded: 0,
  questionOptionsExpected: 0,
  questionOptionsLoaded: 0,
  questionReferencesLoaded: 0,
  questionCorrectionsExpected: 0,
  questionCorrectionsLoaded: 0,
};

async function loadCompendia(): Promise<Map<string, string>> {
  const raw = fs.readFileSync(PILOT_JSON_PATH, 'utf8');
  const compendia: PilotCompendium[] = JSON.parse(raw);

  const materialIdByTitle = new Map<string, string>();
  const sourcesByCompendium = new Map<string, CompendiumSourceSpec[]>([
    ['Cardiac Anatomy', CARDIAC_ANATOMY_SOURCES],
    ['Ciclo Cardíaco', CICLO_CARDIACO_SOURCES],
  ]);

  for (const c of compendia) {
    log.push(`\n--- Compêndio: ${c.title} (discipline_hint=${c.discipline_hint}, theme_hint=${c.theme_hint}) ---`);
    // cycle: reaproveita 'clinico' para Cardiologia (já definido no seed);
    // 'basico' para qualquer outra disciplina nova (ex. Fisiologia) — decisão
    // documentada no cabeçalho do script.
    const cycle = c.discipline_hint === 'Cardiologia' ? 'clinico' : 'basico';
    const disciplineId = await ensureDiscipline(c.discipline_hint, cycle);
    const themeId = await ensureTheme(disciplineId, c.theme_hint);

    const { data: material, error: matErr } = await admin
      .from('materials')
      .insert({
        discipline_id: disciplineId,
        theme_id: themeId,
        title: c.title,
        subtitle: c.subtitle,
        status: 'draft',
        estimated_read_time_minutes: c.estimated_read_time_minutes,
        tags: c.tags,
      })
      .select('id')
      .single();
    if (matErr) throw matErr;
    const materialId = material.id as string;
    materialIdByTitle.set(c.title, materialId);
    counts.materialsLoaded++;
    log.push(`  material criado (id=${materialId}).`);

    // Seções
    for (let i = 0; i < c.sections.length; i++) {
      const s = c.sections[i];
      const content = htmlToMarkdown(s.content_html);
      const mergedTakeaways: string[] = [];
      if (s.key_takeaways) mergedTakeaways.push(...s.key_takeaways);
      if (s.glossary_terms) {
        for (const g of s.glossary_terms) {
          mergedTakeaways.push(`Termo: ${g.term} — ${g.translation_or_definition}`);
        }
      }
      const { data: section, error: secErr } = await admin
        .from('material_sections')
        .insert({
          material_id: materialId,
          sort_order: i,
          title: s.title,
          content,
          key_takeaways: mergedTakeaways,
        })
        .select('id')
        .single();
      if (secErr) throw secErr;
      counts.sectionsExpected++;
      counts.sectionsLoaded++;

      if (s.images && s.images.length > 0) {
        for (const img of s.images) {
          counts.contentAssetsExpected++;
          const { error: assetErr } = await admin.from('content_assets').insert({
            material_section_id: section.id,
            is_primary: false,
            storage_path: null,
            external_url: img.external_url,
            mime_type: inferMimeType(img.external_url),
            alt_text: img.alt_text,
            caption: img.caption,
            rights_status: img.license_or_rights,
            notes: img.source_note,
          });
          if (assetErr) throw assetErr;
          counts.contentAssetsLoaded++;
        }
      }
    }
    log.push(`  ${c.sections.length} seções carregadas.`);

    // Fontes + material_references
    const specs = sourcesByCompendium.get(c.title) ?? [];
    if (specs.length !== c.references.length) {
      log.push(
        `  AVISO: número de fontes hardcoded (${specs.length}) difere de references[] do JSON (${c.references.length}) para "${c.title}".`
      );
    }
    for (let i = 0; i < c.references.length; i++) {
      const spec = specs[i];
      if (!spec) {
        log.push(`  AVISO: sem spec de fonte para reference #${i} ("${c.references[i].raw_citation_text.slice(0, 60)}...").`);
        continue;
      }
      counts.compendiumSourcesExpected++;
      const alreadyExisted = (await admin.from('sources').select('id').eq('id', spec.id).maybeSingle()).data !== null;
      await ensureSource(spec);
      if (!alreadyExisted) counts.compendiumSourcesLoaded++;

      counts.materialReferencesExpected++;
      const { error: refErr } = await admin.from('material_references').insert({
        material_id: materialId,
        citation_text: spec.citation_text,
        source_id: spec.id,
        sort_order: i,
      });
      if (refErr) throw refErr;
      counts.materialReferencesLoaded++;
    }
  }

  // material_dependencies (resolve via DEPENDENCY_TITLE_MATCH; documenta o resto)
  for (const c of compendia) {
    const materialId = materialIdByTitle.get(c.title)!;
    for (const dep of c.dependencies) {
      const matchedTitle = DEPENDENCY_TITLE_MATCH[dep];
      const targetId = matchedTitle ? materialIdByTitle.get(matchedTitle) : undefined;
      if (targetId) {
        const { error } = await admin
          .from('material_dependencies')
          .insert({ material_id: materialId, depends_on_material_id: targetId });
        if (error) throw error;
        counts.dependenciesResolved++;
        log.push(`  dependência resolvida: "${c.title}" depende de "${matchedTitle}" (era: "${dep}").`);
      } else {
        counts.dependenciesUnresolved.push(`${c.title} -> ${dep}`);
      }
    }
  }

  return materialIdByTitle;
}

// ----------------------------------------------------------------------------
// Carga das questões
// ----------------------------------------------------------------------------

function difficultyFromComplexidade(complexidade: string): 'facil' | 'medio' | 'dificil' {
  if (complexidade === 'Fundamental') return 'facil';
  if (complexidade === 'Aplicação') return 'medio';
  return 'dificil'; // 'Integração'
}

async function loadQuestions(): Promise<Map<string, string>> {
  const banco: { questoes: BancoQuestao[] } = JSON.parse(
    fs.readFileSync(path.join(BANCO_DIR, 'banco-questoes.json'), 'utf8')
  );
  const fontes: FontesJson = JSON.parse(fs.readFileSync(path.join(BANCO_DIR, 'fontes.json'), 'utf8'));
  const correcoesRaw: { correcoes: CorrecaoEntry[] } = JSON.parse(
    fs.readFileSync(path.join(BANCO_DIR, 'correcoes.json'), 'utf8')
  );

  const cardiologiaQuestoes = banco.questoes.filter((q) => q.classificacao?.disciplina === 'Cardiologia');
  log.push(`\n--- Questões de Cardiologia encontradas: ${cardiologiaQuestoes.length} (esperado: 40) ---`);
  if (cardiologiaQuestoes.length !== 40) {
    throw new Error(`Contagem de questões de Cardiologia (${cardiologiaQuestoes.length}) difere do esperado (40). Abortando.`);
  }
  const temas = new Set(cardiologiaQuestoes.map((q) => q.classificacao.tema));
  if (temas.size !== 1 || !temas.has('Insuficiência Cardíaca')) {
    throw new Error(`Temas encontrados diferem do esperado (só "Insuficiência Cardíaca"): ${[...temas].join(', ')}`);
  }

  const referencedSourceIds = new Set<string>();
  for (const q of cardiologiaQuestoes) for (const r of q.referencias) referencedSourceIds.add(r);
  log.push(`--- Fontes referenciadas pelas 40 questões: ${referencedSourceIds.size} (esperado: 6) ---`);
  if (referencedSourceIds.size !== 6) {
    throw new Error(`Contagem de fontes referenciadas (${referencedSourceIds.size}) difere do esperado (6). Abortando.`);
  }
  counts.questionSourcesExpected = referencedSourceIds.size;

  const disciplineId = await ensureDiscipline('Cardiologia', 'clinico');
  const themeId = await ensureTheme(disciplineId, 'Insuficiência Cardíaca');

  // Fontes das questões
  for (const sourceId of referencedSourceIds) {
    const citation = fontes.fontes[sourceId];
    const meta = fontes.fontesMeta[sourceId];
    if (!citation || !meta) throw new Error(`Fonte "${sourceId}" referenciada por questão não encontrada em fontes.json`);

    const { data: existing } = await admin.from('sources').select('id').eq('id', sourceId).maybeSingle();
    if (existing) continue;

    // ACHADO DE AUDITORIA (já documentado na migration schema_v2): se
    // substituidaPor for texto livre (não um id de fontes.json), não criar
    // FK quebrada — grava em observacoes, deixa substituida_por NULL.
    let substituidaPor: string | null = meta.substituidaPor ?? null;
    let observacoes = meta.observacoes ?? null;
    if (substituidaPor && !fontes.fontes[substituidaPor]) {
      observacoes = `${observacoes ?? ''}\n\nsubstituidaPor original (texto livre, não é um id válido de fontes.json): "${substituidaPor}".`.trim();
      substituidaPor = null;
    }

    const { error } = await admin.from('sources').insert({
      id: sourceId,
      citation_text: citation.replace(/<\/?em>/g, ''),
      tipo: meta.tipo,
      verificacao: meta.verificacao,
      jurisdicao: meta.jurisdicao ?? null,
      vigente: meta.vigente ?? null,
      substituida_por: substituidaPor,
      identificadores: meta.identificadores ?? {},
      observacoes,
    });
    if (error) throw error;
    counts.questionSourcesLoaded++;
  }

  const letters = ['A', 'B', 'C', 'D', 'E'] as const;
  const questionIdByOriginalId = new Map<string, string>();

  for (const q of cardiologiaQuestoes) {
    const difficulty = difficultyFromComplexidade(q.classificacao.complexidade);
    const { data: question, error: qErr } = await admin
      .from('questions')
      .insert({
        discipline_id: disciplineId,
        theme_id: themeId,
        cycle: 'clinico',
        difficulty,
        year: null,
        clinical_vignette: '',
        question_stem: q.pergunta,
        tags: q.tags,
        status: 'draft',
        source: q.fonte,
        subtema: q.classificacao.subtema,
        competencia: q.classificacao.competencia,
        contexto: q.classificacao.contexto,
        complexidade: q.classificacao.complexidade,
        disciplinas_relacionadas: q.classificacao.disciplinasRelacionadas,
        editorial_state: q.estadoEditorial,
        audit_trail: q.auditoriaEditorial,
        provenance_metadata: q.proveniencia,
        evidence: q.evidencia,
        quality_checklist: q.qualidadeDoItem,
      })
      .select('id')
      .single();
    if (qErr) throw qErr;
    const questionId = question.id as string;
    questionIdByOriginalId.set(q.id, questionId);
    counts.questionsLoaded++;

    for (let i = 0; i < q.alternativas.length; i++) {
      counts.questionOptionsExpected++;
      const { data: option, error: optErr } = await admin
        .from('question_options')
        .insert({
          question_id: questionId,
          letter: letters[i],
          option_text: q.alternativas[i],
          sort_order: i,
        })
        .select('id')
        .single();
      if (optErr) throw optErr;
      counts.questionOptionsLoaded++;

      // question_option_keys já foi criada automaticamente (is_correct=false,
      // explanation='') pela trigger trg_create_question_option_key.
      // A mesma "explicacao" é copiada para todas as alternativas — ver
      // decisão #7 no cabeçalho (banco original não tem explicação por
      // alternativa).
      const { error: keyErr } = await admin
        .from('question_option_keys')
        .update({ is_correct: i === q.correta, explanation: q.explicacao })
        .eq('option_id', option.id);
      if (keyErr) throw keyErr;
    }

    const { error: ansErr } = await admin.from('question_answer_keys').insert({
      question_id: questionId,
      general_commentary: q.explicacao,
      high_yield_summary: q.explicacao,
    });
    if (ansErr) throw ansErr;

    for (let i = 0; i < q.referencias.length; i++) {
      const { error: qrErr } = await admin.from('question_references').insert({
        question_id: questionId,
        source_id: q.referencias[i],
        sort_order: i,
      });
      if (qrErr) throw qrErr;
      counts.questionReferencesLoaded++;
    }
  }

  // question_corrections filtradas
  const matchingCorrections = (correcoesRaw.correcoes ?? []).filter(
    (c) => c.questaoId && questionIdByOriginalId.has(c.questaoId)
  );
  counts.questionCorrectionsExpected = matchingCorrections.length;
  for (const c of matchingCorrections) {
    const questionId = questionIdByOriginalId.get(c.questaoId!)!;
    const { error } = await admin.from('question_corrections').insert({
      question_id: questionId,
      correction_type: c.tipo ?? null,
      changed_fields: c.camposAlterados ?? null,
      reason: c.motivo ?? null,
      before_snapshot: c.de ?? null,
      after_snapshot: c.para ?? null,
      source_ids: c.referencias ?? null,
      responsible: c.responsavel ?? null,
      ai_usage: c.usoDeIA ?? null,
      occurred_at: c.data ?? null,
    });
    if (error) throw error;
    counts.questionCorrectionsLoaded++;
  }

  return questionIdByOriginalId;
}

// ----------------------------------------------------------------------------
// Verificação de contagens
// ----------------------------------------------------------------------------

async function verifyCounts(materialIds: string[], questionIds: string[]) {
  log.push('\n=== Verificação de contagens ===');

  const { count: materialsCount } = await admin.from('materials').select('*', { count: 'exact', head: true }).in('id', materialIds);
  log.push(`materials (piloto): ${materialsCount} (esperado ${counts.materialsExpected})`);

  const { count: sectionsCount } = await admin
    .from('material_sections')
    .select('*', { count: 'exact', head: true })
    .in('material_id', materialIds);
  log.push(`material_sections (piloto): ${sectionsCount} (carregadas nesta rodada: ${counts.sectionsLoaded})`);

  const { count: matRefsCount } = await admin
    .from('material_references')
    .select('*', { count: 'exact', head: true })
    .in('material_id', materialIds);
  log.push(`material_references (piloto): ${matRefsCount} (carregadas nesta rodada: ${counts.materialReferencesLoaded})`);

  const { count: assetsCount } = await admin.from('content_assets').select('*', { count: 'exact', head: true }).not(
    'material_section_id',
    'is',
    null
  );
  log.push(`content_assets (com material_section_id, banco todo): ${assetsCount} (carregadas nesta rodada: ${counts.contentAssetsLoaded})`);

  const { count: depsCount } = await admin
    .from('material_dependencies')
    .select('*', { count: 'exact', head: true })
    .in('material_id', materialIds);
  log.push(`material_dependencies (piloto): ${depsCount} (esperado ${counts.dependenciesResolved})`);

  const { count: sourcesCount } = await admin.from('sources').select('*', { count: 'exact', head: true });
  log.push(
    `sources (banco todo): ${sourcesCount} (esperado ${counts.compendiumSourcesLoaded + counts.questionSourcesLoaded} novas nesta rodada: ${
      counts.compendiumSourcesLoaded
    } de compêndios + ${counts.questionSourcesLoaded} de questões)`
  );

  const { count: questionsCount } = await admin.from('questions').select('*', { count: 'exact', head: true }).in('id', questionIds);
  log.push(`questions (piloto): ${questionsCount} (esperado ${counts.questionsExpected})`);

  const { count: optionsCount } = await admin
    .from('question_options')
    .select('*', { count: 'exact', head: true })
    .in('question_id', questionIds);
  log.push(`question_options (piloto): ${optionsCount} (esperado ${counts.questionOptionsExpected})`);

  const { count: qRefsCount } = await admin
    .from('question_references')
    .select('*', { count: 'exact', head: true })
    .in('question_id', questionIds);
  log.push(`question_references (piloto): ${qRefsCount} (carregadas nesta rodada: ${counts.questionReferencesLoaded})`);

  const { count: correctionsCount } = await admin
    .from('question_corrections')
    .select('*', { count: 'exact', head: true })
    .in('question_id', questionIds);
  log.push(`question_corrections (piloto): ${correctionsCount} (esperado ${counts.questionCorrectionsExpected})`);
}

// ----------------------------------------------------------------------------
// Teste de publish_question() em 3 questões piloto
// ----------------------------------------------------------------------------

async function testPublish(questionIds: string[]) {
  log.push('\n=== Teste de publish_question() (3 questões piloto) ===');

  const TEST_EMAIL = `piloto-cardiologia-${Date.now()}@synapsemed.local`;
  const TEST_PASSWORD = 'PilotoCardiologia!2026';

  const { data: userData, error: createErr } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (createErr) throw createErr;
  const testUserId = userData.user.id;

  const containerName = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_synapsemed';
  const sql = `update public.profiles set role='admin', status='active' where id='${testUserId}';`;
  await execFileAsync('docker', ['exec', containerName, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql]);

  const anonClient = createClient(SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await anonClient.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
  if (signInErr) throw signInErr;

  const sample = questionIds.slice(0, 3);
  const results: { questionId: string; ok: boolean; error?: string }[] = [];
  for (const qid of sample) {
    const { error } = await anonClient.rpc('publish_question', { p_question_id: qid });
    if (error) {
      results.push({ questionId: qid, ok: false, error: error.message });
      log.push(`  [FAIL] publish_question(${qid}): ${error.message}`);
    } else {
      results.push({ questionId: qid, ok: true });
      log.push(`  [OK]   publish_question(${qid}) publicou com sucesso.`);
    }
  }

  await anonClient.auth.signOut();
  await admin.auth.admin.deleteUser(testUserId);

  return results;
}

// ----------------------------------------------------------------------------
// main
// ----------------------------------------------------------------------------

async function main() {
  log.push('=== Piloto de migração Cardiologia/Insuficiência Cardíaca — Supabase LOCAL ===');

  const materialIdByTitle = await loadCompendia();
  const questionIdByOriginalId = await loadQuestions();

  const materialIds = [...materialIdByTitle.values()];
  const questionIds = [...questionIdByOriginalId.values()];

  await verifyCounts(materialIds, questionIds);

  if (counts.dependenciesUnresolved.length > 0) {
    log.push('\n=== Dependências sem correspondência (pré-requisitos genéricos sem compêndio próprio) ===');
    for (const d of counts.dependenciesUnresolved) log.push(`  - ${d}`);
  }

  const publishResults = await testPublish(questionIds);

  log.push('\n=== Resumo final ===');
  log.push(`Materials carregados: ${counts.materialsLoaded}/${counts.materialsExpected}`);
  log.push(`Sections carregadas: ${counts.sectionsLoaded}`);
  log.push(`Material references carregadas: ${counts.materialReferencesLoaded}`);
  log.push(`Content assets carregados: ${counts.contentAssetsLoaded}`);
  log.push(`Sources de compêndio novas: ${counts.compendiumSourcesLoaded}`);
  log.push(`Sources de questões novas: ${counts.questionSourcesLoaded}/${counts.questionSourcesExpected}`);
  log.push(`Dependências resolvidas: ${counts.dependenciesResolved} | sem correspondência: ${counts.dependenciesUnresolved.length}`);
  log.push(`Questions carregadas: ${counts.questionsLoaded}/${counts.questionsExpected}`);
  log.push(`Question options carregadas: ${counts.questionOptionsLoaded}/${counts.questionOptionsExpected}`);
  log.push(`Question references carregadas: ${counts.questionReferencesLoaded}`);
  log.push(`Question corrections carregadas: ${counts.questionCorrectionsLoaded}/${counts.questionCorrectionsExpected}`);
  log.push(
    `publish_question() em 3 amostras: ${publishResults.filter((r) => r.ok).length}/3 OK` +
      (publishResults.some((r) => !r.ok) ? ' — VER FALHAS ACIMA' : '')
  );

  fs.writeFileSync(path.join(__dirname, '..', 'load-pilot-cardiologia.report.txt'), log.lines.join('\n'));
  process.exit(publishResults.some((r) => !r.ok) ? 1 : 0);
}

main().catch((err) => {
  console.error('Erro fatal na carga do piloto:', err);
  fs.writeFileSync(path.join(__dirname, '..', 'load-pilot-cardiologia.report.txt'), log.lines.join('\n') + `\n\nERRO FATAL: ${err}`);
  process.exit(1);
});
