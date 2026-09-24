-- Unidade 45-A, parte 2 — idempotência de ações do estudante, criação única
-- de flashcard derivado de questão e nota de simulado calculada no servidor.

-- A produção historicamente teve ao menos um grupo duplicado. Nunca escolher
-- silenciosamente qual histórico/SRS apagar dentro de uma migration: o dono
-- precisa reconciliar os grupos explicitamente antes de aplicar este arquivo.
do $$
begin
  if exists (
    select 1
    from public.flashcards
    where question_origin_id is not null
    group by user_id, question_origin_id
    having count(*) > 1
  ) then
    raise exception '45-A: existem flashcards duplicados por usuário/questão; reconcilie-os antes de aplicar a migration';
  end if;
end $$;

create unique index flashcards_user_question_origin_uq
  on public.flashcards (user_id, question_origin_id);

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
      id, user_id, discipline_id, theme_id, material_id, question_origin_id,
      front, back, mechanism_highlight, tags, difficulty, is_custom
    ) values (
      p_id, v_uid, p_discipline_id, p_theme_id, p_material_id, p_question_origin_id,
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
  uuid, uuid, uuid, uuid, uuid, text, text, text, text[], text, boolean
) from public, anon;
grant execute on function public.create_flashcard_from_question(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text[], text, boolean
) to authenticated;

-- Mantém a assinatura/retorno da RPC existente para que o frontend anterior
-- continue funcionando durante a aplicação da migration. A diferença é que
-- `p_session.score` deixa de ser confiado: cada resposta só entra na nota se
-- houver uma question_attempt gravada pelo próprio usuário. Clientes novos
-- informam o client_op_id exato; clientes antigos convergem pela tentativa
-- mais recente da mesma questão/alternativa.
create or replace function public.save_simulado_session(p_session jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_simulation_id uuid := (p_session->>'id')::uuid;
  v_incoming_completed_at timestamptz := (p_session->>'completed_at')::timestamptz;
  v_lock_key bigint;
  v_existing record;
  v_question jsonb;
  v_answer jsonb;
  v_sq_id uuid;
  v_question_id uuid;
  v_selected_option_id uuid;
  v_option_question_id uuid;
  v_client_op_id uuid;
  v_attempt_is_correct boolean;
  v_total_count int := 0;
  v_correct_count int := 0;
  v_score numeric(5, 2) := 0;
begin
  if app.current_profile_status(v_uid) is distinct from 'active' then
    raise exception 'apenas estudantes ativos podem gravar sessões de simulado';
  end if;
  if v_simulation_id is null then
    raise exception 'id da sessão de simulado é obrigatório';
  end if;

  v_lock_key := pg_catalog.hashtextextended('simulado:' || v_uid::text || ':' || v_simulation_id::text, 0);
  perform pg_catalog.pg_advisory_xact_lock(v_lock_key);

  select completed_at into v_existing
  from public.simulations
  where id = v_simulation_id and user_id = v_uid
  for update;

  if v_existing.completed_at is not null
     and v_existing.completed_at is distinct from v_incoming_completed_at then
    raise exception 'sessao_ja_finalizada: esta sessão de simulado já foi finalizada em outro envio e não pode ser sobrescrita';
  end if;

  insert into public.simulations
    (id, user_id, name, config, started_at, completed_at, score, total_time_seconds)
  values (
    v_simulation_id,
    v_uid,
    coalesce(p_session->>'name', p_session->'config'->>'name', 'Simulado'),
    coalesce(p_session->'config', '{}'::jsonb),
    coalesce((p_session->>'started_at')::timestamptz, pg_catalog.now()),
    v_incoming_completed_at,
    null,
    coalesce((p_session->>'total_time_seconds')::int, 0)
  )
  on conflict (id) do update set
    name = excluded.name,
    config = excluded.config,
    started_at = excluded.started_at,
    completed_at = excluded.completed_at,
    score = null,
    total_time_seconds = excluded.total_time_seconds
  where public.simulations.user_id = v_uid;

  if not found then
    raise exception 'sessão de simulado não pertence ao usuário autenticado';
  end if;

  delete from public.simulation_answers
  where simulation_question_id in (
    select id from public.simulation_questions where simulation_id = v_simulation_id
  );
  delete from public.simulation_questions where simulation_id = v_simulation_id;

  v_total_count := jsonb_array_length(coalesce(p_session->'questions', '[]'::jsonb));

  for v_question in select * from jsonb_array_elements(coalesce(p_session->'questions', '[]'::jsonb))
  loop
    v_question_id := (v_question->>'question_id')::uuid;
    insert into public.simulation_questions (simulation_id, question_id, position)
    values (v_simulation_id, v_question_id, (v_question->>'position')::int)
    returning id into v_sq_id;

    select a into v_answer
    from jsonb_array_elements(coalesce(p_session->'answers', '[]'::jsonb)) a
    where (a->>'question_id')::uuid = v_question_id
    limit 1;
    continue when v_answer is null;

    v_selected_option_id := (v_answer->>'selected_option_id')::uuid;
    select question_id into v_option_question_id
    from public.question_options
    where id = v_selected_option_id;
    continue when v_option_question_id is distinct from v_question_id;

    v_attempt_is_correct := null;
    if nullif(v_answer->>'client_op_id', '') is not null then
      v_client_op_id := (v_answer->>'client_op_id')::uuid;
      select is_correct into v_attempt_is_correct
      from public.question_attempts
      where user_id = v_uid
        and client_op_id = v_client_op_id
        and question_id = v_question_id
        and selected_option_id = v_selected_option_id;
    else
      -- Compatibilidade temporária com o bundle anterior à 45-A.
      select is_correct into v_attempt_is_correct
      from public.question_attempts
      where user_id = v_uid
        and question_id = v_question_id
        and selected_option_id = v_selected_option_id
      order by answered_at desc, id desc
      limit 1;
    end if;

    if v_attempt_is_correct is null then
      raise exception 'tentativa da resposta do simulado ainda não foi gravada'
        using errcode = '40001';
    end if;

    insert into public.simulation_answers (simulation_question_id, selected_option_id, time_spent_seconds)
    values (v_sq_id, v_selected_option_id, coalesce((v_answer->>'time_spent_seconds')::int, 0));

    if v_attempt_is_correct then
      v_correct_count := v_correct_count + 1;
    end if;
  end loop;

  if v_total_count > 0 then
    v_score := round((v_correct_count::numeric * 100) / v_total_count, 2);
  end if;

  update public.simulations
  set score = v_score
  where id = v_simulation_id and user_id = v_uid;
end;
$$;

revoke all on function public.save_simulado_session(jsonb) from public, anon;
grant execute on function public.save_simulado_session(jsonb) to authenticated;
