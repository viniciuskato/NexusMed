-- ============================================================================
-- P8 — O admin publica o envio com um clique, com qualquer parecer do revisor
-- (migration 20261003120900).
--
-- Prova, para os três caminhos (material novo, questões, atualização de material):
--   1. só admin ativo chama: aluno, pendente e anon são recusados (nada é criado);
--   2. o admin publica/aplica com revisão "apto", com revisão "não apto", com envio em "erro" e com envio ainda
--      "aguardando revisão": o conteúdo vai ao ar com o mesmo resultado das funções do servidor (seções,
--      referências, lugar na árvore, ids de seção preservados, ligação aos materiais);
--   3. o selo "Revisado por IA" só existe onde o texto atual tem revisão "apto" válida;
--   4. envio "em revisão", texto que mudou no meio, envio já publicado e envio do outro tipo não são publicados;
--   5. recusa (título repetido, material que não existe...) e falha NÃO mexem no envio nem criam nada.
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

grant usage on schema tests to anon, authenticated, service_role;

-- Um envio de material NOVO no estado dado; com p_verdict, uma revisão concluída do texto atual com esse veredito.
create or replace function tests.p8_envio(
  p_author uuid, p_disc uuid, p_theme uuid, p_title text, p_status text,
  p_verdict text default null, p_parent uuid default null
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
  if p_verdict is not null then
    insert into public.material_reviews (submission_id, content_sha256, status, verdict, model, completed_at)
    select s.id, s.content_sha256, 'concluida', p_verdict, 'claude-opus-5-5', now()
      from public.material_submissions s where s.id = v_id;
  end if;
  return v_id;
end;
$$;

-- Um envio de ATUALIZAÇÃO do material (o lugar e a base vêm do banco).
create or replace function tests.p8_envio_atualizacao(
  p_author uuid, p_material uuid, p_tag text, p_status text, p_verdict text default null
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

-- Um envio de questões no estado dado; com p_verdict, uma revisão concluída do texto atual.
create or replace function tests.p8_envio_questoes(
  p_author uuid, p_title text, p_material_ids uuid[], p_status text, p_verdict text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.question_submissions (author_id, title, content_md, material_ids, status)
  values (p_author, p_title, '## Questão 1' || E'\n' || p_title, p_material_ids, p_status) returning id into v_id;
  if p_verdict is not null then
    insert into public.material_reviews (question_submission_id, content_sha256, status, verdict, model, completed_at)
    select s.id, s.content_sha256, 'concluida', p_verdict, 'claude-opus-5-5', now()
      from public.question_submissions s where s.id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function tests.p8_sha(p_submission uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.content_sha256 from public.material_submissions s where s.id = p_submission),
    (select q.content_sha256 from public.question_submissions q where q.id = p_submission)
  );
$$;

-- A leitura do texto que o importador da tela faz (material novo ou atualização).
create or replace function tests.p8_leitura(p_title text, p_sections int default 2)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'title', p_title, 'subtitle', 'Subtítulo de teste', 'author', 'Autor de teste',
    'estimated_read_time_minutes', 12, 'tags', jsonb_build_array('teste', 'p8'),
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

-- O conteúdo ATUAL do material, no formato da leitura (um arquivo igual ao que está no ar).
create or replace function tests.p8_leitura_do_material(p_material uuid)
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

-- A leitura de n questões válidas (o importador de questões da tela).
create or replace function tests.p8_leitura_de_questoes(p_disc uuid, p_theme uuid, p_prefix text, p_n int, p_titles jsonb default '[]'::jsonb)
returns jsonb
language sql
as $$
  select jsonb_agg(jsonb_build_object(
    'discipline_id', p_disc, 'theme_id', p_theme, 'cycle', 'internato_residencia', 'difficulty', 'medio',
    'institution', 'NexusMed (questão autoral)', 'year', null,
    'clinical_vignette', 'Caso ' || i, 'question_stem', p_prefix || ' enunciado ' || i,
    'general_commentary', 'Comentário geral ' || i || '. Fonte: https://exemplo.gov.br/diretriz',
    'high_yield_summary', 'Pérola ' || i,
    'tags', jsonb_build_array('teste', 'p8'),
    'material_titles', p_titles,
    'options', jsonb_build_array(
      jsonb_build_object('letter', 'A', 'text', 'Alternativa A' || i, 'explanation', 'Errada: motivo A', 'is_correct', false),
      jsonb_build_object('letter', 'B', 'text', 'Alternativa B' || i, 'explanation', 'Certa: motivo B', 'is_correct', true),
      jsonb_build_object('letter', 'C', 'text', 'Alternativa C' || i, 'explanation', 'Errada: motivo C', 'is_correct', false)
    )
  ) order by i)
  from generate_series(1, p_n) i;
$$;

create or replace function tests.p8_material_publicado(p_disc uuid, p_theme uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.materials (discipline_id, theme_id, title) values (p_disc, p_theme, p_title) returning id into v_id;
  insert into public.material_sections (material_id, sort_order, title, content) values (v_id, 0, 'S', 'C.');
  update public.materials set status = 'published' where id = v_id;
  return v_id;
end;
$$;

grant execute on all functions in schema tests to public;

select plan(102);

select tests.clear_auth();
select tests.create_user('p8.admin@test.local', 'admin', 'active') as v_admin \gset
select tests.create_user('p8.autor@test.local', 'admin', 'active') as v_autor \gset
select tests.create_user('p8.aluno@test.local', 'student', 'active') as v_aluno \gset
select tests.create_user('p8.pend@test.local', 'student', 'pending') as v_pend \gset
select substr(gen_random_uuid()::text, 1, 8) as v_sfx \gset

insert into public.disciplines (name, code, cycle) values ('Disciplina P8', 'P8-' || :'v_sfx', 'clinico') returning id as v_disc \gset
insert into public.themes (discipline_id, name) values (:'v_disc', 'Tema P8 A') returning id as v_theme \gset
insert into public.themes (discipline_id, name) values (:'v_disc', 'Tema P8 B') returning id as v_theme_b \gset

-- O "material acima" dos envios, publicado, e outro que sairá do ar depois do envio.
select tests.p8_material_publicado(:'v_disc', :'v_theme', 'Pai P8 ' || :'v_sfx') as v_pai \gset
select tests.p8_material_publicado(:'v_disc', :'v_theme', 'Pai que sai P8 ' || :'v_sfx') as v_pai_sai \gset

-- ---------------------------------------------------------------------------
-- 1. Grants
-- ---------------------------------------------------------------------------
select ok(
  has_function_privilege('authenticated', 'public.admin_publicar_envio(uuid, text, jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.admin_publicar_questoes(uuid, text, jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.admin_aplicar_atualizacao(uuid, text, jsonb)', 'execute'),
  'o usuário logado chama as três funções (e cada uma confere que é admin)'
);
select ok(
  not has_function_privilege('anon', 'public.admin_publicar_envio(uuid, text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.admin_publicar_questoes(uuid, text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.admin_aplicar_atualizacao(uuid, text, jsonb)', 'execute'),
  'anon não executa nenhuma delas (risco 14)'
);
select ok(
  not exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in ('admin_publicar_envio', 'admin_publicar_questoes', 'admin_aplicar_atualizacao')
      and grantee = 'PUBLIC'
  ),
  'PUBLIC também não'
);
select ok(
  not has_function_privilege('authenticated', 'public.revisao_publicar_envio(uuid, uuid, text, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.revisao_publicar_questoes(uuid, uuid, text, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.revisao_aplicar_atualizacao(uuid, uuid, text, jsonb)', 'execute'),
  'as funções do servidor continuam sem EXECUTE para o cliente'
);

-- ---------------------------------------------------------------------------
-- 2. Material novo: quem pode
-- ---------------------------------------------------------------------------
select tests.p8_envio(:'v_autor', :'v_disc', :'v_theme', 'Envio quem pode ' || :'v_sfx', 'apto', 'apto') as v_eq \gset
select tests.p8_sha(:'v_eq') as v_hq \gset

select tests.authenticate_as(:'v_aluno');
select throws_ok(
  format($$ select public.admin_publicar_envio(%L, %L, tests.p8_leitura('Envio quem pode %s')) $$, :'v_eq', :'v_hq', :'v_sfx'),
  '42501', 'acesso negado', 'aluno ativo não publica envio'
);
select tests.clear_auth();
select tests.authenticate_as(:'v_pend');
select throws_ok(
  format($$ select public.admin_publicar_envio(%L, %L, tests.p8_leitura('Envio quem pode %s')) $$, :'v_eq', :'v_hq', :'v_sfx'),
  '42501', 'acesso negado', 'usuário pendente não publica envio'
);
select tests.clear_auth();
select tests.authenticate_as_anon();
select throws_ok(
  format($$ select public.admin_publicar_envio(%L, %L, tests.p8_leitura('Envio quem pode %s')) $$, :'v_eq', :'v_hq', :'v_sfx'),
  '42501', NULL, 'anon não publica envio'
);
select tests.clear_auth();
select is(
  (select count(*)::int from public.materials where title = 'Envio quem pode ' || :'v_sfx'), 0,
  'nenhuma dessas tentativas criou material'
);
select is((select status from public.material_submissions where id = :'v_eq'), 'apto', 'e o envio continua "apto"');

-- ---------------------------------------------------------------------------
-- 3. Material novo: com revisão "apto" (o resultado das funções do servidor, com selo)
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'v_admin');
select public.admin_publicar_envio(:'v_eq', :'v_hq', tests.p8_leitura('Envio quem pode ' || :'v_sfx', 3)) as v_r_apto \gset
select tests.clear_auth();
select is((:'v_r_apto'::jsonb)->>'resultado', 'publicado', 'admin publica o envio com parecer "apto"');
select published_material_id as v_m_apto from public.material_submissions where id = :'v_eq' \gset
select results_eq(
  format($$ select status, discipline_id, theme_id, title, subtitle, author, estimated_read_time_minutes, tags from public.materials where id = %L $$, :'v_m_apto'),
  format($$ values ('published'::text, %L::uuid, %L::uuid, %L::text, 'Subtítulo de teste'::text, 'Autor de teste'::text, 12, array['teste', 'p8']::text[]) $$,
         :'v_disc', :'v_theme', 'Envio quem pode ' || :'v_sfx'),
  'o material vai ao ar, no lugar do envio, com os campos da leitura'
);
select is((select count(*)::int from public.material_sections where material_id = :'v_m_apto'), 3, 'com as 3 seções');
select is((select count(*)::int from public.material_references where material_id = :'v_m_apto'), 2, 'e as 2 referências');
select results_eq(
  format($$ select s.status, s.published_material_id = %L::uuid, s.publication_note is null from public.material_submissions s where s.id = %L $$, :'v_m_apto', :'v_eq'),
  $$ values ('publicado'::text, true, true) $$, 'o envio vira "publicado", ligado ao material'
);
select is(
  (select count(*)::int from public.material_ai_provenance p where p.material_id = :'v_m_apto' and p.review_verdict = 'apto'),
  1, 'com a proveniência "revisado por IA" (parecer apto)'
);
select ok(app.material_tem_revisao_apto(:'v_m_apto'::uuid), 'o conteúdo no ar tem revisão "apto" vinculada');
select tests.authenticate_as(:'v_aluno');
select is(public.selo_de_revisao(:'v_m_apto'::uuid), 'ia', 'o aluno vê o selo "Revisado por IA"');
select tests.clear_auth();

-- Segunda chamada: não cria segundo material.
select tests.authenticate_as(:'v_admin');
select is(
  (public.admin_publicar_envio(:'v_eq', :'v_hq', tests.p8_leitura('Envio quem pode ' || :'v_sfx', 3)))->>'resultado',
  'ja_publicado', 'publicar de novo o mesmo envio não faz nada'
);
select tests.clear_auth();
select is((select count(*)::int from public.materials where title = 'Envio quem pode ' || :'v_sfx'), 1, 'e não cria segundo material');

-- ---------------------------------------------------------------------------
-- 4. Material novo: sem "apto" (não apto, erro, aguardando, apto de texto antigo) -> sem selo
-- ---------------------------------------------------------------------------
-- Lugar na árvore: o do envio (material acima e última posição entre os irmãos).
select tests.p8_envio(:'v_autor', :'v_disc', :'v_theme', 'Envio nao apto ' || :'v_sfx', 'nao_apto', 'nao_apto', :'v_pai') as v_en \gset
select tests.p8_envio(:'v_autor', :'v_disc', :'v_theme', 'Envio erro ' || :'v_sfx', 'erro') as v_ee \gset
select tests.p8_envio(:'v_autor', :'v_disc', :'v_theme', 'Envio aguardando ' || :'v_sfx', 'aguardando_revisao') as v_ea \gset
select tests.p8_envio(:'v_autor', :'v_disc', :'v_theme', 'Envio apto antigo ' || :'v_sfx', 'apto', 'apto') as v_eo \gset
update public.material_submissions set content_md = content_md || E'\ntexto novo depois da revisão' where id = :'v_eo';

select tests.authenticate_as(:'v_admin');
select (public.admin_publicar_envio(:'v_en', tests.p8_sha(:'v_en'), tests.p8_leitura('Envio nao apto ' || :'v_sfx', 2)))->>'resultado' as v_r_nao \gset
select (public.admin_publicar_envio(:'v_ee', tests.p8_sha(:'v_ee'), tests.p8_leitura('Envio erro ' || :'v_sfx', 2)))->>'resultado' as v_r_erro \gset
select (public.admin_publicar_envio(:'v_ea', tests.p8_sha(:'v_ea'), tests.p8_leitura('Envio aguardando ' || :'v_sfx', 2)))->>'resultado' as v_r_ag \gset
select (public.admin_publicar_envio(:'v_eo', tests.p8_sha(:'v_eo'), tests.p8_leitura('Envio apto antigo ' || :'v_sfx', 2)))->>'resultado' as v_r_antigo \gset
select tests.clear_auth();
select is(:'v_r_nao'::text, 'publicado', 'admin publica com parecer "não apto"');
select is(:'v_r_erro'::text, 'publicado', 'admin publica com o envio em "erro"');
select is(:'v_r_ag'::text, 'publicado', 'admin publica o envio que ainda aguarda a revisão');
select is(:'v_r_antigo'::text, 'publicado', 'admin publica o envio "apto" cujo texto mudou depois da revisão');
select published_material_id as v_m_nao from public.material_submissions where id = :'v_en' \gset
select published_material_id as v_m_erro from public.material_submissions where id = :'v_ee' \gset
select published_material_id as v_m_ag from public.material_submissions where id = :'v_ea' \gset
select published_material_id as v_m_antigo from public.material_submissions where id = :'v_eo' \gset
select is(
  (select count(*)::int from public.materials where id in (:'v_m_nao', :'v_m_erro', :'v_m_ag', :'v_m_antigo') and status = 'published'),
  4, 'os quatro materiais estão no ar'
);
select is(
  (select count(*)::int from public.material_ai_provenance where material_id in (:'v_m_nao', :'v_m_erro', :'v_m_ag', :'v_m_antigo')),
  0, 'nenhum deles tem a proveniência "revisado por IA"'
);
select tests.authenticate_as(:'v_aluno');
select is(
  (select count(*)::int from public.materials where id in (:'v_m_nao', :'v_m_erro', :'v_m_ag', :'v_m_antigo') and public.selo_de_revisao(id) is not null),
  0, 'o aluno lê os quatro sem selo'
);
select tests.clear_auth();
select results_eq(
  format($$ select parent_material_id, tree_sort_order, discipline_id, theme_id from public.materials where id = %L $$, :'v_m_nao'),
  format($$ values (%L::uuid, 0, %L::uuid, %L::uuid) $$, :'v_pai', :'v_disc', :'v_theme'),
  'o lugar na árvore é o do envio (material acima, primeira posição entre os irmãos)'
);
select is(
  (select count(*)::int from public.material_submissions where id in (:'v_en', :'v_ee', :'v_ea', :'v_eo') and status = 'publicado'),
  4, 'e os quatro envios ficam "publicados"'
);

-- ---------------------------------------------------------------------------
-- 5. Material novo: o que NÃO é publicado
-- ---------------------------------------------------------------------------
select tests.p8_envio(:'v_autor', :'v_disc', :'v_theme', 'Envio em revisao ' || :'v_sfx', 'em_revisao') as v_ev \gset
select tests.p8_envio(:'v_autor', :'v_disc', :'v_theme', 'Envio texto mudou ' || :'v_sfx', 'apto', 'apto') as v_em \gset
select tests.p8_sha(:'v_em') as v_hm \gset
-- O texto do envio muda depois de quem chama o ler (o hash acima é o do texto antigo).
update public.material_submissions set content_md = content_md || E'\notimo texto novo' where id = :'v_em';
select tests.p8_envio(:'v_autor', :'v_disc', :'v_theme', 'Envio titulo repetido ' || :'v_sfx', 'nao_apto', 'nao_apto') as v_et \gset
select tests.p8_envio(:'v_autor', :'v_disc', :'v_theme', 'Envio pai fora do ar ' || :'v_sfx', 'apto', 'apto', :'v_pai_sai') as v_ep \gset
update public.materials set status = 'draft' where id = :'v_pai_sai';
select tests.p8_envio(:'v_autor', :'v_disc', :'v_theme', 'Envio sem secao ' || :'v_sfx', 'apto', 'apto') as v_es \gset
select tests.p8_envio(:'v_autor', :'v_disc', :'v_theme', 'Envio que falha ' || :'v_sfx', 'nao_apto', 'nao_apto') as v_ef \gset
select tests.p8_envio_atualizacao(:'v_autor', :'v_pai', 'trocada ' || :'v_sfx', 'apto', 'apto') as v_eu_errado \gset

select tests.authenticate_as(:'v_admin');
select is(
  (public.admin_publicar_envio(:'v_ev', tests.p8_sha(:'v_ev'), tests.p8_leitura('Envio em revisao ' || :'v_sfx')))->>'resultado',
  'fora_de_estado', 'envio "em revisão" (o revisor está lendo agora) não é publicado'
);
select is(
  (public.admin_publicar_envio(:'v_ev', tests.p8_sha(:'v_ev'), tests.p8_leitura('Envio em revisao ' || :'v_sfx')))->>'estado',
  'em_revisao', 'e a resposta diz o estado'
);
select is(
  (public.admin_publicar_envio(:'v_em', :'v_hm', tests.p8_leitura('Envio texto mudou ' || :'v_sfx')))->>'resultado',
  'texto_mudou', 'hash do texto lido diferente do texto do envio: não publica'
);
-- Título que já existe (case e espaços não valem): recusa com o motivo, sem mexer no envio.
select (public.admin_publicar_envio(:'v_et', tests.p8_sha(:'v_et'), tests.p8_leitura('  ' || upper('Envio quem pode ' || :'v_sfx') || ' ')))->>'resultado' as v_r_titulo \gset
select (public.admin_publicar_envio(:'v_et', tests.p8_sha(:'v_et'), tests.p8_leitura('  ' || upper('Envio quem pode ' || :'v_sfx') || ' ')))->>'motivo' as v_motivo_titulo \gset
select (public.admin_publicar_envio(:'v_ep', tests.p8_sha(:'v_ep'), tests.p8_leitura('Envio pai fora do ar ' || :'v_sfx')))->>'resultado' as v_r_pai \gset
select (public.admin_publicar_envio(:'v_es', tests.p8_sha(:'v_es'), '{"title":"x","sections":[]}'::jsonb))->>'resultado' as v_r_sem \gset
select (public.admin_publicar_envio(:'v_es', tests.p8_sha(:'v_es'), null))->>'resultado' as v_r_nulo \gset
-- Falha no meio (seção sem conteúdo): desfaz tudo, devolve "falhou" e o envio fica como estava.
select (public.admin_publicar_envio(
  :'v_ef', tests.p8_sha(:'v_ef'),
  jsonb_set(tests.p8_leitura('Envio que falha ' || :'v_sfx', 2), '{sections,1,content}', '""')
))->>'resultado' as v_r_falha \gset
-- Envio de atualização não passa por aqui.
select (public.admin_publicar_envio(:'v_eu_errado', tests.p8_sha(:'v_eu_errado'), tests.p8_leitura('Qualquer ' || :'v_sfx')))->>'resultado' as v_r_upd \gset
select tests.clear_auth();

select is(:'v_r_titulo'::text, 'recusado', 'título repetido: recusado');
select ok(:'v_motivo_titulo'::text like 'Já existe um material com o título%', 'com o motivo em palavras leigas');
select is(:'v_r_pai'::text, 'recusado', 'material acima que não está publicado: recusado');
select is(:'v_r_sem'::text, 'texto_invalido', 'leitura sem seção: texto inválido');
select is(:'v_r_nulo'::text, 'texto_invalido', 'leitura nula: texto inválido');
select is(:'v_r_falha'::text, 'falhou', 'falha no meio da criação: "falhou"');
select is(:'v_r_upd'::text, 'fora_de_estado', 'envio de atualização não é publicado como material novo');
select is(
  (select count(*)::int from public.materials where title in (
    'Envio em revisao ' || :'v_sfx', 'Envio texto mudou ' || :'v_sfx', 'Envio pai fora do ar ' || :'v_sfx',
    'Envio sem secao ' || :'v_sfx', 'Envio que falha ' || :'v_sfx', 'Qualquer ' || :'v_sfx')),
  0, 'nada dessas tentativas criou material'
);
select is(
  (select count(*)::int from public.materials where lower(btrim(title)) = lower('Envio quem pode ' || :'v_sfx')), 1,
  'e o título repetido não criou um segundo material'
);
select results_eq(
  format($$ select array_agg(status order by status), count(*) filter (where published_material_id is null and publication_note is null)::int
              from public.material_submissions where id in (%L, %L, %L, %L, %L, %L) $$,
         :'v_ev', :'v_em', :'v_et', :'v_ep', :'v_es', :'v_ef'),
  $$ values (array['apto', 'apto', 'apto', 'em_revisao', 'nao_apto', 'nao_apto']::text[], 6) $$,
  'e os envios continuam como estavam (a recusa e a falha não mudam o estado nem gravam recado)'
);

-- ---------------------------------------------------------------------------
-- 6. Questões
-- ---------------------------------------------------------------------------
select tests.p8_material_publicado(:'v_disc', :'v_theme', 'Material Q1 ' || :'v_sfx') as v_mq1 \gset
select tests.p8_material_publicado(:'v_disc', :'v_theme', 'Material Q2 ' || :'v_sfx') as v_mq2 \gset
select tests.p8_envio_questoes(:'v_autor', 'Lote apto ' || :'v_sfx', array[:'v_mq1']::uuid[], 'apto', 'apto') as v_qa \gset
select tests.p8_envio_questoes(:'v_autor', 'Lote nao apto ' || :'v_sfx', array[:'v_mq1']::uuid[], 'nao_apto', 'nao_apto') as v_qn \gset
select tests.p8_envio_questoes(:'v_autor', 'Lote erro ' || :'v_sfx', array[:'v_mq2']::uuid[], 'erro') as v_qe \gset
select tests.p8_envio_questoes(:'v_autor', 'Lote aguardando ' || :'v_sfx', array[:'v_mq2']::uuid[], 'aguardando_revisao') as v_qg \gset
select tests.p8_envio_questoes(:'v_autor', 'Lote em revisao ' || :'v_sfx', array[:'v_mq1']::uuid[], 'em_revisao') as v_qv \gset
select tests.p8_envio_questoes(:'v_autor', 'Lote texto mudou ' || :'v_sfx', array[:'v_mq1']::uuid[], 'apto', 'apto') as v_qm \gset
select tests.p8_sha(:'v_qm') as v_hqm \gset
update public.question_submissions set content_md = content_md || E'\ntexto novo' where id = :'v_qm';
select tests.p8_envio_questoes(:'v_autor', 'Lote sem material ' || :'v_sfx', '{}'::uuid[], 'nao_apto', 'nao_apto') as v_qs \gset

select tests.authenticate_as(:'v_aluno');
select throws_ok(
  format($$ select public.admin_publicar_questoes(%L, %L, tests.p8_leitura_de_questoes(%L, %L, 'A', 1)) $$, :'v_qa', tests.p8_sha(:'v_qa'), :'v_disc', :'v_theme'),
  '42501', 'acesso negado', 'aluno não publica questões'
);
select tests.clear_auth();
select tests.authenticate_as(:'v_pend');
select throws_ok(
  format($$ select public.admin_publicar_questoes(%L, %L, tests.p8_leitura_de_questoes(%L, %L, 'A', 1)) $$, :'v_qa', tests.p8_sha(:'v_qa'), :'v_disc', :'v_theme'),
  '42501', 'acesso negado', 'usuário pendente não publica questões'
);
select tests.clear_auth();
select tests.authenticate_as_anon();
select throws_ok(
  format($$ select public.admin_publicar_questoes(%L, %L, tests.p8_leitura_de_questoes(%L, %L, 'A', 1)) $$, :'v_qa', tests.p8_sha(:'v_qa'), :'v_disc', :'v_theme'),
  '42501', NULL, 'anon não publica questões'
);
select tests.clear_auth();
select is((select status from public.question_submissions where id = :'v_qa'), 'apto', 'o lote continua "apto" depois das tentativas recusadas');

select tests.authenticate_as(:'v_admin');
select public.admin_publicar_questoes(:'v_qa', tests.p8_sha(:'v_qa'), tests.p8_leitura_de_questoes(:'v_disc', :'v_theme', 'Apto ' || :'v_sfx', 2)) as v_rq_apto \gset
select (public.admin_publicar_questoes(:'v_qn', tests.p8_sha(:'v_qn'), tests.p8_leitura_de_questoes(:'v_disc', :'v_theme', 'NaoApto ' || :'v_sfx', 2)))->>'resultado' as v_rq_nao \gset
select (public.admin_publicar_questoes(:'v_qe', tests.p8_sha(:'v_qe'), tests.p8_leitura_de_questoes(:'v_disc', :'v_theme', 'Erro ' || :'v_sfx', 1)))->>'resultado' as v_rq_erro \gset
select (public.admin_publicar_questoes(:'v_qg', tests.p8_sha(:'v_qg'), tests.p8_leitura_de_questoes(:'v_disc', :'v_theme', 'Aguardando ' || :'v_sfx', 1)))->>'resultado' as v_rq_ag \gset
select tests.clear_auth();

select is((:'v_rq_apto'::jsonb)->>'resultado', 'publicado', 'admin publica o lote com parecer "apto"');
select is(:'v_rq_nao'::text, 'publicado', 'e com parecer "não apto"');
select is(:'v_rq_erro'::text, 'publicado', 'e com o envio em "erro"');
select is(:'v_rq_ag'::text, 'publicado', 'e com o envio ainda aguardando a revisão');
select published_question_ids as v_ids_apto from public.question_submissions where id = :'v_qa' \gset
select published_question_ids as v_ids_nao from public.question_submissions where id = :'v_qn' \gset
select published_question_ids as v_ids_erro from public.question_submissions where id = :'v_qe' \gset
select published_question_ids as v_ids_ag from public.question_submissions where id = :'v_qg' \gset
select is(cardinality(:'v_ids_apto'::uuid[]), 2, 'as 2 questões do lote "apto" foram criadas');
select is(
  (select count(*)::int from public.questions where id = any (:'v_ids_apto'::uuid[]) and status = 'published'), 2,
  'e estão publicadas'
);
select results_eq(
  format($$ select count(*)::int, count(distinct qm.question_id)::int from public.question_materials qm where qm.question_id = any (%L::uuid[]) and qm.material_id = %L $$, :'v_ids_apto', :'v_mq1'),
  $$ values (2, 2) $$, 'ligadas ao material escolhido no envio'
);
select is(
  (select count(*)::int from public.question_options o where o.question_id = any (:'v_ids_apto'::uuid[])), 6,
  'cada uma com as 3 alternativas'
);
select is(
  (select count(*)::int from public.question_option_keys k where k.question_id = any (:'v_ids_apto'::uuid[]) and k.is_correct and k.explanation <> ''), 2,
  'o gabarito e as explicações vão junto (uma correta por questão)'
);
select results_eq(
  format($$ select s.status, cardinality(s.published_question_ids), s.publication_note is null from public.question_submissions s where s.id = %L $$, :'v_qa'),
  $$ values ('publicado'::text, 2, true) $$, 'o envio de questões vira "publicado", com as questões ligadas'
);
select is(
  (select count(*)::int from public.question_ai_provenance where question_id = any (:'v_ids_apto'::uuid[]) and review_verdict = 'apto'), 2,
  'só o lote com parecer "apto" tem a proveniência de IA'
);
select is(
  (select count(*)::int from public.question_ai_provenance where question_id = any (:'v_ids_nao'::uuid[] || :'v_ids_erro'::uuid[] || :'v_ids_ag'::uuid[])), 0,
  'os lotes "não apto", "erro" e aguardando não têm'
);
select tests.authenticate_as(:'v_aluno');
select is(
  (select count(*)::int from public.selos_de_questoes(:'v_ids_apto'::uuid[] || :'v_ids_nao'::uuid[] || :'v_ids_erro'::uuid[] || :'v_ids_ag'::uuid[])), 2,
  'o selo "Revisada por IA" só aparece nas 2 questões do lote "apto"'
);
select tests.clear_auth();

select tests.authenticate_as(:'v_admin');
select is(
  (public.admin_publicar_questoes(:'v_qa', tests.p8_sha(:'v_qa'), tests.p8_leitura_de_questoes(:'v_disc', :'v_theme', 'Apto ' || :'v_sfx', 2)))->>'resultado',
  'ja_publicado', 'publicar de novo o mesmo lote não faz nada'
);
select is(
  (public.admin_publicar_questoes(:'v_qv', tests.p8_sha(:'v_qv'), tests.p8_leitura_de_questoes(:'v_disc', :'v_theme', 'EmRevisao ' || :'v_sfx', 1)))->>'resultado',
  'fora_de_estado', 'lote "em revisão" não é publicado'
);
select is(
  (public.admin_publicar_questoes(:'v_qm', :'v_hqm', tests.p8_leitura_de_questoes(:'v_disc', :'v_theme', 'Mudou ' || :'v_sfx', 1)))->>'resultado',
  'texto_mudou', 'texto do lote que mudou no meio: não publica'
);
select (public.admin_publicar_questoes(:'v_qs', tests.p8_sha(:'v_qs'), tests.p8_leitura_de_questoes(:'v_disc', :'v_theme', 'SemMaterial ' || :'v_sfx', 1)))->>'resultado' as v_rq_sem \gset
select (public.admin_publicar_questoes(:'v_qs', tests.p8_sha(:'v_qs'), tests.p8_leitura_de_questoes(:'v_disc', :'v_theme', 'SemMaterial ' || :'v_sfx', 1, '["Material que nao existe"]'::jsonb)))->>'resultado' as v_rq_inex \gset
select (public.admin_publicar_questoes(:'v_qs', tests.p8_sha(:'v_qs'), '[]'::jsonb))->>'resultado' as v_rq_vazio \gset
select tests.clear_auth();
select is(:'v_rq_sem'::text, 'recusado', 'questão sem material nenhum: recusada');
select is(:'v_rq_inex'::text, 'recusado', 'material que não existe: recusado');
select is(:'v_rq_vazio'::text, 'texto_invalido', 'lista vazia: texto inválido');
select results_eq(
  format($$ select array_agg(status order by status), sum(cardinality(published_question_ids))::int, count(*) filter (where publication_note is null)::int from public.question_submissions where id in (%L, %L, %L) $$, :'v_qv', :'v_qm', :'v_qs'),
  $$ values (array['apto', 'em_revisao', 'nao_apto']::text[], 0, 3) $$,
  'os lotes recusados continuam como estavam'
);
select is(
  (select count(*)::int from public.questions where question_stem like any (array['EmRevisao %', 'Mudou %', 'SemMaterial %'] ) and question_stem like '%' || :'v_sfx' || '%'), 0,
  'e nenhuma questão deles foi criada'
);

-- ---------------------------------------------------------------------------
-- 7. Atualização de material
-- ---------------------------------------------------------------------------
-- O material de partida: publicado pelo admin com "apto" (3 seções, 2 referências).
select tests.p8_envio(:'v_autor', :'v_disc', :'v_theme', 'Base atualizacao ' || :'v_sfx', 'apto', 'apto') as v_e0 \gset
select tests.authenticate_as(:'v_admin');
select (public.admin_publicar_envio(:'v_e0', tests.p8_sha(:'v_e0'), tests.p8_leitura('Base atualizacao ' || :'v_sfx', 3)))->>'resultado' as v_res0 \gset
select tests.clear_auth();
select published_material_id as v_m from public.material_submissions where id = :'v_e0' \gset
select id as v_s1 from public.material_sections where material_id = :'v_m' and title = 'Seção 1' \gset
select id as v_s2 from public.material_sections where material_id = :'v_m' and title = 'Seção 2' \gset
select id as v_s3 from public.material_sections where material_id = :'v_m' and title = 'Seção 3' \gset
select is(:'v_res0'::text, 'publicado', 'o material de partida foi publicado pelo admin');

-- Envios de atualização (o lugar e a base vêm do banco).
select tests.p8_envio_atualizacao(:'v_autor', :'v_m', 'apto ' || :'v_sfx', 'apto', 'apto') as v_u_apto \gset
select tests.p8_envio_atualizacao(:'v_autor', :'v_m', 'em revisao ' || :'v_sfx', 'em_revisao') as v_u_ev \gset

-- Seção 1 igual, Seção 2 com texto novo, Seção 3 some.
select jsonb_set(tests.p8_leitura('Base atualizacao ' || :'v_sfx', 2), '{sections,1,content}', '"Texto NOVO da seção 2"')::text as v_texto_apto \gset

select tests.authenticate_as(:'v_aluno');
select throws_ok(
  format($$ select public.admin_aplicar_atualizacao(%L, %L, %L::jsonb) $$, :'v_u_apto', tests.p8_sha(:'v_u_apto'), :'v_texto_apto'),
  '42501', 'acesso negado', 'aluno não aplica atualização'
);
select tests.clear_auth();
select tests.authenticate_as(:'v_pend');
select throws_ok(
  format($$ select public.admin_aplicar_atualizacao(%L, %L, %L::jsonb) $$, :'v_u_apto', tests.p8_sha(:'v_u_apto'), :'v_texto_apto'),
  '42501', 'acesso negado', 'usuário pendente não aplica atualização'
);
select tests.clear_auth();
select tests.authenticate_as_anon();
select throws_ok(
  format($$ select public.admin_aplicar_atualizacao(%L, %L, %L::jsonb) $$, :'v_u_apto', tests.p8_sha(:'v_u_apto'), :'v_texto_apto'),
  '42501', NULL, 'anon não aplica atualização'
);
select tests.clear_auth();
select is(
  (select count(*)::int from public.material_sections where material_id = :'v_m'), 3,
  'nada mudou no material depois das tentativas recusadas'
);

-- 7a. Com revisão "apto": aplica, preserva ids, o selo vale para o conteúdo novo.
select tests.authenticate_as(:'v_admin');
select public.admin_aplicar_atualizacao(:'v_u_apto', tests.p8_sha(:'v_u_apto'), :'v_texto_apto'::jsonb) as v_ra \gset
select tests.clear_auth();
select is((:'v_ra'::jsonb)->>'resultado', 'aplicado', 'admin aplica a atualização com parecer "apto"');
select results_eq(
  format($$ select id, title from public.material_sections where material_id = %L order by sort_order $$, :'v_m'),
  format($$ values (%L::uuid, 'Seção 1'::text), (%L::uuid, 'Seção 2'::text) $$, :'v_s1', :'v_s2'),
  'as seções casadas pelo título mantêm o id; a que saiu do arquivo some'
);
select is((select content from public.material_sections where id = :'v_s2'), 'Texto NOVO da seção 2', 'e o texto novo entrou');
select results_eq(
  format($$ select status, applied_at is not null, publication_note is null from public.material_submissions where id = %L $$, :'v_u_apto'),
  $$ values ('publicado'::text, true, true) $$, 'o envio de atualização vira "publicado"'
);
select ok(app.material_tem_revisao_apto(:'v_m'::uuid), 'a proveniência passa a valer para o conteúdo novo (selo mantido)');
select tests.authenticate_as(:'v_aluno');
select is(public.selo_de_revisao(:'v_m'::uuid), 'ia', 'o aluno vê o selo');
select tests.clear_auth();
select tests.authenticate_as(:'v_admin');
select is(
  (public.admin_aplicar_atualizacao(:'v_u_apto', tests.p8_sha(:'v_u_apto'), :'v_texto_apto'::jsonb))->>'resultado',
  'ja_publicado', 'aplicar de novo o mesmo envio não faz nada'
);
select tests.clear_auth();

-- 7b. Com "não apto": aplica sem selo (a proveniência antiga deixa de bater com o conteúdo).
-- A base do envio é a do material ANTES da 7a: refaz o envio sobre a versão de agora.
select tests.p8_envio_atualizacao(:'v_autor', :'v_m', 'nao apto 2 ' || :'v_sfx', 'nao_apto', 'nao_apto') as v_u_nao2 \gset
select jsonb_set(tests.p8_leitura('Base atualizacao ' || :'v_sfx', 2), '{sections,0,content}', '"Seção 1 mudada pela atualização reprovada"')::text as v_texto_nao \gset
select tests.authenticate_as(:'v_admin');
select (public.admin_aplicar_atualizacao(:'v_u_nao2', tests.p8_sha(:'v_u_nao2'), :'v_texto_nao'::jsonb))->>'resultado' as v_rn \gset
select tests.clear_auth();
select is(:'v_rn'::text, 'aplicado', 'admin aplica a atualização com parecer "não apto"');
select is((select content from public.material_sections where id = :'v_s1'), 'Seção 1 mudada pela atualização reprovada', 'o conteúdo foi trocado');
select is(
  (select id from public.material_sections where material_id = :'v_m' and title = 'Seção 1'), :'v_s1'::uuid,
  'o id da seção continua o mesmo'
);
select ok(not app.material_tem_revisao_apto(:'v_m'::uuid), 'mas o conteúdo no ar não tem mais revisão "apto" vinculada');
select tests.authenticate_as(:'v_aluno');
select is(public.selo_de_revisao(:'v_m'::uuid), null::text, 'o aluno deixa de ver o selo');
select tests.clear_auth();
select is(
  (select status from public.material_submissions where id = :'v_u_nao2'), 'publicado', 'o envio fica "publicado"'
);

-- 7c. Envios ainda aguardando, sem revisão: aplica sem selo (base de agora).
select tests.p8_envio_atualizacao(:'v_autor', :'v_m', 'aguardando 2 ' || :'v_sfx', 'aguardando_revisao') as v_u_ag2 \gset
select jsonb_set(tests.p8_leitura('Base atualizacao ' || :'v_sfx', 2), '{sections,1,content}', '"Seção 2 mudada pelo envio que aguardava"')::text as v_texto_ag \gset
select tests.authenticate_as(:'v_admin');
select (public.admin_aplicar_atualizacao(:'v_u_ag2', tests.p8_sha(:'v_u_ag2'), :'v_texto_ag'::jsonb))->>'resultado' as v_rg \gset
select tests.clear_auth();
select is(:'v_rg'::text, 'aplicado', 'admin aplica a atualização que ainda aguardava a revisão');
select is((select content from public.material_sections where id = :'v_s2'), 'Seção 2 mudada pelo envio que aguardava', 'o conteúdo foi trocado');

-- 7d. Arquivo igual ao que está no ar: sem mudança.
select tests.p8_envio_atualizacao(:'v_autor', :'v_m', 'igual ' || :'v_sfx', 'apto', 'apto') as v_u_igual \gset
select app.material_snapshot_hash(:'v_m') as v_hash_antes \gset
select tests.authenticate_as(:'v_admin');
select (public.admin_aplicar_atualizacao(:'v_u_igual', tests.p8_sha(:'v_u_igual'), tests.p8_leitura_do_material(:'v_m')))->>'resultado' as v_ri \gset
select tests.clear_auth();
select is(:'v_ri'::text, 'sem_mudanca', 'arquivo igual ao que está no ar: sem mudança');
select is(app.material_snapshot_hash(:'v_m'), :'v_hash_antes', 'e o material não mudou');
select is((select status from public.material_submissions where id = :'v_u_igual'), 'publicado', 'o envio termina "publicado"');

-- 7e. O que NÃO é aplicado: em revisão, texto que mudou, base velha, recusas, falha, envio do outro tipo.
select tests.p8_envio_atualizacao(:'v_autor', :'v_m', 'texto mudou ' || :'v_sfx', 'apto', 'apto') as v_u_mudou \gset
select tests.p8_sha(:'v_u_mudou') as v_h_mudou \gset
select tests.p8_envio_atualizacao(:'v_autor', :'v_m', 'falha ' || :'v_sfx', 'nao_apto', 'nao_apto') as v_u_falha \gset
select tests.p8_envio(:'v_autor', :'v_disc', :'v_theme', 'Envio de material novo ' || :'v_sfx', 'apto', 'apto') as v_e_novo \gset
select tests.p8_material_publicado(:'v_disc', :'v_theme', 'Outro material P8 ' || :'v_sfx') as v_outro_m \gset
select tests.p8_envio_atualizacao(:'v_autor', :'v_m', 'titulo de outro ' || :'v_sfx', 'nao_apto', 'nao_apto') as v_u_titulo \gset
update public.material_submissions set content_md = content_md || E'\ntexto novo' where id = :'v_u_mudou';

select tests.authenticate_as(:'v_admin');
select (public.admin_aplicar_atualizacao(:'v_u_ev', tests.p8_sha(:'v_u_ev'), tests.p8_leitura('Base atualizacao ' || :'v_sfx', 2)))->>'resultado' as v_r_ev \gset
select (public.admin_aplicar_atualizacao(:'v_u_mudou', :'v_h_mudou', tests.p8_leitura('Base atualizacao ' || :'v_sfx', 2)))->>'resultado' as v_r_mudou \gset
select (public.admin_aplicar_atualizacao(:'v_e_novo', tests.p8_sha(:'v_e_novo'), tests.p8_leitura('Base atualizacao ' || :'v_sfx', 2)))->>'resultado' as v_r_novo \gset
select (public.admin_aplicar_atualizacao(:'v_u_titulo', tests.p8_sha(:'v_u_titulo'), tests.p8_leitura('Outro material P8 ' || :'v_sfx', 2)))->>'resultado' as v_r_titulo2 \gset
select (public.admin_aplicar_atualizacao(:'v_u_titulo', tests.p8_sha(:'v_u_titulo'), '{"title":"x","sections":[]}'::jsonb))->>'resultado' as v_r_vazio \gset
select (public.admin_aplicar_atualizacao(
  :'v_u_falha', tests.p8_sha(:'v_u_falha'),
  jsonb_set(tests.p8_leitura('Base atualizacao ' || :'v_sfx', 2), '{sections,1,content}', '""')
))->>'resultado' as v_r_falha2 \gset
select tests.clear_auth();
select tests.p8_envio_atualizacao(:'v_autor', :'v_m', 'material mudou depois ' || :'v_sfx', 'apto', 'apto') as v_u_depois \gset
-- O material muda DEPOIS do envio (outra atualização): a base do envio fica velha.
select tests.authenticate_as(:'v_admin');
select jsonb_set(tests.p8_leitura('Base atualizacao ' || :'v_sfx', 2), '{sections,0,content}', '"Outra mudança"')::text as v_texto_outra \gset
select tests.p8_envio_atualizacao(:'v_autor', :'v_m', 'outra ' || :'v_sfx', 'nao_apto', 'nao_apto') as v_u_outra \gset
select (public.admin_aplicar_atualizacao(:'v_u_outra', tests.p8_sha(:'v_u_outra'), :'v_texto_outra'::jsonb))->>'resultado' as v_r_outra \gset
select (public.admin_aplicar_atualizacao(:'v_u_depois', tests.p8_sha(:'v_u_depois'), tests.p8_leitura('Base atualizacao ' || :'v_sfx', 2)))->>'resultado' as v_r_depois \gset
select (public.admin_aplicar_atualizacao(:'v_u_depois', tests.p8_sha(:'v_u_depois'), tests.p8_leitura('Base atualizacao ' || :'v_sfx', 2)))->>'motivo' as v_motivo_depois \gset
select tests.clear_auth();
select is(:'v_r_ev'::text, 'fora_de_estado', 'atualização "em revisão" não é aplicada');
select is(:'v_r_mudou'::text, 'texto_mudou', 'texto que mudou no meio: não aplica');
select is(:'v_r_novo'::text, 'fora_de_estado', 'envio de material novo não é aplicado como atualização');
select is(:'v_r_titulo2'::text, 'recusado', 'título de outro material: recusado');
select is(:'v_r_vazio'::text, 'texto_invalido', 'leitura sem seção: texto inválido');
select is(:'v_r_falha2'::text, 'falhou', 'falha no meio da troca: "falhou"');
select is(:'v_r_outra'::text, 'aplicado', 'uma outra atualização muda o material');
select is(:'v_r_depois'::text, 'recusado', 'atualização sobre uma versão velha do material: recusada');
select ok(:'v_motivo_depois'::text like 'O material mudou depois que você enviou esta atualização%', 'com o motivo em palavras leigas');
select results_eq(
  format($$ select array_agg(status order by status), count(*) filter (where applied_at is null and publication_note is null)::int
              from public.material_submissions where id in (%L, %L, %L, %L, %L) $$,
         :'v_u_ev', :'v_u_mudou', :'v_u_titulo', :'v_u_falha', :'v_u_depois'),
  $$ values (array['apto', 'apto', 'em_revisao', 'nao_apto', 'nao_apto']::text[], 5) $$,
  'os envios recusados continuam como estavam (sem aplicar, sem recado)'
);
select is(
  (select count(*)::int from public.material_sections where material_id = :'v_m' and btrim(content) = ''),
  0, 'e a falha desfez tudo: nenhuma seção ficou vazia ou pela metade'
);

-- Fim: nenhum recado foi gravado por recusa ou falha, em nenhum envio que não foi publicado.
select is(
  (select count(*)::int from public.material_submissions where title like '%' || :'v_sfx' and status <> 'publicado' and publication_note is not null),
  0, 'recusa e falha não gravam recado em nenhum envio'
);

-- Limpeza: as questões que este teste publicou sem revisão "apto" (sem proveniência de IA) não podem ficar para os outros
-- arquivos: o da 44-H2 confere que toda questão publicada por um envio tem proveniência.
update public.questions set status = 'draft'
 where id in (select unnest(published_question_ids) from public.question_submissions where title like '%' || :'v_sfx') and status = 'published';
delete from public.questions
 where id in (select unnest(published_question_ids) from public.question_submissions where title like '%' || :'v_sfx');
select is(
  (select count(*)::int from public.questions where question_stem like '%' || :'v_sfx' || '%'), 0,
  'as questões publicadas por este teste foram apagadas ao final'
);

select * from finish();
