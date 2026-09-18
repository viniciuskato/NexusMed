-- ============================================================================
-- SynapseMed — Regressão: RPCs que devolvem gabarito (auditoria 2026-09-18)
--
-- Cobre a migration 20260918120000_harden_answer_key_rpcs.sql:
-- - submit_question_attempt não pode devolver gabarito de outra questão
--   (nem rascunho) reaproveitando um client_op_id antigo, e exige usuário
--   ativo mesmo no caminho de idempotência;
-- - get_question_review exige usuário ativo e questão publicada (não-admin);
-- - submit_flashcard_review exige usuário ativo.
-- Reusa os helpers de rls_policies.test.sql e
-- content_provenance_attestation.test.sql (rodam antes, ordem alfabética).
-- ============================================================================

select plan(12);

select tests.clear_auth();

select tests.create_user('hard.a@test.local', 'student', 'active') as v_user_a \gset
select tests.create_user('hard.admin@test.local', 'admin', 'active') as v_admin \gset

insert into public.disciplines (name, code, cycle) values ('Disciplina Hardening', 'HARD-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_discipline_id \gset

insert into public.themes (discipline_id, name) values (:'v_discipline_id', 'Tema Hardening')
returning id as v_theme_id \gset

-- Questão publicada
insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_discipline_id', :'v_theme_id', 'clinico', 'medio', 'Vinheta publicada', 'Enunciado publicado')
returning id as v_pub_id \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_pub_id', 'A', 'Correta', 1) returning id as v_pub_ok \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_pub_id', 'B', 'Errada', 2) returning id as v_pub_wrong \gset
insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary) values (:'v_pub_id', 'Comentário publicado', 'Resumo');
update public.question_option_keys set is_correct = true, explanation = 'ok' where option_id = :'v_pub_ok';
update public.question_option_keys set explanation = 'errada' where option_id = :'v_pub_wrong';

-- Questão em rascunho, com gabarito completo (o que não pode vazar)
insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_discipline_id', :'v_theme_id', 'clinico', 'medio', 'Vinheta rascunho', 'Enunciado rascunho')
returning id as v_draft_id \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_draft_id', 'A', 'Correta', 1) returning id as v_draft_ok \gset
insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary) values (:'v_draft_id', 'SEGREDO DO RASCUNHO', 'Resumo');
update public.question_option_keys set is_correct = true, explanation = 'ok' where option_id = :'v_draft_ok';

select tests.authenticate_as(:'v_admin');
select tests.approve_question_revision(:'v_pub_id');
select public.publish_question(:'v_pub_id');
select tests.clear_auth();

-- ----------------------------------------------------------------------------
-- submit_question_attempt: client_op_id reaproveitado com outra questão
-- ----------------------------------------------------------------------------

select tests.authenticate_as(:'v_user_a');

select gen_random_uuid() as v_op_1 \gset

select lives_ok(
  format($$ select public.submit_question_attempt(%L, %L, 20, null, null, null, null, %L) $$, :'v_pub_id', :'v_pub_wrong', :'v_op_1'),
  'tentativa legítima na questão publicada é aceita'
);

select throws_ok(
  format($$ select public.submit_question_attempt(%L, %L, 0, null, null, null, null, %L) $$, :'v_draft_id', :'v_draft_ok', :'v_op_1'),
  NULL::char(5), NULL::text,
  'client_op_id antigo com questão em rascunho é rejeitado (não vaza gabarito)'
);

select throws_ok(
  format($$ select public.submit_question_attempt(%L, %L, 0, null, null, null, null, %L) $$, :'v_draft_id', :'v_draft_ok', gen_random_uuid()),
  NULL::char(5), NULL::text,
  'questão em rascunho com client_op_id novo continua rejeitada'
);

select is(
  (select (public.submit_question_attempt(:'v_pub_id', :'v_pub_wrong', 20, null, null, null, null, :'v_op_1'))->>'is_correct')::boolean,
  false,
  'reenvio legítimo (mesma questão, mesmo client_op_id) continua idempotente'
);

select ok(
  (public.submit_question_attempt(:'v_pub_id', :'v_pub_wrong', 20, null, null, null, null, :'v_op_1')) ? 'references',
  'payload de submit_question_attempt voltou a incluir references'
);

select is(
  (select count(*)::int from public.question_attempts where user_id = :'v_user_a'),
  1,
  'nenhuma tentativa extra gravada pelas chamadas acima'
);

-- Fixture de flashcard para o teste de conta bloqueada
insert into public.flashcards (user_id, discipline_id, theme_id, front, back, difficulty)
values (:'v_user_a', :'v_discipline_id', :'v_theme_id', 'Frente', 'Verso', 'medio')
returning id as v_flashcard_id \gset

select tests.clear_auth();

-- ----------------------------------------------------------------------------
-- get_question_review: questão despublicada não é revisável por estudante
-- ----------------------------------------------------------------------------

update public.questions set status = 'draft' where id = :'v_pub_id';

select tests.authenticate_as(:'v_user_a');

select throws_ok(
  format($$ select public.get_question_review(%L) $$, :'v_pub_id'),
  NULL::char(5), NULL::text,
  'estudante não revisa questão que voltou a rascunho'
);

select tests.clear_auth();
select tests.authenticate_as(:'v_admin');

select lives_ok(
  format($$ select public.get_question_review(%L) $$, :'v_draft_id'),
  'admin ativo continua revisando qualquer questão'
);

select tests.clear_auth();

-- ----------------------------------------------------------------------------
-- Conta bloqueada: nenhuma das três RPCs responde
-- ----------------------------------------------------------------------------

update public.profiles set status = 'blocked' where id = :'v_user_a';

select tests.authenticate_as(:'v_user_a');

select throws_ok(
  format($$ select public.submit_question_attempt(%L, %L, 20, null, null, null, null, %L) $$, :'v_pub_id', :'v_pub_wrong', :'v_op_1'),
  NULL::char(5), NULL::text,
  'conta bloqueada não usa o atalho de idempotência'
);

select throws_ok(
  format($$ select public.get_question_review(%L) $$, :'v_pub_id'),
  NULL::char(5), NULL::text,
  'conta bloqueada não revisa gabarito'
);

select throws_ok(
  format($$ select public.submit_flashcard_review(%L, 3, %L) $$, :'v_flashcard_id', gen_random_uuid()),
  NULL::char(5), NULL::text,
  'conta bloqueada não grava revisão de flashcard'
);

select tests.clear_auth();

select is(
  (select count(*)::int from public.flashcard_reviews where flashcard_id = :'v_flashcard_id'),
  0,
  'nenhuma revisão de flashcard gravada pela conta bloqueada'
);

select * from finish();
