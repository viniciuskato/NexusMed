-- ============================================================================
-- "Salvar" sem perda + importação já posicionada na árvore
-- ============================================================================
-- Três falhas medidas contra o Supabase local em 2026-09-23, com o payload
-- EXATO que o formulário do Admin envia num "Salvar" sem mudar nada:
--
--   1. o hash de atestação mudava — a revisão aprovada era invalidada;
--   2. todas as referências eram apagadas e recriadas com ids novos (os ids
--      entram no snapshot atestado, daí o item 1);
--   3. o vínculo de referência com fonte curada (source_id/url, feito pelo
--      painel de referências) era APAGADO em silêncio — perda de dado.
--
-- Medido também em produção (só leitura): 0 referências vinculadas, 0
-- materiais com nav_short_title, 0 com pai — nada foi perdido ainda e
-- nenhuma aprovação existente muda de hash por esta migration.
--
-- Esta migration:
--   A. save_compendium preserva identidade e vínculo das referências
--      (casamento por texto idêntico, em ordem) em vez de apagar e recriar;
--   B. nav_short_title sai do hash de atestação — é rótulo de navegação, e
--      no fluxo real (importar → posicionar) só pode ser preenchido depois
--      da importação; o snapshot volta a ser idêntico ao pré-taxonomia;
--   C. import_compendium_draft aceita a posição na árvore e as ligações na
--      mesma transação, para a importação não exigir um segundo passo;
--   D. publish_material, quando bloqueia pela árvore, lista a ORDEM completa
--      de publicação (de cima para baixo) em vez de um ancestral só.
--
-- A parte de round-trip do formulário (mode nulo virando "mecanismos",
-- study_lens apagado por não existir no formulário) é corrigida no cliente —
-- ver src/utils/compendiumForm.ts.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- B) Snapshot atestado: exatamente o formato de 20260914120000
-- ----------------------------------------------------------------------------
-- Fora do hash, agora sem exceção: posição, ordem, ligações, tipo do nó e
-- rótulo curto. Regra: o hash cobre o que o revisor científico lê — texto,
-- seções, referências —, nunca como o material é alcançado na navegação.
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

-- ----------------------------------------------------------------------------
-- Gravação das ligações de navegação — um lugar só, usado por save_compendium
-- e import_compendium_draft. Os triggers de material_links validam ciclo,
-- ancestral-como-pré-requisito e par único; qualquer violação aborta a
-- transação inteira do chamador.
-- ----------------------------------------------------------------------------
create or replace function app.replace_material_links(p_material_id uuid, p_links jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link jsonb;
  v_target uuid;
  v_type text;
  v_idx int := 0;
  v_prerequisite_idx int := 0;
  v_related_idx int := 0;
begin
  if p_links is null or jsonb_typeof(p_links) <> 'array' then
    raise exception 'navigation_links deve ser uma lista';
  end if;

  delete from public.material_links
  where source_material_id = p_material_id
     or (link_type = 'related' and target_material_id = p_material_id);

  for v_link in select * from jsonb_array_elements(p_links) loop
    v_target := nullif(v_link->>'material_id', '')::uuid;
    v_type := v_link->>'link_type';
    if v_target is null or v_type is null or v_type not in ('prerequisite', 'related') then
      raise exception 'ligação % inválida', v_idx + 1;
    end if;
    -- Passos de 10 por padrão, contados por tipo (as duas listas são
    -- renderizadas separadas: "Estude antes" / "Veja também").
    insert into public.material_links (source_material_id, target_material_id, link_type, sort_order)
    values (
      p_material_id, v_target, v_type,
      coalesce(
        (v_link->>'sort_order')::int,
        case v_type when 'prerequisite' then v_prerequisite_idx * 10 else v_related_idx * 10 end
      )
    );
    if v_type = 'prerequisite' then
      v_prerequisite_idx := v_prerequisite_idx + 1;
    else
      v_related_idx := v_related_idx + 1;
    end if;
    v_idx := v_idx + 1;
  end loop;
end;
$$;

-- Só chamada de dentro das RPCs (SECURITY DEFINER); nunca direto pelo cliente.
revoke all on function app.replace_material_links(uuid, jsonb) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- A) save_compendium: referências preservam id e vínculo
-- ----------------------------------------------------------------------------
-- Cada referência recebida é casada com uma existente deste material pelo
-- TEXTO IDÊNTICO (a primeira ainda não usada, na ordem atual). Casou: mantém
-- o id e o vínculo com fonte curada, atualiza só a ordem. Não casou: é
-- referência nova. As existentes que sobraram são apagadas.
--
-- save_compendium NUNCA altera source_id/url de uma referência existente: o
-- vínculo é gerido só pelo painel de referências (updateMaterialReferenceSource).
-- Assim nenhum cliente — nem o antigo, que envia source_id/url nulos em toda
-- referência — consegue desvincular sem querer. Editar o texto de uma
-- referência vinculada cria uma nova (o casamento é por texto): o formulário
-- avisa antes de salvar quando isso vai acontecer.
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
  v_ref record;
  v_ref_id uuid;
  v_ref_text text;
  v_kept_ref_ids uuid[] := '{}';
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

  -- Referências: casar por texto idêntico, preservando id e vínculo.
  for v_ref in
    select r.value, (r.ord - 1)::int as pos
    from jsonb_array_elements(coalesce(p_references, '[]'::jsonb)) with ordinality as r(value, ord)
  loop
    v_ref_text := v_ref.value->>'citation_text';
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

revoke all on function public.save_compendium(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_compendium(jsonb, jsonb, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- C) import_compendium_draft com posição na árvore
-- ----------------------------------------------------------------------------
-- Os parâmetros novos têm default, então o cliente antigo (que chama só com
-- os dez originais por nome) continua funcionando durante o deploy. A
-- assinatura muda, por isso drop + create em vez de create or replace.
drop function public.import_compendium_draft(uuid, uuid, uuid, text, text, text, int, text[], jsonb, text[]);

create function public.import_compendium_draft(
  p_id uuid,
  p_discipline_id uuid,
  p_theme_id uuid,
  p_title text,
  p_subtitle text,
  p_author text,
  p_estimated_read_time_minutes int,
  p_tags text[],
  p_sections jsonb,
  p_references text[],
  p_parent_material_id uuid default null,
  p_tree_sort_order int default 0,
  p_nav_short_title text default null,
  p_taxonomy_kind text default null,
  p_navigation_links jsonb default '[]'::jsonb
)
returns public.materials
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := trim(coalesce(p_title, ''));
  v_theme_discipline_id uuid;
  v_material public.materials;
  v_section jsonb;
  v_section_id uuid;
  v_section_title text;
  v_idx int := 0;
begin
  if not app.is_admin_active(auth.uid()) then
    raise exception 'apenas administradores ativos podem importar materiais';
  end if;

  if p_id is null then
    raise exception 'id do material é obrigatório';
  end if;
  if v_title = '' then
    raise exception 'título é obrigatório';
  end if;
  if p_sections is null or jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) = 0 then
    raise exception 'o material precisa de ao menos uma seção';
  end if;
  if p_tree_sort_order is null or p_tree_sort_order < 0 then
    raise exception 'ordem entre irmãos deve ser um inteiro não negativo';
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

  perform 1 from public.materials where lower(trim(title)) = lower(v_title);
  if found then
    raise exception 'já existe um material com o título "%"', v_title;
  end if;

  for v_section in select * from jsonb_array_elements(p_sections)
  loop
    v_section_id := nullif(v_section->>'id', '')::uuid;
    v_section_title := trim(coalesce(v_section->>'title', ''));
    if v_section_id is null then
      raise exception 'seção % sem id válido', v_idx + 1;
    end if;
    if v_section_title = '' then
      raise exception 'seção % sem título', v_idx + 1;
    end if;
    if trim(coalesce(v_section->>'content', '')) = '' then
      raise exception 'seção % sem conteúdo', v_idx + 1;
    end if;
    v_idx := v_idx + 1;
  end loop;

  -- A posição entra no próprio INSERT: o trigger validate_material_hierarchy
  -- confere disciplina do pai, ciclo e profundidade antes de gravar.
  insert into public.materials
    (id, discipline_id, theme_id, title, subtitle, author, estimated_read_time_minutes, tags, status,
     parent_material_id, tree_sort_order, nav_short_title, taxonomy_kind)
  values
    (p_id, p_discipline_id, p_theme_id, v_title, nullif(trim(coalesce(p_subtitle, '')), ''),
     nullif(trim(coalesce(p_author, '')), ''), p_estimated_read_time_minutes, coalesce(p_tags, '{}'), 'draft',
     p_parent_material_id, p_tree_sort_order,
     nullif(trim(coalesce(p_nav_short_title, '')), ''), nullif(p_taxonomy_kind, ''))
  returning * into v_material;

  v_idx := 0;
  for v_section in select * from jsonb_array_elements(p_sections)
  loop
    insert into public.material_sections
      (id, material_id, sort_order, title, mechanism_tag, content, key_takeaways, clinical_pearl, warning_alert)
    values (
      (v_section->>'id')::uuid,
      p_id,
      v_idx,
      trim(v_section->>'title'),
      nullif(v_section->>'mechanism_tag', ''),
      v_section->>'content',
      coalesce((select array_agg(value::text) from jsonb_array_elements_text(coalesce(v_section->'key_takeaways', '[]'::jsonb))), '{}'),
      nullif(v_section->>'clinical_pearl', ''),
      nullif(v_section->>'warning_alert', '')
    );
    v_idx := v_idx + 1;
  end loop;

  if p_references is not null and array_length(p_references, 1) > 0 then
    insert into public.material_references (material_id, citation_text, sort_order)
    select p_id, ref, ord - 1
    from unnest(p_references) with ordinality as t(ref, ord);
  end if;

  perform app.replace_material_links(p_id, coalesce(p_navigation_links, '[]'::jsonb));

  return v_material;
end;
$$;

revoke all on function public.import_compendium_draft(uuid, uuid, uuid, text, text, text, int, text[], jsonb, text[], uuid, int, text, text, jsonb) from public, anon;
grant execute on function public.import_compendium_draft(uuid, uuid, uuid, text, text, text, int, text[], jsonb, text[], uuid, int, text, text, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- D) publish_material: dizer a ORDEM de publicação, não um ancestral só
-- ----------------------------------------------------------------------------
-- 20260922130000 passou a apontar o ancestral MAIS PRÓXIMO. Estava errado:
-- publicação é de cima para baixo, então o mais próximo também está
-- bloqueado pelo de cima dele e a tentativa seguinte falha de novo. A
-- mensagem agora lista todos os ancestrais em rascunho, do mais alto para o
-- mais baixo — exatamente a ordem em que cada publicação vai dar certo. O
-- card do Admin mostra a mesma lista antes do clique
-- (publishPrerequisitesInOrder em src/utils/materialNavigation.ts).
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
