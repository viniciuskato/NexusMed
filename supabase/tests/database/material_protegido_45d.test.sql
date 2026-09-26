-- ============================================================================
-- 45-D — Material publicado protegido (AUD-22)
-- Excluir material publicado, com dado de aluno, com trilha de revisão, com
-- ligações ou com filhos é recusado; a anotação de uma seção removida continua
-- do aluno, no próprio material, marcada com o título da seção.
-- ============================================================================

create extension if not exists pgtap;
select plan(19);

select tests.clear_auth();
select tests.create_user('protegido.admin@test.local', 'admin', 'active') as v_admin \gset
select tests.create_user('protegido.student@test.local', 'student', 'active') as v_student \gset

insert into public.disciplines (name, code, cycle)
values ('Disciplina Protegido', 'PROT-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_disc \gset
insert into public.themes (discipline_id, name) values (:'v_disc', 'Tema Protegido')
returning id as v_theme \gset

-- Um material para cada motivo de recusa, mais um que pode ser excluído.
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Publicado') returning id as v_pub \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_pub', 0, 'S', 'C.');
select tests.force_publish_material(:'v_pub');
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Com anotação') returning id as v_note \gset
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Com favorito') returning id as v_bm \gset
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Com progresso') returning id as v_rp \gset
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Com revisão') returning id as v_rev \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_rev', 0, 'S', 'C.');
select tests.approve_material_revision(:'v_rev');
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Com pré-requisito') returning id as v_src \gset
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Alvo') returning id as v_tgt \gset
insert into public.material_links (source_material_id, target_material_id, link_type) values (:'v_src', :'v_tgt', 'prerequisite');
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Relacionado A') returning id as v_rel_a \gset
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Relacionado B') returning id as v_rel_b \gset
insert into public.material_links (source_material_id, target_material_id, link_type) values (:'v_rel_a', :'v_rel_b', 'related');
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Pai') returning id as v_parent \gset
insert into public.materials (discipline_id, theme_id, title, parent_material_id) values (:'v_disc', :'v_theme', 'Filho', :'v_parent');
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Rascunho livre') returning id as v_free \gset

insert into public.bookmarks (user_id, material_id) values (:'v_student', :'v_bm');
insert into public.reading_progress (user_id, material_id, read_section_ids, percent) values (:'v_student', :'v_rp', '{}', 10);

select tests.authenticate_as(:'v_student');
select lives_ok(
  format($$ select public.upsert_note(p_material_id => %L, p_note_text => 'minha nota') $$, :'v_note'),
  'aluno anota o material'
);

-- Exclusão pela Área Editorial (admin, com RLS).
select tests.authenticate_as(:'v_admin');
select throws_like(format($$ delete from public.materials where id = %L $$, :'v_pub'), '%publicado%', 'material publicado não é excluído');
select throws_like(format($$ delete from public.materials where id = %L $$, :'v_note'), '%dados de alunos%', 'material com anotação de aluno não é excluído');
select throws_like(format($$ delete from public.materials where id = %L $$, :'v_bm'), '%dados de alunos%', 'material com favorito de aluno não é excluído');
select throws_like(format($$ delete from public.materials where id = %L $$, :'v_rp'), '%dados de alunos%', 'material com progresso de aluno não é excluído');
select throws_like(format($$ delete from public.materials where id = %L $$, :'v_rev'), '%revisão%', 'material com trilha de revisão não é excluído');
select throws_like(format($$ delete from public.materials where id = %L $$, :'v_src'), '%ligaç%', 'material com "Estude antes" de saída não é excluído');
select throws_like(format($$ delete from public.materials where id = %L $$, :'v_tgt'), '%ligaç%', 'material alvo de "Estude antes" não é excluído');
select throws_like(format($$ delete from public.materials where id = %L $$, :'v_rel_a'), '%ligaç%', 'material com "Veja também" não é excluído');
select throws_like(format($$ delete from public.materials where id = %L $$, :'v_parent'), '%filhos%', 'material com filhos na árvore não é excluído');
select lives_ok(format($$ delete from public.materials where id = %L $$, :'v_free'), 'rascunho sem nada ligado é excluído');
select tests.clear_auth();

select is(
  (select count(*)::int from public.material_links where source_material_id = :'v_rel_a' or target_material_id = :'v_rel_a'),
  1,
  '"Veja também" não foi apagado pela tentativa recusada'
);
select is(
  (select confdeltype::text from pg_constraint where conname = 'content_revisions_material_id_fkey'),
  'r',
  'trilha de revisão não é apagada em cascata com o material'
);
select is(
  (select confdeltype::text from pg_constraint where conrelid = 'public.material_links'::regclass
     and contype = 'f' and pg_get_constraintdef(oid) like '%(source_material_id)%'),
  'r',
  'ligações de saída não são apagadas em cascata com o material'
);

-- Anotação de seção removida: continua do aluno, no próprio material.
select has_column('public', 'notes', 'removed_section_title', 'notes guarda o título da seção removida');

insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Com seção anotada') returning id as v_sec_mat \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_sec_mat', 0, 'Seção que sai', 'C.') returning id as v_sec \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_sec_mat', 1, 'Seção que fica', 'C.');

select tests.authenticate_as(:'v_student');
select public.upsert_note(p_material_section_id => :'v_sec', p_note_text => 'nota da seção');
select public.upsert_note(p_material_id => :'v_sec_mat', p_note_text => 'nota do material');
select tests.clear_auth();

delete from public.material_sections where id = :'v_sec';

select results_eq(
  format($$ select material_id::text, material_section_id::text, removed_section_title, note_text
            from public.notes where user_id = %L and removed_section_title is not null $$, :'v_student'),
  format($$ values (%L::text, null::text, 'Seção que sai'::text, 'nota da seção'::text) $$, :'v_sec_mat'),
  'a anotação da seção removida continua, no material, com o título da seção'
);

-- A anotação do material continua sendo uma só, e salvar de novo não pega a
-- linha da seção removida.
select tests.authenticate_as(:'v_student');
select is(
  (public.upsert_note(
     p_material_id => :'v_sec_mat',
     p_note_text => 'nota do material editada',
     p_base_updated_at => (select updated_at from public.notes
                           where material_id = :'v_sec_mat' and removed_section_title is null)
   ) ->> 'conflict'),
  'false',
  'aluno edita a anotação do material depois da remoção, sem conflito com a da seção'
);
select tests.clear_auth();
select results_eq(
  format($$ select note_text from public.notes where user_id = %L and material_id = %L order by removed_section_title nulls first $$,
         :'v_student', :'v_sec_mat'),
  $$ values ('nota do material editada'::text), ('nota da seção'::text) $$,
  'a anotação do material e a da seção removida seguem separadas'
);

-- Uma segunda seção anotada removida do mesmo material não colide.
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_sec_mat', 2, 'Outra que sai', 'C.') returning id as v_sec2 \gset
select tests.authenticate_as(:'v_student');
select public.upsert_note(p_material_section_id => :'v_sec2', p_note_text => 'outra nota');
select tests.clear_auth();
select lives_ok(format($$ delete from public.material_sections where id = %L $$, :'v_sec2'), 'segunda seção anotada também pode sair');

select * from finish();
