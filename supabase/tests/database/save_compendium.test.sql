-- ============================================================================
-- SynapseMed — save_compendium: salvar pelo formulário do CMS preserva dados
-- dependentes das seções (auditoria 2026-09-18)
--
-- Cobre a migration 20260918130000_save_compendium_rpc.sql. Antes dela,
-- salvar apagava e reinseria todas as seções, e as FKs em cascata apagavam
-- anotações de alunos, histórico de versões e imagens, e desligavam
-- questões da seção. Reusa os helpers de rls_policies.test.sql (roda antes,
-- ordem alfabética).
-- ============================================================================

select plan(16);

select tests.clear_auth();

select tests.create_user('save.admin@test.local', 'admin', 'active') as v_admin \gset
select tests.create_user('save.aluno@test.local', 'student', 'active') as v_student \gset

insert into public.disciplines (name, code, cycle) values ('Disciplina Save', 'SAVE-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_discipline_id \gset
insert into public.themes (discipline_id, name) values (:'v_discipline_id', 'Tema Save')
returning id as v_theme_id \gset

select gen_random_uuid() as v_material_id \gset
select gen_random_uuid() as v_sec_a \gset
select gen_random_uuid() as v_sec_b \gset
select gen_random_uuid() as v_sec_c \gset

-- ----------------------------------------------------------------------------
-- Criação
-- ----------------------------------------------------------------------------

select tests.authenticate_as(:'v_admin');

select lives_ok(
  format($$ select public.save_compendium(
    jsonb_build_object('id', %L, 'discipline_id', %L, 'theme_id', %L, 'title', 'Material Save', 'tags', '["x"]'::jsonb),
    jsonb_build_array(
      jsonb_build_object('id', %L, 'title', 'Seção A', 'content', 'conteúdo A'),
      jsonb_build_object('id', %L, 'title', 'Seção B', 'content', 'conteúdo B')
    ),
    '[{"citation_text": "Ref 1"}]'::jsonb
  ) $$, :'v_material_id', :'v_discipline_id', :'v_theme_id', :'v_sec_a', :'v_sec_b'),
  'admin cria material com duas seções'
);

select tests.clear_auth();

-- Dados que dependem da seção A (criados como postgres, como fixture)
insert into public.notes (user_id, material_section_id, note_text)
values (:'v_student', :'v_sec_a', 'anotação do aluno');
insert into public.material_section_versions (material_section_id, changed_fields, before_snapshot, after_snapshot)
values (:'v_sec_a', '{content}', '{}'::jsonb, '{}'::jsonb);
insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem, material_section_id)
values (:'v_discipline_id', :'v_theme_id', 'clinico', 'medio', 'Vinheta', 'Enunciado', :'v_sec_a')
returning id as v_question_id \gset

-- ----------------------------------------------------------------------------
-- Edição: reordena (B, A), edita A e acrescenta C
-- ----------------------------------------------------------------------------

select tests.authenticate_as(:'v_admin');

select lives_ok(
  format($$ select public.save_compendium(
    jsonb_build_object('id', %L, 'discipline_id', %L, 'theme_id', %L, 'title', 'Material Save editado'),
    jsonb_build_array(
      jsonb_build_object('id', %L, 'title', 'Seção B', 'content', 'conteúdo B'),
      jsonb_build_object('id', %L, 'title', 'Seção A', 'content', 'conteúdo A editado'),
      jsonb_build_object('id', %L, 'title', 'Seção C', 'content', 'conteúdo C')
    ),
    '[{"citation_text": "Ref 1"}, {"citation_text": "Ref 2"}]'::jsonb
  ) $$, :'v_material_id', :'v_discipline_id', :'v_theme_id', :'v_sec_b', :'v_sec_a', :'v_sec_c'),
  'admin salva de novo reordenando, editando e acrescentando seção'
);

select tests.clear_auth();

select is(
  (select count(*)::int from public.notes where material_section_id = :'v_sec_a'),
  1,
  'anotação do aluno na seção editada sobrevive ao salvar'
);

select is(
  (select count(*)::int from public.material_section_versions where material_section_id = :'v_sec_a'),
  1,
  'histórico de versões da seção sobrevive ao salvar'
);

select is(
  (select material_section_id from public.questions where id = :'v_question_id'),
  :'v_sec_a'::uuid,
  'questão continua vinculada à seção'
);

select is(
  (select content from public.material_sections where id = :'v_sec_a'),
  'conteúdo A editado',
  'conteúdo da seção foi atualizado'
);

select is(
  (select array_agg(id order by sort_order) from public.material_sections where material_id = :'v_material_id'),
  array[:'v_sec_b'::uuid, :'v_sec_a'::uuid, :'v_sec_c'::uuid],
  'nova ordem das seções aplicada (B, A, C)'
);

select is(
  (select count(*)::int from public.material_references where material_id = :'v_material_id'),
  2,
  'referências substituídas pela lista nova'
);

select is(
  (select title from public.materials where id = :'v_material_id'),
  'Material Save editado',
  'título do material atualizado'
);

-- ----------------------------------------------------------------------------
-- Remoção explícita de seção pelo admin
-- ----------------------------------------------------------------------------

select tests.authenticate_as(:'v_admin');

select lives_ok(
  format($$ select public.save_compendium(
    jsonb_build_object('id', %L, 'discipline_id', %L, 'theme_id', %L, 'title', 'Material Save editado'),
    jsonb_build_array(
      jsonb_build_object('id', %L, 'title', 'Seção A', 'content', 'conteúdo A editado'),
      jsonb_build_object('id', %L, 'title', 'Seção C', 'content', 'conteúdo C')
    ),
    '[]'::jsonb
  ) $$, :'v_material_id', :'v_discipline_id', :'v_theme_id', :'v_sec_a', :'v_sec_c'),
  'admin remove a seção B'
);

select tests.clear_auth();

select is(
  (select count(*)::int from public.material_sections where material_id = :'v_material_id'),
  2,
  'só a seção removida foi apagada'
);

select is(
  (select count(*)::int from public.notes where material_section_id = :'v_sec_a'),
  1,
  'anotação na seção mantida continua intacta'
);

-- ----------------------------------------------------------------------------
-- Atomicidade e permissões
-- ----------------------------------------------------------------------------

select tests.authenticate_as(:'v_admin');

select throws_ok(
  format($$ select public.save_compendium(
    jsonb_build_object('id', %L, 'discipline_id', %L, 'theme_id', %L, 'title', 'Título que não pode ficar'),
    jsonb_build_array(jsonb_build_object('id', %L, 'title', 'Seção A', 'content', 'não pode ficar')),
    '[{"citation_text": null}]'::jsonb
  ) $$, :'v_material_id', :'v_discipline_id', :'v_theme_id', :'v_sec_a'),
  NULL::char(5), NULL::text,
  'falha numa referência inválida aborta a chamada'
);

select tests.clear_auth();

select is(
  (select count(*)::int from public.material_sections where material_id = :'v_material_id'),
  2,
  'rollback integral: seções intactas após falha (seção C não foi apagada)'
);

select tests.authenticate_as(:'v_admin');

select throws_ok(
  format($$ select public.save_compendium(
    jsonb_build_object('id', gen_random_uuid(), 'discipline_id', %L, 'theme_id', %L, 'title', 'Outro material'),
    jsonb_build_array(jsonb_build_object('id', %L, 'title', 'Roubada', 'content', 'x')),
    '[]'::jsonb
  ) $$, :'v_discipline_id', :'v_theme_id', :'v_sec_a'),
  NULL::char(5), NULL::text,
  'seção de outro material não pode ser movida'
);

select tests.clear_auth();
select tests.authenticate_as(:'v_student');

select throws_ok(
  format($$ select public.save_compendium(
    jsonb_build_object('id', %L, 'discipline_id', %L, 'theme_id', %L, 'title', 'Hack'),
    '[]'::jsonb, '[]'::jsonb
  ) $$, :'v_material_id', :'v_discipline_id', :'v_theme_id'),
  NULL::char(5), NULL::text,
  'estudante não pode salvar material'
);

select tests.clear_auth();

select * from finish();
