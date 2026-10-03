-- ============================================================================
-- P6 — Caderno pessoal (migration 20261003120700)
--
-- O dono publica; o revisor de IA só aconselha. Prova:
--   1. o admin publica e despublica material e questão sem revisão "apto" (as
--      validações de conteúdo continuam), e quem não é admin não publica;
--   2. o selo "Revisado por IA" não aparece onde não há revisão "apto";
--   3. só o admin cria ou reenvia envio de material e de questões (RLS), e os
--      envios que já existiam continuam guardados, legíveis e intactos;
--   4. a atualização de material por arquivo é só do admin;
--   5. as funções recriadas seguem sem EXECUTE para anon (risco 14);
--   6. o job `revisar-envios` do pg_cron não existe.
-- O caminho "apto -> publica sozinho" (revisao_publicar_envio) continua provado em
-- publicar_pelo_veredito_44g e publicar_questoes_pelo_veredito_44h2.
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

create or replace function tests.authenticate_as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', false);
  perform set_config('role', 'anon', false);
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

create or replace function tests.affected_rows(p_sql text)
returns int
language plpgsql
as $$
declare
  v_n int;
begin
  execute p_sql;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Questão completa (2 alternativas com explicação, comentário e resumo) em rascunho.
create or replace function tests.nova_questao_p6(p_disc uuid, p_theme uuid, p_stem text, p_opcoes int default 2)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_q uuid;
  v_a uuid;
  v_b uuid;
begin
  insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
  values (p_disc, p_theme, 'clinico', 'medio', 'Vinheta', p_stem) returning id into v_q;
  insert into public.question_options (question_id, letter, option_text, sort_order) values (v_q, 'A', 'Opção A', 1) returning id into v_a;
  if p_opcoes >= 2 then
    insert into public.question_options (question_id, letter, option_text, sort_order) values (v_q, 'B', 'Opção B', 2) returning id into v_b;
  end if;
  insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary) values (v_q, 'Comentário', 'Pérola');
  update public.question_option_keys set is_correct = true, explanation = 'Certa' where option_id = v_a;
  if v_b is not null then
    update public.question_option_keys set explanation = 'Errada' where option_id = v_b;
  end if;
  return v_q;
end;
$$;

select plan(36);

select tests.clear_auth();
select tests.create_user('p6.admin@test.local', 'admin', 'active') as v_admin \gset
select tests.create_user('p6.amigo@test.local', 'student', 'active') as v_amigo \gset
select substr(gen_random_uuid()::text, 1, 8) as v_sfx \gset

insert into public.disciplines (name, code, cycle)
values ('Disciplina P6', 'P6-' || :'v_sfx', 'clinico') returning id as v_disc \gset
insert into public.themes (discipline_id, name) values (:'v_disc', 'Tema P6') returning id as v_theme \gset

-- Envios que o amigo já tinha feito (antes da P6): um de cada tipo, semeados como postgres.
insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md, status)
values (:'v_amigo', 'Envio antigo do amigo ' || :'v_sfx', :'v_disc', :'v_theme', '# antigo', 'nao_apto') returning id as v_sub_m \gset
insert into public.question_submissions (author_id, title, content_md, status)
values (:'v_amigo', 'Lote antigo do amigo ' || :'v_sfx', '## Questão 1', 'nao_apto') returning id as v_sub_q \gset

-- ---------------------------------------------------------------------------
-- 1. O admin publica material sem revisão
-- ---------------------------------------------------------------------------
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Material do caderno ' || :'v_sfx') returning id as v_mat \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_mat', 0, 'Seção', 'Texto.');

select tests.authenticate_as(:'v_amigo');
select throws_ok(
  format($$ select public.publish_material(%L) $$, :'v_mat'),
  NULL, 'apenas administradores ativos podem publicar materiais', 'quem não é admin não publica material'
);
select tests.clear_auth();
select tests.authenticate_as(:'v_admin');
select lives_ok(
  format($$ select public.publish_material(%L) $$, :'v_mat'),
  'o admin publica material em rascunho sem revisão "apto" nem atestação'
);
select tests.clear_auth();
select is((select status from public.materials where id = :'v_mat'), 'published', 'e o material vai ao ar');
select is(
  (select count(*)::int from public.material_ai_provenance where material_id = :'v_mat'),
  0, 'sem proveniência de IA (o selo "Revisado por IA" é só de quem tem revisão "apto")'
);
select tests.authenticate_as(:'v_amigo');
select is(public.selo_de_revisao(:'v_mat'), null, 'o amigo lê o material publicado, sem selo de IA');
select is((select count(*)::int from public.materials where id = :'v_mat'), 1, 'e o amigo enxerga o material publicado');
select tests.clear_auth();

-- A ordem da árvore continua valendo: filho não publica antes do pai.
insert into public.materials (discipline_id, theme_id, title, parent_material_id)
values (:'v_disc', :'v_theme', 'Pai rascunho ' || :'v_sfx', null) returning id as v_pai \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_pai', 0, 'S', 'T.');
insert into public.materials (discipline_id, theme_id, title, parent_material_id)
values (:'v_disc', :'v_theme', 'Filho ' || :'v_sfx', :'v_pai') returning id as v_filho \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_filho', 0, 'S', 'T.');
select tests.authenticate_as(:'v_admin');
select throws_like(
  format($$ select public.publish_material(%L) $$, :'v_filho'),
  '%publique antes, nesta ordem%', 'a ordem da árvore continua valendo (filho antes do pai é recusado)'
);
select lives_ok(format($$ select public.publish_material(%L) $$, :'v_pai'), 'o pai publica');
select lives_ok(format($$ select public.publish_material(%L) $$, :'v_filho'), 'e depois o filho');
select lives_ok(format($$ select public.unpublish_material(%L) $$, :'v_filho'), 'o admin despublica o filho sem revisão nenhuma');
select tests.clear_auth();
select is((select status from public.materials where id = :'v_filho'), 'draft', 'e o filho volta a rascunho');

-- ---------------------------------------------------------------------------
-- 2. O admin publica questão sem revisão
-- ---------------------------------------------------------------------------
select tests.nova_questao_p6(:'v_disc', :'v_theme', 'Enunciado P6 ' || :'v_sfx') as v_q \gset
select tests.nova_questao_p6(:'v_disc', :'v_theme', 'Questão incompleta P6 ' || :'v_sfx', 1) as v_q_inc \gset

select tests.authenticate_as(:'v_amigo');
select throws_ok(
  format($$ select public.publish_question(%L) $$, :'v_q'),
  NULL, 'apenas administradores ativos podem publicar questões', 'quem não é admin não publica questão'
);
select tests.clear_auth();
select tests.authenticate_as(:'v_admin');
select lives_ok(
  format($$ select public.publish_question(%L) $$, :'v_q'),
  'o admin publica questão completa em rascunho sem revisão "apto" nem atestação'
);
select throws_like(
  format($$ select public.publish_question(%L) $$, :'v_q_inc'),
  '%ao menos 2 alternativas%', 'as validações de conteúdo continuam: questão com 1 alternativa é recusada'
);
select tests.clear_auth();
select is((select status from public.questions where id = :'v_q'), 'published', 'e a questão completa vai ao ar');
select is((select status from public.questions where id = :'v_q_inc'), 'draft', 'enquanto a incompleta continua rascunho');
select tests.authenticate_as(:'v_amigo');
select is(
  (select count(*)::int from public.selos_de_questoes(array[:'v_q']::uuid[]) where question_id = :'v_q'),
  0, 'sem revisão de IA "apto", a questão não tem selo'
);
select tests.clear_auth();
select tests.authenticate_as(:'v_admin');
select lives_ok(format($$ update public.questions set status = 'draft' where id = %L $$, :'v_q'), 'o admin despublica a questão');
select tests.clear_auth();
select is((select status from public.questions where id = :'v_q'), 'draft', 'e ela volta a rascunho');

-- ---------------------------------------------------------------------------
-- 3. Só o admin envia
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'v_amigo');
select throws_ok(
  format($$ insert into public.material_submissions (title, discipline_id, theme_id, content_md) values ('Novo do amigo', %L, %L, '# x') $$, :'v_disc', :'v_theme'),
  '42501', NULL, 'quem não é admin não cria envio de material'
);
select throws_ok(
  $$ insert into public.question_submissions (title, content_md) values ('Novo lote do amigo', '## Questão 1') $$,
  '42501', NULL, 'quem não é admin não cria envio de questões'
);
select is(
  tests.affected_rows(format($$ update public.material_submissions set content_md = '# reenvio' where id = %L $$, :'v_sub_m')),
  0, 'nem reenvia o envio de material que já tinha'
);
select is(
  tests.affected_rows(format($$ update public.question_submissions set content_md = '## reenvio' where id = %L $$, :'v_sub_q')),
  0, 'nem o de questões'
);
select is(
  (select count(*)::int from public.material_submissions where id = :'v_sub_m')
  + (select count(*)::int from public.question_submissions where id = :'v_sub_q'),
  2, 'mas continua lendo os envios que já fez'
);
select tests.clear_auth();
select is(
  (select content_md || '/' || status from public.material_submissions where id = :'v_sub_m'),
  '# antigo/nao_apto', 'o envio de material antigo ficou intacto'
);
select is(
  (select content_md || '/' || status from public.question_submissions where id = :'v_sub_q'),
  '## Questão 1/nao_apto', 'o envio de questões antigo ficou intacto'
);

select tests.authenticate_as(:'v_admin');
select lives_ok(
  format($$ insert into public.material_submissions (title, discipline_id, theme_id, content_md) values ('Do dono %s', %L, %L, '# do dono') $$, :'v_sfx', :'v_disc', :'v_theme'),
  'o admin cria envio de material'
);
select lives_ok(
  format($$ insert into public.question_submissions (title, content_md) values ('Lote do dono %s', '## Questão 1') $$, :'v_sfx'),
  'o admin cria envio de questões'
);
select is(
  tests.affected_rows(format($$ update public.material_submissions set content_md = '# do dono 2' where title = 'Do dono %s' and author_id = %L $$, :'v_sfx', :'v_admin')),
  1, 'e reenvia o próprio envio de material'
);
select is(
  tests.affected_rows(format($$ update public.question_submissions set content_md = '## Questão 2' where title = 'Lote do dono %s' and author_id = %L $$, :'v_sfx', :'v_admin')),
  1, 'e o de questões'
);
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 4. Atualizar material por arquivo: só admin
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'v_amigo');
select is(public.pode_atualizar_material(:'v_mat'::uuid), false, 'quem não é admin não vê "Atualizar a partir de arquivo"');
select throws_ok(
  format($$ insert into public.material_submissions (title, content_md, target_material_id) values ('Atualização do amigo', '# x', %L) $$, :'v_mat'),
  '42501', NULL, 'e não pede a atualização'
);
select tests.clear_auth();
select tests.authenticate_as(:'v_admin');
select is(public.pode_atualizar_material(:'v_mat'::uuid), true, 'o admin vê "Atualizar a partir de arquivo" no material publicado');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 5. Grants das funções recriadas (AGENTS.md, risco 14)
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.publish_material(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.publish_question(uuid)', 'execute')
  and not has_function_privilege('anon', 'app.pode_atualizar_material(uuid, uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.publish_material(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.publish_question(uuid)', 'execute'),
  'anon não executa as funções recriadas; o admin logado chama as de publicação'
);
select ok(
  not exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public' and routine_name in ('publish_material', 'publish_question')
      and grantee = 'PUBLIC'
  ),
  'PUBLIC também não tem EXECUTE nas funções de publicação'
);

-- ---------------------------------------------------------------------------
-- 6. O revisor agendado não existe mais
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from cron.job where jobname = 'revisar-envios'),
  0::bigint, 'o job revisar-envios do pg_cron foi desagendado'
);

select * from finish();
