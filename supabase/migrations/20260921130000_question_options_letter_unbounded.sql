-- ============================================================================
-- SynapseMed — Alternativas de QUESTÃO sem teto fixo (A-E deixa de ser o
-- limite máximo)
-- ============================================================================
--
-- Contexto: `question_options.letter` nasceu (20260903120000_initial_schema)
-- com `check (letter in ('A','B','C','D','E'))` porque, na época, nem o
-- cadastro unitário nem o import (que ainda não existia) precisavam de mais
-- que 5 alternativas. `import_question_draft` (20260921120000) herdou o
-- mesmo teto na validação de cada alternativa do lote.
--
-- Esta migration remove o teto de 5: uma questão de residência real pode ter
-- quantas alternativas a banca de origem tiver — o import (Admin ->
-- "Importar questões") não deve forçar truncar/reordenar uma prova em nome
-- de um limite artificial daqui. O cadastro unitário ("Nova Questão")
-- continua fixo em A-D, inalterado — essa é uma limitação da TELA (o
-- formulário só monta 4 campos), não do banco.
--
-- O que muda:
--   - `question_options.letter`: check troca da lista fechada ('A'..'E')
--     para um padrão (`^[A-Z]{1,3}$`) — ainda uma letra (ou sequência curta
--     de letras, ao estilo de colunas de planilha, para o caso teórico de
--     mais de 26 alternativas), só sem o teto de 5. Continua exigindo
--     maiúsculas — normalização de caixa já acontece no parser do import
--     (`src/utils/questionsImport.ts`) e no formulário unitário.
--   - `import_question_draft`: a validação por alternativa troca o
--     `not in ('A','B','C','D','E')` pelo mesmo padrão da constraint acima.
--     Nenhuma outra validação da função muda (ao menos 2 alternativas,
--     exatamente 1 correta, texto obrigatório).
-- ============================================================================

alter table public.question_options
  drop constraint question_options_letter_check,
  add constraint question_options_letter_check check (letter ~ '^[A-Z]{1,3}$');

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
  p_options jsonb
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
  v_option_id uuid;
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

  -- Valida cada alternativa ANTES de inserir qualquer coisa — mensagens
  -- compreensíveis para o caso comum de entrada inválida. Letra: mesmo
  -- padrão da constraint de question_options.letter (sem teto de contagem
  -- de alternativas — quem limita é a prova de origem, não esta função).
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

    -- `trg_create_question_option_key` (rls_policies.sql) já insere
    -- automaticamente uma linha (is_correct=false, explanation='') para todo
    -- `question_options` novo — por isso aqui é UPDATE, não INSERT (um
    -- segundo INSERT para a mesma option_id violaria a PK).
    update public.question_option_keys
    set is_correct = coalesce((v_option->>'is_correct')::boolean, false),
        explanation = coalesce(v_option->>'explanation', '')
    where option_id = v_inserted_option_id;

    v_option_count := v_option_count + 1;
  end loop;

  return v_question;
end;
$$;

revoke all on function public.import_question_draft(
  uuid, uuid, uuid, text, text, text, int, text, text, text, text, text[], jsonb
) from public, anon;
grant execute on function public.import_question_draft(
  uuid, uuid, uuid, text, text, text, int, text, text, text, text, text[], jsonb
) to authenticated;
