-- ============================================================================
-- SynapseMed — Importação assistida de QUESTÕES ("Importar questões")
-- ============================================================================
--
-- Antes desta migration não existia nenhum caminho de import de arquivo para
-- questão (ver docs/editorial/PADRAO-NEXUSMED-QUESTOES.md, seção "Sem import
-- de arquivo") — só o formulário "Nova Questão" no Admin, que grava em 5
-- requisições HTTP independentes via `SupabaseQuestionsRepository.saveQuestion`
-- (upsert questions, upsert question_answer_keys, delete question_options,
-- insert question_options, upsert question_option_keys). Essa função
-- continua existindo, inalterada, para o formulário de cadastro unitário.
--
-- Para IMPORTAÇÃO EM LOTE (onde uma falha no meio do lote é bem mais provável
-- de acontecer e bem mais cara de diagnosticar do que numa única questão
-- digitada à mão), replica-se aqui o mesmo padrão já usado por
-- `import_compendium_draft` (Missão 42-B): toda a gravação de UMA questão
-- (questions + question_options + question_option_keys +
-- question_answer_keys) acontece dentro de uma ÚNICA chamada de função
-- PL/pgSQL — transação implícita, tudo grava ou nada grava.
--
-- Validações feitas dentro da função (servidor, não confia na UI):
--   - admin ativo (mesma checagem de publish_question/import_compendium_draft);
--   - disciplina e tema existem e o tema pertence à disciplina informada;
--   - cycle/difficulty batem com os enums já existentes na tabela;
--   - ao menos 2 alternativas, cada uma com id+letra+texto;
--   - exatamente 1 alternativa marcada correta;
--   - `status` é sempre 'draft' — a função nem aceita esse parâmetro.
-- Deliberadamente NÃO exige explicação preenchida em toda alternativa nem
-- general_commentary/high_yield_summary não vazios — isso já é gate de
-- PUBLICAÇÃO (`publish_question`), não de criação de rascunho; o preview do
-- importador já avisa o que falta, mas cadastrar incompleto e completar
-- depois é o mesmo fluxo que o formulário manual permite hoje.
-- ============================================================================

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
  -- compreensíveis para o caso comum de entrada inválida.
  for v_option in select * from jsonb_array_elements(p_options)
  loop
    v_letter := v_option->>'letter';
    v_option_text := trim(coalesce(v_option->>'text', ''));
    if v_letter is null or v_letter not in ('A', 'B', 'C', 'D', 'E') then
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
