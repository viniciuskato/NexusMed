-- ============================================================================
-- SynapseMed — Seed local mínimo e não sensível
--
-- Conteúdo estritamente demonstrativo (não é conteúdo médico real do
-- OneDrive): 1 disciplina, 1 tema, 1 material curto com 1 seção, 1 questão
-- demonstrativa com alternativas e gabarito.
--
-- Nenhum usuário administrativo com senha fixa é criado aqui. A definição do
-- primeiro admin fica para uma operação administrativa posterior e
-- documentada (ver docs/architecture/migration-roadmap.md).
--
-- Este script roda via `supabase db reset` como role "postgres" — por isso a
-- transição direta para status='published' via UPDATE é aceita pelas
-- triggers (current_user = 'postgres'), sem precisar chamar publish_question()
-- com uma sessão autenticada real. Em uso normal do produto, published só
-- acontece via publish_question().
-- ============================================================================

do $$
declare
  v_discipline_id uuid;
  v_theme_id uuid;
  v_material_id uuid;
  v_question_id uuid;
  v_option_a uuid;
  v_option_b uuid;
  v_option_c uuid;
begin
  insert into public.disciplines (name, code, icon, description, cycle, color, sort_order)
  values ('Cardiologia', 'CARDIO', 'heart', 'Disciplina demonstrativa de seed.', 'clinico', '#e11d48', 1)
  returning id into v_discipline_id;

  insert into public.themes (discipline_id, name, description, high_yield, sort_order)
  values (v_discipline_id, 'Insuficiência Cardíaca', 'Tema demonstrativo de seed.', true, 1)
  returning id into v_theme_id;

  insert into public.materials (
    discipline_id, theme_id, title, subtitle, mode, study_lens, estimated_read_time_minutes,
    author, tags, provenance, source, license
  )
  values (
    v_discipline_id, v_theme_id, 'Insuficiência Cardíaca — Visão Geral (Seed)',
    'Material demonstrativo, não é conteúdo médico real', 'mecanismos', 'fisiopatologia', 5,
    'Seed SynapseMed', array['seed', 'demo'], 'seed-local', 'Conteúdo fictício de demonstração', 'uso interno'
  )
  returning id into v_material_id;

  insert into public.material_sections (material_id, sort_order, title, mechanism_tag, content, key_takeaways)
  values (
    v_material_id, 1, 'Fisiopatologia Básica', 'Fisiopatologia',
    'Texto demonstrativo de seção para fins de teste local. Não representa conteúdo clínico revisado.',
    array['Ponto-chave demonstrativo 1', 'Ponto-chave demonstrativo 2']
  );

  update public.materials set status = 'published' where id = v_material_id;

  insert into public.questions (
    discipline_id, theme_id, cycle, difficulty, institution, year,
    clinical_vignette, question_stem, tags, provenance, source, license
  )
  values (
    v_discipline_id, v_theme_id, 'clinico', 'medio', 'SEED', 2026,
    'Paciente fictício de demonstração, sem relação com caso real.',
    'Questão demonstrativa de seed — qual alternativa está correta?',
    array['seed', 'demo'], 'seed-local', 'Conteúdo fictício de demonstração', 'uso interno'
  )
  returning id into v_question_id;

  insert into public.question_options (question_id, letter, option_text, sort_order)
  values (v_question_id, 'A', 'Alternativa demonstrativa A (correta)', 1)
  returning id into v_option_a;

  insert into public.question_options (question_id, letter, option_text, sort_order)
  values (v_question_id, 'B', 'Alternativa demonstrativa B', 2)
  returning id into v_option_b;

  insert into public.question_options (question_id, letter, option_text, sort_order)
  values (v_question_id, 'C', 'Alternativa demonstrativa C', 3)
  returning id into v_option_c;

  insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary)
  values (
    v_question_id,
    'Comentário geral demonstrativo explicando o raciocínio da questão de seed.',
    'Resumo de alto rendimento demonstrativo.'
  );

  -- question_option_keys já foi criada automaticamente (is_correct=false,
  -- explanation='') pela trigger trg_create_question_option_key no momento
  -- de cada INSERT em question_options acima — aqui só ajustamos os valores.
  update public.question_option_keys set is_correct = true, explanation = 'Explicação demonstrativa: por que A está correta.' where option_id = v_option_a;
  update public.question_option_keys set explanation = 'Explicação demonstrativa: por que B está incorreta.' where option_id = v_option_b;
  update public.question_option_keys set explanation = 'Explicação demonstrativa: por que C está incorreta.' where option_id = v_option_c;

  -- 43-B: a questão cobra o material pela tabela de vínculos, não pela coluna antiga.
  insert into public.question_materials (question_id, material_id, sort_order)
  values (v_question_id, v_material_id, 0);

  update public.questions set status = 'published' where id = v_question_id;
end $$;
