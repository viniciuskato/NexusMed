import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, runCleanup, type CreatedTestUser } from '../fixtures/localSupabase';

// 44-D — "Como escrever um material": todo usuário ATIVO (não só admin) abre a
// página pelo menu do usuário; pendente não chega a ela, nem pelo endereço
// direto. Contra o app real (build de teste) e o Supabase local.

async function login(page: Page, user: CreatedTestUser, path = '/') {
  await page.goto(path);
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
}

test.describe('Como escrever um material (44-D)', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
  });

  test('estudante ativo abre a página pelo menu e vê o padrão, o catálogo e os dois botões', async ({ page }) => {
    const student = await createTestUser({
      emailLocalPart: `como-escrever-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'student',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(student.id));

    await login(page, student);
    await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });

    await page.locator('#btn-user-profile-menu').click();
    await page.locator('#nav-como-escrever-material').click();

    await expect(page.locator('#como-escrever-material-view')).toBeVisible();
    await expect(page).toHaveURL(/#\/como-escrever-material$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Como escrever um material' })).toBeVisible();

    // A Parte 1 do padrão está na tela; a Parte 2 não.
    await expect(page.getByRole('heading', { name: /1\.7 Formato do arquivo/ })).toBeVisible();
    await expect(page.getByText('Parte 2 — Para quem opera')).toHaveCount(0);

    // Catálogo do banco local (seed): ao menos uma Disciplina listada.
    await expect(page.locator('#como-escrever-catalogo-lista > li').first()).toBeVisible();

    await expect(page.getByRole('button', { name: 'Copiar prompt para criar material' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copiar prompt revisor' })).toBeVisible();
  });

  test('link direto abre a página para usuário ativo, e pendente vê só a espera de aprovação', async ({ page, browser }) => {
    const student = await createTestUser({
      emailLocalPart: `como-escrever-link-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'student',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(student.id));
    await login(page, student, '/#/como-escrever-material');
    await expect(page.locator('#como-escrever-material-view')).toBeVisible({ timeout: 20_000 });

    const pending = await createTestUser({
      emailLocalPart: `como-escrever-pend-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'student',
      status: 'pending',
    });
    cleanup.push(() => deleteTestUser(pending.id));
    // Contexto novo: sem a sessão do estudante ativo.
    const contextoPendente = await browser.newContext();
    cleanup.push(() => contextoPendente.close());
    const paginaPendente = await contextoPendente.newPage();
    await login(paginaPendente, pending, '/#/como-escrever-material');
    await expect(paginaPendente.getByText('Aguardando Aprovação')).toBeVisible({ timeout: 20_000 });
    await expect(paginaPendente.locator('#como-escrever-material-view')).toHaveCount(0);
    await expect(paginaPendente.locator('#btn-user-profile-menu')).toHaveCount(0);
  });
});
