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

// Unidade 43-C, contra o Supabase local de verdade: "Testar o que li" mostra
// os materiais lidos hoje (marcados), a contagem antes de começar, só inclui a
// questão que cobra vários materiais com todos marcados, errar gera flashcard,
// e sem questão a tela diz isso e oferece o tema.

const STEM_PREFIX = 'e2e-43c-';

async function login(page: Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

async function abrirMaterial(page: Page, title: string) {
  const desktopTrigger = page.locator('#nav-resources');
  if (await desktopTrigger.isVisible()) {
    await desktopTrigger.click();
    await page.locator('#nav-resources-compendiums').click();
  } else {
    await page.locator('#dock-nav-resources').click();
    await page.locator('#dock-resources-compendiums').click();
  }
  await page.getByRole('button', { name: 'Modo árvore' }).click();
  await page.getByRole('button', { name: title, exact: true }).first().click();
}

/** Questão publicada no tema do seed, cobrando os materiais dados. Gabarito: A. */
function insertPublishedQuestion(stem: string, materialIds: string[]): string {
  const seed = getSeedIds();
  const id = psqlLocal(
    `insert into public.questions (discipline_id, theme_id, cycle, difficulty, institution, year, clinical_vignette, question_stem, tags) ` +
      `values ('${seed.disciplineId}', '${seed.themeId}', 'clinico', 'medio', 'E2E', 2026, 'Vinheta 43-C.', '${STEM_PREFIX}${stem}', array['e2e']) returning id;`
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

/** Progresso de leitura com a data dada (uma seção lida). */
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

test.describe('43-C — Testar o que li', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
  });

  test('pelo leitor: lidos hoje marcados, contagem, desmarcar e errar gera flashcard', async ({ page }) => {
    const t = `${Date.now()}`;
    const titleA = `${MATERIAL_PREFIX}43c-A-${t}`;
    const titleB = `${MATERIAL_PREFIX}43c-B-${t}`;
    const titleC = `${MATERIAL_PREFIX}43c-C-${t}`;
    const matA = insertPublishedMaterial(`43c-A-${t}`);
    const matB = insertPublishedMaterial(`43c-B-${t}`);
    const matC = insertPublishedMaterial(`43c-C-${t}`);
    cleanup.push(() => deleteE2EQuestions());
    cleanup.push(() => deleteE2EMaterials());
    const soA = insertPublishedQuestion('cobra só A', [matA]);
    insertPublishedQuestion('cobra A e B', [matA, matB]);
    insertPublishedQuestion('cobra só C', [matC]);

    const student = await createTestUser({
      emailLocalPart: `e2e-43c-aluno-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'student',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(student.id));
    registrarLeitura(student.id, matB, 'now()');
    registrarLeitura(student.id, matC, "now() - interval '2 days'");

    await login(page, student);

    // A é lido agora, pelo leitor (caminho real: fila → set_section_read).
    await abrirMaterial(page, titleA);
    const marcar = page.getByRole('button', { name: /Marcar lida|Lida/ }).first();
    await expect(marcar).toBeVisible({ timeout: 10_000 });
    await marcar.click();
    // O botão relê o servidor antes de a fila subir (comportamento do main que
    // a 45-G corrige): a prova é a gravação chegar ao banco.
    await expect
      .poll(() =>
        psqlLocal(
          `select coalesce(array_length(read_section_ids, 1), 0) from public.reading_progress where user_id = '${student.id}' and material_id = '${matA}';`
        )
      )
      .toBe('1');

    await page.getByRole('button', { name: 'Testar o que li' }).click();
    const modal = page.getByRole('dialog', { name: 'Testar o que li' });
    const checkA = modal.getByRole('checkbox', { name: titleA });
    const checkB = modal.getByRole('checkbox', { name: titleB });
    await expect(checkA).toBeChecked();
    await expect(checkB).toBeChecked();
    await expect(modal.getByText(titleC)).toHaveCount(0);
    await expect(modal.getByText('2 questões disponíveis')).toBeVisible();

    // Sem B, a questão que cobra A e B sai.
    await checkB.uncheck();
    await expect(modal.getByText('1 questão disponível')).toBeVisible();
    await modal.getByRole('button', { name: 'Começar' }).click();

    await expect(page.locator('#questions-testar-scope')).toContainText('1 questão');
    await expect(page.getByText('Exibindo')).toContainText('1 questões');
    const card = page.locator('[data-answer-origin]').first();
    await expect(card).toContainText(`${STEM_PREFIX}cobra só A`);

    // Errar gera flashcard, como em qualquer questão.
    await card.getByText('Errada', { exact: true }).first().click();
    await card.getByRole('button', { name: 'Confirmar Resposta' }).click();
    await expect(card).toHaveAttribute('data-answer-origin', 'session', { timeout: 15_000 });
    await expect
      .poll(() =>
        psqlLocal(`select count(*) from public.flashcards where user_id = '${student.id}' and question_origin_id = '${soA}';`)
      )
      .toBe('1');
  });

  test('pelo painel: sem questões para o que leu, diz isso e oferece o tema', async ({ page }) => {
    const t = `${Date.now()}`;
    const titleD = `${MATERIAL_PREFIX}43c-D-${t}`;
    const matD = insertPublishedMaterial(`43c-D-${t}`);
    cleanup.push(() => deleteE2EMaterials());

    const student = await createTestUser({
      emailLocalPart: `e2e-43c-vazio-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'student',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(student.id));
    registrarLeitura(student.id, matD, 'now()');

    await login(page, student);
    await page.getByRole('button', { name: 'Testar o que li' }).click();
    const modal = page.getByRole('dialog', { name: 'Testar o que li' });
    await expect(modal.getByRole('checkbox', { name: titleD })).toBeChecked();
    await expect(modal.getByText(/Nenhuma questão cobra os materiais marcados/)).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Começar' })).toHaveCount(0);

    const seed = getSeedIds();
    const doTema = psqlLocal(`select count(*) from public.questions where theme_id = '${seed.themeId}' and status = 'published';`);
    await modal.getByRole('button', { name: /Resolver questões do tema/ }).click();
    await expect(modal).toHaveCount(0);
    await expect(page.getByText('Exibindo')).toContainText(`${doTema} questões`);
  });
});
