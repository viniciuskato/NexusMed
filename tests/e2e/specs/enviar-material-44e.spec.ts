import { test, expect, type Page } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  getSeedIds,
  psqlLocal,
  runCleanup,
  type CreatedTestUser,
} from '../fixtures/localSupabase';
import { materialComPendencia, materialParaEnvio } from '../fixtures/materialParaEnvio';

// 44-E — enviar material pelo site. Contra o app real (build de teste) e o
// Supabase local: o envio é guardado com o autor certo, nasce "aguardando
// revisão", só o autor (e admin) o vê, e nada é publicado nem entra em
// `materials`.

async function login(page: Page, user: CreatedTestUser, path = '/') {
  await page.goto(path);
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

async function abrirEnvio(page: Page) {
  await page.locator('#btn-user-profile-menu').click();
  await page.locator('#nav-enviar-material').click();
  await expect(page.locator('#enviar-material-view')).toBeVisible();
}

function catalogoDoSeed(): { disciplina: string; tema: string } {
  const seed = getSeedIds();
  return {
    disciplina: psqlLocal(`select name from public.disciplines where id = '${seed.disciplineId}';`),
    tema: psqlLocal(`select name from public.themes where id = '${seed.themeId}';`),
  };
}

test.describe('Enviar material (44-E)', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
  });

  async function novoUsuario(prefixo: string, role: 'student' | 'admin' = 'student') {
    const user = await createTestUser({
      emailLocalPart: `${prefixo}-${Date.now()}`,
      password: 'senha-teste-123',
      role,
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(user.id));
    return user;
  }

  test('estudante ativo envia um material aceito; ele fica guardado como "aguardando revisão", sem publicar nada', async ({
    page,
  }) => {
    const { disciplina, tema } = catalogoDoSeed();
    const titulo = `Envio E2E ${Date.now()}`;
    const student = await novoUsuario('envio-feliz');
    await login(page, student);
    await abrirEnvio(page);
    await expect(page).toHaveURL(/#\/enviar-material$/);

    await page.locator('#envio-texto').fill(materialParaEnvio({ titulo, disciplina, tema }));
    await expect(page.locator('#envio-resultado')).toContainText('Arquivo aceito');
    await expect(page.locator('#btn-enviar-material')).toBeEnabled();
    await page.locator('#btn-enviar-material').click();

    await expect(page.locator('#envio-sucesso')).toContainText(titulo);
    const lista = page.locator('#meus-envios-lista');
    await expect(lista).toContainText(titulo);
    await expect(lista).toContainText('Aguardando revisão');

    // No banco: autor certo (o do JWT, não escolhido pelo cliente), estado inicial, e nada em `materials`.
    const linha = psqlLocal(
      `select author_id || '|' || status from public.material_submissions where title = '${titulo}';`,
    );
    expect(linha).toBe(`${student.id}|aguardando_revisao`);
    expect(psqlLocal(`select count(*) from public.materials where title = '${titulo}';`)).toBe('0');
  });

  test('arquivo com pendência do padrão: mostra a pendência e não deixa enviar', async ({ page }) => {
    const { disciplina, tema } = catalogoDoSeed();
    const titulo = `Pendencia E2E ${Date.now()}`;
    const student = await novoUsuario('envio-pendencia');
    await login(page, student);
    await abrirEnvio(page);

    await page.locator('#envio-texto').fill(materialComPendencia({ titulo, disciplina, tema }));
    await expect(page.locator('#envio-pendencias')).toContainText('≤');
    await expect(page.locator('#btn-enviar-material')).toBeDisabled();
    expect(psqlLocal(`select count(*) from public.material_submissions where title = '${titulo}';`)).toBe('0');
  });

  test('estudante A não vê o envio do estudante B, e admin vê os dois na Área Editorial', async ({ page, browser }) => {
    const tituloA = `Envio do A ${Date.now()}`;
    const tituloB = `Envio do B ${Date.now()}`;
    const a = await novoUsuario('envio-a');
    const b = await novoUsuario('envio-b');
    const admin = await novoUsuario('envio-admin', 'admin');
    const seed = getSeedIds();
    for (const [autor, titulo] of [
      [a, tituloA],
      [b, tituloB],
    ] as const) {
      psqlLocal(
        `insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md) ` +
          `values ('${autor.id}', '${titulo}', '${seed.disciplineId}', '${seed.themeId}', '# ${titulo}');`,
      );
    }

    await login(page, a);
    await abrirEnvio(page);
    await expect(page.locator('#meus-envios-lista')).toContainText(tituloA);
    await expect(page.locator('#meus-envios-lista')).not.toContainText(tituloB);

    const contextoB = await browser.newContext();
    cleanup.push(() => contextoB.close());
    const paginaB = await contextoB.newPage();
    await login(paginaB, b);
    await abrirEnvio(paginaB);
    await expect(paginaB.locator('#meus-envios-lista')).toContainText(tituloB);
    await expect(paginaB.locator('#meus-envios-lista')).not.toContainText(tituloA);

    const contextoAdmin = await browser.newContext();
    cleanup.push(() => contextoAdmin.close());
    const paginaAdmin = await contextoAdmin.newPage();
    await login(paginaAdmin, admin, '/#/admin');
    await paginaAdmin.locator('#admin-tab-envios').click();
    const listaAdmin = paginaAdmin.locator('#admin-envios-lista');
    await expect(listaAdmin).toContainText(tituloA);
    await expect(listaAdmin).toContainText(tituloB);
    // Só leitura: nenhum botão dentro da lista.
    await expect(listaAdmin.locator('button')).toHaveCount(0);
  });

  test('com 3 envios esperando revisão, a tela avisa e não deixa enviar outro', async ({ page }) => {
    const { disciplina, tema } = catalogoDoSeed();
    const seed = getSeedIds();
    const student = await novoUsuario('envio-fila');
    for (let i = 1; i <= 3; i += 1) {
      psqlLocal(
        `insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md, status) ` +
          `values ('${student.id}', 'Na fila ${i}', '${seed.disciplineId}', '${seed.themeId}', '# fila', 'aguardando_revisao');`,
      );
    }
    await login(page, student);
    await abrirEnvio(page);
    await page.locator('#envio-texto').fill(materialParaEnvio({ titulo: `Quarto ${Date.now()}`, disciplina, tema }));

    await expect(page.locator('#envio-fila-cheia')).toContainText('Você já tem 3 envios esperando revisão');
    await expect(page.locator('#btn-enviar-material')).toBeDisabled();
  });

  test('a tela de envio e a página de instruções levam uma à outra', async ({ page }) => {
    const student = await novoUsuario('envio-links');
    await login(page, student);
    await abrirEnvio(page);
    await page.locator('#enviar-material-como-escrever').click();
    await expect(page.locator('#como-escrever-material-view')).toBeVisible();
    await page.locator('#como-escrever-enviar').click();
    await expect(page.locator('#enviar-material-view')).toBeVisible();
  });

  test('usuário pendente não abre a tela de envio, nem pelo endereço direto', async ({ page }) => {
    const pending = await createTestUser({
      emailLocalPart: `envio-pend-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'student',
      status: 'pending',
    });
    cleanup.push(() => deleteTestUser(pending.id));
    await page.goto('/#/enviar-material');
    await page.locator('#auth-email-input').fill(pending.email);
    await page.locator('#auth-password-input').fill(pending.password);
    await page.locator('#btn-auth-submit').click();
    await expect(page.getByText('Aguardando Aprovação')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#enviar-material-view')).toHaveCount(0);
  });
});
