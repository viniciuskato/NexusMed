-- ============================================================================
-- "Salvar" sem perda + importação já posicionada na árvore
-- (migration 20260923120000)
-- ============================================================================

create extension if not exists pgtap;
select plan(23);

select tests.clear_auth();
select tests.create_user('salvar.admin@test.local', 'admin', 'active') as v_admin \gset
select tests.create_user('salvar.student@test.local', 'student', 'active') as v_student \gset

insert into public.disciplines (name, code, cycle)
values ('Disciplina Salvar', 'SALVAR-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_disc \gset
insert into public.themes (discipline_id, name) values (:'v_disc', 'Tema Salvar')
returning id as v_theme \gset
insert into public.disciplines (name, code, cycle)
values ('Outra Disciplina', 'OUTRA-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_other_disc \gset
insert into public.themes (discipline_id, name) values (:'v_other_disc', 'Outro Tema')
returning id as v_other_theme \gset

insert into public.sources (id, citation_text, tipo, verificacao)
values ('fonte-salvar-teste', 'Diretriz curada', 'diretriz_consenso', 'verificada');

insert into public.materials (discipline_id, theme_id, title)
values (:'v_disc', :'v_theme', 'Material do salvar') returning id as v_mat \gset
insert into public.material_sections (material_id, sort_order, title, content)
values (:'v_mat', 0, 'Seção', 'Conteúdo.') returning id as v_sec \gset
insert into public.material_references (material_id, citation_text, sort_order, source_id, url)
values (:'v_mat', 'Referência vinculada', 0, 'fonte-salvar-teste', 'https://exemplo.org/diretriz')
returning id as v_ref_linked \gset
insert into public.material_references (material_id, citation_text, sort_order)
values (:'v_mat', 'Referência solta', 1) returning id as v_ref_plain \gset

create temp table salvar_hash (k text primary key, v text);
grant all on salvar_hash to authenticated;
insert into salvar_hash values ('antes',
  encode(extensions.digest(app.build_material_snapshot(:'v_mat')::text, 'sha256'), 'hex'));

-- Payload de "Salvar sem mudar nada". Usa o formato do cliente ANTIGO (que
-- manda source_id/url nulos em toda referência) de propósito: é o pior caso,
-- e o que estará em produção entre aplicar a migration e publicar o front.
create function pg_temp.salvar(p_refs jsonb, p_extra jsonb default '{}'::jsonb) returns void
language sql as $fn$
  select public.save_compendium(
    jsonb_build_object(
      'id', current_setting('salvar.mat'), 'discipline_id', current_setting('salvar.disc'),
      'theme_id', current_setting('salvar.theme'), 'title', 'Material do salvar', 'tags', '[]'::jsonb
    ) || p_extra,
    jsonb_build_array(jsonb_build_object(
      'id', current_setting('salvar.sec'), 'title', 'Seção', 'content', 'Conteúdo.', 'key_takeaways', '[]'::jsonb)),
    p_refs
  );
$fn$;
select set_config('salvar.mat', :'v_mat', false), set_config('salvar.disc', :'v_disc', false),
       set_config('salvar.theme', :'v_theme', false), set_config('salvar.sec', :'v_sec', false);

select tests.authenticate_as(:'v_admin');

-- ── A. Salvar sem mudança não mexe em nada ─────────────────────────────────
select lives_ok(
  $$ select pg_temp.salvar(jsonb_build_array(
       jsonb_build_object('citation_text', 'Referência vinculada', 'source_id', null, 'url', null),
       jsonb_build_object('citation_text', 'Referência solta', 'source_id', null, 'url', null))) $$,
  'salvar sem mudança roda'
);
select is(
  encode(extensions.digest(app.build_material_snapshot(:'v_mat')::text, 'sha256'), 'hex'),
  (select v from salvar_hash where k = 'antes'),
  'salvar sem mudança não altera o hash atestado'
);
select is(
  (select id from public.material_references where citation_text = 'Referência vinculada'),
  :'v_ref_linked'::uuid,
  'referência mantém o id'
);
select is(
  (select source_id from public.material_references where id = :'v_ref_linked'),
  'fonte-salvar-teste',
  'vínculo com fonte curada sobrevive, mesmo com cliente enviando source_id nulo'
);
select is(
  (select url from public.material_references where id = :'v_ref_linked'),
  'https://exemplo.org/diretriz',
  'url do vínculo sobrevive'
);

-- ── Reordenar: ids ficam, só a ordem muda ─────────────────────────────────
select lives_ok(
  $$ select pg_temp.salvar(jsonb_build_array(
       jsonb_build_object('citation_text', 'Referência solta'),
       jsonb_build_object('citation_text', 'Referência vinculada'))) $$,
  'reordenar referências roda'
);
select is(
  (select array_agg(id order by sort_order) from public.material_references where material_id = :'v_mat'),
  array[:'v_ref_plain'::uuid, :'v_ref_linked'::uuid],
  'reordenar preserva os ids e aplica a nova ordem'
);

-- ── Editar o texto: vira referência nova, a antiga some ───────────────────
select lives_ok(
  $$ select pg_temp.salvar(jsonb_build_array(
       jsonb_build_object('citation_text', 'Referência solta'),
       jsonb_build_object('citation_text', 'Referência vinculada — revisada'))) $$,
  'editar o texto de uma referência roda'
);
select is(
  (select count(*)::int from public.material_references where id = :'v_ref_linked'),
  0,
  'referência com texto editado é substituída (casamento por texto idêntico)'
);
select is(
  (select source_id from public.material_references where citation_text = 'Referência vinculada — revisada'),
  NULL::text,
  'referência nova não herda vínculo de outra'
);
select is(
  (select id from public.material_references where citation_text = 'Referência solta'),
  :'v_ref_plain'::uuid,
  'a referência intocada continua com o mesmo id'
);

-- ── B. Rótulo curto e posição não entram no hash ──────────────────────────
update salvar_hash set v = encode(extensions.digest(app.build_material_snapshot(:'v_mat')::text, 'sha256'), 'hex') where k = 'antes';
select lives_ok(
  $$ select pg_temp.salvar(
       jsonb_build_array(jsonb_build_object('citation_text', 'Referência solta'),
                         jsonb_build_object('citation_text', 'Referência vinculada — revisada')),
       jsonb_build_object('nav_short_title', 'Rótulo curto', 'taxonomy_kind', 'classe', 'tree_sort_order', 30)) $$,
  'salvar com rótulo curto, tipo e ordem roda'
);
select is(
  encode(extensions.digest(app.build_material_snapshot(:'v_mat')::text, 'sha256'), 'hex'),
  (select v from salvar_hash where k = 'antes'),
  'rótulo curto, tipo do nó e ordem não invalidam a atestação'
);

-- ── C. Importar já posicionado ────────────────────────────────────────────
insert into public.materials (discipline_id, theme_id, title)
values (:'v_disc', :'v_theme', 'Pai da importação') returning id as v_parent \gset
insert into public.materials (discipline_id, theme_id, title)
values (:'v_disc', :'v_theme', 'Fora do ramo') returning id as v_outside \gset
insert into public.materials (discipline_id, theme_id, title)
values (:'v_other_disc', :'v_other_theme', 'De outra disciplina') returning id as v_foreign \gset

create function pg_temp.importar(p_id uuid, p_title text, p_parent uuid, p_links jsonb) returns public.materials
language sql as $fn$
  select public.import_compendium_draft(
    p_id, current_setting('salvar.disc')::uuid, current_setting('salvar.theme')::uuid,
    p_title, null, 'Autor', 10, array['tag'],
    jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'title', 'S', 'content', 'C')),
    array['Ref importada'],
    p_parent, 20, 'Curto', 'farmaco', p_links
  );
$fn$;

select gen_random_uuid() as v_imp \gset
select lives_ok(
  format($$ select pg_temp.importar(%L, 'Importado na árvore', %L,
            jsonb_build_array(jsonb_build_object('material_id', %L, 'link_type', 'prerequisite'))) $$,
         :'v_imp', :'v_parent', :'v_outside'),
  'importar com pai, ordem, rótulo, tipo e "Estude antes" roda'
);
select is(
  (select row(parent_material_id, tree_sort_order, nav_short_title, taxonomy_kind, status)::text
   from public.materials where id = :'v_imp'),
  row(:'v_parent'::uuid, 20, 'Curto'::text, 'farmaco'::text, 'draft'::text)::text,
  'material importado nasce rascunho e já na posição escolhida'
);
select is(
  (select count(*)::int from public.material_links
   where source_material_id = :'v_imp' and target_material_id = :'v_outside' and link_type = 'prerequisite'),
  1,
  'ligação criada na mesma importação'
);

-- Tudo ou nada: se a navegação viola uma regra, NADA é criado.
select gen_random_uuid() as v_imp_bad \gset
select throws_ok(
  format($$ select pg_temp.importar(%L, 'Import com pai estrangeiro', %L, '[]'::jsonb) $$,
         :'v_imp_bad', :'v_foreign'),
  NULL::char(5), NULL::text,
  'pai de outra disciplina é recusado na importação'
);
select is(
  (select count(*)::int from public.materials where id = :'v_imp_bad'),
  0,
  'importação recusada não deixa rascunho pela metade'
);
select gen_random_uuid() as v_imp_bad2 \gset
select throws_ok(
  format($$ select pg_temp.importar(%L, 'Import com ancestral como estude antes', %L,
            jsonb_build_array(jsonb_build_object('material_id', %L, 'link_type', 'prerequisite'))) $$,
         :'v_imp_bad2', :'v_parent', :'v_parent'),
  NULL::char(5), NULL::text,
  'ancestral como "Estude antes" é recusado na importação'
);
select is(
  (select count(*)::int from public.materials where id = :'v_imp_bad2'),
  0,
  'importação com ligação inválida não deixa rascunho nem seções'
);

-- Cliente antigo (dez parâmetros, por nome) continua funcionando no deploy.
select gen_random_uuid() as v_imp_old \gset
select lives_ok(
  format($$ select public.import_compendium_draft(
              p_id => %L, p_discipline_id => %L, p_theme_id => %L, p_title => 'Import cliente antigo',
              p_subtitle => null, p_author => null, p_estimated_read_time_minutes => 5, p_tags => '{}',
              p_sections => jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'title', 'S', 'content', 'C')),
              p_references => '{}') $$,
         :'v_imp_old', :'v_disc', :'v_theme'),
  'importação no formato antigo (sem posição) continua funcionando'
);

-- ── Segurança ─────────────────────────────────────────────────────────────
select throws_ok(
  format($$ select app.replace_material_links(%L, '[]'::jsonb) $$, :'v_mat'),
  '42501', NULL::text,
  'replace_material_links não é chamável direto pelo cliente'
);

select tests.authenticate_as(:'v_student');
select throws_ok(
  format($$ select pg_temp.importar(gen_random_uuid(), 'Import de estudante', null, '[]'::jsonb) $$),
  NULL::char(5), NULL::text,
  'estudante não importa material'
);

select tests.clear_auth();
select * from finish();
