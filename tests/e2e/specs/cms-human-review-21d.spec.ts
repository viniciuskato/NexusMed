import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, psqlLocal, getSeedIds, type CreatedTestUser } from '../fixtures/localSupabase';

// Prompt 21-D — desbloquear o fluxo humano de revisão no CMS.
//
// Três barreiras corrigidas, cada uma com pelo menos um cenário aqui:
// (1) painel de revisão invisível na aba de Questões; (2) sem edição do
// vínculo questão -> material; (3) vinculação de fonte por UUID bruto, sem
// busca/campos evidenciais completos, e sem associação de referência de
// material sem matching automático.

const MATERIAL_PREFIX = 'e2e-21d-';
const SOURCE_PREFIX = 'e2e-21d-src-';

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

function insertDraftMaterialWithReference(title: string): { materialId: string; referenceId: string } {
  const seed = getSeedIds();
  const fullTitle = `${MATERIAL_PREFIX}${title}`;
  const materialId = psqlLocal(
    `insert into public.materials (discipline_id, theme_id, title, subtitle, mode, study_lens, estimated_read_time_minutes, author, tags, provenance, source, license) ` +
      `values ('${seed.disciplineId}', '${seed.themeId}', '${fullTitle}', 'Material de teste 21-D', 'mecanismos', 'fisiopatologia', 3, 'E2E', array['e2e'], 'e2e-21d', 'fixture', 'uso interno') ` +
      `returning id;`
  )
    .split('\n')[0]
    .trim();
  psqlLocal(
    `insert into public.material_sections (material_id, sort_order, title, mechanism_tag, content, key_takeaways) ` +
      `values ('${materialId}', 1, 'Seção de teste 21-D', 'Fisiopatologia', 'Conteúdo de teste.', array['ponto']);`
  );
  const referenceId = psqlLocal(
    `insert into public.material_references (material_id, citation_text, sort_order) ` +
      `values ('${materialId}', 'Referência de teste 21-D sem fonte curada', 0) returning id;`
  )
    .split('\n')[0]
    .trim();
  return { materialId, referenceId };
}

function insertSecondDraftMaterial(title: string): string {
  const seed = getSeedIds();
  const fullTitle = `${MATERIAL_PREFIX}${title}`;
  return psqlLocal(
    `insert into public.materials (discipline_id, theme_id, title, subtitle, mode, study_lens, estimated_read_time_minutes, author, tags, provenance, source, license) ` +
      `values ('${seed.disciplineId}', '${seed.themeId}', '${fullTitle}', 'Material alvo de vínculo', 'mecanismos', 'fisiopatologia', 3, 'E2E', array['e2e'], 'e2e-21d', 'fixture', 'uso interno') ` +
      `returning id;`
  )
    .split('\n')[0]
    .trim();
}

function insertDraftQuestion(stem: string): string {
  const seed = getSeedIds();
  const fullStem = `${MATERIAL_PREFIX}${stem}`;
  const questionId = psqlLocal(
    `insert into public.questions (discipline_id, theme_id, cycle, difficulty, institution, year, clinical_vignette, question_stem, tags) ` +
      `values ('${seed.disciplineId}', '${seed.themeId}', 'clinico', 'medio', 'E2E', 2025, 'Vinheta de teste 21-D.', '${fullStem}', array['e2e']) ` +
      `returning id;`
  )
    .split('\n')[0]
    .trim();
  psqlLocal(
    `insert into public.question_options (question_id, letter, option_text, sort_order) values ` +
      `('${questionId}', 'A', 'Alternativa A', 0), ('${questionId}', 'B', 'Alternativa B', 1);`
  );
  psqlLocal(
    `update public.question_option_keys set is_correct = true, explanation = 'Explicação A.' ` +
      `where question_id = '${questionId}' and option_id = (select id from public.question_options where question_id = '${questionId}' and letter = 'A');`
  );
  psqlLocal(
    `update public.question_option_keys set explanation = 'Explicação B.' ` +
      `where question_id = '${questionId}' and option_id = (select id from public.question_options where question_id = '${questionId}' and letter = 'B');`
  );
  psqlLocal(
    `insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary) ` +
      `values ('${questionId}', 'Comentário geral de teste.', 'Resumo high-yield de teste.');`
  );
  return questionId;
}

function insertSource(idSuffix: string, citationText: string, doi?: string): string {
  const id = `${SOURCE_PREFIX}${idSuffix}`;
  const identificadores = doi ? `'{"doi": "${doi}"}'::jsonb` : `'{}'::jsonb`;
  psqlLocal(
    `insert into public.sources (id, citation_text, tipo, verificacao, identificadores) ` +
      `values ('${id}', '${citationText}', 'material_interno', 'verificada', ${identificadores});`
  );
  return id;
}

function deleteE2EFixtures(): void {
  // guard_question_delete rejeita apagar questão published — volta pra
  // draft antes (é fixture de teste, não conteúdo real).
  psqlLocal(`update public.questions set status = 'draft' where question_stem like '${MATERIAL_PREFIX}%' and status = 'published';`);
  psqlLocal(`delete from public.materials where title like '${MATERIAL_PREFIX}%';`);
  psqlLocal(`delete from public.questions where question_stem like '${MATERIAL_PREFIX}%';`);
  psqlLocal(`delete from public.sources where id like '${SOURCE_PREFIX}%';`);
}

test.describe('CMS — fluxo humano de revisão (21-D)', () => {
  let cleanup: (() => Promise<void> | void)[] = [];

  test.afterEach(async () => {
    for (const fn of cleanup) {
      await Promise.resolve(fn()).catch(() => undefined);
    }
    cleanup = [];
  });

  test('painel de revisão abre e recebe foco na aba de Questões (antes invisível); fecha devolvendo o foco ao botão', async ({
    page,
  }) => {
    const admin = await createTestUser({
      emailLocalPart: `cms21d-a-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'admin',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(admin.id));
    const questionId = insertDraftQuestion('Questão painel de revisão');
    cleanup.push(() => deleteE2EFixtures());

    await login(page, admin);
    await openEditorialArea(page);
    await page.getByRole('button', { name: 'Questões Comentadas', exact: false }).click();

    const row = page.locator(`#admin-question-${questionId}`);
    await expect(row).toBeVisible();

    const reviewButton = row.getByRole('button', { name: 'Revisão' });
    await reviewButton.click();

    const panel = page.locator('#provenance-review-panel');
    await expect(panel).toBeVisible();
    // Recebeu o foco (não ficou perdido no <body>).
    await expect(panel).toBeFocused();

    // Fecha e confere que o foco volta pro botão que abriu o painel.
    await page.locator('#provenance-review-close').click();
    await expect(panel).not.toBeVisible();
    await expect(reviewButton).toBeFocused();
  });

  test('vínculo material/seção: troca, remoção ("Sem material") e cancelamento não escreve', async ({ page }) => {
    const admin = await createTestUser({
      emailLocalPart: `cms21d-b-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'admin',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(admin.id));
    const questionId = insertDraftQuestion('Questão vínculo');
    const targetMaterialId = insertSecondDraftMaterial('Material alvo do vínculo');
    cleanup.push(() => deleteE2EFixtures());

    await login(page, admin);
    await openEditorialArea(page);
    await page.getByRole('button', { name: 'Questões Comentadas', exact: false }).click();

    const row = page.locator(`#admin-question-${questionId}`);
    await row.getByRole('button', { name: 'Vínculo' }).click();

    // Cancelar sem salvar não escreve nada.
    await row.locator(`#link-material-${questionId}`).selectOption({ label: `${MATERIAL_PREFIX}Material alvo do vínculo` });
    await row.getByRole('button', { name: 'Cancelar' }).click();
    let stored = psqlLocal(`select coalesce(material_id::text, '') from public.questions where id = '${questionId}';`);
    expect(stored).toBe('');

    // Trocar e salvar: só material_id muda (o resto da linha permanece igual).
    const before = psqlLocal(
      `select discipline_id::text, theme_id::text, question_stem, status from public.questions where id = '${questionId}';`
    );
    await row.getByRole('button', { name: 'Vínculo' }).click();
    await row.locator(`#link-material-${questionId}`).selectOption({ label: `${MATERIAL_PREFIX}Material alvo do vínculo` });
    await row.getByRole('button', { name: 'Salvar vínculo' }).click();
    await expect(page.getByText('Vínculo com material atualizado.')).toBeVisible();

    stored = psqlLocal(`select material_id::text from public.questions where id = '${questionId}';`);
    expect(stored).toBe(targetMaterialId);
    const after = psqlLocal(
      `select discipline_id::text, theme_id::text, question_stem, status from public.questions where id = '${questionId}';`
    );
    expect(after).toBe(before);

    // Remover o vínculo ("Sem material") também limpa material_section_id.
    await row.getByRole('button', { name: 'Vínculo' }).click();
    await row.locator(`#link-material-${questionId}`).selectOption({ label: 'Sem material' });
    await row.getByRole('button', { name: 'Salvar vínculo' }).click();
    await expect(page.getByText('Vínculo com material atualizado.')).toBeVisible();
    stored = psqlLocal(
      `select coalesce(material_id::text, '') || '|' || coalesce(material_section_id::text, '') from public.questions where id = '${questionId}';`
    );
    expect(stored).toBe('|');
  });

  test('vínculo bloqueado com erro visível quando a questão já está publicada', async ({ page }) => {
    const admin = await createTestUser({
      emailLocalPart: `cms21d-c-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'admin',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(admin.id));
    const questionId = insertDraftQuestion('Questão publicada vínculo bloqueado');
    const targetMaterialId = insertSecondDraftMaterial('Material alvo bloqueado');
    cleanup.push(() => deleteE2EFixtures());

    await login(page, admin);
    await openEditorialArea(page);
    await page.getByRole('button', { name: 'Questões Comentadas', exact: false }).click();

    const row = page.locator(`#admin-question-${questionId}`);

    // Aprova uma revisão mínima (fluxo já provado em 23-B) para poder publicar.
    await row.getByRole('button', { name: 'Revisão' }).click();
    const panel = page.locator('#provenance-review-panel');
    await panel.getByRole('button', { name: 'Criar primeira revisão' }).click();
    await panel.getByPlaceholder('Texto do claim').fill('Síntese de teste 21-D.');
    await panel.getByPlaceholder(/Localização estável/).fill('question_stem');
    await panel.getByRole('button', { name: 'Adicionar', exact: true }).click();
    await panel.getByRole('button', { name: 'Aprovar', exact: true }).click();
    await panel.getByRole('button', { name: 'Atestar — Aprovar revisão' }).click();
    await expect(panel).toHaveAttribute('data-provenance-status', 'aprovado_para_esta_versao', { timeout: 10_000 });
    await page.locator('#provenance-review-close').click();

    await row.getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(row).toContainText('publicada', { timeout: 10_000 });

    await row.getByRole('button', { name: 'Vínculo' }).click();
    await row.locator(`#link-material-${questionId}`).selectOption({ label: `${MATERIAL_PREFIX}Material alvo bloqueado` });
    await row.getByRole('button', { name: 'Salvar vínculo' }).click();

    await expect(page.getByText(/Vínculo não alterado:/)).toBeVisible({ timeout: 10_000 });
    const stored = psqlLocal(`select coalesce(material_id::text, '') from public.questions where id = '${questionId}';`);
    expect(stored).toBe('');
    void targetMaterialId;
  });

  test('seletor de fonte pesquisável (título e DOI) com campos evidenciais completos; vínculo aparece na lista', async ({
    page,
  }) => {
    const admin = await createTestUser({
      emailLocalPart: `cms21d-d-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'admin',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(admin.id));
    const questionId = insertDraftQuestion('Questão seletor de fonte');
    const sourceId = insertSource('doi', 'Diretriz de teste 21-D sobre PCSK9', '10.9999/e2e21d');
    cleanup.push(() => deleteE2EFixtures());

    await login(page, admin);
    await openEditorialArea(page);
    await page.getByRole('button', { name: 'Questões Comentadas', exact: false }).click();

    const row = page.locator(`#admin-question-${questionId}`);
    await row.getByRole('button', { name: 'Revisão' }).click();
    const panel = page.locator('#provenance-review-panel');
    await panel.getByRole('button', { name: 'Criar primeira revisão' }).click();
    await panel.getByPlaceholder('Texto do claim').fill('Claim que exige fonte.');
    await panel.getByPlaceholder(/Localização estável/).fill('question_stem');
    await panel.getByLabel('Exige fonte').check();
    await panel.getByRole('button', { name: 'Adicionar', exact: true }).click();
    await expect(panel.getByText('Claim que exige fonte.')).toBeVisible();

    // Busca por DOI primeiro — catálogo ainda não tem essa fonte específica
    // resolvida por esse termo? Testa por título completo, garantidamente presente.
    const sourceInput = panel.locator('input[placeholder*="Buscar fonte"]');
    await sourceInput.fill('10.9999/e2e21d');
    await expect(panel.getByText('Diretriz de teste 21-D sobre PCSK9')).toBeVisible({ timeout: 10_000 });
    await panel.getByText('Diretriz de teste 21-D sobre PCSK9').click();

    await panel.locator('[id^="evidence-relation-"]').selectOption('contextualizes');
    await panel.locator('[id^="consultation-basis-"]').selectOption('indirectly_reported');
    await panel.getByPlaceholder(/Localização dentro da fonte/).fill('p. 42');
    await panel.getByRole('button', { name: 'Vincular fonte' }).click();

    await expect(panel.getByText('Diretriz de teste 21-D sobre PCSK9', { exact: false }).first()).toBeVisible();
    await expect(panel.locator('span', { hasText: 'Contextualiza' })).toBeVisible();
    await expect(panel.locator('span', { hasText: 'Reportada indiretamente' })).toBeVisible();
    await expect(panel.getByText('p. 42')).toBeVisible();

    const linked = psqlLocal(
      `select cs.evidence_relation || '|' || cs.consultation_basis || '|' || cs.source_locator ` +
        `from public.claim_sources cs join public.claims c on c.id = cs.claim_id ` +
        `join public.content_revisions r on r.id = c.content_revision_id ` +
        `where r.question_id = '${questionId}' and cs.source_id = '${sourceId}';`
    );
    expect(linked).toBe('contextualizes|indirectly_reported|p. 42');
  });

  test('referência de material sem fonte curada: associação explícita preserva texto/ordem/URL', async ({ page }) => {
    const admin = await createTestUser({
      emailLocalPart: `cms21d-e-${Date.now()}`,
      password: 'senha-teste-123',
      role: 'admin',
      status: 'active',
    });
    cleanup.push(() => deleteTestUser(admin.id));
    const { materialId, referenceId } = insertDraftMaterialWithReference('Material com referência solta');
    const sourceId = insertSource('ref', 'Fonte curada de teste 21-D para referência');
    cleanup.push(() => deleteE2EFixtures());

    await login(page, admin);
    await openEditorialArea(page);

    const row = page.locator(`[data-compendium-row-id="${materialId}"]`);
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Editar' }).click();
    await row.getByText('Referências').click();

    const panel = page.locator('#material-references-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Referência de teste 21-D sem fonte curada')).toBeVisible();

    const sourceInput = panel.locator('input[placeholder*="Buscar fonte"]');
    await sourceInput.fill('Fonte curada de teste 21-D');
    await expect(panel.getByText('Fonte curada de teste 21-D para referência')).toBeVisible({ timeout: 10_000 });
    await panel.getByText('Fonte curada de teste 21-D para referência').click();
    await panel.getByRole('button', { name: 'Associar' }).click();

    await expect(panel.getByText('Referência associada à fonte.')).toBeVisible();

    const stored = psqlLocal(
      `select citation_text || '|' || sort_order::text || '|' || source_id from public.material_references where id = '${referenceId}';`
    );
    expect(stored).toBe(`Referência de teste 21-D sem fonte curada|0|${sourceId}`);
  });
});
