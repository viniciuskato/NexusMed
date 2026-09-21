// Diagnóstico local: não modifica o código do produto, não reseta o banco.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const root = 'C:/Users/vinic/dev/NexusMed/firebase-auth';
const require = createRequire(`${root}/package.json`);
const { chromium } = require('@playwright/test');
const fixtures = await import(`file:///${root}/tests/e2e/fixtures/localSupabase.ts`);
const browser = await chromium.launch({ headless: true });
let user;
try {
  const seed = fixtures.getSeedIds();
  user = await fixtures.createTestUser({ emailLocalPart: `audit-cache-${Date.now()}`, password: 'local-audit-only-9182', role: 'student', status: 'active' });
  const cardId = fixtures.insertFlashcardForUser(user.id, seed);
  const context = await browser.newContext();
  const page = await context.newPage();
  let rpcCalls = 0;
  page.on('request', request => { if (request.url().includes('/rpc/submit_flashcard_review')) rpcCalls++; });
  await page.goto('http://127.0.0.1:4183');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await page.locator('#btn-user-profile-menu').waitFor();
  async function review() {
    await page.locator('#mobile-floating-dock').getByText('Cards', { exact: true }).click();
    await page.getByRole('button', { name: /Revisar .*Cards? Pendentes|Revisar Todos os Cards/ }).click();
    await page.getByRole('button', { name: 'Revelar Resposta' }).click();
    await page.getByRole('button', { name: /3\. Bom/ }).click();
    await page.getByText('Sessão de Revisão Concluída!', { exact: true }).waitFor();
  }
  const cacheKey = `synapse_${user.id}_flashcards_v1`;
  const cacheBefore = await page.evaluate(key => localStorage.getItem(key), cacheKey);
  assert.equal(cacheBefore, null, 'Contexto deve começar sem cache de cards');
  await review();
  await page.waitForTimeout(1500);
  const missingCache = { uiCompleted: true, rpcCalls, reviews: fixtures.countFlashcardReviews(cardId) };
  console.log(JSON.stringify({ missingCache }));
  assert.equal(missingCache.rpcCalls, 0);
  assert.equal(missingCache.reviews, 0);
  // Controle positivo: reproduz exatamente a preparação manual da suíte 13-B.
  await page.evaluate(({ cacheKey, cardId, seed }) => localStorage.setItem(cacheKey, JSON.stringify([{
    id: cardId, disciplineId: seed.disciplineId, themeId: seed.themeId,
    front: 'Frente demonstrativa 13-B', back: 'Verso demonstrativo 13-B',
    tags: [], difficulty: 'medio', isCustom: true,
    srs: { intervalDays: 0, repetitionCount: 0, easeFactor: 2.5, nextDueDate: new Date().toISOString(), state: 'new', reviewHistory: [] },
  }])), { cacheKey, cardId, seed });
  await page.reload();
  await page.locator('#btn-user-profile-menu').waitFor();
  await review();
  const withCache = { uiCompleted: true, rpcCalls, reviews: fixtures.countFlashcardReviews(cardId) };
  console.log(JSON.stringify({ withCache }));
  assert.equal(withCache.reviews, 1);
  assert.ok(withCache.rpcCalls >= 1);
  await context.close();
} finally {
  try {
    if (user) {
      await fixtures.deleteTestUser(user.id);
      const remaining = Number(fixtures.psqlLocal(`select count(*) from auth.users where id = '${user.id}'`));
      console.log(JSON.stringify({ auditUsersRemaining: remaining }));
      assert.equal(remaining, 0);
    }
  } finally { await browser.close(); }
}
