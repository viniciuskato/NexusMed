-- ============================================================================
-- P10 — erro → trecho do material → flashcard do trecho → revisão no trecho
--
-- O flashcard passa a guardar a SEÇÃO do material de onde veio:
-- 1. `flashcards.material_section_id` (nullable, FK com on delete set null,
--    índice). A ligação com a questão NÃO ganha coluna nova: já é
--    `flashcards.question_origin_id` (FK set null, índice único por usuário da
--    45-A) — decisão da diretoria, 03/10.
-- 2. O card do erro grava a seção da questão (`create_flashcard_from_question`
--    ganha `p_material_section_id`).
-- 3. O card de seção do leitor nasce por RPC própria, atômica e idempotente
--    (`create_flashcard_from_section`): gerar o card da mesma seção duas vezes
--    (outra aba, outro aparelho, fila offline reenviada) converge para um só.
-- 4. Os cards de erro que já existem recebem a seção da questão onde ela está
--    ligada a uma (só a coluna nova, só onde é nula).
--
-- RLS: nenhuma policy muda; `flashcards_owner_all` já cobre a coluna nova.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Coluna e índices
-- ----------------------------------------------------------------------------

alter table public.flashcards
  add column material_section_id uuid references public.material_sections(id) on delete set null;

comment on column public.flashcards.material_section_id is
  'P10: seção do material de onde o card veio (card de seção do leitor ou card do erro de uma questão ligada à seção). A questão de origem é question_origin_id.';

create index flashcards_material_section_idx
  on public.flashcards (material_section_id)
  where material_section_id is not null;

-- Um card de seção por usuário e seção. Só vale para o card que não vem de erro
-- (o do erro é único por questão, índice da 45-A, e pode repetir a seção).
create unique index flashcards_user_section_card_uq
  on public.flashcards (user_id, material_section_id)
  where question_origin_id is null and material_section_id is not null;

-- ----------------------------------------------------------------------------
-- 2. A seção do card precisa ser do material do card (e o material, publicado)
-- ----------------------------------------------------------------------------

-- Devolve a seção se ela é do material dado e o material está publicado; senão
-- null. Nunca levanta erro: uma seção que sumiu entre a criação offline e o
-- envio não pode travar a fila de sincronização — o card nasce sem seção.
create function app.secao_valida_para_card(p_material_id uuid, p_section_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.material_sections s
  join public.materials m on m.id = s.material_id
  where s.id = p_section_id
    and s.material_id = p_material_id
    and m.status = 'published';
$$;

revoke all on function app.secao_valida_para_card(uuid, uuid) from public, anon, authenticated;

-- Vale também para a gravação direta (upsert do cliente): seção que não é do
-- material do card, ou de material fora do ar, entra como null.
create function app.validar_secao_do_flashcard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.material_section_id is not null then
    new.material_section_id := app.secao_valida_para_card(new.material_id, new.material_section_id);
  end if;
  return new;
end;
$$;

revoke all on function app.validar_secao_do_flashcard() from public, anon, authenticated;

create trigger trg_validar_secao_do_flashcard
  before insert or update of material_id, material_section_id on public.flashcards
  for each row execute function app.validar_secao_do_flashcard();

-- ----------------------------------------------------------------------------
-- 3. Card do erro: grava a seção da questão
-- ----------------------------------------------------------------------------

-- Mesma função da 45-A com `p_material_section_id` (último, com default). A
-- assinatura antiga sai: com as duas, uma chamada com os 11 nomes antigos
-- seria ambígua para o PostgREST.
drop function public.create_flashcard_from_question(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text[], text, boolean
);

create function public.create_flashcard_from_question(
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
  where user_id = v_uid and question_origin_id = p_question_origin_id
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
    on conflict (user_id, question_origin_id) do nothing
    returning * into v_row;

    if not found then
      select * into v_row
      from public.flashcards
      where user_id = v_uid and question_origin_id = p_question_origin_id
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
-- 4. Card de seção do leitor: um por usuário e seção
-- ----------------------------------------------------------------------------

create function public.create_flashcard_from_section(
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
    where user_id = v_uid and material_section_id = v_section and question_origin_id is null
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
-- 5. Cards de erro que já existem: a seção da questão, onde ela está ligada
-- ----------------------------------------------------------------------------

-- Só a coluna nova e só onde ela é nula; nenhuma outra coluna do card muda.
-- Só a seção ligada ao MESMO material do card (a questão pode ter vários
-- materiais, cada um com a sua seção). Idempotente.
create function app.preencher_secao_dos_flashcards_p10()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  update public.flashcards f
     set material_section_id = qm.material_section_id
    from public.question_materials qm
   where qm.question_id = f.question_origin_id
     and qm.material_id = f.material_id
     and qm.material_section_id is not null
     and f.material_section_id is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function app.preencher_secao_dos_flashcards_p10() from public, anon, authenticated;

select app.preencher_secao_dos_flashcards_p10();
