-- ============================================================================
-- 43-D — Busca de materiais no banco (migration 20260924140000)
--
-- Self-contido: redefine os helpers tests.* (create or replace, idempotente),
-- como os outros arquivos, para não depender da ordem alfabética.
--
-- Isolamento: pgTAP deixa fixtures persistentes e o banco pode ter material
-- de outros arquivos. Toda busca que conta resultados filtra pela disciplina
-- própria deste arquivo (criada com código único a cada execução).
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

create or replace function tests.clear_auth()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', false);
  reset role;
end;
$$;

grant usage on schema tests to anon, authenticated;
grant execute on function tests.clear_auth() to anon, authenticated;

select plan(42);

select tests.clear_auth();

select tests.create_user('busca.admin@test.local', 'admin', 'active') as v_admin \gset
select tests.create_user('busca.student@test.local', 'student', 'active') as v_student \gset
select tests.create_user('busca.pending@test.local', 'student', 'pending') as v_pending \gset

insert into public.disciplines (name, code, cycle)
values ('Farmacologia (busca)', 'BUSCA-' || substr(gen_random_uuid()::text, 1, 8), 'basico')
returning id as v_disc \gset
insert into public.themes (discipline_id, name) values (:'v_disc', 'Antimicrobianos (busca)')
returning id as v_theme \gset
insert into public.disciplines (name, code, cycle)
values ('Infectologia (busca)', 'BUSCA2-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_disc2 \gset
insert into public.themes (discipline_id, name) values (:'v_disc2', 'Outro tema (busca)')
returning id as v_theme2 \gset

-- Árvore: Antimicrobianos → Beta-lactâmicos (rótulo curto "β-lactâmicos") → Cefalosporinas.
-- Como `postgres`, a guarda de publicação deixa inserir já publicado.
insert into public.materials (discipline_id, theme_id, title, status, estimated_read_time_minutes)
values (:'v_disc', :'v_theme', 'Antimicrobianos', 'published', 5) returning id as v_raiz \gset
insert into public.material_sections (material_id, sort_order, title, content)
values (:'v_raiz', 0, 'Visão geral', 'Classes de fármacos contra bactérias.');

insert into public.materials (discipline_id, theme_id, title, status, parent_material_id, nav_short_title)
values (:'v_disc', :'v_theme', 'Beta-lactâmicos', 'published', :'v_raiz', 'β-lactâmicos') returning id as v_classe \gset
insert into public.material_sections (material_id, sort_order, title, content)
values (:'v_classe', 0, 'Estrutura', 'Todos compartilham o anel característico.');

insert into public.materials (discipline_id, theme_id, title, subtitle, tags, status, parent_material_id, estimated_read_time_minutes)
values (:'v_disc', :'v_theme', 'Cefalosporinas', 'Da primeira à quinta geração', array['Rocefin', 'CRO'],
        'published', :'v_classe', 12)
returning id as v_cef \gset
insert into public.material_sections (material_id, sort_order, title, content)
values (:'v_cef', 0, 'Mecanismo de ação', 'Ligam-se às **PBPs** e inibem a síntese da parede celular.')
returning id as v_cef_s1 \gset
insert into public.material_sections (material_id, sort_order, title, content, key_takeaways)
values (:'v_cef', 1, 'Espectro por geração',
        E'## Terceira geração\n\nA terceira geração cobre gram-negativos; a *ceftriaxona* atravessa a barreira hematoencefálica.\n\n| Droga | Via |\n|---|---|\n| Ceftriaxona | IV |',
        array['Ceftriaxona trata meningite.'])
returning id as v_cef_s2 \gset

-- Rascunho: só o admin encontra.
insert into public.materials (discipline_id, theme_id, title, status)
values (:'v_disc', :'v_theme', 'Carbapenêmicos em rascunho', 'draft') returning id as v_rascunho \gset
insert into public.material_sections (material_id, sort_order, title, content)
values (:'v_rascunho', 0, 'Espectro', 'Um betalactâmico de espectro ultra-amplo.');

-- Mesmo assunto em outra disciplina (filtro de disciplina).
insert into public.materials (discipline_id, theme_id, title, status)
values (:'v_disc2', :'v_theme2', 'Cefalosporinas na prática clínica', 'published') returning id as v_outra \gset
insert into public.material_sections (material_id, sort_order, title, content)
values (:'v_outra', 0, 'Uso', 'Escolha empírica.');

-- Ordem por relevância: o mesmo termo em um campo diferente de cada material.
insert into public.materials (discipline_id, theme_id, title, status)
values (:'v_disc', :'v_theme', 'Zorvex no título', 'published') returning id as v_k_titulo \gset
insert into public.material_sections (material_id, sort_order, title, content)
values (:'v_k_titulo', 0, 'Introdução', 'Nada de especial aqui.');
insert into public.materials (discipline_id, theme_id, title, tags, status)
values (:'v_disc', :'v_theme', 'Material com palavra-chave', array['zorvex'], 'published') returning id as v_k_chave \gset
insert into public.material_sections (material_id, sort_order, title, content)
values (:'v_k_chave', 0, 'Introdução', 'Nada de especial aqui.');
insert into public.materials (discipline_id, theme_id, title, status)
values (:'v_disc', :'v_theme', 'Material com seção', 'published') returning id as v_k_secao \gset
insert into public.material_sections (material_id, sort_order, title, content)
values (:'v_k_secao', 0, 'Zorvex em detalhe', 'Nada de especial aqui.');
insert into public.materials (discipline_id, theme_id, title, status)
values (:'v_disc', :'v_theme', 'Material com texto', 'published') returning id as v_k_texto \gset
insert into public.material_sections (material_id, sort_order, title, content)
values (:'v_k_texto', 0, 'Introdução', 'O zorvex aparece. Zorvex de novo. E zorvex outra vez, zorvex.');

-- Resultado de uma busca como tabela temporária legível por `authenticated`.
create temp table r (pos int, material_id uuid, title text, title_marked text, status text,
  discipline_id uuid, discipline_name text, tree_path text[], section_id uuid,
  section_title_marked text, snippet text, estimated_read_time_minutes int);
grant all on r to authenticated;

create function pg_temp.buscar(p_query text, p_disc uuid, p_only_unread boolean default false)
returns setof uuid language sql as $fn$
  select s.material_id from public.search_materials(p_query, p_disc, p_only_unread) s
$fn$;

create function pg_temp.guardar(p_query text, p_disc uuid) returns void language sql as $fn$
  delete from r;
  insert into r
  select row_number() over (), s.* from public.search_materials(p_query, p_disc) s;
$fn$;

-- ── A. Normalização (sem acento, maiúscula, letra grega, hífen) ────────────
select is(app.search_base('Β-Lactâmicos GERAÇÃO'), 'beta-lactamicos geracao',
  'normalização: minúsculas, sem acento, letra grega por extenso');
select is(app.search_document('β-lactâmicos de 3ª geração'), 'beta lactamicos de 3a geracao betalactamicos',
  'documento traz as partes do termo com hífen e a forma unida');

select set_config('busca.disc', :'v_disc', false);
select tests.authenticate_as(:'v_student');

-- ── B. Acento, letra grega, hífen e prefixo ────────────────────────────────
select set_eq(
  $$ select pg_temp.buscar('betalactamico', current_setting('busca.disc')::uuid) $$,
  $$ select pg_temp.buscar('beta-lactâmico', current_setting('busca.disc')::uuid) $$,
  '"betalactamico" e "beta-lactâmico" acham os mesmos materiais'
);
select set_eq(
  $$ select pg_temp.buscar('β-lactâmicos', current_setting('busca.disc')::uuid) $$,
  $$ select pg_temp.buscar('betalactamico', current_setting('busca.disc')::uuid) $$,
  '"β-lactâmicos" acha os mesmos materiais que "betalactamico"'
);
select ok(:'v_classe'::uuid in (select pg_temp.buscar('betalactamico', :'v_disc')),
  '"betalactamico" acha o material "Beta-lactâmicos"');
select ok(:'v_cef'::uuid in (select pg_temp.buscar('geracao', :'v_disc')),
  '"geracao" acha "geração"');
select ok(:'v_cef'::uuid in (select pg_temp.buscar('CEFALOSP', :'v_disc')),
  'prefixo de 4+ letras ("cefalosp"), em qualquer caixa, já encontra');
select ok(:'v_cef'::uuid not in (select pg_temp.buscar('cef', :'v_disc')),
  'menos de 4 letras não vira prefixo');

-- ── C. Várias palavras em qualquer ordem; aspas para frase exata ───────────
select ok(:'v_cef'::uuid in (select pg_temp.buscar('ceftriaxona geração terceira', :'v_disc')),
  'várias palavras, em qualquer ordem, espalhadas pelo material');
select is((select count(*) from pg_temp.buscar('cefalosporinas zorvex', :'v_disc'))::int, 0,
  'todas as palavras precisam estar no material');
select ok(:'v_cef'::uuid in (select pg_temp.buscar('"terceira geração"', :'v_disc')),
  'frase exata entre aspas encontra');
select ok(:'v_cef'::uuid not in (select pg_temp.buscar('"geração terceira"', :'v_disc')),
  'frase exata fora de ordem não encontra');
select is((select count(*) from pg_temp.buscar('  "" -- ', :'v_disc'))::int, 0,
  'busca vazia ou só com pontuação não devolve nada');

-- ── D. Palavras-chave ──────────────────────────────────────────────────────
select ok(:'v_cef'::uuid in (select pg_temp.buscar('rocefin', :'v_disc')),
  'nome comercial cadastrado como palavra-chave encontra');
select ok(:'v_cef'::uuid in (select pg_temp.buscar('CRO', :'v_disc')),
  'sigla cadastrada como palavra-chave encontra');

-- ── E. Ordem: título > palavras-chave > título de seção > texto ────────────
select results_eq(
  $$ select s.material_id from public.search_materials('zorvex', current_setting('busca.disc')::uuid) s $$,
  format('values (%L::uuid), (%L::uuid), (%L::uuid), (%L::uuid)',
         :'v_k_titulo', :'v_k_chave', :'v_k_secao', :'v_k_texto'),
  'relevância: título > palavras-chave > título de seção > texto (texto repetido não passa na frente)'
);

-- ── F. Resultado: caminho na árvore, trecho destacado, seção, tempo ────────
select pg_temp.guardar('hematoencefalica', :'v_disc');
select is((select count(*) from r)::int, 1, 'termo só do texto acha um material');
select is((select material_id from r), :'v_cef'::uuid, 'e é o material certo');
select is((select tree_path from r), array['Farmacologia (busca)', 'Antimicrobianos', 'β-lactâmicos'],
  'caminho na árvore: disciplina e ancestrais, com rótulo curto');
select is((select section_id from r), :'v_cef_s2'::uuid, 'o clique abre na seção que casou');
select is((select section_title_marked from r), 'Espectro por geração', 'título da seção do resultado');
select ok((select position(chr(57344) || 'hematoencefálica' || chr(57345) in snippet) > 0 from r),
  'trecho destaca o termo com marcadores próprios, na grafia original (com acento)');
select ok((select snippet !~ '[*#|]' from r), 'trecho sai sem marcação de Markdown');
select is((select estimated_read_time_minutes from r), 12, 'tempo de leitura vem no resultado');

select pg_temp.guardar('ceftriaxona meningite', :'v_disc');
select is((select section_id from r), :'v_cef_s2'::uuid, 'termo nos pontos-chave abre a seção deles');

select pg_temp.guardar('cefalosporinas', :'v_disc');
select is((select section_id from r where material_id = :'v_cef'), null::uuid,
  'termo que casa com o título inteiro abre o material do topo');
select is((select title_marked from r where material_id = :'v_cef'), chr(57344) || 'Cefalosporinas' || chr(57345),
  'título destacado');
select is((select snippet from r where material_id = :'v_cef'), 'Da primeira à quinta geração',
  'casou com o título: o trecho é o subtítulo');

-- ── G. Filtros: disciplina e "só o que ainda não li" ───────────────────────
select ok(:'v_outra'::uuid not in (select pg_temp.buscar('cefalosporinas', :'v_disc')),
  'filtro de disciplina deixa de fora a outra disciplina');
select ok(:'v_outra'::uuid in (select pg_temp.buscar('cefalosporinas', null)),
  'sem filtro de disciplina, a outra disciplina aparece');

select tests.clear_auth();
insert into public.reading_progress (user_id, material_id, read_section_ids, percent)
values (:'v_student', :'v_cef', array[:'v_cef_s1'::uuid], 50);
insert into public.reading_progress (user_id, material_id, read_section_ids, percent)
values (:'v_student', :'v_classe', array[gen_random_uuid()], 0);
select tests.authenticate_as(:'v_student');

select ok(:'v_cef'::uuid not in (select pg_temp.buscar('geração', :'v_disc', true)),
  '"só o que ainda não li" esconde material com seção lida');
select ok(:'v_classe'::uuid in (select pg_temp.buscar('betalactamico', :'v_disc', true)),
  'id de seção que não existe mais não conta como leitura');
select ok(:'v_cef'::uuid in (select pg_temp.buscar('geração', :'v_disc', false)),
  'sem o filtro, o material lido continua aparecendo');

-- ── H. Quem encontra o quê ─────────────────────────────────────────────────
select ok(:'v_rascunho'::uuid not in (select pg_temp.buscar('betalactamico', :'v_disc')),
  'estudante não encontra rascunho');
select tests.authenticate_as(:'v_admin');
select ok(:'v_rascunho'::uuid in (select pg_temp.buscar('betalactamico', :'v_disc')),
  'administrador encontra rascunho');
select is((select status from public.search_materials('betalactamico', :'v_disc') s where s.material_id = :'v_rascunho'),
  'draft', 'resultado do rascunho vem marcado como rascunho');
select tests.authenticate_as(:'v_pending');
select is((select count(*) from public.search_materials('cefalosporinas', null))::int, 0,
  'cadastro pendente não encontra nada');

-- ── I. Índice acompanha a edição do material ───────────────────────────────
select tests.clear_auth();
update public.material_sections set content = 'Agora cita a quimbrela.' where id = :'v_cef_s1';
update public.materials set title = 'Material com κ' where id = :'v_k_chave';
select tests.authenticate_as(:'v_student');
select ok(:'v_cef'::uuid in (select pg_temp.buscar('quimbrela', :'v_disc')),
  'texto novo da seção entra na busca');
select ok(:'v_k_chave'::uuid in (select pg_temp.buscar('kappa', :'v_disc')),
  'título novo entra na busca (e "κ" vira "kappa")');
select tests.clear_auth();
delete from public.material_sections where id = :'v_cef_s1';
select tests.authenticate_as(:'v_student');
select is((select count(*) from pg_temp.buscar('quimbrela', :'v_disc'))::int, 0,
  'seção apagada sai da busca');

-- ── J. Privilégios ─────────────────────────────────────────────────────────
select tests.clear_auth();
select ok(not has_function_privilege('anon', 'public.search_materials(text, uuid, boolean, integer)', 'execute'),
  'anon não executa a busca');
select ok(not has_table_privilege('authenticated', 'app.material_section_search', 'select'),
  'o índice não é legível direto pela API');

select * from finish();
