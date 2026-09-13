import { test, expect, Page } from '@playwright/test';
import { createTestUser, deleteTestUser, type CreatedTestUser } from '../fixtures/localSupabase';

// Isolamento por usuário: dois usuários reais (A/B) nunca veem dado um do
// outro, na mesma janela (login/logout sequencial) e em duas BrowserContext
// simultâneas (dois "dispositivos"). Cobre o requisito mínimo "login/logout
// e isolamento A/B" do prompt 13-A; a fila de sincronização propriamente
// dita (client_op_id, retry) já é coberta por pgTAP + pelo histórico descrito
// em docs/SINCRONIZACAO-CONFIAVEL.md — aqui o foco é a fronteira de sessão
// no navegador (dado de uma conta nunca aparecer autenticado como outra).

async function login(page: Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 15_000 });
}

async function logout(page: Page) {
  await page.locator('#btn-user-profile-menu').click();
  await page.locator('#btn-logout').click();
  await expect(page.locator('#auth-email-input')).toBeVisible({ timeout: 15_000 });
}

async function displayedEmail(page: Page): Promise<string> {
  await page.locator('#btn-user-profile-menu').click();
  const email = await page.locator('#user-profile-dropdown').getByText(/@e2e\.local/).textContent();
  await page.keyboard.press('Escape');
  return (email ?? '').trim();
}

test.describe('Isolamento entre contas (A/B)', () => {
  let userA: CreatedTestUser;
  let userB: CreatedTestUser;

  test.beforeEach(async () => {
    const suffix = Date.now();
    userA = await createTestUser({ emailLocalPart: `iso-a-${suffix}`, password: 'senha-teste-123', role: 'student', status: 'active' });
    userB = await createTestUser({ emailLocalPart: `iso-b-${suffix}`, password: 'senha-teste-123', role: 'student', status: 'active' });
  });

  test.afterEach(async () => {
    await deleteTestUser(userA.id).catch(() => undefined);
    await deleteTestUser(userB.id).catch(() => undefined);
  });

  test('login A -> logout -> login B na mesma janela: B nunca vê a sessão/e-mail de A', async ({ page }) => {
    await login(page, userA);
    expect(await displayedEmail(page)).toBe(userA.email);

    await logout(page);
    await login(page, userB);
    expect(await displayedEmail(page)).toBe(userB.email);

    // localStorage não deve expor a sessão Supabase de A depois do logout/login de B
    const storageDump = await page.evaluate(() => JSON.stringify(window.localStorage));
    expect(storageDump).not.toContain(userA.email);
  });

  test('duas BrowserContext simultâneas (A e B autenticados ao mesmo tempo) não se cruzam', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    try {
      await login(pageA, userA);
      await login(pageB, userB);

      expect(await displayedEmail(pageA)).toBe(userA.email);
      expect(await displayedEmail(pageB)).toBe(userB.email);

      // reload cruzado: cada contexto mantém a própria sessão, não a do outro
      await pageA.reload();
      await expect(pageA.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 15_000 });
      expect(await displayedEmail(pageA)).toBe(userA.email);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
