-- ============================================================================
-- CARD-1 — cartão escrito pelo usuário (Frente/Verso), na leitura e nas questões
--
-- O aluno escreve a frente e o verso do próprio cartão numa seção do material
-- ou numa questão já respondida. Diferente dos cartões automáticos:
-- 1. pode haver mais de um cartão escrito na mesma seção ou questão (cada
--    "Salvar" com texto é um cartão);
-- 2. repetir o MESMO envio (mesmo id: fila offline, reenvio) não duplica.
--
-- Como:
-- - `flashcards.is_written` (not null, default false) marca o cartão escrito;
-- - os dois índices únicos "um por usuário e seção" (P10) e "um por usuário e
--   questão" (45-A) passam a valer só para o cartão automático (`not is_written`),
--   e o cartão do erro (`create_flashcard_from_question`) e o de seção
--   (`create_flashcard_from_section`) passam a ignorar o escrito ao procurar o
--   cartão canônico — um cartão escrito nunca toma o lugar do automático;
-- - RPC nova `create_written_flashcard`: atômica e idempotente pelo id.
--
-- Os cartões que já existem ficam como estão (is_written = false). RLS: nenhuma
-- policy muda; `flashcards_owner_all` já cobre a coluna nova.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Coluna e índices
-- ----------------------------------------------------------------------------

alter table public.flashcards
  add column is_written boolean not null default false;

comment on column public.flashcards.is_written is
  'CARD-1: cartão escrito pelo usuário (frente e verso dele), ligado a uma seção ou a uma questão. Pode haver vários por seção ou questão; os índices de unicidade do cartão automático não o contam.';

drop index public.flashcards_user_section_card_uq;
create unique index flashcards_user_section_card_uq
  on public.flashcards (user_id, material_section_id)
  where question_origin_id is null and material_section_id is not null and not is_written;

drop index public.flashcards_user_question_origin_uq;
create unique index flashcards_user_question_origin_uq
  on public.flashcards (user_id, question_origin_id)
  where not is_written;

-- ----------------------------------------------------------------------------
-- 2. Cartão do erro: o escrito não conta como o cartão do erro
--    (mesma função da P10; muda só o `not is_written` e o alvo do ON CONFLICT,
--    que precisa repetir o predicado do índice parcial)
-- ----------------------------------------------------------------------------

create or replace function public.create_flashcard_from_question(
  p_id uuid,
  p_discipline_id uuid,
  p_theme_id uuid,
  p_material_id uuid,
  p_question_origin_id uuid,
  p_front text,
  p_back text,
  p_mechanism_highlight text,
  p_tags text[],
  p_difficulty text,
  p_is_custom boolean default true,
  p_material_section_id uuid default null
)
returns public.flashcards
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.flashcards;
  v_section uuid := app.secao_valida_para_card(p_material_id, p_material_section_id);
begin
  if app.current_profile_status(v_uid) is distinct from 'active' then
    raise exception 'apenas estudantes ativos podem criar flashcards';
  end if;
  if p_id is null or p_question_origin_id is null then
    raise exception 'id e questão de origem são obrigatórios';
  end if;

  -- Replay da MESMA operação: o id do card também é o client_op_id da fila.
  select * into v_row from public.flashcards where id = p_id;
  if found then
    if v_row.user_id is distinct from v_uid then
      raise exception 'flashcard já existe e pertence a outro usuário' using errcode = '42501';
    end if;
    if v_row.question_origin_id is distinct from p_question_origin_id then
      raise exception 'id do flashcard já usado para outra questão';
    end if;
    return v_row;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('flashcard:' || v_uid::text || ':' || p_question_origin_id::text, 0)
  );

  select * into v_row
  from public.flashcards
  where user_id = v_uid and question_origin_id = p_question_origin_id and not is_written
  limit 1;

  if not found then
    insert into public.flashcards (
      id, user_id, discipline_id, theme_id, material_id, material_section_id, question_origin_id,
      front, back, mechanism_highlight, tags, difficulty, is_custom
    ) values (
      p_id, v_uid, p_discipline_id, p_theme_id, p_material_id, v_section, p_question_origin_id,
      p_front, p_back, p_mechanism_highlight, coalesce(p_tags, '{}'::text[]),
      p_difficulty, coalesce(p_is_custom, true)
    )
    on conflict (user_id, question_origin_id) where not is_written do nothing
    returning * into v_row;

    if not found then
      select * into v_row
      from public.flashcards
      where user_id = v_uid and question_origin_id = p_question_origin_id and not is_written
      limit 1;
    end if;
  end if;

  if v_row.id is null then
    raise exception 'falha ao criar ou localizar flashcard canônico';
  end if;

  insert into public.flashcard_srs_state (flashcard_id)
  values (v_row.id)
  on conflict (flashcard_id) do nothing;

  return v_row;
end;
$$;

revoke all on function public.create_flashcard_from_question(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text[], text, boolean, uuid
) from public, anon;
grant execute on function public.create_flashcard_from_question(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text[], text, boolean, uuid
) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Cartão automático de seção: o escrito não conta como o da seção
--    (mesma função da P10; muda só o `not is_written` da procura)
-- ----------------------------------------------------------------------------

create or replace function public.create_flashcard_from_section(
  p_id uuid,
  p_discipline_id uuid,
  p_theme_id uuid,
  p_material_id uuid,
  p_material_section_id uuid,
  p_front text,
  p_back text,
  p_mechanism_highlight text,
  p_tags text[],
  p_difficulty text,
  p_is_custom boolean default true
)
returns public.flashcards
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.flashcards;
  v_section uuid;
begin
  if app.current_profile_status(v_uid) is distinct from 'active' then
    raise exception 'apenas estudantes ativos podem criar flashcards';
  end if;
  if p_id is null or p_material_id is null or p_material_section_id is null then
    raise exception 'id, material e seção são obrigatórios';
  end if;

  -- Replay da MESMA operação: o id do card também é o client_op_id da fila.
  select * into v_row from public.flashcards where id = p_id;
  if found then
    if v_row.user_id is distinct from v_uid then
      raise exception 'flashcard já existe e pertence a outro usuário' using errcode = '42501';
    end if;
    return v_row;
  end if;

  -- Seção que não é mais do material (ou material fora do ar): o card nasce
  -- sem seção, como um card comum, e a fila não trava.
  v_section := app.secao_valida_para_card(p_material_id, p_material_section_id);

  if v_section is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('flashcard-secao:' || v_uid::text || ':' || v_section::text, 0)
    );
    select * into v_row
    from public.flashcards
    where user_id = v_uid and material_section_id = v_section and question_origin_id is null and not is_written
    limit 1;
  end if;

  if v_row.id is null then
    insert into public.flashcards (
      id, user_id, discipline_id, theme_id, material_id, material_section_id,
      front, back, mechanism_highlight, tags, difficulty, is_custom
    ) values (
      p_id, v_uid, p_discipline_id, p_theme_id, p_material_id, v_section,
      p_front, p_back, p_mechanism_highlight, coalesce(p_tags, '{}'::text[]),
      p_difficulty, coalesce(p_is_custom, true)
    )
    returning * into v_row;
  end if;

  insert into public.flashcard_srs_state (flashcard_id)
  values (v_row.id)
  on conflict (flashcard_id) do nothing;

  return v_row;
end;
$$;

revoke all on function public.create_flashcard_from_section(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text[], text, boolean
) from public, anon;
grant execute on function public.create_flashcard_from_section(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text[], text, boolean
) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Cartão escrito pelo usuário
-- ----------------------------------------------------------------------------

-- Atômico e idempotente pelo id (o id do cartão também é o client_op_id da
-- fila): reenviar o mesmo envio devolve o cartão que já existe. Textos
-- diferentes, ids diferentes: cartões diferentes, quantos forem. A seção que
-- não é do material (ou de material fora do ar) entra como null e a fila não
-- trava, como nas outras RPCs de cartão; o vínculo com a questão fica em
-- `question_origin_id`.
create function public.create_written_flashcard(
  p_id uuid,
  p_discipline_id uuid,
  p_theme_id uuid,
  p_material_id uuid,
  p_material_section_id uuid,
  p_question_origin_id uuid,
  p_front text,
  p_back text,
  p_tags text[],
  p_difficulty text
)
returns public.flashcards
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.flashcards;
begin
  if app.current_profile_status(v_uid) is distinct from 'active' then
    raise exception 'apenas estudantes ativos podem criar flashcards';
  end if;
  if p_id is null then
    raise exception 'id é obrigatório';
  end if;
  if p_material_section_id is null and p_question_origin_id is null then
    raise exception 'o cartão precisa estar ligado a uma seção ou a uma questão';
  end if;
  if pg_catalog.btrim(coalesce(p_front, '')) = '' or pg_catalog.btrim(coalesce(p_back, '')) = '' then
    raise exception 'frente e verso são obrigatórios';
  end if;

  -- Replay da MESMA operação: devolve o cartão que já existe.
  select * into v_row from public.flashcards where id = p_id;
  if found then
    if v_row.user_id is distinct from v_uid then
      raise exception 'flashcard já existe e pertence a outro usuário' using errcode = '42501';
    end if;
    return v_row;
  end if;

  insert into public.flashcards (
    id, user_id, discipline_id, theme_id, material_id, material_section_id, question_origin_id,
    front, back, mechanism_highlight, tags, difficulty, is_custom, is_written
  ) values (
    p_id, v_uid, p_discipline_id, p_theme_id, p_material_id,
    app.secao_valida_para_card(p_material_id, p_material_section_id), p_question_origin_id,
    p_front, p_back, null, coalesce(p_tags, '{}'::text[]), p_difficulty, true, true
  )
  returning * into v_row;

  insert into public.flashcard_srs_state (flashcard_id)
  values (v_row.id)
  on conflict (flashcard_id) do nothing;

  return v_row;
end;
$$;

revoke all on function public.create_written_flashcard(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text[], text
) from public, anon;
grant execute on function public.create_written_flashcard(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text[], text
) to authenticated;
