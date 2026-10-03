-- ============================================================================
-- 44-H1 — Envio de questões pelo site
--
-- Qualquer usuário ativo envia o texto de um lote de questões (arquivo .md, no
-- padrão de questões). O envio fica guardado em `question_submissions`, com
-- estado, visível só para quem enviou e para admin. É a fila IRMÃ da
-- `material_submissions` (44-E): mesmas colunas de estado, mesmas regras, mesmo
-- limite de 3 esperando por pessoa (contados à parte, ver abaixo) e de 300 KB.
-- Esta migration NÃO revisa nem publica nada e NÃO toca `questions`: a revisão
-- por IA e a publicação de questões são da 44-H2 (o servidor trocará o `status`
-- com service_role, como faz com os envios de material).
--
-- Estados (`status`): aguardando_revisao (nasce assim), em_revisao, apto,
-- nao_apto, publicado, erro — os mesmos dos envios de material. O usuário nunca
-- troca estado: `status` e `author_id` não têm privilégio de coluna para
-- `authenticated`, e o gatilho devolve o envio a "aguardando_revisao" sempre que
-- a pessoa substitui o texto.
--
-- Regras, todas aqui no banco (a tela só explica):
--   * autor = auth.uid() (default da coluna; o cliente não o envia);
--   * insere só como si mesmo, só ativo, só no estado inicial;
--   * lê só os próprios envios (ativo) — admin ativo lê todos;
--   * substitui o texto do próprio envio só em aguardando_revisao, nao_apto ou
--     erro, e o envio volta a aguardando_revisao;
--   * no máximo 3 envios de questões em aguardando_revisao ou em_revisao por
--     pessoa. A contagem é da própria tabela (não soma os envios de material):
--     enquanto a 44-H2 não revisa questões, elas ficariam na fila para sempre e
--     travariam o envio de material da mesma pessoa;
--   * texto de até 300 KB (307200 bytes);
--   * `material_ids`: até 10 materiais PUBLICADOS aos quais as questões se ligam
--     quando o arquivo não diz (as que dizem, dizem pelo título, dentro do texto).
--
-- AGENTS.md riscos 8, 13 e 14: sem Resilient, anon sem privilégio na tabela,
-- toda função nova com revoke de public/anon.
-- ============================================================================

create table public.question_submissions (
  id uuid primary key default gen_random_uuid(),
  -- Nunca vem do cliente: sem privilégio de coluna para gravá-lo.
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null,
  content_md text not null,
  -- Materiais publicados a que as questões sem "Materiais cobertos" se ligam.
  material_ids uuid[] not null default '{}',
  status text not null default 'aguardando_revisao',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_submissions_status_check
    check (status in ('aguardando_revisao', 'em_revisao', 'apto', 'nao_apto', 'publicado', 'erro')),
  constraint question_submissions_title_check
    check (char_length(btrim(title)) between 1 and 300),
  -- 300 KB em bytes (não em caracteres: acento e símbolo ocupam mais de um).
  constraint question_submissions_content_size
    check (octet_length(content_md) between 1 and 307200),
  constraint question_submissions_material_ids_size
    check (cardinality(material_ids) <= 10)
);

comment on table public.question_submissions is
  '44-H1: envio de questões pelo site (texto .md). Estado trocado só pelo servidor (44-H2); autor e estado não são gravados pelo cliente.';

create index question_submissions_author_idx on public.question_submissions (author_id, status);
create index question_submissions_status_idx on public.question_submissions (status, created_at);

-- ----------------------------------------------------------------------------
-- Funções internas (schema app, não exposto pela API)
-- ----------------------------------------------------------------------------

-- Quantos envios de questões da pessoa estão esperando revisão, fora um (o que
-- está sendo gravado). Trava por pessoa: duas gravações ao mesmo tempo não furam
-- o limite. Em nome de um usuário (JWT com `sub`), só conta os dele.
create or replace function app.question_submission_waiting_count(p_author uuid, p_except uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and p_author is distinct from auth.uid() then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('question_submissions:' || p_author::text));
  return (
    select count(*)::int
    from public.question_submissions s
    where s.author_id = p_author
      and s.status in ('aguardando_revisao', 'em_revisao')
      and s.id is distinct from p_except
  );
end;
$$;

-- Todo material escolhido existe e está publicado.
create or replace function app.check_question_submission_refs(p_material_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(distinct m.id) from public.materials m
       where m.id = any (p_material_ids) and m.status = 'published')
     is distinct from (select count(distinct x) from unnest(p_material_ids) x) then
    raise exception 'os materiais escolhidos precisam estar publicados' using errcode = 'P0001';
  end if;
end;
$$;

-- Gatilho de gravação. SECURITY INVOKER de propósito: `current_user` precisa
-- ser o papel de quem grava (authenticated/anon = cliente; postgres e
-- service_role = servidor).
create or replace function app.question_submissions_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_client boolean := current_user in ('authenticated', 'anon');
  v_enters_queue boolean;
begin
  if tg_op = 'INSERT'
     or v_client
     or new.material_ids is distinct from old.material_ids then
    perform app.check_question_submission_refs(new.material_ids);
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if v_client then
      -- Substituir o texto (ou o que o acompanha) recoloca o envio na fila.
      new.status := 'aguardando_revisao';
      new.author_id := old.author_id;
      new.created_at := old.created_at;
    end if;
  end if;

  -- Limite: no máximo 3 esperando revisão. Vale ao entrar na fila (envio novo ou
  -- reenvio), não ao andar dentro dela.
  v_enters_queue := new.status in ('aguardando_revisao', 'em_revisao')
    and (tg_op = 'INSERT' or old.status not in ('aguardando_revisao', 'em_revisao'));
  if v_enters_queue and app.question_submission_waiting_count(new.author_id, new.id) >= 3 then
    raise exception 'Você já tem 3 envios de questões esperando revisão'
      using errcode = 'P0001', hint = 'limite_envios_em_espera';
  end if;

  return new;
end;
$$;

revoke all on function app.question_submission_waiting_count(uuid, uuid) from public, anon;
revoke all on function app.check_question_submission_refs(uuid[]) from public, anon;
revoke all on function app.question_submissions_before_write() from public, anon, authenticated;
-- O gatilho roda com o papel de quem grava e chama as duas funções acima.
grant execute on function app.question_submission_waiting_count(uuid, uuid) to authenticated;
grant execute on function app.check_question_submission_refs(uuid[]) to authenticated;

create trigger trg_question_submissions_before_write
  before insert or update on public.question_submissions
  for each row execute function app.question_submissions_before_write();

-- ----------------------------------------------------------------------------
-- Grants e RLS
-- ----------------------------------------------------------------------------

alter table public.question_submissions enable row level security;

revoke all on table public.question_submissions from anon;
revoke all on table public.question_submissions from authenticated;
grant select on table public.question_submissions to authenticated;
-- Só o que a pessoa escolhe. Sem author_id nem status: vêm do default.
grant insert (title, content_md, material_ids) on table public.question_submissions to authenticated;
grant update (title, content_md, material_ids) on table public.question_submissions to authenticated;

create policy question_submissions_select_own on public.question_submissions
  for select to authenticated
  using (author_id = auth.uid() and app.current_profile_status(auth.uid()) = 'active');

create policy question_submissions_select_admin on public.question_submissions
  for select to authenticated
  using (app.is_admin_active(auth.uid()));

create policy question_submissions_insert_own on public.question_submissions
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and status = 'aguardando_revisao'
    and app.current_profile_status(auth.uid()) = 'active'
  );

-- O `with check` vê a linha depois do gatilho, que já a devolveu a
-- "aguardando_revisao".
create policy question_submissions_update_own on public.question_submissions
  for update to authenticated
  using (
    author_id = auth.uid()
    and status in ('aguardando_revisao', 'nao_apto', 'erro')
    and app.current_profile_status(auth.uid()) = 'active'
  )
  with check (
    author_id = auth.uid()
    and status = 'aguardando_revisao'
    and app.current_profile_status(auth.uid()) = 'active'
  );
