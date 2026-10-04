-- ============================================================================
-- P9 — Figuras nos materiais (migration 20261003121000)
--
-- Prova:
--   1. bucket privado, só png/jpeg/webp, até 10 MiB;
--   2. só admin ativo cria figura (linha e arquivo); estudante, pendente e anon são recusados; o nome do arquivo
--      é <uuid>.<png|jpg|webp> na raiz do bucket;
--   3. quem vê: admin vê todas; estudante ativo só vê a figura citada por material PUBLICADO (a de rascunho e a
--      que ninguém cita ficam fora); pendente e anon não veem nada, nem a linha nem o arquivo; a regra vale para
--      a tabela e para o objeto do Storage;
--   4. a figura é imutável para o app: ninguém atualiza nem apaga a linha nem o arquivo;
--   5. as restrições da tabela (caminho, tipo, hash, tamanho);
--   6. a figura entra no que define o material: o identificador está no snapshot e o hash muda quando ele muda.
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

-- Hash do material como o banco o calcula (o mesmo da atestação e da publicação pelo veredito).
create or replace function tests.hash_do_material(p_material_id uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select encode(extensions.digest(app.build_material_snapshot(p_material_id)::text, 'sha256'), 'hex');
$$;

-- O papel `authenticated` troca de usuário por estas funções: precisa executá-las (função nova não nasce com EXECUTE).
grant execute on all functions in schema tests to anon, authenticated;

select plan(37);

select tests.clear_auth();
select tests.create_user('fig.admin@test.local', 'admin', 'active') as v_admin \gset
select tests.create_user('fig.aluno@test.local', 'student', 'active') as v_aluno \gset
select tests.create_user('fig.pendente@test.local', 'student', 'pending') as v_pendente \gset

insert into public.disciplines (name, code, cycle)
values ('Disciplina Figuras', 'FIG-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_disc \gset
insert into public.themes (discipline_id, name) values (:'v_disc', 'Tema Figuras')
returning id as v_theme \gset

-- Três figuras semeadas (como postgres): A é citada por material publicado, B só por um rascunho, C por ninguém.
select gen_random_uuid() as v_fa \gset
select gen_random_uuid() as v_fb \gset
select gen_random_uuid() as v_fc \gset
insert into public.material_figures (id, storage_path, mime_type, byte_size, sha256, created_by) values
  (:'v_fa', :'v_fa' || '.png', 'image/png', 1000, repeat('a', 64), :'v_admin'),
  (:'v_fb', :'v_fb' || '.jpg', 'image/jpeg', 1000, repeat('b', 64), :'v_admin'),
  (:'v_fc', :'v_fc' || '.webp', 'image/webp', 1000, repeat('c', 64), :'v_admin');
insert into storage.objects (bucket_id, name, owner) values
  ('material-figures', :'v_fa' || '.png', :'v_admin'),
  ('material-figures', :'v_fb' || '.jpg', :'v_admin'),
  ('material-figures', :'v_fc' || '.webp', :'v_admin');

insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Material com figura publicada') returning id as v_pub \gset
insert into public.material_sections (material_id, sort_order, title, content) values
  (:'v_pub', 0, 'S', E'Texto.\n\n![Alt](figura:' || :'v_fa' || E')\n**Figura 1.** Legenda.\nFonte: Diretriz, 2024.');
select tests.force_publish_material(:'v_pub');

insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Rascunho com figura') returning id as v_rasc \gset
insert into public.material_sections (material_id, sort_order, title, content) values
  (:'v_rasc', 0, 'S', E'Texto.\n\n![Alt](figura:' || :'v_fb' || E')\n**Figura 1.** Legenda.\nFonte: Diretriz, 2024.');

-- Figura citada com espaço dentro dos parênteses: a checagem do padrão e o leitor a tratam como destino inválido, e o
-- banco também não a conta como citada (a leitura e a liberação da imagem concordam).
select gen_random_uuid() as v_fe \gset
insert into public.material_figures (id, storage_path, mime_type, byte_size, sha256, created_by)
values (:'v_fe', :'v_fe' || '.png', 'image/png', 1000, repeat('e', 64), :'v_admin');
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Material com figura e espaço') returning id as v_esp \gset
insert into public.material_sections (material_id, sort_order, title, content) values
  (:'v_esp', 0, 'S', E'![Alt]( figura:' || :'v_fe' || E' )\n**Figura 1.** Legenda.\nFonte: Diretriz, 2024.');
select tests.force_publish_material(:'v_esp');

-- 1. O bucket -----------------------------------------------------------------------------------------------------

select is((select public from storage.buckets where id = 'material-figures'), false, 'o bucket material-figures é privado');
select is(
  (select allowed_mime_types from storage.buckets where id = 'material-figures'),
  array['image/png', 'image/jpeg', 'image/webp'],
  'o bucket só aceita png, jpeg e webp (nada de svg nem pdf)'
);
select is((select file_size_limit from storage.buckets where id = 'material-figures'), 10485760::bigint, 'o bucket limita o arquivo a 10 MiB');

-- 2. Quem cria ----------------------------------------------------------------------------------------------------

select gen_random_uuid() as v_fd \gset

select tests.authenticate_as(:'v_admin');
select lives_ok(
  format($$ insert into public.material_figures (id, storage_path, mime_type, byte_size, sha256) values (%L, %L, 'image/png', 2048, repeat('d', 64)) $$, :'v_fd', :'v_fd' || '.png'),
  'admin ativo cria a linha da figura'
);
select is(
  (select created_by from public.material_figures where id = :'v_fd'),
  :'v_admin'::uuid,
  'o autor da figura é o admin que a criou (auth.uid() por padrão)'
);
select lives_ok(
  format($$ insert into storage.objects (bucket_id, name, owner) values ('material-figures', %L, auth.uid()) $$, :'v_fd' || '.png'),
  'admin ativo envia o arquivo <uuid>.png para a raiz do bucket'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner) values ('material-figures', 'pasta/' || gen_random_uuid()::text || '.png', auth.uid()) $$,
  NULL::char(5), NULL::text, 'o arquivo não pode ir para dentro de uma pasta'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner) values ('material-figures', gen_random_uuid()::text || '.svg', auth.uid()) $$,
  NULL::char(5), NULL::text, 'o nome do arquivo não pode ter extensão fora de png, jpg e webp'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner) values ('material-figures', 'figura.png', auth.uid()) $$,
  NULL::char(5), NULL::text, 'o nome do arquivo tem de ser um uuid'
);

select tests.authenticate_as(:'v_aluno');
select throws_ok(
  format($$ insert into public.material_figures (id, storage_path, mime_type, byte_size, sha256) values (gen_random_uuid(), %L, 'image/png', 1, repeat('e', 64)) $$, 'x.png'),
  NULL::char(5), NULL::text, 'estudante ativo não cria figura'
);
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name, owner) values ('material-figures', %L, auth.uid()) $$, gen_random_uuid()::text || '.png'),
  NULL::char(5), NULL::text, 'estudante ativo não envia arquivo de figura'
);

select tests.authenticate_as(:'v_pendente');
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name, owner) values ('material-figures', %L, auth.uid()) $$, gen_random_uuid()::text || '.png'),
  NULL::char(5), NULL::text, 'usuário pendente não envia arquivo de figura'
);

select tests.authenticate_as_anon();
select throws_ok(
  $$ insert into public.material_figures (id, storage_path, mime_type, byte_size, sha256) values (gen_random_uuid(), 'x.png', 'image/png', 1, repeat('e', 64)) $$,
  NULL::char(5), NULL::text, 'anon não cria figura'
);

-- 3. Quem vê ------------------------------------------------------------------------------------------------------

select tests.authenticate_as(:'v_aluno');
select is(
  (select coalesce(array_agg(id), '{}') from public.material_figures where id in (:'v_fa', :'v_fb', :'v_fc', :'v_fd')),
  array[:'v_fa'::uuid],
  'estudante ativo vê só a figura citada por material publicado'
);
select is(
  (select coalesce(array_agg(name), '{}') from storage.objects
    where bucket_id = 'material-figures' and name in (:'v_fa' || '.png', :'v_fb' || '.jpg', :'v_fc' || '.webp', :'v_fd' || '.png')),
  array[:'v_fa' || '.png'],
  'estudante ativo lê só o arquivo da figura de material publicado'
);

select tests.authenticate_as(:'v_pendente');
select is_empty(
  $$ select 1 from public.material_figures $$,
  'usuário pendente não vê nenhuma figura'
);
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'material-figures' $$,
  'usuário pendente não lê nenhum arquivo de figura'
);

select tests.authenticate_as_anon();
select throws_ok(
  $$ select 1 from public.material_figures $$,
  NULL::char(5), NULL::text, 'anon não consulta a tabela de figuras'
);
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'material-figures' $$,
  'anon não lê nenhum arquivo de figura'
);

select tests.authenticate_as(:'v_admin');
select is(
  (select count(*)::int from public.material_figures where id in (:'v_fa', :'v_fb', :'v_fc', :'v_fd')),
  4,
  'admin ativo vê todas as figuras, inclusive a do rascunho e a que ninguém cita'
);
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'material-figures' and name in (:'v_fa' || '.png', :'v_fb' || '.jpg', :'v_fc' || '.webp', :'v_fd' || '.png')),
  4,
  'admin ativo lê todos os arquivos de figura'
);

-- A figura do rascunho passa a ser vista pelo estudante quando o material é publicado.
select tests.clear_auth();
select tests.force_publish_material(:'v_rasc');
select tests.authenticate_as(:'v_aluno');
select is(
  (select coalesce(array_agg(id order by id), '{}') from public.material_figures where id in (:'v_fa', :'v_fb', :'v_fc', :'v_fd')),
  (select array_agg(x order by x) from unnest(array[:'v_fa'::uuid, :'v_fb'::uuid]) as x),
  'publicado o material do rascunho, o estudante ativo passa a ver a figura dele'
);
select tests.clear_auth();

select is(app.figure_is_published(:'v_fc'), false, 'a figura que nenhum material cita não é "publicada"');
select is(app.figure_is_published(:'v_fa'), true, 'a figura citada por material publicado é "publicada"');
select is(has_function_privilege('anon', 'app.figure_is_published(uuid)', 'EXECUTE'), false, 'anon não executa app.figure_is_published');
select is(
  app.figure_is_published(:'v_fe'),
  false,
  'figura citada com espaço dentro dos parênteses não conta como citada (só `(figura:<id>)` exato, como a checagem exige)'
);

-- 4. Imutável -----------------------------------------------------------------------------------------------------

select tests.authenticate_as(:'v_admin');
select throws_ok(
  format($$ update public.material_figures set byte_size = 5 where id = %L $$, :'v_fa'),
  NULL::char(5), NULL::text, 'nem o admin atualiza a linha de uma figura'
);
select throws_ok(
  format($$ delete from public.material_figures where id = %L $$, :'v_fa'),
  NULL::char(5), NULL::text, 'nem o admin apaga a linha de uma figura'
);
select is(
  tests.affected_rows(format($$ update storage.objects set name = %L where bucket_id = 'material-figures' and name = %L $$, gen_random_uuid()::text || '.png', :'v_fa' || '.png')),
  0,
  'nem o admin troca o arquivo de uma figura (nenhuma política de update)'
);
-- A trava `protect_delete` do Storage recusaria qualquer delete direto; a API a libera com este parâmetro, e é aí que a
-- política (inexistente) de delete decide.
select set_config('storage.allow_delete_query', 'true', false);
select is(
  tests.affected_rows(format($$ delete from storage.objects where bucket_id = 'material-figures' and name = %L $$, :'v_fa' || '.png')),
  0,
  'nem o admin apaga o arquivo de uma figura (nenhuma política de delete)'
);
select tests.clear_auth();

-- 5. Restrições da tabela -----------------------------------------------------------------------------------------

select throws_ok(
  format($$ insert into public.material_figures (id, storage_path, mime_type, byte_size, sha256) values (gen_random_uuid(), 'outro.png', 'image/png', 1, repeat('a', 64)) $$),
  '23514', NULL::text, 'o caminho tem de ser <id>.<extensão do tipo>'
);
select throws_ok(
  format($$ insert into public.material_figures (id, storage_path, mime_type, byte_size, sha256) values (%L, %L, 'image/svg+xml', 1, repeat('a', 64)) $$, :'v_fa', :'v_fa' || '.svg'),
  '23514', NULL::text, 'o tipo svg é recusado'
);
select throws_ok(
  format($$ insert into public.material_figures (id, storage_path, mime_type, byte_size, sha256) values (gen_random_uuid(), 'x', 'image/png', 1, 'nao-e-hash') $$),
  '23514', NULL::text, 'o hash tem de ser SHA-256 em hexadecimal minúsculo'
);
select throws_ok(
  format($$ insert into public.material_figures (id, storage_path, mime_type, byte_size, sha256) values (%L, %L, 'image/png', 10485761, repeat('a', 64)) $$, :'v_fa', :'v_fa' || '.png'),
  '23514', NULL::text, 'imagem de mais de 10 MiB é recusada'
);
select is(
  (select confdeltype::text from pg_constraint where conname = 'material_figures_created_by_fkey'),
  'n',
  'apagar o usuário que enviou a figura não apaga nem trava a figura (set null)'
);

-- 6. A figura entra no que define o material ---------------------------------------------------------------------

select ok(
  app.build_material_snapshot(:'v_pub')::text like '%(figura:' || :'v_fa' || ')%',
  'o snapshot do material (base do hash de atestação e do envio) contém o identificador da figura'
);
select tests.hash_do_material(:'v_rasc') as v_hash_antes \gset
update public.material_sections set content = replace(content, :'v_fb'::text, :'v_fc'::text) where material_id = :'v_rasc';
select isnt(
  tests.hash_do_material(:'v_rasc'),
  :'v_hash_antes',
  'trocar a figura no texto do material muda o hash dele'
);

select tests.clear_auth();
select * from finish();
