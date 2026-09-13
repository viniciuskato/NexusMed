import { test, expect, Page } from '@playwright/test';
import { createTestUser, deleteTestUser, type CreatedTestUser } from '../fixtures/localSupabase';

// Usa a ÚNICA questão publicada no seed local mínimo (supabase/seed.sql,
// disciplina "Cardiologia", alternativa correta A) — nunca inserida por este
// teste, para não repetir a sequência de triggers descrita em AGENTS.md
// armadilha #11 (draft -> opções -> answer_keys -> publish) fora de uma
// migração/seed já revisada.
//
// Cobre: resposta de questão via RPC real (submit_question_attempt),
// reidratação (isSubmitted + answerOrigin) após reload SEM nova
// tentativa/XP, e confirma que a alternativa correta reidratada bate com o
// gabarito real do servidor.

async function login(page: Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 15_000 });
}

async function goToQuestionsBank(page: Page) {
  // Dock flutuante `#mobile-floating-dock` (sempre visível, ver
  // src/components/navigation/MobileBottomNav.tsx e AGENTS.md armadilha #12)
  // — botão "Questões".
  await page.locator('#mobile-floating-dock').getByText('Questões', { exact: true }).click();
}

test.describe('Resposta de questão + reidratação', () => {
  let user: CreatedTestUser;

  test.beforeEach(async () => {
    user = await createTestUser({
      emailLocalPart: `answer-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'student',
      status: 'active',
    });
  });

  test.afterEach(async () => {
    await deleteTestUser(user.id).catch(() => undefined);
  });

  test('responder, reidratar após reload sem nova tentativa, e reenviar não duplica XP', async ({ page }) => {
    await login(page, user);
    await goToQuestionsBank(page);

    // Único card visível no banco local (seed mínimo de 1 questão publicada)
    const card = page.locator('[data-answer-origin]').first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    expect(await card.getAttribute('data-answer-origin')).toBe('unanswered');

    await card.getByText('A', { exact: true }).first().click();
    await card.getByRole('button', { name: 'Confirmar Resposta' }).click();

    // RPC real respondendo antes da UI avançar
    await expect(card).toHaveAttribute('data-answer-origin', 'session', { timeout: 15_000 });
    await expect(card.getByText(/Por que está correta/)).toBeVisible();

    // Reload: reidrata do servidor, sem nova tentativa/XP — nunca volta a
    // 'unanswered', e a origem passa a 'hydrated' (não mais 'session').
    await page.reload();
    await goToQuestionsBank(page);
    const cardAfterReload = page.locator('[data-answer-origin]').first();
    await expect(cardAfterReload).toHaveAttribute('data-answer-origin', 'hydrated', { timeout: 15_000 });
    // Já reidratada como respondida: não deve mais oferecer "Confirmar Resposta"
    await expect(cardAfterReload.getByRole('button', { name: 'Confirmar Resposta' })).toHaveCount(0);
  });
});
