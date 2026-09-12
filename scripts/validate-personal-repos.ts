/**
 * Fase 4 — validação real das 8 implementações Supabase de dados pessoais
 * (Answers, ErrorNotebook, Flashcards, Bookmarks, Notes, ReadingProgress,
 * Simulados, Feedback) contra o Supabase LOCAL (Docker, `supabase start`).
 *
 * Roda fora do app Vite: `npx tsx scripts/validate-personal-repos.ts`.
 *
 * Mesmo padrão de `scripts/validate-supabase-repos.ts` (Fase 3):
 *  1. Cria 2 usuários de teste via GoTrue admin API (service_role) e promove
 *     ambos a role='student'/status='active' em public.profiles (via
 *     docker exec psql -U postgres, contornando o bootstrap — ver comentário
 *     detalhado no script da Fase 3).
 *  2. Semeia conteúdo editorial mínimo (discipline, theme, material
 *     published, question com 3 alternativas) via service_role, e publica a
 *     questão via docker exec psql -U postgres (current_user='postgres'
 *     satisfaz a exceção do trigger guard_question_publish sem precisar
 *     passar por publish_question(), que exigiria um admin autenticado).
 *  3. Autentica o usuário 1 via signInWithPassword usando o cliente anon
 *     (`src/lib/supabaseClient.ts`) — o mesmo usado pelos repositórios.
 *  4. Exercita create/read/update/delete (ou os métodos equivalentes da
 *     interface) dos 8 domínios de dados pessoais.
 *  5. Autentica o usuário 2 e confirma que RLS isola os dados do usuário 1
 *     (isolamento ENTRE usuários, não só bloqueio anônimo).
 *  6. Limpa os dados de teste no final (best-effort, via service_role).
 */

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

// Importado DEPOIS de popular process.env, pois supabaseClient.ts lê o
// ambiente no momento do import (top-level).
const { supabase } = await import('../src/lib/supabaseClient.js');
const { SupabaseAnswersRepository } = await import('../src/repositories/SupabaseAnswersRepository.js');
const { SupabaseErrorNotebookRepository } = await import('../src/repositories/SupabaseErrorNotebookRepository.js');
const { SupabaseFlashcardsRepository } = await import('../src/repositories/SupabaseFlashcardsRepository.js');
const { SupabaseBookmarksRepository } = await import('../src/repositories/SupabaseBookmarksRepository.js');
const { SupabaseNotesRepository } = await import('../src/repositories/SupabaseNotesRepository.js');
const { SupabaseReadingProgressRepository } = await import('../src/repositories/SupabaseReadingProgressRepository.js');
const { SupabaseSimuladosRepository } = await import('../src/repositories/SupabaseSimuladosRepository.js');
const { SupabaseFeedbackRepository } = await import('../src/repositories/SupabaseFeedbackRepository.js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
// service_role key padrão de dev do Supabase CLI local — NÃO É SEGREDO REAL,
// só funciona contra instâncias locais.
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const answersRepo = new SupabaseAnswersRepository();
const errorNotebookRepo = new SupabaseErrorNotebookRepository();
const flashcardsRepo = new SupabaseFlashcardsRepository();
const bookmarksRepo = new SupabaseBookmarksRepository();
const notesRepo = new SupabaseNotesRepository();
const readingProgressRepo = new SupabaseReadingProgressRepository();
const simuladosRepo = new SupabaseSimuladosRepository();
const feedbackRepo = new SupabaseFeedbackRepository();

type StepResult = { name: string; ok: boolean; detail?: string };
const results: StepResult[] = [];

function record(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  const icon = ok ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${name}${detail ? ' — ' + detail : ''}`);
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const anyErr = err as Record<string, unknown>;
    const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code]
      .filter((v) => v !== undefined && v !== null && v !== '')
      .map(String);
    if (parts.length > 0) return parts.join(' | ');
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

let stopRequested = false;

async function step<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  if (stopRequested) return undefined;
  try {
    const value = await fn();
    record(name, true);
    return value;
  } catch (err) {
    record(name, false, stringifyError(err));
    stopRequested = true;
    return undefined;
  }
}

async function promoteProfile(userId: string) {
  const containerName = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_synapsemed';
  const sql = `update public.profiles set role='student', status='active' where id='${userId}';`;
  const { stderr } = await execFileAsync('docker', [
    'exec',
    containerName,
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  ]);
  if (stderr && /error/i.test(stderr)) throw new Error(stderr);
}

async function publishQuestion(questionId: string) {
  const containerName = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_synapsemed';
  const sql = `update public.questions set status='published' where id='${questionId}';`;
  const { stderr } = await execFileAsync('docker', [
    'exec',
    containerName,
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  ]);
  if (stderr && /error/i.test(stderr)) throw new Error(stderr);
}

const TEST_EMAIL_1 = `fase4-validation-1-${Date.now()}@synapsemed.local`;
const TEST_EMAIL_2 = `fase4-validation-2-${Date.now()}@synapsemed.local`;
const TEST_PASSWORD = 'Fase4Validacao!2026';

let testUserId1: string | null = null;
let testUserId2: string | null = null;

const ids = {
  disciplineId: crypto.randomUUID(),
  themeId: crypto.randomUUID(),
  materialId: crypto.randomUUID(),
  questionId: crypto.randomUUID(),
  optionA: '',
  optionB: '',
  optionC: '',
};

async function cleanup() {
  console.log('\n--- Limpeza (best-effort, via service_role) ---');
  // Apagar os usuários de teste primeiro: cascade em profiles + em TODAS as
  // tabelas de dados pessoais (user_id references auth.users(id) on delete
  // cascade), então isso já limpa flashcards/bookmarks/notes/reading_progress/
  // question_attempts/error_notebook/simulations/feedback sem mais nenhum
  // comando.
  const tryDelete = async (fn: () => PromiseLike<unknown>) => {
    try {
      await fn();
    } catch {
      // best-effort
    }
  };

  if (testUserId1) await tryDelete(() => admin.auth.admin.deleteUser(testUserId1!));
  if (testUserId2) await tryDelete(() => admin.auth.admin.deleteUser(testUserId2!));

  // Conteúdo editorial: ordem que respeita as FKs "on delete restrict".
  // Questão published não pode ser excluída (trg_guard_question_delete, sem
  // exceção nem para postgres/service_role) — precisa voltar a 'draft'
  // primeiro. Mudar só o status (sem tocar conteúdo) não esbarra em
  // guard_question_content_immutable.
  await tryDelete(() => admin.from('questions').update({ status: 'draft' }).eq('id', ids.questionId));
  await tryDelete(() => admin.from('questions').delete().eq('id', ids.questionId));
  await tryDelete(() => admin.from('materials').delete().eq('id', ids.materialId));
  await tryDelete(() => admin.from('themes').delete().eq('id', ids.themeId));
  await tryDelete(() => admin.from('disciplines').delete().eq('id', ids.disciplineId));
}

async function main() {
  console.log('=== Fase 4 — validação Supabase repos de dados pessoais (local) ===\n');

  // ---- Setup: usuário 1 + conteúdo editorial -------------------------------
  await step('1. Criar usuário de teste 1 via GoTrue admin API', async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL_1,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    testUserId1 = data.user.id;
  });
  if (!testUserId1) return finish();

  await step('2. Promover perfil 1 a student/active (docker exec psql -U postgres)', async () => {
    await promoteProfile(testUserId1!);
  });

  await step('3. Autenticar usuário 1 via signInWithPassword (cliente anon)', async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: TEST_EMAIL_1, password: TEST_PASSWORD });
    if (error) throw error;
  });

  await step('4. Semear discipline/theme/material (published) via service_role', async () => {
    const { error: dErr } = await admin.from('disciplines').insert({
      id: ids.disciplineId,
      name: 'Cardiologia (Validação Fase 4)',
      code: `CARD-VAL4-${Date.now()}`,
      cycle: 'clinico',
    });
    if (dErr) throw dErr;

    const { error: tErr } = await admin.from('themes').insert({
      id: ids.themeId,
      discipline_id: ids.disciplineId,
      name: 'Arritmias (Validação Fase 4)',
    });
    if (tErr) throw tErr;

    const { error: mErr } = await admin.from('materials').insert({
      id: ids.materialId,
      discipline_id: ids.disciplineId,
      theme_id: ids.themeId,
      title: 'Atlas de Arritmias (Validação Fase 4)',
      status: 'published',
    });
    if (mErr) throw mErr;
  });

  await step('5. Semear question (draft) + 3 alternativas via service_role', async () => {
    const { error: qErr } = await admin.from('questions').insert({
      id: ids.questionId,
      discipline_id: ids.disciplineId,
      theme_id: ids.themeId,
      material_id: ids.materialId,
      cycle: 'clinico',
      difficulty: 'medio',
      institution: 'USP (Validação Fase 4)',
      year: 2026,
      clinical_vignette: 'Vinheta clínica de teste (Fase 4).',
      question_stem: 'Enunciado de teste (Fase 4)?',
      tags: ['fase4', 'validacao'],
      status: 'draft',
    });
    if (qErr) throw qErr;

    const { data: options, error: oErr } = await admin
      .from('question_options')
      .insert([
        { question_id: ids.questionId, letter: 'A', option_text: 'Alternativa A (incorreta)', sort_order: 0 },
        { question_id: ids.questionId, letter: 'B', option_text: 'Alternativa B (correta)', sort_order: 1 },
        { question_id: ids.questionId, letter: 'C', option_text: 'Alternativa C (incorreta)', sort_order: 2 },
      ])
      .select('*');
    if (oErr) throw oErr;

    ids.optionA = options!.find((o) => o.letter === 'A')!.id;
    ids.optionB = options!.find((o) => o.letter === 'B')!.id;
    ids.optionC = options!.find((o) => o.letter === 'C')!.id;

    // trg_create_question_option_key já criou 1 linha em question_option_keys
    // por opção (is_correct=false, explanation=''); aqui só marcamos B como
    // correta e preenchemos as explicações.
    for (const [optionId, isCorrect, explanation] of [
      [ids.optionA, false, 'Explicação A'],
      [ids.optionB, true, 'Explicação B'],
      [ids.optionC, false, 'Explicação C'],
    ] as const) {
      const { error } = await admin
        .from('question_option_keys')
        .update({ is_correct: isCorrect, explanation })
        .eq('option_id', optionId);
      if (error) throw error;
    }

    const { error: akErr } = await admin.from('question_answer_keys').insert({
      question_id: ids.questionId,
      general_commentary: 'Comentário geral de teste (Fase 4).',
      high_yield_summary: 'Resumo de alto rendimento de teste (Fase 4).',
    });
    if (akErr) throw akErr;
  });

  await step('6. Publicar a questão (docker exec psql -U postgres)', async () => {
    await publishQuestion(ids.questionId);
  });

  // ---- AnswersRepository + ErrorNotebookRepository -------------------------
  await step('7. AnswersRepository.recordAnswer (RPC submit_question_attempt, resposta incorreta)', async () => {
    await answersRepo.recordAnswer({
      questionId: ids.questionId,
      selectedOption: 'A',
      isCorrect: false, // ignorado — servidor recalcula a partir do gabarito
      timestamp: new Date().toISOString(), // ignorado — servidor usa now()
      timeSpentSeconds: 42,
      errorReason: 'lacuna_teorica',
      userNotes: 'Nota de teste',
    });
  });

  await step('8. AnswersRepository.getAnswers round-trip (isCorrect=false, selectedOption=A)', async () => {
    const answers = await answersRepo.getAnswers();
    const rec = answers[ids.questionId];
    if (!rec) throw new Error('resposta não encontrada em getAnswers()');
    if (rec.isCorrect !== false) throw new Error(`esperava isCorrect=false, achou ${rec.isCorrect}`);
    if (rec.selectedOption !== 'A') throw new Error(`esperava selectedOption=A, achou ${rec.selectedOption}`);
    if (rec.timeSpentSeconds !== 42) throw new Error(`timeSpentSeconds não bateu: ${rec.timeSpentSeconds}`);
  });

  await step('9. ErrorNotebookRepository.getErrorLogs (populado automaticamente pela RPC)', async () => {
    const logs = await errorNotebookRepo.getErrorLogs();
    const log = logs.find((l) => l.questionId === ids.questionId);
    if (!log) throw new Error('error_notebook não populado após resposta incorreta');
    if (log.selectedOption !== 'A' || log.correctOption !== 'B') {
      throw new Error(`letras não bateram: selected=${log.selectedOption} correct=${log.correctOption}`);
    }
    if (log.resolved !== false) throw new Error('esperava resolved=false recém-criado');
  });

  await step('10. ErrorNotebookRepository.updateErrorLog (resolved/user_notes apenas)', async () => {
    const logs = await errorNotebookRepo.getErrorLogs();
    const log = logs.find((l) => l.questionId === ids.questionId)!;
    await errorNotebookRepo.updateErrorLog({ ...log, resolved: true, userNotes: 'Revisado no teste' });
    const after = await errorNotebookRepo.getErrorLogs();
    const updated = after.find((l) => l.questionId === ids.questionId)!;
    if (updated.resolved !== true) throw new Error('resolved não persistiu');
    if (updated.userNotes !== 'Revisado no teste') throw new Error('userNotes não persistiu');
  });

  // ---- FlashcardsRepository -------------------------------------------------
  const fakeQuestion = {
    id: ids.questionId,
    disciplineId: ids.disciplineId,
    themeId: ids.themeId,
    compendiumRefId: ids.materialId,
    cycle: 'clinico' as const,
    difficulty: 'medio' as const,
    institution: 'USP (Validação Fase 4)',
    year: 2026,
    clinicalVignette: 'Vinheta clínica de teste (Fase 4).',
    questionStem: 'Enunciado de teste (Fase 4)?',
    options: [
      { letter: 'A' as const, text: 'Alternativa A (incorreta)', isCorrect: false, explanation: 'Explicação A' },
      { letter: 'B' as const, text: 'Alternativa B (correta)', isCorrect: true, explanation: 'Explicação B' },
      { letter: 'C' as const, text: 'Alternativa C (incorreta)', isCorrect: false, explanation: 'Explicação C' },
    ],
    generalCommentary: 'Comentário geral de teste (Fase 4).',
    highYieldSummary: 'Resumo de alto rendimento de teste (Fase 4).',
    tags: ['fase4', 'validacao'],
  };

  const flashcard = await step('11. FlashcardsRepository.createFlashcardFromQuestion', async () => {
    const card = await flashcardsRepo.createFlashcardFromQuestion(fakeQuestion);
    if (!card.tags.includes('Gerado de Questão')) throw new Error('tag "Gerado de Questão" ausente');
    if (card.srs.state !== 'new') throw new Error(`esperava state=new, achou ${card.srs.state}`);
    return card;
  });
  if (!flashcard) return finish();

  await step('12. FlashcardsRepository.getFlashcards round-trip', async () => {
    const all = await flashcardsRepo.getFlashcards();
    const found = all.find((c) => c.id === flashcard.id);
    if (!found) throw new Error('flashcard não encontrado após criação');
    if (found.front !== flashcard.front) throw new Error('front não bateu no round-trip');
  });

  await step('13. FlashcardsRepository.saveFlashcard (update)', async () => {
    await flashcardsRepo.saveFlashcard({ ...flashcard, front: 'Frente editada (Fase 4)' });
    const all = await flashcardsRepo.getFlashcards();
    const found = all.find((c) => c.id === flashcard.id);
    if (!found || found.front !== 'Frente editada (Fase 4)') throw new Error('update não persistiu');
  });

  await step('14. FlashcardsRepository.reviewFlashcard (rating=3, SM-2 real)', async () => {
    const reviewed = await flashcardsRepo.reviewFlashcard(flashcard.id, 3);
    if (!reviewed) throw new Error('reviewFlashcard retornou null');
    if (reviewed.srs.state === 'new') throw new Error('estado não avançou após revisão');
    if (reviewed.srs.reviewHistory.length !== 1) {
      throw new Error(`esperava 1 entrada em reviewHistory, achou ${reviewed.srs.reviewHistory.length}`);
    }
  });

  await step('15. FlashcardsRepository.getDueFlashcards exclui card recém-revisado (vencimento futuro)', async () => {
    const due = await flashcardsRepo.getDueFlashcards();
    if (due.some((c) => c.id === flashcard.id)) {
      throw new Error('card revisado com vencimento futuro não deveria estar na lista de devidos');
    }
  });

  await step('16. FlashcardsRepository.updateFlashcardSRS força vencimento (volta à lista de devidos)', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await flashcardsRepo.updateFlashcardSRS(flashcard.id, {
      intervalDays: 0,
      repetitionCount: 0,
      easeFactor: 2.5,
      nextDueDate: yesterday,
      state: 'learning',
      reviewHistory: [],
    });
    const due = await flashcardsRepo.getDueFlashcards();
    if (!due.some((c) => c.id === flashcard.id)) throw new Error('card não voltou à lista de devidos após update');
  });

  // ---- BookmarksRepository ----------------------------------------------
  await step('17. BookmarksRepository.toggleBookmark (adicionar questão + compêndio)', async () => {
    const addedQuestion = await bookmarksRepo.toggleBookmark('questions', ids.questionId);
    if (addedQuestion !== true) throw new Error('esperava true ao adicionar bookmark de questão');
    const addedCompendium = await bookmarksRepo.toggleBookmark('compendiums', ids.materialId);
    if (addedCompendium !== true) throw new Error('esperava true ao adicionar bookmark de compêndio');
  });

  await step('18. BookmarksRepository.getBookmarks round-trip', async () => {
    const bm = await bookmarksRepo.getBookmarks();
    if (!bm.questions.includes(ids.questionId)) throw new Error('questão não encontrada em bookmarks.questions');
    if (!bm.compendiums.includes(ids.materialId)) throw new Error('compêndio não encontrado em bookmarks.compendiums');
  });

  await step('19. BookmarksRepository.toggleBookmark (remover questão, manter compêndio)', async () => {
    const removed = await bookmarksRepo.toggleBookmark('questions', ids.questionId);
    if (removed !== false) throw new Error('esperava false ao remover bookmark de questão');
    const bm = await bookmarksRepo.getBookmarks();
    if (bm.questions.includes(ids.questionId)) throw new Error('questão ainda presente após remoção');
    if (!bm.compendiums.includes(ids.materialId)) throw new Error('compêndio não deveria ter sido afetado');
  });

  // ---- NotesRepository ----------------------------------------------------
  await step('20. NotesRepository.saveNote (alvo = questão) + getNotes round-trip', async () => {
    await notesRepo.saveNote(ids.questionId, 'Nota de teste (Fase 4)');
    const notes = await notesRepo.getNotes();
    if (notes[ids.questionId] !== 'Nota de teste (Fase 4)') throw new Error('nota não bateu no round-trip');
  });

  await step('21. NotesRepository.saveNote (update: sobrescreve nota existente)', async () => {
    await notesRepo.saveNote(ids.questionId, 'Nota editada (Fase 4)');
    const notes = await notesRepo.getNotes();
    if (notes[ids.questionId] !== 'Nota editada (Fase 4)') throw new Error('nota atualizada não persistiu');
  });

  // ---- ReadingProgressRepository ------------------------------------------
  const sectionA = crypto.randomUUID();
  const sectionB = crypto.randomUUID();
  await step('22. ReadingProgressRepository.toggleSectionRead (marcar 2 seções de 2)', async () => {
    const p1 = await readingProgressRepo.toggleSectionRead(ids.materialId, sectionA, 2);
    if (p1 !== 50) throw new Error(`esperava 50%, achou ${p1}`);
    const p2 = await readingProgressRepo.toggleSectionRead(ids.materialId, sectionB, 2);
    if (p2 !== 100) throw new Error(`esperava 100%, achou ${p2}`);
  });

  await step('23. ReadingProgressRepository.getReadingProgress round-trip', async () => {
    const progress = await readingProgressRepo.getReadingProgress();
    const entry = progress[ids.materialId];
    if (!entry || entry.percent !== 100 || entry.readSectionIds.length !== 2) {
      throw new Error(`round-trip não bateu: ${JSON.stringify(entry)}`);
    }
  });

  await step('24. ReadingProgressRepository.toggleSectionRead (desmarcar 1 seção)', async () => {
    const percent = await readingProgressRepo.toggleSectionRead(ids.materialId, sectionA, 2);
    if (percent !== 50) throw new Error(`esperava 50% após desmarcar, achou ${percent}`);
  });

  // ---- SimuladosRepository -------------------------------------------------
  const simuladoId = crypto.randomUUID();
  await step('25. SimuladosRepository.saveSimuladoSession (criar)', async () => {
    await simuladosRepo.saveSimuladoSession({
      id: simuladoId,
      config: {
        id: crypto.randomUUID(),
        name: 'Simulado de teste (Fase 4)',
        disciplineIds: [ids.disciplineId],
        themeIds: [ids.themeId],
        difficulties: ['medio'],
        cycles: ['clinico'],
        onlyMistakes: false,
        questionCount: 1,
        timeLimitMinutes: 10,
        isExamMode: false,
      },
      questionIds: [ids.questionId],
      answers: { [ids.questionId]: { selectedOption: 'B', timeSpent: 30 } },
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      score: 100,
      totalTimeSeconds: 30,
    });
  });

  await step('26. SimuladosRepository.getSimulados round-trip', async () => {
    const all = await simuladosRepo.getSimulados();
    const found = all.find((s) => s.id === simuladoId);
    if (!found) throw new Error('simulado não encontrado após save');
    if (found.questionIds.length !== 1 || found.questionIds[0] !== ids.questionId) {
      throw new Error('questionIds não bateram no round-trip');
    }
    const ans = found.answers[ids.questionId];
    if (!ans || ans.selectedOption !== 'B' || ans.timeSpent !== 30) {
      throw new Error(`resposta não bateu no round-trip: ${JSON.stringify(ans)}`);
    }
    if (found.score !== 100) throw new Error(`score não bateu: ${found.score}`);
  });

  await step('27. SimuladosRepository.getSimuladoHistory (mesmo dado de getSimulados)', async () => {
    const history = await simuladosRepo.getSimuladoHistory();
    if (!history.some((s) => s.id === simuladoId)) throw new Error('simulado ausente em getSimuladoHistory');
  });

  await step('28. SimuladosRepository.saveSimuladoSession (update: score/timeSpent)', async () => {
    await simuladosRepo.saveSimuladoSession({
      id: simuladoId,
      config: {
        id: crypto.randomUUID(),
        name: 'Simulado de teste (Fase 4, editado)',
        disciplineIds: [ids.disciplineId],
        themeIds: [ids.themeId],
        difficulties: ['medio'],
        cycles: ['clinico'],
        onlyMistakes: false,
        questionCount: 1,
        timeLimitMinutes: 10,
        isExamMode: false,
      },
      questionIds: [ids.questionId],
      answers: { [ids.questionId]: { selectedOption: 'B', timeSpent: 45 } },
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      score: 50,
      totalTimeSeconds: 45,
    });
    const all = await simuladosRepo.getSimulados();
    const found = all.find((s) => s.id === simuladoId);
    if (!found || found.score !== 50 || found.answers[ids.questionId]?.timeSpent !== 45) {
      throw new Error(`update não persistiu corretamente: ${JSON.stringify(found)}`);
    }
    if (found.questionIds.length !== 1) throw new Error('simulation_questions duplicou em vez de substituir');
  });

  // ---- FeedbackRepository ---------------------------------------------------
  const feedbackId = crypto.randomUUID();
  await step('29. FeedbackRepository.saveFeedback', async () => {
    await feedbackRepo.saveFeedback({
      id: feedbackId,
      type: 'sugestao',
      title: 'Sugestão de teste (Fase 4)',
      description: 'Descrição de teste (Fase 4).',
      createdAt: new Date().toISOString(),
      status: 'pendente',
    });
  });

  await step('30. FeedbackRepository.getFeedbacks round-trip', async () => {
    const all = await feedbackRepo.getFeedbacks();
    const found = all.find((f) => f.id === feedbackId);
    if (!found) throw new Error('feedback não encontrado após save');
    if (found.title !== 'Sugestão de teste (Fase 4)') throw new Error('title não bateu no round-trip');
    if (found.userEmail !== null) throw new Error('userEmail deveria ser null (lacuna de schema documentada)');
  });

  // ---- Isolamento entre usuários (RLS) --------------------------------------
  await step('31. signOut usuário 1', async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  });

  await step('32. Criar usuário de teste 2 via GoTrue admin API', async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL_2,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    testUserId2 = data.user.id;
  });

  await step('33. Promover perfil 2 a student/active (docker exec psql -U postgres)', async () => {
    await promoteProfile(testUserId2!);
  });

  await step('34. Autenticar usuário 2 via signInWithPassword (cliente anon)', async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: TEST_EMAIL_2, password: TEST_PASSWORD });
    if (error) throw error;
  });

  await step('35. RLS isola dados do usuário 1: usuário 2 não vê nada nos 8 domínios', async () => {
    const problems: string[] = [];

    const answers = await answersRepo.getAnswers();
    if (Object.keys(answers).length !== 0) problems.push(`getAnswers retornou ${Object.keys(answers).length} linha(s)`);

    const errorLogs = await errorNotebookRepo.getErrorLogs();
    if (errorLogs.length !== 0) problems.push(`getErrorLogs retornou ${errorLogs.length} linha(s)`);

    const cards = await flashcardsRepo.getFlashcards();
    if (cards.some((c) => c.id === flashcard.id)) problems.push('getFlashcards vazou o card do usuário 1');

    const bm = await bookmarksRepo.getBookmarks();
    if (bm.compendiums.includes(ids.materialId)) problems.push('getBookmarks vazou o bookmark do usuário 1');

    const notes = await notesRepo.getNotes();
    if (ids.questionId in notes) problems.push('getNotes vazou a nota do usuário 1');

    const progress = await readingProgressRepo.getReadingProgress();
    if (ids.materialId in progress) problems.push('getReadingProgress vazou o progresso do usuário 1');

    const simulados = await simuladosRepo.getSimulados();
    if (simulados.some((s) => s.id === simuladoId)) problems.push('getSimulados vazou a sessão do usuário 1');

    const feedbacks = await feedbackRepo.getFeedbacks();
    if (feedbacks.some((f) => f.id === feedbackId)) problems.push('getFeedbacks vazou o feedback do usuário 1');

    if (problems.length > 0) throw new Error(problems.join(' | '));
  });

  // ---- Delete final (de volta como usuário 1) -------------------------------
  await step('36. signOut usuário 2 e re-autenticar como usuário 1', async () => {
    const { error: outErr } = await supabase.auth.signOut();
    if (outErr) throw outErr;
    const { error: inErr } = await supabase.auth.signInWithPassword({ email: TEST_EMAIL_1, password: TEST_PASSWORD });
    if (inErr) throw inErr;
  });

  await step('37. FlashcardsRepository.deleteFlashcard + confirmar ausência', async () => {
    await flashcardsRepo.deleteFlashcard(flashcard.id);
    const all = await flashcardsRepo.getFlashcards();
    if (all.some((c) => c.id === flashcard.id)) throw new Error('flashcard ainda presente após delete');
  });

  await cleanup();
  finish();
}

function finish() {
  printSummary();
}

function printSummary() {
  console.log('\n=== Resumo ===');
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(`${passed}/${results.length} passos OK`);
  if (failed.length > 0) {
    console.log('Falharam:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  }
  process.exitCode = failed.length > 0 ? 1 : 0;
}

main().catch(async (err) => {
  console.error('Erro fatal no script de validação:', err);
  await cleanup().catch(() => {});
  printSummary();
  process.exit(1);
});
