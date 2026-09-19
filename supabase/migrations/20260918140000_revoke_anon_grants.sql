-- ============================================================================
-- Remove privilégios de tabela do role `anon` (auditoria 2026-09-18)
-- ============================================================================
--
-- 20260904120000_grants.sql concedeu SELECT/INSERT/UPDATE/DELETE em todas as
-- tabelas de `public` a anon e authenticated, inclusive por default
-- privileges para tabelas futuras. Hoje isso é inócuo porque toda tabela tem
-- RLS e nenhuma policy é `to anon` — mas uma tabela nova criada sem
-- `enable row level security` ficaria legível e gravável por qualquer pessoa
-- com a anon key (que é pública, vai no bundle). O app nunca lê/grava
-- tabelas sem sessão: anon não precisa de privilégio nenhum.
--
-- authenticated mantém os grants (RLS continua sendo o controle por linha).
-- A guarda complementar está em supabase/tests/database/security_guards.test.sql:
-- falha se alguma tabela de `public` estiver sem RLS ou se anon voltar a ter
-- privilégio de tabela.
-- ============================================================================

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

alter default privileges in schema public
  revoke select, insert, update, delete on tables from anon;

alter default privileges in schema public
  revoke usage, select on sequences from anon;

-- Funções: PUBLIC mantém o EXECUTE padrão do Postgres; as RPCs sensíveis já
-- revogam de `public, anon`. Estas duas revogavam só de PUBLIC — no Supabase
-- hospedado, anon recebe EXECUTE explícito por default privileges, então o
-- revoke de PUBLIC não bastava. (Inócuo hoje, as duas checam auth.uid().)
revoke execute on function public.submit_feedback(uuid, text, text, text, uuid, uuid) from anon;
revoke execute on function public.set_feedback_status(uuid, text) from anon;

alter default privileges in schema public
  revoke execute on functions from anon;
