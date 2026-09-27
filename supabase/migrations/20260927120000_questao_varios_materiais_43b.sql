-- ============================================================================
-- 43-B — Questão cobre um ou vários materiais
--
-- Antes: a questão guardava UM material (`questions.material_id`, com
-- `material_section_id`), a importação em lote não aceitava nenhum, e o
-- vínculo entrava no hash de atestação — mudar o vínculo exigia despublicar e
-- revisar de novo uma questão cujo conteúdo não mudou.
--
-- Decisão (registrada aqui e no PR, como pede a unidade): o hash cobre o que
-- o revisor lê, não como a questão é alcançada — a mesma regra aplicada aos
-- materiais em 20260922130000 (navegação fora do hash). Por isso:
-- 1. O vínculo passa a morar em `question_materials` (um ou vários materiais,
--    seção opcional por material), fora de `app.build_question_snapshot`.
-- 2. `app.build_question_snapshot` NÃO muda: as colunas antigas
--    `questions.material_id`/`material_section_id` continuam no snapshot com o
--    valor que já têm, então nenhum hash aprovado muda. Elas deixam de ser
--    gravadas (o app não escreve mais nelas) e ficam só como registro do
--    vínculo original; quem lê o vínculo lê `question_materials`.
-- 3. Os vínculos existentes são copiados para `question_materials`
--    (`app.backfill_question_materials`, idempotente).
-- 4. O vínculo é editável mesmo com a questão publicada (o conteúdo continua
--    congelado por `guard_question_content_immutable`); só admin grava, pela
--    RPC `set_question_materials`, e a importação aceita os materiais do lote
--    (`import_question_draft(..., p_material_links)`).
-- 5. Material cobrado por questões não é excluído: o vínculo curado não some
--    em cascata (mesma lógica da 45-D).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabela
-- ----------------------------------------------------------------------------

create table public.question_materials (
  question_id uuid not null references public.questions(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  -- Seção removida do material: o vínculo continua, no material inteiro.
  material_section_id uuid references public.material_sections(id) on delete set null,
  sort_order int not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  primary key (question_id, material_id)
);

comment on table public.question_materials is
  '43-B: materiais (e seção opcional) que a questão cobra. Fora do hash de atestação da questão.';

create index question_materials_material_idx on public.question_materials (material_id);

-- A seção escolhida precisa ser do material do vínculo.
create or replace function public.validate_question_material_section()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.material_section_id is not null and not exists (
    select 1 from public.material_sections s
    where s.id = new.material_section_id and s.material_id = new.material_id
  ) then
    raise exception 'a seção escolhida não pertence ao material do vínculo';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_question_material_section() from public, anon;

create trigger trg_validate_question_material_section
  before insert or update on public.question_materials
  for each row execute function public.validate_question_material_section();

alter table public.question_materials enable row level security;
revoke all on table public.question_materials from anon;
revoke insert, update, delete, truncate on table public.question_materials from authenticated;
grant select on table public.question_materials to authenticated;

-- Admin lê tudo; estudante ativo lê o vínculo entre questão publicada e
-- material publicado (vínculo com rascunho não aparece para ele).
create policy question_materials_select on public.question_materials
  for select to authenticated
  using (
    app.is_admin_active(auth.uid())
    or (
      app.current_profile_status(auth.uid()) = 'active'
      and exists (select 1 from public.questions q where q.id = question_id and q.status = 'published')
      and exists (select 1 from public.materials m where m.id = material_id and m.status = 'published')
    )
  );

-- ----------------------------------------------------------------------------
-- 2. Gravação
-- ----------------------------------------------------------------------------

-- Troca os vínculos da questão pela lista dada, na ordem dada. Uso interno
-- (chamada pelas RPCs abaixo, que conferem quem chama).
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

-- Pela Área Editorial ("Vínculo" na lista de questões). Vale também para
-- questão publicada: o vínculo não entra no hash nem no congelamento.
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

-- Importação em lote: mesma função de 20260921130000, com os materiais do
-- lote (`p_material_links`, opcional). A assinatura antiga sai; como o
-- parâmetro novo tem default, a chamada antiga continua valendo.
drop function public.import_question_draft(
  uuid, uuid, uuid, text, text, text, int, text, text, text, text, text[], jsonb
);

create or replace function public.import_question_draft(
  p_id uuid,
  p_discipline_id uuid,
  p_theme_id uuid,
  p_cycle text,
  p_difficulty text,
  p_institution text,
  p_year int,
  p_clinical_vignette text,
  p_question_stem text,
  p_general_commentary text,
  p_high_yield_summary text,
  p_tags text[],
  p_options jsonb,
  p_material_links jsonb default '[]'::jsonb
)
returns public.questions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_theme_discipline_id uuid;
  v_question public.questions;
  v_option jsonb;
  v_letter text;
  v_option_text text;
  v_correct_count int := 0;
  v_option_count int := 0;
  v_inserted_option_id uuid;
begin
  if not app.is_admin_active(auth.uid()) then
    raise exception 'apenas administradores ativos podem importar questões';
  end if;

  if p_id is null then
    raise exception 'id da questão é obrigatório';
  end if;
  if trim(coalesce(p_question_stem, '')) = '' then
    raise exception 'comando da questão (pergunta) é obrigatório';
  end if;
  if p_cycle not in ('basico', 'clinico', 'internato_residencia') then
    raise exception 'ciclo inválido: %', p_cycle;
  end if;
  if p_difficulty not in ('facil', 'medio', 'dificil') then
    raise exception 'dificuldade inválida: %', p_difficulty;
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

  if p_options is null or jsonb_typeof(p_options) <> 'array' then
    raise exception 'lista de alternativas inválida';
  end if;

  for v_option in select * from jsonb_array_elements(p_options)
  loop
    v_letter := v_option->>'letter';
    v_option_text := trim(coalesce(v_option->>'text', ''));
    if v_letter is null or v_letter !~ '^[A-Z]{1,3}$' then
      raise exception 'alternativa % com letra inválida', v_option_count + 1;
    end if;
    if v_option_text = '' then
      raise exception 'alternativa % sem texto', v_letter;
    end if;
    if coalesce((v_option->>'is_correct')::boolean, false) then
      v_correct_count := v_correct_count + 1;
    end if;
    v_option_count := v_option_count + 1;
  end loop;

  if v_option_count < 2 then
    raise exception 'questão precisa de ao menos 2 alternativas (encontradas: %)', v_option_count;
  end if;
  if v_correct_count <> 1 then
    raise exception 'questão precisa de exatamente 1 alternativa correta (encontradas: %)', v_correct_count;
  end if;

  insert into public.questions
    (id, discipline_id, theme_id, cycle, difficulty, institution, year,
     clinical_vignette, question_stem, tags, status)
  values
    (p_id, p_discipline_id, p_theme_id, p_cycle, p_difficulty,
     nullif(trim(coalesce(p_institution, '')), ''), p_year,
     coalesce(p_clinical_vignette, ''), p_question_stem, coalesce(p_tags, '{}'), 'draft')
  returning * into v_question;

  insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary)
  values (p_id, coalesce(p_general_commentary, ''), coalesce(p_high_yield_summary, ''));

  v_option_count := 0;
  for v_option in select * from jsonb_array_elements(p_options)
  loop
    insert into public.question_options (question_id, letter, option_text, sort_order)
    values (p_id, v_option->>'letter', trim(v_option->>'text'), v_option_count)
    returning id into v_inserted_option_id;

    -- `trg_create_question_option_key` já cria a chave: UPDATE, não INSERT
    -- (AGENTS.md, risco 16).
    update public.question_option_keys
    set is_correct = coalesce((v_option->>'is_correct')::boolean, false),
        explanation = coalesce(v_option->>'explanation', '')
    where option_id = v_inserted_option_id;

    v_option_count := v_option_count + 1;
  end loop;

  perform app.replace_question_material_links(p_id, coalesce(p_material_links, '[]'::jsonb));

  return v_question;
end;
$$;

revoke all on function public.import_question_draft(
  uuid, uuid, uuid, text, text, text, int, text, text, text, text, text[], jsonb, jsonb
) from public, anon;
grant execute on function public.import_question_draft(
  uuid, uuid, uuid, text, text, text, int, text, text, text, text, text[], jsonb, jsonb
) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Vínculos existentes
-- ----------------------------------------------------------------------------

-- Copia `questions.material_id`/`material_section_id` para a tabela nova.
-- Idempotente; a seção só é copiada se ainda for daquele material.
create or replace function app.backfill_question_materials()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  insert into public.question_materials (question_id, material_id, material_section_id, sort_order)
  select q.id, q.material_id,
         (select s.id from public.material_sections s
          where s.id = q.material_section_id and s.material_id = q.material_id),
         0
  from public.questions q
  where q.material_id is not null
  on conflict (question_id, material_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function app.backfill_question_materials() from public, anon, authenticated;

select app.backfill_question_materials();

-- ----------------------------------------------------------------------------
-- 4. Exclusão de material (45-D): o vínculo com questões também protege
-- ----------------------------------------------------------------------------

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

-- Scripts de manutenção (45-D): os vínculos do material semeado saem junto.
create or replace function public.delete_material_maintenance(p_material_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.question_materials where material_id = p_material_id;
  delete from public.content_revisions where material_id = p_material_id;
  delete from public.material_links
  where source_material_id = p_material_id or target_material_id = p_material_id;
  delete from public.materials where id = p_material_id;
end;
$$;
