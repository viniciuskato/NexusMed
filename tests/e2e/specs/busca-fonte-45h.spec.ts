import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, getLocalConfig, psqlLocal, runCleanup } from '../fixtures/localSupabase';
import { filtroBuscaDeFonte } from '../../../src/utils/buscaDeFonte';

// 45-H (AUD-32.3) — a busca de fonte com parênteses, contra o PostgREST local
// e como um admin de verdade (RLS incluída). O filtro é o mesmo que
// ContentProvenanceRepository.searchSources passa ao `.or()`. Medido no PostgREST
// local com o filtro antigo (valor solto): sem erro, mas com lista VAZIA — a tela
// dizia "Fonte não cadastrada" para uma fonte que existe.

const FONTE_ID = 'e2e-45h-harrison-21';
const CITACAO = 'Harrison (21ª ed.) — fonte do teste e2e 45-H';

test('a busca de fonte com parênteses encontra a fonte gravada', async () => {
  const user = await createTestUser({ emailLocalPart: 'busca-fonte-45h', password: 'senha-teste-45h-123', role: 'admin', status: 'active' });
  try {
    psqlLocal(
      `insert into public.sources (id, citation_text, tipo, verificacao) values ('${FONTE_ID}', '${CITACAO}', 'livro_texto', 'verificada') on conflict (id) do nothing;`
    );
    const cfg = getLocalConfig();
    const client = createClient(cfg.apiUrl, cfg.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: loginError } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
    expect(loginError).toBeNull();

    const achou = await client
      .from('sources')
      .select('id, citation_text')
      .or(filtroBuscaDeFonte('Harrison (21ª ed.)'))
      .limit(20);
    expect(achou.error).toBeNull();
    expect((achou.data ?? []).map((r) => r.id)).toContain(FONTE_ID);
  } finally {
    await runCleanup([
      () => {
        psqlLocal(`delete from public.sources where id = '${FONTE_ID}';`);
      },
      () => deleteTestUser(user.id),
    ]);
  }
});
