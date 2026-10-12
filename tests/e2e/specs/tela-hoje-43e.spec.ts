import { test, expect, type Page } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  deleteE2EMaterials,
  getSeedIds,
  insertPublishedMaterial,
  psqlLocal,
  runCleanup,
  MATERIAL_PREFIX,
  type CreatedTestUser,
} from '../fixtures/localSupabase';

// Unidade 43-E, ajustada na PAINEL-2 (D-14), contra o Supabase local de verdade: a antiga tela "Hoje" deixou de
// existir e o Início é a entrada do estudante ativo (sem tirar do reload a restauração da última tela, 22-A).
// Abre pelo menu, mostra "Continuar lendo" e o atalho "Testar o que li" — cada um levando à tela certa — e, sem
// rede, avisa e nunca afirma número nenhum. (Os cards para hoje saíram na CORTE-1, D-14.)

const STEM_PREFIX = 'e2e-43e-';

async function login(page: Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
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

const inicio = (page: Page) => page.locator('#painel-view');
const bloco = (page: Page, nome: string) => page.locator(`#painel-view [data-painel-bloco="${nome}"]`);

test.describe('43-E / PAINEL-2 — o Início é a tela de entrada', () => {
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

  test('o estudante ativo que entra cai no Início, sem "Hoje" nem "Meu desempenho" em lugar nenhum', async ({ page }) => {
    const student = await criarEstudante('entrada');
    await login(page, student);

    await expect(inicio(page)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Início', level: 1 })).toBeVisible();
    await expect(page.locator('#nav-dashboard')).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveURL(/#\/dashboard$/);
    await expect(page.getByRole('button', { name: 'Testar o que li' })).toBeVisible();
    await expect(page.getByText(/(?<!\p{L})(cards?|cartões|cartão)(?!\p{L})/iu)).toHaveCount(0);
    for (const antigo of ['#nav-today', '#nav-resources', '#dock-nav-today', '#dock-nav-resources']) {
      await expect(page.locator(antigo)).toHaveCount(0);
    }
    await expect(page.getByText(/^Hoje$|Meu desempenho/)).toHaveCount(0);
  });

  test('o menu é Início, Biblioteca e Questões (topo e celular), cabe sem rolagem lateral e o logotipo volta ao Início', async ({
    page,
  }) => {
    const student = await criarEstudante('menu');
    await login(page, student);

    await expect(page.locator('#header-main-nav').getByRole('button')).toHaveText(['Início', 'Biblioteca', 'Questões']);
    await expect(page.locator('#mobile-floating-dock').getByRole('button')).toHaveText(['Início', 'Biblioteca', 'Questões']);

    await page.locator('#nav-questions').click();
    await expect(page.locator('#nav-questions')).toHaveAttribute('aria-current', 'page');
    await expect(inicio(page)).toHaveCount(0);
    await page.locator('#nav-dashboard').click();
    await expect(inicio(page)).toBeVisible();
    await expect(page.locator('#nav-dashboard')).toHaveAttribute('aria-current', 'page');

    // O logotipo também leva ao Início.
    await page.locator('#nav-compendiums').click();
    await expect(inicio(page)).toHaveCount(0);
    await page.getByRole('button', { name: /NexusMed/ }).first().click();
    await expect(inicio(page)).toBeVisible();

    // Notebook e tablet estreitos: a barra do topo cabe na largura (sem estourar a janela).
    for (const largura of [768, 900, 1024]) {
      await page.setViewportSize({ width: largura, height: 800 });
      const sobra = await page.evaluate(() => {
        const nav = document.getElementById('header-main-nav')!;
        const header = document.querySelector('header')!;
        return {
          nav: nav.scrollWidth - nav.clientWidth,
          header: header.scrollWidth - header.clientWidth,
          pagina: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      expect(sobra.nav, `barra do topo estoura em ${largura}px`).toBeLessThanOrEqual(0);
      expect(sobra.header, `cabeçalho estoura em ${largura}px`).toBeLessThanOrEqual(0);
      expect(sobra.pagina, `rolagem lateral em ${largura}px`).toBeLessThanOrEqual(0);
    }

    // Celular: o dock tem os três botões e a tela cabe na largura, sem rolagem lateral.
    await page.setViewportSize({ width: 360, height: 740 });
    await page.locator('#dock-nav-questions').click();
    await expect(inicio(page)).toHaveCount(0);
    await page.locator('#dock-nav-dashboard').click();
    await expect(inicio(page)).toBeVisible();
    await expect(page.locator('#dock-nav-dashboard')).toHaveAttribute('aria-current', 'page');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const dock = (await page.locator('#mobile-floating-dock').boundingBox())!;
    expect(dock.x).toBeGreaterThanOrEqual(0);
    expect(dock.x + dock.width).toBeLessThanOrEqual(360);
  });

  test('recarregar volta à última tela (22-A); abrir de novo, em aba nova, entra pelo Início', async ({ page, context }) => {
    const student = await criarEstudante('reload');
    await login(page, student);
    await expect(inicio(page)).toBeVisible();

    await page.locator('#nav-questions').click();
    await expect(page.getByRole('heading', { name: 'Banco de Questões Médicas' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Banco de Questões Médicas' })).toBeVisible({ timeout: 20_000 });
    await expect(inicio(page)).toHaveCount(0);

    // Aba nova, já autenticada, sem link direto: a última tela salva não vale, a entrada é o Início.
    const outraAba = await context.newPage();
    await outraAba.goto('/');
    await expect(outraAba.locator('#painel-view')).toBeVisible({ timeout: 20_000 });
    await expect(outraAba.getByRole('heading', { name: 'Banco de Questões Médicas' })).toHaveCount(0);
    await outraAba.close();
  });

  test('"Continuar lendo" e "Testar o que li": cada botão do Início leva à tela certa, e a resposta aparece em Questões de residência', async ({
    page,
  }) => {
    const t = `${Date.now()}`;
    const titulo = `${MATERIAL_PREFIX}43e-A-${t}`;
    const materialId = insertPublishedMaterial(`43e-A-${t}`);
    cleanup.push(() => deleteE2EQuestions());
    cleanup.push(() => deleteE2EMaterials());
    insertPublishedQuestion('cobra o material lido', [materialId]);

    const student = await criarEstudante('dia');
    registrarLeitura(student.id, materialId, 'now()');

    await login(page, student);
    await expect(inicio(page)).toBeVisible();

    // O material lido aparece em "Minha leitura" como "Lido"; "Continuar lendo" só aparece depois de abrir o
    // material (a sessão de leitura é do aparelho).
    // (A lista começa em "Falta ler", que esconde o material já lido: "Todos" o mostra.)
    const linhaDoMaterial = page.locator(`[data-material-leitura]`).filter({ hasText: titulo });
    await expect(linhaDoMaterial).toHaveCount(0);
    await bloco(page, 'leitura').getByRole('button', { name: 'Todos' }).click();
    await expect(linhaDoMaterial).toContainText('Lido');
    await expect(page.getByRole('region', { name: 'Continuar lendo' })).toHaveCount(0);

    // Abre o material pela lista.
    await linhaDoMaterial.click();
    // Espera o leitor montar: é ele que grava a sessão de leitura.
    await expect(page.getByRole('heading', { name: 'Seção de teste 22-A' }).first()).toBeVisible({ timeout: 15_000 });
    await page.locator('#nav-dashboard').click();
    const continuar = page.getByRole('region', { name: 'Continuar lendo' });
    await expect(continuar).toContainText(titulo);
    await expect(continuar).toContainText('Você parou em: Seção de teste 22-A');
    await continuar.getByRole('button', { name: 'Continuar de onde parei' }).click();
    await expect(inicio(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Seção de teste 22-A' }).first()).toBeVisible({ timeout: 15_000 });

    // Testar o que li: abre o modal da 43-C com o material lido.
    await page.locator('#nav-dashboard').click();
    await page.getByRole('region', { name: 'Atalhos' }).getByRole('button', { name: 'Testar o que li' }).click();
    const modal = page.getByRole('dialog', { name: 'Testar o que li' });
    await expect(modal.getByRole('checkbox', { name: titulo })).toBeChecked();
    await expect(modal.getByText('1 questão disponível')).toBeVisible();
    await modal.getByRole('button', { name: 'Começar' }).click();
    const cartao = page.locator('[data-answer-origin]').first();
    await expect(cartao).toContainText(`${STEM_PREFIX}cobra o material lido`);
    await cartao.getByText('Certa', { exact: true }).first().click();
    await cartao.getByRole('button', { name: 'Confirmar Resposta' }).click();
    await expect(cartao).toHaveAttribute('data-answer-origin', 'session', { timeout: 15_000 });

    // De volta ao Início: a resposta certa já conta em "Questões de residência" (1 respondida, 100%).
    await page.locator('#nav-dashboard').click();
    await expect(page.locator('#painel-acerto-geral')).toHaveText('100%');
    await expect(page.locator('#painel-respondidas')).toHaveText('1 respondida');
    await expect(page.locator('#painel-erros-total')).toHaveText('Nenhum erro para revisar.');
  });

  test('sem conexão, o Início avisa e não afirma número nenhum; com a conexão de volta, carrega', async ({ page }) => {
    test.setTimeout(90_000);
    const student = await criarEstudante('rede');
    await login(page, student);
    await expect(page.locator('#painel-leitura-total')).toBeVisible();

    await page.locator('#nav-questions').click();
    await expect(page.getByRole('heading', { name: 'Banco de Questões Médicas' })).toBeVisible();
    await page.route('**/rest/v1/**', (route) => route.abort('internetdisconnected'));
    await page.locator('#nav-dashboard').click();

    // O cliente do Supabase tenta algumas vezes antes de desistir: o aviso aparece depois de alguns segundos.
    await expect(inicio(page)).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Sem conexão' })).toHaveCount(1, { timeout: 30_000 });
    await expect(page.locator('#painel-leitura-total')).toHaveCount(0);
    await expect(page.locator('#painel-erros-total')).toHaveCount(0);
    await expect(page.locator('#painel-acerto-geral')).toHaveCount(0);

    await page.unroute('**/rest/v1/**');
    await page.getByRole('button', { name: 'Tentar agora' }).click();
    await expect(page.locator('#painel-leitura-total')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('status').filter({ hasText: 'Sem conexão' })).toHaveCount(0);
  });
});
