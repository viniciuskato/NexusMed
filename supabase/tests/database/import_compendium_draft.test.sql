-- ============================================================================
-- SynapseMed — Testes pgTAP de import_compendium_draft() (Missão 42-B)
--
-- Self-contido: redefine (create or replace, idempotente) os mesmos helpers
-- tests.create_user/authenticate_as/clear_auth já usados em
-- content_provenance_attestation.test.sql/rls_policies.test.sql, para não
-- depender da ordem de execução alfabética dos arquivos (`supabase test db`
-- roda *.test.sql em ordem de nome).
-- ============================================================================

create extension if not exists pgtap;

create schema if not exists tests;

create or replace function tests.create_user(p_email text, p_role text default 'student', p_status text default 'pending')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := p_email || '+' || v_id::text;
begin
  insert into auth.users (id, email, encrypted_password, raw_user_meta_data, created_at, updated_at, aud, role)
  values (
    v_id, v_email, extensions.crypt('senha-teste-123', extensions.gen_salt('bf')),
    jsonb_build_object('display_name', p_email), now(), now(), 'authenticated', 'authenticated'
  );
  update public.profiles set role = p_role, status = p_status where id = v_id;
  return v_id;
end;
$$;

create or replace function tests.authenticate_as(p_uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, false);
  perform set_config('role', 'authenticated', false);
end;
$$;

create or replace function tests.clear_auth()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', false);
  reset role;
end;
$$;

grant usage on schema tests to anon, authenticated;
grant execute on function tests.clear_auth() to anon, authenticated;

select plan(21);

-- ----------------------------------------------------------------------------
-- Fixtures
-- ----------------------------------------------------------------------------

select tests.clear_auth();

-- Idempotência: os títulos usados abaixo são fixos de propósito (o teste de
-- duplicidade exige um título repetível), então uma execução anterior de
-- `supabase test db` sem `supabase db reset` no meio deixaria o material
-- "Meningite Bacteriana Aguda (teste)" já gravado, quebrando o teste de
-- importação válida (colidiria com o próprio bloqueio de duplicidade que
-- este arquivo testa). Limpa antes de criar, para o arquivo poder rodar
-- repetidas vezes sem exigir reset entre execuções.
delete from public.materials where title in (
  'Meningite Bacteriana Aguda (teste)', 'Material Secao Sem Titulo'
);

select tests.create_user('import42b.admin@test.local', 'admin', 'active') as v_admin \gset
select tests.create_user('import42b.admin.blocked@test.local', 'admin', 'blocked') as v_admin_blocked \gset
select tests.create_user('import42b.student@test.local', 'student', 'active') as v_student \gset

insert into public.disciplines (name, code, cycle) values ('Disciplina Import42B', 'IMP42B-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_discipline_id \gset

insert into public.themes (discipline_id, name) values (:'v_discipline_id', 'Tema Import42B')
returning id as v_theme_id \gset

insert into public.disciplines (name, code, cycle) values ('Disciplina Import42B Outra', 'IMP42B2-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_other_discipline_id \gset

select gen_random_uuid() as v_material_id \gset
select gen_random_uuid() as v_section_1_id \gset
select gen_random_uuid() as v_section_2_id \gset

-- ============================================================================
-- 1) estudante ativo não pode importar
-- ============================================================================

select tests.authenticate_as(:'v_student');
select throws_ok(
  format(
    $$ select public.import_compendium_draft(%L, %L, %L, 'Material Estudante', null, null, 10, '{}'::text[],
         '[{"id":%L,"title":"S1","content":"conteudo"}]'::jsonb, '{}'::text[]) $$,
    :'v_material_id', :'v_discipline_id', :'v_theme_id', :'v_section_1_id'
  ),
  NULL::char(5), NULL::text,
  'estudante active não importa material'
);
select is((select count(*)::int from public.materials where id = :'v_material_id'), 0, 'nada foi gravado após tentativa de estudante');

-- ============================================================================
-- 2) admin bloqueado não pode importar
-- ============================================================================

select tests.authenticate_as(:'v_admin_blocked');
select throws_ok(
  format(
    $$ select public.import_compendium_draft(%L, %L, %L, 'Material Admin Bloqueado', null, null, 10, '{}'::text[],
         '[{"id":%L,"title":"S1","content":"conteudo"}]'::jsonb, '{}'::text[]) $$,
    :'v_material_id', :'v_discipline_id', :'v_theme_id', :'v_section_1_id'
  ),
  NULL::char(5), NULL::text,
  'admin bloqueado não importa material'
);

-- ============================================================================
-- 3) disciplina/tema incompatíveis são rejeitados
-- ============================================================================

select tests.authenticate_as(:'v_admin');
select throws_ok(
  format(
    $$ select public.import_compendium_draft(%L, %L, %L, 'Material Tema Incompativel', null, null, 10, '{}'::text[],
         '[{"id":%L,"title":"S1","content":"conteudo"}]'::jsonb, '{}'::text[]) $$,
    :'v_material_id', :'v_other_discipline_id', :'v_theme_id', :'v_section_1_id'
  ),
  NULL::char(5), NULL::text,
  'tema que não pertence à disciplina informada é rejeitado'
);
select throws_ok(
  format(
    $$ select public.import_compendium_draft(%L, %L, gen_random_uuid(), 'Material Tema Inexistente', null, null, 10, '{}'::text[],
         '[{"id":%L,"title":"S1","content":"conteudo"}]'::jsonb, '{}'::text[]) $$,
    :'v_material_id', :'v_discipline_id', :'v_section_1_id'
  ),
  NULL::char(5), NULL::text,
  'tema inexistente é rejeitado'
);
select throws_ok(
  $$ select public.import_compendium_draft(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'Material Disciplina Inexistente', null, null, 10, '{}'::text[],
       '[{"id":"00000000-0000-0000-0000-000000000001","title":"S1","content":"conteudo"}]'::jsonb, '{}'::text[]) $$,
  NULL::char(5), NULL::text,
  'disciplina inexistente é rejeitada'
);

-- ============================================================================
-- 4) importação válida: material + seções + referências, sempre draft
-- ============================================================================

select public.import_compendium_draft(
  :'v_material_id', :'v_discipline_id', :'v_theme_id',
  'Meningite Bacteriana Aguda (teste)', 'Subtítulo de teste', 'Equipe Editorial', 22, array['meningite', 'infecção'],
  format(
    '[{"id":"%s","title":"Definição","content":"Texto 1","mechanism_tag":"Fisiopatologia","key_takeaways":["Ponto 1"]},
      {"id":"%s","title":"Tratamento","content":"Texto 2","key_takeaways":["Ponto 2"]}]',
    :'v_section_1_id', :'v_section_2_id'
  )::jsonb,
  array['Referência 1', 'Referência 2']
);

select is((select status from public.materials where id = :'v_material_id'), 'draft', 'material importado nasce em draft');
select is((select count(*)::int from public.material_sections where material_id = :'v_material_id'), 2, 'as 2 seções foram gravadas');
select is((select count(*)::int from public.material_references where material_id = :'v_material_id'), 2, 'as 2 referências foram gravadas');
select is(
  (select array_agg(sort_order order by sort_order) from public.material_sections where material_id = :'v_material_id'),
  array[0, 1],
  'sort_order das seções preserva a ordem de entrada'
);

-- ============================================================================
-- 5) duplicidade de título bloqueada no servidor (mesmo direto por RPC)
-- ============================================================================

select throws_ok(
  format(
    $$ select public.import_compendium_draft(gen_random_uuid(), %L, %L, 'Meningite Bacteriana Aguda (teste)', null, null, 10, '{}'::text[],
         '[{"id":"00000000-0000-0000-0000-000000000002","title":"S1","content":"conteudo"}]'::jsonb, '{}'::text[]) $$,
    :'v_discipline_id', :'v_theme_id'
  ),
  NULL::char(5), NULL::text,
  'título duplicado (mesmo texto exato) é bloqueado no servidor'
);
select throws_ok(
  format(
    $$ select public.import_compendium_draft(gen_random_uuid(), %L, %L, '  meningite bacteriana aguda (teste)  ', null, null, 10, '{}'::text[],
         '[{"id":"00000000-0000-0000-0000-000000000003","title":"S1","content":"conteudo"}]'::jsonb, '{}'::text[]) $$,
    :'v_discipline_id', :'v_theme_id'
  ),
  NULL::char(5), NULL::text,
  'título duplicado (case/espaço diferentes) também é bloqueado no servidor'
);
select is((select count(*)::int from public.materials where title = 'Meningite Bacteriana Aguda (teste)'), 1, 'permanece só 1 material com esse título após as tentativas de duplicata');

-- ============================================================================
-- 6) validações de conteúdo (sem seção, seção sem título/conteúdo, sem id)
-- ============================================================================

select throws_ok(
  $$ select public.import_compendium_draft(gen_random_uuid(), null, null, 'Material Sem Sessoes', null, null, 10, '{}'::text[], '[]'::jsonb, '{}'::text[]) $$,
  NULL::char(5), NULL::text,
  'material sem nenhuma seção é rejeitado antes de qualquer insert'
);
select throws_ok(
  format(
    $$ select public.import_compendium_draft(gen_random_uuid(), %L, %L, 'Material Secao Sem Titulo', null, null, 10, '{}'::text[],
         '[{"id":"00000000-0000-0000-0000-000000000004","title":"","content":"conteudo"}]'::jsonb, '{}'::text[]) $$,
    :'v_discipline_id', :'v_theme_id'
  ),
  NULL::char(5), NULL::text,
  'seção sem título é rejeitada'
);
select is((select count(*)::int from public.materials where title = 'Material Secao Sem Titulo'), 0, 'nada foi gravado quando a seção era inválida');

-- ============================================================================
-- 7) TESTE DE CONTROLE NEGATIVO — falha depois do início real da operação
--    (material + seções já seriam inseridos; referência com citation_text
--    NULL viola a constraint not null DEPOIS disso) — prova reversão
--    integral: 0 material, 0 seções, 0 referências remanescentes.
-- ============================================================================

select gen_random_uuid() as v_rollback_material_id \gset
select gen_random_uuid() as v_rollback_section_id \gset

select throws_ok(
  format(
    $$ select public.import_compendium_draft(%L, %L, %L, 'Material Rollback Controle Negativo', null, null, 10, '{}'::text[],
         '[{"id":%L,"title":"Seção válida","content":"conteúdo válido"}]'::jsonb,
         array['Referência válida', null]::text[]) $$,
    :'v_rollback_material_id', :'v_discipline_id', :'v_theme_id', :'v_rollback_section_id'
  ),
  NULL::char(5), NULL::text,
  'referência nula após material+seção já inseridos na mesma chamada causa exceção'
);
select is((select count(*)::int from public.materials where id = :'v_rollback_material_id'), 0, 'CONTROLE NEGATIVO: 0 materiais restantes após a falha');
select is((select count(*)::int from public.material_sections where id = :'v_rollback_section_id'), 0, 'CONTROLE NEGATIVO: 0 seções restantes após a falha');
select is((select count(*)::int from public.material_references where material_id = :'v_rollback_material_id'), 0, 'CONTROLE NEGATIVO: 0 referências restantes após a falha');

-- ============================================================================
-- 8) nenhuma publicação/atestação é acionada por esta função
-- ============================================================================

select is((select count(*)::int from public.content_revisions where material_id = :'v_material_id'), 0, 'import_compendium_draft não cria content_revisions');

select tests.clear_auth();
select * from finish();
