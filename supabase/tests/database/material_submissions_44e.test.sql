-- ============================================================================
-- 44-E — Envio de material pelo site
-- Tabela `material_submissions`: qualquer usuário ativo envia o texto de um
-- material (.md) e ele fica guardado como "envio", com estado, visível só para
-- quem enviou e para admin. Nada aqui publica material nem toca `materials`.
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

-- Para o teste ter um material publicado (mesmos helpers de content_provenance_attestation).
create or replace function tests.approve_material_revision(p_material_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid;
  v_snapshot jsonb;
  v_hash text;
  v_next_number int;
  v_revision_id uuid;
begin
  select id into v_admin from public.profiles where role = 'admin' and status = 'active' limit 1;
  if v_admin is null then
    raise exception 'tests.approve_material_revision: nenhum admin ativo encontrado para autoria de fixture';
  end if;

  v_snapshot := app.build_material_snapshot(p_material_id);
  v_hash := encode(extensions.digest(v_snapshot::text, 'sha256'), 'hex');
  select coalesce(max(revision_number), 0) + 1 into v_next_number
    from public.content_revisions where material_id = p_material_id;

  insert into public.content_revisions (material_id, revision_number, snapshot, snapshot_hash, created_by, policy_version)
  values (p_material_id, v_next_number, v_snapshot, v_hash, v_admin, 'v1')
  returning id into v_revision_id;

  insert into public.content_reviews (content_revision_id, reviewer_user_id, decision, checklist, policy_version, revision_hash)
  values (v_revision_id, v_admin, 'aprovado', '{"fixture": true}'::jsonb, 'v1', v_hash);

  return v_revision_id;
end;
$$;

create or replace function tests.force_publish_material(p_material_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform tests.approve_material_revision(p_material_id);
  update public.materials set status = 'published' where id = p_material_id;
end;
$$;

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

select plan(60);

select tests.clear_auth();
select tests.create_user('sub.admin@test.local', 'admin', 'active') as v_admin \gset
select tests.create_user('sub.a@test.local', 'student', 'active') as v_a \gset
select tests.create_user('sub.b@test.local', 'student', 'active') as v_b \gset
select tests.create_user('sub.c@test.local', 'student', 'active') as v_c \gset
select tests.create_user('sub.rev@test.local', 'student', 'active') as v_rev \gset
select tests.create_user('sub.pend@test.local', 'student', 'active') as v_pend \gset
select tests.create_user('sub.block@test.local', 'student', 'active') as v_block \gset
select tests.create_user('sub.lim@test.local', 'student', 'active') as v_lim \gset
select tests.create_user('sub.ok3@test.local', 'student', 'active') as v_ok3 \gset
select tests.create_user('sub.big@test.local', 'student', 'active') as v_big \gset

insert into public.disciplines (name, code, cycle)
values ('Disciplina Envio', 'ENV-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_disc \gset
insert into public.themes (discipline_id, name) values (:'v_disc', 'Tema Envio') returning id as v_theme \gset
insert into public.disciplines (name, code, cycle)
values ('Outra Disciplina Envio', 'ENO-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_disc2 \gset
insert into public.themes (discipline_id, name) values (:'v_disc2', 'Outro Tema Envio') returning id as v_theme2 \gset

insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Material publicado do envio') returning id as v_pub \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_pub', 0, 'S', 'C.');
select tests.force_publish_material(:'v_pub');
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Rascunho do envio') returning id as v_draft \gset

-- Envios semeados como postgres (o servidor da 44-F fará o mesmo caminho).
insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md, status)
values (:'v_b', 'Envio do B', :'v_disc', :'v_theme', '# B', 'aguardando_revisao') returning id as v_sub_b \gset
insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md, status)
values (:'v_rev', 'Em revisão do R', :'v_disc', :'v_theme', '# em revisão', 'em_revisao') returning id as v_sub_a_rev \gset
insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md, status)
values (:'v_a', 'A apto', :'v_disc', :'v_theme', '# apto', 'apto') returning id as v_sub_a_apto \gset
insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md, status)
values (:'v_a', 'A publicado', :'v_disc', :'v_theme', '# publicado', 'publicado') returning id as v_sub_a_pub \gset
insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md, status)
values (:'v_a', 'A não apto', :'v_disc', :'v_theme', '# não apto', 'nao_apto') returning id as v_sub_a_nao \gset
insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md, status)
values (:'v_a', 'A erro', :'v_disc', :'v_theme', '# erro', 'erro') returning id as v_sub_a_erro \gset
insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md, status)
values (:'v_pend', 'Do pendente', :'v_disc', :'v_theme', '# p', 'aguardando_revisao') returning id as v_sub_pend \gset
insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md, status)
values (:'v_block', 'Do bloqueado', :'v_disc', :'v_theme', '# k', 'nao_apto') returning id as v_sub_block \gset
-- Só depois do envio o usuário deixa de ser ativo.
update public.profiles set status = 'pending' where id = :'v_pend';
update public.profiles set status = 'blocked' where id = :'v_block';

-- ---------------------------------------------------------------------------
-- 1. Estrutura, grants e funções
-- ---------------------------------------------------------------------------
select has_table('public', 'material_submissions', 'tabela de envios existe');
select ok(not has_table_privilege('anon', 'public.material_submissions', 'select'), 'anon não lê envios');
select ok(not has_table_privilege('anon', 'public.material_submissions', 'insert'), 'anon não insere envios');
select ok(not has_table_privilege('authenticated', 'public.material_submissions', 'delete'), 'usuário não apaga envio');
select ok(not has_column_privilege('authenticated', 'public.material_submissions', 'status', 'update'), 'usuário não atualiza o estado');
select ok(not has_column_privilege('authenticated', 'public.material_submissions', 'author_id', 'update'), 'usuário não atualiza o autor');
select ok(not has_column_privilege('authenticated', 'public.material_submissions', 'status', 'insert'), 'usuário não define o estado ao inserir');
select ok(not has_column_privilege('authenticated', 'public.material_submissions', 'author_id', 'insert'), 'usuário não define o autor ao inserir');
select ok(not has_function_privilege('anon', 'app.material_submissions_before_write()', 'execute'), 'anon não executa a função do gatilho');
select ok(not has_function_privilege('anon', 'app.check_submission_refs(uuid, uuid, uuid)', 'execute'), 'anon não executa a conferência de tema e pai');
select ok(not has_function_privilege('anon', 'app.submission_waiting_count(uuid, uuid)', 'execute'), 'anon não executa a contagem de envios em espera');
select ok(not has_function_privilege('authenticated', 'app.material_submissions_before_write()', 'execute'), 'a função do gatilho não é chamável por usuário');

-- ---------------------------------------------------------------------------
-- 2. Inserção: só como autor de si mesmo e só no estado inicial
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'v_a');
select lives_ok(
  format($$ insert into public.material_submissions (title, discipline_id, theme_id, content_md) values ('Primeiro do A', %L, %L, '# Primeiro') $$, :'v_disc', :'v_theme'),
  'usuário ativo envia um material'
);
select results_eq(
  $$ select author_id::text, status from public.material_submissions where title = 'Primeiro do A' $$,
  format($$ values (%L::text, 'aguardando_revisao'::text) $$, :'v_a'),
  'o autor é quem enviou e o estado nasce "aguardando revisão"'
);
select throws_ok(
  format($$ insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md) values (%L, 'Em nome do B', %L, %L, '# x') $$, :'v_b', :'v_disc', :'v_theme'),
  '42501', NULL, 'não dá para enviar em nome de outra pessoa (autor vindo do cliente)'
);
select throws_ok(
  format($$ insert into public.material_submissions (title, discipline_id, theme_id, content_md, status) values ('Já apto', %L, %L, '# x', 'apto') $$, :'v_disc', :'v_theme'),
  '42501', NULL, 'não dá para inserir já em outro estado'
);
select tests.clear_auth();
select tests.authenticate_as(:'v_c');
select throws_ok(
  format($$ insert into public.material_submissions (title, discipline_id, theme_id, content_md) values ('Tema trocado', %L, %L, '# x') $$, :'v_disc', :'v_theme2'),
  NULL::char(5), NULL::text, 'o Tema precisa ser da Disciplina'
);
select throws_ok(
  format($$ insert into public.material_submissions (title, discipline_id, theme_id, parent_material_id, content_md) values ('Pai rascunho', %L, %L, %L, '# x') $$, :'v_disc', :'v_theme', :'v_draft'),
  NULL::char(5), NULL::text, 'o material acima precisa estar publicado'
);
select lives_ok(
  format($$ insert into public.material_submissions (title, discipline_id, theme_id, parent_material_id, content_md) values ('Com pai publicado', %L, %L, %L, '# x') $$, :'v_disc', :'v_theme', :'v_pub'),
  'o material acima, quando publicado, é aceito'
);
select throws_ok(
  format($$ insert into public.material_submissions (title, discipline_id, theme_id, content_md) values ('', %L, %L, '# x') $$, :'v_disc', :'v_theme'),
  '23514', NULL, 'título vazio é recusado'
);
select throws_ok(
  format($$ insert into public.material_submissions (title, discipline_id, theme_id, content_md) values ('Sem texto', %L, %L, '') $$, :'v_disc', :'v_theme'),
  '23514', NULL, 'texto vazio é recusado'
);
select tests.clear_auth();

select tests.authenticate_as(:'v_pend');
select throws_ok(
  format($$ insert into public.material_submissions (title, discipline_id, theme_id, content_md) values ('Do pendente 2', %L, %L, '# x') $$, :'v_disc', :'v_theme'),
  '42501', NULL, 'usuário pendente não envia'
);
select tests.clear_auth();
select tests.authenticate_as(:'v_block');
select throws_ok(
  format($$ insert into public.material_submissions (title, discipline_id, theme_id, content_md) values ('Do bloqueado 2', %L, %L, '# x') $$, :'v_disc', :'v_theme'),
  '42501', NULL, 'usuário bloqueado não envia'
);
select tests.clear_auth();
select tests.authenticate_as_anon();
select throws_ok(
  format($$ insert into public.material_submissions (title, discipline_id, theme_id, content_md) values ('Anônimo', %L, %L, '# x') $$, :'v_disc', :'v_theme'),
  '42501', NULL, 'anon não envia'
);
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 3. Leitura: o próprio autor e admin; ninguém mais
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'v_a');
select is(
  (select count(*)::int from public.material_submissions where author_id in (:'v_a', :'v_b', :'v_c', :'v_rev', :'v_pend', :'v_block')),
  5,
  'A vê os 5 envios que são dele (4 semeados + 1 pela API) e nenhum dos outros'
);
select is((select count(*)::int from public.material_submissions where id = :'v_sub_b'), 0, 'A não vê o envio do B');
select tests.clear_auth();

select tests.authenticate_as(:'v_b');
select results_eq(
  format($$ select id::text from public.material_submissions where author_id in (%L, %L) order by id $$, :'v_a', :'v_b'),
  format($$ values (%L::text) $$, :'v_sub_b'),
  'B vê só o próprio envio'
);
select tests.clear_auth();

select tests.authenticate_as(:'v_admin');
select is(
  (select count(*)::int from public.material_submissions where author_id in (:'v_a', :'v_b', :'v_c', :'v_rev', :'v_pend', :'v_block')),
  10,
  'admin ativo vê todos os envios (10 dos 6 autores: 5 do A, 1 de cada um dos outros)'
);
select tests.clear_auth();

select tests.authenticate_as(:'v_pend');
select is((select count(*)::int from public.material_submissions), 0, 'usuário pendente não lê nem o próprio envio');
select tests.clear_auth();
select tests.authenticate_as(:'v_block');
select is((select count(*)::int from public.material_submissions), 0, 'usuário bloqueado não lê nem o próprio envio');
select tests.clear_auth();
select tests.authenticate_as_anon();
select throws_ok($$ select count(*) from public.material_submissions $$, '42501', NULL, 'anon não lê envios (sem privilégio)');
select tests.clear_auth();

-- Um admin que deixou de ser ativo perde a leitura de todos.
select tests.create_user('sub.admin.bloq@test.local', 'admin', 'blocked') as v_admin_bloq \gset
select tests.authenticate_as(:'v_admin_bloq');
select is((select count(*)::int from public.material_submissions), 0, 'admin bloqueado não lê envios');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 4. Alteração: só o texto do próprio envio, e só em não apto / erro / aguardando
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'v_a');
select is(
  tests.affected_rows(format($$ update public.material_submissions set content_md = '# novo texto' where id = %L $$, :'v_sub_a_nao')),
  1, 'A substitui o texto do envio "não apto"'
);
select is((select status from public.material_submissions where id = :'v_sub_a_nao'), 'aguardando_revisao', 'e o envio volta a "aguardando revisão"');
select is(
  tests.affected_rows(format($$ update public.material_submissions set content_md = '# novo texto 2' where id = %L $$, :'v_sub_a_erro')),
  1, 'A substitui o texto do envio em "erro"'
);
select is((select status from public.material_submissions where id = :'v_sub_a_erro'), 'aguardando_revisao', 'e ele também volta a "aguardando revisão"');
select is(
  tests.affected_rows(format($$ update public.material_submissions set content_md = '# outro texto' where title = 'Primeiro do A' and author_id = %L $$, :'v_a')),
  1, 'A substitui o texto do envio "aguardando revisão"'
);
select is(
  tests.affected_rows(format($$ update public.material_submissions set content_md = 'x' where id = %L $$, :'v_sub_a_apto')),
  0, 'A não altera envio "apto"'
);
select is(
  tests.affected_rows(format($$ update public.material_submissions set content_md = 'x' where id = %L $$, :'v_sub_a_pub')),
  0, 'A não altera envio "publicado"'
);
select throws_ok(
  format($$ update public.material_submissions set status = 'apto' where id = %L $$, :'v_sub_a_erro'),
  '42501', NULL, 'usuário não muda o estado'
);
select throws_ok(
  format($$ update public.material_submissions set author_id = %L where id = %L $$, :'v_b', :'v_sub_a_erro'),
  '42501', NULL, 'usuário não muda o autor'
);
select is(
  tests.affected_rows(format($$ update public.material_submissions set content_md = 'x' where id = %L $$, :'v_sub_b')),
  0, 'A não altera o envio do B'
);
select throws_ok(
  format($$ delete from public.material_submissions where id = %L $$, :'v_sub_a_erro'),
  '42501', NULL, 'usuário não apaga envio'
);
select tests.clear_auth();

select tests.authenticate_as(:'v_rev');
select is(
  tests.affected_rows(format($$ update public.material_submissions set content_md = 'x' where id = %L $$, :'v_sub_a_rev')),
  0, 'o autor não altera o próprio envio "em revisão"'
);
select tests.clear_auth();

select tests.authenticate_as(:'v_pend');
select is(
  tests.affected_rows(format($$ update public.material_submissions set content_md = 'x' where id = %L $$, :'v_sub_pend')),
  0, 'usuário pendente não altera o próprio envio'
);
select tests.clear_auth();
select tests.authenticate_as(:'v_block');
select is(
  tests.affected_rows(format($$ update public.material_submissions set content_md = 'x' where id = %L $$, :'v_sub_block')),
  0, 'usuário bloqueado não altera o próprio envio'
);
select tests.clear_auth();
select tests.authenticate_as(:'v_admin');
select is(
  tests.affected_rows(format($$ update public.material_submissions set content_md = 'x' where id = %L $$, :'v_sub_b')),
  0, 'admin não altera envio de outra pessoa (só leitura nesta unidade)'
);
select tests.clear_auth();

-- O servidor (44-F) muda o estado como service_role/postgres: o banco não o impede.
-- Aqui só se prova que o caminho existe e que o gatilho não força o estado nele.
select lives_ok(
  format($$ update public.material_submissions set status = 'em_revisao' where id = %L $$, :'v_sub_b'),
  'papel de servidor muda o estado'
);
select is((select status from public.material_submissions where id = :'v_sub_b'), 'em_revisao', 'e o estado fica como o servidor pôs');

-- ---------------------------------------------------------------------------
-- 5. Limite de volume: 3 esperando revisão por pessoa, 300 KB por texto
-- ---------------------------------------------------------------------------
insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md, status)
select :'v_lim', 'Espera ' || g, :'v_disc', :'v_theme', '# e', case when g = 3 then 'em_revisao' else 'aguardando_revisao' end
from generate_series(1, 3) g;
insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md, status)
values (:'v_lim', 'Não apto do lim', :'v_disc', :'v_theme', '# n', 'nao_apto') returning id as v_lim_nao \gset

select tests.authenticate_as(:'v_lim');
select throws_ok(
  format($$ insert into public.material_submissions (title, discipline_id, theme_id, content_md) values ('Quarto', %L, %L, '# q') $$, :'v_disc', :'v_theme'),
  'P0001', NULL, '4º envio esperando revisão é recusado (2 aguardando + 1 em revisão já contam)'
);
select throws_ok(
  format($$ update public.material_submissions set content_md = '# de novo' where id = %L $$, :'v_lim_nao'),
  'P0001', NULL, 'reenviar um "não apto" também respeita o limite'
);
select tests.clear_auth();

-- O limite conta só quem espera; apto, publicado, não apto e erro não contam.
insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md, status)
select :'v_ok3', 'Fora da fila ' || s, :'v_disc', :'v_theme', '# f', s
from unnest(array['apto', 'publicado', 'nao_apto', 'erro', 'apto']) s;
select tests.authenticate_as(:'v_ok3');
select lives_ok(
  format($$ insert into public.material_submissions (title, discipline_id, theme_id, content_md)
            select 'Espera ' || g, %L, %L, '# e' from generate_series(1, 3) g $$, :'v_disc', :'v_theme'),
  'quem tem só envios fora da fila envia 3 de uma vez'
);
select throws_ok(
  format($$ insert into public.material_submissions (title, discipline_id, theme_id, content_md) values ('Quarto do ok3', %L, %L, '# q') $$, :'v_disc', :'v_theme'),
  'P0001', NULL, 'o 4º é recusado'
);
select tests.clear_auth();

-- O servidor devolve um envio da fila ao fim da revisão: libera vaga.
update public.material_submissions set status = 'apto'
where author_id = :'v_lim' and title = 'Espera 1';
select tests.authenticate_as(:'v_lim');
select lives_ok(
  format($$ insert into public.material_submissions (title, discipline_id, theme_id, content_md) values ('Cabe de novo', %L, %L, '# c') $$, :'v_disc', :'v_theme'),
  'ao sair um da fila, cabe outro'
);
select tests.clear_auth();

-- Tamanho: até 300 KB (307200 bytes), contados em bytes, não em caracteres.
select tests.authenticate_as(:'v_big');
select lives_ok(
  format($$ insert into public.material_submissions (title, discipline_id, theme_id, content_md) values ('No limite', %L, %L, repeat('a', 307200)) $$, :'v_disc', :'v_theme'),
  'texto de exatamente 300 KB é aceito'
);
select throws_ok(
  format($$ insert into public.material_submissions (title, discipline_id, theme_id, content_md) values ('Passou 1', %L, %L, repeat('a', 307201)) $$, :'v_disc', :'v_theme'),
  '23514', NULL, 'texto de 300 KB + 1 byte é recusado'
);
select throws_ok(
  format($$ insert into public.material_submissions (title, discipline_id, theme_id, content_md) values ('Passou 2', %L, %L, repeat('é', 153601)) $$, :'v_disc', :'v_theme'),
  '23514', NULL, 'o limite conta bytes: 153601 letras acentuadas passam de 300 KB'
);
select throws_ok(
  format($$ update public.material_submissions set content_md = repeat('a', 307201) where title = 'No limite' and author_id = %L $$, :'v_big'),
  '23514', NULL, 'substituir o texto por um maior que 300 KB também é recusado'
);
select tests.clear_auth();

-- Apagar o usuário leva os envios junto (limpeza dos testes de tela não precisa de ordem).
select lives_ok(
  format($$ delete from auth.users where id = %L $$, :'v_big'),
  'excluir o autor exclui os envios dele'
);
select is((select count(*)::int from public.material_submissions where author_id = :'v_big'), 0, 'nenhum envio sobra do autor excluído');

select * from finish();
