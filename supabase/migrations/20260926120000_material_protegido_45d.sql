-- ============================================================================
-- 45-D — Material publicado protegido (AUD-22)
--
-- Antes: `materials` não tinha trava contra DELETE (questões têm
-- `guard_question_delete`), e excluir um material apagava em cascata
-- anotações, favoritos e progresso de todos os alunos, a trilha de revisão e
-- atestação e as ligações de saída. Remover uma seção (pela edição, via
-- `save_compendium`) apagava as anotações dos alunos nela.
--
-- Depois:
-- 1. `guard_material_delete` recusa, com mensagem que diz o que fazer, excluir
--    material publicado, com dado de aluno, com trilha de revisão, com filhos
--    na árvore ou com ligações ("Estude antes"/"Veja também", de saída ou de
--    entrada). Vale para todo papel do app; só `postgres` passa (limpeza de
--    teste e manutenção manual), como as outras guardas de material.
-- 2. Como reforço no próprio banco, a trilha de revisão e as ligações de saída
--    deixam de ser apagadas em cascata com o material (RESTRICT).
-- 3. A anotação de uma seção removida continua do aluno: passa para o próprio
--    material, marcada com o título da seção (`notes.removed_section_title`).
--    A anotação do material continua sendo uma por aluno; as de seções
--    removidas ficam ao lado, uma por seção.
-- 4. Só conta como "dado de aluno" o de estudante (não o do admin/autor), e
--    favorito, progresso e anotação só são gravados em material que o usuário
--    pode ler (RLS e as RPCs `upsert_note`/`set_section_read`).
-- 5. `delete_material_maintenance`, só de service_role, é o caminho explícito
--    dos scripts de manutenção para apagar o material que eles semeiam.
--
-- Não muda: editar material publicado continua mudando o conteúdo na hora
-- (isso é da 45-K); "Salvar" sem mudança continua no-op; `save_compendium`
-- não muda.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Anotação de seção removida
-- ----------------------------------------------------------------------------

alter table public.notes add column removed_section_title text;

alter table public.notes add constraint notes_removed_section_on_material
  check (removed_section_title is null or material_id is not null);

comment on column public.notes.removed_section_title is
  '45-D: título da seção de onde a anotação veio, quando a seção saiu do material. '
  'A anotação passa a apontar para o material; nulo nas anotações comuns.';

-- Uma anotação do material por aluno; as de seções removidas não contam.
drop index public.notes_user_material_uq;
create unique index notes_user_material_uq on public.notes (user_id, material_id)
  where removed_section_title is null;

create or replace function public.preserve_notes_of_removed_section()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Material inteiro sendo excluído (a cascata chega aqui depois de a linha do
  -- material sumir): a guarda de exclusão já garantiu que não há anotação de
  -- aluno, e mover para um material que não existe mais violaria a FK.
  if not exists (select 1 from public.materials where id = old.material_id) then
    return old;
  end if;

  update public.notes
  set material_id = old.material_id,
      material_section_id = null,
      removed_section_title = old.title
  where material_section_id = old.id;
  return old;
end;
$$;

revoke all on function public.preserve_notes_of_removed_section() from public, anon;

create trigger trg_preserve_notes_of_removed_section
  before delete on public.material_sections
  for each row execute function public.preserve_notes_of_removed_section();

-- A anotação do material que o aluno edita é a comum, nunca a de uma seção
-- removida. Mesma função da 07-E3, com esse filtro a mais na leitura.
create or replace function public.upsert_note(
  p_material_id uuid default null,
  p_material_section_id uuid default null,
  p_question_id uuid default null,
  p_flashcard_id uuid default null,
  p_note_text text default null,
  p_base_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_lock_key bigint;
  v_existing record;
  v_final_text text;
  v_final_updated_at timestamptz;
begin
  if app.current_profile_status(v_uid) is distinct from 'active' then
    raise exception 'apenas estudantes ativos podem gravar notas';
  end if;
  if num_nonnulls(p_material_id, p_material_section_id, p_question_id, p_flashcard_id) <> 1 then
    raise exception 'informe exatamente um alvo para a nota';
  end if;
  if p_note_text is null then
    raise exception 'note_text é obrigatório';
  end if;
  -- Só anota material (ou seção de material) que o usuário pode ler: sem
  -- isso, qualquer estudante gravaria "dado de aluno" num rascunho alheio e o
  -- tornaria impossível de excluir (seção 4 abaixo).
  if (p_material_id is not null and not app.can_read_material(v_uid, p_material_id))
     or (p_material_section_id is not null and not app.can_read_material(
           v_uid, (select material_id from public.material_sections where id = p_material_section_id))) then
    raise exception 'material não encontrado';
  end if;

  -- Serialização por (usuário, alvo): ver 20260909150000_conflict_serialization_07e3.sql.
  v_lock_key := pg_catalog.hashtextextended(
    'note:' || v_uid::text || ':' ||
    coalesce(p_material_id::text, '') || ':' ||
    coalesce(p_material_section_id::text, '') || ':' ||
    coalesce(p_question_id::text, '') || ':' ||
    coalesce(p_flashcard_id::text, ''),
    0
  );
  perform pg_catalog.pg_advisory_xact_lock(v_lock_key);

  select id, note_text, updated_at into v_existing
  from public.notes
  where user_id = v_uid
    and material_id is not distinct from p_material_id
    and material_section_id is not distinct from p_material_section_id
    and question_id is not distinct from p_question_id
    and flashcard_id is not distinct from p_flashcard_id
    and removed_section_title is null
  for update;

  -- Conflito: ver 20260909150000_conflict_serialization_07e3.sql.
  if v_existing.id is not null
     and v_existing.note_text is distinct from p_note_text
     and (p_base_updated_at is null or v_existing.updated_at > p_base_updated_at) then
    return jsonb_build_object(
      'conflict', true,
      'server_text', v_existing.note_text,
      'server_updated_at', v_existing.updated_at
    );
  end if;

  if v_existing.id is not null then
    update public.notes
    set note_text = p_note_text, updated_at = pg_catalog.clock_timestamp()
    where id = v_existing.id
    returning note_text, updated_at into v_final_text, v_final_updated_at;
  else
    insert into public.notes (user_id, material_id, material_section_id, question_id, flashcard_id, note_text, updated_at)
    values (v_uid, p_material_id, p_material_section_id, p_question_id, p_flashcard_id, p_note_text, pg_catalog.clock_timestamp())
    returning note_text, updated_at into v_final_text, v_final_updated_at;
  end if;

  return jsonb_build_object('conflict', false, 'note_text', v_final_text, 'updated_at', v_final_updated_at);
end;
$$;

revoke all on function public.upsert_note(uuid, uuid, uuid, uuid, text, timestamptz) from public, anon;
grant execute on function public.upsert_note(uuid, uuid, uuid, uuid, text, timestamptz) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Guarda de exclusão de material
-- ----------------------------------------------------------------------------

-- O que impede excluir o material, ou nulo. SECURITY DEFINER porque precisa
-- enxergar dado de todos os alunos, que a RLS esconde do admin; fica no schema
-- `app`, que a API não expõe.
create or replace function app.material_delete_blocker(p_material_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.materials where id = p_material_id and status = 'published') then
    return 'Material publicado não pode ser excluído. Despublique-o antes; se alunos já o usaram, ele continua protegido.';
  end if;

  -- Só dado de estudante: o admin (inclusive o autor conferindo o próprio
  -- rascunho) não torna o material impossível de excluir.
  if exists (select 1 from public.notes n join public.profiles p on p.id = n.user_id
             where n.material_id = p_material_id and p.role = 'student')
     or exists (select 1 from public.notes n
                join public.material_sections s on s.id = n.material_section_id
                join public.profiles p on p.id = n.user_id
                where s.material_id = p_material_id and p.role = 'student')
     or exists (select 1 from public.bookmarks b join public.profiles p on p.id = b.user_id
                where b.material_id = p_material_id and p.role = 'student')
     or exists (select 1 from public.reading_progress r join public.profiles p on p.id = r.user_id
                where r.material_id = p_material_id and p.role = 'student') then
    return 'Material com dados de alunos (anotações, favoritos ou progresso de leitura) não pode ser excluído. Mantenha-o despublicado para tirá-lo do ar.';
  end if;

  if exists (select 1 from public.content_revisions where material_id = p_material_id) then
    return 'Material com trilha de revisão e atestação não pode ser excluído: ela é a prova de quem revisou. Mantenha-o despublicado para tirá-lo do ar.';
  end if;

  if exists (select 1 from public.materials where parent_material_id = p_material_id) then
    return 'Material com filhos na árvore não pode ser excluído. Realoque ou exclua os filhos antes.';
  end if;

  if exists (select 1 from public.material_links
             where source_material_id = p_material_id or target_material_id = p_material_id) then
    return 'Material com ligações "Estude antes" ou "Veja também" (de saída ou de entrada) não pode ser excluído. As ligações estão congeladas desde a 43-A e não são removidas pela tela; mantenha o material despublicado para tirá-lo do ar.';
  end if;

  return null;
end;
$$;

revoke all on function app.material_delete_blocker(uuid) from public, anon;
grant execute on function app.material_delete_blocker(uuid) to authenticated, service_role;

-- SECURITY INVOKER de propósito: `current_user` precisa ser o papel de quem
-- exclui (numa função DEFINER seria sempre o dono, `postgres`).
create or replace function public.guard_material_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_blocker text;
begin
  if current_user = 'postgres' then
    return old;
  end if;
  v_blocker := app.material_delete_blocker(old.id);
  if v_blocker is not null then
    raise exception '%', v_blocker using errcode = 'P0001';
  end if;
  return old;
end;
$$;

revoke all on function public.guard_material_delete() from public, anon;

-- Bug anterior à 45-D: desde que as ligações foram congeladas (43-A), o papel
-- do admin não pode escrever em `material_links`, e este gatilho — que roda
-- com o papel de quem exclui — fazia TODA exclusão de material pela Área
-- Editorial falhar com "permission denied for table material_links". Para o
-- app ele nunca encontra ligação (a guarda acima recusa antes); continua
-- limpando os "Veja também" quando `postgres` exclui.
alter function public.clear_symmetric_material_links() security definer;

-- Nome com "aa": gatilhos BEFORE disparam em ordem alfabética, e esta guarda
-- precisa rodar antes de `trg_clear_symmetric_material_links`, que apaga os
-- "Veja também" do material (senão a guarda não os veria).
create trigger trg_aa_guard_material_delete
  before delete on public.materials
  for each row execute function public.guard_material_delete();

-- ----------------------------------------------------------------------------
-- 3. Reforço no banco: nada disso sai em cascata com o material
-- ----------------------------------------------------------------------------

alter table public.content_revisions drop constraint content_revisions_material_id_fkey;
alter table public.content_revisions add constraint content_revisions_material_id_fkey
  foreign key (material_id) references public.materials(id) on delete restrict;

alter table public.material_links drop constraint material_links_source_fkey;
alter table public.material_links add constraint material_links_source_fkey
  foreign key (source_material_id) references public.materials(id) on delete restrict;

-- ----------------------------------------------------------------------------
-- 4. Dado de aluno só em material que o aluno pode ler
-- ----------------------------------------------------------------------------
-- Sem isto, qualquer estudante ativo gravava favorito, progresso ou anotação
-- para qualquer id de material — inclusive rascunho alheio, que a guarda da
-- seção 2 passaria a considerar "com dados de alunos" e não deixaria excluir.

-- Publicado, ou o usuário é admin ativo (mesma regra de materials_select_published).
create or replace function app.can_read_material(p_uid uuid, p_material_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.materials m
    where m.id = p_material_id
      and ((m.status = 'published' and app.current_profile_status(p_uid) = 'active')
           or app.is_admin_active(p_uid))
  );
$$;

revoke all on function app.can_read_material(uuid, uuid) from public, anon;
grant execute on function app.can_read_material(uuid, uuid) to authenticated, service_role;

-- Gravação direta pela API (favorito; progresso e anotação também, embora o
-- app use as RPCs). RESTRICTIVE: soma-se à política de dono já existente.
create policy bookmarks_material_readable on public.bookmarks
  as restrictive for insert to authenticated
  with check (material_id is null or app.can_read_material(auth.uid(), material_id));
create policy bookmarks_material_readable_update on public.bookmarks
  as restrictive for update to authenticated
  with check (material_id is null or app.can_read_material(auth.uid(), material_id));

create policy reading_progress_material_readable on public.reading_progress
  as restrictive for insert to authenticated
  with check (app.can_read_material(auth.uid(), material_id));
create policy reading_progress_material_readable_update on public.reading_progress
  as restrictive for update to authenticated
  with check (app.can_read_material(auth.uid(), material_id));

create policy notes_material_readable on public.notes
  as restrictive for insert to authenticated
  with check (
    (material_id is null or app.can_read_material(auth.uid(), material_id))
    and (material_section_id is null or app.can_read_material(
           auth.uid(), (select s.material_id from public.material_sections s where s.id = material_section_id)))
  );
create policy notes_material_readable_update on public.notes
  as restrictive for update to authenticated
  with check (
    (material_id is null or app.can_read_material(auth.uid(), material_id))
    and (material_section_id is null or app.can_read_material(
           auth.uid(), (select s.material_id from public.material_sections s where s.id = material_section_id)))
  );

-- Progresso pela RPC: mesma função de 20260909130000_sync_reliability_categorias_3_a_7.sql,
-- com a existência do material trocada por "o usuário pode lê-lo".
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

  v_percent := round((coalesce(array_length(v_updated, 1), 0)::numeric / p_total_sections) * 100);

  update public.reading_progress
  set read_section_ids = v_updated,
      percent = v_percent,
      updated_at = pg_catalog.now()
  where user_id = v_uid and material_id = p_material_id;

  return jsonb_build_object('read_section_ids', to_jsonb(v_updated), 'percent', v_percent);
end;
$$;

revoke all on function public.set_section_read(uuid, uuid, boolean, int) from public, anon;
grant execute on function public.set_section_read(uuid, uuid, boolean, int) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Caminho explícito de manutenção (scripts com service_role)
-- ----------------------------------------------------------------------------
-- A guarda da seção 2 vale também para service_role, e os scripts de
-- validação semeiam material publicado. Esta função, só de service_role,
-- apaga o material semeado de ponta a ponta (trilha de revisão e ligações
-- incluídas); roda como o dono (`postgres`), que a guarda deixa passar.
create or replace function public.delete_material_maintenance(p_material_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.content_revisions where material_id = p_material_id;
  delete from public.material_links
  where source_material_id = p_material_id or target_material_id = p_material_id;
  delete from public.materials where id = p_material_id;
end;
$$;

revoke all on function public.delete_material_maintenance(uuid) from public, anon, authenticated;
grant execute on function public.delete_material_maintenance(uuid) to service_role;
