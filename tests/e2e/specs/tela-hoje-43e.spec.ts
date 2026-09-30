import { test, expect, type Page } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  deleteE2EMaterials,
  getSeedIds,
  insertFlashcardForUser,
  insertPublishedMaterial,
  countFlashcardReviews,
  psqlLocal,
  runCleanup,
  MATERIAL_PREFIX,
  type CreatedTestUser,
} from '../fixtures/localSupabase';

// Unidade 43-E, contra o Supabase local de verdade: a tela "Hoje" é a entrada
// do estudante ativo (sem tirar do reload a restauração da última tela, 22-A),
// abre pelo menu, mostra continuar lendo / testar o que li / cards para hoje —
// cada um levando à tela certa — e, com tudo feito no dia, diz isso. Sem rede,
// avisa e nunca diz que está tudo feito.

const STEM_PREFIX = 'e2e-43e-';

async function login(page: Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

async function abrirMaterial(page: Page, title: string) {
  await page.locator('#dock-nav-resources').click();
  await page.locator('#dock-resources-compendiums').click();
  await page.getByRole('button', { name: 'Modo árvore' }).click();
  await page.getByRole('button', { name: title, exact: true }).first().click();
}

/** Questão publicada no tema do seed, cobrando os materiais dados. Gabarito: A ("Certa"). */
function insertPublishedQuestion(stem: string, materialIds: string[]): string {
  const seed = getSeedIds();
  const id = psqlLocal(
    `insert into public.questions (discipline_id, theme_id, cycle, difficulty, institution, year, clinical_vignette, question_stem, tags) ` +
      `values ('${seed.disciplineId}', '${seed.themeId}', 'clinico', 'medio', 'E2E', 2026, 'Vinheta 43-E.', '${STEM_PREFIX}${stem}', array['e2e']) returning id;`
  )
    .split('\n')[0]
    .trim();
  psqlLocal(
    `insert into public.question_options (question_id, letter, option_text, sort_order) values ('${id}', 'A', 'Certa', 0), ('${id}', 'B', 'Errada', 1);`
  );
  psqlLocal(
    `update public.question_option_keys set is_correct = true where option_id = (select id from public.question_options where question_id = '${id}' and letter = 'A');`
  );
  psqlLocal(`insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary) values ('${id}', 'c', 'h');`);
  materialIds.forEach((m, i) =>
    psqlLocal(`insert into public.question_materials (question_id, material_id, sort_order) values ('${id}', '${m}', ${i});`)
  );
  psqlLocal(`update public.questions set status = 'published' where id = '${id}';`);
  return id;
}

/** Progresso de leitura com a data dada (todas as seções lidas). */
function registrarLeitura(userId: string, materialId: string, quando: string) {
  psqlLocal(
    `insert into public.reading_progress (user_id, material_id, read_section_ids, percent, updated_at) ` +
      `select '${userId}', '${materialId}', array_agg(id), 100, ${quando} from public.material_sections where material_id = '${materialId}';`
  );
}

function deleteE2EQuestions(): void {
  psqlLocal(`update public.questions set status = 'draft' where question_stem like '${STEM_PREFIX}%' and status = 'published';`);
  psqlLocal(`delete from public.questions where question_stem like '${STEM_PREFIX}%';`);
}

const hoje = (page: Page) => page.locator('#hoje-view');
const tudoFeito = (page: Page) => page.getByText('Tudo feito por hoje');

test.describe('43-E — Tela "Hoje"', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
  });

  async function criarEstudante(nome: string): Promise<CreatedTestUser> {
    const user = await createTestUser({
      emailLocalPart: `e2e-43e-${nome}-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'student',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(user.id));
    return user;
  }

  test('o estudante ativo que entra cai em Hoje; sem nada pendente, a tela diz que está tudo feito', async ({ page }) => {
    const student = await criarEstudante('entrada');
    await login(page, student);

    await expect(hoje(page)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Hoje', level: 1 })).toBeVisible();
    await expect(page.locator('#nav-today')).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveURL(/#\/today$/);
    await expect(tudoFeito(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Testar o que li' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Revisar \d+ cards?$/ })).toHaveCount(0);
  });

  test('Hoje abre pelo menu (desktop e celular) e Início continua sendo outra tela', async ({ page }) => {
    const student = await criarEstudante('menu');
    await login(page, student);

    await page.locator('#nav-dashboard').click();
    await expect(hoje(page)).toHaveCount(0);
    await expect(page.locator('#nav-dashboard')).toHaveAttribute('aria-current', 'page');

    await page.locator('#nav-today').click();
    await expect(hoje(page)).toBeVisible();
    await expect(page.locator('#nav-dashboard')).not.toHaveAttribute('aria-current', 'page');

    // O logotipo também leva a Hoje.
    await page.locator('#nav-dashboard').click();
    await page.getByRole('button', { name: /NexusMed/ }).first().click();
    await expect(hoje(page)).toBeVisible();

    // Notebook estreito (1024px): o item Hoje do topo só aparece a partir de
    // 1280px para não estourar a barra (que cabia em 1024px sem ele); o dock,
    // presente em toda largura, leva a Hoje.
    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(page.locator('#nav-today')).toBeHidden();
    const navExcede = await page.evaluate(() => {
      const nav = document.getElementById('header-main-nav')!;
      return nav.scrollWidth - nav.clientWidth;
    });
    expect(navExcede).toBeLessThanOrEqual(0);
    await page.locator('#dock-nav-dashboard').click();
    await expect(hoje(page)).toHaveCount(0);
    await page.locator('#dock-nav-today').click();
    await expect(hoje(page)).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator('#nav-today')).toBeVisible();

    // Celular: o dock tem Hoje e a tela cabe na largura, sem rolagem lateral.
    await page.setViewportSize({ width: 360, height: 740 });
    await page.locator('#dock-nav-dashboard').click();
    await expect(hoje(page)).toHaveCount(0);
    await page.locator('#dock-nav-today').click();
    await expect(hoje(page)).toBeVisible();
    await expect(page.locator('#dock-nav-today')).toHaveAttribute('aria-current', 'page');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const dock = (await page.locator('#mobile-floating-dock').boundingBox())!;
    expect(dock.x).toBeGreaterThanOrEqual(0);
    expect(dock.x + dock.width).toBeLessThanOrEqual(360);
  });

  test('recarregar volta à última tela (22-A); abrir de novo, em aba nova, entra por Hoje', async ({ page, context }) => {
    const student = await criarEstudante('reload');
    await login(page, student);
    await expect(hoje(page)).toBeVisible();

    await page.locator('#nav-thematic-study').click();
    await expect(page.locator('#thematic-study-view')).toBeVisible();

    await page.reload();
    await expect(page.locator('#thematic-study-view')).toBeVisible({ timeout: 20_000 });
    await expect(hoje(page)).toHaveCount(0);

    // Aba nova, já autenticada, sem link direto: a última tela salva não vale,
    // a entrada é Hoje.
    const outraAba = await context.newPage();
    await outraAba.goto('/');
    await expect(outraAba.locator('#hoje-view')).toBeVisible({ timeout: 20_000 });
    await expect(outraAba.locator('#thematic-study-view')).toHaveCount(0);
    await outraAba.close();
  });

  test('leu hoje, tem questão e card vencido: as três frentes aparecem, cada botão leva à tela certa e o dia fecha', async ({ page }) => {
    const t = `${Date.now()}`;
    const titulo = `${MATERIAL_PREFIX}43e-A-${t}`;
    const seed = getSeedIds();
    const materialId = insertPublishedMaterial(`43e-A-${t}`);
    cleanup.push(() => deleteE2EQuestions());
    cleanup.push(() => deleteE2EMaterials());
    insertPublishedQuestion('cobra o material lido', [materialId]);

    const student = await criarEstudante('dia');
    registrarLeitura(student.id, materialId, 'now()');
    const cardId = insertFlashcardForUser(student.id, seed, { materialId: null, isCustom: false, front: 'Card 43-E do dia' });
    cleanup.push(() => {
      psqlLocal(`delete from public.flashcards where user_id = '${student.id}';`);
    });

    await login(page, student);
    await expect(hoje(page)).toBeVisible();

    // Testar o que li e Cards para hoje vêm do servidor; Continuar lendo só
    // aparece depois de abrir o material (a sessão de leitura é do aparelho).
    await expect(page.getByRole('region', { name: 'Testar o que li' })).toContainText('1 questão dos materiais que você leu hoje');
    await expect(page.getByRole('region', { name: 'Cards para hoje' })).toContainText('1 card para hoje');
    await expect(page.getByRole('region', { name: 'Continuar lendo' })).toHaveCount(0);
    await expect(tudoFeito(page)).toHaveCount(0);

    // Continuar lendo: abre o material.
    await abrirMaterial(page, titulo);
    // Espera o leitor montar: é ele que grava a sessão de leitura.
    await expect(page.getByRole('heading', { name: 'Seção de teste 22-A' }).first()).toBeVisible({ timeout: 15_000 });
    await page.locator('#nav-today').click();
    const continuar = page.getByRole('region', { name: 'Continuar lendo' });
    await expect(continuar).toContainText(titulo);
    await expect(continuar).toContainText('Você parou em: Seção de teste 22-A');
    await continuar.getByRole('button', { name: 'Continuar lendo' }).click();
    await expect(hoje(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Seção de teste 22-A' }).first()).toBeVisible({ timeout: 15_000 });

    // Testar o que li: abre o modal da 43-C com o material lido; responder certo
    // tira o teste de Hoje (a questão foi respondida hoje).
    await page.locator('#nav-today').click();
    await page.getByRole('region', { name: 'Testar o que li' }).getByRole('button', { name: 'Testar o que li' }).click();
    const modal = page.getByRole('dialog', { name: 'Testar o que li' });
    await expect(modal.getByRole('checkbox', { name: titulo })).toBeChecked();
    await expect(modal.getByText('1 questão disponível')).toBeVisible();
    await modal.getByRole('button', { name: 'Começar' }).click();
    const cartao = page.locator('[data-answer-origin]').first();
    await expect(cartao).toContainText(`${STEM_PREFIX}cobra o material lido`);
    await cartao.getByText('Certa', { exact: true }).first().click();
    await cartao.getByRole('button', { name: 'Confirmar Resposta' }).click();
    await expect(cartao).toHaveAttribute('data-answer-origin', 'session', { timeout: 15_000 });

    await page.locator('#nav-today').click();
    await expect(page.getByRole('region', { name: 'Cards para hoje' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Testar o que li' })).toHaveCount(0);
    await expect(tudoFeito(page)).toHaveCount(0);

    // Cards para hoje: abre a revisão só com o card vencido; ao terminar,
    // volta a Hoje e o dia está fechado.
    await page.getByRole('button', { name: 'Revisar 1 card' }).click();
    await expect(page.getByText('Card 43-E do dia')).toBeVisible();
    await page.getByText('Revelar Resposta').click();
    await page.getByText('3. Bom').click();
    await expect(page.getByText('Sessão de Revisão Concluída!')).toBeVisible();
    expect(countFlashcardReviews(cardId)).toBe(1);
    await page.getByText('Voltar ao Painel de Flashcards').click();

    await expect(hoje(page)).toBeVisible();
    await expect(tudoFeito(page)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Cards para hoje' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Testar o que li' })).toHaveCount(0);
    // Continuar lendo segue disponível: retomar não é pendência.
    await expect(page.getByRole('region', { name: 'Continuar lendo' })).toBeVisible();
  });

  test('leitura de ontem não gera teste em Hoje', async ({ page }) => {
    const t = `${Date.now()}`;
    const materialId = insertPublishedMaterial(`43e-B-${t}`);
    cleanup.push(() => deleteE2EQuestions());
    cleanup.push(() => deleteE2EMaterials());
    insertPublishedQuestion('cobra o material de ontem', [materialId]);

    const student = await criarEstudante('ontem');
    registrarLeitura(student.id, materialId, "now() - interval '2 days'");

    await login(page, student);
    await expect(tudoFeito(page)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Testar o que li' })).toHaveCount(0);
  });

  test('sem conexão, Hoje avisa e não diz que está tudo feito; com a conexão de volta, carrega', async ({ page }) => {
    const student = await criarEstudante('rede');
    await login(page, student);
    await expect(tudoFeito(page)).toBeVisible();

    await page.locator('#nav-dashboard').click();
    await page.route('**/rest/v1/**', (route) => route.abort('internetdisconnected'));
    await page.locator('#nav-today').click();

    await expect(hoje(page)).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Sem conexão' })).toHaveCount(1, { timeout: 15_000 });
    await expect(tudoFeito(page)).toHaveCount(0);

    await page.unroute('**/rest/v1/**');
    await page.getByRole('button', { name: 'Tentar agora' }).click();
    await expect(tudoFeito(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('status').filter({ hasText: 'Sem conexão' })).toHaveCount(0);
  });
});
