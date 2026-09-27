import { test, expect, Page } from '@playwright/test';
import { createTestUser, deleteTestUser, getSeedIds, psqlLocal, type CreatedTestUser } from '../fixtures/localSupabase';

// Unidade 45-G — sem rede, a tela avisa; com rede, o estado é o do servidor.
//
// - AUD-29: num aparelho novo (nada na cópia local), o favorito e a seção lida
//   que vêm do servidor aparecem marcados, e clicar DESMARCA — antes, a
//   estrela preenchida gravava "favoritar" porque o app invertia a cópia local
//   vazia.
// - D-2: sem rede, a tela diz "sem conexão", mantém o que já estava ali (o
//   material aberto não some) e carrega sozinha quando a rede volta.
//
// Cada teste abre um contexto de navegador novo (é o "aparelho novo"). Rede
// simulada com `page.route` na API REST (nunca `context.setOffline`, que
// bloquearia a própria página — ver offline-queue.spec.ts).

const SEED_MATERIAL_TITLE = 'Insuficiência Cardíaca — Visão Geral (Seed)';

async function login(page: Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

async function openQuestionsBank(page: Page) {
  await page.locator('#dock-nav-resources').click();
  await page.locator('#dock-resources-questions').click();
}

async function openSeedMaterial(page: Page) {
  await page.locator('#dock-nav-resources').click();
  await page.locator('#dock-resources-compendiums').click();
  await page.getByRole('button', { name: 'Modo árvore' }).click();
  await page.getByRole('button', { name: SEED_MATERIAL_TITLE, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Fisiopatologia Básica' }).first()).toBeVisible({ timeout: 15_000 });
}

/** Derruba (ou devolve) a API REST do Supabase para esta página. */
async function setRestReachable(page: Page, reachable: boolean) {
  if (reachable) {
    await page.unroute('**/rest/v1/**');
  } else {
    await page.route('**/rest/v1/**', (route) => route.abort('internetdisconnected'));
  }
}

test.describe('45-G — sem rede a tela avisa; com rede o estado é o do servidor', () => {
  let user: CreatedTestUser;

  test.beforeEach(async () => {
    user = await createTestUser({
      emailLocalPart: `rede45g-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'student',
      status: 'active',
    });
  });

  test.afterEach(async () => {
    psqlLocal(`delete from public.bookmarks where user_id = '${user.id}';`);
    psqlLocal(`delete from public.reading_progress where user_id = '${user.id}';`);
    await deleteTestUser(user.id);
  });

  test('aparelho novo: questão favoritada em outro aparelho aparece favoritada, e clicar remove o favorito', async ({ page }) => {
    const { questionId } = getSeedIds();
    psqlLocal(`insert into public.bookmarks (user_id, question_id) values ('${user.id}', '${questionId}');`);

    await login(page, user);
    await openQuestionsBank(page);
    const card = page.locator(`#question-${questionId}`);
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.locator('svg.fill-rose-500')).toBeVisible({ timeout: 10_000 }); // estrela preenchida

    await card.getByTitle('Favoritar questão').click();

    await expect(card.getByText('Removida dos favoritos')).toBeVisible();
    await expect
      .poll(() => Number(psqlLocal(`select count(*) from public.bookmarks where user_id = '${user.id}';`)), { timeout: 15_000 })
      .toBe(0);
  });

  test('aparelho novo: seção lida em outro aparelho aparece lida, e clicar desmarca', async ({ page }) => {
    const { materialId } = getSeedIds();
    const sectionId = psqlLocal(`select id from public.material_sections where material_id = '${materialId}' order by sort_order limit 1;`);
    psqlLocal(
      `insert into public.reading_progress (user_id, material_id, read_section_ids, percent) values ('${user.id}', '${materialId}', array['${sectionId}']::uuid[], 100);`
    );

    await login(page, user);
    await openSeedMaterial(page);
    const lida = page.getByRole('button', { name: 'Lida', exact: true }).first();
    await expect(lida).toBeVisible({ timeout: 10_000 });

    await lida.click();

    await expect(page.getByRole('button', { name: 'Marcar lida', exact: true }).first()).toBeVisible();
    await expect
      .poll(
        () =>
          psqlLocal(
            `select coalesce(array_length(read_section_ids, 1), 0) from public.reading_progress where user_id = '${user.id}' and material_id = '${materialId}';`
          ),
        { timeout: 15_000 }
      )
      .toBe('0');
  });

  test('sem rede, a lista de questões diz "sem conexão" e carrega sozinha quando a rede volta', async ({ page }) => {
    await login(page, user);
    await setRestReachable(page, false);
    await openQuestionsBank(page);

    const notice = page.getByRole('status').filter({ hasText: 'Sem conexão' }).first();
    await expect(notice).toBeVisible({ timeout: 15_000 });

    await setRestReachable(page, true);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByRole('status').filter({ hasText: 'Sem conexão' })).toHaveCount(0, { timeout: 15_000 });
  });

  test('o material aberto não some quando a rede cai: o leitor avisa e segue mostrando o texto', async ({ page }) => {
    await login(page, user);
    // O material já foi carregado pelo app; a rede cai antes de abrir o leitor.
    await setRestReachable(page, false);
    await openSeedMaterial(page);

    await expect(page.getByRole('status').filter({ hasText: 'Sem conexão' }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Texto demonstrativo de seção para fins de teste local.').first()).toBeVisible();

    await setRestReachable(page, true);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByRole('status').filter({ hasText: 'Sem conexão' })).toHaveCount(0, { timeout: 15_000 });
  });
});
