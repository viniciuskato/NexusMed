-- ============================================================================
-- 43-B — correções da revisão do PR #94
--
-- O PR #94 foi mesclado antes da triagem da revisão; como a migration
-- 20260927120000 já está no main, as correções de SQL entram aqui, em
-- arquivo novo, sem editar a mesclada.
--
-- 1. A guarda de exclusão de material conta também a coluna antiga
--    `questions.material_id`: ela entra no hash de atestação da questão, e o
--    ON DELETE SET NULL dela mudaria o hash (invalidando em silêncio a
--    aprovação de um rascunho) ou esbarraria no congelamento da publicada.
-- 2. `app.replace_question_material_links`: vínculo sem material é checado
--    antes da repetição, e a repetição é comparada como uuid (a mesma id com
--    outra caixa virava erro cru de chave primária).
-- 3. `set_question_materials` trava a questão (`for update`): duas trocas
--    simultâneas se enfileiram em vez de colidir na chave primária.
-- ============================================================================

create or replace function app.replace_question_material_links(p_question_id uuid, p_links jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link jsonb;
  v_idx int := 0;
  v_material_id uuid;
begin
  if p_links is null or jsonb_typeof(p_links) <> 'array' then
    raise exception 'lista de materiais inválida';
  end if;
  -- Vínculo sem material antes da checagem de repetição (count distinct
  -- ignora nulo), e repetição comparada como uuid, não como texto (a mesma
  -- id com outra caixa virava erro cru de chave primária).
  for v_link in select * from jsonb_array_elements(p_links)
  loop
    v_idx := v_idx + 1;
    if nullif(v_link->>'material_id', '') is null then
      raise exception 'vínculo % sem material', v_idx;
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_links) e)
     <> (select count(distinct (e->>'material_id')::uuid) from jsonb_array_elements(p_links) e) then
    raise exception 'o mesmo material aparece mais de uma vez';
  end if;
  v_idx := 0;

  delete from public.question_materials where question_id = p_question_id;

  for v_link in select * from jsonb_array_elements(p_links)
  loop
    v_material_id := nullif(v_link->>'material_id', '')::uuid;
    if v_material_id is null then
      raise exception 'vínculo % sem material', v_idx + 1;
    end if;
    perform 1 from public.materials where id = v_material_id;
    if not found then
      raise exception 'material não encontrado: %', v_material_id;
    end if;
    insert into public.question_materials (question_id, material_id, material_section_id, sort_order)
    values (p_question_id, v_material_id, nullif(v_link->>'material_section_id', '')::uuid, v_idx);
    v_idx := v_idx + 1;
  end loop;
end;
$$;

revoke all on function app.replace_question_material_links(uuid, jsonb) from public, anon, authenticated;

create or replace function public.set_question_materials(p_question_id uuid, p_links jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_admin_active(auth.uid()) then
    raise exception 'apenas administradores ativos podem alterar o vínculo da questão';
  end if;
  -- Trava a questão: duas trocas simultâneas (clique duplo em "Salvar
  -- vínculo", dois admins) se enfileiram em vez de colidir na chave primária.
  perform 1 from public.questions where id = p_question_id for update;
  if not found then
    raise exception 'questão não encontrada: %', p_question_id;
  end if;
  perform app.replace_question_material_links(p_question_id, p_links);
end;
$$;

revoke all on function public.set_question_materials(uuid, jsonb) from public, anon;
grant execute on function public.set_question_materials(uuid, jsonb) to authenticated;

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

  -- Também a coluna antiga: ela entra no hash de atestação da questão, e o
  -- ON DELETE SET NULL dela mudaria esse hash (invalidando em silêncio a
  -- aprovação de um rascunho) ou esbarraria no congelamento da publicada.
  if exists (select 1 from public.question_materials where material_id = p_material_id) then
    return 'Material cobrado por questões não pode ser excluído. Tire o material do vínculo dessas questões (botão "Vínculo" na lista de questões) antes.';
  end if;
  if exists (select 1 from public.questions where material_id = p_material_id) then
    return 'Material registrado como vínculo original de questões não pode ser excluído: esse registro faz parte do conteúdo atestado delas. Mantenha-o despublicado para tirá-lo do ar.';
  end if;

  return null;
end;
$$;

