import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import {
  createTestUser,
  deleteTestUser,
  deleteE2EMaterials,
  getLocalConfig,
  getSeedIds,
  insertFlashcardForUser,
  insertPublishedMaterial,
  psqlLocal,
  runCleanup,
  MATERIAL_PREFIX,
  type CreatedTestUser,
} from '../fixtures/localSupabase';

// PAINEL-1, contra o Supabase local de verdade: o painel ("Início") tem só três blocos — Hoje, Acertos por
// disciplina e Continue lendo —, cabe em 360px sem rolagem lateral, e o resto do painel antigo vive em
// "Meu desempenho", a um clique (link do fim do painel e menu Recursos).

const STEM = 'e2e-painel1-questao';

async function login(page: Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

/** Questão publicada no tema do seed. Gabarito: A. Devolve as ids da questão e das alternativas. */
function inserirQuestao(): { questionId: string; certaId: string; erradaId: string } {
  const seed = getSeedIds();
  const questionId = psqlLocal(
    `insert into public.questions (discipline_id, theme_id, cycle, difficulty, institution, year, clinical_vignette, question_stem, tags) ` +
      `values ('${seed.disciplineId}', '${seed.themeId}', 'clinico', 'medio', 'E2E', 2026, 'Vinheta PAINEL-1.', '${STEM}', array['e2e']) returning id;`
  )
    .split('\n')[0]
    .trim();
  psqlLocal(
    `insert into public.question_options (question_id, letter, option_text, sort_order) values ('${questionId}', 'A', 'Certa', 0), ('${questionId}', 'B', 'Errada', 1);`
  );
  psqlLocal(
    `update public.question_option_keys set is_correct = true, explanation = 'Certa.' where option_id = (select id from public.question_options where question_id = '${questionId}' and letter = 'A');`
  );
  psqlLocal(`insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary) values ('${questionId}', 'c', 'h');`);
  psqlLocal(`update public.questions set status = 'published' where id = '${questionId}';`);
  const alt = (letra: string) =>
    psqlLocal(`select id from public.question_options where question_id = '${questionId}' and letter = '${letra}';`).split('\n')[0].trim();
  return { questionId, certaId: alt('A'), erradaId: alt('B') };
}

function apagarQuestoes(): void {
  psqlLocal(`update public.questions set status = 'draft' where question_stem = '${STEM}' and status = 'published';`);
  psqlLocal(`delete from public.questions where question_stem = '${STEM}';`);
}

async function responder(user: CreatedTestUser, questionId: string, alternativaId: string) {
  const cfg = getLocalConfig();
  const client = createClient(cfg.apiUrl, cfg.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: loginError } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  expect(loginError).toBeNull();
  const { error } = await client.rpc('submit_question_attempt', {
    p_question_id: questionId,
    p_selected_option_id: alternativaId,
    p_time_spent_seconds: 9,
    p_error_reason: null,
    p_user_notes: null,
    p_answer_mode: null,
    p_answer_strategy: null,
    p_client_op_id: randomUUID(),
  });
  expect(error).toBeNull();
}

const secoes = (page: Page) => page.locator('#painel-view section');
const semRolagemLateral = (page: Page) =>
  page.evaluate(() => ({
    pagina: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    corpo: document.body.scrollWidth - document.body.clientWidth,
  }));

test.describe('PAINEL-1 — painel enxuto e "Meu desempenho"', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
  });

  async function criarEstudante(nome: string): Promise<CreatedTestUser> {
    const user = await createTestUser({
      emailLocalPart: `e2e-painel1-${nome}-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'student',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(user.id));
    return user;
  }

  test('usuário novo: três blocos com estados vazios curtos, sem rolagem lateral em 360px e em 1280px', async ({ page }, testInfo) => {
    const student = await criarEstudante('novo');
    await login(page, student);

    for (const [largura, altura] of [
      [360, 740],
      [1280, 800],
    ] as const) {
      await page.setViewportSize({ width: largura, height: altura });
      await page.locator(largura === 360 ? '#dock-nav-dashboard' : '#nav-dashboard').click();
      await expect(page.locator('#painel-view')).toBeVisible();

      await expect(secoes(page)).toHaveCount(3);
      await expect(secoes(page).locator('h2')).toHaveText(['Hoje', 'Acertos por disciplina', 'Continue lendo']);
      await expect(page.getByText('Nenhum cartão para hoje')).toBeVisible();
      await expect(page.getByText('Nenhuma questão respondida ainda')).toBeVisible();
      await expect(page.getByText('Nenhum material em andamento')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Abrir biblioteca' })).toBeVisible();

      const sobra = await semRolagemLateral(page);
      expect(sobra.pagina, `rolagem lateral da página em ${largura}px`).toBeLessThanOrEqual(0);
      expect(sobra.corpo, `rolagem lateral do corpo em ${largura}px`).toBeLessThanOrEqual(0);

      await testInfo.attach(`painel-vazio-${largura}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    }
  });

  test('com dados: cartões vencidos, sequência, acertos por disciplina e material em andamento vêm do servidor', async ({ page }, testInfo) => {
    const seed = getSeedIds();
    const t = `${Date.now()}`;
    const titulo = `${MATERIAL_PREFIX}painel1-${t}`;
    const materialId = insertPublishedMaterial(`painel1-${t}`);
    cleanup.push(() => apagarQuestoes());
    cleanup.push(() => deleteE2EMaterials());
    const { questionId, certaId } = inserirQuestao();

    const student = await criarEstudante('dados');
    psqlLocal(
      `insert into public.reading_progress (user_id, material_id, read_section_ids, percent, updated_at) ` +
        `values ('${student.id}', '${materialId}', '{}', 40, now());`
    );
    insertFlashcardForUser(student.id, seed, { materialId: null, isCustom: false, front: 'Card PAINEL-1' });
    insertFlashcardForUser(student.id, seed, { materialId: null, isCustom: false, front: 'Card PAINEL-1 b' });
    cleanup.push(() => {
      psqlLocal(`delete from public.flashcards where user_id = '${student.id}';`);
    });
    await responder(student, questionId, certaId);
    const disciplina = psqlLocal(`select name from public.disciplines where id = '${seed.disciplineId}';`).split('\n')[0].trim();

    await login(page, student);
    await page.locator('#nav-dashboard').click();
    await expect(page.locator('#painel-view')).toBeVisible();
    await expect(secoes(page)).toHaveCount(3);

    // Hoje: 2 cartões vencidos e a sequência de hoje (1 dia).
    await expect(page.locator('#painel-cartoes-numero')).toHaveText('2');
    await expect(page.locator('#painel-sequencia-numero')).toHaveText('1');
    // Acertos: a disciplina do seed, 1 de 1 = 100%.
    const grafico = page.locator('#painel-acertos-grafico');
    await expect(grafico.getByRole('listitem')).toHaveCount(1);
    await expect(grafico).toContainText(disciplina);
    await expect(grafico).toContainText('100%');
    // Continue lendo: o material com 40%.
    const leitura = page.getByRole('region', { name: 'Continue lendo' });
    await expect(leitura.getByRole('button', { name: new RegExp(titulo) })).toBeVisible();
    await expect(leitura.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');

    await testInfo.attach('painel-com-dados-1280', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await page.setViewportSize({ width: 360, height: 740 });
    const sobra = await semRolagemLateral(page);
    expect(sobra.pagina).toBeLessThanOrEqual(0);
    expect(sobra.corpo).toBeLessThanOrEqual(0);
    await testInfo.attach('painel-com-dados-360', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await page.setViewportSize({ width: 1280, height: 800 });

    // Escuro: a mesma tela, só para conferir o contraste (o tema é a classe `dark` na raiz).
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.waitForTimeout(600); // as cores têm transição
    await testInfo.attach('painel-com-dados-1280-escuro', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await page.evaluate(() => document.documentElement.classList.remove('dark'));

    // O clique no material abre o leitor.
    await leitura.getByRole('button', { name: new RegExp(titulo) }).click();
    await expect(page.getByText('Seção de teste 22-A').first()).toBeVisible({ timeout: 15_000 });
  });

  test('"Meu desempenho" abre pelo link do painel e pelo menu, e traz o caderno de erros a um clique', async ({ page }) => {
    const student = await criarEstudante('desempenho');
    await login(page, student);

    // Pelo link do fim do painel.
    await page.locator('#nav-dashboard').click();
    await page.getByRole('button', { name: 'Ver meu desempenho' }).click();
    await expect(page).toHaveURL(/#\/desempenho$/);
    await expect(page.getByRole('heading', { name: 'Meu desempenho', level: 1 })).toBeVisible();
    for (const texto of ['Desempenho por Especialidade Médica', 'Radar de Vulnerabilidades', 'Desafios do Dia', 'Circuito de Flashcards', 'Medalhas & Conquistas']) {
      await expect(page.getByText(texto, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText('Acurácia Geral')).toBeVisible();
    await expect(page.getByText('Missão Prioritária de Hoje')).toBeVisible();
    await page.getByRole('button', { name: /Caderno de Erros & Metacognição/ }).click();
    await expect(page.getByText('Caderno de Erros').first()).toBeVisible();

    // Pelo menu (desktop): Recursos → Meu desempenho.
    await page.locator('#nav-today').click();
    await expect(page.locator('#hoje-view')).toBeVisible();
    await page.locator('#nav-resources').click();
    await page.locator('#nav-resources-desempenho').click();
    await expect(page.getByRole('heading', { name: 'Meu desempenho', level: 1 })).toBeVisible();
    await expect(page.locator('#nav-resources')).toHaveClass(/teal/);

    // Pelo menu (celular).
    await page.setViewportSize({ width: 360, height: 740 });
    await page.locator('#dock-nav-today').click();
    await expect(page.locator('#hoje-view')).toBeVisible();
    await page.locator('#dock-nav-resources').click();
    await page.locator('#dock-resources-desempenho').click();
    await expect(page.getByRole('heading', { name: 'Meu desempenho', level: 1 })).toBeVisible();
    const dock = (await page.locator('#mobile-floating-dock').boundingBox())!;
    expect(dock.x).toBeGreaterThanOrEqual(0);
    expect(dock.x + dock.width).toBeLessThanOrEqual(360);
  });
});
