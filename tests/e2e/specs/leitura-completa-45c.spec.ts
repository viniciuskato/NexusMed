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

// Unidade 45-C (AUD-21) contra o PostgREST de verdade, com o teto real de
// 1000 linhas por resposta (`max_rows` do supabase/config.toml).
//
// O acervo publicado já passa de 800 seções de material. Acima de 1000, a
// leitura sem paginação cortava em silêncio: os materiais cujas seções caíam
// depois da linha 1000 apareciam incompletos para todo estudante. Aqui um
// único material publicado tem 1101 seções, e o estudante tem de ver todas.
// (O mesmo corte em tentativas, flashcards, caderno de erros e simulados é
// provado por teste unitário contra um PostgREST de mentira com o mesmo teto:
// tests/unit/leituraCompleta45c.test.ts.)

const TOTAL_SECTIONS = 1101;

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

test.describe('45-C — leitura completa, sem corte em 1000 linhas', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
  });

  test(`material publicado com ${TOTAL_SECTIONS} seções aparece inteiro para o estudante`, async ({ page }) => {
    const tag = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const title = `${MATERIAL_PREFIX}leitura-45c-${tag}`;
    const materialId = insertPublishedMaterial(`leitura-45c-${tag}`);
    cleanup.push(() => deleteE2EMaterials());
    // O fixture já cria a seção 1; completa até TOTAL_SECTIONS.
    psqlLocal(
      `insert into public.material_sections (material_id, sort_order, title, content, key_takeaways) ` +
        `select '${materialId}', n, 'Seção 45-C número ' || n, 'Conteúdo ' || n, array[]::text[] ` +
        `from generate_series(2, ${TOTAL_SECTIONS}) as n;`
    );

    const user = await createTestUser({
      emailLocalPart: `e2e-45c-leitura-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'student',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(user.id));

    await login(page, user);
    await openLibraryTree(page);
    await page.getByRole('button', { name: title, exact: true }).click();

    // Todas as seções no corpo do leitor, inclusive as depois da linha 1000.
    await expect(page.getByRole('heading', { name: `Seção 45-C número ${TOTAL_SECTIONS}`, exact: true })).toBeAttached();
    await expect(page.getByRole('heading', { name: /^Seção 45-C número \d+$/ })).toHaveCount(TOTAL_SECTIONS - 1);

    // E o contador do índice conta todas.
    await page.getByRole('button', { name: 'Índice de seções' }).click();
    await expect(page.getByText(`0/${TOTAL_SECTIONS} seções`)).toBeVisible();
  });
});
