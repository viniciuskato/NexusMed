# Auditoria — o que trazer de "Base de Estudos" (Cowork) para o NexusMed

> Sessão de auditoria, 2026-09-21. Escopo: `C:\Users\vinic\OneDrive\Estudos\Base
> de Estudos` (o acervo Cowork que produzia HTMLs autônomos antes do NexusMed
> existir) + o projeto-irmão `C:\Users\vinic\OneDrive\Questões` (achado durante
> a própria auditoria, não estava no pedido original). Só leitura: nenhum
> arquivo do acervo, do NexusMed ou do Supabase foi alterado nesta sessão. Esta
> auditoria **não substitui** `docs/diretoria/AS1-INVENTARIO-2026-09-17.md`
> (que já cobre os 21 temas da prova AS1 em profundidade) — complementa com o
> panorama do acervo inteiro, todas as disciplinas, e o achado novo do banco
> de questões irmão.

## Resumo executivo

O NexusMed já resolveu o problema estrutural que motivou largar o modelo
antigo (ver `docs/editorial/PADRAO-NEXUSMED-CONTEUDOS.md`: "a quantidade de
HTMLs soltos parou de escalar"). O que falta não é arquitetura — é **migração
de conteúdo já produzido**, que hoje existe em três lugares fora do NexusMed:

1. **`Base de Estudos/compêndios/medicina/`** — ~33 arquivos HTML de alta
   qualidade editorial (compêndios de área + mecanismos), já no "modelo atual"
   do Cowork. É a fonte de maior densidade e menor esforço de conversão.
2. **`Base de Estudos/Casos Clínicos/tutorial/`** e o novo domínio
   `casos-clinicos/`** — ~30 arquivos (DOCX/PDF/HTML) de casos clínicos, um
   gênero que **o NexusMed ainda não tem como tipo de conteúdo** (não é
   compêndio, não é questão, não é flashcard).
3. **`OneDrive/Questões`** (achado nesta sessão, projeto separado) — banco de
   ~195 questões com **governança editorial própria mais rigorosa que a do
   NexusMed hoje** (checklist NBME, princípios ICMJE, auditoria por item com
   responsável humano e data). Há indício forte (não confirmado) de que boa
   parte das 402 questões já no banco do NexusMed **vieram** desse projeto —
   mas sem a trilha de auditoria ter sido carregada junto.

Existem hoje **duas pipelines de conversão documentadas no próprio repositório
do NexusMed**, uma obsoleta e uma vigente — ver seção 4. A recomendação central
desta auditoria é: **parar de usar a pipeline antiga, seguir só a nova (a que
já publicou o Distúrbio Acidobásico em produção)**, e priorizar os compêndios
de `compêndios/medicina/` antes de qualquer trabalho novo do zero.

## 1. O que o NexusMed já sabe importar (recapitulação)

- **Compêndio**: formulário do Admin, ou import de arquivo `.md`/
  `.compendium.yaml` (`docs/editorial/PADRAO-NEXUSMED-CONTEUDOS.md`) → RPC
  `import_compendium_draft` → rascunho → revisão/atestação (claims) →
  publicar.
- **Questão comentada**: formulário unitário, ou import em lote por `.md`
  (`docs/editorial/PADRAO-NEXUSMED-QUESTOES.md`, RPC `import_question_draft`,
  desde 2026-09-21) → mesmo gate de revisão/atestação.
- **Flashcard**: só nasce como subproduto de resposta errada a uma questão
  (`is_custom`, `user_id` obrigatório) — não existe caminho editorial de
  carga em lote de flashcard hoje.
- **Sem tipo de conteúdo para "caso clínico"** — não existe hoje no schema.

## 2. Panorama de `Base de Estudos` por domínio

Contagens de arquivos de conteúdo real (`.html`/`.docx`/`.pdf`), excluindo
`_archive/` e `.git`, medidas nesta sessão via `find`.

| Domínio | Arquivos | Formato | Modelo | Observação |
|---|---|---|---|---|
| `compêndios/medicina/` | ~33 | HTML | atual (Cowork "compêndio/mecanismo") | Maior densidade, menor esforço de conversão |
| `Biblioteca/Medicina/` | 2 | HTML | atual, mas órfão | Só `Neurologia/` — não foi migrado no reorg de 18/09 que criou `compêndios/` |
| `Casos Clínicos/tutorial/` | 30 | DOCX/PDF/HTML | modelo "Material de Estudo" (pré-Cowork-skills) | Casos PBL por especialidade (Cardio/Nefro/Pneumo/Infecto) |
| `casos-clinicos/` (novo, minúsculo) | 2 | HTML | atual, domínio dedicado | Casos **reais** de plantão/rotação, gênero distinto do tutorial PBL |
| `provas/medicina/` | 4 | HTML | atual ("prova", escopo fechado por edital) | Arquivos grandes (76–116 KB): Semiologia, Agressão e Defesa, Epidemiologia, Pesquisa em Saúde |
| `_acervo/` (farmaco/fisiopato/imuno/semiologia/ia/produtos/docs-legado) | 23 | DOCX/HTML | pré-modelo, "não retroagir" | Preservado para reaproveitar conteúdo, não para publicar como está |
| `compêndios/anki/` + `Biblioteca/Medicina/_anki/` | 1 | JSON | modo Anki das skills estruturais | Perguntas soltas sem alternativas — formato intermediário, não bate 1:1 com nenhum tipo do NexusMed |
| `compêndios/{filosofia,fisica,ia,investimentos}` | 4 (1 cada) | HTML | atual | **Fora de escopo** — NexusMed é plataforma médica |
| `Biblioteca/{Filosofia,Física,Inteligência Artificial,Investimentos}` | 0 | — | — | Vazias, conteúdo já absorvido por `compêndios/` |

`Biblioteca/Medicina/_extracted-supabase/`, `_shared/`, `_tools/` existem mas
estão **vazias** — provável remanescente de uma tentativa anterior de pipeline
de extração, sem conteúdo a recuperar.

### 2.1 `compêndios/medicina/` — a fonte prioritária

6 compêndios de área (`medicina.html` panorâmico em inglês, mais
`medicina-familia-comunidade`, `infectologia-fundamentos`,
`hematologia-hemograma-anemias`, `cardiologia-semiologia`,
`cardiologia-anatomia`) e ~27 mecanismos, por disciplina:

- **Imunologia** (~13 arquivos): anticorpos, células do sistema imune,
  citocinas, hipersensibilidade, imunidade inata, linfócitos T, MHC,
  moléculas, órgãos linfoides, resposta a patógenos, resposta a bactérias
  extra/intracelulares, Th1/Th2/Th17, complemento, vacinas.
- **Farmacologia** (3): antiagregantes/anticoagulantes/trombolíticos,
  antifúngicos, hipertensão/SRAA/anti-hipertensivos.
- **Fisiologia** (3): avaliação da função renal, ciclo cardíaco, hipotensão
  pós-exercício/barorreflexo.
- **Fisiopatologia** (3): doenças circulatórias, trombose e hemostasia,
  choque circulatório.
- **Microbiologia** (2): micologia médica, virologia geral.
- **Semiologia** (1): síndromes bronco-pleuro-pulmonares.

Todos em HTML com estrutura consistente (sidebar de navegação, tema
claro/escuro, `.data-table`, citação narrativa numerada, referências em 3
camadas) — documentada em `_docs/template-v2-spec.md` do próprio acervo.
Vários **já correspondem a material publicado no banco do NexusMed** (ver
`AS1-INVENTARIO-2026-09-17.md`: avaliação da função renal, hematologia,
hipertensão/SRAA, semiologia cardíaca, síndromes bronco-pleuro-pulmonares) —
nesses casos o HTML do acervo é provavelmente a **fonte original** do que já
foi publicado, não conteúdo novo a importar. Os demais (toda a Imunologia,
Farmacologia exceto hipertensão, Fisiopatologia, Microbiologia,
Medicina de Família/Comunidade, o `medicina.html` panorâmico) **não têm
correspondente no banco** — candidatos diretos a virar material novo.

### 2.2 Achado de reorganização não documentado

`compêndios/medicina/` tem 54 arquivos HTML no disco (33 sem contar
`_archive/`) — todos com `mtime` de **2026-09-18**, uma data única, o que é
consistente com uma reorganização em massa (provável `git mv` de
`Biblioteca/Medicina/<Especialidade>/<Lente>/` para
`compêndios/medicina/<área ou mecanismos/lente>/`) e não com produção nova
naquele dia. Isso bate com `docs/architecture/compendium-extraction-prompt.md`
(2026-09-05, do próprio NexusMed), que referenciava esses mesmos arquivos
pelos caminhos **antigos** (`Cardiologia/Fisiologia/ciclo-cardiaco.html` em
vez de `mecanismos/fisiologia/ciclo-cardiaco.html`). **Consequência prática**:
qualquer caminho de arquivo citado em documentação do NexusMed anterior a
2026-09-18 sobre este acervo está desatualizado — reconfirmar caminho antes de
usar.

`Biblioteca/Medicina/Neurologia/` (criada 2026-09-01, **depois** da última
sessão registrada em `compendio_estado.txt` mas **antes** do reorg de
2026-09-18) ficou de fora do `git mv` — é o único conteúdo do modelo atual
ainda na estrutura antiga. `tumores-do-sistema-nervoso-central.html` não tem
correspondente no banco do NexusMed.

O PDF `Biblioteca/Medicina/Nefrologia/Fisiologia/Equilíbrio Ácido-Base.pdf`,
fonte do material de Distúrbio Acidobásico já publicado em produção (missões
AS1-B1→B3.2), **não existe mais no acervo** — a pasta `Nefrologia/` está
vazia. Não verificado nesta sessão para onde foi (consumido/arquivado fora da
árvore, ou removido) — não é um problema para o NexusMed (o conteúdo já foi
extraído e publicado), só um registro de que o acervo não preserva
automaticamente a fonte depois de consumida.

### 2.3 Casos clínicos — gênero sem tipo de conteúdo no NexusMed

Dois domínios distintos, ambos fora do que o NexusMed representa hoje:

- **`Casos Clínicos/tutorial/`** (30 arquivos): casos PBL por especialidade,
  com objetivos de aprendizagem explícitos — já mapeados em profundidade por
  `AS1-INVENTARIO-2026-09-17.md` (valvopatias, endocardite, função renal
  etc.), a maioria "localizado, não auditado".
- **`casos-clinicos/`** (domínio novo, 2 arquivos): casos **reais** de
  plantão/rotação hospitalar, anonimizados, usados como âncora para
  raciocínio clínico (diagnóstico diferencial, fisiopatologia, conduta) —
  gênero explicitamente distinto do tutorial PBL (ver `casos-clinicos/
  CLAUDE.md`: "partindo do caso concreto, não de um recorte teórico
  abstrato").

Nenhum dos dois mapeia para compêndio (não é área nem mecanismo), questão
(não é item de múltipla escolha) ou flashcard. Trazer esse gênero para o
NexusMed é **decisão de produto**, não só de conteúdo — exigiria uma entidade
nova (algo como "caso clínico interativo") no schema. Registrado aqui como
gap estratégico, não como item de conversão simples.

### 2.4 `provas/medicina/` — gênero de escopo fechado

4 arquivos grandes (Semiologia Médica HP3, Agressão e Defesa, Epidemiologia,
Pesquisa em Saúde) no formato "guia de prova" — visualmente parecido com
compêndio, mas **delimitado por edital/disciplina de uma prova específica**,
não pela exaustão do campo (é exatamente a distinção que
`anthropic-skills:prova` documenta). Decisão de produto pendente: tratar como
compêndio comum ao importar (perdendo o recorte por prova) ou criar uma
segunda via de import que preserve esse recorte. Nenhuma ação recomendada sem
essa decisão.

### 2.5 `_acervo/` — legado pré-modelo, não vigente

23 arquivos, explicitamente preservados como matéria-prima, não como produto
pronto (`_acervo/LEIA-ME.md`: "Não deletar. Ao retomar uma área, adaptar o
material existente ao modelo atual em vez de criar do zero"). Achados
relevantes para medicina:

- `farmacologia/Material_Didatico_Farmacologia.html` — cobre
  anti-inflamatórios, anti-histamínicos, antibacterianos: **confirmado como
  gap real** (não sobrepõe os 3 compêndios de farmacologia já existentes),
  registrado no próprio LEIA-ME.
- `semiologia/` (8 DOCX) — Propedêutica Cardiovascular, Semiologia Pulmonar
  (3 variantes: Completo/FINAL/sem sufixo), Síndromes Pleuropulmonares, Exame
  Físico Geral (3 variantes), Semiologia do Sistema Digestório (2 variantes)
  — mesmo padrão de duplicata provável já sinalizado em
  `AS1-INVENTARIO-2026-09-17.md` para a família "semiologia respiratória".
- `fisiopatologia/Aterosclerose - Patogênese e Morfologia.docx`,
  `imunologia/Hipersensibilidades_I_II_III_IV.docx` — arquivos únicos, não
  comparados contra o banco nesta sessão.

### 2.6 Anki — formato que não bate com nenhum tipo do NexusMed

`compêndios/anki/anki_hipertensao_sraa_anti-hipertensivos.json`: lista de
perguntas abertas por seção (`{"secao", "pergunta", "status"}`), sem
alternativas nem gabarito — é material de **autoavaliação em texto livre**
("modo Anki" das skills estruturais, documentado em `mecanismo/SKILL.md`),
não um flashcard de frente/verso nem uma questão de múltipla escolha. Importar
isso para o NexusMed exigiria decidir se vira flashcard (perdendo a resposta
aberta) ou fica fora.

### 2.7 Fora de escopo: domínios não-médicos

`compêndios/{filosofia,fisica,ia,investimentos}` (1 compêndio de área cada,
sem mecanismos ainda) — o NexusMed é declaradamente uma "plataforma de
estudos médicos" (`AGENTS.md`). Nenhuma ação recomendada aqui a menos que o
usuário decida expandir o escopo do produto — decisão que esta auditoria não
presume.

## 3. Achado novo: o projeto-irmão `OneDrive/Questões`

Não fazia parte do pedido original, mas apareceu durante a auditoria via uma
referência cruzada em `docs/architecture/compendium-extraction-prompt.md`
("banco de 70 questões... no banco canônico do projeto irmão
`OneDrive/Questões`") e foi confirmado como existente e ativo:

- É um projeto separado (`.git` próprio), com app SPA própria
  (`app/*.mjs`, `ARQUITETURA-SPA.md`) — mais um "modelo antigo" a considerar,
  desta vez de questões, não de compêndios.
- `_banco/banco-questoes.json` (2,1 MB): **393 ocorrências de `"id"`**
  (contagem por `grep`, não deduplicada — ordem de grandeza de ~190-200
  questões). Cada questão carrega, além de pergunta/alternativas/gabarito/
  explicação: `classificacao.disciplinasRelacionadas` (múltiplas disciplinas
  por questão — o **NexusMed não tem esse campo**, só disciplina única, gap já
  registrado em `AS1-INVENTARIO-2026-09-17.md`), `estadoEditorial`
  (`"aprovada"` no exemplo lido) e `auditoriaEditorial` (critérios NBME,
  responsável humano, datas de auditoria) — **uma trilha de proveniência mais
  rica do que o que o NexusMed grava hoje** (onde, por `AS1-INVENTARIO`,
  nenhum material publicado tem `content_revisions`/`claims`/
  `content_reviews` preenchidos).
- Governança própria em `_banco/POLITICA-EDITORIAL.md`, referenciando ICMJE
  2026, NBME Item-Writing Guide e Standards for Educational and Psychological
  Testing — mais formal do que qualquer padrão editorial hoje documentado
  para questões no NexusMed.
- O arquivo `lote-questoes-espirometria-nexusmed-v5.md`, na raiz desse
  projeto, é quase certamente a origem do lote de 18 questões de Espirometria
  que o usuário tentou importar no NexusMed nesta mesma sessão de trabalho
  (INC-2026-003, `PROJECT_STATE.md`) — confirma que este projeto-irmão já é,
  na prática, usado como fonte de questões para o NexusMed, mesmo sem
  processo formal.
- **Hipótese forte, não confirmada**: os temas encontrados como "questões
  publicadas sem material vinculado" no NexusMed
  (`AS1-INVENTARIO-2026-09-17.md`: Endocardite 52, Distúrbios de Sódio/Água
  24, Tosse/Hemoptise 24, Radiografia de Tórax 18, Insuficiência Cardíaca 40,
  Hipertensão/SRAA 38) batem tema a tema com os specs presentes em
  `Questões/app/data.mjs` (`SPEC_IDS`: endocardite, disturbios-sodio-agua,
  radiografia-torax-basica, antimicrobianos-fundamentos). Isso sugere que
  essas questões **já vieram** deste banco num carregamento anterior (antes
  de existir o caminho de import por arquivo), mas **sem** a
  `auditoriaEditorial` junto — não foi possível confirmar isso sem consultar
  o Supabase remoto, fora do escopo desta auditoria de leitura local.

**Recomendação**: esta descoberta merece sessão própria de auditoria (não
coberta em profundidade aqui) — comparar `banco-questoes.json` contra as
questões já publicadas no NexusMed por tema/pergunta, e decidir se a
`auditoriaEditorial` de cada questão pode virar a `content_reviews`/`claims`
correspondente no NexusMed, formalizando retroativamente uma proveniência que
já existe, só não migrada.

## 4. Duas pipelines de conversão — usar só a nova

O próprio repositório do NexusMed documenta duas abordagens diferentes para
trazer HTML/PDF/DOCX do acervo para dentro do produto:

**Pipeline antiga** (`docs/architecture/compendium-extraction-prompt.md`,
2026-09-05): ler HTML → montar prompt manual → colar no Google AI Studio →
copiar JSON de volta → rodar `scripts/load-pilot-cardiologia.ts` (script
**específico de Cardiologia**, hard-coded). Resultado real: 2 compêndios
carregados (Cardiac Anatomy, Ciclo Cardíaco, só no Supabase **local**, não
confirmado em produção), 1 com prompt pronto mas não rodado, ~29 sem prompt
gerado. O próprio documento já reconhece a limitação ("script do piloto é
hoje específico de Cardiologia; extrair um script genérico... é trabalho
futuro").

**Pipeline vigente** (desde a missão AS1-B1→B3.2, 2026-09-17/18, e o import
`.md` desde 2026-09-21): fonte → auditoria científica manual → conversão para
`.compendium.yaml` ou `.md` → Admin "Importar material" (UI, sem terminal) →
RPC `import_compendium_draft` (atômica) → rascunho → revisão/atestação
(claims) → publicar. **Já provada de ponta a ponta em produção** (Distúrbio
Acidobásico). Não depende de script específico por disciplina, não depende do
AI Studio, e já tem o gate de revisão/atestação embutido — a pipeline antiga
não tinha esse gate nenhum.

**Recomendação direta**: declarar a pipeline antiga superada. Não gerar mais
prompts de AI Studio nem estender `load-pilot-cardiologia.ts`. Todo compêndio
novo de `compêndios/medicina/` deve seguir auditoria → `.md`/`.yaml` → Admin,
o mesmo caminho já validado. Isso também resolve uma fonte de confusão para
sessões futuras (dois documentos de arquitetura descrevendo dois processos
diferentes para o mesmo problema, um deles morto).

## 5. O que já foi decidido/feito (não redescobrir)

- `AS1-INVENTARIO-2026-09-17.md` + `AS1-TAXONOMIA-PILOTO-2026-09-17.md`: os
  21 temas da prova AS1 (Nefro/Hemato/Pneumo/Cardio) já têm cobertura
  mapeada (9 B, 8 C, 4 D) e ordem de produção aprovada pela diretoria.
- Distúrbio Acidobásico: já publicado em produção via a pipeline vigente —
  modelo de referência para qualquer compêndio novo de `compêndios/medicina/`.
- Importação de questões em lote por `.md`: já existe e está em produção
  (PR #49) — é o caminho certo para qualquer lote extraído de
  `Questões/_banco/banco-questoes.json`, não um script novo.
- Duplicatas já sinalizadas (não reconciliadas): Avaliação da Função Renal,
  Semiologia Cardíaca, Endocardite Infecciosa, semiologia respiratória — ver
  `AS1-INVENTARIO-2026-09-17.md`, seção "Duplicatas prováveis". Os mesmos
  padrões de nome (`_FINAL`, `_Completo`, datas divergentes) reaparecem em
  `_acervo/semiologia/` nesta auditoria — mesma cautela se aplica.

## 6. Riscos

- **Confundir as duas pipelines de conversão** (seção 4) é o risco mais
  imediato para uma sessão futura que não leia este documento — a pipeline
  antiga ainda está documentada como se fosse válida.
- **`Biblioteca/Medicina/Neurologia/` órfã do reorg** — uma sessão que
  procurar conteúdo de Neurologia em `compêndios/medicina/` (o padrão
  esperado desde 18/09) não vai encontrar nada e pode concluir erroneamente
  que não existe material de Neurologia no acervo.
- **Caminhos de arquivo pré-18/09 desatualizados** em qualquer documento do
  NexusMed que cite `Biblioteca/Medicina/<Especialidade>/<Lente>/...` (ex.
  `compendium-extraction-prompt.md` inteiro) — reconfirmar antes de usar.
- **`auditoriaEditorial` do banco de questões-irmão pode estar sendo perdida
  silenciosamente** ao importar questões para o NexusMed — se a hipótese da
  seção 3 estiver correta, questões que já passaram por auditoria humana
  formal estão sendo tratadas, dentro do NexusMed, como se nunca tivessem
  sido revisadas (mesmo problema estrutural que `AS1-INVENTARIO` já apontou
  para os materiais: "publicado" ≠ "auditado").
- **Nenhum dos dois gêneros sem tipo de conteúdo no NexusMed (casos clínicos
  reais, guias de prova por edital) tem decisão de produto tomada** — importar
  como compêndio comum descaracteriza o gênero; não importar deixa esse
  trabalho parado indefinidamente.

## 7. Ordem recomendada de trabalho

Não é uma decisão desta auditoria — fica para a diretoria, com a mesma lógica
já usada em `AS1-TAXONOMIA-PILOTO-2026-09-17.md` (produzir onde o esforço
marginal é menor primeiro):

1. **Menor esforço, maior volume**: os ~25 mecanismos/compêndios de
   `compêndios/medicina/` sem correspondente no banco (toda a Imunologia,
   Farmacologia exceto hipertensão, Fisiopatologia, Microbiologia, MFC,
   `medicina.html`) — já estão no "modelo atual", só precisam da auditoria
   científica + conversão `.md`/`.yaml` + Admin (pipeline vigente, seção 4).
   Ordem sugerida por afinidade com a AS1 já em andamento: fisiopatologia
   (choque circulatório, trombose/hemostasia, doenças circulatórias) e
   farmacologia (antiagregantes/anticoagulantes/trombolíticos) primeiro, por
   tocarem disciplinas já priorizadas; Imunologia/Microbiologia depois, por
   serem ciências básicas sem prova com prazo definido no momento.
2. **Investigar antes de agir**: a hipótese da seção 3 (questões do banco-
   irmão já importadas sem trilha de auditoria) — decidir se vale reconciliar
   retroativamente antes de importar qualquer lote novo desse banco.
3. **Decisão de produto, não de conteúdo**: casos clínicos (tutorial PBL e
   casos reais) e guias de prova por edital — precisam de uma decisão sobre
   se/como entram no schema do NexusMed antes de qualquer conversão.
4. **Resolver a órfã**: migrar `Biblioteca/Medicina/Neurologia/` para dentro
   de `compêndios/medicina/` (só reorganização de arquivo, sem produção nova),
   para não ficar invisível à convenção atual.
5. **Legado (`_acervo/`)**: só ao retomar cada área especificamente — não é
   fila própria, é matéria-prima que se decide reaproveitar caso a caso
   (mesma orientação do próprio `_acervo/LEIA-ME.md`).

## Itens não verificados nesta auditoria

- Se as ~29 mecanismos de `compêndios/medicina/` sem prompt de extração
  gerado têm ou não conteúdo idêntico ao que já está no banco do NexusMed sob
  outro título — só os 5 casos já confirmados por `AS1-INVENTARIO-2026-09-17.md`
  foram cruzados.
- Conteúdo integral de qualquer arquivo de `_acervo/`, `Casos Clínicos/
  tutorial/` ou `casos-clinicos/` — só metadados (nome, data, tamanho) e, em
  alguns casos, primeiras linhas.
- A hipótese da seção 3 (proveniência das questões já publicadas) — exige
  consulta ao Supabase remoto, fora do escopo de uma auditoria só de leitura
  local.
- Estrutura completa de `OneDrive/Questões` além de `_banco/` e `app/` —
  `_dados/`, `_shared/`, `styles/`, `tools/`, `tests/` não foram abertos.
- Se `provas/medicina/_cache/*.md` (conteúdo cacheado dos guias de prova) tem
  alguma relação com o formato `.md` de import do NexusMed — não comparado.
