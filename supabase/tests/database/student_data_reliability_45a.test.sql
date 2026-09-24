-- Unidade 45-A, parte 2: flashcard derivado de questão é único/idempotente
-- e a nota do simulado vem das tentativas gravadas, nunca do JSON do cliente.

select plan(23);
select tests.clear_auth();

select tests.create_user('u45a.a@test.local', 'student', 'active') as v_user_a \gset
select tests.create_user('u45a.b@test.local', 'student', 'active') as v_user_b \gset
select tests.create_user('u45a.blocked@test.local', 'student', 'blocked') as v_blocked \gset
select tests.create_user('u45a.admin@test.local', 'admin', 'active') as v_admin \gset

insert into public.disciplines (name, code, cycle)
values ('Disciplina 45-A', 'U45A-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_discipline_id \gset
insert into public.themes (discipline_id, name)
values (:'v_discipline_id', 'Tema 45-A') returning id as v_theme_id \gset

insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_discipline_id', :'v_theme_id', 'clinico', 'medio', 'Vinheta 1', 'Questão 1')
returning id as v_question_1 \gset
insert into public.question_options (question_id, letter, option_text, sort_order)
values (:'v_question_1', 'A', 'Correta 1', 1) returning id as v_q1_correct \gset
insert into public.question_options (question_id, letter, option_text, sort_order)
values (:'v_question_1', 'B', 'Errada 1', 2) returning id as v_q1_wrong \gset
insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary)
values (:'v_question_1', 'Comentário 1', 'Resumo 1');
update public.question_option_keys set is_correct = true, explanation = 'Correta' where option_id = :'v_q1_correct';
update public.question_option_keys set explanation = 'Errada' where option_id = :'v_q1_wrong';

insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_discipline_id', :'v_theme_id', 'clinico', 'medio', 'Vinheta 2', 'Questão 2')
returning id as v_question_2 \gset
insert into public.question_options (question_id, letter, option_text, sort_order)
values (:'v_question_2', 'A', 'Correta 2', 1) returning id as v_q2_correct \gset
insert into public.question_options (question_id, letter, option_text, sort_order)
values (:'v_question_2', 'B', 'Errada 2', 2) returning id as v_q2_wrong \gset
insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary)
values (:'v_question_2', 'Comentário 2', 'Resumo 2');
update public.question_option_keys set is_correct = true, explanation = 'Correta' where option_id = :'v_q2_correct';
update public.question_option_keys set explanation = 'Errada' where option_id = :'v_q2_wrong';

select tests.authenticate_as(:'v_admin');
select tests.approve_question_revision(:'v_question_1');
select public.publish_question(:'v_question_1');
select tests.approve_question_revision(:'v_question_2');
select public.publish_question(:'v_question_2');
select tests.clear_auth();

select has_index('public', 'flashcards', 'flashcards_user_question_origin_uq', 'índice de unicidade do flashcard existe');
select is(
  (select indisunique from pg_index where indexrelid = 'public.flashcards_user_question_origin_uq'::regclass),
  true,
  'índice do flashcard é único'
);
select has_function(
  'public', 'create_flashcard_from_question',
  array['uuid','uuid','uuid','uuid','uuid','text','text','text','text[]','text','boolean'],
  'RPC atômica de criação de flashcard existe'
);
select is(
  has_function_privilege('anon', 'public.create_flashcard_from_question(uuid,uuid,uuid,uuid,uuid,text,text,text,text[],text,boolean)', 'execute'),
  false,
  'anon não executa criação de flashcard'
);
select is(
  has_function_privilege('public', 'public.create_flashcard_from_question(uuid,uuid,uuid,uuid,uuid,text,text,text,text[],text,boolean)', 'execute'),
  false,
  'PUBLIC não executa criação de flashcard'
);
select is(
  has_function_privilege('authenticated', 'public.create_flashcard_from_question(uuid,uuid,uuid,uuid,uuid,text,text,text,text[],text,boolean)', 'execute'),
  true,
  'authenticated pode executar criação de flashcard'
);

select tests.authenticate_as(:'v_user_a');
select gen_random_uuid() as v_card_a \gset
select gen_random_uuid() as v_card_replay_other_id \gset

select lives_ok(
  format($$ select public.create_flashcard_from_question(%L,%L,%L,null,%L,'Frente','Verso',null,'{}','medio',true) $$,
    :'v_card_a', :'v_discipline_id', :'v_theme_id', :'v_question_1'),
  'primeira criação do flashcard é aceita'
);
select is(
  (select count(*)::int from public.flashcards where user_id = :'v_user_a' and question_origin_id = :'v_question_1'),
  1,
  'primeira criação produz uma linha'
);
select is(
  (select count(*)::int from public.flashcard_srs_state where flashcard_id = :'v_card_a'),
  1,
  'estado SRS nasce na mesma transação'
);
select lives_ok(
  format($$ select public.create_flashcard_from_question(%L,%L,%L,null,%L,'Frente','Verso',null,'{}','medio',true) $$,
    :'v_card_a', :'v_discipline_id', :'v_theme_id', :'v_question_1'),
  'replay com o mesmo id é aceito'
);
select is(
  (select id from public.create_flashcard_from_question(
    :'v_card_replay_other_id', :'v_discipline_id', :'v_theme_id', null, :'v_question_1',
    'Outra frente', 'Outro verso', null, '{}', 'medio', true
  )),
  :'v_card_a'::uuid,
  'um segundo id para a mesma questão converge para o card canônico'
);
select is(
  (select count(*)::int from public.flashcards where user_id = :'v_user_a' and question_origin_id = :'v_question_1'),
  1,
  'replays continuam com exatamente uma linha'
);

select tests.authenticate_as(:'v_user_b');
select gen_random_uuid() as v_card_b \gset
select lives_ok(
  format($$ select public.create_flashcard_from_question(%L,%L,%L,null,%L,'Frente B','Verso B',null,'{}','medio',true) $$,
    :'v_card_b', :'v_discipline_id', :'v_theme_id', :'v_question_1'),
  'outro usuário pode ter seu próprio card para a mesma questão'
);

select tests.authenticate_as(:'v_blocked');
select throws_ok(
  format($$ select public.create_flashcard_from_question(%L,%L,%L,null,%L,'X','Y',null,'{}','medio',true) $$,
    gen_random_uuid(), :'v_discipline_id', :'v_theme_id', :'v_question_1'),
  'P0001',
  'apenas estudantes ativos podem criar flashcards',
  'usuário bloqueado não cria flashcard por SECURITY DEFINER'
);

-- Duas tentativas que pertencem ao simulado: uma errada e uma correta.
select tests.authenticate_as(:'v_user_a');
select gen_random_uuid() as v_attempt_1 \gset
select gen_random_uuid() as v_attempt_2 \gset
select public.submit_question_attempt(:'v_question_1', :'v_q1_wrong', 20, null, null, null, null, :'v_attempt_1');
select public.submit_question_attempt(:'v_question_2', :'v_q2_correct', 20, null, null, null, null, :'v_attempt_2');

select gen_random_uuid() as v_sim \gset
select now() as v_completed \gset
select lives_ok(
  format($$ select public.save_simulado_session(jsonb_build_object(
    'id', %L, 'name', '45-A', 'config', jsonb_build_object('name','45-A'),
    'started_at', now(), 'completed_at', %L::timestamptz,
    'score', 100, 'total_time_seconds', 40,
    'questions', jsonb_build_array(
      jsonb_build_object('question_id', %L, 'position', 0),
      jsonb_build_object('question_id', %L, 'position', 1)
    ),
    'answers', jsonb_build_array(
      jsonb_build_object('question_id', %L, 'selected_option_id', %L, 'time_spent_seconds', 20, 'client_op_id', %L),
      jsonb_build_object('question_id', %L, 'selected_option_id', %L, 'time_spent_seconds', 20, 'client_op_id', %L)
    )
  )) $$,
    :'v_sim', :'v_completed', :'v_question_1', :'v_question_2',
    :'v_question_1', :'v_q1_wrong', :'v_attempt_1',
    :'v_question_2', :'v_q2_correct', :'v_attempt_2'),
  'simulado com tentativas gravadas é aceito'
);
select is(
  (select score from public.simulations where id = :'v_sim'),
  50.00::numeric,
  'score é 50 pelas tentativas, ignorando os 100 enviados pelo cliente'
);
select is(
  (select count(*)::int from public.simulation_answers sa join public.simulation_questions sq on sq.id = sa.simulation_question_id where sq.simulation_id = :'v_sim'),
  2,
  'as duas respostas confirmadas integram a sessão'
);

select lives_ok(
  format($$ select public.save_simulado_session(jsonb_build_object(
    'id', %L, 'name', '45-A', 'config', jsonb_build_object('name','45-A'),
    'started_at', now(), 'completed_at', %L::timestamptz,
    'score', 0, 'total_time_seconds', 40,
    'questions', jsonb_build_array(
      jsonb_build_object('question_id', %L, 'position', 0),
      jsonb_build_object('question_id', %L, 'position', 1)
    ),
    'answers', jsonb_build_array(
      jsonb_build_object('question_id', %L, 'selected_option_id', %L, 'time_spent_seconds', 20, 'client_op_id', %L),
      jsonb_build_object('question_id', %L, 'selected_option_id', %L, 'time_spent_seconds', 20, 'client_op_id', %L)
    )
  )) $$,
    :'v_sim', :'v_completed', :'v_question_1', :'v_question_2',
    :'v_question_1', :'v_q1_wrong', :'v_attempt_1',
    :'v_question_2', :'v_q2_correct', :'v_attempt_2'),
  'replay da mesma sessão é aceito'
);
select is(
  (select score from public.simulations where id = :'v_sim'),
  50.00::numeric,
  'replay com score cliente diferente continua calculando 50 no servidor'
);

select gen_random_uuid() as v_sim_missing_attempt \gset
select throws_ok(
  format($$ select public.save_simulado_session(jsonb_build_object(
    'id', %L, 'config', '{}'::jsonb, 'started_at', now(),
    'questions', jsonb_build_array(jsonb_build_object('question_id', %L, 'position', 0)),
    'answers', jsonb_build_array(jsonb_build_object('question_id', %L, 'selected_option_id', %L, 'client_op_id', %L))
  )) $$,
    :'v_sim_missing_attempt', :'v_question_1', :'v_question_1', :'v_q1_correct', gen_random_uuid()),
  '40001',
  'tentativa da resposta do simulado ainda não foi gravada',
  'sessão não aceita resposta sem a tentativa identificada'
);
select is(
  (select count(*)::int from public.simulations where id = :'v_sim_missing_attempt'),
  0,
  'falha por tentativa ausente reverte a sessão inteira'
);

-- Compatibilidade: bundle anterior não enviava client_op_id no JSON.
select gen_random_uuid() as v_sim_old_client \gset
select lives_ok(
  format($$ select public.save_simulado_session(jsonb_build_object(
    'id', %L, 'config', '{}'::jsonb, 'started_at', now(), 'score', 0,
    'questions', jsonb_build_array(jsonb_build_object('question_id', %L, 'position', 0)),
    'answers', jsonb_build_array(jsonb_build_object('question_id', %L, 'selected_option_id', %L))
  )) $$, :'v_sim_old_client', :'v_question_2', :'v_question_2', :'v_q2_correct'),
  'payload do cliente anterior continua aceito'
);
select is(
  (select score from public.simulations where id = :'v_sim_old_client'),
  100.00::numeric,
  'payload antigo também recebe score calculado pela tentativa gravada'
);

select * from finish();
