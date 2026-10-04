-- ============================================================================
-- 44-H2 — Questões: revisão por IA e publicação pelo veredito
-- O mesmo revisor da 44-F revisa envios de questões (limites de custo somados),
-- e com o "apto" do texto atual o servidor cria e publica as questões, ligadas
-- aos materiais, uma vez só, tudo ou nada; nenhuma questão nova é publicada sem
-- revisão apto (nem pelo admin); selo e "Reportar erro" na questão.
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

create or replace function tests.authenticate_as_service()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);
  perform set_config('role', 'service_role', false);
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

grant usage on schema tests to anon, authenticated, service_role;

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

-- Atestação humana de fixture do conteúdo atual da questão (sem a revisão de IA).
create or replace function tests.atestar_questao(p_question_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid;
  v_snapshot jsonb;
  v_hash text;
  v_revision_id uuid;
begin
  select id into v_admin from public.profiles where role = 'admin' and status = 'active' limit 1;
  v_snapshot := app.build_question_snapshot(p_question_id);
  v_hash := encode(extensions.digest(v_snapshot::text, 'sha256'), 'hex');
  insert into public.content_revisions (question_id, revision_number, snapshot, snapshot_hash, created_by, policy_version)
  values (p_question_id,
          (select coalesce(max(revision_number), 0) + 1 from public.content_revisions where question_id = p_question_id),
          v_snapshot, v_hash, v_admin, 'v1')
  returning id into v_revision_id;
  insert into public.content_reviews (content_revision_id, reviewer_user_id, decision, checklist, policy_version, revision_hash)
  values (v_revision_id, v_admin, 'aprovado', '{"fixture": true}'::jsonb, 'v1', v_hash);
end;
$$;

-- Uma questão em rascunho, completa (2 alternativas, uma correta, explicações, comentário e pérola).
create or replace function tests.nova_questao(p_disc uuid, p_theme uuid, p_stem text)
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
  insert into public.question_options (question_id, letter, option_text, sort_order) values (v_q, 'B', 'Opção B', 2) returning id into v_b;
  insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary) values (v_q, 'Comentário', 'Pérola');
  update public.question_option_keys set is_correct = true, explanation = 'Certa' where option_id = v_a;
  update public.question_option_keys set explanation = 'Errada' where option_id = v_b;
  return v_q;
end;
$$;

-- Um envio de questões com uma revisão concluída do texto atual, como o servidor os deixaria.
create or replace function tests.envio_de_questoes_revisado(
  p_author uuid, p_title text, p_material_ids uuid[] default '{}',
  p_verdict text default 'apto', p_status text default 'apto'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.question_submissions (author_id, title, content_md, material_ids, status)
  values (p_author, p_title, '## Questão 1' || E'\n' || p_title, p_material_ids, p_status) returning id into v_id;
  insert into public.material_reviews (question_submission_id, content_sha256, status, verdict, model, completed_at)
  select s.id, s.content_sha256, 'concluida', p_verdict, 'claude-opus-5-5', now()
    from public.question_submissions s where s.id = v_id;
  return v_id;
end;
$$;

create or replace function tests.review_of_questoes(p_submission uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select r.id from public.material_reviews r where r.question_submission_id = p_submission order by r.created_at desc limit 1;
$$;

-- A leitura do texto que a Edge Function manda ao banco: n questões válidas.
create or replace function tests.leitura_de_questoes(p_disc uuid, p_theme uuid, p_prefix text, p_n int, p_titles jsonb default '[]'::jsonb)
returns jsonb
language sql
as $$
  select jsonb_agg(jsonb_build_object(
    'discipline_id', p_disc, 'theme_id', p_theme, 'cycle', 'internato_residencia', 'difficulty', 'medio',
    'institution', 'NexusMed (questão autoral)', 'year', null,
    'clinical_vignette', 'Caso ' || i, 'question_stem', p_prefix || ' enunciado ' || i,
    'general_commentary', 'Comentário geral ' || i || '. Fonte: https://exemplo.gov.br/diretriz',
    'high_yield_summary', 'Pérola ' || i,
    'tags', jsonb_build_array('teste', 'revisor'),
    'material_titles', p_titles,
    'options', jsonb_build_array(
      jsonb_build_object('letter', 'A', 'text', 'Alternativa A' || i, 'explanation', 'Errada: motivo A', 'is_correct', false),
      jsonb_build_object('letter', 'B', 'text', 'Alternativa B' || i, 'explanation', 'Certa: motivo B', 'is_correct', true),
      jsonb_build_object('letter', 'C', 'text', 'Alternativa C' || i, 'explanation', 'Errada: motivo C', 'is_correct', false)
    )
  ) order by i)
  from generate_series(1, p_n) i;
$$;

-- 44-H2: fixture de "material publicado".
create or replace function tests.novo_material_publicado(p_disc uuid, p_theme uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.materials (discipline_id, theme_id, title) values (p_disc, p_theme, p_title) returning id into v_id;
  insert into public.material_sections (material_id, sort_order, title, content) values (v_id, 0, 'S', 'C.');
  update public.materials set status = 'published' where id = v_id;
  return v_id;
end;
$$;

-- 45-H: função nova não nasce executável por PUBLIC; os helpers rodam como service_role/authenticated.
grant execute on all functions in schema tests to public;

select plan(197);

select tests.clear_auth();
select tests.create_user('h2.admin@test.local', 'admin', 'active') as v_admin \gset
select tests.create_user('h2.autor@test.local', 'admin', 'active') as v_autor \gset
select tests.create_user('h2.aluno@test.local', 'student', 'active') as v_aluno \gset
select tests.create_user('h2.pend@test.local', 'student', 'pending') as v_pend \gset
select tests.create_user('h2.dia@test.local', 'admin', 'active') as v_dia \gset
select substr(gen_random_uuid()::text, 1, 8) as v_sfx \gset

insert into public.disciplines (name, code, cycle) values ('Disciplina 44H2', 'H2-' || :'v_sfx', 'clinico') returning id as v_disc \gset
insert into public.themes (discipline_id, name) values (:'v_disc', 'Tema 44H2') returning id as v_theme \gset

select tests.novo_material_publicado(:'v_disc', :'v_theme', 'Material Q1 ' || :'v_sfx') as v_m1 \gset
select tests.novo_material_publicado(:'v_disc', :'v_theme', 'Material Q2 ' || :'v_sfx') as v_m2 \gset
select tests.novo_material_publicado(:'v_disc', :'v_theme', 'Material Repetido ' || :'v_sfx') as v_rep1 \gset
select tests.novo_material_publicado(:'v_disc', :'v_theme', 'Material Repetido ' || :'v_sfx') as v_rep2 \gset
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Material Rascunho ' || :'v_sfx') returning id as v_mdraft \gset

-- Guarda os tetos como estavam e abre folga; tira da frente o que outros testes deixaram na fila (a reserva é global).
select monthly_review_cap as v_cap_orig, daily_review_cap_per_user as v_daily_orig from public.review_settings \gset
update public.review_settings set monthly_review_cap = 100000, daily_review_cap_per_user = 50;
update public.question_submissions set status = 'erro' where status = 'aguardando_revisao';
update public.material_submissions set status = 'erro' where status = 'aguardando_revisao';

-- ---------------------------------------------------------------------------
-- 1. Estrutura e grants
-- ---------------------------------------------------------------------------
select has_table('public', 'question_ai_provenance', 'tabela de proveniência de IA das questões existe');
select has_table('public', 'question_publicada_antes_44h2', 'tabela do que já estava publicado existe');
select has_column('public', 'material_reviews', 'question_submission_id', 'a revisão pode ser de um envio de questões');
select has_column('public', 'question_submissions', 'published_question_ids', 'o envio guarda as questões publicadas');
select ok(
  not has_table_privilege('anon', 'public.question_ai_provenance', 'select')
  and not has_table_privilege('anon', 'public.question_publicada_antes_44h2', 'select')
  and not has_table_privilege('authenticated', 'public.question_ai_provenance', 'insert')
  and not has_table_privilege('authenticated', 'public.question_ai_provenance', 'update')
  and not has_table_privilege('authenticated', 'public.question_publicada_antes_44h2', 'select'),
  'anon e cliente não escrevem nas tabelas novas'
);
select ok(
  not has_column_privilege('authenticated', 'public.question_submissions', 'published_question_ids', 'update')
  and not has_column_privilege('authenticated', 'public.question_submissions', 'publication_note', 'update')
  and not has_column_privilege('authenticated', 'public.question_submissions', 'published_question_ids', 'insert'),
  'cliente não grava o vínculo com as questões nem o recado do servidor'
);
select ok(
  not has_function_privilege('authenticated', 'public.revisao_publicar_questoes(uuid, uuid, text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.revisao_publicar_questoes(uuid, uuid, text, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.revisao_envios_de_questoes_para_publicar(int)', 'execute')
  and not has_function_privilege('authenticated', 'public.revisao_recusar_publicacao_de_questoes(uuid, uuid, text, text)', 'execute')
  and has_function_privilege('service_role', 'public.revisao_publicar_questoes(uuid, uuid, text, jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.revisao_envios_de_questoes_para_publicar(int)', 'execute')
  and has_function_privilege('service_role', 'public.revisao_recusar_publicacao_de_questoes(uuid, uuid, text, text)', 'execute'),
  'só o servidor publica questões pelo veredito'
);
select ok(
  not has_function_privilege('authenticated', 'app.criar_questao_rascunho(uuid, uuid, uuid, text, text, text, int, text, text, text, text, text[], jsonb, jsonb)', 'execute')
  and not has_function_privilege('anon', 'app.criar_questao_rascunho(uuid, uuid, uuid, text, text, text, int, text, text, text, text, text[], jsonb, jsonb)', 'execute'),
  'a criação interna de questão não é chamável por cliente'
);
select ok(
  not has_function_privilege('anon', 'public.selos_de_questoes(uuid[])', 'execute')
  and has_function_privilege('authenticated', 'public.selos_de_questoes(uuid[])', 'execute')
  and not has_function_privilege('authenticated', 'app.questao_tem_revisao_apto(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'app.question_snapshot_hash(uuid)', 'execute'),
  'anon não consulta os selos; as funções internas não são de cliente'
);

-- ---------------------------------------------------------------------------
-- 2. Revisão: os dois tipos na mesma reserva, com os mesmos limites
-- ---------------------------------------------------------------------------
select tests.create_user('h2.rev@test.local', 'admin', 'active') as v_rev \gset
insert into public.question_submissions (author_id, title, content_md, material_ids)
values (:'v_rev', 'Lote para revisar', '## Questão 1', array[:'v_m2']::uuid[]) returning id as v_qs1 \gset
insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md)
values (:'v_rev', 'Material para revisar', :'v_disc', :'v_theme', '# m') returning id as v_ms1 \gset

create temp table reservados as select * from public.revisao_reservar_envios(0) where false;
grant all on reservados to service_role;
select tests.authenticate_as_service();
insert into reservados select * from public.revisao_reservar_envios(1000);
select tests.clear_auth();

select is((select count(*)::int from reservados where submission_id in (:'v_qs1', :'v_ms1')), 2, 'o servidor reserva o envio de questões e o de material na mesma passada');
select results_eq(
  format($$ select tipo, title, discipline_id is null, theme_id is null, material_titles from reservados where submission_id = %L $$, :'v_qs1'),
  format($$ values ('questoes'::text, 'Lote para revisar'::text, true, true, array[%L]::text[]) $$, 'Material Q2 ' || :'v_sfx'),
  'a reserva de questões traz o tipo, o nome do lote e os títulos dos materiais escolhidos'
);
select is((select tipo from reservados where submission_id = :'v_ms1'), 'material', 'e a de material continua como era');
select results_eq(
  format($$ select status from public.question_submissions where id = %L $$, :'v_qs1'),
  $$ values ('em_revisao'::text) $$, 'o envio de questões vai a "em revisão"'
);
select results_eq(
  format($$ select r.status, r.verdict, r.billable, r.submission_id is null, r.content_sha256 = s.content_sha256 from public.material_reviews r join public.question_submissions s on s.id = r.question_submission_id where s.id = %L $$, :'v_qs1'),
  $$ values ('reservada'::text, null::text, true, true, true) $$,
  'nasce uma revisão "reservada" ligada ao envio de questões, com o hash do texto reservado'
);
select tests.authenticate_as_service();
select is((select count(*)::int from public.revisao_reservar_envios(1000) where submission_id = :'v_qs1'), 0, 'uma segunda reserva não pega de novo o mesmo envio');
select tests.clear_auth();
select throws_ok(
  format($$ insert into public.material_reviews (submission_id, question_submission_id, content_sha256) values (%L, %L, 'x') $$, :'v_ms1', :'v_qs1'),
  '23514', NULL, 'uma revisão é de um envio só (material OU questões)'
);
select throws_ok(
  $$ insert into public.material_reviews (content_sha256) values ('x') $$,
  '23514', NULL, 'e não pode ser de nenhum'
);

-- Resultado: só "apto" lido como apto leva o envio de questões a "apto".
select tests.review_of_questoes(:'v_qs1') as v_rq1 \gset
select tests.authenticate_as_service();
select is(
  public.revisao_registrar_resultado(:'v_rq1', 'apto', 'APTO PARA ENVIAR', 'achados', null, null, 'claude-opus-5-5', 'p', 1000, 500, 0, 0, 3, 4, 'end_turn'),
  true, 'resultado "apto" do lote de questões é registrado'
);
select is(
  public.revisao_registrar_resultado(:'v_rq1', 'nao_apto', null, null, null, null, 'm', 'p', 1, 1, 0, 0, 0, 0, 'end_turn'),
  false, 'e uma segunda chamada para a mesma revisão não faz nada (idempotente)'
);
select tests.clear_auth();
select is((select status from public.question_submissions where id = :'v_qs1'), 'apto', 'o envio de questões vai a "apto"');
select is((select status from public.material_submissions where id = :'v_ms1'), 'em_revisao', 'e o de material não é tocado');

-- Texto mudado durante a revisão: o resultado vale para o texto antigo e não muda o estado.
insert into public.question_submissions (author_id, title, content_md) values (:'v_rev', 'Lote que muda', '## Questão 1') returning id as v_qs2 \gset
select tests.authenticate_as_service();
select count(*) from public.revisao_reservar_envios(1000) where submission_id = :'v_qs2' \gset
select tests.clear_auth();
select tests.review_of_questoes(:'v_qs2') as v_rq2 \gset
update public.question_submissions set content_md = '## Questão 1 alterada' where id = :'v_qs2';
select tests.authenticate_as_service();
select public.revisao_registrar_resultado(:'v_rq2', 'apto', 'APTO PARA ENVIAR', null, null, null, 'm', 'p', 1, 1, 0, 0, 0, 0, 'end_turn');
select tests.clear_auth();
select is((select status from public.question_submissions where id = :'v_qs2'), 'em_revisao', 'texto mudado depois da reserva: o resultado não muda o estado do envio');
select is(app.revisao_apto_do_envio_de_questoes(:'v_qs2'::uuid), null::uuid, 'e a revisão do texto antigo não vale para o novo');

-- "Não apto" e "erro" (falha fechada).
insert into public.question_submissions (author_id, title, content_md) values (:'v_rev', 'Lote não apto', '## Questão 1') returning id as v_qs3 \gset
-- A fila é de 3 por pessoa (material e questões somados): o quarto envio é de outra pessoa.
select tests.create_user('h2.rev2@test.local', 'admin', 'active') as v_rev2 \gset
insert into public.question_submissions (author_id, title, content_md) values (:'v_rev2', 'Lote erro', '## Questão 1') returning id as v_qs4 \gset
select tests.authenticate_as_service();
select count(*) from public.revisao_reservar_envios(1000) where submission_id in (:'v_qs3', :'v_qs4') \gset
select tests.clear_auth();
select tests.review_of_questoes(:'v_qs3') as v_rq3 \gset
select tests.review_of_questoes(:'v_qs4') as v_rq4 \gset
select tests.authenticate_as_service();
select public.revisao_registrar_resultado(:'v_rq3', 'nao_apto', 'NÃO APTO — 1 achado grave', 'achados', 'Corrija...', null, 'm', 'p', 1, 1, 0, 0, 0, 0, 'end_turn');
select public.revisao_registrar_resultado(:'v_rq4', 'lixo', null, null, null, null, 'm', 'p', 1, 1, 0, 0, 0, 0, 'end_turn');
select tests.clear_auth();
select is((select status from public.question_submissions where id = :'v_qs3'), 'nao_apto', 'veredito "não apto": o envio vai a "não apto"');
select is((select status from public.question_submissions where id = :'v_qs4'), 'erro', 'veredito ilegível vira "erro", nunca "apto"');

-- O autor lê a revisão do próprio envio de questões; outra pessoa não.
select tests.authenticate_as(:'v_rev');
select is((select count(*)::int from public.material_reviews where question_submission_id in (:'v_qs1', :'v_qs3')), 2, 'o autor lê as revisões dos próprios envios de questões');
select tests.clear_auth();
select tests.authenticate_as(:'v_aluno');
select is((select count(*)::int from public.material_reviews where question_submission_id in (:'v_qs1', :'v_qs3')), 0, 'outra pessoa não lê as revisões alheias');
select tests.clear_auth();
select tests.authenticate_as(:'v_admin');
select is((select count(*)::int from public.material_reviews where question_submission_id in (:'v_qs1', :'v_qs3')), 2, 'admin ativo lê todas');
select tests.clear_auth();

-- Liberar (certeza de que não há lote): o envio de questões volta à fila e a reserva some.
insert into public.question_submissions (author_id, title, content_md) values (:'v_rev', 'Lote a liberar', '## Questão 1') returning id as v_qs5 \gset
select tests.authenticate_as_service();
select count(*) from public.revisao_reservar_envios(1000) where submission_id = :'v_qs5' \gset
select tests.clear_auth();
select tests.review_of_questoes(:'v_qs5') as v_rq5 \gset
select tests.authenticate_as_service();
select is(public.revisao_liberar(array[:'v_rq5'::uuid]), 1, 'liberar apaga a reserva de questões sem lote');
select tests.clear_auth();
select is((select status from public.question_submissions where id = :'v_qs5'), 'aguardando_revisao', 'e o envio de questões volta para a fila');
select is((select count(*)::int from public.material_reviews where id = :'v_rq5'), 0, 'a reserva liberada não fica guardada (não conta no limite)');

-- Dados do envio para continuar uma revisão pausada.
select tests.authenticate_as_service();
select results_eq(
  format($$ select tipo, title, material_titles from public.revisao_dados_do_envio(array[%L]::uuid[]) $$, :'v_rq1'),
  format($$ values ('questoes'::text, 'Lote para revisar'::text, array[%L]::text[]) $$, 'Material Q2 ' || :'v_sfx'),
  'os dados para continuar a revisão trazem o tipo e os materiais'
);
select tests.clear_auth();

-- Limites de custo: as revisões de questões contam no teto diário por pessoa e no mensal.
select tests.create_user('h2.cap@test.local', 'student', 'active') as v_cap \gset
update public.review_settings set daily_review_cap_per_user = 1;
insert into public.question_submissions (author_id, title, content_md) values (:'v_cap', 'Lote do cap 1', '## Questão 1') returning id as v_qcap1 \gset
insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md)
values (:'v_cap', 'Material do cap', :'v_disc', :'v_theme', '# m') returning id as v_mcap \gset
select tests.authenticate_as_service();
select count(*) from public.revisao_reservar_envios(1000) where submission_id = :'v_qcap1' \gset
select tests.clear_auth();
select is(app.reviews_used_by_user_today(:'v_cap'::uuid), 1, 'a revisão de questões conta no uso do dia da pessoa');
select tests.authenticate_as_service();
select is((select count(*)::int from public.revisao_reservar_envios(1000) where submission_id = :'v_mcap'), 0, 'com o teto diário de 1 gasto em questões, o envio de material da mesma pessoa espera');
select tests.clear_auth();
select is((select status from public.material_submissions where id = :'v_mcap'), 'aguardando_revisao', 'e continua na fila');
update public.review_settings set daily_review_cap_per_user = 50;
select tests.create_user('h2.mes@test.local', 'student', 'active') as v_mes \gset
insert into public.question_submissions (author_id, title, content_md) values (:'v_mes', 'Lote do mês', '## Questão 1') returning id as v_qmes \gset
select app.reviews_used_this_month() as v_usado_mes \gset
update public.review_settings set monthly_review_cap = :v_usado_mes;
select tests.authenticate_as_service();
select is((select count(*)::int from public.revisao_reservar_envios(1000) where submission_id = :'v_qmes'), 0, 'com o teto mensal atingido, o envio de questões espera');
select tests.clear_auth();
update public.review_settings set monthly_review_cap = 100000;

-- P7: o admin (o dono, que é quem envia) não é barrado pelos tetos do dia e do mês; os demais continuam.
select tests.create_user('h2.dono@test.local', 'admin', 'active') as v_dono \gset
update public.review_settings set daily_review_cap_per_user = 1;
insert into public.question_submissions (author_id, title, content_md) values (:'v_dono', 'Lote do dono 1', '## Questão 1') returning id as v_qd1 \gset
insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md)
values (:'v_dono', 'Material do dono', :'v_disc', :'v_theme', '# m') returning id as v_md1 \gset
select tests.authenticate_as_service();
select is((select count(*)::int from public.revisao_reservar_envios(1000) where submission_id in (:'v_qd1', :'v_md1')), 2, 'P7: com o teto diário de 1, o admin não é barrado: os dois envios dele são reservados para revisão');
select tests.clear_auth();
update public.review_settings set daily_review_cap_per_user = 50;
insert into public.question_submissions (author_id, title, content_md) values (:'v_dono', 'Lote do dono mês', '## Questão 1') returning id as v_qd2 \gset
select app.reviews_used_this_month() as v_usado_mes2 \gset
update public.review_settings set monthly_review_cap = :v_usado_mes2;
select tests.authenticate_as_service();
select is((select count(*)::int from public.revisao_reservar_envios(1000) where submission_id = :'v_qd2'), 1, 'P7: com o teto mensal atingido, o envio do admin ainda é revisado');
select tests.clear_auth();
update public.review_settings set monthly_review_cap = 100000;

-- ---------------------------------------------------------------------------
-- 3. Publicação pelo servidor
-- ---------------------------------------------------------------------------
select tests.envio_de_questoes_revisado(:'v_autor', 'Lote apto 1 ' || :'v_sfx', array[]::uuid[]) as v_e1 \gset
select tests.envio_de_questoes_revisado(:'v_autor', 'Lote nao apto ' || :'v_sfx', array[]::uuid[], 'nao_apto', 'nao_apto') as v_e_nao \gset
select tests.envio_de_questoes_revisado(:'v_autor', 'Lote incoerente ' || :'v_sfx', array[]::uuid[], 'nao_apto', 'apto') as v_e_inco \gset
select tests.envio_de_questoes_revisado(:'v_autor', 'Lote texto mudou ' || :'v_sfx', array[]::uuid[]) as v_e_mudou \gset
update public.question_submissions set content_md = content_md || E'\ntexto novo' where id = :'v_e_mudou';
select tests.review_of_questoes(:'v_e1') as v_r1 \gset
select content_sha256 as v_h1 from public.question_submissions where id = :'v_e1' \gset

select tests.authenticate_as(:'v_admin');
select throws_ok($$ select * from public.revisao_envios_de_questoes_para_publicar(10) $$, '42501', NULL, 'nem admin busca envios de questões para publicar: é do servidor');
select throws_ok(
  format($$ select public.revisao_publicar_questoes(%L, %L, %L, tests.leitura_de_questoes(%L, %L, 'x', 1, '["y"]'::jsonb)) $$, :'v_e1', :'v_r1', :'v_h1', :'v_disc', :'v_theme'),
  '42501', NULL, 'nem admin publica questões pelo veredito: é do servidor'
);
select tests.clear_auth();

create temp table prontos as select * from public.revisao_envios_de_questoes_para_publicar(0) where false;
grant all on prontos to service_role;
select tests.authenticate_as_service();
insert into prontos select * from public.revisao_envios_de_questoes_para_publicar(1000);
select tests.clear_auth();
select is((select count(*)::int from prontos where submission_id = :'v_e1'), 1, 'envio apto com revisão apto do texto atual está pronto');
select is((select review_id from prontos where submission_id = :'v_e1'), :'v_r1'::uuid, 'com o id da revisão apto');
select is((select content_sha256 from prontos where submission_id = :'v_e1'), :'v_h1', 'e o hash do texto que a revisão viu');
select is((select count(*)::int from prontos where submission_id in (:'v_e_nao', :'v_e_inco', :'v_e_mudou')), 0, 'não apto, apto com revisão não apto e apto com texto mudado não estão prontos (falha fechada)');

-- Não publica sem ser a revisão certa, o texto certo ou o estado certo.
select tests.authenticate_as_service();
select is((public.revisao_publicar_questoes(:'v_e1', gen_random_uuid(), :'v_h1', tests.leitura_de_questoes(:'v_disc', :'v_theme', 'A', 1, jsonb_build_array('Material Q1 ' || :'v_sfx'))))->>'resultado', 'revisao_invalida', 'revisão diferente da que vale para o texto: não publica');
select is((public.revisao_publicar_questoes(:'v_e1', :'v_r1', 'hash-de-outro-texto', tests.leitura_de_questoes(:'v_disc', :'v_theme', 'A', 1, jsonb_build_array('Material Q1 ' || :'v_sfx'))))->>'resultado', 'revisao_invalida', 'texto lido diferente do revisado: não publica');
select is((public.revisao_publicar_questoes(:'v_e_nao', tests.review_of_questoes(:'v_e_nao'), (select content_sha256 from public.question_submissions where id = :'v_e_nao'), tests.leitura_de_questoes(:'v_disc', :'v_theme', 'A', 1, '[]'::jsonb)))->>'resultado', 'fora_de_estado', 'envio "não apto" não é publicado');
select is((public.revisao_publicar_questoes(:'v_e_inco', tests.review_of_questoes(:'v_e_inco'), (select content_sha256 from public.question_submissions where id = :'v_e_inco'), tests.leitura_de_questoes(:'v_disc', :'v_theme', 'A', 1, '[]'::jsonb)))->>'resultado', 'revisao_invalida', 'envio "apto" com revisão "não apto": não publica');
select is((public.revisao_publicar_questoes(:'v_e1', :'v_r1', :'v_h1', '[]'::jsonb))->>'resultado', 'revisao_invalida', 'leitura sem nenhuma questão: não publica');
select tests.clear_auth();
select is((select count(*)::int from public.questions where question_stem like 'A enunciado%'), 0, 'nenhuma dessas tentativas criou questão');

-- O caminho feliz: 2 questões, ligadas a 2 materiais pelo título exato.
select tests.authenticate_as_service();
select public.revisao_publicar_questoes(
  :'v_e1', :'v_r1', :'v_h1',
  tests.leitura_de_questoes(:'v_disc', :'v_theme', 'Feliz ' || :'v_sfx', 2, jsonb_build_array('Material Q1 ' || :'v_sfx', 'Material  Q2 ' || :'v_sfx'))
) as v_res1 \gset
select tests.clear_auth();
select is((:'v_res1'::jsonb)->>'resultado', 'publicado', 'envio apto vira questões publicadas');
select is(jsonb_array_length((:'v_res1'::jsonb)->'question_ids'), 2, 'uma por questão do arquivo');
select array(select jsonb_array_elements_text((:'v_res1'::jsonb)->'question_ids')::uuid) as v_qids \gset
select is((select count(*)::int from public.questions where id = any (:'v_qids'::uuid[]) and status = 'published'), 2, 'as duas estão publicadas');
select results_eq(
  format($$ select discipline_id, theme_id, cycle, difficulty, institution, year, clinical_vignette, question_stem from public.questions where question_stem = %L $$, 'Feliz ' || :'v_sfx' || ' enunciado 1'),
  format($$ values (%L::uuid, %L::uuid, 'internato_residencia'::text, 'medio'::text, 'NexusMed (questão autoral)'::text, null::int, 'Caso 1'::text, %L::text) $$, :'v_disc', :'v_theme', 'Feliz ' || :'v_sfx' || ' enunciado 1'),
  'com os dados do texto (Disciplina, Tema, banca autoral, sem ano)'
);
select is(
  (select count(*)::int from public.question_options where question_id = any (:'v_qids'::uuid[])),
  6, 'com as 3 alternativas de cada uma'
);
select is(
  (select count(*)::int from public.question_option_keys k where k.question_id = any (:'v_qids'::uuid[])),
  6, 'e exatamente uma chave por alternativa (a armadilha 16: UPDATE, não INSERT)'
);
select results_eq(
  format($$ select o.letter, k.is_correct, k.explanation from public.question_options o join public.question_option_keys k on k.option_id = o.id where o.question_id = %L order by o.sort_order $$, (:'v_qids'::uuid[])[1]),
  $$ values ('A'::text, false, 'Errada: motivo A'::text), ('B'::text, true, 'Certa: motivo B'::text), ('C'::text, false, 'Errada: motivo C'::text) $$,
  'a chave de cada alternativa tem o gabarito e a explicação do texto'
);
select results_eq(
  format($$ select general_commentary like 'Comentário geral 1.%%', high_yield_summary from public.question_answer_keys where question_id = %L $$, (:'v_qids'::uuid[])[1]),
  $$ values (true, 'Pérola 1'::text) $$, 'com o comentário geral e a pérola'
);
select is(
  (select array_agg(material_id order by sort_order) from public.question_materials where question_id = (:'v_qids'::uuid[])[1]),
  array[:'v_m1', :'v_m2']::uuid[],
  'cada questão ligada aos dois materiais pelo título exato, na ordem do arquivo (espaços repetidos não contam)'
);
select results_eq(
  format($$ select status, published_question_ids = %L::uuid[], publication_note from public.question_submissions where id = %L $$, :'v_qids', :'v_e1'),
  $$ values ('publicado'::text, true, null::text) $$,
  'o envio vira "publicado", com os ids das questões'
);
select results_eq(
  format($$ select p.review_id, p.review_verdict, p.text_sha256, p.submission_id from public.question_ai_provenance p where p.question_id = %L $$, (:'v_qids'::uuid[])[1]),
  format($$ values (%L::uuid, 'apto'::text, %L::text, %L::uuid) $$, :'v_r1', :'v_h1', :'v_e1'),
  'a proveniência liga a questão ao envio e à revisão apto'
);
select is(
  (select snapshot_hash from public.question_ai_provenance where question_id = (:'v_qids'::uuid[])[2]),
  app.question_snapshot_hash(((:'v_qids'::uuid[])[2])),
  'e guarda o hash da questão como foi publicada'
);
select ok(app.questao_tem_revisao_apto((:'v_qids'::uuid[])[1]), 'a questão tem revisão apto vinculada ao conteúdo atual');

-- Idempotência.
select tests.authenticate_as_service();
select public.revisao_publicar_questoes(:'v_e1', :'v_r1', :'v_h1', tests.leitura_de_questoes(:'v_disc', :'v_theme', 'Feliz ' || :'v_sfx', 2, jsonb_build_array('Material Q1 ' || :'v_sfx'))) as v_res1b \gset
select is((select count(*)::int from public.revisao_envios_de_questoes_para_publicar(1000) where submission_id = :'v_e1'), 0, 'o envio publicado não volta à lista de prontos');
select tests.clear_auth();
select is((:'v_res1b'::jsonb)->>'resultado', 'ja_publicado', 'rodar de novo não publica outra vez');
select is((select count(*)::int from public.questions where question_stem like 'Feliz ' || :'v_sfx' || '%'), 2, 'continuam 2 questões só');
select is((select count(*)::int from public.question_ai_provenance where submission_id = :'v_e1'), 2, 'e 2 proveniências só');

-- O estudante vê e responde a questão publicada (RLS).
select tests.authenticate_as(:'v_aluno');
select is((select count(*)::int from public.questions where id = any (:'v_qids'::uuid[])), 2, 'o estudante vê as questões publicadas');
select is((select count(*)::int from public.question_options where question_id = any (:'v_qids'::uuid[])), 6, 'e as alternativas');
select is((select count(*)::int from public.question_materials where question_id = any (:'v_qids'::uuid[])), 4, 'e vê o vínculo com os materiais (publicados)');
select tests.clear_auth();

-- Materiais escolhidos na tela valem para as questões sem título.
select tests.envio_de_questoes_revisado(:'v_autor', 'Lote com material escolhido ' || :'v_sfx', array[:'v_m1']::uuid[]) as v_e_esc \gset
select tests.authenticate_as_service();
select public.revisao_publicar_questoes(:'v_e_esc', tests.review_of_questoes(:'v_e_esc'), (select content_sha256 from public.question_submissions where id = :'v_e_esc'), tests.leitura_de_questoes(:'v_disc', :'v_theme', 'Escolhido ' || :'v_sfx', 1, '[]'::jsonb)) as v_res_esc \gset
select tests.clear_auth();
select is((:'v_res_esc'::jsonb)->>'resultado', 'publicado', 'sem título no arquivo, vale o material escolhido na tela');
select is(
  (select array_agg(qm.material_id) from public.question_materials qm join public.questions q on q.id = qm.question_id where q.question_stem = 'Escolhido ' || :'v_sfx' || ' enunciado 1'),
  array[:'v_m1']::uuid[], 'e a questão fica ligada a ele'
);

-- ---------------------------------------------------------------------------
-- 4. Recusas: nunca publica parcial
-- ---------------------------------------------------------------------------
-- Material que não existe.
select tests.envio_de_questoes_revisado(:'v_autor', 'Lote material inexistente ' || :'v_sfx') as v_e_r1 \gset
select tests.authenticate_as_service();
select public.revisao_publicar_questoes(:'v_e_r1', tests.review_of_questoes(:'v_e_r1'), (select content_sha256 from public.question_submissions where id = :'v_e_r1'),
  tests.leitura_de_questoes(:'v_disc', :'v_theme', 'Recusa1 ' || :'v_sfx', 2, jsonb_build_array('Material Q1 ' || :'v_sfx', 'Material que não existe'))) as v_res_r1 \gset
select tests.clear_auth();
select is((:'v_res_r1'::jsonb)->>'resultado', 'recusado', 'título de material que não existe: recusado');
select is((select count(*)::int from public.questions where question_stem like 'Recusa1 ' || :'v_sfx' || '%'), 0, 'nenhuma questão criada, nem a primeira (nunca parcial)');
select results_eq(
  format($$ select status, publication_note like '%%o material “Material que não existe” não existe ou não está publicado%%', cardinality(published_question_ids) from public.question_submissions where id = %L $$, :'v_e_r1'),
  $$ values ('nao_apto'::text, true, 0) $$,
  'o envio vai a "não apto" com o motivo em palavras leigas'
);

-- Título ambíguo (dois materiais publicados com o mesmo título).
select tests.envio_de_questoes_revisado(:'v_autor', 'Lote titulo ambiguo ' || :'v_sfx') as v_e_r2 \gset
select tests.authenticate_as_service();
select public.revisao_publicar_questoes(:'v_e_r2', tests.review_of_questoes(:'v_e_r2'), (select content_sha256 from public.question_submissions where id = :'v_e_r2'),
  tests.leitura_de_questoes(:'v_disc', :'v_theme', 'Recusa2 ' || :'v_sfx', 1, jsonb_build_array('Material Repetido ' || :'v_sfx'))) as v_res_r2 \gset
select tests.clear_auth();
select is((:'v_res_r2'::jsonb)->>'resultado', 'recusado', 'título de material ambíguo: recusado');
select ok((select publication_note like '%mais de um material publicado%' from public.question_submissions where id = :'v_e_r2'), 'com o motivo em palavras leigas');
select is((select count(*)::int from public.questions where question_stem like 'Recusa2 ' || :'v_sfx' || '%'), 0, 'e nenhuma questão criada');

-- Material em rascunho.
select tests.envio_de_questoes_revisado(:'v_autor', 'Lote material rascunho ' || :'v_sfx') as v_e_r3 \gset
select tests.authenticate_as_service();
select public.revisao_publicar_questoes(:'v_e_r3', tests.review_of_questoes(:'v_e_r3'), (select content_sha256 from public.question_submissions where id = :'v_e_r3'),
  tests.leitura_de_questoes(:'v_disc', :'v_theme', 'Recusa3 ' || :'v_sfx', 1, jsonb_build_array('Material Rascunho ' || :'v_sfx'))) as v_res_r3 \gset
select tests.clear_auth();
select is((:'v_res_r3'::jsonb)->>'resultado', 'recusado', 'material que não está publicado: recusado');

-- Material escolhido na tela que saiu do ar antes da publicação.
select tests.novo_material_publicado(:'v_disc', :'v_theme', 'Material que sai ' || :'v_sfx') as v_msai \gset
select tests.envio_de_questoes_revisado(:'v_autor', 'Lote material que sai ' || :'v_sfx', array[:'v_msai']::uuid[]) as v_e_r4 \gset
update public.materials set status = 'draft' where id = :'v_msai';
select tests.authenticate_as_service();
select public.revisao_publicar_questoes(:'v_e_r4', tests.review_of_questoes(:'v_e_r4'), (select content_sha256 from public.question_submissions where id = :'v_e_r4'),
  tests.leitura_de_questoes(:'v_disc', :'v_theme', 'Recusa4 ' || :'v_sfx', 1, '[]'::jsonb)) as v_res_r4 \gset
select tests.clear_auth();
select is((:'v_res_r4'::jsonb)->>'resultado', 'recusado', 'material escolhido que saiu do ar antes de publicar: recusado');
select ok((select publication_note like '%não está mais publicado%' from public.question_submissions where id = :'v_e_r4'), 'com o motivo em palavras leigas');

-- Sem material nenhum (nem no arquivo nem escolhido).
select tests.envio_de_questoes_revisado(:'v_autor', 'Lote sem material ' || :'v_sfx') as v_e_r5 \gset
select tests.authenticate_as_service();
select public.revisao_publicar_questoes(:'v_e_r5', tests.review_of_questoes(:'v_e_r5'), (select content_sha256 from public.question_submissions where id = :'v_e_r5'),
  tests.leitura_de_questoes(:'v_disc', :'v_theme', 'Recusa5 ' || :'v_sfx', 1, '[]'::jsonb)) as v_res_r5 \gset
select tests.clear_auth();
select is((:'v_res_r5'::jsonb)->>'resultado', 'recusado', 'sem material no arquivo nem na escolha: recusado');

-- Questão que o banco não publicaria (sem alternativa correta).
select tests.envio_de_questoes_revisado(:'v_autor', 'Lote questao invalida ' || :'v_sfx') as v_e_r6 \gset
select tests.authenticate_as_service();
select public.revisao_publicar_questoes(:'v_e_r6', tests.review_of_questoes(:'v_e_r6'), (select content_sha256 from public.question_submissions where id = :'v_e_r6'),
  jsonb_set(tests.leitura_de_questoes(:'v_disc', :'v_theme', 'Recusa6 ' || :'v_sfx', 2, jsonb_build_array('Material Q1 ' || :'v_sfx')), '{1,options,1,is_correct}', 'false')) as v_res_r6 \gset
select tests.clear_auth();
select is((:'v_res_r6'::jsonb)->>'resultado', 'recusado', 'segunda questão sem alternativa correta: o envio inteiro é recusado');
select is((select count(*)::int from public.questions where question_stem like 'Recusa6 ' || :'v_sfx' || '%'), 0, 'e a primeira, que era boa, também não foi criada');

-- Falha no meio: nada fica pela metade.
select tests.envio_de_questoes_revisado(:'v_autor', 'Lote que falha ' || :'v_sfx') as v_e_f \gset
select tests.authenticate_as_service();
select public.revisao_publicar_questoes(:'v_e_f', tests.review_of_questoes(:'v_e_f'), (select content_sha256 from public.question_submissions where id = :'v_e_f'),
  jsonb_set(tests.leitura_de_questoes(:'v_disc', :'v_theme', 'Falha ' || :'v_sfx', 2, jsonb_build_array('Material Q1 ' || :'v_sfx')), '{1,discipline_id}', to_jsonb(gen_random_uuid()::text))) as v_res_f \gset
select tests.clear_auth();
select is((:'v_res_f'::jsonb)->>'resultado', 'falhou', 'disciplina que não existe na 2ª questão, no meio da criação: falhou');
select is((select count(*)::int from public.questions where question_stem like 'Falha ' || :'v_sfx' || '%'), 0, 'nenhuma questão ficou criada (a 1ª foi desfeita)');
select is((select count(*)::int from public.question_ai_provenance where submission_id = :'v_e_f'), 0, 'nenhuma proveniência ficou');
select results_eq(
  format($$ select status, cardinality(published_question_ids), publication_note is not null from public.question_submissions where id = %L $$, :'v_e_f'),
  $$ values ('erro'::text, 0, true) $$,
  'o envio vai a "erro" (a pessoa pode tentar de novo), com recado leigo'
);
select is(
  (select count(*)::int from public.questions q where q.status = 'published'
     and exists (select 1 from public.question_submissions s where q.id = any (s.published_question_ids))
     and not exists (select 1 from public.question_ai_provenance p where p.question_id = q.id)),
  0, 'nenhuma questão publicada pelo servidor ficou sem vínculo'
);

-- "Tentar de novo" com revisão apto válida: volta a "apto", sem nova revisão.
select tests.authenticate_as(:'v_autor');
select revs_antes from (select count(*)::int as revs_antes from public.material_reviews where question_submission_id = :'v_e_f') t \gset
select is(tests.affected_rows(format($$ update public.question_submissions set title = title where id = %L $$, :'v_e_f')), 1, 'o autor refaz o envio "erro" sem mudar o texto');
select tests.clear_auth();
select results_eq(
  format($$ select status, publication_note from public.question_submissions where id = %L $$, :'v_e_f'),
  $$ values ('apto'::text, null::text) $$,
  'texto com revisão apto válida: volta a "apto" (não a "aguardando revisão"), sem recado'
);
select is((select count(*)::int from public.material_reviews where question_submission_id = :'v_e_f'), :revs_antes, 'nenhuma revisão nova foi criada');
select tests.authenticate_as_service();
select is(
  (public.revisao_publicar_questoes(:'v_e_f', tests.review_of_questoes(:'v_e_f'), (select content_sha256 from public.question_submissions where id = :'v_e_f'),
     tests.leitura_de_questoes(:'v_disc', :'v_theme', 'Falha ' || :'v_sfx', 2, jsonb_build_array('Material Q1 ' || :'v_sfx'))))->>'resultado',
  'publicado', 'e a publicação é refeita e dá certo'
);
select tests.clear_auth();
-- Texto mudado ou revisão que não é apto: volta à fila, como sempre.
select tests.envio_de_questoes_revisado(:'v_autor', 'Retry texto novo ' || :'v_sfx', array[]::uuid[], 'apto', 'erro') as v_e_t2 \gset
select tests.authenticate_as(:'v_autor');
select lives_ok(format($$ update public.question_submissions set content_md = '## Questão 1 nova' where id = %L $$, :'v_e_t2'), 'o autor troca o texto do envio "erro"');
select tests.clear_auth();
select is((select status from public.question_submissions where id = :'v_e_t2'), 'aguardando_revisao', 'texto novo volta à fila de revisão');
select tests.envio_de_questoes_revisado(:'v_autor', 'Retry nao apto ' || :'v_sfx', array[]::uuid[], 'nao_apto', 'nao_apto') as v_e_t3 \gset
select tests.authenticate_as(:'v_autor');
select lives_ok(format($$ update public.question_submissions set title = title where id = %L $$, :'v_e_t3'), 'o autor refaz o envio "não apto" sem mudar o texto');
select tests.clear_auth();
select is((select status from public.question_submissions where id = :'v_e_t3'), 'aguardando_revisao', 'revisão "não apto" não vale como aprovação: volta à fila de revisão');
-- Recusado na publicação (ex.: material escolhido saiu do ar): o autor escolhe outro material.
-- O lugar mudou, e a IA revisou o lugar antigo: o envio volta à REVISÃO (não a "apto").
select tests.authenticate_as(:'v_autor');
select lives_ok(format($$ update public.question_submissions set material_ids = array[%L]::uuid[] where id = %L $$, :'v_m2', :'v_e_r4'), 'o autor escolhe outro material, com o mesmo texto');
select tests.clear_auth();
select results_eq(
  format($$ select status, publication_note from public.question_submissions where id = %L $$, :'v_e_r4'),
  $$ values ('aguardando_revisao'::text, null::text) $$,
  'material novo: o envio volta a "aguardando revisão", e o recado antigo some'
);
select tests.authenticate_as(:'v_aluno');
select is(app.envio_de_questoes_tem_revisao_apto_do_autor(:'v_e_r4'::uuid, array[:'v_msai']::uuid[]), false, 'outra pessoa não descobre se o envio alheio tem revisão apto');
select tests.clear_auth();

-- Materiais escolhidos: sem NULL e sem repetição, no banco (uma pessoa sem envios esperando: a fila não atrapalha).
select tests.create_user('h2.autor4@test.local', 'admin', 'active') as v_autor4 \gset
select tests.authenticate_as(:'v_autor4');
select throws_ok(
  format($$ insert into public.question_submissions (title, content_md, material_ids) values ('Repetido', '## Questão 1', array[%L, %L]::uuid[]) $$, :'v_m1', :'v_m1'),
  '23514', NULL, 'o mesmo material duas vezes na escolha é recusado'
);
select throws_ok(
  format($$ insert into public.question_submissions (title, content_md, material_ids) values ('Com nulo', '## Questão 1', array[%L, null]::uuid[]) $$, :'v_m1'),
  '23514', NULL, 'NULL na lista de materiais é recusado'
);
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 4b. A revisão vale para o texto E para o LUGAR (o conjunto de materiais), como na 44-G3
-- ---------------------------------------------------------------------------
select tests.create_user('h2.autor3@test.local', 'admin', 'active') as v_autor3 \gset

-- A revisão guarda os materiais que a IA recebeu, gravados pelo banco na reserva.
insert into public.question_submissions (author_id, title, content_md, material_ids)
values (:'v_autor3', 'Lugar reservado ' || :'v_sfx', '## Questão 1 lugar', array[:'v_m1', :'v_m2']::uuid[]) returning id as v_e_lug \gset
select tests.authenticate_as_service();
select count(*) from public.revisao_reservar_envios(1000) where submission_id = :'v_e_lug' \gset
select tests.clear_auth();
select is(
  (select array_agg(x order by x) from public.material_reviews r, unnest(r.material_ids) x where r.question_submission_id = :'v_e_lug'),
  (select array_agg(x order by x) from unnest(array[:'v_m1', :'v_m2']::uuid[]) x),
  'a revisão guarda os materiais que a IA recebeu, gravados pelo banco na reserva'
);
select tests.review_of_questoes(:'v_e_lug') as v_r_lug \gset
-- Se os materiais mudarem durante a revisão (por fora do fluxo do autor), o resultado não leva o envio a "apto".
update public.question_submissions set material_ids = array[:'v_m1']::uuid[] where id = :'v_e_lug';
select tests.authenticate_as_service();
select public.revisao_registrar_resultado(:'v_r_lug', 'apto', 'APTO PARA ENVIAR', null, null, null, 'm', 'p', 1, 1, 0, 0, 0, 0, 'end_turn');
select tests.clear_auth();
select is((select status from public.question_submissions where id = :'v_e_lug'), 'em_revisao', 'materiais mudados durante a revisão: o resultado não leva o envio a "apto"');
update public.question_submissions set status = 'erro' where id = :'v_e_lug';  -- sai da fila (são 3 por pessoa)

-- A sonda do revisor: o autor troca os materiais de um envio em "erro" com revisão apto do MESMO texto.
select tests.envio_de_questoes_revisado(:'v_autor3', 'Sonda troca ' || :'v_sfx', array[:'v_m1']::uuid[], 'apto', 'erro') as v_e_s1 \gset
select tests.envio_de_questoes_revisado(:'v_autor3', 'Sonda acrescenta ' || :'v_sfx', array[:'v_m1']::uuid[], 'apto', 'erro') as v_e_s2 \gset
select tests.envio_de_questoes_revisado(:'v_autor3', 'Sonda tira ' || :'v_sfx', array[:'v_m1', :'v_m2']::uuid[], 'apto', 'erro') as v_e_s3 \gset
select tests.envio_de_questoes_revisado(:'v_autor3', 'Sonda mesma ordem inversa ' || :'v_sfx', array[:'v_m1', :'v_m2']::uuid[], 'apto', 'erro') as v_e_s4 \gset
select tests.authenticate_as(:'v_autor3');
select is(tests.affected_rows(format($$ update public.question_submissions set material_ids = array[%L]::uuid[] where id = %L $$, :'v_m2', :'v_e_s1')), 1, 'o autor troca o material de um envio em "erro" (pela API)');
select is(tests.affected_rows(format($$ update public.question_submissions set material_ids = array[%L, %L]::uuid[] where id = %L $$, :'v_m1', :'v_m2', :'v_e_s2')), 1, 'o autor acrescenta um material a outro envio');
select is(tests.affected_rows(format($$ update public.question_submissions set material_ids = array[%L]::uuid[] where id = %L $$, :'v_m1', :'v_e_s3')), 1, 'o autor tira um material de um terceiro');
select is(tests.affected_rows(format($$ update public.question_submissions set material_ids = array[%L, %L]::uuid[] where id = %L $$, :'v_m2', :'v_m1', :'v_e_s4')), 1, 'e num quarto só muda a ordem dos mesmos materiais');
select tests.clear_auth();
select is(
  (select array_agg(status order by title) from public.question_submissions where id in (:'v_e_s1', :'v_e_s2', :'v_e_s3')),
  array['aguardando_revisao', 'aguardando_revisao', 'aguardando_revisao']::text[],
  'materiais trocados, acrescentados ou tirados: o envio volta a "aguardando revisão", nunca a "apto"'
);
select is((select status from public.question_submissions where id = :'v_e_s4'), 'apto', 'o mesmo conjunto de materiais (só a ordem mudou) continua "apto"');
select is((select count(*)::int from public.material_reviews where question_submission_id = :'v_e_s4'), 1, 'e sem nova revisão');
-- Mesmo que o estado fosse forçado a "apto", a revisão não vale para os materiais novos: fora da fila e sem publicar.
update public.question_submissions set status = 'apto' where id in (:'v_e_s1', :'v_e_s2', :'v_e_s3');
select is(app.revisao_apto_do_envio_de_questoes(:'v_e_s1'::uuid), null::uuid, 'a revisão dos materiais antigos não vale para o material trocado');
select is(app.revisao_apto_do_envio_de_questoes(:'v_e_s2'::uuid), null::uuid, 'nem para o material acrescentado');
select is(app.revisao_apto_do_envio_de_questoes(:'v_e_s3'::uuid), null::uuid, 'nem para o material tirado');
select tests.authenticate_as_service();
select is((select count(*)::int from public.revisao_envios_de_questoes_para_publicar(1000) where submission_id in (:'v_e_s1', :'v_e_s2', :'v_e_s3')), 0, 'e nenhum deles está na fila de publicação');
select is(
  (public.revisao_publicar_questoes(:'v_e_s1', tests.review_of_questoes(:'v_e_s1'), (select content_sha256 from public.question_submissions where id = :'v_e_s1'),
     tests.leitura_de_questoes(:'v_disc', :'v_theme', 'Sonda troca ' || :'v_sfx', 1, jsonb_build_array('Material Q2 ' || :'v_sfx'))))->>'resultado',
  'revisao_invalida', 'o servidor não publica o texto aprovado ligado a material que a IA não viu'
);
select is((select count(*)::int from public.questions where question_stem like 'Sonda troca %' and question_stem like '%' || :'v_sfx' || '%'), 0, 'nenhuma questão foi criada');
select is((select count(*)::int from public.revisao_envios_de_questoes_para_publicar(1000) where submission_id = :'v_e_s4'), 1, 'o envio com o mesmo conjunto continua na fila de publicação');
select tests.clear_auth();
-- Voltando aos materiais revisados, a revisão volta a valer.
update public.question_submissions set material_ids = array[:'v_m1']::uuid[] where id = :'v_e_s1';
select is(app.revisao_apto_do_envio_de_questoes(:'v_e_s1'::uuid), tests.review_of_questoes(:'v_e_s1'), 'voltando aos materiais revisados, a revisão volta a valer');

-- 44-H3: só vale a revisão MAIS RECENTE do texto, em qualquer conjunto de materiais. (T,{M1}) apto → a
-- publicação falha ("erro") → o autor muda para {M2} → a IA julga o MESMO texto "não apto" com {M2} → o autor
-- volta a {M1}: a revisão antiga de "apto" NÃO volta a valer (o texto foi julgado não apto depois).
select tests.create_user('h3.autor@test.local', 'admin', 'active') as v_autor5 \gset
select tests.envio_de_questoes_revisado(:'v_autor5', 'Sonda recente ' || :'v_sfx', array[:'v_m1']::uuid[], 'apto', 'erro') as v_e_r1 \gset
select tests.review_of_questoes(:'v_e_r1') as v_r_r1 \gset
select tests.authenticate_as(:'v_autor5');
select is(tests.affected_rows(format($$ update public.question_submissions set material_ids = array[%L]::uuid[] where id = %L $$, :'v_m2', :'v_e_r1')), 1, 'o autor muda os materiais do envio em "erro"');
select tests.clear_auth();
select is((select status from public.question_submissions where id = :'v_e_r1'), 'aguardando_revisao', 'e ele volta à revisão');
insert into public.material_reviews (question_submission_id, content_sha256, status, verdict, model, completed_at)
select s.id, s.content_sha256, 'concluida', 'nao_apto', 'claude-opus-5-5', now() from public.question_submissions s where s.id = :'v_e_r1';
update public.question_submissions set status = 'nao_apto' where id = :'v_e_r1';
select tests.authenticate_as(:'v_autor5');
select is(tests.affected_rows(format($$ update public.question_submissions set material_ids = array[%L]::uuid[] where id = %L $$, :'v_m1', :'v_e_r1')), 1, 'o autor volta ao material M1, o da revisão antiga de "apto"');
select tests.clear_auth();
select is((select status from public.question_submissions where id = :'v_e_r1'), 'aguardando_revisao', 'a revisão antiga de "apto" NÃO volta a valer: o envio volta à revisão, não a "apto"');
select is(app.revisao_valida_do_envio_de_questoes(:'v_e_r1'::uuid), null::uuid, 'nenhuma revisão vale para {M1} (a mais recente do texto foi com {M2})');
update public.question_submissions set status = 'apto' where id = :'v_e_r1';
select is(app.revisao_apto_do_envio_de_questoes(:'v_e_r1'::uuid), null::uuid, 'mesmo com o estado forçado a "apto", não há revisão apto que valha');
select tests.authenticate_as_service();
select is((select count(*)::int from public.revisao_envios_de_questoes_para_publicar(1000) where submission_id = :'v_e_r1'), 0, 'e o envio está fora da fila de publicação');
select is(
  (public.revisao_publicar_questoes(:'v_e_r1', :'v_r_r1', (select content_sha256 from public.question_submissions where id = :'v_e_r1'),
     tests.leitura_de_questoes(:'v_disc', :'v_theme', 'Sonda recente ' || :'v_sfx', 1, jsonb_build_array('Material Q1 ' || :'v_sfx'))))->>'resultado',
  'revisao_invalida', 'o servidor não publica com a revisão antiga de "apto"'
);
select tests.clear_auth();
select is((select count(*)::int from public.questions where question_stem like 'Sonda recente %' and question_stem like '%' || :'v_sfx' || '%'), 0, 'nenhuma questão foi criada');
update public.question_submissions set material_ids = array[:'v_m2']::uuid[], status = 'nao_apto' where id = :'v_e_r1';
select is(app.revisao_apto_do_envio_de_questoes(:'v_e_r1'::uuid), null::uuid, 'com {M2} a revisão que vale é a "não apto": não é apto');
select is((select verdict from public.material_reviews where id = app.revisao_valida_do_envio_de_questoes(:'v_e_r1'::uuid)), 'nao_apto', 'e a que vale é mesmo a "não apto"');

-- 44-H3: o texto aprovado com JSON malformado não quebra a conferência: vai a "não apto" com recado e sai da fila.
select tests.create_user('h3.json@test.local', 'admin', 'active') as v_autor6 \gset
select tests.envio_de_questoes_revisado(:'v_autor6', 'Json options texto ' || :'v_sfx', array[:'v_m1']::uuid[]) as v_j1 \gset
select tests.envio_de_questoes_revisado(:'v_autor6', 'Json options objeto ' || :'v_sfx', array[:'v_m1']::uuid[]) as v_j2 \gset
select tests.envio_de_questoes_revisado(:'v_autor6', 'Json item escalar ' || :'v_sfx', array[:'v_m1']::uuid[]) as v_j3 \gset
select tests.envio_de_questoes_revisado(:'v_autor6', 'Json tags texto ' || :'v_sfx', array[:'v_m1']::uuid[]) as v_j4 \gset
select tests.envio_de_questoes_revisado(:'v_autor6', 'Json disciplina ruim ' || :'v_sfx', array[:'v_m1']::uuid[]) as v_j5 \gset
select tests.envio_de_questoes_revisado(:'v_autor6', 'Json titulos texto ' || :'v_sfx', array[:'v_m1']::uuid[]) as v_j6 \gset
select tests.authenticate_as_service();
select is((public.revisao_publicar_questoes(:'v_j1', tests.review_of_questoes(:'v_j1'), (select content_sha256 from public.question_submissions where id = :'v_j1'),
  '[{"question_stem":"x","options":"isto não é uma lista"}]'::jsonb))->>'resultado', 'recusado', 'options que é texto: recusado, sem quebrar');
select is((public.revisao_publicar_questoes(:'v_j2', tests.review_of_questoes(:'v_j2'), (select content_sha256 from public.question_submissions where id = :'v_j2'),
  '[{"question_stem":"x","options":{"a":1}}]'::jsonb))->>'resultado', 'recusado', 'options que é objeto: recusado, sem quebrar');
select is((public.revisao_publicar_questoes(:'v_j3', tests.review_of_questoes(:'v_j3'), (select content_sha256 from public.question_submissions where id = :'v_j3'),
  '["texto solto", 3]'::jsonb))->>'resultado', 'recusado', 'item da lista que não é objeto: recusado, sem quebrar');
select is((public.revisao_publicar_questoes(:'v_j4', tests.review_of_questoes(:'v_j4'), (select content_sha256 from public.question_submissions where id = :'v_j4'),
  jsonb_build_array(jsonb_build_object('discipline_id', :'v_disc', 'theme_id', :'v_theme', 'question_stem', 'x', 'tags', 'não é lista', 'options', '[]'::jsonb))))->>'resultado', 'recusado', 'tags que é texto: recusado, sem quebrar');
select is((public.revisao_publicar_questoes(:'v_j5', tests.review_of_questoes(:'v_j5'), (select content_sha256 from public.question_submissions where id = :'v_j5'),
  '[{"discipline_id":"não-é-uuid","question_stem":"x","options":[]}]'::jsonb))->>'resultado', 'recusado', 'disciplina que não é uuid: recusado, sem quebrar');
select is((public.revisao_publicar_questoes(:'v_j6', tests.review_of_questoes(:'v_j6'), (select content_sha256 from public.question_submissions where id = :'v_j6'),
  jsonb_build_array(jsonb_build_object('discipline_id', :'v_disc', 'theme_id', :'v_theme', 'question_stem', 'x', 'material_titles', 'não é lista', 'options', '[]'::jsonb))))->>'resultado', 'recusado', 'materiais cobertos que é texto: recusado, sem quebrar');
select tests.clear_auth();
select is(
  (select array_agg(status order by title) from public.question_submissions where id in (:'v_j1', :'v_j2', :'v_j3', :'v_j4', :'v_j5', :'v_j6')),
  array['nao_apto', 'nao_apto', 'nao_apto', 'nao_apto', 'nao_apto', 'nao_apto']::text[],
  'todos vão a "não apto" (nenhum fica "apto" para sempre nem vai a "erro")'
);
select ok((select bool_and(publication_note is not null and length(publication_note) > 20) from public.question_submissions where id in (:'v_j1', :'v_j2', :'v_j3', :'v_j4', :'v_j5', :'v_j6')), 'cada um com recado leigo para o autor');
select is((select count(*)::int from public.question_submissions where id in (:'v_j1', :'v_j2', :'v_j3', :'v_j4', :'v_j5', :'v_j6') and cardinality(published_question_ids) > 0), 0, 'nenhuma questão foi publicada');
select tests.authenticate_as_service();
select is((select count(*)::int from public.revisao_envios_de_questoes_para_publicar(1000) where submission_id in (:'v_j1', :'v_j2', :'v_j3', :'v_j4', :'v_j5', :'v_j6')), 0, 'e todos saíram da fila de publicação');
select tests.clear_auth();

-- O texto aprovado não pôde ser montado: sai da fila de publicação.
select tests.envio_de_questoes_revisado(:'v_autor', 'Lote que não monta ' || :'v_sfx') as v_e_nm \gset
select tests.review_of_questoes(:'v_e_nm') as v_r_nm \gset
select content_sha256 as v_h_nm from public.question_submissions where id = :'v_e_nm' \gset
select tests.authenticate_as(:'v_admin');
select throws_ok(format($$ select public.revisao_recusar_publicacao_de_questoes(%L, %L, %L, 'x') $$, :'v_e_nm', :'v_r_nm', :'v_h_nm'), '42501', NULL, 'nem admin recusa a publicação: é do servidor');
select tests.clear_auth();
select tests.authenticate_as_service();
select is(public.revisao_recusar_publicacao_de_questoes(:'v_e_nm', gen_random_uuid(), :'v_h_nm', 'x'), false, 'com outra revisão: não faz nada');
select is(public.revisao_recusar_publicacao_de_questoes(:'v_e_nm', :'v_r_nm', 'outro-hash', 'x'), false, 'com outro texto: não faz nada');
select is(public.revisao_recusar_publicacao_de_questoes(:'v_e_nm', :'v_r_nm', :'v_h_nm', 'O texto não monta. Corrija e envie de novo.'), true, 'com a revisão e o texto certos: recusa');
select is(public.revisao_recusar_publicacao_de_questoes(:'v_e_nm', :'v_r_nm', :'v_h_nm', 'de novo'), false, 'e não recusa duas vezes');
select is((select count(*)::int from public.revisao_envios_de_questoes_para_publicar(1000) where submission_id = :'v_e_nm'), 0, 'o envio saiu da fila de publicação');
select tests.clear_auth();
select results_eq(
  format($$ select status, publication_note from public.question_submissions where id = %L $$, :'v_e_nm'),
  $$ values ('nao_apto'::text, 'O texto não monta. Corrija e envie de novo.'::text) $$,
  'vai a "não apto" com o recado leigo'
);

-- ---------------------------------------------------------------------------
-- 5. Trava de publicação do admin
-- ---------------------------------------------------------------------------
select tests.nova_questao(:'v_disc', :'v_theme', 'Rascunho do admin ' || :'v_sfx') as v_rasc \gset
select tests.authenticate_as(:'v_aluno');
select throws_ok(format($$ select public.publish_question(%L) $$, :'v_rasc'), NULL, 'apenas administradores ativos podem publicar questões', 'estudante não publica questão');
select tests.clear_auth();
select tests.authenticate_as(:'v_admin');
-- P6 (03/10): o revisor só aconselha. O admin publica a questão completa sem nenhuma revisão, e o
-- selo "Revisado por IA" só aparece onde há revisão "apto" do conteúdo atual.
select lives_ok(format($$ select public.publish_question(%L) $$, :'v_rasc'), 'P6: o admin publica rascunho sem nenhuma revisão (o revisor só aconselha)');
select tests.clear_auth();
select is((select status from public.questions where id = :'v_rasc'), 'published', 'e a questão vai ao ar');
select tests.authenticate_as(:'v_aluno');
select is((select count(*)::int from public.selos_de_questoes(array[:'v_rasc']::uuid[]) where question_id = :'v_rasc'), 0, 'sem revisão de IA "apto", o estudante não vê o selo');
select tests.clear_auth();
select tests.authenticate_as(:'v_admin');
select lives_ok(format($$ update public.questions set status = 'draft' where id = %L $$, :'v_rasc'), 'o admin despublica sem precisar de revisão');
select tests.clear_auth();
select is((select status from public.questions where id = :'v_rasc'), 'draft', 'e a questão volta a rascunho');

-- Revisão apto vinculada a ESTE conteúdo: libera.
select tests.envio_de_questoes_revisado(:'v_autor', 'Envio da questão do admin ' || :'v_sfx', array[]::uuid[], 'apto', 'publicado') as v_e_rasc \gset
insert into public.question_ai_provenance (question_id, submission_id, review_id, review_verdict, reviewed_at, model, text_sha256, snapshot_hash)
select :'v_rasc', s.id, tests.review_of_questoes(s.id), 'apto', now(), 'm', s.content_sha256, app.question_snapshot_hash(:'v_rasc'::uuid)
  from public.question_submissions s where s.id = :'v_e_rasc';
select tests.authenticate_as(:'v_admin');
select lives_ok(format($$ select public.publish_question(%L) $$, :'v_rasc'), 'com revisão apto do mesmo conteúdo, o admin publica');
select tests.clear_auth();
select is((select status from public.questions where id = :'v_rasc'), 'published', 'e a questão vai ao ar');

-- Conteúdo alterado depois da revisão: a revisão não vale mais.
select tests.nova_questao(:'v_disc', :'v_theme', 'Rascunho editado ' || :'v_sfx') as v_edit \gset
select tests.envio_de_questoes_revisado(:'v_autor', 'Envio da questão editada ' || :'v_sfx', array[]::uuid[], 'apto', 'publicado') as v_e_edit \gset
insert into public.question_ai_provenance (question_id, submission_id, review_id, review_verdict, reviewed_at, model, text_sha256, snapshot_hash)
select :'v_edit', s.id, tests.review_of_questoes(s.id), 'apto', now(), 'm', s.content_sha256, app.question_snapshot_hash(:'v_edit'::uuid)
  from public.question_submissions s where s.id = :'v_e_edit';
update public.questions set question_stem = 'Enunciado reescrito depois da revisão' where id = :'v_edit';
select tests.authenticate_as(:'v_admin');
select lives_ok(format($$ select public.publish_question(%L) $$, :'v_edit'), 'P6: questão alterada depois da revisão: o admin publica mesmo assim');
select tests.clear_auth();
select ok(not app.questao_tem_revisao_apto(:'v_edit'::uuid), 'mas a revisão não vale mais para esse conteúdo');

-- Proveniência ligada a revisão que não é "apto": não vale.
select tests.nova_questao(:'v_disc', :'v_theme', 'Rascunho revisão ruim ' || :'v_sfx') as v_ruim \gset
select tests.envio_de_questoes_revisado(:'v_autor', 'Envio revisão ruim ' || :'v_sfx', array[]::uuid[], 'nao_apto', 'nao_apto') as v_e_ruim \gset
insert into public.question_ai_provenance (question_id, submission_id, review_id, review_verdict, reviewed_at, model, text_sha256, snapshot_hash)
select :'v_ruim', s.id, tests.review_of_questoes(s.id), 'apto', now(), 'm', s.content_sha256, app.question_snapshot_hash(:'v_ruim'::uuid)
  from public.question_submissions s where s.id = :'v_e_ruim';
select ok(not app.questao_tem_revisao_apto(:'v_ruim'::uuid), 'proveniência ligada a uma revisão que não é "apto" não vale');
select throws_ok(
  format($$ insert into public.question_ai_provenance (question_id, review_verdict, text_sha256, snapshot_hash) values (%L, 'nao_apto', 'x', 'y') $$, :'v_ruim'),
  '23514', NULL, 'só se grava proveniência de revisão "apto"'
);

-- Questão publicada antes desta unidade: a exceção vale só para o conteúdo que estava no ar.
select tests.nova_questao(:'v_disc', :'v_theme', 'Questão antiga ' || :'v_sfx') as v_leg \gset
update public.questions set status = 'published' where id = :'v_leg';
insert into public.question_publicada_antes_44h2 (question_id, snapshot_hash) values (:'v_leg', app.question_snapshot_hash(:'v_leg'::uuid));
select tests.authenticate_as(:'v_admin');
select lives_ok(format($$ update public.questions set status = 'draft' where id = %L $$, :'v_leg'), 'o admin despublica a questão antiga');
select lives_ok(format($$ select public.publish_question(%L) $$, :'v_leg'), 'P6: questão antiga volta ao ar sem atestação nem revisão (a regra antiga acabou)');
select lives_ok(format($$ update public.questions set status = 'draft' where id = %L $$, :'v_leg'), 'e o admin a despublica de novo para reescrevê-la');
select tests.clear_auth();
-- O admin reescreve o enunciado e as alternativas, atesta a própria revisão e republica sem revisor de IA.
update public.questions set question_stem = 'Questão NOVA escrita pelo admin ' || :'v_sfx' where id = :'v_leg';
update public.question_options set option_text = 'Alternativa totalmente nova' where question_id = :'v_leg' and letter = 'A';
select tests.atestar_questao(:'v_leg'::uuid);
select tests.authenticate_as(:'v_admin');
select lives_ok(
  format($$ select public.publish_question(%L) $$, :'v_leg'),
  'P6: questão antiga reescrita pelo admin republica sem revisor de IA'
);
select is((select status from public.questions where id = :'v_leg'), 'published', 'e vai ao ar');
select is((select count(*)::int from public.question_ai_provenance where question_id = :'v_leg'), 0, 'sem proveniência de IA');
select lives_ok(format($$ update public.questions set status = 'draft' where id = %L $$, :'v_leg'), 'o admin a despublica de novo para voltar ao texto original');
select tests.clear_auth();
-- Voltar ao conteúdo original (mesmo hash de antes): o hash guardado do conteúdo antigo bate de novo.
update public.questions set question_stem = 'Questão antiga ' || :'v_sfx' where id = :'v_leg';
update public.question_options set option_text = 'Opção A' where question_id = :'v_leg' and letter = 'A';
select tests.atestar_questao(:'v_leg'::uuid);
select tests.authenticate_as(:'v_admin');
select lives_ok(format($$ select public.publish_question(%L) $$, :'v_leg'), 'republicar exatamente o conteúdo antigo, atestado, ainda é aceito');
select tests.clear_auth();
select is((select status from public.questions where id = :'v_leg'), 'published', 'e volta ao ar');
select ok(
  (select snapshot_hash from public.question_publicada_antes_44h2 where question_id = :'v_leg') = app.question_snapshot_hash(:'v_leg'::uuid),
  'o hash guardado do conteúdo antigo é o do conteúdo que voltou'
);
select is((select count(*)::int from public.question_publicada_antes_44h2 where question_id = :'v_rasc'), 0, 'questão nova nunca entra na lista do que já estava publicado');
select ok(not app.questao_tem_revisao_apto(:'v_leg'::uuid), 'a questão antiga não ganha revisão de IA por ter sido republicada');

-- ---------------------------------------------------------------------------
-- 6. Selo nas questões
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'v_aluno');
select is((select selo from public.selos_de_questoes(array[(:'v_qids'::uuid[])[1]]::uuid[]) where question_id = (:'v_qids'::uuid[])[1]), 'ia', 'questão publicada por revisão de IA: selo "ia"');
select is((select count(*)::int from public.selos_de_questoes(array[:'v_leg']::uuid[]) where question_id = :'v_leg'), 0, 'questão antiga (sem proveniência): sem selo');
select is((select count(*)::int from public.selos_de_questoes(array[:'v_edit']::uuid[]) where question_id = :'v_edit'), 0, 'rascunho: sem selo para o estudante');
select tests.clear_auth();
select tests.atestar_questao((:'v_qids'::uuid[])[1]);
select tests.authenticate_as(:'v_aluno');
select is((select selo from public.selos_de_questoes(array[(:'v_qids'::uuid[])[1]]::uuid[]) where question_id = (:'v_qids'::uuid[])[1]), 'ia_e_pessoa', 'depois de uma pessoa atestar o conteúdo atual: selo "ia_e_pessoa"');
select tests.clear_auth();
-- Editar a questão publicada (como postgres, para provar o selo): o selo não afirma o que não é verdade.
update public.questions set status = 'draft' where id = (:'v_qids'::uuid[])[2];
update public.questions set question_stem = question_stem || ' (editada)' where id = (:'v_qids'::uuid[])[2];
update public.questions set status = 'published' where id = (:'v_qids'::uuid[])[2];
select tests.authenticate_as(:'v_aluno');
select is((select count(*)::int from public.selos_de_questoes(array[(:'v_qids'::uuid[])[2]]::uuid[]) where question_id = (:'v_qids'::uuid[])[2]), 0, 'conteúdo editado depois da revisão da IA: o selo some');
-- Só o selo das questões PEDIDAS (a API corta em 1000 linhas: a tela pede as que mostra).
select is((select count(*)::int from public.selos_de_questoes(array[(:'v_qids'::uuid[])[1], :'v_leg']::uuid[])), 1, 'pedindo duas questões, volta o selo só da que tem');
select is((select count(*)::int from public.selos_de_questoes('{}'::uuid[])), 0, 'lista vazia: nenhum selo');
select throws_ok($$ select * from public.selos_de_questoes(null) $$, '22023', NULL, 'lista nula é recusada');
select throws_ok($$ select * from public.selos_de_questoes((select array_agg(gen_random_uuid()) from generate_series(1, 501))) $$, '22023', NULL, 'mais de 500 ids por chamada é recusado');
select lives_ok($$ select * from public.selos_de_questoes((select array_agg(gen_random_uuid()) from generate_series(1, 500))) $$, 'exatamente 500 ids passa');
select tests.clear_auth();
select tests.authenticate_as(:'v_pend');
select throws_ok($$ select * from public.selos_de_questoes(array[gen_random_uuid()]) $$, '42501', NULL, 'usuário pendente não consulta os selos');
select tests.clear_auth();
select tests.authenticate_as_anon();
select throws_ok($$ select * from public.selos_de_questoes(array[gen_random_uuid()]) $$, '42501', NULL, 'anon não consulta os selos');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 7. "Reportar erro" também na questão
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'v_aluno');
select lives_ok(
  format($$ insert into public.material_error_reports (question_id, description, excerpt) values (%L, 'O gabarito está errado.', 'Alternativa B') $$, (:'v_qids'::uuid[])[1]),
  'estudante ativo reporta erro numa questão publicada'
);
select results_eq(
  format($$ select reporter_id, status, material_id is null, question_id from public.material_error_reports where description = 'O gabarito está errado.' $$),
  format($$ values (%L::uuid, 'aberto'::text, true, %L::uuid) $$, :'v_aluno', (:'v_qids'::uuid[])[1]),
  'o autor é quem reportou, o estado nasce "aberto", e o alvo é a questão'
);
select throws_ok(
  format($$ insert into public.material_error_reports (question_id, description) values (%L, 'erro numa questão em rascunho') $$, :'v_ruim'),
  '42501', NULL, 'reporte de questão não publicada é recusado'
);
select throws_ok(
  format($$ insert into public.material_error_reports (material_id, question_id, description) values (%L, %L, 'os dois alvos') $$, :'v_m1', (:'v_qids'::uuid[])[1]),
  '23514', NULL, 'reporte com material E questão é recusado'
);
select throws_ok(
  $$ insert into public.material_error_reports (description) values ('sem alvo') $$,
  '42501', NULL, 'reporte sem alvo é recusado (pela política de segurança da linha)'
);
select is((select count(*)::int from public.material_error_reports), 1, 'só o reporte válido ficou, e o estudante lê só o próprio');
select tests.clear_auth();
select tests.authenticate_as(:'v_pend');
select throws_ok(
  format($$ insert into public.material_error_reports (question_id, description) values (%L, 'pendente') $$, (:'v_qids'::uuid[])[1]),
  '42501', NULL, 'usuário pendente não reporta'
);
select tests.clear_auth();
select tests.authenticate_as_anon();
select throws_ok(
  format($$ insert into public.material_error_reports (question_id, description) values (%L, 'anon') $$, (:'v_qids'::uuid[])[1]),
  '42501', NULL, 'anon não reporta'
);
select tests.clear_auth();
select tests.authenticate_as(:'v_admin');
select is((select count(*)::int from public.material_error_reports where question_id = (:'v_qids'::uuid[])[1]), 1, 'admin ativo vê o reporte da questão');
select id as v_rep from public.material_error_reports where description = 'O gabarito está errado.' and question_id = (:'v_qids'::uuid[])[1] \gset
select lives_ok(format($$ select public.resolver_erro_reportado(%L) $$, :'v_rep'), 'admin marca o erro da questão como resolvido');
select tests.clear_auth();
select is((select status from public.material_error_reports where id = :'v_rep'), 'resolvido', 'e fica "resolvido"');

-- O limite de 20 por dia é da pessoa: soma material e questão.
insert into public.material_error_reports (material_id, reporter_id, description)
select :'v_m1', :'v_dia', 'reporte de material ' || i from generate_series(1, 10) i;
insert into public.material_error_reports (question_id, reporter_id, description)
select (:'v_qids'::uuid[])[1], :'v_dia', 'reporte de questão ' || i from generate_series(1, 9) i;
select tests.authenticate_as(:'v_dia');
select lives_ok(
  format($$ insert into public.material_error_reports (question_id, description) values (%L, 'o vigésimo') $$, (:'v_qids'::uuid[])[1]),
  'o vigésimo reporte do dia (10 de material + 10 de questão) entra'
);
select throws_ok(
  format($$ insert into public.material_error_reports (material_id, description) values (%L, 'o vigésimo primeiro') $$, :'v_m1'),
  'P0001', 'Você já enviou 20 reportes de erro hoje. Tente de novo amanhã.', 'o 21º, de qualquer tipo, é recusado com mensagem leiga'
);
select tests.clear_auth();

-- Devolve os tetos como estavam.
update public.review_settings set monthly_review_cap = :v_cap_orig, daily_review_cap_per_user = :v_daily_orig;
select is((select monthly_review_cap from public.review_settings), :v_cap_orig, 'os tetos voltam ao que eram');

select * from finish();
