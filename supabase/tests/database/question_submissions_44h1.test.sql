-- ============================================================================
-- 44-H1 — Envio de questões pelo site
-- Tabela `question_submissions` (P6, 03/10: só o admin envia): o admin ativo envia
-- o texto de um lote de questões (.md) e ele fica guardado como "envio", com
-- estado, visível só para quem enviou e para admin. Usuário comum não cria nem
-- reenvia, mas continua lendo os envios que já fez. Nada aqui revisa nem publica questão nem toca
-- `questions`. Fila irmã da `material_submissions` (44-E): mesmas regras.
-- Um teste por regra (RLS, grants, limite de volume).
-- ============================================================================

-- Self-contido: `supabase test db` roda os arquivos em ordem alfabética, e cada
-- arquivo redefine os helpers de que precisa (idempotente).
create extension if not exists pgtap;
create schema if not exists tests;

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
  update public.profiles set role = p_role, status = p_status where id = v_id;
  return v_id;
end;
$$;

create or replace function tests.authenticate_as(p_uid uuid)
returns void
language plpgsql
as $$
begin
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

grant usage on schema tests to anon, authenticated;

-- Quantas linhas um comando alterou, com o papel atual (RLS que filtra a linha
-- não dá erro: o comando "não acha" a linha e altera zero).
create or replace function tests.affected_rows(p_sql text)
returns int
language plpgsql
as $$
declare
  v_n int;
begin
  execute p_sql;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

select plan(73);

select tests.clear_auth();
select tests.create_user('qsub.admin@test.local', 'admin', 'active') as v_admin \gset
select tests.create_user('qsub.a@test.local', 'admin', 'active') as v_a \gset
select tests.create_user('qsub.b@test.local', 'student', 'active') as v_b \gset
select tests.create_user('qsub.c@test.local', 'admin', 'active') as v_c \gset
select tests.create_user('qsub.rev@test.local', 'student', 'active') as v_rev \gset
select tests.create_user('qsub.pend@test.local', 'student', 'active') as v_pend \gset
select tests.create_user('qsub.block@test.local', 'student', 'active') as v_block \gset
select tests.create_user('qsub.lim@test.local', 'admin', 'active') as v_lim \gset
select tests.create_user('qsub.ok3@test.local', 'admin', 'active') as v_ok3 \gset
select tests.create_user('qsub.big@test.local', 'admin', 'active') as v_big \gset
select tests.create_user('qsub.mat@test.local', 'admin', 'active') as v_mat \gset
select tests.create_user('qsub.s@test.local', 'student', 'active') as v_s \gset

insert into public.disciplines (name, code, cycle)
values ('Disciplina Envio Q', 'ENQ-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_disc \gset
insert into public.themes (discipline_id, name) values (:'v_disc', 'Tema Envio Q') returning id as v_theme \gset

-- Um material publicado e um rascunho (fixtures, como postgres).
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Material publicado do envio de questões') returning id as v_pub \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_pub', 0, 'S', 'C.');
update public.materials set status = 'published' where id = :'v_pub';
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Rascunho do envio de questões') returning id as v_draft \gset

-- Envios semeados como postgres (o servidor da 44-H2 fará o mesmo caminho).
insert into public.question_submissions (author_id, title, content_md, status)
values (:'v_b', 'Lote do B', '## Questão 1', 'aguardando_revisao') returning id as v_sub_b \gset
insert into public.question_submissions (author_id, title, content_md, status)
values (:'v_rev', 'Em revisão do R', '## Questão 1', 'em_revisao') returning id as v_sub_a_rev \gset
insert into public.question_submissions (author_id, title, content_md, status)
values (:'v_a', 'A apto', '## Questão 1', 'apto') returning id as v_sub_a_apto \gset
insert into public.question_submissions (author_id, title, content_md, status)
values (:'v_a', 'A publicado', '## Questão 1', 'publicado') returning id as v_sub_a_pub \gset
insert into public.question_submissions (author_id, title, content_md, status)
values (:'v_a', 'A não apto', '## Questão 1', 'nao_apto') returning id as v_sub_a_nao \gset
insert into public.question_submissions (author_id, title, content_md, status)
values (:'v_a', 'A erro', '## Questão 1', 'erro') returning id as v_sub_a_erro \gset
insert into public.question_submissions (author_id, title, content_md, status)
values (:'v_pend', 'Do pendente', '## Questão 1', 'aguardando_revisao') returning id as v_sub_pend \gset
insert into public.question_submissions (author_id, title, content_md, status)
values (:'v_block', 'Do bloqueado', '## Questão 1', 'nao_apto') returning id as v_sub_block \gset
-- Usuário comum (não admin): os envios dele já existem (feitos antes da P6) e continuam dele.
insert into public.question_submissions (author_id, title, content_md, status)
values (:'v_s', 'Do S aguardando', '## Questão 1', 'aguardando_revisao') returning id as v_sub_s_ag \gset
insert into public.question_submissions (author_id, title, content_md, status)
values (:'v_s', 'Do S não apto', '## Questão 1', 'nao_apto') returning id as v_sub_s_nao \gset
-- Só depois do envio o usuário deixa de ser ativo.
update public.profiles set status = 'pending' where id = :'v_pend';
update public.profiles set status = 'blocked' where id = :'v_block';

-- ---------------------------------------------------------------------------
-- 1. Estrutura, grants e funções
-- ---------------------------------------------------------------------------
select has_table('public', 'question_submissions', 'tabela de envios de questões existe');
select ok(not has_table_privilege('anon', 'public.question_submissions', 'select'), 'anon não lê envios de questões');
select ok(not has_table_privilege('anon', 'public.question_submissions', 'insert'), 'anon não insere envios de questões');
select ok(not has_table_privilege('authenticated', 'public.question_submissions', 'delete'), 'usuário não apaga envio');
select ok(not has_column_privilege('authenticated', 'public.question_submissions', 'status', 'update'), 'usuário não atualiza o estado');
select ok(not has_column_privilege('authenticated', 'public.question_submissions', 'author_id', 'update'), 'usuário não atualiza o autor');
select ok(not has_column_privilege('authenticated', 'public.question_submissions', 'status', 'insert'), 'usuário não define o estado ao inserir');
select ok(not has_column_privilege('authenticated', 'public.question_submissions', 'author_id', 'insert'), 'usuário não define o autor ao inserir');
select ok(has_column_privilege('authenticated', 'public.question_submissions', 'material_ids', 'insert'), 'usuário escolhe os materiais ao inserir');
select ok(not has_function_privilege('anon', 'app.question_submissions_before_write()', 'execute'), 'anon não executa a função do gatilho');
select ok(not has_function_privilege('anon', 'app.check_question_submission_refs(uuid[])', 'execute'), 'anon não executa a conferência dos materiais');
select ok(not has_function_privilege('anon', 'app.question_submission_waiting_count(uuid, uuid)', 'execute'), 'anon não executa a contagem de envios em espera');
select ok(not has_function_privilege('authenticated', 'app.question_submissions_before_write()', 'execute'), 'a função do gatilho não é chamável por usuário');

-- ---------------------------------------------------------------------------
-- 2. Inserção: só como autor de si mesmo e só no estado inicial
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'v_a');
select lives_ok(
  $$ insert into public.question_submissions (title, content_md) values ('Primeiro lote do A', '## Questão 1') $$,
  'admin ativo envia um lote de questões'
);
select results_eq(
  format($$ select author_id::text, status from public.question_submissions where title = 'Primeiro lote do A' and author_id = %L $$, :'v_a'),
  format($$ values (%L::text, 'aguardando_revisao'::text) $$, :'v_a'),
  'o autor é quem enviou e o estado nasce "aguardando revisão"'
);
select throws_ok(
  format($$ insert into public.question_submissions (author_id, title, content_md) values (%L, 'Em nome do B', '## Questão 1') $$, :'v_b'),
  '42501', NULL, 'não dá para enviar em nome de outra pessoa (autor vindo do cliente)'
);
select throws_ok(
  $$ insert into public.question_submissions (title, content_md, status) values ('Já apto', '## Questão 1', 'apto') $$,
  '42501', NULL, 'não dá para inserir já em outro estado'
);
select throws_ok(
  $$ insert into public.question_submissions (title, content_md) values ('', '## Questão 1') $$,
  '23514', NULL, 'título vazio é recusado'
);
select throws_ok(
  $$ insert into public.question_submissions (title, content_md) values ('Sem texto', '') $$,
  '23514', NULL, 'texto vazio é recusado'
);
select tests.clear_auth();

select tests.authenticate_as(:'v_s');
select throws_ok(
  $$ insert into public.question_submissions (title, content_md) values ('Do S novo', '## Questão 1') $$,
  '42501', NULL, 'P6: usuário ativo que não é admin não envia'
);
select tests.clear_auth();

select tests.authenticate_as(:'v_pend');
select throws_ok(
  $$ insert into public.question_submissions (title, content_md) values ('Do pendente 2', '## Questão 1') $$,
  '42501', NULL, 'usuário pendente não envia'
);
select tests.clear_auth();
select tests.authenticate_as(:'v_block');
select throws_ok(
  $$ insert into public.question_submissions (title, content_md) values ('Do bloqueado 2', '## Questão 1') $$,
  '42501', NULL, 'usuário bloqueado não envia'
);
select tests.clear_auth();
select tests.authenticate_as_anon();
select throws_ok(
  $$ insert into public.question_submissions (title, content_md) values ('Anônimo', '## Questão 1') $$,
  '42501', NULL, 'anon não envia'
);
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 3. Materiais escolhidos: publicados, até 10
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'v_mat');
select lives_ok(
  format($$ insert into public.question_submissions (title, content_md, material_ids) values ('Com material publicado', '## Questão 1', array[%L]::uuid[]) $$, :'v_pub'),
  'material publicado é aceito'
);
select is(
  (select material_ids from public.question_submissions where title = 'Com material publicado' and author_id = :'v_mat'),
  array[:'v_pub']::uuid[],
  'e fica guardado no envio'
);
select throws_ok(
  format($$ insert into public.question_submissions (title, content_md, material_ids) values ('Com rascunho', '## Questão 1', array[%L]::uuid[]) $$, :'v_draft'),
  'P0001', 'os materiais escolhidos precisam estar publicados', 'material em rascunho é recusado'
);
select throws_ok(
  $$ insert into public.question_submissions (title, content_md, material_ids) values ('Com material que não existe', '## Questão 1', array[gen_random_uuid()]) $$,
  'P0001', 'os materiais escolhidos precisam estar publicados', 'material que não existe é recusado'
);
select throws_ok(
  format($$ insert into public.question_submissions (title, content_md, material_ids) values ('Um bom e um rascunho', '## Questão 1', array[%L, %L]::uuid[]) $$, :'v_pub', :'v_draft'),
  'P0001', NULL, 'um material ruim entre os bons recusa o envio'
);
select throws_ok(
  format($$ insert into public.question_submissions (title, content_md, material_ids) values ('Materiais demais', '## Questão 1', array_fill(%L::uuid, array[11])) $$, :'v_pub'),
  '23514', NULL, 'mais de 10 materiais é recusado'
);
select tests.clear_auth();
select tests.authenticate_as(:'v_mat');
select throws_ok(
  format($$ update public.question_submissions set material_ids = array[%L]::uuid[] where title = 'Com material publicado' and author_id = %L $$, :'v_draft', :'v_mat'),
  'P0001', NULL, 'substituir os materiais por um rascunho também é recusado'
);
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 4. Leitura: o próprio autor e admin; ninguém mais
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'v_s');
select is(
  (select count(*)::int from public.question_submissions where author_id in (:'v_a', :'v_b', :'v_c', :'v_s', :'v_rev', :'v_pend', :'v_block')),
  2,
  'S (não admin) continua vendo os 2 envios que são dele e nenhum dos outros'
);
select is((select count(*)::int from public.question_submissions where id = :'v_sub_b'), 0, 'S não vê o envio do B');
select tests.clear_auth();

select tests.authenticate_as(:'v_b');
select results_eq(
  format($$ select id::text from public.question_submissions where author_id in (%L, %L) order by id $$, :'v_a', :'v_b'),
  format($$ values (%L::text) $$, :'v_sub_b'),
  'B vê só o próprio envio'
);
select tests.clear_auth();

select tests.authenticate_as(:'v_admin');
select is(
  (select count(*)::int from public.question_submissions where author_id in (:'v_a', :'v_b', :'v_c', :'v_rev', :'v_pend', :'v_block')),
  9,
  'admin ativo vê todos os envios (5 do A e 1 de cada um dos outros 4)'
);
select tests.clear_auth();

select tests.authenticate_as(:'v_pend');
select is((select count(*)::int from public.question_submissions), 0, 'usuário pendente não lê nem o próprio envio');
select tests.clear_auth();
select tests.authenticate_as(:'v_block');
select is((select count(*)::int from public.question_submissions), 0, 'usuário bloqueado não lê nem o próprio envio');
select tests.clear_auth();
select tests.authenticate_as_anon();
select throws_ok($$ select count(*) from public.question_submissions $$, '42501', NULL, 'anon não lê envios (sem privilégio)');
select tests.clear_auth();

select tests.create_user('qsub.admin.bloq@test.local', 'admin', 'blocked') as v_admin_bloq \gset
select tests.authenticate_as(:'v_admin_bloq');
select is((select count(*)::int from public.question_submissions), 0, 'admin bloqueado não lê envios');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 5. Alteração: só o texto do próprio envio, e só em não apto / erro / aguardando
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'v_a');
select is(
  tests.affected_rows(format($$ update public.question_submissions set content_md = '## Questão 1 novo' where id = %L $$, :'v_sub_a_nao')),
  1, 'A substitui o texto do envio "não apto"'
);
select is((select status from public.question_submissions where id = :'v_sub_a_nao'), 'aguardando_revisao', 'e o envio volta a "aguardando revisão"');
select is(
  tests.affected_rows(format($$ update public.question_submissions set content_md = '## Questão 1 novo 2' where id = %L $$, :'v_sub_a_erro')),
  1, 'A substitui o texto do envio em "erro"'
);
select is((select status from public.question_submissions where id = :'v_sub_a_erro'), 'aguardando_revisao', 'e ele também volta a "aguardando revisão"');
select is(
  tests.affected_rows(format($$ update public.question_submissions set content_md = '## Questão 1 outro' where title = 'Primeiro lote do A' and author_id = %L $$, :'v_a')),
  1, 'A substitui o texto do envio "aguardando revisão"'
);
select is(
  tests.affected_rows(format($$ update public.question_submissions set content_md = 'x' where id = %L $$, :'v_sub_a_apto')),
  0, 'A não altera envio "apto"'
);
select is(
  tests.affected_rows(format($$ update public.question_submissions set content_md = 'x' where id = %L $$, :'v_sub_a_pub')),
  0, 'A não altera envio "publicado"'
);
select throws_ok(
  format($$ update public.question_submissions set status = 'apto' where id = %L $$, :'v_sub_a_erro'),
  '42501', NULL, 'usuário não muda o estado'
);
select throws_ok(
  format($$ update public.question_submissions set author_id = %L where id = %L $$, :'v_b', :'v_sub_a_erro'),
  '42501', NULL, 'usuário não muda o autor'
);
select is(
  tests.affected_rows(format($$ update public.question_submissions set content_md = 'x' where id = %L $$, :'v_sub_b')),
  0, 'A não altera o envio do B'
);
select throws_ok(
  format($$ delete from public.question_submissions where id = %L $$, :'v_sub_a_erro'),
  '42501', NULL, 'usuário não apaga envio'
);
select tests.clear_auth();

select tests.authenticate_as(:'v_s');
select is(
  tests.affected_rows(format($$ update public.question_submissions set content_md = '## reenvio' where id = %L $$, :'v_sub_s_nao')),
  0, 'P6: quem não é admin não reenvia nem o próprio envio "não apto"'
);
select is((select status from public.question_submissions where id = :'v_sub_s_nao'), 'nao_apto', 'e o envio dele fica como estava');
select tests.clear_auth();

select tests.authenticate_as(:'v_rev');
select is(
  tests.affected_rows(format($$ update public.question_submissions set content_md = 'x' where id = %L $$, :'v_sub_a_rev')),
  0, 'o autor não altera o próprio envio "em revisão"'
);
select tests.clear_auth();
select tests.authenticate_as(:'v_pend');
select is(
  tests.affected_rows(format($$ update public.question_submissions set content_md = 'x' where id = %L $$, :'v_sub_pend')),
  0, 'usuário pendente não altera o próprio envio'
);
select tests.clear_auth();
select tests.authenticate_as(:'v_block');
select is(
  tests.affected_rows(format($$ update public.question_submissions set content_md = 'x' where id = %L $$, :'v_sub_block')),
  0, 'usuário bloqueado não altera o próprio envio'
);
select tests.clear_auth();
select tests.authenticate_as(:'v_admin');
select is(
  tests.affected_rows(format($$ update public.question_submissions set content_md = 'x' where id = %L $$, :'v_sub_b')),
  0, 'admin não altera envio de outra pessoa (só leitura nesta unidade)'
);
select tests.clear_auth();

-- O servidor (44-H2) muda o estado como service_role/postgres: o banco não o impede.
select lives_ok(
  format($$ update public.question_submissions set status = 'em_revisao' where id = %L $$, :'v_sub_b'),
  'papel de servidor muda o estado'
);
select is((select status from public.question_submissions where id = :'v_sub_b'), 'em_revisao', 'e o estado fica como o servidor pôs');

-- ---------------------------------------------------------------------------
-- 6. Limite de volume: 3 esperando revisão por pessoa, 300 KB por texto
-- ---------------------------------------------------------------------------
insert into public.question_submissions (author_id, title, content_md, status)
select :'v_lim', 'Espera ' || g, '## Questão 1', case when g = 3 then 'em_revisao' else 'aguardando_revisao' end
from generate_series(1, 3) g;
insert into public.question_submissions (author_id, title, content_md, status)
values (:'v_lim', 'Não apto do lim', '## Questão 1', 'nao_apto') returning id as v_lim_nao \gset

select tests.authenticate_as(:'v_lim');
select lives_ok(
  $$ insert into public.question_submissions (title, content_md) values ('Quarto', '## Questão 1') $$,
  'P7: o admin não tem limite de envios esperando: o 4º é aceito'
);
select lives_ok(
  format($$ update public.question_submissions set content_md = '## de novo' where id = %L $$, :'v_lim_nao'),
  'P7: reenviar um "não apto" também não é barrado para o admin'
);
select tests.clear_auth();

-- O limite conta só quem espera; apto, publicado, não apto e erro não contam.
insert into public.question_submissions (author_id, title, content_md, status)
select :'v_ok3', 'Fora da fila ' || s, '## Questão 1', s
from unnest(array['apto', 'publicado', 'nao_apto', 'erro', 'apto']) s;
select tests.authenticate_as(:'v_ok3');
select lives_ok(
  $$ insert into public.question_submissions (title, content_md)
     select 'Espera ' || g, '## Questão 1' from generate_series(1, 3) g $$,
  'quem tem só envios fora da fila envia 3 de uma vez'
);
select lives_ok(
  $$ insert into public.question_submissions (title, content_md) values ('Quarto do ok3', '## Questão 1') $$,
  'P7: o 4º do admin também é aceito'
);
select tests.clear_auth();

-- P7: o limite de 3 esperando (fila única, material + questões) continua valendo para quem não é admin.
select tests.create_user('qsub.legado@test.local', 'student', 'active') as v_leg \gset
insert into public.question_submissions (author_id, title, content_md)
select :'v_leg', 'Lote legado ' || g, '## Questão 1' from generate_series(1, 3) g;
select throws_ok(
  format($$ insert into public.question_submissions (author_id, title, content_md) values (%L, 'Quarto legado', '## Questão 1') $$, :'v_leg'),
  'P0001', NULL, 'P7: quem não é admin continua limitado a 3 esperando (questões)'
);
select throws_ok(
  format($$ insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md) values (%L, 'Material legado', %L, %L, '# m') $$, :'v_leg', :'v_disc', :'v_theme'),
  'P0001', NULL, 'P7: e a fila é uma só: 3 lotes esperando travam também o material de quem não é admin'
);

-- O servidor devolve um envio da fila ao fim da revisão: libera vaga.
update public.question_submissions set status = 'apto' where author_id = :'v_lim' and title = 'Espera 1';
select tests.authenticate_as(:'v_lim');
select lives_ok(
  $$ insert into public.question_submissions (title, content_md) values ('Cabe de novo', '## Questão 1') $$,
  'ao sair um da fila, cabe outro'
);
select tests.clear_auth();

-- 44-H2: a fila é UMA só por pessoa: 3 esperando, somando material e questões.
select tests.create_user('qsub.irmas@test.local', 'admin', 'active') as v_irmas \gset
insert into public.question_submissions (author_id, title, content_md)
select :'v_irmas', 'Lote esperando ' || g, '## Questão 1' from generate_series(1, 3) g;
select tests.authenticate_as(:'v_irmas');
select lives_ok(
  format($$ insert into public.material_submissions (title, discipline_id, theme_id, content_md) values ('Material com 3 lotes de questões esperando', %L, %L, '# m') $$, :'v_disc', :'v_theme'),
  'P7: 3 lotes de questões esperando não travam o envio de material do admin'
);
select tests.clear_auth();
select tests.create_user('qsub.irmas2@test.local', 'admin', 'active') as v_irmas2 \gset
insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md)
select :'v_irmas2', 'Material esperando ' || g, :'v_disc', :'v_theme', '# m' from generate_series(1, 3) g;
select tests.authenticate_as(:'v_irmas2');
select lives_ok(
  $$ insert into public.question_submissions (title, content_md) values ('Lote com 3 materiais esperando', '## Questão 1') $$,
  'P7: 3 materiais esperando não travam o envio de questões do admin'
);
select tests.clear_auth();
select tests.create_user('qsub.mista@test.local', 'admin', 'active') as v_mista \gset
insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md)
select :'v_mista', 'Material misto ' || g, :'v_disc', :'v_theme', '# m' from generate_series(1, 2) g;
insert into public.question_submissions (author_id, title, content_md) values (:'v_mista', 'Lote misto', '## Questão 1');
select tests.authenticate_as(:'v_mista');
select lives_ok(
  $$ insert into public.question_submissions (title, content_md) values ('O quarto, de outro tipo', '## Questão 1') $$,
  'P7: 2 materiais + 1 lote esperando: o 4º envio do admin, de qualquer tipo, é aceito'
);
select tests.clear_auth();

-- Tamanho: até 300 KB (307200 bytes), contados em bytes, não em caracteres.
select tests.authenticate_as(:'v_big');
select lives_ok(
  $$ insert into public.question_submissions (title, content_md) values ('No limite', repeat('a', 307200)) $$,
  'texto de exatamente 300 KB é aceito'
);
select throws_ok(
  $$ insert into public.question_submissions (title, content_md) values ('Passou 1', repeat('a', 307201)) $$,
  '23514', NULL, 'texto de 300 KB + 1 byte é recusado'
);
select throws_ok(
  $$ insert into public.question_submissions (title, content_md) values ('Passou 2', repeat('é', 153601)) $$,
  '23514', NULL, 'o limite conta bytes: 153601 letras acentuadas passam de 300 KB'
);
select throws_ok(
  format($$ update public.question_submissions set content_md = repeat('a', 307201) where title = 'No limite' and author_id = %L $$, :'v_big'),
  '23514', NULL, 'substituir o texto por um maior que 300 KB também é recusado'
);
select tests.clear_auth();

-- Apagar o usuário leva os envios junto (limpeza dos testes de tela não precisa de ordem).
select lives_ok(
  format($$ delete from auth.users where id = %L $$, :'v_big'),
  'excluir o autor exclui os envios dele'
);
select is((select count(*)::int from public.question_submissions where author_id = :'v_big'), 0, 'nenhum envio sobra do autor excluído');

select * from finish();
