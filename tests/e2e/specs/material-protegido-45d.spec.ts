import { test, expect, type Page } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  deleteE2EMaterials,
  insertPublishedMaterial,
  psqlLocal,
  runCleanup,
  MATERIAL_PREFIX,
  type CreatedTestUser,
} from '../fixtures/localSupabase';

// Unidade 45-D (AUD-22), contra o Supabase local de verdade:
// - quem produz: excluir material publicado é recusado com mensagem clara, e
//   o material continua na lista;
// - o estudante: a anotação de uma seção que saiu do material continua
//   aparecendo para ele no próprio material, indicada como de seção removida.

async function login(page: Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

async function openLibraryTree(page: Page) {
  const desktopTrigger = page.locator('#nav-resources');
  if (await desktopTrigger.isVisible()) {
    await desktopTrigger.click();
    await page.locator('#nav-resources-compendiums').click();
  } else {
    await page.locator('#dock-nav-resources').click();
    await page.locator('#dock-resources-compendiums').click();
  }
  await page.getByRole('button', { name: 'Modo árvore' }).click();
}

function tag(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

test.describe('45-D — material publicado protegido', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
  });

  test('excluir material publicado é recusado com mensagem clara', async ({ page }) => {
    const t = tag();
    const title = `${MATERIAL_PREFIX}protegido-45d-${t}`;
    const materialId = insertPublishedMaterial(`protegido-45d-${t}`);
    cleanup.push(() => deleteE2EMaterials());

    const admin = await createTestUser({
      emailLocalPart: `e2e-45d-admin-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'admin',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(admin.id));

    await login(page, admin);
    await page.locator('#btn-user-profile-menu').click();
    await page.getByRole('menuitem', { name: 'Área Editorial / CMS' }).click();
    await page.getByRole('button', { name: 'Conteúdos & Mecanismos', exact: false }).click();
    await page.getByPlaceholder('Buscar por título, subtítulo, tag ou conteúdo...').fill(title);

    const row = page.locator(`[data-compendium-row-id="${materialId}"]`);
    await expect(row).toBeVisible();
    page.once('dialog', (d) => d.accept());
    await row.getByTitle('Excluir conteúdo').click();

    await expect(page.getByText(/Material publicado não pode ser excluído/)).toBeVisible();
    await expect(row).toBeVisible();
    expect(psqlLocal(`select count(*) from public.materials where id = '${materialId}';`).trim()).toBe('1');
  });

  test('anotação de seção removida continua para o estudante, indicada como de seção removida', async ({ page }) => {
    const t = tag();
    const title = `${MATERIAL_PREFIX}anotacao-45d-${t}`;
    const materialId = insertPublishedMaterial(`anotacao-45d-${t}`);
    cleanup.push(() => deleteE2EMaterials());
    const sectionId = psqlLocal(
      `insert into public.material_sections (material_id, sort_order, title, content, key_takeaways) ` +
        `values ('${materialId}', 2, 'Seção que sai 45-D', 'Conteúdo que sai.', array[]::text[]) returning id;`
    )
      .split('\n')[0]
      .trim();

    const student = await createTestUser({
      emailLocalPart: `e2e-45d-aluno-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'student',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(student.id));

    psqlLocal(
      `insert into public.notes (user_id, material_section_id, note_text) ` +
        `values ('${student.id}', '${sectionId}', 'Minha anotação na seção que vai sair');`
    );
    // A edição do material tira a seção (mesmo efeito do save_compendium sem ela).
    psqlLocal(`delete from public.material_sections where id = '${sectionId}';`);

    await login(page, student);
    await openLibraryTree(page);
    await page.getByRole('button', { name: title, exact: true }).click();
    await page.getByRole('button', { name: 'Anotações pessoais' }).first().click();

    await expect(page.getByText('De uma seção removida: Seção que sai 45-D')).toBeVisible();
    await expect(page.getByText('Minha anotação na seção que vai sair')).toBeVisible();
  });
});
