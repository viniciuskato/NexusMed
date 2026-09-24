import { test, expect, type Page } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  getSeedIds,
  insertMaterialLink,
  psqlLocal,
  runCleanup,
  type CreatedTestUser,
} from '../fixtures/localSupabase';

// 43-A — formulário do material mais curto, provado no navegador contra
// Supabase LOCAL:
//   1. "Importar material": sem "Tipo do nó"/"Estude antes"/"Veja também";
//      pai de OUTRA disciplina define disciplina e tema; o material vai para o
//      fim dos irmãos; `### Palavras-chave` do arquivo vira palavras-chave.
//   2. Formulário de edição de um material ATESTADO, com tipo do nó e ligações
//      antigas: os campos congelados não aparecem, e reposicioná-lo sob um pai
//      da mesma disciplina (outro tema) grava a posição sem mexer no tema, no
//      tipo do nó nem nas ligações — a revisão aprovada continua valendo.

const P = 'e2e-43a-';

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

function sql(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function insertReturningId(statement: string): string {
  return psqlLocal(statement).split('\n')[0].trim();
}

function insertMaterial(
  title: string,
  opts: { disciplineId: string; themeId: string; parentId?: string; sortOrder?: number; taxonomyKind?: string }
): string {
  return insertReturningId(
    `insert into public.materials (discipline_id, theme_id, title, parent_material_id, tree_sort_order, taxonomy_kind) values (` +
      `'${opts.disciplineId}', '${opts.themeId}', ${sql(P + title)}, ` +
      `${opts.parentId ? `'${opts.parentId}'` : 'null'}, ${opts.sortOrder ?? 0}, ` +
      `${opts.taxonomyKind ? sql(opts.taxonomyKind) : 'null'}) returning id;`
  );
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

function cleanupAll(): void {
  const mine = `(select id from public.materials where title like '${P}%')`;
  // Revisões referenciam o autor (FK restrict, de propósito) e os materiais.
  psqlLocal(
    `delete from public.content_reviews where content_revision_id in (select id from public.content_revisions where material_id in ${mine});`
  );
  psqlLocal(`delete from public.content_revisions where material_id in ${mine};`);
  psqlLocal(`delete from public.material_links where source_material_id in ${mine} or target_material_id in ${mine};`);
  // Filhos antes dos pais (parent_material_id é on delete restrict).
  psqlLocal(`delete from public.materials where title like '${P}%' and parent_material_id is not null;`);
  psqlLocal(`delete from public.materials where title like '${P}%';`);
  psqlLocal(`delete from public.themes where name like '${P}%';`);
}

/** Uma disciplina diferente da do seed, para o arquivo importado "vir" de outra casa. */
function ensureOtherDiscipline(): void {
  if (!psqlLocal(`select id from public.disciplines where code = 'INFECTO' limit 1;`)) {
    psqlLocal(
      `insert into public.disciplines (name, code, icon, description, cycle, color, sort_order) ` +
        `values ('Infectologia', 'INFECTO', 'bug', 'Disciplina de teste.', 'clinico', '#0f766e', 90);`
    );
  }
  const infecto = psqlLocal(`select id from public.disciplines where code = 'INFECTO' limit 1;`);
  if (!psqlLocal(`select id from public.themes where discipline_id = '${infecto}' and name = 'Clínica' limit 1;`)) {
    psqlLocal(
      `insert into public.themes (discipline_id, name, description, high_yield, sort_order) ` +
        `values ('${infecto}', 'Clínica', 'Tema de teste.', false, 1);`
    );
  }
}

const IMPORTED_TITLE = `${P}Material importado`;
const importedMarkdown = `# ${IMPORTED_TITLE}

**Subtítulo:** Fixture sintética da 43-A
**Disciplina:** Infectologia
**Tema:** Clínica
**Autor:** Fixture de teste
**Tempo estimado de leitura:** 10 minutos

### Visão geral
**Tag de Mecanismo:** Visão geral

Texto sintético da seção [1](#ref-1).

### Palavras-chave
\`e2e-sigla-43a\` \`e2e-sinonimo-43a\`

### Referências Bibliográficas
1. Referência sintética. [Livro-texto]
`;

test.describe('43-A — formulário do material mais curto', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.beforeEach(() => cleanupAll()); // resíduo de execução interrompida

  test.afterEach(async () => {
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
  });

  test('importar: pai de outra disciplina define disciplina e tema, e o material vai para o fim dos irmãos', async ({ page }) => {
    ensureOtherDiscipline();
    const seed = getSeedIds();
    const seedDisciplineName = psqlLocal(`select name from public.disciplines where id = '${seed.disciplineId}';`);
    const paiId = insertMaterial('Pai', { disciplineId: seed.disciplineId, themeId: seed.themeId });
    insertMaterial('Filho existente', { disciplineId: seed.disciplineId, themeId: seed.themeId, parentId: paiId, sortOrder: 10 });

    const admin = await createTestUser({
      emailLocalPart: `f43a-imp-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'admin',
      status: 'active',
    });
    // runCleanup executa NA ORDEM DADA: materiais/revisões antes do usuário.
    cleanup.push(() => cleanupAll());
    cleanup.push(() => deleteTestUser(admin.id));

    await login(page, admin);
    await openEditorialArea(page);

    await page.getByRole('button', { name: 'Importar material' }).click();
    const dialog = page.getByRole('dialog', { name: 'Importar material' });
    await dialog.locator('#import-material-file-input').setInputFiles({
      name: 'material-43a.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(importedMarkdown, 'utf-8'),
    });

    // Campos congelados fora da tela; o bloco de palavras-chave do arquivo foi lido.
    await expect(dialog.getByText('Palavras-chave (sinônimos, siglas, nomes comerciais)')).toBeVisible();
    await expect(dialog.getByText('e2e-sigla-43a, e2e-sinonimo-43a')).toBeVisible();
    await expect(dialog.getByText(/tipo do nó/i)).toHaveCount(0);
    await expect(dialog.getByText(/estude antes/i)).toHaveCount(0);
    await expect(dialog.getByText(/veja também/i)).toHaveCount(0);
    await expect(dialog.getByTestId('import-discipline-value')).toContainText('Infectologia');

    // Pai de outra disciplina: disciplina e tema passam a ser os dele; ordem no fim.
    await dialog.locator('#import-material-parent').selectOption(paiId);
    await expect(dialog.getByTestId('import-discipline-value')).toContainText(seedDisciplineName);
    await expect(dialog.getByTestId('import-theme-select')).toHaveValue(seed.themeId);
    await expect(dialog.locator('#import-material-order')).toHaveValue('20');

    await dialog.getByRole('button', { name: 'Salvar rascunho' }).click();
    await expect(dialog.getByTestId('import-success-trail')).toContainText(`${P}Pai`, { timeout: 15_000 });

    const row = psqlLocal(
      `select discipline_id || '|' || theme_id || '|' || parent_material_id || '|' || tree_sort_order || '|' || ` +
        `coalesce(taxonomy_kind, 'NULO') || '|' || array_to_string(tags, ',') from public.materials where title = ${sql(IMPORTED_TITLE)};`
    );
    expect(row).toBe(`${seed.disciplineId}|${seed.themeId}|${paiId}|20|NULO|e2e-sigla-43a,e2e-sinonimo-43a`);
    expect(
      psqlLocal(
        `select count(*) from public.material_links where source_material_id = (select id from public.materials where title = ${sql(IMPORTED_TITLE)});`
      )
    ).toBe('0');
  });

  test('editar material atestado: congelados intactos, e mudar o pai na mesma disciplina não mexe no tema nem na atestação', async ({ page }) => {
    const seed = getSeedIds();
    const outroTemaId = insertReturningId(
      `insert into public.themes (discipline_id, name, description, high_yield, sort_order) ` +
        `values ('${seed.disciplineId}', '${P}Outro tema', 'Tema de teste.', false, 99) returning id;`
    );
    const novoPaiId = insertMaterial('Novo pai (outro tema)', { disciplineId: seed.disciplineId, themeId: outroTemaId });
    const baseId = insertMaterial('Base', { disciplineId: seed.disciplineId, themeId: seed.themeId });
    const relacionadoId = insertMaterial('Relacionado', { disciplineId: seed.disciplineId, themeId: seed.themeId });
    const materialId = insertMaterial('Material com ligações', {
      disciplineId: seed.disciplineId,
      themeId: seed.themeId,
      taxonomyKind: 'classe',
    });
    // Subtítulo e tempo de leitura: sem eles o navegador nem envia o formulário
    // (tempo nulo aparece como 0 num campo com mínimo 1 — achado da 43-A,
    // registrado no plano; fora do escopo desta unidade).
    psqlLocal(
      `update public.materials set subtitle = 'Subtítulo de teste', estimated_read_time_minutes = 10 where id = '${materialId}';`
    );
    // Ordem a partir de 0, como as RPCs e as cargas gravam — outra base seria
    // renumerada no "Salvar" e mudaria o hash por causa do fixture, não do código.
    psqlLocal(
      `insert into public.material_sections (material_id, sort_order, title, mechanism_tag, content, key_takeaways) ` +
        `values ('${materialId}', 0, 'Seção', 'Visão geral', 'Conteúdo de teste.', array['ponto']);`
    );
    psqlLocal(
      `insert into public.material_references (material_id, sort_order, citation_text) values ('${materialId}', 0, 'Referência de teste.');`
    );
    // Ordem gravada fora do passo de 10 — o formulário antigo renumerava.
    insertMaterialLink(materialId, baseId, 'prerequisite', 5);
    insertMaterialLink(materialId, relacionadoId, 'related', 7);

    const linksOf = () =>
      psqlLocal(
        `select string_agg(link_type || ':' || case when source_material_id = '${materialId}' then target_material_id else source_material_id end || ':' || sort_order, ',' order by link_type) ` +
          `from public.material_links where source_material_id = '${materialId}' or target_material_id = '${materialId}';`
      );
    const linksBefore = linksOf();
    expect(linksBefore).toBe(`prerequisite:${baseId}:5,related:${relacionadoId}:7`);

    const admin = await createTestUser({
      emailLocalPart: `f43a-edit-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'admin',
      status: 'active',
    });
    cleanup.push(() => cleanupAll());
    cleanup.push(() => deleteTestUser(admin.id));

    approveCurrentRevision(materialId, admin.id);
    expect(hasCurrentApproval(materialId)).toBe(true);

    await login(page, admin);
    await openEditorialArea(page);

    const row = page.locator(`[data-compendium-row-id="${materialId}"]`);
    await row.getByRole('button', { name: /Editar/ }).click();
    await row.getByRole('button', { name: /Metadados e posição na árvore/ }).click();

    const form = page.locator('form').filter({ has: page.locator('#admincmsview-parent') });
    await expect(form.getByLabel('Palavras-chave (sinônimos, siglas, nomes comerciais)')).toBeVisible();
    await expect(form.getByText(/tipo do nó/i)).toHaveCount(0);
    await expect(form.getByText(/estude antes/i)).toHaveCount(0);
    await expect(form.getByText(/veja também/i)).toHaveCount(0);

    // Pai da mesma disciplina, com outro tema: o tema do material fica.
    await form.locator('#admincmsview-parent').selectOption(novoPaiId);
    await expect(form.locator('#admincmsview-tema-vinculado-5')).toHaveValue(seed.themeId);
    await expect(form.locator('#admincmsview-disciplina-4')).toBeDisabled();
    await expect(form.locator('#admincmsview-order')).toHaveValue('10');
    await expect(page.getByTestId('admincmsview-aviso-atestacao')).toHaveCount(0);

    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.getByText(/atualizado com sucesso/i)).toBeVisible({ timeout: 15_000 });

    expect(
      psqlLocal(
        `select parent_material_id || '|' || tree_sort_order || '|' || theme_id || '|' || coalesce(taxonomy_kind, 'NULO') from public.materials where id = '${materialId}';`
      )
    ).toBe(`${novoPaiId}|10|${seed.themeId}|classe`);
    expect(linksOf()).toBe(linksBefore);
    expect(hasCurrentApproval(materialId)).toBe(true);
  });
});
