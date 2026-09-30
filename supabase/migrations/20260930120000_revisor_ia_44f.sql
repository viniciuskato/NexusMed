-- ============================================================================
-- 44-F — Revisor de IA do NexusMed
--
-- Cada envio em "aguardando_revisao" é revisado por uma IA no servidor (uma
-- Edge Function agendada, que usa a API de lotes da Anthropic) e passa a
-- "apto", "nao_apto" ou "erro". Esta migration guarda a revisão, controla o
-- custo no banco e entrega ao servidor as funções de que ele precisa. NÃO
-- publica material e NÃO toca `materials` (isso é a 44-G).
--
-- Quem faz o quê:
--   * servidor (service_role, Edge Function `revisar-envios`): reserva envios,
--     anexa o lote, registra o resultado e troca o estado do envio. As funções
--     `revisao_*` só têm EXECUTE para service_role.
--   * usuário: só lê a revisão do próprio envio (e admin lê todas). Ninguém do
--     cliente escreve em `material_reviews` nem em `review_settings`.
--
-- Estados do envio pelo servidor:
--   aguardando_revisao -> em_revisao (reservado) -> apto | nao_apto | erro
-- Falha fechada: só o veredito lido pela função de servidor como "apto" leva o
-- envio a "apto"; qualquer outra coisa é "nao_apto" ou "erro".
--
-- Custo (dinheiro do dono), travado aqui além do teto da conta da API:
--   * no máximo `daily_review_cap_per_user` revisões por pessoa por dia
--     (padrão 5) e `monthly_review_cap` revisões no mês, no total (padrão 60);
--   * dia e mês contados no fuso de São Paulo;
--   * acima disso o envio espera em "aguardando_revisao" e a tela diz por quê.
-- Para mudar o teto mensal (dono, no SQL Editor do Supabase):
--   update public.review_settings set monthly_review_cap = 100;
--
-- AGENTS.md riscos 13 e 14: sem privilégio para anon nas tabelas; toda função
-- nova com revoke de public/anon (e de authenticated quando é só do servidor).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Ajustes na base da 44-E
-- ----------------------------------------------------------------------------

-- Hash do texto do envio, calculado pelo banco a cada gravação. A revisão guarda
-- o hash do texto que revisou; se o texto mudar depois, a revisão antiga deixa de
-- valer para ele (quem publica, na 44-G, confere os dois hashes).
alter table public.material_submissions
  add column content_sha256 text
  generated always as (encode(extensions.digest(content_md, 'sha256'), 'hex')) stored;

-- Conta os envios esperando revisão de UMA pessoa. Quando é chamada em nome de um
-- usuário (JWT com `sub`), só conta os dele: não dá para usar a função para
-- espiar a fila de terceiros. O servidor (sem `sub`) e o gatilho (que passa o
-- autor da própria linha) continuam funcionando.
create or replace function app.submission_waiting_count(p_author uuid, p_except uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and p_author is distinct from auth.uid() then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
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

-- Gatilho da 44-E, com uma diferença: na alteração feita por um cliente, Tema,
-- Disciplina e material acima são reconferidos SEMPRE (o material acima pode ter
-- deixado de estar publicado desde o envio), não só quando mudam.
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
     or v_client
     or new.discipline_id is distinct from old.discipline_id
     or new.theme_id is distinct from old.theme_id
     or new.parent_material_id is distinct from old.parent_material_id then
    perform app.check_submission_refs(new.discipline_id, new.theme_id, new.parent_material_id);
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if v_client then
      new.status := 'aguardando_revisao';
      new.author_id := old.author_id;
      new.created_at := old.created_at;
    end if;
  end if;

  v_enters_queue := new.status in ('aguardando_revisao', 'em_revisao')
    and (tg_op = 'INSERT' or old.status not in ('aguardando_revisao', 'em_revisao'));
  if v_enters_queue and app.submission_waiting_count(new.author_id, new.id) >= 3 then
    raise exception 'Você já tem 3 envios esperando revisão'
      using errcode = 'P0001', hint = 'limite_envios_em_espera';
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. Ajustes de custo (uma linha só)
-- ----------------------------------------------------------------------------

create table public.review_settings (
  id boolean primary key default true check (id),
  monthly_review_cap int not null default 60 check (monthly_review_cap >= 0),
  daily_review_cap_per_user int not null default 5 check (daily_review_cap_per_user >= 0),
  updated_at timestamptz not null default now()
);

insert into public.review_settings (id) values (true);

comment on table public.review_settings is
  '44-F: tetos de custo do revisor de IA. Uma linha. Só admin lê; quem muda é o dono, pelo SQL Editor.';

alter table public.review_settings enable row level security;
revoke all on table public.review_settings from anon, authenticated;
grant select on table public.review_settings to authenticated;

create policy review_settings_select_admin on public.review_settings
  for select to authenticated
  using (app.is_admin_active(auth.uid()));

-- ----------------------------------------------------------------------------
-- 2. A revisão
-- ----------------------------------------------------------------------------

create table public.material_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.material_submissions(id) on delete cascade,
  -- SHA-256 (hex) do texto que foi revisado: a revisão vale para esse texto.
  content_sha256 text not null,
  -- reservada: o servidor pegou o envio, o lote ainda não foi criado.
  -- submetida: o lote existe e a resposta é esperada. pausada: a IA parou no
  -- meio (pause_turn) e a revisão continua em outro lote. concluida: tem
  -- veredito. erro: falhou (o envio vai a "erro").
  status text not null default 'reservada'
    check (status in ('reservada', 'submetida', 'pausada', 'concluida', 'erro')),
  verdict text check (verdict in ('apto', 'nao_apto', 'erro')),
  -- A linha exata do veredito, os achados (texto da IA, sem o veredito e sem o
  -- bloco) e o bloco de correção (sem as cercas de código).
  verdict_line text,
  findings_text text,
  correction_block text,
  error_kind text,
  batch_id text,
  attempt int not null default 1 check (attempt >= 1),
  -- Conteúdo já produzido pela IA quando ela pausa (pause_turn), para continuar.
  continuation jsonb,
  model text,
  -- SHA-256 do prompt de sistema usado (prompt revisor + Parte 1 do padrão).
  prompt_sha256 text,
  input_tokens int,
  output_tokens int,
  cache_creation_tokens int,
  cache_read_tokens int,
  web_searches int,
  web_fetches int,
  stop_reason text,
  -- Conta no limite diário/mensal. Falso quando a revisão falhou antes de gastar
  -- (lote com erro ou expirado: a API não cobra).
  billable boolean not null default true,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  constraint material_reviews_verdict_matches_status check (
    (status = 'concluida' and verdict is not null and verdict in ('apto', 'nao_apto'))
    or (status = 'erro' and verdict is not null and verdict = 'erro')
    or (status in ('reservada', 'submetida', 'pausada') and verdict is null)
  )
);

comment on table public.material_reviews is
  '44-F: revisão de IA de um envio (texto revisado por hash, veredito, achados, modelo, tokens e buscas). Escrita só pelo servidor.';

create index material_reviews_submission_idx on public.material_reviews (submission_id, created_at desc);
create index material_reviews_status_idx on public.material_reviews (status, created_at);
create index material_reviews_created_idx on public.material_reviews (created_at) where billable;

alter table public.material_reviews enable row level security;
revoke all on table public.material_reviews from anon, authenticated;
-- Só o que o autor precisa ver: sem `continuation` (grande) e sem `batch_id`.
grant select (
  id, submission_id, content_sha256, status, verdict, verdict_line, findings_text,
  correction_block, error_kind, attempt, model, input_tokens, output_tokens,
  cache_creation_tokens, cache_read_tokens, web_searches, web_fetches, stop_reason,
  created_at, submitted_at, completed_at
) on table public.material_reviews to authenticated;

create policy material_reviews_select_author on public.material_reviews
  for select to authenticated
  using (
    app.current_profile_status(auth.uid()) = 'active'
    and exists (
      select 1 from public.material_submissions s
      where s.id = submission_id and s.author_id = auth.uid()
    )
  );

create policy material_reviews_select_admin on public.material_reviews
  for select to authenticated
  using (app.is_admin_active(auth.uid()));

-- ----------------------------------------------------------------------------
-- 3. Limites (funções internas)
-- ----------------------------------------------------------------------------

-- Início do dia e do mês no fuso de São Paulo, como instante.
create or replace function app.review_day_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
$$;

create or replace function app.review_month_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
$$;

create or replace function app.reviews_used_by_user_today(p_user uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.material_reviews r
  join public.material_submissions s on s.id = r.submission_id
  where s.author_id = p_user and r.billable and r.created_at >= app.review_day_start();
$$;

create or replace function app.reviews_used_this_month()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.material_reviews r
  where r.billable and r.created_at >= app.review_month_start();
$$;

revoke all on function app.review_day_start() from public, anon, authenticated;
revoke all on function app.review_month_start() from public, anon, authenticated;
revoke all on function app.reviews_used_by_user_today(uuid) from public, anon, authenticated;
revoke all on function app.reviews_used_this_month() from public, anon, authenticated;
-- Só as funções públicas (SECURITY DEFINER) as chamam, com os privilégios do dono
-- delas: nenhum papel de cliente precisa de EXECUTE aqui.

-- ----------------------------------------------------------------------------
-- 4. Para a tela: onde está o limite (sem expor o uso das outras pessoas)
-- ----------------------------------------------------------------------------

create or replace function public.situacao_da_revisao()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_daily int;
  v_monthly int;
begin
  if v_uid is null or app.current_profile_status(v_uid) is distinct from 'active' then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  select daily_review_cap_per_user, monthly_review_cap into v_daily, v_monthly from public.review_settings;
  return jsonb_build_object(
    'usadas_hoje', app.reviews_used_by_user_today(v_uid),
    'limite_por_dia', v_daily,
    'mes_esgotado', app.reviews_used_this_month() >= v_monthly
  );
end;
$$;

revoke all on function public.situacao_da_revisao() from public, anon;
grant execute on function public.situacao_da_revisao() to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Funções do servidor (só service_role)
-- ----------------------------------------------------------------------------

-- Reserva envios "aguardando revisão", respeitando os limites, e devolve o que
-- o servidor precisa para montar o lote. Cada envio reservado vai a
-- "em_revisao" e ganha uma revisão "reservada".
create or replace function public.revisao_reservar_envios(p_max int default 20)
returns table (
  review_id uuid,
  submission_id uuid,
  title text,
  content_md text,
  content_sha256 text,
  discipline_id uuid,
  theme_id uuid,
  discipline_name text,
  theme_name text,
  parent_title text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_monthly int;
  v_daily int;
  v_remaining int;
  v_taken int := 0;
  v_user_used int;
  s record;
  v_review uuid;
  v_hash text;
begin
  -- Uma reserva por vez: dois disparos ao mesmo tempo não furam o limite.
  perform pg_advisory_xact_lock(hashtext('revisao_reservar_envios'));

  select monthly_review_cap, daily_review_cap_per_user into v_monthly, v_daily from public.review_settings;
  v_remaining := v_monthly - app.reviews_used_this_month();

  for s in
    select sub.* from public.material_submissions sub
    where sub.status = 'aguardando_revisao'
    order by sub.created_at, sub.id
    for update skip locked
  loop
    exit when v_taken >= greatest(p_max, 0) or v_remaining <= 0;

    -- Quem deixou de estar ativo não gasta revisão.
    continue when app.current_profile_status(s.author_id) is distinct from 'active';

    -- As revisões que este mesmo comando já criou para a pessoa já contam aqui
    -- (a contagem lê a tabela, que as vê).
    v_user_used := app.reviews_used_by_user_today(s.author_id);
    continue when v_user_used >= v_daily;

    -- O hash é o do texto lido nesta mesma linha, travada por este comando: a
    -- revisão guarda exatamente o texto que o servidor vai enviar à IA.
    v_hash := s.content_sha256;
    update public.material_submissions set status = 'em_revisao' where id = s.id;
    insert into public.material_reviews (submission_id, content_sha256)
    values (s.id, v_hash) returning id into v_review;

    v_taken := v_taken + 1;
    v_remaining := v_remaining - 1;

    review_id := v_review;
    submission_id := s.id;
    title := s.title;
    content_md := s.content_md;
    content_sha256 := v_hash;
    discipline_id := s.discipline_id;
    theme_id := s.theme_id;
    select d.name into discipline_name from public.disciplines d where d.id = s.discipline_id;
    select t.name into theme_name from public.themes t where t.id = s.theme_id;
    select m.title into parent_title from public.materials m where m.id = s.parent_material_id;
    return next;
  end loop;
end;
$$;

-- O lote foi criado: as revisões reservadas (ou pausadas, na continuação)
-- passam a "submetida".
create or replace function public.revisao_anexar_lote(p_review_ids uuid[], p_batch_id text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  update public.material_reviews
     set status = 'submetida', batch_id = p_batch_id, submitted_at = now()
   where id = any (p_review_ids) and status in ('reservada', 'pausada');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- O lote não pôde ser criado: devolve os envios à fila e apaga as reservas
-- (não houve gasto, então não contam no limite).
create or replace function public.revisao_liberar(p_review_ids uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  update public.material_submissions s set status = 'aguardando_revisao'
   where s.status = 'em_revisao'
     and s.id in (select r.submission_id from public.material_reviews r
                  where r.id = any (p_review_ids) and r.status = 'reservada');
  delete from public.material_reviews r where r.id = any (p_review_ids) and r.status = 'reservada';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Reservas antigas sem lote (o servidor caiu no meio): voltam para a fila.
create or replace function public.revisao_liberar_reservas_velhas(p_minutes int default 15)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(r.id), '{}') into v_ids
    from public.material_reviews r
   where r.status = 'reservada' and r.continuation is null
     and r.created_at < now() - make_interval(mins => p_minutes);
  return public.revisao_liberar(v_ids);
end;
$$;

-- A IA parou no meio (pause_turn): guarda o que ela já produziu e o gasto até
-- aqui, e deixa a revisão "pausada" para continuar em outro lote. Devolve
-- falso quando já houve tentativas demais (o servidor então registra "erro").
create or replace function public.revisao_pausar(
  p_review_id uuid,
  p_continuation jsonb,
  p_input_tokens int,
  p_output_tokens int,
  p_cache_creation_tokens int,
  p_cache_read_tokens int,
  p_web_searches int,
  p_web_fetches int,
  p_max_attempts int default 3
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.material_reviews;
begin
  select * into r from public.material_reviews where id = p_review_id and status = 'submetida' for update;
  if not found or r.attempt >= p_max_attempts then
    return false;
  end if;
  update public.material_reviews set
    status = 'pausada',
    continuation = p_continuation,
    attempt = attempt + 1,
    input_tokens = coalesce(input_tokens, 0) + coalesce(p_input_tokens, 0),
    output_tokens = coalesce(output_tokens, 0) + coalesce(p_output_tokens, 0),
    cache_creation_tokens = coalesce(cache_creation_tokens, 0) + coalesce(p_cache_creation_tokens, 0),
    cache_read_tokens = coalesce(cache_read_tokens, 0) + coalesce(p_cache_read_tokens, 0),
    web_searches = coalesce(web_searches, 0) + coalesce(p_web_searches, 0),
    web_fetches = coalesce(web_fetches, 0) + coalesce(p_web_fetches, 0)
  where id = p_review_id;
  return true;
end;
$$;

-- Registra o resultado de uma revisão "submetida" (idempotente: uma segunda
-- chamada para a mesma revisão não faz nada) e troca o estado do envio.
-- O veredito "apto" só chega ao envio se a revisão for de fato "apto".
create or replace function public.revisao_registrar_resultado(
  p_review_id uuid,
  p_verdict text,
  p_verdict_line text,
  p_findings_text text,
  p_correction_block text,
  p_error_kind text,
  p_model text,
  p_prompt_sha256 text,
  p_input_tokens int,
  p_output_tokens int,
  p_cache_creation_tokens int,
  p_cache_read_tokens int,
  p_web_searches int,
  p_web_fetches int,
  p_stop_reason text,
  p_billable boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.material_reviews;
  v_verdict text := p_verdict;
  v_status text;
  v_submission_status text;
begin
  if v_verdict is null or v_verdict not in ('apto', 'nao_apto', 'erro') then
    v_verdict := 'erro';
  end if;

  -- "reservada" também vale: a conferência do servidor antes de gastar com a IA
  -- (arquivo fora do padrão) registra o resultado sem nunca ter criado o lote.
  select * into r from public.material_reviews where id = p_review_id and status in ('submetida', 'reservada') for update;
  if not found then
    return false;
  end if;

  v_status := case when v_verdict = 'erro' then 'erro' else 'concluida' end;
  v_submission_status := case v_verdict when 'apto' then 'apto' when 'nao_apto' then 'nao_apto' else 'erro' end;

  update public.material_reviews set
    status = v_status,
    verdict = v_verdict,
    verdict_line = p_verdict_line,
    findings_text = p_findings_text,
    correction_block = p_correction_block,
    error_kind = p_error_kind,
    model = p_model,
    prompt_sha256 = p_prompt_sha256,
    input_tokens = coalesce(input_tokens, 0) + coalesce(p_input_tokens, 0),
    output_tokens = coalesce(output_tokens, 0) + coalesce(p_output_tokens, 0),
    cache_creation_tokens = coalesce(cache_creation_tokens, 0) + coalesce(p_cache_creation_tokens, 0),
    cache_read_tokens = coalesce(cache_read_tokens, 0) + coalesce(p_cache_read_tokens, 0),
    web_searches = coalesce(web_searches, 0) + coalesce(p_web_searches, 0),
    web_fetches = coalesce(web_fetches, 0) + coalesce(p_web_fetches, 0),
    stop_reason = p_stop_reason,
    -- Já houve gasto numa pausa anterior: continua contando.
    billable = (p_billable or r.attempt > 1 or coalesce(r.input_tokens, 0) > 0),
    completed_at = now()
  where id = p_review_id;

  -- O envio só muda se ainda está em revisão com o mesmo texto que foi revisado.
  update public.material_submissions s set status = v_submission_status
   where s.id = r.submission_id
     and s.status = 'em_revisao'
     and s.content_sha256 = r.content_sha256;
  return true;
end;
$$;

-- A revisão "concluída" mais recente que vale para o texto ATUAL do envio (mesmo
-- hash), ou nulo. É o que a publicação (44-G) consulta: revisão de texto antigo
-- não vale.
create or replace function app.revisao_valida_do_envio(p_submission uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id
  from public.material_reviews r
  join public.material_submissions s on s.id = r.submission_id
  where r.submission_id = p_submission
    and r.status = 'concluida'
    and r.content_sha256 = s.content_sha256
  order by r.completed_at desc nulls last, r.created_at desc
  limit 1;
$$;

revoke all on function app.revisao_valida_do_envio(uuid) from public, anon, authenticated;

-- Revisões que o servidor precisa acompanhar (lote enviado) ou continuar.
create or replace function public.revisao_pendentes()
returns table (review_id uuid, status text, batch_id text, continuation jsonb, attempt int)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.status, r.batch_id, r.continuation, r.attempt
  from public.material_reviews r
  where r.status in ('submetida', 'pausada')
  order by r.created_at;
$$;

-- Dados de uma revisão pausada, para montar o pedido de continuação.
create or replace function public.revisao_dados_do_envio(p_review_ids uuid[])
returns table (
  review_id uuid, submission_id uuid, title text, content_md text,
  discipline_id uuid, theme_id uuid,
  discipline_name text, theme_name text, parent_title text, continuation jsonb, attempt int
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, s.id, s.title, s.content_md, s.discipline_id, s.theme_id,
         (select d.name from public.disciplines d where d.id = s.discipline_id),
         (select t.name from public.themes t where t.id = s.theme_id),
         (select m.title from public.materials m where m.id = s.parent_material_id),
         r.continuation, r.attempt
  from public.material_reviews r
  join public.material_submissions s on s.id = r.submission_id
  where r.id = any (p_review_ids);
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.revisao_reservar_envios(int)',
    'public.revisao_anexar_lote(uuid[], text)',
    'public.revisao_liberar(uuid[])',
    'public.revisao_liberar_reservas_velhas(int)',
    'public.revisao_pausar(uuid, jsonb, int, int, int, int, int, int, int)',
    'public.revisao_registrar_resultado(uuid, text, text, text, text, text, text, text, int, int, int, int, int, int, text, boolean)',
    'public.revisao_pendentes()',
    'public.revisao_dados_do_envio(uuid[])'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Agendador: quem chama a Edge Function
-- ----------------------------------------------------------------------------

-- O agendamento em si (cron.schedule) e os dois segredos do Vault ficam no
-- RUNBOOK, porque dependem do endereço da função e do segredo que o dono cria.
-- Sem os segredos, a função abaixo não faz nada (é o caso do banco local).
create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function app.disparar_revisao()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'revisor_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'revisor_segredo';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function app.disparar_revisao() from public, anon, authenticated;
