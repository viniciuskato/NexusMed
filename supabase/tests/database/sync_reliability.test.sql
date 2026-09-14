-- ============================================================================
-- SynapseMed — Testes pgTAP de idempotência e isolamento (Prompt 07-A)
--
-- Cobre a migration 20260909120000_sync_reliability.sql: client_op_id em
-- question_attempts/flashcard_reviews e as RPCs submit_question_attempt
-- (idempotência) e submit_flashcard_review (idempotência + SM-2 atômico no
-- servidor). Reusa os helpers de fixture de rls_policies.test.sql
-- (tests.create_user/authenticate_as/clear_auth) — supõe que aquele arquivo
-- já rodou nesta mesma base (cria o schema `tests`).
--
-- NÃO cobre neste arquivo (limitação assumida — ver
-- docs/SINCRONIZACAO-CONFIAVEL.md): concorrência real entre duas conexões
-- simultâneas (pgTAP roda em uma sessão só, mesma ressalva já documentada em
-- rls_policies.test.sql); o teste de "duas revisões concorrentes" abaixo
-- verifica a serialização/idempotência da RPC quando chamada em sequência,
-- não uma corrida de fato entre duas transações abertas ao mesmo tempo.
-- ============================================================================

select plan(23);

select tests.clear_auth();

select tests.create_user('sync.a@test.local', 'student', 'active') as v_user_a \gset
select tests.create_user('sync.b@test.local', 'student', 'active') as v_user_b \gset
select tests.create_user('sync.admin@test.local', 'admin', 'active') as v_admin \gset

insert into public.disciplines (name, code, cycle) values ('Disciplina Sync Teste', 'SYNC-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_discipline_id \gset

insert into public.themes (discipline_id, name) values (:'v_discipline_id', 'Tema Sync Teste')
returning id as v_theme_id \gset

-- Questão publicada com gabarito completo, usada pelos testes de
-- submit_question_attempt.
insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_discipline_id', :'v_theme_id', 'clinico', 'medio', 'Vinheta Sync', 'Enunciado Sync')
returning id as v_question_id \gset

insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_question_id', 'A', 'Correta', 1) returning id as v_opt_correct \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_question_id', 'B', 'Errada', 2) returning id as v_opt_wrong \gset
insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary) values (:'v_question_id', 'Comentário', 'Resumo');
update public.question_option_keys set is_correct = true, explanation = 'Explicação correta' where option_id = :'v_opt_correct';
update public.question_option_keys set explanation = 'Explicação errada' where option_id = :'v_opt_wrong';

select tests.authenticate_as(:'v_admin');
select tests.approve_question_revision(:'v_question_id');
select public.publish_question(:'v_question_id');
select tests.clear_auth();

-- ----------------------------------------------------------------------------
-- submit_question_attempt: idempotência por (user_id, client_op_id)
-- ----------------------------------------------------------------------------

select tests.authenticate_as(:'v_user_a');

select gen_random_uuid() as v_op_1 \gset

select lives_ok(
  format($$ select public.submit_question_attempt(%L, %L, 20, null, null, null, null, %L) $$, :'v_question_id', :'v_opt_wrong', :'v_op_1'),
  'primeira chamada com client_op_id novo é aceita'
);

select is(
  (select count(*)::int from public.question_attempts where user_id = :'v_user_a' and client_op_id = :'v_op_1'),
  1,
  'exatamente 1 tentativa gravada para o client_op_id'
);

select is(
  (select count(*)::int from public.error_notebook where user_id = :'v_user_a' and question_id = :'v_question_id'),
  1,
  'error_notebook recebeu exatamente 1 entrada (resposta errada)'
);

-- Reenvio da MESMA operação (simula retry da fila após timeout de rede):
-- não deve inserir de novo nem duplicar error_notebook.
select lives_ok(
  format($$ select public.submit_question_attempt(%L, %L, 999, null, null, null, null, %L) $$, :'v_question_id', :'v_opt_correct', :'v_op_1'),
  'reenvio do mesmo client_op_id não lança erro'
);

select is(
  (select count(*)::int from public.question_attempts where user_id = :'v_user_a' and client_op_id = :'v_op_1'),
  1,
  'reenvio do mesmo client_op_id não duplica a tentativa'
);

select is(
  (select count(*)::int from public.error_notebook where user_id = :'v_user_a' and question_id = :'v_question_id'),
  1,
  'reenvio do mesmo client_op_id não duplica error_notebook'
);

select is(
  (select (public.submit_question_attempt(:'v_question_id', :'v_opt_wrong', 1, null, null, null, null, :'v_op_1'))->>'is_correct')::boolean,
  false,
  'reenvio devolve o resultado da tentativa ORIGINAL (is_correct=false), não recalcula a partir dos argumentos novos'
);

-- Uma tentativa de verdade (client_op_id diferente) deve gerar uma segunda
-- linha real — idempotência não pode impedir respostas repetidas legítimas.
select gen_random_uuid() as v_op_2 \gset

select lives_ok(
  format($$ select public.submit_question_attempt(%L, %L, 15, null, null, null, null, %L) $$, :'v_question_id', :'v_opt_correct', :'v_op_2'),
  'segunda tentativa real (client_op_id diferente) é aceita'
);

select is(
  (select count(*)::int from public.question_attempts where user_id = :'v_user_a' and question_id = :'v_question_id'),
  2,
  'total de 2 tentativas reais para o mesmo usuário/questão'
);

-- Isolamento entre usuários: o MESMO client_op_id usado por outro usuário não
-- colide (a chave de idempotência é por usuário, não global) nem é enviado
-- sob a sessão errada.
select tests.authenticate_as(:'v_user_b');

select lives_ok(
  format($$ select public.submit_question_attempt(%L, %L, 10, null, null, null, null, %L) $$, :'v_question_id', :'v_opt_correct', :'v_op_1'),
  'outro usuário pode reusar o mesmo client_op_id sem colisão'
);

-- A partir daqui lê como postgres (clear_auth): RLS de question_attempts só
-- deixa cada usuário ver as próprias linhas, e aqui o objetivo é conferir o
-- estado real da tabela entre os dois usuários, não a visibilidade via RLS
-- (já coberta em rls_policies.test.sql).
select tests.clear_auth();

select is(
  (select count(*)::int from public.question_attempts where user_id = :'v_user_b' and client_op_id = :'v_op_1'),
  1,
  'tentativa do usuário B gravada sob o próprio user_id, isolada da do usuário A'
);

select is(
  (select count(*)::int from public.question_attempts where client_op_id = :'v_op_1'),
  2,
  'client_op_id repetido entre usuários resulta em 2 linhas (uma por usuário), nunca fundidas'
);

select tests.clear_auth();

-- ----------------------------------------------------------------------------
-- submit_flashcard_review: idempotência + SM-2 atômico no servidor
-- ----------------------------------------------------------------------------

select tests.authenticate_as(:'v_user_a');

insert into public.flashcards (user_id, discipline_id, theme_id, front, back, difficulty)
values (:'v_user_a', :'v_discipline_id', :'v_theme_id', 'Frente', 'Verso', 'medio')
returning id as v_flashcard_id \gset

select tests.clear_auth();

-- Dono pode criar o card (owner_all já cobria isso); a policy owner_all de
-- flashcard_srs_state cobre a criação implícita via trigger/handler do
-- cliente — aqui simulamos o INSERT direto que o app faz ao criar um card novo.
select tests.authenticate_as(:'v_user_a');
insert into public.flashcard_srs_state (flashcard_id) values (:'v_flashcard_id');

select gen_random_uuid() as v_review_op_1 \gset

select lives_ok(
  format($$ select public.submit_flashcard_review(%L, 3, %L) $$, :'v_flashcard_id', :'v_review_op_1'),
  'primeira revisão (rating 3) é aceita'
);

select is(
  (select repetition_count from public.flashcard_srs_state where flashcard_id = :'v_flashcard_id'),
  1,
  'repetition_count avança para 1 após a primeira revisão'
);

select is(
  (select count(*)::int from public.flashcard_reviews where flashcard_id = :'v_flashcard_id'),
  1,
  'exatamente 1 linha de histórico após a primeira revisão'
);

-- Reenvio da mesma revisão (client_op_id repetido): não deve reaplicar o SM-2
-- nem duplicar o histórico.
select lives_ok(
  format($$ select public.submit_flashcard_review(%L, 1, %L) $$, :'v_flashcard_id', :'v_review_op_1'),
  'reenvio do mesmo client_op_id de revisão não lança erro mesmo com rating diferente'
);

select is(
  (select repetition_count from public.flashcard_srs_state where flashcard_id = :'v_flashcard_id'),
  1,
  'reenvio do mesmo client_op_id não reaplica o SM-2 (repetition_count continua 1, não reseta por causa do rating=1 do reenvio)'
);

select is(
  (select count(*)::int from public.flashcard_reviews where flashcard_id = :'v_flashcard_id'),
  1,
  'reenvio do mesmo client_op_id não duplica o histórico de revisões'
);

-- Segunda revisão real (client_op_id novo) avança o estado de verdade.
select gen_random_uuid() as v_review_op_2 \gset

select lives_ok(
  format($$ select public.submit_flashcard_review(%L, 3, %L) $$, :'v_flashcard_id', :'v_review_op_2'),
  'segunda revisão real (client_op_id novo) é aceita'
);

select is(
  (select repetition_count from public.flashcard_srs_state where flashcard_id = :'v_flashcard_id'),
  2,
  'repetition_count avança para 2 após a segunda revisão real — ordem preservada'
);

select is(
  (select count(*)::int from public.flashcard_reviews where flashcard_id = :'v_flashcard_id'),
  2,
  'total de 2 linhas de histórico após as duas revisões reais'
);

select throws_ok(
  format($$ select public.submit_flashcard_review(%L, 9, %L) $$, :'v_flashcard_id', gen_random_uuid()),
  NULL::char(5), NULL::text,
  'rating fora do intervalo 1-4 é rejeitado'
);

select tests.clear_auth();

-- Isolamento: usuário B não pode revisar um flashcard que não é dele.
select tests.authenticate_as(:'v_user_b');

select throws_ok(
  format($$ select public.submit_flashcard_review(%L, 3, %L) $$, :'v_flashcard_id', gen_random_uuid()),
  NULL::char(5), NULL::text,
  'usuário B não pode revisar flashcard do usuário A'
);

select tests.clear_auth();

select * from finish();
