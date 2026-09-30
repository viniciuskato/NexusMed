-- ============================================================================
-- 44-G — Publicar pelo veredito do revisor de IA
--
-- Decisão do dono (29/09): tudo que for publicado passa pelo revisor de IA e,
-- com o "apto", o material vai direto aos alunos, com o selo "revisado por IA"
-- e o botão "Reportar erro". A leitura/atestação humana deixa de ser exigida
-- para publicar, mas continua existindo: material atestado por uma pessoa ganha
-- um selo mais forte.
--
-- O que esta migration faz:
--   1. Publicação pelo servidor: `revisao_publicar_envio` (só service_role) cria
--      o material a partir do envio "apto", publica, marca o envio como
--      "publicado" e grava a proveniência "revisado por IA", tudo na mesma
--      transação. Idempotente: o envio é travado, e um envio já publicado não
--      cria segundo material.
--   2. Trava de publicação no banco: `publish_material` (a do admin) só publica
--      material com revisão "apto" vinculada ao conteúdo que vai ao ar. O que já
--      estava publicado antes desta migration não é afetado: continua no ar e,
--      se for despublicado e publicado de novo, vale a regra antiga (atestação
--      humana do conteúdo atual).
--   3. Selo no leitor: `selo_de_revisao` diz se o material foi revisado só pela
--      IA ou também por uma pessoa.
--   4. "Reportar erro": `material_error_reports` (RLS: insere só como si mesmo e
--      ativo, lê só os próprios; admin ativo lê todos e marca "resolvido" por
--      `resolver_erro_reportado`), com no máximo 20 reportes por pessoa por dia,
--      travado no banco.
--
-- Ligação da revisão ao conteúdo que vai ao ar: a revisão vale para o HASH DO
-- TEXTO enviado (44-F). A proveniência guarda também o hash do material criado
-- a partir desse texto (mesmo cálculo da atestação humana:
-- app.build_material_snapshot). Se o conteúdo do material mudar depois, o hash
-- deixa de bater e a revisão deixa de valer para ele.
--
-- AGENTS.md riscos 13 e 14: sem privilégio para anon nas tabelas novas; toda
-- função nova com revoke de public/anon (e de authenticated quando é do servidor).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Envio: vínculo com o material publicado e recado do servidor
-- ----------------------------------------------------------------------------

alter table public.material_submissions
  add column published_material_id uuid references public.materials(id) on delete set null,
  -- Por que o servidor não publicou (ex.: título repetido). Só o servidor escreve
  -- (sem privilégio de coluna para o cliente); some quando a pessoa reenvia.
  add column publication_note text;

create unique index material_submissions_published_material_uq
  on public.material_submissions (published_material_id)
  where published_material_id is not null;

comment on column public.material_submissions.published_material_id is
  '44-G: o material que o servidor criou e publicou a partir deste envio (estado "publicado").';

-- Mesmo gatilho da 44-F; a única diferença é limpar o recado do servidor quando a
-- pessoa substitui o texto (o recado era sobre o texto antigo).
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
      new.publication_note := null;
      new.published_material_id := old.published_material_id;
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
-- 1. Proveniência "revisado por IA"
-- ----------------------------------------------------------------------------

-- Uma linha por material publicado pelo servidor. Guarda o que basta para provar
-- a revisão sem depender do envio (se a pessoa for apagada, o envio e a revisão
-- saem em cascata, mas o selo do material continua).
create table public.material_ai_provenance (
  material_id uuid primary key references public.materials(id) on delete cascade,
  submission_id uuid references public.material_submissions(id) on delete set null,
  review_id uuid references public.material_reviews(id) on delete set null,
  review_verdict text not null check (review_verdict = 'apto'),
  reviewed_at timestamptz,
  model text,
  -- SHA-256 (hex) do texto que a IA revisou (o mesmo da revisão).
  text_sha256 text not null,
  -- SHA-256 (hex) do material criado desse texto (app.build_material_snapshot).
  snapshot_hash text not null,
  created_at timestamptz not null default now()
);

comment on table public.material_ai_provenance is
  '44-G: material publicado pelo servidor por revisão de IA "apto" (texto revisado por hash e hash do material criado). Escrita só pelo servidor.';

alter table public.material_ai_provenance enable row level security;
revoke all on table public.material_ai_provenance from anon, authenticated;
grant select on table public.material_ai_provenance to authenticated;

-- A tela do estudante lê o selo por `selo_de_revisao`; só admin lê a tabela.
create policy material_ai_provenance_select_admin on public.material_ai_provenance
  for select to authenticated
  using (app.is_admin_active(auth.uid()));

-- Materiais que já estavam publicados antes desta migration: a regra antiga
-- (atestação humana do conteúdo atual) continua valendo para republicá-los.
-- Ninguém do app escreve aqui; material novo nunca entra.
create table public.material_publicado_antes_44g (
  material_id uuid primary key references public.materials(id) on delete cascade
);

comment on table public.material_publicado_antes_44g is
  '44-G: materiais publicados antes da trava do revisor de IA. Preenchida uma vez, na migration.';

alter table public.material_publicado_antes_44g enable row level security;
revoke all on table public.material_publicado_antes_44g from anon, authenticated;

insert into public.material_publicado_antes_44g (material_id)
select id from public.materials where status = 'published';

-- ----------------------------------------------------------------------------
-- 2. Funções internas
-- ----------------------------------------------------------------------------

-- Hash do conteúdo do material (o mesmo que a atestação humana usa).
create or replace function app.material_snapshot_hash(p_material_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(extensions.digest(app.build_material_snapshot(p_material_id)::text, 'sha256'), 'hex');
$$;

-- O material tem revisão de IA "apto" vinculada ao conteúdo que está nele agora?
create or replace function app.material_tem_revisao_apto(p_material_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.material_ai_provenance p
    where p.material_id = p_material_id
      and p.review_verdict = 'apto'
      and p.snapshot_hash = app.material_snapshot_hash(p_material_id)
      -- Se a revisão ainda existe, ela tem de ser mesmo uma revisão "apto" concluída.
      and (
        p.review_id is null
        or exists (
          select 1 from public.material_reviews r
          where r.id = p.review_id and r.status = 'concluida' and r.verdict = 'apto'
        )
      )
  );
$$;

-- A revisão "apto" do TEXTO ATUAL do envio, ou nulo. Revisão "nao_apto", "erro"
-- ou de texto antigo não vale. (`revisao_valida_do_envio`, da 44-F, devolve a
-- revisão concluída de qualquer veredito.)
create or replace function app.revisao_apto_do_envio(p_submission uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id
  from public.material_reviews r
  where r.id = app.revisao_valida_do_envio(p_submission)
    and r.verdict = 'apto';
$$;

revoke all on function app.material_snapshot_hash(uuid) from public, anon, authenticated;
revoke all on function app.material_tem_revisao_apto(uuid) from public, anon, authenticated;
revoke all on function app.revisao_apto_do_envio(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Trava de publicação do admin
-- ----------------------------------------------------------------------------

-- Igual à de 20260923120000 (ordem de publicação, "Estude antes"), com uma
-- diferença: no lugar da atestação humana, o material precisa ter revisão de IA
-- "apto" vinculada ao conteúdo atual. Material publicado antes da 44-G continua
-- com a regra antiga.
create or replace function public.publish_material(p_material_id uuid)
returns public.materials
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.materials;
  v_blocker text;
begin
  if not app.is_admin_active(auth.uid()) then
    raise exception 'apenas administradores ativos podem publicar materiais';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(2026092201);
  perform 1 from public.materials where id = p_material_id for update;
  if not found then raise exception 'material não encontrado: %', p_material_id; end if;

  if not app.material_tem_revisao_apto(p_material_id) then
    if exists (select 1 from public.material_publicado_antes_44g where material_id = p_material_id) then
      if not app.has_current_approved_revision(p_material_id, null) then
        raise exception 'publicação bloqueada: este material já esteve no ar, mas mudou depois da última revisão aprovada por uma pessoa. Atualize a revisão e atestação antes de publicá-lo de novo.';
      end if;
    else
      raise exception 'publicação bloqueada: este material ainda não passou pelo revisor de IA. Para publicar algo novo, envie o texto em "Enviar material": se o revisor aprovar, ele é publicado sozinho.';
    end if;
  end if;

  select string_agg(format('"%s"', a.title), ' → ' order by a.depth desc) into v_blocker
  from app.material_ancestors(p_material_id) a
  where a.status <> 'published';
  if v_blocker is not null then
    raise exception 'publicação bloqueada: publique antes, nesta ordem, o que está acima na árvore: %', v_blocker;
  end if;

  select string_agg(format('"%s"', target.title), ', ' order by link.sort_order) into v_blocker
  from public.material_links link
  join public.materials target on target.id = link.target_material_id
  where link.source_material_id = p_material_id
    and link.link_type = 'prerequisite'
    and target.status <> 'published';
  if v_blocker is not null then
    raise exception 'publicação bloqueada: publique antes o que está em "Estude antes": %', v_blocker;
  end if;

  update public.materials set status = 'published'
  where id = p_material_id returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.publish_material(uuid) from public, anon;
grant execute on function public.publish_material(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Publicação pelo servidor (só service_role)
-- ----------------------------------------------------------------------------

-- Envios "apto" cujo texto atual tem revisão "apto" e que ainda não foram
-- publicados: o que a Edge Function converte em material.
create or replace function public.revisao_envios_para_publicar(p_max int default 5)
returns table (
  submission_id uuid,
  review_id uuid,
  content_md text,
  content_sha256 text,
  discipline_id uuid,
  theme_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, app.revisao_apto_do_envio(s.id), s.content_md, s.content_sha256, s.discipline_id, s.theme_id
  from public.material_submissions s
  where s.status = 'apto'
    and s.published_material_id is null
    and app.revisao_apto_do_envio(s.id) is not null
  order by s.updated_at, s.id
  limit greatest(p_max, 0);
$$;

-- Cria o material do envio e o publica, tudo ou nada. `p_material` é a leitura do
-- texto feita pelo servidor (o mesmo importador da tela): título, subtítulo, autor,
-- tempo de leitura, tags, seções e referências. Disciplina, Tema e material acima
-- vêm SEMPRE do envio, nunca do `p_material`.
--
-- Devolve {resultado, material_id?, motivo?}:
--   publicado     o material foi criado e publicado agora;
--   ja_publicado  o envio já tinha material (nada foi criado);
--   recusado      o envio foi a "nao_apto" com o motivo em `publication_note`
--                 (título repetido, material acima fora do ar ou de outro Tema);
--   falhou        erro inesperado: o envio foi a "erro" (a pessoa pode tentar de
--                 novo) e nada ficou criado;
--   fora_de_estado, revisao_invalida  o envio não está pronto: nada foi feito.
create or replace function public.revisao_publicar_envio(
  p_submission_id uuid,
  p_review_id uuid,
  p_content_sha256 text,
  p_material jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.material_submissions;
  r public.material_reviews;
  v_parent public.materials;
  v_title text;
  v_section jsonb;
  v_ref text;
  v_material_id uuid;
  v_idx int;
  v_order int;
  v_motivo text;
begin
  -- Trava do envio: duas publicações do mesmo envio ao mesmo tempo se serializam.
  select * into s from public.material_submissions where id = p_submission_id for update;
  if not found then
    return jsonb_build_object('resultado', 'fora_de_estado');
  end if;
  if s.status = 'publicado' and s.published_material_id is not null then
    return jsonb_build_object('resultado', 'ja_publicado', 'material_id', s.published_material_id);
  end if;
  if s.status <> 'apto' or s.published_material_id is not null then
    return jsonb_build_object('resultado', 'fora_de_estado');
  end if;

  -- A revisão "apto" tem de ser a do texto ATUAL do envio, e o servidor tem de
  -- ter lido esse mesmo texto.
  if app.revisao_apto_do_envio(s.id) is distinct from p_review_id
     or s.content_sha256 is distinct from p_content_sha256 then
    return jsonb_build_object('resultado', 'revisao_invalida');
  end if;
  select * into r from public.material_reviews where id = p_review_id;

  if p_material is null or jsonb_typeof(p_material) <> 'object'
     or jsonb_typeof(p_material->'sections') is distinct from 'array'
     or jsonb_array_length(p_material->'sections') = 0 then
    return jsonb_build_object('resultado', 'revisao_invalida');
  end if;
  v_title := btrim(coalesce(p_material->>'title', ''));
  if v_title = '' then
    return jsonb_build_object('resultado', 'revisao_invalida');
  end if;

  -- Recusas que a pessoa resolve corrigindo o envio.
  if exists (select 1 from public.materials m where lower(btrim(m.title)) = lower(v_title)) then
    v_motivo := format('Já existe um material com o título “%s”. Troque o título do arquivo e envie de novo.', v_title);
  elsif s.parent_material_id is not null then
    select * into v_parent from public.materials where id = s.parent_material_id;
    if not found or v_parent.status <> 'published' then
      v_motivo := 'O material que você escolheu como “material acima” não está mais publicado. Escolha outro, ou deixe em branco, e envie de novo.';
    elsif v_parent.discipline_id <> s.discipline_id or v_parent.theme_id <> s.theme_id then
      v_motivo := 'O material que você escolheu como “material acima” é de outra Disciplina ou de outro Tema. Escolha um do mesmo Tema, ou deixe em branco, e envie de novo.';
    end if;
  end if;
  if v_motivo is not null then
    update public.material_submissions
       set status = 'nao_apto', publication_note = v_motivo
     where id = s.id;
    return jsonb_build_object('resultado', 'recusado', 'motivo', v_motivo);
  end if;

  begin
    -- Última posição entre os irmãos.
    select coalesce(max(m.tree_sort_order) + 1, 0) into v_order
    from public.materials m
    where m.parent_material_id is not distinct from s.parent_material_id
      and m.discipline_id = s.discipline_id
      and m.theme_id = s.theme_id;

    insert into public.materials
      (discipline_id, theme_id, title, subtitle, author, estimated_read_time_minutes, tags,
       status, parent_material_id, tree_sort_order)
    values (
      s.discipline_id, s.theme_id, v_title,
      nullif(btrim(coalesce(p_material->>'subtitle', '')), ''),
      nullif(btrim(coalesce(p_material->>'author', '')), ''),
      nullif(p_material->>'estimated_read_time_minutes', '')::int,
      coalesce((select array_agg(t.value) from jsonb_array_elements_text(coalesce(p_material->'tags', '[]'::jsonb)) t), '{}'),
      'draft', s.parent_material_id, v_order
    )
    returning id into v_material_id;

    v_idx := 0;
    for v_section in select * from jsonb_array_elements(p_material->'sections') loop
      if btrim(coalesce(v_section->>'title', '')) = '' or btrim(coalesce(v_section->>'content', '')) = '' then
        raise exception 'seção % sem título ou sem conteúdo', v_idx + 1;
      end if;
      insert into public.material_sections
        (material_id, sort_order, title, mechanism_tag, content, key_takeaways, clinical_pearl, warning_alert)
      values (
        v_material_id, v_idx, btrim(v_section->>'title'),
        nullif(v_section->>'mechanism_tag', ''), v_section->>'content',
        coalesce((select array_agg(k.value) from jsonb_array_elements_text(coalesce(v_section->'key_takeaways', '[]'::jsonb)) k), '{}'),
        nullif(v_section->>'clinical_pearl', ''), nullif(v_section->>'warning_alert', '')
      );
      v_idx := v_idx + 1;
    end loop;

    v_idx := 0;
    for v_ref in select value from jsonb_array_elements_text(coalesce(p_material->'references', '[]'::jsonb)) loop
      insert into public.material_references (material_id, citation_text, sort_order)
      values (v_material_id, v_ref, v_idx);
      v_idx := v_idx + 1;
    end loop;

    -- A proveniência guarda o hash do material COMO FOI CRIADO; a publicação vem
    -- depois, e as duas coisas juntas ou nenhuma.
    insert into public.material_ai_provenance
      (material_id, submission_id, review_id, review_verdict, reviewed_at, model, text_sha256, snapshot_hash)
    values
      (v_material_id, s.id, r.id, 'apto', r.completed_at, r.model, s.content_sha256,
       app.material_snapshot_hash(v_material_id));

    update public.materials set status = 'published' where id = v_material_id;

    update public.material_submissions
       set status = 'publicado', published_material_id = v_material_id, publication_note = null
     where id = s.id;
  exception when others then
    -- Tudo o que o bloco fez foi desfeito. O envio vai a "erro" (a pessoa pode
    -- tentar de novo) e o detalhe técnico fica só no log do banco.
    raise warning 'revisao_publicar_envio % falhou: %', p_submission_id, sqlerrm;
    update public.material_submissions
       set status = 'erro',
           publication_note = 'Não conseguimos publicar o material agora. Seu material não foi rejeitado; tente de novo.'
     where id = s.id;
    return jsonb_build_object('resultado', 'falhou');
  end;

  return jsonb_build_object('resultado', 'publicado', 'material_id', v_material_id);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.revisao_envios_para_publicar(int)',
    'public.revisao_publicar_envio(uuid, uuid, text, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Selo no leitor
-- ----------------------------------------------------------------------------

-- 'ia'          revisado pela IA, ainda não lido por uma pessoa;
-- 'ia_e_pessoa' revisado pela IA e atestado por uma pessoa (fluxo de atestação);
-- nulo          material antigo, ou que mudou depois da revisão da IA: sem selo.
create or replace function public.selo_de_revisao(p_material_id uuid)
returns text
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
  if not app.can_read_material(v_uid, p_material_id) then
    return null;
  end if;
  if not app.material_tem_revisao_apto(p_material_id) then
    return null;
  end if;
  if app.has_current_approved_revision(p_material_id, null) then
    return 'ia_e_pessoa';
  end if;
  return 'ia';
end;
$$;

revoke all on function public.selo_de_revisao(uuid) from public, anon;
grant execute on function public.selo_de_revisao(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. "Reportar erro"
-- ----------------------------------------------------------------------------

create table public.material_error_reports (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  -- Nunca vem do cliente: sem privilégio de coluna para gravá-lo.
  reporter_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  description text not null,
  excerpt text,
  status text not null default 'aberto',
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint material_error_reports_description_check
    check (char_length(btrim(description)) >= 1 and char_length(description) <= 2000),
  constraint material_error_reports_excerpt_check
    check (excerpt is null or (char_length(btrim(excerpt)) >= 1 and char_length(excerpt) <= 2000)),
  constraint material_error_reports_status_check check (status in ('aberto', 'resolvido')),
  constraint material_error_reports_resolved_check
    check ((status = 'resolvido') = (resolved_at is not null))
);

comment on table public.material_error_reports is
  '44-G: erro reportado por um usuário ativo num material publicado. Autor e estado não são gravados pelo cliente; no máximo 20 por pessoa por dia.';

create index material_error_reports_material_idx on public.material_error_reports (material_id, created_at desc);
create index material_error_reports_status_idx on public.material_error_reports (status, created_at desc);
create index material_error_reports_reporter_idx on public.material_error_reports (reporter_id, created_at desc);

-- Limite diário por pessoa (dia de São Paulo), travado por pessoa: duas
-- gravações ao mesmo tempo não furam o limite. Vale para qualquer papel.
create or replace function app.limitar_reportes_de_erro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('material_error_reports:' || new.reporter_id::text));
  if (
    select count(*) from public.material_error_reports r
    where r.reporter_id = new.reporter_id and r.created_at >= app.review_day_start()
  ) >= 20 then
    raise exception 'Você já enviou 20 reportes de erro hoje. Tente de novo amanhã.'
      using errcode = 'P0001', hint = 'limite_reportes_por_dia';
  end if;
  return new;
end;
$$;

revoke all on function app.limitar_reportes_de_erro() from public, anon, authenticated;

create trigger trg_material_error_reports_limit
  before insert on public.material_error_reports
  for each row execute function app.limitar_reportes_de_erro();

alter table public.material_error_reports enable row level security;

revoke all on table public.material_error_reports from anon;
revoke all on table public.material_error_reports from authenticated;
grant select on table public.material_error_reports to authenticated;
-- Só o que a pessoa escolhe. Sem reporter_id, status nem datas: vêm do default ou do banco.
grant insert (material_id, description, excerpt) on table public.material_error_reports to authenticated;

create policy material_error_reports_insert_own on public.material_error_reports
  for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and status = 'aberto'
    and app.current_profile_status(auth.uid()) = 'active'
    and exists (select 1 from public.materials m where m.id = material_id and m.status = 'published')
  );

create policy material_error_reports_select_own on public.material_error_reports
  for select to authenticated
  using (reporter_id = auth.uid() and app.current_profile_status(auth.uid()) = 'active');

create policy material_error_reports_select_admin on public.material_error_reports
  for select to authenticated
  using (app.is_admin_active(auth.uid()));

-- Marcar como resolvido: só admin ativo, só por esta função (não há UPDATE para o cliente).
create or replace function public.resolver_erro_reportado(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_admin_active(auth.uid()) then
    raise exception 'apenas administradores ativos podem marcar um erro como resolvido';
  end if;
  update public.material_error_reports
     set status = 'resolvido', resolved_by = auth.uid(), resolved_at = now()
   where id = p_report_id and status = 'aberto';
  if not found then
    raise exception 'reporte de erro não encontrado ou já resolvido';
  end if;
end;
$$;

revoke all on function public.resolver_erro_reportado(uuid) from public, anon;
grant execute on function public.resolver_erro_reportado(uuid) to authenticated;
