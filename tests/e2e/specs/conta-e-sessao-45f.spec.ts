import { test, expect, type Page } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  getAdminClient,
  runCleanup,
  type CreatedTestUser,
} from '../fixtures/localSupabase';

// 45-F (AUD-01, AUD-26, AUD-27), em navegador real contra o Supabase local.
//
// O Supabase local deste repositório não tem servidor de e-mail ligado
// (`[local_smtp] enabled = false`, sem contêiner Inbucket/Mailpit): o envio do
// e-mail de recuperação não sai daqui. Então o pedido da tela é interceptado
// (para conferir o `redirect_to` que ela manda) e o link que o e-mail traria é
// gerado pela API de administração (`generateLink`), que devolve o mesmo link,
// sem enviar. O GoTrue local só libera `localhost:3000` como retorno, então o
// redirecionamento do link é refeito para a origem do teste — o fragmento com o
// token, que é o que o app lê, vem do GoTrue de verdade.

const ORIGEM = 'http://127.0.0.1:4183';

async function login(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(email);
  await page.locator('#auth-password-input').fill(password);
  await page.locator('#btn-auth-submit').click();
}

async function sair(page: Page) {
  await page.locator('#btn-user-profile-menu').click();
  await page.locator('#btn-logout').click();
}

/** Segue o link de recuperação (sem seguir o redirecionamento) e devolve o fragmento que o app receberia. */
async function fragmentoDoLinkDeRecuperacao(email: string): Promise<string> {
  const { data, error } = await getAdminClient().auth.admin.generateLink({ type: 'recovery', email });
  if (error || !data.properties?.action_link) throw new Error(`generateLink falhou: ${error?.message}`);
  const resposta = await fetch(data.properties.action_link, { redirect: 'manual' });
  const destino = resposta.headers.get('location');
  if (!destino || !destino.includes('#')) throw new Error(`o link de recuperação não redirecionou com token (HTTP ${resposta.status})`);
  return destino.slice(destino.indexOf('#'));
}

test.describe('Conta e sessão (45-F)', () => {
  let cleanup: (() => Promise<void>)[] = [];

  test.afterEach(async () => {
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
  });

  async function usuarioAtivo(prefixo: string, password = 'senha-antiga-123'): Promise<CreatedTestUser> {
    const user = await createTestUser({ emailLocalPart: `${prefixo}-${Date.now()}`, password, role: 'student', status: 'active' });
    cleanup.push(() => deleteTestUser(user.id));
    return user;
  }

  test('"Esqueci a senha": o link abre "Definir senha nova" e a senha nova vale no login seguinte', async ({ page }) => {
    const user = await usuarioAtivo('conta-senha');

    // 1) A tela pede o e-mail com retorno para a origem do site.
    let redirectTo: string | null = null;
    await page.route('**/auth/v1/recover**', async (route) => {
      redirectTo = new URL(route.request().url()).searchParams.get('redirect_to');
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Esqueci minha senha' }).click();
    await page.locator('#reset-email-input').fill(user.email);
    await page.getByRole('button', { name: 'Enviar Link' }).click();
    await expect(page.getByText('E-mail de Recuperação Enviado!')).toBeVisible();
    expect(redirectTo).toBe(ORIGEM);
    await page.unroute('**/auth/v1/recover**');

    // 2) O link do e-mail abre a tela de senha nova (nunca o app).
    const fragmento = await fragmentoDoLinkDeRecuperacao(user.email);
    // Como o e-mail faz: abre o link numa página nova (navegar só o fragmento não recarregaria o app).
    await page.goto('about:blank');
    await page.goto(`/${fragmento}`);
    await expect(page.getByRole('heading', { name: 'Definir senha nova' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#system-floating-dock')).toHaveCount(0);

    // 3) Grava a senha nova.
    const senhaNova = 'senha-nova-456';
    await page.locator('#new-password-input').fill(senhaNova);
    await page.locator('#confirm-password-input').fill(senhaNova);
    await page.locator('#btn-set-password').click();
    await expect(page.getByText('Senha atualizada')).toBeVisible();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });

    // 4) No login seguinte, vale a senha nova — e a antiga não vale mais.
    await sair(page);
    await expect(page.locator('#btn-auth-submit')).toBeVisible({ timeout: 15_000 });
    await login(page, user.email, 'senha-antiga-123');
    await expect(page.getByText(/E-mail ou senha incorretos/)).toBeVisible({ timeout: 15_000 });
    await login(page, user.email, senhaNova);
    await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
  });

  test('falha momentânea ao ler o perfil não tira o estudante ativo do app; a leitura volta e o aviso some', async ({ page }) => {
    const user = await usuarioAtivo('conta-perfil');
    await login(page, user.email, user.password);
    await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });

    // Marca a página: se o app desmontar (ir para "aguardando aprovação"), a marca some.
    await page.evaluate(() => {
      const marca = document.createElement('div');
      marca.id = 'marca-45f';
      document.body.appendChild(marca);
    });

    // A leitura do perfil passa a falhar (servidor fora do ar) e a sessão "renova".
    await page.route('**/rest/v1/profiles**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange', { bubbles: true })));

    await expect(page.getByText('Não deu para confirmar sua conta agora.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Aguardando Aprovação')).toHaveCount(0);
    await expect(page.locator('#btn-user-profile-menu')).toBeVisible();
    await expect(page.locator('#marca-45f')).toHaveCount(1);

    // O servidor volta: "Tentar agora" lê o perfil de novo e tira o aviso.
    await page.unroute('**/rest/v1/profiles**');
    await page.getByRole('button', { name: 'Tentar agora' }).first().click();
    await expect(page.getByText('Não deu para confirmar sua conta agora.')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator('#btn-user-profile-menu')).toBeVisible();
    await expect(page.locator('#marca-45f')).toHaveCount(1);
  });

  test('quem está "pending" de verdade continua em "aguardando aprovação", e uma falha de leitura nunca libera o app', async ({ page }) => {
    const user = await createTestUser({ emailLocalPart: `conta-pending-${Date.now()}`, password: 'senha-teste-123', role: 'student', status: 'pending' });
    cleanup.push(() => deleteTestUser(user.id));

    await page.route('**/rest/v1/profiles**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await login(page, user.email, user.password);

    await expect(page.getByText('Aguardando Aprovação')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#system-floating-dock')).toHaveCount(0);
    await expect(page.locator('#btn-user-profile-menu')).toHaveCount(0);
  });

  test('sair apaga do aparelho os dados locais da conta (e só dela)', async ({ page }) => {
    const user = await usuarioAtivo('conta-sair');
    await login(page, user.email, user.password);
    await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });

    await page.evaluate((uid) => {
      localStorage.setItem(`synapse_${uid}_answers_v1`, '[{"questionId":"q"}]');
      localStorage.setItem(`synapse_${uid}_notes_v1`, '{"m":{"text":"anotação"}}');
      localStorage.setItem(`synapse_${uid}_simulados_v1`, '[{"id":"s"}]');
      localStorage.setItem(`synapse_${uid}_simulado_draft_s1`, '{"q1":"a"}');
      localStorage.setItem('synapse_outra-conta_answers_v1', '[1]');
    }, user.id);

    await sair(page);
    await expect(page.locator('#btn-auth-submit')).toBeVisible({ timeout: 15_000 });

    const restante = await page.evaluate((uid) => {
      const chaves: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(`synapse_${uid}_`) && /answers|notes|simulados|simulado_draft|sync_queue/.test(k)) chaves.push(k);
      }
      return { dessaConta: chaves, deOutra: localStorage.getItem('synapse_outra-conta_answers_v1') };
    }, user.id);
    expect(restante.dessaConta).toEqual([]);
    expect(restante.deOutra).toBe('[1]');
  });
});
