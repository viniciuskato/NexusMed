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

// 44-F — o autor vê o veredito do revisor de IA, os achados e o bloco de
// correção em "Meus envios", e corrige e reenvia. A REVISÃO É SIMULADA: o
// servidor real (Edge Function + API paga) não roda aqui e nenhuma chamada à
// API é feita; o que o teste grava no banco é o que a função de servidor
// gravaria (como postgres, o único papel que troca estado e escreve revisão).

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

const q = (s: string) => s.replace(/'/g, "''");

/** Um envio já revisado, como o servidor o deixaria. Devolve o id do envio. */
function envioRevisado(autorId: string, titulo: string, estado: 'nao_apto' | 'apto' | 'erro', achados: string | null, bloco: string | null): string {
  const seed = getSeedIds();
  const id = psqlLocal(
    `insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md, status) ` +
      `values ('${autorId}', '${q(titulo)}', '${seed.disciplineId}', '${seed.themeId}', '# ${q(titulo)}', '${estado}') returning id;`,
  )
    .split('\n')[0]
    .trim();
  const veredito = estado === 'erro' ? 'erro' : estado;
  const status = estado === 'erro' ? 'erro' : 'concluida';
  psqlLocal(
    `insert into public.material_reviews (submission_id, content_sha256, status, verdict, findings_text, correction_block, model, ` +
      `input_tokens, output_tokens, completed_at) ` +
      `select s.id, s.content_sha256, '${status}', '${veredito}', ${achados ? `'${q(achados)}'` : 'null'}, ${bloco ? `'${q(bloco)}'` : 'null'}, ` +
      `'claude-opus-5-5', 1000, 2000, now() from public.material_submissions s where s.id = '${id}';`,
  );
  return id;
}

const ACHADOS = '1. **Fato** — seção Primeira seção: o espectro citado não confere com a fonte.\n2. Referência — a referência 2 não sustenta a frase.';
const BLOCO = 'Corrija o material conforme os achados abaixo, mude só o que eles pedem e entregue os dois blocos de novo (o .md inteiro e O QUE MUDEI):\n1. Espectro: corrigir conforme a fonte.';

test.describe('Revisor de IA: o autor vê o resultado e corrige (44-F)', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
  });

  async function novoUsuario(prefixo: string) {
    const user = await createTestUser({
      emailLocalPart: `${prefixo}-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'student',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(user.id));
    return user;
  }

  test('envio "não apto": mostra achados e bloco de correção; corrigir e reenviar volta o envio para a fila', async ({ page }) => {
    const { disciplina, tema } = catalogoDoSeed();
    const titulo = `Não apto E2E ${Date.now()}`;
    const student = await novoUsuario('rev-naoapto');
    const envioId = envioRevisado(student.id, titulo, 'nao_apto', ACHADOS, BLOCO);

    await login(page, student);
    await abrirEnvio(page);

    const item = page.locator('#meus-envios-lista > li', { hasText: titulo });
    await expect(item).toContainText('Precisa de correção');
    await item.getByText('Ver a revisão').click();
    await expect(item.getByTestId('revisao-do-envio')).toContainText('o espectro citado não confere com a fonte');
    // O negrito do Markdown da IA foi renderizado, sem asteriscos.
    await expect(item.getByTestId('revisao-do-envio')).not.toContainText('**');
    await expect(item.getByTestId('bloco-de-correcao')).toContainText('Corrija o material conforme os achados abaixo');

    // Corrigir: o formulário entra em modo de correção e o texto novo substitui o antigo.
    await item.getByRole('button', { name: 'Corrigir e enviar de novo' }).click();
    await expect(page.getByRole('heading', { name: 'Corrigir envio' })).toBeVisible();
    await page.locator('#envio-texto').fill(materialParaEnvio({ titulo: `${titulo} corrigido`, disciplina, tema }));
    await expect(page.locator('#envio-resultado')).toContainText('Arquivo aceito');
    await page.locator('#btn-enviar-material').click();
    await expect(page.locator('#envio-sucesso')).toContainText('enviado');

    // No banco: o mesmo envio, texto e título novos, de volta à fila, com o mesmo autor; a revisão antiga ficou guardada.
    const linha = psqlLocal(`select status || '|' || title || '|' || author_id from public.material_submissions where id = '${envioId}';`);
    expect(linha).toBe(`aguardando_revisao|${titulo} corrigido|${student.id}`);
    expect(psqlLocal(`select count(*) from public.material_reviews where submission_id = '${envioId}';`)).toBe('1');
    expect(
      psqlLocal(`select (r.content_sha256 = s.content_sha256)::text from public.material_reviews r join public.material_submissions s on s.id = r.submission_id where s.id = '${envioId}';`),
    ).toBe('false');

    // Na tela: o envio espera revisão e a revisão do texto antigo já não aparece para o texto novo.
    const depois = page.locator('#meus-envios-lista > li', { hasText: `${titulo} corrigido` });
    await expect(depois).toContainText('Aguardando revisão');
    await expect(depois).not.toContainText('Ver a revisão');
  });

  test('envio "apto" mostra "Aprovado na revisão" e os achados, sem botão de corrigir', async ({ page }) => {
    const titulo = `Apto E2E ${Date.now()}`;
    const student = await novoUsuario('rev-apto');
    envioRevisado(student.id, titulo, 'apto', 'Tudo confere com as fontes.', null);
    await login(page, student);
    await abrirEnvio(page);
    const item = page.locator('#meus-envios-lista > li', { hasText: titulo });
    await expect(item).toContainText('Aprovado na revisão');
    await item.getByText('Ver a revisão').click();
    await expect(item.getByTestId('revisao-do-envio')).toContainText('Tudo confere com as fontes.');
    await expect(item.getByRole('button', { name: /Corrigir/ })).toHaveCount(0);
  });

  test('envio em "erro": "Tentar de novo com o mesmo texto" devolve o envio à fila sem mudar o texto', async ({ page }) => {
    const titulo = `Erro E2E ${Date.now()}`;
    const student = await novoUsuario('rev-erro');
    const envioId = envioRevisado(student.id, titulo, 'erro', null, null);
    await login(page, student);
    await abrirEnvio(page);
    const item = page.locator('#meus-envios-lista > li', { hasText: titulo });
    await expect(item).toContainText('A revisão não foi concluída');
    await item.getByRole('button', { name: 'Tentar de novo com o mesmo texto' }).click();
    await expect(page.locator('#envio-aviso-da-lista')).toContainText('voltou para a fila de revisão');
    expect(psqlLocal(`select status || '|' || content_md from public.material_submissions where id = '${envioId}';`)).toBe(
      `aguardando_revisao|# ${titulo}`,
    );
  });

  test('limite diário de revisões: o envio que espera diz por quê, em uma frase', async ({ page }) => {
    const titulo = `Limite E2E ${Date.now()}`;
    const student = await novoUsuario('rev-limite');
    const seed = getSeedIds();
    const antes = psqlLocal('select daily_review_cap_per_user from public.review_settings;');
    cleanup.push(() => {
      psqlLocal(`update public.review_settings set daily_review_cap_per_user = ${antes};`);
    });
    // Uma revisão já gasta hoje e um teto de 1 por dia: o próximo envio espera.
    envioRevisado(student.id, `${titulo} já revisado`, 'apto', 'ok', null);
    psqlLocal('update public.review_settings set daily_review_cap_per_user = 1;');
    psqlLocal(
      `insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md) ` +
        `values ('${student.id}', '${titulo}', '${seed.disciplineId}', '${seed.themeId}', '# esperando');`,
    );
    await login(page, student);
    await abrirEnvio(page);
    const item = page.locator('#meus-envios-lista > li', { hasText: titulo }).filter({ hasNotText: 'já revisado' });
    await expect(item.getByTestId('aviso-da-fila')).toHaveText('Você já usou a sua única revisão de hoje. Seu envio será revisado amanhã.');
  });

  test('estudante B não vê a revisão do envio do estudante A', async ({ page, browser }) => {
    const tituloA = `Revisão do A ${Date.now()}`;
    const a = await novoUsuario('rev-a');
    const b = await novoUsuario('rev-b');
    envioRevisado(a.id, tituloA, 'nao_apto', 'Achado secreto do A.', BLOCO);

    await login(page, a);
    await abrirEnvio(page);
    await page.locator('#meus-envios-lista > li', { hasText: tituloA }).getByText('Ver a revisão').click();
    await expect(page.locator('#meus-envios-lista')).toContainText('Achado secreto do A.');

    const contextoB = await browser.newContext();
    cleanup.push(() => contextoB.close());
    const paginaB = await contextoB.newPage();
    await login(paginaB, b);
    await abrirEnvio(paginaB);
    await expect(paginaB.locator('body')).not.toContainText('Achado secreto do A.');
    await expect(paginaB.locator('body')).not.toContainText(tituloA);
  });
});
