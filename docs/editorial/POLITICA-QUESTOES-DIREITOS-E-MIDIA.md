# Política provisória — direitos e mídia do banco de questões

Auditoria: Prompt 34-A, corrigida pelo Prompt 34-A2 (fail-closed). Snapshot: commit `b32ce94`
(branch `work/21d-revisao-humana-cms`), dados lidos por `SELECT` direto do Supabase remoto
(`jfvhwwvixwvgjfqzlkkb`) em 2026-09-15. Cobertura: 402/402 questões (100%). Artefato irmão:
`auditoria-questoes-direitos-midia.csv`.

Este documento **não é parecer jurídico**. Registra evidência, classificação provisória e
incerteza, para orientar decisão humana com base jurídica antes de qualquer liberação comercial.

**Correção 34-A2 (2026-09-15):** a versão original do 34-A classificava 68 questões como
`owned/eligible_authorial` com base em indícios de processo de criação (flashcard pessoal,
reforço pós-erro, pesquisa em diretriz, rótulo "autoral NexusMed"). A diretoria determinou que
isso é **autoria provável, não prova documental de titularidade** — nem mesmo o rótulo "autoral
NexusMed" equivale a uma atestação humana específica de direitos (fluxo `content_revisions`/
`content_reviews` do 23-B). Este documento foi corrigido para fail-closed: **nenhuma questão está
hoje em `owned` ou `eligible_*`**, até que exista atestação humana específica ou licença
documentada. Ver seção "Autoria provável vs. direito comercial atestado" abaixo.

## Decisões da diretoria (reafirmadas)

- Questões reais permanecem no acervo para estudo e auditoria — nada foi apagado ou reescrito.
- Conteúdo comercial só é liberado quando autoral **e atestado**, licenciado, ou aprovado depois
  com base jurídica documentada — autoria provável sozinha não libera.
- Disponibilidade pública na internet, citação, comentário, uso de IA na redação, ou rótulo de
  origem autodeclarado **não** equivalem a licença nem a prova de titularidade.
- Imagem indispensável ausente ou sem direito documentado bloqueia publicação comercial.

## Enums usados no CSV

- `origin_kind`: `authorial | public_exam | private_exam | licensed_source | unknown`
- `rights_status`: `owned | licensed | official_candidate | pending | restricted`
- `media_rights_status`: `not_applicable | owned | licensed | pending | missing`
- `commercial_status`: `eligible_authorial | eligible_licensed | hold_rights | hold_media | hold_rights_and_media`
- `autoria_provavel` (coluna extra do CSV, não é enum do escopo original): `provavel_independente |
  provavel_com_dependencia_de_terceiro | rotulada_sem_atestacao | nao_aplicavel | desconhecida` —
  registra o indício de processo de criação, **sem** convertê-lo em `rights_status=owned`.

## Contagens (402 questões, pós-correção 34-A2)

| origin_kind | contagem |
|---|---|
| authorial | 401 |
| public_exam | 1 |

| rights_status | contagem |
|---|---|
| pending | 402 |

| commercial_status | contagem |
|---|---|
| hold_rights | 400 |
| hold_rights_and_media | 2 |

Resultado provisório: **zero questões comercialmente elegíveis** até atestação humana específica
de direitos ou licença documentada — conforme determinado pela diretoria no 34-A2.

`requires_media = true`: **2 questões** (as mesmas que estão em `hold_rights_and_media`) — ver
seção de mídia abaixo (34-A2 ampliou a cobertura de 19+12/49 candidatos para 120/120 candidatos
por palavra-chave, incluindo explicações/comentário, e encontrou uma segunda questão bloqueada).
Nenhuma questão tem `media_present = true` — o banco tem 21 registros em `content_assets`,
mas **nenhum** está vinculado a `question_id` (todos são de `material_id`/`material_section_id`).
Logo toda questão que dependesse de mídia estaria, hoje, sem mídia documentada no banco.

## Como a classificação foi feita (grupos, não questão a questão)

Todas as 402 questões têm `institution` nula, exceto duas: 1 questão real (UFPA/COREME) e
8 questões marcadas explicitamente `"NexusMed (questão autoral, não extraída de prova real)"`.
As 393 restantes vêm do banco original ("Base de Estudos"), redigidas pelo usuário a partir de
material de estudo próprio — não são reprodução de provas de banca. O texto da questão (vinheta,
enunciado, alternativas, comentário) é redação do usuário; o campo `source` documenta apenas
**de onde veio o conhecimento/tema**, não que o texto tenha sido copiado de uma prova.
Isso já determina `origin_kind = authorial` para 401/402 questões com alta confiança
(consistente com o fluxo de autoria nativa documentado do projeto: pesquisa → material → questão,
cada etapa redigida, não extraída).

O que **não** está resolvido é se o material de estudo citado como fonte é, ele mesmo, de autoria
do usuário ou de terceiro (docente/instituição) — isso é um dos fatores de `rights_status`, mas
não o único: mesmo quando não há dependência de terceiro, falta a atestação humana específica que
converteria autoria provável em direito comercial atestado (ver seção seguinte). Agrupando por
padrão do campo `source` (14 grupos, ver `grupo_origem` no CSV) — **todos hoje em
`rights_status = pending`** após a correção 34-A2:

### Grupo A — fonte é material curricular/institucional de terceiro (334 questões)
Aulas com docente nomeado, tutoriais/casos de curso de graduação (PUC), ou extração de material de
liga acadêmica atribuída a professor. Nada indica que o usuário tenha os direitos comerciais desse
material-fonte documentados; também nada prova o contrário — por isso `pending`, não `restricted`.
`autoria_provavel = provavel_com_dependencia_de_terceiro`.

| grupo_origem | questões | evidência |
|---|---|---|
| `curricular_PUC_tutorial_caso` | 145 | fonte cita tutorial/caso clínico/"Habilidades profissionais" do curso (PUC) |
| `aula_professor_pdf_antimicrobianos` | 76 | "Aulas Antimicrobianos I-III" + guia integrado (material de curso) |
| `extracao_compendio_LANCCILO` | 70 | "Extração e Consolidação — LANCCILO (Tumores do SNC), Prof. [nome]" |
| `aula_professor_pdf_sodio_agua` | 24 | slides "DISTÚRBIO DE SÓDIO E ÁGUA.pdf" sem autor/instituição registrados |
| `aula_professor_pdf` | 18 | "Radiografia de Tórax Básica.pdf (aula, Dr. Felipe Souza — Medicina PUCPR Londrina)" — inclui as 2 questões com mídia bloqueada |
| `exame_publico_UFPA` | 1 | processo seletivo de residência médica real; `status = draft`, não publicada; `autoria_provavel = nao_aplicavel` |

### Grupo B — indício de síntese autoral independente, sem dependência de fonte curricular de terceiro (68 questões)
Flashcards pessoais, reforço pós-erro redigido pelo próprio usuário, pesquisa ativa em diretrizes
públicas com redação própria, e questões marcadas explicitamente como autorais. **Correção 34-A2:**
esse indício de processo de criação não é prova documental de titularidade — continuam
`rights_status = pending`, `commercial_status = hold_rights`, com `autoria_provavel` distinguindo
o tipo de indício (`provavel_independente` para os 4 primeiros grupos; `rotulada_sem_atestacao`
para o rótulo autodeclarado "autoral NexusMed", que é autodeclaração no próprio registro, não
atestação humana via `content_reviews`).

| grupo_origem | questões | evidência (indício, não prova) |
|---|---|---|
| `anki_pessoal` | 38 | banco de flashcards pessoal do usuário |
| `guideline_internacional_citada` | 10 | citação direta de diretriz pública (ESC 2023 / Duke-ISCVID), síntese própria |
| `reforco_autoral_pos_erro` | 7 | "Revisão dirigida por desempenho" — redigida pelo usuário após erro próprio |
| `autoral_explicito_NexusMed` | 8 | rótulo autodeclarado no banco como autoral, não extraída de prova; `status = draft` |
| `pesquisa_ativa_guideline` | 5 | pesquisa ativa em diretrizes internacionais, síntese própria |

Nenhuma questão foi classificada `eligible_*` apenas por estar publicamente disponível na
internet, por ter sido redigida com apoio de IA, ou por ostentar rótulo de origem autodeclarado —
critério explicitamente vedado pela diretoria no 34-A2.

## Autoria provável vs. direito comercial atestado

Estes dois conceitos são distintos e não devem ser confundidos:

- **Autoria provável**: indício, extraído do padrão de dados hoje disponível (campo `source`,
  ausência de `institution`, rótulo autodeclarado), de que o usuário provavelmente escreveu o
  texto da questão a partir de material de estudo próprio. É o que a coluna `autoria_provavel`
  registra. **Não constitui prova jurídica de titularidade.**
- **Direito comercial atestado**: existência de (a) atestação humana específica de direitos via
  fluxo `content_revisions`/`content_reviews` (23-B) — hoje **zero** questões do banco têm
  qualquer `content_revisions` associada, o fluxo existe no schema mas não foi executado para
  nenhuma das 402 questões — ou (b) licença documentada (`questions.license`, hoje nulo em 100%
  dos registros). Só isso move `rights_status` para `owned`/`licensed`.

Nenhum dos seguintes fatos, isoladamente, prova titularidade comercial: uso de Anki pessoal, uso
de diretriz pública como base factual, texto produzido ou revisado com apoio de IA, ou rótulo de
origem autodeclarado no próprio registro (ex.: "questão autoral NexusMed"). Todos são indícios de
processo, não documentação de direito.

## Mídia indispensável ausente

**Cobertura 34-A (parcial):** termos de imagem/exame cruzados com linguagem dêitica → 19
candidatos fortes lidos integralmente + amostra de controle de 12/49 candidatos fracos. A
diretoria apontou (34-A2) que isso não descartava falso-negativo nos 37 candidatos fracos
restantes nem cobria explicações/comentário.

**Cobertura 34-A2 (completa):**
1. Todos os 49 candidatos "fracos" da varredura original (vinheta+enunciado+alternativas) foram
   lidos integralmente, não apenas a amostra de 12.
2. A varredura por palavra-chave foi refeita incluindo também `question_option_keys.explanation`
   e `question_answer_keys.general_commentary/high_yield_summary` (2010 explicações + 402
   comentários gerais, lidos via SELECT read-only) — ampliando o funil de 68 para 120 candidatos
   únicos por palavra-chave (19 fortes já lidos + 101 novos). Os 101 novos foram lidos
   integralmente (52 num primeiro corte de termos amplos incluindo achados só em
   explicação/comentário, mais os que já estavam nos 49 originais).
3. Busca determinística adicional, em **100% das 402 questões** (enunciado, vinheta, alternativas,
   explicações e comentário), por sintaxe Markdown de imagem (`![...](...)`), `<img`, `<table`,
   URLs (`http(s)://`), `data:image/`, extensões de arquivo de imagem, e menções a "anexo/anexado":
   **zero ocorrências genuínas** — o único hit ("sítios anexos", achado anatômico sobre metástase
   craniana) é falso positivo lexical, não referência a arquivo anexado.

**Cobertura final: 120/120 candidatos por palavra-chave lidos individualmente (100%) + varredura
determinística estrutural em 402/402 questões (100%).**

Resultado: **2 questões** com mídia indispensável ausente, ambas na mesma origem (Grupo A,
`aula_professor_pdf` — "Radiografia de Tórax Básica.pdf", Dr. Felipe Souza, PUCPR Londrina):

1. `question_id = 82e55bf5-a083-470b-84dd-970a159aaca4` (achado já confirmado no 34-A, preservado)
   — Radiologia/Pneumologia, tema hilo/atelectasia/sinal da silhueta.
   Enunciado: *"Qual é o achado indicado pelas setas na radiografia da direita e quais sinais
   sustentam esse diagnóstico?"* As 5 alternativas descrevem achados radiológicos diferentes (uma
   cita "formação de menisco de borda côncava" — o sinal do menisco referido no escopo desta
   auditoria), mas nenhum texto do banco descreve o que a seta indica.
2. `question_id = aaaccffc-deb9-4476-a059-50ebbed68422` (**novo achado do 34-A2**) — mesma
   disciplina/tema (hilo/técnica de posicionamento radiográfico).
   Enunciado: *"Qual artefato de posicionamento aparece nas duas radiografias e quais alterações
   ele pode simular nas incidências PA e AP?"* As 5 alternativas descrevem artefatos técnicos
   diferentes (rotação, subexposição, incidência AP, expiração/inspiração) com efeitos plausíveis
   cada um, mas nada no texto diz qual artefato está de fato presente nas duas radiografias
   citadas — só a imagem resolveria.

Ambas: `status = published`, `editorial_state = em_revisao`, `commercial_status =
hold_rights_and_media` (mídia ausente + fonte curricular de terceiro pendente). `content_assets`
não tem nenhum registro vinculado a `question_id` no banco inteiro — a mídia não está apenas
ausente nessas duas questões, está ausente como capacidade (nenhuma questão do acervo tem imagem
anexada via `content_assets`).

Os demais 118 candidatos lidos (17 dos 19 fortes originais + todos os 49 fracos + os 52 novos da
varredura ampliada) **descrevem o achado por extenso no próprio enunciado/vinheta**, ou são
perguntas conceituais/de cálculo que já fornecem os dados numéricos necessários no texto (ex.:
"VEF1 previsto é 3,00 L..."), ou testam fato médico fixo de livro-texto (classificação Duke-ISCVID,
padrões PK/PD, grau OMS de tumor) independente de qualquer imagem específica renderizada — a
imagem/tabela/gráfico mencionado é ilustrativo, não indispensável para responder. Três casos
("Na ilustração abaixo, qual célula..." e afins, Neurocirurgia) foram julgados autossuficientes
por testarem fato anatômico fixo e universal (ex.: astrócito como célula de contato
neurônio-capilar) e não um dado específico só legível na imagem em si — registrado aqui como
inferência, não verificação visual da imagem original (que este levantamento não tem como fazer).

## Uso como referência de competência vs. reprodução vs. adaptação vs. autoral

- **Uso como referência de competência**: nas 402 questões, o material-fonte parece usado só como
  base de conhecimento/tema — a redação (vinheta, enunciado, alternativas, explicações por
  alternativa, comentário geral) é do usuário. Isso é indício de escrita autoral testando uma
  competência, não cópia — mas, como registrado acima, indício não é atestação.
- **Reprodução literal / adaptação próxima**: não verificada nesta auditoria (exigiria comparar
  o texto de cada questão contra o arquivo-fonte original, fora do escopo de "consultas
  agregadas"). É exatamente a lacuna que mantém os 334 casos do Grupo A em `pending` — a auditoria
  não pode descartar que algum enunciado reproduza de perto um caso de tutorial de curso.
- **Questão com indício de autoria mais forte**: os 68 do Grupo B, com maior confiança nos
  `anki_pessoal` (38) e `reforco_autoral_pos_erro` (7), que por definição não têm tutorial/caso de
  terceiro como fonte — mas seguem `pending` até atestação humana específica ou licença, por
  determinação do 34-A2.
- **Recomendação de reautoria** (quando a diretoria decidir avançar sem aguardar validação
  jurídica do material curricular do Grupo A): preservar tema, competência avaliada e metadados da
  questão, mas exigir caso clínico, redação, alternativas, explicações e mídia (quando aplicável)
  100% novos — nunca só trocar palavras do enunciado atual. Note que reautoria por si só também
  não confere `owned` automaticamente: ainda precisaria da atestação humana específica descrita
  acima.

## Ambiguidades jurídicas registradas (não resolvidas aqui)

1. Materiais de aula/tutorial de curso citados como fonte (Grupo A, 334 questões): não está
   documentado se o usuário tem autorização do docente/instituição para uso comercial de conteúdo
   derivado, nem o grau de proximidade textual entre a questão e o material-fonte.
2. Questão UFPA/COREME: disponibilidade de gabarito oficial de concurso público não implica
   automaticamente domínio público ou liberação de reuso comercial por terceiros — permanece
   `pending`; questão está em `draft`, não publicada.
3. Nenhuma fonte tem metadado de licença estruturado (`questions.license`, `content_assets.license`
   estão 100% nulos no banco inteiro) — a ausência de coluna preenchida não foi tratada como
   `restricted` nem como `owned`, apenas como ausência de evidência positiva.
4. **(34-A2)** Mesmo as 68 questões com indício de autoria independente mais forte (Grupo B) não
   têm nenhum registro de atestação humana específica (`content_revisions`/`content_reviews`
   zerados para as 402 questões) nem licença documentada — por isso todas ficam `pending` até que
   esse processo seja executado, e não apenas até validação da fonte curricular do Grupo A.

## Requisitos do futuro gate técnico (34-B, não implementado aqui)

Um gate de publicação comercial deveria, no mínimo:

- Bloquear `publish_question`/exibição comercial quando `commercial_status` não for
  `eligible_authorial` ou `eligible_licensed` — e `eligible_*` só deve ser atingível através de
  atestação humana específica de direitos (`content_reviews` com decisão registrando a checagem
  de titularidade) ou licença documentada, nunca por inferência de padrão de `source`.
- Bloquear quando `requires_media = true` e não houver `content_assets` vinculado à questão com
  `rights_status` documentado (hoje **zero** questões têm essa vinculação — pré-requisito de dado,
  não só de política).
- Reavaliar automaticamente `commercial_status` quando `content_revisions`/`content_reviews`
  (23-B) registrarem uma nova revisão da questão, já que reautoria muda a classificação.
- Ficar sob aprovação explícita da diretoria antes de ligar (este retorno não autoriza 34-B).

## Artefatos

- `docs/editorial/auditoria-questoes-direitos-midia.csv` — 402 linhas de dado + cabeçalho, com
  `question_id`, campos de classificação (incl. `autoria_provavel`), evidência e próximo passo por
  questão. Substituído nesta correção 34-A2 (mesmos 402 IDs, sem remoção nem adição de linha).
- Dados brutos da consulta (`raw_questions.json`, `raw_options.json`, `raw_option_keys.json`,
  `raw_answer_keys.json`, `raw_assets.json`, `raw_disciplines.json`) ficaram fora do repositório,
  apenas no scratchpad local da sessão — não foram commitados (conteúdo de questão em bruto, sem
  necessidade de versionar duplicado).
