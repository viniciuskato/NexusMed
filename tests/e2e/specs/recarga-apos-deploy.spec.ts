import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, runCleanup, type CreatedTestUser } from '../fixtures/localSupabase';

// NOVO-01 (2026-09-18) — com code splitting (PR #7), cada tela é um arquivo
// separado com hash no nome. Um deploy troca esses nomes: quem está com o app
// aberto e troca de tela pede um arquivo que não existe mais. Sem tratamento,
// o React desmonta a árvore inteira e a pessoa fica com a tela em branco.
// Aqui o 404 do chunk é simulado interceptando a requisição.

const CHUNK_TELA_TEMATICA = '**/assets/ThematicStudyView-*.js';

async function login(page: Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

test.describe('Recuperação quando o arquivo de uma tela sumiu depois de um deploy', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
  });

  async function novoEstudante() {
    const student = await createTestUser({
      emailLocalPart: `recarga-deploy-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'student',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(student.id));
    return student;
  }

  test('recarrega a página uma vez e abre a tela pedida', async ({ page }) => {
    const student = await novoEstudante();
    await login(page, student);

    let falhas = 0;
    await page.route(CHUNK_TELA_TEMATICA, async (route) => {
      if (falhas === 0) {
        falhas += 1;
        await route.fulfill({ status: 404, body: 'not found' });
        return;
      }
      await route.continue();
    });

    await page.locator('#nav-thematic-study').click();

    await expect(page.locator('#thematic-study-view')).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/#\/thematic-study$/);
    expect(falhas).toBe(1);
  });

  test('se continuar falhando, mostra aviso com botão de recarregar em vez de tela em branco', async ({ page }) => {
    const student = await novoEstudante();
    await login(page, student);

    let carregamentos = 0;
    page.on('load', () => {
      carregamentos += 1;
    });
    await page.route(CHUNK_TELA_TEMATICA, (route) => route.fulfill({ status: 404, body: 'not found' }));

    await page.locator('#nav-thematic-study').click();

    await expect(page.locator('#app-load-error')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#btn-app-load-error-reload')).toBeVisible();
    // No máximo uma recarga automática — nunca um laço de recargas.
    expect(carregamentos).toBeLessThanOrEqual(1);
    // A navegação do app continua de pé: trocar de tela limpa o aviso.
    await page.locator('#nav-dashboard').click();
    await expect(page.locator('#app-load-error')).toBeHidden();
    await expect(page.locator('#nav-dashboard')).toHaveAttribute('aria-current', 'page');
  });
});
