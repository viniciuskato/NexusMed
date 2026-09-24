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

// 43-D — busca de materiais no banco, pelo Ctrl+K.
//
// As regras da busca (acento, letra grega, prefixo, relevância, quem vê o quê)
// estão no pgTAP busca_materiais.test.sql; a tela com a RPC mockada, no teste
// de componente globalSearchModal.test.tsx. Aqui, o que só o navegador com o
// banco real prova: a RPC chamada pelo app autenticado, o trecho destacado
// sem HTML cru, o filtro "só o que ainda não li" com progresso de verdade, o
// clique abrindo o leitor na seção que casou, e o rascunho só para o admin.

const sqlText = (value: string) => `'${value.replace(/'/g, "''")}'`;

async function login(page: Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

async function search(page: Page, query: string) {
  await page.keyboard.press('Control+k');
  const input = page.getByRole('textbox', { name: 'Pesquisar no acervo' });
  await expect(input).toBeVisible();
  await input.fill(query);
}

/** Material com seções próprias, direto por SQL (como `postgres`, que pode inserir já publicado). */
function insertMaterial(opts: {
  title: string;
  status: 'published' | 'draft';
  parentId?: string;
  navShortTitle?: string;
  minutes?: number;
  sections: { title: string; content: string }[];
}): { id: string; sectionIds: string[] } {
  const seed = getSeedIds();
  const id = psqlLocal(
    `insert into public.materials (discipline_id, theme_id, title, status, parent_material_id, nav_short_title, estimated_read_time_minutes) ` +
      `values ('${seed.disciplineId}', '${seed.themeId}', ${sqlText(opts.title)}, '${opts.status}', ` +
      `${opts.parentId ? `'${opts.parentId}'` : 'null'}, ${opts.navShortTitle ? sqlText(opts.navShortTitle) : 'null'}, ` +
      `${opts.minutes ?? 5}) returning id;`
  )
    .split('\n')[0]
    .trim();
  const sectionIds = opts.sections.map((section, i) =>
    psqlLocal(
      `insert into public.material_sections (material_id, sort_order, title, content) ` +
        `values ('${id}', ${i}, ${sqlText(section.title)}, ${sqlText(section.content)}) returning id;`
    )
      .split('\n')[0]
      .trim()
  );
  return { id, sectionIds };
}

function seedSearch() {
  const tag = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  // Termo só de letras, único por execução: nada de outra execução casa com ele.
  const token = `zq${tag.replace(/\d/g, (d) => 'abcdefghij'[Number(d)])}`;
  const raizShort = `Antimicrobianos ${tag}`;

  const raiz = insertMaterial({
    title: `${MATERIAL_PREFIX}busca-raiz-${tag}`,
    status: 'published',
    navShortTitle: raizShort,
    sections: [{ title: 'Visão geral', content: 'Classes de fármacos.' }],
  });
  const filler = Array.from({ length: 40 }, (_, i) => `Parágrafo ${i + 1} sobre a parede celular.`).join('\n\n');
  const cef = insertMaterial({
    title: `${MATERIAL_PREFIX}Cefalosporinas-${tag}`,
    status: 'published',
    parentId: raiz.id,
    minutes: 12,
    sections: [
      { title: 'Mecanismo de ação', content: filler },
      {
        title: 'Espectro por geração',
        content: `A **ceftriaxona** (${token}) atravessa a barreira hematoencefálica. <img src=x onerror="window.__xss=1">`,
      },
    ],
  });
  const lido = insertMaterial({
    title: `${MATERIAL_PREFIX}Lido-${tag}`,
    status: 'published',
    sections: [{ title: 'Revisão', content: `Também cita ${token} e a barreira hematoencefálica.` }],
  });
  const rascunho = insertMaterial({
    title: `${MATERIAL_PREFIX}Rascunho-${tag}`,
    status: 'draft',
    sections: [{ title: 'Espectro', content: `Em revisão: ${token} e a barreira hematoencefálica.` }],
  });
  return { tag, token, raizShort, raiz, cef, lido, rascunho };
}

test.describe('43-D — busca como base de artigos científicos', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
  });

  async function createUser(localPart: string, role: 'student' | 'admin'): Promise<CreatedTestUser> {
    const user = await createTestUser({
      emailLocalPart: `${localPart}-${Date.now()}`,
      password: 'senha-teste-123',
      role,
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(user.id));
    return user;
  }

  test('estudante acha sem acento, vê onde está e o trecho, filtra o que já leu e abre na seção', async ({ page }) => {
    const s = seedSearch();
    cleanup.push(() => deleteE2EMaterials());
    const user = await createUser('e2e-43d-estudante', 'student');
    psqlLocal(
      `insert into public.reading_progress (user_id, material_id, read_section_ids, percent) ` +
        `values ('${user.id}', '${s.lido.id}', array['${s.lido.sectionIds[0]}']::uuid[], 100);`
    );

    await login(page, user);
    // Sem acento e em outra ordem: "hematoencefalica <termo>".
    await search(page, `hematoencefalica ${s.token}`);

    const dialog = page.getByRole('dialog', { name: 'Busca global' });
    const cefResult = dialog.getByRole('button', { name: new RegExp(`Cefalosporinas-${s.tag}`) });
    await expect(cefResult).toBeVisible();
    // Onde está na árvore (disciplina + ancestral pelo rótulo curto), seção, trecho e tempo.
    await expect(cefResult.getByText(`Cardiologia › ${s.raizShort}`, { exact: true })).toBeVisible();
    await expect(cefResult.getByText('Espectro por geração', { exact: true })).toBeVisible();
    await expect(cefResult.locator('mark', { hasText: 'hematoencefálica' })).toBeVisible();
    await expect(cefResult.getByText('12 min de leitura')).toBeVisible();
    // Texto do admin nunca vira HTML: a tag aparece como texto e não roda.
    await expect(cefResult).toContainText('<img src=x onerror="window.__xss=1">');
    expect(await cefResult.locator('img').count()).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __xss?: unknown }).__xss)).toBeUndefined();

    // O estudante nunca encontra rascunho.
    const lidoResult = dialog.getByRole('button', { name: new RegExp(`Lido-${s.tag}`) });
    await expect(lidoResult).toBeVisible();
    await expect(dialog.getByRole('button', { name: new RegExp(`Rascunho-${s.tag}`) })).toHaveCount(0);

    // "Só o que ainda não li" tira o material com seção lida.
    await dialog.getByRole('checkbox', { name: 'Só o que ainda não li' }).check();
    await expect(lidoResult).toHaveCount(0);
    await expect(cefResult).toBeVisible();

    // O clique abre o leitor direto na seção que casou.
    await cefResult.click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(`section[id="${s.cef.sectionIds[1]}"]`)).toBeInViewport();
    await expect(page.getByRole('heading', { name: 'Espectro por geração', exact: true })).toBeInViewport();
  });

  test('administrador encontra também o rascunho, marcado como rascunho', async ({ page }) => {
    const s = seedSearch();
    cleanup.push(() => deleteE2EMaterials());
    const admin = await createUser('e2e-43d-admin', 'admin');

    await login(page, admin);
    await search(page, `${s.token} hematoencefálica`);

    const dialog = page.getByRole('dialog', { name: 'Busca global' });
    const draftResult = dialog.getByRole('button', { name: new RegExp(`Rascunho-${s.tag}`) });
    await expect(draftResult).toBeVisible();
    await expect(draftResult.getByText('Rascunho', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: new RegExp(`Cefalosporinas-${s.tag}`) })).toBeVisible();
  });
});
