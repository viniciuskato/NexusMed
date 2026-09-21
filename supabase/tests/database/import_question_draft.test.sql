-- ============================================================================
-- SynapseMed — Testes pgTAP de import_question_draft() (Importação de Questões)
--
-- Self-contido: redefine (create or replace, idempotente) os mesmos helpers
-- tests.create_user/authenticate_as/clear_auth já usados em
-- import_compendium_draft.test.sql/rls_policies.test.sql, para não depender
-- da ordem de execução alfabética dos arquivos (`supabase test db` roda
-- *.test.sql em ordem de nome).
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

select plan(27);

-- ----------------------------------------------------------------------------
-- Fixtures
-- ----------------------------------------------------------------------------

select tests.clear_auth();

select tests.create_user('importq.admin@test.local', 'admin', 'active') as v_admin \gset
select tests.create_user('importq.admin.blocked@test.local', 'admin', 'blocked') as v_admin_blocked \gset
select tests.create_user('importq.student@test.local', 'student', 'active') as v_student \gset

insert into public.disciplines (name, code, cycle) values ('Disciplina ImportQ', 'IMPQ-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_discipline_id \gset

insert into public.themes (discipline_id, name) values (:'v_discipline_id', 'Tema ImportQ')
returning id as v_theme_id \gset

insert into public.disciplines (name, code, cycle) values ('Disciplina ImportQ Outra', 'IMPQ2-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_other_discipline_id \gset

select gen_random_uuid() as v_question_id \gset

-- Payload de alternativas reutilizado em vários casos abaixo: 2 alternativas
-- válidas, exatamente 1 correta.
\set valid_options '\'[{"letter":"A","text":"Alternativa A","explanation":"exp A","is_correct":false},{"letter":"B","text":"Alternativa B","explanation":"exp B","is_correct":true}]\'::jsonb'

-- ============================================================================
-- 1) estudante ativo não pode importar
-- ============================================================================

select tests.authenticate_as(:'v_student');
select throws_ok(
  format(
    $$ select public.import_question_draft(%L, %L, %L, 'internato_residencia', 'medio', 'ENARE', 2025, '', 'Pergunta', '', '', '{}'::text[], %s) $$,
    :'v_question_id', :'v_discipline_id', :'v_theme_id', :valid_options
  ),
  NULL::char(5), NULL::text,
  'estudante active não importa questão'
);
select is((select count(*)::int from public.questions where id = :'v_question_id'), 0, 'nada foi gravado após tentativa de estudante');

-- ============================================================================
-- 2) admin bloqueado não pode importar
-- ============================================================================

select tests.authenticate_as(:'v_admin_blocked');
select throws_ok(
  format(
    $$ select public.import_question_draft(%L, %L, %L, 'internato_residencia', 'medio', 'ENARE', 2025, '', 'Pergunta', '', '', '{}'::text[], %s) $$,
    :'v_question_id', :'v_discipline_id', :'v_theme_id', :valid_options
  ),
  NULL::char(5), NULL::text,
  'admin bloqueado não importa questão'
);

-- ============================================================================
-- 3) disciplina/tema incompatíveis ou inexistentes são rejeitados
-- ============================================================================

select tests.authenticate_as(:'v_admin');
select throws_ok(
  format(
    $$ select public.import_question_draft(%L, %L, %L, 'internato_residencia', 'medio', 'ENARE', 2025, '', 'Pergunta', '', '', '{}'::text[], %s) $$,
    :'v_question_id', :'v_other_discipline_id', :'v_theme_id', :valid_options
  ),
  NULL::char(5), NULL::text,
  'tema que não pertence à disciplina informada é rejeitado'
);
select throws_ok(
  format(
    $$ select public.import_question_draft(%L, %L, gen_random_uuid(), 'internato_residencia', 'medio', 'ENARE', 2025, '', 'Pergunta', '', '', '{}'::text[], %s) $$,
    :'v_question_id', :'v_discipline_id', :valid_options
  ),
  NULL::char(5), NULL::text,
  'tema inexistente é rejeitado'
);
select throws_ok(
  format(
    $$ select public.import_question_draft(%L, gen_random_uuid(), gen_random_uuid(), 'internato_residencia', 'medio', 'ENARE', 2025, '', 'Pergunta', '', '', '{}'::text[], %s) $$,
    :'v_question_id', :valid_options
  ),
  NULL::char(5), NULL::text,
  'disciplina inexistente é rejeitada'
);

-- ============================================================================
-- 4) ciclo/dificuldade inválidos são rejeitados
-- ============================================================================

select throws_ok(
  format(
    $$ select public.import_question_draft(%L, %L, %L, 'ciclo-invalido', 'medio', 'ENARE', 2025, '', 'Pergunta', '', '', '{}'::text[], %s) $$,
    :'v_question_id', :'v_discipline_id', :'v_theme_id', :valid_options
  ),
  NULL::char(5), NULL::text,
  'ciclo inválido é rejeitado'
);
select throws_ok(
  format(
    $$ select public.import_question_draft(%L, %L, %L, 'internato_residencia', 'nivel-invalido', 'ENARE', 2025, '', 'Pergunta', '', '', '{}'::text[], %s) $$,
    :'v_question_id', :'v_discipline_id', :'v_theme_id', :valid_options
  ),
  NULL::char(5), NULL::text,
  'dificuldade inválida é rejeitada'
);

-- ============================================================================
-- 5) importação válida: questão + opções + gabarito + comentário, sempre draft
-- ============================================================================

select public.import_question_draft(
  :'v_question_id', :'v_discipline_id', :'v_theme_id', 'internato_residencia', 'medio',
  'ENARE', 2025, 'Vinheta de teste', 'Pergunta de teste', 'Comentário geral de teste', 'Pérola de teste',
  array['tag1', 'tag2'],
  :valid_options
);

select is((select status from public.questions where id = :'v_question_id'), 'draft', 'questão importada nasce em draft');
select is((select count(*)::int from public.question_options where question_id = :'v_question_id'), 2, 'as 2 alternativas foram gravadas');
select is(
  (select count(*)::int from public.question_option_keys k join public.question_options o on o.id = k.option_id where o.question_id = :'v_question_id' and k.is_correct),
  1,
  'exatamente 1 alternativa marcada como correta'
);
select is((select general_commentary from public.question_answer_keys where question_id = :'v_question_id'), 'Comentário geral de teste', 'general_commentary gravado como veio do arquivo');
select is(
  (select array_agg(sort_order order by sort_order) from public.question_options where question_id = :'v_question_id'),
  array[0, 1],
  'sort_order das alternativas preserva a ordem de entrada'
);

-- ============================================================================
-- 6) validações de conteúdo das alternativas
-- ============================================================================

select throws_ok(
  format(
    $$ select public.import_question_draft(gen_random_uuid(), %L, %L, 'internato_residencia', 'medio', 'ENARE', 2025, '', 'Pergunta', '', '', '{}'::text[], '[{"letter":"A","text":"Só uma","is_correct":true}]'::jsonb) $$,
    :'v_discipline_id', :'v_theme_id'
  ),
  NULL::char(5), NULL::text,
  'menos de 2 alternativas é rejeitado'
);
select throws_ok(
  format(
    $$ select public.import_question_draft(gen_random_uuid(), %L, %L, 'internato_residencia', 'medio', 'ENARE', 2025, '', 'Pergunta', '', '', '{}'::text[], '[{"letter":"A","text":"A","is_correct":false},{"letter":"B","text":"B","is_correct":false}]'::jsonb) $$,
    :'v_discipline_id', :'v_theme_id'
  ),
  NULL::char(5), NULL::text,
  'nenhuma alternativa correta é rejeitado'
);
select throws_ok(
  format(
    $$ select public.import_question_draft(gen_random_uuid(), %L, %L, 'internato_residencia', 'medio', 'ENARE', 2025, '', 'Pergunta', '', '', '{}'::text[], '[{"letter":"A","text":"A","is_correct":true},{"letter":"B","text":"B","is_correct":true}]'::jsonb) $$,
    :'v_discipline_id', :'v_theme_id'
  ),
  NULL::char(5), NULL::text,
  'mais de uma alternativa correta é rejeitado'
);
select throws_ok(
  format(
    $$ select public.import_question_draft(gen_random_uuid(), %L, %L, 'internato_residencia', 'medio', 'ENARE', 2025, '', 'Pergunta', '', '', '{}'::text[], '[{"letter":"A","text":"","is_correct":true},{"letter":"B","text":"B","is_correct":false}]'::jsonb) $$,
    :'v_discipline_id', :'v_theme_id'
  ),
  NULL::char(5), NULL::text,
  'alternativa sem texto é rejeitada'
);
select throws_ok(
  $$ select public.import_question_draft(gen_random_uuid(), null, null, 'internato_residencia', 'medio', 'ENARE', 2025, '', '', '', '', '{}'::text[], '[]'::jsonb) $$,
  NULL::char(5), NULL::text,
  'comando da questão vazio é rejeitado antes mesmo de checar disciplina'
);

-- ============================================================================
-- 6-B) sem teto de 5 alternativas (letra > E funciona; formato ainda validado)
-- ============================================================================

select gen_random_uuid() as v_manyopt_question_id \gset

select public.import_question_draft(
  :'v_manyopt_question_id', :'v_discipline_id', :'v_theme_id', 'internato_residencia', 'medio',
  'ENARE', 2025, '', 'Pergunta com 6 alternativas', '', '',
  '{}'::text[],
  '[{"letter":"A","text":"A","is_correct":false},{"letter":"B","text":"B","is_correct":false},{"letter":"C","text":"C","is_correct":false},{"letter":"D","text":"D","is_correct":false},{"letter":"E","text":"E","is_correct":false},{"letter":"F","text":"F","is_correct":true}]'::jsonb
);
select is(
  (select count(*)::int from public.question_options where question_id = :'v_manyopt_question_id'),
  6,
  'uma 6ª alternativa (letra F, além do antigo teto A-E) é aceita e gravada'
);
select is(
  (select is_correct from public.question_option_keys k join public.question_options o on o.id = k.option_id where o.question_id = :'v_manyopt_question_id' and o.letter = 'F'),
  true,
  'a alternativa F é reconhecida como o gabarito informado'
);

select throws_ok(
  format(
    $$ select public.import_question_draft(gen_random_uuid(), %L, %L, 'internato_residencia', 'medio', 'ENARE', 2025, '', 'Pergunta', '', '', '{}'::text[], '[{"letter":"a","text":"A","is_correct":true},{"letter":"B","text":"B","is_correct":false}]'::jsonb) $$,
    :'v_discipline_id', :'v_theme_id'
  ),
  NULL::char(5), NULL::text,
  'letra minúscula é rejeitada (formato exige maiúscula, sem teto de contagem)'
);
select throws_ok(
  format(
    $$ select public.import_question_draft(gen_random_uuid(), %L, %L, 'internato_residencia', 'medio', 'ENARE', 2025, '', 'Pergunta', '', '', '{}'::text[], '[{"letter":"1","text":"A","is_correct":true},{"letter":"B","text":"B","is_correct":false}]'::jsonb) $$,
    :'v_discipline_id', :'v_theme_id'
  ),
  NULL::char(5), NULL::text,
  'letra numérica é rejeitada'
);

-- ============================================================================
-- 7) TESTE DE CONTROLE NEGATIVO — falha depois do início real da operação
--    (questão e a 1ª opção já teriam sido inseridas; a 2ª opção com letra
--    repetida viola a constraint unique (question_id, letter) DEPOIS disso)
--    — prova reversão integral: 0 questão, 0 opções, 0 answer_keys.
-- ============================================================================

select gen_random_uuid() as v_rollback_question_id \gset

select throws_ok(
  format(
    $$ select public.import_question_draft(%L, %L, %L, 'internato_residencia', 'medio', 'ENARE', 2025, '', 'Pergunta rollback', '', '', '{}'::text[],
         '[{"letter":"A","text":"A","is_correct":false},{"letter":"A","text":"A duplicada","is_correct":true}]'::jsonb) $$,
    :'v_rollback_question_id', :'v_discipline_id', :'v_theme_id'
  ),
  NULL::char(5), NULL::text,
  'letra de alternativa duplicada (viola constraint unique) causa exceção após a questão já inserida'
);
select is((select count(*)::int from public.questions where id = :'v_rollback_question_id'), 0, 'CONTROLE NEGATIVO: 0 questões restantes após a falha');
select is((select count(*)::int from public.question_options where question_id = :'v_rollback_question_id'), 0, 'CONTROLE NEGATIVO: 0 opções restantes após a falha');
select is((select count(*)::int from public.question_answer_keys where question_id = :'v_rollback_question_id'), 0, 'CONTROLE NEGATIVO: 0 answer_keys restantes após a falha');

-- ============================================================================
-- 8) nenhuma publicação/atestação é acionada por esta função
-- ============================================================================

select is((select count(*)::int from public.content_revisions where question_id = :'v_question_id'), 0, 'import_question_draft não cria content_revisions');

select tests.clear_auth();
select * from finish();
