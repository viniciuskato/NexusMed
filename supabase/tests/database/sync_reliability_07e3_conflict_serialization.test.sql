-- ============================================================================
-- SynapseMed — Testes pgTAP do Prompt 07-E3 (serialização por advisory lock)
--
-- Cobre a migration 20260909150000_conflict_serialization_07e3.sql:
-- comportamento funcional de `upsert_note`/`save_simulado_session` depois de
-- adicionar `pg_advisory_xact_lock` antes de qualquer leitura de estado.
--
-- IMPORTANTE — mesma limitação já assumida nos arquivos de teste anteriores:
-- pgTAP roda numa sessão/conexão só, então NÃO exercita a corrida real entre
-- duas transações disputando o mesmo advisory lock ao mesmo tempo — isso está
-- provado à parte, com concorrência de verdade (duas conexões supabase-js via
-- Promise.all contra o Supabase local), em
-- scripts/_tmp-07e3-race-repro.ts (reprodução do bug ANTES da correção) e
-- scripts/_tmp-07e3-concurrency-suite.ts (22 asserções de concorrência real
-- depois da correção — ver retorno do Prompt 07-E3). Este arquivo só prova
-- que a lógica de negócio (o que cada chamada decide) continua correta depois
-- de introduzir o lock, de forma sequencial.
-- ============================================================================

select plan(6);

select tests.clear_auth();

select tests.create_user('sync07e3.a@test.local', 'student', 'active') as v_user_a \gset

insert into public.disciplines (name, code, cycle) values ('Disciplina 07E3 pgTAP', 'SYNC07E3PG-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_discipline_id \gset
insert into public.themes (discipline_id, name) values (:'v_discipline_id', 'Tema 07E3 pgTAP')
returning id as v_theme_id \gset
insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_discipline_id', :'v_theme_id', 'clinico', 'medio', 'Vinheta', 'Enunciado 07E3 pgTAP')
returning id as v_question_id \gset

select tests.authenticate_as(:'v_user_a');

-- ----------------------------------------------------------------------------
-- 1. Nota nova (nenhuma linha ainda) grava normalmente através do lock —
--    adquirir o advisory lock não deveria impedir/alterar o caminho feliz de
--    criação quando não há nenhuma disputa.
-- ----------------------------------------------------------------------------
select ((public.upsert_note(null, null, :'v_question_id', null, 'primeira nota via RPC'))->>'conflict')::boolean as v_c1 \gset
select is(:'v_c1'::boolean, false, 'criação de nota nova, sem disputa, continua funcionando normalmente com o lock');

-- ----------------------------------------------------------------------------
-- 2. Base null + texto existente DIFERENTE agora é conflito (mudança 07-E3 —
--    cobre a lógica que corrige o bloqueio 1, mesmo que sequencialmente).
-- ----------------------------------------------------------------------------
select ((public.upsert_note(null, null, :'v_question_id', null, 'outro texto qualquer', null))->>'conflict')::boolean as v_c2 \gset
select is(:'v_c2'::boolean, true, 'base null com texto existente diferente é conflito (nunca sobrescreve às cegas, 07-E3)');

select is(
  (select note_text from public.notes where user_id = :'v_user_a' and question_id = :'v_question_id'),
  'primeira nota via RPC',
  'a tentativa de conflito acima NÃO alterou o texto salvo'
);

-- ----------------------------------------------------------------------------
-- 3. Simulado: caminho feliz de primeira gravação continua funcionando com o
--    lock adquirido antes da guarda.
-- ----------------------------------------------------------------------------
select gen_random_uuid() as v_sim_id \gset
select lives_ok(
  format(
    $$ select public.save_simulado_session(jsonb_build_object(
      'id', %L, 'name', 'Simulado 07E3 pgTAP', 'config', jsonb_build_object('name', 'Simulado 07E3 pgTAP'),
      'started_at', now(), 'completed_at', now(), 'score', 50, 'total_time_seconds', 60,
      'questions', jsonb_build_array(), 'answers', jsonb_build_array()
    )) $$,
    :'v_sim_id'
  ),
  'primeira gravação de simulado (sem disputa) continua funcionando com o lock adquirido antes da guarda'
);

-- ----------------------------------------------------------------------------
-- 4. Guarda de estado terminal continua rejeitando reenvio com completed_at
--    diferente (comportamento herdado do 07-E2, agora atrás do lock).
-- ----------------------------------------------------------------------------
select throws_ok(
  format(
    $$ select public.save_simulado_session(jsonb_build_object(
      'id', %L, 'name', 'Simulado 07E3 pgTAP', 'config', jsonb_build_object('name', 'x'),
      'started_at', now(), 'completed_at', now() + interval '1 hour', 'score', 99, 'total_time_seconds', 10,
      'questions', jsonb_build_array(), 'answers', jsonb_build_array()
    )) $$,
    :'v_sim_id'
  ),
  'P0001',
  'sessao_ja_finalizada: esta sessão de simulado já foi finalizada em outro envio e não pode ser sobrescrita',
  'guarda de estado terminal continua funcionando atrás do advisory lock'
);

select is(
  (select score from public.simulations where id = :'v_sim_id'),
  0::numeric,
  'resultado original calculado no servidor (0 sem respostas) preservado — a tentativa de sobrescrita acima foi rejeitada'
);

select tests.clear_auth();

select * from finish();
