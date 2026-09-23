-- ============================================================================
-- Hierarquia e ligações entre materiais (taxonomia editorial)
-- ============================================================================
-- Um material pode ter um único pai. Ligações transversais são de dois tipos:
--   prerequisite: source_material_id exige target_material_id antes do estudo;
--   related: relação simétrica, armazenada uma única vez em ordem canônica.
-- ============================================================================

alter table public.materials
  add column parent_material_id uuid references public.materials(id) on delete restrict,
  add column tree_sort_order int not null default 0,
  add constraint materials_parent_not_self check (parent_material_id is null or parent_material_id <> id),
  add constraint materials_tree_sort_order_nonnegative check (tree_sort_order >= 0);

create index idx_materials_parent_sort
  on public.materials (parent_material_id, tree_sort_order, title);

alter table public.material_dependencies rename to material_links;
alter table public.material_links rename column material_id to source_material_id;
alter table public.material_links rename column depends_on_material_id to target_material_id;
alter table public.material_links
  add column link_type text not null default 'prerequisite',
  add column sort_order int not null default 0,
  add constraint material_links_type_check check (link_type in ('prerequisite', 'related')),
  add constraint material_links_sort_order_nonnegative check (sort_order >= 0);

alter table public.material_links
  drop constraint material_dependencies_material_id_fkey,
  drop constraint material_dependencies_depends_on_material_id_fkey,
  add constraint material_links_source_fkey
    foreign key (source_material_id) references public.materials(id) on delete cascade,
  add constraint material_links_target_fkey
    foreign key (target_material_id) references public.materials(id) on delete restrict;

alter index public.idx_material_dependencies_material_id rename to idx_material_links_source;
alter index public.idx_material_dependencies_depends_on rename to idx_material_links_target;

-- A constraint antiga cobria o mesmo par sem tipo. A nova permite, por
-- exemplo, que uma relação related substitua explicitamente um prerequisite.
alter table public.material_links
  drop constraint material_dependencies_material_id_depends_on_material_id_key;

create unique index material_links_direction_unique
  on public.material_links (source_material_id, target_material_id, link_type);

drop policy material_dependencies_select_published on public.material_links;
drop policy material_dependencies_admin_write on public.material_links;

create policy material_links_select_published
  on public.material_links for select
  to authenticated
  using (
    app.is_admin_active(auth.uid())
    or (
      app.current_profile_status(auth.uid()) = 'active'
      and exists (
        select 1 from public.materials source
        where source.id = source_material_id and source.status = 'published'
      )
      and exists (
        select 1 from public.materials target
        where target.id = target_material_id and target.status = 'published'
      )
    )
  );

revoke all on table public.material_links from anon;
revoke insert, update, delete on table public.material_links from authenticated;
grant select on public.material_links to authenticated;
grant all on public.material_links to service_role;

-- Serializa alterações da árvore para impedir que duas transações concorrentes
-- criem um ciclo que nenhuma delas enxergaria isoladamente.
create or replace function public.validate_material_hierarchy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent public.materials;
begin
  perform pg_catalog.pg_advisory_xact_lock(2026092201);

  if current_user <> 'postgres' and (
    new.parent_material_id is distinct from case when tg_op = 'UPDATE' then old.parent_material_id else null end
    or new.tree_sort_order is distinct from case when tg_op = 'UPDATE' then old.tree_sort_order else 0 end
  ) then
    raise exception 'posição na árvore só pode ser alterada via save_compendium()';
  end if;

  if new.parent_material_id is not null then
    select * into v_parent
    from public.materials
    where id = new.parent_material_id;

    if not found then
      raise exception 'material pai não encontrado: %', new.parent_material_id;
    end if;
    if v_parent.discipline_id <> new.discipline_id or v_parent.theme_id <> new.theme_id then
      raise exception 'material pai e filho devem pertencer à mesma disciplina e ao mesmo tema';
    end if;
    if new.status = 'published' and v_parent.status <> 'published' then
      raise exception 'material publicado não pode ter um pai que não esteja publicado';
    end if;
    if exists (
      with recursive ancestors as (
        select m.id, m.parent_material_id
        from public.materials m where m.id = new.parent_material_id
        union all
        select m.id, m.parent_material_id
        from public.materials m
        join ancestors a on m.id = a.parent_material_id
      )
      select 1 from ancestors where id = new.id
    ) then
      raise exception 'hierarquia inválida: a alteração criaria um ciclo';
    end if;
  end if;

  if tg_op = 'UPDATE' and exists (
    select 1
    from public.materials child
    where child.parent_material_id = new.id
      and (child.discipline_id <> new.discipline_id or child.theme_id <> new.theme_id)
  ) then
    raise exception 'não é possível mudar disciplina ou tema enquanto houver filhos incompatíveis';
  end if;

  return new;
end;
$$;

create trigger trg_validate_material_hierarchy
  before insert or update of parent_material_id, tree_sort_order, discipline_id, theme_id
  on public.materials
  for each row execute function public.validate_material_hierarchy();

-- Related é simétrico. Normalizar a ordem evita A→B e B→A duplicados.
create or replace function public.normalize_material_link()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_swap uuid;
begin
  if new.source_material_id = new.target_material_id then
    raise exception 'um material não pode se ligar a si mesmo';
  end if;
  if new.link_type = 'related' and new.source_material_id::text > new.target_material_id::text then
    v_swap := new.source_material_id;
    new.source_material_id := new.target_material_id;
    new.target_material_id := v_swap;
  end if;
  return new;
end;
$$;

create trigger trg_normalize_material_link
  before insert or update of source_material_id, target_material_id, link_type
  on public.material_links
  for each row execute function public.normalize_material_link();

create or replace function public.validate_material_link_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_source_status text;
  v_target_status text;
begin
  perform pg_catalog.pg_advisory_xact_lock(2026092201);

  if new.link_type = 'prerequisite' then
    if exists (
      with recursive reachable as (
        select l.target_material_id as id
        from public.material_links l
        where l.source_material_id = new.target_material_id
          and l.link_type = 'prerequisite'
          and l.id <> new.id
        union
        select l.target_material_id
        from public.material_links l
        join reachable r on l.source_material_id = r.id
        where l.link_type = 'prerequisite'
          and l.id <> new.id
      )
      select 1 from reachable where id = new.source_material_id
    ) then
      raise exception 'pré-requisitos inválidos: a ligação criaria um ciclo';
    end if;

    select status into v_source_status
    from public.materials where id = new.source_material_id;
    select status into v_target_status
    from public.materials where id = new.target_material_id;
    if v_source_status = 'published' and v_target_status <> 'published' then
      raise exception 'material publicado não pode depender de um pré-requisito não publicado';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_validate_material_link_publication
  before insert or update of source_material_id, target_material_id, link_type
  on public.material_links
  for each row execute function public.validate_material_link_publication();

-- A navegação passa a fazer parte do snapshot somente quando existe. Assim,
-- materiais legados que continuam como raiz, ordem 0 e sem links preservam o
-- hash já aprovado; uma mudança taxonômica real invalida a aprovação anterior.
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
      ) || case
        when m.parent_material_id is not null or m.tree_sort_order <> 0
        then jsonb_build_object(
          'parent_material_id', m.parent_material_id,
          'tree_sort_order', m.tree_sort_order
        )
        else '{}'::jsonb
      end
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
  ) || case when exists (
    select 1 from public.material_links l
    where l.source_material_id = p_material_id
       or (l.link_type = 'related' and l.target_material_id = p_material_id)
  ) then jsonb_build_object('navigation_links', (
    select jsonb_agg(jsonb_build_object(
      'material_id', case when l.source_material_id = p_material_id
        then l.target_material_id else l.source_material_id end,
      'link_type', l.link_type,
      'sort_order', l.sort_order
    ) order by l.link_type, l.sort_order, l.id)
    from public.material_links l
    where l.source_material_id = p_material_id
       or (l.link_type = 'related' and l.target_material_id = p_material_id)
  )) else '{}'::jsonb end;
$$;

revoke all on function app.build_material_snapshot(uuid) from public;
grant execute on function app.build_material_snapshot(uuid) to authenticated;

-- Mantém a assinatura da RPC para não quebrar clientes atuais. Os novos
-- campos só são alterados quando suas chaves aparecem em p_material.
create or replace function public.save_compendium(
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
  v_link jsonb;
  v_link_target uuid;
  v_link_type text;
  v_idx int := 0;
begin
  if not app.is_admin_active(auth.uid()) then
    raise exception 'apenas administradores ativos podem salvar materiais';
  end if;
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
     estimated_read_time_minutes, author, tags, parent_material_id, tree_sort_order)
  values (
    v_id, (p_material->>'discipline_id')::uuid, (p_material->>'theme_id')::uuid,
    v_title, nullif(trim(coalesce(p_material->>'subtitle', '')), ''),
    nullif(p_material->>'mode', ''), nullif(p_material->>'study_lens', ''),
    (p_material->>'module_number')::int,
    (p_material->>'estimated_read_time_minutes')::int,
    nullif(trim(coalesce(p_material->>'author', '')), ''),
    coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(p_material->'tags', '[]'::jsonb))), '{}'),
    case when p_material ? 'parent_material_id' then nullif(p_material->>'parent_material_id', '')::uuid else null end,
    case when p_material ? 'tree_sort_order' then (p_material->>'tree_sort_order')::int else 0 end
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
      then excluded.tree_sort_order else materials.tree_sort_order end;

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

  delete from public.material_references where material_id = v_id;
  if p_references is not null and jsonb_array_length(p_references) > 0 then
    insert into public.material_references (material_id, citation_text, sort_order, source_id, url)
    select v_id, r.value->>'citation_text', (r.ord - 1)::int,
      nullif(r.value->>'source_id', ''), nullif(r.value->>'url', '')
    from jsonb_array_elements(p_references) with ordinality as r(value, ord);
  end if;

  if p_material ? 'navigation_links' then
    delete from public.material_links
    where source_material_id = v_id or (link_type = 'related' and target_material_id = v_id);

    v_idx := 0;
    for v_link in select * from jsonb_array_elements(p_material->'navigation_links') loop
      v_link_target := nullif(v_link->>'material_id', '')::uuid;
      v_link_type := v_link->>'link_type';
      if v_link_target is null or v_link_type is null
         or v_link_type not in ('prerequisite', 'related') then
        raise exception 'ligação % inválida', v_idx + 1;
      end if;
      insert into public.material_links
        (source_material_id, target_material_id, link_type, sort_order)
      values (v_id, v_link_target, v_link_type, coalesce((v_link->>'sort_order')::int, v_idx));
      v_idx := v_idx + 1;
    end loop;
  end if;
end;
$$;

revoke all on function public.save_compendium(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_compendium(jsonb, jsonb, jsonb) to authenticated;

-- Publicação exige toda a cadeia de pais e todos os pré-requisitos publicados.
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
  if not app.has_current_approved_revision(p_material_id, null) then
    raise exception 'publicação bloqueada: não há revisão aprovada cujo conteúdo atual recomputado bata com o hash aprovado';
  end if;

  select a.title into v_blocker
  from (
    with recursive ancestors as (
      select m.id, m.parent_material_id, m.title, m.status
      from public.materials current_m
      join public.materials m on m.id = current_m.parent_material_id
      where current_m.id = p_material_id
      union all
      select m.id, m.parent_material_id, m.title, m.status
      from public.materials m join ancestors a on m.id = a.parent_material_id
    )
    select * from ancestors where status <> 'published' limit 1
  ) a;
  if v_blocker is not null then
    raise exception 'publicação bloqueada: o ancestral "%" ainda não está publicado', v_blocker;
  end if;

  select target.title into v_blocker
  from public.material_links link
  join public.materials target on target.id = link.target_material_id
  where link.source_material_id = p_material_id
    and link.link_type = 'prerequisite'
    and target.status <> 'published'
  limit 1;
  if v_blocker is not null then
    raise exception 'publicação bloqueada: o pré-requisito "%" ainda não está publicado', v_blocker;
  end if;

  update public.materials set status = 'published'
  where id = p_material_id returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.publish_material(uuid) from public, anon;
grant execute on function public.publish_material(uuid) to authenticated;

-- Despublicação segura: não cria buracos visíveis na árvore nem quebra um
-- prerequisite já utilizado por outro material publicado.
create or replace function public.unpublish_material(p_material_id uuid)
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
    raise exception 'apenas administradores ativos podem despublicar materiais';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(2026092201);
  perform 1 from public.materials where id = p_material_id for update;
  if not found then raise exception 'material não encontrado: %', p_material_id; end if;

  select d.title into v_blocker
  from (
    with recursive descendants as (
      select m.id, m.title, m.status
      from public.materials m where m.parent_material_id = p_material_id
      union all
      select m.id, m.title, m.status
      from public.materials m join descendants d on m.parent_material_id = d.id
    )
    select * from descendants where status = 'published' limit 1
  ) d;
  if v_blocker is not null then
    raise exception 'despublicação bloqueada: o descendente "%" ainda está publicado', v_blocker;
  end if;

  select source.title into v_blocker
  from public.material_links link
  join public.materials source on source.id = link.source_material_id
  where link.target_material_id = p_material_id
    and link.link_type = 'prerequisite'
    and source.status = 'published'
  limit 1;
  if v_blocker is not null then
    raise exception 'despublicação bloqueada: o material publicado "%" depende deste pré-requisito', v_blocker;
  end if;

  update public.materials set status = 'draft'
  where id = p_material_id returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.unpublish_material(uuid) from public, anon;
grant execute on function public.unpublish_material(uuid) to authenticated;

-- A partir daqui, published -> draft também só passa pela RPC acima.
create or replace function public.guard_material_publish()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'published' and current_user <> 'postgres' then
      raise exception 'não é permitido inserir material já publicado; crie em draft e use publish_material()';
    end if;
  elsif tg_op = 'UPDATE' and current_user <> 'postgres' then
    if new.status = 'published' and old.status is distinct from 'published' then
      raise exception 'transição para published (inclusive a partir de archived) só é permitida via publish_material()';
    end if;
    if old.status = 'published' and new.status is distinct from 'published' then
      raise exception 'transição de published só é permitida via unpublish_material()';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.validate_material_hierarchy() from public, anon;
revoke all on function public.normalize_material_link() from public, anon;
revoke all on function public.validate_material_link_publication() from public, anon;
