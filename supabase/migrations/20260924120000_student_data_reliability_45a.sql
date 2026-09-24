-- Unidade 45-A, parte 2 — idempotência de ações do estudante, criação única
-- de flashcard derivado de questão e nota de simulado calculada no servidor.

-- A produção historicamente tem dois grupos duplicados. A reconciliação é
-- determinística, preserva antes uma cópia exata do card/SRS removido e move
-- todos os vínculos antes de permitir que o ON DELETE CASCADE apague o card.
create table app.flashcard_dedup_backup_45a (
  duplicate_flashcard_id uuid primary key,
  kept_flashcard_id uuid not null,
  flashcard_row jsonb not null,
  flashcard_srs_state_row jsonb,
  backed_up_at timestamptz not null default pg_catalog.clock_timestamp()
);

revoke all on table app.flashcard_dedup_backup_45a
  from public, anon, authenticated;

comment on table app.flashcard_dedup_backup_45a is
  'Backup imutável dos flashcards removidos pela reconciliação da unidade 45-A.';

create or replace function app.reconcile_duplicate_flashcards_45a()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_duplicate record;
  v_duplicate_note public.notes%rowtype;
  v_kept_note public.notes%rowtype;
  v_bookmark_id uuid;
  v_changed int;
  v_duplicate_groups int := 0;
  v_duplicate_cards_removed int := 0;
  v_backup_rows int := 0;
  v_reviews_moved int := 0;
  v_notes_moved int := 0;
  v_bookmarks_moved int := 0;
  v_bookmarks_discarded int := 0;
begin
  -- O lock cobre a seleção do canônico, todas as movimentações e, na chamada
  -- feita abaixo pela migration, a criação do índice único na mesma transação.
  lock table
    public.flashcards,
    public.flashcard_srs_state,
    public.flashcard_reviews,
    public.notes,
    public.bookmarks
  in access exclusive mode;

  select count(*)::int
  into v_duplicate_groups
  from (
    select 1
    from public.flashcards
    where question_origin_id is not null
    group by user_id, question_origin_id
    having count(*) > 1
  ) duplicate_groups;

  for v_duplicate in
    with card_stats as (
      select
        f.id,
        f.user_id,
        f.question_origin_id,
        f.created_at,
        s.last_reviewed_date,
        (
          select count(*)::int
          from public.flashcard_reviews reviews
          where reviews.flashcard_id = f.id
        ) as review_count
      from public.flashcards f
      left join public.flashcard_srs_state s on s.flashcard_id = f.id
      where f.question_origin_id is not null
    ), ranked as (
      select
        card_stats.*,
        first_value(id) over canonical_order as kept_id,
        row_number() over canonical_order as canonical_position
      from card_stats
      window canonical_order as (
        partition by user_id, question_origin_id
        order by
          last_reviewed_date desc nulls last,
          review_count desc,
          created_at asc,
          id asc
      )
    )
    select id as duplicate_id, kept_id, user_id, question_origin_id, canonical_position
    from ranked
    where canonical_position > 1
    order by user_id, question_origin_id, canonical_position
  loop
    insert into app.flashcard_dedup_backup_45a (
      duplicate_flashcard_id,
      kept_flashcard_id,
      flashcard_row,
      flashcard_srs_state_row
    )
    select
      flashcard.id,
      v_duplicate.kept_id,
      pg_catalog.to_jsonb(flashcard),
      case
        when srs.flashcard_id is null then null
        else pg_catalog.to_jsonb(srs)
      end
    from public.flashcards flashcard
    left join public.flashcard_srs_state srs on srs.flashcard_id = flashcard.id
    where flashcard.id = v_duplicate.duplicate_id
    on conflict (duplicate_flashcard_id) do nothing;
    get diagnostics v_changed = row_count;
    v_backup_rows := v_backup_rows + v_changed;

    -- Se uma operação idempotente aparece nos dois cards, manter as duas
    -- revisões é mais importante que conservar o identificador repetido.
    update public.flashcard_reviews duplicate_review
    set client_op_id = null
    where duplicate_review.flashcard_id = v_duplicate.duplicate_id
      and duplicate_review.client_op_id is not null
      and exists (
        select 1
        from public.flashcard_reviews kept_review
        where kept_review.flashcard_id = v_duplicate.kept_id
          and kept_review.client_op_id = duplicate_review.client_op_id
      );

    update public.flashcard_reviews
    set flashcard_id = v_duplicate.kept_id
    where flashcard_id = v_duplicate.duplicate_id;
    get diagnostics v_changed = row_count;
    v_reviews_moved := v_reviews_moved + v_changed;

    select *
    into v_duplicate_note
    from public.notes
    where user_id = v_duplicate.user_id
      and flashcard_id = v_duplicate.duplicate_id
    for update;

    if found then
      select *
      into v_kept_note
      from public.notes
      where user_id = v_duplicate.user_id
        and flashcard_id = v_duplicate.kept_id
      for update;

      if found then
        update public.notes
        set note_text = v_kept_note.note_text
              || E'\n\n--- nota reconciliada de flashcard duplicado ---\n\n'
              || v_duplicate_note.note_text,
            created_at = least(v_kept_note.created_at, v_duplicate_note.created_at),
            updated_at = greatest(v_kept_note.updated_at, v_duplicate_note.updated_at)
        where id = v_kept_note.id;

        -- O conteúdo e as datas já foram incorporados ao registro canônico.
        delete from public.notes where id = v_duplicate_note.id;
      else
        update public.notes
        set flashcard_id = v_duplicate.kept_id
        where id = v_duplicate_note.id;
      end if;

      v_notes_moved := v_notes_moved + 1;
    end if;

    select id
    into v_bookmark_id
    from public.bookmarks
    where user_id = v_duplicate.user_id
      and flashcard_id = v_duplicate.duplicate_id
    for update;

    if found then
      perform 1
      from public.bookmarks
      where user_id = v_duplicate.user_id
        and flashcard_id = v_duplicate.kept_id;

      if found then
        delete from public.bookmarks where id = v_bookmark_id;
        v_bookmarks_discarded := v_bookmarks_discarded + 1;
      else
        update public.bookmarks
        set flashcard_id = v_duplicate.kept_id
        where id = v_bookmark_id;
        v_bookmarks_moved := v_bookmarks_moved + 1;
      end if;
    end if;

    if exists (
      select 1 from public.flashcard_reviews where flashcard_id = v_duplicate.duplicate_id
    ) or exists (
      select 1 from public.notes where flashcard_id = v_duplicate.duplicate_id
    ) or exists (
      select 1 from public.bookmarks where flashcard_id = v_duplicate.duplicate_id
    ) then
      raise exception '45-A: vínculo de flashcard não reconciliado para %', v_duplicate.duplicate_id;
    end if;

    delete from public.flashcards where id = v_duplicate.duplicate_id;
    v_duplicate_cards_removed := v_duplicate_cards_removed + 1;
  end loop;

  return pg_catalog.jsonb_build_object(
    'duplicate_groups', v_duplicate_groups,
    'duplicate_cards_removed', v_duplicate_cards_removed,
    'backup_rows', v_backup_rows,
    'reviews_moved', v_reviews_moved,
    'notes_moved', v_notes_moved,
    'bookmarks_moved', v_bookmarks_moved,
    'bookmarks_discarded', v_bookmarks_discarded
  );
end;
$$;

revoke all on function app.reconcile_duplicate_flashcards_45a()
  from public, anon, authenticated;

-- O DO inteiro é uma única transação: se qualquer movimentação, backup ou a
-- criação do índice falhar, nenhuma alteração do grupo é confirmada.
do $$
declare
  v_counts jsonb;
begin
  v_counts := app.reconcile_duplicate_flashcards_45a();

  execute 'create unique index flashcards_user_question_origin_uq '
       || 'on public.flashcards (user_id, question_origin_id)';

  raise notice
    '45-A flashcards reconciliados: grupos=%, removidos=%, backups=%, revisões=%, notas=%, favoritos movidos=%, favoritos descartados=%',
    v_counts->>'duplicate_groups',
    v_counts->>'duplicate_cards_removed',
    v_counts->>'backup_rows',
    v_counts->>'reviews_moved',
    v_counts->>'notes_moved',
    v_counts->>'bookmarks_moved',
    v_counts->>'bookmarks_discarded';
end $$;

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
