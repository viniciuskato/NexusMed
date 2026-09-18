import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, type CreatedTestUser } from '../fixtures/localSupabase';

// Auditoria 2026-09-18 — a tela ativa passa a ser refletida na URL (#/tela):
// o "voltar" do navegador/celular navega dentro do app em vez de sair dele,
// e um link direto para uma tela abre essa tela.

async function login(page: Page, user: CreatedTestUser, path = '/') {
  await page.goto(path);
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

test.describe('Navegação pelo histórico do navegador', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    for (const fn of cleanup.reverse()) {
      await Promise.resolve(fn()).catch(() => undefined);
    }
    cleanup = [];
  });

  test('voltar e avançar do navegador trocam de tela dentro do app', async ({ page }) => {
    const student = await createTestUser({
      emailLocalPart: `nav-historico-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'student',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(student.id));

    await login(page, student);
    await expect(page).toHaveURL(/#\/dashboard$/);

    await page.locator('#nav-thematic-study').click();
    await expect(page.locator('#thematic-study-view')).toBeVisible();
    await expect(page).toHaveURL(/#\/thematic-study$/);

    await page.locator('#nav-dashboard').click();
    await expect(page.locator('#nav-dashboard')).toHaveAttribute('aria-current', 'page');

    await page.goBack();
    await expect(page.locator('#thematic-study-view')).toBeVisible();
    await expect(page.locator('#nav-thematic-study')).toHaveAttribute('aria-current', 'page');

    await page.goForward();
    await expect(page.locator('#nav-dashboard')).toHaveAttribute('aria-current', 'page');
  });

  test('link direto para uma tela abre essa tela depois do login', async ({ page }) => {
    const student = await createTestUser({
      emailLocalPart: `nav-link-direto-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'student',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(student.id));

    await login(page, student, '/#/thematic-study');
    await expect(page.locator('#thematic-study-view')).toBeVisible();
    await expect(page.locator('#nav-thematic-study')).toHaveAttribute('aria-current', 'page');
  });
});
