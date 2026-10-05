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
import { materialParaEnvio } from '../fixtures/materialParaEnvio';
import { loteParaEnvio } from '../fixtures/questoesParaEnvio';

// P8 — o dono publica o envio com um clique, depois do parecer do revisor (que só aconselha). Contra o app real (build
// de teste) e o Supabase local: o texto do envio é lido pelo importador da tela e publicado pela função do banco que só
// o admin executa. Os envios e os pareceres são gravados direto no banco (o revisor local é provado em outro lugar).

async function login(page: Page, user: CreatedTestUser, path = '/') {
  await page.goto(path);
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

function catalogoDoSeed(): { disciplina: string; tema: string; disciplineId: string; themeId: string } {
  const seed = getSeedIds();
  return {
    disciplineId: seed.disciplineId,
    themeId: seed.themeId,
    disciplina: psqlLocal(`select name from public.disciplines where id = '${seed.disciplineId}';`),
    tema: psqlLocal(`select name from public.themes where id = '${seed.themeId}';`),
  };
}

const q = (s: string) => s.replace(/'/g, "''");

/** O revisor local já deu o parecer (como ele grava): uma revisão concluída do texto atual do envio. */
function darParecer(submissionId: string, veredito: 'apto' | 'nao_apto'): void {
  psqlLocal(
    `insert into public.material_reviews (submission_id, content_sha256, status, verdict, findings_text, model, completed_at) ` +
      `select id, content_sha256, 'concluida', '${veredito}', 'Achados de teste do revisor.', 'claude-opus-5-5', now() ` +
      `from public.material_submissions where id = '${submissionId}';`,
  );
}

function enviarMaterial(autorId: string, titulo: string, texto: string, status: string, destino: { disciplineId: string; themeId: string }): string {
  return psqlLocal(
    `insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md, status) ` +
      `values ('${autorId}', '${q(titulo)}', '${destino.disciplineId}', '${destino.themeId}', $md$${texto}$md$, '${status}') returning id;`,
  )
    .split('\n')[0]
    .trim();
}

/** As questões que a tela publicou para os envios desta pessoa: saem do ar e são apagadas (só o postgres apaga questão publicada). */
function apagarQuestoesPublicadasDe(userId: string): void {
  const ids = `(select unnest(published_question_ids) from public.question_submissions where author_id = '${userId}')`;
  psqlLocal(`update public.questions set status = 'draft' where id in ${ids} and status = 'published';`);
  psqlLocal(`delete from public.questions where id in ${ids};`);
}

test.describe('O dono publica o envio pela aba Envios (P8)', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
  });

  async function novoAdmin(prefixo: string) {
    const user = await createTestUser({ emailLocalPart: `${prefixo}-${Date.now()}`, password: 'senha-teste-123', role: 'admin', status: 'active' });
    cleanup.push(() => deleteTestUser(user.id));
    // As questões publicadas saem ANTES de o usuário (e os envios dele) serem apagados.
    cleanup.unshift(() => apagarQuestoesPublicadasDe(user.id));
    return user;
  }

  async function abrirEnvios(page: Page, admin: CreatedTestUser) {
    await login(page, admin, '/#/admin');
    await page.locator('#admin-tab-envios').click();
    await expect(page.locator('#admin-envios-lista')).toBeVisible();
  }

  test('material: parecer "não apto" pede confirmação e publica sem selo; parecer "apto" publica com um clique, com selo; a atualização é aplicada pelo mesmo botão', async ({ page }) => {
    const destino = catalogoDoSeed();
    const tag = `${Date.now()}`;
    const tituloNao = `P8 nao apto ${tag}`;
    const tituloApto = `P8 apto ${tag}`;
    const admin = await novoAdmin('p8-admin');
    // MAT-1: aplicar a atualização grava o histórico da seção (`changed_by` aponta para o admin): os materiais saem ANTES
    // do usuário (AGENTS.md, item 18; `runCleanup` roda na ordem dada).
    cleanup.unshift(() => {
      psqlLocal(`delete from public.materials where title in ('${q(tituloNao)}', '${q(tituloApto)}');`);
    });

    const idNao = enviarMaterial(admin.id, tituloNao, materialParaEnvio({ titulo: tituloNao, disciplina: destino.disciplina, tema: destino.tema }), 'nao_apto', destino);
    darParecer(idNao, 'nao_apto');
    const idApto = enviarMaterial(admin.id, tituloApto, materialParaEnvio({ titulo: tituloApto, disciplina: destino.disciplina, tema: destino.tema }), 'apto', destino);
    darParecer(idApto, 'apto');

    await abrirEnvios(page, admin);

    // 1. "Não apto": o parecer aparece ao lado do botão; o botão pede confirmação; "Cancelar" não publica.
    const itemNao = page.locator('#admin-envios-lista > li', { hasText: tituloNao });
    await expect(itemNao.getByTestId('parecer-do-revisor')).toContainText('não apto');
    await itemNao.getByTestId('publicar-envio').click();
    await expect(itemNao.getByTestId('confirmar-publicacao')).toContainText('sem o selo “Revisado por IA”');
    await itemNao.getByTestId('cancelar-publicar').click();
    expect(psqlLocal(`select count(*) from public.materials where title = '${q(tituloNao)}';`)).toBe('0');
    await itemNao.getByTestId('publicar-envio').click();
    await itemNao.getByTestId('confirmar-publicar').click();
    await expect(itemNao.getByTestId('resultado-da-publicacao')).toHaveText('Material publicado.');
    await expect(itemNao).toContainText('Publicado');
    expect(psqlLocal(`select status from public.materials where title = '${q(tituloNao)}';`)).toBe('published');
    expect(
      psqlLocal(
        `select count(*) from public.material_ai_provenance p join public.materials m on m.id = p.material_id where m.title = '${q(tituloNao)}';`,
      ),
    ).toBe('0');
    expect(psqlLocal(`select status from public.material_submissions where id = '${idNao}';`)).toBe('publicado');
    // O material está no ar e abre pelo botão da lista, sem o selo "Revisado por IA".
    await itemNao.getByRole('button', { name: 'Abrir o material publicado' }).click();
    await expect(page.getByRole('heading', { level: 1, name: tituloNao })).toBeVisible();
    await expect(page.getByTestId('selo-de-revisao')).toHaveCount(0);

    // 2. "Apto": um clique, sem confirmação, e o selo existe.
    await page.goto('/#/admin');
    await page.locator('#admin-tab-envios').click();
    const itemApto = page.locator('#admin-envios-lista > li', { hasText: tituloApto });
    await expect(itemApto.getByTestId('parecer-do-revisor')).toContainText('apto');
    await itemApto.getByTestId('publicar-envio').click();
    await expect(itemApto.getByTestId('resultado-da-publicacao')).toHaveText('Material publicado.');
    await expect(itemApto.getByTestId('confirmar-publicacao')).toHaveCount(0);
    expect(
      psqlLocal(
        `select p.review_verdict from public.material_ai_provenance p join public.materials m on m.id = p.material_id where m.title = '${q(tituloApto)}';`,
      ),
    ).toBe('apto');
    await itemApto.getByRole('button', { name: 'Abrir o material publicado' }).click();
    await expect(page.getByRole('heading', { level: 1, name: tituloApto })).toBeVisible();
    await expect(page.getByTestId('selo-de-revisao')).toHaveText('Revisado por IA — ainda não lido por uma pessoa');

    // 3. Atualização do material "apto" que ainda aguarda a revisão: "Aplicar atualização" (com confirmação), troca o conteúdo
    //    e o selo some (o conteúdo no ar já não é o que o revisor aprovou).
    const materialId = psqlLocal(`select id from public.materials where title = '${q(tituloApto)}';`);
    const secaoAntes = psqlLocal(`select id from public.material_sections where material_id = '${materialId}' and title = 'Primeira seção';`);
    const tituloAtualizacao = `Atualização ${tag}`;
    const textoNovo = materialParaEnvio({
      titulo: tituloApto,
      disciplina: destino.disciplina,
      tema: destino.tema,
      corpo: 'Texto NOVO da atualização [1](#ref-1) e [2](#ref-2).',
    });
    const idAtualizacao = psqlLocal(
      `insert into public.material_submissions (author_id, title, content_md, status, target_material_id) ` +
        `values ('${admin.id}', '${q(tituloAtualizacao)}', $md$${textoNovo}$md$, 'aguardando_revisao', '${materialId}') returning id;`,
    )
      .split('\n')[0]
      .trim();
    await page.goto('/#/admin');
    await page.locator('#admin-tab-envios').click();
    const itemAtualizacao = page.locator('#admin-envios-lista > li', { hasText: tituloAtualizacao });
    await expect(itemAtualizacao.getByTestId('parecer-do-revisor')).toContainText('ainda sem parecer');
    await itemAtualizacao.getByTestId('publicar-envio').click();
    await itemAtualizacao.getByTestId('confirmar-publicar').click();
    await expect(itemAtualizacao.getByTestId('resultado-da-publicacao')).toContainText('Atualização aplicada');
    expect(psqlLocal(`select content from public.material_sections where material_id = '${materialId}' and title = 'Primeira seção';`)).toContain(
      'Texto NOVO da atualização',
    );
    // O id da seção casada pelo título é o mesmo (anotações, progresso e questões continuam).
    expect(psqlLocal(`select id from public.material_sections where material_id = '${materialId}' and title = 'Primeira seção';`)).toBe(secaoAntes);
    expect(psqlLocal(`select app.material_tem_revisao_apto('${materialId}'::uuid);`)).toBe('f');
    expect(psqlLocal(`select status from public.material_submissions where id = '${idAtualizacao}';`)).toBe('publicado');
    await itemAtualizacao.getByRole('button', { name: 'Abrir o material publicado' }).click();
    await expect(page.getByRole('heading', { level: 1, name: tituloApto })).toBeVisible();
    await expect(page.getByTestId('selo-de-revisao')).toHaveCount(0);
  });

  test('questões: o lote que ainda aguarda a revisão é publicado, ligado ao material, depois da confirmação', async ({ page }) => {
    const destino = catalogoDoSeed();
    const tag = `${Date.now()}`;
    const admin = await novoAdmin('p8-questoes');
    insertPublishedMaterial(`p8q-${tag}`);
    cleanup.push(() => deleteE2EMaterials());
    const tituloDoMaterial = `${MATERIAL_PREFIX}p8q-${tag}`;
    const nome = `Lote P8 ${tag}`;
    const idLote = psqlLocal(
      `insert into public.question_submissions (author_id, title, content_md, material_ids, status) ` +
        `values ('${admin.id}', '${q(nome)}', $md$${loteParaEnvio(2, { disciplina: destino.disciplina, tema: destino.tema, materiais: tituloDoMaterial })}$md$, '{}', 'aguardando_revisao') returning id;`,
    )
      .split('\n')[0]
      .trim();

    await abrirEnvios(page, admin);
    const lote = page.locator('#admin-envios-lista li[data-tipo="questoes"]', { hasText: nome });
    await expect(lote.getByTestId('parecer-do-revisor')).toContainText('ainda sem parecer');
    await lote.getByTestId('publicar-envio').click();
    await expect(lote.getByTestId('confirmar-publicacao')).toBeVisible();
    await lote.getByTestId('confirmar-publicar').click();
    await expect(lote.getByTestId('resultado-da-publicacao')).toHaveText('2 questões publicadas.');
    await expect(lote).toContainText('Publicado');
    expect(
      psqlLocal(`select count(*) from public.questions where status = 'published' and id in (select unnest(published_question_ids) from public.question_submissions where id = '${idLote}');`),
    ).toBe('2');
    expect(
      psqlLocal(
        `select count(*) from public.question_materials qm join public.materials m on m.id = qm.material_id ` +
          `where m.title = '${q(tituloDoMaterial)}' and qm.question_id in (select unnest(published_question_ids) from public.question_submissions where id = '${idLote}');`,
      ),
    ).toBe('2');
    // Sem parecer "apto": nenhuma questão tem a proveniência de IA.
    expect(
      psqlLocal(`select count(*) from public.question_ai_provenance where submission_id = '${idLote}';`),
    ).toBe('0');
    expect(psqlLocal(`select status from public.question_submissions where id = '${idLote}';`)).toBe('publicado');
  });
});
