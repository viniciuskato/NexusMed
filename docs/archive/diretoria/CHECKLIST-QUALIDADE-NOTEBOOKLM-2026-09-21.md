# Checklist de atestação de qualidade via NotebookLM — materiais de `Base de Estudos`

> Lista de trabalho para a etapa "auditoria científica" (Gate 7-8 do padrão
> editorial) de `docs/diretoria/AUDITORIA-BASE-DE-ESTUDOS-2026-09-21.md`,
> seção 7, item 1. O usuário verifica cada material no NotebookLM e reporta
> o resultado; esta sessão marca aqui. Nenhum material foi importado, editado
> ou publicado a partir desta lista — é só checklist de rastreio.

## Como usar o NotebookLM para isso

Viável, com ressalva de formato:

- **`.md` já pronto** (grupo 0 abaixo): dá pra colar o texto direto como fonte
  ("texto colado") ou fazer upload do próprio arquivo — NotebookLM aceita
  `.txt`/Markdown sem conversão.
- **HTML** (a maioria da lista): NotebookLM não tem um tipo de fonte "HTML" —
  abra o arquivo no navegador, `Ctrl+A` → `Ctrl+C` no conteúdo (pode incluir
  a sidebar, sem problema) e cole como fonte de texto. Se preferir, eu
  preparo extratos `.txt` limpos (sem CSS/JS) de cada arquivo antes — mais
  rápido de colar, é só pedir.
- **DOCX/PDF** (se algum reaparecer): PDF sobe direto; DOCX abrindo no Google
  Drive (vira Google Doc automaticamente) e adicionando como fonte.

**Para a checagem valer como auditoria de verdade** (não só "parece bom"),
peça ao NotebookLM para avaliar contra um critério concreto, não uma
impressão geral. O mais alinhado ao padrão do NexusMed é colar o checklist
de `docs/editorial/PADRAO-NEXUSMED-CONTEUDOS.md` (seção 1.9, "Checklist
antes de entregar") como parte da pergunta — ele já cobre
saturação de conceito central, distinção etiologia/mecanismo/manifestação,
grau de evidência, DCI, siglas, referência órfã etc. Sem isso o NotebookLM só
vai avaliar coerência interna do texto, não se ele cobre o que o NexusMed
exige para publicar.

## Legenda de status

- ⬜ pendente — ainda não verificado no NotebookLM
- ✅ passou — usuário confirmou qualidade
- ⚠️ requer correção — usuário sinalizou problema
- 🔵 já publicado no NexusMed — auditar mesmo assim (nenhum material publicado
  tem atestação formal hoje, ver `AS1-INVENTARIO-2026-09-17.md`)

## Grupo 0 — rascunhos já no formato `.md` de import do NexusMed (comece por aqui)

| Status | Material | Caminho |
|---|---|---|
| ⬜ | Espirometria (Pneumologia/Clínica) | `Biblioteca/Medicina/Pneumologia/espirometria-padrao-nexusmed-v2.md` |
| ⬜ | TFGe — Taxa de Filtração Glomerular Estimada (Nefrologia/Clínica Médica) | `Biblioteca/Medicina/Nefrologia/taxa-filtracao-glomerular-tfge.md` |

## Grupo 1 — já publicados no NexusMed (confirmado em `AS1-INVENTARIO-2026-09-17.md`)

Auditar mesmo publicados: nenhum tem `content_revisions`/`claims`/
`content_reviews` preenchidos hoje — "publicado" ≠ "auditado".

| Status | Material | Caminho |
|---|---|---|
| 🔵 | Avaliação da Função Renal | `compêndios/medicina/mecanismos/fisiologia/avaliacao-funcao-renal.html` |
| 🔵 | Hematologia Clínica — Hemograma e Anemias | `compêndios/medicina/hematologia-hemograma-anemias.html` |
| 🔵 | Hipertensão Arterial, SRAA e Anti-hipertensivos | `compêndios/medicina/mecanismos/farmacologia/hipertensao_sraa_anti-hipertensivos.html` |
| 🔵 | Semiologia Cardíaca | `compêndios/medicina/cardiologia-semiologia.html` |
| 🔵 | Síndromes Bronco-Pleuro-Pulmonares | `compêndios/medicina/mecanismos/semiologia/sindromes-bronco-pleuro-pulmonares.html` |
| 🔵 | Ciclo Cardíaco | `compêndios/medicina/mecanismos/fisiologia/ciclo-cardiaco.html` |
| 🔵 | Patologia das Doenças Circulatórias | `compêndios/medicina/mecanismos/fisiopatologia/doencas-circulatorias.html` |
| 🔵 | Cardiac Anatomy | `compêndios/medicina/cardiologia-anatomia.html` |
| 🔵 | Hipotensão Pós-Exercício / Barorreflexo | `compêndios/medicina/mecanismos/fisiologia/hipotensao-pos-exercicio-barorreflexo.html` |
| 🔵 | Antiagregantes, Anticoagulantes e Trombolíticos | `compêndios/medicina/mecanismos/farmacologia/antiagregantes-anticoagulantes-tromboliticos.html` |
| 🔵 | Trombose e Hemostasia | `compêndios/medicina/mecanismos/fisiopatologia/trombose-e-hemostasia.html` |

(Um 12º material do mesmo grupo, "PCSK9/LDL-c", consta como publicado no
`AS1-INVENTARIO-2026-09-17.md` mas não foi localizado como arquivo no acervo
atual — não entra na lista por não ter arquivo pra colar no NotebookLM.)

## Grupo 2 — status de publicação NÃO verificado nesta sessão

O `AS1-INVENTARIO-2026-09-17.md` só checou Nefrologia/Hematologia/
Pneumologia/Cardiologia (as 4 disciplinas da prova AS1). Estes materiais
podem ou não já estar publicados — não tentei consultar o Supabase remoto
nesta sessão (leitura de produção foi bloqueada pelo classificador de
segurança do modo automático; posso tentar de novo se você autorizar
interativamente). Trate como "verificar duas vezes" antes de importar como
rascunho novo — pode já existir.

**Imunologia** (`compêndios/medicina/mecanismos/imunologia/`):

| Status | Material | Arquivo |
|---|---|---|
| ⬜ | Imunidade Inata | `imunidade-inata.html` |
| ⬜ | Células do Sistema Imune | `celulas-sistema-imune.html` |
| ⬜ | Moléculas do Sistema Imune | `moleculas-sistema-imune.html` |
| ⬜ | Órgãos Linfoides | `orgaos-linfoides.html` |
| ⬜ | Anticorpos e Imunidade Humoral | `anticorpos-imunidade-humoral.html` |
| ⬜ | Linfócitos T — Diferenciação | `linfocitos-t-diferenciacao.html` |
| ⬜ | MHC e Apresentação Antigênica | `mhc-apresentacao-antigenica.html` |
| ⬜ | Respostas Th1/Th2/Th17 | `respostas-th1-th2-th17.html` |
| ⬜ | Citocinas — Visão Integradora | `citocinas-visao-integradora.html` |
| ⬜ | Hipersensibilidade | `hipersensibilidade.html` |
| ⬜ | Resposta a Patógenos | `resposta-a-patogenos.html` |
| ⬜ | Resposta Imune a Bactérias Extra/Intracelulares | `resposta-imune-bacterias-extra-intracelulares.html` |
| ⬜ | Sistema Complemento | `sistema-complemento.html` |
| ⬜ | Vacinas e Imunidade Protetora | `vacinas-imunidade-protetora.html` |

**Microbiologia** (`compêndios/medicina/mecanismos/microbiologia/`):

| Status | Material | Arquivo |
|---|---|---|
| ⬜ | Micologia Médica | `micologia-medica.html` |
| ⬜ | Virologia Geral | `virologia-geral.html` |

**Outros mecanismos/compêndios de área:**

| Status | Material | Caminho |
|---|---|---|
| ⬜ | Choque Circulatório | `compêndios/medicina/mecanismos/fisiopatologia/choque-circulatorio/choque-circulatorio.html` |
| ⬜ | Fundamentos de Infectologia | `compêndios/medicina/infectologia-fundamentos.html` |
| ⬜ | Medicina de Família e Comunidade | `compêndios/medicina/medicina-familia-comunidade.html` |
| ⬜ | Medicina (panorâmico, EN) | `compêndios/medicina/medicina.html` |
| ⬜ | Tumores do Sistema Nervoso Central | `Biblioteca/Medicina/Neurologia/Clínica/tumores-do-sistema-nervoso-central.html` |

## Registro de retorno do usuário

_(preenchido conforme o usuário for avisando o que passou)_
