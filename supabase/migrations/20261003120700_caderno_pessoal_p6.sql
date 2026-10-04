-- ============================================================================
-- P6 — Caderno pessoal: o dono volta a publicar e só ele envia
--
-- Decisão do dono (03/10): "vamos deixar só eu publicar mesmo, mas ainda vamos
-- usar revisor" — o revisor de IA aconselha, não trava. O NexusMed vira o caderno
-- digital dele: só o admin publica e só o admin envia material e questões; os
-- amigos aprovados leem e estudam.
--
-- O que esta migration faz:
--   1. `publish_material` e `publish_question` (do admin) deixam de exigir
--      revisão de IA "apto". Valem as demais regras (ordem da árvore, "Estude
--      antes", conteúdo completo da questão). O caminho de publicação pelo
--      veredito (`revisao_publicar_envio`, `revisao_publicar_questoes`) não muda,
--      e o selo "Revisado por IA" continua só onde há "apto" (`selo_de_revisao`,
--      `selos_de_questoes` leem a proveniência, que só esse caminho grava).
--   2. Só admin ativo cria ou reenvia envios de material e de questões (RLS de
--      INSERT e UPDATE). Os envios que já existem continuam guardados e legíveis
--      pelo autor e pelo admin: nada é apagado.
--   3. `app.pode_atualizar_material` passa a valer só para admin ativo (a
--      atualização de material por arquivo é um envio).
--   4. O job `revisar-envios` do pg_cron é desagendado (D-12: a revisão é feita
--      pela equipe, não pela Edge Function agendada).
--
-- AGENTS.md riscos 13 e 14: nenhuma tabela nova; toda função recriada repete o
-- revoke de public/anon.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Publicação do admin sem revisão "apto"
-- ----------------------------------------------------------------------------

-- Igual à de 20261003120200 (ordem de publicação, "Estude antes"), sem a trava do
-- revisor de IA.
create or replace function public.publish_material(p_material_id uuid)
returns public.materials
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.materials;
  v_blocker text;
begin
  if not app.is_admin_active(auth.uid()) then
    raise exception 'apenas administradores ativos podem publicar materiais';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(2026092201);
  perform 1 from public.materials where id = p_material_id for update;
  if not found then raise exception 'material não encontrado: %', p_material_id; end if;

  select string_agg(format('"%s"', a.title), ' → ' order by a.depth desc) into v_blocker
  from app.material_ancestors(p_material_id) a
  where a.status <> 'published';
  if v_blocker is not null then
    raise exception 'publicação bloqueada: publique antes, nesta ordem, o que está acima na árvore: %', v_blocker;
  end if;

  select string_agg(format('"%s"', target.title), ', ' order by link.sort_order) into v_blocker
  from public.material_links link
  join public.materials target on target.id = link.target_material_id
  where link.source_material_id = p_material_id
    and link.link_type = 'prerequisite'
    and target.status <> 'published';
  if v_blocker is not null then
    raise exception 'publicação bloqueada: publique antes o que está em "Estude antes": %', v_blocker;
  end if;

  update public.materials set status = 'published'
  where id = p_material_id returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.publish_material(uuid) from public, anon;
grant execute on function public.publish_material(uuid) to authenticated;

-- Igual à de 20261003120400 (as validações de conteúdo), sem a trava do revisor de IA.
create or replace function public.publish_question(p_question_id uuid)
returns public.questions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_option_count int;
  v_option_key_count int;
  v_correct_count int;
  v_missing_explanations int;
  v_answer_key_count int;
  v_general_commentary text;
  v_high_yield_summary text;
  v_result public.questions;
begin
  if not app.is_admin_active(auth.uid()) then
    raise exception 'apenas administradores ativos podem publicar questões';
  end if;

  perform 1 from public.questions where id = p_question_id for update;
  if not found then
    raise exception 'questão não encontrada: %', p_question_id;
  end if;

  select count(*) into v_option_count
  from public.question_options where question_id = p_question_id;
  if v_option_count < 2 then
    raise exception 'questão precisa de ao menos 2 alternativas';
  end if;

  select count(*) into v_option_key_count
  from public.question_option_keys where question_id = p_question_id;
  if v_option_key_count <> v_option_count then
    raise exception 'question_option_keys incompleto: % opções, % keys encontradas', v_option_count, v_option_key_count;
  end if;

  select count(*) into v_correct_count
  from public.question_option_keys
  where question_id = p_question_id and is_correct = true;
  if v_correct_count <> 1 then
    raise exception 'questão precisa de exatamente 1 alternativa correta (encontradas: %)', v_correct_count;
  end if;

  select count(*) into v_missing_explanations
  from public.question_option_keys
  where question_id = p_question_id
    and (explanation is null or length(trim(explanation)) = 0);
  if v_missing_explanations > 0 then
    raise exception 'todas as alternativas precisam de explicação preenchida';
  end if;

  select count(*), max(general_commentary), max(high_yield_summary)
    into v_answer_key_count, v_general_commentary, v_high_yield_summary
  from public.question_answer_keys where question_id = p_question_id;
  if v_answer_key_count <> 1 then
    raise exception 'questão precisa de registro em question_answer_keys';
  end if;
  if v_general_commentary is null or length(trim(v_general_commentary)) = 0 then
    raise exception 'general_commentary não pode estar vazio';
  end if;
  if v_high_yield_summary is null or length(trim(v_high_yield_summary)) = 0 then
    raise exception 'high_yield_summary não pode estar vazio';
  end if;

  update public.questions set status = 'published'
  where id = p_question_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.publish_question(uuid) from public, anon;
grant execute on function public.publish_question(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Só o admin cria envios
-- ----------------------------------------------------------------------------

-- As policies de SELECT (própria e de admin) não mudam: o autor continua vendo os
-- envios que já fez. Só INSERT e UPDATE (reenviar também é enviar) exigem admin ativo.

drop policy material_submissions_insert_own on public.material_submissions;
create policy material_submissions_insert_own on public.material_submissions
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and status = 'aguardando_revisao'
    and app.is_admin_active(auth.uid())
  );

drop policy material_submissions_update_own on public.material_submissions;
create policy material_submissions_update_own on public.material_submissions
  for update to authenticated
  using (
    author_id = auth.uid()
    and status in ('aguardando_revisao', 'nao_apto', 'erro')
    and app.is_admin_active(auth.uid())
  )
  with check (
    author_id = auth.uid()
    and status in ('aguardando_revisao', 'apto')
    and app.is_admin_active(auth.uid())
  );

drop policy question_submissions_insert_own on public.question_submissions;
create policy question_submissions_insert_own on public.question_submissions
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and status = 'aguardando_revisao'
    and app.is_admin_active(auth.uid())
  );

drop policy question_submissions_update_own on public.question_submissions;
create policy question_submissions_update_own on public.question_submissions
  for update to authenticated
  using (
    author_id = auth.uid()
    and status in ('aguardando_revisao', 'nao_apto', 'erro')
    and app.is_admin_active(auth.uid())
  )
  with check (
    author_id = auth.uid()
    and status in ('aguardando_revisao', 'apto')
    and app.is_admin_active(auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 3. Atualizar material por arquivo: só admin
-- ----------------------------------------------------------------------------

create or replace function app.pode_atualizar_material(p_user uuid, p_material uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null
    and app.is_admin_active(p_user);
$$;

revoke all on function app.pode_atualizar_material(uuid, uuid) from public, anon;
grant execute on function app.pode_atualizar_material(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Desagendar o revisor
-- ----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'cron')
     and exists (select 1 from cron.job where jobname = 'revisar-envios') then
    perform cron.unschedule('revisar-envios');
  end if;
end;
$$;
