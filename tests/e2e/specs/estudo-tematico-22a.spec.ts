import { test, expect, type Page } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  deleteE2EMaterials,
  getSeedIds,
  insertFlashcardForUser,
  insertPublishedMaterial,
  countFlashcardReviews,
  type CreatedTestUser,
} from '../fixtures/localSupabase';

// Prompt 22-A — Estudo Temático por packs de material.
//
// A regra de vínculo (o que entra em cada pack) é provada por teste unitário
// puro (tests/unit/thematicPacks.test.ts). Aqui provamos o que só o navegador
// prova: navegação real, escopo aplicado às telas canônicas, retorno ao pack e
// restauração/recuperação do estado após reload.
//
// Todo o conteúdo criado aqui é local e removido no final de cada teste.

async function login(page: Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

async function openThematicStudy(page: Page) {
  await page.locator('#nav-thematic-study').click();
  await expect(page.locator('#thematic-study-view')).toBeVisible();
}

function uiStateKey(userId: string, key: string): string {
  // Mesmo formato de StorageService.getUserKey + getUIState.
  return `synapse_${userId}_ui_${key}_v1`;
}

test.describe('Estudo Temático (22-A)', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    for (const fn of cleanup) {
      await Promise.resolve(fn()).catch(() => undefined);
    }
    cleanup = [];
  });

  async function setupUser(localPart: string): Promise<CreatedTestUser> {
    const user = await createTestUser({
      emailLocalPart: `${localPart}-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'student',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(user.id));
    return user;
  }

  test('abre pelo menu, monta um pack por material do tema e mantém a questão só no pack certo', async ({
    page,
  }) => {
    const seed = getSeedIds();
    const user = await setupUser('tematico-packs');
    insertPublishedMaterial('Material Extra', seed);
    cleanup.push(() => deleteE2EMaterials());

    await login(page, user);
    await openThematicStudy(page);

    // Cenário 2: dois materiais no MESMO tema geram dois packs.
    const packCards = page.locator('[data-pack-card-id]');
    await expect(packCards).toHaveCount(2);

    // Cenário 3: a questão do seed referencia o material do seed e só aparece lá.
    await page.locator(`[data-pack-card-id="pack-${seed.materialId}"] button`).click();
    await expect(page.locator('#thematic-pack-view')).toHaveAttribute(
      'data-pack-id',
      `pack-${seed.materialId}`
    );
    await expect(page.locator('#thematic-pack-open-questions')).toContainText('Resolver questões (1)');

    await page.locator('#thematic-pack-back').click();
    const otherPack = page.locator('[data-pack-card-id]').filter({
      hasNotText: 'Insuficiência Cardíaca — Visão Geral (Seed)',
    });
    await otherPack.locator('button').click();
    await expect(page.locator('#thematic-pack-open-questions')).toContainText('Resolver questões (0)');
    await expect(page.locator('#thematic-pack-open-questions')).toBeDisabled();
    await expect(page.getByText('Nenhuma questão referencia este material.')).toBeVisible();
  });

  test('conteúdo sem material aparece uma vez na seção avulsa e card personalizado fica em Meus Cards', async ({
    page,
  }) => {
    const seed = getSeedIds();
    const user = await setupUser('tematico-avulso');
    insertPublishedMaterial('Material Extra', seed);
    cleanup.push(() => deleteE2EMaterials());
    // Card editorial do tema, sem material declarado (deve aparecer só na seção avulsa).
    insertFlashcardForUser(user.id, seed, { materialId: null, isCustom: false, front: 'Card sem material' });
    // Card criado pelo usuário (deve ficar só em Meus Cards Personalizados).
    insertFlashcardForUser(user.id, seed, { materialId: seed.materialId, isCustom: true, front: 'Card pessoal' });

    await login(page, user);
    await openThematicStudy(page);

    // Cenário 4: uma única seção avulsa para o tema, mesmo com dois packs.
    const loose = page.locator('[data-loose-theme-id]');
    await expect(loose).toHaveCount(1);
    await expect(loose).toContainText('Conteúdo do tema sem material associado');
    await expect(loose).toContainText('0 questões e 1 cards');

    // Cenário 5: o card personalizado não entrou em nenhum pack.
    await expect(page.locator('#thematic-custom-cards')).toContainText('1 cards criados por você');
    await page.locator(`[data-pack-card-id="pack-${seed.materialId}"] button`).click();
    await expect(page.locator('#thematic-pack-open-flashcards')).toContainText('Ver cards (0)');
  });

  test('leitura, questões e SRS voltam ao pack de origem', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    const seed = getSeedIds();
    const user = await setupUser('tematico-retorno');
    const flashcardId = insertFlashcardForUser(user.id, seed, {
      materialId: seed.materialId,
      isCustom: false,
      front: 'Card do material',
    });
    expect(countFlashcardReviews(flashcardId)).toBe(0);

    await login(page, user);
    await openThematicStudy(page);
    await page.locator(`[data-pack-card-id="pack-${seed.materialId}"] button`).click();

    // Leitura -> voltar
    await page.locator('#thematic-pack-open-reader').click();
    await expect(page.getByText('Retornar ao Estudo Temático').first()).toBeVisible();
    await page.getByText('Retornar ao Estudo Temático').first().click();
    await expect(page.locator('#thematic-pack-view')).toHaveAttribute(
      'data-pack-id',
      `pack-${seed.materialId}`
    );

    // Questões escopadas pelo material -> voltar
    await page.locator('#thematic-pack-open-questions').click();
    await expect(page.locator('#questions-return-to-pack')).toBeVisible();
    await expect(page.getByText('Exibindo')).toContainText('1 questões');
    await page.locator('#questions-return-to-pack button').click();
    await expect(page.locator('#thematic-pack-view')).toHaveAttribute(
      'data-pack-id',
      `pack-${seed.materialId}`
    );

    // SRS a partir do pack: usa a sessão canônica (submit_flashcard_review),
    // conclui uma avaliação real pelo caminho canônico e retorna ao MESMO
    // pack ao terminar a fila.
    await page.locator('#thematic-pack-start-srs').click();
    await expect(page.getByText('Card do material')).toBeVisible();

    await page.getByText('Revelar Resposta').click();
    await page.getByText('3. Bom').click();

    // Fila de um card só: a avaliação encerra a sessão imediatamente.
    await expect(page.getByText('Sessão de Revisão Concluída!')).toBeVisible();
    await page.getByText('Voltar ao Painel de Flashcards').click();

    await expect(page.locator('#thematic-pack-view')).toHaveAttribute(
      'data-pack-id',
      `pack-${seed.materialId}`
    );

    // A avaliação foi persistida pelo caminho canônico (RPC
    // submit_flashcard_review via reviewFlashcard()), não só refletida na UI.
    expect(countFlashcardReviews(flashcardId)).toBe(1);
    expect(pageErrors).toEqual([]);
  });

  test('reload preserva view e pack válidos, e recupera de um pack salvo inválido', async ({ page }) => {
    const seed = getSeedIds();
    const user = await setupUser('tematico-reload');

    await login(page, user);
    await openThematicStudy(page);
    await page.locator(`[data-pack-card-id="pack-${seed.materialId}"] button`).click();
    await expect(page.locator('#thematic-pack-view')).toBeVisible();

    await page.reload();
    await expect(page.locator('#thematic-pack-view')).toHaveAttribute(
      'data-pack-id',
      `pack-${seed.materialId}`,
      { timeout: 20_000 }
    );

    // Id salvo que não corresponde a nenhum material disponível agora.
    await page.evaluate(
      ([key]) => window.localStorage.setItem(key, JSON.stringify('pack-00000000-0000-0000-0000-000000000000')),
      [uiStateKey(user.id, 'nav_thematic_pack')]
    );
    await page.reload();
    await expect(page.locator('#thematic-study-view')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#thematic-invalid-pack-notice')).toBeVisible();

    // Valor fora da lista de permissão cai em Início, nunca numa view inventada.
    await page.evaluate(
      ([key]) => window.localStorage.setItem(key, JSON.stringify('view-que-nao-existe')),
      [uiStateKey(user.id, 'nav_active_view')]
    );
    await page.reload();
    await expect(page.locator('#thematic-study-view')).toHaveCount(0, { timeout: 20_000 });
    await expect(page.locator('#nav-dashboard')).toHaveAttribute('aria-current', 'page');
  });

  test('navegação Início / Estudo Temático / Recursos no desktop, no mobile e pelo teclado', async ({
    page,
  }) => {
    const user = await setupUser('tematico-nav');
    await login(page, user);

    // Desktop: menu do header, incluindo o agrupador Recursos.
    await page.locator('#nav-resources').click();
    await expect(page.locator('#nav-resources-menu')).toBeVisible();
    await page.locator('#nav-resources-questions').click();
    await expect(page.locator('#nav-resources-menu')).toHaveCount(0);
    await expect(page.getByText('Banco de Questões Médicas')).toBeVisible();

    // Teclado: foco direto no botão e Enter abrem o Estudo Temático; Escape
    // fecha o menu de Recursos sem navegar.
    await page.locator('#nav-thematic-study').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#thematic-study-view')).toBeVisible();
    await page.locator('#nav-resources').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#nav-resources-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#nav-resources-menu')).toHaveCount(0);
    await expect(page.locator('#thematic-study-view')).toBeVisible();

    // Mobile: os mesmos três destinos no dock flutuante.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#dock-nav-dashboard').click();
    await expect(page.locator('#thematic-study-view')).toHaveCount(0);
    await page.locator('#dock-nav-thematic-study').click();
    await expect(page.locator('#thematic-study-view')).toBeVisible();
    await page.locator('#dock-nav-resources').click();
    await expect(page.locator('#dock-resources-menu')).toBeVisible();
    await page.locator('#dock-resources-flashcards').click();
    await expect(page.locator('#dock-resources-menu')).toHaveCount(0);
    await expect(page.getByText('Repetição Espaçada Inteligente (SRS)')).toBeVisible();
  });
});
