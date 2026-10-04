-- ============================================================================
-- P10 — o flashcard guarda a seção do material
-- Coluna e índices; card do erro e card de seção gravam a seção; gerar o card
-- da mesma seção duas vezes (ids diferentes) não duplica; seção que não é do
-- material (ou de material fora do ar) entra como null, sem travar a fila;
-- apagar a seção não apaga o card; os cards de erro antigos recebem a seção da
-- questão (só a coluna nova, só onde era nula); a RLS continua do dono.
-- ============================================================================

create extension if not exists pgtap;
select plan(47);

select tests.clear_auth();
select tests.create_user('p10.a@test.local', 'student', 'active') as v_user_a \gset
select tests.create_user('p10.b@test.local', 'student', 'active') as v_user_b \gset
select tests.create_user('p10.blocked@test.local', 'student', 'blocked') as v_blocked \gset

insert into public.disciplines (name, code, cycle)
values ('Disciplina P10', 'P10-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_disc \gset
insert into public.themes (discipline_id, name) values (:'v_disc', 'Tema P10') returning id as v_theme \gset

insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Material P10 A') returning id as v_mat_a \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_mat_a', 0, 'Seção A1', 'x') returning id as v_sec_a1 \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_mat_a', 1, 'Seção A2', 'x') returning id as v_sec_a2 \gset
select tests.force_publish_material(:'v_mat_a');
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Material P10 B') returning id as v_mat_b \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_mat_b', 0, 'Seção B1', 'x') returning id as v_sec_b1 \gset
select tests.force_publish_material(:'v_mat_b');
-- Material em rascunho: a seção dele não é "válida" para card.
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Material P10 rascunho') returning id as v_mat_draft \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_mat_draft', 0, 'Seção rascunho', 'x') returning id as v_sec_draft \gset

insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_disc', :'v_theme', 'clinico', 'medio', 'Vinheta', 'Questão P10 1') returning id as v_q1 \gset
insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_disc', :'v_theme', 'clinico', 'medio', 'Vinheta', 'Questão P10 2') returning id as v_q2 \gset
insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_disc', :'v_theme', 'clinico', 'medio', 'Vinheta', 'Questão P10 3') returning id as v_q3 \gset
insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_disc', :'v_theme', 'clinico', 'medio', 'Vinheta', 'Questão P10 4') returning id as v_q4 \gset

-- ----------------------------------------------------------------------------
-- Estrutura
-- ----------------------------------------------------------------------------
select has_column('public', 'flashcards', 'material_section_id', 'flashcards ganha material_section_id');
select col_is_null('public', 'flashcards', 'material_section_id', 'material_section_id é nullable');
select is(
  (select confdeltype::text from pg_constraint
    where conrelid = 'public.flashcards'::regclass and contype = 'f'
      and confrelid = 'public.material_sections'::regclass),
  'n',
  'FK de material_section_id é on delete set null'
);
select has_index('public', 'flashcards', 'flashcards_material_section_idx', 'índice da seção existe');
select has_index('public', 'flashcards', 'flashcards_user_section_card_uq', 'índice único do card de seção existe');
select hasnt_column('public', 'flashcards', 'question_id', 'a questão de origem continua só em question_origin_id (sem coluna duplicada)');

-- Permissões das funções (risco 14)
select has_function('public', 'create_flashcard_from_section',
  array['uuid','uuid','uuid','uuid','uuid','text','text','text','text[]','text','boolean'], 'RPC do card de seção existe');
select is(has_function_privilege('anon', 'public.create_flashcard_from_section(uuid,uuid,uuid,uuid,uuid,text,text,text,text[],text,boolean)', 'execute'), false, 'anon não executa o card de seção');
select is(has_function_privilege('public', 'public.create_flashcard_from_section(uuid,uuid,uuid,uuid,uuid,text,text,text,text[],text,boolean)', 'execute'), false, 'PUBLIC não executa o card de seção');
select is(has_function_privilege('authenticated', 'public.create_flashcard_from_section(uuid,uuid,uuid,uuid,uuid,text,text,text,text[],text,boolean)', 'execute'), true, 'authenticated executa o card de seção');
select is(has_function_privilege('anon', 'public.create_flashcard_from_question(uuid,uuid,uuid,uuid,uuid,text,text,text,text[],text,boolean,uuid)', 'execute'), false, 'anon não executa o card do erro');
select is(has_function_privilege('authenticated', 'app.secao_valida_para_card(uuid,uuid)', 'execute'), false, 'a função de apoio não é chamável por quem está logado');
select is(has_function_privilege('authenticated', 'app.preencher_secao_dos_flashcards_p10()', 'execute'), false, 'o preenchimento dos cards antigos não é chamável por quem está logado');

-- ----------------------------------------------------------------------------
-- Card do erro grava a seção
-- ----------------------------------------------------------------------------
select tests.authenticate_as(:'v_user_a');
select gen_random_uuid() as v_card_q1 \gset
select gen_random_uuid() as v_card_q1_outro_id \gset
select gen_random_uuid() as v_card_q2 \gset
select gen_random_uuid() as v_card_q3 \gset

select lives_ok(
  format($$ select public.create_flashcard_from_question(%L,%L,%L,%L,%L,'F','V',null,'{}','medio',true,%L) $$,
    :'v_card_q1', :'v_disc', :'v_theme', :'v_mat_a', :'v_q1', :'v_sec_a1'),
  'card do erro com seção é aceito'
);
select is(
  (select material_section_id::text from public.flashcards where id = :'v_card_q1'),
  :'v_sec_a1',
  'o card do erro guarda a seção'
);
select is(
  (select question_origin_id::text from public.flashcards where id = :'v_card_q1'),
  :'v_q1',
  'e a questão de origem'
);
select is(
  (select id from public.create_flashcard_from_question(
    :'v_card_q1_outro_id', :'v_disc', :'v_theme', :'v_mat_a', :'v_q1', 'F2', 'V2', null, '{}', 'medio', true, :'v_sec_a2')),
  :'v_card_q1'::uuid,
  'o mesmo erro com outro id converge para o card que já existe (e não troca a seção dele)'
);
select is((select count(*)::int from public.flashcards where user_id = :'v_user_a' and question_origin_id = :'v_q1'), 1, 'um card por erro');
select is((select material_section_id::text from public.flashcards where id = :'v_card_q1'), :'v_sec_a1', 'a seção do card existente continua a mesma');

select lives_ok(
  format($$ select public.create_flashcard_from_question(%L,%L,%L,%L,%L,'F','V',null,'{}','medio',true) $$,
    :'v_card_q2', :'v_disc', :'v_theme', :'v_mat_a', :'v_q2'),
  'a chamada antiga (sem seção) continua valendo, pelo default'
);
select is((select material_section_id from public.flashcards where id = :'v_card_q2'), null::uuid, 'sem seção, o card nasce sem seção');

select lives_ok(
  format($$ select public.create_flashcard_from_question(%L,%L,%L,%L,%L,'F','V',null,'{}','medio',true,%L) $$,
    :'v_card_q3', :'v_disc', :'v_theme', :'v_mat_a', :'v_q3', :'v_sec_b1'),
  'seção de outro material não trava a criação'
);
select is((select material_section_id from public.flashcards where id = :'v_card_q3'), null::uuid, 'seção que não é do material do card entra como null');

-- ----------------------------------------------------------------------------
-- Card de seção do leitor: um por usuário e seção
-- ----------------------------------------------------------------------------
select gen_random_uuid() as v_sec_card_1 \gset
select gen_random_uuid() as v_sec_card_2 \gset
select gen_random_uuid() as v_sec_card_other \gset

select lives_ok(
  format($$ select public.create_flashcard_from_section(%L,%L,%L,%L,%L,'Frente','Verso',null,'{}','medio',true) $$,
    :'v_sec_card_1', :'v_disc', :'v_theme', :'v_mat_a', :'v_sec_a1'),
  'primeiro card da seção é aceito'
);
select is(
  (select material_section_id::text from public.flashcards where id = :'v_sec_card_1'),
  :'v_sec_a1',
  'o card da seção guarda a seção'
);
select is((select count(*)::int from public.flashcard_srs_state where flashcard_id = :'v_sec_card_1'), 1, 'o estado SRS nasce junto');
select lives_ok(
  format($$ select public.create_flashcard_from_section(%L,%L,%L,%L,%L,'Frente','Verso',null,'{}','medio',true) $$,
    :'v_sec_card_1', :'v_disc', :'v_theme', :'v_mat_a', :'v_sec_a1'),
  'replay do mesmo id é aceito'
);
select is(
  (select id from public.create_flashcard_from_section(
    :'v_sec_card_2', :'v_disc', :'v_theme', :'v_mat_a', :'v_sec_a1', 'Outra frente', 'Outro verso', null, '{}', 'medio', true)),
  :'v_sec_card_1'::uuid,
  'gerar o card da mesma seção com outro id converge para o card canônico'
);
select is(
  (select count(*)::int from public.flashcards where user_id = :'v_user_a' and material_section_id = :'v_sec_a1' and question_origin_id is null),
  1,
  'continua exatamente um card de seção'
);
select is(
  (select count(*)::int from public.flashcards where user_id = :'v_user_a' and material_section_id = :'v_sec_a1'),
  2,
  'o card do erro da mesma seção é outro card (o do erro e o da seção convivem)'
);
select is(
  (select id from public.create_flashcard_from_section(
    :'v_sec_card_other', :'v_disc', :'v_theme', :'v_mat_a', :'v_sec_a2', 'Frente 2', 'Verso 2', null, '{}', 'medio', true)) <> :'v_sec_card_1'::uuid,
  true,
  'outra seção do mesmo material é outro card'
);
select throws_ok(
  format($$ select public.create_flashcard_from_section(%L,%L,%L,%L,null,'F','V',null,'{}','medio',true) $$,
    gen_random_uuid(), :'v_disc', :'v_theme', :'v_mat_a'),
  'P0001',
  'id, material e seção são obrigatórios',
  'seção é obrigatória na RPC de seção'
);
select lives_ok(
  format($$ select public.create_flashcard_from_section(%L,%L,%L,%L,%L,'F','V',null,'{}','medio',true) $$,
    gen_random_uuid(), :'v_disc', :'v_theme', :'v_mat_draft', :'v_sec_draft'),
  'seção de material em rascunho não trava a criação'
);
select is(
  (select count(*)::int from public.flashcards where user_id = :'v_user_a' and material_id = :'v_mat_draft' and material_section_id is null),
  1,
  'e o card nasce sem seção'
);

-- Gravação direta (upsert do cliente): a seção errada também entra como null.
select lives_ok(
  format($$ insert into public.flashcards (id, user_id, discipline_id, theme_id, material_id, material_section_id, front, back, difficulty)
            values (%L, %L, %L, %L, %L, %L, 'F', 'V', 'medio') $$,
    gen_random_uuid(), :'v_user_a', :'v_disc', :'v_theme', :'v_mat_a', :'v_sec_b1'),
  'insert direto com seção de outro material não falha'
);
select is(
  (select count(*)::int from public.flashcards where user_id = :'v_user_a' and material_id = :'v_mat_a' and material_section_id = :'v_sec_b1'),
  0,
  'e a seção errada não ficou gravada'
);

-- ----------------------------------------------------------------------------
-- Outro usuário e usuário bloqueado
-- ----------------------------------------------------------------------------
select tests.authenticate_as(:'v_user_b');
select lives_ok(
  format($$ select public.create_flashcard_from_section(%L,%L,%L,%L,%L,'F','V',null,'{}','medio',true) $$,
    gen_random_uuid(), :'v_disc', :'v_theme', :'v_mat_a', :'v_sec_a1'),
  'outro usuário tem o seu próprio card da mesma seção'
);
select is((select count(*)::int from public.flashcards where material_section_id = :'v_sec_a1'), 1, 'RLS: o usuário B só enxerga o card dele');

select tests.authenticate_as(:'v_blocked');
select throws_ok(
  format($$ select public.create_flashcard_from_section(%L,%L,%L,%L,%L,'F','V',null,'{}','medio',true) $$,
    gen_random_uuid(), :'v_disc', :'v_theme', :'v_mat_a', :'v_sec_a1'),
  'P0001',
  'apenas estudantes ativos podem criar flashcards',
  'usuário bloqueado não cria card de seção'
);

-- ----------------------------------------------------------------------------
-- Apagar a seção não apaga o card
-- ----------------------------------------------------------------------------
select tests.clear_auth();
delete from public.material_sections where id = :'v_sec_a2';
select is(
  (select count(*)::int from public.flashcards where id = :'v_sec_card_other' and material_section_id is null),
  1,
  'seção apagada: o card fica, sem seção (on delete set null)'
);

-- ----------------------------------------------------------------------------
-- Cards de erro que já existiam: a seção da questão, só onde era nula
-- ----------------------------------------------------------------------------
select tests.create_user('p10.antigo@test.local', 'student', 'active') as v_user_old \gset
insert into public.question_materials (question_id, material_id, material_section_id, sort_order)
values (:'v_q4', :'v_mat_a', :'v_sec_a1', 0), (:'v_q4', :'v_mat_b', :'v_sec_b1', 1);

-- Card antigo: material A, sem seção. Card de outro material da mesma questão: B.
-- Card que já tem seção própria. Card de questão sem ligação nenhuma.
insert into public.flashcards (id, user_id, discipline_id, theme_id, material_id, question_origin_id, front, back, difficulty)
values (gen_random_uuid(), :'v_user_old', :'v_disc', :'v_theme', :'v_mat_a', :'v_q4', 'F antigo A', 'V', 'medio')
returning id as v_old_a \gset
insert into public.flashcards (id, user_id, discipline_id, theme_id, material_id, question_origin_id, front, back, difficulty)
values (gen_random_uuid(), :'v_user_b', :'v_disc', :'v_theme', :'v_mat_b', :'v_q4', 'F antigo B', 'V', 'medio')
returning id as v_old_b \gset
insert into public.flashcards (id, user_id, discipline_id, theme_id, material_id, question_origin_id, front, back, difficulty)
values (gen_random_uuid(), :'v_blocked', :'v_disc', :'v_theme', :'v_mat_a', :'v_q1', 'F sem ligação', 'V', 'medio')
returning id as v_old_none \gset

select is((select app.preencher_secao_dos_flashcards_p10()) >= 2, true, 'o preenchimento dos cards antigos roda e acha os cards');
select is((select material_section_id::text from public.flashcards where id = :'v_old_a'), :'v_sec_a1', 'card antigo do material A recebe a seção ligada à questão nesse material');
select is((select material_section_id::text from public.flashcards where id = :'v_old_b'), :'v_sec_b1', 'card antigo do material B recebe a seção ligada à questão no material B');
select is((select material_section_id from public.flashcards where id = :'v_old_none'), null::uuid, 'card de questão sem seção ligada continua sem seção');
select is((select material_section_id::text from public.flashcards where id = :'v_card_q1'), :'v_sec_a1', 'card que já tinha seção não é tocado');
select is((select front || '|' || back from public.flashcards where id = :'v_old_a'), 'F antigo A|V', 'nenhuma outra coluna do card muda');
select is((select app.preencher_secao_dos_flashcards_p10()), 0, 'rodar de novo não muda mais nada (idempotente)');

select * from finish();
