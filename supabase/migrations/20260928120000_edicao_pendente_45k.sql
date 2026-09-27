-- ============================================================================
-- 45-K — Editar material publicado sem mudar o que o estudante lê (AUD-24, D-1)
--
-- Antes: salvar um material publicado mudava na hora o que o estudante lê,
-- sem revisão humana.
--
-- Depois:
-- 1. A edição de conteúdo de material publicado fica à parte, em
--    `material_pending_edits` (só admin lê). Nenhum caminho de leitura do
--    estudante — leitor, biblioteca, árvore, "Aprofunde-se", busca — muda:
--    todos continuam lendo as tabelas atestadas.
-- 2. `save_compendium` decide pelo hash de atestação. Ele simula a gravação
--    num bloco que é desfeito, calcula o snapshot que ela produziria e
--    compara com o atual:
--    - igual (salvar sem mudança, ou só posição na árvore/ligações): grava
--      direto, como antes — "Salvar" sem mudança continua no-op;
--    - diferente, material publicado: guarda a carga e o snapshot à parte e
--      aplica na hora só o que fica fora do hash (pai, posição, tipo do nó,
--      ligações);
--    - material não publicado: grava direto, como antes.
--    Devolve 'aplicado' ou 'pendente' (antes: void).
-- 3. A revisão de um material com edição pendente atesta o snapshot da
--    edição. Aprovar (gatilho em content_reviews, qualquer que seja o
--    caminho) aplica a edição na mesma transação e confere que o hash
--    resultante é o aprovado — senão desfaz tudo. O estudante nunca lê algo
--    não atestado.
-- 4. `discard_material_pending_edit` descarta a edição sem mudar nada.
--
-- Referências novas recebem o id já na edição pendente, para o snapshot
-- atestado ser o mesmo do material depois que ela entra. Seções mantêm o id
-- (o formulário manda o id). O snapshot do material (build_material_snapshot)
-- não muda: nenhum hash já aprovado muda.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabela
-- ----------------------------------------------------------------------------

create table public.material_pending_edits (
  material_id uuid primary key references public.materials(id) on delete cascade,
  payload jsonb not null,
  snapshot jsonb not null,
  snapshot_hash text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.material_pending_edits is
  '45-K: edição de material publicado aguardando atestação. Só admin lê; o estudante lê sempre as tabelas atestadas.';

alter table public.material_pending_edits enable row level security;
revoke all on table public.material_pending_edits from anon;
revoke insert, update, delete, truncate on table public.material_pending_edits from authenticated;
grant select on table public.material_pending_edits to authenticated;

create policy material_pending_edits_admin_select on public.material_pending_edits
  for select to authenticated
  using (app.is_admin_active(auth.uid()));

-- ----------------------------------------------------------------------------
-- 2. Gravação do material (corpo de save_compendium de 20260923120000)
-- ----------------------------------------------------------------------------

-- Mesmo corpo de antes, sem a checagem de admin (quem chama confere), e com
-- um acréscimo: referência que traz `id` usa esse id (edição pendente
-- aprovada). Sem `id`, casa por texto idêntico, como antes.
create or replace function app.apply_compendium(
  p_material jsonb,
  p_sections jsonb,
  p_references jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_material->>'id', '')::uuid;
  v_title text := trim(coalesce(p_material->>'title', ''));
  v_section jsonb;
  v_section_ids uuid[] := '{}';
  v_section_id uuid;
  v_ref record;
  v_ref_id uuid;
  v_ref_text text;
  v_kept_ref_ids uuid[] := '{}';
  v_idx int := 0;
begin
  if v_id is null then raise exception 'id do material é obrigatório'; end if;
  if v_title = '' then raise exception 'título é obrigatório'; end if;
  if p_sections is null or jsonb_typeof(p_sections) <> 'array' then
    raise exception 'seções devem ser uma lista';
  end if;
  if p_references is not null and jsonb_typeof(p_references) <> 'array' then
    raise exception 'referências devem ser uma lista';
  end if;
  if p_material ? 'navigation_links'
     and jsonb_typeof(p_material->'navigation_links') <> 'array' then
    raise exception 'navigation_links deve ser uma lista';
  end if;

  for v_section in select * from jsonb_array_elements(p_sections) loop
    v_section_id := nullif(v_section->>'id', '')::uuid;
    if v_section_id is null then raise exception 'seção % sem id válido', v_idx + 1; end if;
    if trim(coalesce(v_section->>'title', '')) = '' then raise exception 'seção % sem título', v_idx + 1; end if;
    if v_section_id = any(v_section_ids) then raise exception 'seção % com id repetido', v_idx + 1; end if;
    v_section_ids := v_section_ids || v_section_id;
    v_idx := v_idx + 1;
  end loop;

  perform 1 from public.material_sections
  where id = any(v_section_ids) and material_id <> v_id;
  if found then raise exception 'seção informada pertence a outro material'; end if;

  insert into public.materials
    (id, discipline_id, theme_id, title, subtitle, mode, study_lens, module_number,
     estimated_read_time_minutes, author, tags, parent_material_id, tree_sort_order,
     nav_short_title, taxonomy_kind)
  values (
    v_id, (p_material->>'discipline_id')::uuid, (p_material->>'theme_id')::uuid,
    v_title, nullif(trim(coalesce(p_material->>'subtitle', '')), ''),
    nullif(p_material->>'mode', ''), nullif(p_material->>'study_lens', ''),
    (p_material->>'module_number')::int,
    (p_material->>'estimated_read_time_minutes')::int,
    nullif(trim(coalesce(p_material->>'author', '')), ''),
    coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(p_material->'tags', '[]'::jsonb))), '{}'),
    case when p_material ? 'parent_material_id' then nullif(p_material->>'parent_material_id', '')::uuid else null end,
    case when p_material ? 'tree_sort_order' then (p_material->>'tree_sort_order')::int else 0 end,
    nullif(trim(coalesce(p_material->>'nav_short_title', '')), ''),
    nullif(p_material->>'taxonomy_kind', '')
  )
  on conflict (id) do update set
    discipline_id = excluded.discipline_id, theme_id = excluded.theme_id,
    title = excluded.title, subtitle = excluded.subtitle, mode = excluded.mode,
    study_lens = excluded.study_lens, module_number = excluded.module_number,
    estimated_read_time_minutes = excluded.estimated_read_time_minutes,
    author = excluded.author, tags = excluded.tags,
    parent_material_id = case when p_material ? 'parent_material_id'
      then excluded.parent_material_id else materials.parent_material_id end,
    tree_sort_order = case when p_material ? 'tree_sort_order'
      then excluded.tree_sort_order else materials.tree_sort_order end,
    nav_short_title = case when p_material ? 'nav_short_title'
      then excluded.nav_short_title else materials.nav_short_title end,
    taxonomy_kind = case when p_material ? 'taxonomy_kind'
      then excluded.taxonomy_kind else materials.taxonomy_kind end;

  delete from public.material_sections
  where material_id = v_id and not (id = any(v_section_ids));
  update public.material_sections set sort_order = sort_order + 1000000 where material_id = v_id;

  v_idx := 0;
  for v_section in select * from jsonb_array_elements(p_sections) loop
    insert into public.material_sections
      (id, material_id, sort_order, title, mechanism_tag, content, key_takeaways, clinical_pearl, warning_alert)
    values (
      (v_section->>'id')::uuid, v_id, v_idx, trim(v_section->>'title'),
      nullif(v_section->>'mechanism_tag', ''), coalesce(v_section->>'content', ''),
      coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(v_section->'key_takeaways', '[]'::jsonb))), '{}'),
      nullif(v_section->>'clinical_pearl', ''), nullif(v_section->>'warning_alert', '')
    )
    on conflict (id) do update set
      sort_order = excluded.sort_order, title = excluded.title,
      mechanism_tag = excluded.mechanism_tag, content = excluded.content,
      key_takeaways = excluded.key_takeaways, clinical_pearl = excluded.clinical_pearl,
      warning_alert = excluded.warning_alert, updated_at = pg_catalog.now();
    v_idx := v_idx + 1;
  end loop;

  -- Referências: id explícito (edição pendente) ou casamento por texto
  -- idêntico, preservando id e vínculo com fonte curada.
  for v_ref in
    select r.value, (r.ord - 1)::int as pos
    from jsonb_array_elements(coalesce(p_references, '[]'::jsonb)) with ordinality as r(value, ord)
  loop
    v_ref_text := v_ref.value->>'citation_text';
    v_ref_id := nullif(v_ref.value->>'id', '')::uuid;

    if v_ref_id is not null then
      if exists (select 1 from public.material_references where id = v_ref_id and material_id = v_id) then
        update public.material_references set sort_order = v_ref.pos where id = v_ref_id;
      else
        insert into public.material_references (id, material_id, citation_text, sort_order, source_id, url)
        values (v_ref_id, v_id, v_ref_text, v_ref.pos,
                nullif(v_ref.value->>'source_id', ''), nullif(v_ref.value->>'url', ''));
      end if;
    else
      select existing.id into v_ref_id
      from public.material_references existing
      where existing.material_id = v_id
        and existing.citation_text = v_ref_text
        and not (existing.id = any(v_kept_ref_ids))
      order by existing.sort_order, existing.id
      limit 1;

      if v_ref_id is not null then
        update public.material_references set sort_order = v_ref.pos where id = v_ref_id;
      else
        insert into public.material_references (material_id, citation_text, sort_order, source_id, url)
        values (v_id, v_ref_text, v_ref.pos,
                nullif(v_ref.value->>'source_id', ''), nullif(v_ref.value->>'url', ''))
        returning id into v_ref_id;
      end if;
    end if;
    v_kept_ref_ids := v_kept_ref_ids || v_ref_id;
    v_ref_id := null;
  end loop;

  delete from public.material_references
  where material_id = v_id and not (id = any(v_kept_ref_ids));

  if p_material ? 'navigation_links' then
    perform app.replace_material_links(v_id, p_material->'navigation_links');
  end if;
end;
$$;

revoke all on function app.apply_compendium(jsonb, jsonb, jsonb) from public, anon, authenticated;

-- Dá id a cada referência da carga: o da referência existente de texto
-- idêntico (mesma regra de apply_compendium) ou um novo. Assim o snapshot
-- calculado agora é o mesmo que a aplicação produzirá depois.
create or replace function app.resolve_reference_ids(p_material_id uuid, p_references jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ref jsonb;
  v_id uuid;
  v_used uuid[] := '{}';
  v_out jsonb := '[]'::jsonb;
begin
  for v_ref in select * from jsonb_array_elements(coalesce(p_references, '[]'::jsonb)) loop
    v_id := nullif(v_ref->>'id', '')::uuid;
    if v_id is null then
      select existing.id into v_id
      from public.material_references existing
      where existing.material_id = p_material_id
        and existing.citation_text = v_ref->>'citation_text'
        and not (existing.id = any(v_used))
      order by existing.sort_order, existing.id
      limit 1;
    end if;
    if v_id is null then
      v_id := gen_random_uuid();
    end if;
    v_used := v_used || v_id;
    v_out := v_out || jsonb_build_array(v_ref || jsonb_build_object('id', v_id));
  end loop;
  return v_out;
end;
$$;

revoke all on function app.resolve_reference_ids(uuid, jsonb) from public, anon, authenticated;

-- Snapshot que a carga produziria, sem gravar nada: aplica num bloco que é
-- desfeito ao fim (as variáveis PL/pgSQL sobrevivem ao desfazer).
create or replace function app.simulate_compendium_snapshot(
  p_material jsonb,
  p_sections jsonb,
  p_references jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb;
begin
  begin
    perform app.apply_compendium(p_material, p_sections, p_references);
    v_snapshot := app.build_material_snapshot(nullif(p_material->>'id', '')::uuid);
    raise exception using errcode = 'NX45K', message = 'simulação desfeita';
  exception when sqlstate 'NX45K' then
    null;
  end;
  return v_snapshot;
end;
$$;

revoke all on function app.simulate_compendium_snapshot(jsonb, jsonb, jsonb) from public, anon, authenticated;

-- O que fica fora do hash vale na hora, mesmo com o conteúdo à parte.
create or replace function app.apply_compendium_structure(p_material jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_material->>'id', '')::uuid;
begin
  update public.materials m set
    parent_material_id = case when p_material ? 'parent_material_id'
      then nullif(p_material->>'parent_material_id', '')::uuid else m.parent_material_id end,
    tree_sort_order = case when p_material ? 'tree_sort_order'
      then (p_material->>'tree_sort_order')::int else m.tree_sort_order end,
    taxonomy_kind = case when p_material ? 'taxonomy_kind'
      then nullif(p_material->>'taxonomy_kind', '') else m.taxonomy_kind end
  where m.id = v_id;
  if p_material ? 'navigation_links' then
    perform app.replace_material_links(v_id, p_material->'navigation_links');
  end if;
end;
$$;

revoke all on function app.apply_compendium_structure(jsonb) from public, anon, authenticated;

-- Assinatura igual; o retorno muda de void para text ('aplicado' | 'pendente').
drop function public.save_compendium(jsonb, jsonb, jsonb);

create function public.save_compendium(
  p_material jsonb,
  p_sections jsonb,
  p_references jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_material->>'id', '')::uuid;
  v_status text;
  v_references jsonb;
  v_current_hash text;
  v_new_snapshot jsonb;
  v_new_hash text;
begin
  if not app.is_admin_active(auth.uid()) then
    raise exception 'apenas administradores ativos podem salvar materiais';
  end if;
  if v_id is null then raise exception 'id do material é obrigatório'; end if;

  select status into v_status from public.materials where id = v_id for update;

  -- Material novo ou não publicado: grava direto, como sempre. Uma edição
  -- pendente que tenha sobrado (material despublicado) deixa de valer.
  if v_status is distinct from 'published' then
    perform app.apply_compendium(p_material, p_sections, p_references);
    delete from public.material_pending_edits where material_id = v_id;
    return 'aplicado';
  end if;

  v_references := app.resolve_reference_ids(v_id, p_references);
  v_current_hash := encode(extensions.digest(app.build_material_snapshot(v_id)::text, 'sha256'), 'hex');
  v_new_snapshot := app.simulate_compendium_snapshot(p_material, p_sections, v_references);
  v_new_hash := encode(extensions.digest(v_new_snapshot::text, 'sha256'), 'hex');

  -- Conteúdo igual ao atestado: grava direto (só estrutura, ou nada) e
  -- desfaz uma edição pendente que existisse — a volta ao atestado.
  if v_new_hash = v_current_hash then
    perform app.apply_compendium(p_material, p_sections, p_references);
    delete from public.material_pending_edits where material_id = v_id;
    return 'aplicado';
  end if;

  perform app.apply_compendium_structure(p_material);

  -- Mesma edição pendente de antes: nada a mudar ("Salvar" sem mudança).
  if exists (select 1 from public.material_pending_edits where material_id = v_id and snapshot_hash = v_new_hash) then
    return 'pendente';
  end if;

  insert into public.material_pending_edits (material_id, payload, snapshot, snapshot_hash, created_by)
  values (
    v_id,
    jsonb_build_object('material', p_material, 'sections', p_sections, 'references', v_references),
    v_new_snapshot, v_new_hash, auth.uid()
  )
  on conflict (material_id) do update set
    payload = excluded.payload, snapshot = excluded.snapshot, snapshot_hash = excluded.snapshot_hash,
    created_by = excluded.created_by, updated_at = pg_catalog.now();
  return 'pendente';
end;
$$;

revoke all on function public.save_compendium(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_compendium(jsonb, jsonb, jsonb) to authenticated;

create or replace function public.discard_material_pending_edit(p_material_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_admin_active(auth.uid()) then
    raise exception 'apenas administradores ativos podem descartar edição pendente';
  end if;
  delete from public.material_pending_edits where material_id = p_material_id;
end;
$$;

revoke all on function public.discard_material_pending_edit(uuid) from public, anon;
grant execute on function public.discard_material_pending_edit(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Revisão e aprovação
-- ----------------------------------------------------------------------------

-- Mesma função de 20260914120000; com edição pendente, a revisão atesta o
-- snapshot dela (o que vai entrar), não o das tabelas (o que já está no ar).
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
    select snapshot into v_snapshot from public.material_pending_edits where material_id = p_material_id;
    if v_snapshot is null then
      v_snapshot := app.build_material_snapshot(p_material_id);
    end if;
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

-- Aprovar a revisão da edição pendente faz a edição entrar, na mesma
-- transação da aprovação; se o hash resultante não for o aprovado (algo
-- mudou no meio), nada fica gravado.
create or replace function app.apply_pending_edit_on_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision public.content_revisions;
  v_pending public.material_pending_edits;
  v_after text;
begin
  if new.decision <> 'aprovado' then
    return new;
  end if;
  select * into v_revision from public.content_revisions where id = new.content_revision_id;
  if v_revision.material_id is null then
    return new;
  end if;
  select * into v_pending from public.material_pending_edits
  where material_id = v_revision.material_id for update;
  if v_pending.material_id is null or v_pending.snapshot_hash <> v_revision.snapshot_hash then
    return new;
  end if;

  perform app.apply_compendium(
    v_pending.payload->'material', v_pending.payload->'sections', v_pending.payload->'references'
  );
  v_after := encode(extensions.digest(app.build_material_snapshot(v_revision.material_id)::text, 'sha256'), 'hex');
  if v_after <> v_revision.snapshot_hash then
    raise exception 'a edição pendente não produziu o conteúdo aprovado (o material mudou depois da revisão). Salve a edição de novo e crie outra revisão.';
  end if;
  delete from public.material_pending_edits where material_id = v_revision.material_id;
  return new;
end;
$$;

revoke all on function app.apply_pending_edit_on_approval() from public, anon, authenticated;

create trigger trg_apply_pending_edit_on_approval
  after insert on public.content_reviews
  for each row execute function app.apply_pending_edit_on_approval();

-- Mesma função de 20260914120000, com os dois estados da edição pendente:
-- 'edicao_pendente' (ainda sem revisão dela) e 'edicao_pendente_em_revisao'
-- (a revisão mais recente é a da edição, ainda não atestada).
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
  v_pending_hash text;
begin
  if not app.is_admin_active(auth.uid()) then
    raise exception 'apenas administradores ativos podem consultar status de proveniência';
  end if;
  if num_nonnulls(p_material_id, p_question_id) <> 1 then
    raise exception 'informe exatamente um de p_material_id ou p_question_id';
  end if;

  if p_material_id is not null then
    select snapshot_hash into v_pending_hash from public.material_pending_edits where material_id = p_material_id;
    if v_pending_hash is not null then
      if exists (select 1 from public.content_revisions
                 where material_id = p_material_id and snapshot_hash = v_pending_hash) then
        return 'edicao_pendente_em_revisao';
      end if;
      return 'edicao_pendente';
    end if;
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
-- 4. Nenhum outro caminho muda o conteúdo publicado
-- ----------------------------------------------------------------------------
-- Além do formulário, o editor de seção (piloto do CMS) gravava direto em
-- material_sections, e UPDATE direto em materials também passava: em
-- material publicado, isso ia ao ar sem revisão. Só as funções de gravação
-- (que rodam como o dono, `postgres`) e a manutenção passam.
create or replace function public.guard_published_material_content()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_material_id uuid;
begin
  if current_user = 'postgres' then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'materials' then
    if old.status = 'published' and new.status = 'published' and (
         new.title is distinct from old.title or new.subtitle is distinct from old.subtitle
      or new.discipline_id is distinct from old.discipline_id or new.theme_id is distinct from old.theme_id
      or new.mode is distinct from old.mode or new.study_lens is distinct from old.study_lens
      or new.module_number is distinct from old.module_number
      or new.estimated_read_time_minutes is distinct from old.estimated_read_time_minutes
      or new.author is distinct from old.author or new.tags is distinct from old.tags
      or new.provenance is distinct from old.provenance or new.source is distinct from old.source
      or new.license is distinct from old.license or new.nav_short_title is distinct from old.nav_short_title) then
      raise exception 'material publicado não muda direto: salve pelo formulário do material — a edição fica pendente até ser atestada';
    end if;
    return new;
  end if;

  v_material_id := coalesce(new.material_id, old.material_id);
  if exists (select 1 from public.materials where id = v_material_id and status = 'published') then
    raise exception 'seção de material publicado não muda direto: salve pelo formulário do material — a edição fica pendente até ser atestada';
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.guard_published_material_content() from public, anon;

create trigger trg_guard_published_material_content
  before update on public.materials
  for each row execute function public.guard_published_material_content();

create trigger trg_guard_published_section_content
  before insert or update or delete on public.material_sections
  for each row execute function public.guard_published_material_content();
