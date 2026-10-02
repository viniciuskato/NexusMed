-- ============================================================================
-- 45-H — Endurecimento do banco (migration 20261002120000)
--
-- Self-contido: redefine os helpers tests.* (create or replace, idempotente),
-- como os outros arquivos, para não depender da ordem alfabética. As guardas
-- estruturais (EXECUTE de função, TRUNCATE, escrita direta) ficam em
-- security_guards.test.sql; aqui está o comportamento: o que o estudante deixa
-- de conseguir pela API e o que continua funcionando pelas RPCs.
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
-- 45-H: função nova não nasce mais com EXECUTE para PUBLIC (default privileges
-- da migration 20261002120000). Os helpers deste schema de teste são chamados
-- com o role já trocado para anon/authenticated (SET ROLE de sessão), então
-- ganham o EXECUTE que tinham antes.
grant execute on all functions in schema tests to public;

select plan(32);

select tests.clear_auth();

select tests.create_user('h45.a@test.local', 'student', 'active') as v_a \gset
select tests.create_user('h45.admin@test.local', 'admin', 'active') as v_admin \gset

insert into public.disciplines (name, code, cycle)
values ('Disciplina 45H', 'H45-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_disc \gset
insert into public.themes (discipline_id, name) values (:'v_disc', 'Tema 45H') returning id as v_theme \gset

-- Como `postgres`, a guarda de publicação deixa inserir já publicado.
insert into public.materials (discipline_id, theme_id, title, status)
values (:'v_disc', :'v_theme', 'Material 45H com duas seções', 'published') returning id as v_m1 \gset
insert into public.material_sections (material_id, sort_order, title, content)
values (:'v_m1', 0, 'Seção 1', 'a') returning id as v_s1 \gset
insert into public.material_sections (material_id, sort_order, title, content)
values (:'v_m1', 1, 'Seção 2', 'b') returning id as v_s2 \gset
insert into public.materials (discipline_id, theme_id, title, status)
values (:'v_disc', :'v_theme', 'Outro material 45H', 'published') returning id as v_m2 \gset
insert into public.material_sections (material_id, sort_order, title, content)
values (:'v_m2', 0, 'Seção de outro material', 'c') returning id as v_t1 \gset

-- Um simulado já fechado, com nota, do estudante A.
insert into public.simulations (user_id, name, started_at, completed_at, score, total_time_seconds)
values (:'v_a', 'Simulado fechado 45H', now() - interval '1 hour', now(), 80, 3600)
returning id as v_sim \gset

-- ----------------------------------------------------------------------------
-- AUD-31.3 — simulado fechado: nota e conclusão só mudam pela RPC
-- ----------------------------------------------------------------------------

select tests.authenticate_as(:'v_a');

select is(
  (select count(*) from public.simulations where id = :'v_sim'),
  1::bigint,
  'o estudante continua lendo o próprio simulado'
);

select throws_ok(
  format($$ update public.simulations set score = 100 where id = %L $$, :'v_sim'),
  '42501', null,
  'o estudante não altera a nota de um simulado fechado pela API'
);

select throws_ok(
  format($$ update public.simulations set completed_at = null where id = %L $$, :'v_sim'),
  '42501', null,
  'o estudante não reabre um simulado fechado pela API'
);

select throws_ok(
  format($$ insert into public.simulations (user_id, name, completed_at, score) values (%L, 'forjado', now(), 100) $$, :'v_a'),
  '42501', null,
  'o estudante não cria simulado já fechado e com nota pela API'
);

select throws_ok(
  format($$ insert into public.simulation_questions (simulation_id, question_id, position) values (%L, gen_random_uuid(), 1) $$, :'v_sim'),
  '42501', null,
  'o estudante não acrescenta questão a um simulado pela API'
);

select throws_ok(
  $$ update public.simulation_answers set time_spent_seconds = 1 $$,
  '42501', null,
  'o estudante não altera resposta de simulado pela API'
);

select throws_ok(
  $$ truncate public.simulations $$,
  '42501', null,
  'authenticated não tem TRUNCATE'
);

select lives_ok(
  format($$ delete from public.simulations where id = %L $$, :'v_sim'),
  'o estudante continua podendo apagar o próprio simulado'
);

select is(
  (select count(*) from public.simulations where id = :'v_sim'),
  0::bigint,
  'e o simulado apagado some'
);

-- ----------------------------------------------------------------------------
-- AUD-31.4 — arrays de save_simulado_session têm limite
-- ----------------------------------------------------------------------------

select throws_ok(
  $$ select public.save_simulado_session(jsonb_build_object(
       'id', gen_random_uuid(),
       'questions', (select jsonb_agg(jsonb_build_object('question_id', gen_random_uuid(), 'position', g)) from generate_series(1, 2001) g),
       'answers', '[]'::jsonb)) $$,
  'P0001', 'sessão de simulado excede o tamanho máximo (2000 questões e 2000 respostas)',
  'mais de 2000 questões numa sessão de simulado é recusado'
);

select throws_ok(
  $$ select public.save_simulado_session(jsonb_build_object(
       'id', gen_random_uuid(),
       'questions', '[]'::jsonb,
       'answers', (select jsonb_agg(jsonb_build_object('question_id', gen_random_uuid())) from generate_series(1, 2001) g))) $$,
  'P0001', 'sessão de simulado excede o tamanho máximo (2000 questões e 2000 respostas)',
  'mais de 2000 respostas numa sessão de simulado é recusado'
);

select lives_ok(
  $$ select public.save_simulado_session(jsonb_build_object('id', gen_random_uuid(), 'questions', '[]'::jsonb, 'answers', '[]'::jsonb)) $$,
  'uma sessão dentro do limite continua sendo gravada pela RPC'
);

-- ----------------------------------------------------------------------------
-- AUD-31.3 / AUD-06 — progresso de leitura: só pela RPC, percentual do servidor
-- ----------------------------------------------------------------------------

select throws_ok(
  format($$ insert into public.reading_progress (user_id, material_id, read_section_ids, percent) values (%L, %L, '{}', 100) $$, :'v_a', :'v_m1'),
  '42501', null,
  'o estudante não grava percentual de leitura pela API (insert)'
);

select is(
  (public.set_section_read(:'v_m1', :'v_s1', true, 999)->>'percent')::int,
  50,
  'set_section_read calcula o percentual pelas seções do material (1 de 2), não pelo total informado pelo cliente'
);

select throws_ok(
  format($$ update public.reading_progress set percent = 100 where material_id = %L $$, :'v_m1'),
  '42501', null,
  'o estudante não altera o percentual de leitura pela API (update)'
);

select is(
  (select percent from public.reading_progress where material_id = :'v_m1'),
  50,
  'o estudante continua lendo o próprio progresso'
);

select throws_ok(
  format($$ select public.set_section_read(%L, %L, true, 2) $$, :'v_m1', :'v_t1'),
  'P0001', format('seção não pertence ao material: %s', :'v_t1'),
  'marcar como lida uma seção de outro material é recusado'
);

select lives_ok(
  format($$ select public.set_section_read(%L, %L, false, 2) $$, :'v_m1', :'v_t1'),
  'desmarcar um id que não é do material não trava (id antigo precisa poder sair)'
);

select is(
  (public.set_section_read(:'v_m1', :'v_s2', true, 1)->>'percent')::int,
  100,
  'as duas seções lidas dão 100%, nunca mais que isso'
);

-- ----------------------------------------------------------------------------
-- AUD-31.3 — feedback: sem status na inserção direta
-- ----------------------------------------------------------------------------

select throws_ok(
  format($$ insert into public.feedback (user_id, type, title, description, status) values (%L, 'sugestao', 't', 'd', 'resolvido') $$, :'v_a'),
  '42501', null,
  'o estudante não insere feedback já "resolvido"'
);

select lives_ok(
  format($$ insert into public.feedback (user_id, type, title, description) values (%L, 'sugestao', 'título', 'descrição') $$, :'v_a'),
  'o estudante continua enviando feedback'
);

select is(
  (select status from public.feedback where user_id = :'v_a' and title = 'título'),
  'pendente',
  'o feedback novo nasce "pendente"'
);

-- ----------------------------------------------------------------------------
-- AUD-31.4 — limites de tamanho nos campos de texto livre
-- ----------------------------------------------------------------------------

select throws_ok(
  format($$ insert into public.feedback (user_id, type, title, description) values (%L, 'sugestao', repeat('t', 201), 'd') $$, :'v_a'),
  '23514', null,
  'título de feedback com mais de 200 caracteres é recusado'
);

select throws_ok(
  format($$ insert into public.feedback (user_id, type, title, description) values (%L, 'sugestao', 't', repeat('d', 5001)) $$, :'v_a'),
  '23514', null,
  'descrição de feedback com mais de 5000 caracteres é recusada'
);

select throws_ok(
  format($$ insert into public.notes (user_id, material_id, note_text) values (%L, %L, repeat('n', 50001)) $$, :'v_a', :'v_m1'),
  '23514', null,
  'anotação com mais de 50000 caracteres é recusada'
);

select throws_ok(
  format($$ insert into public.flashcards (user_id, discipline_id, theme_id, front, back, difficulty) values (%L, %L, %L, repeat('f', 5001), 'v', 'medio') $$, :'v_a', :'v_disc', :'v_theme'),
  '23514', null,
  'frente de flashcard com mais de 5000 caracteres é recusada'
);

select throws_ok(
  format($$ insert into public.flashcards (user_id, discipline_id, theme_id, front, back, difficulty) values (%L, %L, %L, 'f', repeat('v', 20001), 'medio') $$, :'v_a', :'v_disc', :'v_theme'),
  '23514', null,
  'verso de flashcard com mais de 20000 caracteres é recusado'
);

select tests.clear_auth();

select throws_ok(
  format($$ update public.profiles set display_name = repeat('x', 201) where id = %L $$, :'v_a'),
  '23514', null,
  'nome de exibição com mais de 200 caracteres é recusado'
);

select is(
  (select count(*) from pg_constraint
    where conname in (
      'feedback_title_max_length', 'feedback_description_max_length', 'notes_note_text_max_length',
      'flashcards_front_max_length', 'flashcards_back_max_length', 'error_notebook_user_notes_max_length',
      'profiles_display_name_max_length', 'profiles_avatar_url_max_length')
      and not convalidated),
  8::bigint,
  'os oito limites existem e são NOT VALID (linhas antigas não são revalidadas nem alteradas)'
);

-- ----------------------------------------------------------------------------
-- AUD-08 — teto de 36500 dias no intervalo do SRS (igual ao cliente)
-- ----------------------------------------------------------------------------

insert into public.flashcards (user_id, discipline_id, theme_id, front, back, difficulty)
values (:'v_a', :'v_disc', :'v_theme', 'frente 45H', 'verso 45H', 'medio') returning id as v_card \gset
insert into public.flashcard_srs_state (flashcard_id, interval_days, repetition_count, ease_factor, state)
values (:'v_card', 30000, 3, 3.0, 'mastered');

select tests.authenticate_as(:'v_a');

select is(
  (public.submit_flashcard_review(:'v_card', 4, gen_random_uuid())->>'interval_days')::int,
  36500,
  'revisão "Fácil" sobre um intervalo enorme fica no teto de 36500 dias'
);

select is(
  (select interval_days from public.flashcard_srs_state where flashcard_id = :'v_card'),
  36500,
  'e o estado gravado também'
);

select tests.clear_auth();

insert into public.flashcards (user_id, discipline_id, theme_id, front, back, difficulty)
values (:'v_a', :'v_disc', :'v_theme', 'frente normal 45H', 'verso', 'medio') returning id as v_card2 \gset
insert into public.flashcard_srs_state (flashcard_id, interval_days, repetition_count, ease_factor, state)
values (:'v_card2', 10, 3, 2.5, 'review');

select tests.authenticate_as(:'v_a');

select is(
  (public.submit_flashcard_review(:'v_card2', 3, gen_random_uuid())->>'interval_days')::int,
  25,
  'abaixo do teto o cálculo não mudou (10 dias x 2,5 = 25)'
);

select tests.clear_auth();

select * from finish();
