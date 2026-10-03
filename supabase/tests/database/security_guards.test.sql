-- ============================================================================
-- SynapseMed — Guardas estruturais de segurança (auditoria 2026-09-18;
-- AUD-31.1 desde 46-E)
--
-- Falham na hora em que alguém criar uma tabela em `public` sem RLS ou
-- devolver privilégio de tabela ao role anon — as duas condições que,
-- juntas, expõem dados a qualquer pessoa com a anon key (pública).
-- Ver 20260918140000_revoke_anon_grants.sql.
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

select plan(5);

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
