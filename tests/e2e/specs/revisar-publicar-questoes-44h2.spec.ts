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
import { rodarServidorDoRevisor } from '../fixtures/servidorDoRevisor';

// 44-H2 — questões: revisão por IA e publicação pelo veredito. Contra o app real (build de
// teste) e o Supabase local. O servidor do revisor roda de verdade (o ciclo, a ponte com o
// banco, o mesmo importador de questões da tela e a criação das questões); só a API paga é
// simulada: nenhuma chamada à Anthropic.

async function login(page: Page, user: CreatedTestUser, path = '/') {
  await page.goto(path);
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

async function abrirEnvioDeQuestoes(page: Page) {
  await page.locator('#btn-user-profile-menu').click();
  await page.locator('#nav-enviar-material').click();
  await expect(page.locator('#enviar-material-view')).toBeVisible();
  await page.locator('#enviar-modo-questoes').click();
  await expect(page.getByRole('heading', { name: /Novo envio de questões|Corrigir o envio/ })).toBeVisible();
}

function catalogoDoSeed(): { disciplina: string; tema: string } {
  const seed = getSeedIds();
  return {
    disciplina: psqlLocal(`select name from public.disciplines where id = '${seed.disciplineId}';`),
    tema: psqlLocal(`select name from public.themes where id = '${seed.themeId}';`),
  };
}

const q = (s: string) => s.replace(/'/g, "''");

/** As questões que o servidor publicou para os envios desta pessoa: saem do ar e são apagadas (só o postgres apaga questão publicada). */
function apagarQuestoesPublicadasDe(userId: string): void {
  const ids = `(select unnest(published_question_ids) from public.question_submissions where author_id = '${userId}')`;
  psqlLocal(`update public.questions set status = 'draft' where id in ${ids} and status = 'published';`);
  psqlLocal(`delete from public.questions where id in ${ids};`);
}

test.describe('Questões: revisão por IA e publicação pelo veredito (44-H2)', () => {
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
    // As questões publicadas saem ANTES de o usuário (e os envios dele) serem apagados.
    cleanup.unshift(() => apagarQuestoesPublicadasDe(user.id));
    return user;
  }

  test('envio → revisão apto (simulada) → o servidor publica as questões ligadas ao material → o estudante responde, vê o selo e reporta um erro → o admin resolve', async ({
    page,
    browser,
  }) => {
    const { disciplina, tema } = catalogoDoSeed();
    const tag = `${Date.now()}`;
    const tituloMaterial = `${MATERIAL_PREFIX}h2-${tag}`;
    const materialId = insertPublishedMaterial(`h2-${tag}`);
    cleanup.push(() => deleteE2EMaterials());
    const autor = await novoUsuario('h2-autor', 'admin');
    const admin = await novoUsuario('h2-admin', 'admin');
    const totalPublicadasAntes = Number(psqlLocal(`select count(*) from public.questions where status = 'published';`));

    // 1. O autor envia um lote de duas questões: uma de banca real (com o material citado no arquivo) e
    //    uma autoral (o material vem da escolha na tela).
    await login(page, autor);
    await abrirEnvioDeQuestoes(page);
    const texto = [
      questaoParaEnvio(1, { disciplina, tema, materiais: tituloMaterial }),
      questaoParaEnvio(2, { disciplina, tema, instituicao: 'NexusMed (questão autoral)', ano: null, materiais: null }),
    ].join('\n\n');
    await page.locator('#envio-questoes-texto').fill(texto);
    await page.locator('#envio-questoes-materiais').getByLabel(tituloMaterial).check();
    await expect(page.locator('#envio-questoes-resultado')).toContainText('Arquivo aceito: 2 questões passaram pela importação');
    const nome = `Lote H2 ${tag}`;
    await page.locator('#envio-questoes-nome').fill(nome);
    await page.locator('#btn-enviar-questoes').click();
    await expect(page.locator('#envio-questoes-sucesso')).toContainText(nome);
    await expect(page.locator('#meus-envios-lista > li', { hasText: nome })).toContainText('Aguardando revisão');
    // Nada foi publicado só por enviar.
    expect(psqlLocal(`select count(*) from public.questions where status = 'published';`)).toBe(String(totalPublicadasAntes));

    // 2. O servidor revisa (API simulada: "apto") e publica, uma vez só.
    const resumos = await rodarServidorDoRevisor({ veredito: 'apto', ciclos: 2 });
    expect(resumos.flatMap((r) => r.erros)).toEqual([]);
    expect(resumos[1].publicados).toBeGreaterThanOrEqual(1);

    const tituloSql = q(nome);
    expect(psqlLocal(`select status from public.question_submissions where title = '${tituloSql}';`)).toBe('publicado');
    const publicadas = psqlLocal(
      `select count(*) from public.questions qq join public.question_submissions s on qq.id = any(s.published_question_ids) ` +
        `where s.title = '${tituloSql}' and qq.status = 'published';`,
    );
    expect(publicadas).toBe('2');
    // Ligadas ao material (a de banca real pelo título do arquivo; a autoral pela escolha na tela).
    expect(
      psqlLocal(
        `select count(*) from public.question_materials qm join public.question_submissions s on qm.question_id = any(s.published_question_ids) ` +
          `where s.title = '${tituloSql}' and qm.material_id = '${materialId}';`,
      ),
    ).toBe('2');
    // Proveniência ligada à revisão; a autoral fica sem ano.
    expect(
      psqlLocal(
        `select count(*) from public.question_ai_provenance p join public.question_submissions s on p.question_id = any(s.published_question_ids) ` +
          `join public.material_reviews r on r.id = p.review_id where s.title = '${tituloSql}' and p.review_verdict = 'apto' and r.question_submission_id = s.id;`,
      ),
    ).toBe('2');
    expect(
      psqlLocal(
        `select coalesce(qq.year::text, 'sem ano') from public.questions qq join public.question_submissions s on qq.id = any(s.published_question_ids) ` +
          `where s.title = '${tituloSql}' and qq.institution = 'NexusMed (questão autoral)';`,
      ),
    ).toBe('sem ano');
    // Uma segunda passada do servidor não cria questões de novo.
    await rodarServidorDoRevisor({ ciclos: 1 });
    expect(
      psqlLocal(
        `select count(*) from public.questions qq join public.question_submissions s on qq.id = any(s.published_question_ids) where s.title = '${tituloSql}';`,
      ),
    ).toBe('2');

    // 3. "Meus envios" mostra "Publicado" e abre as questões; o estudante responde uma delas e vê o selo.
    await page.reload();
    await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
    if (!(await page.locator('#enviar-material-view').isVisible())) {
      await page.locator('#btn-user-profile-menu').click();
      await page.locator('#nav-enviar-material').click();
    }
    const item = page.locator('#meus-envios-lista > li', { hasText: nome });
    await expect(item).toContainText('Publicado');
    await expect(item.getByTestId('questoes-publicadas')).toHaveText('2 questões publicadas.');
    await item.getByRole('button', { name: 'Abrir as questões publicadas' }).click();

    await expect(page.locator('#questions-testar-scope')).toContainText('2 questões');
    const card = page.locator('[data-answer-origin]').first();
    await expect(card.getByTestId('selo-da-questao')).toHaveText('Revisado por IA — ainda não lido por uma pessoa');
    await card.getByText('Obstrutivo', { exact: false }).first().click();
    await card.getByRole('button', { name: 'Confirmar Resposta' }).click();
    await expect(card).toHaveAttribute('data-answer-origin', 'session', { timeout: 15_000 });

    // 4. Reporta um erro na questão (o "Reportar erro" da Área Editorial, com limite no banco).
    await card.getByTestId('btn-reportar-erro-da-questao').click();
    const dialogo = page.getByRole('dialog', { name: 'Reportar erro nesta questão' });
    await expect(dialogo).toBeVisible();
    await dialogo.getByLabel(/O que está errado/).fill('A explicação da alternativa A está incompleta.');
    await dialogo.getByRole('button', { name: 'Enviar reporte' }).click();
    await expect(dialogo.getByTestId('reporte-enviado')).toContainText('vai conferir a questão');
    expect(
      psqlLocal(
        `select r.reporter_id || '|' || r.status from public.material_error_reports r ` +
          `join public.question_submissions s on r.question_id = any(s.published_question_ids) where s.title = '${tituloSql}';`,
      ),
    ).toBe(`${autor.id}|aberto`);

    // 5. O admin vê o erro da questão na Área Editorial, junto dos de material, e o marca como resolvido.
    const contextoAdmin = await browser.newContext();
    cleanup.push(() => contextoAdmin.close());
    const paginaAdmin = await contextoAdmin.newPage();
    await login(paginaAdmin, admin, '/#/admin');
    await paginaAdmin.locator('#admin-tab-erros').click();
    const linha = paginaAdmin.locator('#admin-erros-lista li', { hasText: 'A explicação da alternativa A está incompleta.' });
    await expect(linha).toContainText('Questão:');
    await expect(linha).toContainText('Aberto');
    await linha.getByRole('button', { name: 'Marcar como resolvido' }).click();
    await expect(linha).toContainText('Resolvido');

    // 6. E a aba de envios do admin lista o lote (tipo questões).
    await paginaAdmin.locator('#admin-tab-envios').click();
    const lote = paginaAdmin.locator('#admin-envios-lista li[data-tipo="questoes"]', { hasText: nome });
    await expect(lote).toContainText('Publicado');
    await expect(lote).toContainText('por h2-autor');
    // P8: o admin publica daqui; o lote já publicado não tem botão de publicar.
    await expect(lote.getByTestId('publicar-envio')).toHaveCount(0);
  });

  test('revisão "não apto": nada é publicado, o autor vê os achados, corrige e o texto corrigido volta à revisão e é publicado', async ({ page }) => {
    const { disciplina, tema } = catalogoDoSeed();
    const tag = `${Date.now()}`;
    const tituloMaterial = `${MATERIAL_PREFIX}h2n-${tag}`;
    insertPublishedMaterial(`h2n-${tag}`);
    cleanup.push(() => deleteE2EMaterials());
    const autor = await novoUsuario('h2-corrige', 'admin');
    const nome = `Lote H2 corrigido ${tag}`;
    const tituloSql = q(nome);

    await login(page, autor);
    await abrirEnvioDeQuestoes(page);
    await page.locator('#envio-questoes-texto').fill(loteParaEnvio(1, { disciplina, tema, materiais: tituloMaterial }));
    await expect(page.locator('#envio-questoes-resultado')).toContainText('Arquivo aceito');
    await page.locator('#envio-questoes-nome').fill(nome);
    await page.locator('#btn-enviar-questoes').click();
    await expect(page.locator('#envio-questoes-sucesso')).toContainText(nome);

    const resumos = await rodarServidorDoRevisor({ veredito: 'nao_apto', ciclos: 2 });
    expect(resumos.flatMap((r) => r.erros)).toEqual([]);
    expect(psqlLocal(`select status from public.question_submissions where title = '${tituloSql}';`)).toBe('nao_apto');
    expect(
      psqlLocal(`select count(*) from public.question_submissions where title = '${tituloSql}' and cardinality(published_question_ids) > 0;`),
    ).toBe('0');

    // O autor vê o veredito, os achados e o botão de corrigir.
    await page.reload();
    await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
    if (!(await page.locator('#enviar-material-view').isVisible())) {
      await page.locator('#btn-user-profile-menu').click();
      await page.locator('#nav-enviar-material').click();
    }
    const item = page.locator('#meus-envios-lista > li', { hasText: nome });
    await expect(item).toContainText('Precisa de correção');
    await item.getByText('Ver a revisão').click();
    await expect(item.getByTestId('revisao-do-envio')).toContainText('o dado não confere com a fonte');
    await expect(item.getByTestId('bloco-de-correcao')).toContainText('Corrija o material conforme os achados abaixo');
    await item.getByRole('button', { name: 'Corrigir e enviar de novo' }).click();

    // A correção: o texto novo substitui o antigo e o envio volta para a revisão.
    await expect(page.getByRole('heading', { name: `Corrigir o envio “${nome}”` })).toBeVisible();
    await expect(page.locator('#envio-questoes-nome')).toHaveValue(nome);
    // O material só estava citado no arquivo (nenhum escolhido na tela): a correção começa igual.
    await expect(page.locator('#envio-questoes-materiais').getByLabel(tituloMaterial)).not.toBeChecked();
    await page
      .locator('#envio-questoes-texto')
      .fill(loteParaEnvio(1, { disciplina, tema, materiais: tituloMaterial, comentario: 'Resumo corrigido. Fonte: [GOLD 2024](https://goldcopd.org/2024).' }));
    await expect(page.locator('#envio-questoes-resultado')).toContainText('Arquivo aceito');
    await page.locator('#btn-enviar-questoes').click();
    await expect(page.locator('#envio-questoes-sucesso')).toContainText(nome);
    expect(psqlLocal(`select status from public.question_submissions where title = '${tituloSql}';`)).toBe('aguardando_revisao');
    await expect(page.locator('#meus-envios-lista > li', { hasText: nome })).toContainText('Aguardando revisão');
    // A revisão do texto antigo não vale para o novo.
    expect(
      psqlLocal(
        `select count(*) from public.material_reviews r join public.question_submissions s on s.id = r.question_submission_id ` +
          `where s.title = '${tituloSql}' and r.content_sha256 = s.content_sha256;`,
      ),
    ).toBe('0');

    // Agora o revisor aprova o texto corrigido e o servidor publica.
    const segunda = await rodarServidorDoRevisor({ veredito: 'apto', ciclos: 2 });
    expect(segunda.flatMap((r) => r.erros)).toEqual([]);
    expect(psqlLocal(`select status from public.question_submissions where title = '${tituloSql}';`)).toBe('publicado');
    expect(
      psqlLocal(
        `select count(*) from public.questions qq join public.question_submissions s on qq.id = any(s.published_question_ids) ` +
          `where s.title = '${tituloSql}' and qq.status = 'published';`,
      ),
    ).toBe('1');
  });

  test('lote com título de material ambíguo: o servidor não publica nada e o autor recebe o motivo em palavras leigas', async ({ page }) => {
    const { disciplina, tema } = catalogoDoSeed();
    const tag = `${Date.now()}`;
    const tituloRepetido = `${MATERIAL_PREFIX}h2-igual-${tag}`;
    // Dois materiais publicados com o MESMO título: o servidor não sabe qual é.
    insertPublishedMaterial(`h2-igual-${tag}`);
    insertPublishedMaterial(`h2-igual-${tag}`);
    cleanup.push(() => deleteE2EMaterials());
    const autor = await novoUsuario('h2-ambiguo', 'admin');
    const nome = `Lote ambíguo ${tag}`;

    await login(page, autor);
    await abrirEnvioDeQuestoes(page);
    await page.locator('#envio-questoes-texto').fill(loteParaEnvio(1, { disciplina, tema, materiais: tituloRepetido }));
    await expect(page.locator('#envio-questoes-resultado')).toContainText('Arquivo aceito');
    await page.locator('#envio-questoes-nome').fill(nome);
    await page.locator('#btn-enviar-questoes').click();
    await expect(page.locator('#envio-questoes-sucesso')).toContainText(nome);

    const resumos = await rodarServidorDoRevisor({ veredito: 'apto', ciclos: 2 });
    expect(resumos.flatMap((r) => r.erros)).toEqual([]);
    expect(psqlLocal(`select status from public.question_submissions where title = '${q(nome)}';`)).toBe('nao_apto');
    expect(psqlLocal(`select cardinality(published_question_ids) from public.question_submissions where title = '${q(nome)}';`)).toBe('0');

    await page.reload();
    await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
    if (!(await page.locator('#enviar-material-view').isVisible())) {
      await page.locator('#btn-user-profile-menu').click();
      await page.locator('#nav-enviar-material').click();
    }
    const item = page.locator('#meus-envios-lista > li', { hasText: nome });
    await expect(item).toContainText('Precisa de correção');
    await expect(item.getByTestId('recado-do-servidor')).toContainText('pertence a mais de um material publicado');
  });
});
