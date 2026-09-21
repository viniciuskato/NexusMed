import fs from 'node:fs';

const repo = 'C:/Users/vinic/dev/NexusMed/firebase-auth';
const envText = fs.readFileSync(`${repo}/.env.local`, 'utf8');
const env = Object.fromEntries(
  envText.split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
    const i = line.indexOf('=');
    return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
  }),
);
const base = env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error('Configuração somente-leitura do Supabase ausente.');

async function rows(table, select = '*') {
  const response = await fetch(`${base}/rest/v1/${table}?select=${encodeURIComponent(select)}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Range: '0-9999' },
  });
  if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
  return response.json();
}

const [materials, sections, references, disciplines, themes] = await Promise.all([
  rows('materials'), rows('material_sections'), rows('material_references'), rows('disciplines'), rows('themes'),
]);

const stripHtml = (value = '') => value
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&[a-z]+;|&#\d+;/gi, ' ')
  .replace(/\s+/g, ' ').trim();
const normalize = (value = '') => stripHtml(value).toLocaleLowerCase('pt-BR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const words = (value = '') => normalize(value).split(/\s+/).filter(Boolean);
const englishMarkers = new Set('the of and to in is are with for from that this as by on or which without when between into while its it an a has have was were can only finds answer section overview introduction summary clinical anatomy cardiac heart blood supply system structure function key takeaways learning objectives'.split(' '));
const portugueseMarkers = new Set('o a os as de do da dos das e em é são com para por que este esta como ou qual sem quando entre sua seu um uma tem pode apenas seção resumo introdução anatomia cardíaca coração sangue sistema estrutura função principais objetivos aprendizagem'.split(' '));
const languageScore = (value = '') => {
  const ws = words(value);
  const en = ws.filter((w) => englishMarkers.has(w)).length;
  const pt = ws.filter((w) => portugueseMarkers.has(w)).length;
  return { en, pt, ratio: ws.length ? en / ws.length : 0, wordCount: ws.length };
};

const matrix = materials.map((material) => {
  const ss = sections.filter((s) => s.material_id === material.id).sort((a, b) => a.sort_order - b.sort_order);
  const rr = references.filter((r) => r.material_id === material.id);
  const didactic = [material.title, material.subtitle, ...ss.flatMap((s) => [s.title, s.content, ...(s.key_takeaways || []), s.clinical_pearl, s.warning_alert])].filter(Boolean).join(' ');
  const lang = languageScore(didactic);
  const contentGroups = new Map();
  for (const section of ss) {
    const key = normalize(section.content);
    if (key) contentGroups.set(key, [...(contentGroups.get(key) || []), section.title]);
  }
  const duplicateGroups = [...contentGroups.values()].filter((group) => group.length > 1);
  const emptySections = ss.filter((s) => stripHtml(s.content).length === 0).map((s) => s.title);
  const shortSections = ss.filter((s) => words(s.content).length > 0 && words(s.content).length < 80).map((s) => ({ title: s.title, words: words(s.content).length }));
  const placeholders = ss.filter((s) => /\b(?:todo|tbd|lorem ipsum|undefined|null|inserir|preencher)\b/i.test(stripHtml(s.content))).map((s) => s.title);
  const mojibake = /(?:Ã.|Â.|â€|�)/.test(didactic);
  const explicitEnglish = lang.wordCount >= 100 && lang.en >= 20 && lang.en > lang.pt * 2;
  return {
    id: material.id,
    title: material.title,
    status: material.status,
    sections: ss.length,
    references: rr.length,
    sourceLinkedReferences: rr.filter((r) => r.source_id).length,
    urlReferences: rr.filter((r) => r.url).length,
    inlineAuthorYearCitations: (didactic.match(/(?:\(|\b)[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç-]+(?:\s+(?:et al\.|e|&|;)[^)]*)?,?\s+(?:19|20)\d{2}/g) || []).length,
    inlineCitationAnchors: (didactic.match(/class=["']cite["']/gi) || []).length,
    missingMetadata: ['author', 'provenance', 'source', 'license'].filter((field) => !material[field]),
    words: lang.wordCount,
    language: explicitEnglish ? 'ENGLISH' : (lang.en > lang.pt && lang.en >= 8 ? 'REVIEW' : 'PT_BR'),
    emptySections,
    shortSections,
    duplicateGroups,
    placeholders,
    mojibake,
    sectionTitles: ss.map((s) => s.title),
  };
}).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));

const target = process.argv[2];
if (target === '--taxonomy-stats') {
  console.log(JSON.stringify({
    counts: { disciplines: disciplines.length, themes: themes.length, materials: materials.length },
    unusedThemes: themes.filter((theme) => !materials.some((material) => material.theme_id === theme.id)).map((theme) => theme.name),
    disciplineCounts: disciplines.map((discipline) => ({
      name: discipline.name, cycle: discipline.cycle,
      materials: materials.filter((material) => material.discipline_id === discipline.id).length,
      themes: themes.filter((theme) => theme.discipline_id === discipline.id).length,
    })),
  }, null, 2));
} else if (target === '--taxonomy') {
  const disciplineById = new Map(disciplines.map((row) => [row.id, row]));
  const themeById = new Map(themes.map((row) => [row.id, row]));
  console.log(JSON.stringify({
    disciplines: disciplines.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    themes: themes.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    unusedThemes: themes.filter((theme) => !materials.some((material) => material.theme_id === theme.id)).map((theme) => theme.name),
    disciplineCounts: disciplines.map((discipline) => ({
      name: discipline.name,
      cycle: discipline.cycle,
      materials: materials.filter((material) => material.discipline_id === discipline.id).length,
      themes: themes.filter((theme) => theme.discipline_id === discipline.id).length,
    })),
    materials: materials.map((material) => ({
      id: material.id,
      title: material.title,
      discipline: disciplineById.get(material.discipline_id)?.name ?? null,
      theme: themeById.get(material.theme_id)?.name ?? null,
      mode: material.mode,
      study_lens: material.study_lens,
      tags: material.tags,
      status: material.status,
    })).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')),
  }, null, 2));
} else if (target === '--compact') {
  console.log(JSON.stringify({
    counts: { materials: materials.length, sections: sections.length, references: references.length },
    totals: {
      emptySections: matrix.reduce((n, m) => n + m.emptySections.length, 0),
      shortSections: matrix.reduce((n, m) => n + m.shortSections.length, 0),
      sourceLinkedReferences: matrix.reduce((n, m) => n + m.sourceLinkedReferences, 0),
      englishMaterials: matrix.filter((m) => m.language === 'ENGLISH').length,
      languageReview: matrix.filter((m) => m.language === 'REVIEW').length,
      mojibakeMaterials: matrix.filter((m) => m.mojibake).length,
    },
    materials: matrix.map((m) => ({
      id: m.id, title: m.title, status: m.status, sections: m.sections, references: m.references,
      words: m.words, language: m.language, emptySections: m.emptySections,
      duplicateGroups: m.duplicateGroups, mojibake: m.mojibake,
      sourceLinkedReferences: m.sourceLinkedReferences, urlReferences: m.urlReferences,
      inlineAuthorYearCitations: m.inlineAuthorYearCitations, inlineCitationAnchors: m.inlineCitationAnchors,
      missingMetadata: m.missingMetadata,
    })),
  }, null, 2));
} else if (target) {
  const found = materials.find((m) => m.id === target || m.title.toLocaleLowerCase('pt-BR').includes(target.toLocaleLowerCase('pt-BR')));
  if (!found) throw new Error(`Material não encontrado: ${target}`);
  console.log(JSON.stringify({
    material: found,
    sections: sections.filter((s) => s.material_id === found.id).sort((a, b) => a.sort_order - b.sort_order),
    references: references.filter((r) => r.material_id === found.id).sort((a, b) => a.sort_order - b.sort_order),
  }, null, 2));
} else {
  console.log(JSON.stringify({ counts: { materials: materials.length, sections: sections.length, references: references.length }, matrix }, null, 2));
}
