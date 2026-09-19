/**
 * Recuperação idempotente de `sources`/`question_references` para questões
 * JÁ CARREGADAS no Supabase (via `scripts/load-questoes.ts`, ANTES da
 * correção de 2026-09-07 que passou a gravar essas tabelas na carga).
 *
 * Este script NÃO recarrega questões, não altera `questions`,
 * `question_options`, `question_option_keys` nem `question_answer_keys` —
 * só lê essas tabelas para localizar a questão correspondente, e só grava
 * em `sources`/`question_references`. IDs, respostas, listas e histórico
 * (question_attempts, error_notebook, question_reactions, feedback etc.)
 * não são tocados.
 *
 * CASAMENTO questão-do-acervo <-> linha-no-Supabase: pela mesma chave exata
 * já usada por load-questoes.ts para idempotência —
 * (discipline_id, theme_id, question_stem), com question_stem comparado por
 * IGUALDADE TOTAL (não ILIKE, não "contém", não por título/palavras-chave).
 * Isso NÃO é matching fuzzy por título: é a mesma combinação exata que já
 * decide "esta questão já existe" na carga original. Uma questão do acervo
 * sem correspondência exata é reportada como "não encontrada" e pulada —
 * nunca associada à linha mais parecida.
 *
 * Idempotência: vínculos existentes são preservados e apenas os ausentes
 * são inseridos, permitindo retomar uma execução parcial sem duplicação.
 * Fontes existentes são preservadas (mesma lógica de
 * `load-pilot-cardiologia.ts`/`load-questoes.ts`): fonte já existente não é
 * regravada.
 *
 * Modo padrão: --dry-run (não grava nada, só relatório de correspondência).
 * --execute grava de verdade, e mesmo assim só contra o Supabase LOCAL por
 * padrão (mesma trava de load-questoes.ts — sobrescrever
 * VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nas envs do comando; passar
 * --allow-remote para rodar contra o remoto de propósito).
 *
 * Uso:
 *   npx tsx scripts/recover-question-references.ts                # dry-run
 *   npx tsx scripts/recover-question-references.ts --execute       # grava (local)
 */

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

const EXECUTE = process.argv.includes('--execute');
const ALLOW_REMOTE = process.argv.includes('--allow-remote');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ONEDRIVE = 'C:\\Users\\vinic\\OneDrive';
const BANCO_DIR = process.env.NEXUSMED_BANCO_DIR ?? path.join(ONEDRIVE, 'Questões', '_banco');

const log = {
  lines: [] as string[],
  push(s: string) {
    this.lines.push(s);
    console.log(s);
  },
};

interface BancoQuestao {
  id: string;
  pergunta: string;
  referencias: string[];
  classificacao: { disciplina: string; tema: string };
}

interface FontesJson {
  fontes: Record<string, string>;
  fontesMeta: Record<
    string,
    {
      tipo: string;
      verificacao: string;
      identificadores?: Record<string, string>;
      jurisdicao?: string | null;
      vigente?: boolean | null;
      substituidaPor?: string | null;
      observacoes?: string | null;
    }
  >;
}

const seenSources = new Set<string>();

async function ensureSource(sourceId: string, fontes: FontesJson): Promise<'criada' | 'ja-existia' | 'gap-fontes-json'> {
  const citation = fontes.fontes[sourceId];
  const meta = fontes.fontesMeta[sourceId];
  if (!citation || !meta) return 'gap-fontes-json';

  if (seenSources.has(sourceId)) return 'ja-existia';

  const { data: existing, error: selErr } = await admin.from('sources').select('id').eq('id', sourceId).maybeSingle();
  if (selErr) throw selErr;
  seenSources.add(sourceId);
  if (existing) return 'ja-existia';
  if (!EXECUTE) return 'criada';

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
  return 'criada';
}

const counts = {
  questoesNoAcervo: 0,
  semReferenciasNoAcervo: 0, // q.referencias vazio — nada a recuperar, não é pendência
  naoEncontradaNoSupabase: 0, // discipline/theme/stem não bateu com nenhuma linha
  jaTinhaReferencias: 0, // question_references já populado — pulada (idempotência)
  recuperada: 0, // question_references inserido nesta rodada
  sourcesCriadas: 0,
  sourcesJaExistiam: 0,
  sourcesGapFontesJson: new Set<string>(),
  questionReferencesInseridas: 0,
};

const naoEncontradas: string[] = [];

async function main() {
  log.push(`=== Recuperação de question_references (${EXECUTE ? 'EXECUTE — grava de verdade' : 'DRY-RUN — não grava nada'}) ===`);
  log.push(`Supabase alvo: ${SUPABASE_URL}`);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(SUPABASE_URL).hostname) && !ALLOW_REMOTE) {
    throw new Error(
      `SUPABASE_URL (${SUPABASE_URL}) não é local — por padrão este script só conecta no local, nem em dry-run. Rode contra local assim: VITE_SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<chave local> npx tsx scripts/recover-question-references.ts. Para rodar contra remoto de propósito, passe --allow-remote explicitamente. Abortando antes de qualquer chamada de rede.`
    );
  }

  const banco: { questoes: BancoQuestao[] } = JSON.parse(
    fs.readFileSync(path.join(BANCO_DIR, 'banco-questoes.json'), 'utf8')
  );
  const fontes: FontesJson = JSON.parse(fs.readFileSync(path.join(BANCO_DIR, 'fontes.json'), 'utf8'));
  counts.questoesNoAcervo = banco.questoes.length;
  log.push(`Questões no acervo (banco-questoes.json): ${banco.questoes.length}`);

  const disciplineIdByName = new Map<string, string | null>();
  const themeIdByKey = new Map<string, string | null>();

  for (const q of banco.questoes) {
    if (!q.referencias || q.referencias.length === 0) {
      counts.semReferenciasNoAcervo++;
      continue;
    }

    const disciplinaNome = q.classificacao.disciplina;
    const temaNome = q.classificacao.tema;

    let disciplineId = disciplineIdByName.get(disciplinaNome);
    if (disciplineId === undefined) {
      const { data, error } = await admin.from('disciplines').select('id').ilike('name', disciplinaNome).maybeSingle();
      if (error) throw error;
      disciplineId = data?.id ?? null;
      disciplineIdByName.set(disciplinaNome, disciplineId ?? null);
    }
    if (!disciplineId) {
      counts.naoEncontradaNoSupabase++;
      naoEncontradas.push(`"${q.id}" — disciplina "${disciplinaNome}" não existe no Supabase (questão nunca foi carregada).`);
      continue;
    }

    const themeKey = `${disciplineId}::${temaNome}`;
    let themeId = themeIdByKey.get(themeKey);
    if (themeId === undefined) {
      const { data, error } = await admin
        .from('themes')
        .select('id')
        .eq('discipline_id', disciplineId)
        .eq('name', temaNome)
        .maybeSingle();
      if (error) throw error;
      themeId = data?.id ?? null;
      themeIdByKey.set(themeKey, themeId ?? null);
    }
    if (!themeId) {
      counts.naoEncontradaNoSupabase++;
      naoEncontradas.push(`"${q.id}" — tema "${temaNome}" (disciplina "${disciplinaNome}") não existe no Supabase.`);
      continue;
    }

    // Casamento exato — igualdade total de question_stem, nunca ILIKE/contains.
    const { data: questionRow, error: qSelErr } = await admin
      .from('questions')
      .select('id')
      .eq('discipline_id', disciplineId)
      .eq('theme_id', themeId)
      .eq('question_stem', q.pergunta)
      .maybeSingle();
    if (qSelErr) throw qSelErr;
    if (!questionRow) {
      counts.naoEncontradaNoSupabase++;
      naoEncontradas.push(`"${q.id}" — sem linha correspondente exata em questions (discipline_id/theme_id/question_stem). Questão ainda não carregada, ou question_stem diverge do acervo.`);
      continue;
    }
    const questionId = questionRow.id as string;

    const { data: existingRefs, error: existingErr } = await admin
      .from('question_references').select('source_id').eq('question_id', questionId);
    if (existingErr) throw existingErr;
    const existingSourceIds = new Set((existingRefs ?? []).map((r) => r.source_id));
    if ([...new Set(q.referencias)].every((id) => existingSourceIds.has(id))) {
      counts.jaTinhaReferencias++;
      continue;
    }

    let recuperouAlgo = false;
    for (let i = 0; i < q.referencias.length; i++) {
      const sourceId = q.referencias[i];
      if (existingSourceIds.has(sourceId)) continue;
      const sourceResult = await ensureSource(sourceId, fontes);
      if (sourceResult === 'criada') counts.sourcesCriadas++;
      else if (sourceResult === 'ja-existia') counts.sourcesJaExistiam++;
      else {
        counts.sourcesGapFontesJson.add(sourceId);
        log.push(`  [GAP] fonte "${sourceId}" referenciada por "${q.id}" não encontrada em fontes.json — não inserida em question_references.`);
        continue;
      }

      if (EXECUTE) {
        const { error: qrErr } = await admin.from('question_references').upsert({
          question_id: questionId,
          source_id: sourceId,
          sort_order: i,
        }, { onConflict: 'question_id,source_id', ignoreDuplicates: true });
        if (qrErr) throw qrErr;
      }
      existingSourceIds.add(sourceId);
      counts.questionReferencesInseridas++;
      recuperouAlgo = true;
    }
    if (recuperouAlgo) counts.recuperada++;
  }

  log.push('\n=== Resumo ===');
  log.push(`Questões no acervo: ${counts.questoesNoAcervo}`);
  log.push(`Sem referências no acervo (nada a recuperar): ${counts.semReferenciasNoAcervo}`);
  log.push(`Não encontradas no Supabase (não carregadas, ou question_stem divergente): ${counts.naoEncontradaNoSupabase}`);
  log.push(`Já tinham question_references (puladas — idempotência): ${counts.jaTinhaReferencias}`);
  log.push(`Recuperadas${EXECUTE ? '' : ' (simulado)'}: ${counts.recuperada}`);
  log.push(`question_references inseridas${EXECUTE ? '' : ' (simulado)'}: ${counts.questionReferencesInseridas}`);
  log.push(`Sources únicas criadas${EXECUTE ? '' : ' (simulado)'}: ${counts.sourcesCriadas}`);
  log.push(`Sources já existentes (reaproveitadas): ${counts.sourcesJaExistiam}`);
  log.push(`Gaps — id de fonte referenciado mas ausente em fontes.json: ${counts.sourcesGapFontesJson.size}`);
  [...counts.sourcesGapFontesJson].forEach((s) => log.push(`  - ${s}`));

  if (naoEncontradas.length > 0) {
    log.push(`\n=== Questões não encontradas no Supabase (detalhe) ===`);
    naoEncontradas.forEach((n) => log.push(`  - ${n}`));
  }

  const coberturaPct =
    counts.questoesNoAcervo - counts.semReferenciasNoAcervo > 0
      ? (((counts.recuperada + counts.jaTinhaReferencias) / (counts.questoesNoAcervo - counts.semReferenciasNoAcervo)) * 100).toFixed(1)
      : '0.0';
  log.push(`\nCobertura de question_references sobre questões-com-referência-no-acervo: ${coberturaPct}% (${counts.recuperada + counts.jaTinhaReferencias}/${counts.questoesNoAcervo - counts.semReferenciasNoAcervo})`);

  const reportPath = path.join(__dirname, '..', `recover-question-references.${EXECUTE ? 'execute' : 'dry-run'}.report.txt`);
  fs.writeFileSync(reportPath, log.lines.join('\n'));
  log.push(`\nRelatório salvo em: ${reportPath}`);
  if (counts.sourcesGapFontesJson.size || counts.naoEncontradaNoSupabase) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
