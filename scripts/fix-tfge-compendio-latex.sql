-- Compêndio "TFGe — Taxa de Filtração Glomerular Estimada"
-- (material_id 1267c291-cd39-45cd-aa69-1f2f258b3546): o conteúdo trazia
-- notação matemática em LaTeX ($\ge 90$, $$\text{eGFR}_{\text{cr}} = ...$$
-- etc., típica de exportação de ferramenta externa — ver AGENTS.md,
-- armadilha 5). O SafeMarkdown do NexusMed (src/components/common/
-- SafeMarkdown.tsx) não interpreta LaTeX, então a tabela de estadiamento
-- CGA e as fórmulas de eGFR renderizavam o "$...$"/"$$...$$" literal na
-- tela em vez de números/símbolos legíveis (achado revisando visualmente
-- o compêndio publicado, 2026-09-21).
--
-- Substitui pelos mesmos valores em texto plano/Unicode, no padrão já
-- usado no resto do acervo publicado (traço-en sem espaço em intervalos,
-- ex. "60–89"; símbolos ≥/≤/≈/× soltos, sem cerca de math; fórmulas de
-- exibição reescritas em uma linha legível, sem fração/subscrito LaTeX).

-- Seção 0 — "Conceito, Definição, Estadiamento e Triagem da DRC":
-- tabela de estadiamento CGA (TFGe/RAC por categoria).
update material_sections
set content = replace(replace(replace(replace(replace(replace(replace(replace(replace(
  content,
  '$\ge 90$', '≥ 90'),
  '$60 - 89$', '60–89'),
  '$45 - 59$', '45–59'),
  '$30 - 44$', '30–44'),
  '$15 - 29$', '15–29'),
  '$< 15$', '< 15'),
  '$< 30$', '< 30'),
  '$30 - 300$', '30–300'),
  '$> 300$', '> 300')
where id = 'ce030c0b-be4a-49c1-8235-095d8bd348f6'
returning id, 'seção 0 (CGA)' as secao;

-- Seção 1 — "Fisiologia dos Biomarcadores Endógenos": acurácia P30 da
-- equação combinada eGFRcr-cys.
update material_sections
set content = replace(
  content,
  '($P_{30} > 90\%$)', '(P30 > 90%)')
where id = '801a37d4-e207-49dc-ba20-92db7d192612'
returning id, 'seção 1 (P30)' as secao;

-- Seção 2 — "Evolução Matemática das Equações de Estimativa": fórmula da
-- CKD-EPI 2021, glossário de variáveis e faixa etária na tabela
-- comparativa de equações.
update material_sections
set content = replace(replace(replace(replace(
  content,
  '$$\text{eGFR}_{\text{cr}} = 142 \times \min(\text{SCr}/\kappa, 1)^\alpha \times \max(\text{SCr}/\kappa, 1)^{-1,200} \times 0,9938^{\text{Idade}} \times [1,012\text{ se mulher}]$$',
  'eGFRcr = 142 × min(SCr/κ, 1)^α × max(SCr/κ, 1)^(-1,200) × 0,9938^Idade × [1,012 se mulher]'),
  'onde $\text{SCr}$ representa a creatinina sérica (mg/dL), $\kappa$ é 0,7 para mulheres e 0,9 para homens, e $\alpha$ é',
  'onde SCr representa a creatinina sérica (mg/dL), κ é 0,7 para mulheres e 0,9 para homens, e α é'),
  'Adultos ($\ge 18$ anos) | Padrão ouro populacional', 'Adultos (≥ 18 anos) | Padrão ouro populacional'),
  'Adultos ($\ge 18$ anos) | Máxima exatidão ($P_{30} > 90\%$)', 'Adultos (≥ 18 anos) | Máxima exatidão (P30 > 90%)')
where id = '74c66927-b076-4df2-a37a-e49576e7e960'
returning id, 'seção 2 (CKD-EPI)' as secao;

-- Seção 3 — "Aplicação Prática: Desindexação Corporal": fórmula de
-- desindexação, exemplo numérico e limiares de eGFR/RAC dos critérios de
-- elegibilidade a SGLT2i/nsMRA.
update material_sections
set content = replace(replace(replace(replace(replace(replace(
  content,
  '$$\text{TFG}_{\text{absoluta}}\text{ (mL/min)} = \text{TFGe indexada}\text{ (mL/min/1,73 m}^2\text{)} \times \frac{\text{ASC}_{\text{real}}\text{ (m}^2\text{)}}{1,73}$$',
  'TFG absoluta (mL/min) = TFGe indexada (mL/min/1,73 m²) × [ASC real (m²) ÷ 1,73]'),
  '(ASC $\approx 1,42\text{ m}^2$)', '(ASC ≈ 1,42 m²)'),
  '$35 \times (1,42 / 1,73) = 28,7\text{ mL/min}$', '35 × (1,42 / 1,73) = 28,7 mL/min'),
  'eGFR $\ge 20\text{ mL/min/1,73 m}^2$ ou RAC $> 200\text{ mg/g}$', 'eGFR ≥ 20 mL/min/1,73 m² ou RAC > 200 mg/g'),
  'eGFR $> 25\text{ mL/min/1,73 m}^2$ e RAC $> 30\text{ mg/g}$', 'eGFR > 25 mL/min/1,73 m² e RAC > 30 mg/g'),
  '(Piso $\ge 20$)', '(Piso ≥ 20)')
where id = '0fa9460e-631d-4afd-a9f8-4735ed91551f'
returning id, 'seção 3 (desindexação)' as secao;

-- Verificação pós-fix: nenhuma seção do acervo publicado deve conter "$"
-- de math LaTeX depois deste script. Se retornar linhas, há mais
-- ocorrências não cobertas aqui.
select id, material_id, title
from material_sections
where content ~ '\$[^\s$][^$]{0,40}\$';
