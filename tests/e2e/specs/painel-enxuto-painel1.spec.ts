import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import {
  createTestUser,
  deleteTestUser,
  deleteE2EMaterials,
  getLocalConfig,
  getSeedIds,
  insertPublishedMaterial,
  psqlLocal,
  runCleanup,
  MATERIAL_PREFIX,
  type CreatedTestUser,
} from '../fixtures/localSupabase';

// PAINEL-1, reescrito na PAINEL-2 (D-14), contra o Supabase local de verdade: o Início é o painel único — "Continuar
// lendo", "Minha leitura", "Questões de residência", "Erros para revisar" e os atalhos —, cabe em 360px e em 1280px
// sem rolagem lateral, e o caderno de erros fica a um botão dele. Sem cartões, sequência de dias, nível/XP, desafios,
// conquistas, Missão nem Passagem de Plantão.

const STEM = 'e2e-painel1-questao';

async function login(page: Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

/** Questão publicada no tema do seed (banca "E2E", 2026: conta como de residência). Gabarito: A. */
function inserirQuestao(sufixo: string): { questionId: string; certaId: string; erradaId: string } {
  const seed = getSeedIds();
  const questionId = psqlLocal(
    `insert into public.questions (discipline_id, theme_id, cycle, difficulty, institution, year, clinical_vignette, question_stem, tags) ` +
      `values ('${seed.disciplineId}', '${seed.themeId}', 'clinico', 'medio', 'E2E', 2026, 'Vinheta PAINEL-2.', '${STEM}-${sufixo}', array['e2e']) returning id;`
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
  psqlLocal(`update public.questions set status = 'draft' where question_stem like '${STEM}%' and status = 'published';`);
  psqlLocal(`delete from public.questions where question_stem like '${STEM}%';`);
}

async function responder(user: CreatedTestUser, respostas: { questionId: string; alternativaId: string }[]) {
  const cfg = getLocalConfig();
  const client = createClient(cfg.apiUrl, cfg.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: loginError } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  expect(loginError).toBeNull();
  for (const { questionId, alternativaId } of respostas) {
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
}

const bloco = (page: Page, nome: string) => page.locator(`#painel-view [data-painel-bloco="${nome}"]`);
const semRolagemLateral = (page: Page) =>
  page.evaluate(() => ({
    pagina: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    corpo: document.body.scrollWidth - document.body.clientWidth,
  }));

test.describe('PAINEL-2 — o Início (painel único)', () => {
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

  test('usuário novo: blocos na ordem, estados vazios curtos e sem rolagem lateral em 360px e em 1280px', async ({ page }, testInfo) => {
    const student = await criarEstudante('novo');
    await login(page, student);

    for (const [largura, altura] of [
      [360, 740],
      [1280, 800],
    ] as const) {
      await page.setViewportSize({ width: largura, height: altura });
      await page.locator(largura === 360 ? '#dock-nav-dashboard' : '#nav-dashboard').click();
      await expect(page.locator('#painel-view')).toBeVisible();
      await expect(page.locator('#painel-leitura-total')).toBeVisible();

      // Sem leitura aberta não há "Continuar lendo".
      await expect(page.locator('#painel-view [data-painel-bloco]')).toHaveCount(4);
      await expect(page.locator('#painel-view [data-painel-bloco] h2')).toHaveText([
        'Minha leitura',
        'Questões de residência',
        'Erros para revisar',
        'Atalhos',
      ]);
      await expect(page.getByText(/(?<!\p{L})(cartões|cartão)(?!\p{L})|dias seguidos|Missão|Passagem de Plant|Acurácia/iu)).toHaveCount(0);
      await expect(page.locator('#painel-leitura-total')).toHaveText(/^Você leu 0 de \d+ partes?$/);
      await expect(bloco(page, 'questoes')).toContainText(/Nenhuma questão respondida ainda|Ainda não há questões de residência publicadas\./);
      await expect(page.locator('#painel-erros-total')).toHaveText('Nenhum erro para revisar.');
      await expect(page.getByRole('button', { name: 'Abrir caderno de erros' })).toBeVisible();

      const sobra = await semRolagemLateral(page);
      expect(sobra.pagina, `rolagem lateral da página em ${largura}px`).toBeLessThanOrEqual(0);
      expect(sobra.corpo, `rolagem lateral do corpo em ${largura}px`).toBeLessThanOrEqual(0);

      await testInfo.attach(`inicio-vazio-${largura}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    }
  });

  test('com dados: leitura, acerto geral, por disciplina, por banca, evolução e erros vêm do servidor; o caderno de erros abre pelo botão', async ({
    page,
  }, testInfo) => {
    const seed = getSeedIds();
    const t = `${Date.now()}`;
    const titulo = `${MATERIAL_PREFIX}painel2-${t}`;
    const materialId = insertPublishedMaterial(`painel2-${t}`);
    cleanup.push(() => apagarQuestoes());
    cleanup.push(() => deleteE2EMaterials());
    // O material tem 2 seções e 1 lida: "Lendo — 50%".
    psqlLocal(
      `insert into public.material_sections (material_id, sort_order, title, mechanism_tag, content, key_takeaways) ` +
        `values ('${materialId}', 2, 'Segunda seção de teste', 'Fisiopatologia', 'Conteúdo de teste.', array['ponto']);`
    );
    const certa = inserirQuestao('certa');
    const errada = inserirQuestao('errada');

    const student = await criarEstudante('dados');
    psqlLocal(
      `insert into public.reading_progress (user_id, material_id, read_section_ids, percent, updated_at) ` +
        `select '${student.id}', '${materialId}', array[(select id from public.material_sections where material_id = '${materialId}' order by sort_order limit 1)], 50, now();`
    );
    // 1 certa e 1 errada: 50% de acerto, 2 respondidas, 1 erro.
    await responder(student, [
      { questionId: certa.questionId, alternativaId: certa.certaId },
      { questionId: errada.questionId, alternativaId: errada.erradaId },
    ]);
    const disciplina = psqlLocal(`select name from public.disciplines where id = '${seed.disciplineId}';`).split('\n')[0].trim();

    await login(page, student);
    await expect(page.locator('#painel-view')).toBeVisible();

    // Minha leitura: o material com 1 de 2 seções.
    const linha = page.locator('[data-material-leitura]').filter({ hasText: titulo });
    await expect(linha).toContainText('Lendo — 50%');
    await expect(page.locator('#painel-leitura-total')).toHaveText(/^Você leu \d+ de \d+ partes?$/);
    // O filtro "Falta ler" mantém o que está em andamento.
    await bloco(page, 'leitura').getByRole('button', { name: 'Falta ler' }).click();
    await expect(linha).toBeVisible();
    await bloco(page, 'leitura').getByRole('button', { name: 'Todos' }).click();

    // Questões de residência: 2 respondidas, 50%, na banca E2E e na disciplina do seed.
    await expect(page.locator('#painel-acerto-geral')).toHaveText('50%');
    await expect(page.locator('#painel-respondidas')).toHaveText('2 respondidas');
    await expect(page.locator('#painel-acertos-disciplina').getByRole('listitem')).toHaveCount(1);
    await expect(page.locator('#painel-acertos-disciplina')).toContainText(disciplina);
    await expect(page.locator('#painel-acertos-disciplina')).toContainText('50%');
    await expect(page.locator('#painel-acertos-banca').getByRole('listitem')).toHaveCount(1);
    await expect(page.locator('#painel-acertos-banca')).toContainText('E2E');
    await expect(page.locator('#painel-acertos-banca')).toContainText('2 respondidas');
    // Evolução: 8 semanas, só a atual (a última) tem resposta; as outras 7 aparecem vazias, não como 0%.
    const semanas = page.locator('#painel-evolucao [data-semana]');
    await expect(semanas).toHaveCount(8);
    await expect(semanas.last()).toHaveAttribute('aria-label', /50% de acerto em 2 respondidas/);
    await expect(page.locator('#painel-evolucao [data-semana-vazia]')).toHaveCount(7);

    // Erros para revisar: 1.
    await expect(page.locator('#painel-erros-total')).toHaveText('1 erro em questões de residência');

    await testInfo.attach('inicio-com-dados-1280', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await page.setViewportSize({ width: 360, height: 740 });
    const sobra = await semRolagemLateral(page);
    expect(sobra.pagina).toBeLessThanOrEqual(0);
    expect(sobra.corpo).toBeLessThanOrEqual(0);
    await testInfo.attach('inicio-com-dados-360', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await page.setViewportSize({ width: 1280, height: 800 });

    // Escuro: a mesma tela, só para conferir o contraste (o tema é a classe `dark` na raiz).
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.waitForTimeout(600); // as cores têm transição
    await testInfo.attach('inicio-com-dados-1280-escuro', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await page.evaluate(() => document.documentElement.classList.remove('dark'));

    // O botão do caderno de erros abre a tela própria, que continua com o Início marcado no menu e volta por "Início".
    await page.getByRole('button', { name: 'Abrir caderno de erros' }).click();
    await expect(page).toHaveURL(/#\/errors$/);
    await expect(page.getByText('Caderno de Erros').first()).toBeVisible();
    await expect(page.locator('#nav-dashboard')).toHaveAttribute('aria-current', 'page');
    await page.getByRole('button', { name: 'Início', exact: true }).first().click();
    await expect(page.locator('#painel-view')).toBeVisible();

    // O clique no material abre o leitor.
    await linha.click();
    await expect(page.getByText('Seção de teste 22-A').first()).toBeVisible({ timeout: 15_000 });
  });
});
