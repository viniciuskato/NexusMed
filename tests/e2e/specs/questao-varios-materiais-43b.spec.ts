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

// Unidade 43-B, contra o Supabase local de verdade:
// - o estudante: "Resolver questões" a partir de um material traz as questões
//   que cobram aquele material (uma questão pode cobrar vários); material sem
//   questão vinculada cai no tema, como antes;
// - quem produz: "Materiais cobrados por este lote" na importação vale para
//   todas as questões do arquivo.

const STEM_PREFIX = 'e2e-43b-';

async function login(page: Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

async function openLibraryTree(page: Page) {
  const desktopTrigger = page.locator('#nav-resources');
  if (await desktopTrigger.isVisible()) {
    await desktopTrigger.click();
    await page.locator('#nav-resources-compendiums').click();
  } else {
    await page.locator('#dock-nav-resources').click();
    await page.locator('#dock-resources-compendiums').click();
  }
  // A biblioteca lembra o último material aberto e reabre o leitor dele:
  // volta para a lista antes de escolher o próximo material.
  const arvore = page.getByRole('button', { name: 'Modo árvore' });
  const voltar = page.getByRole('button', { name: 'Voltar', exact: true }).first();
  await expect(arvore.or(voltar)).toBeVisible();
  if (!(await arvore.isVisible())) await voltar.click();
  await arvore.click();
}

/** Questão publicada no tema do seed, cobrando os materiais dados (na ordem). */
function insertPublishedQuestion(stem: string, materialIds: string[]): string {
  const seed = getSeedIds();
  const id = psqlLocal(
    `insert into public.questions (discipline_id, theme_id, cycle, difficulty, institution, year, clinical_vignette, question_stem, tags) ` +
      `values ('${seed.disciplineId}', '${seed.themeId}', 'clinico', 'medio', 'E2E', 2026, 'Vinheta 43-B.', '${STEM_PREFIX}${stem}', array['e2e']) returning id;`
  )
    .split('\n')[0]
    .trim();
  psqlLocal(
    `insert into public.question_options (question_id, letter, option_text, sort_order) values ('${id}', 'A', 'A', 0), ('${id}', 'B', 'B', 1);`
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

function deleteE2EQuestions(): void {
  psqlLocal(`update public.questions set status = 'draft' where question_stem like '${STEM_PREFIX}%' and status = 'published';`);
  psqlLocal(`delete from public.questions where question_stem like '${STEM_PREFIX}%';`);
}

async function resolverQuestoesDoMaterial(page: Page, title: string) {
  await openLibraryTree(page);
  await page.getByRole('button', { name: title, exact: true }).click();
  await page.getByRole('button', { name: 'Resolver questões' }).first().click();
}

test.describe('43-B — questão cobre um ou vários materiais', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
  });

  test('"Resolver questões" a partir de um material traz as questões que o cobram', async ({ page }) => {
    const t = `${Date.now()}`;
    const titleA = `${MATERIAL_PREFIX}43b-A-${t}`;
    const titleB = `${MATERIAL_PREFIX}43b-B-${t}`;
    const titleC = `${MATERIAL_PREFIX}43b-C-${t}`;
    const matA = insertPublishedMaterial(`43b-A-${t}`);
    const matB = insertPublishedMaterial(`43b-B-${t}`);
    insertPublishedMaterial(`43b-C-${t}`);
    // Ordem importa na limpeza: questões (e seus vínculos) antes dos materiais.
    cleanup.push(() => deleteE2EQuestions());
    cleanup.push(() => deleteE2EMaterials());
    insertPublishedQuestion('cobra A e B', [matA, matB]);
    insertPublishedQuestion('cobra só B', [matB]);

    const student = await createTestUser({
      emailLocalPart: `e2e-43b-aluno-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'student',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(student.id));

    await login(page, student);

    await resolverQuestoesDoMaterial(page, titleA);
    await expect(page.getByText('Exibindo')).toContainText('1 questões');
    await expect(page.getByText(`${STEM_PREFIX}cobra A e B`).first()).toBeVisible();

    await resolverQuestoesDoMaterial(page, titleB);
    await expect(page.getByText('Exibindo')).toContainText('2 questões');

    // Material sem questão vinculada: cai no tema, como antes (questões sem
    // vínculo e as dos outros materiais do tema continuam acessíveis por lá).
    const seed = getSeedIds();
    const doTema = psqlLocal(
      `select count(*) from public.questions where theme_id = '${seed.themeId}' and status = 'published';`
    );
    await resolverQuestoesDoMaterial(page, titleC);
    await expect(page.getByText('Exibindo')).toContainText(`${doTema} questões`);
  });

  test('"Materiais cobrados por este lote" vale para todas as questões importadas', async ({ page }) => {
    const t = `${Date.now()}`;
    const titleA = `${MATERIAL_PREFIX}43b-lote-A-${t}`;
    const titleB = `${MATERIAL_PREFIX}43b-lote-B-${t}`;
    const matA = insertPublishedMaterial(`43b-lote-A-${t}`);
    const matB = insertPublishedMaterial(`43b-lote-B-${t}`);
    cleanup.push(() => deleteE2EQuestions());
    cleanup.push(() => deleteE2EMaterials());

    const admin = await createTestUser({
      emailLocalPart: `e2e-43b-admin-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'admin',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(admin.id));

    const seed = getSeedIds();
    const disciplina = psqlLocal(`select name from public.disciplines where id = '${seed.disciplineId}';`);
    const tema = psqlLocal(`select name from public.themes where id = '${seed.themeId}';`);
    const bloco = (n: number) =>
      `## Questão ${n}\n\n**Disciplina:** ${disciplina}\n**Tema:** ${tema}\n**Instituição / Banca:** E2E\n**Ano:** 2026\n\n` +
      `**Comando da Questão (Pergunta):**\n${STEM_PREFIX}lote ${n} ${t}\n\n**A)** Certa [GABARITO]\n**Explicação A:** Sim.\n**B)** Errada\n**Explicação B:** Não.\n`;

    await login(page, admin);
    await page.locator('#btn-user-profile-menu').click();
    await page.getByRole('menuitem', { name: 'Área Editorial / CMS' }).click();
    await page.getByRole('button', { name: 'Questões Comentadas', exact: false }).click();
    await page.getByRole('button', { name: /Importar questões/ }).click();

    const modal = page.getByTestId('import-questions-modal');
    await modal.locator('input[type="file"]').setInputFiles({
      name: 'lote-43b.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(`${bloco(1)}\n${bloco(2)}`),
    });
    await expect(modal.getByText(/2 questão\(ões\) encontrada\(s\)/)).toBeVisible();

    const busca = modal.getByLabel('Materiais cobrados por este lote');
    await busca.fill(titleA);
    await modal.getByRole('button', { name: new RegExp(`^${titleA}`) }).click();
    await busca.fill(titleB);
    await modal.getByRole('button', { name: new RegExp(`^${titleB}`) }).click();

    await modal.getByRole('button', { name: /Importar 2 rascunho/ }).click();
    await expect(modal.getByText(/2 de 2 rascunho\(s\) criado\(s\) com sucesso/)).toBeVisible({ timeout: 15_000 });

    const vinculos = psqlLocal(
      `select string_agg(qm.material_id::text, ',' order by qm.sort_order) from public.questions q ` +
        `join public.question_materials qm on qm.question_id = q.id ` +
        `where q.question_stem like '${STEM_PREFIX}lote % ${t}' group by q.id order by 1;`
    );
    expect(vinculos.split('\n')).toEqual([`${matA},${matB}`, `${matA},${matB}`]);
  });
});
