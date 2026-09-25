-- Métricas semanais do NexusMed — SOMENTE LEITURA.
-- Uso (dono do projeto, com o CLI linkado ao projeto synapsemed):
--   supabase db query --linked -f scripts/sql/metricas-semanais.sql
-- Ou colar no SQL Editor do Supabase. Registrar o resultado em
-- docs/produto/METRICAS.md. Uma única consulta para funcionar em qualquer
-- cliente que só mostra o resultado do último comando.

with atividade as (
  select user_id, answered_at as at from public.question_attempts
  union all
  select f.user_id, r.reviewed_at from public.flashcard_reviews r
  join public.flashcards f on f.id = r.flashcard_id
),
ativos_semana as (
  select count(distinct user_id) filter (where at > now() - interval '7 days')                                  as ativos_7d,
         count(distinct user_id) filter (where at > now() - interval '14 days' and at <= now() - interval '7 days') as ativos_7d_anterior
  from atividade
),
volume as (
  select count(*) filter (where answered_at > now() - interval '7 days')                                   as questoes_7d,
         round(100.0 * avg(is_correct::int) filter (where answered_at > now() - interval '7 days'), 0)     as acerto_pct_7d
  from public.question_attempts
),
cards as (
  select count(*) as revisoes_cards_7d,
         count(distinct f.user_id) as estudantes_cards_7d
  from public.flashcard_reviews r
  join public.flashcards f on f.id = r.flashcard_id
  where r.reviewed_at > now() - interval '7 days'
)
select now()::date                                                                  as data,
       (select count(*) from public.profiles where status = 'active')               as estudantes_ativos_cadastrados,
       (select count(*) from public.profiles where status = 'pending')              as cadastros_pendentes,
       a.ativos_7d, a.ativos_7d_anterior,
       v.questoes_7d, v.acerto_pct_7d, c.revisoes_cards_7d, c.estudantes_cards_7d,
       (select count(*) from public.materials where status = 'published')           as materiais_publicados,
       (select count(*) from public.materials where status = 'draft')               as materiais_rascunho,
       (select count(*) from public.questions where status = 'published')           as questoes_publicadas,
       (select count(*) from public.questions where status = 'draft')               as questoes_rascunho,
       -- Vínculo de hoje: questions.material_id (um material). Quando a 43-B
       -- trocar o vínculo, trocar esta linha junto.
       (select count(*) from public.questions
         where status = 'published' and material_id is not null)                    as questoes_ligadas_a_material
from ativos_semana a, volume v, cards c;
