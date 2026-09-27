/**
 * Fase 3 — validação real das implementações Supabase de MaterialsRepository
 * e QuestionsRepository contra o Supabase LOCAL (Docker, `supabase start`).
 *
 * Roda fora do app Vite: `npx tsx scripts/validate-supabase-repos.ts`.
 *
 * O que este script faz:
 *  1. Usa a service_role key (padrão de dev do Supabase CLI, só local) via
 *     GoTrue admin API para criar um usuário de teste e promovê-lo a
 *     admin/active em public.profiles (bypassa RLS via service_role).
 *  2. Autentica esse usuário via signInWithPassword usando a mesma instância
 *     de cliente anon (`src/lib/supabaseClient.ts`) usada pelos repositórios
 *     — exatamente o cliente que o app usaria em produção.
 *  3. Exercita create/read/update/delete de discipline, theme, material e
 *     question via SupabaseMaterialsRepository / SupabaseQuestionsRepository.
 *  4. Confirma que os dados voltam corretamente (round-trip) e que RLS
 *     bloqueia acesso não autenticado (signOut, tentar ler/escrever de novo).
 *  5. Imprime um relatório pass/fail por etapa e limpa os dados de teste no
 *     final (best-effort, via service_role).
 */

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { deleteSeededMaterial } from './maintenance';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '..', '.env.local') });

// Importado DEPOIS de popular process.env, pois supabaseClient.ts lê o
// ambiente no momento do import (top-level).
const { supabase } = await import('../src/lib/supabaseClient.js');
const { SupabaseMaterialsRepository } = await import('../src/repositories/SupabaseMaterialsRepository.js');
const { SupabaseQuestionsRepository } = await import('../src/repositories/SupabaseQuestionsRepository.js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
// service_role key padrão de dev do Supabase CLI local — NÃO É SEGREDO REAL,
// é pública no repositório do Supabase CLI e só funciona contra instâncias
// locais. Nunca usar um valor equivalente contra um projeto remoto.
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const materialsRepo = new SupabaseMaterialsRepository();
const questionsRepo = new SupabaseQuestionsRepository();

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

async function step<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    const value = await fn();
    record(name, true);
    return value;
  } catch (err) {
    record(name, false, stringifyError(err));
    return undefined;
  }
}

const TEST_EMAIL = `fase3-validation-${Date.now()}@synapsemed.local`;
const TEST_PASSWORD = 'Fase3Validacao!2026';

let testUserId: string | null = null;
const createdIds = {
  disciplineId: crypto.randomUUID(),
  themeId: crypto.randomUUID(),
  materialId: crypto.randomUUID(),
  sectionId: crypto.randomUUID(),
  questionId: crypto.randomUUID(),
};

async function cleanup() {
  console.log('\n--- Limpeza (best-effort, via service_role) ---');
  await admin.from('questions').delete().eq('id', createdIds.questionId);
  // Caminho explícito de manutenção (45-D); a falha aparece, nunca some.
  try {
    await deleteSeededMaterial(admin, createdIds.materialId);
  } catch (err) {
    console.error(`LIMPEZA FALHOU: ${(err as Error).message}`);
    process.exitCode = 1;
  }
  await admin.from('themes').delete().eq('id', createdIds.themeId);
  await admin.from('disciplines').delete().eq('id', createdIds.disciplineId);
  if (testUserId) {
    await admin.auth.admin.deleteUser(testUserId);
  }
}

async function main() {
  console.log('=== Fase 3 — validação Supabase repos (local) ===\n');

  // 1. Criar usuário de teste + promover a admin/active
  await step('1. Criar usuário de teste via GoTrue admin API', async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    testUserId = data.user.id;
  });

  if (!testUserId) {
    console.log('\nAbortando: não foi possível criar o usuário de teste.');
    printSummary();
    process.exit(1);
  }

  // Nota: um UPDATE de role/status via PostgREST com a service_role key NÃO
  // basta aqui — a trigger protect_profile_fields (rls_policies.sql) bloqueia
  // essa troca para qualquer current_user diferente de 'postgres', e uma
  // conexão PostgREST autenticada com a service_role key roda como o role de
  // banco "service_role", não "postgres". Isso é intencional (defesa em
  // profundidade contra vazamento da service_role key), mas cria um problema
  // de bootstrap: não existe ainda nenhum admin para chamar
  // admin_set_profile_status(). Para validação LOCAL, contornamos indo direto
  // ao Postgres do container Docker via `docker exec ... psql -U postgres`,
  // que roda como o role "postgres" de fato e passa pela trigger.
  await step('2. Promover perfil a admin/active (via docker exec psql -U postgres, contorna bootstrap)', async () => {
    const containerName = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_synapsemed';
    const sql = `update public.profiles set role='admin', status='active' where id='${testUserId}';`;
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
  });

  // 2. Autenticar com o cliente anon (o mesmo usado pelos repositórios)
  await step('3. Autenticar como admin via signInWithPassword (cliente anon)', async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    if (error) throw error;
  });

  // 3. CRUD de discipline
  const discipline = {
    id: createdIds.disciplineId,
    name: 'Cardiologia (Validação Fase 3)',
    code: `CARD-VAL-${Date.now()}`,
    icon: 'heart',
    description: 'Disciplina criada pelo script de validação da Fase 3.',
    cycle: 'clinico' as const,
    color: '#ff0000',
  };
  await step('4. Criar discipline via SupabaseMaterialsRepository.saveDisciplines', async () => {
    await materialsRepo.saveDisciplines([discipline]);
  });
  await step('5. Ler discipline de volta e conferir round-trip', async () => {
    const all = await materialsRepo.getDisciplines();
    const found = all.find((d) => d.id === discipline.id);
    if (!found) throw new Error('discipline não encontrada após save');
    if (found.name !== discipline.name || found.code !== discipline.code) {
      throw new Error('campos não batem com o que foi salvo');
    }
  });

  // 4. CRUD de theme
  const theme = {
    id: createdIds.themeId,
    disciplineId: discipline.id,
    name: 'Insuficiência Cardíaca (Validação Fase 3)',
    description: 'Tema criado pelo script de validação.',
    highYield: true,
    order: 0,
  };
  await step('6. Criar theme via SupabaseMaterialsRepository.saveThemes', async () => {
    await materialsRepo.saveThemes([theme]);
  });
  await step('7. Ler theme de volta e conferir round-trip', async () => {
    const all = await materialsRepo.getThemes();
    const found = all.find((t) => t.id === theme.id);
    if (!found) throw new Error('theme não encontrado após save');
    if (found.highYield !== true || found.disciplineId !== discipline.id) {
      throw new Error('campos não batem com o que foi salvo');
    }
  });

  // 5. CRUD de material (compendium) com seção e referência
  const compendium = {
    id: createdIds.materialId,
    disciplineId: discipline.id,
    themeId: theme.id,
    title: 'Atlas de Insuficiência Cardíaca (Validação Fase 3)',
    subtitle: 'Subtítulo de teste',
    estimatedReadTimeMinutes: 12,
    lastUpdated: new Date().toISOString(),
    author: 'Script de Validação',
    mode: 'atlas' as const,
    studyLens: 'fisiopatologia' as const,
    tags: ['fase3', 'validacao'],
    sections: [
      {
        id: createdIds.sectionId,
        title: 'Fisiopatologia',
        mechanismTag: 'Fisiopatologia',
        content: 'Conteúdo de teste da seção.',
        keyTakeaways: ['Ponto-chave 1', 'Ponto-chave 2'],
        clinicalPearl: 'Pérola clínica de teste.',
        warningAlert: 'Alerta de teste.',
      },
    ],
    references: ['Referência de teste 1', 'Referência de teste 2'],
  };
  await step('8. Criar material (compendium) via saveCompendium', async () => {
    await materialsRepo.saveCompendium(compendium);
  });
  await step('9. Ler compendium de volta e conferir round-trip (material + seção + referência)', async () => {
    const all = await materialsRepo.getCompendiums();
    const found = all.find((c) => c.id === compendium.id);
    if (!found) throw new Error('compendium não encontrado após save');
    if (found.sections.length !== 1 || found.sections[0].title !== 'Fisiopatologia') {
      throw new Error('seção não bateu no round-trip');
    }
    if (found.references.length !== 2) {
      throw new Error('referências não bateram no round-trip');
    }
  });
  await step('10. Atualizar material (update via saveCompendium, substituição total)', async () => {
    await materialsRepo.saveCompendium({
      ...compendium,
      title: 'Atlas de Insuficiência Cardíaca (Validação Fase 3, editado)',
      sections: [],
      references: [],
    });
    const all = await materialsRepo.getCompendiums();
    const found = all.find((c) => c.id === compendium.id);
    if (!found) throw new Error('compendium não encontrado após update');
    if (!found.title.includes('editado')) throw new Error('título não atualizou: ' + JSON.stringify(found));
    if (found.sections.length !== 0 || found.references.length !== 0) {
      throw new Error('sections/references não foram substituídas (esperado: vazio)');
    }
  });

  // 6. CRUD de question
  const question = {
    id: createdIds.questionId,
    disciplineId: discipline.id,
    themeId: theme.id,
    compendiumRefId: compendium.id,
    compendiumSectionId: undefined,
    cycle: 'clinico' as const,
    difficulty: 'medio' as const,
    institution: 'USP (Validação Fase 3)',
    year: 2026,
    clinicalVignette: 'Vinheta clínica de teste.',
    questionStem: 'Enunciado de teste?',
    options: [
      { letter: 'A' as const, text: 'Alternativa A', isCorrect: false, explanation: 'Explicação A' },
      { letter: 'B' as const, text: 'Alternativa B', isCorrect: true, explanation: 'Explicação B' },
      { letter: 'C' as const, text: 'Alternativa C', isCorrect: false, explanation: 'Explicação C' },
    ],
    generalCommentary: 'Comentário geral de teste.',
    highYieldSummary: 'Resumo de alto rendimento de teste.',
    tags: ['fase3', 'validacao'],
  };
  await step('11. Criar question via SupabaseQuestionsRepository.saveQuestion', async () => {
    await questionsRepo.saveQuestion(question);
  });
  await step('12. Ler question de volta e conferir round-trip (opções + gabarito)', async () => {
    const all = await questionsRepo.getQuestions();
    const found = all.find((q) => q.id === question.id);
    if (!found) throw new Error('question não encontrada após save');
    if (found.options.length !== 3) throw new Error(`esperava 3 opções, achou ${found.options.length}`);
    const correct = found.options.filter((o) => o.isCorrect);
    if (correct.length !== 1 || correct[0].letter !== 'B') {
      throw new Error('alternativa correta não bateu no round-trip');
    }
    if (found.generalCommentary !== question.generalCommentary) {
      throw new Error('generalCommentary não bateu no round-trip');
    }
  });
  await step('13. Atualizar question (update via saveQuestion, substituição total de opções)', async () => {
    await questionsRepo.saveQuestion({
      ...question,
      questionStem: 'Enunciado de teste (editado)?',
      options: [
        { letter: 'A' as const, text: 'Alternativa A (editada)', isCorrect: true, explanation: 'Explicação A editada' },
        { letter: 'B' as const, text: 'Alternativa B (editada)', isCorrect: false, explanation: 'Explicação B editada' },
      ],
    });
    const all = await questionsRepo.getQuestions();
    const found = all.find((q) => q.id === question.id);
    if (!found) throw new Error('question não encontrada após update');
    if (found.options.length !== 2) throw new Error(`esperava 2 opções após update, achou ${found.options.length}`);
    const correct = found.options.filter((o) => o.isCorrect);
    if (correct.length !== 1 || correct[0].letter !== 'A') {
      throw new Error('alternativa correta não bateu após update');
    }
  });
  await step('14. Excluir question via deleteQuestion e confirmar ausência', async () => {
    await questionsRepo.deleteQuestion(question.id);
    const all = await questionsRepo.getQuestions();
    if (all.some((q) => q.id === question.id)) throw new Error('question ainda presente após delete');
  });

  await step('15. Excluir material via deleteCompendium e confirmar ausência', async () => {
    await materialsRepo.deleteCompendium(compendium.id);
    const all = await materialsRepo.getCompendiums();
    if (all.some((c) => c.id === compendium.id)) throw new Error('compendium ainda presente após delete');
  });

  // 7. RLS: comportamento sem autenticação
  await step('16. signOut (voltar para role anon)', async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  });

  await step('17. Leitura anônima de disciplines deve retornar vazio (RLS bloqueia anon)', async () => {
    const all = await materialsRepo.getDisciplines();
    if (all.length !== 0) {
      throw new Error(`esperava 0 disciplines para anon, achou ${all.length} (RLS não está bloqueando)`);
    }
  });

  await step('18. Escrita anônima de discipline deve falhar (RLS bloqueia anon)', async () => {
    let threw = false;
    try {
      await materialsRepo.saveDisciplines([
        {
          id: crypto.randomUUID(),
          name: 'Não deveria existir',
          code: `NAO-DEVERIA-${Date.now()}`,
          icon: '',
          description: '',
          cycle: 'basico',
          color: '',
        },
      ]);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('escrita anônima NÃO falhou — RLS não está bloqueando (falha grave de segurança)');
  });

  await cleanup();
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
