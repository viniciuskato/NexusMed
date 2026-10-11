import { test, expect, type Page } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  getSeedIds,
  psqlLocal,
  runCleanup,
  type CreatedTestUser,
} from '../fixtures/localSupabase';

// IMPORT-2 (D-14), contra o Supabase local de verdade: o admin cola o texto de
// uma prova no modal "Importar questões", vê a prévia e confirma; as questões
// válidas viram rascunhos pelo caminho que já existe (RPC import_question_draft).

const STEM_PREFIX = 'e2e-import2-';
const BANCA = 'E2E-IMPORT2';

async function login(page: Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

function deleteE2EQuestions(): void {
  psqlLocal(`update public.questions set status = 'draft' where question_stem like '${STEM_PREFIX}%' and status = 'published';`);
  psqlLocal(`delete from public.questions where question_stem like '${STEM_PREFIX}%';`);
}

test.describe('IMPORT-2 — colar o texto da prova', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
  });

  test('cola 2 questões no modal e cria 2 rascunhos, com banca, ano e gabarito do texto', async ({ page }) => {
    const t = `${Date.now()}`;
    // Ordem importa na limpeza: as questões antes do usuário que as criou (AGENTS.md, itens 12 e 18).
    cleanup.push(() => deleteE2EQuestions());

    const admin = await createTestUser({
      emailLocalPart: `e2e-import2-admin-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'admin',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(admin.id));

    const seed = getSeedIds();
    const disciplina = psqlLocal(`select name from public.disciplines where id = '${seed.disciplineId}';`);
    const tema = psqlLocal(`select name from public.themes where id = '${seed.themeId}';`);

    const prova =
      `PROVA DE RESIDÊNCIA - E2E\n\n` +
      `1. ${STEM_PREFIX}a-${t} Mulher de 30 anos com tosse\ncrônica. Qual o diagnóstico?\nA) Asma\nB) DPOC\nC) Sarcoidose\nD) Tuberculose\n` +
      `2. ${STEM_PREFIX}b-${t} Qual a conduta?\nA) Observar\nB) Internar\nC) Alta\n\n` +
      `Gabarito\n1-B\n2-A\n`;

    await login(page, admin);
    await page.locator('#btn-user-profile-menu').click();
    await page.getByRole('menuitem', { name: 'Área Editorial / CMS' }).click();
    await page.getByRole('button', { name: 'Questões Comentadas', exact: false }).click();
    await page.getByRole('button', { name: /Importar questões/ }).click();

    const modal = page.getByTestId('import-questions-modal');
    const ler = modal.getByRole('button', { name: 'Ler texto e ver a prévia' });
    await expect(ler).toBeDisabled();

    await modal.getByLabel('Banca / instituição').fill(BANCA);
    await modal.getByLabel('Ano').fill('2025');
    await modal.getByLabel('Texto da prova').fill(prova);
    await expect(ler).toBeEnabled();
    await ler.click();

    await expect(modal.getByText(/2 questão\(ões\) encontrada\(s\) no texto colado/)).toBeVisible();
    await expect(modal.getByTestId('import-questions-lote')).toContainText(`${BANCA} · Ano: 2025`);

    await modal.getByLabel('Disciplina para todas').selectOption({ label: disciplina });
    await modal.getByLabel('Tema para todas').selectOption({ label: tema });
    await modal.getByRole('button', { name: 'Aplicar a todas', exact: true }).click();

    await modal.getByRole('button', { name: /Importar 2 rascunho/ }).click();
    await expect(modal.getByText(/2 de 2 rascunho\(s\) criado\(s\) com sucesso/)).toBeVisible({ timeout: 15_000 });

    const rascunhos = psqlLocal(
      `select count(*) from public.questions where question_stem like '${STEM_PREFIX}%-${t} %' ` +
        `and status = 'draft' and institution = '${BANCA}' and year = 2025;`
    );
    expect(rascunhos).toBe('2');

    const corretas = psqlLocal(
      `select string_agg(o.letter, ',' order by q.question_stem) from public.questions q ` +
        `join public.question_options o on o.question_id = q.id ` +
        `join public.question_option_keys k on k.option_id = o.id ` +
        `where q.question_stem like '${STEM_PREFIX}%-${t} %' and k.is_correct;`
    );
    expect(corretas).toBe('B,A');

    const alternativas = psqlLocal(
      `select string_agg(n::text, ',' order by stem) from (select q.question_stem as stem, count(*) as n from public.questions q ` +
        `join public.question_options o on o.question_id = q.id where q.question_stem like '${STEM_PREFIX}%-${t} %' group by q.question_stem) x;`
    );
    expect(alternativas).toBe('4,3');
  });
});
