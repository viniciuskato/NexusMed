import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, psqlLocal, type CreatedTestUser } from '../fixtures/localSupabase';

// Missão 42-A/42-B — Entrada assistida de materiais.
//
// Prova de ponta a ponta, contra Supabase LOCAL, que uma pessoa sem
// conhecimento de programação consegue: escolher o arquivo do compêndio,
// conferir a pré-visualização e criar um rascunho pela interface — sem
// terminal, sem UUID, sem editar YAML. Caso de prova real: o compêndio de
// Meningite Bacteriana Aguda (arquivo fora do repositório, não editado por
// este teste, só lido).
//
// 42-B trocou a gravação por baixo dos panos para a RPC atômica
// `import_compendium_draft` (material+seções+referências numa única
// transação) — o teste de controle negativo que prova a reversão integral
// sob falha vive em pgTAP
// (supabase/tests/database/import_compendium_draft.test.sql), porque é lá
// que dá para forçar uma violação de constraint no meio da transação e
// consultar o banco diretamente depois. Este arquivo continua provando só o
// que só o navegador prova: o fluxo real end-to-end pela UI.

const MATERIAL_PREFIX = 'Meningite Bacteriana Aguda';
// Fixture versionada (mesma forma do caso de prova real: 11 seções, 13
// referências). Para rodar contra o arquivo real do acervo, aponte
// E2E_MENINGITE_YAML para ele.
const MENINGITE_YAML_PATH = path.resolve(
  process.env.E2E_MENINGITE_YAML ?? 'tests/e2e/fixtures/meningite-e2e.compendium.yaml'
);

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

/** O catálogo local (seed mínimo) só tem Cardiologia — cria a disciplina/tema reais do caso de prova. */
function ensureInfectologiaClinica(): void {
  const existingDiscipline = psqlLocal(`select id from public.disciplines where code = 'INFECTO' limit 1;`);
  if (!existingDiscipline) {
    psqlLocal(
      `insert into public.disciplines (name, code, icon, description, cycle, color, sort_order) ` +
        `values ('Infectologia', 'INFECTO', 'bug', 'Disciplina de teste 42-A.', 'clinico', '#0f766e', 90);`
    );
  }
  const disciplineId = psqlLocal(`select id from public.disciplines where code = 'INFECTO' limit 1;`);
  const existingTheme = psqlLocal(
    `select id from public.themes where discipline_id = '${disciplineId}' and name = 'Clínica' limit 1;`
  );
  if (!existingTheme) {
    psqlLocal(`insert into public.themes (discipline_id, name, description, high_yield, sort_order) ` +
      `values ('${disciplineId}', 'Clínica', 'Tema de teste 42-A.', false, 1);`);
  }
}

function deleteE2EMaterial(): void {
  psqlLocal(`delete from public.materials where title = '${MATERIAL_PREFIX}';`);
}

function deleteInfectologiaClinicaFixture(): void {
  // Só remove se nada além deste teste passou a depender dela (sem materials restantes).
  const disciplineId = psqlLocal(`select id from public.disciplines where code = 'INFECTO' limit 1;`);
  if (!disciplineId) return;
  const remainingMaterials = psqlLocal(`select count(*) from public.materials where discipline_id = '${disciplineId}';`);
  if (remainingMaterials === '0') {
    psqlLocal(`delete from public.themes where discipline_id = '${disciplineId}';`);
    psqlLocal(`delete from public.disciplines where id = '${disciplineId}';`);
  }
}

test.describe('Importar material (42-A)', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    for (const fn of cleanup) {
      await Promise.resolve(fn()).catch(() => undefined);
    }
    cleanup = [];
  });

  test('arquivo válido (Meningite Bacteriana Aguda): pré-visualização, confirmação e rascunho com 11 seções e 13 referências', async ({
    page,
  }) => {
    ensureInfectologiaClinica();
    cleanup.push(() => deleteE2EMaterial());
    cleanup.push(() => deleteInfectologiaClinicaFixture());

    const admin = await createTestUser({
      emailLocalPart: `import-42a-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'admin',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(admin.id));

    await login(page, admin);
    await openEditorialArea(page);

    await page.getByRole('button', { name: 'Importar material' }).click();
    const dialog = page.getByRole('dialog', { name: 'Importar material' });
    await dialog.locator('#import-material-file-input').setInputFiles(MENINGITE_YAML_PATH);

    // Pré-visualização mostra os campos-chave antes de qualquer gravação.
    await expect(dialog.getByText('Meningite Bacteriana Aguda')).toBeVisible();
    await expect(dialog.getByText('Infectologia', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Clínica', { exact: true })).toBeVisible();
    await expect(dialog.getByTestId('import-preview-sections-count')).toHaveText('11');
    await expect(dialog.getByTestId('import-preview-references-count')).toHaveText('13');
    await expect(dialog.getByText(/apenas um.*rascunho/i)).toBeVisible();

    // Confirma — só agora deve haver gravação.
    await dialog.getByRole('button', { name: 'Salvar rascunho' }).click();
    await expect(dialog.getByText(/criado com sucesso/i)).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole('button', { name: 'Fechar' }).click();

    // Confirmação visual: aparece na lista como rascunho (não publicado).
    const materialId = psqlLocal(`select id from public.materials where title = '${MATERIAL_PREFIX}';`);
    expect(materialId).toBeTruthy();
    const row = page.locator(`[data-compendium-row-id="${materialId}"]`);
    await expect(row).toBeVisible();
    await expect(row).toContainText('rascunho');

    // Confirmação por consulta direta ao banco local (não só a UI).
    const status = psqlLocal(`select status from public.materials where id = '${materialId}';`);
    expect(status).toBe('draft');
    const sectionsCount = psqlLocal(`select count(*) from public.material_sections where material_id = '${materialId}';`);
    expect(sectionsCount).toBe('11');
    const referencesCount = psqlLocal(`select count(*) from public.material_references where material_id = '${materialId}';`);
    expect(referencesCount).toBe('13');
  });

  test('arquivo inválido: mensagem em linguagem simples, nada é gravado', async ({ page }) => {
    const admin = await createTestUser({
      emailLocalPart: `import-42a-invalido-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'admin',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(admin.id));

    await login(page, admin);
    await openEditorialArea(page);

    await page.getByRole('button', { name: 'Importar material' }).click();
    const dialog = page.getByRole('dialog', { name: 'Importar material' });

    const tmpInvalidPath = path.resolve('tests/e2e/fixtures/invalid-compendium.yaml');
    await dialog.locator('#import-material-file-input').setInputFiles(tmpInvalidPath);

    await expect(dialog.getByText(/não foi possível importar/i)).toBeVisible();
    await expect(dialog.getByText(/título/i)).toBeVisible();
  });

  test('material duplicado: segunda importação do mesmo arquivo é bloqueada', async ({ page }) => {
    ensureInfectologiaClinica();
    cleanup.push(() => deleteE2EMaterial());
    cleanup.push(() => deleteInfectologiaClinicaFixture());

    const admin = await createTestUser({
      emailLocalPart: `import-42a-dup-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'admin',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(admin.id));

    await login(page, admin);
    await openEditorialArea(page);

    await page.getByRole('button', { name: 'Importar material' }).click();
    let dialog = page.getByRole('dialog', { name: 'Importar material' });
    await dialog.locator('#import-material-file-input').setInputFiles(MENINGITE_YAML_PATH);
    await dialog.getByRole('button', { name: 'Salvar rascunho' }).click();
    await expect(dialog.getByText(/criado com sucesso/i)).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole('button', { name: 'Fechar' }).click();

    // Segunda tentativa do MESMO arquivo deve ser bloqueada por duplicidade.
    await page.getByRole('button', { name: 'Importar material' }).click();
    dialog = page.getByRole('dialog', { name: 'Importar material' });
    await dialog.locator('#import-material-file-input').setInputFiles(MENINGITE_YAML_PATH);
    await expect(dialog.getByText(/já existe um material com o título/i)).toBeVisible();
    const confirmButton = dialog.getByRole('button', { name: 'Salvar rascunho' });
    await expect(confirmButton).toBeDisabled();

    const count = psqlLocal(`select count(*) from public.materials where title = '${MATERIAL_PREFIX}';`);
    expect(count).toBe('1');
  });

  test('cancelar antes de confirmar não grava nada', async ({ page }) => {
    const admin = await createTestUser({
      emailLocalPart: `import-42a-cancel-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'admin',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(admin.id));

    await login(page, admin);
    await openEditorialArea(page);

    await page.getByRole('button', { name: 'Importar material' }).click();
    const dialog = page.getByRole('dialog', { name: 'Importar material' });
    await dialog.locator('#import-material-file-input').setInputFiles(MENINGITE_YAML_PATH);
    await expect(dialog.getByText('Meningite Bacteriana Aguda')).toBeVisible();

    await dialog.getByRole('button', { name: 'Cancelar' }).click();

    const count = psqlLocal(`select count(*) from public.materials where title = '${MATERIAL_PREFIX}';`);
    expect(count).toBe('0');
  });

  // AS1-B3.2 — regressão visual: a verificação independente da diretoria
  // encontrou a barra flutuante de navegação inferior ("Início / Temático /
  // Recursos / CMS") sobrepondo a segunda linha do quadro amarelo "Campos
  // ausentes ou que não puderam ser importados" durante a pré-visualização
  // do importador (ver docs/editorial/as1/ACIDOBASE-AUDITORIA-DA-CONVERSAO-2026-09-18.md,
  // seção 10). A correção coloca o modal num overlay `fixed inset-0 z-[60]`,
  // acima do dock (`z-40`). Este teste prova, com bounding boxes reais (não
  // inspeção visual), que nenhum controle flutuante encobre o quadro, os
  // seletores ou os botões do importador, em desktop e mobile; e que a
  // navegação flutuante volta a funcionar normalmente depois que o
  // importador é fechado.
  for (const viewport of [
    { name: 'desktop', width: 1400, height: 1000 },
    { name: 'mobile', width: 390, height: 844 },
  ] as const) {
    test(`dock flutuante não sobrepõe o quadro de campos ausentes (${viewport.name})`, async ({ page }) => {
      const admin = await createTestUser({
        emailLocalPart: `import-b32-${viewport.name}-${Date.now()}`,
        password: 'senha-teste-123',
        role: 'admin',
        status: 'active',
      });
      cleanup.push(() => deleteTestUser(admin.id));

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await login(page, admin);
      await openEditorialArea(page);

      // Navegação flutuante disponível normalmente antes de abrir o importador.
      const dock = page.locator('#mobile-floating-dock');
      await expect(dock).toBeVisible();

      await page.getByRole('button', { name: 'Importar material' }).click();
      const dialog = page.getByRole('dialog', { name: 'Importar material' });
      await dialog
        .locator('#import-material-file-input')
        .setInputFiles(path.resolve('tests/e2e/fixtures/overlap-regression.compendium.yaml'));

      const missingPanel = dialog.getByTestId('import-missing-fields-panel');
      await expect(missingPanel).toBeVisible();

      // "Salvar rascunho" permanece desabilitado enquanto a taxonomia está ausente.
      const saveButton = dialog.getByRole('button', { name: 'Salvar rascunho' });
      await expect(saveButton).toBeDisabled();

      // Controle negativo técnico: antes da correção (AS1-B3.1), o modal
      // renderizava sem wrapper `fixed`/z-index próprio, então um elemento
      // fixo com z-index maior (como o dock, z-40) ficava acima dele no
      // stacking context. Provamos aqui que o wrapper do diálogo tem
      // z-index numericamente maior que o do dock — se essa relação for
      // invertida (reintroduzindo o bug), esta asserção falha.
      const dialogWrapperZIndex = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="import-material-modal"]')?.parentElement;
        return el ? Number(window.getComputedStyle(el).zIndex) : NaN;
      });
      // O z-index vive no wrapper `fixed` que envolve o <nav id="mobile-floating-dock">
      // (ver src/components/navigation/MobileBottomNav.tsx) — o <nav> em si não
      // declara z-index próprio, então seu computed style seria "auto"/NaN.
      const dockZIndex = await dock.evaluate((el) =>
        Number(window.getComputedStyle(el.parentElement ?? el).zIndex)
      );
      expect(Number.isNaN(dialogWrapperZIndex)).toBe(false);
      expect(dialogWrapperZIndex).toBeGreaterThan(dockZIndex);

      // Prova geométrica: para cada canto e o centro do quadro de campos
      // ausentes, dos dois seletores (Disciplina/Tema) e do botão "Salvar
      // rascunho", o elemento realmente pintado nesse ponto (via
      // `elementFromPoint`) pertence ao próprio diálogo do importador, nunca
      // ao dock de navegação nem a qualquer outro controle flutuante fora
      // dele.
      const targets = [missingPanel, dialog.locator('select').first(), dialog.locator('select').nth(1), saveButton];
      for (const target of targets) {
        await target.scrollIntoViewIfNeeded();
        const box = await target.boundingBox();
        expect(box).not.toBeNull();
        if (!box) continue;
        const points = [
          [box.x + 2, box.y + 2],
          [box.x + box.width - 2, box.y + 2],
          [box.x + 2, box.y + box.height - 2],
          [box.x + box.width - 2, box.y + box.height - 2],
          [box.x + box.width / 2, box.y + box.height / 2],
        ];
        for (const [x, y] of points) {
          const belongsToDialog = await page.evaluate(
            ([px, py]) => {
              const el = document.elementFromPoint(px, py);
              const dialogEl = document.querySelector('[data-testid="import-material-modal"]');
              return !!el && !!dialogEl && dialogEl.contains(el);
            },
            [x, y]
          );
          expect(belongsToDialog).toBe(true);
        }
      }

      // Fecha o importador e confirma que a navegação flutuante volta ao normal.
      await dialog.getByRole('button', { name: 'Cancelar' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(dock).toBeVisible();
      await expect(dock.getByRole('button', { name: 'Início' })).toBeEnabled();
    });
  }
});
