-- ============================================================================
-- P10 — a questão do arquivo se liga à SEÇÃO do material (migration 20261003121200)
--
-- As duas funções que publicam um envio de questões (do admin e do revisor) ligam
-- cada questão à seção citada em "Materiais cobertos" (`material_links`):
--   1. seção achada pelo título dentro do material (sem acento, sem caixa, espaços);
--   2. seção que não existe, ou com título repetido no material, ou duas seções do
--      mesmo material: o lote inteiro é recusado com um motivo claro, nada é criado;
--   3. envio sem seção (só `material_titles`, ou só os materiais escolhidos na tela)
--      funciona como antes: ligação com o material inteiro.
-- ============================================================================

create extension if not exists pgtap;
create schema if not exists tests;
select plan(28);

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

-- Um envio de questões "apto" (com revisão concluída do texto atual).
create or replace function tests.p10_envio(p_author uuid, p_title text, p_material_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.question_submissions (author_id, title, content_md, material_ids, status)
  values (p_author, p_title, '## Questão 1' || E'\n' || p_title, p_material_ids, 'apto') returning id into v_id;
  insert into public.material_reviews (question_submission_id, content_sha256, status, verdict, model, completed_at)
  select s.id, s.content_sha256, 'concluida', 'apto', 'claude-opus-5-5', now()
    from public.question_submissions s where s.id = v_id;
  return v_id;
end;
$$;

create or replace function tests.p10_sha(p_submission uuid)
returns text
language sql
security definer
set search_path = ''
as $$ select content_sha256 from public.question_submissions where id = p_submission; $$;

-- A leitura de UMA questão do arquivo, com as ligações dadas (`material_links`).
create or replace function tests.p10_leitura(p_disc uuid, p_theme uuid, p_stem text, p_links jsonb, p_titles jsonb default null)
returns jsonb
language sql
as $$
  select jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
    'discipline_id', p_disc, 'theme_id', p_theme, 'cycle', 'internato_residencia', 'difficulty', 'medio',
    'institution', 'NexusMed (questão autoral)', 'year', null,
    'clinical_vignette', 'Caso', 'question_stem', p_stem,
    'general_commentary', 'Comentário. Fonte: https://exemplo.gov.br/diretriz',
    'high_yield_summary', 'Pérola',
    'tags', jsonb_build_array('teste', 'p10'),
    'material_titles', coalesce(p_titles, (select coalesce(jsonb_agg(l->'title'), '[]'::jsonb) from jsonb_array_elements(p_links) l)),
    'material_links', p_links,
    'options', jsonb_build_array(
      jsonb_build_object('letter', 'A', 'text', 'Alternativa A', 'explanation', 'Errada: motivo A', 'is_correct', false),
      jsonb_build_object('letter', 'B', 'text', 'Alternativa B', 'explanation', 'Certa: motivo B', 'is_correct', true)
    )
  )));
$$;

grant execute on all functions in schema tests to public;

select tests.clear_auth();
select tests.create_user('p10q.admin@test.local', 'admin', 'active') as v_admin \gset
select tests.create_user('p10q.autor@test.local', 'student', 'active') as v_autor \gset
select substr(gen_random_uuid()::text, 1, 8) as v_sfx \gset

insert into public.disciplines (name, code, cycle) values ('Disciplina P10Q', 'P10Q-' || :'v_sfx', 'clinico') returning id as v_disc \gset
insert into public.themes (discipline_id, name) values (:'v_disc', 'Tema P10Q') returning id as v_theme \gset

-- Material A (publicado): duas seções diferentes e duas com o mesmo título (repetidas).
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Material A P10 ' || :'v_sfx') returning id as v_mat_a \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_mat_a', 0, 'Padrão obstrutivo', 'x') returning id as v_sec_obs \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_mat_a', 1, 'Padrão restritivo', 'x') returning id as v_sec_res \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_mat_a', 2, 'Conduta', 'x'), (:'v_mat_a', 3, 'conduta', 'x');
select tests.force_publish_material(:'v_mat_a');
-- Material B (publicado): uma seção.
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Material B P10 ' || :'v_sfx') returning id as v_mat_b \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_mat_b', 0, 'Única', 'x') returning id as v_sec_b \gset
select tests.force_publish_material(:'v_mat_b');
select 'Material A P10 ' || :'v_sfx' as v_title_a \gset
select 'Material B P10 ' || :'v_sfx' as v_title_b \gset

-- ----------------------------------------------------------------------------
-- Funções de apoio
-- ----------------------------------------------------------------------------
select is(app.titulo_normalizado('  PADRÃO   Obstrutivo '), 'padrao obstrutivo', 'o título é comparado sem acento, sem caixa e sem espaços repetidos');
select is(has_function_privilege('authenticated', 'app.resolver_ligacoes_de_questao(jsonb,uuid[],int)', 'execute'), false, 'quem está logado não chama o resolvedor de ligações');
select is(has_function_privilege('anon', 'app.resolver_ligacoes_de_questao(jsonb,uuid[],int)', 'execute'), false, 'anon também não');

-- ----------------------------------------------------------------------------
-- Admin: a seção do arquivo vira a ligação com a seção
-- ----------------------------------------------------------------------------
select tests.p10_envio(:'v_autor', 'Lote P10 com seção ' || :'v_sfx', '{}'::uuid[]) as v_e1 \gset
select tests.authenticate_as(:'v_admin');
select (public.admin_publicar_questoes(
  :'v_e1', tests.p10_sha(:'v_e1'),
  tests.p10_leitura(:'v_disc', :'v_theme', 'Enunciado com seção',
    jsonb_build_array(
      jsonb_build_object('title', :'v_title_a', 'section_title', '  padrao   OBSTRUTIVO '),
      jsonb_build_object('title', :'v_title_b', 'section_title', null)))
))->>'resultado' as v_r1 \gset
select tests.clear_auth();
select is(:'v_r1'::text, 'publicado', 'admin publica o lote com "Material > Seção"');
select published_question_ids[1] as v_q1 from public.question_submissions where id = :'v_e1' \gset
select results_eq(
  format($$ select material_id::text, material_section_id::text, sort_order from public.question_materials where question_id = %L order by sort_order $$, :'v_q1'),
  format($$ values (%L::text, %L::text, 0), (%L::text, null::text, 1) $$, :'v_mat_a', :'v_sec_obs', :'v_mat_b'),
  'a questão fica ligada à seção citada no material A e ao material B inteiro, na ordem do arquivo'
);

-- Só material_titles (arquivo antigo): ligação com o material inteiro, como antes.
select tests.p10_envio(:'v_autor', 'Lote P10 so titulo ' || :'v_sfx', '{}'::uuid[]) as v_e2 \gset
select tests.authenticate_as(:'v_admin');
select (public.admin_publicar_questoes(
  :'v_e2', tests.p10_sha(:'v_e2'),
  (select jsonb_build_array(((tests.p10_leitura(:'v_disc', :'v_theme', 'Enunciado só título', '[]'::jsonb, jsonb_build_array(:'v_title_a')))->0) - 'material_links'))
))->>'resultado' as v_r2 \gset
select tests.clear_auth();
select is(:'v_r2'::text, 'publicado', 'arquivo antigo (só material_titles) continua sendo publicado');
select published_question_ids[1] as v_q2 from public.question_submissions where id = :'v_e2' \gset
select results_eq(
  format($$ select material_id::text, material_section_id::text from public.question_materials where question_id = %L $$, :'v_q2'),
  format($$ values (%L::text, null::text) $$, :'v_mat_a'),
  'ligada ao material inteiro, sem seção'
);

-- Sem título no arquivo: os materiais escolhidos na tela, sem seção.
select tests.p10_envio(:'v_autor', 'Lote P10 escolhido ' || :'v_sfx', array[:'v_mat_b']::uuid[]) as v_e3 \gset
select tests.authenticate_as(:'v_admin');
select (public.admin_publicar_questoes(
  :'v_e3', tests.p10_sha(:'v_e3'),
  tests.p10_leitura(:'v_disc', :'v_theme', 'Enunciado escolhido', '[]'::jsonb, '[]'::jsonb)
))->>'resultado' as v_r3 \gset
select tests.clear_auth();
select is(:'v_r3'::text, 'publicado', 'sem material no arquivo, vale o escolhido na tela');
select published_question_ids[1] as v_q3 from public.question_submissions where id = :'v_e3' \gset
select results_eq(
  format($$ select material_id::text, material_section_id::text from public.question_materials where question_id = %L $$, :'v_q3'),
  format($$ values (%L::text, null::text) $$, :'v_mat_b'),
  'ligada ao material escolhido, sem seção'
);

-- ----------------------------------------------------------------------------
-- Admin: o que recusa o lote inteiro, sem criar nada
-- ----------------------------------------------------------------------------
select tests.p10_envio(:'v_autor', 'Lote P10 inexistente ' || :'v_sfx', '{}'::uuid[]) as v_e4 \gset
select tests.authenticate_as(:'v_admin');
select public.admin_publicar_questoes(
  :'v_e4', tests.p10_sha(:'v_e4'),
  tests.p10_leitura(:'v_disc', :'v_theme', 'Enunciado seção inexistente ' || :'v_sfx',
    jsonb_build_array(jsonb_build_object('title', :'v_title_a', 'section_title', 'Padrão misto')))
) as v_r4 \gset
select tests.clear_auth();
select is((:'v_r4'::jsonb)->>'resultado', 'recusado', 'seção que não existe no material: o lote é recusado');
select matches((:'v_r4'::jsonb)->>'motivo', 'a seção “Padrão misto” não existe no material', 'com um motivo que diz a seção e o material');
select is((select count(*)::int from public.questions where question_stem = 'Enunciado seção inexistente ' || :'v_sfx'), 0, 'e nenhuma questão foi criada');
select is((select status from public.question_submissions where id = :'v_e4'), 'apto', 'o envio recusado pelo admin continua como estava');

select tests.p10_envio(:'v_autor', 'Lote P10 repetida ' || :'v_sfx', '{}'::uuid[]) as v_e5 \gset
select tests.authenticate_as(:'v_admin');
select public.admin_publicar_questoes(
  :'v_e5', tests.p10_sha(:'v_e5'),
  tests.p10_leitura(:'v_disc', :'v_theme', 'Enunciado seção repetida ' || :'v_sfx',
    jsonb_build_array(jsonb_build_object('title', :'v_title_a', 'section_title', 'CONDUTA')))
) as v_r5 \gset
select tests.clear_auth();
select is((:'v_r5'::jsonb)->>'resultado', 'recusado', 'seção com título repetido no material: o lote é recusado');
select matches((:'v_r5'::jsonb)->>'motivo', 'mais de uma seção chamada', 'dizendo que há mais de uma seção com esse título');

select tests.p10_envio(:'v_autor', 'Lote P10 duas secoes ' || :'v_sfx', '{}'::uuid[]) as v_e6 \gset
select tests.authenticate_as(:'v_admin');
select public.admin_publicar_questoes(
  :'v_e6', tests.p10_sha(:'v_e6'),
  tests.p10_leitura(:'v_disc', :'v_theme', 'Enunciado duas seções ' || :'v_sfx',
    jsonb_build_array(
      jsonb_build_object('title', :'v_title_a', 'section_title', 'Padrão obstrutivo'),
      jsonb_build_object('title', :'v_title_a', 'section_title', 'Padrão restritivo')))
) as v_r6 \gset
select tests.clear_auth();
select is((:'v_r6'::jsonb)->>'resultado', 'recusado', 'o mesmo material com duas seções diferentes: o lote é recusado');
select matches((:'v_r6'::jsonb)->>'motivo', 'aparece com mais de uma seção', 'com o motivo dito');

-- ----------------------------------------------------------------------------
-- Revisor (service_role): a mesma ligação
-- ----------------------------------------------------------------------------
select tests.p10_envio(:'v_autor', 'Lote P10 revisor ' || :'v_sfx', '{}'::uuid[]) as v_e7 \gset
select app.revisao_apto_do_envio_de_questoes(:'v_e7') as v_review7 \gset
select tests.authenticate_as_service();
select (public.revisao_publicar_questoes(
  :'v_e7', :'v_review7', tests.p10_sha(:'v_e7'),
  tests.p10_leitura(:'v_disc', :'v_theme', 'Enunciado revisor',
    jsonb_build_array(jsonb_build_object('title', :'v_title_a', 'section_title', 'Padrão restritivo')))
))->>'resultado' as v_r7 \gset
select tests.clear_auth();
select is(:'v_r7'::text, 'publicado', 'o revisor publica o lote com "Material > Seção"');
select published_question_ids[1] as v_q7 from public.question_submissions where id = :'v_e7' \gset
select results_eq(
  format($$ select material_id::text, material_section_id::text from public.question_materials where question_id = %L $$, :'v_q7'),
  format($$ values (%L::text, %L::text) $$, :'v_mat_a', :'v_sec_res'),
  'e a questão fica ligada à seção'
);

select tests.p10_envio(:'v_autor', 'Lote P10 revisor inexistente ' || :'v_sfx', '{}'::uuid[]) as v_e8 \gset
select app.revisao_apto_do_envio_de_questoes(:'v_e8') as v_review8 \gset
select tests.authenticate_as_service();
select public.revisao_publicar_questoes(
  :'v_e8', :'v_review8', tests.p10_sha(:'v_e8'),
  tests.p10_leitura(:'v_disc', :'v_theme', 'Enunciado revisor seção inexistente ' || :'v_sfx',
    jsonb_build_array(jsonb_build_object('title', :'v_title_a', 'section_title', 'Não existe')))
) as v_r8 \gset
select tests.clear_auth();
select is((:'v_r8'::jsonb)->>'resultado', 'recusado', 'revisor: seção inexistente recusa o lote');
select matches((:'v_r8'::jsonb)->>'motivo', 'não existe no material', 'com o motivo dito');
select is((select status from public.question_submissions where id = :'v_e8'), 'nao_apto', 'e o envio sai da fila como "não apto", com o recado');
select matches((select publication_note from public.question_submissions where id = :'v_e8'), 'não existe no material', 'o recado para a pessoa é o motivo');
select is((select count(*)::int from public.questions where question_stem = 'Enunciado revisor seção inexistente ' || :'v_sfx'), 0, 'nada foi criado');

-- Privilégios das duas funções continuam como eram.
select is(has_function_privilege('authenticated', 'public.revisao_publicar_questoes(uuid, uuid, text, jsonb)', 'execute'), false, 'revisao_publicar_questoes continua fora do alcance de quem está logado');
select is(has_function_privilege('service_role', 'public.revisao_publicar_questoes(uuid, uuid, text, jsonb)', 'execute'), true, 'e do service_role');
select is(has_function_privilege('anon', 'public.admin_publicar_questoes(uuid, text, jsonb)', 'execute'), false, 'admin_publicar_questoes continua fora do alcance de anon');
select is(has_function_privilege('authenticated', 'public.admin_publicar_questoes(uuid, text, jsonb)', 'execute'), true, 'e dentro do de authenticated (a função confere o admin)');

select * from finish();
