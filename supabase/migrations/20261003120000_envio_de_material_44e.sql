-- ============================================================================
-- 44-E — Envio de material pelo site
--
-- Qualquer usuário ativo envia o texto de um material (arquivo .md, no padrão
-- de conteúdos). O envio fica guardado em `material_submissions`, com estado,
-- visível só para quem enviou e para admin. Esta migration NÃO publica nada e
-- NÃO toca `materials`: o envio é só a porta de entrada e o registro.
--
-- Estados (`status`): aguardando_revisao (nasce assim), em_revisao, apto,
-- nao_apto, publicado, erro. Os quatro últimos e "em_revisao" são do servidor:
--
--   CAMINHO DA 44-F/44-G (documentado aqui, NÃO implementado nesta unidade):
--   o revisor automático e a publicação rodam no servidor, com service_role
--   (Edge Function) ou por uma RPC SECURITY DEFINER própria, e trocam o
--   `status`. O usuário nunca troca estado: `status` e `author_id` não têm
--   privilégio de coluna para `authenticated`, e o gatilho abaixo devolve o
--   envio a "aguardando_revisao" sempre que a pessoa substitui o texto. O
--   limite de 3 envios esperando vale para qualquer papel, inclusive o do
--   servidor: quem for recolocar um envio na fila precisa de vaga.
--
-- Regras, todas aqui no banco (a tela só explica):
--   * autor = auth.uid() (default da coluna; o cliente não o envia);
--   * insere só como si mesmo, só ativo, só no estado inicial;
--   * lê só os próprios envios (ativo) — admin ativo lê todos;
--   * substitui o texto do próprio envio só em aguardando_revisao, nao_apto
--     ou erro, e o envio volta a aguardando_revisao;
--   * no máximo 3 envios em aguardando_revisao ou em_revisao por pessoa;
--   * texto de até 300 KB (307200 bytes).
--
-- AGENTS.md riscos 8, 13 e 14: sem Resilient, anon sem privilégio na tabela,
-- toda função nova com revoke de public/anon.
-- ============================================================================

create table public.material_submissions (
  id uuid primary key default gen_random_uuid(),
  -- Nunca vem do cliente: sem privilégio de coluna para gravá-lo.
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null,
  discipline_id uuid not null references public.disciplines(id) on delete restrict,
  theme_id uuid not null references public.themes(id) on delete restrict,
  -- Material acima (opcional): precisa ser um material publicado ao enviar.
  parent_material_id uuid references public.materials(id) on delete set null,
  content_md text not null,
  status text not null default 'aguardando_revisao',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_submissions_status_check
    check (status in ('aguardando_revisao', 'em_revisao', 'apto', 'nao_apto', 'publicado', 'erro')),
  constraint material_submissions_title_check
    check (char_length(btrim(title)) between 1 and 300),
  -- 300 KB em bytes (não em caracteres: acento e símbolo ocupam mais de um).
  constraint material_submissions_content_size
    check (octet_length(content_md) between 1 and 307200)
);

comment on table public.material_submissions is
  '44-E: envio de material pelo site (texto .md). Estado trocado só pelo servidor (44-F/44-G); autor e estado não são gravados pelo cliente.';

create index material_submissions_author_idx on public.material_submissions (author_id, status);
create index material_submissions_status_idx on public.material_submissions (status, created_at);

-- ----------------------------------------------------------------------------
-- Funções internas (schema app, não exposto pela API)
-- ----------------------------------------------------------------------------

-- Quantos envios da pessoa estão esperando revisão, fora um (o que está sendo
-- gravado). Trava por pessoa: duas gravações ao mesmo tempo não furam o limite.
create or replace function app.submission_waiting_count(p_author uuid, p_except uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('material_submissions:' || p_author::text));
  return (
    select count(*)::int
    from public.material_submissions s
    where s.author_id = p_author
      and s.status in ('aguardando_revisao', 'em_revisao')
      and s.id is distinct from p_except
  );
end;
$$;

-- O Tema é da Disciplina e o material acima, se houver, está publicado.
create or replace function app.check_submission_refs(p_discipline uuid, p_theme uuid, p_parent uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.themes t where t.id = p_theme and t.discipline_id = p_discipline) then
    raise exception 'o Tema escolhido não pertence à Disciplina escolhida' using errcode = 'P0001';
  end if;
  if p_parent is not null and not exists (
    select 1 from public.materials m where m.id = p_parent and m.status = 'published'
  ) then
    raise exception 'o material acima precisa estar publicado' using errcode = 'P0001';
  end if;
end;
$$;

-- Gatilho de gravação. SECURITY INVOKER de propósito: `current_user` precisa
-- ser o papel de quem grava (authenticated/anon = cliente; postgres e
-- service_role = servidor).
create or replace function app.material_submissions_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_client boolean := current_user in ('authenticated', 'anon');
  v_enters_queue boolean;
begin
  if tg_op = 'INSERT'
     or new.discipline_id is distinct from old.discipline_id
     or new.theme_id is distinct from old.theme_id
     or new.parent_material_id is distinct from old.parent_material_id then
    perform app.check_submission_refs(new.discipline_id, new.theme_id, new.parent_material_id);
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if v_client then
      -- Substituir o texto (ou o que o acompanha) recoloca o envio na fila.
      -- Autor e data de criação nunca mudam por aqui (sem privilégio de coluna;
      -- reforçado).
      new.status := 'aguardando_revisao';
      new.author_id := old.author_id;
      new.created_at := old.created_at;
    end if;
  end if;

  -- Limite: no máximo 3 esperando revisão. Vale ao entrar na fila (envio novo
  -- ou reenvio de "não apto"/"erro"), não ao andar dentro dela.
  v_enters_queue := new.status in ('aguardando_revisao', 'em_revisao')
    and (tg_op = 'INSERT' or old.status not in ('aguardando_revisao', 'em_revisao'));
  if v_enters_queue and app.submission_waiting_count(new.author_id, new.id) >= 3 then
    raise exception 'Você já tem 3 envios esperando revisão'
      using errcode = 'P0001', hint = 'limite_envios_em_espera';
  end if;

  return new;
end;
$$;

revoke all on function app.submission_waiting_count(uuid, uuid) from public, anon;
revoke all on function app.check_submission_refs(uuid, uuid, uuid) from public, anon;
revoke all on function app.material_submissions_before_write() from public, anon, authenticated;
-- O gatilho roda com o papel de quem grava e chama as duas funções acima.
grant execute on function app.submission_waiting_count(uuid, uuid) to authenticated;
grant execute on function app.check_submission_refs(uuid, uuid, uuid) to authenticated;
-- (o gatilho em si não precisa de EXECUTE: o Postgres só confere ao criá-lo)

create trigger trg_material_submissions_before_write
  before insert or update on public.material_submissions
  for each row execute function app.material_submissions_before_write();

-- ----------------------------------------------------------------------------
-- Grants e RLS
-- ----------------------------------------------------------------------------

alter table public.material_submissions enable row level security;

revoke all on table public.material_submissions from anon;
revoke all on table public.material_submissions from authenticated;
grant select on table public.material_submissions to authenticated;
-- Só o que a pessoa escolhe. Sem author_id nem status: vêm do default.
grant insert (title, discipline_id, theme_id, parent_material_id, content_md)
  on table public.material_submissions to authenticated;
grant update (title, discipline_id, theme_id, parent_material_id, content_md)
  on table public.material_submissions to authenticated;

create policy material_submissions_select_own on public.material_submissions
  for select to authenticated
  using (author_id = auth.uid() and app.current_profile_status(auth.uid()) = 'active');

create policy material_submissions_select_admin on public.material_submissions
  for select to authenticated
  using (app.is_admin_active(auth.uid()));

create policy material_submissions_insert_own on public.material_submissions
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and status = 'aguardando_revisao'
    and app.current_profile_status(auth.uid()) = 'active'
  );

-- O `with check` vê a linha depois do gatilho, que já a devolveu a
-- "aguardando_revisao".
create policy material_submissions_update_own on public.material_submissions
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
