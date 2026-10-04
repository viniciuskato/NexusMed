-- ============================================================================
-- 44-B — Atualizar um material publicado a partir de arquivo, pelo revisor de IA
-- Quem pode pedir (admin e o autor do envio que publicou o material), o lugar vem do
-- material, o servidor aplica UMA vez, tudo ou nada, preservando ids de seção, vínculos
-- de referência, anotações, progresso e questões; a proveniência "revisado por IA" passa
-- a valer para o conteúdo novo na mesma transação; "não apto" e as recusas não mudam
-- nada no ar; arquivo igual ao que está no ar não muda nada.
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

-- Um envio de material NOVO com revisão concluída (como o servidor o deixaria).
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

-- Um envio de ATUALIZAÇÃO do material, com a revisão concluída do texto (o lugar e a base vêm do banco).
create or replace function tests.envio_de_atualizacao(
  p_author uuid, p_material uuid, p_tag text,
  p_verdict text default 'apto', p_status text default 'apto'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.material_submissions (author_id, title, content_md, status, target_material_id)
  values (p_author, 'Atualização ' || p_tag, '# Atualização ' || p_tag, p_status, p_material) returning id into v_id;
  if p_verdict is not null then
    insert into public.material_reviews (submission_id, content_sha256, status, verdict, model, completed_at)
    select s.id, s.content_sha256, 'concluida', p_verdict, 'claude-opus-5-5', now()
      from public.material_submissions s where s.id = v_id;
  end if;
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

create or replace function tests.sha_do_envio(p_submission uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select s.content_sha256 from public.material_submissions s where s.id = p_submission;
$$;

-- A leitura do texto que a Edge Function manda ao banco (o material novo da 44-G).
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

-- O conteúdo ATUAL do material, no formato que o servidor manda (um arquivo igual ao que está no ar).
create or replace function tests.leitura_do_material(p_material uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'title', m.title, 'subtitle', m.subtitle, 'author', m.author,
    'estimated_read_time_minutes', m.estimated_read_time_minutes, 'tags', to_jsonb(m.tags),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', s.title, 'content', s.content, 'mechanism_tag', s.mechanism_tag,
        'key_takeaways', to_jsonb(s.key_takeaways), 'clinical_pearl', s.clinical_pearl, 'warning_alert', s.warning_alert
      ) order by s.sort_order)
      from public.material_sections s where s.material_id = m.id
    ), '[]'::jsonb),
    'references', coalesce((select jsonb_agg(r.citation_text order by r.sort_order) from public.material_references r where r.material_id = m.id), '[]'::jsonb)
  )
  from public.materials m where m.id = p_material;
$$;

-- 45-H: função nova não nasce executável por PUBLIC; os helpers rodam como service_role/authenticated.
grant execute on all functions in schema tests to public;

select plan(113);

select tests.clear_auth();
select tests.create_user('b.admin@test.local', 'admin', 'active') as v_admin \gset
select tests.create_user('b.autor@test.local', 'admin', 'active') as v_autor \gset
select tests.create_user('b.outro@test.local', 'student', 'active') as v_outro \gset
select tests.create_user('b.aluno@test.local', 'student', 'active') as v_aluno \gset
select tests.create_user('b.pend@test.local', 'student', 'pending') as v_pend \gset
select substr(gen_random_uuid()::text, 1, 8) as v_sfx \gset

insert into public.disciplines (name, code, cycle) values ('Disciplina 44B', 'B44-' || :'v_sfx', 'clinico') returning id as v_disc \gset
insert into public.themes (discipline_id, name) values (:'v_disc', 'Tema 44B') returning id as v_theme \gset
insert into public.themes (discipline_id, name) values (:'v_disc', 'Outro Tema 44B') returning id as v_theme_b \gset

-- Guarda os tetos como estavam e abre folga (a reserva é global; outros testes deixam coisa na fila).
select monthly_review_cap as v_cap_orig, daily_review_cap_per_user as v_daily_orig from public.review_settings \gset
update public.review_settings set monthly_review_cap = 100000, daily_review_cap_per_user = 50;

-- O material publicado, como o servidor o publica (o autor do envio é o "autor original").
select tests.envio_revisado(:'v_autor', :'v_disc', :'v_theme', 'Base 44B ' || :'v_sfx') as v_e0 \gset
select tests.authenticate_as_service();
select (public.revisao_publicar_envio(:'v_e0', tests.review_of(:'v_e0'), tests.sha_do_envio(:'v_e0'), tests.leitura('Base 44B ' || :'v_sfx', 3)))->>'resultado' as v_res0 \gset
select tests.clear_auth();
select published_material_id as v_m from public.material_submissions where id = :'v_e0' \gset

-- Um vínculo de referência com endereço (o que a atualização não pode perder) e a proveniência do conteúdo assim.
update public.material_references set url = 'https://fonte.exemplo/1' where material_id = :'v_m' and citation_text = 'Referência de teste 1';
update public.material_ai_provenance set snapshot_hash = app.material_snapshot_hash(:'v_m') where material_id = :'v_m';
select id as v_s1 from public.material_sections where material_id = :'v_m' and title = 'Seção 1' \gset
select id as v_s2 from public.material_sections where material_id = :'v_m' and title = 'Seção 2' \gset
select id as v_s3 from public.material_sections where material_id = :'v_m' and title = 'Seção 3' \gset
select id as v_r1 from public.material_references where material_id = :'v_m' and citation_text = 'Referência de teste 1' \gset
-- Dado do aluno e questões ligadas ao material.
insert into public.notes (user_id, material_section_id, note_text) values (:'v_aluno', :'v_s1', 'anotação da seção 1');
insert into public.notes (user_id, material_section_id, note_text) values (:'v_aluno', :'v_s3', 'anotação da seção 3');
insert into public.reading_progress (user_id, material_id, read_section_ids, percent, updated_at)
values (:'v_aluno', :'v_m', array[:'v_s1', :'v_s3']::uuid[], 66, now());
insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem, material_id, material_section_id)
values (:'v_disc', :'v_theme', 'clinico', 'medio', 'Caso', 'Questão da seção 1 ' || :'v_sfx', :'v_m', :'v_s1') returning id as v_q1 \gset
insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem, material_id, material_section_id)
values (:'v_disc', :'v_theme', 'clinico', 'medio', 'Caso', 'Questão da seção 3 ' || :'v_sfx', :'v_m', :'v_s3') returning id as v_q3 \gset
select app.material_snapshot_hash(:'v_m') as v_h_antes \gset

-- ---------------------------------------------------------------------------
-- 1. Estrutura e grants
-- ---------------------------------------------------------------------------
select is(:'v_res0'::text, 'publicado', 'o material de partida foi publicado pelo servidor (44-G)');
select ok(app.material_tem_revisao_apto(:'v_m'::uuid), 'e tem revisão de IA "apto" para o conteúdo que está no ar');
select has_column('public', 'material_submissions', 'target_material_id', 'o envio pode apontar o material que atualiza');
select has_column('public', 'material_submissions', 'applied_at', 'e guarda quando o servidor aplicou');
select ok(
  has_column_privilege('authenticated', 'public.material_submissions', 'target_material_id', 'insert')
  and not has_column_privilege('authenticated', 'public.material_submissions', 'target_material_id', 'update')
  and not has_column_privilege('authenticated', 'public.material_submissions', 'applied_at', 'insert')
  and not has_column_privilege('authenticated', 'public.material_submissions', 'applied_at', 'update')
  and not has_column_privilege('authenticated', 'public.material_submissions', 'base_snapshot_hash', 'insert')
  and not has_column_privilege('authenticated', 'public.material_submissions', 'base_snapshot_hash', 'update'),
  'o cliente escolhe o alvo só ao criar; a aplicação e a base são do banco'
);
select ok(
  not has_function_privilege('authenticated', 'public.revisao_aplicar_atualizacao(uuid, uuid, text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.revisao_aplicar_atualizacao(uuid, uuid, text, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.revisao_envios_de_atualizacao_para_aplicar(int)', 'execute')
  and has_function_privilege('service_role', 'public.revisao_aplicar_atualizacao(uuid, uuid, text, jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.revisao_envios_de_atualizacao_para_aplicar(int)', 'execute'),
  'só o servidor aplica atualização'
);
select ok(
  not has_function_privilege('anon', 'app.pode_atualizar_material(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'app.titulo_normalizado(text)', 'execute'),
  'anon não chama as funções novas'
);
select ok(
  has_column_privilege('authenticated', 'public.material_reviews', 'discipline_id', 'select')
  and has_column_privilege('authenticated', 'public.material_reviews', 'theme_id', 'select')
  and has_column_privilege('authenticated', 'public.material_reviews', 'parent_material_id', 'select')
  and not has_column_privilege('authenticated', 'public.material_reviews', 'continuation', 'select')
  and not has_column_privilege('authenticated', 'public.material_reviews', 'discipline_id', 'update'),
  'o autor lê o lugar da revisão (só leitura), e continua sem ler o que não precisa'
);
select is(app.titulo_normalizado('  Mecanismo   DE Ação  '), 'mecanismo de acao', 'título normalizado: sem acento, sem maiúscula, espaços colapsados');

-- ---------------------------------------------------------------------------
-- 2. Quem pode pedir a atualização, e de onde vem o lugar
-- ---------------------------------------------------------------------------
-- A tela pergunta ao banco quem vê os botões.
select tests.authenticate_as(:'v_autor');
select ok(public.pode_atualizar_material(:'v_m'::uuid), 'a tela mostra os botões ao autor do envio que publicou o material, que é admin');
select tests.clear_auth();
-- P6 (03/10): só o admin atualiza. O mesmo autor, se não for admin, não vê os botões nem pede a atualização.
update public.profiles set role = 'student' where id = :'v_autor';
select tests.authenticate_as(:'v_autor');
select is(public.pode_atualizar_material(:'v_m'::uuid), false, 'P6: o autor do envio que publicou o material, se não é admin, não vê os botões');
select throws_ok(
  format($$ insert into public.material_submissions (title, content_md, target_material_id) values ('Ex-autor', '# x', %L) $$, :'v_m'),
  '42501', NULL, 'P6: e não pede a atualização'
);
select tests.clear_auth();
update public.profiles set role = 'admin' where id = :'v_autor';
select tests.authenticate_as(:'v_admin');
select ok(public.pode_atualizar_material(:'v_m'::uuid), 'e ao admin ativo');
select tests.clear_auth();
select tests.authenticate_as(:'v_outro');
select is(public.pode_atualizar_material(:'v_m'::uuid), false, 'mas não a outra pessoa');
select tests.clear_auth();
select tests.authenticate_as_anon();
select throws_ok($$ select public.pode_atualizar_material(gen_random_uuid()) $$, '42501', NULL, 'nem a anon');
select tests.clear_auth();
select tests.authenticate_as(:'v_outro');
select throws_ok(
  format($$ insert into public.material_submissions (title, content_md, target_material_id) values ('Alheio', '# x', %L) $$, :'v_m'),
  '42501', NULL, 'quem não é admin não pede atualização'
);
select tests.clear_auth();
select tests.authenticate_as(:'v_pend');
select throws_ok(
  format($$ insert into public.material_submissions (title, content_md, target_material_id) values ('Pendente', '# x', %L) $$, :'v_m'),
  '42501', NULL, 'usuário pendente não pede atualização'
);
select tests.clear_auth();
select tests.authenticate_as_anon();
select throws_ok(
  format($$ insert into public.material_submissions (title, content_md, target_material_id) values ('Anon', '# x', %L) $$, :'v_m'),
  '42501', NULL, 'anon não pede atualização'
);
select tests.clear_auth();

select tests.authenticate_as(:'v_autor');
select lives_ok(
  format($$ insert into public.material_submissions (title, content_md, target_material_id) values ('Atualização do autor %s', '# Texto novo', %L) $$, :'v_sfx', :'v_m'),
  'o autor do envio que publicou o material pede a atualização (sem informar Disciplina nem Tema)'
);
select tests.clear_auth();
select id as v_u1 from public.material_submissions where title = 'Atualização do autor ' || :'v_sfx' \gset
select results_eq(
  format($$ select discipline_id, theme_id, parent_material_id is null, status, author_id, base_snapshot_hash, applied_at is null, published_material_id is null from public.material_submissions where id = %L $$, :'v_u1'),
  format($$ values (%L::uuid, %L::uuid, true, 'aguardando_revisao'::text, %L::uuid, %L::text, true, true) $$, :'v_disc', :'v_theme', :'v_autor', :'v_h_antes'),
  'o lugar é o do material (banco), a base é o hash do material de agora, o estado nasce na fila e o autor é quem pediu'
);

select tests.authenticate_as(:'v_admin');
select lives_ok(
  format($$ insert into public.material_submissions (title, content_md, target_material_id) values ('Atualização do admin %s', '# Texto do admin', %L) $$, :'v_sfx', :'v_m'),
  'o admin ativo pede a atualização de qualquer material publicado'
);
select tests.clear_auth();
select id as v_u_admin from public.material_submissions where title = 'Atualização do admin ' || :'v_sfx' \gset

-- O cliente não escolhe lugar, base nem alvo depois.
select tests.authenticate_as(:'v_autor');
select throws_ok(
  format($$ update public.material_submissions set target_material_id = %L where id = %L $$, :'v_m', :'v_u1'),
  '42501', NULL, 'o alvo não muda depois de criado (sem privilégio)'
);
select is(
  tests.affected_rows(format($$ update public.material_submissions set theme_id = %L, discipline_id = %L, parent_material_id = null where id = %L $$, :'v_theme_b', :'v_disc', :'v_u1')),
  1, 'a pessoa até tenta mandar outro Tema no reenvio'
);
select tests.clear_auth();
select results_eq(
  format($$ select theme_id from public.material_submissions where id = %L $$, :'v_u1'),
  format($$ values (%L::uuid) $$, :'v_theme'),
  'mas o Tema volta a ser o do material: o lugar não muda por aqui'
);

-- O material precisa estar publicado.
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Rascunho 44B ' || :'v_sfx') returning id as v_draft \gset
select tests.authenticate_as(:'v_admin');
select throws_ok(
  format($$ insert into public.material_submissions (title, content_md, target_material_id) values ('Em rascunho', '# x', %L) $$, :'v_draft'),
  'P0001', NULL, 'material que não está publicado não recebe pedido de atualização'
);
select tests.clear_auth();

-- A fila é uma só (3 esperando por pessoa): as atualizações contam.
select tests.create_user('b.fila@test.local', 'admin', 'active') as v_fila \gset
insert into public.material_submissions (author_id, title, content_md, target_material_id) values
  (:'v_fila', 'Fila 1', '# 1', :'v_m'), (:'v_fila', 'Fila 2', '# 2', :'v_m'), (:'v_fila', 'Fila 3', '# 3', :'v_m');
select tests.authenticate_as(:'v_fila');
select lives_ok(
  format($$ insert into public.material_submissions (title, content_md, target_material_id) values ('Fila 4', '# 4', %L) $$, :'v_m'),
  'P7: o quarto envio esperando (de atualização também) não barra o admin'
);
select tests.clear_auth();

-- Só o material NOVO entra na fila de "criar e publicar"; a atualização tem a fila dela.
update public.material_submissions set status = 'apto' where id in (:'v_u1', :'v_u_admin');
insert into public.material_reviews (submission_id, content_sha256, status, verdict, model, completed_at)
select s.id, s.content_sha256, 'concluida', 'apto', 'claude-opus-5-5', now() from public.material_submissions s where s.id in (:'v_u1', :'v_u_admin');
select tests.authenticate_as_service();
select is((select count(*)::int from public.revisao_envios_para_publicar(1000) where submission_id in (:'v_u1', :'v_u_admin')), 0, 'a atualização "apto" não entra na fila de criar material novo');
select is((select count(*)::int from public.revisao_envios_de_atualizacao_para_aplicar(1000) where submission_id in (:'v_u1', :'v_u_admin') and target_material_id = :'v_m'), 2, 'entra na fila de aplicar atualização, com o material alvo');
select tests.clear_auth();
-- Um envio de atualização nunca cria material: se o caminho de "criar" o pegasse, o banco recusa (um destino só).
select tests.authenticate_as_service();
select is(
  (public.revisao_publicar_envio(:'v_u_admin', tests.review_of(:'v_u_admin'), tests.sha_do_envio(:'v_u_admin'), tests.leitura('Não deve nascer ' || :'v_sfx')))->>'resultado',
  'falhou', 'mesmo chamada por engano, a criação de material novo falha para envio de atualização'
);
select tests.clear_auth();
select is((select count(*)::int from public.materials where title = 'Não deve nascer ' || :'v_sfx'), 0, 'e nenhum material foi criado');
select is((select status from public.material_submissions where id = :'v_u_admin'), 'erro', 'o envio vai a "erro" (recuperável)');
update public.material_submissions set status = 'apto', publication_note = null where id = :'v_u_admin';

-- ---------------------------------------------------------------------------
-- 3. Aplicar: o caminho feliz
-- ---------------------------------------------------------------------------
-- O texto novo: Seção 1 igual; Seção 2 com o título em outra caixa e texto novo; Seção 3 sai; Seção 4 nova;
-- referência 1 igual (mantém o endereço), referência 2 sai, referência 3 nova; subtítulo novo.
select jsonb_build_object(
  'title', 'Base 44B ' || :'v_sfx', 'subtitle', 'Subtítulo NOVO', 'author', 'Autor de teste',
  'estimated_read_time_minutes', 12, 'tags', jsonb_build_array('teste', 'revisor'),
  'sections', jsonb_build_array(
    jsonb_build_object('title', 'Seção 1', 'content', 'Texto da seção 1', 'mechanism_tag', 'Visão geral', 'key_takeaways', jsonb_build_array('ponto 1'), 'clinical_pearl', null, 'warning_alert', null),
    jsonb_build_object('title', 'SEÇÃO 2', 'content', 'Texto NOVO da seção 2', 'mechanism_tag', 'Visão geral', 'key_takeaways', jsonb_build_array('ponto 2'), 'clinical_pearl', 'Pérola nova', 'warning_alert', null),
    jsonb_build_object('title', 'Seção 4', 'content', 'Texto da seção 4', 'mechanism_tag', 'Visão geral', 'key_takeaways', jsonb_build_array('ponto 4'), 'clinical_pearl', null, 'warning_alert', null)
  ),
  'references', jsonb_build_array('Referência de teste 1', 'Referência nova 3')
)::text as v_texto_novo \gset

select tests.authenticate_as_service();
select is(
  (public.revisao_aplicar_atualizacao(:'v_u1', tests.review_of(:'v_u1'), tests.sha_do_envio(:'v_u1'), :'v_texto_novo'::jsonb))->>'resultado',
  'aplicado', 'com a revisão apto do texto e do lugar atuais, o servidor aplica a atualização'
);
select tests.clear_auth();

select is((select status from public.materials where id = :'v_m'), 'published', 'o material continua publicado');
select is((select subtitle from public.materials where id = :'v_m'), 'Subtítulo NOVO', 'o campo do material mudou');
select results_eq(
  format($$ select id, title, content, sort_order from public.material_sections where material_id = %L and title <> 'Seção 4' order by sort_order $$, :'v_m'),
  format($$ values (%L::uuid, 'Seção 1'::text, 'Texto da seção 1'::text, 0), (%L::uuid, 'SEÇÃO 2'::text, 'Texto NOVO da seção 2'::text, 1) $$, :'v_s1', :'v_s2'),
  'as seções casadas pelo título mantêm o id (a caixa do título não importa) e ganham o texto novo, na ordem do arquivo'
);
select is((select count(*)::int from public.material_sections where id = :'v_s3'), 0, 'a seção que saiu do arquivo saiu do material');
select results_eq(
  format($$ select title, sort_order, id not in (%L::uuid, %L::uuid, %L::uuid) from public.material_sections where material_id = %L and title = 'Seção 4' $$, :'v_s1', :'v_s2', :'v_s3', :'v_m'),
  $$ values ('Seção 4'::text, 2, true) $$, 'a seção nova entra no fim, com id novo'
);
select results_eq(
  format($$ select id, url, sort_order from public.material_references where material_id = %L and citation_text = 'Referência de teste 1' $$, :'v_m'),
  format($$ values (%L::uuid, 'https://fonte.exemplo/1'::text, 0) $$, :'v_r1'),
  'a referência de texto idêntico mantém a linha e o vínculo (endereço)'
);
select results_eq(
  format($$ select citation_text, url, sort_order from public.material_references where material_id = %L order by sort_order $$, :'v_m'),
  $$ values ('Referência de teste 1'::text, 'https://fonte.exemplo/1'::text, 0), ('Referência nova 3'::text, null::text, 1) $$,
  'a referência que saiu foi removida e a nova entrou, na ordem do arquivo'
);
select is((select note_text from public.notes where user_id = :'v_aluno' and material_section_id = :'v_s1'), 'anotação da seção 1', 'a anotação da seção que continua segue nela');
select results_eq(
  format($$ select material_id, material_section_id is null, removed_section_title from public.notes where user_id = %L and note_text = 'anotação da seção 3' $$, :'v_aluno'),
  format($$ values (%L::uuid, true, 'Seção 3'::text) $$, :'v_m'),
  'a anotação da seção removida continua do aluno, no material, com o título da seção (45-D)'
);
select results_eq(
  format($$ select percent, read_section_ids @> array[%L]::uuid[] from public.reading_progress where user_id = %L and material_id = %L $$, :'v_s1', :'v_aluno', :'v_m'),
  $$ values (66, true) $$, 'o progresso de leitura do aluno continua'
);
select results_eq(
  format($$ select material_id, material_section_id from public.questions where id = %L $$, :'v_q1'),
  format($$ values (%L::uuid, %L::uuid) $$, :'v_m', :'v_s1'),
  'a questão ligada a uma seção que continua fica ligada a ela'
);
select results_eq(
  format($$ select material_id, material_section_id is null from public.questions where id = %L $$, :'v_q3'),
  format($$ values (%L::uuid, true) $$, :'v_m'),
  'a questão da seção que saiu continua ligada ao material (sem a seção)'
);
select ok(app.material_tem_revisao_apto(:'v_m'::uuid), 'o material tem revisão de IA "apto" para o conteúdo NOVO (na mesma transação que o trocou)');
select isnt(app.material_snapshot_hash(:'v_m'), :'v_h_antes', 'e o conteúdo mudou de fato');
select results_eq(
  format($$ select submission_id, review_id, snapshot_hash, text_sha256 from public.material_ai_provenance where material_id = %L $$, :'v_m'),
  format($$ select %L::uuid, %L::uuid, app.material_snapshot_hash(%L), %L::text $$, :'v_u1', tests.review_of(:'v_u1'), :'v_m', tests.sha_do_envio(:'v_u1')),
  'a proveniência aponta o envio e a revisão da atualização, com o hash do conteúdo novo'
);
select results_eq(
  format($$ select status, applied_at is not null, publication_note from public.material_submissions where id = %L $$, :'v_u1'),
  $$ values ('publicado'::text, true, null::text) $$, 'o envio termina "publicado", com a data da aplicação'
);
select tests.authenticate_as(:'v_aluno');
select is(public.selo_de_revisao(:'v_m'), 'ia', 'o selo passa a refletir a revisão nova (revisado por IA)');
select tests.clear_auth();

-- Idempotente: uma segunda chamada não aplica de novo.
select app.material_snapshot_hash(:'v_m') as v_h_depois \gset
select tests.authenticate_as_service();
select is(
  (public.revisao_aplicar_atualizacao(:'v_u1', tests.review_of(:'v_u1'), tests.sha_do_envio(:'v_u1'), :'v_texto_novo'::jsonb))->>'resultado',
  'ja_publicado', 'uma segunda aplicação do mesmo envio não faz nada'
);
select is((select count(*)::int from public.revisao_envios_de_atualizacao_para_aplicar(1000) where submission_id = :'v_u1'), 0, 'e ele saiu da fila de aplicar');
select tests.clear_auth();
select is(app.material_snapshot_hash(:'v_m'), :'v_h_depois', 'o conteúdo continua o mesmo');

-- ---------------------------------------------------------------------------
-- 4. Arquivo igual ao que está no ar: não muda nada
-- ---------------------------------------------------------------------------
select tests.envio_de_atualizacao(:'v_autor', :'v_m', 'igual ' || :'v_sfx') as v_ue \gset
select tests.leitura_do_material(:'v_m')::text as v_texto_igual \gset
select created_at as v_prov_criada, submission_id as v_prov_envio from public.material_ai_provenance where material_id = :'v_m' \gset
select tests.authenticate_as_service();
select is(
  (public.revisao_aplicar_atualizacao(:'v_ue', tests.review_of(:'v_ue'), tests.sha_do_envio(:'v_ue'), :'v_texto_igual'::jsonb))->>'resultado',
  'sem_mudanca', 'arquivo igual ao que está no ar: sem mudança'
);
select tests.clear_auth();
select is(app.material_snapshot_hash(:'v_m'), :'v_h_depois', 'o conteúdo não mudou (nem os ids: o hash inclui os ids)');
select is((select submission_id from public.material_ai_provenance where material_id = :'v_m'), :'v_prov_envio'::uuid, 'a proveniência continua a da atualização anterior (nada foi reescrito)');
select results_eq(
  format($$ select status, applied_at is not null, publication_note from public.material_submissions where id = %L $$, :'v_ue'),
  $$ values ('publicado'::text, true, 'O arquivo é igual ao material que está no ar: nada mudou.'::text) $$,
  'o envio termina "publicado" com o recado de que nada mudou'
);

-- ---------------------------------------------------------------------------
-- 5. Recusas: nada muda no ar
-- ---------------------------------------------------------------------------
-- "não apto": não entra na fila, e aplicar não faz nada.
select tests.envio_de_atualizacao(:'v_autor', :'v_m', 'nao apto ' || :'v_sfx', 'nao_apto', 'nao_apto') as v_un \gset
select tests.authenticate_as_service();
select is((select count(*)::int from public.revisao_envios_de_atualizacao_para_aplicar(1000) where submission_id = :'v_un'), 0, '"não apto" não entra na fila de aplicar');
select is(
  (public.revisao_aplicar_atualizacao(:'v_un', tests.review_of(:'v_un'), tests.sha_do_envio(:'v_un'), :'v_texto_novo'::jsonb))->>'resultado',
  'fora_de_estado', 'e aplicar envio "não apto" não faz nada'
);
select tests.clear_auth();
select is(app.material_snapshot_hash(:'v_m'), :'v_h_depois', '"não apto" não muda nada no ar');

-- Revisão que não vale: outra revisão, outro hash de texto.
select tests.envio_de_atualizacao(:'v_autor', :'v_m', 'revinval ' || :'v_sfx') as v_ur \gset
select tests.authenticate_as_service();
select is((public.revisao_aplicar_atualizacao(:'v_ur', gen_random_uuid(), tests.sha_do_envio(:'v_ur'), :'v_texto_novo'::jsonb))->>'resultado', 'revisao_invalida', 'com outra revisão: recusado');
select is((public.revisao_aplicar_atualizacao(:'v_ur', tests.review_of(:'v_ur'), 'outro-hash', :'v_texto_novo'::jsonb))->>'resultado', 'revisao_invalida', 'com outro texto: recusado');
select is((public.revisao_aplicar_atualizacao(:'v_ur', tests.review_of(:'v_ur'), tests.sha_do_envio(:'v_ur'), '{"title":"x"}'::jsonb))->>'resultado', 'revisao_invalida', 'leitura sem seções: recusado');
select tests.clear_auth();
select is(app.material_snapshot_hash(:'v_m'), :'v_h_depois', 'nada mudou no ar');

-- O material mudou depois do envio (base velha): recusado com recado, nada tocado.
update public.materials set author = 'Autor editado depois' where id = :'v_m';
update public.material_ai_provenance set snapshot_hash = app.material_snapshot_hash(:'v_m') where material_id = :'v_m';
select app.material_snapshot_hash(:'v_m') as v_h_editado \gset
select tests.authenticate_as_service();
select is(
  (public.revisao_aplicar_atualizacao(:'v_ur', tests.review_of(:'v_ur'), tests.sha_do_envio(:'v_ur'), :'v_texto_novo'::jsonb))->>'resultado',
  'recusado', 'o material mudou depois do envio: a atualização (sobre a versão velha) é recusada'
);
select tests.clear_auth();
select results_eq(
  format($$ select status, publication_note like '%%mudou depois que você enviou%%' from public.material_submissions where id = %L $$, :'v_ur'),
  $$ values ('nao_apto'::text, true) $$, 'o envio vai a "não apto" com o recado leigo'
);
select is(app.material_snapshot_hash(:'v_m'), :'v_h_editado', 'e o material segue como estava');
select ok(app.material_tem_revisao_apto(:'v_m'::uuid), 'com revisão válida para o conteúdo que está no ar');

-- Reenviar (mesmo texto) refaz a base e volta para a REVISÃO (a versão do material mudou desde a revisão).
select tests.authenticate_as(:'v_autor');
select is(tests.affected_rows(format($$ update public.material_submissions set title = title where id = %L $$, :'v_ur')), 1, 'o autor reenvia');
select tests.clear_auth();
select is((select status from public.material_submissions where id = :'v_ur'), 'aguardando_revisao', 'a base mudou: volta à revisão, não a "apto"');
select is((select base_snapshot_hash from public.material_submissions where id = :'v_ur'), :'v_h_editado', 'com a base refeita sobre o material de agora');

-- Um SEGUNDO reenvio, sem revisão nova: a revisão que existe (R1) viu a base ANTIGA; o envio não volta a "apto".
select tests.authenticate_as(:'v_autor');
select is(tests.affected_rows(format($$ update public.material_submissions set title = title where id = %L $$, :'v_ur')), 1, 'o autor reenvia de novo');
select tests.clear_auth();
select is((select status from public.material_submissions where id = :'v_ur'), 'aguardando_revisao', 'a revisão antiga viu a base antiga: o 2º reenvio não volta a "apto" com ela');
-- Mesmo forçando "apto" (o servidor é a última defesa), a aplicação exige base atual = base da revisão.
select base_snapshot_hash as v_base_r1 from public.material_reviews where id = tests.review_of(:'v_ur') \gset
select isnt(:'v_base_r1'::text, :'v_h_editado'::text, 'a revisão R1 guardou a base antiga (a do envio quando foi reservada)');
update public.material_submissions set status = 'apto' where id = :'v_ur';
select tests.authenticate_as_service();
select is((select count(*)::int from public.revisao_envios_de_atualizacao_para_aplicar(1000) where submission_id = :'v_ur'), 0, 'o envio com revisão de outra base está fora da fila de aplicar');
select is(
  (public.revisao_aplicar_atualizacao(:'v_ur', tests.review_of(:'v_ur'), tests.sha_do_envio(:'v_ur'), :'v_texto_novo'::jsonb))->>'resultado',
  'revisao_invalida', 'e aplicar com a revisão de outra base é recusado'
);
select tests.clear_auth();
select is(app.material_snapshot_hash(:'v_m'), :'v_h_editado'::text, 'nada mudou no ar (a edição do admin não foi pisada)');
update public.material_submissions set status = 'nao_apto' where id = :'v_ur';
-- Uma revisão NOVA (reservada com a base de agora) aprova: aí sim o reenvio volta a "apto" sem outra revisão.
insert into public.material_reviews (submission_id, content_sha256, status, verdict, model, completed_at)
select s.id, s.content_sha256, 'concluida', 'apto', 'claude-opus-5-5', now() from public.material_submissions s where s.id = :'v_ur';
select is((select base_snapshot_hash from public.material_reviews where id = tests.review_of(:'v_ur')), :'v_h_editado'::text, 'a revisão nova guarda a base de agora');
select tests.authenticate_as(:'v_autor');
select is(tests.affected_rows(format($$ update public.material_submissions set title = title where id = %L $$, :'v_ur')), 1, 'o autor reenvia depois da revisão nova');
select tests.clear_auth();
select is((select status from public.material_submissions where id = :'v_ur'), 'apto', 'com a revisão da base de agora, o envio volta a "apto"');

-- O material mudou de lugar depois do envio: recusado.
select tests.envio_de_atualizacao(:'v_autor', :'v_m', 'lugar ' || :'v_sfx') as v_ul \gset
update public.materials set theme_id = :'v_theme_b' where id = :'v_m';
select tests.authenticate_as_service();
select is(
  (public.revisao_aplicar_atualizacao(:'v_ul', tests.review_of(:'v_ul'), tests.sha_do_envio(:'v_ul'), :'v_texto_novo'::jsonb))->>'resultado',
  'recusado', 'o material mudou de lugar depois do envio: recusado'
);
select tests.clear_auth();
select ok((select publication_note like '%mudou de lugar%' from public.material_submissions where id = :'v_ul'), 'com o recado dizendo o motivo');
update public.materials set theme_id = :'v_theme' where id = :'v_m';
update public.material_ai_provenance set snapshot_hash = app.material_snapshot_hash(:'v_m') where material_id = :'v_m';

-- Título de outro material.
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Outro material 44B ' || :'v_sfx');
select tests.envio_de_atualizacao(:'v_autor', :'v_m', 'titulo ' || :'v_sfx') as v_ut \gset
select tests.authenticate_as_service();
select is(
  (public.revisao_aplicar_atualizacao(:'v_ut', tests.review_of(:'v_ut'), tests.sha_do_envio(:'v_ut'),
     jsonb_set(:'v_texto_novo'::jsonb, '{title}', to_jsonb('OUTRO material 44B ' || :'v_sfx'))))->>'resultado',
  'recusado', 'título que já é de outro material: recusado'
);
select tests.clear_auth();
select ok((select publication_note like '%Já existe outro material%' from public.material_submissions where id = :'v_ut'), 'com o recado dizendo o motivo');
select is((select title from public.materials where id = :'v_m'), 'Base 44B ' || :'v_sfx', 'e o título do material não mudou');
-- A mesma normalização da importação (sem acento, sem maiúscula, espaços colapsados), e rascunho também conta.
select tests.envio_de_atualizacao(:'v_autor', :'v_m', 'titulo2 ' || :'v_sfx') as v_ut2 \gset
select tests.authenticate_as_service();
select is(
  (public.revisao_aplicar_atualizacao(:'v_ut2', tests.review_of(:'v_ut2'), tests.sha_do_envio(:'v_ut2'),
     jsonb_set(:'v_texto_novo'::jsonb, '{title}', to_jsonb('  Óutro    MATERIAL 44B ' || :'v_sfx'))))->>'resultado',
  'recusado', 'título que só difere em acento, maiúscula e espaços de um material (rascunho) já existente: recusado'
);
select tests.clear_auth();
select ok((select publication_note like '%Já existe outro material%' from public.material_submissions where id = :'v_ut2'), 'com o recado dizendo o motivo');

-- Material fora do ar.
select tests.envio_de_atualizacao(:'v_autor', :'v_m', 'fora ' || :'v_sfx') as v_uf \gset
update public.materials set status = 'draft' where id = :'v_m';
select tests.authenticate_as_service();
select is(
  (public.revisao_aplicar_atualizacao(:'v_uf', tests.review_of(:'v_uf'), tests.sha_do_envio(:'v_uf'), :'v_texto_novo'::jsonb))->>'resultado',
  'recusado', 'material despublicado depois do envio: recusado'
);
select tests.clear_auth();
select ok((select publication_note like '%não está mais publicado%' from public.material_submissions where id = :'v_uf'), 'com o recado dizendo o motivo');
update public.materials set status = 'published' where id = :'v_m';

-- Falha no meio: nada muda (tudo ou nada) e o envio vai a "erro" (recuperável sem nova revisão).
select tests.envio_de_atualizacao(:'v_autor', :'v_m', 'falha ' || :'v_sfx') as v_uq \gset
select app.material_snapshot_hash(:'v_m') as v_h_pre_falha \gset
select tests.authenticate_as_service();
select is(
  (public.revisao_aplicar_atualizacao(:'v_uq', tests.review_of(:'v_uq'), tests.sha_do_envio(:'v_uq'),
     jsonb_set(:'v_texto_novo'::jsonb, '{sections}', jsonb_build_array(
       jsonb_build_object('title', 'Seção 1', 'content', 'Texto trocado no meio', 'key_takeaways', '[]'::jsonb),
       jsonb_build_object('title', 'Seção quebrada', 'content', '', 'key_takeaways', '[]'::jsonb)))))->>'resultado',
  'falhou', 'erro no meio da aplicação: falhou'
);
select tests.clear_auth();
select is(app.material_snapshot_hash(:'v_m'), :'v_h_pre_falha', 'tudo o que o bloco fez foi desfeito: o material está como estava');
select is((select content from public.material_sections where id = :'v_s1'), 'Texto da seção 1', 'inclusive a seção que ele já tinha mexido');
select results_eq(
  format($$ select status, publication_note like '%%não foi alterado%%' from public.material_submissions where id = %L $$, :'v_uq'),
  $$ values ('erro'::text, true) $$, 'o envio vai a "erro", com o recado leigo'
);
select ok(app.material_tem_revisao_apto(:'v_m'::uuid), 'o material continua com revisão válida para o conteúdo no ar');
select tests.authenticate_as(:'v_autor');
select is(tests.affected_rows(format($$ update public.material_submissions set title = title where id = %L $$, :'v_uq')), 1, '"Tentar de novo" com o mesmo texto');
select tests.clear_auth();
select is((select status from public.material_submissions where id = :'v_uq'), 'apto', 'sem mudar texto, lugar nem base, a revisão continua valendo: volta a "apto" sem nova revisão');
select is((select count(*)::int from public.material_reviews where submission_id = :'v_uq'), 1, 'e sem pagar outra revisão');

-- ---------------------------------------------------------------------------
-- 6. Material antigo (sem revisão de IA) e a regra da revisão mais recente
-- ---------------------------------------------------------------------------
-- Um material que já estava no ar antes da trava (só a atestação humana): o admin o atualiza pelo revisor.
insert into public.materials (discipline_id, theme_id, title, subtitle, tags) values (:'v_disc', :'v_theme', 'Antigo 44B ' || :'v_sfx', 'sub', array['x']) returning id as v_old \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_old', 0, 'Parte única', 'Texto antigo.');
update public.materials set status = 'published' where id = :'v_old';
select is(app.material_tem_revisao_apto(:'v_old'::uuid), false, 'o material antigo não tem revisão de IA');
select tests.envio_de_atualizacao(:'v_admin', :'v_old', 'antigo ' || :'v_sfx') as v_uo \gset
select tests.authenticate_as_service();
select is(
  (public.revisao_aplicar_atualizacao(:'v_uo', tests.review_of(:'v_uo'), tests.sha_do_envio(:'v_uo'),
     jsonb_build_object('title', 'Antigo 44B ' || :'v_sfx', 'subtitle', 'sub', 'tags', jsonb_build_array('x'),
       'sections', jsonb_build_array(jsonb_build_object('title', 'Parte única', 'content', 'Texto reescrito.', 'key_takeaways', '[]'::jsonb)),
       'references', '[]'::jsonb)))->>'resultado',
  'aplicado', 'o admin atualiza um material antigo pelo revisor de IA'
);
select tests.clear_auth();
select ok(app.material_tem_revisao_apto(:'v_old'::uuid), 'e o material antigo passa a ter revisão de IA "apto" para o conteúdo novo');

-- Só vale a revisão MAIS RECENTE do texto (a regra da 44-H3 vale para o envio de atualização).
select tests.envio_de_atualizacao(:'v_autor', :'v_m', 'recente ' || :'v_sfx') as v_ux \gset
insert into public.material_reviews (submission_id, content_sha256, status, verdict, model, completed_at)
select s.id, s.content_sha256, 'concluida', 'nao_apto', 'claude-opus-5-5', now() + interval '1 minute' from public.material_submissions s where s.id = :'v_ux';
update public.material_submissions set status = 'apto' where id = :'v_ux';
select is(app.revisao_apto_do_envio(:'v_ux'::uuid), null::uuid, 'um "não apto" mais novo do mesmo texto desfaz o "apto" antigo, mesmo forçando o estado');
select tests.authenticate_as_service();
select is((select count(*)::int from public.revisao_envios_de_atualizacao_para_aplicar(1000) where submission_id = :'v_ux'), 0, 'e o envio está fora da fila de aplicar');
select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- 7. Posições: ida e volta sem mudança não renumera (AGENTS.md, risco 17)
-- ---------------------------------------------------------------------------
-- Material como o do seed: posições fora de 0..n-1 (seções nas posições 1 e 3; referências em 5 e 9).
insert into public.materials (discipline_id, theme_id, title, subtitle, tags) values (:'v_disc', :'v_theme', 'Posições 44B ' || :'v_sfx', 'sub', array['x']) returning id as v_pos \gset
insert into public.material_sections (material_id, sort_order, title, content, key_takeaways) values
  (:'v_pos', 1, 'Primeira', 'Texto 1.', array['a']), (:'v_pos', 3, 'Segunda', 'Texto 2.', array['b']);
insert into public.material_references (material_id, citation_text, sort_order) values
  (:'v_pos', 'Ref A', 5), (:'v_pos', 'Ref B', 9);
update public.materials set status = 'published' where id = :'v_pos';
select app.material_snapshot_hash(:'v_pos') as v_h_pos \gset
select tests.envio_de_atualizacao(:'v_admin', :'v_pos', 'pos-igual ' || :'v_sfx') as v_up1 \gset
select tests.leitura_do_material(:'v_pos')::text as v_texto_pos \gset
select tests.authenticate_as_service();
select is(
  (public.revisao_aplicar_atualizacao(:'v_up1', tests.review_of(:'v_up1'), tests.sha_do_envio(:'v_up1'), :'v_texto_pos'::jsonb))->>'resultado',
  'sem_mudanca', 'arquivo igual ao do ar, num material com posições fora de 0..n-1: sem mudança'
);
select tests.clear_auth();
select is(app.material_snapshot_hash(:'v_pos'), :'v_h_pos'::text, 'o hash do material é o mesmo (nada foi renumerado)');
select is((select count(*)::int from public.material_ai_provenance where material_id = :'v_pos'), 0, 'e nenhuma proveniência nova foi gravada');
select results_eq(
  format($$ select title, sort_order from public.material_sections where material_id = %L order by sort_order $$, :'v_pos'),
  $$ values ('Primeira'::text, 1), ('Segunda'::text, 3) $$, 'as posições das seções continuam as de antes'
);
select results_eq(
  format($$ select citation_text, sort_order from public.material_references where material_id = %L order by sort_order $$, :'v_pos'),
  $$ values ('Ref A'::text, 5), ('Ref B'::text, 9) $$, 'as posições das referências continuam as de antes'
);

-- Seção e referência novas no FIM: entram depois da última, sem mexer nas que ficam.
select tests.envio_de_atualizacao(:'v_admin', :'v_pos', 'pos-fim ' || :'v_sfx') as v_up2 \gset
select jsonb_set(jsonb_set(:'v_texto_pos'::jsonb, '{sections}',
         (:'v_texto_pos'::jsonb->'sections') || jsonb_build_array(jsonb_build_object('title', 'Terceira', 'content', 'Texto 3.', 'key_takeaways', '[]'::jsonb))),
         '{references}', (:'v_texto_pos'::jsonb->'references') || jsonb_build_array('Ref C'))::text as v_texto_pos2 \gset
select tests.authenticate_as_service();
select is(
  (public.revisao_aplicar_atualizacao(:'v_up2', tests.review_of(:'v_up2'), tests.sha_do_envio(:'v_up2'), :'v_texto_pos2'::jsonb))->>'resultado',
  'aplicado', 'seção e referência novas no fim: aplicado'
);
select tests.clear_auth();
select results_eq(
  format($$ select title, sort_order from public.material_sections where material_id = %L order by sort_order $$, :'v_pos'),
  $$ values ('Primeira'::text, 1), ('Segunda'::text, 3), ('Terceira'::text, 4) $$, 'as que ficam mantêm a posição e a nova entra depois da última'
);
select results_eq(
  format($$ select citation_text, sort_order from public.material_references where material_id = %L order by sort_order $$, :'v_pos'),
  $$ values ('Ref A'::text, 5), ('Ref B'::text, 9), ('Ref C'::text, 10) $$, 'o mesmo para as referências'
);

-- Ordem trocada: aí as posições mudam (0..n-1, na ordem do arquivo), e é uma mudança de verdade.
select tests.envio_de_atualizacao(:'v_admin', :'v_pos', 'pos-ordem ' || :'v_sfx') as v_up3 \gset
select jsonb_set(:'v_texto_pos2'::jsonb, '{sections}',
         jsonb_build_array((:'v_texto_pos2'::jsonb->'sections'->1), (:'v_texto_pos2'::jsonb->'sections'->0), (:'v_texto_pos2'::jsonb->'sections'->2)))::text as v_texto_pos3 \gset
select tests.authenticate_as_service();
select is(
  (public.revisao_aplicar_atualizacao(:'v_up3', tests.review_of(:'v_up3'), tests.sha_do_envio(:'v_up3'), :'v_texto_pos3'::jsonb))->>'resultado',
  'aplicado', 'ordem das seções trocada: aplicado'
);
select tests.clear_auth();
select results_eq(
  format($$ select title, sort_order from public.material_sections where material_id = %L order by sort_order $$, :'v_pos'),
  $$ values ('Segunda'::text, 0), ('Primeira'::text, 1), ('Terceira'::text, 2) $$, 'com a ordem trocada, as posições seguem o arquivo'
);

-- RLS: o envio de atualização é do autor (e do admin), de mais ninguém.
select tests.authenticate_as(:'v_outro');
select is((select count(*)::int from public.material_submissions where id = :'v_u1'), 0, 'outra pessoa não vê o envio de atualização');
select tests.clear_auth();
select tests.authenticate_as(:'v_admin');
select is((select count(*)::int from public.material_submissions where id = :'v_u1'), 1, 'o admin vê');
select tests.clear_auth();

-- Devolve os tetos como estavam.
update public.review_settings set monthly_review_cap = :'v_cap_orig', daily_review_cap_per_user = :'v_daily_orig';

select * from finish();
