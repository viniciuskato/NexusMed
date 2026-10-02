-- ============================================================================
-- 44-B — Atualizar um material publicado a partir de arquivo, pelo revisor de IA
--
-- Decisões do dono (29/09): D-10 (a volta à fila é do revisor) e D-11 (tudo que vai
-- ao ar passa pelo revisor). Adaptação da unidade 44-B: exportar o material para o
-- `.md` do padrão é livre; ATUALIZAR um material publicado a partir de um `.md` é um
-- envio do tipo "atualização de <material>", que passa pelo mesmo revisor de IA
-- (mesma fila, mesmos limites de custo). Com o "apto" do texto e do lugar atuais, o
-- servidor substitui o conteúdo do material publicado, uma vez só, preservando:
--   * o id das seções casadas pelo título (o título normalizado: sem acento, sem
--     maiúscula, espaços colapsados) — e, com o id, anotações, progresso de leitura
--     e questões ligadas à seção;
--   * a linha das referências de texto idêntico — e, com ela, o vínculo com a fonte
--     curada (`source_id`/`url`);
--   * a posição na árvore, os filhos, as ligações "Estude antes"/"Veja também" e as
--     questões ligadas ao material (nada disso é tocado).
-- Seção que não casa é seção nova; seção que sai do arquivo é removida (a anotação do
-- aluno continua dele, 45-D). "não apto" não muda nada no ar.
--
-- Nunca há momento em que o material publicado fique sem revisão válida para o
-- conteúdo no ar: a substituição e a nova proveniência ("revisado por IA" com o hash
-- do conteúdo novo) acontecem na MESMA transação. Arquivo igual ao que está no ar não
-- muda nada (nem a atestação, nem a proveniência): o envio termina "publicado" com o
-- recado "nada mudou".
--
-- Quem pode pedir a atualização: admin ativo, e o autor do envio que publicou aquele
-- material. O lugar do envio é sempre o do material (Disciplina, Tema e material acima
-- vêm do material, no banco; a pessoa não os escolhe aqui).
--
-- Proteção contra atualização em cima de versão velha: o envio guarda o hash do
-- material no momento do envio (`base_snapshot_hash`). Se o material mudar depois (outra
-- atualização, edição do admin), o servidor recusa aplicar, com recado leigo; reenviar
-- refaz a base e volta o envio para a revisão.
--
-- AGENTS.md riscos 13 e 14: toda função nova com revoke de public/anon (e de
-- authenticated quando é do servidor).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. O envio de atualização
-- ----------------------------------------------------------------------------

alter table public.material_submissions
  -- O material publicado que este envio atualiza. Nulo = envio de material novo (44-E).
  add column target_material_id uuid references public.materials(id) on delete cascade,
  -- Hash do material no momento do envio (só o banco grava): a atualização é sobre essa versão.
  add column base_snapshot_hash text,
  -- Quando o servidor aplicou a atualização (só o servidor grava). Nulo = ainda não aplicada.
  add column applied_at timestamptz,
  -- Um envio ou cria um material (published_material_id) ou atualiza um (target_material_id).
  add constraint material_submissions_um_destino
    check (target_material_id is null or published_material_id is null),
  add constraint material_submissions_atualizacao_completa
    check (target_material_id is null or base_snapshot_hash is not null);

create index material_submissions_target_idx on public.material_submissions (target_material_id)
  where target_material_id is not null;

comment on column public.material_submissions.target_material_id is
  '44-B: material publicado que este envio atualiza (envio do tipo "atualização"); nulo nos envios de material novo.';

-- O cliente só escolhe o material a atualizar ao CRIAR o envio; depois ele não muda.
grant insert (target_material_id) on table public.material_submissions to authenticated;

-- ----------------------------------------------------------------------------
-- 1. Quem pode atualizar
-- ----------------------------------------------------------------------------

-- Admin ativo, ou o autor (ativo) do envio que publicou o material.
create or replace function app.pode_atualizar_material(p_user uuid, p_material uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null
    and app.current_profile_status(p_user) = 'active'
    and (
      app.is_admin_active(p_user)
      or exists (
        select 1 from public.material_submissions s
        where s.published_material_id = p_material
          and s.author_id = p_user
          and s.status = 'publicado'
      )
    );
$$;

revoke all on function app.pode_atualizar_material(uuid, uuid) from public, anon;
grant execute on function app.pode_atualizar_material(uuid, uuid) to authenticated;

-- O lugar e a versão (hash) do material PUBLICADO a atualizar. A pessoa não lê o hash direto
-- (`app.material_snapshot_hash` é só do servidor): o gatilho do envio o pede por aqui. Material que não
-- está publicado não devolve linha.
create or replace function app.alvo_da_atualizacao(p_material uuid)
returns table (discipline_id uuid, theme_id uuid, parent_material_id uuid, snapshot_hash text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.discipline_id, m.theme_id, m.parent_material_id, app.material_snapshot_hash(m.id)
  from public.materials m
  where m.id = p_material and m.status = 'published';
$$;

revoke all on function app.alvo_da_atualizacao(uuid) from public, anon;
grant execute on function app.alvo_da_atualizacao(uuid) to authenticated, service_role;

-- A tela pergunta se mostra "Exportar .md" e "Atualizar a partir de arquivo" naquele material: a mesma regra do
-- banco, sobre quem está logado.
create or replace function public.pode_atualizar_material(p_material uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app.pode_atualizar_material(auth.uid(), p_material), false);
$$;

revoke all on function public.pode_atualizar_material(uuid) from public, anon;
grant execute on function public.pode_atualizar_material(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Gatilho do envio (a versão da 44-G, com o tipo "atualização")
-- ----------------------------------------------------------------------------

create or replace function app.material_submissions_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_client boolean := current_user in ('authenticated', 'anon');
  v_enters_queue boolean;
  v_alvo record;
begin
  -- Envio de atualização: o material tem de estar publicado e a pessoa pode atualizá-lo; o lugar é o
  -- do material (no banco, a cada gravação da pessoa: reenviar refaz o lugar e a base).
  if new.target_material_id is not null then
    if tg_op = 'UPDATE' then
      new.target_material_id := old.target_material_id;
    end if;
    -- Só quando a pessoa cria ou reenvia: o servidor muda o estado do envio (recusa, "erro"...) mesmo
    -- que o material já tenha saído do ar.
    if tg_op = 'INSERT' or v_client then
      -- Primeiro quem pode (sem revelar se o material existe a quem não pode); depois o estado do material.
      if v_client and not app.pode_atualizar_material(auth.uid(), new.target_material_id) then
        raise exception 'só quem é admin ou enviou este material pode atualizá-lo' using errcode = '42501';
      end if;
      select * into v_alvo from app.alvo_da_atualizacao(new.target_material_id);
      if not found then
        raise exception 'o material a atualizar precisa estar publicado' using errcode = 'P0001';
      end if;
      new.discipline_id := v_alvo.discipline_id;
      new.theme_id := v_alvo.theme_id;
      new.parent_material_id := v_alvo.parent_material_id;
      new.base_snapshot_hash := v_alvo.snapshot_hash;
    end if;
  end if;

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
      new.status := case
        when new.content_md = old.content_md
             and app.envio_tem_revisao_apto_do_autor(old.id, new.discipline_id, new.theme_id, new.parent_material_id)
             -- Atualização: a revisão foi sobre o texto E sobre a versão do material daquela hora.
             and (new.target_material_id is null or new.base_snapshot_hash is not distinct from old.base_snapshot_hash)
          then 'apto'
        else 'aguardando_revisao'
      end;
      new.author_id := old.author_id;
      new.created_at := old.created_at;
      new.publication_note := null;
      new.published_material_id := old.published_material_id;
      new.applied_at := old.applied_at;
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

-- Só o material NOVO (sem alvo) entra na fila de "criar e publicar" da 44-G.
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
    and s.target_material_id is null
    and app.revisao_apto_do_envio(s.id) is not null
  order by s.updated_at, s.id
  limit greatest(p_max, 0);
$$;

revoke all on function public.revisao_envios_para_publicar(int) from public, anon, authenticated;
grant execute on function public.revisao_envios_para_publicar(int) to service_role;

-- ----------------------------------------------------------------------------
-- 3. Aplicar a atualização (só service_role)
-- ----------------------------------------------------------------------------

-- Título de seção para casar: sem acento, sem maiúscula, espaços colapsados.
create or replace function app.titulo_normalizado(p_titulo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(btrim(translate(
    coalesce(p_titulo, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'
  )), '\s+', ' ', 'g'));
$$;

revoke all on function app.titulo_normalizado(text) from public, anon;
grant execute on function app.titulo_normalizado(text) to authenticated, service_role;

-- Envios de atualização "apto" cujo texto atual tem revisão "apto" e que ainda não foram aplicados.
create or replace function public.revisao_envios_de_atualizacao_para_aplicar(p_max int default 5)
returns table (
  submission_id uuid,
  review_id uuid,
  content_md text,
  content_sha256 text,
  target_material_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, app.revisao_apto_do_envio(s.id), s.content_md, s.content_sha256, s.target_material_id
  from public.material_submissions s
  where s.status = 'apto'
    and s.target_material_id is not null
    and s.applied_at is null
    and app.revisao_apto_do_envio(s.id) is not null
  order by s.updated_at, s.id
  limit greatest(p_max, 0);
$$;

-- Aplica a atualização ao material publicado, tudo ou nada. `p_material` é a leitura do texto
-- feita pelo servidor (o mesmo importador da tela): título, subtítulo, autor, tempo de leitura,
-- tags, seções e referências. O lugar, o modo, o foco de estudo, o módulo e a proveniência do
-- material NÃO vêm do arquivo: ficam como estão.
--
-- Devolve {resultado, material_id?, motivo?}:
--   aplicado        o conteúdo foi substituído e a proveniência "revisado por IA" passou a valer para ele;
--   sem_mudanca     o arquivo é igual ao que está no ar: nada foi tocado (o envio termina "publicado" com recado);
--   ja_publicado    o envio já tinha sido aplicado (nada foi feito);
--   recusado        o envio foi a "nao_apto" com o motivo em `publication_note` (material fora do ar, mudou
--                   de lugar ou de conteúdo depois do envio, título de outro material); nada foi tocado;
--   falhou          erro inesperado: o envio foi a "erro" (dá para tentar de novo) e nada mudou;
--   fora_de_estado, revisao_invalida  o envio não está pronto: nada foi feito.
create or replace function public.revisao_aplicar_atualizacao(
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
begin
  -- Trava do envio: duas aplicações do mesmo envio ao mesmo tempo se serializam.
  select * into s from public.material_submissions where id = p_submission_id for update;
  if not found or s.target_material_id is null then
    return jsonb_build_object('resultado', 'fora_de_estado');
  end if;
  if s.status = 'publicado' and s.applied_at is not null then
    return jsonb_build_object('resultado', 'ja_publicado', 'material_id', s.target_material_id);
  end if;
  if s.status <> 'apto' or s.applied_at is not null then
    return jsonb_build_object('resultado', 'fora_de_estado');
  end if;

  -- A revisão "apto" tem de ser a do texto E do lugar ATUAIS do envio (e a mais recente do texto),
  -- e o servidor tem de ter lido esse mesmo texto.
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

  -- O material fica travado durante a aplicação (e ninguém o publica/despublica no meio).
  select * into m from public.materials where id = s.target_material_id for update;

  -- Recusas que a pessoa resolve reenviando.
  if not found or m.status <> 'published' then
    v_motivo := 'O material que você quis atualizar não está mais publicado. Nada foi alterado.';
  elsif m.discipline_id <> s.discipline_id or m.theme_id <> s.theme_id
        or m.parent_material_id is distinct from s.parent_material_id then
    v_motivo := 'O material mudou de lugar na árvore depois do envio. Envie a atualização de novo (o envio volta para a revisão).';
  elsif s.base_snapshot_hash is distinct from app.material_snapshot_hash(m.id) then
    v_motivo := 'O material mudou depois que você enviou esta atualização (outra atualização ou uma edição). Exporte o material de novo, refaça as mudanças sobre a versão atual e envie outra vez.';
  elsif exists (
    select 1 from public.materials o where o.id <> m.id and lower(btrim(o.title)) = lower(v_title)
  ) then
    v_motivo := format('Já existe outro material com o título “%s”. Troque o título do arquivo e envie de novo (o texto muda, então o envio volta para a revisão).', v_title);
  end if;
  if v_motivo is not null then
    update public.material_submissions set status = 'nao_apto', publication_note = v_motivo where id = s.id;
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
      v_idx := v_idx + 1;
    end loop;

    -- O que sai do arquivo sai do material (a anotação do aluno continua dele: trigger da 45-D;
    -- a ligação da questão com a seção fica sem seção, mas com o material).
    delete from public.material_sections
     where material_id = m.id and id <> all (array_remove(v_file_ids, null));
    -- Libera as posições (unique material_id + sort_order) antes de reordenar.
    update public.material_sections set sort_order = sort_order + 1000000
     where material_id = m.id and sort_order < 1000000;

    v_idx := 0;
    for v_section in select * from jsonb_array_elements(p_material->'sections') loop
      v_kt := coalesce((select array_agg(k.value) from jsonb_array_elements_text(coalesce(v_section->'key_takeaways', '[]'::jsonb)) k), '{}');
      if v_file_ids[v_idx + 1] is null then
        insert into public.material_sections
          (material_id, sort_order, title, mechanism_tag, content, key_takeaways, clinical_pearl, warning_alert)
        values (
          m.id, v_idx, btrim(v_section->>'title'),
          nullif(v_section->>'mechanism_tag', ''), v_section->>'content', v_kt,
          nullif(v_section->>'clinical_pearl', ''), nullif(v_section->>'warning_alert', '')
        );
      else
        update public.material_sections set
          sort_order = v_idx,
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
    end loop;

    delete from public.material_references
     where material_id = m.id and id <> all (array_remove(v_rf_file, null));
    v_idx := 0;
    for v_ref in select btrim(value) from jsonb_array_elements_text(coalesce(p_material->'references', '[]'::jsonb)) loop
      if v_rf_file[v_idx + 1] is null then
        insert into public.material_references (material_id, citation_text, sort_order)
        values (m.id, v_ref, v_idx);
      else
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

    -- A proveniência passa a valer para o conteúdo NOVO, na mesma transação que o trocou.
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

    update public.material_submissions
       set status = 'publicado', applied_at = now(), publication_note = null
     where id = s.id;
  exception when others then
    -- Tudo o que o bloco fez foi desfeito: o material continua como estava. O envio vai a "erro"
    -- (a pessoa pode tentar de novo: com revisão "apto" válida, "Tentar de novo" volta o envio a
    -- "apto" e só a aplicação é refeita) e o detalhe técnico fica só no log do banco.
    raise warning 'revisao_aplicar_atualizacao % falhou: %', p_submission_id, sqlerrm;
    update public.material_submissions
       set status = 'erro',
           publication_note = 'Não conseguimos atualizar o material agora. O material não foi alterado e seu texto não foi rejeitado; tente de novo.'
     where id = s.id;
    return jsonb_build_object('resultado', 'falhou');
  end;

  return jsonb_build_object('resultado', 'aplicado', 'material_id', m.id);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.revisao_envios_de_atualizacao_para_aplicar(int)',
    'public.revisao_aplicar_atualizacao(uuid, uuid, text, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. O autor vê só a revisão do texto E do lugar atuais
-- ----------------------------------------------------------------------------

-- O lugar que a IA recebeu junto com o texto (44-F) passa a ser legível pelo autor (a RLS já limita às
-- revisões dos envios dele): a tela só mostra o veredito que vale para o lugar de agora (achado da 44-H3).
grant select (discipline_id, theme_id, parent_material_id) on table public.material_reviews to authenticated;
