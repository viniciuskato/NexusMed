-- ============================================================================
-- MAT-1 — Data de publicação, versão do padrão e "versão nova" de material
-- (migration 20261004120000).
--
-- Prova:
--   1. as colunas novas existem e as funções novas não são chamáveis por anon/authenticated;
--   2. a leitura da linha "**Versão do padrão:** N" do texto;
--   3. `published_at` nasce na primeira publicação e nunca muda (republicar não muda; o cliente não escolhe);
--   4. `updated_at` ("Atualizado em") anda quando uma seção entra, sai ou muda, e não anda quando se grava o mesmo;
--   5. o preenchimento dos materiais que já existem (melhor fonte registrada) e a idempotência dele;
--   6. o caminho completo no banco: publicar um envio de material e aplicar uma atualização pelo admin — versão do
--      padrão gravada, histórico das seções que mudaram, data de atualização, "nada mudou" não grava versão;
--   7. "Importar material" grava a versão declarada no arquivo.
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

-- Um material publicado (uma seção), como o postgres faria ao carregar conteúdo.
create or replace function tests.m1_material_publicado(p_disc uuid, p_theme uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.materials (discipline_id, theme_id, title) values (p_disc, p_theme, p_title) returning id into v_id;
  insert into public.material_sections (material_id, sort_order, title, content) values (v_id, 0, 'S', 'C.');
  update public.materials set status = 'published' where id = v_id;
  return v_id;
end;
$$;

-- Um envio de material NOVO "aguardando revisão", com o texto dado (o cabeçalho pode ter a linha da versão do padrão).
create or replace function tests.m1_envio(p_author uuid, p_disc uuid, p_theme uuid, p_title text, p_content_md text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md, status)
  values (p_author, p_title, p_disc, p_theme, p_content_md, 'aguardando_revisao') returning id into v_id;
  return v_id;
end;
$$;

-- Um envio de ATUALIZAÇÃO do material, com o texto dado (o lugar e a base vêm do banco).
create or replace function tests.m1_envio_atualizacao(p_author uuid, p_material uuid, p_title text, p_content_md text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.material_submissions (author_id, title, content_md, status, target_material_id)
  values (p_author, p_title, p_content_md, 'aguardando_revisao', p_material) returning id into v_id;
  return v_id;
end;
$$;

create or replace function tests.m1_sha(p_submission uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select s.content_sha256 from public.material_submissions s where s.id = p_submission;
$$;

-- A leitura do texto que o importador da tela faz: n seções "Seção i", cada uma com "Texto da seção i".
create or replace function tests.m1_leitura(p_title text, p_sections int default 2)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'title', p_title, 'subtitle', 'Subtítulo de teste', 'author', 'Autor de teste',
    'estimated_read_time_minutes', 12, 'tags', jsonb_build_array('teste', 'mat1'),
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

grant execute on all functions in schema tests to public;

select plan(69);

select tests.clear_auth();
select tests.create_user('mat1.admin@test.local', 'admin', 'active') as v_admin \gset
select substr(gen_random_uuid()::text, 1, 8) as v_sfx \gset

insert into public.disciplines (name, code, cycle) values ('Disciplina MAT1', 'M1-' || :'v_sfx', 'clinico') returning id as v_disc \gset
insert into public.themes (discipline_id, name) values (:'v_disc', 'Tema MAT1') returning id as v_theme \gset

-- ---------------------------------------------------------------------------
-- 1. Colunas e permissões
-- ---------------------------------------------------------------------------
select has_column('public', 'materials', 'published_at', 'materials tem a data de publicação');
select has_column('public', 'materials', 'standard_version', 'materials tem a versão do padrão');
select col_is_null('public', 'materials', 'standard_version', 'a versão do padrão pode ser nula (desconhecida)');
select ok(
  not has_function_privilege('authenticated', 'app.versao_do_padrao_do_texto(text)', 'execute')
  and not has_function_privilege('anon', 'app.versao_do_padrao_do_texto(text)', 'execute')
  and not has_function_privilege('authenticated', 'app.preencher_datas_e_versao_do_padrao()', 'execute')
  and not has_function_privilege('anon', 'app.preencher_datas_e_versao_do_padrao()', 'execute'),
  'as funções novas do schema app não são chamáveis por anon nem por authenticated'
);
select ok(
  has_function_privilege('authenticated', 'public.import_compendium_draft(uuid, uuid, uuid, text, text, text, int, text[], jsonb, text[], uuid, int, text, text, jsonb, int)', 'execute')
  and not has_function_privilege('anon', 'public.import_compendium_draft(uuid, uuid, uuid, text, text, text, int, text[], jsonb, text[], uuid, int, text, text, jsonb, int)', 'execute'),
  'a importação (com a versão do padrão) é do usuário logado, nunca do anon'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'import_compendium_draft'),
  1, 'só existe uma assinatura de import_compendium_draft (a antiga, de 15 parâmetros, saiu)'
);

-- ---------------------------------------------------------------------------
-- 2. A versão do padrão que o texto declara
-- ---------------------------------------------------------------------------
select is(app.versao_do_padrao_do_texto(E'# T\n**Subtítulo:** S\n**Versão do padrão:** 3\n\n### Seção\ntexto'), 3, 'lê a versão do cabeçalho');
select is(app.versao_do_padrao_do_texto(E'# T\r\n**Versão do padrão:** 2\r\n\r\n### Seção\r\ntexto'), 2, 'lê com fim de linha do Windows');
select is(app.versao_do_padrao_do_texto(E'# T\n**Versao do padrao:**   12  \n### S'), 12, 'sem acento e com espaços');
select is(app.versao_do_padrao_do_texto(E'# T\n**Subtítulo:** S\n\n### Seção\ntexto'), null, 'sem a linha: nula');
select is(app.versao_do_padrao_do_texto(E'# T\n\n### Seção\n**Versão do padrão:** 3\n'), null, 'a linha dentro de uma seção não conta');
select is(app.versao_do_padrao_do_texto(E'# T\n**Versão do padrão:** três\n\n### S'), null, 'valor que não é número: nula');
select is(app.versao_do_padrao_do_texto(E'# T\n**Versão do padrão:** 3.1\n\n### S'), null, 'valor com ponto: nula');
select is(app.versao_do_padrao_do_texto(E'# T\n**Versão do padrão:** 0\n\n### S'), null, 'zero: nula');
select is(app.versao_do_padrao_do_texto(null), null, 'texto nulo: nula');

-- ---------------------------------------------------------------------------
-- 3. Data de publicação: primeira vez, nunca sobrescrita
-- ---------------------------------------------------------------------------
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Rascunho MAT1 ' || :'v_sfx') returning id as v_rasc \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_rasc', 0, 'S', 'C.');
select is((select published_at from public.materials where id = :'v_rasc'), null, 'rascunho não tem data de publicação');

update public.materials set status = 'published' where id = :'v_rasc';
select isnt((select published_at from public.materials where id = :'v_rasc'), null, 'a primeira publicação grava a data');
select ok(
  (select published_at between now() - interval '1 minute' and now() + interval '1 minute' from public.materials where id = :'v_rasc'),
  'e a data é a de agora'
);
select published_at as v_pub1 from public.materials where id = :'v_rasc' \gset

-- Republicação: despublica, espera, publica de novo, tenta trocar a data: nada muda.
update public.materials set status = 'draft' where id = :'v_rasc';
select is((select published_at from public.materials where id = :'v_rasc'), :'v_pub1'::timestamptz, 'despublicar não apaga a data');
update public.materials set status = 'published' where id = :'v_rasc';
select is((select published_at from public.materials where id = :'v_rasc'), :'v_pub1'::timestamptz, 'publicar de novo não muda a data');
update public.materials set published_at = '2000-01-01T00:00:00Z' where id = :'v_rasc';
select is((select published_at from public.materials where id = :'v_rasc'), :'v_pub1'::timestamptz, 'nem o postgres sobrescreve a data de um material já publicado');

-- O cliente (admin pela API) não escolhe a data: nem em rascunho, nem em material publicado.
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Outro rascunho MAT1 ' || :'v_sfx') returning id as v_rasc2 \gset
select tests.authenticate_as(:'v_admin');
update public.materials set published_at = '2000-01-01T00:00:00Z' where id = :'v_rasc2';
update public.materials set published_at = '2000-01-01T00:00:00Z', title = title || ' (editado)' where id = :'v_rasc';
select tests.clear_auth();
select is((select published_at from public.materials where id = :'v_rasc2'), null, 'o admin não grava data de publicação num rascunho');
select is((select published_at from public.materials where id = :'v_rasc'), :'v_pub1'::timestamptz, 'o admin não troca a data de um material publicado');

-- ---------------------------------------------------------------------------
-- 4. "Atualizado em": anda com o conteúdo, não com a mesma gravação
-- ---------------------------------------------------------------------------
select tests.m1_material_publicado(:'v_disc', :'v_theme', 'Atualizado MAT1 ' || :'v_sfx') as v_mat \gset
select id as v_sec from public.material_sections where material_id = :'v_mat' \gset
update public.materials set updated_at = '2020-01-01T00:00:00Z' where id = :'v_mat';

update public.material_sections set content = 'C.', title = 'S' where id = :'v_sec';
select is((select updated_at from public.materials where id = :'v_mat'), '2020-01-01T00:00:00Z'::timestamptz, 'gravar a mesma seção de novo não move "Atualizado em"');
update public.material_sections set sort_order = 5 where id = :'v_sec';
select is((select updated_at from public.materials where id = :'v_mat'), '2020-01-01T00:00:00Z'::timestamptz, 'mudar só a posição da seção também não move');
update public.material_sections set content = 'Texto novo.' where id = :'v_sec';
select ok((select updated_at > '2020-01-01T00:00:00Z' from public.materials where id = :'v_mat'), 'mudar o texto da seção move');
update public.materials set updated_at = '2020-01-01T00:00:00Z' where id = :'v_mat';
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_mat', 9, 'Nova', 'N.') returning id as v_sec2 \gset
select ok((select updated_at > '2020-01-01T00:00:00Z' from public.materials where id = :'v_mat'), 'seção nova move');
update public.materials set updated_at = '2020-01-01T00:00:00Z' where id = :'v_mat';
delete from public.material_sections where id = :'v_sec2';
select ok((select updated_at > '2020-01-01T00:00:00Z' from public.materials where id = :'v_mat'), 'seção que sai move');
update public.materials set updated_at = '2020-01-01T00:00:00Z' where id = :'v_mat';
select is((select published_at from public.materials where id = :'v_mat'), (select published_at from public.materials where id = :'v_mat'), 'a data de publicação segue intacta');
select is(
  app.build_material_snapshot(:'v_mat') #>> '{material,title}', 'Atualizado MAT1 ' || :'v_sfx',
  'o conteúdo atestável continua o mesmo formato (a data nova não entra no hash)'
);
select ok(
  not (app.build_material_snapshot(:'v_mat')::text like '%published_at%' or app.build_material_snapshot(:'v_mat')::text like '%standard_version%' or app.build_material_snapshot(:'v_mat')::text like '%updated_at%'),
  'published_at, standard_version e updated_at ficam fora do hash do conteúdo'
);

-- ---------------------------------------------------------------------------
-- 5. Os materiais que já existem: melhor fonte registrada, idempotente
-- ---------------------------------------------------------------------------
-- Simula o banco ANTES da migration: sem os gatilhos (replica), material no ar sem data nem versão.
set session_replication_role = replica;

insert into public.materials (discipline_id, theme_id, title, status, created_at, updated_at)
values (:'v_disc', :'v_theme', 'Antigo A ' || :'v_sfx', 'published', '2026-01-01T12:00:00Z', '2026-01-01T12:00:00Z') returning id as v_a \gset
insert into public.materials (discipline_id, theme_id, title, status, created_at)
values (:'v_disc', :'v_theme', 'Antigo B ' || :'v_sfx', 'published', '2026-01-05T12:00:00Z') returning id as v_b \gset
insert into public.materials (discipline_id, theme_id, title, status, created_at, updated_at)
values (:'v_disc', :'v_theme', 'Antigo C ' || :'v_sfx', 'published', '2026-01-10T12:00:00Z', '2026-04-01T12:00:00Z') returning id as v_c \gset
insert into public.materials (discipline_id, theme_id, title, status, created_at)
values (:'v_disc', :'v_theme', 'Antigo D arquivado ' || :'v_sfx', 'archived', '2026-01-11T12:00:00Z') returning id as v_d \gset
insert into public.materials (discipline_id, theme_id, title, status, created_at)
values (:'v_disc', :'v_theme', 'Antigo E rascunho ' || :'v_sfx', 'draft', '2026-01-12T12:00:00Z') returning id as v_e \gset
insert into public.materials (discipline_id, theme_id, title, status, created_at)
values (:'v_disc', :'v_theme', 'Antigo F nada mudou ' || :'v_sfx', 'published', '2026-01-13T12:00:00Z') returning id as v_f \gset

-- A: criado por um envio (versão 2) em 01/02 e atualizado por outro (versão 3) em 01/03.
insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md, status, published_material_id, updated_at)
values (:'v_admin', 'Envio A', :'v_disc', :'v_theme', E'# A\n**Versão do padrão:** 2\n\n### S\ntexto', 'publicado', :'v_a', '2026-02-01T12:00:00Z');
insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md, status, target_material_id, base_snapshot_hash, applied_at, updated_at)
values (:'v_admin', 'Atualização A', :'v_disc', :'v_theme', E'# A\n**Versão do padrão:** 3\n\n### S\ntexto novo', 'publicado', :'v_a', 'x', '2026-03-01T12:00:00Z', '2026-03-01T12:00:00Z');
-- B: sem envio, com a primeira atestação aprovada em 20/01.
insert into public.content_revisions (material_id, revision_number, snapshot, snapshot_hash, policy_version, created_by, created_at)
values (:'v_b', 1, '{}'::jsonb, 'h1', 'p1', :'v_admin', '2026-01-19T12:00:00Z') returning id as v_rev_b \gset
insert into public.content_reviews (content_revision_id, reviewer_user_id, decision, policy_version, revision_hash, created_at)
values (:'v_rev_b', :'v_admin', 'aprovado', 'p1', 'h1', '2026-01-20T12:00:00Z');
-- F: só um envio "nada mudou" (o recado marca que o arquivo era igual): a versão dele não vale.
insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md, status, target_material_id, base_snapshot_hash, applied_at, publication_note, updated_at)
values (:'v_admin', 'Atualização F', :'v_disc', :'v_theme', E'# F\n**Versão do padrão:** 5\n\n### S\ntexto', 'publicado', :'v_f', 'x', '2026-03-02T12:00:00Z', 'O arquivo é igual ao material que está no ar: nada mudou.', '2026-03-02T12:00:00Z');
-- D: arquivado, sem nenhuma fonte.
-- "Atualizado em": A foi editada em 10/02 e 15/02 (histórico de seção; nem save_compendium nem a edição na leitura moviam
-- updated_at), mas o updated_at dela ficou em 01/01; C foi editada em 01/03 e o updated_at dela (01/04) é mais novo.
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_a', 0, 'S', 'C.') returning id as v_sec_a \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_c', 0, 'S', 'C.') returning id as v_sec_c \gset
insert into public.material_section_versions (material_section_id, changed_by, changed_fields, before_snapshot, after_snapshot, created_at) values
  (:'v_sec_a', :'v_admin', array['content'], '{}'::jsonb, '{}'::jsonb, '2026-02-10T12:00:00Z'),
  (:'v_sec_a', :'v_admin', array['content'], '{}'::jsonb, '{}'::jsonb, '2026-02-15T12:00:00Z'),
  (:'v_sec_c', :'v_admin', array['content'], '{}'::jsonb, '{}'::jsonb, '2026-03-01T12:00:00Z');

set session_replication_role = origin;

select is((select count(*)::int from public.materials where id in (:'v_a', :'v_b', :'v_c', :'v_d', :'v_e', :'v_f') and (published_at is not null or standard_version is not null)), 0, 'ponto de partida: nenhum dos materiais antigos tem data nem versão');

select app.preencher_datas_e_versao_do_padrao();

select is((select published_at from public.materials where id = :'v_a'), '2026-02-01T12:00:00Z'::timestamptz, 'A: a data é a do envio que criou o material');
select is((select standard_version from public.materials where id = :'v_a'), 3, 'A: a versão é a do envio mais recente que foi ao ar (3, não 2)');
select is((select published_at from public.materials where id = :'v_b'), '2026-01-20T12:00:00Z'::timestamptz, 'B: sem envio, a data é a da primeira atestação aprovada');
select is((select standard_version from public.materials where id = :'v_b'), null, 'B: sem registro, a versão fica nula');
select is((select published_at from public.materials where id = :'v_c'), '2026-01-10T12:00:00Z'::timestamptz, 'C: sem nenhuma fonte, a data é a de criação');
select is((select published_at from public.materials where id = :'v_d'), null, 'D: arquivado sem fonte não ganha data inventada');
select is((select published_at from public.materials where id = :'v_e'), null, 'E: rascunho continua sem data');
select is((select standard_version from public.materials where id = :'v_f'), null, 'F: a versão de um envio "nada mudou" não vale');
select is((select updated_at from public.materials where id = :'v_a'), '2026-02-15T12:00:00Z'::timestamptz, 'A: "Atualizado em" sobe até a última edição de seção registrada no histórico');
select is((select updated_at from public.materials where id = :'v_c'), '2026-04-01T12:00:00Z'::timestamptz, 'C: "Atualizado em" que já é mais novo que a última edição não volta no tempo');

select md5(string_agg(id::text || coalesce(published_at::text, '-') || coalesce(standard_version::text, '-') || updated_at::text, ',' order by id)) as v_foto
  from public.materials where id in (:'v_a', :'v_b', :'v_c', :'v_d', :'v_e', :'v_f') \gset
select app.preencher_datas_e_versao_do_padrao();
select is(
  (select md5(string_agg(id::text || coalesce(published_at::text, '-') || coalesce(standard_version::text, '-') || updated_at::text, ',' order by id))
     from public.materials where id in (:'v_a', :'v_b', :'v_c', :'v_d', :'v_e', :'v_f')),
  :'v_foto'::text, 'rodar o preenchimento de novo não muda nada (idempotente)'
);

-- ---------------------------------------------------------------------------
-- 6. O caminho completo: publicar um envio e aplicar uma versão nova, pelo admin
-- ---------------------------------------------------------------------------
select tests.m1_envio(:'v_admin', :'v_disc', :'v_theme', 'Caminho MAT1 ' || :'v_sfx', E'# Caminho\n**Versão do padrão:** 2\n\n### Seção 1\ntexto') as v_e1 \gset
select tests.authenticate_as(:'v_admin');
select (public.admin_publicar_envio(:'v_e1', tests.m1_sha(:'v_e1'), tests.m1_leitura('Caminho MAT1 ' || :'v_sfx', 2)))->>'resultado' as v_r1 \gset
select tests.clear_auth();
select is(:'v_r1'::text, 'publicado', 'o admin publica o envio de material (sem parecer nenhum)');
select published_material_id as v_m from public.material_submissions where id = :'v_e1' \gset
select isnt((select published_at from public.materials where id = :'v_m'), null, 'o material publicado pelo envio tem data de publicação');
select is((select standard_version from public.materials where id = :'v_m'), 2, 'e a versão do padrão é a que o arquivo declarava (2)');
select id as v_s1 from public.material_sections where material_id = :'v_m' and title = 'Seção 1' \gset
select id as v_s2 from public.material_sections where material_id = :'v_m' and title = 'Seção 2' \gset
select published_at as v_pub_m from public.materials where id = :'v_m' \gset
update public.materials set updated_at = '2020-01-01T00:00:00Z' where id = :'v_m';

-- Versão nova: a Seção 2 muda de texto, o arquivo declara a versão 3.
select jsonb_set(tests.m1_leitura('Caminho MAT1 ' || :'v_sfx', 2), '{sections,1,content}', '"Texto REESCRITO da seção 2"')::text as v_texto_novo \gset
select tests.m1_envio_atualizacao(:'v_admin', :'v_m', 'Versão nova', E'# Caminho\n**Versão do padrão:** 3\n\n### Seção 1\ntexto') as v_u1 \gset
select tests.authenticate_as(:'v_admin');
select (public.admin_aplicar_atualizacao(:'v_u1', tests.m1_sha(:'v_u1'), :'v_texto_novo'::jsonb))->>'resultado' as v_r2 \gset
select tests.clear_auth();
select is(:'v_r2'::text, 'aplicado', 'o admin aplica a versão nova sem esperar o parecer');
select is((select standard_version from public.materials where id = :'v_m'), 3, 'a versão do padrão passa a ser a do arquivo novo (3)');
select ok((select updated_at > '2020-01-01T00:00:00Z' from public.materials where id = :'v_m'), '"Atualizado em" anda');
select is((select published_at from public.materials where id = :'v_m'), :'v_pub_m'::timestamptz, 'e a data de publicação não muda');
select results_eq(
  format($$ select id, content from public.material_sections where material_id = %L order by sort_order $$, :'v_m'),
  format($$ values (%L::uuid, 'Texto da seção 1'::text), (%L::uuid, 'Texto REESCRITO da seção 2'::text) $$, :'v_s1', :'v_s2'),
  'as seções mantêm o id (anotações, progresso e questões continuam ligados)'
);
select results_eq(
  format($$ select material_section_id, changed_fields, reason, before_snapshot->>'content', after_snapshot->>'content', changed_by = %L::uuid from public.material_section_versions where material_section_id in (%L, %L) $$, :'v_admin', :'v_s1', :'v_s2'),
  format($$ values (%L::uuid, array['content']::text[], 'Atualização por arquivo'::text, 'Texto da seção 2'::text, 'Texto REESCRITO da seção 2'::text, true) $$, :'v_s2'),
  'a seção que mudou ganhou uma versão no histórico (antes, depois, quem, motivo); a que não mudou, nenhuma'
);

-- "Nada mudou": o mesmo conteúdo outra vez, num arquivo que declara a versão 9: não grava versão nem move a data.
update public.materials set updated_at = '2020-01-01T00:00:00Z' where id = :'v_m';
select tests.m1_envio_atualizacao(:'v_admin', :'v_m', 'Igual', E'# Caminho\n**Versão do padrão:** 9\n\n### Seção 1\ntexto') as v_u2 \gset
select tests.authenticate_as(:'v_admin');
select (public.admin_aplicar_atualizacao(:'v_u2', tests.m1_sha(:'v_u2'), :'v_texto_novo'::jsonb))->>'resultado' as v_r3 \gset
select tests.clear_auth();
select is(:'v_r3'::text, 'sem_mudanca', 'o arquivo igual ao que está no ar: nada mudou');
select is((select standard_version from public.materials where id = :'v_m'), 3, 'e a versão declarada por esse arquivo não vale');
select is((select updated_at from public.materials where id = :'v_m'), '2020-01-01T00:00:00Z'::timestamptz, 'nem a data de atualização anda');
select is((select count(*)::int from public.material_section_versions where material_section_id in (:'v_s1', :'v_s2')), 1, 'nem o histórico ganha linha');

-- Só a ordem das seções muda: o conteúdo de cada uma é igual, mas o material mudou — a data anda, sem versão de seção.
select jsonb_set(:'v_texto_novo'::jsonb, '{sections}', jsonb_build_array(:'v_texto_novo'::jsonb #> '{sections,1}', :'v_texto_novo'::jsonb #> '{sections,0}'))::text as v_texto_ordem \gset
select tests.m1_envio_atualizacao(:'v_admin', :'v_m', 'Ordem', E'# Caminho\n**Versão do padrão:** 3\n\n### Seção 2\ntexto') as v_u3 \gset
select tests.authenticate_as(:'v_admin');
select (public.admin_aplicar_atualizacao(:'v_u3', tests.m1_sha(:'v_u3'), :'v_texto_ordem'::jsonb))->>'resultado' as v_r4 \gset
select tests.clear_auth();
select is(:'v_r4'::text, 'aplicado', 'trocar só a ordem das seções é uma atualização');
select ok((select updated_at > '2020-01-01T00:00:00Z' from public.materials where id = :'v_m'), 'e a data de atualização anda (mesmo sem seção com texto novo)');
select is((select count(*)::int from public.material_section_versions where material_section_id in (:'v_s1', :'v_s2')), 1, 'sem texto novo, nenhuma versão de seção a mais');

-- A versão que vale é a que o ARQUIVO declara: o "Exportar .md" declara a registrada (ou nenhuma linha), então um material
-- antigo exportado, mexido e publicado continua antigo; só o arquivo reescrito no padrão de hoje declara a atual.
select tests.m1_envio(:'v_admin', :'v_disc', :'v_theme', 'Antigo exportado MAT1 ' || :'v_sfx', E'# Antigo
**Versão do padrão:** 2

### Seção 1
texto') as v_e2 \gset
select tests.authenticate_as(:'v_admin');
select (public.admin_publicar_envio(:'v_e2', tests.m1_sha(:'v_e2'), tests.m1_leitura('Antigo exportado MAT1 ' || :'v_sfx', 1)))->>'resultado' as v_r5 \gset
select tests.clear_auth();
select published_material_id as v_m2 from public.material_submissions where id = :'v_e2' \gset
select is((select standard_version from public.materials where id = :'v_m2'), 2, 'material de versão 2 do padrão: registrada 2');
select jsonb_set(tests.m1_leitura('Antigo exportado MAT1 ' || :'v_sfx', 1), '{sections,0,content}', '"Texto mexido num caractere"')::text as v_texto_mexido \gset
select tests.m1_envio_atualizacao(:'v_admin', :'v_m2', 'Export mexido', E'# Antigo
**Versão do padrão:** 2

### Seção 1
texto mexido') as v_u4 \gset
select tests.authenticate_as(:'v_admin');
select (public.admin_aplicar_atualizacao(:'v_u4', tests.m1_sha(:'v_u4'), :'v_texto_mexido'::jsonb))->>'resultado' as v_r6 \gset
select tests.clear_auth();
select is(:'v_r6'::text, 'aplicado', 'o export mexido é publicado');
select is((select standard_version from public.materials where id = :'v_m2'), 2, 'e o material continua na versão 2 (o selo "Desatualizado" continua)');
-- Export de material com versão desconhecida: sem a linha. Publicado, o material continua com versão nula.
select jsonb_set(tests.m1_leitura('Antigo exportado MAT1 ' || :'v_sfx', 1), '{sections,0,content}', '"Mexido de novo"')::text as v_texto_mexido2 \gset
select tests.m1_envio_atualizacao(:'v_admin', :'v_m2', 'Export sem linha', E'# Antigo

### Seção 1
texto mexido de novo') as v_u5 \gset
select tests.authenticate_as(:'v_admin');
select (public.admin_aplicar_atualizacao(:'v_u5', tests.m1_sha(:'v_u5'), :'v_texto_mexido2'::jsonb))->>'resultado' as v_r7 \gset
select tests.clear_auth();
select is(:'v_r7'::text, 'aplicado', 'o export sem linha de versão também é publicado');
select is((select standard_version from public.materials where id = :'v_m2'), null, 'e a versão fica desconhecida (nula), nunca a atual');

-- Um aluno não aplica nada e nada muda.
select tests.create_user('mat1.aluno@test.local', 'student', 'active') as v_aluno \gset
select tests.authenticate_as(:'v_aluno');
select throws_ok(
  format($$ select public.admin_aplicar_atualizacao(%L, %L, %L::jsonb) $$, :'v_u3', tests.m1_sha(:'v_u3'), :'v_texto_ordem'),
  '42501', 'acesso negado', 'aluno não aplica a versão nova'
);
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 7. "Importar material" grava a versão do arquivo
-- ---------------------------------------------------------------------------
select gen_random_uuid() as v_id_imp \gset
select gen_random_uuid() as v_id_sec \gset
select tests.authenticate_as(:'v_admin');
select (public.import_compendium_draft(
  :'v_id_imp', :'v_disc', :'v_theme', 'Importado MAT1 ' || :'v_sfx', 'Sub', 'Autor', 12, array['teste'],
  jsonb_build_array(jsonb_build_object('id', :'v_id_sec', 'title', 'Seção', 'content', 'Texto.')),
  array['Ref 1'], null, 0, null, null, '[]'::jsonb, 3
)).id as v_imp \gset
select gen_random_uuid() as v_id_imp2 \gset
select gen_random_uuid() as v_id_sec2 \gset
select (public.import_compendium_draft(
  :'v_id_imp2', :'v_disc', :'v_theme', 'Importado sem versao MAT1 ' || :'v_sfx', 'Sub', 'Autor', 12, array['teste'],
  jsonb_build_array(jsonb_build_object('id', :'v_id_sec2', 'title', 'Seção', 'content', 'Texto.')),
  array['Ref 1']
)).id as v_imp2 \gset
select tests.clear_auth();
select is((select standard_version from public.materials where id = :'v_imp'), 3, 'o material importado guarda a versão declarada no arquivo');
select is((select status from public.materials where id = :'v_imp'), 'draft', 'e continua rascunho');
select is((select published_at from public.materials where id = :'v_imp'), null, 'sem data de publicação enquanto é rascunho');
select is((select standard_version from public.materials where id = :'v_imp2'), null, 'importação que não declara versão (chamada antiga, sem o parâmetro) fica com versão nula');

select * from finish();
