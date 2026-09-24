-- Unidade 45-A, parte 2: a migration reconcilia duplicatas históricas sem
-- perder revisões, notas, favorito nem o estado SRS escolhido pelo dono.

begin;

select plan(21);
select tests.clear_auth();

select tests.create_user('u45a.reconcile@test.local', 'student', 'active') as v_user \gset

insert into public.disciplines (name, code, cycle)
values ('Disciplina 45-A dedupe', 'U45AD-' || substr(gen_random_uuid()::text, 1, 8), 'clinico')
returning id as v_discipline_id \gset

insert into public.themes (discipline_id, name)
values (:'v_discipline_id', 'Tema 45-A dedupe')
returning id as v_theme_id \gset

insert into public.questions (
  discipline_id, theme_id, cycle, difficulty, clinical_vignette, question_stem
)
values (
  :'v_discipline_id', :'v_theme_id', 'clinico', 'medio', 'Vinheta dedupe', 'Questão dedupe'
)
returning id as v_question_id \gset

-- O teste precisa reproduzir o estado anterior à migration.
drop index public.flashcards_user_question_origin_uq;

create temporary table u45a_duplicate_cards (
  position int primary key,
  id uuid not null unique
) on commit drop;

insert into u45a_duplicate_cards (position, id)
select position, gen_random_uuid()
from generate_series(1, 19) as position;

insert into public.flashcards (
  id, user_id, discipline_id, theme_id, question_origin_id,
  front, back, tags, difficulty, is_custom, created_at, updated_at
)
select
  cards.id,
  :'v_user',
  :'v_discipline_id',
  :'v_theme_id',
  :'v_question_id',
  'Frente ' || cards.position,
  'Verso ' || cards.position,
  array['dedupe-' || cards.position],
  'medio',
  true,
  case cards.position
    when 3 then '2026-01-01 10:00:00+00'::timestamptz
    when 2 then '2026-01-02 10:00:00+00'::timestamptz
    when 1 then '2026-01-03 10:00:00+00'::timestamptz
    else '2026-02-01 10:00:00+00'::timestamptz + cards.position * interval '1 day'
  end,
  '2026-09-20 10:00:00+00'::timestamptz
from u45a_duplicate_cards cards;

insert into public.flashcard_srs_state (
  flashcard_id, interval_days, repetition_count, ease_factor,
  next_due_date, last_reviewed_date, state, updated_at
)
select
  cards.id,
  300 + cards.position,
  cards.position,
  2.50,
  date '2026-10-01' + cards.position,
  case
    when cards.position in (1, 2, 3) then date '2026-09-20'
    when cards.position = 4 then date '2026-09-19'
    else null
  end,
  'review',
  '2026-09-20 10:00:00+00'::timestamptz
from u45a_duplicate_cards cards;

-- Posições 2 e 3 empatam em data e número de revisões; a posição 3 ganha
-- por ter sido criada antes. A posição 1 perde por ter menos revisões.
insert into public.flashcard_reviews (flashcard_id, reviewed_at, rating, client_op_id)
select
  cards.id,
  '2026-09-01 10:00:00+00'::timestamptz + review_number * interval '1 hour',
  3,
  gen_random_uuid()
from u45a_duplicate_cards cards
cross join lateral generate_series(
  1,
  case when cards.position in (2, 3) then 3 else 1 end
) as review_number;

-- Há nota no mantido e em dois duplicados: todo o texto deve sobreviver no
-- único registro permitido por notes_user_flashcard_uq.
insert into public.notes (user_id, flashcard_id, note_text, created_at, updated_at)
select
  :'v_user',
  cards.id,
  'nota-' || cards.position,
  '2026-09-01 10:00:00+00'::timestamptz + cards.position * interval '1 minute',
  '2026-09-02 10:00:00+00'::timestamptz + cards.position * interval '1 minute'
from u45a_duplicate_cards cards
where cards.position in (3, 9, 10);

-- O primeiro favorito duplicado é movido; ao chegar ao segundo, o mantido já
-- tem favorito e o excedente precisa ser descartado pela regra do dono.
insert into public.bookmarks (user_id, flashcard_id, created_at)
select
  :'v_user',
  cards.id,
  '2026-09-01 10:00:00+00'::timestamptz + cards.position * interval '1 minute'
from u45a_duplicate_cards cards
where cards.position in (7, 8);

create temporary table u45a_reconcile_result (result jsonb) on commit drop;
insert into u45a_reconcile_result
select app.reconcile_duplicate_flashcards_45a();

select has_function(
  'app', 'reconcile_duplicate_flashcards_45a', array[]::text[],
  'função interna de reconciliação existe'
);
select has_table('app', 'flashcard_dedup_backup_45a', 'tabela privada de backup existe');
select is(
  has_table_privilege('anon', 'app.flashcard_dedup_backup_45a', 'select'),
  false,
  'anon não lê o backup'
);
select is(
  has_table_privilege('authenticated', 'app.flashcard_dedup_backup_45a', 'select'),
  false,
  'authenticated não lê o backup'
);
select is(
  has_function_privilege('authenticated', 'app.reconcile_duplicate_flashcards_45a()', 'execute'),
  false,
  'authenticated não executa a reconciliação'
);

select is(
  (select count(*)::int from public.flashcards
   where user_id = :'v_user' and question_origin_id = :'v_question_id'),
  1,
  'o grupo de 19 converge para um card'
);
select is(
  (select f.id from public.flashcards f
   where f.user_id = :'v_user' and f.question_origin_id = :'v_question_id'),
  (select id from u45a_duplicate_cards where position = 3),
  'desempate escolhe data recente, mais revisões e created_at mais antigo'
);
select is(
  (select s.interval_days from public.flashcard_srs_state s
   where s.flashcard_id = (select id from u45a_duplicate_cards where position = 3)),
  303,
  'o card mantido conserva o próprio estado SRS'
);

select is(
  (select count(*)::int from public.flashcard_reviews r
   where r.flashcard_id = (select id from u45a_duplicate_cards where position = 3)),
  23,
  'as 23 revisões do grupo são preservadas no card mantido'
);
select is(
  (select count(*)::int from public.flashcard_reviews r
   join u45a_duplicate_cards cards on cards.id = r.flashcard_id
   where cards.position <> 3),
  0,
  'nenhuma revisão permanece ligada aos duplicados'
);

select is(
  (select count(*)::int from public.notes n
   where n.user_id = :'v_user' and n.flashcard_id is not null),
  1,
  'as notas convergem para o único registro permitido no card mantido'
);
select ok(
  (select note_text like '%nota-3%'
      and note_text like '%nota-9%'
      and note_text like '%nota-10%'
   from public.notes
   where user_id = :'v_user' and flashcard_id = (select id from u45a_duplicate_cards where position = 3)),
  'o texto de todas as notas é preservado'
);

select is(
  (select count(*)::int from public.bookmarks b where b.user_id = :'v_user'),
  1,
  'favoritos duplicados convergem para uma linha'
);
select is(
  (select b.flashcard_id from public.bookmarks b where b.user_id = :'v_user'),
  (select id from u45a_duplicate_cards where position = 3),
  'o favorito sobrevivente aponta para o card mantido'
);

select is(
  (select count(*)::int from app.flashcard_dedup_backup_45a b
   where (b.flashcard_row->>'user_id')::uuid = :'v_user'
     and (b.flashcard_row->>'question_origin_id')::uuid = :'v_question_id'),
  18,
  'os 18 flashcards removidos são copiados para o backup'
);
select is(
  (select count(*)::int from app.flashcard_dedup_backup_45a b
   where (b.flashcard_row->>'user_id')::uuid = :'v_user'
     and b.flashcard_srs_state_row is not null),
  18,
  'os 18 estados SRS removidos são copiados para o backup'
);

select is(
  (select result->>'duplicate_cards_removed' from u45a_reconcile_result),
  '18',
  'a contagem informa 18 cards removidos'
);
select is(
  (select result->>'reviews_moved' from u45a_reconcile_result),
  '20',
  'a contagem informa 20 revisões movidas'
);
select is(
  (select result->>'notes_moved' from u45a_reconcile_result),
  '2',
  'a contagem informa duas notas movidas'
);
select is(
  (select (result->>'bookmarks_moved') || '/' || (result->>'bookmarks_discarded')
   from u45a_reconcile_result),
  '1/1',
  'a contagem distingue favorito movido e excedente descartado'
);

select lives_ok(
  'create unique index flashcards_user_question_origin_uq on public.flashcards (user_id, question_origin_id)',
  'o índice único pode ser criado depois da reconciliação'
);

select * from finish();
rollback;
