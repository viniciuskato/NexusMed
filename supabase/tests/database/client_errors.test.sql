-- ============================================================================
-- SynapseMed — Registro de erros do cliente (NOVO-02, 2026-09-18)
--
-- Cobre 20260918150000_client_errors.sql: a RPC `log_client_error` grava o
-- erro do navegador do próprio usuário, corta textos longos, limita o volume
-- por usuário e nunca é chamável sem sessão; a tabela só é legível por admin.
-- ============================================================================

-- Self-contido: redefine os helpers de rls_policies.test.sql (idempotente),
-- porque `supabase test db` roda os arquivos em ordem alfabética.

create extension if not exists pgtap;

create schema if not exists tests;

-- ----------------------------------------------------------------------------
-- Helpers de fixture e simulação de autenticação
-- ----------------------------------------------------------------------------

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

  -- setup de fixture roda como postgres: ajusta role/status diretamente,
  -- sem passar por admin_set_profile_status (que é testada à parte).
  update public.profiles set role = p_role, status = p_status where id = v_id;

  return v_id;
end;
$$;

create or replace function tests.authenticate_as(p_uid uuid)
returns void
language plpgsql
as $$
begin
  -- is_local = false (nível de sessão): pg_prove/psql roda cada statement
  -- deste arquivo em autocommit, sem BEGIN explícito, então um set_config
  -- local à transação (true) desapareceria antes do próximo comando.
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

-- authenticate_as/authenticate_as_anon fazem SET ROLE de verdade (nível de
-- sessão, ver comentário acima), então anon/authenticated precisam poder
-- chegar a este schema e executar clear_auth() para voltar a ser postgres.
grant usage on schema tests to anon, authenticated;
grant execute on function tests.clear_auth() to anon, authenticated;

select plan(12);

select tests.clear_auth();

select tests.create_user('clienterr.a@test.local', 'student', 'active') as v_user_a \gset
select tests.create_user('clienterr.pend@test.local', 'student', 'pending') as v_user_pend \gset
select tests.create_user('clienterr.admin@test.local', 'admin', 'active') as v_admin \gset

-- Sem sessão: anon não executa a RPC.
select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.log_client_error('boundary', 'x', null, null, null, null) $$,
  '42501',
  null,
  'anon não pode registrar erro'
);
select tests.clear_auth();

-- Estudante ativo registra; o dono da linha é o auth.uid(), não um parâmetro.
select tests.authenticate_as(:'v_user_a');
select lives_ok(
  $$ select public.log_client_error('boundary', 'Falha ao abrir a tela', 'Error: x\n at y', '#/questions', 'abc123', 'Mozilla/5.0') $$,
  'estudante ativo registra um erro'
);

-- Tipo inválido é ignorado em silêncio (o registro de erro nunca pode gerar erro novo no cliente).
select lives_ok(
  $$ select public.log_client_error('qualquer-coisa', 'x', null, null, null, null) $$,
  'tipo desconhecido não lança exceção'
);

-- Texto enorme é cortado.
select lives_ok(
  $$ select public.log_client_error('error', repeat('m', 5000), repeat('s', 20000), repeat('u', 2000), repeat('r', 200), repeat('a', 2000)) $$,
  'textos acima do limite não lançam exceção'
);

-- Estudante não lê a tabela (nem os próprios erros).
select is(
  (select count(*)::int from public.client_errors),
  0,
  'estudante não enxerga client_errors'
);

-- Escrita direta na tabela é bloqueada: só pela RPC.
select throws_ok(
  $$ insert into public.client_errors (user_id, kind, message) values (auth.uid(), 'error', 'direto') $$,
  '42501',
  null,
  'insert direto na tabela é recusado'
);
select tests.clear_auth();

-- Usuário pendente também registra (erros na tela de bloqueio contam).
select tests.authenticate_as(:'v_user_pend');
select lives_ok(
  $$ select public.log_client_error('error', 'erro na tela de bloqueio', null, null, null, null) $$,
  'usuário pendente registra erro'
);
select tests.clear_auth();

-- Admin lê tudo.
select tests.authenticate_as(:'v_admin');
select is(
  (select count(*)::int from public.client_errors where user_id in (:'v_user_a', :'v_user_pend')),
  3,
  'admin enxerga os erros registrados (tipo inválido não gravou)'
);
select is(
  (select max(length(message)) from public.client_errors where user_id = :'v_user_a'),
  1000,
  'mensagem cortada em 1000 caracteres'
);
select is(
  (select max(length(stack)) from public.client_errors where user_id = :'v_user_a'),
  8000,
  'stack cortada em 8000 caracteres'
);
select tests.clear_auth();

-- Limite por usuário: no máximo 50 por hora, o excedente é descartado sem erro.
select tests.authenticate_as(:'v_user_a');
select lives_ok(
  $$ select public.log_client_error('error', 'rajada ' || g, null, null, null, null) from generate_series(1, 80) g $$,
  'rajada acima do limite não lança exceção'
);
select tests.clear_auth();

select tests.authenticate_as(:'v_admin');
select is(
  (select count(*)::int from public.client_errors where user_id = :'v_user_a'),
  50,
  'no máximo 50 erros por usuário por hora'
);
select tests.clear_auth();

select * from finish();
