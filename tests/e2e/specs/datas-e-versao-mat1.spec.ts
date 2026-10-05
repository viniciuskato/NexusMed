import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import {
  MATERIAL_PREFIX,
  createTestUser,
  deleteE2EMaterials,
  deleteTestUser,
  getSeedIds,
  psqlLocal,
  runCleanup,
  type CreatedTestUser,
} from '../fixtures/localSupabase';
import { materialParaEnvio } from '../fixtures/materialParaEnvio';

// MAT-1, contra o app real (build de teste) e o Supabase local: um material antigo (sem versão do padrão registrada)
// mostra "Publicado em" para todos e o selo "Desatualizado" só para o admin; o admin baixa o arquivo para atualizar (um
// .txt com a abertura, o prompt e a Parte 1 do padrão e o texto atual), envia o arquivo reescrito, publica na hora e a
// leitura passa a mostrar o texto novo, sem o selo. A seção casada pelo título mantém o id, e o histórico ganha uma versão.

async function login(page: Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

async function abrirMaterial(page: Page, titulo: string) {
  const desktopTrigger = page.locator('#nav-resources');
  if (await desktopTrigger.isVisible()) {
    await desktopTrigger.click();
    await page.locator('#nav-resources-compendiums').click();
  } else {
    await page.locator('#dock-nav-resources').click();
    await page.locator('#dock-resources-compendiums').click();
  }
  await page.getByRole('button', { name: 'Modo árvore' }).click();
  await page.getByRole('list').getByRole('button', { name: titulo, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible({ timeout: 15_000 });
}

/** Um material publicado "antigo": sem versão do padrão registrada, com uma seção chamada como a do arquivo novo. */
function materialAntigo(titulo: string): { materialId: string; secaoId: string } {
  const seed = getSeedIds();
  const materialId = psqlLocal(
    `insert into public.materials (discipline_id, theme_id, title, subtitle, mode, study_lens, estimated_read_time_minutes, author, tags, provenance, source, license) ` +
      `values ('${seed.disciplineId}', '${seed.themeId}', '${titulo}', 'Material de teste MAT-1', 'mecanismos', 'fisiopatologia', 12, 'E2E', array['e2e'], 'e2e-mat1', 'fixture', 'uso interno') returning id;`,
  )
    .split('\n')[0]
    .trim();
  const secaoId = psqlLocal(
    `insert into public.material_sections (material_id, sort_order, title, mechanism_tag, content, key_takeaways) ` +
      `values ('${materialId}', 0, 'Primeira seção', 'Visão geral', 'Texto ANTIGO da primeira seção.', array['ponto']) returning id;`,
  )
    .split('\n')[0]
    .trim();
  psqlLocal(`update public.materials set status = 'published' where id = '${materialId}';`);
  return { materialId, secaoId };
}

test.describe('Datas, selo "Desatualizado" e versão nova de material (MAT-1)', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
  });

  async function usuario(papel: 'admin' | 'student', prefixo: string) {
    const user = await createTestUser({ emailLocalPart: `${prefixo}-${Date.now()}`, password: 'senha-teste-123', role: papel, status: 'active' });
    // O histórico da seção e o envio apontam para o autor: o material (que leva as seções, as versões e o envio de
    // atualização) sai ANTES dos usuários (AGENTS.md, item 18: `runCleanup` roda na ordem dada).
    cleanup.push(() => deleteTestUser(user.id));
    return user;
  }

  test('o aluno vê as datas e não vê o selo; o admin vê o selo, baixa o arquivo, publica a versão nova e o selo some', async ({ page, browser }) => {
    const tag = `${Date.now()}`;
    const titulo = `${MATERIAL_PREFIX}mat1-${tag}`;
    const { materialId, secaoId } = materialAntigo(titulo);
    cleanup.unshift(() => deleteE2EMaterials());
    const admin = await usuario('admin', 'e2e-mat1-admin');
    const aluno = await usuario('student', 'e2e-mat1-aluno');

    // No banco: o material no ar ganhou data de publicação e não tem versão do padrão.
    expect(psqlLocal(`select (published_at is not null)::text || '|' || coalesce(standard_version::text, 'nula') from public.materials where id = '${materialId}';`)).toBe(
      'true|nula',
    );

    // 1. O aluno vê "Publicado em" e nenhum selo nem botão.
    const contextoAluno = await browser.newContext();
    cleanup.unshift(() => contextoAluno.close());
    const paginaAluno = await contextoAluno.newPage();
    await login(paginaAluno, aluno);
    await abrirMaterial(paginaAluno, titulo);
    await expect(paginaAluno.getByTestId('publicado-em')).toHaveText(/^Publicado em \d{2}\/\d{2}\/\d{4}$/);
    await expect(paginaAluno.getByTestId('selo-desatualizado')).toHaveCount(0);
    await expect(paginaAluno.locator('#btn-baixar-para-atualizar')).toHaveCount(0);
    await expect(paginaAluno.locator('#btn-atualizar-material')).toHaveCount(0);

    // 2. O admin vê "Publicado em" e o selo "Desatualizado" (versão do padrão desconhecida) e os três botões.
    await login(page, admin);
    await abrirMaterial(page, titulo);
    await expect(page.getByTestId('publicado-em')).toHaveText(/^Publicado em \d{2}\/\d{2}\/\d{4}$/);
    await expect(page.getByTestId('selo-desatualizado')).toHaveText('Desatualizado');
    await expect(page.locator('#btn-baixar-para-atualizar')).toBeVisible();
    await expect(page.locator('#btn-atualizar-material')).toBeVisible();
    await expect(page.locator('#btn-exportar-material')).toBeVisible();

    // 3. "Baixar para atualizar": UM .txt com a abertura, o prompt, a Parte 1 do padrão e o texto atual, nesta ordem.
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-baixar-para-atualizar').click()]);
    expect(download.suggestedFilename()).toMatch(/-para-atualizar-\d{4}-\d{2}-\d{2}\.txt$/);
    const baixado = readFileSync((await download.path()) as string, 'utf8');
    expect(baixado.startsWith(`Atualizar o material "${titulo}" para o padrão NexusMed de conteúdos, versão 3.`)).toBe(true);
    const iAbertura = baixado.indexOf('Reescreva o material que está no fim deste arquivo');
    // O prompt cita as duas linhas-marca entre aspas: a marca de verdade é a que está sozinha numa linha.
    const iInicio = baixado.search(/^=== PADRÃO NEXUSMED DE CONTEÚDOS — INÍCIO ===$/m);
    const iParte1 = baixado.search(/^# Parte 1\b/m);
    const iFim = baixado.search(/^=== PADRÃO NEXUSMED DE CONTEÚDOS — FIM ===$/m);
    const iMaterial = baixado.indexOf(`# ${titulo}\n`);
    expect(iAbertura).toBeGreaterThan(0);
    expect(iInicio).toBeGreaterThan(iAbertura);
    expect(iParte1).toBeGreaterThan(iInicio);
    expect(iFim).toBeGreaterThan(iParte1);
    expect(iMaterial).toBeGreaterThan(iFim);
    expect(baixado).toContain('Texto ANTIGO da primeira seção.');
    expect(baixado).not.toMatch(/^# Parte 2\b/m);
    await expect(page.locator('#exportar-resultado')).toContainText('para-atualizar');

    // 4. "Enviar versão nova": o arquivo reescrito (versão 3 do padrão) mostra o que muda e é publicado na hora.
    const seed = getSeedIds();
    const disciplina = psqlLocal(`select name from public.disciplines where id = '${seed.disciplineId}';`);
    const tema = psqlLocal(`select name from public.themes where id = '${seed.themeId}';`);
    await page.locator('#btn-atualizar-material').click();
    const dialogo = page.getByRole('dialog', { name: 'Enviar versão nova' });
    await expect(dialogo).toBeVisible();
    await dialogo.locator('#atualizar-arquivo').setInputFiles({
      name: 'nova.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(materialParaEnvio({ titulo, disciplina, tema, corpo: 'Texto NOVO da primeira seção, já no padrão [1](#ref-1) e [2](#ref-2).' }), 'utf8'),
    });
    await expect(dialogo.locator('#atualizar-previa')).toContainText('Seções alteradas');
    await dialogo.getByRole('button', { name: 'Publicar versão nova' }).click();
    await expect(dialogo.locator('#atualizar-publicado')).toContainText('Atualização aplicada');
    await dialogo.getByRole('button', { name: 'Fechar', exact: true }).last().click();

    // No banco: a seção casada pelo título mantém o id e tem o texto novo; a versão do padrão é a do arquivo; a data de
    // publicação não mudou e a de atualização andou; o histórico da seção ganhou uma versão; o envio ficou "publicado".
    expect(psqlLocal(`select content from public.material_sections where id = '${secaoId}';`)).toContain('Texto NOVO da primeira seção');
    expect(psqlLocal(`select count(*) from public.material_sections where material_id = '${materialId}';`)).toBe('1');
    expect(psqlLocal(`select standard_version from public.materials where id = '${materialId}';`)).toBe('3');
    expect(psqlLocal(`select (updated_at > published_at)::text from public.materials where id = '${materialId}';`)).toBe('true');
    expect(psqlLocal(`select count(*) from public.material_section_versions where material_section_id = '${secaoId}' and reason = 'Atualização por arquivo';`)).toBe('1');
    expect(psqlLocal(`select status || '|' || (applied_at is not null)::text from public.material_submissions where target_material_id = '${materialId}';`)).toBe('publicado|true');

    // 5. A leitura já mostra o texto novo e o selo sumiu (versão atual); depois de recarregar, continua assim.
    await expect(page.getByText('Texto NOVO da primeira seção', { exact: false }).first()).toBeVisible();
    await expect(page.getByTestId('selo-desatualizado')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
    await abrirMaterial(page, titulo);
    await expect(page.getByText('Texto NOVO da primeira seção', { exact: false }).first()).toBeVisible();
    await expect(page.getByTestId('selo-desatualizado')).toHaveCount(0);
    await expect(page.getByTestId('publicado-em')).toBeVisible();
  });
});
