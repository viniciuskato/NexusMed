-- ============================================================================
-- 45-K — Editar material publicado sem mudar o que o estudante lê
-- Salvar com mudança de conteúdo um material publicado guarda a edição à parte
-- (`material_pending_edits`); o estudante segue lendo a versão atestada; a
-- aprovação da revisão faz a edição entrar de uma vez, com o hash aprovado.
-- ============================================================================

create extension if not exists pgtap;
select plan(46);

select tests.clear_auth();
select tests.create_user('pendente.admin@test.local', 'admin', 'active') as v_admin \gset
select tests.create_user('pendente.student@test.local', 'student', 'active') as v_student \gset

insert into public.disciplines (name, code, cycle)
values ('Disciplina Pendente', 'PEND-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_disc \gset
insert into public.themes (discipline_id, name) values (:'v_disc', 'Tema Pendente') returning id as v_theme \gset

\set v_mat '\'45000000-0000-4000-8000-000000000001\''
\set v_s1 '\'45000000-0000-4000-8000-0000000000a1\''
\set v_s2 '\'45000000-0000-4000-8000-0000000000a2\''
\set v_s3 '\'45000000-0000-4000-8000-0000000000a3\''

-- Carga do formulário: material + seções + referências (como o app manda).
create temp table cargas (nome text primary key, m jsonb, s jsonb, r jsonb);
grant all on cargas to authenticated;
insert into cargas values
  ('base',
   jsonb_build_object('id', :v_mat, 'discipline_id', :'v_disc', 'theme_id', :'v_theme', 'title', 'Ceftriaxona',
     'subtitle', 'Cefalosporina de 3ª geração', 'mode', null, 'study_lens', null, 'module_number', null,
     'estimated_read_time_minutes', 12, 'author', 'Equipe', 'tags', '["C3G"]'::jsonb,
     'parent_material_id', null, 'tree_sort_order', 0, 'nav_short_title', null, 'taxonomy_kind', null,
     'navigation_links', '[]'::jsonb),
   jsonb_build_array(
     jsonb_build_object('id', :v_s1, 'title', 'Espectro', 'content', 'Texto atestado 1.', 'key_takeaways', '[]'::jsonb),
     jsonb_build_object('id', :v_s2, 'title', 'Dose', 'content', 'Texto atestado 2.', 'key_takeaways', '[]'::jsonb)),
   '[{"citation_text": "Ref A"}]'::jsonb);
insert into cargas
select 'edicao', m,
  jsonb_build_array(
    jsonb_build_object('id', :v_s1, 'title', 'Espectro', 'content', 'Texto NOVO 1.', 'key_takeaways', '[]'::jsonb),
    jsonb_build_object('id', :v_s3, 'title', 'Nova seção', 'content', 'Texto novo 3.', 'key_takeaways', '[]'::jsonb)),
  '[{"citation_text": "Ref A"}, {"citation_text": "Ref B nova"}]'::jsonb
from cargas where nome = 'base';
insert into cargas select 'estrutural', m || '{"tree_sort_order": 7}'::jsonb, s, r from cargas where nome = 'base';

create temp view v_texto as
  select string_agg(content, ' | ' order by sort_order) as t from public.material_sections where material_id = '45000000-0000-4000-8000-000000000001';
grant select on v_texto to authenticated;

-- Material nasce rascunho pelo próprio save_compendium, e é publicado atestado.
select tests.authenticate_as(:'v_admin');
select is((select public.save_compendium(m, s, r) from cargas where nome = 'base'), 'aplicado', 'rascunho é gravado direto');
select tests.clear_auth();
select tests.force_publish_material(:v_mat);
insert into public.notes (user_id, material_section_id, note_text) values (:'v_student', :v_s2, 'anotação na seção 2');
select encode(extensions.digest(app.build_material_snapshot(:v_mat)::text, 'sha256'), 'hex') as v_hash_atestado \gset

-- Estrutura e permissões
select has_table('public', 'material_pending_edits', 'tabela de edição pendente existe');
select ok(not has_table_privilege('anon', 'public.material_pending_edits', 'select'), 'anon não lê edição pendente');

-- "Salvar" sem mudança: no-op, nada pendente.
select tests.authenticate_as(:'v_admin');
select is((select public.save_compendium(m, s, r) from cargas where nome = 'base'), 'aplicado', 'salvar sem mudança não cria edição pendente');
select is((select count(*)::int from public.material_pending_edits), 0, 'nenhuma edição pendente');
select is(encode(extensions.digest(app.build_material_snapshot(:v_mat)::text, 'sha256'), 'hex'), :'v_hash_atestado', 'hash atestado intacto');

-- Mudança só estrutural (fora do hash): vale na hora.
select is((select public.save_compendium(m, s, r) from cargas where nome = 'estrutural'), 'aplicado', 'mudança só estrutural vale na hora');
select is((select tree_sort_order from public.materials where id = :v_mat), 7, 'posição na árvore mudou');
select is((select count(*)::int from public.material_pending_edits), 0, 'sem edição pendente por mudança estrutural');

-- Mudança de conteúdo: fica à parte.
select is((select public.save_compendium(m || '{"tree_sort_order": 7}'::jsonb, s, r) from cargas where nome = 'edicao'), 'pendente',
  'salvar mudança de conteúdo guarda a edição à parte');
select is((select count(*)::int from public.material_pending_edits where material_id = :v_mat), 1, 'uma edição pendente');
select is((select t from v_texto), 'Texto atestado 1. | Texto atestado 2.', 'tabelas do estudante continuam com a versão atestada');
select ok(app.has_current_approved_revision(:v_mat, null), 'atestação da versão publicada continua valendo');
select is(public.get_provenance_status(:v_mat, null), 'edicao_pendente', 'status: edição pendente, ainda sem revisão');
select tests.clear_auth();

-- Estudante: não vê a edição pendente em lugar nenhum.
select tests.authenticate_as(:'v_student');
select is((select t from v_texto), 'Texto atestado 1. | Texto atestado 2.', 'estudante lê a versão atestada');
select is((select count(*)::int from public.material_pending_edits), 0, 'estudante não lê a tabela de edição pendente');
select tests.clear_auth();

-- A revisão cobre a edição pendente; aprovar faz a edição entrar.
select tests.authenticate_as(:'v_admin');
select id as v_rev, snapshot_hash as v_rev_hash from public.create_content_revision(:v_mat, null) \gset
select is(:'v_rev_hash', (select snapshot_hash from public.material_pending_edits where material_id = :v_mat),
  'a revisão atesta o conteúdo da edição pendente');
select is(public.get_provenance_status(:v_mat, null), 'edicao_pendente_em_revisao', 'status: edição pendente em revisão');
select is((select t from v_texto), 'Texto atestado 1. | Texto atestado 2.', 'criar a revisão não muda o que o estudante lê');
select lives_ok(format($$ select public.attest_content_revision(%L, 'aprovado') $$, :'v_rev'), 'aprovar a revisão');
select is((select t from v_texto), 'Texto NOVO 1. | Texto novo 3.', 'aprovada, a edição entra de uma vez');
select is(encode(extensions.digest(app.build_material_snapshot(:v_mat)::text, 'sha256'), 'hex'), :'v_rev_hash',
  'o hash do material depois de a edição entrar é o hash aprovado');
select ok(app.has_current_approved_revision(:v_mat, null), 'material continua atestado');
select is((select status from public.materials where id = :v_mat), 'published', 'material continua publicado');
select is((select count(*)::int from public.material_pending_edits), 0, 'edição pendente consumida');
select results_eq(
  format($$ select id::text from public.material_sections where material_id = %L order by sort_order $$, :v_mat),
  format($$ values (%L::text), (%L::text) $$, :v_s1, :v_s3),
  'seção que continua mantém o id; a nova usa o id da edição'
);
select tests.clear_auth();
select is((select removed_section_title from public.notes where user_id = :'v_student'), 'Dose',
  'anotação da seção que saiu continua, como na 45-D');

-- Descartar volta ao atestado sem mudar nada.
select tests.authenticate_as(:'v_admin');
select public.save_compendium(m || '{"tree_sort_order": 7}'::jsonb, '[{"id": "45000000-0000-4000-8000-0000000000a1", "title": "Espectro", "content": "Rascunho a descartar.", "key_takeaways": []}]'::jsonb, r)
  from cargas where nome = 'edicao';
select lives_ok(format($$ select public.discard_material_pending_edit(%L) $$, :v_mat), 'descartar a edição pendente');
select is((select count(*)::int from public.material_pending_edits), 0, 'nada pendente depois de descartar');
select is((select t from v_texto), 'Texto NOVO 1. | Texto novo 3.', 'descartar não muda o conteúdo atestado');
select tests.clear_auth();

select tests.authenticate_as(:'v_student');
select throws_ok(format($$ select public.discard_material_pending_edit(%L) $$, :v_mat), NULL::char(5), NULL::text,
  'estudante não descarta edição');
select tests.clear_auth();

-- Material não publicado: editado direto, como hoje.
select tests.authenticate_as(:'v_admin');
select public.unpublish_material(:v_mat);
select is((select public.save_compendium(m, s, r) from cargas where nome = 'base'), 'aplicado', 'despublicado grava direto');
select is((select t from v_texto), 'Texto atestado 1. | Texto atestado 2.', 'conteúdo do rascunho mudou na hora');
select tests.clear_auth();

-- Nenhum outro caminho muda o conteúdo publicado (editor de seção, UPDATE direto).
select tests.clear_auth();
select tests.force_publish_material(:v_mat);
select tests.authenticate_as(:'v_admin');
select throws_like(format($$ update public.material_sections set content = 'direto' where id = %L $$, :v_s1),
  '%pendente%', 'seção de material publicado não muda direto');
select throws_like(format($$ update public.materials set title = 'Outro título' where id = %L $$, :v_mat),
  '%pendente%', 'título de material publicado não muda direto');
select tests.clear_auth();
select tests.authenticate_as(:'v_admin');
select public.unpublish_material(:v_mat);
select lives_ok(format($$ update public.material_sections set content = 'rascunho direto' where id = %L $$, :v_s1),
  'seção de rascunho continua editável direto');
select tests.clear_auth();

-- ----------------------------------------------------------------------------
-- Revisão do 8e71e5f (triagem de 27/09)
-- ----------------------------------------------------------------------------
\set v_m2 '\'45000000-0000-4000-8000-000000000002\''
\set v_m2s1 '\'45000000-0000-4000-8000-0000000000b1\''
insert into cargas
select 'm2_base',
  (m || jsonb_build_object('id', :v_m2, 'title', 'Ceftazidima')),
  jsonb_build_array(jsonb_build_object('id', :v_m2s1, 'title', 'Espectro', 'content', 'Atestado m2.', 'key_takeaways', '[]'::jsonb)),
  '[{"citation_text": "Ref A"}]'::jsonb
from cargas where nome = 'base';
insert into cargas
select 'm2_v2', m,
  jsonb_build_array(jsonb_build_object('id', :v_m2s1, 'title', 'Espectro', 'content', 'Edição v2 m2.', 'key_takeaways', '[]'::jsonb)),
  '[{"citation_text": "Ref A"}, {"citation_text": "Ref nova m2"}]'::jsonb
from cargas where nome = 'm2_base';
insert into cargas
select 'm2_v3', m,
  jsonb_build_array(jsonb_build_object('id', :v_m2s1, 'title', 'Espectro', 'content', 'Edição v3 m2.', 'key_takeaways', '[]'::jsonb)),
  r
from cargas where nome = 'm2_v2';

select tests.authenticate_as(:'v_admin');
select public.save_compendium(m, s, r) from cargas where nome = 'm2_base';
select tests.clear_auth();
select tests.force_publish_material(:v_m2);
select tests.authenticate_as(:'v_admin');

-- Item 1: reabrir e salvar a mesma edição (com referência nova) é no-op.
select public.save_compendium(m, s, r) from cargas where nome = 'm2_v2';
select snapshot_hash as v_m2_pend from public.material_pending_edits where material_id = :v_m2 \gset
select id as v_r1 from public.create_content_revision(:v_m2, null) \gset
select public.save_compendium(m, s, r) from cargas where nome = 'm2_v2';
select is((select snapshot_hash from public.material_pending_edits where material_id = :v_m2), :'v_m2_pend',
  'salvar a mesma edição pendente não muda o hash (referência nova mantém o id)');
select is(public.get_provenance_status(:v_m2, null), 'edicao_pendente_em_revisao', 'a revisão aberta continua valendo');

-- Item 4: a navegação vale na hora e a aprovação não a desfaz.
select public.save_compendium(m || '{"tree_sort_order": 30}'::jsonb, s, r) from cargas where nome = 'm2_v2';
select is((select tree_sort_order from public.materials where id = :v_m2), 30, 'posição nova vale na hora, com edição pendente');
select lives_ok(format($$ select public.attest_content_revision(%L, 'aprovado') $$, :'v_r1'), 'aprovar a edição');
select is((select tree_sort_order from public.materials where id = :v_m2), 30, 'aprovar não volta a posição do momento do salvamento');

-- Item 3: revisão reprovada não prende o painel em "em revisão".
select public.save_compendium(m || '{"tree_sort_order": 30}'::jsonb, s, r) from cargas where nome = 'm2_v3';
select id as v_r2 from public.create_content_revision(:v_m2, null) \gset
select public.attest_content_revision(:'v_r2', 'rejeitado');
select is(public.get_provenance_status(:v_m2, null), 'edicao_pendente', 'revisão reprovada: volta a oferecer criar revisão');

-- Item 2: aprovar revisão que não é da edição pendente atual é recusado.
select id as v_r3 from public.create_content_revision(:v_m2, null) \gset
select public.save_compendium(m || '{"tree_sort_order": 30}'::jsonb,
  jsonb_build_array(jsonb_build_object('id', :v_m2s1, 'title', 'Espectro', 'content', 'Edição v4 m2.', 'key_takeaways', '[]'::jsonb)), r)
  from cargas where nome = 'm2_v3';
select throws_like(format($$ select public.attest_content_revision(%L, 'aprovado') $$, :'v_r3'),
  '%não é a da edição pendente%', 'aprovação sem efeito é recusada com mensagem');

-- Item 6: despublicar descarta a edição pendente.
select public.unpublish_material(:v_m2);
select is((select count(*)::int from public.material_pending_edits where material_id = :v_m2), 0,
  'despublicar descarta a edição pendente');
select tests.clear_auth();

-- Item 4, sem referência nova (não depende do item 1): a posição mudada
-- depois de guardar a edição sobrevive à aprovação.
\set v_m3 '\'45000000-0000-4000-8000-000000000003\''
\set v_m3s1 '\'45000000-0000-4000-8000-0000000000c1\''
insert into cargas
select 'm3_base', (m || jsonb_build_object('id', :v_m3, 'title', 'Cefepima', 'tree_sort_order', 0)),
  jsonb_build_array(jsonb_build_object('id', :v_m3s1, 'title', 'Espectro', 'content', 'Atestado m3.', 'key_takeaways', '[]'::jsonb)),
  '[{"citation_text": "Ref A"}]'::jsonb
from cargas where nome = 'base';
select tests.authenticate_as(:'v_admin');
select public.save_compendium(m, s, r) from cargas where nome = 'm3_base';
select tests.clear_auth();
select tests.force_publish_material(:v_m3);
select tests.authenticate_as(:'v_admin');
select public.save_compendium(m,
  jsonb_build_array(jsonb_build_object('id', :v_m3s1, 'title', 'Espectro', 'content', 'Edição m3.', 'key_takeaways', '[]'::jsonb)), r)
  from cargas where nome = 'm3_base';
select id as v_r4 from public.create_content_revision(:v_m3, null) \gset
select public.save_compendium(m || '{"tree_sort_order": 50}'::jsonb,
  jsonb_build_array(jsonb_build_object('id', :v_m3s1, 'title', 'Espectro', 'content', 'Edição m3.', 'key_takeaways', '[]'::jsonb)), r)
  from cargas where nome = 'm3_base';
select public.attest_content_revision(:'v_r4', 'aprovado');
select is((select string_agg(content, '') from public.material_sections where material_id = :v_m3), 'Edição m3.', 'edição m3 entrou');
select is((select tree_sort_order from public.materials where id = :v_m3), 50,
  'a aprovação não volta a posição que a edição tinha ao ser guardada');
select tests.clear_auth();

select * from finish();
