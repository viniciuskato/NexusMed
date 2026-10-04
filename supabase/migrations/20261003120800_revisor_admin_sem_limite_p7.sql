-- ============================================================================
-- P7 — O revisor local aconselha e o admin não é barrado pelos limites de revisão
--
-- Decisão do dono (03/10): "o revisor aconselha, quem decide sou eu" e "só eu publico". Só o admin
-- envia agora (P6), e a revisão roda no notebook dele, com a cota da assinatura (D-12). Por isso os
-- limites de revisão não valem para o admin; continuam valendo para qualquer outra pessoa (envios
-- antigos, que seguem guardados):
--   1. `revisao_reservar_envios`: o teto do mês e o teto por pessoa por dia não barram envio de admin.
--   2. Gatilhos dos envios de material e de questões: o admin pode ter mais de 3 envios esperando.
--
-- AGENTS.md riscos 13 e 14: nenhuma tabela nova; as funções recriadas repetem o revoke/grant.
-- ============================================================================

-- 1. Reserva: a mesma da 44-H2, com a exceção do admin.
create or replace function public.revisao_reservar_envios(p_max int default 20)
returns table (
  review_id uuid,
  submission_id uuid,
  tipo text,
  title text,
  content_md text,
  content_sha256 text,
  discipline_id uuid,
  theme_id uuid,
  discipline_name text,
  theme_name text,
  parent_title text,
  material_titles text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_monthly int;
  v_daily int;
  v_remaining int;
  v_taken int := 0;
  v_user_used int;
  c record;
  v_admin boolean;
  s public.material_submissions;
  q public.question_submissions;
  v_review uuid;
begin
  -- Uma reserva por vez: dois disparos ao mesmo tempo não furam o limite.
  perform pg_advisory_xact_lock(hashtext('revisao_reservar_envios'));

  select monthly_review_cap, daily_review_cap_per_user into v_monthly, v_daily from public.review_settings;
  v_remaining := v_monthly - app.reviews_used_this_month();

  -- Os dois tipos numa fila só, do mais antigo para o mais novo.
  for c in
    select 'material'::text as kind, m.id, m.author_id, m.created_at
      from public.material_submissions m where m.status = 'aguardando_revisao'
    union all
    select 'questoes'::text, x.id, x.author_id, x.created_at
      from public.question_submissions x where x.status = 'aguardando_revisao'
    order by created_at, id
  loop
    exit when v_taken >= greatest(p_max, 0);

    -- Quem deixou de estar ativo não gasta revisão.
    continue when app.current_profile_status(c.author_id) is distinct from 'active';

    -- P7: o admin (o dono, que agora é quem envia) não é barrado pelos tetos do mês e do dia: o revisor
    -- aconselha e a revisão sai da cota da assinatura dele. Os tetos continuam valendo para os demais.
    v_admin := app.is_admin_active(c.author_id);
    continue when v_remaining <= 0 and not v_admin;

    -- As revisões que este mesmo comando já criou para a pessoa já contam aqui.
    v_user_used := app.reviews_used_by_user_today(c.author_id);
    continue when v_user_used >= v_daily and not v_admin;

    if c.kind = 'material' then
      select sub.* into s from public.material_submissions sub
       where sub.id = c.id and sub.status = 'aguardando_revisao' for update skip locked;
      continue when not found;
      -- O hash é o do texto lido nesta mesma linha, travada por este comando.
      update public.material_submissions set status = 'em_revisao' where id = s.id;
      insert into public.material_reviews (submission_id, content_sha256)
      values (s.id, s.content_sha256) returning id into v_review;

      review_id := v_review;
      submission_id := s.id;
      tipo := 'material';
      title := s.title;
      content_md := s.content_md;
      content_sha256 := s.content_sha256;
      discipline_id := s.discipline_id;
      theme_id := s.theme_id;
      select d.name into discipline_name from public.disciplines d where d.id = s.discipline_id;
      select t.name into theme_name from public.themes t where t.id = s.theme_id;
      select m.title into parent_title from public.materials m where m.id = s.parent_material_id;
      material_titles := null;
    else
      select sub.* into q from public.question_submissions sub
       where sub.id = c.id and sub.status = 'aguardando_revisao' for update skip locked;
      continue when not found;
      update public.question_submissions set status = 'em_revisao' where id = q.id;
      insert into public.material_reviews (question_submission_id, content_sha256)
      values (q.id, q.content_sha256) returning id into v_review;

      review_id := v_review;
      submission_id := q.id;
      tipo := 'questoes';
      title := q.title;
      content_md := q.content_md;
      content_sha256 := q.content_sha256;
      discipline_id := null;
      theme_id := null;
      discipline_name := null;
      theme_name := null;
      parent_title := null;
      material_titles := coalesce(
        (select array_agg(m.title order by m.title) from public.materials m where m.id = any (q.material_ids)),
        '{}'
      );
    end if;

    v_taken := v_taken + 1;
    v_remaining := v_remaining - 1;
    return next;
  end loop;
end;
$$;

revoke all on function public.revisao_reservar_envios(int) from public, anon, authenticated;
grant execute on function public.revisao_reservar_envios(int) to service_role;

-- 2. Gatilho do envio de questões: o da 44-H2, sem o limite de 3 esperando para o admin.
create or replace function app.question_submissions_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_client boolean := current_user in ('authenticated', 'anon');
  v_enters_queue boolean;
begin
  if tg_op = 'INSERT'
     or v_client
     or new.material_ids is distinct from old.material_ids then
    perform app.check_question_submission_refs(new.material_ids);
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if v_client then
      -- Substituir o texto recoloca o envio na fila. Mudança que NÃO mexe no texto (ex.:
      -- "Tentar de novo") com revisão "apto" válida do texto E dos materiais atuais: volta a
      -- "apto" e só a publicação é refeita. Materiais escolhidos diferentes dos que a IA
      -- recebeu: volta à REVISÃO (44-G3). Compara com os valores NOVOS.
      new.status := case
        when new.content_md = old.content_md and app.envio_de_questoes_tem_revisao_apto_do_autor(old.id, new.material_ids) then 'apto'
        else 'aguardando_revisao'
      end;
      new.author_id := old.author_id;
      new.created_at := old.created_at;
      new.publication_note := null;
      new.published_question_ids := old.published_question_ids;
    end if;
  end if;

  v_enters_queue := new.status in ('aguardando_revisao', 'em_revisao')
    and (tg_op = 'INSERT' or old.status not in ('aguardando_revisao', 'em_revisao'));
  if v_enters_queue
     and not app.is_admin_active(new.author_id)
     and app.question_submission_waiting_count(new.author_id, new.id) >= 3 then
    raise exception 'Você já tem 3 envios esperando revisão'
      using errcode = 'P0001', hint = 'limite_envios_em_espera';
  end if;

  return new;
end;
$$;

-- 3. Gatilho do envio de material: o da 44-B, sem o limite de 3 esperando para o admin.
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
             -- Atualização: a revisão que aprovou tem de ser a da base de agora (a que o material tem
             -- agora), não a de uma versão velha do material.
             and (new.target_material_id is null
                  or app.envio_tem_revisao_apto_do_autor_para_base(
                       old.id, new.discipline_id, new.theme_id, new.parent_material_id, new.base_snapshot_hash))
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
  if v_enters_queue
     and not app.is_admin_active(new.author_id)
     and app.submission_waiting_count(new.author_id, new.id) >= 3 then
    raise exception 'Você já tem 3 envios esperando revisão'
      using errcode = 'P0001', hint = 'limite_envios_em_espera';
  end if;

  return new;
end;
$$;

revoke all on function app.material_submissions_before_write() from public, anon, authenticated;
revoke all on function app.question_submissions_before_write() from public, anon, authenticated;
