-- ============================================================================
-- SynapseMed — Missão 42-B: importação de compêndio como operação atômica
-- ============================================================================
--
-- Problema corrigido (42-A): a importação assistida usava
-- `SupabaseMaterialsRepository.saveCompendium()`, que grava material,
-- seções e referências em requisições HTTP independentes (insert do
-- material, depois delete+insert de seções, depois delete+insert de
-- referências) e o repositório resiliente grava a cópia local ANTES de
-- confirmar o Supabase. Uma falha entre essas etapas podia deixar um
-- material "fantasma" (sem seções/referências) no banco, e a cópia local
-- podia divergir do que realmente foi persistido remotamente.
--
-- Esta migration cria `public.import_compendium_draft()`: toda a gravação
-- (material + seções + referências) acontece dentro de uma ÚNICA chamada de
-- função PL/pgSQL. Em Postgres, uma função invocada como uma única
-- instrução já executa dentro de uma transação implícita — qualquer
-- exceção não capturada desfaz TODOS os efeitos da chamada (não precisa,
-- e não pode, de BEGIN/COMMIT explícito aqui). Isso garante: tudo grava,
-- ou nada grava.
--
-- Validações feitas dentro da função (servidor, não confiam na UI):
--   - admin ativo (mesma checagem de publish_material/create_content_revision);
--   - disciplina e tema existem e o tema pertence à disciplina informada;
--   - duplicidade de título (case-insensitive, trim) bloqueada no servidor —
--     mesmo que a checagem client-side seja contornada;
--   - título do material e de cada seção não podem ser vazios;
--   - cada seção precisa de `id` (uuid) e `content` não vazio;
--   - `status` do material é sempre 'draft' — a função nem aceita esse
--     parâmetro, então não há como criar já publicado.
-- Deliberadamente NÃO pré-valida cada item de `p_references` contra
-- string vazia/nula — a constraint `not null` de `material_references.
-- citation_text` já rejeita entradas inválidas no momento do insert, DENTRO
-- da mesma transação, e é exatamente o mecanismo usado no teste de controle
-- negativo (prova de rollback integral mesmo com material e seções já
-- inseridos antes da falha).
-- ============================================================================

create or replace function public.import_compendium_draft(
  p_id uuid,
  p_discipline_id uuid,
  p_theme_id uuid,
  p_title text,
  p_subtitle text,
  p_author text,
  p_estimated_read_time_minutes int,
  p_tags text[],
  p_sections jsonb,
  p_references text[]
)
returns public.materials
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := trim(coalesce(p_title, ''));
  v_theme_discipline_id uuid;
  v_material public.materials;
  v_section jsonb;
  v_section_id uuid;
  v_section_title text;
  v_idx int := 0;
begin
  if not app.is_admin_active(auth.uid()) then
    raise exception 'apenas administradores ativos podem importar materiais';
  end if;

  if p_id is null then
    raise exception 'id do material é obrigatório';
  end if;
  if v_title = '' then
    raise exception 'título é obrigatório';
  end if;
  if p_sections is null or jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) = 0 then
    raise exception 'o material precisa de ao menos uma seção';
  end if;

  perform 1 from public.disciplines where id = p_discipline_id;
  if not found then
    raise exception 'disciplina não encontrada: %', p_discipline_id;
  end if;

  select discipline_id into v_theme_discipline_id from public.themes where id = p_theme_id;
  if not found then
    raise exception 'tema não encontrado: %', p_theme_id;
  end if;
  if v_theme_discipline_id <> p_discipline_id then
    raise exception 'o tema informado não pertence à disciplina informada';
  end if;

  perform 1 from public.materials where lower(trim(title)) = lower(v_title);
  if found then
    raise exception 'já existe um material com o título "%"', v_title;
  end if;

  -- Valida cada seção (título/conteúdo não vazios, id presente) ANTES de
  -- inserir qualquer coisa — mensagens compreensíveis para o caso comum de
  -- entrada inválida (não é o mecanismo do teste de controle negativo, que
  -- usa a constraint de material_references propositalmente não replicada
  -- aqui para as próprias seções, mas as seções TAMBÉM têm content not null
  -- como segunda linha de defesa).
  for v_section in select * from jsonb_array_elements(p_sections)
  loop
    v_section_id := nullif(v_section->>'id', '')::uuid;
    v_section_title := trim(coalesce(v_section->>'title', ''));
    if v_section_id is null then
      raise exception 'seção % sem id válido', v_idx + 1;
    end if;
    if v_section_title = '' then
      raise exception 'seção % sem título', v_idx + 1;
    end if;
    if trim(coalesce(v_section->>'content', '')) = '' then
      raise exception 'seção % sem conteúdo', v_idx + 1;
    end if;
    v_idx := v_idx + 1;
  end loop;

  insert into public.materials
    (id, discipline_id, theme_id, title, subtitle, author, estimated_read_time_minutes, tags, status)
  values
    (p_id, p_discipline_id, p_theme_id, v_title, nullif(trim(coalesce(p_subtitle, '')), ''),
     nullif(trim(coalesce(p_author, '')), ''), p_estimated_read_time_minutes, coalesce(p_tags, '{}'), 'draft')
  returning * into v_material;

  v_idx := 0;
  for v_section in select * from jsonb_array_elements(p_sections)
  loop
    insert into public.material_sections
      (id, material_id, sort_order, title, mechanism_tag, content, key_takeaways, clinical_pearl, warning_alert)
    values (
      (v_section->>'id')::uuid,
      p_id,
      v_idx,
      trim(v_section->>'title'),
      nullif(v_section->>'mechanism_tag', ''),
      v_section->>'content',
      coalesce((select array_agg(value::text) from jsonb_array_elements_text(coalesce(v_section->'key_takeaways', '[]'::jsonb))), '{}'),
      nullif(v_section->>'clinical_pearl', ''),
      nullif(v_section->>'warning_alert', '')
    );
    v_idx := v_idx + 1;
  end loop;

  if p_references is not null and array_length(p_references, 1) > 0 then
    insert into public.material_references (material_id, citation_text, sort_order)
    select p_id, ref, ord - 1
    from unnest(p_references) with ordinality as t(ref, ord);
  end if;

  return v_material;
end;
$$;

revoke all on function public.import_compendium_draft(uuid, uuid, uuid, text, text, text, int, text[], jsonb, text[]) from public, anon;
grant execute on function public.import_compendium_draft(uuid, uuid, uuid, text, text, text, int, text[], jsonb, text[]) to authenticated;
