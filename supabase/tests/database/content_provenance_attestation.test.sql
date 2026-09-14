-- ============================================================================
-- SynapseMed — Testes pgTAP de proveniência e atestação editorial (Prompt 23-B)
--
-- Self-contido: redefine (create or replace, idempotente) os mesmos helpers
-- tests.create_user/authenticate_as/authenticate_as_anon/clear_auth já
-- usados em rls_policies.test.sql, para não depender da ordem de execução
-- alfabética dos arquivos (`supabase test db` roda *.test.sql em ordem de
-- nome — "content_..." vem antes de "rls_policies..." alfabeticamente).
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

-- ----------------------------------------------------------------------------
-- Helpers de bootstrap de fixture (usados por ESTE arquivo e por qualquer
-- outro arquivo pgTAP do projeto que precise de um material/questão já
-- aprovado/publicado sem testar o fluxo de proveniência em si — ver
-- rls_policies.test.sql e sync_reliability*.test.sql, que rodam DEPOIS deste
-- alfabeticamente e reusam estas funções). SECURITY DEFINER: não dependem do
-- papel/JWT simulado no momento da chamada, só exigem que já exista algum
-- admin ativo no banco (qualquer um serve — é só autoria de fixture, não
-- prova nada sobre revisão/atestação real, que é testada abaixo com
-- create_content_revision()/attest_content_revision() de verdade).
-- ----------------------------------------------------------------------------

create or replace function tests.approve_material_revision(p_material_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid;
  v_snapshot jsonb;
  v_hash text;
  v_next_number int;
  v_revision_id uuid;
begin
  select id into v_admin from public.profiles where role = 'admin' and status = 'active' limit 1;
  if v_admin is null then
    raise exception 'tests.approve_material_revision: nenhum admin ativo encontrado para autoria de fixture';
  end if;

  v_snapshot := app.build_material_snapshot(p_material_id);
  v_hash := encode(extensions.digest(v_snapshot::text, 'sha256'), 'hex');
  select coalesce(max(revision_number), 0) + 1 into v_next_number
    from public.content_revisions where material_id = p_material_id;

  insert into public.content_revisions (material_id, revision_number, snapshot, snapshot_hash, created_by, policy_version)
  values (p_material_id, v_next_number, v_snapshot, v_hash, v_admin, 'v1')
  returning id into v_revision_id;

  insert into public.content_reviews (content_revision_id, reviewer_user_id, decision, checklist, policy_version, revision_hash)
  values (v_revision_id, v_admin, 'aprovado', '{"fixture": true}'::jsonb, 'v1', v_hash);

  return v_revision_id;
end;
$$;

create or replace function tests.approve_question_revision(p_question_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid;
  v_snapshot jsonb;
  v_hash text;
  v_next_number int;
  v_revision_id uuid;
begin
  select id into v_admin from public.profiles where role = 'admin' and status = 'active' limit 1;
  if v_admin is null then
    raise exception 'tests.approve_question_revision: nenhum admin ativo encontrado para autoria de fixture';
  end if;

  v_snapshot := app.build_question_snapshot(p_question_id);
  v_hash := encode(extensions.digest(v_snapshot::text, 'sha256'), 'hex');
  select coalesce(max(revision_number), 0) + 1 into v_next_number
    from public.content_revisions where question_id = p_question_id;

  insert into public.content_revisions (question_id, revision_number, snapshot, snapshot_hash, created_by, policy_version)
  values (p_question_id, v_next_number, v_snapshot, v_hash, v_admin, 'v1')
  returning id into v_revision_id;

  insert into public.content_reviews (content_revision_id, reviewer_user_id, decision, checklist, policy_version, revision_hash)
  values (v_revision_id, v_admin, 'aprovado', '{"fixture": true}'::jsonb, 'v1', v_hash);

  return v_revision_id;
end;
$$;

-- Atalho para fixtures que só querem "um material já published", sem
-- exercitar publish_material() em si (equivalente a approve_material_revision
-- + UPDATE direto de status, os dois como postgres — passa pelo mesmo trigger
-- guard_material_publish que um cliente real jamais atravessaria).
create or replace function tests.force_publish_material(p_material_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform tests.approve_material_revision(p_material_id);
  update public.materials set status = 'published' where id = p_material_id;
end;
$$;

-- authenticate_as faz SET ROLE de verdade (nível de sessão) — depois da
-- primeira troca, a role corrente já é 'authenticated', então toda chamada
-- seguinte a qualquer função deste schema (inclusive para trocar de novo de
-- usuário) precisa que 'authenticated'/'anon' tenham USAGE aqui (mesmo grant
-- de rls_policies.test.sql, repetido porque este arquivo roda antes
-- alfabeticamente).
grant usage on schema tests to anon, authenticated;
grant execute on function tests.clear_auth() to anon, authenticated;

select plan(45);

-- ----------------------------------------------------------------------------
-- Fixtures
-- ----------------------------------------------------------------------------

select tests.clear_auth();

select tests.create_user('prov.admin@test.local', 'admin', 'active') as v_admin \gset
select tests.create_user('prov.admin.blocked@test.local', 'admin', 'blocked') as v_admin_blocked \gset
select tests.create_user('prov.student@test.local', 'student', 'active') as v_student \gset

insert into public.disciplines (name, code, cycle) values ('Disciplina Prov', 'PROV-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_discipline_id \gset

insert into public.themes (discipline_id, name) values (:'v_discipline_id', 'Tema Prov')
returning id as v_theme_id \gset

-- Fonte curada para claim_sources. `sources.id` é text (não uuid) — ao
-- contrário das demais fixtures deste arquivo (uuid via gen_random_uuid()),
-- um id fixo colide em qualquer segunda execução de `test:db` sem `supabase
-- db reset` entre elas. ON CONFLICT DO UPDATE mantém o id estável (outros
-- testes/dumps podem referenciá-lo) e ainda assim permite rodar o arquivo
-- repetidas vezes sem reset.
insert into public.sources (id, citation_text, tipo, verificacao)
values ('prov-source-1', 'Fonte de teste — proveniência', 'material_interno', 'verificada')
on conflict (id) do update set citation_text = excluded.citation_text
returning id as v_source_id \gset

-- Material A: draft, 1 seção, 1 referência (com source_id — prova indireta
-- de que a correção de material_references não quebrou o insert normal).
insert into public.materials (discipline_id, theme_id, title, subtitle)
values (:'v_discipline_id', :'v_theme_id', 'Material Proveniência', 'v1')
returning id as v_material_id \gset

insert into public.material_sections (material_id, sort_order, title, content)
values (:'v_material_id', 0, 'Seção 1', 'Conteúdo inicial da seção.')
returning id as v_section_id \gset

insert into public.material_references (material_id, citation_text, source_id, sort_order)
values (:'v_material_id', 'Fonte de teste — proveniência', :'v_source_id', 0);

-- Questão A: draft, 2 alternativas completas.
insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_discipline_id', :'v_theme_id', 'clinico', 'medio', 'Vinheta Prov', 'Enunciado Prov')
returning id as v_question_id \gset

insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_question_id', 'A', 'Opção 1', 1) returning id as v_opt_a \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_question_id', 'B', 'Opção 2', 2) returning id as v_opt_b \gset
insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary) values (:'v_question_id', 'Comentário', 'Resumo');
update public.question_option_keys set is_correct = true, explanation = 'Explicação correta' where option_id = :'v_opt_a';
update public.question_option_keys set explanation = 'Explicação incorreta' where option_id = :'v_opt_b';

-- Legado: material e questão levados a published diretamente como postgres
-- (simula conteúdo carregado ANTES desta migration existir), sem nenhuma
-- content_revisions — nunca deve ganhar aprovação retroativa fictícia.
insert into public.materials (discipline_id, theme_id, title, status)
values (:'v_discipline_id', :'v_theme_id', 'Material Legado', 'published')
returning id as v_legacy_material_id \gset

-- guard_question_publish (pré-existente, 20260903120100_rls_policies.sql)
-- bloqueia INSERT direto com status='published' incondicionalmente, sem
-- exceção nem para 'postgres' — diferente da guarda nova de materials.
-- Insere como draft, completa o conteúdo e só então UPDATE para published
-- (branch que já tem a exceção current_user = 'postgres'), sem nunca chamar
-- publish_question()/create_content_revision() — 0 content_revisions.
insert into public.questions (discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem)
values (:'v_discipline_id', :'v_theme_id', 'clinico', 'medio', 'Vinheta Legado', 'Enunciado Legado')
returning id as v_legacy_question_id \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_legacy_question_id', 'A', 'Legado 1', 1) returning id as v_legacy_opt_a \gset
insert into public.question_options (question_id, letter, option_text, sort_order) values (:'v_legacy_question_id', 'B', 'Legado 2', 2) returning id as v_legacy_opt_b \gset
insert into public.question_answer_keys (question_id, general_commentary, high_yield_summary) values (:'v_legacy_question_id', 'Comentário legado', 'Resumo legado');
update public.question_option_keys set is_correct = true, explanation = 'Explicação legado correta' where option_id = :'v_legacy_opt_a';
update public.question_option_keys set explanation = 'Explicação legado incorreta' where option_id = :'v_legacy_opt_b';
update public.questions set status = 'published' where id = :'v_legacy_question_id';

-- ============================================================================
-- 1) get_provenance_status: legado, e material/questão nova em 'em_revisao'
-- ============================================================================

select tests.authenticate_as(:'v_admin');

select is(
  public.get_provenance_status(:'v_legacy_material_id', null),
  'legacy_unmapped',
  'material legado (published, 0 revisões) é legacy_unmapped'
);
select is(
  public.get_provenance_status(null, :'v_legacy_question_id'),
  'legacy_unmapped',
  'questão legado (published, 0 revisões) é legacy_unmapped'
);
select is(
  public.get_provenance_status(:'v_material_id', null),
  'em_revisao',
  'material novo em draft sem revisão é em_revisao'
);

-- ============================================================================
-- 2) legado continua legível para estudante active (sem gate novo)
-- ============================================================================

select tests.authenticate_as(:'v_student');
select isnt_empty(
  format($$ select 1 from public.materials where id = %L $$, :'v_legacy_material_id'),
  'estudante active lê material legado published normalmente'
);
select isnt_empty(
  format($$ select 1 from public.questions where id = %L $$, :'v_legacy_question_id'),
  'estudante active lê questão legado published normalmente'
);

-- ============================================================================
-- 3) admin bloqueado falha em toda RPC nova
-- ============================================================================

select tests.authenticate_as(:'v_admin_blocked');
select throws_ok(
  format($$ select public.create_content_revision(%L, null) $$, :'v_material_id'),
  NULL::char(5), NULL::text,
  'admin bloqueado não cria revisão'
);
select throws_ok(
  format($$ select public.publish_material(%L) $$, :'v_material_id'),
  NULL::char(5), NULL::text,
  'admin bloqueado não publica material'
);
select throws_ok(
  format($$ select public.get_provenance_status(%L, null) $$, :'v_material_id'),
  NULL::char(5), NULL::text,
  'admin bloqueado não consulta status de proveniência'
);

-- estudante comum também não pode criar revisão nem atestar.
select tests.authenticate_as(:'v_student');
select throws_ok(
  format($$ select public.create_content_revision(%L, null) $$, :'v_material_id'),
  NULL::char(5), NULL::text,
  'estudante active não cria revisão'
);

-- ============================================================================
-- 4) create_content_revision: FK/checks, snapshot, autoria server-side
-- ============================================================================

select tests.authenticate_as(:'v_admin');

select throws_ok(
  $$ select public.create_content_revision(null, null) $$,
  NULL::char(5), NULL::text,
  'create_content_revision exige exatamente um alvo (nenhum informado)'
);
select throws_ok(
  format($$ select public.create_content_revision(%L, %L) $$, :'v_material_id', :'v_question_id'),
  NULL::char(5), NULL::text,
  'create_content_revision exige exatamente um alvo (os dois informados)'
);

-- IMPORTANTE: `select (func()).* \gset` chama func() UMA VEZ POR COLUNA do
-- tipo composto retornado (armadilha clássica do Postgres) — para uma
-- função volátil que faz INSERT, isso insere 1 linha por coluna. A forma
-- correta é usar a função como fonte de linhas (FROM), que a avalia uma
-- única vez antes de expandir `*`.
select * from public.create_content_revision(:'v_material_id', null) \gset v_mrev_

select is(:'v_mrev_revision_number'::int, 1, 'primeira revisão do material começa em revision_number = 1');
select is(
  (select created_by from public.content_revisions where id = :'v_mrev_id'),
  :'v_admin'::uuid,
  'created_by vem de auth.uid() do chamador, nunca do payload'
);
select is(
  (select snapshot -> 'material' ->> 'title' from public.content_revisions where id = :'v_mrev_id'),
  'Material Proveniência',
  'snapshot contém o título real do material'
);
select is(
  (select jsonb_array_length(snapshot -> 'sections') from public.content_revisions where id = :'v_mrev_id'),
  1,
  'snapshot contém a seção real do material'
);
select isnt(
  (select snapshot_hash from public.content_revisions where id = :'v_mrev_id'),
  null,
  'snapshot_hash é calculado server-side'
);

-- Payload forjado: cliente não consegue INSERT direto em content_revisions,
-- mesmo como admin ativo (sem GRANT de INSERT para authenticated).
select throws_ok(
  format(
    $$ insert into public.content_revisions (material_id, revision_number, snapshot, snapshot_hash, created_by, policy_version)
       values (%L, 999, '{}'::jsonb, 'forjado', %L, 'v1') $$,
    :'v_material_id', :'v_student'
  ),
  NULL::char(5), NULL::text,
  'admin não insere content_revisions diretamente (payload forjado bloqueado por GRANT)'
);

-- content_revisions é imutável para qualquer CLIENTE: sem policy de
-- UPDATE/DELETE e sem GRANT dessas colunas para authenticated, mesmo um
-- admin ativo não consegue alterar/apagar diretamente (só via cascade de
-- ON DELETE quando o material/questão inteiro é apagado — ver comentário na
-- migration; 'postgres' continua podendo, pois é quem roda cascade/scripts
-- administrativos internos, nunca alcançável via PostgREST/supabase-js).
select tests.authenticate_as(:'v_admin');
select throws_ok(
  format($$ update public.content_revisions set revision_number = 999 where id = %L $$, :'v_mrev_id'),
  NULL::char(5), NULL::text,
  'admin não altera content_revisions diretamente (sem GRANT/policy de UPDATE)'
);
select throws_ok(
  format($$ delete from public.content_revisions where id = %L $$, :'v_mrev_id'),
  NULL::char(5), NULL::text,
  'admin não apaga content_revisions diretamente (sem GRANT/policy de DELETE)'
);
select tests.clear_auth();

-- ============================================================================
-- 5) claims: obrigatoriedade de fonte, decisão server-side, forjamento
-- ============================================================================

select tests.authenticate_as(:'v_admin');

insert into public.claims (content_revision_id, claim_text, claim_kind, content_locator, requires_source)
values (:'v_mrev_id', 'Claim que exige fonte', 'source_claim', format('section:%s:paragraph:1', :'v_section_id'), true)
returning id as v_claim_needs_source \gset

insert into public.claims (content_revision_id, claim_text, claim_kind, content_locator, requires_source)
values (:'v_mrev_id', 'Claim sintetizado sem exigência de fonte', 'synthesized_claim', format('section:%s:paragraph:2', :'v_section_id'), false)
returning id as v_claim_no_source \gset

select tests.authenticate_as(:'v_student');
select throws_ok(
  format(
    $$ insert into public.claims (content_revision_id, claim_text, claim_kind, content_locator)
       values (%L, 'x', 'inference', 'y') $$,
    :'v_mrev_id'
  ),
  NULL::char(5), NULL::text,
  'estudante não cria claim'
);

select tests.authenticate_as(:'v_admin');

-- Atestar já: falha porque há claim pendente (decision default 'pendente').
select throws_ok(
  format($$ select public.attest_content_revision(%L, 'aprovado', '{}'::jsonb) $$, :'v_mrev_id'),
  NULL::char(5), NULL::text,
  'atestação falha com claim pendente'
);

-- Aprova o claim sem exigência de fonte.
update public.claims set decision = 'aprovado' where id = :'v_claim_no_source';

-- Payload forjado: tenta atribuir decided_by a outra pessoa — trigger
-- sobrescreve para o autor real (auth.uid()).
update public.claims set decision = 'aprovado', decided_by = :'v_student', decided_at = '2000-01-01'::timestamptz
where id = :'v_claim_needs_source';
select is(
  (select decided_by from public.claims where id = :'v_claim_needs_source'),
  :'v_admin'::uuid,
  'decided_by é sempre auth.uid() do autor real, payload forjado é ignorado'
);
select isnt(
  (select decided_at from public.claims where id = :'v_claim_needs_source'),
  '2000-01-01'::timestamptz,
  'decided_at é sempre horário do banco, payload forjado é ignorado'
);

-- Claim obrigatório (requires_source=true) sem nenhuma fonte vinculada:
-- atestação continua bloqueada mesmo com decision='aprovado'.
select throws_ok(
  format($$ select public.attest_content_revision(%L, 'aprovado', '{}'::jsonb) $$, :'v_mrev_id'),
  NULL::char(5), NULL::text,
  'atestação falha: claim exige fonte e nenhuma foi vinculada'
);

-- Vincula fonte indiretamente reportada — não pode ser apresentada como
-- consultada diretamente: consultation_basis grava exatamente o que foi
-- informado, sem "upgrade" silencioso.
insert into public.claim_sources (claim_id, source_id, evidence_relation, consultation_basis, source_locator)
values (:'v_claim_needs_source', :'v_source_id', 'supports', 'indirectly_reported', 'p. 12')
returning id as v_claim_source_id \gset

select is(
  (select consultation_basis from public.claim_sources where id = :'v_claim_source_id'),
  'indirectly_reported',
  'fonte indiretamente reportada não é apresentada como diretamente consultada'
);

-- FK real: source_id inexistente é rejeitado.
select throws_ok(
  format(
    $$ insert into public.claim_sources (claim_id, source_id, evidence_relation, consultation_basis)
       values (%L, 'fonte-inexistente-xyz', 'supports', 'directly_consulted') $$,
    :'v_claim_needs_source'
  ),
  NULL::char(5), NULL::text,
  'claim_sources rejeita source_id inexistente (FK real)'
);

-- ============================================================================
-- 6) attest_content_revision: sucesso, decisão dupla bloqueada, imutabilidade
-- ============================================================================

select public.attest_content_revision(:'v_mrev_id', 'aprovado', '{"checklist_ok": true}'::jsonb) as v_review_json \gset

select is(
  (select decision from public.content_reviews where content_revision_id = :'v_mrev_id'),
  'aprovado',
  'attest_content_revision grava decisão aprovado'
);
select is(
  (select reviewer_user_id from public.content_reviews where content_revision_id = :'v_mrev_id'),
  :'v_admin'::uuid,
  'reviewer_user_id vem de auth.uid() do chamador'
);
select is(
  (select revision_hash from public.content_reviews where content_revision_id = :'v_mrev_id'),
  (select snapshot_hash from public.content_revisions where id = :'v_mrev_id'),
  'revision_hash da atestação bate com snapshot_hash da revisão'
);

-- Reatestar a mesma revisão é bloqueado (append-only, nunca reaprovar/repetir).
select throws_ok(
  format($$ select public.attest_content_revision(%L, 'aprovado', '{}'::jsonb) $$, :'v_mrev_id'),
  NULL::char(5), NULL::text,
  'revisão já atestada não pode ser atestada de novo'
);

-- content_reviews é append-only para qualquer CLIENTE (mesma garantia de
-- content_revisions acima: sem GRANT/policy de UPDATE/DELETE para
-- authenticated, mesmo admin ativo).
select throws_ok(
  format($$ update public.content_reviews set decision = 'rejeitado' where content_revision_id = %L $$, :'v_mrev_id'),
  NULL::char(5), NULL::text,
  'admin não altera content_reviews diretamente (sem GRANT/policy de UPDATE)'
);
select throws_ok(
  format($$ delete from public.content_reviews where content_revision_id = %L $$, :'v_mrev_id'),
  NULL::char(5), NULL::text,
  'admin não apaga content_reviews diretamente (sem GRANT/policy de DELETE)'
);
select tests.clear_auth();

-- Claims da revisão já atestada ficam travados.
select tests.authenticate_as(:'v_admin');
select throws_ok(
  format($$ update public.claims set decision = 'requer_correcao_ou_fonte' where id = %L $$, :'v_claim_no_source'),
  NULL::char(5), NULL::text,
  'claim de revisão já atestada não pode mudar de decisão'
);
select throws_ok(
  format(
    $$ insert into public.claim_sources (claim_id, source_id, evidence_relation, consultation_basis)
       values (%L, %L, 'supports', 'directly_consulted') $$,
    :'v_claim_no_source', :'v_source_id'
  ),
  NULL::char(5), NULL::text,
  'claim_sources de revisão já atestada não aceita novo vínculo'
);

-- ============================================================================
-- 7) publish_material: só publica com revisão aprovada cujo hash bate
-- ============================================================================

select is(
  public.get_provenance_status(:'v_material_id', null),
  'aprovado_para_esta_versao',
  'status vira aprovado_para_esta_versao após atestação aprovada com hash batendo'
);

select lives_ok(
  format($$ select public.publish_material(%L) $$, :'v_material_id'),
  'publish_material publica material com revisão aprovada e hash batendo'
);
select is(
  (select status from public.materials where id = :'v_material_id'),
  'published',
  'material fica published após publish_material'
);

-- Transição direta para published continua bloqueada por trigger, mesmo
-- para admin ativo (current_user continua 'authenticated' num UPDATE direto
-- via RLS — só publish_material(), rodando SECURITY DEFINER como o owner da
-- migration, passa current_user = 'postgres' dentro do trigger).
insert into public.materials (discipline_id, theme_id, title)
values (:'v_discipline_id', :'v_theme_id', 'Material Draft Guard')
returning id as v_material_guard_id \gset

select throws_ok(
  format($$ update public.materials set status = 'published' where id = %L $$, :'v_material_guard_id'),
  NULL::char(5), NULL::text,
  'admin não publica material com UPDATE direto (só via publish_material())'
);

-- Edição invalida a aprovação: muda o conteúdo, volta a draft, tenta
-- publicar de novo sem nova revisão/atestação — falha.
update public.material_sections set content = 'Conteúdo editado depois da aprovação.' where id = :'v_section_id';
update public.materials set status = 'draft' where id = :'v_material_id';

select is(
  public.get_provenance_status(:'v_material_id', null),
  'aprovacao_desatualizada',
  'edição após aprovação vira aprovacao_desatualizada (hash atual não bate mais)'
);
select throws_ok(
  format($$ select public.publish_material(%L) $$, :'v_material_id'),
  NULL::char(5), NULL::text,
  'publish_material falha depois de editar o conteúdo aprovado (hash não bate mais)'
);

-- ============================================================================
-- 8) publish_question: mesmo gate, preservando validações de conteúdo
-- ============================================================================

-- Sem nenhuma revisão/atestação ainda: publish_question falha só pelo gate
-- novo (as validações de conteúdo antigas já passariam, questão está completa).
select throws_ok(
  format($$ select public.publish_question(%L) $$, :'v_question_id'),
  NULL::char(5), NULL::text,
  'publish_question falha sem revisão aprovada, mesmo com conteúdo completo'
);

select (public.create_content_revision(null, :'v_question_id')).id as v_qrev_id \gset

insert into public.claims (content_revision_id, claim_text, claim_kind, content_locator, requires_source, decision)
values (:'v_qrev_id', 'Claim da questão', 'synthesized_claim', 'question_stem', false, 'aprovado')
returning id as v_qclaim_id \gset

select public.attest_content_revision(:'v_qrev_id', 'aprovado', '{}'::jsonb) as v_qreview_json \gset

select lives_ok(
  format($$ select public.publish_question(%L) $$, :'v_question_id'),
  'publish_question publica questão com revisão aprovada e hash batendo'
);
select is(
  (select status from public.questions where id = :'v_question_id'),
  'published',
  'questão fica published após publish_question'
);

-- ============================================================================
-- 9) constraints estruturais de content_revisions
-- ============================================================================

select tests.clear_auth();
select throws_ok(
  format(
    $$ insert into public.content_revisions (material_id, question_id, revision_number, snapshot, snapshot_hash, created_by, policy_version)
       values (%L, %L, 1, '{}'::jsonb, 'x', %L, 'v1') $$,
    :'v_material_id', :'v_question_id', :'v_admin'
  ),
  NULL::char(5), NULL::text,
  'content_revisions rejeita material_id e question_id preenchidos ao mesmo tempo (check xor)'
);
select throws_ok(
  format(
    $$ insert into public.content_revisions (material_id, question_id, revision_number, snapshot, snapshot_hash, created_by, policy_version)
       values (null, null, 1, '{}'::jsonb, 'x', %L, 'v1') $$,
    :'v_admin'
  ),
  NULL::char(5), NULL::text,
  'content_revisions rejeita material_id e question_id ambos nulos (check xor)'
);

select * from finish();
