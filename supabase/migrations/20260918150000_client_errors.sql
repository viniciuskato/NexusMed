-- ============================================================================
-- Registro de erros do cliente (NOVO-02, auditoria 2026-09-18)
-- ============================================================================
--
-- Até aqui, um erro no navegador de um estudante só era descoberto quando
-- alguém reclamava. O cliente (src/services/errorReporting.ts) passa a chamar
-- `log_client_error` em erros globais, promessas rejeitadas sem tratamento e
-- falhas capturadas pelo AppErrorBoundary.
--
-- Regras:
-- - Só pela RPC (SECURITY DEFINER): a tabela não tem policy de escrita, e o
--   dono da linha é sempre auth.uid(), nunca um parâmetro.
-- - Qualquer usuário autenticado registra, inclusive `pending` (erros na tela
--   de bloqueio também interessam). anon não executa.
-- - Nunca lança exceção por conteúdo: tipo inválido ou excesso de volume são
--   descartados em silêncio, para o registro de erro não gerar erro novo.
-- - Textos cortados (mensagem 1000, stack 8000, url 500, release 64,
--   user agent 400) e no máximo 50 registros por usuário por hora.
-- - Só admin lê. Retenção: apagar manualmente o que tiver mais de 90 dias
--   (consulta no RUNBOOK).
-- ============================================================================

create table public.client_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('error', 'unhandledrejection', 'boundary')),
  message text not null,
  stack text,
  url text,
  release text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index idx_client_errors_created_at on public.client_errors (created_at desc);
create index idx_client_errors_user_created on public.client_errors (user_id, created_at desc);

alter table public.client_errors enable row level security;

-- Revoke explícito: no Supabase, tabela nova ainda recebe grant para anon por
-- default privileges de outro role, apesar de 20260918140000 (a guarda em
-- security_guards.test.sql pegou isso nesta própria migration).
revoke all on table public.client_errors from anon;

create policy client_errors_admin_select on public.client_errors
  for select to authenticated
  using (app.is_admin_active(auth.uid()));

create or replace function public.log_client_error(
  p_kind text,
  p_message text,
  p_stack text,
  p_url text,
  p_release text,
  p_user_agent text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'autenticação necessária para registrar erro' using errcode = '42501';
  end if;

  if p_kind is null or p_kind not in ('error', 'unhandledrejection', 'boundary') then
    return;
  end if;

  if (select count(*) from public.client_errors
       where user_id = v_uid and created_at > now() - interval '1 hour') >= 50 then
    return;
  end if;

  insert into public.client_errors (user_id, kind, message, stack, url, release, user_agent)
  values (
    v_uid,
    p_kind,
    left(coalesce(p_message, ''), 1000),
    left(p_stack, 8000),
    left(p_url, 500),
    left(p_release, 64),
    left(p_user_agent, 400)
  );
end;
$$;

revoke all on function public.log_client_error(text, text, text, text, text, text) from public, anon;
grant execute on function public.log_client_error(text, text, text, text, text, text) to authenticated;
