import { test, expect, type Browser, type Page } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  deleteE2EMaterials,
  insertPublishedMaterial,
  psqlLocal,
  runCleanup,
  MATERIAL_PREFIX,
  type CreatedTestUser,
} from '../fixtures/localSupabase';

// Unidade 45-K, contra o Supabase local de verdade: editar material publicado
// não muda o que o estudante lê até a edição ser atestada; aprovada, ela entra
// de uma vez; descartada, nada muda.

const ATESTADO = 'Conteúdo de teste.';
const EDITADO = 'Conteúdo EDITADO pela 45-K.';

async function login(page: Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

async function openContents(page: Page, title: string) {
  await page.locator('#btn-user-profile-menu').click();
  await page.getByRole('menuitem', { name: 'Área Editorial / CMS' }).click();
  await page.getByRole('button', { name: 'Conteúdos & Mecanismos', exact: false }).click();
  await page.getByPlaceholder('Buscar por título, subtítulo, tag ou conteúdo...').fill(title);
}

async function openEditForm(page: Page, materialId: string) {
  const row = page.locator(`[data-compendium-row-id="${materialId}"]`);
  await row.getByRole('button', { name: /Editar/ }).click();
  await row.getByRole('button', { name: /Conteúdo/ }).click();
}

async function editFirstSection(page: Page, materialId: string, text: string) {
  await openEditForm(page, materialId);
  await page.locator('#admincmsview-conteudo-teorico-markdown-texto-13').first().fill(text);
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByText(/Edição guardada à parte/)).toBeVisible({ timeout: 15_000 });
}

/** Abre o material como estudante, num navegador à parte, e devolve o texto das seções. */
async function studentReads(browser: Browser, student: CreatedTestUser, title: string): Promise<string> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, student);
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
  await expect(page.getByRole('heading', { name: 'Seção de teste 22-A' })).toBeVisible();
  const text = (await page.locator('body').innerText()) ?? '';
  await context.close();
  return text;
}

function approvedRevisionFor(materialId: string) {
  // Atestação inicial da versão publicada, como postgres (fixture).
  psqlLocal(
    `with r as (insert into public.content_revisions (material_id, revision_number, snapshot, snapshot_hash, created_by, policy_version) ` +
      `select '${materialId}', 1, app.build_material_snapshot('${materialId}'), ` +
      `encode(extensions.digest(app.build_material_snapshot('${materialId}')::text, 'sha256'), 'hex'), ` +
      `(select id from public.profiles where role = 'admin' and status = 'active' limit 1), 'v1' returning id, snapshot_hash) ` +
      `insert into public.content_reviews (content_revision_id, reviewer_user_id, decision, checklist, policy_version, revision_hash) ` +
      `select r.id, (select id from public.profiles where role = 'admin' and status = 'active' limit 1), 'aprovado', '{}'::jsonb, 'v1', r.snapshot_hash from r;`
  );
}

test.describe('45-K — edição de material publicado fica à parte até ser atestada', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
  });

  async function setup(localPart: string) {
    const t = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const title = `${MATERIAL_PREFIX}45k-${localPart}-${t}`;
    const materialId = insertPublishedMaterial(`45k-${localPart}-${t}`);
    cleanup.push(() => deleteE2EMaterials());
    const admin = await createTestUser({ emailLocalPart: `e2e-45k-adm-${Date.now()}`, password: 'senha-teste-123', role: 'admin', status: 'active' });
    const student = await createTestUser({ emailLocalPart: `e2e-45k-alu-${Date.now()}`, password: 'senha-teste-123', role: 'student', status: 'active' });
    cleanup.push(() => deleteTestUser(admin.id));
    cleanup.push(() => deleteTestUser(student.id));
    approvedRevisionFor(materialId);
    return { title, materialId, admin, student };
  }

  test('estudante lê a versão atestada até a edição ser aprovada; aprovada, entra de uma vez', async ({ page, browser }) => {
    const { title, materialId, admin, student } = await setup('aprova');

    await login(page, admin);
    await openContents(page, title);
    await editFirstSection(page, materialId, EDITADO);
    await expect(page.getByTestId(`compendium-pending-edit-${materialId}`)).toContainText('os alunos leem a versão atestada');

    const antes = await studentReads(browser, student, title);
    expect(antes).toContain(ATESTADO);
    expect(antes).not.toContain(EDITADO);

    await page.locator(`[data-compendium-row-id="${materialId}"]`).getByRole('button', { name: 'Revisão' }).click();
    const panel = page.locator('#provenance-review-panel');
    await expect(panel).toHaveAttribute('data-provenance-status', 'edicao_pendente');
    await expect(panel.locator('#provenance-pending-edit-notice')).toBeVisible();
    await panel.getByRole('button', { name: 'Criar revisão da edição pendente' }).click();
    await expect(panel).toHaveAttribute('data-provenance-status', 'edicao_pendente_em_revisao', { timeout: 10_000 });
    await panel.getByPlaceholder('Texto do claim').fill('Síntese de teste 45-K.');
    await panel.getByPlaceholder(/Localização estável/).fill('sections[0].content');
    await panel.getByRole('button', { name: 'Adicionar', exact: true }).click();
    await panel.getByRole('button', { name: 'Aprovar', exact: true }).click();
    await panel.getByRole('button', { name: 'Atestar — Aprovar revisão' }).click();
    await expect(panel).toHaveAttribute('data-provenance-status', 'aprovado_para_esta_versao', { timeout: 10_000 });

    const depois = await studentReads(browser, student, title);
    expect(depois).toContain(EDITADO);
    expect(depois).not.toContain(ATESTADO);
    expect(psqlLocal(`select status from public.materials where id = '${materialId}';`)).toBe('published');
    expect(psqlLocal(`select count(*) from public.material_pending_edits where material_id = '${materialId}';`)).toBe('0');
  });

  test('reabrir mostra a edição pendente, e descartar volta ao atestado sem mudar nada', async ({ page, browser }) => {
    const { title, materialId, admin, student } = await setup('descarta');

    await login(page, admin);
    await openContents(page, title);
    await editFirstSection(page, materialId, EDITADO);

    await openEditForm(page, materialId);
    await expect(page.locator('#compendium-form-pending-edit')).toBeVisible();
    await expect(page.locator('#admincmsview-conteudo-teorico-markdown-texto-13').first()).toHaveValue(EDITADO);

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Descartar edição pendente' }).click();
    await expect(page.getByText(/Edição pendente descartada/)).toBeVisible();
    await expect(page.getByTestId(`compendium-pending-edit-${materialId}`)).toHaveCount(0);

    expect(psqlLocal(`select count(*) from public.material_pending_edits where material_id = '${materialId}';`)).toBe('0');
    expect(await studentReads(browser, student, title)).toContain(ATESTADO);
  });
});
