-- ============================================================================
-- SynapseMed — Testes pgTAP das categorias 3-7 de sincronização (Prompt 07-E)
--
-- Cobre a migration 20260909130000_sync_reliability_categorias_3_a_7.sql:
-- índices únicos de notas, RPC set_section_read (merge atômico) e RPC
-- save_simulado_session (substituição transacional). Reusa os helpers de
-- fixture de rls_policies.test.sql — supõe que aquele arquivo já rodou nesta
-- mesma base (cria o schema `tests`).
--
-- NÃO cobre neste arquivo (mesma limitação já assumida em
-- sync_reliability.test.sql): concorrência real entre duas conexões
-- simultâneas — pgTAP roda em uma sessão só, então "duas chamadas
-- concorrentes" abaixo são sequenciais, provando idempotência/merge
-- corretos, não uma corrida de fato disputando o lock ao mesmo tempo.
-- ============================================================================

select plan(34);

select tests.clear_auth();

select tests.create_user('sync3a.a@test.local', 'student', 'active') as v_user_a \gset
select tests.create_user('sync3a.b@test.local', 'student', 'active') as v_user_b \gset
select tests.create_user('sync3a.admin@test.local', 'admin', 'active') as v_admin \gset

insert into public.disciplines (name, code, cycle) values ('Disciplina Sync3A Teste', 'SYNC3A-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_discipline_id \gset

insert into public.themes (discipline_id, name) values (:'v_discipline_id', 'Tema Sync3A Teste')
returning id as v_theme_id \gset

insert into public.materials (discipline_id, theme_id, title) values (:'v_discipline_id', :'v_theme_id', 'Compendio Sync3A')
returning id as v_material_id \gset
select tests.force_publish_material(:'v_material_id');

insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_discipline_id', :'v_theme_id', 'clinico', 'medio', 'Vinheta Sync3A', 'Enunciado Sync3A')
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
-- Notas: índices únicos parciais
-- ----------------------------------------------------------------------------

select tests.authenticate_as(:'v_user_a');

insert into public.notes (user_id, question_id, note_text) values (:'v_user_a', :'v_question_id', 'primeira nota');

select throws_ok(
  format($$ insert into public.notes (user_id, question_id, note_text) values (%L, %L, 'segunda nota, mesmo alvo') $$, :'v_user_a', :'v_question_id'),
  '23505',
  null,
  'segunda nota para o mesmo (usuário, question_id) viola o índice único — impede duplicação por corrida delete+insert'
);

select lives_ok(
  format($$ insert into public.notes (user_id, question_id, note_text) values (%L, %L, 'upsert') on conflict (user_id, question_id) do update set note_text = excluded.note_text $$, :'v_user_a', :'v_question_id'),
  'upsert real (on conflict do update) funciona como substituto atômico do delete+insert anterior'
);

select is(
  (select count(*) from public.notes where user_id = :'v_user_a' and question_id = :'v_question_id'),
  1::bigint,
  'ainda existe exatamente 1 nota para o alvo depois do upsert'
);

select is(
  (select note_text from public.notes where user_id = :'v_user_a' and question_id = :'v_question_id'),
  'upsert',
  'o texto da nota reflete o upsert mais recente'
);

select tests.clear_auth();

-- ----------------------------------------------------------------------------
-- set_section_read: merge atômico por seção (não sobrescreve progresso de
-- outra "sessão" que já tenha adicionado outra seção)
-- ----------------------------------------------------------------------------

select tests.authenticate_as(:'v_user_a');

select gen_random_uuid() as v_section_1 \gset
select gen_random_uuid() as v_section_2 \gset
select gen_random_uuid() as v_section_3 \gset

select lives_ok(
  format($$ select public.set_section_read(%L, %L, true, 4) $$, :'v_material_id', :'v_section_1'),
  'marcar a primeira seção como lida é aceito'
);

select is(
  (select array_length(read_section_ids, 1) from public.reading_progress where user_id = :'v_user_a' and material_id = :'v_material_id'),
  1,
  'progresso tem 1 seção lida após a primeira chamada'
);

-- Simula um "segundo dispositivo" que já tinha marcado a seção 1 como lida e
-- agora, sem saber que o dispositivo acima marcou também, adiciona a seção 2.
-- O merge no servidor precisa preservar as DUAS, nunca sobrescrever com um
-- array que só conhece a seção 2.
select public.set_section_read(:'v_material_id', :'v_section_2', true, 4);

select is(
  (select array_length(read_section_ids, 1) from public.reading_progress where user_id = :'v_user_a' and material_id = :'v_material_id'),
  2,
  'segunda chamada faz merge (2 seções), não sobrescreve a primeira'
);

-- Reenviar a MESMA seção como lida de novo (retry depois de uma falha de
-- rede que na verdade já tinha aplicado no servidor) não duplica no array.
select public.set_section_read(:'v_material_id', :'v_section_1', true, 4);

select is(
  (select array_length(read_section_ids, 1) from public.reading_progress where user_id = :'v_user_a' and material_id = :'v_material_id'),
  2,
  'reenviar a mesma seção como lida é idempotente (não duplica no array)'
);

select is(
  (select percent from public.reading_progress where user_id = :'v_user_a' and material_id = :'v_material_id'),
  50,
  'percent recalculado no servidor a partir do tamanho real do array (2/4 = 50%)'
);

-- Desmarcar uma seção remove só ela, preservando a outra.
select public.set_section_read(:'v_material_id', :'v_section_1', false, 4);

select is(
  (select read_section_ids from public.reading_progress where user_id = :'v_user_a' and material_id = :'v_material_id'),
  array[:'v_section_2']::uuid[],
  'desmarcar uma seção remove só ela, preserva as demais'
);

-- Desmarcar uma seção que já não está lida (retry) é um no-op seguro.
select lives_ok(
  format($$ select public.set_section_read(%L, %L, false, 4) $$, :'v_material_id', :'v_section_3'),
  'desmarcar uma seção nunca lida não lança erro (idempotente)'
);

select throws_ok(
  format($$ select public.set_section_read(%L, %L, true, 0) $$, :'v_material_id', :'v_section_1'),
  'P0001',
  'total_sections deve ser maior que zero',
  'total_sections <= 0 é rejeitado'
);

select tests.clear_auth();

-- Isolamento: usuário B não enxerga/mistura progresso do usuário A.
select tests.authenticate_as(:'v_user_b');
select public.set_section_read(:'v_material_id', :'v_section_3', true, 4);
select is(
  (select array_length(read_section_ids, 1) from public.reading_progress where user_id = :'v_user_b' and material_id = :'v_material_id'),
  1,
  'progresso do usuário B é independente do usuário A'
);
select tests.clear_auth();
select is(
  (select count(*) from public.reading_progress where user_id = :'v_user_a' and material_id = :'v_material_id' and array_length(read_section_ids,1) = 1),
  1::bigint,
  'progresso do usuário A não foi alterado pela chamada do usuário B'
);

-- ----------------------------------------------------------------------------
-- save_simulado_session: substituição transacional (tudo ou nada)
-- ----------------------------------------------------------------------------

select tests.authenticate_as(:'v_user_a');

select gen_random_uuid() as v_sim_id \gset

-- `completed_at` é capturado UMA VEZ e reutilizado nas duas chamadas abaixo —
-- reflete o comportamento real do cliente (SimuladoSession.tsx congela
-- `completedAt` no momento de "Finalizar Prova" e a fila reenvia o MESMO
-- payload em retry, nunca gera um novo timestamp a cada tentativa). Usar
-- `now()` de novo em cada chamada SQL separada dispararia incorretamente a
-- guarda de estado terminal (07-E2) contra o próprio reenvio idempotente.
select now() as v_completed_at \gset

select lives_ok(
  format(
    $$ select public.save_simulado_session(jsonb_build_object(
        'id', %L, 'name', 'Simulado Teste', 'config', jsonb_build_object('name', 'Simulado Teste'),
        'started_at', now(), 'completed_at', %L::timestamptz, 'score', 80, 'total_time_seconds', 120,
        'questions', jsonb_build_array(jsonb_build_object('question_id', %L, 'position', 0)),
        'answers', jsonb_build_array(jsonb_build_object('question_id', %L, 'selected_option_id', %L, 'time_spent_seconds', 30))
      )) $$,
    :'v_sim_id', :'v_completed_at', :'v_question_id', :'v_question_id', :'v_opt_a'
  ),
  'primeira gravação da sessão de simulado é aceita'
);

select is(
  (select count(*) from public.simulations where id = :'v_sim_id'),
  1::bigint,
  'sessão de simulado criada'
);

select is(
  (select count(*) from public.simulation_questions where simulation_id = :'v_sim_id'),
  1::bigint,
  '1 pergunta associada à sessão'
);

select is(
  (select count(*) from public.simulation_answers sa join public.simulation_questions sq on sq.id = sa.simulation_question_id where sq.simulation_id = :'v_sim_id'),
  1::bigint,
  '1 resposta associada à sessão'
);

-- Reenviar o MESMO payload (retry depois de uma falha de rede que já tinha
-- aplicado no servidor) substitui por um conteúdo idêntico — nunca duplica
-- perguntas/respostas.
select public.save_simulado_session(jsonb_build_object(
  'id', :'v_sim_id', 'name', 'Simulado Teste', 'config', jsonb_build_object('name', 'Simulado Teste'),
  'started_at', now(), 'completed_at', :'v_completed_at'::timestamptz, 'score', 80, 'total_time_seconds', 120,
  'questions', jsonb_build_array(jsonb_build_object('question_id', :'v_question_id', 'position', 0)),
  'answers', jsonb_build_array(jsonb_build_object('question_id', :'v_question_id', 'selected_option_id', :'v_opt_a', 'time_spent_seconds', 30))
));

select is(
  (select count(*) from public.simulation_questions where simulation_id = :'v_sim_id'),
  1::bigint,
  'reenviar o mesmo payload não duplica simulation_questions (idempotente por substituição total)'
);

select is(
  (select count(*) from public.simulation_answers sa join public.simulation_questions sq on sq.id = sa.simulation_question_id where sq.simulation_id = :'v_sim_id'),
  1::bigint,
  'reenviar o mesmo payload não duplica simulation_answers'
);

-- Resposta com alternativa que não pertence à questão é ignorada (não aborta
-- a transação inteira).
select gen_random_uuid() as v_sim_id_2 \gset
select tests.clear_auth();
insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_discipline_id', :'v_theme_id', 'clinico', 'medio', 'Vinheta Sync3A 2', 'Enunciado Sync3A 2')
returning id as v_question_id_2 \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_question_id_2', 'A', 'Correta 2', 1) returning id as v_opt_a2 \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_question_id_2', 'B', 'Errada 2', 2) returning id as v_opt_b2 \gset
insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary) values (:'v_question_id_2', 'C2', 'R2');
update public.question_option_keys set is_correct = true, explanation = 'Explicação correta 2' where option_id = :'v_opt_a2';
update public.question_option_keys set explanation = 'Explicação errada 2' where option_id = :'v_opt_b2';
select tests.authenticate_as(:'v_admin');
select tests.approve_question_revision(:'v_question_id_2');
select public.publish_question(:'v_question_id_2');
select tests.authenticate_as(:'v_user_a');

select lives_ok(
  format(
    $$ select public.save_simulado_session(jsonb_build_object(
        'id', %L, 'config', jsonb_build_object('name', 'Simulado Resposta Invalida'),
        'started_at', now(), 'total_time_seconds', 60,
        'questions', jsonb_build_array(jsonb_build_object('question_id', %L, 'position', 0)),
        'answers', jsonb_build_array(jsonb_build_object('question_id', %L, 'selected_option_id', %L, 'time_spent_seconds', 10))
      )) $$,
    :'v_sim_id_2', :'v_question_id_2', :'v_question_id_2', :'v_opt_a' -- opção da OUTRA questão
  ),
  'sessão com resposta inconsistente (alternativa de outra questão) não lança erro'
);

select is(
  (select count(*) from public.simulation_questions where simulation_id = :'v_sim_id_2'),
  1::bigint,
  'a pergunta é gravada mesmo quando a resposta associada é descartada'
);

select is(
  (select count(*) from public.simulation_answers sa join public.simulation_questions sq on sq.id = sa.simulation_question_id where sq.simulation_id = :'v_sim_id_2'),
  0::bigint,
  'a resposta inconsistente é descartada, não gravada'
);

select tests.clear_auth();

-- Ownership: usuário B não consegue gravar/sobrescrever a sessão do usuário A.
select tests.authenticate_as(:'v_user_b');
select throws_ok(
  format(
    $$ select public.save_simulado_session(jsonb_build_object(
        'id', %L, 'config', jsonb_build_object('name', 'Sequestro'), 'started_at', now(), 'total_time_seconds', 1,
        'questions', '[]'::jsonb, 'answers', '[]'::jsonb
      )) $$,
    :'v_sim_id'
  ),
  'P0001',
  'sessão de simulado não pertence ao usuário autenticado',
  'usuário B não pode sobrescrever a sessão de simulado do usuário A'
);

select tests.clear_auth();
select is(
  (select name from public.simulations where id = :'v_sim_id'),
  'Simulado Teste',
  'a sessão do usuário A permanece intacta após a tentativa do usuário B'
);

-- ----------------------------------------------------------------------------
-- save_simulado_session: estado terminal protegido (Prompt 07-E2)
-- ----------------------------------------------------------------------------
-- Revisão de código encontrou risco real: sem esta guarda, um dispositivo
-- atrasado (rascunho antigo, reconectando depois de outro dispositivo já ter
-- finalizado a MESMA sessão) sobrescreveria silenciosamente o resultado já
-- fechado. `v_sim_id` já está finalizado (completed_at = v_completed_at,
-- gravado acima) — qualquer completed_at DIFERENTE agora deve ser rejeitado.

select tests.authenticate_as(:'v_user_a');

select throws_ok(
  format(
    $$ select public.save_simulado_session(jsonb_build_object(
        'id', %L, 'config', jsonb_build_object('name', 'Reenvio Atrasado'),
        'started_at', now(), 'completed_at', now(), 'score', 10, 'total_time_seconds', 999,
        'questions', '[]'::jsonb, 'answers', '[]'::jsonb
      )) $$,
    :'v_sim_id'
  ),
  'P0001',
  'sessao_ja_finalizada: esta sessão de simulado já foi finalizada em outro envio e não pode ser sobrescrita',
  'dispositivo atrasado com completed_at diferente não sobrescreve sessão já finalizada'
);

select is(
  (select score from public.simulations where id = :'v_sim_id'),
  80::numeric,
  'score original (80) preservado — o reenvio atrasado (score 10) não foi aplicado'
);

-- Tentar "reabrir" a sessão (completed_at nulo) depois de finalizada também
-- é rejeitado — nunca regride silenciosamente um resultado fechado para
-- "em andamento".
select throws_ok(
  format(
    $$ select public.save_simulado_session(jsonb_build_object(
        'id', %L, 'config', jsonb_build_object('name', 'Reabertura'),
        'started_at', now(), 'total_time_seconds', 1,
        'questions', '[]'::jsonb, 'answers', '[]'::jsonb
      )) $$,
    :'v_sim_id'
  ),
  'P0001',
  'sessao_ja_finalizada: esta sessão de simulado já foi finalizada em outro envio e não pode ser sobrescrita',
  'tentar reabrir (completed_at nulo) uma sessão já finalizada é rejeitado'
);

-- Reenviar EXATAMENTE o mesmo completed_at (retry real depois de falha de
-- rede) continua sendo aceito como no-op seguro — a guarda não pode quebrar
-- idempotência legítima.
select lives_ok(
  format(
    $$ select public.save_simulado_session(jsonb_build_object(
        'id', %L, 'name', 'Simulado Teste', 'config', jsonb_build_object('name', 'Simulado Teste'),
        'started_at', now(), 'completed_at', %L::timestamptz, 'score', 80, 'total_time_seconds', 120,
        'questions', jsonb_build_array(jsonb_build_object('question_id', %L, 'position', 0)),
        'answers', jsonb_build_array(jsonb_build_object('question_id', %L, 'selected_option_id', %L, 'time_spent_seconds', 30))
      )) $$,
    :'v_sim_id', :'v_completed_at', :'v_question_id', :'v_question_id', :'v_opt_a'
  ),
  'reenviar o MESMO completed_at (retry real) continua sendo aceito, mesmo com a sessão já finalizada'
);

select tests.clear_auth();

-- ----------------------------------------------------------------------------
-- upsert_note: detecção de conflito (Prompt 07-E2)
-- ----------------------------------------------------------------------------
-- Revisão de código encontrou risco real: o upsert "última gravação vence"
-- do 07-E não detectava NENHUM conflito — duas edições concorrentes da
-- mesma nota em dois dispositivos apagariam uma silenciosamente. Simula dois
-- dispositivos que leram a MESMA base (updated_at da nota criada acima) e
-- depois editaram de forma diferente, offline, sem saber um do outro.

select tests.authenticate_as(:'v_user_a');

select (select updated_at from public.notes where user_id = :'v_user_a' and question_id = :'v_question_id') as v_note_base \gset

-- "Dispositivo 1" grava sem conflito (base bate com o servidor).
select (public.upsert_note(null, null, :'v_question_id', null, 'edição do dispositivo 1', :'v_note_base')->>'conflict')::boolean as v_conflict_1 \gset
select is(:'v_conflict_1'::boolean, false, 'dispositivo 1 grava sem conflito (base bate com o servidor)');

-- "Dispositivo 2" tenta gravar com a MESMA base antiga (não sabia da escrita
-- do dispositivo 1 acima) — precisa ser detectado como conflito, NUNCA
-- sobrescrever silenciosamente.
select (public.upsert_note(null, null, :'v_question_id', null, 'edição do dispositivo 2', :'v_note_base')->>'conflict')::boolean as v_conflict_2 \gset
select is(:'v_conflict_2'::boolean, true, 'dispositivo 2 com base desatualizada é detectado como conflito real');

select is(
  (select note_text from public.notes where user_id = :'v_user_a' and question_id = :'v_question_id'),
  'edição do dispositivo 1',
  'a escrita do dispositivo 2 NÃO foi aplicada silenciosamente — texto do dispositivo 1 preservado'
);

-- MUDANÇA DE COMPORTAMENTO no Prompt 07-E3 (ver migration
-- 20260909150000_conflict_serialization_07e3.sql): reenviar com base
-- desconhecida (null) NÃO sobrescreve mais silenciosamente quando a linha já
-- existe com texto diferente — esse era exatamente o buraco que permitia
-- duas primeiras criações concorrentes da mesma nota (ambas com base null,
-- por definição) apagarem uma à outra sem detecção nenhuma. Agora é tratado
-- como conflito real, igual ao caso de base desatualizada.
select ((public.upsert_note(null, null, :'v_question_id', null, 'sem base conhecida', null))->>'conflict')::boolean as v_conflict_3 \gset
select is(:'v_conflict_3'::boolean, true, 'sem base conhecida (null) e texto existente diferente é detectado como conflito (07-E3) — nunca mais sobrescreve às cegas');

-- Sem base conhecida, mas o texto é IGUAL ao que já está salvo: não é um
-- conflito real (nada muda), só um no-op idempotente.
select ((public.upsert_note(null, null, :'v_question_id', null, 'edição do dispositivo 1', null))->>'conflict')::boolean as v_conflict_4 \gset
select is(:'v_conflict_4'::boolean, false, 'sem base conhecida, mas texto igual ao existente: não é conflito (no-op idempotente)');

select tests.clear_auth();

select * from finish();
