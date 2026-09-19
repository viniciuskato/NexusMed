import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, psqlLocal, runCleanup, type CreatedTestUser } from '../fixtures/localSupabase';

// NOVO-02 — um erro no navegador do estudante vira uma linha em
// public.client_errors (via RPC log_client_error), com a rota sanitizada.

async function login(page: Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

test.describe('Registro de erros do cliente', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
  });

  test('falha ao abrir uma tela fica registrada para o admin', async ({ page }) => {
    const student = await createTestUser({
      emailLocalPart: `observabilidade-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'student',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(student.id));

    await login(page, student);
    await page.route('**/assets/ThematicStudyView-*.js', (route) => route.fulfill({ status: 404, body: 'not found' }));
    await page.locator('#nav-thematic-study').click();
    await expect(page.locator('#app-load-error')).toBeVisible({ timeout: 20_000 });

    await expect
      .poll(() => psqlLocal(`select count(*) from public.client_errors where user_id = '${student.id}' and kind = 'boundary';`), {
        timeout: 15_000,
      })
      .toBe('1');
    expect(psqlLocal(`select url from public.client_errors where user_id = '${student.id}' and kind = 'boundary';`)).toBe(
      '/#/thematic-study'
    );
  });
});
