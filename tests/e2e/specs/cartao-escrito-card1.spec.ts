import { test, expect, type Page } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  deleteE2EMaterials,
  getSeedIds,
  psqlLocal,
  runCleanup,
  MATERIAL_PREFIX,
  type CreatedTestUser,
} from '../fixtures/localSupabase';

// CARD-1, contra o Supabase local de verdade: o cartão que o usuário escreve (Frente e Verso).
// - leitura: "Criar cartão" em cada seção; o "Gerar flashcard" não existe mais; o cartão sai ligado ao material
//   e à seção, com o texto exatamente como foi digitado; dois cartões na mesma seção são dois cartões;
// - o diálogo cabe numa tela de 360 px, sem rolagem lateral;
// - questões: depois de responder (aqui, acertando), "Criar cartão" liga o cartão à questão e não cria o cartão
//   automático do erro.

const STEM = 'e2e-card1-questao-ligada-a-secao';

async function login(page: Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

function materialComSecao(titulo: string): { materialId: string; secaoId: string } {
  const seed = getSeedIds();
  const materialId = psqlLocal(
    `insert into public.materials (discipline_id, theme_id, title, subtitle, mode, study_lens, estimated_read_time_minutes, author, tags, provenance, source, license) ` +
      `values ('${seed.disciplineId}', '${seed.themeId}', '${MATERIAL_PREFIX}${titulo}', 'Material de teste CARD-1', 'mecanismos', 'fisiopatologia', 3, 'E2E', array['e2e'], 'e2e-card1', 'fixture', 'uso interno') returning id;`
  )
    .split('\n')[0]
    .trim();
  const secaoId = psqlLocal(
    `insert into public.material_sections (material_id, sort_order, title, mechanism_tag, content, key_takeaways) ` +
      `values ('${materialId}', 1, 'Seção CARD-1', 'Fisiopatologia', 'Texto da seção CARD-1.', array['ponto da seção']) returning id;`
  )
    .split('\n')[0]
    .trim();
  psqlLocal(`update public.materials set status = 'published' where id = '${materialId}';`);
  return { materialId, secaoId };
}

function questaoLigadaASecao(materialId: string, secaoId: string): string {
  const seed = getSeedIds();
  const questionId = psqlLocal(
    `insert into public.questions (discipline_id, theme_id, cycle, difficulty, institution, year, clinical_vignette, question_stem, tags) ` +
      `values ('${seed.disciplineId}', '${seed.themeId}', 'clinico', 'medio', 'E2E', 2026, 'Vinheta CARD-1.', '${STEM}', array['e2e']) returning id;`
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
  psqlLocal(`insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary) values ('${questionId}', 'Comentário CARD-1.', 'Pérola CARD-1.');`);
  psqlLocal(
    `insert into public.question_materials (question_id, material_id, material_section_id, sort_order) values ('${questionId}', '${materialId}', '${secaoId}', 0);`
  );
  psqlLocal(`update public.questions set status = 'published' where id = '${questionId}';`);
  return questionId;
}

function apagarQuestoes(): void {
  psqlLocal(`update public.questions set status = 'draft' where question_stem = '${STEM}' and status = 'published';`);
  psqlLocal(`delete from public.questions where question_stem = '${STEM}';`);
}

async function abrirMaterial(page: Page, titulo: string) {
  await page.locator('#dock-nav-resources').click();
  await page.locator('#dock-resources-compendiums').click();
  const arvore = page.getByRole('button', { name: 'Modo árvore' });
  const voltar = page.getByRole('button', { name: 'Voltar', exact: true }).first();
  await expect(arvore.or(voltar)).toBeVisible();
  if (!(await arvore.isVisible())) await voltar.click();
  await arvore.click();
  await page.getByRole('button', { name: `${MATERIAL_PREFIX}${titulo}`, exact: true }).first().click();
}

async function escreverCartao(page: Page, frente: string, verso: string) {
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole('textbox', { name: 'Frente' }).fill(frente);
  await dialogo.getByRole('textbox', { name: 'Verso' }).fill(verso);
  await dialogo.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Cartão criado')).toBeVisible({ timeout: 15_000 });
  await expect(dialogo).toBeHidden();
}

const linhas = (sql: string) =>
  psqlLocal(sql)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

test.describe('CARD-1 — cartão escrito pelo usuário', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
  });

  test('leitura: "Criar cartão" guarda a seção com o texto digitado, dois cartões são dois, e não há "Gerar flashcard"', async ({ page }) => {
    const t = `${Date.now()}`;
    const titulo = `card1-leitor-${t}`;
    const { materialId, secaoId } = materialComSecao(titulo);
    cleanup.push(() => deleteE2EMaterials());
    const aluno = await createTestUser({ emailLocalPart: `e2e-card1-leitor-${t}`, password: 'senha-teste-123', role: 'student', status: 'active' });
    cleanup.push(() => deleteTestUser(aluno.id));

    await login(page, aluno);
    await abrirMaterial(page, titulo);

    const secao = page.locator(`[id="${secaoId}"]`);
    await expect(secao).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Gerar flashcard')).toHaveCount(0);

    await secao.getByRole('button', { name: 'Criar cartão' }).click();
    // Foco na Frente; exatamente dois campos; Salvar e Cancelar.
    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByRole('textbox', { name: 'Frente' })).toBeFocused();
    await expect(dialogo.getByRole('textbox')).toHaveCount(2);
    await expect(dialogo.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    await escreverCartao(page, 'Qual é o sinal da seção?', 'O sinal escrito por mim.');

    await secao.getByRole('button', { name: 'Criar cartão' }).click();
    await escreverCartao(page, 'Segunda pergunta', 'Segunda resposta');

    const doBanco = () =>
      linhas(
        `select front || '|' || back || '|' || is_written::text || '|' || (question_origin_id is null)::text || '|' || (material_id = '${materialId}')::text || '|' || (material_section_id = '${secaoId}')::text ` +
          `from public.flashcards where user_id = '${aluno.id}' order by front;`
      );
    await expect
      .poll(doBanco, { timeout: 20_000 })
      .toEqual([
        'Qual é o sinal da seção?|O sinal escrito por mim.|true|true|true|true',
        'Segunda pergunta|Segunda resposta|true|true|true|true',
      ]);
    // Segue em 2 depois de a fila terminar de enviar tudo.
    await page.waitForTimeout(1500);
    expect(doBanco()).toHaveLength(2);
  });

  test('o diálogo cabe numa tela de 360 px, sem rolagem lateral, e Esc fecha', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const t = `${Date.now()}`;
    const titulo = `card1-360-${t}`;
    const { secaoId } = materialComSecao(titulo);
    cleanup.push(() => deleteE2EMaterials());
    const aluno = await createTestUser({ emailLocalPart: `e2e-card1-360-${t}`, password: 'senha-teste-123', role: 'student', status: 'active' });
    cleanup.push(() => deleteTestUser(aluno.id));

    await login(page, aluno);
    await abrirMaterial(page, titulo);
    const secao = page.locator(`[id="${secaoId}"]`);
    await expect(secao).toBeVisible({ timeout: 15_000 });
    await secao.getByRole('button', { name: 'Criar cartão' }).click();

    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('textbox', { name: 'Frente' }).fill('x'.repeat(300));
    await dialogo.getByRole('textbox', { name: 'Verso' }).fill('palavra '.repeat(80));
    const caixa = await dialogo.boundingBox();
    expect(caixa).not.toBeNull();
    expect(caixa!.x).toBeGreaterThanOrEqual(0);
    expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(360);
    const rolagemLateral = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(rolagemLateral).toBe(false);
    const rolagemNoDialogo = await dialogo.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(rolagemNoDialogo).toBe(false);

    await page.keyboard.press('Escape');
    await expect(dialogo).toBeHidden();
    expect(linhas(`select count(*) from public.flashcards where user_id = '${aluno.id}';`)[0]).toBe('0');
  });

  test('questão respondida (acertada): "Criar cartão" liga o cartão à questão e não cria o cartão do erro', async ({ page }) => {
    const t = `${Date.now()}`;
    const titulo = `card1-questao-${t}`;
    const { materialId, secaoId } = materialComSecao(titulo);
    cleanup.push(() => apagarQuestoes());
    cleanup.push(() => deleteE2EMaterials());
    const questionId = questaoLigadaASecao(materialId, secaoId);
    const aluno = await createTestUser({ emailLocalPart: `e2e-card1-questao-${t}`, password: 'senha-teste-123', role: 'student', status: 'active' });
    cleanup.push(() => deleteTestUser(aluno.id));

    await login(page, aluno);
    await page.locator('#dock-nav-resources').click();
    await page.locator('#dock-resources-questions').click();

    const card = page.locator('[data-answer-origin]').filter({ hasText: STEM });
    await expect(card).toBeVisible({ timeout: 20_000 });
    // Antes de responder, não há "Criar cartão".
    await expect(card.getByRole('button', { name: 'Criar cartão' })).toHaveCount(0);

    await card.getByText('A', { exact: true }).first().click();
    await card.getByRole('button', { name: 'Confirmar Resposta' }).click();
    await expect(card).toHaveAttribute('data-answer-origin', 'session', { timeout: 15_000 });

    await card.getByRole('button', { name: 'Criar cartão' }).click();
    await escreverCartao(page, 'Pergunta minha sobre a questão', 'Resposta minha');
    await card.getByRole('button', { name: 'Criar cartão' }).click();
    await escreverCartao(page, 'Segunda pergunta da questão', 'Segunda resposta da questão');

    const doBanco = () =>
      linhas(
        `select front || '|' || back || '|' || is_written::text || '|' || (question_origin_id = '${questionId}')::text || '|' || (material_section_id = '${secaoId}')::text ` +
          `from public.flashcards where user_id = '${aluno.id}' order by front;`
      );
    await expect
      .poll(doBanco, { timeout: 20_000 })
      .toEqual([
        'Pergunta minha sobre a questão|Resposta minha|true|true|true',
        'Segunda pergunta da questão|Segunda resposta da questão|true|true|true',
      ]);
    // Acertou: nenhum cartão automático do erro.
    expect(linhas(`select count(*) from public.flashcards where user_id = '${aluno.id}' and not is_written;`)[0]).toBe('0');
  });
});
