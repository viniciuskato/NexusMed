import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import {
  createTestUser,
  deleteTestUser,
  deleteE2EMaterials,
  getLocalConfig,
  getSeedIds,
  psqlLocal,
  runCleanup,
  MATERIAL_PREFIX,
  type CreatedTestUser,
} from '../fixtures/localSupabase';

// P10, contra o Supabase local de verdade: erro → trecho do material → flashcard do trecho.
// - o caderno de erros mostra, ao lado do erro e sem trocar de tela, o trecho da SEÇÃO a que a questão está
//   ligada, com "Abrir no material" (que abre o material nessa seção);
// - o flashcard criado do erro guarda a seção (e a questão de origem);
// - "Gerar flashcard" no leitor guarda a seção e, pedido duas vezes, não duplica.

const STEM = 'e2e-p10-questao-ligada-a-secao';
const TEXTO_DO_TRECHO = 'Trecho P10: a relação VEF1/CVF reduzida define o padrão obstrutivo.';

async function login(page: Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

/** Material publicado no tema do seed com duas seções: uma longa (empurra a outra para baixo) e a do trecho. */
function materialComSecoes(titulo: string): { materialId: string; secaoDoTrechoId: string } {
  const seed = getSeedIds();
  const materialId = psqlLocal(
    `insert into public.materials (discipline_id, theme_id, title, subtitle, mode, study_lens, estimated_read_time_minutes, author, tags, provenance, source, license) ` +
      `values ('${seed.disciplineId}', '${seed.themeId}', '${MATERIAL_PREFIX}${titulo}', 'Material de teste P10', 'mecanismos', 'fisiopatologia', 3, 'E2E', array['e2e'], 'e2e-p10', 'fixture', 'uso interno') returning id;`
  )
    .split('\n')[0]
    .trim();
  const longo = Array.from({ length: 40 }, (_, i) => `Parágrafo ${i + 1} da primeira seção, longo o bastante para empurrar a próxima seção para baixo da tela.`).join('\n\n');
  psqlLocal(
    `insert into public.material_sections (material_id, sort_order, title, mechanism_tag, content, key_takeaways) ` +
      `values ('${materialId}', 1, 'Seção longa P10', 'Fisiopatologia', '${longo}', array['ponto']);`
  );
  const secaoDoTrechoId = psqlLocal(
    `insert into public.material_sections (material_id, sort_order, title, mechanism_tag, content, key_takeaways) ` +
      `values ('${materialId}', 2, 'Seção do erro P10', 'Fisiopatologia', '${TEXTO_DO_TRECHO}', array['ponto da seção']) returning id;`
  )
    .split('\n')[0]
    .trim();
  psqlLocal(`update public.materials set status = 'published' where id = '${materialId}';`);
  return { materialId, secaoDoTrechoId };
}

/** Questão publicada ligada ao material e à seção; devolve o id e o id da alternativa errada. */
function questaoLigadaASecao(materialId: string, secaoId: string): { questionId: string; erradaId: string } {
  const seed = getSeedIds();
  const questionId = psqlLocal(
    `insert into public.questions (discipline_id, theme_id, cycle, difficulty, institution, year, clinical_vignette, question_stem, tags) ` +
      `values ('${seed.disciplineId}', '${seed.themeId}', 'clinico', 'medio', 'E2E', 2026, 'Vinheta P10.', '${STEM}', array['e2e']) returning id;`
  )
    .split('\n')[0]
    .trim();
  psqlLocal(
    `insert into public.question_options (question_id, letter, option_text, sort_order) values ('${questionId}', 'A', 'Alternativa certa', 0), ('${questionId}', 'B', 'Alternativa errada', 1);`
  );
  psqlLocal(
    `update public.question_option_keys set is_correct = true, explanation = 'Certa.' where option_id = (select id from public.question_options where question_id = '${questionId}' and letter = 'A');`
  );
  psqlLocal(
    `update public.question_option_keys set explanation = 'Errada.' where option_id = (select id from public.question_options where question_id = '${questionId}' and letter = 'B');`
  );
  psqlLocal(`insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary) values ('${questionId}', 'Comentário P10.', 'Pérola P10.');`);
  psqlLocal(
    `insert into public.question_materials (question_id, material_id, material_section_id, sort_order) values ('${questionId}', '${materialId}', '${secaoId}', 0);`
  );
  psqlLocal(`update public.questions set status = 'published' where id = '${questionId}';`);
  const erradaId = psqlLocal(`select id from public.question_options where question_id = '${questionId}' and letter = 'B';`).split('\n')[0].trim();
  return { questionId, erradaId };
}

function apagarQuestoes(): void {
  psqlLocal(`update public.questions set status = 'draft' where question_stem = '${STEM}' and status = 'published';`);
  psqlLocal(`delete from public.questions where question_stem = '${STEM}';`);
}

/** O estudante erra a questão (resposta real, pela RPC do servidor). */
async function errarQuestao(user: CreatedTestUser, questionId: string, alternativaId: string) {
  const cfg = getLocalConfig();
  const client = createClient(cfg.apiUrl, cfg.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: loginError } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  expect(loginError).toBeNull();
  const { error } = await client.rpc('submit_question_attempt', {
    p_question_id: questionId,
    p_selected_option_id: alternativaId,
    p_time_spent_seconds: 12,
    p_error_reason: null,
    p_user_notes: null,
    p_answer_mode: null,
    p_answer_strategy: null,
    p_client_op_id: randomUUID(),
  });
  expect(error).toBeNull();
}

async function abrirCadernoDeErros(page: Page) {
  await page.locator('#dock-nav-dashboard').click();
  await page.getByRole('button', { name: /Caderno de Erros & Metacognição/ }).click();
}

test.describe('P10 — erro → trecho do material → flashcard do trecho', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
  });

  test('o caderno de erros mostra o trecho da seção ao lado do erro, abre o material nela e o card do erro guarda a seção', async ({ page }) => {
    const t = `${Date.now()}`;
    const { materialId, secaoDoTrechoId } = materialComSecoes(`p10-${t}`);
    cleanup.push(() => apagarQuestoes());
    cleanup.push(() => deleteE2EMaterials());
    const { questionId, erradaId } = questaoLigadaASecao(materialId, secaoDoTrechoId);

    const aluno = await createTestUser({ emailLocalPart: `e2e-p10-aluno-${t}`, password: 'senha-teste-123', role: 'student', status: 'active' });
    cleanup.push(() => deleteTestUser(aluno.id));
    await errarQuestao(aluno, questionId, erradaId);

    await login(page, aluno);
    await abrirCadernoDeErros(page);

    // O trecho aparece no cartão do erro, na mesma tela.
    const trecho = page.getByTestId(`trecho-do-erro-${questionId}`);
    await expect(trecho).toBeVisible({ timeout: 15_000 });
    await expect(trecho).toContainText('Seção do erro P10');
    await expect(trecho).toContainText(TEXTO_DO_TRECHO);
    await expect(trecho).not.toContainText('Parágrafo 1 da primeira seção');
    await expect(page.getByText(STEM).first()).toBeVisible();

    // O card do erro guarda a seção (e a questão de origem).
    await page.getByRole('button', { name: 'Criar Flashcard deste Erro' }).first().click();
    await expect
      .poll(() =>
        psqlLocal(
          `select coalesce(material_section_id::text, 'sem-secao') || '|' || coalesce(question_origin_id::text, 'sem-questao') from public.flashcards where user_id = '${aluno.id}' and question_origin_id = '${questionId}';`
        ).split('\n')[0].trim(),
      { timeout: 20_000 })
      .toBe(`${secaoDoTrechoId}|${questionId}`);

    // "Abrir no material" abre o leitor NAQUELA seção (a primeira seção, longa, fica para cima).
    await trecho.getByRole('button', { name: /Abrir no material/ }).click();
    const secao = page.locator(`[id="${secaoDoTrechoId}"]`);
    await expect(secao).toBeVisible({ timeout: 15_000 });
    await expect(secao).toBeInViewport({ timeout: 10_000 });
  });

  test('"Gerar flashcard" no leitor guarda a seção e, pedido duas vezes, não duplica', async ({ page }) => {
    const t = `${Date.now()}`;
    const titulo = `p10-leitor-${t}`;
    const { materialId, secaoDoTrechoId } = materialComSecoes(titulo);
    cleanup.push(() => deleteE2EMaterials());

    const aluno = await createTestUser({ emailLocalPart: `e2e-p10-leitor-${t}`, password: 'senha-teste-123', role: 'student', status: 'active' });
    cleanup.push(() => deleteTestUser(aluno.id));

    await login(page, aluno);
    await page.locator('#dock-nav-resources').click();
    await page.locator('#dock-resources-compendiums').click();
    const arvore = page.getByRole('button', { name: 'Modo árvore' });
    const voltar = page.getByRole('button', { name: 'Voltar', exact: true }).first();
    await expect(arvore.or(voltar)).toBeVisible();
    if (!(await arvore.isVisible())) await voltar.click();
    await arvore.click();
    await page.getByRole('button', { name: `${MATERIAL_PREFIX}${titulo}`, exact: true }).first().click();

    const secao = page.locator(`[id="${secaoDoTrechoId}"]`);
    await expect(secao).toBeVisible({ timeout: 15_000 });
    const gerar = secao.getByRole('button', { name: 'Gerar flashcard' });
    await gerar.click();
    await expect(page.getByText('Flashcard criado para o seu SRS')).toBeVisible({ timeout: 15_000 });
    await gerar.click();
    await expect(page.getByText('Esta seção já tem flashcard no seu SRS')).toBeVisible({ timeout: 15_000 });

    const contar = () =>
      psqlLocal(
        `select count(*) from public.flashcards where user_id = '${aluno.id}' and material_id = '${materialId}' and material_section_id = '${secaoDoTrechoId}' and question_origin_id is null;`
      )
        .split('\n')[0]
        .trim();
    await expect.poll(contar, { timeout: 20_000 }).toBe('1');
    // Segue em 1 depois de a fila terminar de enviar tudo.
    await page.waitForTimeout(1500);
    expect(contar()).toBe('1');
  });
});
