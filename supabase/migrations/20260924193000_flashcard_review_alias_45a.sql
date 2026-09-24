-- Correção pós-revisão da unidade 45-A / PR #76.
--
-- A reconciliação de duplicatas preservou o mapa
-- duplicate_flashcard_id -> kept_flashcard_id, mas navegadores offline ainda
-- podem carregar operações persistidas contra o id removido. Resolver esse
-- alias dentro da RPC mantém o mesmo client_op_id e aplica a revisão uma vez
-- no card canônico, sem confiar em nenhum identificador vindo do cliente.

create or replace function public.submit_flashcard_review(
  p_flashcard_id uuid,
  p_rating int,
  p_client_op_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_effective_flashcard_id uuid;
  v_existing_review_id uuid;
  v_srs record;
  v_interval_days int;
  v_repetition_count int;
  v_ease_factor numeric(4,2);
  v_state text;
  v_sm2_quality int;
  v_multiplier numeric;
  v_next_due_date date;
  v_reviewed_at timestamptz;
begin
  if app.current_profile_status(v_uid) is distinct from 'active' then
    raise exception 'apenas estudantes ativos podem revisar flashcards';
  end if;

  if p_rating is null or p_rating not in (1, 2, 3, 4) then
    raise exception 'rating inválido: deve ser 1, 2, 3 ou 4';
  end if;

  select id
  into v_effective_flashcard_id
  from public.flashcards
  where id = p_flashcard_id and user_id = v_uid;

  if not found then
    select backup.kept_flashcard_id
    into v_effective_flashcard_id
    from app.flashcard_dedup_backup_45a backup
    join public.flashcards kept on kept.id = backup.kept_flashcard_id
    where backup.duplicate_flashcard_id = p_flashcard_id
      and (backup.flashcard_row->>'user_id')::uuid = v_uid
      and kept.user_id = v_uid;
  end if;

  if v_effective_flashcard_id is null then
    raise exception 'flashcard não encontrado ou não pertence ao usuário';
  end if;

  -- Idempotência: reenviar a mesma revisão, inclusive pelo id antigo,
  -- devolve o estado atual sem reaplicar o SM-2.
  if p_client_op_id is not null then
    select id into v_existing_review_id
    from public.flashcard_reviews
    where flashcard_id = v_effective_flashcard_id
      and client_op_id = p_client_op_id;

    if found then
      select interval_days, repetition_count, ease_factor, next_due_date, last_reviewed_date, state
      into v_srs
      from public.flashcard_srs_state
      where flashcard_id = v_effective_flashcard_id;

      select reviewed_at into v_reviewed_at
      from public.flashcard_reviews
      where id = v_existing_review_id;

      return pg_catalog.jsonb_build_object(
        'flashcard_id', v_effective_flashcard_id,
        'interval_days', v_srs.interval_days,
        'repetition_count', v_srs.repetition_count,
        'ease_factor', v_srs.ease_factor,
        'next_due_date', v_srs.next_due_date,
        'last_reviewed_date', v_srs.last_reviewed_date,
        'state', v_srs.state,
        'reviewed_at', v_reviewed_at,
        'rating', p_rating
      );
    end if;
  end if;

  -- Lock da linha de estado atual: serializa revisões concorrentes do mesmo
  -- card (duas abas, dois dispositivos reconciliando ao mesmo tempo) — a
  -- segunda revisão a chegar sempre parte do estado real deixado pela
  -- primeira, nunca sobrescreve com um cálculo baseado em dado velho.
  select interval_days, repetition_count, ease_factor, state
  into v_srs
  from public.flashcard_srs_state
  where flashcard_id = v_effective_flashcard_id
  for update;

  if not found then
    insert into public.flashcard_srs_state (flashcard_id)
    values (v_effective_flashcard_id);
    v_srs.interval_days := 0;
    v_srs.repetition_count := 0;
    v_srs.ease_factor := 2.5;
    v_srs.state := 'new';
  end if;

  v_interval_days := coalesce(v_srs.interval_days, 0);
  v_repetition_count := coalesce(v_srs.repetition_count, 0);
  v_ease_factor := coalesce(v_srs.ease_factor, 2.5);

  -- Porte de src/services/srsAlgorithm.ts (calculateNextSRS) — mesma escala
  -- 1-4 -> SM-2 0-5, mesmos limites de ease factor (1.3 a 3.0).
  v_sm2_quality := case p_rating when 1 then 1 when 2 then 3 when 3 then 4 else 5 end;

  if v_sm2_quality < 3 then
    v_repetition_count := 0;
    v_interval_days := 1;
    v_state := 'learning';
  else
    if v_repetition_count = 0 then
      v_interval_days := 1;
    elsif v_repetition_count = 1 then
      v_interval_days := case when p_rating = 4 then 4 else 2 end;
    else
      v_multiplier := case p_rating
        when 2 then 1.2
        when 3 then v_ease_factor
        else v_ease_factor * 1.3
      end;
      v_interval_days := pg_catalog.round(v_interval_days * v_multiplier);
    end if;
    v_repetition_count := v_repetition_count + 1;
    v_state := case when v_interval_days >= 21 then 'mastered' else 'review' end;
  end if;

  v_ease_factor := v_ease_factor
    + (0.1 - (5 - v_sm2_quality) * (0.08 + (5 - v_sm2_quality) * 0.02));
  v_ease_factor := greatest(
    1.3,
    least(3.0, pg_catalog.round(v_ease_factor, 2))
  );

  v_reviewed_at := pg_catalog.now();
  v_next_due_date := (v_reviewed_at::date) + v_interval_days;

  update public.flashcard_srs_state
  set interval_days = v_interval_days,
      repetition_count = v_repetition_count,
      ease_factor = v_ease_factor,
      next_due_date = v_next_due_date,
      last_reviewed_date = v_reviewed_at::date,
      state = v_state,
      updated_at = v_reviewed_at
  where flashcard_id = v_effective_flashcard_id;

  insert into public.flashcard_reviews (flashcard_id, reviewed_at, rating, client_op_id)
  values (v_effective_flashcard_id, v_reviewed_at, p_rating, p_client_op_id);

  return pg_catalog.jsonb_build_object(
    'flashcard_id', v_effective_flashcard_id,
    'interval_days', v_interval_days,
    'repetition_count', v_repetition_count,
    'ease_factor', v_ease_factor,
    'next_due_date', v_next_due_date,
    'last_reviewed_date', v_reviewed_at::date,
    'state', v_state,
    'reviewed_at', v_reviewed_at,
    'rating', p_rating
  );
end;
$$;

revoke all on function public.submit_flashcard_review(uuid, int, uuid)
  from public, anon;
grant execute on function public.submit_flashcard_review(uuid, int, uuid)
  to authenticated;
