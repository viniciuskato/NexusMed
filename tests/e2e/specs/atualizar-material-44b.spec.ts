import { readFileSync } from 'node:fs';
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

// 44-B — exportar um material para o .md do padrão e atualizá-lo a partir de arquivo, pelo revisor de IA.
// Contra o app real (build de teste) e o Supabase local. O servidor do revisor roda de verdade (o ciclo, a
// ponte com o banco, a conferência do padrão e a aplicação da atualização); só a API paga é simulada.

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

test.describe('Exportar e atualizar material pelo revisor de IA (44-B)', () => {
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

  /** O autor envia o material pelo site; o servidor (API simulada "apto") o publica. Devolve o id do material. */
  async function publicarComoAutor(page: Page, autor: CreatedTestUser, titulo: string) {
    const { disciplina, tema } = catalogoDoSeed();
    // O material que o servidor criar é removido no fim (como postgres, o único papel que apaga material publicado).
    cleanup.push(() => {
      psqlLocal(`delete from public.materials where title = '${q(titulo)}';`);
    });
    await login(page, autor);
    await abrirEnvio(page);
    await page.locator('#envio-texto').fill(materialParaEnvio({ titulo, disciplina, tema }));
    await expect(page.locator('#envio-resultado')).toContainText('Arquivo aceito');
    await page.locator('#btn-enviar-material').click();
    await expect(page.locator('#envio-sucesso')).toContainText(titulo);
    const resumos = await rodarServidorDoRevisor({ veredito: 'apto', ciclos: 2 });
    expect(resumos.flatMap((r) => r.erros)).toEqual([]);
    expect(psqlLocal(`select status from public.materials where title = '${q(titulo)}';`)).toBe('published');
    return psqlLocal(`select id from public.materials where title = '${q(titulo)}';`);
  }

  /** O autor abre o material publicado pelo leitor, pela lista "Meus envios". */
  async function abrirMaterialComoAutor(page: Page, titulo: string) {
    await page.reload();
    await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
    if (!(await page.locator('#enviar-material-view').isVisible())) await abrirEnvio(page);
    const item = page.locator('#meus-envios-lista > li', { hasText: titulo }).first();
    await item.getByRole('button', { name: 'Abrir o material publicado' }).click();
    await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
  }

  test('exportar → editar → enviar atualização → revisão simulada apto → o estudante vê o conteúdo novo, com o progresso preservado', async ({
    page,
    browser,
  }) => {
    const titulo = `Atualizável ${Date.now()}`;
    const autor = await novoUsuario('b-autor', 'admin');
    const leitor = await novoUsuario('b-leitor');
    const outro = await novoUsuario('b-outro');
    const materialId = await publicarComoAutor(page, autor, titulo);

    // O estudante já leu a seção (progresso de leitura) — e a revisão de IA vale para o conteúdo que está no ar.
    const secaoId = psqlLocal(`select id from public.material_sections where material_id = '${materialId}' limit 1;`);
    psqlLocal(
      `insert into public.reading_progress (user_id, material_id, read_section_ids, percent, updated_at) ` +
        `values ('${leitor.id}', '${materialId}', array['${secaoId}']::uuid[], 100, now());`,
    );
    const hashAntes = psqlLocal(`select app.material_snapshot_hash('${materialId}'::uuid);`);
    expect(psqlLocal(`select app.material_tem_revisao_apto('${materialId}'::uuid)::text;`)).toBe('true');

    // 1. O autor abre o material: vê os dois botões e exporta o arquivo do padrão.
    await abrirMaterialComoAutor(page, titulo);
    await expect(page.getByRole('button', { name: /Exportar \.md/ })).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#btn-exportar-material').click(),
    ]);
    const exportado = readFileSync((await download.path()) as string, 'utf8');
    expect(download.suggestedFilename()).toMatch(/^atualizavel-\d+\.md$/);
    expect(exportado.startsWith(`# ${titulo}\n`)).toBe(true);
    expect(exportado).toContain('### Primeira seção');
    expect(exportado).toContain('Texto de exemplo com citação');
    expect(exportado).toContain('### Referências Bibliográficas');
    await expect(page.locator('#exportar-resultado')).toContainText('gerado');

    // 2. O arquivo exportado, sem mudança, não tem nada a atualizar (ida e volta).
    await page.locator('#btn-atualizar-material').click();
    const dialogo = page.getByRole('dialog', { name: 'Atualizar a partir de arquivo' });
    await expect(dialogo).toBeVisible();
    await dialogo.locator('#atualizar-arquivo').setInputFiles({
      name: 'igual.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(exportado, 'utf8'),
    });
    await expect(dialogo.locator('#atualizar-identico')).toBeVisible();
    await expect(dialogo.locator('#btn-enviar-atualizacao')).toBeDisabled();

    // 3. Editado, a prévia mostra o que muda e o envio vai para a revisão — sem tocar no que está no ar.
    const editado = exportado.replace('Texto de exemplo com citação', 'Texto ATUALIZADO pela revisão com citação');
    await dialogo.locator('#atualizar-arquivo').setInputFiles({
      name: 'editado.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(editado, 'utf8'),
    });
    await expect(dialogo.locator('#atualizar-previa')).toContainText('Seções alteradas');
    await expect(dialogo.locator('#atualizar-previa')).toContainText('Primeira seção');
    await dialogo.locator('#btn-enviar-atualizacao').click();
    await expect(dialogo.locator('#atualizar-sucesso')).toContainText('Atualização enviada para revisão');
    await dialogo.getByRole('button', { name: 'Fechar', exact: true }).last().click();

    const envio = psqlLocal(
      `select status || '|' || (target_material_id = '${materialId}')::text || '|' || (published_material_id is null)::text || '|' || (applied_at is null)::text ` +
        `from public.material_submissions where target_material_id = '${materialId}';`,
    );
    expect(envio).toBe('aguardando_revisao|true|true|true');
    // Nada mudou no ar enquanto a revisão não aprova.
    expect(psqlLocal(`select content from public.material_sections where id = '${secaoId}';`)).toContain('Texto de exemplo com citação');
    expect(psqlLocal(`select app.material_snapshot_hash('${materialId}'::uuid);`)).toBe(hashAntes);

    // 4. O servidor revisa (apto) e aplica, uma vez só.
    const resumos = await rodarServidorDoRevisor({ veredito: 'apto', ciclos: 2 });
    expect(resumos.flatMap((r) => r.erros)).toEqual([]);
    expect(resumos.reduce((n, r) => n + r.atualizados, 0)).toBe(1);
    await rodarServidorDoRevisor({ ciclos: 1 });
    expect(psqlLocal(`select count(*) from public.material_ai_provenance where material_id = '${materialId}';`)).toBe('1');

    expect(psqlLocal(`select status || '|' || (applied_at is not null)::text from public.material_submissions where target_material_id = '${materialId}';`)).toBe(
      'publicado|true',
    );
    // Mesmo id de seção, conteúdo novo, e o material no ar tem revisão válida do conteúdo novo.
    expect(psqlLocal(`select count(*) from public.material_sections where material_id = '${materialId}';`)).toBe('1');
    expect(psqlLocal(`select content from public.material_sections where id = '${secaoId}';`)).toContain('Texto ATUALIZADO pela revisão');
    expect(psqlLocal(`select app.material_snapshot_hash('${materialId}'::uuid);`)).not.toBe(hashAntes);
    expect(psqlLocal(`select app.material_tem_revisao_apto('${materialId}'::uuid)::text;`)).toBe('true');
    expect(
      psqlLocal(
        `select (p.snapshot_hash = app.material_snapshot_hash(p.material_id))::text || '|' || (p.submission_id = s.id)::text ` +
          `from public.material_ai_provenance p join public.material_submissions s on s.target_material_id = p.material_id where p.material_id = '${materialId}';`,
      ),
    ).toBe('true|true');
    // O progresso de leitura continua.
    expect(
      psqlLocal(
        `select percent || '|' || (read_section_ids @> array['${secaoId}']::uuid[])::text from public.reading_progress where user_id = '${leitor.id}' and material_id = '${materialId}';`,
      ),
    ).toBe('100|true');

    // 5. Outro estudante lê o conteúdo novo, com o selo; quem não pode atualizar não vê os botões.
    const contextoLeitor = await browser.newContext();
    cleanup.push(() => contextoLeitor.close());
    const paginaLeitor = await contextoLeitor.newPage();
    await login(paginaLeitor, leitor);
    await abrirArvoreDaBiblioteca(paginaLeitor);
    await paginaLeitor.getByRole('button', { name: titulo, exact: true }).click();
    await expect(paginaLeitor.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
    await expect(paginaLeitor.getByText('Texto ATUALIZADO pela revisão', { exact: false }).first()).toBeVisible();
    await expect(paginaLeitor.getByTestId('selo-de-revisao')).toHaveText('Revisado por IA — ainda não lido por uma pessoa');
    await expect(paginaLeitor.locator('#btn-reportar-erro-do-material')).toBeVisible();
    await expect(paginaLeitor.locator('#btn-exportar-material')).toHaveCount(0);
    await expect(paginaLeitor.locator('#btn-atualizar-material')).toHaveCount(0);

    const contextoOutro = await browser.newContext();
    cleanup.push(() => contextoOutro.close());
    const paginaOutro = await contextoOutro.newPage();
    await login(paginaOutro, outro);
    await abrirArvoreDaBiblioteca(paginaOutro);
    await paginaOutro.getByRole('button', { name: titulo, exact: true }).click();
    await expect(paginaOutro.locator('#btn-reportar-erro-do-material')).toBeVisible();
    await expect(paginaOutro.locator('#btn-atualizar-material')).toHaveCount(0);

    // 6. O envio aparece em "Meus envios" do autor como atualização publicada.
    await page.reload();
    await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
    if (!(await page.locator('#enviar-material-view').isVisible())) await abrirEnvio(page);
    const item = page.locator('#meus-envios-lista > li[data-status="publicado"]', { hasText: 'Atualização' });
    await expect(item.getByTestId('envio-de-atualizacao')).toContainText(titulo);
  });

  test('revisão "não apto": o material no ar não muda e o autor vê o motivo', async ({ page }) => {
    const titulo = `Atualização reprovada ${Date.now()}`;
    const autor = await novoUsuario('b-reprovado', 'admin');
    const materialId = await publicarComoAutor(page, autor, titulo);
    const hashAntes = psqlLocal(`select app.material_snapshot_hash('${materialId}'::uuid);`);

    // O envio de atualização entra pelo banco, como a tela o faria (a tela é provada no teste acima).
    await abrirMaterialComoAutor(page, titulo);
    await page.locator('#btn-atualizar-material').click();
    const dialogo = page.getByRole('dialog', { name: 'Atualizar a partir de arquivo' });
    const { disciplina, tema } = catalogoDoSeed();
    await dialogo.locator('#atualizar-arquivo').setInputFiles({
      name: 'novo.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(materialParaEnvio({ titulo, disciplina, tema, corpo: 'Texto que a revisão vai reprovar [1](#ref-1) e [2](#ref-2).' }), 'utf8'),
    });
    await dialogo.locator('#btn-enviar-atualizacao').click();
    await expect(dialogo.locator('#atualizar-sucesso')).toBeVisible();

    const resumos = await rodarServidorDoRevisor({ veredito: 'nao_apto', ciclos: 2 });
    expect(resumos.flatMap((r) => r.erros)).toEqual([]);
    expect(psqlLocal(`select status from public.material_submissions where target_material_id = '${materialId}';`)).toBe('nao_apto');
    expect(psqlLocal(`select app.material_snapshot_hash('${materialId}'::uuid);`)).toBe(hashAntes);
    expect(psqlLocal(`select content from public.material_sections where material_id = '${materialId}';`)).toContain('Texto de exemplo com citação');
    expect(psqlLocal(`select app.material_tem_revisao_apto('${materialId}'::uuid)::text;`)).toBe('true');
  });
});
