import { test, expect, type Page } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  getSeedIds,
  psqlLocal,
  runCleanup,
  type CreatedTestUser,
} from '../fixtures/localSupabase';

// Filtro de status (Todas/Publicadas/Não publicadas) na aba "Questões
// Comentadas" do Admin — antes desta entrega, questões publicadas e em
// rascunho apareciam misturadas na mesma lista, só distinguíveis pelo selo
// de cada card (pedido explícito do usuário depois de sentir a mistura numa
// listagem real). Prova o filtro combinado com a busca por texto já
// existente, contra fixtures reais no Supabase local.

const STEM_PREFIX = 'e2e-filtro-status-';

async function login(page: Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

async function openEditorialArea(page: Page) {
  await page.locator('#btn-user-profile-menu').click();
  await page.getByRole('menuitem', { name: 'Área Editorial / CMS' }).click();
  await expect(page.getByRole('button', { name: /Publicar rascunhos/ })).toBeVisible();
}

/** Cria uma questão mínima (2 alternativas, sem gabarito/explicação — não publicável de verdade) no status pedido. */
function insertQuestion(stemSuffix: string, status: 'draft' | 'published'): string {
  const seed = getSeedIds();
  const stem = `${STEM_PREFIX}${stemSuffix}`;
  const questionId = psqlLocal(
    `insert into public.questions (discipline_id, theme_id, cycle, difficulty, institution, year, clinical_vignette, question_stem, tags) ` +
      `values ('${seed.disciplineId}', '${seed.themeId}', 'clinico', 'medio', 'E2E', 2025, '', '${stem}', array['e2e']) ` +
      `returning id;`
  )
    .split('\n')[0]
    .trim();
  psqlLocal(
    `insert into public.question_options (question_id, letter, option_text, sort_order) values ` +
      `('${questionId}', 'A', 'Alternativa A', 0), ('${questionId}', 'B', 'Alternativa B', 1);`
  );
  psqlLocal(
    `insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary) ` +
      `values ('${questionId}', 'Comentário geral de teste.', 'Resumo high-yield de teste.');`
  );
  if (status === 'published') {
    // Grava published direto (bypassa publish_question) — fixture de teste,
    // não precisa passar pelo gate de revisão/atestação para provar só o
    // filtro de listagem, que lê `publicationStatus` sem se importar com
    // como a questão chegou lá.
    psqlLocal(`update public.questions set status = 'published' where id = '${questionId}';`);
  }
  return questionId;
}

function deleteE2EFixtures(): void {
  // guard_question_delete rejeita apagar questão published — volta pra
  // draft antes (é fixture de teste, não conteúdo real).
  psqlLocal(`update public.questions set status = 'draft' where question_stem like '${STEM_PREFIX}%' and status = 'published';`);
  psqlLocal(`delete from public.questions where question_stem like '${STEM_PREFIX}%';`);
}

test.describe('Admin — filtro de status (Todas/Publicadas/Não publicadas) em Questões Comentadas', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    await runCleanup(cleanup.slice().reverse());
    cleanup = [];
  });

  test('combina com a busca por texto para isolar publicadas e não publicadas', async ({ page }) => {
    const admin = await createTestUser({
      emailLocalPart: `filtro-status-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'admin',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(admin.id));

    const publishedId1 = insertQuestion('publicada-1', 'published');
    const publishedId2 = insertQuestion('publicada-2', 'published');
    const draftId = insertQuestion('rascunho-1', 'draft');
    cleanup.push(() => deleteE2EFixtures());

    await login(page, admin);
    await openEditorialArea(page);
    await page.getByRole('button', { name: 'Questões Comentadas', exact: false }).click();

    // Restringe a lista às 3 fixtures desta suíte via a busca já existente,
    // para o filtro de status ser a única variável sob teste.
    await page.getByPlaceholder('Buscar por enunciado, instituição, ano ou tag...').fill(STEM_PREFIX);

    const rowPublished1 = page.locator(`#admin-question-${publishedId1}`);
    const rowPublished2 = page.locator(`#admin-question-${publishedId2}`);
    const rowDraft = page.locator(`#admin-question-${draftId}`);

    // "Todas" (padrão): as 3 aparecem.
    await expect(rowPublished1).toBeVisible();
    await expect(rowPublished2).toBeVisible();
    await expect(rowDraft).toBeVisible();
    await expect(page.getByText('3 de', { exact: false })).toBeVisible();

    // "Publicadas": só as 2 publicadas.
    await page.getByRole('button', { name: /^Publicadas \(\d+\)$/ }).click();
    await expect(rowPublished1).toBeVisible();
    await expect(rowPublished2).toBeVisible();
    await expect(rowDraft).not.toBeVisible();
    await expect(page.getByText('2 de', { exact: false })).toBeVisible();

    // "Não publicadas": só a em rascunho.
    await page.getByRole('button', { name: /^Não publicadas \(\d+\)$/ }).click();
    await expect(rowPublished1).not.toBeVisible();
    await expect(rowPublished2).not.toBeVisible();
    await expect(rowDraft).toBeVisible();
    await expect(page.getByText('1 de', { exact: false })).toBeVisible();

    // Volta para "Todas" — as 3 reaparecem.
    await page.getByRole('button', { name: /^Todas \(\d+\)$/ }).click();
    await expect(rowPublished1).toBeVisible();
    await expect(rowPublished2).toBeVisible();
    await expect(rowDraft).toBeVisible();
  });
});
