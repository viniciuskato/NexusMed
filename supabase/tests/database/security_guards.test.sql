-- ============================================================================
-- SynapseMed — Guardas estruturais de segurança (auditoria 2026-09-18; 45-H;
-- AUD-31.1 desde 46-E)
--
-- Falham na hora em que alguém criar uma tabela em `public` sem RLS ou
-- devolver privilégio de tabela ao role anon — as duas condições que,
-- juntas, expõem dados a qualquer pessoa com a anon key (pública).
-- Ver 20260918140000_revoke_anon_grants.sql.
--
-- Desde a 45-H, função nova de `public` não nasce com EXECUTE para PUBLIC (default
-- privileges); as guardas abaixo garantem que continue assim.
--
-- 45-H (AUD-31, migration 20261002120000_endurecimento_45h.sql): também falham
-- quando (a) uma função de `public` fica executável sem login — a próxima RPC
-- SECURITY DEFINER que esquecer o `revoke ... from public, anon` —, (b) uma
-- tabela dá TRUNCATE a anon/authenticated, ou (c) o estudante volta a poder
-- gravar direto o que só as RPCs decidem (simulado, progresso de leitura,
-- status de feedback). Os testes de "nasce" criam um objeto de sonda e o apagam.
--
-- AUD-31.1 (herança de EXECUTE por PUBLIC, AGENTS.md risco 14): as duas
-- últimas guardas falham, nomeando a função ou procedure, se alguma função
-- ou procedure chamável (não de gatilho) de um schema que o repositório
-- cria ficar com EXECUTE para PUBLIC ou para anon sem
-- `revoke ... from public[, anon]` explícito — a de PUBLIC olha os schemas
-- onde PUBLIC tem USAGE, a de anon olha onde anon tem USAGE (que já inclui
-- o que anon herda de PUBLIC). `app` está na lista por ser criado por
-- `20260903120100_rls_policies.sql`, mesmo sem PUBLIC/anon terem USAGE nele
-- hoje — outros schemas (auth, storage, extensions, …) são geridos pelo
-- Supabase fora do repositório e não entram. Ver RUNBOOK.md, 3.2.
-- ============================================================================

select plan(13);

select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity),
  '',
  'toda tabela de public tem RLS habilitado'
);

select is(
  (select coalesce(string_agg(distinct table_name, ', '), '')
     from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'),
  '',
  'anon não tem privilégio em nenhuma tabela de public'
);

select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%'
      )),
  '',
  'toda função SECURITY DEFINER de public fixa search_path'
);

-- AUD-31.1 — EXECUTE. `has_function_privilege('anon', ...)` inclui o que vem
-- do PUBLIC. Funções de extensão (pgTAP, pg_trgm...) ficam de fora: não são
-- nossas e o Postgres as cria com PUBLIC.
select is(
  (select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text), '')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      and not exists (
        select 1 from pg_depend d
         where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
      )),
  '',
  'nenhuma função de public é executável sem login (anon/PUBLIC)'
);

create function public.zz_guard_sonda_45h() returns int language sql as $$ select 1 $$;

select ok(
  not has_function_privilege('anon', 'public.zz_guard_sonda_45h()', 'EXECUTE'),
  'função nova em public não nasce executável por anon'
);

select ok(
  not exists (
    select 1
      from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.oid = 'public.zz_guard_sonda_45h()'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ),
  'função nova em public não nasce com EXECUTE para PUBLIC'
);

drop function public.zz_guard_sonda_45h();

-- AUD-31.2 — TRUNCATE.
select is(
  (select coalesce(string_agg(distinct table_name, ', '), '')
     from information_schema.role_table_grants
    where table_schema = 'public'
      and privilege_type = 'TRUNCATE'
      and grantee in ('anon', 'authenticated', 'PUBLIC')),
  '',
  'anon e authenticated não têm TRUNCATE em nenhuma tabela de public'
);

create table public.zz_guard_sonda_45h (id int);

select is(
  (select count(*)
     from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'zz_guard_sonda_45h'
      and privilege_type = 'TRUNCATE' and grantee in ('anon', 'authenticated', 'PUBLIC')),
  0::bigint,
  'tabela nova em public não nasce com TRUNCATE para anon/authenticated'
);

drop table public.zz_guard_sonda_45h;

-- AUD-31.3 — o que só as RPCs decidem não se grava direto pela API.
select is(
  (select coalesce(string_agg(x.tabela || ':' || x.priv, ', ' order by x.tabela, x.priv), '')
     from (
       select t.tabela, p.priv
         from unnest(array['simulations', 'simulation_questions', 'simulation_answers', 'reading_progress']) as t(tabela),
              unnest(array['INSERT', 'UPDATE']) as p(priv)
        where has_any_column_privilege('authenticated', 'public.' || t.tabela, p.priv)
     ) x),
  '',
  'authenticated não tem INSERT nem UPDATE em simulados nem em progresso de leitura'
);

select ok(
  not has_column_privilege('authenticated', 'public.feedback', 'status', 'INSERT')
  and has_column_privilege('authenticated', 'public.feedback', 'title', 'INSERT'),
  'authenticated não insere feedback com status (nasce no default; só admin muda, por set_feedback_status), mas segue inserindo o relato'
);

select is(
  (select coalesce(string_agg(polrelid::regclass::text || '.' || polname, ', ' order by polname), '')
     from pg_policy
    where polrelid in ('public.simulations'::regclass, 'public.simulation_questions'::regclass,
                       'public.simulation_answers'::regclass, 'public.reading_progress'::regclass)
      and polcmd in ('a', 'w', '*')
      and polpermissive
      and (polroles = '{0}' or 'authenticated'::regrole::oid = any (polroles))),
  '',
  'nenhuma política permissiva de escrita (insert/update/all) de authenticated nas tabelas das RPCs'
);

select is(
  (select coalesce(string_agg(n.nspname || '.' || p.proname, ', ' order by n.nspname, p.proname), '')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app')
      and has_schema_privilege('public', n.oid, 'usage')
      and p.prokind in ('f', 'p')
      and p.prorettype::regtype::text not in ('trigger', 'event_trigger')
      and has_function_privilege('public', p.oid, 'execute')),
  '',
  'nenhuma função/procedure chamável (não-gatilho), em schema do repositório onde PUBLIC tem USAGE, tem EXECUTE para PUBLIC'
);

select is(
  (select coalesce(string_agg(n.nspname || '.' || p.proname, ', ' order by n.nspname, p.proname), '')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app')
      and has_schema_privilege('anon', n.oid, 'usage')
      and p.prokind in ('f', 'p')
      and p.prorettype::regtype::text not in ('trigger', 'event_trigger')
      and has_function_privilege('anon', p.oid, 'execute')),
  '',
  'nenhuma função/procedure chamável (não-gatilho), em schema do repositório onde anon tem USAGE, tem EXECUTE para anon'
);

select * from finish();
