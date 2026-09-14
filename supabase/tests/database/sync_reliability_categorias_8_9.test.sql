-- ============================================================================
-- SynapseMed — Testes pgTAP das categorias 8 (reações) e 9 (feedback +
-- status editorial) de sincronização (Prompt 07-F, complementado no 07-F2
-- com idempotência verificada de `submit_feedback` e a constraint de
-- exclusividade do vínculo).
--
-- Cobre a migration 20260910120000_sync_reliability_categorias_8_9.sql
-- (`updated_at` + trigger em `feedback`, RPC `set_feedback_status`, RPC
-- `submit_feedback` e a constraint `feedback_question_or_material_exclusive`
-- — as duas últimas adicionadas no 07-F2) e o
-- contrato já existente de `question_reactions` (upsert por índice único
-- COMUM `unique (user_id, question_id)` — não parcial, ver AGENTS.md
-- armadilha #14), que esta rodada não precisou alterar no schema. Reusa os
-- helpers de fixture de rls_policies.test.sql (schema `tests`).
--
-- NÃO cobre neste arquivo (mesma limitação já assumida nos arquivos
-- anteriores desta suíte): concorrência real entre duas conexões
-- simultâneas — pgTAP roda em uma sessão só, então os cenários de "dois
-- dispositivos" abaixo são sequenciais, provando idempotência/autorização
-- corretas, não uma corrida de fato disputando o mesmo instante. Concorrência
-- real (Promise.all/duas conexões distintas) é responsabilidade dos testes
-- de navegador (Playwright), não desta suíte.
-- ============================================================================

select plan(37);

select tests.clear_auth();

select tests.create_user('sync89.a@test.local', 'student', 'active') as v_user_a \gset
select tests.create_user('sync89.b@test.local', 'student', 'active') as v_user_b \gset
select tests.create_user('sync89.admin@test.local', 'admin', 'active') as v_admin \gset

insert into public.disciplines (name, code, cycle) values ('Disciplina Sync89 Teste', 'SYNC89-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_discipline_id \gset

insert into public.themes (discipline_id, name) values (:'v_discipline_id', 'Tema Sync89 Teste')
returning id as v_theme_id \gset

insert into public.materials (discipline_id, theme_id, title) values (:'v_discipline_id', :'v_theme_id', 'Compêndio Sync89 Teste')
returning id as v_material_id \gset

insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_discipline_id', :'v_theme_id', 'clinico', 'medio', 'Vinheta Sync89', 'Enunciado Sync89')
returning id as v_question_id \gset

insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_question_id', 'A', 'Correta', 1) returning id as v_opt_a \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_question_id', 'B', 'Errada', 2) returning id as v_opt_b \gset
insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary) values (:'v_question_id', 'Comentário', 'Resumo');
update public.question_option_keys set is_correct = true, explanation = 'Explicação correta' where option_id = :'v_opt_a';
update public.question_option_keys set explanation = 'Explicação errada' where option_id = :'v_opt_b';

select tests.authenticate_as(:'v_admin');
select tests.approve_question_revision(:'v_question_id');
select public.publish_question(:'v_question_id');
select tests.clear_auth();

-- ----------------------------------------------------------------------------
-- Reações (categoria 8): set idempotente, troca determinística, remoção
-- idempotente, isolamento por usuário.
-- ----------------------------------------------------------------------------

select tests.authenticate_as(:'v_user_a');

select lives_ok(
  format($$ insert into public.question_reactions (user_id, question_id, reaction) values (%L, %L, 'up') on conflict (user_id, question_id) do update set reaction = excluded.reaction $$, :'v_user_a', :'v_question_id'),
  'setReaction(up) via upsert é aceito (índice único COMUM, não parcial — onConflict funciona)'
);

select is(
  (select reaction from public.question_reactions where user_id = :'v_user_a' and question_id = :'v_question_id'),
  'up',
  'reação gravada como up'
);

-- Reenviar o MESMO valor (retry depois de uma falha de rede que já tinha
-- aplicado no servidor) é um no-op seguro: continua exatamente 1 linha, up.
select lives_ok(
  format($$ insert into public.question_reactions (user_id, question_id, reaction) values (%L, %L, 'up') on conflict (user_id, question_id) do update set reaction = excluded.reaction $$, :'v_user_a', :'v_question_id'),
  'reenviar setReaction(up) de novo (retry) não é erro'
);

select is(
  (select count(*) from public.question_reactions where user_id = :'v_user_a' and question_id = :'v_question_id'),
  1::bigint,
  'continua exatamente 1 linha depois do reenvio'
);

-- Troca determinística: down -> up -> down converge sempre para o último
-- valor efetivamente aplicado — sem merge de texto envolvido (é um único
-- enum por usuário/questão), então "última escrita aplicada vence" é seguro.
select lives_ok(
  format($$ insert into public.question_reactions (user_id, question_id, reaction) values (%L, %L, 'down') on conflict (user_id, question_id) do update set reaction = excluded.reaction $$, :'v_user_a', :'v_question_id'),
  'trocar para down é aceito'
);

select is(
  (select reaction from public.question_reactions where user_id = :'v_user_a' and question_id = :'v_question_id'),
  'down',
  'troca de reação convergiu para down'
);

-- Remoção idempotente: apagar já-apagado não é erro, nem duplica nada.
select lives_ok(
  format($$ delete from public.question_reactions where user_id = %L and question_id = %L $$, :'v_user_a', :'v_question_id'),
  'remover reação existente é aceito'
);

select is(
  (select count(*) from public.question_reactions where user_id = :'v_user_a' and question_id = :'v_question_id'),
  0::bigint,
  'reação removida (0 linhas)'
);

select lives_ok(
  format($$ delete from public.question_reactions where user_id = %L and question_id = %L $$, :'v_user_a', :'v_question_id'),
  'remover reação já removida (retry) não é erro'
);

-- Isolamento por usuário: B nunca vê a reação de A via RLS (não só pela UI).
select lives_ok(
  format($$ insert into public.question_reactions (user_id, question_id, reaction) values (%L, %L, 'up') $$, :'v_user_a', :'v_question_id'),
  'A registra reação up de novo para o teste de isolamento'
);

select tests.authenticate_as(:'v_user_b');

select is(
  (select count(*) from public.question_reactions where question_id = :'v_question_id'),
  0::bigint,
  'B não enxerga a reação de A via SELECT (RLS owner_all filtra por user_id = auth.uid())'
);

select lives_ok(
  format($$ update public.question_reactions set reaction = 'down' where user_id = %L and question_id = %L $$, :'v_user_a', :'v_question_id'),
  'RLS não lança erro para B — apenas filtra a linha de A para fora do UPDATE (0 linhas afetadas, ver asserção seguinte)'
);

select tests.clear_auth();
select tests.authenticate_as(:'v_admin');

select is(
  (select reaction from public.question_reactions where user_id = :'v_user_a' and question_id = :'v_question_id'),
  'up',
  'admin confirma que a reação de A continua up — a tentativa de B (via RLS) não teve efeito nenhum'
);

select isnt_empty(
  format($$ select 1 from public.question_reactions where question_id = %L $$, :'v_question_id'),
  'admin consegue SELECT em question_reactions de qualquer usuário (question_reactions_admin_select_all, usado para a contagem agregada 👍/👎 no admin)'
);

select tests.clear_auth();

-- ----------------------------------------------------------------------------
-- Feedback (categoria 9): client_op_id = id (PK), dedupe por id (nunca por
-- texto), updated_at, RPC set_feedback_status.
-- ----------------------------------------------------------------------------

select gen_random_uuid() as v_feedback_id \gset

select tests.authenticate_as(:'v_user_a');

select lives_ok(
  format($$ insert into public.feedback (id, user_id, type, title, description, question_id) values (%L, %L, 'problema', 'Gabarito errado', 'texto igual para o teste de não-dedupe por conteúdo', %L) $$, :'v_feedback_id', :'v_user_a', :'v_question_id'),
  'envio de feedback normal é aceito'
);

select is(
  (select status from public.feedback where id = :'v_feedback_id'),
  'pendente',
  'feedback novo nasce pendente'
);

-- Reenvio do MESMO client_op_id (= id, PK) após perda de resposta: o
-- handler do cliente (syncHandlers.ts) trata 23505 como sucesso idempotente
-- — aqui provamos que o SERVIDOR realmente rejeita a segunda linha (nunca
-- duplica), que é a premissa que torna esse tratamento seguro.
select throws_ok(
  format($$ insert into public.feedback (id, user_id, type, title, description, question_id) values (%L, %L, 'problema', 'Gabarito errado', 'texto igual para o teste de não-dedupe por conteúdo', %L) $$, :'v_feedback_id', :'v_user_a', :'v_question_id'),
  '23505',
  null,
  'reenviar o MESMO client_op_id (id) é rejeitado como duplicata — nunca cria uma segunda linha'
);

-- Duas submissões DELIBERADAMENTE distintas com TEXTO IGUAL devem persistir
-- como duas linhas — dedupe é só por id, nunca por conteúdo.
select lives_ok(
  format($$ insert into public.feedback (id, user_id, type, title, description, question_id) values (gen_random_uuid(), %L, 'problema', 'Gabarito errado', 'texto igual para o teste de não-dedupe por conteúdo', %L) $$, :'v_user_a', :'v_question_id'),
  'um segundo relato com id diferente e texto IGUAL é aceito (sem falsa dedupe por conteúdo)'
);

select is(
  (select count(*) from public.feedback where description = 'texto igual para o teste de não-dedupe por conteúdo'),
  2::bigint,
  'as duas submissões distintas com texto igual coexistem (2 linhas)'
);

-- ----------------------------------------------------------------------------
-- submit_feedback (Prompt 07-F2): idempotência VERIFICADA no servidor, não
-- mais "qualquer 23505 é sucesso" no cliente. Replay idêntico é aceito;
-- colisão de id com conteúdo ou dono diferente é conflito permanente.
-- ----------------------------------------------------------------------------

select gen_random_uuid() as v_fb2_id \gset

select lives_ok(
  format(
    $$ select public.submit_feedback(%L, 'problema', 'Título original', 'Descrição original', %L, null) $$,
    :'v_fb2_id', :'v_question_id'
  ),
  'submit_feedback: primeira submissão é aceita e devolve a linha criada'
);

select is(
  (select title from public.feedback where id = :'v_fb2_id'),
  'Título original',
  'submit_feedback: título gravado corretamente na primeira submissão'
);

select lives_ok(
  format(
    $$ select public.submit_feedback(%L, 'problema', 'Título original', 'Descrição original', %L, null) $$,
    :'v_fb2_id', :'v_question_id'
  ),
  'submit_feedback: replay EXATO do mesmo id/conteúdo/dono é aceito como sucesso idempotente (nunca duplica)'
);

select is(
  (select count(*) from public.feedback where id = :'v_fb2_id'),
  1::bigint,
  'submit_feedback: replay não duplicou linha (continua 1)'
);

select throws_ok(
  format(
    $$ select public.submit_feedback(%L, 'problema', 'Título DIFERENTE', 'Descrição original', %L, null) $$,
    :'v_fb2_id', :'v_question_id'
  ),
  'P0001',
  null,
  'submit_feedback: mesmo id com texto diferente é rejeitado como conflito (P0001, permanente — nunca 23505 solto)'
);

select tests.clear_auth();
select tests.authenticate_as(:'v_user_b');

select throws_ok(
  format(
    $$ select public.submit_feedback(%L, 'problema', 'Título original', 'Descrição original', %L, null) $$,
    :'v_fb2_id', :'v_question_id'
  ),
  'P0001',
  null,
  'submit_feedback: mesmo id sob OUTRO usuário é rejeitado como conflito, mesmo com conteúdo idêntico (dono diferente)'
);

select tests.clear_auth();
select tests.authenticate_as(:'v_admin');

select is(
  (select user_id from public.feedback where id = :'v_fb2_id'),
  :'v_user_a',
  'submit_feedback: a tentativa de B (dono diferente, rejeitada) não alterou o dono original da linha de A'
);

select tests.clear_auth();
select tests.authenticate_as(:'v_user_a');

-- feedback geral (sem vínculo) via RPC.
select lives_ok(
  format(
    $$ select public.submit_feedback(gen_random_uuid(), 'sugestao', 'Sugestão geral', 'Sem vínculo com questão ou compêndio', null, null) $$
  ),
  'submit_feedback: feedback geral (question_id e material_id nulos) é aceito'
);

-- feedback com questão e material simultaneamente: rejeitado pela RPC
-- (validação explícita antes do INSERT chegar a violar a constraint —
-- mensagem mais clara que "check constraint violated").
select throws_ok(
  format(
    $$ select public.submit_feedback(gen_random_uuid(), 'problema', 'Inválido', 'Vínculo duplo', %L, %L) $$,
    :'v_question_id', :'v_material_id'
  ),
  '23514',
  null,
  'submit_feedback: question_id e material_id preenchidos simultaneamente é rejeitado (constraint check via RPC)'
);

select tests.clear_auth();

-- ----------------------------------------------------------------------------
-- Exclusividade do vínculo (constraint feedback_question_or_material_exclusive):
-- confirma que a constraint em si barra o INSERT direto (defesa em
-- profundidade, não só a validação da RPC acima).
-- ----------------------------------------------------------------------------

select tests.authenticate_as(:'v_user_a');

select throws_ok(
  format(
    $$ insert into public.feedback (id, user_id, type, title, description, question_id, material_id) values (gen_random_uuid(), %L, 'problema', 'Inválido', 'Vínculo duplo via insert direto', %L, %L) $$,
    :'v_user_a', :'v_question_id', :'v_material_id'
  ),
  '23514',
  null,
  'constraint feedback_question_or_material_exclusive rejeita INSERT direto com os dois vínculos preenchidos'
);

select tests.clear_auth();

-- Autorização no servidor: estudante comum não pode mudar status, mesmo
-- chamando a RPC diretamente (contornando qualquer botão escondido na UI).
select tests.authenticate_as(:'v_user_a');

select throws_ok(
  format($$ select public.set_feedback_status(%L, 'em_analise') $$, :'v_feedback_id'),
  'P0001',
  'apenas administradores ativos podem alterar o status de um feedback',
  'estudante comum chamando set_feedback_status diretamente é rejeitado no servidor (não só escondido na UI)'
);

select is(
  (select status from public.feedback where id = :'v_feedback_id'),
  'pendente',
  'status permanece pendente após a tentativa negada do estudante'
);

select tests.clear_auth();

-- Editor: marca em_analise com sucesso; texto/vínculo/autor preservados.
select tests.authenticate_as(:'v_admin');

select lives_ok(
  format($$ select public.set_feedback_status(%L, 'em_analise') $$, :'v_feedback_id'),
  'admin ativo consegue marcar em_analise'
);

select is(
  (select status from public.feedback where id = :'v_feedback_id'),
  'em_analise',
  'status atualizado para em_analise'
);

select is(
  (select description from public.feedback where id = :'v_feedback_id'),
  'texto igual para o teste de não-dedupe por conteúdo',
  'texto original do feedback preservado após mudança de status'
);

select is(
  (select user_id from public.feedback where id = :'v_feedback_id'),
  :'v_user_a',
  'autor original preservado após mudança de status'
);

-- Idempotência: repetir a MESMA transição não é erro nem muda updated_at à
-- toa (reenviar a mesma ação não deve parecer uma mudança nova).
select (select updated_at from public.feedback where id = :'v_feedback_id') as v_updated_at_1 \gset

select lives_ok(
  format($$ select public.set_feedback_status(%L, 'em_analise') $$, :'v_feedback_id'),
  'repetir em_analise (idempotência) não é erro'
);

select is(
  (select updated_at from public.feedback where id = :'v_feedback_id')::text,
  :'v_updated_at_1',
  'updated_at não muda quando o status pedido já é o atual (idempotência real, não só "sem erro")'
);

select tests.clear_auth();
