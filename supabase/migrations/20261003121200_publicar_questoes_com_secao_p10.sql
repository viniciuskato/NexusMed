-- ============================================================================
-- P10 — a questão do arquivo se liga à SEÇÃO do material
--
-- O arquivo de questões passa a poder dizer "Título do material > Título da
-- seção" em "Materiais cobertos". A tela lê isso (`material_links`, com
-- `title` e `section_title`) e as duas funções que publicam um envio de questões
-- (`revisao_publicar_questoes`, do revisor, e `admin_publicar_questoes`, do
-- admin) passam a ligar cada questão à seção, em `question_materials`.
--
-- Uma função só resolve as ligações das duas (`app.resolver_ligacoes_de_questao`):
-- material pelo título exato e publicado (como antes), seção pelo título dentro
-- do material (sem acento, sem diferenciar caixa, espaços repetidos não contam).
-- Seção que não existe, ou com título repetido no material, recusa o lote
-- inteiro com um motivo claro — nunca um palpite e nunca uma seção descartada em
-- silêncio. Arquivo sem seção, ou só com `material_titles`, funciona como antes.
-- As duas funções são as mesmas de 20261003120400 e 20261003120900, só com a
-- conferência e a montagem das ligações trocadas por essa função.
-- ============================================================================

-- A seção se compara pelo mesmo `app.titulo_normalizado` da atualização de material (44-B).

-- As ligações de UMA questão do lote, como {motivo, links}:
--   * `material_links` (título e seção por material) ou, se faltar, `material_titles`;
--   * sem nenhum dos dois, os materiais escolhidos na tela (`p_material_ids`), sem seção;
--   * `motivo` preenchido = o lote inteiro é recusado com essa frase;
--   * `links` = a lista de {material_id, material_section_id} que `app.criar_questao_rascunho` recebe.
create function app.resolver_ligacoes_de_questao(p_questao jsonb, p_material_ids uuid[], p_numero int)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_entradas jsonb;
  v_entrada jsonb;
  v_title text;
  v_secao_titulo text;
  v_found int;
  v_material uuid;
  v_sec_found int;
  v_secao uuid;
  v_links jsonb := '[]'::jsonb;
  v_pos int;
  v_chosen uuid;
begin
  if jsonb_typeof(coalesce(p_questao->'material_links', '[]'::jsonb)) = 'array'
     and jsonb_array_length(coalesce(p_questao->'material_links', '[]'::jsonb)) > 0 then
    v_entradas := p_questao->'material_links';
  else
    v_entradas := coalesce(
      (select jsonb_agg(jsonb_build_object('title', t.value))
         from jsonb_array_elements_text(coalesce(p_questao->'material_titles', '[]'::jsonb)) t),
      '[]'::jsonb
    );
  end if;

  if jsonb_array_length(v_entradas) = 0 then
    if cardinality(p_material_ids) = 0 then
      return jsonb_build_object('motivo', format('Questão %s: sem material. Escreva “Materiais cobertos” ou escolha o material no envio.', p_numero), 'links', '[]'::jsonb);
    end if;
    foreach v_chosen in array p_material_ids loop
      v_links := v_links || jsonb_build_array(jsonb_build_object('material_id', v_chosen));
    end loop;
    return jsonb_build_object('motivo', null, 'links', v_links);
  end if;

  for v_entrada in select * from jsonb_array_elements(v_entradas) loop
    if jsonb_typeof(v_entrada) is distinct from 'object' then
      return jsonb_build_object('motivo', format('Questão %s: Tags e Materiais cobertos precisam ser listas.', p_numero), 'links', '[]'::jsonb);
    end if;
    v_title := v_entrada->>'title';
    v_secao_titulo := nullif(btrim(coalesce(v_entrada->>'section_title', '')), '');

    select count(*), min(m.id::text)::uuid into v_found, v_material
      from public.materials m
     where m.status = 'published'
       and regexp_replace(btrim(m.title), '\s+', ' ', 'g') = regexp_replace(btrim(v_title), '\s+', ' ', 'g');
    if v_found = 0 then
      return jsonb_build_object('motivo', format('Questão %s: o material “%s” não existe ou não está publicado.', p_numero, v_title), 'links', '[]'::jsonb);
    elsif v_found > 1 then
      return jsonb_build_object('motivo', format('Questão %s: o título “%s” pertence a mais de um material publicado; o NexusMed não sabe qual é. Escolha o material na tela de envio e tire o título do arquivo.', p_numero, v_title), 'links', '[]'::jsonb);
    end if;

    v_secao := null;
    if v_secao_titulo is not null then
      select count(*), min(s.id::text)::uuid into v_sec_found, v_secao
        from public.material_sections s
       where s.material_id = v_material
         and app.titulo_normalizado(s.title) = app.titulo_normalizado(v_secao_titulo);
      if v_sec_found = 0 then
        return jsonb_build_object('motivo', format('Questão %s: a seção “%s” não existe no material “%s”. Escreva o título exato de uma seção dele, ou tire a seção para ligar a questão ao material inteiro.', p_numero, v_secao_titulo, v_title), 'links', '[]'::jsonb);
      elsif v_sec_found > 1 then
        return jsonb_build_object('motivo', format('Questão %s: o material “%s” tem mais de uma seção chamada “%s”; o NexusMed não sabe qual é. Tire a seção para ligar a questão ao material inteiro.', p_numero, v_title, v_secao_titulo), 'links', '[]'::jsonb);
      end if;
    end if;

    -- O mesmo material de novo: vale uma vez; duas seções diferentes dele, não.
    select (x.ord - 1)::int into v_pos
      from jsonb_array_elements(v_links) with ordinality as x(e, ord)
     where x.e->>'material_id' = v_material::text;
    if v_pos is null then
      v_links := v_links || jsonb_build_array(jsonb_build_object('material_id', v_material, 'material_section_id', v_secao));
    elsif v_secao is not null then
      if (v_links->v_pos->>'material_section_id') is null then
        v_links := jsonb_set(v_links, array[v_pos::text, 'material_section_id'], to_jsonb(v_secao));
      elsif (v_links->v_pos->>'material_section_id') <> v_secao::text then
        return jsonb_build_object('motivo', format('Questão %s: o material “%s” aparece com mais de uma seção; a questão se liga a uma seção só.', p_numero, v_title), 'links', '[]'::jsonb);
      end if;
    end if;
  end loop;

  return jsonb_build_object('motivo', null, 'links', v_links);
end;
$$;

revoke all on function app.resolver_ligacoes_de_questao(jsonb, uuid[], int) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- revisao_publicar_questoes (do revisor; só service_role)
-- ----------------------------------------------------------------------------

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
  v_motivo text;
  v_correct int;
  v_qid uuid;
  v_new_ids uuid[] := '{}';
  v_chosen uuid;
  v_resolvido jsonb;
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

      -- Materiais da questão e a seção de cada um (P10): conferidos pela mesma função que monta as ligações.
      v_resolvido := app.resolver_ligacoes_de_questao(v_q, s.material_ids, v_n);
      v_motivo := v_resolvido->>'motivo';
      exit when v_motivo is not null;
    end loop;
  exception when others then
    raise warning 'revisao_publicar_questoes % conferência falhou: %', p_submission_id, sqlerrm;
    v_motivo := 'O lote foi aprovado na revisão, mas não pôde ser montado como questões (formato inesperado). Corrija o texto e envie de novo.';
  end;

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
        app.resolver_ligacoes_de_questao(v_q, s.material_ids, v_n)->'links'
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

-- Os privilégios continuam os de 20261003120400 e 20261003120900 (`create or replace` não os muda);
-- são repetidos aqui só para não depender disso.
revoke all on function public.revisao_publicar_questoes(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.revisao_publicar_questoes(uuid, uuid, text, jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- admin_publicar_questoes (do admin ativo)
-- ----------------------------------------------------------------------------

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
  v_motivo text;
  v_correct int;
  v_qid uuid;
  v_new_ids uuid[] := '{}';
  v_chosen uuid;
  v_resolvido jsonb;
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

      -- Materiais da questão e a seção de cada um (P10): conferidos pela mesma função que monta as ligações.
      v_resolvido := app.resolver_ligacoes_de_questao(v_q, s.material_ids, v_n);
      v_motivo := v_resolvido->>'motivo';
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
        app.resolver_ligacoes_de_questao(v_q, s.material_ids, v_n)->'links'
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

revoke all on function public.admin_publicar_questoes(uuid, text, jsonb) from public, anon;
grant execute on function public.admin_publicar_questoes(uuid, text, jsonb) to authenticated;
