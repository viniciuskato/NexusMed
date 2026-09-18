-- ============================================================================
-- Salvar compêndio pelo formulário do CMS sem apagar dados dependentes
-- (auditoria 2026-09-18)
-- ============================================================================
--
-- Problema: SupabaseMaterialsRepository.saveCompendium() apagava TODAS as
-- material_sections do material e as reinseria, mesmo com os mesmos ids. O
-- DELETE dispara as FKs de material_sections:
--   - notes.material_section_id            ON DELETE CASCADE  (anotações dos alunos)
--   - material_section_versions            ON DELETE CASCADE  (histórico editorial)
--   - content_assets.material_section_id   ON DELETE CASCADE  (imagens da seção)
--   - questions.material_section_id        ON DELETE SET NULL (vínculo questão↔seção)
-- Ou seja: cada "Salvar" no formulário apagava anotações de alunos, histórico
-- e imagens, e desligava questões da seção. Além disso, eram várias
-- requisições HTTP independentes (sem atomicidade).
--
-- Esta função faz a gravação inteira numa transação única:
--   - upsert do material (nunca altera `status`; publicação continua só via
--     publish_material);
--   - seções: UPDATE das que já existem (por id), INSERT das novas e DELETE
--     só das que o admin removeu do formulário;
--   - referências: substituídas por completo (nenhuma tabela aponta para
--     material_references), preservando source_id/url quando informados.
-- ============================================================================

create or replace function public.save_compendium(
  p_material jsonb,
  p_sections jsonb,
  p_references jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_material->>'id', '')::uuid;
  v_title text := trim(coalesce(p_material->>'title', ''));
  v_section jsonb;
  v_section_ids uuid[] := '{}';
  v_section_id uuid;
  v_idx int := 0;
begin
  if not app.is_admin_active(auth.uid()) then
    raise exception 'apenas administradores ativos podem salvar materiais';
  end if;

  if v_id is null then
    raise exception 'id do material é obrigatório';
  end if;
  if v_title = '' then
    raise exception 'título é obrigatório';
  end if;
  if p_sections is null or jsonb_typeof(p_sections) <> 'array' then
    raise exception 'seções devem ser uma lista';
  end if;
  if p_references is not null and jsonb_typeof(p_references) <> 'array' then
    raise exception 'referências devem ser uma lista';
  end if;

  for v_section in select * from jsonb_array_elements(p_sections)
  loop
    v_section_id := nullif(v_section->>'id', '')::uuid;
    if v_section_id is null then
      raise exception 'seção % sem id válido', v_idx + 1;
    end if;
    if trim(coalesce(v_section->>'title', '')) = '' then
      raise exception 'seção % sem título', v_idx + 1;
    end if;
    if v_section_id = any(v_section_ids) then
      raise exception 'seção % com id repetido', v_idx + 1;
    end if;
    v_section_ids := v_section_ids || v_section_id;
    v_idx := v_idx + 1;
  end loop;

  -- Um id de seção de OUTRO material nunca pode ser "movido" para este.
  perform 1 from public.material_sections
  where id = any(v_section_ids) and material_id <> v_id;
  if found then
    raise exception 'seção informada pertence a outro material';
  end if;

  insert into public.materials
    (id, discipline_id, theme_id, title, subtitle, mode, study_lens, module_number,
     estimated_read_time_minutes, author, tags)
  values (
    v_id,
    (p_material->>'discipline_id')::uuid,
    (p_material->>'theme_id')::uuid,
    v_title,
    nullif(trim(coalesce(p_material->>'subtitle', '')), ''),
    nullif(p_material->>'mode', ''),
    nullif(p_material->>'study_lens', ''),
    (p_material->>'module_number')::int,
    (p_material->>'estimated_read_time_minutes')::int,
    nullif(trim(coalesce(p_material->>'author', '')), ''),
    coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(p_material->'tags', '[]'::jsonb))), '{}')
  )
  on conflict (id) do update set
    discipline_id = excluded.discipline_id,
    theme_id = excluded.theme_id,
    title = excluded.title,
    subtitle = excluded.subtitle,
    mode = excluded.mode,
    study_lens = excluded.study_lens,
    module_number = excluded.module_number,
    estimated_read_time_minutes = excluded.estimated_read_time_minutes,
    author = excluded.author,
    tags = excluded.tags;

  -- Remove só as seções que saíram do formulário (remoção explícita do admin).
  delete from public.material_sections
  where material_id = v_id and not (id = any(v_section_ids));

  -- unique (material_id, sort_order): desloca a ordem atual para fora da
  -- faixa final antes de reordenar, senão uma troca de posição colide.
  update public.material_sections
  set sort_order = sort_order + 1000000
  where material_id = v_id;

  v_idx := 0;
  for v_section in select * from jsonb_array_elements(p_sections)
  loop
    insert into public.material_sections
      (id, material_id, sort_order, title, mechanism_tag, content, key_takeaways, clinical_pearl, warning_alert)
    values (
      (v_section->>'id')::uuid,
      v_id,
      v_idx,
      trim(v_section->>'title'),
      nullif(v_section->>'mechanism_tag', ''),
      coalesce(v_section->>'content', ''),
      coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(v_section->'key_takeaways', '[]'::jsonb))), '{}'),
      nullif(v_section->>'clinical_pearl', ''),
      nullif(v_section->>'warning_alert', '')
    )
    on conflict (id) do update set
      sort_order = excluded.sort_order,
      title = excluded.title,
      mechanism_tag = excluded.mechanism_tag,
      content = excluded.content,
      key_takeaways = excluded.key_takeaways,
      clinical_pearl = excluded.clinical_pearl,
      warning_alert = excluded.warning_alert,
      updated_at = pg_catalog.now();
    v_idx := v_idx + 1;
  end loop;

  delete from public.material_references where material_id = v_id;

  if p_references is not null and jsonb_array_length(p_references) > 0 then
    insert into public.material_references (material_id, citation_text, sort_order, source_id, url)
    select
      v_id,
      r.value->>'citation_text',
      (r.ord - 1)::int,
      nullif(r.value->>'source_id', ''),
      nullif(r.value->>'url', '')
    from jsonb_array_elements(p_references) with ordinality as r(value, ord);
  end if;
end;
$$;

revoke all on function public.save_compendium(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_compendium(jsonb, jsonb, jsonb) to authenticated;
