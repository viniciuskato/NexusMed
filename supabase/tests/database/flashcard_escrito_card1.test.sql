-- ============================================================================
-- CARD-1 — cartão escrito pelo usuário
-- Vários cartões escritos na mesma seção ou questão; o mesmo envio (mesmo id)
-- continua um cartão; o cartão escrito convive com o automático (do erro e de
-- seção) sem tomar o lugar dele, e os índices de unicidade do automático
-- seguem valendo; seção de outro material entra como null; frente e verso
-- obrigatórios; usuário bloqueado não cria; RLS do dono; permissões da RPC.
-- ============================================================================

create extension if not exists pgtap;
select plan(46);

select tests.clear_auth();
select tests.create_user('card1.a@test.local', 'student', 'active') as v_user_a \gset
select tests.create_user('card1.b@test.local', 'student', 'active') as v_user_b \gset
select tests.create_user('card1.blocked@test.local', 'student', 'blocked') as v_blocked \gset

insert into public.disciplines (name, code, cycle)
values ('Disciplina CARD1', 'CARD1-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_disc \gset
insert into public.themes (discipline_id, name) values (:'v_disc', 'Tema CARD1') returning id as v_theme \gset

insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Material CARD1 A') returning id as v_mat_a \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_mat_a', 0, 'Seção A1', 'x') returning id as v_sec_a1 \gset
select tests.force_publish_material(:'v_mat_a');
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Material CARD1 B') returning id as v_mat_b \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_mat_b', 0, 'Seção B1', 'x') returning id as v_sec_b1 \gset
select tests.force_publish_material(:'v_mat_b');

insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_disc', :'v_theme', 'clinico', 'medio', 'Vinheta', 'Questão CARD1 1') returning id as v_q1 \gset
insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_disc', :'v_theme', 'clinico', 'medio', 'Vinheta', 'Questão CARD1 2') returning id as v_q2 \gset

-- ----------------------------------------------------------------------------
-- Estrutura e permissões
-- ----------------------------------------------------------------------------
select has_column('public', 'flashcards', 'is_written', 'flashcards ganha is_written');
select col_not_null('public', 'flashcards', 'is_written', 'is_written é not null');
select col_default_is('public', 'flashcards', 'is_written', 'false', 'is_written nasce false (os cartões de antes não são "escritos")');
select has_index('public', 'flashcards', 'flashcards_user_section_card_uq', 'índice do cartão automático de seção segue existindo');
select has_index('public', 'flashcards', 'flashcards_user_question_origin_uq', 'índice do cartão do erro segue existindo');
select is(
  (select indisunique from pg_index where indexrelid = 'public.flashcards_user_question_origin_uq'::regclass),
  true,
  'o índice do cartão do erro segue único'
);
select has_function('public', 'create_written_flashcard',
  array['uuid','uuid','uuid','uuid','uuid','uuid','text','text','text[]','text'], 'RPC do cartão escrito existe');
select is(has_function_privilege('anon', 'public.create_written_flashcard(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text[],text)', 'execute'), false, 'anon não executa o cartão escrito');
select is(has_function_privilege('public', 'public.create_written_flashcard(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text[],text)', 'execute'), false, 'PUBLIC não executa o cartão escrito');
select is(has_function_privilege('authenticated', 'public.create_written_flashcard(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text[],text)', 'execute'), true, 'authenticated executa o cartão escrito');
select is(has_function_privilege('anon', 'public.create_flashcard_from_question(uuid,uuid,uuid,uuid,uuid,text,text,text,text[],text,boolean,uuid)', 'execute'), false, 'anon segue sem executar o cartão do erro');
select is(has_function_privilege('anon', 'public.create_flashcard_from_section(uuid,uuid,uuid,uuid,uuid,text,text,text,text[],text,boolean)', 'execute'), false, 'anon segue sem executar o cartão de seção');

-- ----------------------------------------------------------------------------
-- Cartões escritos na mesma seção: cada Salvar com texto é um cartão
-- ----------------------------------------------------------------------------
select tests.authenticate_as(:'v_user_a');
select gen_random_uuid() as v_w1 \gset
select gen_random_uuid() as v_w2 \gset
select gen_random_uuid() as v_w3 \gset

select lives_ok(
  format($$ select public.create_written_flashcard(%L,%L,%L,%L,%L,null,'Frente 1','Verso 1','{}','medio') $$,
    :'v_w1', :'v_disc', :'v_theme', :'v_mat_a', :'v_sec_a1'),
  'primeiro cartão escrito da seção é aceito'
);
select is(
  (select front || '|' || back || '|' || is_written::text || '|' || is_custom::text from public.flashcards where id = :'v_w1'),
  'Frente 1|Verso 1|true|true',
  'frente e verso exatamente como enviados, marcado como escrito'
);
select is((select material_section_id::text from public.flashcards where id = :'v_w1'), :'v_sec_a1', 'ligado à seção');
select is((select material_id::text from public.flashcards where id = :'v_w1'), :'v_mat_a', 'e ao material');
select is((select question_origin_id from public.flashcards where id = :'v_w1'), null::uuid, 'sem questão de origem');
select is((select mechanism_highlight from public.flashcards where id = :'v_w1'), null, 'sem destaque automático');
select is((select count(*)::int from public.flashcard_srs_state where flashcard_id = :'v_w1'), 1, 'o estado SRS nasce junto');

select lives_ok(
  format($$ select public.create_written_flashcard(%L,%L,%L,%L,%L,null,'Frente 2','Verso 2','{}','medio') $$,
    :'v_w2', :'v_disc', :'v_theme', :'v_mat_a', :'v_sec_a1'),
  'segundo cartão escrito, mesma seção, texto diferente, é aceito'
);
select is(
  (select count(*)::int from public.flashcards where user_id = :'v_user_a' and material_section_id = :'v_sec_a1' and is_written),
  2,
  'dois cartões na mesma seção são dois cartões no banco'
);

-- Replay do MESMO envio (mesmo id): continua um.
select is(
  (select id from public.create_written_flashcard(:'v_w1', :'v_disc', :'v_theme', :'v_mat_a', :'v_sec_a1', null, 'Frente 1', 'Verso 1', '{}', 'medio')),
  :'v_w1'::uuid,
  'o mesmo envio repetido devolve o mesmo cartão'
);
select is(
  (select front from public.create_written_flashcard(:'v_w1', :'v_disc', :'v_theme', :'v_mat_a', :'v_sec_a1', null, 'Outro texto', 'Outro texto', '{}', 'medio')),
  'Frente 1',
  'e não reescreve o cartão que já existe'
);
select is(
  (select count(*)::int from public.flashcards where user_id = :'v_user_a' and material_section_id = :'v_sec_a1' and is_written),
  2,
  'reenviar o mesmo cartão não duplica'
);
select is((select count(*)::int from public.flashcard_srs_state where flashcard_id = :'v_w1'), 1, 'nem o estado SRS');

-- ----------------------------------------------------------------------------
-- O cartão automático de seção convive com os escritos e segue único
-- ----------------------------------------------------------------------------
select gen_random_uuid() as v_auto_sec_1 \gset
select gen_random_uuid() as v_auto_sec_2 \gset
select lives_ok(
  format($$ select public.create_flashcard_from_section(%L,%L,%L,%L,%L,'Auto F','Auto V',null,'{}','medio',true) $$,
    :'v_auto_sec_1', :'v_disc', :'v_theme', :'v_mat_a', :'v_sec_a1'),
  'o cartão automático da seção nasce mesmo com cartões escritos nela'
);
select is(
  (select id from public.create_flashcard_from_section(
    :'v_auto_sec_2', :'v_disc', :'v_theme', :'v_mat_a', :'v_sec_a1', 'Auto F2', 'Auto V2', null, '{}', 'medio', true)),
  :'v_auto_sec_1'::uuid,
  'o automático da seção converge para o automático, nunca para um escrito'
);
select is(
  (select count(*)::int from public.flashcards where user_id = :'v_user_a' and material_section_id = :'v_sec_a1'),
  3,
  'seção: 2 escritos + 1 automático'
);
select throws_ok(
  format($$ insert into public.flashcards (id, user_id, discipline_id, theme_id, material_id, material_section_id, front, back, difficulty)
            values (%L, %L, %L, %L, %L, %L, 'F', 'V', 'medio') $$,
    gen_random_uuid(), :'v_user_a', :'v_disc', :'v_theme', :'v_mat_a', :'v_sec_a1'),
  '23505',
  null,
  'o índice único do cartão automático de seção segue valendo (segundo automático na mesma seção é recusado)'
);

-- ----------------------------------------------------------------------------
-- Cartões escritos na mesma questão, ao lado do cartão automático do erro
-- ----------------------------------------------------------------------------
select gen_random_uuid() as v_wq1 \gset
select gen_random_uuid() as v_wq2 \gset
select gen_random_uuid() as v_err_q1 \gset
select gen_random_uuid() as v_err_q1_outro \gset

select lives_ok(
  format($$ select public.create_written_flashcard(%L,%L,%L,%L,null,%L,'FQ1','VQ1','{}','medio') $$,
    :'v_wq1', :'v_disc', :'v_theme', :'v_mat_a', :'v_q1'),
  'cartão escrito ligado a uma questão (sem seção) é aceito'
);
select is((select question_origin_id::text from public.flashcards where id = :'v_wq1'), :'v_q1', 'fica ligado à questão');
select lives_ok(
  format($$ select public.create_written_flashcard(%L,%L,%L,%L,null,%L,'FQ2','VQ2','{}','medio') $$,
    :'v_wq2', :'v_disc', :'v_theme', :'v_mat_a', :'v_q1'),
  'segundo cartão escrito na mesma questão é aceito'
);
select lives_ok(
  format($$ select public.create_flashcard_from_question(%L,%L,%L,%L,%L,'Erro F','Erro V',null,'{}','medio',true,%L) $$,
    :'v_err_q1', :'v_disc', :'v_theme', :'v_mat_a', :'v_q1', :'v_sec_a1'),
  'o cartão automático do erro nasce mesmo com cartões escritos na questão'
);
select is(
  (select id from public.create_flashcard_from_question(
    :'v_err_q1_outro', :'v_disc', :'v_theme', :'v_mat_a', :'v_q1', 'Erro F2', 'Erro V2', null, '{}', 'medio', true, :'v_sec_a1')),
  :'v_err_q1'::uuid,
  'o automático do erro converge para o automático, nunca para um escrito'
);
select is(
  (select count(*)::int from public.flashcards where user_id = :'v_user_a' and question_origin_id = :'v_q1'),
  3,
  'questão: 2 escritos + 1 automático'
);
select is(
  (select count(*)::int from public.flashcards where user_id = :'v_user_a' and question_origin_id = :'v_q1' and not is_written),
  1,
  'e só um é o automático do erro'
);
select throws_ok(
  format($$ insert into public.flashcards (id, user_id, discipline_id, theme_id, material_id, question_origin_id, front, back, difficulty)
            values (%L, %L, %L, %L, %L, %L, 'F', 'V', 'medio') $$,
    gen_random_uuid(), :'v_user_a', :'v_disc', :'v_theme', :'v_mat_a', :'v_q1'),
  '23505',
  null,
  'o índice único do cartão do erro segue valendo (segundo automático na mesma questão é recusado)'
);

-- ----------------------------------------------------------------------------
-- Validações
-- ----------------------------------------------------------------------------
select is(
  (select material_section_id from public.create_written_flashcard(
    gen_random_uuid(), :'v_disc', :'v_theme', :'v_mat_a', :'v_sec_b1', null, 'F', 'V', '{}', 'medio')),
  null::uuid,
  'seção que não é do material do cartão entra como null, sem travar a fila'
);
select throws_ok(
  format($$ select public.create_written_flashcard(%L,%L,%L,%L,%L,null,'   ','Verso','{}','medio') $$,
    gen_random_uuid(), :'v_disc', :'v_theme', :'v_mat_a', :'v_sec_a1'),
  'P0001',
  'frente e verso são obrigatórios',
  'frente em branco é recusada'
);
select throws_ok(
  format($$ select public.create_written_flashcard(%L,%L,%L,%L,%L,null,'Frente','','{}','medio') $$,
    gen_random_uuid(), :'v_disc', :'v_theme', :'v_mat_a', :'v_sec_a1'),
  'P0001',
  'frente e verso são obrigatórios',
  'verso vazio é recusado'
);
select throws_ok(
  format($$ select public.create_written_flashcard(%L,%L,%L,%L,null,null,'Frente','Verso','{}','medio') $$,
    gen_random_uuid(), :'v_disc', :'v_theme', :'v_mat_a'),
  'P0001',
  'o cartão precisa estar ligado a uma seção ou a uma questão',
  'sem seção nem questão é recusado'
);

-- ----------------------------------------------------------------------------
-- Outro usuário e usuário bloqueado
-- ----------------------------------------------------------------------------
select tests.authenticate_as(:'v_user_b');
select throws_ok(
  format($$ select public.create_written_flashcard(%L,%L,%L,%L,%L,null,'F','V','{}','medio') $$,
    :'v_w1', :'v_disc', :'v_theme', :'v_mat_a', :'v_sec_a1'),
  '42501',
  'flashcard já existe e pertence a outro usuário',
  'reusar o id de cartão de outra pessoa é recusado'
);
select lives_ok(
  format($$ select public.create_written_flashcard(%L,%L,%L,%L,%L,null,'F','V','{}','medio') $$,
    gen_random_uuid(), :'v_disc', :'v_theme', :'v_mat_a', :'v_sec_a1'),
  'outro usuário tem o seu próprio cartão escrito na mesma seção'
);
select is((select count(*)::int from public.flashcards where material_section_id = :'v_sec_a1'), 1, 'RLS: o usuário B só enxerga o cartão dele');

select tests.authenticate_as(:'v_blocked');
select throws_ok(
  format($$ select public.create_written_flashcard(%L,%L,%L,%L,%L,null,'F','V','{}','medio') $$,
    gen_random_uuid(), :'v_disc', :'v_theme', :'v_mat_a', :'v_sec_a1'),
  'P0001',
  'apenas estudantes ativos podem criar flashcards',
  'usuário bloqueado não cria cartão escrito'
);

-- ----------------------------------------------------------------------------
-- Limpeza dos cartões criados aqui. O pgTAP não desfaz nada, e a reconciliação
-- da 45-A (`app.reconcile_duplicate_flashcards_45a`, que roda no teste dela, depois
-- deste) agrupa TODOS os cartões por questão: cartões escritos da mesma questão
-- contariam como duplicados dela.
-- ----------------------------------------------------------------------------
select tests.clear_auth();
delete from public.flashcards where user_id in (:'v_user_a', :'v_user_b', :'v_blocked');
select is(
  (select count(*)::int from public.flashcards where user_id in (:'v_user_a', :'v_user_b', :'v_blocked')),
  0,
  'os cartões deste teste não ficam no banco'
);

select * from finish();
