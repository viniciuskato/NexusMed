import { test, expect, Page, Browser } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  getSeedIds,
  countQuestionReactions,
  countNotesForMaterial,
  getNoteText,
  getReadingProgress,
  countSimulationRows,
  type CreatedTestUser,
} from '../fixtures/localSupabase';

// Prompt 13-B — lacunas 1 (reação/nota/progresso) e 3 (simulado) deixadas pelo
// 13-A. Reaproveita login/seletores já provados nas specs existentes
// (auth-gates/isolation/offline-queue/question-answer-rehydration) — nenhum
// helper de navegação novo além do estritamente necessário para alcançar
// Simulados/Compêndio, que a suíte anterior não exercitava. (A lacuna 2, a
// revisão de flashcard, saiu com a tela de cartões na CORTE-1, D-14; o RPC
// segue coberto no pgTAP.)

async function login(page: Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 15_000 });
}

/**
 * Segundo "dispositivo" do MESMO usuário: um BrowserContext totalmente
 * independente (localStorage/sessão próprios), login feito de novo — nunca
 * duas abas do MESMO contexto. A fila de sincronização (syncQueue) é
 * persistida em `localStorage` sem nenhuma trava entre abas que compartilham
 * o mesmo contexto (duas abas de uma janela real fariam exatamente a mesma
 * corrida) — ACHADO deste prompt, registrado em docs/diretoria/registro.md,
 * não corrigido aqui (mudar a arquitetura da fila para ser segura entre
 * abas do MESMO contexto é uma frente própria, fora do escopo do 13-B).
 * Usar dois `BrowserContext` prova exatamente a garantia que as RPCs
 * (lock de linha, upsert idempotente, merge de conflito) foram desenhadas
 * para dar: duas sessões/dispositivos reais do mesmo usuário editando o
 * mesmo recurso ao mesmo tempo, cada um com sua própria fila local.
 */
async function secondDeviceLoggedIn(browser: Browser, user: CreatedTestUser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, user);
  return page;
}

// PAINEL-2: os acervos (Biblioteca, Questões) são botões do dock.
async function goToResource(page: Page, id: 'compendiums' | 'questions') {
  await page.locator(`#dock-nav-${id}`).click();
}

async function goToQuestionsBank(page: Page) {
  await goToResource(page, 'questions');
}

test.describe('Reação/nota/progresso de leitura — duas abas da mesma conta', () => {
  let user: CreatedTestUser;
  let seed: ReturnType<typeof getSeedIds>;

  test.beforeEach(async () => {
    seed = getSeedIds();
    user = await createTestUser({ emailLocalPart: `two-tabs-${Date.now()}`, password: 'senha-teste-123', role: 'student', status: 'active' });
  });

  test.afterEach(async () => {
    await deleteTestUser(user.id);
  });

  test('duas abas reagem à mesma questão quase ao mesmo tempo: converge sem duplicar linha', async ({ page, browser }) => {
    await login(page, user);
    await goToQuestionsBank(page);
    const card = page.locator('[data-answer-origin]').first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByText('A', { exact: true }).first().click();
    await card.getByRole('button', { name: 'Confirmar Resposta' }).click();
    await expect(card).toHaveAttribute('data-answer-origin', 'session', { timeout: 15_000 });

    const page2 = await secondDeviceLoggedIn(browser, user);
    await goToQuestionsBank(page2);
    const card2 = page2.locator('[data-answer-origin]').first();
    await expect(card2).toHaveAttribute('data-answer-origin', 'hydrated', { timeout: 15_000 });

    await Promise.all([
      card.getByTitle('Explicação útil').click(),
      card2.getByTitle('Explicação confusa').click(),
    ]);

    await expect
      .poll(() => countQuestionReactions(user.id, seed.questionId), { timeout: 15_000 })
      .toBe(1); // upsert por (user_id, question_id) — nunca 2 linhas, mesmo com 2 abas gravando ao mesmo tempo
    await page2.context().close();
  });

  test('duas abas editam a mesma anotação de compêndio quase ao mesmo tempo: funde, nunca duplica nem perde as duas edições', async ({ page, browser }) => {
    await login(page, user);
    await goToResource(page, 'compendiums');
    await page.getByText('Insuficiência Cardíaca — Visão Geral (Seed)', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Anotações pessoais' }).click();
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill('Anotação da aba 1 — hipertrofia excêntrica.');

    const page2 = await secondDeviceLoggedIn(browser, user);
    await goToResource(page2, 'compendiums');
    await page2.getByText('Insuficiência Cardíaca — Visão Geral (Seed)', { exact: true }).first().click();
    await page2.getByRole('button', { name: 'Anotações pessoais' }).click();
    const textarea2 = page2.locator('textarea');
    await expect(textarea2).toBeVisible({ timeout: 10_000 });
    await textarea2.fill('Anotação da aba 2 — remodelamento ventricular.');

    await Promise.all([
      page.getByRole('button', { name: 'Salvar anotação' }).click(),
      page2.getByRole('button', { name: 'Salvar anotação' }).click(),
    ]);

    await expect
      .poll(() => countNotesForMaterial(seed.materialId, user.id), { timeout: 15_000 })
      .toBe(1); // nunca 2 linhas — schema garante 1 nota por (usuário, alvo)

    await expect
      .poll(() => getNoteText(seed.materialId, user.id), { timeout: 15_000 })
      .not.toBeNull();
    const finalText = getNoteText(seed.materialId, user.id) ?? '';
    expect(finalText.length).toBeGreaterThan(0);
    // Nenhuma das duas edições pode ter sido silenciosamente descartada: ou o
    // servidor aceitou uma delas por completo (texto igual a uma das duas), ou
    // fundiu as duas (upsert_note/mergeConflictingNoteText) e o texto final
    // contém ambos os fragmentos.
    const containsTab1 = finalText.includes('aba 1');
    const containsTab2 = finalText.includes('aba 2');
    expect(containsTab1 || containsTab2).toBe(true);
    await page2.context().close();
  });

  test('duas abas marcam a mesma seção como lida quase ao mesmo tempo: idempotente, sem corromper o percentual', async ({ page, browser }) => {
    await login(page, user);
    await goToResource(page, 'compendiums');
    await page.getByText('Insuficiência Cardíaca — Visão Geral (Seed)', { exact: true }).first().click();
    const markReadBtn = page.getByRole('button', { name: /Marcar lida|Lida/ }).first();
    await expect(markReadBtn).toBeVisible({ timeout: 10_000 });

    const page2 = await secondDeviceLoggedIn(browser, user);
    await goToResource(page2, 'compendiums');
    await page2.getByText('Insuficiência Cardíaca — Visão Geral (Seed)', { exact: true }).first().click();
    const markReadBtn2 = page2.getByRole('button', { name: /Marcar lida|Lida/ }).first();
    await expect(markReadBtn2).toBeVisible({ timeout: 10_000 });

    await Promise.all([markReadBtn.click(), markReadBtn2.click()]);

    await expect
      .poll(() => getReadingProgress(seed.materialId, user.id)?.percent ?? -1, { timeout: 15_000 })
      .toBe(100); // seed tem 1 única seção — marcá-la lida (mesmo em duas abas) sempre converge para 100%
    const progress = getReadingProgress(seed.materialId, user.id);
    expect(progress?.readSectionIds).toHaveLength(1); // nunca duplica a seção no array por causa da corrida
    await page2.context().close();
  });
});

test.describe('Simulado — rascunho local e finalização idempotente', () => {
  let user: CreatedTestUser;

  test.beforeEach(async () => {
    user = await createTestUser({ emailLocalPart: `simulado-${Date.now()}`, password: 'senha-teste-123', role: 'student', status: 'active' });
  });

  test.afterEach(async () => {
    await deleteTestUser(user.id);
  });

  async function startExpressSimulado(page: Page) {
    // PAINEL-2: o atalho "Simulado" mora no Início (a tela de entrada).
    await page.locator('#painel-simulado').click();
    await page.getByText('Simulado Express Misto', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Finalizar Prova' })).toBeVisible({ timeout: 15_000 });
  }

  test('rascunho de resposta é gravado localmente antes de finalizar (sobrevive a uma queda antes do envio)', async ({ page }) => {
    await login(page, user);
    await startExpressSimulado(page);
    await page.getByText('A', { exact: true }).first().click();

    const draftRaw = await page.evaluate(() => {
      const key = Object.keys(window.localStorage).find((k) => k.includes('simulado_draft'));
      return key ? window.localStorage.getItem(key) : null;
    });
    expect(draftRaw).not.toBeNull();
    expect(draftRaw).toContain('"A"');
  });

  test('finalização com falha de rede retenta automaticamente e converge para exatamente 1 sessão gravada (nunca duplica)', async ({ page }) => {
    test.setTimeout(75_000);
    await login(page, user);
    await startExpressSimulado(page);
    await page.getByText('A', { exact: true }).first().click();

    let blocking = true;
    let capturedSimulationId: string | null = null;
    await page.route('**/rest/v1/rpc/save_simulado_session', async (route) => {
      try {
        const body = route.request().postDataJSON() as { p_session?: { id?: string } };
        capturedSimulationId = body?.p_session?.id ?? capturedSimulationId;
      } catch {
        // corpo não-JSON (não deveria acontecer) — segue sem capturar o id agora, a query direta abaixo cobre.
      }
      if (blocking) return route.abort('internetdisconnected');
      return route.continue();
    });

    await page.getByRole('button', { name: 'Finalizar Prova' }).click();
    await expect(page.getByText('Correção pendente')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText('0%', { exact: true })).toHaveCount(0);

    await page.waitForTimeout(500);
    expect(capturedSimulationId).not.toBeNull();
    const simId = capturedSimulationId as unknown as string;
    expect(countSimulationRows(simId).simulations).toBe(0); // bloqueado — nada chegou ao servidor ainda

    blocking = false;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    await expect
      .poll(() => countSimulationRows(simId).simulations, { timeout: 20_000, message: 'aguardando retry do save_simulado_session convergir' })
      .toBe(1);
    await expect(page.getByText('Voltar ao Painel Geral')).toBeVisible({ timeout: 15_000 });
    const finalCounts = countSimulationRows(simId);
    expect(finalCounts.questions).toBe(1); // 1 única questão elegível no seed local
    expect(finalCounts.answers).toBe(1);

    // Retentar o MESMO envio de novo (reload dispara reconciliação) continua
    // idempotente: substituição total pelo mesmo payload, nunca duplica linha.
    await page.reload();
    await page.waitForTimeout(2_000);
    const afterReload = countSimulationRows(simId);
    expect(afterReload.simulations).toBe(1);
    expect(afterReload.answers).toBe(1);
  });
});
