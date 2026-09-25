import { test, expect, Page } from '@playwright/test';
import { createTestUser, deleteTestUser, psqlLocal, type CreatedTestUser } from '../fixtures/localSupabase';

// Unidade 45-E — sincronização que não perde nem reordena.
//
// - AUD-19: com a rede oscilando, uma ação antiga (favoritar) que falhou e
//   ficou esperando nova tentativa não pode chegar ao servidor depois da
//   ação nova (desfavoritar) — nem depois de recarregar a página com a
//   operação pendente e a rede voltando.
// - AUD-25: "faça login novamente" se resolve ao sair e entrar de novo: o que
//   estava pendente sobe sozinho, e o botão "Tentar novamente" aparece.
//
// Rede simulada com `page.route` só na tabela `bookmarks` (nunca
// `context.setOffline`, que bloquearia o próprio reload — ver
// offline-queue.spec.ts).

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

async function openFirstQuestion(page: Page) {
  await page.locator('#dock-nav-resources').click();
  await page.locator('#dock-resources-questions').click();
  const card = page.locator('[data-answer-origin]').first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  return card;
}

function countBookmarks(userId: string): number {
  return Number(psqlLocal(`select count(*) from public.bookmarks where user_id = '${userId}';`));
}

function pendingOps(page: Page, userId: string) {
  return page.evaluate(
    (uid) =>
      (JSON.parse(localStorage.getItem(`synapse_${uid}_sync_queue_v1`) || '[]') as Array<{ state: string }>).filter(
        (o) => o.state !== 'synced'
      ).length,
    userId
  );
}

/** Operações que já falharam ao menos uma vez e esperam nova tentativa. */
function failedAttempts(page: Page, userId: string) {
  return page.evaluate(
    (uid) =>
      (
        JSON.parse(localStorage.getItem(`synapse_${uid}_sync_queue_v1`) || '[]') as Array<{ state: string; attempts: number }>
      ).filter((o) => o.state === 'pending' && o.attempts > 0).length,
    userId
  );
}

test.describe('45-E — sincronização que não perde nem reordena', () => {
  let user: CreatedTestUser;

  test.beforeEach(async () => {
    user = await createTestUser({
      emailLocalPart: `sync45e-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'student',
      status: 'active',
    });
  });

  test.afterEach(async () => {
    await deleteTestUser(user.id);
  });

  test('favoritar que falhou por rede não chega depois do desfavoritar, nem ao recarregar com a operação pendente', async ({ page }) => {
    test.setTimeout(60_000);
    await login(page, user);
    const card = await openFirstQuestion(page);
    const bookmarkBtn = card.getByRole('button', { name: /favorit/i }).first();

    let offline = true;
    await page.route('**/rest/v1/bookmarks**', (route) => (offline ? route.abort('internetdisconnected') : route.continue()));

    // Favorita com a rede caída: a operação falha e fica esperando nova tentativa.
    await bookmarkBtn.click();
    await expect.poll(() => failedAttempts(page, user.id), { timeout: 10_000 }).toBe(1);

    // A rede volta e o estudante desfavorita.
    offline = false;
    await bookmarkBtn.click();

    // Recarrega com a fila como estiver e dispara o sinal forte de rede de volta.
    await page.reload();
    await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    await expect.poll(() => pendingOps(page, user.id), { timeout: 20_000 }).toBe(0);
    // Dá tempo a qualquer reenvio tardio da operação antiga antes de conferir o estado final.
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForTimeout(2_000);
    expect(countBookmarks(user.id)).toBe(0);
  });

  test('depois de "faça login novamente", sair e entrar de novo reenvia o que estava pendente', async ({ page }) => {
    test.setTimeout(60_000);
    await login(page, user);
    const card = await openFirstQuestion(page);

    // Sessão recusada pelo servidor (ex.: relógio do aparelho atrasado).
    let expired = true;
    await page.route('**/rest/v1/bookmarks**', (route) =>
      expired
        ? route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ code: 'PGRST301', message: 'JWT expired' }),
          })
        : route.continue()
    );

    await card.getByRole('button', { name: /favorit/i }).first().click();
    const indicator = page.getByRole('button', { name: 'Faça login novamente para sincronizar' });
    await expect(indicator).toBeVisible({ timeout: 10_000 });
    await indicator.click();
    await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
    expect(countBookmarks(user.id)).toBe(0);

    expired = false;
    await logout(page);
    await login(page, user);

    await expect.poll(() => countBookmarks(user.id), { timeout: 20_000 }).toBe(1);
    await expect.poll(() => pendingOps(page, user.id), { timeout: 10_000 }).toBe(0);
  });
});
