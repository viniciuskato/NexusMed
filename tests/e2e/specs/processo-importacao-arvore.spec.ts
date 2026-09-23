import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, psqlLocal, runCleanup, type CreatedTestUser } from '../fixtures/localSupabase';

// O processo editorial REAL do dono do produto: produzir o material fora,
// IMPORTAR, posicionar na árvore, atestar e publicar.
//
// Antes (medido em 2026-09-23): a importação não aceitava posição, então todo
// material exigia um segundo passo pelo formulário de edição — e o "Salvar"
// desse formulário, mesmo sem nenhuma mudança, trocava mode nulo por
// "mecanismos" e recriava as referências com ids novos, invalidando a
// atestação. A ordem "posicionar antes de atestar" virava armadilha.
//
// Este spec prova, no navegador contra Supabase LOCAL, que:
//   1. a importação já sai posicionada, e o sucesso diz onde ficou;
//   2. o cartão do Admin mostra a posição e o que publicar antes;
//   3. abrir o material e clicar "Salvar alterações" sem mudar nada mantém a
//      revisão aprovada válida.

const TITLE = 'Meningite Bacteriana Aguda';
const PARENT_TITLE = 'e2e-proc-Infecções do SNC';
const YAML_PATH = path.resolve(process.env.E2E_MENINGITE_YAML ?? 'tests/e2e/fixtures/meningite-e2e.compendium.yaml');

async function login(page: Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

async function openEditorialArea(page: Page) {
  await page.locator('#btn-user-profile-menu').click();
  await page.getByRole('menuitem', { name: 'Área Editorial / CMS' }).click();
  await expect(page.getByRole('button', { name: /Publicar rascunhos/ })).toBeVisible();
}

/** Disciplina/tema do arquivo de fixture + um material-pai em RASCUNHO nessa disciplina. */
function seedParent(): { disciplineId: string; parentId: string } {
  if (!psqlLocal(`select id from public.disciplines where code = 'INFECTO' limit 1;`)) {
    psqlLocal(
      `insert into public.disciplines (name, code, icon, description, cycle, color, sort_order) ` +
        `values ('Infectologia', 'INFECTO', 'bug', 'Disciplina de teste.', 'clinico', '#0f766e', 90);`
    );
  }
  const disciplineId = psqlLocal(`select id from public.disciplines where code = 'INFECTO' limit 1;`);
  if (!psqlLocal(`select id from public.themes where discipline_id = '${disciplineId}' and name = 'Clínica' limit 1;`)) {
    psqlLocal(
      `insert into public.themes (discipline_id, name, description, high_yield, sort_order) ` +
        `values ('${disciplineId}', 'Clínica', 'Tema de teste.', false, 1);`
    );
  }
  const themeId = psqlLocal(`select id from public.themes where discipline_id = '${disciplineId}' and name = 'Clínica' limit 1;`);
  const parentId = psqlLocal(
    `insert into public.materials (discipline_id, theme_id, title) values ('${disciplineId}', '${themeId}', '${PARENT_TITLE}') returning id;`
  )
    .split('\n')[0]
    .trim();
  return { disciplineId, parentId };
}

/** Mesma aprovação que o painel de revisão grava (revisão + atestação "aprovado" com o hash atual). */
function approveCurrentRevision(materialId: string, adminId: string): void {
  psqlLocal(
    `with snap as (select app.build_material_snapshot('${materialId}') as s), ` +
      `rev as (insert into public.content_revisions (material_id, revision_number, snapshot, snapshot_hash, created_by, policy_version) ` +
      `select '${materialId}', 1, s, encode(extensions.digest(s::text, 'sha256'), 'hex'), '${adminId}', 'v1' from snap returning id, snapshot_hash) ` +
      `insert into public.content_reviews (content_revision_id, reviewer_user_id, decision, checklist, policy_version, revision_hash) ` +
      `select id, '${adminId}', 'aprovado', '{"e2e": true}'::jsonb, 'v1', snapshot_hash from rev;`
  );
}

function hasCurrentApproval(materialId: string): boolean {
  return psqlLocal(`select app.has_current_approved_revision('${materialId}', null);`) === 't';
}

function cleanupMaterials(): void {
  // Revisões referenciam o autor (FK restrict, de propósito) e os materiais:
  // limpar antes do usuário e dos materiais.
  psqlLocal(
    `delete from public.content_reviews where content_revision_id in (select id from public.content_revisions where material_id in ` +
      `(select id from public.materials where title in ('${TITLE}', '${PARENT_TITLE}')));`
  );
  psqlLocal(
    `delete from public.content_revisions where material_id in (select id from public.materials where title in ('${TITLE}', '${PARENT_TITLE}'));`
  );
  psqlLocal(
    `delete from public.material_links where source_material_id in (select id from public.materials where title in ('${TITLE}', '${PARENT_TITLE}')) ` +
      `or target_material_id in (select id from public.materials where title in ('${TITLE}', '${PARENT_TITLE}'));`
  );
  // Filho antes do pai (parent_material_id é on delete restrict).
  psqlLocal(`delete from public.materials where title = '${TITLE}';`);
  psqlLocal(`delete from public.materials where title = '${PARENT_TITLE}';`);
}

test.describe('Processo editorial: importar já na árvore, salvar sem perder atestação', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
  });

  test('importa posicionado, cartão mostra a ordem de publicação, e "Salvar" sem mudança mantém a atestação', async ({ page }) => {
    cleanupMaterials(); // resíduo de execução interrompida
    const { parentId } = seedParent();

    const admin = await createTestUser({
      emailLocalPart: `proc-import-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'admin',
      status: 'active',
    });
    // runCleanup executa NA ORDEM DADA: materiais e revisões primeiro, porque
    // content_revisions/content_reviews apontam para o autor com FK restrict
    // (de propósito) e bloqueiam apagar o usuário antes deles.
    cleanup.push(() => cleanupMaterials());
    cleanup.push(() => deleteTestUser(admin.id));

    await login(page, admin);
    await openEditorialArea(page);

    // ── 1. Importar já posicionado ──────────────────────────────────────
    await page.getByRole('button', { name: 'Importar material' }).click();
    const dialog = page.getByRole('dialog', { name: 'Importar material' });
    await dialog.locator('#import-material-file-input').setInputFiles(YAML_PATH);

    await dialog.locator('#import-material-parent').selectOption(parentId);
    await dialog.locator('#import-material-short').fill('Meningite');
    // A prévia mostra onde vai aparecer ANTES de gravar.
    await expect(dialog.getByTestId('import-material-nav-trail')).toContainText(`${PARENT_TITLE} › Meningite`);

    await dialog.getByRole('button', { name: 'Salvar rascunho' }).click();
    await expect(dialog.getByTestId('import-success-trail')).toContainText(`${PARENT_TITLE} › Meningite`, {
      timeout: 15_000,
    });
    await expect(dialog.getByText(/Próximos passos/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Fechar' }).click();

    const materialId = psqlLocal(`select id from public.materials where title = '${TITLE}';`);
    expect(psqlLocal(`select parent_material_id from public.materials where id = '${materialId}';`)).toBe(parentId);
    expect(psqlLocal(`select nav_short_title from public.materials where id = '${materialId}';`)).toBe('Meningite');

    // ── 2. Cartão do Admin: posição e ordem de publicação ───────────────
    const row = page.locator(`[data-compendium-row-id="${materialId}"]`);
    await expect(row.getByTestId('admin-card-tree-position')).toContainText(`${PARENT_TITLE} › Meningite`);
    // O pai está em rascunho: publicar a Meningite antes dele seria recusado.
    await expect(row.getByTestId('admin-card-publish-blockers')).toContainText(PARENT_TITLE);

    // ── 3. "Salvar" sem mudança não invalida a atestação ────────────────
    approveCurrentRevision(materialId, admin.id);
    expect(hasCurrentApproval(materialId)).toBe(true);
    const refIdsBefore = psqlLocal(
      `select string_agg(id::text, ',' order by sort_order) from public.material_references where material_id = '${materialId}';`
    );

    await row.getByRole('button', { name: /Editar/ }).click();
    await row.getByRole('button', { name: /Metadados e posição na árvore/ }).click();
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.getByText(/atualizado com sucesso/i)).toBeVisible({ timeout: 15_000 });

    // Antes da correção, este era o ponto em que a revisão aprovada morria.
    expect(hasCurrentApproval(materialId)).toBe(true);
    expect(
      psqlLocal(`select string_agg(id::text, ',' order by sort_order) from public.material_references where material_id = '${materialId}';`)
    ).toBe(refIdsBefore);
    expect(psqlLocal(`select coalesce(mode, 'NULO') from public.materials where id = '${materialId}';`)).toBe('NULO');
  });
});
