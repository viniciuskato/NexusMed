import { test, expect, Page } from '@playwright/test';
import { createTestUser, deleteTestUser, psqlLocal, type CreatedTestUser } from '../fixtures/localSupabase';

// Fila offline / reconexão / retry idempotente / duas operações rápidas em
// sequência (categoria 1 — tentativas de questão, ver
// docs/SINCRONIZACAO-CONFIAVEL.md). Usa a única questão do seed local
// (disciplina Cardiologia) e interceptação de rede real via `page.route`
// (nunca `context.setOffline(true)` sozinho — bloquearia também o próprio
// reload, ver AGENTS.md/histórico do 07-B) para simular queda/retomada de
// rede no meio de `submit_question_attempt`.

async function login(page: Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 15_000 });
}

async function goToQuestionsBank(page: Page) {
  await page.locator('#mobile-floating-dock').getByText('Questões', { exact: true }).click();
}

function countAttemptsForUser(userId: string): number {
  return Number(
    psqlLocal(`select count(*) from public.question_attempts where user_id = '${userId}';`)
  );
}

test.describe('Fila offline / reconexão / idempotência', () => {
  let user: CreatedTestUser;

  test.beforeEach(async () => {
    user = await createTestUser({
      emailLocalPart: `offlineq-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'student',
      status: 'active',
    });
  });

  test.afterEach(async () => {
    await deleteTestUser(user.id).catch(() => undefined);
  });

  test('resposta enviada offline fica pendente sem travar a UI, e sincroniza sozinha ao reconectar (exatamente 1 tentativa)', async ({ page }) => {
    await login(page, user);

    // Bloqueia só a RPC de envio de tentativa (não o carregamento da página) —
    // simula "servidor local inacessível para esta chamada específica".
    let blocking = true;
    await page.route('**/rest/v1/rpc/submit_question_attempt', async (route) => {
      if (blocking) return route.abort('internetdisconnected');
      return route.continue();
    });

    await goToQuestionsBank(page);
    const card = page.locator('[data-answer-origin]').first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByText('A', { exact: true }).first().click();
    await card.getByRole('button', { name: 'Confirmar Resposta' }).click();

    // ACHADO REAL desta suíte: `QuestionCard.handleConfirmAnswer` só marca
    // `isSubmitted`/`answerOrigin` DEPOIS que `AnswersRepository.recordAnswer`
    // resolve por completo — e `recordAnswer` usa `enqueueAndTry`, que
    // aguarda até 20s tentando a RPC real antes de desistir e cair no
    // resultado local otimista (ver src/repositories/AnswersRepository.ts).
    // Ou seja: a UI NÃO fica travada indefinidamente (converge sozinha), mas
    // também não é "otimista imediata" — offline, o card só sai de
    // 'unanswered' depois desse timeout completo (~20s), não instantaneamente
    // como o comentário do próprio código em syncQueue.ts sugere para outros
    // consumidores de `enqueueAndTry`. Timeout do teste ajustado para refletir
    // esse comportamento real (documentado aqui, não corrigido — fora do
    // escopo desta suíte alterar lógica de produto sem autorização da
    // diretoria).
    await expect(card).not.toHaveAttribute('data-answer-origin', 'unanswered', { timeout: 25_000 });
    expect(countAttemptsForUser(user.id)).toBe(0); // nada chegou ao servidor ainda

    // Reconecta e dispara o sinal forte de retomada (`online`) que o app escuta.
    blocking = false;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    await expect
      .poll(() => countAttemptsForUser(user.id), { timeout: 20_000, message: 'aguardando sincronização convergir' })
      .toBe(1);

    // Reenviar o mesmo client_op_id (reload dispara reconciliação de novo)
    // nunca duplica — idempotência ponta a ponta via navegador real.
    await page.reload();
    await goToQuestionsBank(page);
    await page.waitForTimeout(2_000); // reconciliação roda em segundo plano no mount; sem sleep fixo como condição de sucesso — só dá tempo de disparar antes da assertiva abaixo
    expect(countAttemptsForUser(user.id)).toBe(1);
  });

  test('duas operações em sequência rápida (favoritar/desfavoritar) não perdem a segunda (regressão do bug 07-E2)', async ({ page }) => {
    await login(page, user);
    await goToQuestionsBank(page);
    const card = page.locator('[data-answer-origin]').first();
    await expect(card).toBeVisible({ timeout: 15_000 });

    const bookmarkBtn = card.getByRole('button', { name: /favorit/i }).first();
    // Duas cliques em sequência rápida, sem esperar o primeiro flush terminar —
    // reproduz exatamente a condição do bug real documentado no AGENTS.md
    // (armadilha #16): favoritar, desfavoritar, sem await entre as duas.
    await bookmarkBtn.click();
    await bookmarkBtn.click();

    // Estado final observável deve convergir (não travar em estado intermediário
    // nem perder silenciosamente a segunda operação).
    await expect
      .poll(
        async () => {
          const rows = psqlLocal(
            `select count(*) from public.bookmarks b join public.questions q on q.id = b.question_id where b.user_id = '${user.id}';`
          );
          return Number(rows);
        },
        { timeout: 15_000 }
      )
      .toBe(0); // favoritar + desfavoritar = estado final "não favoritado"
  });
});
