-- ============================================================================
-- SynapseMed — Guardas estruturais de segurança (auditoria 2026-09-18)
--
-- Falham na hora em que alguém criar uma tabela em `public` sem RLS ou
-- devolver privilégio de tabela ao role anon — as duas condições que,
-- juntas, expõem dados a qualquer pessoa com a anon key (pública).
-- Ver 20260918140000_revoke_anon_grants.sql.
-- ============================================================================

select plan(3);

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

select * from finish();
