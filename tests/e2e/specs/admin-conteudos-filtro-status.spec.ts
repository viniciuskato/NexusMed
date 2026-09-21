import { test, expect, type Page } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  getSeedIds,
  psqlLocal,
  runCleanup,
  type CreatedTestUser,
} from '../fixtures/localSupabase';

// Filtro de status (Todos/Publicados/Não publicados) na aba "Conteúdos &
// Mecanismos" do Admin — mesma necessidade já resolvida em
// admin-questoes-filtro-status.spec.ts (conteúdos publicados e em rascunho
// apareciam misturados na mesma lista, só distinguíveis pelo selo de cada
// card). Prova o filtro combinado com a busca por texto já existente,
// contra fixtures reais no Supabase local.

const TITLE_PREFIX = 'e2e-filtro-status-conteudo-';

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

/** Cria um material mínimo (sem seção — não publicável de verdade) no status pedido. */
function insertCompendium(titleSuffix: string, status: 'draft' | 'published'): string {
  const seed = getSeedIds();
  const title = `${TITLE_PREFIX}${titleSuffix}`;
  const materialId = psqlLocal(
    `insert into public.materials (discipline_id, theme_id, title, subtitle, mode) ` +
      `values ('${seed.disciplineId}', '${seed.themeId}', '${title}', 'Fixture de teste', 'mecanismos') ` +
      `returning id;`
  )
    .split('\n')[0]
    .trim();
  if (status === 'published') {
    // Grava published direto (bypassa publish_compendium) — fixture de
    // teste, não precisa passar pelo gate de revisão/atestação para provar
    // só o filtro de listagem, que lê `publicationStatus` sem se importar
    // com como o material chegou lá.
    psqlLocal(`update public.materials set status = 'published' where id = '${materialId}';`);
  }
  return materialId;
}

function deleteE2EFixtures(): void {
  psqlLocal(`delete from public.materials where title like '${TITLE_PREFIX}%';`);
}

test.describe('Admin — filtro de status (Todos/Publicados/Não publicados) em Conteúdos & Mecanismos', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    await runCleanup(cleanup.slice().reverse());
    cleanup = [];
  });

  test('combina com a busca por texto para isolar publicados e não publicados', async ({ page }) => {
    const admin = await createTestUser({
      emailLocalPart: `filtro-status-conteudo-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'admin',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(admin.id));

    const publishedId1 = insertCompendium('publicado-1', 'published');
    const publishedId2 = insertCompendium('publicado-2', 'published');
    const draftId = insertCompendium('rascunho-1', 'draft');
    cleanup.push(() => deleteE2EFixtures());

    await login(page, admin);
    await openEditorialArea(page);
    await page.getByRole('button', { name: 'Conteúdos & Mecanismos', exact: false }).click();

    // Restringe a lista às 3 fixtures desta suíte via a busca já existente,
    // para o filtro de status ser a única variável sob teste.
    await page.getByPlaceholder('Buscar por título, subtítulo ou tag...').fill(TITLE_PREFIX);

    const rowPublished1 = page.locator(`[data-compendium-row-id="${publishedId1}"]`);
    const rowPublished2 = page.locator(`[data-compendium-row-id="${publishedId2}"]`);
    const rowDraft = page.locator(`[data-compendium-row-id="${draftId}"]`);

    // "Todos" (padrão): os 3 aparecem.
    await expect(rowPublished1).toBeVisible();
    await expect(rowPublished2).toBeVisible();
    await expect(rowDraft).toBeVisible();
    await expect(page.getByText('3 de', { exact: false })).toBeVisible();

    // "Publicados": só os 2 publicados.
    await page.getByRole('button', { name: /^Publicados \(\d+\)$/ }).click();
    await expect(rowPublished1).toBeVisible();
    await expect(rowPublished2).toBeVisible();
    await expect(rowDraft).not.toBeVisible();
    await expect(page.getByText('2 de', { exact: false })).toBeVisible();

    // "Não publicados": só o em rascunho.
    await page.getByRole('button', { name: /^Não publicados \(\d+\)$/ }).click();
    await expect(rowPublished1).not.toBeVisible();
    await expect(rowPublished2).not.toBeVisible();
    await expect(rowDraft).toBeVisible();
    await expect(page.getByText('1 de', { exact: false })).toBeVisible();

    // Volta para "Todos" — os 3 reaparecem.
    await page.getByRole('button', { name: /^Todos \(\d+\)$/ }).click();
    await expect(rowPublished1).toBeVisible();
    await expect(rowPublished2).toBeVisible();
    await expect(rowDraft).toBeVisible();
  });
});
