-- ============================================================================
-- Hierarquia e ligações entre materiais
-- ============================================================================

create extension if not exists pgtap;
select plan(55);

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

insert into public.disciplines (name, code, cycle)
values ('Disciplina Taxonomia 2', 'TAX2-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_other_discipline_id \gset
insert into public.themes (discipline_id, name) values (:'v_other_discipline_id', 'Tema C')
returning id as v_other_discipline_theme_id \gset
insert into public.materials (discipline_id, theme_id, title)
values (:'v_other_discipline_id', :'v_other_discipline_theme_id', 'Outra disciplina')
returning id as v_other_discipline_material_id \gset

select throws_ok(
  format($$ update public.materials set parent_material_id = %L where id = %L $$, :'v_child_id', :'v_root_id'),
  NULL::char(5), NULL::text,
  'árvore rejeita ciclos'
);
select throws_ok(
  format($$ update public.materials set parent_material_id = %L where id = %L $$, :'v_other_discipline_material_id', :'v_root_id'),
  NULL::char(5), NULL::text,
  'pai e filho precisam compartilhar a disciplina'
);
-- Tema deixou de amarrar pai e filho: amarrar congelava o ramo no tema em que
-- nasceu, porque nenhuma ordem de UPDATE conseguia mover a subárvore inteira.
select lives_ok(
  format($$ update public.materials set parent_material_id = %L where id = %L $$, :'v_root_id', :'v_other_theme_material_id'),
  'filho pode estar em outro tema da mesma disciplina'
);
select lives_ok(
  format($$ update public.materials set theme_id = %L where id = %L $$, :'v_other_theme_id', :'v_root_id'),
  'pai troca de tema sem desmontar a árvore'
);
select lives_ok(
  format($$ update public.materials set theme_id = %L, parent_material_id = null where id = %L $$,
         :'v_theme_id', :'v_other_theme_material_id'),
  'filho volta a ser raiz para não interferir nos testes seguintes'
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

-- ============================================================================
-- Fase 1.5 — o que a revisão da fundação corrigiu
-- ============================================================================

select has_column('public', 'materials', 'nav_short_title', 'materials tem rótulo curto de navegação');
select has_column('public', 'materials', 'taxonomy_kind', 'materials tem tipo de nó');

-- O snapshot atestado não pode depender de navegação: antes, um link criado por
-- um vizinho invalidava a revisão aprovada de um material que ninguém editou, e
-- reordenar irmãos invalidava a do próprio material.
insert into public.materials (discipline_id, theme_id, title)
values (:'v_discipline_id', :'v_theme_id', 'Hash raiz') returning id as v_hash_root_id \gset
insert into public.materials (discipline_id, theme_id, title)
values (:'v_discipline_id', :'v_theme_id', 'Hash filho') returning id as v_hash_child_id \gset
update public.materials set parent_material_id = :'v_hash_root_id', tree_sort_order = 1 where id = :'v_hash_child_id';

create temp table tax_hash (k text primary key, v text);
insert into tax_hash values
  ('root_antes', encode(extensions.digest(app.build_material_snapshot(:'v_hash_root_id')::text, 'sha256'), 'hex')),
  ('child_antes', encode(extensions.digest(app.build_material_snapshot(:'v_hash_child_id')::text, 'sha256'), 'hex'));

insert into public.material_links (source_material_id, target_material_id, link_type)
values (:'v_hash_child_id', :'v_plain_id', 'related');
update public.materials set tree_sort_order = 9 where id = :'v_hash_child_id';

select is(
  (select v from tax_hash where k = 'root_antes'),
  encode(extensions.digest(app.build_material_snapshot(:'v_hash_root_id')::text, 'sha256'), 'hex'),
  'link criado por um vizinho não invalida a revisão aprovada do outro material'
);
select is(
  (select v from tax_hash where k = 'child_antes'),
  encode(extensions.digest(app.build_material_snapshot(:'v_hash_child_id')::text, 'sha256'), 'hex'),
  'reordenar irmãos não invalida a revisão aprovada'
);
-- Um par de materiais tem no máximo uma relação: prerequisite e related juntos
-- fariam o mesmo material aparecer em "Estude antes" e em "Veja também".
select throws_ok(
  format($$ insert into public.material_links (source_material_id, target_material_id, link_type)
            values (%L, %L, 'prerequisite') $$, :'v_hash_child_id', :'v_plain_id'),
  '23505', NULL::text,
  'par com related não aceita também prerequisite'
);

-- Ancestral já é pré-requisito implícito pelo caminho da árvore.
select throws_ok(
  format($$ insert into public.material_links (source_material_id, target_material_id, link_type)
            values (%L, %L, 'prerequisite') $$, :'v_hash_child_id', :'v_hash_root_id'),
  NULL::char(5), NULL::text,
  'ancestral não é cadastrável como "Estude antes"'
);

-- Travessia com guarda de ciclo.
select is(
  (select count(*)::int from app.material_ancestors(:'v_hash_child_id')),
  1,
  'material_ancestors devolve a cadeia até a raiz'
);
select is(
  (select count(*)::int from app.material_descendants(:'v_hash_root_id')),
  1,
  'material_descendants devolve a subárvore'
);

-- Teto de profundidade: sem ele, uma trilha de 60 níveis entrava sem aviso.
create function pg_temp.tax_chain(p_discipline uuid, p_theme uuid, p_root uuid, p_levels int)
returns void language plpgsql as $chain$
declare v_prev uuid := p_root; v_new uuid; i int;
begin
  for i in 1..p_levels loop
    insert into public.materials (discipline_id, theme_id, title)
    values (p_discipline, p_theme, 'Nível ' || i || ' ' || gen_random_uuid()::text)
    returning id into v_new;
    update public.materials set parent_material_id = v_prev where id = v_new;
    v_prev := v_new;
  end loop;
end $chain$;

select lives_ok(
  format($$ select pg_temp.tax_chain(%L, %L, %L, 6) $$,
         :'v_discipline_id', :'v_theme_id', :'v_hash_child_id'),
  'árvore aceita a profundidade máxima'
);
select throws_ok(
  format($$ select pg_temp.tax_chain(%L, %L, %L, 1) $$,
         :'v_discipline_id', :'v_theme_id',
         (select id from public.materials where title like 'Nível 6 %' limit 1)),
  NULL::char(5), NULL::text,
  'árvore rejeita profundidade acima do teto'
);

-- Exclusão determinística: `related` é guardado em ordem canônica de uuid, então
-- sem limpar os dois lados o resultado dependia de qual uuid era menor.
insert into public.materials (id, discipline_id, theme_id, title)
values ('00000000-0000-4000-8000-000000000001', :'v_discipline_id', :'v_theme_id', 'Par uuid menor');
insert into public.materials (id, discipline_id, theme_id, title)
values ('ffffffff-0000-4000-8000-00000000000f', :'v_discipline_id', :'v_theme_id', 'Par uuid maior');
insert into public.material_links (source_material_id, target_material_id, link_type)
values ('00000000-0000-4000-8000-000000000001', 'ffffffff-0000-4000-8000-00000000000f', 'related');

select lives_ok(
  $$ delete from public.materials where id = 'ffffffff-0000-4000-8000-00000000000f' $$,
  'material do lado "target" de um related é excluível'
);
select lives_ok(
  $$ delete from public.materials where id = '00000000-0000-4000-8000-000000000001' $$,
  'material do lado "source" de um related é excluível'
);

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

-- Mover um nó deixa de exigir save_compendium (que reescreve conteúdo inteiro).
select lives_ok(
  format($$ select public.set_material_position(%L, null, 30) $$, :'v_hash_child_id'),
  'set_material_position move o nó sem tocar em conteúdo'
);
select is(
  (select parent_material_id from public.materials where id = :'v_hash_child_id'),
  NULL::uuid,
  'set_material_position destaca o material da árvore'
);
select is(
  (select tree_sort_order from public.materials where id = :'v_hash_child_id'),
  30,
  'set_material_position grava a ordem entre irmãos'
);

-- publish_material aponta o ancestral MAIS PRÓXIMO como bloqueador, não o mais
-- distante: publicação é bottom-up, então apontar o avô primeiro faria o
-- admin tentar publicá-lo, ser barrado de novo (agora pelo pai, ainda em
-- draft) e só então chegar ao pai — dois ciclos de erro em vez de um.
insert into public.materials (discipline_id, theme_id, title)
values (:'v_discipline_id', :'v_theme_id', 'Avô') returning id as v_grandparent_id \gset
insert into public.materials (discipline_id, theme_id, title)
values (:'v_discipline_id', :'v_theme_id', 'Pai próximo') returning id as v_near_parent_id \gset
insert into public.materials (discipline_id, theme_id, title)
values (:'v_discipline_id', :'v_theme_id', 'Neto') returning id as v_grandchild_id \gset
select public.set_material_position(:'v_near_parent_id', :'v_grandparent_id', 0);
select public.set_material_position(:'v_grandchild_id', :'v_near_parent_id', 0);
select tests.approve_material_revision(:'v_grandchild_id');
select throws_like(
  format($$ select public.publish_material(%L) $$, :'v_grandchild_id'),
  '%"Pai próximo"%',
  'bloqueador de publicação é o ancestral mais próximo, não o mais distante'
);

-- save_compendium conta sort_order por tipo de link: um array intercalado
-- (related, prerequisite, related) não pode deixar buracos na ordem de cada
-- lista renderizada separadamente ("Estude antes" / "Veja também").
insert into public.materials (discipline_id, theme_id, title)
values (:'v_discipline_id', :'v_theme_id', 'Alvo related 1') returning id as v_rel1_id \gset
insert into public.materials (discipline_id, theme_id, title)
values (:'v_discipline_id', :'v_theme_id', 'Alvo prerequisite') returning id as v_prereq2_id \gset
insert into public.materials (discipline_id, theme_id, title)
values (:'v_discipline_id', :'v_theme_id', 'Alvo related 2') returning id as v_rel2_id \gset
select tests.approve_material_revision(:'v_prereq2_id');
select public.publish_material(:'v_prereq2_id');
select lives_ok(
  format($sql$
    select public.save_compendium(
      jsonb_build_object(
        'id', %L, 'discipline_id', %L, 'theme_id', %L,
        'title', 'Sort order intercalado', 'tags', '[]'::jsonb,
        'navigation_links', jsonb_build_array(
          jsonb_build_object('material_id', %L, 'link_type', 'related'),
          jsonb_build_object('material_id', %L, 'link_type', 'prerequisite'),
          jsonb_build_object('material_id', %L, 'link_type', 'related')
        )
      ),
      '[]'::jsonb,
      '[]'::jsonb
    )
  $sql$, :'v_grandchild_id', :'v_discipline_id', :'v_theme_id',
         :'v_rel1_id', :'v_prereq2_id', :'v_rel2_id'),
  'save_compendium grava navigation_links intercalado entre os dois tipos'
);
select is(
  (select sort_order from public.material_links
   where link_type = 'prerequisite' and source_material_id = :'v_grandchild_id'),
  0,
  'prerequisite único fica em sort_order 0 (contador próprio, não o índice global)'
);
select is(
  (select array_agg(sort_order order by sort_order) from public.material_links
   where link_type = 'related'
     and (source_material_id = :'v_grandchild_id' or target_material_id = :'v_grandchild_id')),
  ARRAY[0, 10],
  'os dois related ficam em 0 e 10, sem o buraco que o índice global deixava'
);

select tests.authenticate_as(:'v_student');
select throws_ok(
  format($$ select public.unpublish_material(%L) $$, :'v_root_id'),
  NULL::char(5), NULL::text,
  'estudante não despublica material'
);
select throws_ok(
  format($$ select public.set_material_position(%L, null, 1) $$, :'v_hash_child_id'),
  NULL::char(5), NULL::text,
  'estudante não move material na árvore'
);

select tests.clear_auth();
select * from finish();
