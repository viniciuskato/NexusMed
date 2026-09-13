import { execSync, execFileSync } from 'node:child_process';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// Fixtures determinísticas contra o Supabase LOCAL (Prompt 13-A).
// ============================================================================
//
// NUNCA aponta para produção/remoto: lê a configuração de `supabase status`
// (CLI local), que só funciona se `supabase start` já rodou nesta máquina —
// se a URL resolvida não for localhost/127.0.0.1, todas as funções aqui
// lançam antes de qualquer escrita (ver `assertLocal`). Isso é a mesma trava
// de "só local" documentada em AGENTS.md armadilha #4/#5, aplicada também a
// leitura, conforme a lição registrada na memória desta sessão
// (feedback_supabase_verificar_url_antes_de_rodar).
//
// Todo usuário/fixture criado por esta suíte usa e-mail com prefixo
// `e2e-13a-` (ver PREFIX abaixo) para que a limpeza (`deleteAllE2EUsers`)
// consiga encontrar e remover tudo criado por uma execução, mesmo que um
// `finally` individual falhe.

export const PREFIX = 'e2e-13a-';

interface LocalConfig {
  apiUrl: string;
  serviceRoleKey: string;
  anonKey: string;
  dbUrl: string;
}

let cachedConfig: LocalConfig | null = null;

function assertLocal(url: string): void {
  // Aceita qualquer esquema (http(s):// para a API REST, postgresql:// para
  // DB_URL) — o que importa é o host, nunca o protocolo.
  const isLocal = /^[a-z0-9+]+:\/\/(?:[^@/]*@)?(127\.0\.0\.1|localhost)([:/]|$)/i.test(url);
  if (!isLocal) {
    throw new Error(
      `[tests/e2e] URL do Supabase resolvida não é local ("${url}"). ` +
        'Recusando prosseguir — esta suíte nunca deve tocar Supabase remoto/produção.'
    );
  }
}

export function getLocalConfig(): LocalConfig {
  if (cachedConfig) return cachedConfig;
  const raw = execSync('supabase status -o json', { encoding: 'utf-8' });
  const parsed = JSON.parse(raw) as Record<string, string>;
  const apiUrl = parsed.API_URL;
  const dbUrl = parsed.DB_URL;
  assertLocal(apiUrl);
  assertLocal(dbUrl);
  cachedConfig = {
    apiUrl,
    serviceRoleKey: parsed.SERVICE_ROLE_KEY,
    anonKey: parsed.ANON_KEY,
    dbUrl,
  };
  return cachedConfig;
}

let adminClient: SupabaseClient | null = null;
export function getAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;
  const cfg = getLocalConfig();
  adminClient = createClient(cfg.apiUrl, cfg.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}

/**
 * Roda uma instrução SQL como o usuário `postgres` de verdade (não a service
 * role via REST) contra o container local — necessário para promover
 * `status`/`role` em `profiles` (trigger `protect_profile_fields` só libera
 * para `current_user = 'postgres'`, ver AGENTS.md armadilha #9) e para
 * verificações de limpeza (`SELECT count(*) ...`).
 */
export function psqlLocal(sql: string): string {
  const cfg = getLocalConfig();
  assertLocal(cfg.dbUrl);
  // docker exec -i requer stdin conectado para heredoc (armadilha #10) — aqui
  // usamos -c com a instrução inteira como argumento único, sem heredoc.
  return execFileSync(
    'docker',
    ['exec', 'supabase_db_synapsemed', 'psql', '-U', 'postgres', '-t', '-A', '-c', sql],
    { encoding: 'utf-8' }
  ).trim();
}

export interface TestUserSpec {
  emailLocalPart: string; // sem prefixo/domínio — vira `${PREFIX}${emailLocalPart}@e2e.local`
  password: string;
  role?: 'student' | 'admin';
  status?: 'pending' | 'active' | 'blocked' | null; // null = deixa o valor "estranho" gerado pelo cadastro padrão sem tocar
  displayName?: string;
}

export interface CreatedTestUser {
  id: string;
  email: string;
  password: string;
}

const createdUserIds: Set<string> = new Set();

export function testEmail(localPart: string): string {
  return `${PREFIX}${localPart}@e2e.local`;
}

/**
 * Cria um usuário real no Auth local (`email_confirm: true`, evita o fluxo
 * de confirmação por e-mail) e, se `status`/`role` foram pedidos, promove o
 * perfil correspondente via `psqlLocal` (conexão real como `postgres`).
 */
export async function createTestUser(spec: TestUserSpec): Promise<CreatedTestUser> {
  const email = testEmail(spec.emailLocalPart);
  const admin = getAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: spec.password,
    email_confirm: true,
    user_metadata: { display_name: spec.displayName ?? spec.emailLocalPart },
  });
  if (error || !data.user) {
    throw new Error(`[tests/e2e] falha ao criar usuário de teste ${email}: ${error?.message}`);
  }
  createdUserIds.add(data.user.id);

  if (spec.role || spec.status !== undefined) {
    const setters: string[] = [];
    if (spec.role) setters.push(`role = '${spec.role}'`);
    if (spec.status === null) {
      // não mexe — deixa o valor padrão de cadastro (normalmente 'pending')
    } else if (spec.status) {
      setters.push(`status = '${spec.status}'`);
    }
    if (setters.length > 0) {
      psqlLocal(`update public.profiles set ${setters.join(', ')} where id = '${data.user.id}';`);
    }
  }

  return { id: data.user.id, email, password: spec.password };
}

/** Grava um status inválido diretamente no banco, contornando o CHECK constraint,
 * para provar que o gate do frontend trata QUALQUER valor != 'active' como bloqueado
 * (mesmo um valor que o backend hoje não permite via fluxo normal). Usa
 * `alter table ... drop constraint`/recria, escopado a uma transação, para não
 * deixar o schema alterado além do teste. */
export function forceInvalidProfileStatus(userId: string, rawStatus: string): void {
  psqlLocal(
    `begin; ` +
      `alter table public.profiles drop constraint if exists profiles_status_check; ` +
      `update public.profiles set status = '${rawStatus}' where id = '${userId}'; ` +
      `alter table public.profiles add constraint profiles_status_check check (status in ('pending','active','blocked','${rawStatus}')); ` +
      `commit;`
  );
}

/** Restaura o CHECK constraint original de `profiles.status` (sem o valor extra liberado por `forceInvalidProfileStatus`). */
export function restoreProfileStatusConstraint(): void {
  psqlLocal(
    `begin; ` +
      `alter table public.profiles drop constraint if exists profiles_status_check; ` +
      `alter table public.profiles add constraint profiles_status_check check (status in ('pending','active','blocked')); ` +
      `commit;`
  );
}

/** Remove um usuário de teste (cascade cobre profiles/attempts/etc — mesma garantia usada em sessões anteriores, ver AGENTS.md). */
export async function deleteTestUser(userId: string): Promise<void> {
  const admin = getAdminClient();
  await admin.auth.admin.deleteUser(userId).catch(() => undefined);
  createdUserIds.delete(userId);
}

/**
 * Limpeza de segurança: remove QUALQUER usuário local cujo e-mail comece com
 * `PREFIX`, não só os criados nesta execução em memória — cobre o caso de um
 * `finally` anterior ter falhado a meio caminho (crash de processo, timeout).
 * Chamado no `globalTeardown` do Playwright e disponível para verificação
 * manual pós-suíte.
 */
export async function deleteAllE2EUsers(): Promise<{ deleted: string[] }> {
  const admin = getAdminClient();
  const deleted: string[] = [];
  let page = 1;
  // paginação simples da Admin API
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data) throw error ?? new Error('listUsers: resposta vazia');
    const users: Array<{ id: string; email?: string | null }> = data.users;
    const matches = users.filter((u) => (u.email ?? '').startsWith(PREFIX));
    for (const u of matches) {
      await admin.auth.admin.deleteUser(u.id).catch(() => undefined);
      deleted.push(u.email ?? u.id);
    }
    if (users.length < 200) break;
    page += 1;
  }
  return { deleted };
}

/** Conta quantas linhas de fixture (`e2e-13a-`) ainda existem — usado pelas provas de limpeza obrigatórias do retorno. */
export function countRemainingE2EFixtures(): { authUsers: number; profiles: number } {
  const authUsers = Number(
    psqlLocal(`select count(*) from auth.users where email like '${PREFIX}%';`)
  );
  const profiles = Number(
    psqlLocal(`select count(*) from public.profiles where email like '${PREFIX}%';`)
  );
  return { authUsers, profiles };
}

// ============================================================================
// Helpers do Prompt 13-B (cenários concorrentes complementares) — leem o seed
// mínimo (supabase/seed.sql, disciplina Cardiologia) e criam apenas fixtures
// que pertencem ao usuário de teste (flashcard próprio), nunca dado
// compartilhado/global.
// ============================================================================

export interface SeedIds {
  disciplineId: string;
  themeId: string;
  materialId: string;
  questionId: string;
}

let cachedSeedIds: SeedIds | null = null;

/** Ids do seed mínimo (1 disciplina/tema/material/questão) — resolvidos uma vez por processo de teste. */
export function getSeedIds(): SeedIds {
  if (cachedSeedIds) return cachedSeedIds;
  const disciplineId = psqlLocal(`select id from public.disciplines where code = 'CARDIO' limit 1;`);
  const themeId = psqlLocal(`select id from public.themes where discipline_id = '${disciplineId}' limit 1;`);
  const materialId = psqlLocal(`select id from public.materials where discipline_id = '${disciplineId}' limit 1;`);
  const questionId = psqlLocal(`select id from public.questions where discipline_id = '${disciplineId}' limit 1;`);
  if (!disciplineId || !themeId || !materialId || !questionId) {
    throw new Error('[tests/e2e] seed mínimo não encontrado — supabase/seed.sql rodou (supabase db reset)?');
  }
  cachedSeedIds = { disciplineId, themeId, materialId, questionId };
  return cachedSeedIds;
}

/** Cria um flashcard PRÓPRIO do usuário de teste (com flashcard_srs_state inicial) para exercitar submit_flashcard_review em concorrência real. */
export function insertFlashcardForUser(userId: string, seed: SeedIds = getSeedIds()): string {
  // `psql -t -A` suprime cabeçalho mas NÃO suprime a tag de conclusão
  // ("INSERT 0 1") quando a instrução tem `returning` — fica numa segunda
  // linha da mesma saída. Só a primeira linha é o valor retornado.
  const insertOutput = psqlLocal(
    `insert into public.flashcards (user_id, discipline_id, theme_id, front, back, difficulty) ` +
      `values ('${userId}', '${seed.disciplineId}', '${seed.themeId}', 'Frente demonstrativa 13-B', 'Verso demonstrativo 13-B', 'medio') ` +
      `returning id;`
  );
  const flashcardId = insertOutput.split('\n')[0].trim();
  psqlLocal(`insert into public.flashcard_srs_state (flashcard_id) values ('${flashcardId}');`);
  return flashcardId;
}

export function countFlashcardReviews(flashcardId: string): number {
  return Number(psqlLocal(`select count(*) from public.flashcard_reviews where flashcard_id = '${flashcardId}';`));
}

export function getFlashcardSrsState(flashcardId: string): { repetitionCount: number; intervalDays: number } {
  const row = psqlLocal(
    `select repetition_count, interval_days from public.flashcard_srs_state where flashcard_id = '${flashcardId}';`
  );
  const [repetitionCount, intervalDays] = row.split('|').map(Number);
  return { repetitionCount, intervalDays };
}

export function countQuestionReactions(userId: string, questionId: string): number {
  return Number(
    psqlLocal(`select count(*) from public.question_reactions where user_id = '${userId}' and question_id = '${questionId}';`)
  );
}

export function countNotesForMaterial(materialId: string, userId: string): number {
  return Number(
    psqlLocal(`select count(*) from public.notes where material_id = '${materialId}' and user_id = '${userId}';`)
  );
}

export function getNoteText(materialId: string, userId: string): string | null {
  const text = psqlLocal(
    `select note_text from public.notes where material_id = '${materialId}' and user_id = '${userId}';`
  );
  return text || null;
}

export function getReadingProgress(materialId: string, userId: string): { readSectionIds: string[]; percent: number } | null {
  const row = psqlLocal(
    `select coalesce(array_to_string(read_section_ids, ','), ''), percent from public.reading_progress ` +
      `where material_id = '${materialId}' and user_id = '${userId}';`
  );
  if (!row) return null;
  const [sectionsRaw, percentRaw] = row.split('|');
  return { readSectionIds: sectionsRaw ? sectionsRaw.split(',') : [], percent: Number(percentRaw) };
}

export function countSimulationRows(simulationId: string): { simulations: number; questions: number; answers: number } {
  const simulations = Number(psqlLocal(`select count(*) from public.simulations where id = '${simulationId}';`));
  const questions = Number(psqlLocal(`select count(*) from public.simulation_questions where simulation_id = '${simulationId}';`));
  const answers = Number(
    psqlLocal(
      `select count(*) from public.simulation_answers a ` +
        `join public.simulation_questions q on q.id = a.simulation_question_id ` +
        `where q.simulation_id = '${simulationId}';`
    )
  );
  return { simulations, questions, answers };
}
