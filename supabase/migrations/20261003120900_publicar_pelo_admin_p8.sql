-- ============================================================================
-- P8 — O dono publica o envio com um clique, depois do parecer
--
-- Decisão do dono (03/10): "o revisor aconselha, quem decide sou eu" e "só eu publico". O parecer do
-- revisor de IA (apto, não apto, erro) é um conselho: o admin pode publicar um envio de material, publicar um
-- envio de questões ou aplicar uma atualização de material em QUALQUER estado em que o envio esteja
-- (aguardando revisão, apto, não apto, erro), pela tela de Envios. Até aqui só a Edge Function (desligada, D-12)
-- publicava envio, e só o "apto".
--
-- O que esta migration faz (nenhuma função existente é alterada; as `revisao_*` do servidor ficam como estão):
--   1. `admin_publicar_envio`: cria o material do envio e o publica, com o mesmo resultado de
--      `revisao_publicar_envio` (seções, referências, lugar na árvore, proveniência).
--   2. `admin_publicar_questoes`: cria as questões do lote e as publica, como `revisao_publicar_questoes`.
--   3. `admin_aplicar_atualizacao`: troca o conteúdo do material publicado, como `revisao_aplicar_atualizacao`
--      (preserva o id das seções casadas pelo título, as referências iguais, a árvore, as ligações).
--
-- Só admin ativo chama (`acesso negado` para qualquer outra pessoa: 42501). O selo "Revisado por IA" só nasce quando
-- o texto atual do envio tem revisão "apto" válida (a proveniência é gravada só então): sem "apto" o conteúdo vai
-- ao ar sem selo, e o selo continua dependendo do hash do conteúdo (se ele mudar, o selo some). Quem chama passa o
-- hash do texto que leu (`p_content_sha256`): se o texto do envio mudou no meio, nada é publicado.
--
-- Diferença para as funções do servidor: elas mudavam o estado do envio ao recusar ("não apto") ou falhar
-- ("erro"). Aqui o dono decide, então uma recusa (título repetido, material acima fora do ar, material que não se
-- acha) ou uma falha só devolve o motivo e NÃO mexe no envio; nada fica criado.
--
-- Devolve {resultado, ...}: publicado | aplicado | sem_mudanca | ja_publicado | recusado (motivo) | falhou |
-- texto_mudou | texto_invalido | fora_de_estado (estado: "em_revisao" quando o revisor está lendo agora).
--
-- AGENTS.md riscos 13 e 14: nenhuma tabela nova; função nova de cliente logado com revoke de public/anon e a
-- checagem de admin dentro dela.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Publicar um envio de material novo
-- ----------------------------------------------------------------------------

-- A mesma criação de `revisao_publicar_envio` (20261003120200): o material, as seções, as referências, o lugar
-- na árvore e a proveniência, tudo ou nada.
create or replace function public.admin_publicar_envio(
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
  v_parent public.materials;
  v_title text;
  v_section jsonb;
  v_ref text;
  v_material_id uuid;
  v_idx int;
  v_order int;
  v_motivo text;
begin
  if not app.is_admin_active(auth.uid()) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;

  -- Trava do envio: duas publicações do mesmo envio ao mesmo tempo se serializam.
  select * into s from public.material_submissions where id = p_submission_id for update;
  if not found or s.target_material_id is not null then
    -- Envio de atualização tem o seu caminho (`admin_aplicar_atualizacao`).
    return jsonb_build_object('resultado', 'fora_de_estado');
  end if;
  if s.status = 'publicado' and s.published_material_id is not null then
    return jsonb_build_object('resultado', 'ja_publicado', 'material_id', s.published_material_id);
  end if;
  -- "em_revisao": o revisor está lendo o texto agora; publicar no meio faria o parecer chegar a um envio já publicado.
  if s.status not in ('aguardando_revisao', 'apto', 'nao_apto', 'erro') or s.published_material_id is not null then
    return jsonb_build_object('resultado', 'fora_de_estado', 'estado', s.status);
  end if;

  -- Quem chama leu este mesmo texto (senão o envio foi trocado no meio).
  if s.content_sha256 is distinct from p_content_sha256 then
    return jsonb_build_object('resultado', 'texto_mudou');
  end if;
  -- A revisão "apto" do texto e do lugar ATUAIS, se houver: só ela dá o selo. Qualquer outro parecer (ou nenhum) publica sem selo.
  v_review := app.revisao_apto_do_envio(s.id);
  if v_review is not null then
    select * into r from public.material_reviews where id = v_review;
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

  -- Recusas que o dono resolve corrigindo o envio (nada é gravado).
  if exists (select 1 from public.materials m where lower(btrim(m.title)) = lower(v_title)) then
    v_motivo := format('Já existe um material com o título “%s”. Troque o título do arquivo e envie de novo (o texto muda, então o envio volta para a revisão).', v_title);
  elsif s.parent_material_id is not null then
    select * into v_parent from public.materials where id = s.parent_material_id;
    if not found or v_parent.status <> 'published' then
      v_motivo := 'O material que você escolheu como “material acima” não está mais publicado. Escolha outro, ou deixe em branco, e envie de novo: como o lugar do material muda, o envio volta para a revisão.';
    elsif v_parent.discipline_id <> s.discipline_id or v_parent.theme_id <> s.theme_id then
      v_motivo := 'O material que você escolheu como “material acima” é de outra Disciplina ou de outro Tema. Escolha um do mesmo Tema, ou deixe em branco, e envie de novo: como o lugar do material muda, o envio volta para a revisão.';
    end if;
  end if;
  if v_motivo is not null then
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

    -- A proveniência ("Revisado por IA") só existe com revisão "apto" do texto atual. Ela guarda o hash do
    -- material COMO FOI CRIADO; a publicação vem depois, e as duas coisas juntas ou nenhuma.
    if v_review is not null then
      insert into public.material_ai_provenance
        (material_id, submission_id, review_id, review_verdict, reviewed_at, model, text_sha256, snapshot_hash)
      values
        (v_material_id, s.id, r.id, 'apto', r.completed_at, r.model, s.content_sha256,
         app.material_snapshot_hash(v_material_id));
    end if;

    update public.materials set status = 'published' where id = v_material_id;

    update public.material_submissions
       set status = 'publicado', published_material_id = v_material_id, publication_note = null
     where id = s.id;
  exception when others then
    -- Tudo o que o bloco fez foi desfeito: nada ficou criado e o envio continua como estava. O detalhe técnico
    -- fica só no log do banco.
    raise warning 'admin_publicar_envio % falhou: %', p_submission_id, sqlerrm;
    return jsonb_build_object('resultado', 'falhou');
  end;

  return jsonb_build_object('resultado', 'publicado', 'material_id', v_material_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Publicar um envio de questões
-- ----------------------------------------------------------------------------

-- A mesma criação de `revisao_publicar_questoes` (20261003120400): conferência do lote inteiro antes de criar
-- qualquer questão, ligação aos materiais pelo título, publicação e proveniência, tudo ou nada.
create or replace function public.admin_publicar_questoes(
  p_submission_id uuid,
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
  v_review uuid;
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
  if not app.is_admin_active(auth.uid()) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;

  select * into s from public.question_submissions where id = p_submission_id for update;
  if not found then
    return jsonb_build_object('resultado', 'fora_de_estado');
  end if;
  if s.status = 'publicado' and cardinality(s.published_question_ids) > 0 then
    return jsonb_build_object('resultado', 'ja_publicado', 'question_ids', to_jsonb(s.published_question_ids));
  end if;
  -- "em_revisao": o revisor está lendo o texto agora; publicar no meio faria o parecer chegar a um envio já publicado.
  if s.status not in ('aguardando_revisao', 'apto', 'nao_apto', 'erro') or cardinality(s.published_question_ids) > 0 then
    return jsonb_build_object('resultado', 'fora_de_estado', 'estado', s.status);
  end if;

  -- Quem chama leu este mesmo texto (senão o envio foi trocado no meio).
  if s.content_sha256 is distinct from p_content_sha256 then
    return jsonb_build_object('resultado', 'texto_mudou');
  end if;
  -- A revisão "apto" do texto e dos materiais ATUAIS, se houver: só ela dá o selo. Qualquer outro parecer (ou nenhum) publica sem selo.
  v_review := app.revisao_apto_do_envio_de_questoes(s.id);
  if v_review is not null then
    select * into r from public.material_reviews where id = v_review;
  end if;

  if p_questoes is null or jsonb_typeof(p_questoes) <> 'array' or jsonb_array_length(p_questoes) = 0 then
    return jsonb_build_object('resultado', 'texto_invalido');
  end if;

  -- A conferência não pode quebrar com JSON malformado (options que não é lista, item que não é objeto,
  -- id que não é uuid...): qualquer falha aqui é problema do TEXTO e vai a "não apto" com recado, saindo da fila.
  begin
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

      if jsonb_typeof(v_q) is distinct from 'object' then
        v_motivo := format('Questão %s: o texto não pôde ser lido como questão.', v_n);
      end if;
      exit when v_motivo is not null;
      -- Os campos que o banco vai converter: se não convertem, o problema é do texto (e não vira "erro").
      perform (v_q->>'discipline_id')::uuid, (v_q->>'theme_id')::uuid, nullif(v_q->>'year', '')::int;
      if jsonb_typeof(coalesce(v_q->'tags', '[]'::jsonb)) <> 'array'
         or jsonb_typeof(coalesce(v_q->'material_titles', '[]'::jsonb)) <> 'array' then
        v_motivo := format('Questão %s: Tags e Materiais cobertos precisam ser listas.', v_n);
      end if;
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
  exception when others then
    raise warning 'admin_publicar_questoes % conferência falhou: %', p_submission_id, sqlerrm;
    v_motivo := 'O lote foi aprovado na revisão, mas não pôde ser montado como questões (formato inesperado). Corrija o texto e envie de novo.';
  end;

  if v_motivo is not null then
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

      -- A proveniência ("Revisada por IA") só existe com revisão "apto" do texto atual. Ela guarda o hash da
      -- questão COMO FOI CRIADA; a publicação vem depois, e as duas coisas juntas ou nenhuma.
      if v_review is not null then
        insert into public.question_ai_provenance
          (question_id, submission_id, review_id, review_verdict, reviewed_at, model, text_sha256, snapshot_hash)
        values
          (v_qid, s.id, r.id, 'apto', r.completed_at, r.model, s.content_sha256, app.question_snapshot_hash(v_qid));
      end if;

      update public.questions set status = 'published' where id = v_qid;
      v_new_ids := v_new_ids || v_qid;
    end loop;

    update public.question_submissions
       set status = 'publicado', published_question_ids = v_new_ids, publication_note = null
     where id = s.id;
  exception when others then
    -- Tudo o que o bloco fez foi desfeito: nada ficou criado e o envio continua como estava. O detalhe técnico
    -- fica só no log do banco.
    raise warning 'admin_publicar_questoes % falhou: %', p_submission_id, sqlerrm;
    return jsonb_build_object('resultado', 'falhou');
  end;

  return jsonb_build_object('resultado', 'publicado', 'question_ids', to_jsonb(v_new_ids));
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Aplicar uma atualização de material
-- ----------------------------------------------------------------------------

-- A mesma substituição de `revisao_aplicar_atualizacao` (20261003120500): casa seções pelo título (preserva o id,
-- e com ele anotações, progresso e questões), mantém as referências iguais e não toca a árvore nem as ligações.
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

-- Só quem está logado chama (e a função confere que é admin ativo): nada para anon nem para PUBLIC.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_publicar_envio(uuid, text, jsonb)',
    'public.admin_publicar_questoes(uuid, text, jsonb)',
    'public.admin_aplicar_atualizacao(uuid, text, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
