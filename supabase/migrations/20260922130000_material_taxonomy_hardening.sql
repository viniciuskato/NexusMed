-- ============================================================================
-- Taxonomia de materiais — Fase 1.5: correções estruturais antes do conteúdo
-- ============================================================================
-- Revisão da fundação criada em 20260922120000, feita ANTES de produzir os
-- materiais do piloto. Cada bloco corrige uma falha medida contra o Supabase
-- local, não uma suspeita.
--
--   1. O hash atestado volta a cobrir SÓ conteúdo. Medido: um link `related`
--      criado por C mudava o hash de A (snapshot simétrico), e reordenar um
--      irmão mudava o hash dele — invalidando revisões aprovadas de material
--      que ninguém editou. Como `create_content_revision` não herda claims, a
--      revisão nova nascia com zero claims e era aprovável trivialmente: o
--      gate científico virava carimbo no fluxo mais frequente do produto.
--      A integridade da árvore continua garantida por publish_material/
--      unpublish_material, que verificam o estado real em vez de um hash.
--   2. Pai e filho passam a exigir só a mesma DISCIPLINA. Medido: com a
--      exigência de tema, mover um ramo entre temas era impossível — pai
--      primeiro, filho primeiro e os dois no mesmo statement todos falhavam.
--      A única saída era destacar filhos, mover e reanexar, com a árvore
--      visivelmente quebrada para o estudante no meio do processo.
--   3. Profundidade máxima e guarda de ciclo nas CTEs recursivas. Medido: 60
--      níveis criados sem bloqueio, e nenhuma das CTEs tinha cláusula CYCLE —
--      um ciclo que escapasse do trigger giraria até o timeout segurando o
--      advisory lock global do pipeline editorial.
--   4. Exclusão de material deixa de depender de sorteio de UUID. Medido:
--      `related` é normalizado por uuid::text, e como source tinha cascade e
--      target tinha restrict, apagar o material de uuid menor passava e o de
--      uuid maior falhava. Mesma ação editorial, resultado oposto.
--   5. Um par de materiais passa a ter no máximo UMA relação. Medido:
--      prerequisite C→A e related A↔C coexistiam, e o estudante veria o mesmo
--      material em "Estude antes" e em "Veja também".
--   6. nav_short_title e taxonomy_kind entram agora. O breadcrumb do plano usa
--      rótulos ("Parede celular", "Terceira geração") que não existem como
--      título de nenhum material, e a coluna "Tipo" do catálogo do piloto não
--      tinha onde morar. Criar depois custaria migration + passada editorial
--      em cada nó da árvore já produzida.
--   7. set_material_position: mover um nó deixa de exigir save_compendium,
--      que reescreve conteúdo inteiro só para mudar um número de ordem.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Rótulo de navegação e tipo do nó
-- ----------------------------------------------------------------------------
-- nav_short_title é o rótulo curto de breadcrumb/cartão, separado do título
-- editorial: "Terceira geração" para "Cefalosporinas de terceira geração".
-- Nulo significa "use o título" — nenhum material legado precisa ser tocado.
alter table public.materials
  add column nav_short_title text,
  add column taxonomy_kind text check (taxonomy_kind in (
    'visao_geral', 'mecanismo', 'classe', 'subclasse', 'farmaco', 'condicao'
  )),
  add constraint materials_nav_short_title_len
    check (nav_short_title is null or char_length(nav_short_title) between 1 and 40);

comment on column public.materials.nav_short_title is
  'Rótulo curto para breadcrumb/cartões de árvore. Nulo = usar title.';
comment on column public.materials.taxonomy_kind is
  'Nível do nó na árvore editorial. Não entra no hash de atestação: é metadado estrutural, como parent_material_id.';

-- ----------------------------------------------------------------------------
-- 2) Hash atestado = conteúdo, nunca navegação
-- ----------------------------------------------------------------------------
-- Formato idêntico ao de 20260914120000 mais nav_short_title (rótulo de texto
-- exibido ao estudante, portanto conteúdo) adicionado condicionalmente — assim
-- todo material legado conserva o hash já aprovado. Fora do snapshot, de
-- propósito: parent_material_id, tree_sort_order, navigation_links,
-- taxonomy_kind. A regra é: o hash cobre o que o revisor científico lê e
-- atesta; a posição do material na árvore é governada pelos gates de
-- publicação.
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
        when m.nav_short_title is not null
        then jsonb_build_object('nav_short_title', m.nav_short_title)
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
  );
$$;

revoke all on function app.build_material_snapshot(uuid) from public;
grant execute on function app.build_material_snapshot(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) Travessia da árvore com teto de profundidade e guarda de ciclo
-- ----------------------------------------------------------------------------
-- Teto único para árvore e breadcrumb. Seis níveis é o caminho mais longo do
-- piloto (Antibióticos → ... → Ceftriaxona); oito dá folga sem permitir uma
-- trilha que nenhuma tela renderiza.
create or replace function app.material_max_depth()
returns int language sql immutable set search_path = '' as $$ select 8 $$;

-- Ancestrais do material, do pai imediato até a raiz. A cláusula CYCLE garante
-- término mesmo com dado corrompido: em vez de girar para sempre, a travessia
-- para e o chamador enxerga o ciclo.
create or replace function app.material_ancestors(p_material_id uuid)
returns table (id uuid, title text, status text, depth int)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive chain as (
    select m.id, m.parent_material_id, m.title, m.status, 1 as depth
    from public.materials child
    join public.materials m on m.id = child.parent_material_id
    where child.id = p_material_id
    union all
    select m.id, m.parent_material_id, m.title, m.status, c.depth + 1
    from public.materials m
    join chain c on m.id = c.parent_material_id
  ) cycle id set is_cycle using path
  select id, title, status, depth from chain where not is_cycle;
$$;

-- Descendentes do material, em qualquer profundidade. Base do escopo
-- "questões deste nó e dos filhos" e do gate de despublicação.
create or replace function app.material_descendants(p_material_id uuid)
returns table (id uuid, title text, status text, depth int)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive tree as (
    select m.id, m.title, m.status, 1 as depth
    from public.materials m
    where m.parent_material_id = p_material_id
    union all
    select m.id, m.title, m.status, t.depth + 1
    from public.materials m
    join tree t on m.parent_material_id = t.id
  ) cycle id set is_cycle using path
  select id, title, status, depth from tree where not is_cycle;
$$;

revoke all on function app.material_max_depth() from public;
revoke all on function app.material_ancestors(uuid) from public;
revoke all on function app.material_descendants(uuid) from public;
grant execute on function app.material_max_depth() to authenticated;
grant execute on function app.material_ancestors(uuid) to authenticated;
grant execute on function app.material_descendants(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) Hierarquia: mesma disciplina, teto de profundidade, sem ciclo
-- ----------------------------------------------------------------------------
create or replace function public.validate_material_hierarchy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent public.materials;
  v_ancestor_depth int;
  v_subtree_depth int;
begin
  perform pg_catalog.pg_advisory_xact_lock(2026092201);

  if current_user <> 'postgres' and (
    new.parent_material_id is distinct from case when tg_op = 'UPDATE' then old.parent_material_id else null end
    or new.tree_sort_order is distinct from case when tg_op = 'UPDATE' then old.tree_sort_order else 0 end
  ) then
    raise exception 'posição na árvore só pode ser alterada via save_compendium() ou set_material_position()';
  end if;

  if new.parent_material_id is not null then
    select * into v_parent
    from public.materials
    where id = new.parent_material_id;

    if not found then
      raise exception 'material pai não encontrado: %', new.parent_material_id;
    end if;
    -- Só a disciplina é exigida. O tema deixou de amarrar pai e filho porque
    -- amarrava o ramo inteiro ao tema em que nasceu: era impossível mover uma
    -- subárvore sem desmontá-la na frente do estudante.
    if v_parent.discipline_id <> new.discipline_id then
      raise exception 'material pai e filho devem pertencer à mesma disciplina';
    end if;
    if new.status = 'published' and v_parent.status <> 'published' then
      raise exception 'material publicado não pode ter um pai que não esteja publicado';
    end if;
    if exists (select 1 from app.material_ancestors(new.parent_material_id) where id = new.id)
       or new.parent_material_id = new.id then
      raise exception 'hierarquia inválida: a alteração criaria um ciclo';
    end if;

    -- Profundidade do pai + o próprio nó + a subárvore que ele carrega.
    select coalesce(max(depth), 0) into v_ancestor_depth
      from app.material_ancestors(new.parent_material_id);
    select coalesce(max(depth), 0) into v_subtree_depth
      from app.material_descendants(new.id);
    if v_ancestor_depth + 2 + v_subtree_depth > app.material_max_depth() then
      raise exception 'profundidade máxima da árvore é % níveis; esta alteração chegaria a %',
        app.material_max_depth(), v_ancestor_depth + 2 + v_subtree_depth;
    end if;

    -- Simétrico ao bloqueio em validate_material_link_publication(): lá o link
    -- redundante é barrado na criação; aqui é barrado quando a mudança de pai
    -- transformaria um pré-requisito já cadastrado em ancestral.
    if exists (
      select 1
      from public.material_links l
      where l.source_material_id = new.id
        and l.link_type = 'prerequisite'
        and (l.target_material_id = new.parent_material_id
             or l.target_material_id in (select id from app.material_ancestors(new.parent_material_id)))
    ) then
      raise exception 'este material já tem "Estude antes" apontando para o novo pai ou para um ancestral dele; remova a ligação redundante antes de reposicioná-lo';
    end if;
  end if;

  if tg_op = 'UPDATE' and exists (
    select 1
    from public.materials child
    where child.parent_material_id = new.id
      and child.discipline_id <> new.discipline_id
  ) then
    raise exception 'não é possível mudar a disciplina enquanto houver filhos em outra disciplina';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_material_hierarchy() from public, anon;

-- ----------------------------------------------------------------------------
-- 5) Um par de materiais, no máximo uma relação
-- ----------------------------------------------------------------------------
-- O índice único de 20260922120000 inclui link_type, então prerequisite A→B e
-- related A↔B coexistiam. Este índice fecha o par sem tipo: em ordem canônica
-- para qualquer tipo, um par tem uma relação só.
create index if not exists idx_material_links_type
  on public.material_links (link_type);

-- A constraint antiga de material_dependencies era unique (material_id,
-- depends_on_material_id): permitia A→B e B→A convivendo. Se o acervo tiver um
-- par nos dois sentidos, o índice abaixo falharia com "duplicate key" sem
-- dizer qual par. Este bloco falha primeiro, nomeando os materiais.
do $$
declare
  v_pair text;
begin
  select string_agg(format('%s <-> %s', a.title, b.title), '; ')
    into v_pair
  from public.material_links l
  join public.materials a on a.id = l.source_material_id
  join public.materials b on b.id = l.target_material_id
  where exists (
    select 1 from public.material_links o
    where least(o.source_material_id::text, o.target_material_id::text)
        = least(l.source_material_id::text, l.target_material_id::text)
      and greatest(o.source_material_id::text, o.target_material_id::text)
        = greatest(l.source_material_id::text, l.target_material_id::text)
      and o.id <> l.id
  );
  if v_pair is not null then
    raise exception 'há par(es) de materiais com mais de uma ligação; resolva editorialmente antes de aplicar esta migration: %', v_pair;
  end if;
end $$;

create unique index material_links_pair_unique
  on public.material_links (
    least(source_material_id::text, target_material_id::text),
    greatest(source_material_id::text, target_material_id::text)
  );

-- ----------------------------------------------------------------------------
-- 6) Ciclo de pré-requisitos com guarda de término
-- ----------------------------------------------------------------------------
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
        select l.target_material_id as id, 1 as depth
        from public.material_links l
        where l.source_material_id = new.target_material_id
          and l.link_type = 'prerequisite'
          and l.id <> new.id
        union all
        select l.target_material_id, r.depth + 1
        from public.material_links l
        join reachable r on l.source_material_id = r.id
        where l.link_type = 'prerequisite'
          and l.id <> new.id
          and r.depth < 64
      ) cycle id set is_cycle using path
      select 1 from reachable where id = new.source_material_id and not is_cycle
    ) then
      raise exception 'pré-requisitos inválidos: a ligação criaria um ciclo';
    end if;

    -- Um ancestral já é pré-requisito implícito: o breadcrumb mostra o
    -- caminho inteiro. Cadastrá-lo de novo em "Estude antes" duplica a
    -- informação na tela e cria um vínculo a mais para manter.
    if exists (select 1 from app.material_ancestors(new.source_material_id) where id = new.target_material_id) then
      raise exception 'um ancestral já é pré-requisito implícito pela árvore; use "Estude antes" só para dependência fora do ramo';
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

revoke all on function public.validate_material_link_publication() from public, anon;

-- ----------------------------------------------------------------------------
-- 7) Exclusão de material: resultado igual dos dois lados de um link related
-- ----------------------------------------------------------------------------
-- `related` é simétrico e guardado uma vez, em ordem canônica de uuid — quem
-- é "source" é sorteio. Limpar os dois lados antes do DELETE torna a exclusão
-- determinística. Filho e pré-requisito continuam com restrict: aí o bloqueio
-- é intencional e o Admin precisa realocar antes.
create or replace function public.clear_symmetric_material_links()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.material_links
  where link_type = 'related'
    and (source_material_id = old.id or target_material_id = old.id);
  return old;
end;
$$;

create trigger trg_clear_symmetric_material_links
  before delete on public.materials
  for each row execute function public.clear_symmetric_material_links();

revoke all on function public.clear_symmetric_material_links() from public, anon;

-- ----------------------------------------------------------------------------
-- 8) Gates de publicação sobre a travessia com guarda
-- ----------------------------------------------------------------------------
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
  from app.material_ancestors(p_material_id) a
  where a.status <> 'published'
  order by a.depth desc
  limit 1;
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
  from app.material_descendants(p_material_id) d
  where d.status = 'published'
  limit 1;
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

-- ----------------------------------------------------------------------------
-- 9) Mover um nó sem reescrever conteúdo
-- ----------------------------------------------------------------------------
-- save_compendium substitui seções e referências inteiras. Usá-la para mudar
-- um número de ordem é caro e arriscado à toa. Esta RPC toca só pai e ordem, e
-- os triggers de hierarquia validam disciplina, ciclo e profundidade.
create or replace function public.set_material_position(
  p_material_id uuid,
  p_parent_material_id uuid,
  p_tree_sort_order int
)
returns public.materials
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.materials;
begin
  if not app.is_admin_active(auth.uid()) then
    raise exception 'apenas administradores ativos podem mover materiais';
  end if;
  if p_tree_sort_order is null or p_tree_sort_order < 0 then
    raise exception 'ordem entre irmãos deve ser um inteiro não negativo';
  end if;

  update public.materials
     set parent_material_id = p_parent_material_id,
         tree_sort_order = p_tree_sort_order
   where id = p_material_id
  returning * into v_result;

  if not found then
    raise exception 'material não encontrado: %', p_material_id;
  end if;
  return v_result;
end;
$$;

revoke all on function public.set_material_position(uuid, uuid, int) from public, anon;
grant execute on function public.set_material_position(uuid, uuid, int) to authenticated;

-- ----------------------------------------------------------------------------
-- 10) save_compendium: rótulo curto, tipo do nó e ordem em passos de 10
-- ----------------------------------------------------------------------------
-- Mantém a assinatura. Campos novos só mudam quando suas chaves aparecem em
-- p_material, então cliente antigo continua salvando sem apagar navegação.
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
      -- Passos de 10 por padrão: dá espaço para inserir entre dois vizinhos
      -- sem renumerar a lista inteira.
      insert into public.material_links
        (source_material_id, target_material_id, link_type, sort_order)
      values (v_id, v_link_target, v_link_type,
              coalesce((v_link->>'sort_order')::int, v_idx * 10));
      v_idx := v_idx + 1;
    end loop;
  end if;
end;
$$;

revoke all on function public.save_compendium(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_compendium(jsonb, jsonb, jsonb) to authenticated;
