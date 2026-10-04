import { test, expect, type Page } from '@playwright/test';
import {
  MATERIAL_PREFIX,
  createTestUser,
  deleteE2EMaterials,
  deleteTestUser,
  getSeedIds,
  insertPublishedMaterial,
  psqlLocal,
  runCleanup,
  type CreatedTestUser,
} from '../fixtures/localSupabase';
import { loteParaEnvio, questaoParaEnvio } from '../fixtures/questoesParaEnvio';

// 44-H1 — como escrever e enviar questões pelo site. Contra o app real (build de
// teste) e o Supabase local: a página mostra o padrão e os dois prompts; o envio
// só é aceito com o arquivo aceito pelo importador; fica guardado com o autor
// certo, no estado inicial, com os materiais escolhidos; só o autor (e admin) o
// vê. Nada é revisado nem publicado aqui (44-H2).

async function login(page: Page, user: CreatedTestUser, path = '/') {
  await page.goto(path);
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

async function abrirPeloMenu(page: Page, item: string, cabecalho: string) {
  await page.locator('#btn-user-profile-menu').click();
  await page.locator(item).click();
  await expect(page.getByRole('heading', { level: 1, name: cabecalho })).toBeVisible();
}

function catalogoDoSeed(): { disciplina: string; tema: string } {
  const seed = getSeedIds();
  return {
    disciplina: psqlLocal(`select name from public.disciplines where id = '${seed.disciplineId}';`),
    tema: psqlLocal(`select name from public.themes where id = '${seed.themeId}';`),
  };
}

const q = (s: string) => s.replace(/'/g, "''");

test.describe('Como escrever e enviar questões (44-H1)', () => {
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

  test('estudante ativo abre "Como escrever questões" pelo menu: padrão, catálogo, materiais e os dois botões de copiar', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const { disciplina, tema } = catalogoDoSeed();
    const tag = `${Date.now()}`;
    const titulo = `${MATERIAL_PREFIX}questoes-${tag}`;
    insertPublishedMaterial(`questoes-${tag}`);
    cleanup.push(() => deleteE2EMaterials());
    const student = await novoUsuario('q-como', 'admin');

    await login(page, student);
    await abrirPeloMenu(page, '#nav-como-escrever-questoes', 'Como escrever questões');
    await expect(page).toHaveURL(/#\/como-escrever-questoes$/);

    // O padrão para quem escreve, sem nada de quem opera a plataforma.
    const padrao = page.locator('#como-escrever-questoes-padrao-texto');
    await expect(padrao).toContainText('Dois tipos de questão');
    await expect(padrao).toContainText('NexusMed (questão autoral)');
    await expect(page.locator('body')).not.toContainText('PGRST202');
    // O catálogo e o material publicado, com os nomes exatos.
    await expect(page.locator('#como-escrever-catalogo-lista')).toContainText(disciplina);
    await expect(page.locator('#como-escrever-catalogo-lista')).toContainText(tema);
    await page.locator('#como-escrever-questoes-materiais-lista summary', { hasText: disciplina }).first().click();
    await expect(page.locator('#como-escrever-questoes-materiais-lista')).toContainText(titulo);

    // Os dois botões copiam prompt + padrão.
    await page.getByRole('button', { name: 'Copiar prompt para criar questões' }).click();
    await expect(page.getByText('Copiado. Agora é só colar na conversa com a IA.').first()).toBeVisible();
    const criar = await page.evaluate(() => navigator.clipboard.readText());
    expect(criar).toContain('redator de questões comentadas do NexusMed');
    expect(criar).toContain('=== PADRÃO NEXUSMED DE QUESTÕES — INÍCIO ===');
    expect(criar).toContain('## 4. Formato do arquivo');
    await page.getByRole('button', { name: 'Copiar prompt revisor de questões' }).click();
    await expect(page.getByText('Copiado. Agora é só colar na conversa com a IA.').last()).toBeVisible();
    const revisar = await page.evaluate(() => navigator.clipboard.readText());
    expect(revisar).toContain('revisor médico independente das questões comentadas');
    expect(revisar).toContain('"APTO PARA ENVIAR"');
    expect(revisar).toContain('=== PADRÃO NEXUSMED DE QUESTÕES — FIM ===');

    // O link do fluxo leva a "Enviar material", já na aba de questões.
    await page.getByRole('button', { name: 'Enviar material, na aba Questões' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Enviar material' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Novo envio de questões' })).toBeVisible();
  });

  test('estudante ativo envia um lote aceito; ele fica guardado com o autor certo, sem revisar nem publicar nada', async ({ page }) => {
    const { disciplina, tema } = catalogoDoSeed();
    const tag = `${Date.now()}`;
    const tituloMaterial = `${MATERIAL_PREFIX}lote-${tag}`;
    const materialId = insertPublishedMaterial(`lote-${tag}`);
    cleanup.push(() => deleteE2EMaterials());
    const student = await novoUsuario('q-envio', 'admin');
    const totalDeQuestoesAntes = psqlLocal('select count(*) from public.questions;');

    await login(page, student);
    await abrirPeloMenu(page, '#nav-enviar-material', 'Enviar material');
    await page.locator('#enviar-modo-questoes').click();
    await expect(page.locator('#envio-questoes-resultado')).toContainText('Cole o texto ou carregue o arquivo');
    await expect(page.locator('#btn-enviar-questoes')).toBeDisabled();

    // Duas questões: uma de banca real, com o material citado no arquivo; uma autoral, sem material no arquivo
    // (o material vem da escolha na tela).
    const texto = [
      questaoParaEnvio(1, { disciplina, tema, materiais: tituloMaterial }),
      questaoParaEnvio(2, { disciplina, tema, instituicao: 'NexusMed (questão autoral)', ano: null, materiais: null }),
    ].join('\n\n');
    await page.locator('#envio-questoes-texto').fill(texto);
    // Falta o material da questão 2: o importador aceita, mas o envio pede o material.
    await expect(page.locator('#envio-questoes-pendencias')).toContainText('Questão 2: Sem material');
    await expect(page.locator('#btn-enviar-questoes')).toBeDisabled();

    await page.locator('#envio-questoes-materiais').getByLabel(tituloMaterial).check();
    await expect(page.locator('#envio-questoes-resultado')).toContainText('Arquivo aceito: 2 questões passaram pela importação');
    await expect(page.locator('#btn-enviar-questoes')).toBeEnabled();
    const nome = `Lote E2E ${tag}`;
    await page.locator('#envio-questoes-nome').fill(nome);
    await page.locator('#btn-enviar-questoes').click();

    await expect(page.locator('#envio-questoes-sucesso')).toContainText(nome);
    const item = page.locator('#meus-envios-lista > li', { hasText: nome });
    await expect(item).toContainText('Questões');
    await expect(item).toContainText('Aguardando revisão');
    await expect(item).toContainText('Recebemos o lote de questões');

    // No banco: autor certo (o do JWT), estado inicial, os materiais escolhidos, o texto inteiro; nenhuma questão criada.
    const linha = psqlLocal(
      `select author_id || '|' || status || '|' || material_ids::text || '|' || (content_md = '${q(texto)}')::text ` +
        `from public.question_submissions where title = '${q(nome)}';`,
    );
    expect(linha).toBe(`${student.id}|aguardando_revisao|{${materialId}}|true`);
    expect(psqlLocal('select count(*) from public.questions;')).toBe(totalDeQuestoesAntes);
  });

  test('arquivo com pendência: mostra a questão e o que corrigir, e não deixa enviar', async ({ page }) => {
    const { disciplina, tema } = catalogoDoSeed();
    const student = await novoUsuario('q-pend', 'admin');
    await login(page, student);
    await abrirPeloMenu(page, '#nav-enviar-material', 'Enviar material');
    await page.locator('#enviar-modo-questoes').click();

    const texto = [
      questaoParaEnvio(1, { disciplina, tema, materiais: 'Material que não existe' }),
      questaoParaEnvio(2, { disciplina, tema, perola: null, materiais: 'Material que não existe' }),
    ].join('\n\n');
    await page.locator('#envio-questoes-texto').fill(texto);
    const pendencias = page.locator('#envio-questoes-pendencias');
    await expect(pendencias).toContainText('Questão 1: O material “Material que não existe” não é o título exato de um material publicado.');
    await expect(pendencias).toContainText('Questão 2: Pérola High-Yield vazia');
    await expect(page.locator('#btn-enviar-questoes')).toBeDisabled();
    expect(psqlLocal(`select count(*) from public.question_submissions where author_id = '${student.id}';`)).toBe('0');
  });

  test('estudante A não vê o lote do estudante B, e o admin vê os dois na aba de envios (RLS)', async ({ page, browser }) => {
    const a = await novoUsuario('q-a', 'admin');
    const b = await novoUsuario('q-b', 'admin');
    const admin = await novoUsuario('q-admin', 'admin');
    const tituloA = `Lote do A ${Date.now()}`;
    const tituloB = `Lote do B ${Date.now()}`;
    for (const [autor, titulo] of [
      [a, tituloA],
      [b, tituloB],
    ] as const) {
      psqlLocal(
        `insert into public.question_submissions (author_id, title, content_md) values ('${autor.id}', '${q(titulo)}', '## Questão 1');`,
      );
    }

    await login(page, a);
    await abrirPeloMenu(page, '#nav-enviar-material', 'Enviar material');
    await expect(page.locator('#meus-envios-lista')).toContainText(tituloA);
    await expect(page.locator('#meus-envios-lista')).not.toContainText(tituloB);

    const contextoB = await browser.newContext();
    cleanup.push(() => contextoB.close());
    const paginaB = await contextoB.newPage();
    await login(paginaB, b);
    await abrirPeloMenu(paginaB, '#nav-enviar-material', 'Enviar material');
    await expect(paginaB.locator('#meus-envios-lista')).toContainText(tituloB);
    await expect(paginaB.locator('#meus-envios-lista')).not.toContainText(tituloA);
    await expect(paginaB.locator('body')).not.toContainText(tituloA);

    // O admin de verdade (44-H2): abre a aba de envios da Área Editorial e vê os lotes dos dois, marcados como
    // envio de questões, e só o botão "Publicar" como ação (P8).
    const contextoAdmin = await browser.newContext();
    cleanup.push(() => contextoAdmin.close());
    const paginaAdmin = await contextoAdmin.newPage();
    await login(paginaAdmin, admin, '/#/admin');
    await paginaAdmin.locator('#admin-tab-envios').click();
    const listaAdmin = paginaAdmin.locator('#admin-envios-lista');
    await expect(listaAdmin).toContainText(tituloA);
    await expect(listaAdmin).toContainText(tituloB);
    await expect(listaAdmin.locator('li[data-tipo="questoes"]')).toHaveCount(2);
    await expect(listaAdmin.locator('button:not([data-testid="publicar-envio"])')).toHaveCount(0);
  });

  test('lote no limite: 3 esperando revisão (fila única de material e questões), o envio fica travado com a explicação', async ({ page }) => {
    const { disciplina, tema } = catalogoDoSeed();
    const tag = `${Date.now()}`;
    insertPublishedMaterial(`limite-${tag}`);
    cleanup.push(() => deleteE2EMaterials());
    const student = await novoUsuario('q-lim', 'admin');
    for (let i = 1; i <= 3; i += 1) {
      psqlLocal(`insert into public.question_submissions (author_id, title, content_md) values ('${student.id}', 'Esperando ${i} ${tag}', '## Questão 1');`);
    }
    await login(page, student);
    await abrirPeloMenu(page, '#nav-enviar-material', 'Enviar material');
    await page.locator('#enviar-modo-questoes').click();
    await page.locator('#envio-questoes-texto').fill(loteParaEnvio(1, { disciplina, tema, materiais: `${MATERIAL_PREFIX}limite-${tag}` }));
    await expect(page.locator('#envio-questoes-resultado')).toContainText('Arquivo aceito');
    await expect(page.locator('#envio-questoes-fila-cheia')).toContainText('3 envios esperando revisão');
    await expect(page.locator('#btn-enviar-questoes')).toBeDisabled();
    // A fila é uma só (44-H2): 3 esperando, de material e de questões somados. A aba de material trava também.
    await page.locator('#enviar-modo-material').click();
    await expect(page.locator('#envio-fila-cheia')).toContainText('3 envios esperando revisão');
  });
});
