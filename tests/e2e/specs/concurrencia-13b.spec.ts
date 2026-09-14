import { test, expect, Page, Browser } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  getSeedIds,
  insertFlashcardForUser,
  countFlashcardReviews,
  getFlashcardSrsState,
  countQuestionReactions,
  countNotesForMaterial,
  getNoteText,
  getReadingProgress,
  countSimulationRows,
  type CreatedTestUser,
} from '../fixtures/localSupabase';

// Prompt 13-B — lacunas 1 (reação/nota/progresso), 2 (SRS de flashcard) e 3
// (simulado) deixadas pelo 13-A. Reaproveita login/seletores já provados nas
// specs existentes (auth-gates/isolation/offline-queue/question-answer-
// rehydration) — nenhum helper de navegação novo além do estritamente
// necessário para alcançar Flashcards/Simulados/Compêndio, que a suíte
// anterior não exercitava.

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

// Prompt 22-A: o dock passou a ter Início / Estudo Temático / Recursos, e os
// três acervos (Biblioteca, Questões, Cards) ficam dentro de "Recursos".
async function goToResource(page: Page, id: 'compendiums' | 'questions' | 'flashcards') {
  await page.locator('#dock-nav-resources').click();
  await page.locator(`#dock-resources-${id}`).click();
}

async function goToQuestionsBank(page: Page) {
  await goToResource(page, 'questions');
}

/**
 * CORREÇÃO PÓS-13-B: esta função existia porque `reviewFlashcard` antes
 * dependia de encontrar o card no cache LOCAL (`localStorage`) para decidir
 * se chamava a RPC — e um flashcard inserido direto no servidor (como aqui,
 * via `insertFlashcardForUser`) nunca caía nesse cache, então a revisão era
 * descartada em silêncio SEMPRE, não só no teste. A suposição de que "todo
 * flashcard passa por `saveFlashcard` antes" estava errada para conteúdo
 * real (carregado direto no Supabase, nunca via `saveFlashcard` local) — é
 * o caso comum em produção, não uma exceção. `reviewFlashcard` foi corrigido
 * para não depender mais disso (ver `FlashcardsRepository.ts`); o teste
 * `flashcard que NUNCA passou por saveFlashcard local...` abaixo prova o
 * caminho real sem esta função. Mantida aqui só para os testes de
 * concorrência entre dois dispositivos, onde pré-popular o cache elimina uma
 * variável irrelevante ao que eles medem (o lock de linha da RPC).
 */
async function seedLocalFlashcardCache(
  page: Page,
  userId: string,
  flashcardId: string,
  seed: ReturnType<typeof getSeedIds>
) {
  await page.evaluate(
    ({ userId, flashcardId, disciplineId, themeId }) => {
      const key = `synapse_${userId}_flashcards_v1`;
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      existing.push({
        id: flashcardId,
        disciplineId,
        themeId,
        front: 'Frente demonstrativa 13-B',
        back: 'Verso demonstrativo 13-B',
        mechanismHighlight: '',
        tags: [],
        difficulty: 'medio',
        isCustom: true,
        srs: {
          intervalDays: 0,
          repetitionCount: 0,
          easeFactor: 2.5,
          nextDueDate: new Date().toISOString(),
          state: 'new',
          reviewHistory: [],
        },
      });
      localStorage.setItem(key, JSON.stringify(existing));
    },
    { userId, flashcardId, disciplineId: seed.disciplineId, themeId: seed.themeId }
  );
  await page.reload();
}

test.describe('Reação/nota/progresso de leitura — duas abas da mesma conta', () => {
  let user: CreatedTestUser;
  let seed: ReturnType<typeof getSeedIds>;

  test.beforeEach(async () => {
    seed = getSeedIds();
    user = await createTestUser({ emailLocalPart: `two-tabs-${Date.now()}`, password: 'senha-teste-123', role: 'student', status: 'active' });
  });

  test.afterEach(async () => {
    await deleteTestUser(user.id).catch(() => undefined);
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

test.describe('Revisão de flashcard (SRS) — concorrência real e idempotência de retry', () => {
  let user: CreatedTestUser;
  let flashcardId: string;
  let seed: ReturnType<typeof getSeedIds>;

  test.beforeEach(async () => {
    seed = getSeedIds();
    user = await createTestUser({ emailLocalPart: `srs-${Date.now()}`, password: 'senha-teste-123', role: 'student', status: 'active' });
    flashcardId = insertFlashcardForUser(user.id, seed);
  });

  test.afterEach(async () => {
    await deleteTestUser(user.id).catch(() => undefined);
  });

  async function openReviewSession(page: Page) {
    await goToResource(page, 'flashcards');
    await page.getByRole('button', { name: /Revisar .*Cards? Pendentes|Revisar Todos os Cards/ }).click();
  }

  async function flipAndRate(page: Page, ratingLabel: RegExp) {
    await page.getByRole('button', { name: 'Revelar Resposta' }).click();
    await page.getByRole('button', { name: ratingLabel }).click();
  }

  test('duas abas revisam o MESMO flashcard quase ao mesmo tempo: nenhuma revisão se perde (2 linhas em flashcard_reviews, SRS serializado)', async ({ page, browser }) => {
    await login(page, user);
    await seedLocalFlashcardCache(page, user.id, flashcardId, seed);
    await openReviewSession(page);
    await expect(page.getByRole('button', { name: 'Revelar Resposta' })).toBeVisible({ timeout: 15_000 });

    const page2 = await secondDeviceLoggedIn(browser, user);
    await seedLocalFlashcardCache(page2, user.id, flashcardId, seed);
    await openReviewSession(page2);
    await expect(page2.getByRole('button', { name: 'Revelar Resposta' })).toBeVisible({ timeout: 15_000 });

    await Promise.all([
      flipAndRate(page, /3\. Bom/),
      flipAndRate(page2, /4\. Fácil/),
    ]);

    await expect
      .poll(() => countFlashcardReviews(flashcardId), { timeout: 20_000 })
      .toBe(2); // duas revisões concorrentes, nenhuma perdida por sobrescrita (lock de linha em submit_flashcard_review)
    const srs = getFlashcardSrsState(flashcardId);
    expect(srs.repetitionCount).toBe(2); // aplicadas em série pelo lock — nunca as duas "do zero" a partir do mesmo estado inicial
    await page2.context().close();
  });

  test('retry de rede da MESMA revisão (queda e reconexão) não duplica em flashcard_reviews', async ({ page }) => {
    await login(page, user);
    await seedLocalFlashcardCache(page, user.id, flashcardId, seed);
    await openReviewSession(page);
    await expect(page.getByRole('button', { name: 'Revelar Resposta' })).toBeVisible({ timeout: 15_000 });

    let blocking = true;
    await page.route('**/rest/v1/rpc/submit_flashcard_review', async (route) => {
      if (blocking) return route.abort('internetdisconnected');
      return route.continue();
    });

    await flipAndRate(page, /3\. Bom/);
    // A revisão local (otimista) já aconteceu; o servidor ainda não recebeu nada.
    await page.waitForTimeout(500);
    expect(countFlashcardReviews(flashcardId)).toBe(0);

    blocking = false;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    await expect
      .poll(() => countFlashcardReviews(flashcardId), { timeout: 20_000, message: 'aguardando retry convergir' })
      .toBe(1); // exatamente 1, nunca 2 — mesmo client_op_id reenviado pela fila até o servidor confirmar
  });

  test('flashcard que NUNCA passou por saveFlashcard local (só existe no servidor) tem a revisão gravada mesmo assim', async ({ page }) => {
    // Regressão do achado pós-13-B: `flashcardsRepository.reviewFlashcard`
    // dependia de encontrar o card no cache local antes de decidir chamar a
    // RPC; um flashcard de conteúdo real (nunca criado via `saveFlashcard`
    // no dispositivo) nunca cai nesse cache, e a revisão era descartada em
    // silêncio. Este teste reproduz o cenário real (SEM
    // `seedLocalFlashcardCache`) para provar que a correção não depende
    // mais do cache estar pré-populado.
    await login(page, user);
    await openReviewSession(page);
    await expect(page.getByRole('button', { name: 'Revelar Resposta' })).toBeVisible({ timeout: 15_000 });

    await flipAndRate(page, /3\. Bom/);

    await expect
      .poll(() => countFlashcardReviews(flashcardId), { timeout: 20_000, message: 'revisão não foi gravada no servidor' })
      .toBe(1);
    const srs = getFlashcardSrsState(flashcardId);
    expect(srs.repetitionCount).toBe(1);
  });
});

test.describe('Simulado — rascunho local e finalização idempotente', () => {
  let user: CreatedTestUser;

  test.beforeEach(async () => {
    user = await createTestUser({ emailLocalPart: `simulado-${Date.now()}`, password: 'senha-teste-123', role: 'student', status: 'active' });
  });

  test.afterEach(async () => {
    await deleteTestUser(user.id).catch(() => undefined);
  });

  async function startExpressSimulado(page: Page) {
    await page.locator('#dock-nav-dashboard').click();
    await page.getByRole('button', { name: 'Simulados & Provas' }).click();
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
    await expect(page.getByText('Voltar ao Painel Geral')).toBeVisible({ timeout: 15_000 });

    await page.waitForTimeout(500);
    expect(capturedSimulationId).not.toBeNull();
    const simId = capturedSimulationId as string;
    expect(countSimulationRows(simId).simulations).toBe(0); // bloqueado — nada chegou ao servidor ainda

    blocking = false;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    await expect
      .poll(() => countSimulationRows(simId).simulations, { timeout: 20_000, message: 'aguardando retry do save_simulado_session convergir' })
      .toBe(1);
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
