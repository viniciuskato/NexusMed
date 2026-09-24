import { test, expect, type Page } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  deleteE2EMaterials,
  insertPublishedMaterial,
  setMaterialParent,
  setMaterialNavShortTitle,
  insertMaterialLink,
  unpublishMaterialDirect,
  runCleanup,
  type CreatedTestUser,
} from '../fixtures/localSupabase';

// Taxonomia, Fase 3 — navegação da árvore para o ESTUDANTE.
//
// A lógica pura (construção da árvore, ancestrais, trilha) é provada por
// teste unitário (tests/unit/materialTree.test.ts) e a renderização isolada
// por teste de componente (tests/component/materialNavigation.test.tsx).
// Aqui provamos só o que exige navegador + banco real: a árvore montada a
// partir do que a RLS deixa o estudante ver, a travessia clicando, e o
// comportamento em viewport de celular.
//
// Condição de parada da Fase 3 (plano técnico §12): o estudante percorre o
// caminho completo até a folha e volta pela trilha, sem link quebrado.

/**
 * Abre a Biblioteca. No desktop ela vive no menu "Recursos" do header; no
 * viewport de celular, no dock inferior — o teste mobile precisa do segundo
 * caminho, então detectamos qual está visível em vez de fixar um.
 */
async function openLibrary(page: Page) {
  const desktopTrigger = page.locator('#nav-resources');
  if (await desktopTrigger.isVisible()) {
    await desktopTrigger.click();
    await expect(page.locator('#nav-resources-menu')).toBeVisible();
    await page.locator('#nav-resources-compendiums').click();
  } else {
    await page.locator('#dock-nav-resources').click();
    await expect(page.locator('#dock-resources-menu')).toBeVisible();
    await page.locator('#dock-resources-compendiums').click();
  }
  await expect(page.getByRole('button', { name: 'Modo árvore' })).toBeVisible();
}

async function login(page: Page, user: CreatedTestUser) {
  await page.goto('/');
  await page.locator('#auth-email-input').fill(user.email);
  await page.locator('#auth-password-input').fill(user.password);
  await page.locator('#btn-auth-submit').click();
  await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
}

/**
 * Árvore do piloto, reduzida ao que prova a navegação:
 *   raiz → classe → folha, mais um material "relacionado" fora do ramo e um
 *   pré-requisito.
 *
 * Cada chamada usa um sufixo único: sem isso, um resíduo de execução anterior
 * deixaria dois materiais com o mesmo título e todo seletor por nome viraria
 * ambíguo (strict mode violation), escondendo a falha real atrás de um erro
 * de teste. Os títulos devolvidos são usados como seletor EXATO.
 */
function seedTree() {
  const tag = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const titles = {
    raiz: `e2e-22a-atb-raiz-${tag}`,
    classe: `e2e-22a-atb-classe-${tag}`,
    folha: `e2e-22a-atb-folha-${tag}`,
    prereq: `e2e-22a-atb-prereq-${tag}`,
    relacionado: `e2e-22a-atb-relacionado-${tag}`,
  };

  const raiz = insertPublishedMaterial(`atb-raiz-${tag}`);
  const classe = insertPublishedMaterial(`atb-classe-${tag}`);
  const folha = insertPublishedMaterial(`atb-folha-${tag}`);
  const prereq = insertPublishedMaterial(`atb-prereq-${tag}`);
  const relacionado = insertPublishedMaterial(`atb-relacionado-${tag}`);

  setMaterialParent(classe, raiz, 10);
  setMaterialParent(folha, classe, 10);
  // Rótulo curto: a trilha deve mostrar este, não o título completo.
  const classeShort = `Classe curta ${tag}`;
  setMaterialNavShortTitle(classe, classeShort);

  // prereq fica FORA do ramo de folha (ancestral não pode ser pré-requisito —
  // o banco recusa, ver validate_material_link_publication).
  insertMaterialLink(folha, prereq, 'prerequisite', 0);
  insertMaterialLink(folha, relacionado, 'related', 0);

  return { ids: { raiz, classe, folha, prereq, relacionado }, titles, classeShort };
}

test.describe('Taxonomia — navegação do estudante (Fase 3)', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
  });

  async function setupStudent(localPart: string): Promise<CreatedTestUser> {
    const user = await createTestUser({
      emailLocalPart: `${localPart}-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'student',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(user.id));
    return user;
  }

  /** Abre a biblioteca no modo árvore e devolve o container da árvore da disciplina do seed. */
  async function openTree(page: Page) {
    await openLibrary(page);
    await page.getByRole('button', { name: 'Modo árvore' }).click();
  }

  test('estudante desce a árvore da biblioteca até a folha e volta pela trilha', async ({ page }) => {
    const { titles, classeShort } = seedTree();
    cleanup.push(() => deleteE2EMaterials());
    const user = await setupStudent('e2e-fase3-arvore');
    await login(page, user);
    await openTree(page);

    // A raiz aparece; a folha só depois de expandir os dois níveis.
    await expect(page.getByRole('button', { name: titles.raiz, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: titles.folha, exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: `Expandir ${titles.raiz}`, exact: true }).click();
    // Rótulo curto no lugar do título completo.
    await expect(page.getByRole('button', { name: classeShort, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: titles.classe, exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: `Expandir ${classeShort}`, exact: true }).click();
    const folhaItem = page.getByRole('button', { name: titles.folha, exact: true });
    await expect(folhaItem).toBeVisible();

    // Abre a folha: o leitor mostra a trilha.
    await folhaItem.click();
    const trilha = page.getByRole('navigation', { name: 'Trilha de navegação' });
    await expect(trilha).toBeVisible();

    // Trilha colapsada por padrão (2 ancestrais): expande e confere o caminho.
    await trilha.getByRole('button', { name: /Mostrar os 2 níveis anteriores/ }).click();
    await expect(trilha.getByRole('button', { name: titles.raiz, exact: true })).toBeVisible();
    await expect(trilha.getByRole('button', { name: classeShort, exact: true })).toBeVisible();

    // Sobe um nível clicando na trilha.
    await trilha.getByRole('button', { name: classeShort, exact: true }).click();
    // Agora estamos na classe: ela tem a folha como filho em "Aprofunde-se".
    const aprofunde = page.getByRole('region', { name: 'Aprofunde-se' });
    await expect(aprofunde).toBeVisible();
    await expect(aprofunde.getByRole('button', { name: new RegExp(titles.folha) })).toBeVisible();
  });

  test('caixas "Estude antes" e "Veja também" levam aos materiais certos', async ({ page }) => {
    const { titles, classeShort } = seedTree();
    cleanup.push(() => deleteE2EMaterials());
    const user = await setupStudent('e2e-fase3-links');
    await login(page, user);
    await openTree(page);

    await page.getByRole('button', { name: `Expandir ${titles.raiz}`, exact: true }).click();
    await page.getByRole('button', { name: `Expandir ${classeShort}`, exact: true }).click();
    await page.getByRole('button', { name: titles.folha, exact: true }).click();

    // As duas caixas existem e são distintas.
    const antes = page.getByRole('region', { name: 'Estude antes' });
    const tambem = page.getByRole('region', { name: 'Veja também' });
    await expect(antes.getByRole('button', { name: titles.prereq, exact: true })).toBeVisible();
    await expect(tambem.getByRole('button', { name: titles.relacionado, exact: true })).toBeVisible();

    // Clicar em "Veja também" abre o material relacionado.
    await tambem.getByRole('button', { name: titles.relacionado, exact: true }).click();
    await expect(page.getByRole('heading', { name: titles.relacionado, exact: true, level: 1 })).toBeVisible();
  });

  test('link para material despublicado desaparece, em vez de virar link quebrado', async ({ page }) => {
    const { ids, titles, classeShort } = seedTree();
    cleanup.push(() => deleteE2EMaterials());
    // O destino do "Veja também" volta a rascunho: a policy
    // material_links_select_published deixa de entregar a ligação ao estudante.
    unpublishMaterialDirect(ids.relacionado);

    const user = await setupStudent('e2e-fase3-rascunho');
    await login(page, user);
    await openTree(page);

    await page.getByRole('button', { name: `Expandir ${titles.raiz}`, exact: true }).click();
    await page.getByRole('button', { name: `Expandir ${classeShort}`, exact: true }).click();
    await page.getByRole('button', { name: titles.folha, exact: true }).click();

    // "Estude antes" continua (destino publicado); "Veja também" sumiu.
    await expect(page.getByRole('region', { name: 'Estude antes' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Veja também' })).toHaveCount(0);
    await expect(page.getByText(titles.relacionado, { exact: true })).toHaveCount(0);
  });

  test('em viewport de celular a trilha e os cartões continuam usáveis', async ({ page }) => {
    const { titles, classeShort } = seedTree();
    cleanup.push(() => deleteE2EMaterials());
    const user = await setupStudent('e2e-fase3-mobile');
    // Tudo em 390px, desde o login: a biblioteca é aberta pelo dock inferior.
    // Até a 45-J, a navegação era feita em largura de desktop e o viewport só
    // era reduzido depois, porque o widget "Plantão de Foco" cobria o item
    // "Biblioteca" do menu Recursos em tela estreita.
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, user);

    await openTree(page);
    await page.getByRole('button', { name: `Expandir ${titles.raiz}`, exact: true }).click();
    await page.getByRole('button', { name: `Expandir ${classeShort}`, exact: true }).click();
    await page.getByRole('button', { name: titles.folha, exact: true }).click();

    const trilha = page.getByRole('navigation', { name: 'Trilha de navegação' });
    await expect(trilha).toBeVisible();

    // Nenhum controle depende de hover: o botão de expandir a trilha é
    // clicável direto no toque, e a página não ganha rolagem horizontal.
    await trilha.getByRole('button', { name: /Mostrar os 2 níveis anteriores/ }).click();
    await expect(trilha.getByRole('button', { name: classeShort, exact: true })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
