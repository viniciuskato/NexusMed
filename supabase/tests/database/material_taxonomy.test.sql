-- ============================================================================
-- Hierarquia e ligações entre materiais
-- ============================================================================

create extension if not exists pgtap;
select plan(32);

select has_column('public', 'materials', 'parent_material_id', 'materials tem pai opcional');
select has_column('public', 'materials', 'tree_sort_order', 'materials tem ordem na árvore');
select has_table('public', 'material_links', 'tabela unificada de ligações existe');
select hasnt_table('public', 'material_dependencies', 'tabela legada foi transformada, não duplicada');

select tests.clear_auth();
select tests.create_user('taxonomy.admin@test.local', 'admin', 'active') as v_admin \gset
select tests.create_user('taxonomy.student@test.local', 'student', 'active') as v_student \gset

insert into public.disciplines (name, code, cycle)
values ('Disciplina Taxonomia', 'TAX-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_discipline_id \gset

insert into public.themes (discipline_id, name) values (:'v_discipline_id', 'Tema A')
returning id as v_theme_id \gset
insert into public.themes (discipline_id, name) values (:'v_discipline_id', 'Tema B')
returning id as v_other_theme_id \gset

insert into public.materials (discipline_id, theme_id, title)
values (:'v_discipline_id', :'v_theme_id', 'Raiz') returning id as v_root_id \gset
insert into public.materials (discipline_id, theme_id, title, parent_material_id, tree_sort_order)
values (:'v_discipline_id', :'v_theme_id', 'Filho', :'v_root_id', 7) returning id as v_child_id \gset
insert into public.materials (discipline_id, theme_id, title)
values (:'v_discipline_id', :'v_theme_id', 'Pré-requisito') returning id as v_prereq_id \gset
insert into public.materials (discipline_id, theme_id, title)
values (:'v_discipline_id', :'v_theme_id', 'Relacionado') returning id as v_related_id \gset
insert into public.materials (discipline_id, theme_id, title)
values (:'v_discipline_id', :'v_other_theme_id', 'Outro tema') returning id as v_other_theme_material_id \gset
insert into public.materials (discipline_id, theme_id, title)
values (:'v_discipline_id', :'v_theme_id', 'Material simples') returning id as v_plain_id \gset

select throws_ok(
  format($$ update public.materials set parent_material_id = %L where id = %L $$, :'v_child_id', :'v_root_id'),
  NULL::char(5), NULL::text,
  'árvore rejeita ciclos'
);
select throws_ok(
  format($$ update public.materials set parent_material_id = %L where id = %L $$, :'v_other_theme_material_id', :'v_root_id'),
  NULL::char(5), NULL::text,
  'pai e filho precisam compartilhar disciplina e tema'
);
select throws_ok(
  format($$ delete from public.materials where id = %L $$, :'v_root_id'),
  '23503', NULL::text,
  'material pai não pode ser apagado enquanto tiver filhos'
);

insert into public.material_links (source_material_id, target_material_id, link_type)
values (:'v_related_id', :'v_root_id', 'related') returning id as v_related_link_id \gset
select ok(
  (select source_material_id::text < target_material_id::text
   from public.material_links where id = :'v_related_link_id'),
  'related é armazenado em ordem canônica'
);
select throws_ok(
  format($$ insert into public.material_links (source_material_id, target_material_id, link_type)
            values (%L, %L, 'related') $$, :'v_root_id', :'v_related_id'),
  '23505', NULL::text,
  'related reverso não cria duplicata'
);
select throws_ok(
  format($$ insert into public.material_links (source_material_id, target_material_id, link_type)
            values (%L, %L, 'related') $$, :'v_root_id', :'v_root_id'),
  NULL::char(5), NULL::text,
  'material não pode se ligar a si mesmo'
);

insert into public.material_links (source_material_id, target_material_id, link_type)
values (:'v_child_id', :'v_prereq_id', 'prerequisite');
select throws_ok(
  format($$ insert into public.material_links (source_material_id, target_material_id, link_type)
            values (%L, %L, 'prerequisite') $$, :'v_prereq_id', :'v_child_id'),
  NULL::char(5), NULL::text,
  'grafo de pré-requisitos rejeita ciclos'
);
select throws_ok(
  format($$ delete from public.materials where id = %L $$, :'v_prereq_id'),
  '23503', NULL::text,
  'destino de link não é apagado silenciosamente'
);

select tests.approve_material_revision(:'v_child_id');
select tests.approve_material_revision(:'v_root_id');
select tests.approve_material_revision(:'v_prereq_id');

select tests.authenticate_as(:'v_admin');
select throws_ok(
  format($$ update public.materials set tree_sort_order = 8 where id = %L $$, :'v_child_id'),
  NULL::char(5), NULL::text,
  'posição na árvore não pode ser alterada fora da RPC atômica'
);
select throws_ok(
  format($$ select public.publish_material(%L) $$, :'v_child_id'),
  NULL::char(5), NULL::text,
  'filho não publica antes do ancestral'
);
select lives_ok(
  format($$ select public.publish_material(%L) $$, :'v_root_id'),
  'raiz com revisão atual publica'
);
select throws_ok(
  format($$ select public.publish_material(%L) $$, :'v_child_id'),
  NULL::char(5), NULL::text,
  'material não publica antes do pré-requisito'
);
select lives_ok(
  format($$ select public.publish_material(%L) $$, :'v_prereq_id'),
  'pré-requisito publica normalmente'
);
select lives_ok(
  format($$ select public.publish_material(%L) $$, :'v_child_id'),
  'filho publica depois do ancestral e do pré-requisito'
);
select throws_ok(
  format($$ update public.materials set status = 'draft' where id = %L $$, :'v_child_id'),
  NULL::char(5), NULL::text,
  'admin não contorna a despublicação segura com UPDATE direto'
);
select throws_ok(
  format($$ select public.unpublish_material(%L) $$, :'v_root_id'),
  NULL::char(5), NULL::text,
  'pai não despublica enquanto houver descendente publicado'
);
select throws_ok(
  format($$ select public.unpublish_material(%L) $$, :'v_prereq_id'),
  NULL::char(5), NULL::text,
  'pré-requisito não despublica enquanto for exigido por material publicado'
);
select lives_ok(
  format($$ select public.unpublish_material(%L) $$, :'v_child_id'),
  'folha pode ser despublicada com segurança'
);
select lives_ok(
  format($$ select public.unpublish_material(%L) $$, :'v_prereq_id'),
  'pré-requisito pode ser despublicado depois da fonte'
);
select throws_ok(
  format($$ insert into public.material_links (source_material_id, target_material_id, link_type)
            values (%L, %L, 'prerequisite') $$, :'v_root_id', :'v_prereq_id'),
  NULL::char(5), NULL::text,
  'material publicado não recebe pré-requisito em draft'
);

select ok(
  not ((app.build_material_snapshot(:'v_plain_id')->'material') ? 'parent_material_id'),
  'material legado sem hierarquia conserva o formato anterior do snapshot'
);
select ok(
  not (app.build_material_snapshot(:'v_plain_id') ? 'navigation_links'),
  'material legado sem links conserva o hash anterior do snapshot'
);

select lives_ok(
  format($sql$
    select public.save_compendium(
      jsonb_build_object(
        'id', %L, 'discipline_id', %L, 'theme_id', %L,
        'title', 'Filho editado', 'tags', '[]'::jsonb
      ),
      '[]'::jsonb,
      '[]'::jsonb
    )
  $sql$, :'v_child_id', :'v_discipline_id', :'v_theme_id'),
  'cliente antigo salva sem enviar navegação'
);
select is(
  (select parent_material_id from public.materials where id = :'v_child_id'),
  :'v_root_id'::uuid,
  'save_compendium antigo preserva o pai'
);
select is(
  (select tree_sort_order from public.materials where id = :'v_child_id'),
  7,
  'save_compendium antigo preserva a ordem na árvore'
);
select lives_ok(
  format($sql$
    select public.save_compendium(
      jsonb_build_object(
        'id', %L, 'discipline_id', %L, 'theme_id', %L,
        'title', 'Filho editado', 'tags', '[]'::jsonb,
        'navigation_links', jsonb_build_array(jsonb_build_object(
          'material_id', %L, 'link_type', 'related', 'sort_order', 0
        ))
      ),
      '[]'::jsonb,
      '[]'::jsonb
    )
  $sql$, :'v_child_id', :'v_discipline_id', :'v_theme_id', :'v_root_id'),
  'save_compendium grava navegação na mesma transação'
);
select is(
  (select count(*)::int from public.material_links
   where link_type = 'related'
     and (source_material_id = :'v_child_id' or target_material_id = :'v_child_id')),
  1,
  'RPC sincroniza a lista estruturada de links'
);

select tests.authenticate_as(:'v_student');
select throws_ok(
  format($$ select public.unpublish_material(%L) $$, :'v_root_id'),
  NULL::char(5), NULL::text,
  'estudante não despublica material'
);

select tests.clear_auth();
select * from finish();
