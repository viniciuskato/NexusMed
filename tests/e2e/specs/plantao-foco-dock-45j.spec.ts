import { test, expect, type Locator, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, runCleanup, type CreatedTestUser } from '../fixtures/localSupabase';

// Unidade 45-J — o "Plantão de Foco" não cobre o menu inferior em tela estreita.
//
// Em ~390px o widget flutuante do Plantão de Foco ficava por cima do menu
// "Recursos" do dock inferior: o clique em "Biblioteca" caía no widget e não
// chegava ao destino (achado ao escrever o E2E da Fase 3 da taxonomia, que
// até aqui contornava reduzindo o viewport só depois de navegar).
//
// O que se mede aqui é quem recebe o toque: para cada item do menu, o
// elemento no topo do ponto central (`elementFromPoint`) tem de ser o próprio
// item — com o widget fechado e com ele aberto. E o widget continua
// alcançável quando o menu está fechado.

async function login(page: Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

/** O elemento no topo do centro do alvo é o próprio alvo (ou algo dentro dele)? */
async function receivesTapAtCenter(target: Locator): Promise<boolean> {
  await expect(target).toBeVisible();
  return target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return top !== null && el.contains(top);
  });
}

const RESOURCE_ITEMS = ['#dock-resources-compendiums', '#dock-resources-questions', '#dock-resources-flashcards'];

async function expectEveryResourceItemReceivesTap(page: Page) {
  await page.locator('#dock-nav-resources').click();
  await expect(page.locator('#dock-resources-menu')).toBeVisible();
  for (const selector of RESOURCE_ITEMS) {
    expect(await receivesTapAtCenter(page.locator(selector)), `${selector} coberto por outro elemento`).toBe(true);
  }
}

test.describe('45-J — Plantão de Foco e menu inferior em tela estreita', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
  });

  async function setupStudent(localPart: string): Promise<CreatedTestUser> {
    const user = await createTestUser({
      emailLocalPart: `${localPart}-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'student',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(user.id));
    return user;
  }

  test('nenhum item do menu Recursos fica coberto, com o widget fechado ou aberto, e o widget segue alcançável', async ({
    page,
  }) => {
    const user = await setupStudent('e2e-45j-dock');
    await login(page, user);

    const widget = page.getByRole('complementary', { name: 'Plantão de Foco' });
    await expect(widget).toBeVisible();

    // Widget fechado (estado inicial): os três itens recebem o toque, e o
    // clique em "Biblioteca" chega ao destino.
    await expectEveryResourceItemReceivesTap(page);
    await page.locator('#dock-resources-compendiums').click();
    await expect(page.getByRole('button', { name: 'Modo árvore' })).toBeVisible();

    // Com o menu fechado, o widget é alcançável e abre.
    const openWidget = page.getByTitle('Abrir Plantão de Foco Clínico (Pomodoro)');
    expect(await receivesTapAtCenter(openWidget), 'widget fechado coberto por outro elemento').toBe(true);
    await openWidget.click();
    await expect(page.getByRole('heading', { name: 'Plantão de Foco Clínico' })).toBeVisible();

    // Widget aberto: o menu continua por cima dele.
    await expectEveryResourceItemReceivesTap(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#dock-resources-menu')).toHaveCount(0);

    // Menu fechado de novo: os controles do widget aberto voltam a ser alcançáveis.
    const closeWidget = widget.getByTitle('Fechar');
    expect(await receivesTapAtCenter(closeWidget), 'controle do widget aberto coberto').toBe(true);
    await closeWidget.click();
    await expect(openWidget).toBeVisible();
  });
});
