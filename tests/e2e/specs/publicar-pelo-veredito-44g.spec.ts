import { test, expect, type Page } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  getSeedIds,
  psqlLocal,
  runCleanup,
  type CreatedTestUser,
} from '../fixtures/localSupabase';
import { materialParaEnvio } from '../fixtures/materialParaEnvio';
import { rodarServidorDoRevisor } from '../fixtures/servidorDoRevisor';

// 44-G — publicar pelo veredito do revisor de IA. Contra o app real (build de
// teste) e o Supabase local. O servidor do revisor roda de verdade (o ciclo, a
// ponte com o banco, a conferência do padrão e a criação do material); só a API
// paga é simulada: nenhuma chamada à Anthropic.

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

async function abrirArvoreDaBiblioteca(page: Page) {
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

function catalogoDoSeed(): { disciplina: string; tema: string } {
  const seed = getSeedIds();
  return {
    disciplina: psqlLocal(`select name from public.disciplines where id = '${seed.disciplineId}';`),
    tema: psqlLocal(`select name from public.themes where id = '${seed.themeId}';`),
  };
}

const q = (s: string) => s.replace(/'/g, "''");

test.describe('Publicar pelo veredito do revisor de IA (44-G)', () => {
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

  test('envio → revisão apto (simulada) → o servidor publica → o estudante lê com o selo, reporta um erro e o admin resolve', async ({
    page,
    browser,
  }) => {
    const { disciplina, tema } = catalogoDoSeed();
    const titulo = `Publicado pela IA ${Date.now()}`;
    const autor = await novoUsuario('g-autor', 'admin');
    const leitor = await novoUsuario('g-leitor');
    const admin = await novoUsuario('g-admin', 'admin');
    // O material que o servidor criar é removido no fim (como postgres, o único papel que apaga material publicado).
    cleanup.push(() => {
      psqlLocal(`delete from public.materials where title = '${q(titulo)}';`);
    });

    // 1. O autor envia o texto pelo site.
    await login(page, autor);
    await abrirEnvio(page);
    await page.locator('#envio-texto').fill(materialParaEnvio({ titulo, disciplina, tema }));
    await expect(page.locator('#envio-resultado')).toContainText('Arquivo aceito');
    await page.locator('#btn-enviar-material').click();
    await expect(page.locator('#envio-sucesso')).toContainText(titulo);
    await expect(page.locator('#meus-envios-lista')).toContainText('Aguardando revisão');
    expect(psqlLocal(`select count(*) from public.materials where title = '${q(titulo)}';`)).toBe('0');

    // 2. O servidor revisa (API simulada: "apto") e publica.
    const resumos = await rodarServidorDoRevisor({ veredito: 'apto', ciclos: 2 });
    expect(resumos.flatMap((r) => r.erros)).toEqual([]);
    expect(resumos[1].publicados).toBeGreaterThanOrEqual(1);

    const envio = psqlLocal(
      `select s.status || '|' || (s.published_material_id = m.id)::text || '|' || m.status ` +
        `from public.material_submissions s join public.materials m on m.title = s.title where s.title = '${q(titulo)}';`,
    );
    expect(envio).toBe('publicado|true|published');
    expect(
      psqlLocal(
        `select p.review_verdict || '|' || (p.submission_id = s.id)::text ` +
          `from public.material_ai_provenance p join public.material_submissions s on s.title = '${q(titulo)}' ` +
          `join public.materials m on m.id = p.material_id where m.title = '${q(titulo)}';`,
      ),
    ).toBe('apto|true');
    // Uma segunda passada do servidor não cria segundo material.
    await rodarServidorDoRevisor({ ciclos: 1 });
    expect(psqlLocal(`select count(*) from public.materials where title = '${q(titulo)}';`)).toBe('1');

    // 3. "Meus envios" mostra "Publicado", com o link que abre o material e o selo.
    await page.reload();
    await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
    if (!(await page.locator('#enviar-material-view').isVisible())) await abrirEnvio(page);
    const item = page.locator('#meus-envios-lista > li', { hasText: titulo });
    await expect(item).toContainText('Publicado');
    await item.getByRole('button', { name: 'Abrir o material publicado' }).click();
    await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
    await expect(page.getByTestId('selo-de-revisao')).toHaveText('Revisado por IA — ainda não lido por uma pessoa');

    // 4. Outro estudante encontra o material na biblioteca, vê o selo e reporta um erro.
    const contextoLeitor = await browser.newContext();
    cleanup.push(() => contextoLeitor.close());
    const paginaLeitor = await contextoLeitor.newPage();
    await login(paginaLeitor, leitor);
    await abrirArvoreDaBiblioteca(paginaLeitor);
    await paginaLeitor.getByRole('button', { name: titulo, exact: true }).click();
    await expect(paginaLeitor.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
    await expect(paginaLeitor.getByTestId('selo-de-revisao')).toHaveText('Revisado por IA — ainda não lido por uma pessoa');

    await paginaLeitor.locator('#btn-reportar-erro-do-material').click();
    const dialogo = paginaLeitor.getByRole('dialog', { name: 'Reportar erro neste material' });
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByRole('button', { name: 'Enviar reporte' })).toBeDisabled();
    await dialogo.getByLabel(/O que está errado/).fill('A dose citada na primeira seção está errada.');
    await dialogo.getByLabel(/Trecho do material/).fill('Texto de exemplo com citação');
    await dialogo.getByRole('button', { name: 'Enviar reporte' }).click();
    await expect(dialogo.getByTestId('reporte-enviado')).toContainText('Obrigado! Recebemos o seu reporte.');

    const reporte = psqlLocal(
      `select r.reporter_id || '|' || r.status || '|' || coalesce(r.excerpt, '') from public.material_error_reports r ` +
        `join public.materials m on m.id = r.material_id where m.title = '${q(titulo)}';`,
    );
    expect(reporte).toBe(`${leitor.id}|aberto|Texto de exemplo com citação`);

    // 5. O admin vê o erro na Área Editorial e o marca como resolvido.
    const contextoAdmin = await browser.newContext();
    cleanup.push(() => contextoAdmin.close());
    const paginaAdmin = await contextoAdmin.newPage();
    await login(paginaAdmin, admin, '/#/admin');
    await paginaAdmin.locator('#admin-tab-erros').click();
    const lista = paginaAdmin.locator('#admin-erros-lista');
    const linha = lista.locator('li', { hasText: titulo });
    await expect(linha).toContainText('A dose citada na primeira seção está errada.');
    await expect(linha).toContainText('Texto de exemplo com citação');
    await expect(linha).toContainText('Aberto');
    await expect(linha).toContainText('por g-leitor');
    await linha.getByRole('button', { name: 'Marcar como resolvido' }).click();
    await expect(linha).toContainText('Resolvido');
    await expect(linha.getByRole('button', { name: 'Marcar como resolvido' })).toHaveCount(0);
    expect(
      psqlLocal(
        `select r.status || '|' || (r.resolved_by = '${admin.id}')::text from public.material_error_reports r ` +
          `join public.materials m on m.id = r.material_id where m.title = '${q(titulo)}';`,
      ),
    ).toBe('resolvido|true');
  });

  test('revisão "não apto": nada é publicado e o autor vê o motivo', async ({ page }) => {
    const { disciplina, tema } = catalogoDoSeed();
    const titulo = `Reprovado pela IA ${Date.now()}`;
    const autor = await novoUsuario('g-reprovado', 'admin');
    await login(page, autor);
    await abrirEnvio(page);
    await page.locator('#envio-texto').fill(materialParaEnvio({ titulo, disciplina, tema }));
    await expect(page.locator('#envio-resultado')).toContainText('Arquivo aceito');
    await page.locator('#btn-enviar-material').click();
    await expect(page.locator('#envio-sucesso')).toContainText(titulo);

    const resumos = await rodarServidorDoRevisor({ veredito: 'nao_apto', ciclos: 2 });
    expect(resumos.flatMap((r) => r.erros)).toEqual([]);
    expect(psqlLocal(`select status from public.material_submissions where title = '${q(titulo)}';`)).toBe('nao_apto');
    expect(psqlLocal(`select count(*) from public.materials where title = '${q(titulo)}';`)).toBe('0');

    await page.reload();
    await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
    if (!(await page.locator('#enviar-material-view').isVisible())) await abrirEnvio(page);
    const item = page.locator('#meus-envios-lista > li', { hasText: titulo });
    await expect(item).toContainText('Precisa de correção');
    await expect(item.getByRole('button', { name: 'Abrir o material publicado' })).toHaveCount(0);
  });

  test('título que já existe: o servidor não publica e o autor recebe o motivo, em palavras leigas', async ({ page }) => {
    const { disciplina, tema } = catalogoDoSeed();
    const titulo = `Título repetido ${Date.now()}`;
    const autor = await novoUsuario('g-repetido', 'admin');
    const seed = getSeedIds();
    // Já existe um material com o mesmo título.
    psqlLocal(
      `insert into public.materials (discipline_id, theme_id, title) values ('${seed.disciplineId}', '${seed.themeId}', '${q(titulo)}');`,
    );
    cleanup.push(() => {
      psqlLocal(`delete from public.materials where title = '${q(titulo)}';`);
    });

    await login(page, autor);
    await abrirEnvio(page);
    await page.locator('#envio-texto').fill(materialParaEnvio({ titulo, disciplina, tema }));
    await expect(page.locator('#envio-resultado')).toContainText('Arquivo aceito');
    await page.locator('#btn-enviar-material').click();
    await expect(page.locator('#envio-sucesso')).toContainText(titulo);

    await rodarServidorDoRevisor({ veredito: 'apto', ciclos: 2 });
    expect(psqlLocal(`select status from public.material_submissions where title = '${q(titulo)}';`)).toBe('nao_apto');
    expect(psqlLocal(`select count(*) from public.materials where title = '${q(titulo)}';`)).toBe('1');

    await page.reload();
    await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
    if (!(await page.locator('#enviar-material-view').isVisible())) await abrirEnvio(page);
    const item = page.locator('#meus-envios-lista > li', { hasText: titulo });
    await expect(item.getByTestId('recado-do-servidor')).toContainText('Já existe um material com o título');
  });
});
