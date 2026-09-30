-- ============================================================================
-- 44-H2 — Questões: revisão por IA e publicação pelo veredito
--
-- Fecha o caminho de conteúdo: o envio de questões (44-H1) passa pelo MESMO
-- revisor de IA da 44-F e, com o "apto" do texto atual, o servidor cria e publica
-- as questões, ligadas aos materiais, com proveniência "revisado por IA" (como a
-- 44-G fez com o material). Ninguém publica questão nova sem revisão apto,
-- inclusive o admin.
--
--   0. Uma revisão pode ser de um envio de material OU de um envio de questões
--      (`material_reviews.question_submission_id`); os limites de custo (por
--      pessoa por dia e total no mês) contam as duas.
--   1. Fila de espera unificada: 3 envios esperando por pessoa, somando material
--      e questões.
--   2. O servidor reserva, revisa e registra o resultado dos dois tipos (as
--      funções `revisao_*` da 44-F passam a conhecer os dois).
--   3. `app.criar_questao_rascunho`: a criação de UMA questão (a lógica do
--      `import_question_draft`, com a armadilha 16: UPDATE, não INSERT, na chave
--      da alternativa) sem a checagem de admin, para o servidor. O
--      `import_question_draft` passa a chamá-la.
--   4. Publicação pelo servidor: `revisao_publicar_questoes` (só service_role) cria,
--      liga aos materiais pelo título exato, publica e grava a proveniência, numa
--      transação. `revisao_recusar_publicacao_de_questoes` tira da fila o envio
--      cujo texto não monta. "Tentar de novo" com revisão apto válida volta a
--      "apto" (sem nova revisão).
--   5. Trava no banco: `publish_question` só publica questão com revisão apto
--      vinculada ao conteúdo atual. Questão publicada antes desta migration
--      segue a regra antiga (atestação humana) SÓ enquanto o conteúdo for o que
--      estava no ar (hash guardado).
--   6. Selo: `selos_de_questoes` (uma consulta traz o selo de todas as questões
--      com revisão de IA, para a lista não pedir uma a uma).
--   7. "Reportar erro" também na questão: a mesma tabela e a mesma aba da 44-G
--      (`material_error_reports` ganha `question_id`), com o mesmo limite diário.
--
-- AGENTS.md riscos 13, 14 e 16: sem privilégio para anon nas tabelas; toda função
-- nova com revoke de public/anon; alternativa criada com UPDATE na chave.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Revisão de envio de questões
-- ----------------------------------------------------------------------------

alter table public.question_submissions
  add column content_sha256 text
  generated always as (encode(extensions.digest(content_md, 'sha256'), 'hex')) stored,
  -- As questões que o servidor criou e publicou a partir deste envio (estado "publicado").
  add column published_question_ids uuid[] not null default '{}',
  -- Por que o servidor não publicou (material ambíguo, texto que não monta etc.).
  add column publication_note text;

-- Os materiais escolhidos no envio: sem NULL e sem repetição (a 44-H1 só conferia que
-- estavam publicados, e um NULL na lista passava pela conferência de "todos publicados").
create or replace function app.lista_de_ids_valida(p_ids uuid[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select array_position(p_ids, null::uuid) is null
     and cardinality(p_ids) = (select count(distinct x) from unnest(p_ids) as x);
$$;

revoke all on function app.lista_de_ids_valida(uuid[]) from public, anon;
grant execute on function app.lista_de_ids_valida(uuid[]) to authenticated, service_role;

alter table public.question_submissions
  add constraint question_submissions_material_ids_valid check (app.lista_de_ids_valida(material_ids));

alter table public.material_reviews
  alter column submission_id drop not null,
  add column question_submission_id uuid references public.question_submissions(id) on delete cascade,
  add constraint material_reviews_one_submission check (num_nonnulls(submission_id, question_submission_id) = 1);

-- 44-G3 nas questões: o "lugar" de um lote é o conjunto de materiais a que as questões se ligam.
-- A revisão guarda o que a IA recebeu (gravado pelo banco, na reserva).
alter table public.material_reviews add column material_ids uuid[];

create or replace function app.material_reviews_guardar_lugar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.submission_id is not null then
    select s.discipline_id, s.theme_id, s.parent_material_id
      into new.discipline_id, new.theme_id, new.parent_material_id
      from public.material_submissions s where s.id = new.submission_id;
  elsif new.question_submission_id is not null then
    select s.material_ids into new.material_ids
      from public.question_submissions s where s.id = new.question_submission_id;
  end if;
  return new;
end;
$$;

create index material_reviews_qsub_idx on public.material_reviews (question_submission_id, created_at desc);

grant select (question_submission_id) on table public.material_reviews to authenticated;

drop policy material_reviews_select_author on public.material_reviews;
create policy material_reviews_select_author on public.material_reviews
  for select to authenticated
  using (
    app.current_profile_status(auth.uid()) = 'active'
    and (
      exists (
        select 1 from public.material_submissions s
        where s.id = submission_id and s.author_id = auth.uid()
      )
      or exists (
        select 1 from public.question_submissions q
        where q.id = question_submission_id and q.author_id = auth.uid()
      )
    )
  );

-- O uso do dia por pessoa soma as revisões dos dois tipos.
create or replace function app.reviews_used_by_user_today(p_user uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select (
    select count(*)::int
    from public.material_reviews r
    join public.material_submissions s on s.id = r.submission_id
    where s.author_id = p_user and r.billable and r.created_at >= app.review_day_start()
  ) + (
    select count(*)::int
    from public.material_reviews r
    join public.question_submissions s on s.id = r.question_submission_id
    where s.author_id = p_user and r.billable and r.created_at >= app.review_day_start()
  );
$$;

-- ----------------------------------------------------------------------------
-- 1. Fila de espera unificada (3 por pessoa, material e questões somados)
-- ----------------------------------------------------------------------------

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
  -- Uma trava só por pessoa para os dois tipos: gravações simultâneas não furam o limite.
  perform pg_advisory_xact_lock(hashtext('material_submissions:' || p_author::text));
  return (
    select count(*)::int
    from public.material_submissions s
    where s.author_id = p_author
      and s.status in ('aguardando_revisao', 'em_revisao')
      and s.id is distinct from p_except
  ) + (
    select count(*)::int
    from public.question_submissions s
    where s.author_id = p_author
      and s.status in ('aguardando_revisao', 'em_revisao')
      and s.id is distinct from p_except
  );
end;
$$;

-- A contagem de questões é a mesma (a função da 44-H1 fica como atalho).
create or replace function app.question_submission_waiting_count(p_author uuid, p_except uuid)
returns int
language sql
security definer
set search_path = ''
as $$
  select app.submission_waiting_count(p_author, p_except);
$$;

-- ----------------------------------------------------------------------------
-- 2. Revisão válida e "apto" do envio de questões
-- ----------------------------------------------------------------------------

-- Válida = mesmo texto E mesmo conjunto de materiais (sem ordem) que a IA recebeu.
create or replace function app.revisao_valida_do_envio_de_questoes_para_o_lugar(p_submission uuid, p_material_ids uuid[])
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id
  from public.material_reviews r
  join public.question_submissions s on s.id = r.question_submission_id
  where r.question_submission_id = p_submission
    and r.status = 'concluida'
    and r.content_sha256 = s.content_sha256
    and r.material_ids @> p_material_ids
    and r.material_ids <@ p_material_ids
  order by r.completed_at desc nulls last, r.created_at desc
  limit 1;
$$;

create or replace function app.revisao_valida_do_envio_de_questoes(p_submission uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select app.revisao_valida_do_envio_de_questoes_para_o_lugar(s.id, s.material_ids)
  from public.question_submissions s
  where s.id = p_submission;
$$;

create or replace function app.revisao_apto_do_envio_de_questoes(p_submission uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id
  from public.material_reviews r
  where r.id = app.revisao_valida_do_envio_de_questoes(p_submission)
    and r.verdict = 'apto';
$$;

-- Para o gatilho do envio (roda com o papel de quem grava): só responde sobre envio da própria pessoa.
create or replace function app.envio_de_questoes_tem_revisao_apto_do_autor(p_submission uuid, p_material_ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.question_submissions s
    where s.id = p_submission
      and (auth.uid() is null or s.author_id = auth.uid())
      and exists (
        select 1 from public.material_reviews r
        where r.id = app.revisao_valida_do_envio_de_questoes_para_o_lugar(s.id, p_material_ids)
          and r.verdict = 'apto'
      )
  );
$$;

revoke all on function app.revisao_valida_do_envio_de_questoes_para_o_lugar(uuid, uuid[]) from public, anon, authenticated;
revoke all on function app.revisao_valida_do_envio_de_questoes(uuid) from public, anon, authenticated;
revoke all on function app.revisao_apto_do_envio_de_questoes(uuid) from public, anon, authenticated;
revoke all on function app.envio_de_questoes_tem_revisao_apto_do_autor(uuid, uuid[]) from public, anon;
grant execute on function app.envio_de_questoes_tem_revisao_apto_do_autor(uuid, uuid[]) to authenticated;

-- Gatilho do envio de questões: a fila unificada, o recado que some e o "apto" sem nova revisão.
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
      -- Substituir o texto recoloca o envio na fila. Mudança que NÃO mexe no texto (ex.:
      -- "Tentar de novo") com revisão "apto" válida do texto E dos materiais atuais: volta a
      -- "apto" e só a publicação é refeita. Materiais escolhidos diferentes dos que a IA
      -- recebeu: volta à REVISÃO (44-G3). Compara com os valores NOVOS.
      new.status := case
        when new.content_md = old.content_md and app.envio_de_questoes_tem_revisao_apto_do_autor(old.id, new.material_ids) then 'apto'
        else 'aguardando_revisao'
      end;
      new.author_id := old.author_id;
      new.created_at := old.created_at;
      new.publication_note := null;
      new.published_question_ids := old.published_question_ids;
    end if;
  end if;

  v_enters_queue := new.status in ('aguardando_revisao', 'em_revisao')
    and (tg_op = 'INSERT' or old.status not in ('aguardando_revisao', 'em_revisao'));
  if v_enters_queue and app.question_submission_waiting_count(new.author_id, new.id) >= 3 then
    raise exception 'Você já tem 3 envios esperando revisão'
      using errcode = 'P0001', hint = 'limite_envios_em_espera';
  end if;

  return new;
end;
$$;

drop policy question_submissions_update_own on public.question_submissions;
create policy question_submissions_update_own on public.question_submissions
  for update to authenticated
  using (
    author_id = auth.uid()
    and status in ('aguardando_revisao', 'nao_apto', 'erro')
    and app.current_profile_status(auth.uid()) = 'active'
  )
  with check (
    author_id = auth.uid()
    and status in ('aguardando_revisao', 'apto')
    and app.current_profile_status(auth.uid()) = 'active'
  );

-- ----------------------------------------------------------------------------
-- 3. Funções do servidor, agora para os dois tipos
-- ----------------------------------------------------------------------------

drop function public.revisao_reservar_envios(int);
create function public.revisao_reservar_envios(p_max int default 20)
returns table (
  review_id uuid,
  submission_id uuid,
  tipo text,
  title text,
  content_md text,
  content_sha256 text,
  discipline_id uuid,
  theme_id uuid,
  discipline_name text,
  theme_name text,
  parent_title text,
  material_titles text[]
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
  c record;
  s public.material_submissions;
  q public.question_submissions;
  v_review uuid;
begin
  -- Uma reserva por vez: dois disparos ao mesmo tempo não furam o limite.
  perform pg_advisory_xact_lock(hashtext('revisao_reservar_envios'));

  select monthly_review_cap, daily_review_cap_per_user into v_monthly, v_daily from public.review_settings;
  v_remaining := v_monthly - app.reviews_used_this_month();

  -- Os dois tipos numa fila só, do mais antigo para o mais novo.
  for c in
    select 'material'::text as kind, m.id, m.author_id, m.created_at
      from public.material_submissions m where m.status = 'aguardando_revisao'
    union all
    select 'questoes'::text, x.id, x.author_id, x.created_at
      from public.question_submissions x where x.status = 'aguardando_revisao'
    order by created_at, id
  loop
    exit when v_taken >= greatest(p_max, 0) or v_remaining <= 0;

    -- Quem deixou de estar ativo não gasta revisão.
    continue when app.current_profile_status(c.author_id) is distinct from 'active';

    -- As revisões que este mesmo comando já criou para a pessoa já contam aqui.
    v_user_used := app.reviews_used_by_user_today(c.author_id);
    continue when v_user_used >= v_daily;

    if c.kind = 'material' then
      select sub.* into s from public.material_submissions sub
       where sub.id = c.id and sub.status = 'aguardando_revisao' for update skip locked;
      continue when not found;
      -- O hash é o do texto lido nesta mesma linha, travada por este comando.
      update public.material_submissions set status = 'em_revisao' where id = s.id;
      insert into public.material_reviews (submission_id, content_sha256)
      values (s.id, s.content_sha256) returning id into v_review;

      review_id := v_review;
      submission_id := s.id;
      tipo := 'material';
      title := s.title;
      content_md := s.content_md;
      content_sha256 := s.content_sha256;
      discipline_id := s.discipline_id;
      theme_id := s.theme_id;
      select d.name into discipline_name from public.disciplines d where d.id = s.discipline_id;
      select t.name into theme_name from public.themes t where t.id = s.theme_id;
      select m.title into parent_title from public.materials m where m.id = s.parent_material_id;
      material_titles := null;
    else
      select sub.* into q from public.question_submissions sub
       where sub.id = c.id and sub.status = 'aguardando_revisao' for update skip locked;
      continue when not found;
      update public.question_submissions set status = 'em_revisao' where id = q.id;
      insert into public.material_reviews (question_submission_id, content_sha256)
      values (q.id, q.content_sha256) returning id into v_review;

      review_id := v_review;
      submission_id := q.id;
      tipo := 'questoes';
      title := q.title;
      content_md := q.content_md;
      content_sha256 := q.content_sha256;
      discipline_id := null;
      theme_id := null;
      discipline_name := null;
      theme_name := null;
      parent_title := null;
      material_titles := coalesce(
        (select array_agg(m.title order by m.title) from public.materials m where m.id = any (q.material_ids)),
        '{}'
      );
    end if;

    v_taken := v_taken + 1;
    v_remaining := v_remaining - 1;
    return next;
  end loop;
end;
$$;

-- Revisões que o servidor acompanha ou continua, agora com o tipo do envio (o prompt de cada tipo é outro).
drop function public.revisao_pendentes();
create function public.revisao_pendentes()
returns table (review_id uuid, status text, batch_id text, continuation jsonb, attempt int, tentativa_em timestamptz, tipo text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.status, r.batch_id, r.continuation, r.attempt, r.submitted_at,
         case when r.question_submission_id is not null then 'questoes' else 'material' end
  from public.material_reviews r
  where r.status in ('submetida', 'pausada', 'incerta')
  order by r.created_at;
$$;

drop function public.revisao_dados_do_envio(uuid[]);
create function public.revisao_dados_do_envio(p_review_ids uuid[])
returns table (
  review_id uuid, submission_id uuid, tipo text, title text, content_md text,
  discipline_id uuid, theme_id uuid,
  discipline_name text, theme_name text, parent_title text, material_titles text[],
  continuation jsonb, attempt int
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, s.id, 'material'::text, s.title, s.content_md, s.discipline_id, s.theme_id,
         (select d.name from public.disciplines d where d.id = s.discipline_id),
         (select t.name from public.themes t where t.id = s.theme_id),
         (select m.title from public.materials m where m.id = s.parent_material_id),
         null::text[],
         r.continuation, r.attempt
  from public.material_reviews r
  join public.material_submissions s on s.id = r.submission_id
  where r.id = any (p_review_ids)
  union all
  select r.id, q.id, 'questoes'::text, q.title, q.content_md, null::uuid, null::uuid,
         null::text, null::text, null::text,
         coalesce((select array_agg(m.title order by m.title) from public.materials m where m.id = any (q.material_ids)), '{}'),
         r.continuation, r.attempt
  from public.material_reviews r
  join public.question_submissions q on q.id = r.question_submission_id
  where r.id = any (p_review_ids);
$$;

-- Certeza de que NÃO há lote: devolve os envios (dos dois tipos) à fila e apaga as
-- reservas. Revisão de uma continuação (com conteúdo guardado) volta a "pausada".
create or replace function public.revisao_liberar(p_review_ids uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int := 0;
  v_m int;
begin
  update public.material_reviews r set status = 'pausada', submitted_at = null
   where r.id = any (p_review_ids) and r.status in ('reservada', 'incerta') and r.continuation is not null;
  get diagnostics v_m = row_count;
  v_n := v_n + v_m;
  update public.material_submissions s set status = 'aguardando_revisao'
   where s.status = 'em_revisao'
     and s.id in (select r.submission_id from public.material_reviews r
                  where r.id = any (p_review_ids) and r.status in ('reservada', 'incerta')
                    and r.continuation is null);
  update public.question_submissions s set status = 'aguardando_revisao'
   where s.status = 'em_revisao'
     and s.id in (select r.question_submission_id from public.material_reviews r
                  where r.id = any (p_review_ids) and r.status in ('reservada', 'incerta')
                    and r.continuation is null);
  delete from public.material_reviews r
   where r.id = any (p_review_ids) and r.status in ('reservada', 'incerta') and r.continuation is null;
  get diagnostics v_m = row_count;
  return v_n + v_m;
end;
$$;

-- Registra o resultado (idempotente) e troca o estado do envio do tipo certo.
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
    billable = (p_billable or r.attempt > 1 or coalesce(r.input_tokens, 0) > 0),
    completed_at = now()
  where id = p_review_id;

  -- O envio só muda se ainda está em revisão com o mesmo texto E o mesmo lugar que foram revisados (44-G3).
  update public.material_submissions s set status = v_submission_status
   where s.id = r.submission_id
     and s.status = 'em_revisao'
     and s.content_sha256 = r.content_sha256
     and s.discipline_id is not distinct from r.discipline_id
     and s.theme_id is not distinct from r.theme_id
     and s.parent_material_id is not distinct from r.parent_material_id;
  update public.question_submissions s set status = v_submission_status
   where s.id = r.question_submission_id
     and s.status = 'em_revisao'
     and s.content_sha256 = r.content_sha256
     and s.material_ids @> r.material_ids
     and s.material_ids <@ r.material_ids;
  return true;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.revisao_reservar_envios(int)',
    'public.revisao_dados_do_envio(uuid[])',
    'public.revisao_pendentes()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Criação de UMA questão (servidor e Admin compartilham a lógica)
-- ----------------------------------------------------------------------------

-- A lógica do `import_question_draft`, sem a checagem de admin (quem chama confere).
-- Só em `app` (a API não a expõe) e sem EXECUTE para nenhum papel de cliente.
create or replace function app.criar_questao_rascunho(
  p_id uuid,
  p_discipline_id uuid,
  p_theme_id uuid,
  p_cycle text,
  p_difficulty text,
  p_institution text,
  p_year int,
  p_clinical_vignette text,
  p_question_stem text,
  p_general_commentary text,
  p_high_yield_summary text,
  p_tags text[],
  p_options jsonb,
  p_material_links jsonb default '[]'::jsonb
)
returns public.questions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_theme_discipline_id uuid;
  v_question public.questions;
  v_option jsonb;
  v_letter text;
  v_option_text text;
  v_correct_count int := 0;
  v_option_count int := 0;
  v_inserted_option_id uuid;
begin
  if p_id is null then
    raise exception 'id da questão é obrigatório';
  end if;
  if trim(coalesce(p_question_stem, '')) = '' then
    raise exception 'comando da questão (pergunta) é obrigatório';
  end if;
  if p_cycle not in ('basico', 'clinico', 'internato_residencia') then
    raise exception 'ciclo inválido: %', p_cycle;
  end if;
  if p_difficulty not in ('facil', 'medio', 'dificil') then
    raise exception 'dificuldade inválida: %', p_difficulty;
  end if;

  perform 1 from public.disciplines where id = p_discipline_id;
  if not found then
    raise exception 'disciplina não encontrada: %', p_discipline_id;
  end if;

  select discipline_id into v_theme_discipline_id from public.themes where id = p_theme_id;
  if not found then
    raise exception 'tema não encontrado: %', p_theme_id;
  end if;
  if v_theme_discipline_id <> p_discipline_id then
    raise exception 'o tema informado não pertence à disciplina informada';
  end if;

  if p_options is null or jsonb_typeof(p_options) <> 'array' then
    raise exception 'lista de alternativas inválida';
  end if;

  for v_option in select * from jsonb_array_elements(p_options)
  loop
    v_letter := v_option->>'letter';
    v_option_text := trim(coalesce(v_option->>'text', ''));
    if v_letter is null or v_letter !~ '^[A-Z]{1,3}$' then
      raise exception 'alternativa % com letra inválida', v_option_count + 1;
    end if;
    if v_option_text = '' then
      raise exception 'alternativa % sem texto', v_letter;
    end if;
    if coalesce((v_option->>'is_correct')::boolean, false) then
      v_correct_count := v_correct_count + 1;
    end if;
    v_option_count := v_option_count + 1;
  end loop;

  if v_option_count < 2 then
    raise exception 'questão precisa de ao menos 2 alternativas (encontradas: %)', v_option_count;
  end if;
  if v_correct_count <> 1 then
    raise exception 'questão precisa de exatamente 1 alternativa correta (encontradas: %)', v_correct_count;
  end if;

  insert into public.questions
    (id, discipline_id, theme_id, cycle, difficulty, institution, year,
     clinical_vignette, question_stem, tags, status)
  values
    (p_id, p_discipline_id, p_theme_id, p_cycle, p_difficulty,
     nullif(trim(coalesce(p_institution, '')), ''), p_year,
     coalesce(p_clinical_vignette, ''), p_question_stem, coalesce(p_tags, '{}'), 'draft')
  returning * into v_question;

  insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary)
  values (p_id, coalesce(p_general_commentary, ''), coalesce(p_high_yield_summary, ''));

  v_option_count := 0;
  for v_option in select * from jsonb_array_elements(p_options)
  loop
    insert into public.question_options (question_id, letter, option_text, sort_order)
    values (p_id, v_option->>'letter', trim(v_option->>'text'), v_option_count)
    returning id into v_inserted_option_id;

    -- `trg_create_question_option_key` já cria a chave: UPDATE, não INSERT
    -- (AGENTS.md, risco 16).
    update public.question_option_keys
    set is_correct = coalesce((v_option->>'is_correct')::boolean, false),
        explanation = coalesce(v_option->>'explanation', '')
    where option_id = v_inserted_option_id;

    v_option_count := v_option_count + 1;
  end loop;

  perform app.replace_question_material_links(p_id, coalesce(p_material_links, '[]'::jsonb));

  return v_question;
end;
$$;

revoke all on function app.criar_questao_rascunho(
  uuid, uuid, uuid, text, text, text, int, text, text, text, text, text[], jsonb, jsonb
) from public, anon, authenticated;

-- O import do Admin continua igual por fora: confere que é admin e chama a mesma lógica.
create or replace function public.import_question_draft(
  p_id uuid,
  p_discipline_id uuid,
  p_theme_id uuid,
  p_cycle text,
  p_difficulty text,
  p_institution text,
  p_year int,
  p_clinical_vignette text,
  p_question_stem text,
  p_general_commentary text,
  p_high_yield_summary text,
  p_tags text[],
  p_options jsonb,
  p_material_links jsonb default '[]'::jsonb
)
returns public.questions
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_admin_active(auth.uid()) then
    raise exception 'apenas administradores ativos podem importar questões';
  end if;
  return app.criar_questao_rascunho(
    p_id, p_discipline_id, p_theme_id, p_cycle, p_difficulty, p_institution, p_year,
    p_clinical_vignette, p_question_stem, p_general_commentary, p_high_yield_summary,
    p_tags, p_options, p_material_links
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Proveniência "revisado por IA" da questão e trava de publicação
-- ----------------------------------------------------------------------------

create table public.question_ai_provenance (
  question_id uuid primary key references public.questions(id) on delete cascade,
  submission_id uuid references public.question_submissions(id) on delete set null,
  review_id uuid references public.material_reviews(id) on delete set null,
  review_verdict text not null check (review_verdict = 'apto'),
  reviewed_at timestamptz,
  model text,
  -- SHA-256 (hex) do texto do lote que a IA revisou.
  text_sha256 text not null,
  -- SHA-256 (hex) da questão criada desse texto (app.build_question_snapshot).
  snapshot_hash text not null,
  created_at timestamptz not null default now()
);

comment on table public.question_ai_provenance is
  '44-H2: questão publicada pelo servidor por revisão de IA "apto" (texto revisado por hash e hash da questão criada). Escrita só pelo servidor.';

alter table public.question_ai_provenance enable row level security;
revoke all on table public.question_ai_provenance from anon, authenticated;
grant select on table public.question_ai_provenance to authenticated;
create policy question_ai_provenance_select_admin on public.question_ai_provenance
  for select to authenticated
  using (app.is_admin_active(auth.uid()));

-- Questões publicadas antes desta migration: a regra antiga (atestação humana do
-- conteúdo atual) vale para republicá-las, SÓ para o conteúdo que já estava no ar.
create table public.question_publicada_antes_44h2 (
  question_id uuid primary key references public.questions(id) on delete cascade,
  snapshot_hash text not null
);

comment on table public.question_publicada_antes_44h2 is
  '44-H2: questões publicadas antes da trava do revisor de IA, com o hash do conteúdo que estava no ar. Preenchida uma vez, na migration.';

alter table public.question_publicada_antes_44h2 enable row level security;
revoke all on table public.question_publicada_antes_44h2 from anon, authenticated;

insert into public.question_publicada_antes_44h2 (question_id, snapshot_hash)
select q.id, encode(extensions.digest(app.build_question_snapshot(q.id)::text, 'sha256'), 'hex')
from public.questions q where q.status = 'published';

create or replace function app.question_snapshot_hash(p_question_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(extensions.digest(app.build_question_snapshot(p_question_id)::text, 'sha256'), 'hex');
$$;

-- A questão tem revisão de IA "apto" vinculada ao conteúdo que está nela agora?
create or replace function app.questao_tem_revisao_apto(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.question_ai_provenance p
    where p.question_id = p_question_id
      and p.review_verdict = 'apto'
      and p.snapshot_hash = app.question_snapshot_hash(p_question_id)
      and (
        p.review_id is null
        or exists (
          select 1 from public.material_reviews r
          where r.id = p.review_id and r.status = 'concluida' and r.verdict = 'apto'
        )
      )
  );
$$;

revoke all on function app.question_snapshot_hash(uuid) from public, anon, authenticated;
revoke all on function app.questao_tem_revisao_apto(uuid) from public, anon, authenticated;

-- Igual à de 20260914120000 (as validações de conteúdo), com uma diferença: no lugar da
-- atestação humana, a questão precisa ter revisão de IA "apto" vinculada ao conteúdo atual.
-- Questão publicada antes da 44-H2 segue a regra antiga, mas só com o conteúdo que já estava no ar.
create or replace function public.publish_question(p_question_id uuid)
returns public.questions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_option_count int;
  v_option_key_count int;
  v_correct_count int;
  v_missing_explanations int;
  v_answer_key_count int;
  v_general_commentary text;
  v_high_yield_summary text;
  v_legacy_hash text;
  v_result public.questions;
begin
  if not app.is_admin_active(auth.uid()) then
    raise exception 'apenas administradores ativos podem publicar questões';
  end if;

  perform 1 from public.questions where id = p_question_id for update;
  if not found then
    raise exception 'questão não encontrada: %', p_question_id;
  end if;

  select count(*) into v_option_count
  from public.question_options where question_id = p_question_id;
  if v_option_count < 2 then
    raise exception 'questão precisa de ao menos 2 alternativas';
  end if;

  select count(*) into v_option_key_count
  from public.question_option_keys where question_id = p_question_id;
  if v_option_key_count <> v_option_count then
    raise exception 'question_option_keys incompleto: % opções, % keys encontradas', v_option_count, v_option_key_count;
  end if;

  select count(*) into v_correct_count
  from public.question_option_keys
  where question_id = p_question_id and is_correct = true;
  if v_correct_count <> 1 then
    raise exception 'questão precisa de exatamente 1 alternativa correta (encontradas: %)', v_correct_count;
  end if;

  select count(*) into v_missing_explanations
  from public.question_option_keys
  where question_id = p_question_id
    and (explanation is null or length(trim(explanation)) = 0);
  if v_missing_explanations > 0 then
    raise exception 'todas as alternativas precisam de explicação preenchida';
  end if;

  select count(*), max(general_commentary), max(high_yield_summary)
    into v_answer_key_count, v_general_commentary, v_high_yield_summary
  from public.question_answer_keys where question_id = p_question_id;
  if v_answer_key_count <> 1 then
    raise exception 'questão precisa de registro em question_answer_keys';
  end if;
  if v_general_commentary is null or length(trim(v_general_commentary)) = 0 then
    raise exception 'general_commentary não pode estar vazio';
  end if;
  if v_high_yield_summary is null or length(trim(v_high_yield_summary)) = 0 then
    raise exception 'high_yield_summary não pode estar vazio';
  end if;

  if not app.questao_tem_revisao_apto(p_question_id) then
    select l.snapshot_hash into v_legacy_hash
    from public.question_publicada_antes_44h2 l where l.question_id = p_question_id;
    if v_legacy_hash is null then
      raise exception 'publicação bloqueada: esta questão ainda não passou pelo revisor de IA. Para publicar questões novas, envie o arquivo em "Enviar material", na aba Questões: se o revisor aprovar, elas são publicadas sozinhas.';
    elsif v_legacy_hash is distinct from app.question_snapshot_hash(p_question_id) then
      raise exception 'publicação bloqueada: esta questão mudou depois de ir ao ar, e conteúdo novo precisa passar pelo revisor de IA. Envie o arquivo em "Enviar material", na aba Questões: se o revisor aprovar, ela é publicada sozinha.';
    elsif not app.has_current_approved_revision(null, p_question_id) then
      raise exception 'publicação bloqueada: esta questão já esteve no ar, mas não tem a revisão aprovada por uma pessoa para o conteúdo atual. Atualize a revisão e atestação antes de publicá-la de novo.';
    end if;
  end if;

  update public.questions set status = 'published'
  where id = p_question_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.publish_question(uuid) from public, anon;
grant execute on function public.publish_question(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Publicação pelo servidor (só service_role)
-- ----------------------------------------------------------------------------

-- Envios de questões "apto" cujo texto atual tem revisão "apto" e que ainda não foram publicados.
create or replace function public.revisao_envios_de_questoes_para_publicar(p_max int default 5)
returns table (
  submission_id uuid,
  review_id uuid,
  content_md text,
  content_sha256 text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, app.revisao_apto_do_envio_de_questoes(s.id), s.content_md, s.content_sha256
  from public.question_submissions s
  where s.status = 'apto'
    and cardinality(s.published_question_ids) = 0
    and app.revisao_apto_do_envio_de_questoes(s.id) is not null
  order by s.updated_at, s.id
  limit greatest(p_max, 0);
$$;

-- Cria as questões do envio, liga cada uma aos materiais, publica e grava a
-- proveniência, tudo ou nada. `p_questoes` é a leitura do texto feita pelo servidor
-- (o mesmo importador da tela): uma lista de questões com Disciplina, Tema (ids do
-- catálogo), campos, alternativas e os títulos dos materiais cobertos.
--
-- Devolve {resultado, question_ids?, motivo?}:
--   publicado     as questões foram criadas e publicadas agora;
--   ja_publicado  o envio já tinha questões (nada foi criado);
--   recusado      o envio foi a "nao_apto" com o motivo em `publication_note` (material
--                 que não existe, publicado duas vezes com o mesmo título ou fora do ar;
--                 questão que o banco não publicaria);
--   falhou        erro inesperado: o envio foi a "erro" (a pessoa pode tentar de novo)
--                 e nada ficou criado;
--   fora_de_estado, revisao_invalida  o envio não está pronto: nada foi feito.
create or replace function public.revisao_publicar_questoes(
  p_submission_id uuid,
  p_review_id uuid,
  p_content_sha256 text,
  p_questoes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.question_submissions;
  r public.material_reviews;
  v_q jsonb;
  v_opt jsonb;
  v_n int := 0;
  v_titles jsonb;
  v_title text;
  v_ids uuid[];
  v_found int;
  v_material uuid;
  v_links jsonb[] := '{}';
  v_motivo text;
  v_correct int;
  v_qid uuid;
  v_new_ids uuid[] := '{}';
  v_chosen uuid;
begin
  select * into s from public.question_submissions where id = p_submission_id for update;
  if not found then
    return jsonb_build_object('resultado', 'fora_de_estado');
  end if;
  if s.status = 'publicado' and cardinality(s.published_question_ids) > 0 then
    return jsonb_build_object('resultado', 'ja_publicado', 'question_ids', to_jsonb(s.published_question_ids));
  end if;
  if s.status <> 'apto' or cardinality(s.published_question_ids) > 0 then
    return jsonb_build_object('resultado', 'fora_de_estado');
  end if;

  if app.revisao_apto_do_envio_de_questoes(s.id) is distinct from p_review_id
     or s.content_sha256 is distinct from p_content_sha256 then
    return jsonb_build_object('resultado', 'revisao_invalida');
  end if;
  select * into r from public.material_reviews where id = p_review_id;

  if p_questoes is null or jsonb_typeof(p_questoes) <> 'array' or jsonb_array_length(p_questoes) = 0 then
    return jsonb_build_object('resultado', 'revisao_invalida');
  end if;

  -- Confere tudo ANTES de criar qualquer coisa: uma questão que o banco não publicaria,
  -- ou um material que não se acha, recusa o envio inteiro (nunca publica parcial).
  -- Os materiais escolhidos na tela valem para as questões que não citam título.
  foreach v_chosen in array s.material_ids loop
    if not exists (select 1 from public.materials m where m.id = v_chosen and m.status = 'published') then
      v_motivo := 'Um dos materiais que você escolheu para as questões não está mais publicado. Escolha outro e envie de novo.';
    end if;
  end loop;

  for v_q in select * from jsonb_array_elements(p_questoes) loop
    v_n := v_n + 1;
    exit when v_motivo is not null;

    select count(*) into v_correct
      from jsonb_array_elements(coalesce(v_q->'options', '[]'::jsonb)) o
     where coalesce((o->>'is_correct')::boolean, false);
    if jsonb_typeof(v_q->'options') is distinct from 'array' or jsonb_array_length(v_q->'options') < 2 or v_correct <> 1 then
      v_motivo := format('Questão %s: precisa de ao menos 2 alternativas e de exatamente 1 marcada com [GABARITO].', v_n);
    elsif exists (
      select 1 from jsonb_array_elements(v_q->'options') o
       where btrim(coalesce(o->>'explanation', '')) = '' or btrim(coalesce(o->>'text', '')) = ''
    ) then
      v_motivo := format('Questão %s: toda alternativa precisa de texto e de explicação.', v_n);
    elsif btrim(coalesce(v_q->>'question_stem', '')) = ''
       or btrim(coalesce(v_q->>'general_commentary', '')) = ''
       or btrim(coalesce(v_q->>'high_yield_summary', '')) = '' then
      v_motivo := format('Questão %s: comando, Comentário Geral e Pérola High-Yield são obrigatórios.', v_n);
    end if;
    exit when v_motivo is not null;

    -- Materiais da questão: os títulos do arquivo (título exato, um só material publicado)
    -- ou, sem título, os escolhidos na tela.
    v_titles := coalesce(v_q->'material_titles', '[]'::jsonb);
    v_ids := '{}';
    if jsonb_array_length(v_titles) = 0 then
      v_ids := s.material_ids;
      if cardinality(v_ids) = 0 then
        v_motivo := format('Questão %s: sem material. Escreva “Materiais cobertos” ou escolha o material no envio.', v_n);
      end if;
    else
      for v_title in select jsonb_array_elements_text(v_titles) loop
        select count(*), min(m.id::text)::uuid into v_found, v_material
          from public.materials m
         where m.status = 'published'
           and regexp_replace(btrim(m.title), '\s+', ' ', 'g') = regexp_replace(btrim(v_title), '\s+', ' ', 'g');
        if v_found = 0 then
          v_motivo := format('Questão %s: o material “%s” não existe ou não está publicado.', v_n, v_title);
        elsif v_found > 1 then
          v_motivo := format('Questão %s: o título “%s” pertence a mais de um material publicado; o NexusMed não sabe qual é. Escolha o material na tela de envio e tire o título do arquivo.', v_n, v_title);
        else
          v_ids := v_ids || v_material;
        end if;
        exit when v_motivo is not null;
      end loop;
    end if;
    exit when v_motivo is not null;
  end loop;

  if v_motivo is not null then
    update public.question_submissions
       set status = 'nao_apto', publication_note = v_motivo
     where id = s.id;
    return jsonb_build_object('resultado', 'recusado', 'motivo', v_motivo);
  end if;

  begin
    v_n := 0;
    for v_q in select * from jsonb_array_elements(p_questoes) loop
      v_n := v_n + 1;
      v_qid := gen_random_uuid();
      v_titles := coalesce(v_q->'material_titles', '[]'::jsonb);

      v_ids := '{}';
      if jsonb_array_length(v_titles) = 0 then
        v_ids := s.material_ids;
      else
        for v_title in select jsonb_array_elements_text(v_titles) loop
          select m.id into v_material from public.materials m
           where m.status = 'published'
             and regexp_replace(btrim(m.title), '\s+', ' ', 'g') = regexp_replace(btrim(v_title), '\s+', ' ', 'g');
          if not (v_material = any (v_ids)) then v_ids := v_ids || v_material; end if;
        end loop;
      end if;

      perform app.criar_questao_rascunho(
        v_qid,
        (v_q->>'discipline_id')::uuid,
        (v_q->>'theme_id')::uuid,
        coalesce(nullif(v_q->>'cycle', ''), 'internato_residencia'),
        coalesce(nullif(v_q->>'difficulty', ''), 'medio'),
        v_q->>'institution',
        nullif(v_q->>'year', '')::int,
        v_q->>'clinical_vignette',
        v_q->>'question_stem',
        v_q->>'general_commentary',
        v_q->>'high_yield_summary',
        coalesce((select array_agg(t.value) from jsonb_array_elements_text(coalesce(v_q->'tags', '[]'::jsonb)) t), '{}'),
        v_q->'options',
        coalesce((
          select jsonb_agg(jsonb_build_object('material_id', x.id) order by x.ord)
          from unnest(v_ids) with ordinality as x(id, ord)
        ), '[]'::jsonb)
      );

      -- A proveniência guarda o hash da questão COMO FOI CRIADA; a publicação vem depois,
      -- e as duas coisas juntas ou nenhuma.
      insert into public.question_ai_provenance
        (question_id, submission_id, review_id, review_verdict, reviewed_at, model, text_sha256, snapshot_hash)
      values
        (v_qid, s.id, r.id, 'apto', r.completed_at, r.model, s.content_sha256, app.question_snapshot_hash(v_qid));

      update public.questions set status = 'published' where id = v_qid;
      v_new_ids := v_new_ids || v_qid;
    end loop;

    update public.question_submissions
       set status = 'publicado', published_question_ids = v_new_ids, publication_note = null
     where id = s.id;
  exception when others then
    -- Tudo o que o bloco fez foi desfeito. O envio vai a "erro" (a pessoa pode tentar de
    -- novo: como o texto tem revisão "apto" válida, "Tentar de novo" volta o envio a
    -- "apto" e só a publicação é refeita) e o detalhe técnico fica só no log do banco.
    raise warning 'revisao_publicar_questoes % falhou: %', p_submission_id, sqlerrm;
    update public.question_submissions
       set status = 'erro',
           publication_note = 'Não conseguimos publicar as questões agora. Suas questões não foram rejeitadas; tente de novo.'
     where id = s.id;
    return jsonb_build_object('resultado', 'falhou');
  end;

  return jsonb_build_object('resultado', 'publicado', 'question_ids', to_jsonb(v_new_ids));
end;
$$;

-- O texto aprovado não pôde ser montado (problema do texto): sai da fila de publicação,
-- vai a "nao_apto" com o recado leigo.
create or replace function public.revisao_recusar_publicacao_de_questoes(
  p_submission_id uuid,
  p_review_id uuid,
  p_content_sha256 text,
  p_note text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.question_submissions;
begin
  select * into s from public.question_submissions where id = p_submission_id for update;
  if not found or s.status <> 'apto' or cardinality(s.published_question_ids) > 0
     or app.revisao_apto_do_envio_de_questoes(s.id) is distinct from p_review_id
     or s.content_sha256 is distinct from p_content_sha256 then
    return false;
  end if;
  update public.question_submissions
     set status = 'nao_apto', publication_note = left(coalesce(nullif(btrim(p_note), ''), 'O texto não pôde ser publicado.'), 1000)
   where id = s.id;
  return true;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.revisao_envios_de_questoes_para_publicar(int)',
    'public.revisao_publicar_questoes(uuid, uuid, text, jsonb)',
    'public.revisao_recusar_publicacao_de_questoes(uuid, uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Selo nas questões
-- ----------------------------------------------------------------------------

-- Uma consulta traz o selo de todas as questões publicadas com revisão de IA válida (a
-- lista de questões tem centenas de cartões: nada de uma consulta por cartão).
-- 'ia' = revisada só pela IA; 'ia_e_pessoa' = também atestada por uma pessoa.
create or replace function public.selos_de_questoes()
returns table (question_id uuid, selo text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or app.current_profile_status(v_uid) is distinct from 'active' then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  return query
    select q.id,
           case when app.has_current_approved_revision(null, q.id) then 'ia_e_pessoa' else 'ia' end
    from public.questions q
    join public.question_ai_provenance p on p.question_id = q.id
    where (q.status = 'published' or app.is_admin_active(v_uid))
      and app.questao_tem_revisao_apto(q.id);
end;
$$;

revoke all on function public.selos_de_questoes() from public, anon;
grant execute on function public.selos_de_questoes() to authenticated;

-- ----------------------------------------------------------------------------
-- 8. "Reportar erro" também na questão (mesma tabela e mesma aba da 44-G)
-- ----------------------------------------------------------------------------

alter table public.material_error_reports
  alter column material_id drop not null,
  add column question_id uuid references public.questions(id) on delete cascade,
  add constraint material_error_reports_one_target check (num_nonnulls(material_id, question_id) = 1);

create index material_error_reports_question_idx on public.material_error_reports (question_id, created_at desc);

grant insert (question_id) on table public.material_error_reports to authenticated;

drop policy material_error_reports_insert_own on public.material_error_reports;
create policy material_error_reports_insert_own on public.material_error_reports
  for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and status = 'aberto'
    and app.current_profile_status(auth.uid()) = 'active'
    and (
      (material_id is not null
        and exists (select 1 from public.materials m where m.id = material_id and m.status = 'published'))
      or (question_id is not null
        and exists (select 1 from public.questions q where q.id = question_id and q.status = 'published'))
    )
  );
