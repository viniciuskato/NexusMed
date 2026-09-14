-- ============================================================================
-- SynapseMed — Proveniência editorial e atestação humana (Prompt 23-B)
--
-- Fundação mínima: revisão imutável (snapshot + hash) de material/questão,
-- claims vinculados à revisão, fontes vinculadas a cada claim (N:N com papel
-- evidencial), e atestação humana append-only. publish_question/
-- publish_material só transicionam para 'published' quando o conteúdo ATUAL,
-- recomputado, tem o mesmo hash da última revisão aprovada.
--
-- Decisões da diretoria (23-A/23-B): `sources` continua catálogo canônico;
-- unidade publicável é material inteiro ou question, nunca material_section
-- isolada; autoatestação permitida na v1 (autor e revisor gravados em colunas
-- separadas, sem exigir pessoas distintas); identidade sempre server-side via
-- auth.uid() — nome digitado/checkbox não comprovam nada; legado publicado
-- antes desta migration fica "legacy_unmapped" (sem aprovação retroativa
-- fictícia); flashcards personalizados fora de escopo, derivados só herdam
-- proveniência da questão de origem (sem claims duplicados).
--
-- Cliente NUNCA insere diretamente em content_revisions/content_reviews (sem
-- GRANT de INSERT/UPDATE/DELETE para authenticated/anon) — a única via é
-- create_content_revision()/attest_content_revision(), SECURITY DEFINER,
-- rodando como owner da migration (bypassa RLS, mas não os GRANTs de tabela
-- nenhum cliente tem). snapshot/hash/created_by/reviewer_user_id/horário são
-- sempre computados dentro da função, nunca aceitos como parâmetro do
-- payload do cliente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) content_revisions — snapshot canônico imutável de material OU questão
-- ----------------------------------------------------------------------------

create table public.content_revisions (
  id uuid primary key default gen_random_uuid(),
  material_id uuid references public.materials(id) on delete cascade,
  question_id uuid references public.questions(id) on delete cascade,
  revision_number int not null,
  snapshot jsonb not null,
  snapshot_hash text not null,
  policy_version text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint content_revisions_target_xor check (num_nonnulls(material_id, question_id) = 1)
);

create unique index content_revisions_material_number_uq
  on public.content_revisions (material_id, revision_number)
  where material_id is not null;

create unique index content_revisions_question_number_uq
  on public.content_revisions (question_id, revision_number)
  where question_id is not null;

create index idx_content_revisions_material_id on public.content_revisions (material_id);
create index idx_content_revisions_question_id on public.content_revisions (question_id);

-- ----------------------------------------------------------------------------
-- 2) claims — afirmações extraídas de uma revisão específica
-- ----------------------------------------------------------------------------

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  content_revision_id uuid not null references public.content_revisions(id) on delete cascade,
  claim_text text not null,
  claim_kind text not null check (claim_kind in ('source_claim', 'synthesized_claim', 'inference')),
  -- Locação estável (ex.: 'section:<uuid>:paragraph:2', 'question_stem',
  -- 'option:B:explanation') — nunca um número visual/posição de tela, que
  -- muda a cada reordenação e não é identidade persistente.
  content_locator text not null,
  risk_category text check (risk_category in ('alto', 'medio', 'baixo')),
  requires_source boolean not null default false,
  decision text not null default 'pendente'
    check (decision in ('pendente', 'aprovado', 'requer_correcao_ou_fonte', 'inferencia_aceita')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_claims_content_revision_id on public.claims (content_revision_id);

-- ----------------------------------------------------------------------------
-- 3) claim_sources — N:N claim <-> sources, com papel evidencial
-- ----------------------------------------------------------------------------

create table public.claim_sources (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  source_id text not null references public.sources(id),
  -- Tipo primário/secundário continua em sources.tipo — esta relação só
  -- descreve COMO a fonte sustenta ESTE claim específico.
  evidence_relation text not null check (evidence_relation in ('supports', 'contextualizes', 'contradicts')),
  consultation_basis text not null check (consultation_basis in ('directly_consulted', 'indirectly_reported')),
  -- Página/seção/tabela/figura/trecho DENTRO da fonte, quando disponível.
  source_locator text,
  verified boolean not null default false,
  confidence text check (confidence in ('alta', 'media', 'baixa')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_claim_sources_claim_id on public.claim_sources (claim_id);
create index idx_claim_sources_source_id on public.claim_sources (source_id);

-- ----------------------------------------------------------------------------
-- 4) content_reviews — atestação humana, append-only
-- ----------------------------------------------------------------------------

create table public.content_reviews (
  id uuid primary key default gen_random_uuid(),
  content_revision_id uuid not null references public.content_revisions(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id),
  decision text not null check (decision in ('aprovado', 'rejeitado')),
  checklist jsonb not null default '{}'::jsonb,
  policy_version text not null,
  -- Hash da revisão no momento da atestação (redundante com
  -- content_revisions.snapshot_hash, mas persiste a prova mesmo se a leitura
  -- futura precisar comparar sem join).
  revision_hash text not null,
  created_at timestamptz not null default now()
);

-- Uma revisão só pode ser atestada uma vez (nunca reatestada/sobrescrita —
-- nova decisão exige nova revisão, ver create_content_revision()).
create unique index content_reviews_content_revision_uq on public.content_reviews (content_revision_id);

create index idx_content_reviews_content_revision_id on public.content_reviews (content_revision_id);

-- ----------------------------------------------------------------------------
-- 5) RLS + GRANTs
--
-- content_revisions/content_reviews: nenhum GRANT de INSERT/UPDATE/DELETE
-- para anon/authenticated — a única via de escrita é através das funções
-- SECURITY DEFINER abaixo (rodam como owner da migration, que não está sujeito
-- a esses GRANTs). SELECT liberado só para admin ativo via policy.
--
-- claims/claim_sources: GRANT completo para authenticated, mas RLS restringe
-- a admin ativo E um trigger bloqueia qualquer escrita depois que a revisão
-- já foi atestada (ver guard_claim_writes/guard_claim_sources_immutable
-- abaixo) — decided_by/decided_at nunca vêm do payload do cliente, são
-- sempre derivados de auth.uid()/horário do banco dentro do trigger.
-- ----------------------------------------------------------------------------

alter table public.content_revisions enable row level security;
alter table public.claims enable row level security;
alter table public.claim_sources enable row level security;
alter table public.content_reviews enable row level security;

create policy content_revisions_select_admin
  on public.content_revisions for select
  to authenticated
  using (app.is_admin_active(auth.uid()));

revoke all on public.content_revisions from anon, authenticated;
grant select on public.content_revisions to authenticated;

create policy claims_select_admin
  on public.claims for select
  to authenticated
  using (app.is_admin_active(auth.uid()));

create policy claims_admin_write
  on public.claims for all
  to authenticated
  using (app.is_admin_active(auth.uid()))
  with check (app.is_admin_active(auth.uid()));

grant select, insert, update, delete on public.claims to authenticated;
revoke all on public.claims from anon;

create policy claim_sources_select_admin
  on public.claim_sources for select
  to authenticated
  using (app.is_admin_active(auth.uid()));

create policy claim_sources_admin_write
  on public.claim_sources for all
  to authenticated
  using (app.is_admin_active(auth.uid()))
  with check (app.is_admin_active(auth.uid()));

grant select, insert, update, delete on public.claim_sources to authenticated;
revoke all on public.claim_sources from anon;

create policy content_reviews_select_admin
  on public.content_reviews for select
  to authenticated
  using (app.is_admin_active(auth.uid()));

revoke all on public.content_reviews from anon, authenticated;
grant select on public.content_reviews to authenticated;

-- ----------------------------------------------------------------------------
-- 6) Triggers de imutabilidade
--
-- content_revisions/content_reviews não têm nenhuma policy de UPDATE/DELETE
-- (só SELECT acima) e nenhum GRANT de escrita para authenticated/anon — isso
-- já basta para que nenhum CLIENTE (PostgREST sempre conecta como
-- anon/authenticated/service_role, nunca como 'postgres') consiga alterar ou
-- apagar uma revisão/atestação diretamente. Deliberadamente SEM um trigger
-- extra bloqueando incondicionalmente até para 'postgres': isso quebraria o
-- ON DELETE CASCADE legítimo de materials/questions -> content_revisions
-- quando um admin apaga um material/questão inteiro (deleteCompendium/
-- deleteQuestion) — achado real ao testar em navegador (23-B): a primeira
-- versão desta migration tinha esse bloqueio absoluto e o cascade de DELETE
-- FROM materials falhava. Ver "Não afirmar que RLS restringe service_role/
-- owner" nas restrições do prompt — o mesmo vale para um trigger que tenta
-- simular a mesma garantia absoluta.
-- ----------------------------------------------------------------------------

-- claims/claim_sources: escrita (INSERT/UPDATE, NUNCA DELETE — teria o mesmo
-- problema de cascade acima) bloqueada assim que a revisão a que pertencem
-- já foi atestada (existe linha em content_reviews) — impede alterar a
-- decisão/fonte de um claim depois que a atestação já se baseou nele.
-- Também deriva decided_by/decided_at de auth.uid()/horário do banco, nunca
-- do payload do cliente. DELETE passa sempre (cascade de material/questão
-- apagado inteiro remove claims/claim_sources junto, mesmo de uma revisão já
-- atestada — não é "alterar uma decisão", é o material deixar de existir).
create or replace function public.guard_claim_writes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_revision_id uuid := coalesce(new.content_revision_id, old.content_revision_id);
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  if exists (select 1 from public.content_reviews where content_revision_id = v_revision_id) then
    raise exception 'revisão % já foi atestada: claims não podem mais ser alterados', v_revision_id;
  end if;

  if tg_op = 'UPDATE' and new.decision is distinct from old.decision then
    new.decided_by := auth.uid();
    new.decided_at := pg_catalog.now();
  elsif tg_op = 'INSERT' and new.decision is distinct from 'pendente' then
    new.decided_by := auth.uid();
    new.decided_at := pg_catalog.now();
  end if;

  return new;
end;
$$;

create trigger trg_guard_claim_writes
  before insert or update or delete on public.claims
  for each row execute function public.guard_claim_writes();

create or replace function public.guard_claim_sources_immutable_after_review()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_claim_id uuid := coalesce(new.claim_id, old.claim_id);
  v_revision_id uuid;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  select content_revision_id into v_revision_id from public.claims where id = v_claim_id;
  if exists (select 1 from public.content_reviews where content_revision_id = v_revision_id) then
    raise exception 'revisão % já foi atestada: fontes de claim não podem mais ser alteradas', v_revision_id;
  end if;
  return new;
end;
$$;

create trigger trg_guard_claim_sources_immutable
  before insert or update or delete on public.claim_sources
  for each row execute function public.guard_claim_sources_immutable_after_review();

-- ----------------------------------------------------------------------------
-- 7) Bloqueio de publicação direta de materials (mesmo padrão de
--    guard_question_publish, ver rls_policies.sql) — a única via para
--    materials.status virar 'published' passa a ser publish_material().
-- ----------------------------------------------------------------------------

create or replace function public.guard_material_publish()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Diferente de guard_question_publish (que bloqueia INSERT já published
  -- incondicionalmente, sem exceção nem para 'postgres'), esta guarda libera
  -- 'postgres' também no INSERT: é o único jeito de carregar/rebootstrapar
  -- conteúdo LEGADO como "legacy_unmapped" (published, 0 content_revisions —
  -- decisão da diretoria: legado não ganha aprovação retroativa fictícia,
  -- mas também não pode ficar irrepresentável). PostgREST/supabase-js NUNCA
  -- conecta como 'postgres' (só 'anon'/'authenticated'/'service_role'), então
  -- nenhum cliente real — nem um admin autenticado — atravessa esta exceção.
  if tg_op = 'INSERT' then
    if new.status = 'published' and current_user <> 'postgres' then
      raise exception 'não é permitido inserir material já publicado; crie em draft e use publish_material()';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status = 'published'
       and old.status is distinct from 'published'
       and current_user <> 'postgres'
    then
      raise exception 'transição para published (inclusive a partir de archived) só é permitida via publish_material()';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_guard_material_publish
  before insert or update on public.materials
  for each row execute function public.guard_material_publish();

-- ----------------------------------------------------------------------------
-- 8) app.build_material_snapshot / app.build_question_snapshot
--
-- Formato determinístico: jsonb_build_object normaliza a ordem das chaves
-- internamente (armazenamento binário canônico do Postgres), então o mesmo
-- conteúdo sempre serializa para o mesmo texto/hash independente da ordem em
-- que os campos são escritos aqui. Arrays (seções/opções/referências) usam
-- `order by` explícito dentro do agregado para não depender da ordem física
-- das linhas.
-- ----------------------------------------------------------------------------

create or replace function app.build_material_snapshot(p_material_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'material', (
      select jsonb_build_object(
        'id', m.id, 'discipline_id', m.discipline_id, 'theme_id', m.theme_id,
        'title', m.title, 'subtitle', m.subtitle, 'mode', m.mode,
        'study_lens', m.study_lens, 'module_number', m.module_number,
        'estimated_read_time_minutes', m.estimated_read_time_minutes,
        'author', m.author, 'tags', m.tags, 'provenance', m.provenance,
        'source', m.source, 'license', m.license
      )
      from public.materials m where m.id = p_material_id
    ),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'sort_order', s.sort_order, 'title', s.title,
        'mechanism_tag', s.mechanism_tag, 'content', s.content,
        'key_takeaways', s.key_takeaways, 'clinical_pearl', s.clinical_pearl,
        'warning_alert', s.warning_alert
      ) order by s.sort_order)
      from public.material_sections s where s.material_id = p_material_id
    ), '[]'::jsonb),
    'references', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'sort_order', r.sort_order, 'citation_text', r.citation_text,
        'url', r.url, 'source_id', r.source_id
      ) order by r.sort_order)
      from public.material_references r where r.material_id = p_material_id
    ), '[]'::jsonb)
  );
$$;

revoke all on function app.build_material_snapshot(uuid) from public;
grant execute on function app.build_material_snapshot(uuid) to authenticated;

create or replace function app.build_question_snapshot(p_question_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'question', (
      select jsonb_build_object(
        'id', q.id, 'discipline_id', q.discipline_id, 'theme_id', q.theme_id,
        'material_id', q.material_id, 'material_section_id', q.material_section_id,
        'cycle', q.cycle, 'difficulty', q.difficulty, 'institution', q.institution,
        'year', q.year, 'clinical_vignette', q.clinical_vignette,
        'question_stem', q.question_stem, 'tags', q.tags,
        'provenance', q.provenance, 'source', q.source, 'license', q.license
      ) from public.questions q where q.id = p_question_id
    ),
    'options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'letter', o.letter, 'option_text', o.option_text,
        'sort_order', o.sort_order,
        'is_correct', k.is_correct, 'explanation', k.explanation
      ) order by o.sort_order)
      from public.question_options o
      join public.question_option_keys k on k.option_id = o.id
      where o.question_id = p_question_id
    ), '[]'::jsonb),
    'answer_key', (
      select jsonb_build_object(
        'general_commentary', a.general_commentary,
        'high_yield_summary', a.high_yield_summary
      ) from public.question_answer_keys a where a.question_id = p_question_id
    ),
    'references', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'source_id', r.source_id, 'sort_order', r.sort_order
      ) order by r.sort_order)
      from public.question_references r where r.question_id = p_question_id
    ), '[]'::jsonb)
  );
$$;

revoke all on function app.build_question_snapshot(uuid) from public;
grant execute on function app.build_question_snapshot(uuid) to authenticated;

-- app.has_current_approved_revision: compara o hash do conteúdo ATUAL
-- (recomputado agora) com o hash da última revisão aprovada (maior
-- revision_number com content_reviews.decision = 'aprovado'). Só um de
-- p_material_id/p_question_id deve vir preenchido.
create or replace function app.has_current_approved_revision(p_material_id uuid, p_question_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_current_hash text;
  v_approved_hash text;
begin
  if p_material_id is not null then
    v_current_hash := encode(extensions.digest(app.build_material_snapshot(p_material_id)::text, 'sha256'), 'hex');
  else
    v_current_hash := encode(extensions.digest(app.build_question_snapshot(p_question_id)::text, 'sha256'), 'hex');
  end if;

  select cr.snapshot_hash into v_approved_hash
  from public.content_revisions cr
  join public.content_reviews rv
    on rv.content_revision_id = cr.id and rv.decision = 'aprovado'
  where (p_material_id is not null and cr.material_id = p_material_id)
     or (p_question_id is not null and cr.question_id = p_question_id)
  order by cr.revision_number desc
  limit 1;

  return v_approved_hash is not null and v_approved_hash = v_current_hash;
end;
$$;

revoke all on function app.has_current_approved_revision(uuid, uuid) from public;
grant execute on function app.has_current_approved_revision(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 9) create_content_revision — única via de escrita em content_revisions.
--    Constrói o snapshot a partir do estado REAL do banco; o cliente só
--    informa QUAL material/questão, nunca o conteúdo/hash/autor.
-- ----------------------------------------------------------------------------

create or replace function public.create_content_revision(p_material_id uuid default null, p_question_id uuid default null)
returns public.content_revisions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb;
  v_hash text;
  v_next_number int;
  v_result public.content_revisions;
begin
  if not app.is_admin_active(auth.uid()) then
    raise exception 'apenas administradores ativos podem criar revisões';
  end if;
  if num_nonnulls(p_material_id, p_question_id) <> 1 then
    raise exception 'informe exatamente um de p_material_id ou p_question_id';
  end if;

  if p_material_id is not null then
    perform 1 from public.materials where id = p_material_id for update;
    if not found then
      raise exception 'material não encontrado: %', p_material_id;
    end if;
    v_snapshot := app.build_material_snapshot(p_material_id);
    select coalesce(max(revision_number), 0) + 1 into v_next_number
      from public.content_revisions where material_id = p_material_id;
  else
    perform 1 from public.questions where id = p_question_id for update;
    if not found then
      raise exception 'questão não encontrada: %', p_question_id;
    end if;
    v_snapshot := app.build_question_snapshot(p_question_id);
    select coalesce(max(revision_number), 0) + 1 into v_next_number
      from public.content_revisions where question_id = p_question_id;
  end if;

  v_hash := encode(extensions.digest(v_snapshot::text, 'sha256'), 'hex');

  insert into public.content_revisions
    (material_id, question_id, revision_number, snapshot, snapshot_hash, created_by, policy_version)
  values
    (p_material_id, p_question_id, v_next_number, v_snapshot, v_hash, auth.uid(), 'v1')
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.create_content_revision(uuid, uuid) from public, anon;
grant execute on function public.create_content_revision(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 10) attest_content_revision — única via de escrita em content_reviews.
--     Valida admin ativo, revisão existente e ainda não atestada, e (só
--     quando a decisão é 'aprovado') que todo claim da revisão já tem
--     decisão registrada e todo claim com requires_source=true tem ao menos
--     uma fonte vinculada.
-- ----------------------------------------------------------------------------

create or replace function public.attest_content_revision(
  p_content_revision_id uuid,
  p_decision text,
  p_checklist jsonb default '{}'::jsonb
)
returns public.content_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision public.content_revisions;
  v_pending_count int;
  v_missing_source_count int;
  v_result public.content_reviews;
begin
  if not app.is_admin_active(auth.uid()) then
    raise exception 'apenas administradores ativos podem atestar revisões';
  end if;
  if p_decision not in ('aprovado', 'rejeitado') then
    raise exception 'decisão inválida: %', p_decision;
  end if;

  select * into v_revision from public.content_revisions where id = p_content_revision_id;
  if v_revision.id is null then
    raise exception 'revisão não encontrada: %', p_content_revision_id;
  end if;

  if exists (select 1 from public.content_reviews where content_revision_id = p_content_revision_id) then
    raise exception 'revisão % já foi atestada', p_content_revision_id;
  end if;

  if p_decision = 'aprovado' then
    select count(*) into v_pending_count
      from public.claims
      where content_revision_id = p_content_revision_id and decision = 'pendente';
    if v_pending_count > 0 then
      raise exception 'existem % claim(s) sem decisão registrada', v_pending_count;
    end if;

    select count(*) into v_missing_source_count
      from public.claims c
      where c.content_revision_id = p_content_revision_id
        and c.requires_source = true
        and not exists (select 1 from public.claim_sources cs where cs.claim_id = c.id);
    if v_missing_source_count > 0 then
      raise exception 'existem % claim(s) que exigem fonte sem nenhuma fonte vinculada', v_missing_source_count;
    end if;
  end if;

  insert into public.content_reviews
    (content_revision_id, reviewer_user_id, decision, checklist, policy_version, revision_hash)
  values
    (p_content_revision_id, auth.uid(), p_decision, coalesce(p_checklist, '{}'::jsonb), 'v1', v_revision.snapshot_hash)
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.attest_content_revision(uuid, text, jsonb) from public, anon;
grant execute on function public.attest_content_revision(uuid, text, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- 11) get_provenance_status — rótulo de exibição para a Área Editorial:
--     'legacy_unmapped' | 'em_revisao' | 'aprovado_para_esta_versao' |
--     'aprovacao_desatualizada'.
-- ----------------------------------------------------------------------------

create or replace function public.get_provenance_status(p_material_id uuid default null, p_question_id uuid default null)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_has_any_revision boolean;
  v_is_published boolean;
  v_matches boolean;
  v_has_approved_history boolean;
begin
  if not app.is_admin_active(auth.uid()) then
    raise exception 'apenas administradores ativos podem consultar status de proveniência';
  end if;
  if num_nonnulls(p_material_id, p_question_id) <> 1 then
    raise exception 'informe exatamente um de p_material_id ou p_question_id';
  end if;

  select exists (
    select 1 from public.content_revisions
    where (p_material_id is not null and material_id = p_material_id)
       or (p_question_id is not null and question_id = p_question_id)
  ) into v_has_any_revision;

  if p_material_id is not null then
    select status = 'published' into v_is_published from public.materials where id = p_material_id;
  else
    select status = 'published' into v_is_published from public.questions where id = p_question_id;
  end if;

  if not v_has_any_revision then
    if v_is_published then
      return 'legacy_unmapped';
    else
      return 'em_revisao';
    end if;
  end if;

  v_matches := app.has_current_approved_revision(p_material_id, p_question_id);
  if v_matches then
    return 'aprovado_para_esta_versao';
  end if;

  select exists (
    select 1
    from public.content_revisions cr
    join public.content_reviews rv on rv.content_revision_id = cr.id and rv.decision = 'aprovado'
    where (p_material_id is not null and cr.material_id = p_material_id)
       or (p_question_id is not null and cr.question_id = p_question_id)
  ) into v_has_approved_history;

  if v_has_approved_history then
    return 'aprovacao_desatualizada';
  end if;

  return 'em_revisao';
end;
$$;

revoke all on function public.get_provenance_status(uuid, uuid) from public, anon;
grant execute on function public.get_provenance_status(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 12) publish_material — mesma garantia de publish_question: exige revisão
--     aprovada cujo hash recomputado do conteúdo atual bata.
-- ----------------------------------------------------------------------------

create or replace function public.publish_material(p_material_id uuid)
returns public.materials
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.materials;
begin
  if not app.is_admin_active(auth.uid()) then
    raise exception 'apenas administradores ativos podem publicar materiais';
  end if;

  perform 1 from public.materials where id = p_material_id for update;
  if not found then
    raise exception 'material não encontrado: %', p_material_id;
  end if;

  if not app.has_current_approved_revision(p_material_id, null) then
    raise exception 'publicação bloqueada: não há revisão aprovada cujo conteúdo atual recomputado bata com o hash aprovado';
  end if;

  update public.materials set status = 'published'
  where id = p_material_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.publish_material(uuid) from public, anon;
grant execute on function public.publish_material(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 13) publish_question — mesmas validações de conteúdo já existentes
--     (20260903120100_rls_policies.sql), com o novo gate de revisão aprovada
--     adicionado antes da transição final de status.
-- ----------------------------------------------------------------------------

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

  if not app.has_current_approved_revision(null, p_question_id) then
    raise exception 'publicação bloqueada: não há revisão aprovada cujo conteúdo atual recomputado bata com o hash aprovado';
  end if;

  update public.questions set status = 'published'
  where id = p_question_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.publish_question(uuid) from public, anon;
grant execute on function public.publish_question(uuid) to authenticated;
