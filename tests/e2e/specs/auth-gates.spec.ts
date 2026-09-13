import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  forceInvalidProfileStatus,
  restoreProfileStatusConstraint,
  type CreatedTestUser,
} from '../fixtures/localSupabase';

// Regressão direta da armadilha #21 do AGENTS.md (Prompt 11-A): antes da
// correção, `status === 'blocked'` (e qualquer valor != 'pending'/'active')
// atravessava o gate e renderizava o app normalmente, inclusive a Área
// Editorial para um admin bloqueado. Estes testes provam o gate fail-closed
// em código real de navegador (App.tsx), não por leitura de código.

async function login(page: import('@playwright/test').Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
}

test.describe('Gates de acesso (profiles.status / role)', () => {
  let cleanup: (() => Promise<void>)[] = [];

  test.afterEach(async () => {
    // Ordem de INSERÇÃO, não LIFO: o teste de status inválido depende disso —
    // o usuário (com o status "estranho") precisa ser DELETADO antes de
    // `restoreProfileStatusConstraint()` recolocar o CHECK original, senão a
    // própria restauração falha (linha existente viola o constraint mais
    // restrito). Bug real encontrado ao rodar esta suíte pela primeira vez
    // (psql devolvia "check constraint ... is violated by some row").
    for (const fn of cleanup) {
      await fn().catch(() => undefined);
    }
    cleanup = [];
  });

  test('status active: acessa a aplicação normal', async ({ page }) => {
    const user = await createTestUser({ emailLocalPart: `gate-active-${Date.now()}`, password: 'senha-teste-123', role: 'student', status: 'active' });
    cleanup.push(() => deleteTestUser(user.id));

    await login(page, user);
    await expect(page.locator('#tab-login-mode, #btn-auth-submit')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText('Acesso bloqueado')).toHaveCount(0);
    await expect(page.getByText('Aguardando Aprovação')).toHaveCount(0);
  });

  test('status pending: mostra tela de aguardando aprovação, nunca o app', async ({ page }) => {
    const user = await createTestUser({ emailLocalPart: `gate-pending-${Date.now()}`, password: 'senha-teste-123', role: 'student', status: 'pending' });
    cleanup.push(() => deleteTestUser(user.id));

    await login(page, user);
    await expect(page.getByText('Aguardando Aprovação')).toBeVisible({ timeout: 15_000 });
  });

  test('status blocked: mostra tela de acesso bloqueado, nunca o app', async ({ page }) => {
    const user = await createTestUser({ emailLocalPart: `gate-blocked-${Date.now()}`, password: 'senha-teste-123', role: 'student', status: 'blocked' });
    cleanup.push(() => deleteTestUser(user.id));

    await login(page, user);
    await expect(page.getByText('Acesso bloqueado')).toBeVisible({ timeout: 15_000 });
  });

  test('status admin bloqueado: também cai em acesso bloqueado, nunca vê a Área Editorial', async ({ page }) => {
    const user = await createTestUser({ emailLocalPart: `gate-admin-blocked-${Date.now()}`, password: 'senha-teste-123', role: 'admin', status: 'blocked' });
    cleanup.push(() => deleteTestUser(user.id));

    await login(page, user);
    await expect(page.getByText('Acesso bloqueado')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Área Editorial')).toHaveCount(0);
  });

  test('status com valor inesperado (fora de pending/active/blocked): nunca renderiza o app completo (fail-closed)', async ({ page }) => {
    // ACHADO REAL desta suíte (não estava documentado): o comentário em
    // App.tsx (linhas ~285-291) afirma que "qualquer outro valor... cai em
    // <BlockedAccountView>". Isso é IMPRECISO na prática: `fetchProfile`
    // (src/contexts/AuthContext.tsx, linha ~69) já normaliza QUALQUER status
    // que não seja 'active'/'blocked' para 'pending' ANTES de App.tsx ver o
    // valor — então um status inesperado ('quarantined' aqui) cai na tela de
    // "Aguardando Aprovação", não na de "Acesso bloqueado". A invariante de
    // SEGURANÇA continua valendo (nenhuma tela mostra o app completo), mas a
    // tela específica não é a que o comentário do código promete. Reportado
    // à diretoria como achado, sem alterar lógica de produto para "consertar"
    // o teste (fora do escopo autorizado desta sessão).
    const user = await createTestUser({ emailLocalPart: `gate-weird-${Date.now()}`, password: 'senha-teste-123', role: 'student', status: 'active' });
    cleanup.push(() => deleteTestUser(user.id));
    forceInvalidProfileStatus(user.id, 'quarantined');
    cleanup.push(async () => restoreProfileStatusConstraint());

    await login(page, user);
    // Nunca o app completo: nem o dock de navegação, nem o menu de perfil.
    await expect(page.locator('#system-floating-dock')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator('#btn-user-profile-menu')).toHaveCount(0);
    // Cai em uma das duas telas de gate — 'pending' por normalização do
    // cliente (comportamento real e seguro, embora não documentado assim).
    const gated = page.getByText('Acesso bloqueado').or(page.getByText('Aguardando Aprovação'));
    await expect(gated.first()).toBeVisible();
  });
});
