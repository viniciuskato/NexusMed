-- ============================================================================
-- 44-F — Revisor de IA do NexusMed
-- Revisão guardada por envio (RLS: autor lê as do próprio envio, admin lê todas,
-- ninguém do cliente escreve), funções do servidor (só service_role), limites de
-- custo no banco (por pessoa por dia e total no mês) e falha fechada do estado.
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

-- O servidor (Edge Function) fala com o banco como service_role.
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

-- Para o teste ter um material publicado (mesmos helpers de content_provenance_attestation).
create or replace function tests.approve_material_revision(p_material_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid;
  v_snapshot jsonb;
  v_hash text;
  v_next_number int;
  v_revision_id uuid;
begin
  select id into v_admin from public.profiles where role = 'admin' and status = 'active' limit 1;
  if v_admin is null then
    raise exception 'tests.approve_material_revision: nenhum admin ativo encontrado para autoria de fixture';
  end if;

  v_snapshot := app.build_material_snapshot(p_material_id);
  v_hash := encode(extensions.digest(v_snapshot::text, 'sha256'), 'hex');
  select coalesce(max(revision_number), 0) + 1 into v_next_number
    from public.content_revisions where material_id = p_material_id;

  insert into public.content_revisions (material_id, revision_number, snapshot, snapshot_hash, created_by, policy_version)
  values (p_material_id, v_next_number, v_snapshot, v_hash, v_admin, 'v1')
  returning id into v_revision_id;

  insert into public.content_reviews (content_revision_id, reviewer_user_id, decision, checklist, policy_version, revision_hash)
  values (v_revision_id, v_admin, 'aprovado', '{"fixture": true}'::jsonb, 'v1', v_hash);

  return v_revision_id;
end;
$$;

create or replace function tests.force_publish_material(p_material_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform tests.approve_material_revision(p_material_id);
  update public.materials set status = 'published' where id = p_material_id;
end;
$$;

-- Um envio de teste, direto (como postgres).
create or replace function tests.new_submission(p_author uuid, p_disc uuid, p_theme uuid, p_title text, p_content text, p_status text default 'aguardando_revisao')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md, status)
  values (p_author, p_title, p_disc, p_theme, p_content, p_status) returning id into v_id;
  return v_id;
end;
$$;

select plan(103);

select tests.clear_auth();
select tests.create_user('rev.admin@test.local', 'admin', 'active') as v_admin \gset
select tests.create_user('rev.a@test.local', 'student', 'active') as v_a \gset
select tests.create_user('rev.b@test.local', 'student', 'active') as v_b \gset
select tests.create_user('rev.pend@test.local', 'student', 'active') as v_pend \gset
select tests.create_user('rev.daily@test.local', 'student', 'active') as v_daily \gset
select tests.create_user('rev.month@test.local', 'student', 'active') as v_month \gset

insert into public.disciplines (name, code, cycle)
values ('Disciplina Revisor', 'REV-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_disc \gset
insert into public.themes (discipline_id, name) values (:'v_disc', 'Tema Revisor') returning id as v_theme \gset

-- Guarda os tetos como estavam e abre folga para os testes de fluxo.
select monthly_review_cap as v_cap_orig, daily_review_cap_per_user as v_daily_orig from public.review_settings \gset
update public.review_settings set monthly_review_cap = 100000, daily_review_cap_per_user = 5;

-- Outros testes deixam envios "aguardando revisão" no banco, e a reserva do
-- servidor é global: tira-os da frente para a reserva destes testes ser exata.
update public.material_submissions set status = 'erro' where status = 'aguardando_revisao';

-- ---------------------------------------------------------------------------
-- 1. Estrutura, grants e funções
-- ---------------------------------------------------------------------------
select has_table('public', 'material_reviews', 'tabela de revisões existe');
select has_table('public', 'review_settings', 'tabela de tetos existe');
select is((select count(*)::int from public.review_settings), 1, 'os tetos são uma linha só');
select ok(not has_table_privilege('anon', 'public.material_reviews', 'select'), 'anon não lê revisões');
select ok(not has_table_privilege('anon', 'public.review_settings', 'select'), 'anon não lê tetos');
select ok(not has_table_privilege('authenticated', 'public.material_reviews', 'insert'), 'cliente não insere revisão');
select ok(not has_table_privilege('authenticated', 'public.material_reviews', 'update'), 'cliente não atualiza revisão');
select ok(not has_table_privilege('authenticated', 'public.material_reviews', 'delete'), 'cliente não apaga revisão');
select ok(not has_table_privilege('authenticated', 'public.review_settings', 'update'), 'cliente não muda os tetos');
select ok(not has_column_privilege('authenticated', 'public.material_reviews', 'continuation', 'select'), 'cliente não lê o conteúdo de continuação');
select ok(not has_column_privilege('authenticated', 'public.material_reviews', 'batch_id', 'select'), 'cliente não lê o id do lote');
select ok(has_column_privilege('authenticated', 'public.material_reviews', 'findings_text', 'select'), 'cliente lê os achados');
select ok(
  not has_function_privilege('authenticated', 'public.revisao_reservar_envios(int)', 'execute')
  and not has_function_privilege('anon', 'public.revisao_reservar_envios(int)', 'execute'),
  'só o servidor reserva envios'
);
select ok(
  not has_function_privilege('authenticated', 'public.revisao_registrar_resultado(uuid, text, text, text, text, text, text, text, int, int, int, int, int, int, text, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.revisao_registrar_resultado(uuid, text, text, text, text, text, text, text, int, int, int, int, int, int, text, boolean)', 'execute'),
  'só o servidor registra resultado'
);
select ok(
  not has_function_privilege('authenticated', 'public.revisao_anexar_lote(uuid[], text)', 'execute')
  and not has_function_privilege('authenticated', 'public.revisao_liberar(uuid[])', 'execute')
  and not has_function_privilege('authenticated', 'public.revisao_liberar_reservas_velhas(int)', 'execute')
  and not has_function_privilege('authenticated', 'public.revisao_pausar(uuid, jsonb, int, int, int, int, int, int, int)', 'execute')
  and not has_function_privilege('authenticated', 'public.revisao_pendentes()', 'execute')
  and not has_function_privilege('authenticated', 'public.revisao_dados_do_envio(uuid[])', 'execute'),
  'cliente não executa nenhuma das outras funções do servidor'
);
select ok(has_function_privilege('service_role', 'public.revisao_reservar_envios(int)', 'execute'), 'service_role executa as funções do servidor');
select ok(
  not has_function_privilege('anon', 'app.disparar_revisao()', 'execute')
  and not has_function_privilege('authenticated', 'app.disparar_revisao()', 'execute'),
  'o disparo do agendador não é chamável por cliente'
);
select ok(not has_function_privilege('anon', 'public.situacao_da_revisao()', 'execute'), 'anon não consulta a situação da revisão');
select lives_ok($$ select app.disparar_revisao() $$, 'sem os segredos do Vault, o disparo do agendador não faz nada e não dá erro');

-- O veredito e o estado da revisão andam juntos.
select throws_ok(
  format($$ insert into public.material_reviews (submission_id, content_sha256, status, verdict) values (%L, 'x', 'concluida', null) $$,
    tests.new_submission(:'v_a', :'v_disc', :'v_theme', 'Só para o check', '# c', 'nao_apto')),
  '23514', NULL, 'revisão concluída sem veredito é recusada'
);

-- ---------------------------------------------------------------------------
-- 2. Reserva de envios pelo servidor
-- ---------------------------------------------------------------------------
select tests.new_submission(:'v_a', :'v_disc', :'v_theme', 'Envio A1', '# A1 texto', 'aguardando_revisao') as v_a1 \gset
select tests.new_submission(:'v_a', :'v_disc', :'v_theme', 'Envio A2', '# A2 texto', 'aguardando_revisao') as v_a2 \gset
select tests.new_submission(:'v_a', :'v_disc', :'v_theme', 'Envio A nao apto', '# A3', 'nao_apto') as v_a_nao \gset
select tests.new_submission(:'v_a', :'v_disc', :'v_theme', 'Envio A em revisao', '# A4', 'em_revisao') as v_a_rev \gset
select tests.new_submission(:'v_b', :'v_disc', :'v_theme', 'Envio B1', '# B1 texto', 'aguardando_revisao') as v_b1 \gset
select tests.new_submission(:'v_pend', :'v_disc', :'v_theme', 'Envio do pendente', '# P', 'aguardando_revisao') as v_p1 \gset
insert into public.material_reviews (submission_id, content_sha256) values (:'v_p1', 'x');
update public.profiles set status = 'pending' where id = :'v_pend';

select tests.authenticate_as(:'v_a');
select throws_ok(
  $$ select * from public.revisao_reservar_envios(10) $$,
  '42501', NULL, 'usuário não reserva envios'
);
select tests.clear_auth();

-- Só as linhas de teste: o banco pode ter outros envios aguardando.
create temp table reservados as select * from public.revisao_reservar_envios(0) where false;
grant all on reservados to service_role;

select tests.authenticate_as_service();
insert into reservados select * from public.revisao_reservar_envios(1000);
select tests.clear_auth();

select is(
  (select count(*)::int from reservados where submission_id in (:'v_a1', :'v_a2', :'v_b1')),
  3,
  'o servidor reserva os 3 envios "aguardando revisão" de usuários ativos'
);
select is(
  (select count(*)::int from reservados where submission_id in (:'v_a_nao', :'v_a_rev', :'v_p1')),
  0,
  'não reserva envio em outro estado nem de usuário que deixou de ser ativo'
);
select is(
  (select status from public.material_submissions where id = :'v_a1'),
  'em_revisao',
  'o envio reservado vai a "em revisão"'
);
select is(
  (select status from public.material_submissions where id = :'v_p1'),
  'aguardando_revisao',
  'o envio do usuário pendente continua na fila'
);
select results_eq(
  format($$ select content_md, content_sha256 from reservados where submission_id = %L $$, :'v_a1'),
  format($$ values ('# A1 texto'::text, encode(extensions.digest('# A1 texto', 'sha256'), 'hex')) $$),
  'a reserva traz o texto e o hash SHA-256 do texto reservado'
);
select results_eq(
  format($$ select discipline_name, theme_name from reservados where submission_id = %L $$, :'v_a1'),
  $$ values ('Disciplina Revisor'::text, 'Tema Revisor'::text) $$,
  'a reserva traz os nomes de Disciplina e Tema'
);
select results_eq(
  format($$ select r.status, r.verdict, r.billable from public.material_reviews r where r.submission_id = %L $$, :'v_a1'),
  $$ values ('reservada'::text, null::text, true) $$,
  'nasce uma revisão "reservada", sem veredito'
);
select tests.authenticate_as_service();
select is((select count(*)::int from public.revisao_reservar_envios(1000) where submission_id in (:'v_a1', :'v_a2', :'v_b1')), 0, 'uma segunda reserva não pega de novo o mesmo envio');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 3. Lote, liberação e reservas velhas
-- ---------------------------------------------------------------------------
select r.id as v_r_a1 from public.material_reviews r where r.submission_id = :'v_a1' \gset
select r.id as v_r_a2 from public.material_reviews r where r.submission_id = :'v_a2' \gset
select r.id as v_r_b1 from public.material_reviews r where r.submission_id = :'v_b1' \gset

select tests.authenticate_as_service();
select is(public.revisao_anexar_lote(array[:'v_r_a1'::uuid, :'v_r_a2'::uuid], 'msgbatch_teste_1'), 2, 'anexar o lote marca as duas revisões');
select results_eq(
  format($$ select status, batch_id from public.material_reviews where id = %L $$, :'v_r_a1'),
  $$ values ('submetida'::text, 'msgbatch_teste_1'::text) $$,
  'a revisão fica "submetida" com o id do lote'
);
select is(public.revisao_anexar_lote(array[:'v_r_a1'::uuid], 'outro_lote'), 0, 'uma revisão já submetida não é anexada de novo');
-- B1 não teve o lote criado: volta para a fila e a reserva some.
select is(public.revisao_liberar(array[:'v_r_b1'::uuid]), 1, 'liberar apaga a reserva sem lote');
select tests.clear_auth();
select is((select status from public.material_submissions where id = :'v_b1'), 'aguardando_revisao', 'e o envio volta para a fila');
select is((select count(*)::int from public.material_reviews where id = :'v_r_b1'), 0, 'a reserva liberada não fica guardada (não conta no limite)');

-- Reserva antiga sem lote (o servidor caiu no meio): volta para a fila.
select tests.authenticate_as_service();
select count(*) from public.revisao_reservar_envios(1000) where submission_id = :'v_b1' \gset
select tests.clear_auth();
select r.id as v_r_b1b from public.material_reviews r where r.submission_id = :'v_b1' and r.status = 'reservada' \gset
update public.material_reviews set created_at = now() - interval '40 minutes' where id = :'v_r_b1b';
select tests.authenticate_as_service();
select ok(public.revisao_liberar_reservas_velhas(15) >= 1, 'reservas antigas sem lote são liberadas');
select tests.clear_auth();
select is((select status from public.material_submissions where id = :'v_b1'), 'aguardando_revisao', 'o envio da reserva antiga volta para a fila');

-- ---------------------------------------------------------------------------
-- 4. Resultado: só "apto" lido como apto leva o envio a "apto" (falha fechada)
-- ---------------------------------------------------------------------------
select tests.authenticate_as_service();
select is(
  public.revisao_registrar_resultado(:'v_r_a1', 'apto', 'APTO PARA ENVIAR', 'achados...', null, null,
    'claude-opus-5-5', 'promptsha', 1000, 500, 200, 300, 4, 6, 'end_turn'),
  true, 'resultado "apto" é registrado'
);
select tests.clear_auth();
select results_eq(
  format($$ select status, verdict, verdict_line, findings_text, model, prompt_sha256, input_tokens, output_tokens,
                   cache_creation_tokens, cache_read_tokens, web_searches, web_fetches, stop_reason, billable
            from public.material_reviews where id = %L $$, :'v_r_a1'),
  $$ values ('concluida'::text, 'apto'::text, 'APTO PARA ENVIAR'::text, 'achados...'::text, 'claude-opus-5-5'::text, 'promptsha'::text,
             1000, 500, 200, 300, 4, 6, 'end_turn'::text, true) $$,
  'a revisão guarda veredito, achados, modelo, tokens (entrada, saída, cache) e buscas'
);
select is((select status from public.material_submissions where id = :'v_a1'), 'apto', 'o envio vai a "apto"');

select tests.authenticate_as_service();
select is(
  public.revisao_registrar_resultado(:'v_r_a1', 'nao_apto', 'NÃO APTO — 1 achado grave', 'x', null, null,
    'claude-opus-5-5', 'promptsha', 1, 1, 0, 0, 0, 0, 'end_turn'),
  false, 'uma segunda resposta para a mesma revisão não vale (idempotente)'
);
select tests.clear_auth();
select is((select status from public.material_submissions where id = :'v_a1'), 'apto', 'e o envio não muda');

-- Veredito que não é um dos três vira "erro": nunca "apto" por engano.
select tests.authenticate_as_service();
select is(
  public.revisao_registrar_resultado(:'v_r_a2', 'APTO PARA ENVIAR', 'x', 'y', null, 'x',
    'claude-opus-5-5', 'promptsha', 10, 10, 0, 0, 0, 0, 'end_turn'),
  true, 'veredito fora dos três valores é registrado'
);
select tests.clear_auth();
select results_eq(
  format($$ select r.status, r.verdict, s.status from public.material_reviews r join public.material_submissions s on s.id = r.submission_id where r.id = %L $$, :'v_r_a2'),
  $$ values ('erro'::text, 'erro'::text, 'erro'::text) $$,
  'veredito desconhecido vira erro na revisão e no envio, nunca apto'
);

-- "não apto" e "erro" completos; falha sem gasto não conta no limite.
select tests.new_submission(:'v_a', :'v_disc', :'v_theme', 'A para nao apto', '# N', 'aguardando_revisao') as v_a_n1 \gset
select tests.new_submission(:'v_a', :'v_disc', :'v_theme', 'A para erro sem gasto', '# E', 'aguardando_revisao') as v_a_e1 \gset
select tests.authenticate_as_service();
select count(*) from public.revisao_reservar_envios(1000) where submission_id in (:'v_a_n1', :'v_a_e1') \gset
select r.id as v_r_n1 from public.material_reviews r where r.submission_id = :'v_a_n1' \gset
select r.id as v_r_e1 from public.material_reviews r where r.submission_id = :'v_a_e1' \gset
select public.revisao_anexar_lote(array[:'v_r_n1'::uuid, :'v_r_e1'::uuid], 'msgbatch_teste_2');
select tests.clear_auth();
select is(app.reviews_used_by_user_today(:'v_a'), 4, 'antes: as 4 revisões de A (a1, a2, n1, e1) contam hoje');
select tests.authenticate_as_service();
select public.revisao_registrar_resultado(:'v_r_n1', 'nao_apto', 'NÃO APTO — 2 achados graves', 'achados N', 'Corrija o material conforme os achados abaixo ...', null,
  'claude-opus-5-5', 'promptsha', 900, 400, 0, 0, 2, 1, 'end_turn');
select public.revisao_registrar_resultado(:'v_r_e1', 'erro', null, null, null, 'batch_errored',
  'claude-opus-5-5', 'promptsha', 0, 0, 0, 0, 0, 0, null, false);
select tests.clear_auth();
select results_eq(
  format($$ select status, verdict, correction_block from public.material_reviews where id = %L $$, :'v_r_n1'),
  $$ values ('concluida'::text, 'nao_apto'::text, 'Corrija o material conforme os achados abaixo ...'::text) $$,
  'resultado "não apto" guarda o bloco de correção'
);
select is((select status from public.material_submissions where id = :'v_a_n1'), 'nao_apto', 'o envio vai a "não apto"');
select results_eq(
  format($$ select status, billable from public.material_reviews where id = %L $$, :'v_r_e1'),
  $$ values ('erro'::text, false) $$,
  'erro sem gasto (lote com erro) não é cobrável'
);
select is((select status from public.material_submissions where id = :'v_a_e1'), 'erro', 'o envio vai a "erro"');
select is(app.reviews_used_by_user_today(:'v_a'), 3, 'a revisão que falhou sem gastar não conta no limite diário');

-- Texto trocado enquanto revisava: o resultado não é aplicado ao envio.
select tests.new_submission(:'v_b', :'v_disc', :'v_theme', 'B texto trocado', '# antes', 'aguardando_revisao') as v_b_t \gset
select tests.authenticate_as_service();
select count(*) from public.revisao_reservar_envios(1000) where submission_id = :'v_b_t' \gset
select r.id as v_r_bt from public.material_reviews r where r.submission_id = :'v_b_t' \gset
select public.revisao_anexar_lote(array[:'v_r_bt'::uuid], 'msgbatch_teste_3');
select tests.clear_auth();
update public.material_submissions set content_md = '# depois' where id = :'v_b_t';
select tests.authenticate_as_service();
select public.revisao_registrar_resultado(:'v_r_bt', 'apto', 'APTO PARA ENVIAR', 'x', null, null,
  'claude-opus-5-5', 'promptsha', 1, 1, 0, 0, 0, 0, 'end_turn');
select tests.clear_auth();
select is((select status from public.material_submissions where id = :'v_b_t'), 'em_revisao', 'resultado de um texto que mudou não passa o envio a apto');

-- Resultado de revisão que não está submetida não vale.
select tests.authenticate_as_service();
select is(
  public.revisao_registrar_resultado(gen_random_uuid(), 'apto', 'APTO PARA ENVIAR', 'x', null, null, 'm', 'p', 1, 1, 0, 0, 0, 0, 'end_turn'),
  false, 'resultado de revisão que não existe não vale'
);
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 5. Pausa (pause_turn) e pendentes
-- ---------------------------------------------------------------------------
select tests.new_submission(:'v_b', :'v_disc', :'v_theme', 'B pausada', '# pausa', 'aguardando_revisao') as v_b_p \gset
select tests.authenticate_as_service();
select count(*) from public.revisao_reservar_envios(1000) where submission_id = :'v_b_p' \gset
select r.id as v_r_bp from public.material_reviews r where r.submission_id = :'v_b_p' \gset
select public.revisao_anexar_lote(array[:'v_r_bp'::uuid], 'msgbatch_teste_4');
select is(public.revisao_pausar(:'v_r_bp', '[{"type":"text","text":"parcial"}]'::jsonb, 100, 50, 10, 20, 1, 2), true, 'pausar guarda o que a IA já fez');
select results_eq(
  format($$ select status, attempt, input_tokens, web_searches from public.material_reviews where id = %L $$, :'v_r_bp'),
  $$ values ('pausada'::text, 2, 100, 1) $$,
  'a revisão fica pausada, com a tentativa e o gasto até aqui'
);
select ok(
  exists (select 1 from public.revisao_pendentes() where review_id = :'v_r_bp' and status = 'pausada' and continuation is not null),
  'a revisão pausada aparece entre as pendentes, com o que continuar'
);
select ok(
  exists (select 1 from public.revisao_pendentes() where review_id = :'v_r_n1') is false,
  'revisão concluída não é pendente'
);
select public.revisao_anexar_lote(array[:'v_r_bp'::uuid], 'msgbatch_teste_5');
select public.revisao_registrar_resultado(:'v_r_bp', 'nao_apto', 'NÃO APTO — 1 achado grave', 'a', 'Corrija o material conforme os achados abaixo', null,
  'claude-opus-5-5', 'promptsha', 200, 60, 0, 0, 3, 0, 'end_turn');
select is(public.revisao_pausar(:'v_r_bp', '[]'::jsonb, 1, 1, 0, 0, 0, 0), false, 'revisão já concluída não pausa');
select results_eq(
  format($$ select input_tokens, output_tokens, web_searches, billable from public.material_reviews where id = %L $$, :'v_r_bp'),
  $$ values (300, 110, 4, true) $$,
  'o gasto da pausa e o da continuação se somam'
);
select tests.clear_auth();

-- Tentativas demais: o servidor precisa registrar erro.
select tests.new_submission(:'v_b', :'v_disc', :'v_theme', 'B pausa demais', '# p2', 'aguardando_revisao') as v_b_p2 \gset
select tests.authenticate_as_service();
select count(*) from public.revisao_reservar_envios(1000) where submission_id = :'v_b_p2' \gset
select r.id as v_r_bp2 from public.material_reviews r where r.submission_id = :'v_b_p2' \gset
select public.revisao_anexar_lote(array[:'v_r_bp2'::uuid], 'msgbatch_teste_6');
select public.revisao_pausar(:'v_r_bp2', '[]'::jsonb, 1, 1, 0, 0, 0, 0, 2);
select public.revisao_anexar_lote(array[:'v_r_bp2'::uuid], 'msgbatch_teste_7');
select is(public.revisao_pausar(:'v_r_bp2', '[]'::jsonb, 1, 1, 0, 0, 0, 0, 2), false, 'na tentativa limite a pausa é recusada');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 6. RLS da revisão: autor, admin, ninguém do cliente escreve
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'v_a');
select is(
  (select count(*)::int from public.material_reviews where submission_id in (:'v_a1', :'v_a2', :'v_a_n1', :'v_a_e1')),
  4,
  'o autor lê as revisões dos próprios envios'
);
select is((select count(*)::int from public.material_reviews where submission_id = :'v_b_t'), 0, 'e não lê a revisão do envio de outra pessoa');
select is((select findings_text from public.material_reviews where id = :'v_r_n1'), 'achados N', 'o autor lê os achados');
select throws_ok(
  format($$ select continuation from public.material_reviews where id = %L $$, :'v_r_n1'),
  '42501', NULL, 'o autor não lê a coluna de continuação'
);
select throws_ok(
  format($$ insert into public.material_reviews (submission_id, content_sha256) values (%L, 'x') $$, :'v_a1'),
  '42501', NULL, 'o autor não cria revisão'
);
select throws_ok(
  format($$ update public.material_reviews set verdict = 'apto' where id = %L $$, :'v_r_n1'),
  '42501', NULL, 'o autor não altera veredito'
);
select throws_ok(
  format($$ delete from public.material_reviews where id = %L $$, :'v_r_n1'),
  '42501', NULL, 'o autor não apaga revisão'
);
select tests.clear_auth();

select tests.authenticate_as(:'v_admin');
select ok(
  (select count(*)::int from public.material_reviews where submission_id in (:'v_a1', :'v_a2', :'v_a_n1', :'v_a_e1', :'v_b_t', :'v_b_p')) >= 6,
  'admin ativo lê as revisões de todos'
);
select throws_ok(
  format($$ update public.material_reviews set status = 'erro' where id = %L $$, :'v_r_n1'),
  '42501', NULL, 'admin também não altera revisão pelo cliente'
);
select tests.clear_auth();

select tests.authenticate_as(:'v_pend');
select is((select count(*)::int from public.material_reviews), 0, 'usuário pendente não lê revisões');
select tests.clear_auth();
select tests.authenticate_as_anon();
select throws_ok($$ select count(*) from public.material_reviews $$, '42501', NULL, 'anon não lê revisões');
select tests.clear_auth();

-- Tetos: só admin lê; ninguém do cliente altera.
select tests.authenticate_as(:'v_admin');
select is((select count(*)::int from public.review_settings), 1, 'admin lê os tetos');
select throws_ok($$ update public.review_settings set monthly_review_cap = 1 $$, '42501', NULL, 'admin não altera os tetos pelo cliente');
select tests.clear_auth();
select tests.authenticate_as(:'v_a');
select is((select count(*)::int from public.review_settings), 0, 'estudante não lê os tetos');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 7. Limites de custo no banco
-- ---------------------------------------------------------------------------
-- Um usuário só espera 3 envios por vez (44-E): com teto diário de 2, o 3º espera.
update public.review_settings set daily_review_cap_per_user = 2;
insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md, status)
select :'v_daily', 'Diário ' || g, :'v_disc', :'v_theme', '# d' || g, 'aguardando_revisao' from generate_series(1, 3) g;
select tests.authenticate_as_service();
select is(
  (select count(*)::int from public.revisao_reservar_envios(1000) where submission_id in (select id from public.material_submissions where author_id = :'v_daily')),
  2,
  'no máximo N revisões por usuário por dia (aqui N = 2)'
);
select is(
  (select count(*)::int from public.revisao_reservar_envios(1000) where submission_id in (select id from public.material_submissions where author_id = :'v_daily')),
  0,
  'o 3º espera: uma nova reserva no mesmo dia não o pega'
);
select tests.clear_auth();
select is(
  (select count(*)::int from public.material_submissions where author_id = :'v_daily' and status = 'aguardando_revisao'),
  1,
  'o que sobrou continua "aguardando revisão"'
);
select is(app.reviews_used_by_user_today(:'v_daily'), 2, 'a contagem do dia é a da pessoa: 2');

-- Um dia depois, a pessoa volta a ter cota.
update public.material_reviews set created_at = created_at - interval '2 days'
where submission_id in (select id from public.material_submissions where author_id = :'v_daily');
select is(app.reviews_used_by_user_today(:'v_daily'), 0, 'no dia seguinte a contagem do dia zera');
select tests.authenticate_as_service();
select is(
  (select count(*)::int from public.revisao_reservar_envios(1000) where submission_id in (select id from public.material_submissions where author_id = :'v_daily')),
  1,
  'e o que esperava é reservado'
);
select tests.clear_auth();
update public.review_settings set daily_review_cap_per_user = 5;

-- Teto mensal: só cabe o que sobra.
select app.reviews_used_this_month() as v_used \gset
update public.review_settings set monthly_review_cap = :v_used + 2;
insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md, status)
select :'v_month', 'Mensal ' || g, :'v_disc', :'v_theme', '# m' || g, 'aguardando_revisao' from generate_series(1, 3) g;
select tests.authenticate_as_service();
select is(
  (select count(*)::int from public.revisao_reservar_envios(1000) where submission_id in (select id from public.material_submissions where author_id = :'v_month')),
  2,
  'com o teto mensal quase cheio, só cabem 2 dos 3'
);
select tests.clear_auth();
select is(
  (select count(*)::int from public.material_submissions where author_id = :'v_month' and status = 'aguardando_revisao'),
  1,
  'o que sobrou espera na fila'
);
select tests.authenticate_as(:'v_month');
select results_eq(
  $$ select (public.situacao_da_revisao() ->> 'mes_esgotado')::boolean, (public.situacao_da_revisao() ->> 'usadas_hoje')::int, (public.situacao_da_revisao() ->> 'limite_por_dia')::int $$,
  $$ values (true, 2, 5) $$,
  'a tela é avisada de que o mês esgotou, e de quanto a pessoa usou hoje'
);
select tests.clear_auth();
select tests.authenticate_as(:'v_pend');
select throws_ok($$ select public.situacao_da_revisao() $$, '42501', NULL, 'usuário pendente não consulta a situação');
select tests.clear_auth();

-- Um envio que voltou por reenvio do autor (44-E) é reservado de novo, com uma revisão nova.
update public.review_settings set monthly_review_cap = 100000;
select tests.authenticate_as(:'v_a');
select is(
  tests.affected_rows(format($$ update public.material_submissions set content_md = '# corrigido' where id = %L $$, :'v_a_n1')),
  1, 'o autor substitui o texto do envio "não apto"'
);
select tests.clear_auth();
select tests.authenticate_as_service();
select is((select count(*)::int from public.revisao_reservar_envios(1000) where submission_id = :'v_a_n1'), 1, 'o servidor o reserva de novo');
select tests.clear_auth();
select is((select count(*)::int from public.material_reviews where submission_id = :'v_a_n1'), 2, 'as duas revisões do mesmo envio ficam guardadas, cada uma com o seu hash');
select isnt(
  (select content_sha256 from public.material_reviews where submission_id = :'v_a_n1' order by created_at limit 1),
  (select content_sha256 from public.material_reviews where submission_id = :'v_a_n1' order by created_at desc limit 1),
  'e cada revisão liga-se ao hash do texto que revisou'
);


-- ---------------------------------------------------------------------------
-- 8. Ajustes da revisão da 44-E: hash do texto, conferência do servidor,
--    contagem de terceiros e reconferência do material acima
-- ---------------------------------------------------------------------------
-- 8.1 O hash do texto é calculado pelo banco, a cada gravação.
select has_column('public', 'material_submissions', 'content_sha256', 'o envio tem o hash do próprio texto');
select is(
  (select content_sha256 from public.material_submissions where id = :'v_a_n1'),
  encode(extensions.digest('# corrigido', 'sha256'), 'hex'),
  'o hash do envio é o SHA-256 do texto atual'
);
select isnt(
  (select content_sha256 from public.material_reviews where id = :'v_r_n1'),
  (select content_sha256 from public.material_submissions where id = :'v_a_n1'),
  'depois que o autor troca o texto, o hash da revisão antiga já não é o do envio'
);
select ok(
  not has_function_privilege('authenticated', 'app.revisao_valida_do_envio(uuid)', 'execute')
  and not has_function_privilege('anon', 'app.revisao_valida_do_envio(uuid)', 'execute'),
  'só o servidor pergunta qual revisão vale para o texto atual'
);
select is(app.revisao_valida_do_envio(:'v_a_n1'), null::uuid, 'a revisão do texto antigo não vale para o texto novo');
select is(app.revisao_valida_do_envio(:'v_a1'), :'v_r_a1'::uuid, 'já a do texto que não mudou vale');

-- 8.2 Conferência do servidor antes de gastar: registra "não apto" direto da reserva, sem lote e sem custo.
select tests.create_user('rev.pre@test.local', 'student', 'active') as v_pre_autor \gset
select tests.new_submission(:'v_pre_autor', :'v_disc', :'v_theme', 'Fora do padrão', '# fora', 'aguardando_revisao') as v_b_pre \gset
select tests.authenticate_as_service();
select count(*) from public.revisao_reservar_envios(1000) where submission_id = :'v_b_pre' \gset
select r.id as v_r_bpre from public.material_reviews r where r.submission_id = :'v_b_pre' \gset
select is(
  public.revisao_registrar_resultado(:'v_r_bpre', 'nao_apto', null, 'Antes de pedir a revisão de IA...', null, 'pre_checagem',
    null, 'promptsha', 0, 0, 0, 0, 0, 0, null, false),
  true, 'o servidor registra "não apto" direto da reserva, sem ter criado lote'
);
select tests.clear_auth();
select results_eq(
  format($$ select r.status, r.verdict, r.billable, s.status from public.material_reviews r join public.material_submissions s on s.id = r.submission_id where r.id = %L $$, :'v_r_bpre'),
  $$ values ('concluida'::text, 'nao_apto'::text, false, 'nao_apto'::text) $$,
  'o envio vai a "não apto" e a conferência não conta no limite de revisões'
);

-- 8.3 A contagem de envios esperando revisão não espia terceiros.
select tests.authenticate_as(:'v_a');
select throws_ok(
  format($$ select app.submission_waiting_count(%L, null) $$, :'v_b'),
  '42501', NULL, 'usuário não conta os envios esperando de outra pessoa'
);
select lives_ok(
  format($$ select app.submission_waiting_count(%L, null) $$, :'v_a'),
  'usuário conta os próprios envios esperando (é o que o gatilho faz)'
);
select tests.clear_auth();
select lives_ok(
  format($$ select app.submission_waiting_count(%L, null) $$, :'v_b'),
  'o servidor (sem JWT de usuário) conta os de qualquer pessoa'
);

-- 8.4 O material acima é reconferido em toda alteração do cliente.
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Pai que será despublicado') returning id as v_pai \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_pai', 0, 'S', 'C.');
select tests.force_publish_material(:'v_pai');
select tests.create_user('rev.pai@test.local', 'student', 'active') as v_pai_autor \gset
insert into public.material_submissions (author_id, title, discipline_id, theme_id, parent_material_id, content_md, status)
values (:'v_pai_autor', 'Com pai', :'v_disc', :'v_theme', :'v_pai', '# com pai', 'nao_apto') returning id as v_sub_pai \gset
select tests.authenticate_as(:'v_pai_autor');
select is(
  tests.affected_rows(format($$ update public.material_submissions set content_md = '# com pai, corrigido' where id = %L $$, :'v_sub_pai')),
  1, 'com o material acima publicado, o autor corrige normalmente'
);
select tests.clear_auth();
update public.materials set status = 'draft' where id = :'v_pai';
update public.material_submissions set status = 'nao_apto' where id = :'v_sub_pai';
select tests.authenticate_as(:'v_pai_autor');
select throws_ok(
  format($$ update public.material_submissions set content_md = '# de novo' where id = %L $$, :'v_sub_pai'),
  'P0001', NULL, 'material acima que deixou de estar publicado: a alteração do cliente é recusada, mesmo sem mudar o pai'
);
select is(
  tests.affected_rows(format($$ update public.material_submissions set parent_material_id = null, content_md = '# sem pai' where id = %L $$, :'v_sub_pai')),
  1, 'e o autor resolve tirando o material acima'
);
select tests.clear_auth();

-- Excluir o autor leva envios e revisões junto.
select lives_ok(format($$ delete from auth.users where id = %L $$, :'v_month'), 'excluir o autor exclui os envios e as revisões');

-- Devolve os tetos como estavam.
update public.review_settings set monthly_review_cap = :v_cap_orig, daily_review_cap_per_user = :v_daily_orig;
select is((select monthly_review_cap from public.review_settings), :v_cap_orig, 'os tetos voltam ao que eram');

select * from finish();
