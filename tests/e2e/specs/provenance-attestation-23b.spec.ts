import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, psqlLocal, getSeedIds, type CreatedTestUser } from '../fixtures/localSupabase';

// Prompt 23-B — proveniência e atestação editorial.
//
// pgTAP (supabase/tests/database/content_provenance_attestation.test.sql) já
// prova o contrato de servidor a fundo (45 asserções: forjamento de payload,
// imutabilidade, claim obrigatório sem fonte, hash desatualizado, etc.).
// Este teste de navegador prova só o que só o navegador prova: o fluxo
// completo funciona de ponta a ponta pela UI real da Área Editorial —
// criar revisão, decidir claim, atestar, e só então conseguir publicar.

const MATERIAL_PREFIX = 'e2e-23b-';

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

function insertDraftMaterial(title: string): string {
  const seed = getSeedIds();
  const fullTitle = `${MATERIAL_PREFIX}${title}`;
  const materialId = psqlLocal(
    `insert into public.materials (discipline_id, theme_id, title, subtitle, mode, study_lens, estimated_read_time_minutes, author, tags, provenance, source, license) ` +
      `values ('${seed.disciplineId}', '${seed.themeId}', '${fullTitle}', 'Material de teste 23-B', 'mecanismos', 'fisiopatologia', 3, 'E2E', array['e2e'], 'e2e-23b', 'fixture', 'uso interno') ` +
      `returning id;`
  )
    .split('\n')[0]
    .trim();
  psqlLocal(
    `insert into public.material_sections (material_id, sort_order, title, mechanism_tag, content, key_takeaways) ` +
      `values ('${materialId}', 1, 'Seção de teste 23-B', 'Fisiopatologia', 'Conteúdo de teste para atestação.', array['ponto']);`
  );
  return materialId;
}

function deleteE2EMaterials(): void {
  psqlLocal(`delete from public.materials where title like '${MATERIAL_PREFIX}%';`);
}

test.describe('Proveniência e atestação editorial (23-B)', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    for (const fn of cleanup) {
      await Promise.resolve(fn()).catch(() => undefined);
    }
    cleanup = [];
  });

  test('material sem revisão aprovada não publica; fluxo completo de revisão/atestação libera a publicação', async ({
    page,
  }) => {
    const admin = await createTestUser({
      emailLocalPart: `prov-admin-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'admin',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(admin.id));

    const materialId = insertDraftMaterial('Material Proveniência E2E');
    cleanup.push(() => deleteE2EMaterials());

    await login(page, admin);
    await openEditorialArea(page);

    const row = page.locator(`[data-compendium-row-id="${materialId}"]`);
    await expect(row).toBeVisible();
    await expect(row).toContainText('rascunho');

    // Sem revisão aprovada: publicar falha com o toast de erro do próprio
    // gate no banco (publish_material rejeita), não um erro genérico. O
    // toast some sozinho em 3.5s (ver showToast em AdminCMSView.tsx) — usa
    // waitForFunction (varre o texto renderizado assim que aparece) em vez
    // de toBeVisible (mais sujeito a perder uma janela curta sob carga).
    await row.getByRole('button', { name: 'Publicar', exact: true }).click();
    await page.waitForFunction(() => document.body.innerText.includes('publicação bloqueada'), { timeout: 10_000 });
    await expect(row).toContainText('rascunho');

    // Abre o painel de revisão para este material.
    await row.getByRole('button', { name: 'Revisão' }).click();
    const panel = page.locator('#provenance-review-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('data-provenance-status', 'em_revisao');

    await panel.getByRole('button', { name: 'Criar primeira revisão' }).click();

    // Adiciona um claim que NÃO exige fonte (checkbox "Exige fonte" fica
    // desmarcado) — mantém o teste de navegador focado no fluxo de
    // navegação real; a obrigatoriedade de fonte por claim já está provada
    // a fundo no pgTAP.
    await panel.getByPlaceholder('Texto do claim').fill('Síntese de teste do compêndio.');
    await panel.getByPlaceholder(/Localização estável/).fill('section:teste:paragraph:1');
    await panel.getByRole('button', { name: 'Adicionar', exact: true }).click();

    await expect(panel.getByText('Síntese de teste do compêndio.')).toBeVisible();
    await panel.getByRole('button', { name: 'Aprovar', exact: true }).click();
    await expect(panel.getByText('Decisão: aprovado')).toBeVisible();

    await panel.getByRole('button', { name: 'Atestar — Aprovar revisão' }).click();
    await expect(panel).toHaveAttribute('data-provenance-status', 'aprovado_para_esta_versao', { timeout: 10_000 });

    await page.locator('#provenance-review-close').click();
    await expect(panel).not.toBeVisible();

    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(row).toContainText('publicado', { timeout: 10_000 });

    const publishedStatus = psqlLocal(`select status from public.materials where id = '${materialId}';`);
    expect(publishedStatus).toBe('published');
    const revisionCount = Number(
      psqlLocal(`select count(*) from public.content_revisions where material_id = '${materialId}';`)
    );
    expect(revisionCount).toBe(1);
    const reviewDecision = psqlLocal(
      `select decision from public.content_reviews cr join public.content_revisions r on r.id = cr.content_revision_id where r.material_id = '${materialId}';`
    );
    expect(reviewDecision).toBe('aprovado');
  });
});
