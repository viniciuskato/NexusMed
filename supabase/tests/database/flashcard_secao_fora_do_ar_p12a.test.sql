-- ============================================================================
-- P12a — o gatilho do flashcard não apaga a seção só porque o material saiu do ar
-- A seção só é anulada quando NÃO pertence ao material do card. Material
-- despublicado (rascunho) ou arquivado mantém a seção do card; o upsert do
-- cliente (que reenvia a coluna) não a perde; seção de outro material continua
-- virando null.
-- ============================================================================

create extension if not exists pgtap;
select plan(13);

select tests.clear_auth();
select tests.create_user('p12a.a@test.local', 'student', 'active') as v_user_a \gset

insert into public.disciplines (name, code, cycle)
values ('Disciplina P12a', 'P12A-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_disc \gset
insert into public.themes (discipline_id, name) values (:'v_disc', 'Tema P12a') returning id as v_theme \gset

insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Material P12a A') returning id as v_mat_a \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_mat_a', 0, 'Seção A1', 'x') returning id as v_sec_a1 \gset
select tests.force_publish_material(:'v_mat_a');
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Material P12a B') returning id as v_mat_b \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_mat_b', 0, 'Seção B1', 'x') returning id as v_sec_b1 \gset
select tests.force_publish_material(:'v_mat_b');
-- Material que nunca foi publicado (rascunho) e a seção dele.
insert into public.materials (discipline_id, theme_id, title) values (:'v_disc', :'v_theme', 'Material P12a rascunho') returning id as v_mat_draft \gset
insert into public.material_sections (material_id, sort_order, title, content) values (:'v_mat_draft', 0, 'Seção rascunho', 'x') returning id as v_sec_draft \gset

-- Card gravado com o material no ar.
select gen_random_uuid() as v_card \gset
insert into public.flashcards (id, user_id, discipline_id, theme_id, material_id, material_section_id, front, back, difficulty)
values (:'v_card', :'v_user_a', :'v_disc', :'v_theme', :'v_mat_a', :'v_sec_a1', 'F', 'V', 'medio');
select is((select material_section_id::text from public.flashcards where id = :'v_card'), :'v_sec_a1', 'o card nasce com a seção do material no ar');

-- O material sai do ar.
update public.materials set status = 'draft' where id = :'v_mat_a';
select is((select status::text from public.materials where id = :'v_mat_a'), 'draft', 'o material saiu do ar (rascunho)');
select is((select material_section_id::text from public.flashcards where id = :'v_card'), :'v_sec_a1', 'sair do ar não mexe no card');

-- Upsert do cliente: reenvia material_id e material_section_id (a coluna entra no SET).
select tests.authenticate_as(:'v_user_a');
select lives_ok(
  format($$ update public.flashcards set front = 'F editado', material_id = %L, material_section_id = %L where id = %L $$,
    :'v_mat_a', :'v_sec_a1', :'v_card'),
  'regravar o card (mesma seção) com o material fora do ar não falha'
);
select is((select material_section_id::text from public.flashcards where id = :'v_card'), :'v_sec_a1', 'a seção continua no card com o material fora do ar');
select is((select front from public.flashcards where id = :'v_card'), 'F editado', 'e a edição foi gravada');

-- Material arquivado: o mesmo.
select tests.clear_auth();
update public.materials set status = 'archived' where id = :'v_mat_a';
select is((select status::text from public.materials where id = :'v_mat_a'), 'archived', 'o material foi arquivado');
select tests.authenticate_as(:'v_user_a');
select lives_ok(
  format($$ update public.flashcards set back = 'V editado', material_section_id = %L where id = %L $$, :'v_sec_a1', :'v_card'),
  'regravar o card com o material arquivado não falha'
);
select is((select material_section_id::text from public.flashcards where id = :'v_card'), :'v_sec_a1', 'a seção continua no card com o material arquivado');

-- Gravação direta nova, com a seção de um material que ainda é rascunho.
select gen_random_uuid() as v_card_draft \gset
select lives_ok(
  format($$ insert into public.flashcards (id, user_id, discipline_id, theme_id, material_id, material_section_id, front, back, difficulty)
            values (%L, %L, %L, %L, %L, %L, 'F', 'V', 'medio') $$,
    :'v_card_draft', :'v_user_a', :'v_disc', :'v_theme', :'v_mat_draft', :'v_sec_draft'),
  'insert direto com seção de material em rascunho não falha'
);
select is((select material_section_id::text from public.flashcards where id = :'v_card_draft'), :'v_sec_draft', 'a seção do material em rascunho fica no card (ela pertence ao material)');

-- Seção que NÃO pertence ao material continua virando null.
select lives_ok(
  format($$ update public.flashcards set material_section_id = %L where id = %L $$, :'v_sec_b1', :'v_card'),
  'trocar para a seção de outro material não falha'
);
select is((select material_section_id from public.flashcards where id = :'v_card'), null::uuid, 'seção de outro material entra como null');

select * from finish();
