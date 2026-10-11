import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, runCleanup, type CreatedTestUser } from '../fixtures/localSupabase';

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
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
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
    // Desde a 43-E o app abre em "Hoje".
    await expect(page).toHaveURL(/#\/today$/);

    await page.locator('#nav-resources').click();
    await page.locator('#nav-resources-desempenho').click();
    await expect(page.locator('#desempenho-titulo')).toBeVisible();
    await expect(page).toHaveURL(/#\/desempenho$/);

    await page.locator('#nav-dashboard').click();
    await expect(page.locator('#nav-dashboard')).toHaveAttribute('aria-current', 'page');

    await page.goBack();
    await expect(page.locator('#desempenho-titulo')).toBeVisible();
    await expect(page).toHaveURL(/#\/desempenho$/);

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

    await login(page, student, '/#/desempenho');
    await expect(page.locator('#desempenho-titulo')).toBeVisible();
  });

  // CORTE-1 (D-14): as telas de cartões e do Estudo Temático saíram; um link salvo para elas cai na tela inicial.
  for (const tela of ['thematic-study', 'flashcards', 'flashcard-session']) {
    test(`link salvo para #/${tela} (tela que saiu do app) cai na tela inicial, sem erro`, async ({ page }) => {
      const student = await createTestUser({
        emailLocalPart: `nav-tela-removida-${tela}-${Date.now()}`,
        password: 'senha-teste-123',
        role: 'student',
        status: 'active',
      });
      cleanup.push(() => deleteTestUser(student.id));

      await login(page, student, `/#/${tela}`);
      await expect(page.locator('#hoje-view')).toBeVisible();
      await expect(page).toHaveURL(/#\/today$/);
      await expect(page.locator('#app-load-error')).toHaveCount(0);
    });
  }
});
