-- ============================================================================
-- 44-G — Publicar pelo veredito do revisor de IA
-- Publicação pelo servidor (uma vez só, tudo ou nada), trava de publicação do
-- admin (só com revisão "apto" do conteúdo atual), selo "revisado por IA" e
-- "Reportar erro" (RLS, limite de 20 por dia, marcar como resolvido).
-- ============================================================================

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

-- O servidor (Edge Function) fala com o banco como service_role.
create or replace function tests.authenticate_as_service()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);
  perform set_config('role', 'service_role', false);
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

grant usage on schema tests to anon, authenticated, service_role;

-- Quantas linhas um comando alterou, com o papel atual.
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

-- Atestação humana de fixture (mesmo helper de content_provenance_attestation).
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

-- Um envio com uma revisão concluída do texto atual, como o servidor os deixaria.
create or replace function tests.envio_revisado(
  p_author uuid, p_disc uuid, p_theme uuid, p_title text,
  p_parent uuid default null, p_verdict text default 'apto', p_status text default 'apto'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.material_submissions (author_id, title, discipline_id, theme_id, parent_material_id, content_md, status)
  values (p_author, p_title, p_disc, p_theme, p_parent, '# ' || p_title, p_status) returning id into v_id;
  insert into public.material_reviews (submission_id, content_sha256, status, verdict, model, completed_at)
  select s.id, s.content_sha256, 'concluida', p_verdict, 'claude-opus-5-5', now()
    from public.material_submissions s where s.id = v_id;
  return v_id;
end;
$$;

create or replace function tests.review_of(p_submission uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select r.id from public.material_reviews r where r.submission_id = p_submission order by r.created_at desc limit 1;
$$;

-- A leitura do texto que a Edge Function manda ao banco.
create or replace function tests.leitura(p_title text, p_sections int default 2)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'title', p_title, 'subtitle', 'Subtítulo de teste', 'author', 'Autor de teste',
    'estimated_read_time_minutes', 12, 'tags', jsonb_build_array('teste', 'revisor'),
    'sections', (
      select jsonb_agg(jsonb_build_object(
        'title', 'Seção ' || i, 'content', 'Texto da seção ' || i, 'mechanism_tag', 'Visão geral',
        'key_takeaways', jsonb_build_array('ponto ' || i), 'clinical_pearl', null, 'warning_alert', null
      ) order by i)
      from generate_series(1, p_sections) i
    ),
    'references', jsonb_build_array('Referência de teste 1', 'Referência de teste 2')
  );
$$;

select plan(159);

select tests.clear_auth();
select tests.create_user('g.admin@test.local', 'admin', 'active') as v_admin \gset
select tests.create_user('g.autor@test.local', 'student', 'active') as v_autor \gset
select tests.create_user('g.aluno@test.local', 'student', 'active') as v_aluno \gset
select tests.create_user('g.outro@test.local', 'student', 'active') as v_outro \gset
select tests.create_user('g.pend@test.local', 'student', 'pending') as v_pend \gset
select substr(gen_random_uuid()::text, 1, 8) as v_sfx \gset

insert into public.disciplines (name, code, cycle)
values ('Disciplina 44G', 'G44-' || :'v_sfx', 'clinico') returning id as v_disc \gset
insert into public.themes (discipline_id, name) values (:'v_disc', 'Tema 44G A') returning id as v_theme \gset
insert into public.themes (discipline_id, name) values (:'v_disc', 'Tema 44G B') returning id as v_theme_b \gset

-- Um material já publicado (o "material acima" dos envios).
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Pai publicado ' || :'v_sfx') returning id as v_pai \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_pai', 0, 'S', 'c');
update public.materials set status = 'published' where id = :'v_pai';

-- ---------------------------------------------------------------------------
-- 1. Estrutura e grants
-- ---------------------------------------------------------------------------
select has_table('public', 'material_ai_provenance', 'tabela de proveniência de IA existe');
select has_table('public', 'material_error_reports', 'tabela de erros reportados existe');
select has_table('public', 'material_publicado_antes_44g', 'tabela do que já estava publicado existe');
select has_column('public', 'material_submissions', 'published_material_id', 'o envio guarda o material publicado');
select has_column('public', 'material_submissions', 'publication_note', 'o envio guarda o recado do servidor');
select ok(
  not has_table_privilege('anon', 'public.material_ai_provenance', 'select')
  and not has_table_privilege('anon', 'public.material_error_reports', 'select')
  and not has_table_privilege('anon', 'public.material_error_reports', 'insert')
  and not has_table_privilege('anon', 'public.material_publicado_antes_44g', 'select'),
  'anon não tem privilégio nas tabelas novas'
);
select ok(
  not has_table_privilege('authenticated', 'public.material_ai_provenance', 'insert')
  and not has_table_privilege('authenticated', 'public.material_ai_provenance', 'update')
  and not has_table_privilege('authenticated', 'public.material_ai_provenance', 'delete'),
  'cliente não escreve na proveniência de IA'
);
select ok(
  not has_table_privilege('authenticated', 'public.material_publicado_antes_44g', 'select')
  and not has_table_privilege('authenticated', 'public.material_publicado_antes_44g', 'insert'),
  'cliente não mexe na lista do que já estava publicado'
);
select ok(
  not has_table_privilege('authenticated', 'public.material_error_reports', 'update')
  and not has_table_privilege('authenticated', 'public.material_error_reports', 'delete')
  and not has_column_privilege('authenticated', 'public.material_error_reports', 'reporter_id', 'insert')
  and not has_column_privilege('authenticated', 'public.material_error_reports', 'status', 'insert')
  and not has_column_privilege('authenticated', 'public.material_error_reports', 'resolved_at', 'insert')
  and has_column_privilege('authenticated', 'public.material_error_reports', 'description', 'insert')
  and has_column_privilege('authenticated', 'public.material_error_reports', 'excerpt', 'insert'),
  'cliente só grava material, texto e trecho do erro reportado'
);
select ok(
  not has_column_privilege('authenticated', 'public.material_submissions', 'published_material_id', 'update')
  and not has_column_privilege('authenticated', 'public.material_submissions', 'publication_note', 'update')
  and not has_column_privilege('authenticated', 'public.material_submissions', 'published_material_id', 'insert'),
  'cliente não grava o vínculo com o material nem o recado do servidor'
);
select ok(
  not has_function_privilege('authenticated', 'public.revisao_publicar_envio(uuid, uuid, text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.revisao_publicar_envio(uuid, uuid, text, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.revisao_envios_para_publicar(int)', 'execute')
  and not has_function_privilege('anon', 'public.revisao_envios_para_publicar(int)', 'execute')
  and has_function_privilege('service_role', 'public.revisao_publicar_envio(uuid, uuid, text, jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.revisao_envios_para_publicar(int)', 'execute'),
  'só o servidor publica pelo veredito'
);
select ok(
  not has_function_privilege('anon', 'public.selo_de_revisao(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.resolver_erro_reportado(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.publish_material(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.selo_de_revisao(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.resolver_erro_reportado(uuid)', 'execute'),
  'anon não executa as funções novas; usuário logado sim'
);
select ok(
  not has_function_privilege('authenticated', 'app.material_tem_revisao_apto(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'app.revisao_apto_do_envio(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'app.material_snapshot_hash(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'app.limitar_reportes_de_erro()', 'execute'),
  'as funções internas não são chamáveis pelo cliente'
);

-- ---------------------------------------------------------------------------
-- 2. Envios prontos para publicar (o que o servidor busca)
-- ---------------------------------------------------------------------------
select tests.envio_revisado(:'v_autor', :'v_disc', :'v_theme', 'Envio apto 1 ' || :'v_sfx') as v_e1 \gset
select tests.envio_revisado(:'v_autor', :'v_disc', :'v_theme', 'Envio nao apto ' || :'v_sfx', null, 'nao_apto', 'nao_apto') as v_e_nao \gset
select tests.envio_revisado(:'v_autor', :'v_disc', :'v_theme', 'Envio apto sem revisao valida ' || :'v_sfx', null, 'nao_apto', 'apto') as v_e_incoerente \gset
select tests.envio_revisado(:'v_autor', :'v_disc', :'v_theme', 'Envio apto texto mudou ' || :'v_sfx') as v_e_mudou \gset
update public.material_submissions set content_md = content_md || E'\ntexto novo' where id = :'v_e_mudou';
select tests.review_of(:'v_e1') as v_r1 \gset
select content_sha256 as v_h1 from public.material_submissions where id = :'v_e1' \gset

select tests.authenticate_as(:'v_admin');
select throws_ok($$ select * from public.revisao_envios_para_publicar(10) $$, '42501', NULL, 'nem admin busca envios para publicar: é do servidor');
select tests.clear_auth();

create temp table prontos as select * from public.revisao_envios_para_publicar(0) where false;
grant all on prontos to service_role;
select tests.authenticate_as_service();
insert into prontos select * from public.revisao_envios_para_publicar(1000);
select tests.clear_auth();

select is((select count(*)::int from prontos where submission_id = :'v_e1'), 1, 'envio apto com revisão apto do texto atual está pronto');
select is((select review_id from prontos where submission_id = :'v_e1'), :'v_r1'::uuid, 'com o id da revisão apto');
select is((select content_sha256 from prontos where submission_id = :'v_e1'), :'v_h1', 'e o hash do texto que a revisão viu');
select is((select count(*)::int from prontos where submission_id = :'v_e_nao'), 0, 'envio "não apto" não está pronto');
select is((select count(*)::int from prontos where submission_id = :'v_e_incoerente'), 0, 'envio "apto" cuja revisão foi "não apto" não está pronto (falha fechada)');
select is((select count(*)::int from prontos where submission_id = :'v_e_mudou'), 0, 'envio "apto" cujo texto mudou depois da revisão não está pronto');

-- ---------------------------------------------------------------------------
-- 3. Publicação pelo servidor
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'v_admin');
select throws_ok(
  format($$ select public.revisao_publicar_envio(%L, %L, %L, tests.leitura('x')) $$, :'v_e1', :'v_r1', :'v_h1'),
  '42501', NULL, 'nem admin publica pelo veredito: é do servidor'
);
select tests.clear_auth();

-- Não publica sem ser a revisão certa, o texto certo ou o estado certo.
select tests.authenticate_as_service();
select is(
  (public.revisao_publicar_envio(:'v_e1', gen_random_uuid(), :'v_h1', tests.leitura('Envio apto 1 ' || :'v_sfx')))->>'resultado',
  'revisao_invalida', 'revisão diferente da que vale para o texto: não publica'
);
select is(
  (public.revisao_publicar_envio(:'v_e1', :'v_r1', 'hash-de-outro-texto', tests.leitura('Envio apto 1 ' || :'v_sfx')))->>'resultado',
  'revisao_invalida', 'texto lido diferente do revisado: não publica'
);
select is(
  (public.revisao_publicar_envio(:'v_e_nao', tests.review_of(:'v_e_nao'), (select content_sha256 from public.material_submissions where id = :'v_e_nao'), tests.leitura('Envio nao apto ' || :'v_sfx')))->>'resultado',
  'fora_de_estado', 'envio "não apto" não é publicado'
);
select is(
  (public.revisao_publicar_envio(:'v_e_incoerente', tests.review_of(:'v_e_incoerente'), (select content_sha256 from public.material_submissions where id = :'v_e_incoerente'), tests.leitura('Envio apto sem revisao valida ' || :'v_sfx')))->>'resultado',
  'revisao_invalida', 'envio "apto" com revisão "não apto": não publica'
);
select is(
  (public.revisao_publicar_envio(:'v_e1', :'v_r1', :'v_h1', '{"title":"x","sections":[]}'::jsonb))->>'resultado',
  'revisao_invalida', 'leitura sem seção: não publica'
);
select tests.clear_auth();
select is((select count(*)::int from public.materials where title like 'Envio apto 1 %' and title like '%' || :'v_sfx'), 0, 'nenhuma dessas tentativas criou material');

-- O caminho feliz, com o "material acima".
update public.material_submissions set parent_material_id = :'v_pai' where id = :'v_e1';
select tests.authenticate_as_service();
select public.revisao_publicar_envio(:'v_e1', :'v_r1', :'v_h1', tests.leitura('Envio apto 1 ' || :'v_sfx', 3)) as v_res1 \gset
select tests.clear_auth();
select is((:'v_res1'::jsonb)->>'resultado', 'publicado', 'envio apto vira material publicado');
select (:'v_res1'::jsonb)->>'material_id' as v_m1 \gset
select is((select status from public.materials where id = :'v_m1'), 'published', 'o material está publicado');
select results_eq(
  format($$ select title, subtitle, author, estimated_read_time_minutes, tags, discipline_id, theme_id, parent_material_id from public.materials where id = %L $$, :'v_m1'),
  format($$ values (%L::text, 'Subtítulo de teste'::text, 'Autor de teste'::text, 12, array['teste','revisor']::text[], %L::uuid, %L::uuid, %L::uuid) $$,
    'Envio apto 1 ' || :'v_sfx', :'v_disc', :'v_theme', :'v_pai'),
  'com os dados do texto e o lugar da árvore escolhido no envio (Disciplina, Tema, pai)'
);
select is((select count(*)::int from public.material_sections where material_id = :'v_m1'), 3, 'com as 3 seções');
select is((select string_agg(title, ',' order by sort_order) from public.material_sections where material_id = :'v_m1'), 'Seção 1,Seção 2,Seção 3', 'na ordem do texto');
select is((select count(*)::int from public.material_references where material_id = :'v_m1'), 2, 'com as 2 referências');
select is((select tree_sort_order from public.materials where id = :'v_m1'), 0, 'primeiro filho do pai na ordem entre irmãos');
select results_eq(
  format($$ select status, published_material_id, publication_note from public.material_submissions where id = %L $$, :'v_e1'),
  format($$ values ('publicado'::text, %L::uuid, null::text) $$, :'v_m1'),
  'o envio vira "publicado", com o id do material'
);
select results_eq(
  format($$ select submission_id, review_id, review_verdict, text_sha256 from public.material_ai_provenance where material_id = %L $$, :'v_m1'),
  format($$ values (%L::uuid, %L::uuid, 'apto'::text, %L::text) $$, :'v_e1', :'v_r1', :'v_h1'),
  'a proveniência liga o material ao envio e à revisão apto'
);
select is(
  (select snapshot_hash from public.material_ai_provenance where material_id = :'v_m1'),
  app.material_snapshot_hash(:'v_m1'::uuid),
  'e guarda o hash do material como foi publicado'
);
select ok(app.material_tem_revisao_apto(:'v_m1'::uuid), 'o material tem revisão apto vinculada ao conteúdo atual');

-- Idempotência.
select tests.authenticate_as_service();
select public.revisao_publicar_envio(:'v_e1', :'v_r1', :'v_h1', tests.leitura('Envio apto 1 ' || :'v_sfx', 3)) as v_res1b \gset
select tests.clear_auth();
select is((:'v_res1b'::jsonb)->>'resultado', 'ja_publicado', 'rodar de novo não publica outra vez');
select is((:'v_res1b'::jsonb)->>'material_id', :'v_m1', 'e devolve o mesmo material');
select is((select count(*)::int from public.materials where title = 'Envio apto 1 ' || :'v_sfx'), 1, 'continua um material só');
select is((select count(*)::int from public.material_ai_provenance where submission_id = :'v_e1'), 1, 'e uma proveniência só');
select is((select count(*)::int from prontos p join public.material_submissions s on s.id = p.submission_id where p.submission_id = :'v_e1' and s.published_material_id is null), 0, 'o envio publicado não volta à lista de prontos');
select tests.authenticate_as_service();
select is((select count(*)::int from public.revisao_envios_para_publicar(1000) where submission_id = :'v_e1'), 0, 'nem a busca do servidor o devolve');
select tests.clear_auth();

-- Segundo filho: vai depois do primeiro.
select tests.envio_revisado(:'v_autor', :'v_disc', :'v_theme', 'Envio apto 2 ' || :'v_sfx', :'v_pai') as v_e2 \gset
select tests.authenticate_as_service();
select public.revisao_publicar_envio(:'v_e2', tests.review_of(:'v_e2'), (select content_sha256 from public.material_submissions where id = :'v_e2'), tests.leitura('Envio apto 2 ' || :'v_sfx')) as v_res2 \gset
select tests.clear_auth();
select is((select tree_sort_order from public.materials where id = ((:'v_res2'::jsonb)->>'material_id')::uuid), 1, 'o segundo filho fica depois do primeiro');

-- Concorrência: o envio travado por outra transação não é publicado duas vezes
-- (o segundo chamador espera a trava e encontra o envio já publicado) — provado
-- pela idempotência acima; aqui, o bloqueio é exclusivo por linha.
select is(
  (select count(*)::int from pg_proc where proname = 'revisao_publicar_envio' and prosrc like '%for update%'),
  1, 'a publicação trava a linha do envio'
);

-- O estudante vê o material publicado.
select tests.authenticate_as(:'v_aluno');
select is((select count(*)::int from public.materials where id = :'v_m1'), 1, 'o estudante vê o material publicado');
select is((select count(*)::int from public.material_sections where material_id = :'v_m1'), 3, 'e as seções dele');
select tests.clear_auth();

-- O autor não fabrica o vínculo nem o estado.
select tests.authenticate_as(:'v_autor');
select throws_ok(
  format($$ update public.material_submissions set published_material_id = %L where id = %L $$, :'v_m1', :'v_e_nao'),
  '42501', NULL, 'o autor não grava o vínculo com o material'
);
select throws_ok(
  format($$ update public.material_submissions set publication_note = 'x' where id = %L $$, :'v_e_nao'),
  '42501', NULL, 'o autor não grava o recado do servidor'
);
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 4. Recusas que a pessoa resolve corrigindo o envio
-- ---------------------------------------------------------------------------
-- Título repetido.
select tests.envio_revisado(:'v_autor', :'v_disc', :'v_theme', 'Envio repetido ' || :'v_sfx') as v_e_dup \gset
select tests.authenticate_as_service();
select public.revisao_publicar_envio(:'v_e_dup', tests.review_of(:'v_e_dup'), (select content_sha256 from public.material_submissions where id = :'v_e_dup'), tests.leitura('PAI PUBLICADO ' || :'v_sfx')) as v_res_dup \gset
select tests.clear_auth();
select is((:'v_res_dup'::jsonb)->>'resultado', 'recusado', 'título que já existe (mesmo com outra caixa): recusado');
select results_eq(
  format($$ select status, published_material_id is null, publication_note like 'Já existe um material com o título%%' from public.material_submissions where id = %L $$, :'v_e_dup'),
  $$ values ('nao_apto'::text, true, true) $$,
  'o envio vai a "não apto" com o motivo em palavras leigas'
);
select is((select count(*)::int from public.material_ai_provenance where submission_id = :'v_e_dup'), 0, 'e não fica proveniência');

-- Material acima que saiu do ar.
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Pai que sai ' || :'v_sfx') returning id as v_pai_sai \gset
update public.materials set status = 'published' where id = :'v_pai_sai';
select tests.envio_revisado(:'v_autor', :'v_disc', :'v_theme', 'Filho do pai que sai ' || :'v_sfx', :'v_pai_sai') as v_e_pai \gset
update public.materials set status = 'draft' where id = :'v_pai_sai';
select tests.authenticate_as_service();
select public.revisao_publicar_envio(:'v_e_pai', tests.review_of(:'v_e_pai'), (select content_sha256 from public.material_submissions where id = :'v_e_pai'), tests.leitura('Filho do pai que sai ' || :'v_sfx')) as v_res_pai \gset
select tests.clear_auth();
select is((:'v_res_pai'::jsonb)->>'resultado', 'recusado', 'material acima que deixou de estar publicado: recusado');
select is((select status from public.material_submissions where id = :'v_e_pai'), 'nao_apto', 'o envio vai a "não apto"');
select ok((select publication_note like '%material acima%' from public.material_submissions where id = :'v_e_pai'), 'com o motivo dito em palavras leigas');

-- Material acima de outro Tema.
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme_b', 'Pai de outro tema ' || :'v_sfx') returning id as v_pai_b \gset
update public.materials set status = 'published' where id = :'v_pai_b';
select tests.envio_revisado(:'v_autor', :'v_disc', :'v_theme', 'Filho de outro tema ' || :'v_sfx', :'v_pai_b') as v_e_tema \gset
select tests.authenticate_as_service();
select public.revisao_publicar_envio(:'v_e_tema', tests.review_of(:'v_e_tema'), (select content_sha256 from public.material_submissions where id = :'v_e_tema'), tests.leitura('Filho de outro tema ' || :'v_sfx')) as v_res_tema \gset
select tests.clear_auth();
select is((:'v_res_tema'::jsonb)->>'resultado', 'recusado', 'material acima de outro Tema: recusado');
select ok((select publication_note like '%outra Disciplina ou de outro Tema%' from public.material_submissions where id = :'v_e_tema'), 'com o motivo em palavras leigas');

-- A pessoa corrige e reenvia: o recado antigo some e o envio volta à fila.
select tests.authenticate_as(:'v_autor');
select lives_ok(
  format($$ update public.material_submissions set content_md = '# outro texto', parent_material_id = null where id = %L $$, :'v_e_tema'),
  'o autor corrige o envio recusado'
);
select tests.clear_auth();
select results_eq(
  format($$ select status, publication_note from public.material_submissions where id = %L $$, :'v_e_tema'),
  $$ values ('aguardando_revisao'::text, null::text) $$,
  'o envio volta à fila e o recado antigo some'
);

-- ---------------------------------------------------------------------------
-- 4b. "Tentar de novo" com revisão apto válida: volta a "apto", sem nova revisão
-- ---------------------------------------------------------------------------
select tests.envio_revisado(:'v_autor', :'v_disc', :'v_theme', 'Retry erro ' || :'v_sfx', null, 'apto', 'erro') as v_e_retry \gset
select count(*)::int as v_revs_antes from public.material_reviews where submission_id = :'v_e_retry' \gset
update public.material_submissions set publication_note = 'Não conseguimos publicar o material agora.' where id = :'v_e_retry';
select tests.authenticate_as(:'v_autor');
select is(
  tests.affected_rows(format($$ update public.material_submissions set title = title where id = %L $$, :'v_e_retry')),
  1, 'o autor refaz o envio "erro" sem mudar o texto'
);
select tests.clear_auth();
select results_eq(
  format($$ select status, publication_note from public.material_submissions where id = %L $$, :'v_e_retry'),
  $$ values ('apto'::text, null::text) $$,
  'texto com revisão apto válida: volta a "apto" (não a "aguardando revisão"), sem recado'
);
select is((select count(*)::int from public.material_reviews where submission_id = :'v_e_retry'), :v_revs_antes, 'nenhuma revisão nova foi criada');
select is(app.revisao_apto_do_envio(:'v_e_retry'::uuid), tests.review_of(:'v_e_retry'), 'e a revisão apto de antes continua a que vale');
select tests.authenticate_as_service();
select is(
  (select count(*)::int from public.revisao_envios_para_publicar(1000) where submission_id = :'v_e_retry'),
  1, 'o envio já está na fila de publicação do servidor'
);
select is(
  (public.revisao_publicar_envio(:'v_e_retry', tests.review_of(:'v_e_retry'), (select content_sha256 from public.material_submissions where id = :'v_e_retry'), tests.leitura('Retry erro ' || :'v_sfx')))->>'resultado',
  'publicado', 'e a publicação é refeita e dá certo'
);
select tests.clear_auth();

-- Texto mudado: revisão nova, como sempre.
select tests.envio_revisado(:'v_autor', :'v_disc', :'v_theme', 'Retry com texto novo ' || :'v_sfx', null, 'apto', 'erro') as v_e_retry2 \gset
select tests.authenticate_as(:'v_autor');
select lives_ok(format($$ update public.material_submissions set content_md = '# texto novo depois do erro' where id = %L $$, :'v_e_retry2'), 'o autor troca o texto do envio "erro"');
select tests.clear_auth();
select is((select status from public.material_submissions where id = :'v_e_retry2'), 'aguardando_revisao', 'texto novo volta à fila de revisão (a revisão antiga era de outro texto)');

-- Revisão que não é "apto": também volta à fila.
select tests.envio_revisado(:'v_autor', :'v_disc', :'v_theme', 'Retry revisão não apto ' || :'v_sfx', null, 'nao_apto', 'nao_apto') as v_e_retry3 \gset
select tests.authenticate_as(:'v_autor');
select lives_ok(format($$ update public.material_submissions set title = title where id = %L $$, :'v_e_retry3'), 'o autor refaz o envio "não apto" sem mudar o texto');
select tests.clear_auth();
select is((select status from public.material_submissions where id = :'v_e_retry3'), 'aguardando_revisao', 'revisão "não apto" não vale como aprovação: volta à fila de revisão');

-- Envio recusado na publicação (ex.: material acima trocado): mesmo texto, revisão apto válida → "apto".
select tests.envio_revisado(:'v_autor', :'v_disc', :'v_theme', 'Retry recusado ' || :'v_sfx', null, 'apto', 'nao_apto') as v_e_retry4 \gset
update public.material_submissions set publication_note = 'O material acima não está mais publicado.' where id = :'v_e_retry4';
select tests.authenticate_as(:'v_autor');
select lives_ok(format($$ update public.material_submissions set parent_material_id = %L where id = %L $$, :'v_pai', :'v_e_retry4'), 'o autor escolhe outro material acima, com o mesmo texto');
select tests.clear_auth();
select results_eq(
  format($$ select status, publication_note from public.material_submissions where id = %L $$, :'v_e_retry4'),
  $$ values ('apto'::text, null::text) $$,
  'o envio recusado volta a "apto" (a revisão continua valendo) e o recado antigo some'
);

-- A função de conferência responde só sobre envio do próprio autor.
select tests.authenticate_as(:'v_aluno');
select is(app.envio_tem_revisao_apto_do_autor(:'v_e_retry'::uuid), false, 'outra pessoa não descobre se o envio alheio tem revisão apto');
select tests.clear_auth();
select tests.authenticate_as(:'v_autor');
select is(app.envio_tem_revisao_apto_do_autor(:'v_e_retry'::uuid), true, 'o autor vê a resposta sobre o próprio envio');
select tests.clear_auth();
select ok(not has_function_privilege('anon', 'app.envio_tem_revisao_apto_do_autor(uuid)', 'execute'), 'anon não executa a conferência');

-- ---------------------------------------------------------------------------
-- 4c. O texto aprovado não pôde ser montado: o envio sai da fila de publicação
-- ---------------------------------------------------------------------------
select tests.envio_revisado(:'v_autor', :'v_disc', :'v_theme', 'Texto que não monta ' || :'v_sfx') as v_e_nm \gset
select tests.review_of(:'v_e_nm') as v_r_nm \gset
select content_sha256 as v_h_nm from public.material_submissions where id = :'v_e_nm' \gset
select tests.authenticate_as(:'v_admin');
select throws_ok(
  format($$ select public.revisao_recusar_publicacao(%L, %L, %L, 'x') $$, :'v_e_nm', :'v_r_nm', :'v_h_nm'),
  '42501', NULL, 'nem admin recusa a publicação: é do servidor'
);
select tests.clear_auth();
select ok(
  not has_function_privilege('authenticated', 'public.revisao_recusar_publicacao(uuid, uuid, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.revisao_recusar_publicacao(uuid, uuid, text, text)', 'execute')
  and has_function_privilege('service_role', 'public.revisao_recusar_publicacao(uuid, uuid, text, text)', 'execute'),
  'só o servidor recusa a publicação'
);
select tests.authenticate_as_service();
select is(public.revisao_recusar_publicacao(:'v_e_nm', gen_random_uuid(), :'v_h_nm', 'x'), false, 'com outra revisão: não faz nada');
select is(public.revisao_recusar_publicacao(:'v_e_nm', :'v_r_nm', 'hash-de-outro-texto', 'x'), false, 'com outro texto: não faz nada');
select tests.clear_auth();
select is((select status from public.material_submissions where id = :'v_e_nm'), 'apto', 'e o envio continua "apto"');
select tests.authenticate_as_service();
select is(public.revisao_recusar_publicacao(:'v_e_nm', :'v_r_nm', :'v_h_nm', 'O texto não monta: falta a seção. Corrija o texto e envie de novo.'), true, 'com a revisão e o texto certos: recusa');
select is(public.revisao_recusar_publicacao(:'v_e_nm', :'v_r_nm', :'v_h_nm', 'de novo'), false, 'e não recusa duas vezes (já não está "apto")');
select is((select count(*)::int from public.revisao_envios_para_publicar(1000) where submission_id = :'v_e_nm'), 0, 'o envio saiu da fila de publicação');
select tests.clear_auth();
select results_eq(
  format($$ select status, publication_note, published_material_id is null from public.material_submissions where id = %L $$, :'v_e_nm'),
  $$ values ('nao_apto'::text, 'O texto não monta: falta a seção. Corrija o texto e envie de novo.'::text, true) $$,
  'vai a "não apto" com o recado leigo'
);
select tests.envio_revisado(:'v_autor', :'v_disc', :'v_theme', 'Texto que não monta 2 ' || :'v_sfx') as v_e_nm2 \gset
select tests.authenticate_as_service();
select is(public.revisao_recusar_publicacao(:'v_e_nm2', tests.review_of(:'v_e_nm2'), (select content_sha256 from public.material_submissions where id = :'v_e_nm2'), '   '), true, 'sem recado, grava um recado padrão');
select tests.clear_auth();
select is((select publication_note from public.material_submissions where id = :'v_e_nm2'), 'O texto não pôde ser publicado.', 'o recado padrão é leigo');

-- ---------------------------------------------------------------------------
-- 5. Falha no meio: nada fica pela metade
-- ---------------------------------------------------------------------------
select tests.envio_revisado(:'v_autor', :'v_disc', :'v_theme', 'Envio que falha ' || :'v_sfx') as v_e_falha \gset
select tests.authenticate_as_service();
select public.revisao_publicar_envio(
  :'v_e_falha', tests.review_of(:'v_e_falha'), (select content_sha256 from public.material_submissions where id = :'v_e_falha'),
  jsonb_set(tests.leitura('Envio que falha ' || :'v_sfx', 2), '{sections,1,content}', '""')
) as v_res_falha \gset
select tests.clear_auth();
select is((:'v_res_falha'::jsonb)->>'resultado', 'falhou', 'seção sem conteúdo no meio da criação: falhou');
select is((select count(*)::int from public.materials where title = 'Envio que falha ' || :'v_sfx'), 0, 'nenhum material ficou criado');
select is((select count(*)::int from public.material_ai_provenance where submission_id = :'v_e_falha'), 0, 'nenhuma proveniência ficou');
select results_eq(
  format($$ select status, published_material_id is null, publication_note is not null from public.material_submissions where id = %L $$, :'v_e_falha'),
  $$ values ('erro'::text, true, true) $$,
  'o envio vai a "erro" (a pessoa pode tentar de novo), com recado leigo'
);
select is(
  (select count(*)::int from public.materials m where m.status = 'published' and not exists (select 1 from public.material_ai_provenance p where p.material_id = m.id)
     and m.title like '%' || :'v_sfx'),
  2, 'só os dois "pais" de fixture estão no ar sem proveniência: nenhum publicado pelo servidor ficou sem vínculo'
);

-- ---------------------------------------------------------------------------
-- 6. Trava de publicação do admin
-- ---------------------------------------------------------------------------
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Rascunho do admin ' || :'v_sfx') returning id as v_rasc \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_rasc', 0, 'S1', 'texto');

select tests.authenticate_as(:'v_aluno');
select throws_ok(format($$ select public.publish_material(%L) $$, :'v_rasc'), NULL, 'apenas administradores ativos podem publicar materiais', 'estudante não publica');
select tests.clear_auth();
select tests.authenticate_as(:'v_admin');
select throws_like(
  format($$ select public.publish_material(%L) $$, :'v_rasc'),
  '%revisor de IA%Enviar material%', 'admin não publica rascunho sem revisão, e a mensagem diz o que fazer'
);
select tests.clear_auth();

-- Atestação humana sozinha já não basta.
select tests.approve_material_revision(:'v_rasc'::uuid);
select tests.authenticate_as(:'v_admin');
select throws_like(
  format($$ select public.publish_material(%L) $$, :'v_rasc'),
  '%revisor de IA%', 'atestação humana sem revisão de IA não libera a publicação'
);
select tests.clear_auth();
select is((select status from public.materials where id = :'v_rasc'), 'draft', 'o rascunho continua rascunho');

-- Revisão apto vinculada a ESTE conteúdo: libera.
select tests.envio_revisado(:'v_autor', :'v_disc', :'v_theme', 'Envio do rascunho ' || :'v_sfx') as v_e_rasc \gset
insert into public.material_ai_provenance (material_id, submission_id, review_id, review_verdict, reviewed_at, model, text_sha256, snapshot_hash)
select :'v_rasc', s.id, tests.review_of(s.id), 'apto', now(), 'claude-opus-5-5', s.content_sha256, app.material_snapshot_hash(:'v_rasc'::uuid)
  from public.material_submissions s where s.id = :'v_e_rasc';
select tests.authenticate_as(:'v_admin');
select lives_ok(format($$ select public.publish_material(%L) $$, :'v_rasc'), 'com revisão apto do mesmo conteúdo, o admin publica');
select tests.clear_auth();
select is((select status from public.materials where id = :'v_rasc'), 'published', 'e o material vai ao ar');

-- Revisão de um conteúdo que mudou depois: não vale.
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Rascunho editado ' || :'v_sfx') returning id as v_edit \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_edit', 0, 'S1', 'texto original');
select tests.envio_revisado(:'v_autor', :'v_disc', :'v_theme', 'Envio do editado ' || :'v_sfx') as v_e_edit \gset
insert into public.material_ai_provenance (material_id, submission_id, review_id, review_verdict, reviewed_at, model, text_sha256, snapshot_hash)
select :'v_edit', s.id, tests.review_of(s.id), 'apto', now(), 'claude-opus-5-5', s.content_sha256, app.material_snapshot_hash(:'v_edit'::uuid)
  from public.material_submissions s where s.id = :'v_e_edit';
update public.material_sections set content = 'texto alterado depois da revisão' where material_id = :'v_edit';
select tests.authenticate_as(:'v_admin');
select throws_like(format($$ select public.publish_material(%L) $$, :'v_edit'), '%revisor de IA%', 'conteúdo alterado depois da revisão: a revisão não vale mais');
select tests.clear_auth();
select ok(not app.material_tem_revisao_apto(:'v_edit'::uuid), 'a função de conferência também diz que não');

-- Proveniência cuja revisão não é "apto": não vale.
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Rascunho revisão ruim ' || :'v_sfx') returning id as v_ruim \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_ruim', 0, 'S1', 'texto');
select tests.envio_revisado(:'v_autor', :'v_disc', :'v_theme', 'Envio revisão ruim ' || :'v_sfx', null, 'nao_apto', 'nao_apto') as v_e_ruim \gset
insert into public.material_ai_provenance (material_id, submission_id, review_id, review_verdict, reviewed_at, model, text_sha256, snapshot_hash)
select :'v_ruim', s.id, tests.review_of(s.id), 'apto', now(), 'm', s.content_sha256, app.material_snapshot_hash(:'v_ruim'::uuid)
  from public.material_submissions s where s.id = :'v_e_ruim';
select ok(not app.material_tem_revisao_apto(:'v_ruim'::uuid), 'proveniência ligada a uma revisão que não é "apto" não vale');
select throws_ok(format($$ insert into public.material_ai_provenance (material_id, review_verdict, text_sha256, snapshot_hash) values (%L, 'apto', 'x', 'y') $$, :'v_ruim'), '23505', NULL, 'a proveniência é uma por material');
select throws_ok(
  format($$ insert into public.material_ai_provenance (material_id, review_verdict, text_sha256, snapshot_hash)
            select id, 'nao_apto', 'x', 'y' from public.materials where id <> %L limit 1 $$, :'v_ruim'),
  '23514', NULL, 'só se grava proveniência de revisão "apto"'
);

-- O que já estava publicado antes: não é afetado.
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Legado ' || :'v_sfx') returning id as v_leg \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_leg', 0, 'S1', 'texto legado');
update public.materials set status = 'published' where id = :'v_leg';
insert into public.material_publicado_antes_44g (material_id, snapshot_hash) values (:'v_leg', app.material_snapshot_hash(:'v_leg'::uuid));
select tests.authenticate_as(:'v_admin');
select lives_ok(format($$ select public.unpublish_material(%L) $$, :'v_leg'), 'o admin despublica o material antigo');
select throws_like(format($$ select public.publish_material(%L) $$, :'v_leg'), '%já esteve no ar%', 'material antigo sem atestação do conteúdo atual: a regra antiga o barra, com mensagem leiga');
select tests.clear_auth();
select tests.approve_material_revision(:'v_leg'::uuid);
select tests.authenticate_as(:'v_admin');
select lives_ok(format($$ select public.publish_material(%L) $$, :'v_leg'), 'material antigo com atestação do conteúdo atual volta ao ar pela regra antiga');
select tests.clear_auth();
select is((select status from public.materials where id = :'v_leg'), 'published', 'e está publicado');

-- A exceção vale só para o CONTEÚDO que já estava no ar: reescrito, precisa de revisão de IA.
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Legado reescrito ' || :'v_sfx') returning id as v_leg2 \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_leg2', 0, 'S1', 'texto legado original');
update public.materials set status = 'published' where id = :'v_leg2';
insert into public.material_publicado_antes_44g (material_id, snapshot_hash) values (:'v_leg2', app.material_snapshot_hash(:'v_leg2'::uuid));
select tests.authenticate_as(:'v_admin');
select lives_ok(format($$ select public.unpublish_material(%L) $$, :'v_leg2'), 'o admin despublica outro material antigo');
select tests.clear_auth();
-- O admin reescreve título e seções, atesta a própria revisão e tenta republicar sem revisor de IA.
update public.materials set title = 'Material NOVO escrito pelo admin ' || :'v_sfx' where id = :'v_leg2';
update public.material_sections set title = 'Seção nova', content = 'texto totalmente novo, escrito pelo admin' where material_id = :'v_leg2';
select tests.approve_material_revision(:'v_leg2'::uuid);
select tests.authenticate_as(:'v_admin');
select throws_like(
  format($$ select public.publish_material(%L) $$, :'v_leg2'),
  '%mudou depois de ir ao ar%revisor de IA%',
  'material antigo reescrito e atestado pelo admin: não republica sem revisor de IA'
);
select tests.clear_auth();
select is((select status from public.materials where id = :'v_leg2'), 'draft', 'e continua rascunho');
select is((select count(*)::int from public.material_ai_provenance where material_id = :'v_leg2'), 0, 'sem proveniência de IA');
-- Voltar ao texto original (mesmo hash de antes) devolve a exceção.
update public.materials set title = 'Legado reescrito ' || :'v_sfx' where id = :'v_leg2';
update public.material_sections set title = 'S1', content = 'texto legado original' where material_id = :'v_leg2';
select tests.approve_material_revision(:'v_leg2'::uuid);
select tests.authenticate_as(:'v_admin');
select lives_ok(format($$ select public.publish_material(%L) $$, :'v_leg2'), 'republicar exatamente o conteúdo antigo, atestado, ainda é aceito');
select tests.clear_auth();
select is((select status from public.materials where id = :'v_leg2'), 'published', 'e volta ao ar');
-- Conteúdo novo COM revisão de IA apto vinculada publica normalmente (o caminho certo).
select tests.authenticate_as(:'v_admin');
select lives_ok(format($$ select public.unpublish_material(%L) $$, :'v_leg2'), 'despublica de novo');
select tests.clear_auth();
update public.material_sections set content = 'texto reescrito, agora revisado pela IA' where material_id = :'v_leg2';
select tests.envio_revisado(:'v_autor', :'v_disc', :'v_theme', 'Envio do legado reescrito ' || :'v_sfx') as v_e_leg2 \gset
insert into public.material_ai_provenance (material_id, submission_id, review_id, review_verdict, reviewed_at, model, text_sha256, snapshot_hash)
select :'v_leg2', s.id, tests.review_of(s.id), 'apto', now(), 'm', s.content_sha256, app.material_snapshot_hash(:'v_leg2'::uuid)
  from public.material_submissions s where s.id = :'v_e_leg2';
select tests.authenticate_as(:'v_admin');
select lives_ok(format($$ select public.publish_material(%L) $$, :'v_leg2'), 'conteúdo novo com revisão de IA apto vinculada publica');
select tests.clear_auth();
select ok(
  (select snapshot_hash from public.material_publicado_antes_44g where material_id = :'v_leg2') is distinct from app.material_snapshot_hash(:'v_leg2'::uuid),
  'e o hash guardado do conteúdo antigo continua o de antes (não acompanha as edições)'
);

-- Material novo (fora da lista do que já estava publicado) com atestação humana e sem IA: barrado.
select is((select count(*)::int from public.material_publicado_antes_44g where material_id = :'v_rasc'), 0, 'material novo nunca entra na lista do que já estava publicado');

-- ---------------------------------------------------------------------------
-- 7. Selo no leitor
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'v_aluno');
select is(public.selo_de_revisao(:'v_m1'), 'ia', 'material publicado por revisão de IA: selo "ia"');
select is(public.selo_de_revisao(:'v_pai'), null, 'material antigo (sem proveniência): sem selo');
select is(public.selo_de_revisao(:'v_leg'), null, 'material antigo atestado por uma pessoa (sem IA): sem selo novo');
select is(public.selo_de_revisao(:'v_ruim'), null, 'rascunho: o estudante não recebe selo');
select tests.clear_auth();
select tests.approve_material_revision(:'v_m1'::uuid);
select tests.authenticate_as(:'v_aluno');
select is(public.selo_de_revisao(:'v_m1'), 'ia_e_pessoa', 'depois de uma pessoa atestar o conteúdo atual: selo "ia_e_pessoa"');
select tests.clear_auth();
update public.material_sections set content = content || ' (editado depois)' where material_id = :'v_m1' and sort_order = 0;
select tests.authenticate_as(:'v_aluno');
select is(public.selo_de_revisao(:'v_m1'), null, 'conteúdo editado depois da revisão da IA: o selo não afirma o que não é verdade');
select tests.clear_auth();
select tests.authenticate_as(:'v_pend');
select throws_ok(format($$ select public.selo_de_revisao(%L) $$, :'v_m1'), '42501', NULL, 'usuário pendente não consulta o selo');
select tests.clear_auth();
select tests.authenticate_as_anon();
select throws_ok(format($$ select public.selo_de_revisao(%L) $$, :'v_m1'), '42501', NULL, 'anon não consulta o selo');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 8. Reportar erro
-- ---------------------------------------------------------------------------
-- Um material publicado limpo, para os reportes.
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Material dos reportes ' || :'v_sfx') returning id as v_rep_m \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_rep_m', 0, 'S', 'c');
update public.materials set status = 'published' where id = :'v_rep_m';

select tests.authenticate_as(:'v_aluno');
select lives_ok(
  format($$ insert into public.material_error_reports (material_id, description, excerpt) values (%L, 'A dose citada está errada.', 'dose de 5 mg') $$, :'v_rep_m'),
  'estudante ativo reporta erro num material publicado'
);
select lives_ok(
  format($$ insert into public.material_error_reports (material_id, description) values (%L, 'Sem trecho, só a descrição.') $$, :'v_rep_m'),
  'o trecho é opcional'
);
select results_eq(
  format($$ select reporter_id, status, resolved_at is null, excerpt from public.material_error_reports where description = 'A dose citada está errada.' and material_id = %L $$, :'v_rep_m'),
  format($$ values (%L::uuid, 'aberto'::text, true, 'dose de 5 mg'::text) $$, :'v_aluno'),
  'o autor é quem reportou, o estado nasce "aberto"'
);
select throws_ok(
  format($$ insert into public.material_error_reports (material_id, description, reporter_id) values (%L, 'x', %L) $$, :'v_rep_m', :'v_outro'),
  '42501', NULL, 'não dá para reportar em nome de outra pessoa'
);
select throws_ok(
  format($$ insert into public.material_error_reports (material_id, description, status) values (%L, 'x', 'resolvido') $$, :'v_rep_m'),
  '42501', NULL, 'não dá para gravar o estado'
);
select throws_ok(
  format($$ insert into public.material_error_reports (material_id, description) values (%L, 'erro num rascunho') $$, :'v_edit'),
  '42501', NULL, 'reporte de material não publicado é recusado (o rascunho não é dos alunos)'
);
select throws_ok(
  format($$ insert into public.material_error_reports (material_id, description) values (%L, '   ') $$, :'v_rep_m'),
  '23514', NULL, 'a descrição é obrigatória'
);
select throws_ok(
  format($$ insert into public.material_error_reports (material_id, description) values (%L, %L) $$, :'v_rep_m', repeat('a', 2001)),
  '23514', NULL, 'a descrição passa de 2000 caracteres: recusada'
);
select lives_ok(
  format($$ insert into public.material_error_reports (material_id, description) values (%L, %L) $$, :'v_rep_m', repeat('b', 2000)),
  'a descrição de exatamente 2000 caracteres é aceita'
);
select throws_ok(
  format($$ insert into public.material_error_reports (material_id, description, excerpt) values (%L, 'x', %L) $$, :'v_rep_m', repeat('c', 2001)),
  '23514', NULL, 'o trecho passa de 2000 caracteres: recusado'
);
select is((select count(*)::int from public.material_error_reports where reporter_id = :'v_aluno'), 3, 'só os 3 reportes válidos ficaram');
select throws_ok(format($$ update public.material_error_reports set status = 'resolvido' where reporter_id = %L $$, :'v_aluno'), '42501', NULL, 'o autor não altera o reporte');
select throws_ok(format($$ delete from public.material_error_reports where reporter_id = %L $$, :'v_aluno'), '42501', NULL, 'nem o apaga');
select tests.clear_auth();

-- Leitura: só os próprios; admin lê todos.
select tests.authenticate_as(:'v_outro');
select is((select count(*)::int from public.material_error_reports), 0, 'outro estudante não vê reportes alheios');
select lives_ok(
  format($$ insert into public.material_error_reports (material_id, description) values (%L, 'Reporte do outro estudante.') $$, :'v_rep_m'),
  'o outro estudante também reporta'
);
select is((select count(*)::int from public.material_error_reports), 1, 'e vê só o próprio');
select tests.clear_auth();
select tests.authenticate_as(:'v_admin');
select is((select count(*)::int from public.material_error_reports where material_id = :'v_rep_m'), 4, 'admin ativo vê todos os reportes');
select tests.clear_auth();
select tests.authenticate_as(:'v_pend');
select is((select count(*)::int from public.material_error_reports), 0, 'usuário pendente não lê reportes');
select throws_ok(
  format($$ insert into public.material_error_reports (material_id, description) values (%L, 'pendente') $$, :'v_rep_m'),
  '42501', NULL, 'usuário pendente não reporta'
);
select tests.clear_auth();
select tests.authenticate_as_anon();
select throws_ok($$ select count(*) from public.material_error_reports $$, '42501', NULL, 'anon não lê reportes');
select throws_ok(
  format($$ insert into public.material_error_reports (material_id, description) values (%L, 'anon') $$, :'v_rep_m'),
  '42501', NULL, 'anon não reporta'
);
select tests.clear_auth();

-- Limite de 20 por pessoa por dia, travado no banco.
select tests.create_user('g.limite@test.local', 'student', 'active') as v_lim \gset
insert into public.material_error_reports (material_id, reporter_id, description)
select :'v_rep_m', :'v_lim', 'reporte ' || i from generate_series(1, 19) i;
select tests.authenticate_as(:'v_lim');
select lives_ok(
  format($$ insert into public.material_error_reports (material_id, description) values (%L, 'o vigésimo') $$, :'v_rep_m'),
  'o vigésimo reporte do dia entra'
);
select throws_ok(
  format($$ insert into public.material_error_reports (material_id, description) values (%L, 'o vigésimo primeiro') $$, :'v_rep_m'),
  'P0001', 'Você já enviou 20 reportes de erro hoje. Tente de novo amanhã.', 'o vigésimo primeiro do dia é recusado, com mensagem leiga'
);
select tests.clear_auth();
select is((select count(*)::int from public.material_error_reports where reporter_id = :'v_lim'), 20, 'ficam exatamente 20');
-- Reportes de ontem não contam: o limite é do dia.
update public.material_error_reports set created_at = now() - interval '2 days' where reporter_id = :'v_lim' and description = 'reporte 1';
select tests.authenticate_as(:'v_lim');
select lives_ok(
  format($$ insert into public.material_error_reports (material_id, description) values (%L, 'cabe mais um, pois um é de anteontem') $$, :'v_rep_m'),
  'reporte de dia anterior não conta no limite de hoje'
);
select tests.clear_auth();
-- Outra pessoa não é afetada pelo limite de quem estourou.
select tests.authenticate_as(:'v_aluno');
select lives_ok(
  format($$ insert into public.material_error_reports (material_id, description) values (%L, 'outra pessoa, outro limite') $$, :'v_rep_m'),
  'o limite é por pessoa'
);
select tests.clear_auth();

-- Marcar como resolvido: só admin ativo, só por esta função.
select id as v_rep_id from public.material_error_reports where description = 'A dose citada está errada.' and material_id = :'v_rep_m' \gset
select tests.authenticate_as(:'v_aluno');
select throws_ok(format($$ select public.resolver_erro_reportado(%L) $$, :'v_rep_id'), NULL, 'apenas administradores ativos podem marcar um erro como resolvido', 'estudante não marca como resolvido');
select tests.clear_auth();
select tests.authenticate_as_anon();
select throws_ok(format($$ select public.resolver_erro_reportado(%L) $$, :'v_rep_id'), '42501', NULL, 'anon não marca como resolvido');
select tests.clear_auth();
select tests.authenticate_as(:'v_admin');
select lives_ok(format($$ select public.resolver_erro_reportado(%L) $$, :'v_rep_id'), 'admin marca como resolvido');
select throws_ok(format($$ select public.resolver_erro_reportado(%L) $$, :'v_rep_id'), 'P0001', 'reporte de erro não encontrado ou já resolvido', 'e não resolve duas vezes');
select throws_ok(format($$ select public.resolver_erro_reportado(%L) $$, gen_random_uuid()), 'P0001', 'reporte de erro não encontrado ou já resolvido', 'nem um reporte que não existe');
select tests.clear_auth();
select results_eq(
  format($$ select status, resolved_by, resolved_at is not null from public.material_error_reports where id = %L $$, :'v_rep_id'),
  format($$ values ('resolvido'::text, %L::uuid, true) $$, :'v_admin'),
  'fica "resolvido", com quem resolveu e quando'
);
select tests.authenticate_as(:'v_aluno');
select is((select status from public.material_error_reports where id = :'v_rep_id'), 'resolvido', 'o autor vê o estado do próprio reporte');
select tests.clear_auth();

-- Excluir quem reportou leva os reportes junto; o material continua.
select lives_ok(format($$ delete from auth.users where id = %L $$, :'v_lim'), 'excluir quem reportou exclui os reportes dele');
select is((select count(*)::int from public.material_error_reports where reporter_id = :'v_lim'), 0, 'e nenhum ficou');

select * from finish();
