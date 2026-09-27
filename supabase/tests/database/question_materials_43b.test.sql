-- ============================================================================
-- 43-B — Questão cobre um ou vários materiais
-- O vínculo passa a morar em `question_materials` (um ou vários materiais,
-- seção opcional por material), fora do hash de atestação da questão: mudar
-- o vínculo não invalida questão aprovada, e os vínculos antigos
-- (`questions.material_id`) são copiados sem mudar hash nenhum.
-- ============================================================================

create extension if not exists pgtap;
select plan(28);

select tests.clear_auth();
select tests.create_user('qm.admin@test.local', 'admin', 'active') as v_admin \gset
select tests.create_user('qm.student@test.local', 'student', 'active') as v_student \gset

insert into public.disciplines (name, code, cycle)
values ('Disciplina QM', 'QM-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_disc \gset
insert into public.themes (discipline_id, name) values (:'v_disc', 'Tema QM') returning id as v_theme \gset

insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Ceftriaxona') returning id as v_mat_a \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_mat_a', 0, 'Espectro', 'C.') returning id as v_sec_a \gset
select tests.force_publish_material(:'v_mat_a');
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Ceftazidima') returning id as v_mat_b \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_mat_b', 0, 'Espectro', 'C.') returning id as v_sec_b \gset
select tests.force_publish_material(:'v_mat_b');
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Rascunho') returning id as v_mat_draft \gset

-- Questão com vínculo antigo (coluna), aprovada — como as 9 do remoto.
insert into public.questions (discipline_id, theme_id, material_id, material_section_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_disc', :'v_theme', :'v_mat_a', :'v_sec_a', 'internato_residencia', 'medio', '', 'Questão antiga')
returning id as v_q_old \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_q_old', 'A', 'a', 0), (:'v_q_old', 'B', 'b', 1);
update public.question_option_keys set is_correct = true where option_id = (select id from public.question_options where question_id = :'v_q_old' and letter = 'A');
insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary) values (:'v_q_old', 'c', 'h');
select tests.approve_question_revision(:'v_q_old');
select encode(extensions.digest(app.build_question_snapshot(:'v_q_old')::text, 'sha256'), 'hex') as v_hash_before \gset

-- Estrutura e permissões
select has_table('public', 'question_materials', 'tabela de vínculos questão → material existe');
select ok(not has_table_privilege('anon', 'public.question_materials', 'select'), 'anon não lê vínculos');
select ok(not has_table_privilege('authenticated', 'public.question_materials', 'insert'), 'vínculo não é gravado direto pela API');
select ok(not has_function_privilege('anon', 'public.set_question_materials(uuid, jsonb)', 'execute'), 'anon não executa set_question_materials');

-- Os vínculos antigos são copiados, sem mudar hash nenhum.
select lives_ok($$ select app.backfill_question_materials() $$, 'cópia dos vínculos antigos roda');
select results_eq(
  format($$ select material_id::text, material_section_id::text from public.question_materials where question_id = %L $$, :'v_q_old'),
  format($$ values (%L::text, %L::text) $$, :'v_mat_a', :'v_sec_a'),
  'vínculo antigo (material e seção) copiado para a tabela nova'
);
select lives_ok($$ select app.backfill_question_materials() $$, 'cópia é idempotente');
select is((select count(*)::int from public.question_materials where question_id = :'v_q_old'), 1, 'rodar de novo não duplica');
select is(encode(extensions.digest(app.build_question_snapshot(:'v_q_old')::text, 'sha256'), 'hex'), :'v_hash_before',
  'hash da questão aprovada não muda com a cópia');
select ok(app.has_current_approved_revision(null, :'v_q_old'), 'aprovação continua valendo depois da cópia');

-- Admin vincula a vários materiais, com seção opcional por material.
select tests.authenticate_as(:'v_admin');
select lives_ok(
  format($$ select public.set_question_materials(%L, %L::jsonb) $$, :'v_q_old',
    json_build_array(json_build_object('material_id', :'v_mat_a', 'material_section_id', :'v_sec_a'),
                     json_build_object('material_id', :'v_mat_b'))::text),
  'admin vincula a questão a dois materiais'
);
select results_eq(
  format($$ select material_id::text, material_section_id::text, sort_order from public.question_materials where question_id = %L order by sort_order $$, :'v_q_old'),
  format($$ values (%L::text, %L::text, 0), (%L::text, null::text, 1) $$, :'v_mat_a', :'v_sec_a', :'v_mat_b'),
  'dois vínculos, na ordem escolhida, com a seção só onde foi escolhida'
);
select throws_ok(
  format($$ select public.set_question_materials(%L, %L::jsonb) $$, :'v_q_old',
    json_build_array(json_build_object('material_id', :'v_mat_a', 'material_section_id', :'v_sec_b'))::text),
  NULL::char(5), NULL::text, 'seção de outro material é recusada'
);
select throws_ok(
  format($$ select public.set_question_materials(%L, %L::jsonb) $$, :'v_q_old',
    json_build_array(json_build_object('material_id', :'v_mat_a'), json_build_object('material_id', :'v_mat_a'))::text),
  NULL::char(5), NULL::text, 'o mesmo material duas vezes é recusado'
);
select tests.clear_auth();
select ok(app.has_current_approved_revision(null, :'v_q_old'), 'mudar o vínculo não invalida a aprovação da questão');

-- Questão publicada: conteúdo congelado, vínculo não.
-- postgres publica direto (as guardas liberam esse papel), como nos outros testes.
update public.questions set status = 'published' where id = :'v_q_old';
select tests.authenticate_as(:'v_admin');
select lives_ok(
  format($$ select public.set_question_materials(%L, %L::jsonb) $$, :'v_q_old',
    json_build_array(json_build_object('material_id', :'v_mat_a', 'material_section_id', :'v_sec_a'),
                     json_build_object('material_id', :'v_mat_b'),
                     json_build_object('material_id', :'v_mat_draft'))::text),
  'vínculo de questão publicada pode ser ajustado sem despublicar'
);

-- Estudante: não grava vínculo; lê só vínculo de questão e material publicados.
select tests.authenticate_as(:'v_student');
select throws_ok(
  format($$ select public.set_question_materials(%L, '[]'::jsonb) $$, :'v_q_old'),
  NULL::char(5), NULL::text, 'estudante não altera vínculo'
);
select results_eq(
  format($$ select material_id::text from public.question_materials where question_id = %L order by sort_order $$, :'v_q_old'),
  format($$ values (%L::text), (%L::text) $$, :'v_mat_a', :'v_mat_b'),
  'estudante vê os vínculos com material publicado, e não o do rascunho'
);
select tests.clear_auth();

-- Importação em lote: os materiais do lote valem para a questão importada.
select tests.authenticate_as(:'v_admin');
select gen_random_uuid() as v_q_new \gset
select lives_ok(
  format($$ select public.import_question_draft(
      p_id => %L, p_discipline_id => %L, p_theme_id => %L, p_cycle => 'internato_residencia',
      p_difficulty => 'medio', p_institution => 'ENARE', p_year => 2025, p_clinical_vignette => '',
      p_question_stem => 'Pergunta do lote', p_general_commentary => '', p_high_yield_summary => '',
      p_tags => '{}'::text[],
      p_options => '[{"letter":"A","text":"a","explanation":"","is_correct":true},{"letter":"B","text":"b","explanation":"","is_correct":false}]'::jsonb,
      p_material_links => %L::jsonb) $$,
    :'v_q_new', :'v_disc', :'v_theme',
    json_build_array(json_build_object('material_id', :'v_mat_a'), json_build_object('material_id', :'v_mat_b'))::text),
  'importação grava a questão com os materiais do lote'
);
select results_eq(
  format($$ select material_id::text from public.question_materials where question_id = %L order by sort_order $$, :'v_q_new'),
  format($$ values (%L::text), (%L::text) $$, :'v_mat_a', :'v_mat_b'),
  'questão importada cobra os dois materiais do lote'
);
select is((select material_id from public.questions where id = :'v_q_new'), null::uuid, 'a coluna antiga não é mais gravada');
select lives_ok(
  format($$ select public.import_question_draft(
      p_id => gen_random_uuid(), p_discipline_id => %L, p_theme_id => %L, p_cycle => 'internato_residencia',
      p_difficulty => 'medio', p_institution => 'ENARE', p_year => 2025, p_clinical_vignette => '',
      p_question_stem => 'Sem lote', p_general_commentary => '', p_high_yield_summary => '',
      p_tags => '{}'::text[],
      p_options => '[{"letter":"A","text":"a","explanation":"","is_correct":true},{"letter":"B","text":"b","explanation":"","is_correct":false}]'::jsonb) $$,
    :'v_disc', :'v_theme'),
  'importação sem materiais continua aceita (chamada antiga)'
);
select tests.clear_auth();

-- Material cobrado por questões não é excluído (o vínculo não some em cascata).
select tests.authenticate_as(:'v_admin');
select throws_like(format($$ delete from public.materials where id = %L $$, :'v_mat_draft'), '%questões%',
  'material cobrado por questões não é excluído');
select tests.clear_auth();

-- ----------------------------------------------------------------------------
-- Revisão do PR #94
-- ----------------------------------------------------------------------------

-- Item 1: a coluna antiga ainda aponta para o material; excluir o material
-- (mesmo já tirado do vínculo novo) não pode mudar o hash da questão aprovada.
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Antigo só na coluna') returning id as v_mat_legado \gset
insert into public.questions (discipline_id, theme_id, material_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_disc', :'v_theme', :'v_mat_legado', 'internato_residencia', 'medio', '', 'Questão com vínculo antigo')
returning id as v_q_leg \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_q_leg', 'A', 'a', 0), (:'v_q_leg', 'B', 'b', 1);
update public.question_option_keys set is_correct = true where option_id = (select id from public.question_options where question_id = :'v_q_leg' and letter = 'A');
insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary) values (:'v_q_leg', 'c', 'h');
select tests.approve_question_revision(:'v_q_leg');
select encode(extensions.digest(app.build_question_snapshot(:'v_q_leg')::text, 'sha256'), 'hex') as v_hash_leg \gset
select tests.authenticate_as(:'v_admin');
select public.set_question_materials(:'v_q_leg', json_build_array(json_build_object('material_id', :'v_mat_b'))::jsonb);
select throws_like(format($$ delete from public.materials where id = %L $$, :'v_mat_legado'), '%vínculo original%',
  'material ainda na coluna antiga de uma questão não é excluído');
select tests.clear_auth();
select is(encode(extensions.digest(app.build_question_snapshot(:'v_q_leg')::text, 'sha256'), 'hex'), :'v_hash_leg',
  'hash da questão aprovada não muda com a tentativa de exclusão');
select ok(app.has_current_approved_revision(null, :'v_q_leg'), 'aprovação da questão continua valendo');

-- Item 6: vínculo sem material e uuid repetido com outra caixa.
select tests.authenticate_as(:'v_admin');
select throws_like(
  format($$ select public.set_question_materials(%L, '[{}, {}]'::jsonb) $$, :'v_q_leg'),
  '%sem material%', 'vínculo sem material tem a mensagem certa'
);
select throws_like(
  format($$ select public.set_question_materials(%L, %L::jsonb) $$, :'v_q_leg',
    json_build_array(json_build_object('material_id', lower(:'v_mat_a')), json_build_object('material_id', upper(:'v_mat_a')))::text),
  '%mais de uma vez%', 'o mesmo material com outra caixa é recusado com a mensagem certa'
);
select tests.clear_auth();

select * from finish();
