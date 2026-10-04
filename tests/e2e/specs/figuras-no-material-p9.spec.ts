import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  createTestUser,
  deleteTestUser,
  getAdminClient,
  getLocalConfig,
  getSeedIds,
  psqlLocal,
  runCleanup,
  type CreatedTestUser,
} from '../fixtures/localSupabase';
import { materialParaEnvio } from '../fixtures/materialParaEnvio';

// P9 — figuras no material. Contra o app real (build de teste) e o Supabase local: o admin sobe a imagem pelo site,
// recebe o trecho pronto para colar no .md, o arquivo passa pela checagem do padrão, é enviado e publicado, e o aluno
// ativo vê a figura com legenda e fonte. Quem não é ativo, e a figura que nenhum material publicado cita, não leem a imagem.

// PNG de 1 x 1 pixel.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const q = (s: string) => s.replace(/'/g, "''");

async function login(page: Page, user: CreatedTestUser, path = '/') {
  await page.goto(path);
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

function catalogoDoSeed(): { disciplina: string; tema: string } {
  const seed = getSeedIds();
  return {
    disciplina: psqlLocal(`select name from public.disciplines where id = '${seed.disciplineId}';`),
    tema: psqlLocal(`select name from public.themes where id = '${seed.themeId}';`),
  };
}

async function abrirEnvio(page: Page) {
  await page.locator('#btn-user-profile-menu').click();
  await page.locator('#nav-enviar-material').click();
  await expect(page.locator('#enviar-material-view')).toBeVisible();
}

async function openLibraryTree(page: Page) {
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

/** O cliente do Supabase de uma pessoa (a chave anon e a sessão dela): o que o navegador dela enxerga, sem a service role. */
async function clienteDe(user: CreatedTestUser) {
  const cfg = getLocalConfig();
  const client = createClient(cfg.apiUrl, cfg.anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  expect(error).toBeNull();
  return client;
}

test.describe('Figuras no material (P9)', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
  });

  async function novoUsuario(prefixo: string, role: 'student' | 'admin', status: 'active' | 'pending' = 'active') {
    const user = await createTestUser({ emailLocalPart: `${prefixo}-${Date.now()}`, password: 'senha-teste-123', role, status });
    cleanup.push(() => deleteTestUser(user.id));
    return user;
  }

  /** Apaga as figuras e os arquivos de uma execução (o app não apaga nada: a figura é imutável). */
  function limparFiguras(ids: string[]) {
    cleanup.unshift(async () => {
      if (ids.length === 0) return;
      await getAdminClient()
        .storage.from('material-figures')
        .remove(ids.flatMap((id) => [`${id}.png`, `${id}.jpg`, `${id}.webp`]));
      psqlLocal(`delete from public.material_figures where id in (${ids.map((i) => `'${i}'`).join(', ')});`);
    });
  }

  test('o admin sobe a imagem, cola o trecho no material, publica, e o aluno ativo vê a figura com legenda e fonte', async ({ page, browser }) => {
    const { disciplina, tema } = catalogoDoSeed();
    const tag = `${Date.now()}`;
    const titulo = `P9 figura ${tag}`;
    const admin = await novoUsuario('p9-admin', 'admin');
    const aluno = await novoUsuario('p9-aluno', 'student');
    const figuras: string[] = [];
    limparFiguras(figuras);
    cleanup.push(() => {
      psqlLocal(`delete from public.materials where title = '${q(titulo)}';`);
    });

    await login(page, admin);
    await abrirEnvio(page);

    // 1. "Enviar imagem": só PNG, JPEG ou WebP; o botão só habilita com a imagem e os três campos.
    await expect(page.locator('#enviar-imagem')).toBeVisible();
    const enviarImagem = page.getByTestId('imagem-enviar');
    await expect(enviarImagem).toBeDisabled();
    await page.getByTestId('imagem-arquivo').setInputFiles({ name: 'desenho.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
    await expect(page.getByTestId('imagem-aviso')).toContainText('PNG, JPEG ou WebP');
    await page.getByTestId('imagem-arquivo').setInputFiles({ name: 'curva.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByTestId('imagem-escolhida')).toContainText('curva.png');
    await page.getByTestId('imagem-alt').fill('Curva fluxo-volume com obstrução');
    await page.getByTestId('imagem-legenda').fill('Curva fluxo-volume normal e obstrutiva.');
    await page.getByTestId('imagem-fonte').fill('Diretriz de espirometria, 2024');
    await page.getByTestId('imagem-numero').fill('1');
    await expect(enviarImagem).toBeEnabled();
    await enviarImagem.click();

    // 2. O trecho pronto: bloco de três linhas com o identificador da imagem enviada.
    const trecho = await page.getByTestId('imagem-trecho').inputValue();
    const linhas = trecho.split('\n');
    expect(linhas).toHaveLength(3);
    const id = linhas[0].match(/^!\[Curva fluxo-volume com obstrução\]\(figura:([0-9a-f-]{36})\)$/)?.[1];
    expect(id).toBeTruthy();
    figuras.push(id!);
    expect(linhas[1]).toBe('**Figura 1.** Curva fluxo-volume normal e obstrutiva.');
    expect(linhas[2]).toBe('Fonte: Diretriz de espirometria, 2024');

    // No servidor: a linha da figura, com o hash do arquivo, e o arquivo no bucket privado.
    expect(psqlLocal(`select mime_type || '|' || byte_size || '|' || created_by from public.material_figures where id = '${id}';`)).toBe(
      `image/png|${PNG.length}|${admin.id}`,
    );
    expect(psqlLocal(`select count(*) from storage.objects where bucket_id = 'material-figures' and name = '${id}.png';`)).toBe('1');
    expect(psqlLocal(`select public from storage.buckets where id = 'material-figures';`)).toBe('f');

    // 3. O mesmo bloco, ainda pendente (como a IA o entrega), trava o envio; trocado pelo trecho, o arquivo é aceito.
    const corpoComTrecho = `Texto antes da figura [1](#ref-1).\n\n${trecho}\n\nTexto depois da figura [2](#ref-2).`;
    const pendente = '![Curva fluxo-volume](figura:PENDENTE)\n**Figura 1.** Curva normal e obstrutiva.\nFonte: sugerida, diretriz de espirometria.\nMostrar: duas curvas, a normal e a obstrutiva.';
    await page.locator('#envio-texto').fill(materialParaEnvio({ titulo, disciplina, tema, corpo: `Texto antes [1](#ref-1).\n\n${pendente}\n\nTexto depois [2](#ref-2).` }));
    await expect(page.locator('#envio-pendencias')).toContainText('Figura pendente');
    await expect(page.locator('#btn-enviar-material')).toBeDisabled();

    await page.locator('#envio-texto').fill(materialParaEnvio({ titulo, disciplina, tema, corpo: corpoComTrecho }));
    await expect(page.locator('#envio-resultado')).toContainText('Arquivo aceito');
    await expect(page.locator('#btn-enviar-material')).toBeEnabled();
    await page.locator('#btn-enviar-material').click();
    await expect(page.locator('#envio-sucesso')).toContainText(titulo);

    // 4. O admin publica pela aba Envios (o revisor só aconselha).
    await page.goto('/#/admin');
    await page.locator('#admin-tab-envios').click();
    const item = page.locator('#admin-envios-lista > li', { hasText: titulo });
    await item.getByTestId('publicar-envio').click();
    await item.getByTestId('confirmar-publicar').click();
    await expect(item.getByTestId('resultado-da-publicacao')).toHaveText('Material publicado.');
    expect(psqlLocal(`select status from public.materials where title = '${q(titulo)}';`)).toBe('published');
    // O identificador da figura é parte do texto publicado, e portanto do que o hash do material cobre.
    expect(psqlLocal(`select count(*) from public.material_sections s join public.materials m on m.id = s.material_id where m.title = '${q(titulo)}' and s.content like '%(figura:${id})%';`)).toBe('1');

    // 5. O aluno ativo abre o material e vê a figura, a legenda e a fonte.
    const contexto = await browser.newContext();
    const paginaDoAluno = await contexto.newPage();
    try {
      await login(paginaDoAluno, aluno);
      await openLibraryTree(paginaDoAluno);
      await paginaDoAluno.getByRole('button', { name: titulo, exact: true }).click();
      const figura = paginaDoAluno.locator('figure[data-testid="figura-do-material"]');
      await expect(figura).toBeVisible({ timeout: 20_000 });
      const imagem = figura.locator('img');
      await expect(imagem).toHaveAttribute('alt', 'Curva fluxo-volume com obstrução');
      await expect.poll(() => imagem.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);
      await expect(figura.getByTestId('figura-legenda')).toHaveText('Figura 1. Curva fluxo-volume normal e obstrutiva.');
      await expect(figura.getByTestId('figura-fonte')).toHaveText('Fonte: Diretriz de espirometria, 2024');
      // A imagem vem do Storage do próprio projeto, por URL assinada (não de um endereço qualquer).
      expect(await imagem.getAttribute('src')).toContain(`${getLocalConfig().apiUrl}/storage/v1/object/sign/material-figures/${id}.png`);
    } finally {
      await contexto.close();
    }
  });

  test('só usuário ativo lê a imagem, e só a que um material publicado cita', async () => {
    const admin = await novoUsuario('p9-api-admin', 'admin');
    const aluno = await novoUsuario('p9-api-aluno', 'student');
    const pendente = await novoUsuario('p9-api-pendente', 'student', 'pending');
    const seed = getSeedIds();
    const tag = `${Date.now()}`;
    const citada = crypto.randomUUID();
    const naoCitada = crypto.randomUUID();
    limparFiguras([citada, naoCitada]);

    // O admin envia as duas figuras pela API, com a sessão dele (a RLS decide, não a service role).
    const clienteAdmin = await clienteDe(admin);
    for (const figura of [citada, naoCitada]) {
      const { error: erroDoArquivo } = await clienteAdmin.storage.from('material-figures').upload(`${figura}.png`, PNG, { contentType: 'image/png', upsert: false });
      expect(erroDoArquivo).toBeNull();
      const { error: erroDaLinha } = await clienteAdmin
        .from('material_figures')
        .insert({ id: figura, storage_path: `${figura}.png`, mime_type: 'image/png', byte_size: PNG.length, sha256: 'a'.repeat(64) });
      expect(erroDaLinha).toBeNull();
    }

    // Material publicado que cita só a primeira.
    const tituloDoMaterial = `P9 api ${tag}`;
    cleanup.push(() => {
      psqlLocal(`delete from public.materials where title = '${q(tituloDoMaterial)}';`);
    });
    const materialId = psqlLocal(
      `insert into public.materials (discipline_id, theme_id, title, subtitle, mode, estimated_read_time_minutes, author, tags, provenance, source, license) ` +
        `values ('${seed.disciplineId}', '${seed.themeId}', '${q(tituloDoMaterial)}', 'x', 'mecanismos', 3, 'E2E', array['e2e'], 'e2e-p9', 'fixture', 'uso interno') returning id;`,
    )
      .split('\n')[0]
      .trim();
    psqlLocal(
      `insert into public.material_sections (material_id, sort_order, title, mechanism_tag, content, key_takeaways) ` +
        `values ('${materialId}', 1, 'Seção', 'Visão geral', E'![a](figura:${citada})\\n**Figura 1.** L.\\nFonte: F.', array['ponto']);`,
    );
    psqlLocal(`update public.materials set status = 'published' where id = '${materialId}';`);

    const clienteAluno = await clienteDe(aluno);
    // Aluno ativo: a figura citada, sim; a que ninguém cita, não.
    const { data: linhas } = await clienteAluno.from('material_figures').select('id').in('id', [citada, naoCitada]);
    expect((linhas ?? []).map((l) => l.id)).toEqual([citada]);
    const urlOk = await clienteAluno.storage.from('material-figures').createSignedUrl(`${citada}.png`, 60);
    expect(urlOk.error).toBeNull();
    const resposta = await fetch(urlOk.data!.signedUrl);
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('content-type')).toContain('image/png');
    const urlNegada = await clienteAluno.storage.from('material-figures').createSignedUrl(`${naoCitada}.png`, 60);
    expect(urlNegada.error).not.toBeNull();

    // Usuário pendente e anônimo: nada.
    const clientePendente = await clienteDe(pendente);
    const { data: doPendente } = await clientePendente.from('material_figures').select('id').in('id', [citada, naoCitada]);
    expect(doPendente ?? []).toEqual([]);
    expect((await clientePendente.storage.from('material-figures').createSignedUrl(`${citada}.png`, 60)).error).not.toBeNull();
    const cfg = getLocalConfig();
    const anonimo = createClient(cfg.apiUrl, cfg.anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    expect((await anonimo.from('material_figures').select('id')).error).not.toBeNull();
    expect((await anonimo.storage.from('material-figures').createSignedUrl(`${citada}.png`, 60)).error).not.toBeNull();

    // O aluno não envia figura nem troca, nem apaga, a que existe.
    const envioDoAluno = await clienteAluno.storage.from('material-figures').upload(`${crypto.randomUUID()}.png`, PNG, { contentType: 'image/png' });
    expect(envioDoAluno.error).not.toBeNull();
    const trocaDoAdmin = await clienteAdmin.storage.from('material-figures').upload(`${citada}.png`, PNG, { contentType: 'image/png', upsert: true });
    expect(trocaDoAdmin.error).not.toBeNull();
    const apagaDoAdmin = await clienteAdmin.storage.from('material-figures').remove([`${citada}.png`]);
    expect(apagaDoAdmin.data ?? []).toEqual([]);
    expect(psqlLocal(`select count(*) from storage.objects where bucket_id = 'material-figures' and name = '${citada}.png';`)).toBe('1');
  });
});
