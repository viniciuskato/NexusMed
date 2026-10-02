-- ============================================================================
-- 45-H — Endurecimento do banco (AUD-31, AUD-06, AUD-08)
-- ============================================================================
--
-- Nada aqui altera nem apaga dado existente: só privilégios, políticas,
-- limites de tamanho (NOT VALID: valem para o que for gravado daqui em diante,
-- sem revalidar linhas antigas) e o corpo de três RPCs.
--
-- 1. AUD-31.1 — função nova não nasce chamável sem login. Funções de `public`
--    nascem com EXECUTE para PUBLIC (e o anon herda); o `alter default
--    privileges ... from anon` de 20260918140000 não tirava o PUBLIC. Aqui:
--    default global sem PUBLIC + revoke de PUBLIC/anon nas funções que já
--    existem (authenticated e service_role mantêm o que já tinham).
--    A guarda está em supabase/tests/database/hardening_45h.test.sql.
-- 2. AUD-31.2 — anon e authenticated não têm TRUNCATE.
-- 3. AUD-31.3 — simulados, progresso de leitura e status de feedback só mudam
--    pelas RPCs: sem INSERT/UPDATE direto pela API.
-- 4. AUD-31.4 — limite de tamanho nos campos de texto livre e nos arrays de
--    save_simulado_session.
-- 5. AUD-06 — set_section_read valida a seção e calcula o percentual no servidor.
-- 6. AUD-08 — teto de 36500 dias no intervalo do SRS (paridade com o cliente).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXECUTE de função
-- ----------------------------------------------------------------------------

alter default privileges for role postgres revoke execute on functions from public;

-- Funções novas de `app` (fora do PostgREST, mas chamadas pelas policies RLS
-- em nome de quem consulta) continuam executáveis por authenticated, como eram
-- quando dependiam do PUBLIC.
alter default privileges for role postgres in schema app
  grant execute on functions to authenticated, service_role;

do $$
declare
  f record;
  v_auth boolean;
  v_service boolean;
begin
  for f in
    select p.oid, p.oid::regprocedure as assinatura
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and not exists (
        select 1 from pg_catalog.pg_depend d
        where d.classid = 'pg_catalog.pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
      )
  loop
    -- Quem podia executar antes (direto ou pelo PUBLIC) continua podendo.
    v_auth := pg_catalog.has_function_privilege('authenticated', f.oid, 'EXECUTE');
    v_service := pg_catalog.has_function_privilege('service_role', f.oid, 'EXECUTE');
    execute pg_catalog.format('revoke execute on function %s from public, anon', f.assinatura);
    if v_auth then
      execute pg_catalog.format('grant execute on function %s to authenticated', f.assinatura);
    end if;
    if v_service then
      execute pg_catalog.format('grant execute on function %s to service_role', f.assinatura);
    end if;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. TRUNCATE
-- ----------------------------------------------------------------------------

revoke truncate on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate on tables from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Escrita direta pela API
-- ----------------------------------------------------------------------------
-- O app grava simulados (save_simulado_session), progresso de leitura
-- (set_section_read) e feedback (submit_feedback) por RPC; as RPCs são SECURITY
-- DEFINER e seguem escrevendo. O dono continua lendo e apagando os próprios
-- dados; não altera mais o que as RPCs decidem (nota, conclusão, percentual).

revoke insert, update on public.simulations from authenticated;
revoke insert, update on public.simulation_questions from authenticated;
revoke insert, update on public.simulation_answers from authenticated;
revoke insert, update on public.reading_progress from authenticated;

drop policy simulations_owner_all on public.simulations;
create policy simulations_owner_select on public.simulations
  for select to authenticated
  using (user_id = auth.uid() and app.current_profile_status(auth.uid()) = 'active');
create policy simulations_owner_delete on public.simulations
  for delete to authenticated
  using (user_id = auth.uid() and app.current_profile_status(auth.uid()) = 'active');

drop policy simulation_questions_owner_all on public.simulation_questions;
create policy simulation_questions_owner_select on public.simulation_questions
  for select to authenticated
  using (
    app.current_profile_status(auth.uid()) = 'active'
    and exists (select 1 from public.simulations s where s.id = simulation_id and s.user_id = auth.uid())
  );
create policy simulation_questions_owner_delete on public.simulation_questions
  for delete to authenticated
  using (
    app.current_profile_status(auth.uid()) = 'active'
    and exists (select 1 from public.simulations s where s.id = simulation_id and s.user_id = auth.uid())
  );

drop policy simulation_answers_owner_all on public.simulation_answers;
create policy simulation_answers_owner_select on public.simulation_answers
  for select to authenticated
  using (
    app.current_profile_status(auth.uid()) = 'active'
    and exists (
      select 1 from public.simulation_questions sq
      join public.simulations s on s.id = sq.simulation_id
      where sq.id = simulation_question_id and s.user_id = auth.uid()
    )
  );
create policy simulation_answers_owner_delete on public.simulation_answers
  for delete to authenticated
  using (
    app.current_profile_status(auth.uid()) = 'active'
    and exists (
      select 1 from public.simulation_questions sq
      join public.simulations s on s.id = sq.simulation_id
      where sq.id = simulation_question_id and s.user_id = auth.uid()
    )
  );

drop policy reading_progress_owner_all on public.reading_progress;
create policy reading_progress_owner_select on public.reading_progress
  for select to authenticated
  using (user_id = auth.uid() and app.current_profile_status(auth.uid()) = 'active');
create policy reading_progress_owner_delete on public.reading_progress
  for delete to authenticated
  using (user_id = auth.uid() and app.current_profile_status(auth.uid()) = 'active');

-- feedback: o INSERT direto continua, mas sem a coluna `status` (nasce no
-- default e só set_feedback_status, de admin, a muda).
revoke insert on public.feedback from authenticated;
grant insert (id, user_id, type, title, description, question_id, material_id)
  on public.feedback to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Limite de tamanho (NOT VALID: não revalida linhas existentes)
-- ----------------------------------------------------------------------------

alter table public.feedback
  add constraint feedback_title_max_length check (char_length(title) <= 200) not valid,
  add constraint feedback_description_max_length check (char_length(description) <= 5000) not valid;
alter table public.notes
  add constraint notes_note_text_max_length check (char_length(note_text) <= 50000) not valid;
alter table public.flashcards
  add constraint flashcards_front_max_length check (char_length(front) <= 5000) not valid,
  add constraint flashcards_back_max_length check (char_length(back) <= 20000) not valid;
alter table public.error_notebook
  add constraint error_notebook_user_notes_max_length check (char_length(user_notes) <= 5000) not valid;
alter table public.profiles
  add constraint profiles_display_name_max_length check (char_length(display_name) <= 200) not valid,
  add constraint profiles_avatar_url_max_length check (char_length(avatar_url) <= 2048) not valid;

-- ----------------------------------------------------------------------------
-- 5. RPCs (mesmo contrato e mesmos grants; só os corpos mudam)
-- ----------------------------------------------------------------------------

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
  -- Limite de tamanho dos arrays enviados (45-H, AUD-31.4).
  if pg_catalog.jsonb_typeof(coalesce(p_session->'questions', '[]'::jsonb)) <> 'array'
     or pg_catalog.jsonb_typeof(coalesce(p_session->'answers', '[]'::jsonb)) <> 'array' then
    raise exception 'questions e answers devem ser listas';
  end if;
  if pg_catalog.jsonb_array_length(coalesce(p_session->'questions', '[]'::jsonb)) > 2000
     or pg_catalog.jsonb_array_length(coalesce(p_session->'answers', '[]'::jsonb)) > 2000 then
    raise exception 'sessão de simulado excede o tamanho máximo (2000 questões e 2000 respostas)';
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

create or replace function public.set_section_read(
  p_material_id uuid,
  p_section_id uuid,
  p_is_read boolean,
  p_total_sections int
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_current uuid[];
  v_updated uuid[];
  v_percent int;
  v_total int;
begin
  if app.current_profile_status(v_uid) is distinct from 'active' then
    raise exception 'apenas estudantes ativos podem registrar progresso de leitura';
  end if;
  if p_total_sections is null or p_total_sections <= 0 then
    raise exception 'total_sections deve ser maior que zero';
  end if;
  if not app.can_read_material(v_uid, p_material_id) then
    raise exception 'compêndio não encontrado: %', p_material_id;
  end if;

  -- A seção marcada como lida tem de ser deste material (45-H, AUD-06). Desmarcar
  -- segue livre: um id que já não existe no material precisa poder sair do array.
  if p_is_read and not exists (
    select 1 from public.material_sections s
    where s.id = p_section_id and s.material_id = p_material_id
  ) then
    raise exception 'seção não pertence ao material: %', p_section_id;
  end if;

  insert into public.reading_progress (user_id, material_id, read_section_ids, percent)
  values (v_uid, p_material_id, '{}', 0)
  on conflict (user_id, material_id) do nothing;

  select read_section_ids into v_current
  from public.reading_progress
  where user_id = v_uid and material_id = p_material_id
  for update;

  if p_is_read then
    select array_agg(distinct x) into v_updated
    from unnest(coalesce(v_current, '{}') || array[p_section_id]) as x;
  else
    v_updated := array_remove(coalesce(v_current, '{}'), p_section_id);
  end if;

  -- Percentual calculado aqui, sobre as seções que o material tem hoje: o
  -- `p_total_sections` do cliente segue exigido (contrato antigo), mas não conta
  -- (45-H, AUD-06). Id que já não existe no material não entra na conta.
  select count(*) into v_total from public.material_sections where material_id = p_material_id;
  v_percent := least(100, round(
    (select count(*) from public.material_sections s
      where s.material_id = p_material_id and s.id = any (coalesce(v_updated, '{}')))::numeric
    / greatest(v_total, 1) * 100));

  update public.reading_progress
  set read_section_ids = v_updated,
      percent = v_percent,
      updated_at = pg_catalog.now()
  where user_id = v_uid and material_id = p_material_id;

  return jsonb_build_object('read_section_ids', to_jsonb(v_updated), 'percent', v_percent);
end;
$$;

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
      -- Teto de 100 anos, igual ao MAX_INTERVAL_DAYS de src/services/srsAlgorithm.ts
      -- (45-H, AUD-08): sem ele, "Fácil" repetido faz o intervalo crescer sem limite.
      v_interval_days := least(36500, pg_catalog.round(v_interval_days * v_multiplier));
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
