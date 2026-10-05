-- ============================================================================
-- MAT-1 — Data de publicação, versão do padrão e "versão nova" de material
--
-- Pedido do dono (04/10/2026): todo material mostra "Publicado em" e "Atualizado em"; o admin vê quais
-- materiais estão numa versão antiga do padrão de conteúdos, baixa o texto atual com o prompt mais novo e põe a
-- versão nova no ar pelo envio de arquivo, sem esperar o parecer "apto" (D-13: só o dono publica).
--
-- O que esta migration faz:
--   1. `materials.published_at`: preenchida na PRIMEIRA vez que o material vai a "published" e nunca mais mudada
--      (despublicar e publicar de novo não muda; o cliente não escolhe a data). `materials.standard_version`: a
--      versão do padrão que o texto de origem declarava (nulo = desconhecida/antiga).
--   2. "Atualizado em" continua sendo `materials.updated_at`, agora de verdade a última mudança de conteúdo: uma
--      seção que entra, sai ou muda de texto (a edição na leitura, ED-2, o formulário do Admin, a atualização por
--      arquivo) move a data; gravar a mesma coisa de novo não move (AGENTS.md, risco 17). Nenhuma das duas colunas
--      novas, nem `updated_at`, entra no hash do conteúdo (`app.build_material_snapshot`): atestação e selo não mudam.
--   3. A versão do padrão vem do texto do envio que foi ao ar (material novo ou atualização), lida da linha
--      "**Versão do padrão:** N" por UMA função (`app.versao_do_padrao_do_texto`), por um gatilho no envio:
--      vale para os quatro caminhos (`admin_*` e `revisao_*`) sem reescrever nenhum. Arquivo igual ao que está no ar
--      ("nada mudou") não grava versão: o arquivo exportado de um material antigo já declara a versão atual.
--   4. "Importar material" (Admin) grava a versão do arquivo (`import_compendium_draft` ganha `p_standard_version`).
--   5. `admin_aplicar_atualizacao`: a mesma função da P8, com duas diferenças: cada seção cujo texto muda ganha uma
--      versão em `material_section_versions` (o mesmo histórico da edição na leitura) e, se o conteúdo mudou, a
--      data de atualização do material anda (também quando só a ordem das seções ou as referências mudam).
--   6. Preenche os materiais que já existem, com a melhor fonte registrada (função idempotente, chamada uma vez aqui).
--
-- Nenhuma tabela nova (riscos 13/14): as funções novas ficam no schema `app`, sem EXECUTE para anon/authenticated.
-- Nada é apagado: só colunas novas são preenchidas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colunas
-- ----------------------------------------------------------------------------

alter table public.materials
  add column if not exists published_at timestamptz,
  add column if not exists standard_version int check (standard_version is null or standard_version >= 1);

comment on column public.materials.published_at is
  'MAT-1: quando o material foi ao ar pela primeira vez (nulo = nunca publicado). Só o banco grava; nunca é sobrescrita.';
comment on column public.materials.standard_version is
  'MAT-1: versão do padrão de conteúdos declarada pelo texto que originou a versão no ar (nulo = desconhecida/antiga).';

-- ----------------------------------------------------------------------------
-- 2. A versão do padrão que um texto declara
-- ----------------------------------------------------------------------------

-- Lê a linha "**Versão do padrão:** N" do cabeçalho (antes da primeira seção "### "), como a checagem do padrão
-- (`compendiumStandardCheck.ts`). Valor que não é um inteiro positivo, ou linha ausente: nulo.
create or replace function app.versao_do_padrao_do_texto(p_texto text)
returns int
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_cabecalho text;
  v_m text[];
begin
  if p_texto is null then
    return null;
  end if;
  v_cabecalho := pg_catalog.regexp_replace(p_texto, E'\r', '', 'g');
  v_cabecalho := pg_catalog.split_part(E'\n' || v_cabecalho, E'\n###', 1);
  v_m := pg_catalog.regexp_match(
    v_cabecalho,
    E'\n[ \t]*\\*\\*[ \t]*Vers[ãa]o do padr[ãa]o[ \t]*:[ \t]*\\*\\*[ \t]*([0-9]{1,6})[ \t]*(?=\n|$)',
    'i'
  );
  if v_m is null then
    return null;
  end if;
  if v_m[1]::int < 1 then
    return null;
  end if;
  return v_m[1]::int;
end;
$$;

revoke all on function app.versao_do_padrao_do_texto(text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Data de publicação: só o banco decide, uma vez
-- ----------------------------------------------------------------------------

create or replace function app.materials_datas_de_publicacao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.published_at is not null then
    -- Já foi ao ar: a data de primeira publicação não muda mais (despublicar e publicar de novo não conta).
    new.published_at := old.published_at;
  elsif current_user in ('authenticated', 'anon') then
    -- Quem usa a API não escolhe a data: ela nasce na primeira publicação.
    new.published_at := case when new.status = 'published' then pg_catalog.now() else null end;
  elsif new.status = 'published' and new.published_at is null then
    new.published_at := pg_catalog.now();
  end if;
  return new;
end;
$$;

revoke all on function app.materials_datas_de_publicacao() from public, anon, authenticated;

drop trigger if exists trg_materials_datas_de_publicacao on public.materials;
create trigger trg_materials_datas_de_publicacao
  before insert or update on public.materials
  for each row execute function app.materials_datas_de_publicacao();

-- ----------------------------------------------------------------------------
-- 4. "Atualizado em": a data anda quando uma seção entra, sai ou muda de texto
-- ----------------------------------------------------------------------------

create or replace function app.materials_marcar_mudanca_de_conteudo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_material uuid;
begin
  if tg_op = 'UPDATE' then
    -- Gravar o mesmo conteúdo de novo não é mudança (risco 17); a posição fica de fora (a atualização por arquivo
    -- cuida da ordem, e uma renumeração técnica não deve mover a data).
    if (new.material_id, new.title, new.mechanism_tag, new.content, new.key_takeaways, new.clinical_pearl, new.warning_alert)
       is not distinct from
       (old.material_id, old.title, old.mechanism_tag, old.content, old.key_takeaways, old.clinical_pearl, old.warning_alert) then
      return null;
    end if;
    v_material := new.material_id;
  elsif tg_op = 'INSERT' then
    v_material := new.material_id;
  else
    v_material := old.material_id;
  end if;
  update public.materials set updated_at = pg_catalog.now() where id = v_material;
  return null;
end;
$$;

revoke all on function app.materials_marcar_mudanca_de_conteudo() from public, anon, authenticated;

drop trigger if exists trg_material_sections_mudanca_de_conteudo on public.material_sections;
create trigger trg_material_sections_mudanca_de_conteudo
  after insert or delete or update of material_id, title, mechanism_tag, content, key_takeaways, clinical_pearl, warning_alert
  on public.material_sections
  for each row execute function app.materials_marcar_mudanca_de_conteudo();

-- ----------------------------------------------------------------------------
-- 5. A versão do padrão vai com o texto que foi ao ar
-- ----------------------------------------------------------------------------

create or replace function app.envio_publicado_grava_versao_do_padrao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_material uuid := coalesce(new.published_material_id, new.target_material_id);
  v_versao int;
begin
  -- "Nada mudou" (o arquivo é igual ao que está no ar) deixa um recado no envio: o arquivo exportado de um
  -- material antigo já declara a versão atual, e isso não torna o material atual.
  if v_material is null or new.publication_note is not null then
    return null;
  end if;
  v_versao := app.versao_do_padrao_do_texto(new.content_md);
  update public.materials set standard_version = v_versao
   where id = v_material and standard_version is distinct from v_versao;
  return null;
end;
$$;

revoke all on function app.envio_publicado_grava_versao_do_padrao() from public, anon, authenticated;

drop trigger if exists trg_material_submissions_versao_do_padrao on public.material_submissions;
create trigger trg_material_submissions_versao_do_padrao
  after update of status on public.material_submissions
  for each row
  when (new.status = 'publicado' and old.status is distinct from 'publicado')
  execute function app.envio_publicado_grava_versao_do_padrao();

-- ----------------------------------------------------------------------------
-- 6. "Importar material" (Admin) grava a versão do arquivo
-- ----------------------------------------------------------------------------

drop function if exists public.import_compendium_draft(uuid, uuid, uuid, text, text, text, int, text[], jsonb, text[], uuid, int, text, text, jsonb);

-- A mesma importação de 20260923120000, com o último parâmetro novo: a versão do padrão que o arquivo declara
-- (nulo = o arquivo não declara, ou não é .md). O cliente antigo, que não o manda, continua funcionando.
create or replace function public.import_compendium_draft(
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
  p_navigation_links jsonb default '[]'::jsonb,
  p_standard_version int default null
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
     parent_material_id, tree_sort_order, nav_short_title, taxonomy_kind, standard_version)
  values
    (p_id, p_discipline_id, p_theme_id, v_title, nullif(trim(coalesce(p_subtitle, '')), ''),
     nullif(trim(coalesce(p_author, '')), ''), p_estimated_read_time_minutes, coalesce(p_tags, '{}'), 'draft',
     p_parent_material_id, p_tree_sort_order,
     nullif(trim(coalesce(p_nav_short_title, '')), ''), nullif(p_taxonomy_kind, ''),
     case when p_standard_version >= 1 then p_standard_version end)
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

revoke all on function public.import_compendium_draft(uuid, uuid, uuid, text, text, text, int, text[], jsonb, text[], uuid, int, text, text, jsonb, int) from public, anon;
grant execute on function public.import_compendium_draft(uuid, uuid, uuid, text, text, text, int, text[], jsonb, text[], uuid, int, text, text, jsonb, int) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Aplicar uma atualização de material: histórico das seções e data de atualização
-- ----------------------------------------------------------------------------

-- A função da P8 (20261003120900), igual em tudo, menos: (a) cada seção casada cujo texto muda ganha uma versão em
-- `material_section_versions`; (b) quando o hash do conteúdo muda, `materials.updated_at` anda. A versão do padrão
-- não é tratada aqui: o gatilho do envio (item 5) a grava para este e para os demais caminhos.
create or replace function public.admin_aplicar_atualizacao(
  p_submission_id uuid,
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
  v_review uuid;
  m public.materials;
  v_title text;
  v_subtitle text;
  v_author text;
  v_minutes int;
  v_tags text[];
  v_motivo text;
  v_old_hash text;
  v_new_hash text;
  v_section jsonb;
  v_idx int;
  v_j int;
  v_ref text;
  -- casamento de seções
  v_ex_ids uuid[];
  v_ex_norm text[];
  v_ex_used boolean[];
  v_file_ids uuid[] := '{}';
  v_norm text;
  v_found uuid;
  v_kt text[];
  -- casamento de referências
  v_rf_ids uuid[];
  v_rf_txt text[];
  v_rf_used boolean[];
  v_rf_file uuid[] := '{}';
  -- posições: só se regravam quando a ordem relativa muda
  v_viu_nova boolean := false;
  v_nova_no_meio boolean := false;
  v_renum boolean;
  v_resto uuid[];
  v_prox int;
begin
  if not app.is_admin_active(auth.uid()) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;

  -- Trava do envio: duas aplicações do mesmo envio ao mesmo tempo se serializam.
  select * into s from public.material_submissions where id = p_submission_id for update;
  if not found or s.target_material_id is null then
    return jsonb_build_object('resultado', 'fora_de_estado');
  end if;
  if s.status = 'publicado' and s.applied_at is not null then
    return jsonb_build_object('resultado', 'ja_publicado', 'material_id', s.target_material_id);
  end if;
  -- "em_revisao": o revisor está lendo o texto agora; aplicar no meio faria o parecer chegar a um envio já aplicado.
  if s.status not in ('aguardando_revisao', 'apto', 'nao_apto', 'erro') or s.applied_at is not null then
    return jsonb_build_object('resultado', 'fora_de_estado', 'estado', s.status);
  end if;

  -- Quem chama leu este mesmo texto (senão o envio foi trocado no meio).
  if s.content_sha256 is distinct from p_content_sha256 then
    return jsonb_build_object('resultado', 'texto_mudou');
  end if;
  -- A revisão "apto" do texto e do lugar ATUAIS, feita sobre a base que o envio tem (senão ela não viu esta
  -- versão do material), se houver: só ela dá o selo. Qualquer outro parecer (ou nenhum) aplica sem selo.
  v_review := app.revisao_apto_do_envio(s.id);
  if v_review is not null then
    select * into r from public.material_reviews where id = v_review;
    if r.base_snapshot_hash is distinct from s.base_snapshot_hash then
      v_review := null;
    end if;
  end if;

  if p_material is null or jsonb_typeof(p_material) <> 'object'
     or jsonb_typeof(p_material->'sections') is distinct from 'array'
     or jsonb_array_length(p_material->'sections') = 0 then
    return jsonb_build_object('resultado', 'texto_invalido');
  end if;
  v_title := btrim(coalesce(p_material->>'title', ''));
  if v_title = '' then
    return jsonb_build_object('resultado', 'texto_invalido');
  end if;

  -- O material fica travado durante a aplicação (e ninguém o publica/despublica no meio).
  select * into m from public.materials where id = s.target_material_id for update;

  -- Recusas que o dono resolve reenviando (nada é gravado).
  if not found or m.status <> 'published' then
    v_motivo := 'O material que você quis atualizar não está mais publicado. Nada foi alterado.';
  elsif m.discipline_id <> s.discipline_id or m.theme_id <> s.theme_id
        or m.parent_material_id is distinct from s.parent_material_id then
    v_motivo := 'O material mudou de lugar na árvore depois do envio. Envie a atualização de novo (o envio volta para a revisão).';
  elsif s.base_snapshot_hash is distinct from app.material_snapshot_hash(m.id) then
    v_motivo := 'O material mudou depois que você enviou esta atualização (outra atualização ou uma edição). Exporte o material de novo, refaça as mudanças sobre a versão atual e envie outra vez.';
  elsif exists (
    select 1 from public.materials o where o.id <> m.id and app.titulo_normalizado(o.title) = app.titulo_normalizado(v_title)
  ) then
    v_motivo := format('Já existe outro material com o título “%s”. Troque o título do arquivo e envie de novo (o texto muda, então o envio volta para a revisão).', v_title);
  end if;
  if v_motivo is not null then
    return jsonb_build_object('resultado', 'recusado', 'motivo', v_motivo);
  end if;

  begin
    v_old_hash := app.material_snapshot_hash(m.id);

    v_subtitle := nullif(btrim(coalesce(p_material->>'subtitle', '')), '');
    v_author := nullif(btrim(coalesce(p_material->>'author', '')), '');
    v_minutes := nullif(p_material->>'estimated_read_time_minutes', '')::int;
    v_tags := coalesce((select array_agg(t.value) from jsonb_array_elements_text(coalesce(p_material->'tags', '[]'::jsonb)) t), '{}');

    -- Campos do material, só o que mudou (o arquivo sem tags vira a etiqueta "Geral" na importação:
    -- para um material sem etiquetas isso não é mudança).
    update public.materials set
      title = v_title,
      subtitle = v_subtitle,
      author = v_author,
      estimated_read_time_minutes = v_minutes,
      tags = v_tags,
      updated_at = now()
    where id = m.id
      and (
        title is distinct from v_title
        or coalesce(subtitle, '') is distinct from coalesce(v_subtitle, '')
        or coalesce(author, '') is distinct from coalesce(v_author, '')
        or estimated_read_time_minutes is distinct from v_minutes
        or (tags is distinct from v_tags and not (cardinality(tags) = 0 and v_tags = array['Geral']::text[]))
      );

    -- --- Seções: casa pelo título normalizado, na ordem (a k-ésima repetição casa com a k-ésima) ---
    select coalesce(array_agg(x.id order by x.sort_order), '{}'),
           coalesce(array_agg(app.titulo_normalizado(x.title) order by x.sort_order), '{}')
      into v_ex_ids, v_ex_norm
      from public.material_sections x where x.material_id = m.id;
    v_ex_used := array_fill(false, array[coalesce(cardinality(v_ex_ids), 0)]);

    v_idx := 0;
    for v_section in select * from jsonb_array_elements(p_material->'sections') loop
      if btrim(coalesce(v_section->>'title', '')) = '' or btrim(coalesce(v_section->>'content', '')) = '' then
        raise exception 'seção % sem título ou sem conteúdo', v_idx + 1;
      end if;
      v_norm := app.titulo_normalizado(v_section->>'title');
      v_found := null;
      for v_j in 1 .. coalesce(cardinality(v_ex_ids), 0) loop
        if not v_ex_used[v_j] and v_ex_norm[v_j] = v_norm then
          v_found := v_ex_ids[v_j];
          v_ex_used[v_j] := true;
          exit;
        end if;
      end loop;
      v_file_ids := v_file_ids || v_found;   -- nulo = seção nova
      if v_found is null then
        v_viu_nova := true;
      elsif v_viu_nova then
        v_nova_no_meio := true;   -- seção nova antes de uma que continua: as posições mudam
      end if;
      v_idx := v_idx + 1;
    end loop;

    -- O que sai do arquivo sai do material (a anotação do aluno continua dele: trigger da 45-D;
    -- a ligação da questão com a seção fica sem seção, mas com o material).
    delete from public.material_sections
     where material_id = m.id and id <> all (array_remove(v_file_ids, null));
    -- As posições só são regravadas quando a ORDEM RELATIVA muda (seção reordenada ou nova antes de
    -- uma que continua). Renumerar 0..n-1 um material cujas posições já estão em ordem (ex.: a
    -- primeira seção na posição 1) mudaria o hash sem mudar o conteúdo: ida e volta sem mudança
    -- precisa ser "sem mudança" (AGENTS.md, risco 17). Seção nova no fim entra depois da última.
    select coalesce(array_agg(x.id order by x.sort_order), '{}') into v_resto
      from public.material_sections x where x.material_id = m.id;
    v_renum := v_nova_no_meio or v_resto is distinct from array_remove(v_file_ids, null);
    select case when v_renum then 0 else coalesce(max(x.sort_order) + 1, 0) end into v_prox
      from public.material_sections x where x.material_id = m.id;
    if v_renum then
      -- Libera as posições (unique material_id + sort_order) antes de reordenar.
      update public.material_sections set sort_order = sort_order + 1000000
       where material_id = m.id and sort_order < 1000000;
    end if;

    v_idx := 0;
    for v_section in select * from jsonb_array_elements(p_material->'sections') loop
      v_kt := coalesce((select array_agg(k.value) from jsonb_array_elements_text(coalesce(v_section->'key_takeaways', '[]'::jsonb)) k), '{}');
      if v_file_ids[v_idx + 1] is null then
        insert into public.material_sections
          (material_id, sort_order, title, mechanism_tag, content, key_takeaways, clinical_pearl, warning_alert)
        values (
          m.id, case when v_renum then v_idx else v_prox end, btrim(v_section->>'title'),
          nullif(v_section->>'mechanism_tag', ''), v_section->>'content', v_kt,
          nullif(v_section->>'clinical_pearl', ''), nullif(v_section->>'warning_alert', '')
        );
        v_prox := v_prox + 1;
      else
        -- MAT-1: a seção que muda de texto ganha uma versão no histórico (o mesmo da edição na leitura, ED-2).
        insert into public.material_section_versions
          (material_section_id, changed_by, changed_fields, reason, before_snapshot, after_snapshot)
        select x.id, auth.uid(),
               array_remove(array[
                 case when x.title is distinct from btrim(v_section->>'title') then 'title' end,
                 case when x.mechanism_tag is distinct from nullif(v_section->>'mechanism_tag', '') then 'mechanismTag' end,
                 case when x.content is distinct from v_section->>'content' then 'content' end,
                 case when x.key_takeaways is distinct from v_kt then 'keyTakeaways' end,
                 case when x.clinical_pearl is distinct from nullif(v_section->>'clinical_pearl', '') then 'clinicalPearl' end,
                 case when x.warning_alert is distinct from nullif(v_section->>'warning_alert', '') then 'warningAlert' end
               ], null),
               'Atualização por arquivo',
               jsonb_strip_nulls(jsonb_build_object(
                 'title', x.title, 'mechanismTag', x.mechanism_tag, 'content', x.content,
                 'keyTakeaways', to_jsonb(x.key_takeaways), 'clinicalPearl', x.clinical_pearl, 'warningAlert', x.warning_alert)),
               jsonb_strip_nulls(jsonb_build_object(
                 'title', btrim(v_section->>'title'), 'mechanismTag', nullif(v_section->>'mechanism_tag', ''),
                 'content', v_section->>'content', 'keyTakeaways', to_jsonb(v_kt),
                 'clinicalPearl', nullif(v_section->>'clinical_pearl', ''), 'warningAlert', nullif(v_section->>'warning_alert', '')))
          from public.material_sections x
         where x.id = v_file_ids[v_idx + 1]
           and (x.title is distinct from btrim(v_section->>'title')
             or x.mechanism_tag is distinct from nullif(v_section->>'mechanism_tag', '')
             or x.content is distinct from v_section->>'content'
             or x.key_takeaways is distinct from v_kt
             or x.clinical_pearl is distinct from nullif(v_section->>'clinical_pearl', '')
             or x.warning_alert is distinct from nullif(v_section->>'warning_alert', ''));

        update public.material_sections set
          sort_order = case when v_renum then v_idx else sort_order end,
          title = btrim(v_section->>'title'),
          mechanism_tag = nullif(v_section->>'mechanism_tag', ''),
          content = v_section->>'content',
          key_takeaways = v_kt,
          clinical_pearl = nullif(v_section->>'clinical_pearl', ''),
          warning_alert = nullif(v_section->>'warning_alert', ''),
          updated_at = case
            when title is distinct from btrim(v_section->>'title')
              or mechanism_tag is distinct from nullif(v_section->>'mechanism_tag', '')
              or content is distinct from v_section->>'content'
              or key_takeaways is distinct from v_kt
              or clinical_pearl is distinct from nullif(v_section->>'clinical_pearl', '')
              or warning_alert is distinct from nullif(v_section->>'warning_alert', '')
            then now() else updated_at end
        where id = v_file_ids[v_idx + 1];
      end if;
      v_idx := v_idx + 1;
    end loop;

    -- --- Referências: texto idêntico mantém a linha (e o vínculo com a fonte curada) ---
    select coalesce(array_agg(x.id order by x.sort_order, x.created_at, x.id), '{}'),
           coalesce(array_agg(btrim(x.citation_text) order by x.sort_order, x.created_at, x.id), '{}')
      into v_rf_ids, v_rf_txt
      from public.material_references x where x.material_id = m.id;
    v_rf_used := array_fill(false, array[coalesce(cardinality(v_rf_ids), 0)]);

    v_viu_nova := false;
    v_nova_no_meio := false;
    for v_ref in select btrim(value) from jsonb_array_elements_text(coalesce(p_material->'references', '[]'::jsonb)) loop
      v_found := null;
      for v_j in 1 .. coalesce(cardinality(v_rf_ids), 0) loop
        if not v_rf_used[v_j] and v_rf_txt[v_j] = v_ref then
          v_found := v_rf_ids[v_j];
          v_rf_used[v_j] := true;
          exit;
        end if;
      end loop;
      v_rf_file := v_rf_file || v_found;
      if v_found is null then
        v_viu_nova := true;
      elsif v_viu_nova then
        v_nova_no_meio := true;
      end if;
    end loop;

    delete from public.material_references
     where material_id = m.id and id <> all (array_remove(v_rf_file, null));
    -- Mesma regra das seções: só regrava as posições quando a ordem relativa muda.
    select coalesce(array_agg(x.id order by x.sort_order, x.created_at, x.id), '{}') into v_resto
      from public.material_references x where x.material_id = m.id;
    v_renum := v_nova_no_meio or v_resto is distinct from array_remove(v_rf_file, null);
    select case when v_renum then 0 else coalesce(max(x.sort_order) + 1, 0) end into v_prox
      from public.material_references x where x.material_id = m.id;
    v_idx := 0;
    for v_ref in select btrim(value) from jsonb_array_elements_text(coalesce(p_material->'references', '[]'::jsonb)) loop
      if v_rf_file[v_idx + 1] is null then
        insert into public.material_references (material_id, citation_text, sort_order)
        values (m.id, v_ref, case when v_renum then v_idx else v_prox end);
        v_prox := v_prox + 1;
      elsif v_renum then
        update public.material_references set sort_order = v_idx
         where id = v_rf_file[v_idx + 1] and sort_order is distinct from v_idx;
      end if;
      v_idx := v_idx + 1;
    end loop;

    v_new_hash := app.material_snapshot_hash(m.id);

    if v_new_hash = v_old_hash then
      -- O arquivo é igual ao que está no ar: nada muda (nem a atestação, nem a proveniência).
      update public.material_submissions
         set status = 'publicado', applied_at = now(),
             publication_note = 'O arquivo é igual ao material que está no ar: nada mudou.'
       where id = s.id;
      return jsonb_build_object('resultado', 'sem_mudanca', 'material_id', m.id);
    end if;

    -- MAT-1: o conteúdo mudou (inclusive só a ordem das seções ou as referências): "Atualizado em" anda.
    update public.materials set updated_at = pg_catalog.now() where id = m.id;

    -- Com revisão "apto", a proveniência passa a valer para o conteúdo NOVO, na mesma transação que o trocou.
    -- Sem ela, a proveniência que já existia (do conteúdo antigo) deixa de bater com o hash e o selo some.
    if v_review is not null then
      insert into public.material_ai_provenance
        (material_id, submission_id, review_id, review_verdict, reviewed_at, model, text_sha256, snapshot_hash)
      values
        (m.id, s.id, r.id, 'apto', r.completed_at, r.model, s.content_sha256, v_new_hash)
      on conflict (material_id) do update set
        submission_id = excluded.submission_id,
        review_id = excluded.review_id,
        review_verdict = excluded.review_verdict,
        reviewed_at = excluded.reviewed_at,
        model = excluded.model,
        text_sha256 = excluded.text_sha256,
        snapshot_hash = excluded.snapshot_hash;
    end if;

    update public.material_submissions
       set status = 'publicado', applied_at = now(), publication_note = null
     where id = s.id;
  exception when others then
    -- Tudo o que o bloco fez foi desfeito: o material continua como estava e o envio também. O detalhe técnico
    -- fica só no log do banco.
    raise warning 'admin_aplicar_atualizacao % falhou: %', p_submission_id, sqlerrm;
    return jsonb_build_object('resultado', 'falhou');
  end;

  return jsonb_build_object('resultado', 'aplicado', 'material_id', m.id);
end;
$$;

revoke all on function public.admin_aplicar_atualizacao(uuid, text, jsonb) from public, anon;
grant execute on function public.admin_aplicar_atualizacao(uuid, text, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. Os materiais que já existem
-- ----------------------------------------------------------------------------

-- Só preenche o que está nulo (rodar de novo não muda nada). Fontes, da melhor para a pior:
--   * data de publicação: o envio que criou o material (quando o servidor o publicou); senão a primeira atestação
--     aprovada do conteúdo; senão, para material no ar, a criação. Material arquivado sem nenhuma fonte fica sem data.
--   * versão do padrão: a linha "**Versão do padrão:** N" do texto do envio mais recente que foi ao ar para o material
--     (criou-o ou o atualizou); sem envio, ou sem a linha, fica nula.
create or replace function app.preencher_datas_e_versao_do_padrao()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.materials m
     set published_at = coalesce(
           (select min(s.updated_at) from public.material_submissions s
             where s.published_material_id = m.id and s.status = 'publicado'),
           (select min(cr.created_at) from public.content_reviews cr
              join public.content_revisions cv on cv.id = cr.content_revision_id
             where cv.material_id = m.id and cr.decision = 'aprovado'),
           case when m.status = 'published' then m.created_at end
         )
   where m.published_at is null and m.status in ('published', 'archived');

  update public.materials m
     set standard_version = v.versao
    from (
      select distinct on (x.material_id) x.material_id, app.versao_do_padrao_do_texto(x.content_md) as versao
        from (
          select coalesce(s.published_material_id, s.target_material_id) as material_id, s.content_md, s.updated_at
            from public.material_submissions s
           where s.status = 'publicado'
             and s.publication_note is null
             and coalesce(s.published_material_id, s.target_material_id) is not null
        ) x
       order by x.material_id, x.updated_at desc
    ) v
   where m.id = v.material_id and m.standard_version is null and v.versao is not null;
end;
$$;

revoke all on function app.preencher_datas_e_versao_do_padrao() from public, anon, authenticated;

select app.preencher_datas_e_versao_do_padrao();
