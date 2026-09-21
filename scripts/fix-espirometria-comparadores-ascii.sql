-- Compêndio de Espirometria (material_id a2feda28-e529-44cb-b0f4-851bd0ea2afd),
-- 3 seções: "Execução Técnica, Critérios de Aceitabilidade e Graduação de
-- Qualidade", "Estratégias Interpretativas: LIN, Escore Z e Classificação
-- de Gravidade" e "Prova de Resposta ao Broncodilatador (PBD)". O conteúdo
-- usa os comparadores ASCII "<="/">=" em vez dos símbolos ≤/≥ já usados no
-- resto do acervo publicado (achado revisando as fórmulas em destaque do
-- SafeMarkdown, 2026-09-21 — mesma família de problema do LaTeX cru do
-- compêndio de TFGe, ver fix-tfge-compendio-latex.sql: notação típica de
-- exportação de ferramenta externa, nunca revisada visualmente depois).
--
-- Confirmado por leitura completa das 3 seções (não só grep) que todo "<="
-- e todo ">=" nelas é comparador matemático (VRExt, PFE, graus de
-- qualidade A–C, LIN, critérios de resposta ao broncodilatador) — nenhuma
-- ocorrência é seta de código nem outro uso. `replace()` do Postgres troca
-- TODAS as ocorrências de uma vez (não só a primeira), então um único par
-- de replace() por seção já cobre os comparadores repetidos na mesma
-- tabela (ex. "<= 100 mL" aparece 2x na seção 301bc10c). "<"/">" sozinhos
-- (sem "="), como em "VEF1/CVF < 0,70" ou "Escore Z < -1,645", já estavam
-- corretos e não são tocados aqui.
update material_sections
set content = replace(replace(content, '<=', '≤'), '>=', '≥')
where id in (
  '301bc10c-92c9-4903-8527-649db885927c',
  'c445e992-1911-4eaf-bd14-3fc91e467b97',
  'f4917e57-7edf-43f9-90b9-3b8b88471a50'
)
returning id, title;

-- Verificação pós-fix: nenhuma seção do acervo publicado deve conter "<="
-- ou ">=" depois deste script. Se retornar linhas, há mais ocorrências não
-- cobertas aqui.
select id, material_id, title
from material_sections
where content like '%<=%' or content like '%>=%';
