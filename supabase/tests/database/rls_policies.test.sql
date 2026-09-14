-- ============================================================================
-- SynapseMed — Testes pgTAP de RLS, integridade editorial e RPCs
--
-- EXECUTADO E VALIDADO em 2026-09-05 contra Supabase CLI 2.116.0 + Docker
-- local (`supabase db reset` seguido de `supabase test db`): 80/80
-- asserções passando; a suíte também passou em duas execuções consecutivas
-- sem reset, com fixtures idempotentes.
-- Bugs reais encontrados e corrigidos nesta rodada (não pegos pela revisão
-- estática anterior): pgcrypto vive no schema `extensions`, não `public`
-- (crypt/gen_salt precisam de qualificação); tests.authenticate_as usava
-- set_config(..., is_local=true), que não sobrevive entre statements
-- autocommitados por psql/pg_prove; o schema `tests` não tinha GRANT USAGE
-- para anon/authenticated; e o uso de throws_ok(sql, 'descrição') nesta
-- versão do pgTAP trata o 2º argumento como padrão de mensagem de erro
-- esperado, não como descrição livre — corrigido para
-- throws_ok(sql, NULL::char(5), NULL::text, 'descrição').
--
-- TESTE DE CONCORRÊNCIA — NÃO É UMA ASSERÇÃO pgTAP DESTE ARQUIVO:
-- pgTAP roda em uma única sessão/transação; não consegue, sozinho, abrir
-- duas conexões concorrentes para exercitar a corrida "publish_question
-- valida enquanto outra transação altera/remove uma alternativa". Esse
-- cenário fica classificado como TESTE DE INTEGRAÇÃO CONCORRENTE separado
-- (roteiro documentado em docs/architecture/migration-roadmap.md), a ser
-- escrito como script de duas sessões psql (ou pgbench) quando houver
-- ambiente Supabase local disponível. Não é contado em `select plan(N)`
-- abaixo nem apresentado como executado.
-- ============================================================================

create extension if not exists pgtap;

create schema if not exists tests;

-- ----------------------------------------------------------------------------
-- Helpers de fixture e simulação de autenticação
-- ----------------------------------------------------------------------------

create or replace function tests.create_user(p_email text, p_role text default 'student', p_status text default 'pending')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := p_email || '+' || v_id::text;
begin
  insert into auth.users (id, email, encrypted_password, raw_user_meta_data, created_at, updated_at, aud, role)
  values (
    v_id, v_email, extensions.crypt('senha-teste-123', extensions.gen_salt('bf')),
    jsonb_build_object('display_name', p_email), now(), now(), 'authenticated', 'authenticated'
  );

  -- setup de fixture roda como postgres: ajusta role/status diretamente,
  -- sem passar por admin_set_profile_status (que é testada à parte).
  update public.profiles set role = p_role, status = p_status where id = v_id;

  return v_id;
end;
$$;

create or replace function tests.authenticate_as(p_uid uuid)
returns void
language plpgsql
as $$
begin
  -- is_local = false (nível de sessão): pg_prove/psql roda cada statement
  -- deste arquivo em autocommit, sem BEGIN explícito, então um set_config
  -- local à transação (true) desapareceria antes do próximo comando.
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, false);
  perform set_config('role', 'authenticated', false);
end;
$$;

create or replace function tests.authenticate_as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', false);
  perform set_config('role', 'anon', false);
end;
$$;

create or replace function tests.clear_auth()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', false);
  reset role;
end;
$$;

-- authenticate_as/authenticate_as_anon fazem SET ROLE de verdade (nível de
-- sessão, ver comentário acima), então anon/authenticated precisam poder
-- chegar a este schema e executar clear_auth() para voltar a ser postgres.
grant usage on schema tests to anon, authenticated;
grant execute on function tests.clear_auth() to anon, authenticated;

select plan(83);

-- ----------------------------------------------------------------------------
-- Fixtures: usuários, conteúdo em draft/published/archived
-- ----------------------------------------------------------------------------

select tests.clear_auth();

select tests.create_user('pending@test.local', 'student', 'pending') as v_pending \gset
select tests.create_user('blocked@test.local', 'student', 'blocked') as v_blocked \gset
select tests.create_user('active.a@test.local', 'student', 'active') as v_active_a \gset
select tests.create_user('active.b@test.local', 'student', 'active') as v_active_b \gset
select tests.create_user('admin@test.local', 'admin', 'active') as v_admin \gset

insert into public.disciplines (name, code, cycle) values ('Disciplina Teste', 'TST-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_discipline_id \gset

insert into public.themes (discipline_id, name) values (:'v_discipline_id', 'Tema Teste')
returning id as v_theme_id \gset

insert into public.materials (discipline_id, theme_id, title) values (:'v_discipline_id', :'v_theme_id', 'Material Draft')
returning id as v_material_draft_id \gset

-- Desde 23-B (content_provenance_attestation), materials.status não aceita
-- mais INSERT direto com 'published' (guard_material_publish, trigger da
-- migration 20260914120000) — insere em draft e usa o helper de fixture
-- tests.force_publish_material (definido em
-- content_provenance_attestation.test.sql, que roda antes deste arquivo em
-- ordem alfabética), que aprova uma revisão e publica sem exercitar o fluxo
-- de proveniência em si.
insert into public.materials (discipline_id, theme_id, title) values (:'v_discipline_id', :'v_theme_id', 'Material Published')
returning id as v_material_pub_id \gset
select tests.force_publish_material(:'v_material_pub_id');

-- Segundo material published, usado só para ter um par (material_id,
-- depends_on_material_id) ainda não inserido em material_dependencies —
-- necessário para testar a negação de RLS na escrita sem esbarrar na
-- constraint unique dos pares já usados nas fixtures abaixo.
insert into public.materials (discipline_id, theme_id, title) values (:'v_discipline_id', :'v_theme_id', 'Material Published 2')
returning id as v_material_pub2_id \gset
select tests.force_publish_material(:'v_material_pub2_id');

-- material_dependencies segue o mesmo padrão de RLS de material_references:
-- leitura liberada quando o material "de origem" (material_id) está
-- published; o status do pré-requisito (depends_on_material_id) é
-- irrelevante para a policy de leitura.
insert into public.material_dependencies (material_id, depends_on_material_id) values (:'v_material_pub_id', :'v_material_draft_id')
returning id as v_dep_pub_origin_id \gset

insert into public.material_dependencies (material_id, depends_on_material_id) values (:'v_material_draft_id', :'v_material_pub_id')
returning id as v_dep_draft_origin_id \gset

-- Questão A: será levada até published, com gabarito completo.
insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_discipline_id', :'v_theme_id', 'clinico', 'medio', 'Vinheta A', 'Enunciado A')
returning id as v_question_a_id \gset

insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_question_a_id', 'A', 'Opção A1', 1) returning id as v_qa_opt_a \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_question_a_id', 'B', 'Opção A2', 2) returning id as v_qa_opt_b \gset
insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary) values (:'v_question_a_id', 'Comentário geral A', 'Resumo A');
update public.question_option_keys set is_correct = true, explanation = 'Explicação correta A' where option_id = :'v_qa_opt_a';
update public.question_option_keys set explanation = 'Explicação incorreta A' where option_id = :'v_qa_opt_b';

-- publish_question exige app.is_admin_active(auth.uid()) internamente — a
-- preparação da fixture precisa autenticar como v_admin de fato (mesma RPC
-- real usada em produção), não pode chamar a função sem sessão autenticada.
select tests.authenticate_as(:'v_admin');
select tests.approve_question_revision(:'v_question_a_id');
select public.publish_question(:'v_question_a_id');
select tests.clear_auth();

-- Questão B: permanece em draft (usada para testar bloqueio de acesso/gabarito).
insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_discipline_id', :'v_theme_id', 'clinico', 'medio', 'Vinheta B', 'Enunciado B')
returning id as v_question_b_id \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_question_b_id', 'A', 'Opção B1', 1) returning id as v_qb_opt_a \gset

-- Questão C: levada a published e depois archived (para testes de congelamento).
insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_discipline_id', :'v_theme_id', 'clinico', 'medio', 'Vinheta C', 'Enunciado C')
returning id as v_question_c_id \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_question_c_id', 'A', 'Opção C1', 1) returning id as v_qc_opt_a \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_question_c_id', 'B', 'Opção C2', 2) returning id as v_qc_opt_b \gset
insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary) values (:'v_question_c_id', 'Comentário C', 'Resumo C');
update public.question_option_keys set is_correct = true, explanation = 'Explicação C correta' where option_id = :'v_qc_opt_a';
update public.question_option_keys set explanation = 'Explicação C incorreta' where option_id = :'v_qc_opt_b';

select tests.authenticate_as(:'v_admin');
select tests.approve_question_revision(:'v_question_c_id');
select public.publish_question(:'v_question_c_id');
update public.questions set status = 'archived' where id = :'v_question_c_id';
select tests.clear_auth();

-- ============================================================================
-- 1) Anônimo e status não-active
-- ============================================================================

select tests.authenticate_as_anon();
select is_empty(
  $$ select 1 from public.materials where status = 'published' $$,
  'anon não lê conteúdo editorial published'
);
select throws_ok(
  $$ insert into public.notes (user_id, question_id, note_text) values (gen_random_uuid(), (select id from public.questions limit 1), 'x') $$,
  NULL::char(5), NULL::text,
  'anon não escreve em tabela nenhuma'
);

select tests.authenticate_as(:'v_pending');
select is_empty(
  $$ select 1 from public.materials where status = 'published' $$,
  'pending não lê conteúdo published'
);
select isnt_empty(
  format($$ select 1 from public.profiles where id = %L $$, :'v_pending'),
  'pending lê o próprio profile'
);

select tests.authenticate_as(:'v_blocked');
select is_empty(
  $$ select 1 from public.questions where status = 'published' $$,
  'blocked não lê questions published'
);
select isnt_empty(
  format($$ select 1 from public.profiles where id = %L $$, :'v_blocked'),
  'blocked lê o próprio profile'
);

-- ============================================================================
-- 2) Estudante active: leitura editorial e bloqueio de escrita editorial
-- ============================================================================

select tests.authenticate_as(:'v_active_a');
select isnt_empty(
  format($$ select 1 from public.materials where id = %L $$, :'v_material_pub_id'),
  'active lê material published'
);
select is_empty(
  format($$ select 1 from public.materials where id = %L $$, :'v_material_draft_id'),
  'active não lê material draft'
);
select throws_ok(
  format($$ insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem) values (%L, %L, 'clinico', 'facil', 'x', 'y') $$, :'v_discipline_id', :'v_theme_id'),
  NULL::char(5), NULL::text,
  'active não cria conteúdo editorial'
);
-- UPDATE sob RLS não lança exceção quando a policy USING exclui a linha:
-- ela só afeta 0 linhas silenciosamente. throws_ok não se aplica aqui;
-- a verificação real é que o título permanece intocado.
update public.materials set title = 'hack' where id = :'v_material_pub_id';
select is(
  (select title from public.materials where id = :'v_material_pub_id'),
  'Material Published',
  'active não altera conteúdo editorial (RLS bloqueia silenciosamente, 0 linhas afetadas)'
);

-- ============================================================================
-- 2b) material_dependencies: mesmo padrão de materials (leitura conforme
-- status do material de origem, escrita só admin)
-- ============================================================================

select isnt_empty(
  format($$ select 1 from public.material_dependencies where id = %L $$, :'v_dep_pub_origin_id'),
  'active lê dependency cujo material de origem está published'
);
select is_empty(
  format($$ select 1 from public.material_dependencies where id = %L $$, :'v_dep_draft_origin_id'),
  'active não lê dependency cujo material de origem está em draft'
);
select throws_ok(
  format($$ insert into public.material_dependencies (material_id, depends_on_material_id) values (%L, %L) $$, :'v_material_pub2_id', :'v_material_pub_id'),
  NULL::char(5), NULL::text,
  'active não cria material_dependencies'
);
-- mesmo motivo dos blocos de materials/notes acima: UPDATE sob RLS filtra a
-- linha silenciosamente, não lança exceção.
update public.material_dependencies set depends_on_material_id = :'v_material_pub_id' where id = :'v_dep_pub_origin_id';
select is(
  (select depends_on_material_id from public.material_dependencies where id = :'v_dep_pub_origin_id'),
  :'v_material_draft_id'::uuid,
  'active não altera material_dependencies (RLS bloqueia silenciosamente, 0 linhas afetadas)'
);

-- ============================================================================
-- 3) Admin gerencia conteúdo editorial
-- ============================================================================

select tests.authenticate_as(:'v_admin');
select lives_ok(
  format($$ update public.materials set subtitle = 'editado por admin' where id = %L $$, :'v_material_pub_id'),
  'admin active edita conteúdo editorial'
);
select lives_ok(
  format($$ insert into public.material_dependencies (material_id, depends_on_material_id) values (%L, %L) $$, :'v_material_pub2_id', :'v_material_pub_id'),
  'admin active cria material_dependencies'
);

-- ============================================================================
-- 4) Dados pessoais: dono CRUD, isolamento entre usuários
-- ============================================================================

select tests.authenticate_as(:'v_active_a');
select lives_ok(
  format($$ insert into public.notes (user_id, question_id, note_text) values (%L, %L, 'nota da A') $$, :'v_active_a', :'v_question_a_id'),
  'active cria nota própria'
);

select tests.authenticate_as(:'v_active_b');
select is_empty(
  format($$ select 1 from public.notes where user_id = %L $$, :'v_active_a'),
  'active B não lê notas de active A'
);
-- mesmo motivo do bloco de materials acima: UPDATE sob RLS filtra a
-- linha silenciosamente, não lança exceção. A releitura precisa ser
-- feita como o dono (active_a): active_b não enxerga a nota de A por
-- RLS de SELECT (confirmado no teste anterior), então uma releitura
-- como active_b sempre traria NULL, dado ou não o "hack".
update public.notes set note_text = 'hack' where user_id = :'v_active_a';
select tests.authenticate_as(:'v_active_a');
select is(
  (select note_text from public.notes where user_id = :'v_active_a'),
  'nota da A',
  'active B não altera notas de active A (RLS bloqueia silenciosamente, 0 linhas afetadas)'
);
-- volta para active_b: a releitura acima (via active_a) mudou o
-- contexto de autenticação, e este teste precisa continuar sendo
-- active_b tentando forjar user_id de outra pessoa.
select tests.authenticate_as(:'v_active_b');
select throws_ok(
  format($$ insert into public.notes (user_id, question_id, note_text) values (%L, %L, 'forjada') $$, :'v_active_a', :'v_question_a_id'),
  NULL::char(5), NULL::text,
  'active B não insere nota com user_id de outro uid'
);

-- ============================================================================
-- 5) Proteção de profiles: colunas restritas
-- ============================================================================

select tests.authenticate_as(:'v_active_a');
select throws_ok(
  format($$ update public.profiles set role = 'admin' where id = %L $$, :'v_active_a'),
  NULL::char(5), NULL::text,
  'active não altera a própria role'
);
select throws_ok(
  format($$ update public.profiles set status = 'active' where id = %L $$, :'v_pending'),
  NULL::char(5), NULL::text,
  'active não altera status de outro perfil'
);
select tests.authenticate_as(:'v_pending');
select throws_ok(
  format($$ update public.profiles set status = 'active' where id = %L $$, :'v_pending'),
  NULL::char(5), NULL::text,
  'pending não se autopromove a active'
);

select tests.authenticate_as(:'v_admin');
select lives_ok(
  format($$ select public.admin_set_profile_status(%L, 'student', 'active') $$, :'v_pending'),
  'admin_set_profile_status promove pending para active'
);
select tests.authenticate_as(:'v_active_a');
select throws_ok(
  format($$ select public.admin_set_profile_status(%L, 'admin', 'active') $$, :'v_active_a'),
  NULL::char(5), NULL::text,
  'estudante não pode executar admin_set_profile_status'
);

-- ============================================================================
-- 6) Gabarito: invisível antes de responder, liberado só via RPC
-- ============================================================================

select tests.authenticate_as(:'v_active_a');
select is_empty(
  $$ select 1 from public.question_option_keys $$,
  'active não lê question_option_keys diretamente (gabarito)'
);
select is_empty(
  $$ select 1 from public.question_answer_keys $$,
  'active não lê question_answer_keys diretamente'
);

select tests.authenticate_as(:'v_active_b');
select throws_ok(
  format($$ select public.submit_question_attempt(%L, %L, 30) $$, :'v_question_b_id', :'v_qb_opt_a'),
  NULL::char(5), NULL::text,
  'estudante não pode responder questão em draft'
);
select throws_ok(
  format($$ select public.submit_question_attempt(%L, %L, 30) $$, :'v_question_c_id', :'v_qc_opt_a'),
  NULL::char(5), NULL::text,
  'estudante não pode responder questão archived'
);
select throws_ok(
  format($$ select public.submit_question_attempt(%L, %L, 30) $$, :'v_question_a_id', :'v_qb_opt_a'),
  NULL::char(5), NULL::text,
  'estudante não pode usar option_id de outra questão'
);

-- as 3 chamadas de erro acima (316-330) usam active_b só para exercitar
-- os bloqueios; as 2 submissões reais abaixo precisam ser de active_a,
-- pois é essa a autenticação usada na contagem final (question_attempts
-- só é visível para o dono, ver comentário mais abaixo).
select tests.authenticate_as(:'v_active_a');
select results_eq(
  format($$ select (public.submit_question_attempt(%L, %L, 45))->>'is_correct' $$, :'v_question_a_id', :'v_qa_opt_a'),
  $$ values ('true') $$,
  'submit_question_attempt calcula is_correct=true no servidor'
);
select isnt_empty(
  format($$ select 1 from jsonb_array_elements((public.submit_question_attempt(%L, %L, 10))->'options') $$, :'v_question_a_id', :'v_qa_opt_b'),
  'retorno da RPC inclui explicações de todas as alternativas após responder'
);

-- question_attempts só é visível para o dono (revoke insert/update +
-- policy owner_select), não existe policy de leitura para admin — por
-- isso a contagem precisa ser feita como o próprio active_a, não como
-- admin (que veria 0 linhas por RLS, não por bug de contagem).
select tests.authenticate_as(:'v_active_a');
select is(
  (select count(*)::int from public.question_attempts where question_id = :'v_question_a_id'),
  2,
  'duas tentativas foram registradas para a questão A (uma por chamada acima)'
);

-- ============================================================================
-- 6b) get_question_review: revisão do gabarito fora do fluxo de submissão
-- ============================================================================

select tests.authenticate_as(:'v_active_a');
select isnt_empty(
  format($$ select 1 from jsonb_array_elements((public.get_question_review(%L))->'options') $$, :'v_question_a_id'),
  'active_a (já respondeu a questão A) recebe o payload de revisão com as alternativas'
);

select tests.authenticate_as(:'v_active_b');
select throws_ok(
  format($$ select public.get_question_review(%L) $$, :'v_question_a_id'),
  NULL::char(5), NULL::text,
  'active_b (nunca respondeu a questão A) não pode revisar o gabarito'
);

select tests.authenticate_as(:'v_admin');
select lives_ok(
  format($$ select public.get_question_review(%L) $$, :'v_question_a_id'),
  'admin revisa o gabarito mesmo sem ter respondido a questão'
);

-- ============================================================================
-- 7) publish_question: validações de completude editorial
-- ============================================================================

select tests.authenticate_as(:'v_admin');

insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_discipline_id', :'v_theme_id', 'clinico', 'facil', 'Vinheta D', 'Enunciado D')
returning id as v_question_d_id \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_question_d_id', 'A', 'D1', 1) returning id as v_qd_opt_a \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_question_d_id', 'B', 'D2', 2) returning id as v_qd_opt_b \gset

select throws_ok(
  format($$ select public.publish_question(%L) $$, :'v_question_d_id'),
  NULL::char(5), NULL::text,
  'publish_question rejeita questão sem alternativa correta'
);

select throws_ok(
  format($$ update public.question_option_keys set is_correct = true where option_id in (%L, %L) $$, :'v_qd_opt_a', :'v_qd_opt_b'),
  NULL::char(5), NULL::text,
  'duas alternativas corretas na mesma questão são rejeitadas pelo índice único, não em publish_question'
);

update public.question_option_keys set is_correct = true, explanation = 'exp D1' where option_id = :'v_qd_opt_a';
update public.question_option_keys set explanation = 'exp D2' where option_id = :'v_qd_opt_b';

select throws_ok(
  format($$ select public.publish_question(%L) $$, :'v_question_d_id'),
  NULL::char(5), NULL::text,
  'publish_question rejeita questão sem question_answer_keys'
);

insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary)
values (:'v_question_d_id', 'Comentário D', 'Resumo D');

select tests.approve_question_revision(:'v_question_d_id');
select lives_ok(
  format($$ select public.publish_question(%L) $$, :'v_question_d_id'),
  'publish_question aceita questão válida (2 opções, 1 correta, answer_key, explicações)'
);

-- Questão E: simula ausência de key para uma alternativa. A trigger
-- trg_create_question_option_key cria automaticamente uma key por opção
-- (Estratégia A) — para testar "alternativa sem key" / "option_key_count
-- diferente de option_count" (mesma condição de código, um único teste),
-- removemos uma key manualmente enquanto a questão ainda está em draft
-- (permitido: a imutabilidade só vale para published/archived).
insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_discipline_id', :'v_theme_id', 'clinico', 'facil', 'Vinheta E', 'Enunciado E')
returning id as v_question_e_id \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_question_e_id', 'A', 'E1', 1) returning id as v_qe_opt_a \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_question_e_id', 'B', 'E2', 2) returning id as v_qe_opt_b \gset
update public.question_option_keys set is_correct = true, explanation = 'exp E1' where option_id = :'v_qe_opt_a';
update public.question_option_keys set explanation = 'exp E2' where option_id = :'v_qe_opt_b';
insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary)
values (:'v_question_e_id', 'Comentário E', 'Resumo E');
delete from public.question_option_keys where option_id = :'v_qe_opt_b';

select throws_ok(
  format($$ select public.publish_question(%L) $$, :'v_question_e_id'),
  NULL::char(5), NULL::text,
  'publish_question rejeita alternativa sem question_option_keys correspondente (option_key_count <> option_count)'
);

-- Questão F: general_commentary vazio.
insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_discipline_id', :'v_theme_id', 'clinico', 'facil', 'Vinheta F', 'Enunciado F')
returning id as v_question_f_id \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_question_f_id', 'A', 'F1', 1) returning id as v_qf_opt_a \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_question_f_id', 'B', 'F2', 2) returning id as v_qf_opt_b \gset
update public.question_option_keys set is_correct = true, explanation = 'exp F1' where option_id = :'v_qf_opt_a';
update public.question_option_keys set explanation = 'exp F2' where option_id = :'v_qf_opt_b';
insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary)
values (:'v_question_f_id', '', 'Resumo F');

select throws_ok(
  format($$ select public.publish_question(%L) $$, :'v_question_f_id'),
  NULL::char(5), NULL::text,
  'publish_question rejeita general_commentary vazio'
);

-- Questão G: high_yield_summary vazio.
insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_discipline_id', :'v_theme_id', 'clinico', 'facil', 'Vinheta G', 'Enunciado G')
returning id as v_question_g_id \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_question_g_id', 'A', 'G1', 1) returning id as v_qg_opt_a \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_question_g_id', 'B', 'G2', 2) returning id as v_qg_opt_b \gset
update public.question_option_keys set is_correct = true, explanation = 'exp G1' where option_id = :'v_qg_opt_a';
update public.question_option_keys set explanation = 'exp G2' where option_id = :'v_qg_opt_b';
insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary)
values (:'v_question_g_id', 'Comentário G', '');

select throws_ok(
  format($$ select public.publish_question(%L) $$, :'v_question_g_id'),
  NULL::char(5), NULL::text,
  'publish_question rejeita high_yield_summary vazio'
);

-- Questão H: explicação vazia em uma alternativa (a criação automática já
-- deixa explanation='' por padrão — aqui deliberadamente não preenchemos a
-- da opção B antes de tentar publicar).
insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_discipline_id', :'v_theme_id', 'clinico', 'facil', 'Vinheta H', 'Enunciado H')
returning id as v_question_h_id \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_question_h_id', 'A', 'H1', 1) returning id as v_qh_opt_a \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_question_h_id', 'B', 'H2', 2) returning id as v_qh_opt_b \gset
update public.question_option_keys set is_correct = true, explanation = 'exp H1' where option_id = :'v_qh_opt_a';
insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary)
values (:'v_question_h_id', 'Comentário H', 'Resumo H');

select throws_ok(
  format($$ select public.publish_question(%L) $$, :'v_question_h_id'),
  NULL::char(5), NULL::text,
  'publish_question rejeita alternativa com explicação vazia'
);

select tests.authenticate_as(:'v_active_a');
select throws_ok(
  format($$ select public.publish_question(%L) $$, :'v_question_d_id'),
  NULL::char(5), NULL::text,
  'estudante não pode executar publish_question'
);

-- ============================================================================
-- 8) Congelamento de questão published/archived (options/keys/conteúdo)
-- ============================================================================

select tests.authenticate_as(:'v_admin');

select throws_ok(
  format($$ insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem, status) values (%L, %L, 'clinico', 'facil', 'x', 'y', 'published') $$, :'v_discipline_id', :'v_theme_id'),
  NULL::char(5), NULL::text,
  'INSERT direto de questão com status published é rejeitado'
);

select throws_ok(
  format($$ update public.questions set status = 'published' where id = %L $$, :'v_question_c_id'),
  NULL::char(5), NULL::text,
  'transição archived -> published fora da RPC é rejeitada'
);

select throws_ok(
  format($$ update public.question_option_keys set explanation = 'hack' where option_id = %L $$, :'v_qc_opt_a'),
  NULL::char(5), NULL::text,
  'alteração de option key de questão archived é rejeitada'
);
select throws_ok(
  format($$ delete from public.question_answer_keys where question_id = %L $$, :'v_question_c_id'),
  NULL::char(5), NULL::text,
  'exclusão do answer_key de questão archived é rejeitada'
);
select throws_ok(
  format($$ delete from public.question_options where id = %L $$, :'v_qa_opt_a'),
  NULL::char(5), NULL::text,
  'exclusão da alternativa correta de questão published é rejeitada'
);
select throws_ok(
  format($$ delete from public.question_answer_keys where question_id = %L $$, :'v_question_a_id'),
  NULL::char(5), NULL::text,
  'exclusão do answer_key de questão published é rejeitada'
);
select throws_ok(
  format($$ insert into public.question_options (question_id, letter, option_text, sort_order) values (%L, 'C', 'nova', 3) $$, :'v_question_a_id'),
  NULL::char(5), NULL::text,
  'inserção de nova alternativa em questão published é rejeitada'
);
select throws_ok(
  format($$ delete from public.questions where id = %L $$, :'v_question_a_id'),
  NULL::char(5), NULL::text,
  'DELETE direto de questão published é rejeitado'
);

select throws_ok(
  format($$ update public.questions set question_stem = 'hack' where id = %L $$, :'v_question_a_id'),
  NULL::char(5), NULL::text,
  'alteração de texto de questão published diretamente é rejeitada'
);
select throws_ok(
  format($$ update public.questions set question_stem = 'hack' where id = %L $$, :'v_question_c_id'),
  NULL::char(5), NULL::text,
  'alteração de texto de questão archived diretamente é rejeitada'
);
select throws_ok(
  format($$ update public.questions set status = 'draft', question_stem = 'hack' where id = %L $$, :'v_question_a_id'),
  NULL::char(5), NULL::text,
  'alterar status e enunciado no mesmo UPDATE é rejeitado'
);

select lives_ok(
  format($$ update public.questions set status = 'draft' where id = %L $$, :'v_question_a_id'),
  'transição published -> draft isolada (sem alterar conteúdo) é permitida'
);
select lives_ok(
  format($$ update public.questions set status = 'draft' where id = %L $$, :'v_question_c_id'),
  'transição archived -> draft isolada é permitida'
);

select lives_ok(
  format($$ update public.question_options set option_text = 'Opção A1 editada' where id = %L $$, :'v_qa_opt_a'),
  'edição de alternativa é permitida depois que a questão volta a draft'
);

-- Conteúdo mudou desde a aprovação usada na primeira publicação (fixture
-- inicial) — precisa de uma revisão/aprovação nova batendo com o hash atual,
-- mesma regra que qualquer edição pós-aprovação (23-B).
select tests.approve_question_revision(:'v_question_a_id');
select lives_ok(
  format($$ select public.publish_question(%L) $$, :'v_question_a_id'),
  'republicação válida via publish_question após nova validação'
);

-- ============================================================================
-- 9) Simulados: pertença estrutural via simulation_questions
-- ============================================================================

select tests.authenticate_as(:'v_active_a');
insert into public.simulations (user_id, name) values (:'v_active_a', 'Simulado Teste') returning id as v_sim_id \gset
insert into public.simulation_questions (simulation_id, question_id, position) values (:'v_sim_id', :'v_question_a_id', 1) returning id as v_simq_id \gset

select throws_ok(
  format($$ insert into public.simulation_answers (simulation_question_id, selected_option_id) values (%L, %L) $$, :'v_simq_id', :'v_qb_opt_a'),
  NULL::char(5), NULL::text,
  'simulation_answer com option_id de questão fora do simulado é rejeitado'
);
select lives_ok(
  format($$ insert into public.simulation_answers (simulation_question_id, selected_option_id) values (%L, %L) $$, :'v_simq_id', :'v_qa_opt_a'),
  'simulation_answer com option_id correto (pertencente à questão do simulado) é aceito'
);

-- ============================================================================
-- 10) Admin não acessa automaticamente dados pessoais de estudantes
-- ============================================================================

select tests.authenticate_as(:'v_admin');
select is_empty(
  format($$ select 1 from public.notes where user_id = %L $$, :'v_active_a'),
  'admin active não lê notes de estudante'
);
select is_empty(
  format($$ select 1 from public.question_attempts where user_id = %L $$, :'v_active_b'),
  'admin active não lê question_attempts de estudante'
);
select is_empty(
  format($$ select 1 from public.flashcards where user_id = %L $$, :'v_active_a'),
  'admin active não lê flashcards de estudante'
);
select is_empty(
  format($$ select 1 from public.reading_progress where user_id = %L $$, :'v_active_a'),
  'admin active não lê reading_progress de estudante'
);

-- ============================================================================
-- 11) Feedback
-- ============================================================================

select tests.authenticate_as_anon();
select throws_ok(
  $$ insert into public.feedback (user_id, type, title, description) values (gen_random_uuid(), 'sugestao', 'x', 'y') $$,
  NULL::char(5), NULL::text,
  'anon não insere feedback'
);

select tests.authenticate_as(:'v_active_a');
select lives_ok(
  format($$ insert into public.feedback (user_id, type, title, description) values (%L, 'sugestao', 'Sugestão de teste', 'Descrição de teste') $$, :'v_active_a'),
  'active insere o próprio feedback'
);

select tests.authenticate_as(:'v_admin');
select isnt_empty(
  format($$ select 1 from public.feedback where user_id = %L $$, :'v_active_a'),
  'admin active lê feedback de qualquer usuário (moderação)'
);

-- ============================================================================
-- 12) sources / question_references / question_corrections (schema v2)
-- ============================================================================

select tests.authenticate_as(:'v_admin');
insert into public.sources (id, citation_text, tipo, verificacao)
values ('fonte-teste-' || gen_random_uuid()::text, 'Citação de teste', 'diretriz_consenso', 'verificada')
returning id as v_source_id \gset

select tests.authenticate_as_anon();
select is_empty(
  $$ select 1 from public.sources $$,
  'anon não lê sources'
);

-- v_pending já foi promovido a active na seção 5 (admin_set_profile_status);
-- usa-se v_blocked aqui para exercitar o bloqueio de status não-active.
select tests.authenticate_as(:'v_blocked');
select is_empty(
  $$ select 1 from public.sources $$,
  'blocked não lê sources'
);

select tests.authenticate_as(:'v_active_a');
select isnt_empty(
  $$ select 1 from public.sources $$,
  'active lê sources (bibliografia compartilhada, não sensível)'
);
select throws_ok(
  $$ insert into public.sources (id, citation_text, tipo, verificacao) values ('fonte-hack', 'x', 'ensaio', 'vaga_pendente') $$,
  NULL::char(5), NULL::text,
  'active não escreve em sources'
);

select tests.authenticate_as(:'v_admin');
insert into public.question_references (question_id, source_id, sort_order)
values (:'v_question_a_id', :'v_source_id', 1);
insert into public.question_references (question_id, source_id, sort_order)
values (:'v_question_b_id', :'v_source_id', 1);

select tests.authenticate_as(:'v_active_a');
select isnt_empty(
  format($$ select 1 from public.question_references where question_id = %L $$, :'v_question_a_id'),
  'active lê question_references de questão published'
);
select is_empty(
  format($$ select 1 from public.question_references where question_id = %L $$, :'v_question_b_id'),
  'active não lê question_references de questão draft'
);
select throws_ok(
  format($$ insert into public.question_references (question_id, source_id) values (%L, %L) $$, :'v_question_a_id', :'v_source_id'),
  NULL::char(5), NULL::text,
  'active não escreve em question_references'
);

select tests.authenticate_as(:'v_admin');
insert into public.question_corrections (question_id, correction_type, changed_fields, reason, responsible, ai_usage, occurred_at)
values (:'v_question_a_id', 'correcao_factual', array['alternativas[1]'], 'motivo de teste', 'Teste', 'auditoria_de_conteudo', current_date);

select tests.authenticate_as(:'v_active_a');
select is_empty(
  format($$ select 1 from public.question_corrections where question_id = %L $$, :'v_question_a_id'),
  'active não lê question_corrections (trilha de auditoria, só admin)'
);
select throws_ok(
  format($$ insert into public.question_corrections (question_id, correction_type) values (%L, 'nota_editorial') $$, :'v_question_a_id'),
  NULL::char(5), NULL::text,
  'active não escreve em question_corrections'
);

select tests.authenticate_as(:'v_admin');
select isnt_empty(
  format($$ select 1 from public.question_corrections where question_id = %L $$, :'v_question_a_id'),
  'admin lê question_corrections'
);

-- ============================================================================
-- 13) Storage: bucket privado e regras de escrita
-- ============================================================================

select tests.clear_auth();
select is(
  (select public from storage.buckets where id = 'editorial-assets'),
  false,
  'bucket editorial-assets é privado'
);

select tests.authenticate_as(:'v_active_a');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner) values ('editorial-assets', 'materials/x/y.png', auth.uid()) $$,
  NULL::char(5), NULL::text,
  'estudante active não faz upload em editorial-assets'
);

select tests.authenticate_as(:'v_admin');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner) values ('editorial-assets', 'materials/algum-material/asset-' || gen_random_uuid()::text || '.png', auth.uid()) $$,
  'admin active pode inserir objeto em caminho válido de editorial-assets'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner) values ('editorial-assets', 'caminho-invalido/asset.png', auth.uid()) $$,
  NULL::char(5), NULL::text,
  'admin active não pode inserir objeto em caminho fora de materials//questions/'
);

select tests.clear_auth();
select * from finish();
