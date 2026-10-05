import { test, expect, type Browser, type Page } from '@playwright/test';
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

// ED-2, contra o app real (build de teste) e o Supabase local: o admin abre um material, clica "Editar" numa seção, aplica
// negrito numa palavra e uma caixa "Cuidado" pelos botões do editor visual, salva, recarrega a página e vê o texto novo
// já formatado; a Área Editorial mostra uma versão nova no histórico da seção; e uma pessoa comum, na mesma página, não vê
// "Editar". Em tela de celular (375 px) o editor não cria rolagem horizontal.

const TITULO_DA_SECAO = 'Seção ED2 um';
const CONTEUDO_ORIGINAL = 'A palavra alvo precisa de negrito.\n\nSegundo parágrafo da seção, que vai para uma caixa.';
const CONTEUDO_ESPERADO = 'A palavra **alvo** precisa de negrito.\n\n> **Cuidado:** Segundo parágrafo da seção, que vai para uma caixa.';

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
  await page.getByRole('button', { name: 'Modo árvore' }).click();
}

async function abrirMaterial(page: Page, titulo: string) {
  await openLibraryTree(page);
  // Na árvore da biblioteca (a tela inicial também lista os materiais em andamento).
  await page.getByRole('list').getByRole('button', { name: titulo, exact: true }).click();
  await expect(page.getByRole('heading', { name: TITULO_DA_SECAO, exact: true })).toBeVisible({ timeout: 15_000 });
}

/** Material publicado, no tema do seed, com duas seções (a primeira com Pontos-chave e Pérola). Devolve os ids. */
function materialComDuasSecoes(titulo: string): { materialId: string; secaoId: string } {
  const seed = getSeedIds();
  const materialId = psqlLocal(
    `insert into public.materials (discipline_id, theme_id, title, subtitle, mode, study_lens, estimated_read_time_minutes, author, tags, provenance, source, license) ` +
      `values ('${seed.disciplineId}', '${seed.themeId}', '${MATERIAL_PREFIX}${titulo}', 'Material de teste ED-2', 'mecanismos', 'fisiopatologia', 3, 'E2E', array['e2e'], 'e2e-ed2', 'fixture', 'uso interno') returning id;`
  )
    .split('\n')[0]
    .trim();
  const secaoId = psqlLocal(
    `insert into public.material_sections (material_id, sort_order, title, mechanism_tag, content, key_takeaways, clinical_pearl) ` +
      `values ('${materialId}', 1, '${TITULO_DA_SECAO}', 'Fisiopatologia', E'${CONTEUDO_ORIGINAL.replace(/\n/g, '\\n')}', array['Ponto original ED2.'], 'Pérola original ED2.') returning id;`
  )
    .split('\n')[0]
    .trim();
  psqlLocal(
    `insert into public.material_sections (material_id, sort_order, title, mechanism_tag, content, key_takeaways) ` +
      `values ('${materialId}', 2, 'Seção ED2 dois', 'Fisiopatologia', 'Texto da segunda seção.', array['ponto']);`
  );
  psqlLocal(`update public.materials set status = 'published' where id = '${materialId}';`);
  return { materialId, secaoId };
}

/** Dá dois cliques no meio da palavra (como uma pessoa faria) para selecioná-la no editor. */
async function selecionarPalavra(page: Page, nome: string, palavra: string) {
  const alvo = await page
    .getByRole('textbox', { name: nome })
    .evaluate((raiz, p) => {
      // Traz o campo para o meio da tela (a barra de navegação fixa do rodapé cobre a borda de baixo).
      raiz.scrollIntoView({ block: 'center' });
      const caminho = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
      for (let no = caminho.nextNode(); no; no = caminho.nextNode()) {
        const i = (no.textContent ?? '').indexOf(p);
        if (i < 0) continue;
        const faixa = document.createRange();
        faixa.setStart(no, i + 1);
        faixa.setEnd(no, i + p.length - 1);
        const caixa = faixa.getBoundingClientRect();
        return { x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 };
      }
      return null;
    }, palavra);
  expect(alvo, `a palavra "${palavra}" aparece no campo "${nome}"`).not.toBeNull();
  await page.mouse.dblclick(alvo!.x, alvo!.y);
}

/** Põe o cursor dentro do parágrafo que contém o trecho. */
async function clicarNoTrecho(page: Page, nome: string, trecho: string) {
  await page.getByRole('textbox', { name: nome }).getByText(trecho).click();
}

async function novaPessoa(browser: Browser, user: CreatedTestUser, viewport?: { width: number; height: number }) {
  const contexto = await browser.newContext(viewport ? { viewport } : {});
  const pagina = await contexto.newPage();
  await login(pagina, user);
  return { contexto, pagina };
}

test.describe('ED-2 — editar a seção na página de leitura', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    const fns = cleanup;
    cleanup = [];
    await runCleanup(fns);
  });

  async function usuario(papel: 'admin' | 'student', prefixo: string) {
    const user = await createTestUser({ emailLocalPart: `${prefixo}-${Date.now()}`, password: 'senha-teste-123', role: papel, status: 'active' });
    // AGENTS.md, item 18: o histórico da seção (changed_by) aponta para o autor; apagar o material (que leva o histórico)
    // ANTES de apagar o usuário. `runCleanup` roda na ordem dada, então este fica por último.
    cleanup.push(() => deleteTestUser(user.id));
    return user;
  }

  test('o admin aplica negrito e uma caixa "Cuidado", salva, recarrega e vê formatado; o histórico ganha uma versão; o aluno não vê "Editar"', async ({ page, browser }) => {
    const tag = `${Date.now()}`;
    const titulo = `${MATERIAL_PREFIX}ed2-${tag}`;
    const { secaoId } = materialComDuasSecoes(`ed2-${tag}`);
    // O material (e com ele as seções e o histórico) sai antes dos usuários.
    cleanup.unshift(() => deleteE2EMaterials());
    const admin = await usuario('admin', 'e2e-ed2-admin');
    const aluno = await usuario('student', 'e2e-ed2-aluno');

    await login(page, admin);
    await abrirMaterial(page, titulo);

    // 1. O admin vê um "Editar" por seção.
    await expect(page.getByRole('button', { name: /^Editar a seção/ })).toHaveCount(2);

    // 2. "Editar" abre o editor no lugar da seção, com o texto já formatado (sem símbolos) e a barra de botões.
    await page.getByRole('button', { name: `Editar a seção ${TITULO_DA_SECAO}` }).click();
    const principal = page.getByRole('textbox', { name: 'Texto da seção' });
    await expect(principal).toBeVisible({ timeout: 15_000 });
    await expect(principal).toContainText('A palavra alvo precisa de negrito.');
    await expect(page.getByRole('textbox', { name: 'Pérola clínica' })).toContainText('Pérola original ED2.');
    await expect(page.getByRole('textbox', { name: 'Ponto-chave 1' })).toContainText('Ponto original ED2.');
    // Só uma seção em edição por vez: o "Editar" da outra fica desligado.
    await expect(page.getByRole('button', { name: 'Editar a seção Seção ED2 dois' })).toBeDisabled();
    // Nenhuma mudança ainda: sair da página não pergunta nada.
    let perguntou = false;
    page.once('dialog', (d) => {
      perguntou = true;
      void d.dismiss();
    });

    // 3. Negrito numa palavra (dois cliques) e uma caixa "Cuidado" no segundo parágrafo, pelos botões.
    await selecionarPalavra(page, 'Texto da seção', 'alvo');
    await page.getByRole('button', { name: 'Negrito' }).first().click();
    await expect(principal.locator('strong')).toHaveText('alvo');
    await clicarNoTrecho(page, 'Texto da seção', 'Segundo parágrafo da seção');
    await page.getByRole('button', { name: 'Cuidado', exact: true }).first().click();
    await expect(principal.locator('[data-caixa="Cuidado"]')).toContainText('Segundo parágrafo da seção');
    expect(perguntou).toBe(false);

    // 4. Salvar: volta à leitura já com o texto novo formatado, e avisa.
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page.getByText('Seção salva')).toBeVisible();
    const secao = page.locator(`[id="${secaoId}"]`);
    await expect(secao.locator('strong', { hasText: 'alvo' })).toBeVisible();
    await expect(secao.locator('[data-caixa="Cuidado"]')).toContainText('Segundo parágrafo da seção');

    // No banco: só o texto mudou (o resto da seção ficou como estava) e há UMA versão nova, com o motivo da edição.
    expect(psqlLocal(`select content from public.material_sections where id = '${secaoId}';`)).toBe(CONTEUDO_ESPERADO);
    expect(psqlLocal(`select title || '|' || array_to_string(key_takeaways, ',') || '|' || clinical_pearl from public.material_sections where id = '${secaoId}';`)).toBe(
      `${TITULO_DA_SECAO}|Ponto original ED2.|Pérola original ED2.`
    );
    expect(psqlLocal(`select count(*) from public.material_section_versions where material_section_id = '${secaoId}';`)).toBe('1');
    expect(psqlLocal(`select array_to_string(changed_fields, ',') || '|' || reason from public.material_section_versions where material_section_id = '${secaoId}';`)).toBe(
      'content|Edição na página de leitura'
    );

    // 5. Recarregar a página: o texto novo continua lá, formatado.
    await page.reload();
    await expect(page.locator('#btn-user-profile-menu')).toBeVisible({ timeout: 20_000 });
    if (!(await page.getByRole('heading', { name: TITULO_DA_SECAO, exact: true }).isVisible())) await abrirMaterial(page, titulo);
    await expect(page.getByRole('heading', { name: TITULO_DA_SECAO, exact: true })).toBeVisible({ timeout: 15_000 });
    const secaoRecarregada = page.locator(`[id="${secaoId}"]`);
    await expect(secaoRecarregada.locator('strong', { hasText: 'alvo' })).toBeVisible();
    await expect(secaoRecarregada.locator('[data-caixa="Cuidado"]')).toContainText('Segundo parágrafo da seção');

    // 6. Salvar de novo sem mudar nada: não grava (continua uma versão só).
    await page.getByRole('button', { name: `Editar a seção ${TITULO_DA_SECAO}` }).click();
    await expect(page.getByRole('textbox', { name: 'Texto da seção' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page.getByText('Nenhuma alteração para salvar.')).toBeVisible();
    expect(psqlLocal(`select count(*) from public.material_section_versions where material_section_id = '${secaoId}';`)).toBe('1');

    // 7. A Área Editorial mostra a versão nova no histórico da seção.
    await page.locator('#btn-user-profile-menu').click();
    await page.getByRole('menuitem', { name: 'Área Editorial / CMS' }).click();
    await page.getByRole('button', { name: 'Conteúdos & Mecanismos', exact: false }).click();
    await page.getByPlaceholder('Buscar por título, subtítulo, tag ou conteúdo...').fill(titulo);
    const linha = page.locator('[data-compendium-row-id]').filter({ hasText: titulo });
    await linha.getByRole('button', { name: 'Editar', exact: true }).click();
    await page.getByRole('button', { name: /^Conteúdo Texto das seções/ }).click();
    await page.getByRole('button', { name: TITULO_DA_SECAO, exact: true }).click();
    await page.getByRole('button', { name: 'Histórico', exact: true }).click();
    await expect(page.getByText('Campos alterados: content')).toBeVisible();
    await expect(page.getByText('Edição na página de leitura')).toBeVisible();

    // 8. Uma pessoa comum, na mesma página, vê o texto novo e não vê "Editar".
    const outra = await novaPessoa(browser, aluno);
    try {
      await abrirMaterial(outra.pagina, titulo);
      await expect(outra.pagina.locator(`[id="${secaoId}"]`).locator('strong', { hasText: 'alvo' })).toBeVisible();
      await expect(outra.pagina.getByRole('button', { name: /^Editar a seção/ })).toHaveCount(0);
      await expect(outra.pagina.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0);
    } finally {
      await outra.contexto.close();
    }
  });

  test('sem recarregar a página, a Área Editorial já recebe o texto editado na leitura e salvar os metadados do material não o desfaz', async ({ page }) => {
    const tag = `${Date.now()}`;
    const titulo = `${MATERIAL_PREFIX}ed2-meta-${tag}`;
    const { secaoId } = materialComDuasSecoes(`ed2-meta-${tag}`);
    cleanup.unshift(() => deleteE2EMaterials());
    const admin = await usuario('admin', 'e2e-ed2-meta');
    const lerConteudo = () => psqlLocal(`select content from public.material_sections where id = '${secaoId}';`);

    await login(page, admin);
    await abrirMaterial(page, titulo);
    await page.getByRole('button', { name: `Editar a seção ${TITULO_DA_SECAO}` }).click();
    const principal = page.getByRole('textbox', { name: 'Texto da seção' });
    await expect(principal).toBeVisible({ timeout: 15_000 });
    await principal.getByText('A palavra alvo precisa de negrito.').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' EDITADO NA LEITURA');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page.getByText('Seção salva')).toBeVisible();
    expect(lerConteudo()).toContain('EDITADO NA LEITURA');

    // Sem recarregar a página: Área Editorial → Conteúdos & Mecanismos → o editor de seções já traz o texto novo.
    await page.locator('#btn-user-profile-menu').click();
    await page.getByRole('menuitem', { name: 'Área Editorial / CMS' }).click();
    await page.getByRole('button', { name: 'Conteúdos & Mecanismos', exact: false }).click();
    await page.getByPlaceholder('Buscar por título, subtítulo, tag ou conteúdo...').fill(titulo);
    const linha = page.locator('[data-compendium-row-id]').filter({ hasText: titulo });
    await linha.getByRole('button', { name: 'Editar', exact: true }).click();
    await page.getByRole('button', { name: /^Conteúdo Texto das seções/ }).click();
    await page.getByRole('button', { name: TITULO_DA_SECAO, exact: true }).click();
    await expect(page.getByLabel('Conteúdo (markdown)')).toHaveValue(/EDITADO NA LEITURA/);

    // Salvar os "Metadados e posição na árvore" do mesmo material regrava as seções a partir da lista do app: elas têm de
    // ser as editadas (antes, voltavam ao texto antigo, sem versão).
    await linha.getByRole('button', { name: 'Editar', exact: true }).click();
    await page.getByRole('button', { name: /^Metadados e posição na árvore/ }).click();
    // (O editor de seções também tem um "Salvar alterações": o dos metadados é o botão de envio do formulário.)
    await page.locator('form').getByRole('button', { name: 'Salvar alterações', exact: true }).click();
    await expect(page.getByText('Conteúdo atualizado com sucesso!')).toBeVisible({ timeout: 15_000 });
    // O material é regravado por inteiro (o id da seção pode mudar); o texto, não.
    const doMaterial = `material_id in (select id from public.materials where title = '${titulo}')`;
    expect(psqlLocal(`select count(*) from public.material_sections where ${doMaterial} and content like 'A palavra alvo precisa de negrito. EDITADO NA LEITURA%';`)).toBe('1');
    expect(psqlLocal(`select count(*) from public.material_sections where ${doMaterial} and content like 'A palavra alvo precisa de negrito.%' and content not like '%EDITADO NA LEITURA%';`)).toBe('0');
  });

  test('em tela de celular (375 px) o editor não cria rolagem horizontal e os botões continuam ao alcance', async ({ browser }) => {
    const tag = `${Date.now()}`;
    const titulo = `${MATERIAL_PREFIX}ed2-cel-${tag}`;
    materialComDuasSecoes(`ed2-cel-${tag}`);
    cleanup.unshift(() => deleteE2EMaterials());
    const admin = await usuario('admin', 'e2e-ed2-cel');

    const { contexto, pagina } = await novaPessoa(browser, admin, { width: 375, height: 812 });
    try {
      await abrirMaterial(pagina, titulo);
      const semRolagemHorizontal = () => pagina.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
      expect(await semRolagemHorizontal()).toBe(true);

      await pagina.getByRole('button', { name: `Editar a seção ${TITULO_DA_SECAO}` }).click();
      await expect(pagina.getByRole('textbox', { name: 'Texto da seção' })).toBeVisible({ timeout: 15_000 });
      await expect(pagina.getByRole('button', { name: 'Negrito' }).first()).toBeVisible();
      expect(await semRolagemHorizontal()).toBe(true);

      // "Salvar" e "Cancelar" cabem na largura da tela.
      for (const nome of ['Salvar', 'Cancelar']) {
        const botao = pagina.getByRole('button', { name: nome, exact: true });
        await botao.scrollIntoViewIfNeeded();
        const caixa = await botao.boundingBox();
        expect(caixa, nome).not.toBeNull();
        expect(caixa!.x).toBeGreaterThanOrEqual(0);
        expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(375);
      }

      // Cancelar sem mudança fecha direto.
      await pagina.getByRole('button', { name: 'Cancelar', exact: true }).click();
      await expect(pagina.getByRole('textbox', { name: 'Texto da seção' })).toHaveCount(0);
    } finally {
      await contexto.close();
    }
  });
});
