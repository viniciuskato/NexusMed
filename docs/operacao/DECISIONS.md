# DECISIONS.md — log de decisões duráveis da diretoria

> Log, não diário. Cada entrada é uma decisão que vale para sessões
> futuras até ser explicitamente revista aqui. Não narra o trabalho feito
> (isso é [`TASKS.md`](TASKS.md) para o presente e
> `docs/archive/diretoria/registro.md` / `docs/archive/` para o histórico
> encerrado). Ordem cronológica, mais recente no topo.

## 2026-09-24 — Produção de conteúdo em paralelo, com o Gemini como redator (D-5)

1. **D-5 — O NexusMed evolui em duas frentes simultâneas: sistema e
   conteúdo.** O sistema segue nas trilhas. O conteúdo é operado pelo dono,
   com o Gemini como redator: ele recebe o padrão de conteúdos, as fontes e o
   bloco do material e entrega o `.md`. A interface entre as frentes é o
   padrão e o arquivo — o Gemini não opera no repositório nem no código
   (AGENTS.md, risco 5).
2. **Fluxo de cada material:** Gemini escreve → checagem mecânica do padrão
   sobre o arquivo → revisão cruzada por outro modelo (Claude: fato contra
   referência, referência que existe, escopo do nível), com os achados
   voltando ao Gemini → o dono importa, atesta e publica. A atestação humana
   continua o único portão; a revisão cruzada aplica a regra de verificação
   por modelo diferente de `MODELO-DIRETORIA.md` a conteúdo médico.
3. **A 44-C foi dividida.** A checagem mecânica sobre o arquivo (44-C1) sai
   da dependência da 44-B e entra na trilha 2 logo depois da 43-A, porque a
   produção começou agora e o rascunho de IA existente mostra o custo de não
   ter: 30 trechos em LaTeX e 3 citações com link quebrado, que só
   apareceriam na tela depois de importar. Selo, filtros e versão na Área
   Editorial seguem como 44-C2, depois da 44-B.
4. **Rascunhos, pedidos e fontes ficam fora do git**, em `docs/conteúdos/`
   (ignorada): o repositório é público e fontes de livro-texto têm direito
   autoral. A fonte da verdade do conteúdo é a plataforma; a lista do que
   produzir é o plano editorial do ramo.
5. **No máximo uma leva produzida à frente da revisão.** O gargalo é a
   atestação humana, não a escrita.

## 2026-09-24 — O CI confere a migration no remoto (D-4); destino das branches antigas

1. **D-4 — Merge de PR com migration passa a depender de um check que lê o
   remoto.** Depois da segunda ocorrência em três dias de PR mesclado sem a
   migration aplicada (INC-2026-003, 21/09; INC-2026-004, 24/09), o dono
   escolheu o gate que confere o remoto de verdade: o CI lê o histórico de
   migrations do Supabase de produção com um papel que só enxerga essa tabela
   e reprova o PR enquanto a migration dele não estiver lá. Alternativas
   recusadas: rótulo obrigatório posto pelo dono (pega esquecimento, mas não
   confere o remoto) e só reforçar o processo (foi o que se fez em 21/09 e não
   segurou). Unidade 46-E; pendência do dono P-4 (papel e segredo). Até lá, o
   dono confere a lista do remoto antes de mesclar PR com migration.
2. **`work/integracao-estabilizacao-11b` é apagada** — resolve a entrada de
   2026-09-22 abaixo, opção (a) na forma: a correção de duplicação de
   flashcards foi reaproveitada conceitualmente na 45-A parte 2 (decisão do
   dono durante a execução, PR #76: índice único, criação idempotente no
   banco e reconciliação das duplicatas na migration, com backup). Ao
   conferir a branch contra o `main` de 24/09, havia mais quatro correções
   nela: a da paginação de questões já estava no `main` por outro caminho; as
   outras três (gabarito do caderno de erros com uma falha derrubando todos;
   link para material inexistente abrindo outro material; DOI no fim de frase
   com a pontuação no link) viraram itens de aceite da 45-G e da 45-H. Ponta
   da branch: `cc09bb1`. Apagada depois do merge deste registro.
3. **`work/carga-conteudo-nativo-yaml` foi apagada do remoto em 24/09.** A
   entrada de 22/09 a dava como apagada, mas só a cópia local tinha saído.
   Ponta: `a5dce95`.

## 2026-09-23 — Execução em trilhas, com o modelo mais capaz e revisão antes do merge

1. **A execução é organizada em três trilhas**, cada uma uma sessão de vida
   longa, dona de uma área do código (dados do estudante; material e Área
   Editorial; descoberta e casca do app), num worktree próprio. A trilha
   desenha e implementa as unidades da sua área, uma por PR; o contexto de uma
   unidade serve à próxima. Áreas separadas evitam conflito entre trilhas
   paralelas.
2. **Trilhas e revisões usam o modelo mais capaz disponível.** Modelo mais
   barato só em tarefa mecânica em que errar é barato e conferir é trivial
   (PR do Dependabot, ajuste de texto).
3. **Todo PR passa por revisão em sessão nova antes do merge**
   (`/code-review high <PR>`); as correções voltam para a trilha, que tem o
   contexto. Só o dono mescla e aplica migration no remoto.
4. **A diretoria é sob demanda, não por unidade:** decisão de produto, frente
   nova, correção de unidade, atualização do plano em lote. A trilha pergunta
   ao dono direto, na própria sessão, quando uma escolha muda o que o usuário
   vê ou contradiz uma decisão.
5. **Leitura obrigatória curta:** a trilha lê `AGENTS.md`,
   `EXECUTOR_PROTOCOL.md` e a unidade; o resto só quando precisar. No PR, a
   trilha atualiza só a linha "Estado" da unidade; o registro do plano é da
   diretoria, em lote.

**Por quê**: o dono observou que o trabalho do modelo mais capaz, mesmo mais
caro por token, sai mais barato no total, porque não precisa ser refeito. A
análise do processo confirmou onde estava o custo: cada sessão nova lia cerca
de 250 KB de documentos antes de tocar em código; diretoria e executiva liam o
mesmo código duas vezes; o entendimento se perdia na passagem de uma para a
outra; e a revisão só acontecia depois do merge.

**Considerado e descartado**: a diretoria escrever, na hora de encaminhar, um
briefing de execução (arquivos, desenho, passos) para um executor menos capaz.
Duplica a leitura do código e perde contexto na passagem; só compensaria se a
execução continuasse num modelo mais fraco.

**Como aplicar**: `EXECUTOR_PROTOCOL.md` (protocolo da trilha e da revisão),
`MODELO-DIRETORIA.md` ("Trilhas e revisão"), `SESSION_PROTOCOL.md` (leitura
por papel) e as seções 0 e 5 do plano canônico.

---

## 2026-09-23 — Edição de publicado vira rascunho à parte; sem leitura offline por ora; 46-A em duas janelas

Decisões D-1 a D-3 do plano canônico, tomadas pelo dono do produto, todas
conforme a recomendação da diretoria.

1. **D-1 — Editar material publicado gera uma edição pendente à parte.** O
   estudante continua lendo a versão atestada — leitor, biblioteca, árvore,
   busca — até a edição ser atestada; aí ela entra de uma vez, e o hash
   atestado é o do que passa a ser lido. O que fica fora do hash (posição,
   ordem, rótulo curto, "também aparece em") vale na hora, sem edição
   pendente — coerente com a decisão do hash de 2026-09-22/23. Anotações de
   seção removida são preservadas e continuam visíveis para o aluno. Material
   não publicado continua sendo editado direto.
2. **D-2 — Leitura offline não é requisito, por ora.** Sem rede, a tela diz
   "sem conexão"; a gravação offline (responder, anotar, favoritar, marcar
   leitura) continua e sobe quando a rede volta. Pode voltar como unidade
   própria se o uso pedir.
3. **D-3 — A decomposição do componente raiz (46-A) vai em duas janelas:**
   passos 1 a 4 (rede de segurança e arrumação) antes das telas novas do
   ciclo; passos 5 a 12 (camada de dados e roteador) depois da 45-G.
4. **Escopo do produto: todo o conhecimento médico, construído por partes.**
   Um ramo de cada vez, com piloto validando a forma antes de escalar.
   Consequência imediata: a P-3 (pendências de 18/09) sai; o material de
   Equilíbrio Ácido-Base vai para a fila editorial, sem prazo.

**Por quê**: (1) despublicar para editar tira o material do ar durante a
revisão, e editar direto muda conteúdo médico sem revisão (AUD-24). A
diretoria conferiu o custo: o snapshot que o revisor atesta já guarda a versão
atestada inteira, com os ids das seções; a tabela de versões de seção é só um
registro de edições já gravadas. (2) A leitura offline incoerente já causa
bugs online (AUD-05, AUD-29), e sustentá-la complica a camada de dados da
46-A. (3) Fazer os 12 passos antes atrasa o "testar o que li"; deixar tudo
para depois encarece cada tela nova.

**Como aplicar**: unidades 45-D (proteções, sem a edição pendente), 45-K
(nova: edição pendente), 45-G (reescrita pela D-2) e 46-A (o passo 5 do plano
de 18/09 presumia leitura offline e precisa de ajuste) em
[`docs/produto/PLANO-DE-DESENVOLVIMENTO.md`](../produto/PLANO-DE-DESENVOLVIMENTO.md).

---

## 2026-09-23 — Plano canônico único do desenvolvimento

Um único documento,
[`docs/produto/PLANO-DE-DESENVOLVIMENTO.md`](../produto/PLANO-DE-DESENVOLVIMENTO.md),
passa a ser o plano do sistema: visão, estado verificado, decisões em vigor,
frentes, sequência, decisões em aberto, todas as unidades de implementação e o
registro. Absorve os documentos por iniciativa (ciclo de estudo e base de
materiais) e agenda os achados abertos da auditoria em unidades (frentes 45 e
46), sem copiar o detalhe técnico, que continua em `BACKLOG-ESTRATEGICO.md`.

- **A diretoria** planeja nele: cria, corrige e descarta unidades, muda a
  sequência, registra e resolve decisões em aberto.
- **A execução** atualiza, no mesmo PR da implementação, o estado da unidade,
  o registro e os achados da execução. Não mexe em aceite nem em sequência.
- `TASKS.md` fica como fila operacional (incidentes e pendências avulsas) e
  não repete as unidades; `docs/archive/diretoria/registro.md` vira histórico.

**Por quê**: o dono do produto quer um material único que possa ler para
entender o planejamento inteiro, organizado por unidades de implementação —
o papel que a sequência de prompts cumpria. Com um documento por iniciativa,
mais o backlog da auditoria, mais o `TASKS.md`, não havia lugar que dissesse
"o que vem agora e por quê" sobre tudo ao mesmo tempo.

**Como aplicar**: seção 0 do próprio plano; `MODELO-DIRETORIA.md`, "Plano
canônico e unidades"; `EXECUTOR_PROTOCOL.md`.

---

## 2026-09-23 — Casa e "também aparece em"; padrão versionado

1. **Todo material tem uma única disciplina-casa**, a do ramo inteiro. Regra:
   o material mora onde o conceito é definido — fármaco em Farmacologia,
   doença na especialidade clínica, mecanismo na ciência básica.
   Antimicrobianos moram em Farmacologia.
2. **Um ramo pode aparecer em outras disciplinas** ("também aparece em"),
   marcado uma vez no topo e herdado por tudo abaixo. Sem cópia de material,
   sem vários pais. Não entra no hash de atestação.
3. **O padrão editorial tem versão** (v2 em 2026-09-23). Mudança de aparência
   se resolve no leitor; mudança de formato, no importador (aceitando as duas
   formas por um tempo); só mudança editorial exige reescrever material — e
   essa é apontada por checagem automática e feita por arquivo, sobre o mesmo
   material, preservando posição e questões.
4. **A plataforma é a única fonte da verdade**; `.md` é formato de troca.
5. **O texto do material não cita a estrutura** (nada de "veja o material X"
   nem número no título).

**Por quê**: o dono do produto apontou que antimicrobianos são de
Farmacologia e de Infectologia, e que materiais feitos em padrões antigos
ficam para trás. Cópia diverge; vários pais tornam o caminho ambíguo; reler
todo material a cada melhoria do padrão não escala.

**Como aplicar**: frente 44 do plano canônico,
[`docs/produto/PLANO-DE-DESENVOLVIMENTO.md`](../produto/PLANO-DE-DESENVOLVIMENTO.md).
O padrão v2 e o plano dos antimicrobianos já valem; o resto depende das
unidades 44-A a 44-C.

---

## 2026-09-23 — Ciclo de estudo: a árvore fica, as ligações cadastradas congelam, a conexão passa a ser questão ↔ materiais

O produto é um banco de materiais a serviço de um ciclo: encontrar o assunto →
ler e aprofundar → testar o que leu (inclusive questões entre materiais) → o
erro vira flashcard → revisão diária controlada pela plataforma. A estrutura
existe para o estudo, não para si mesma.

1. **A árvore (pai → filhos) fica.** É o mecanismo de "aprofundar até onde
   achar necessário".
2. **"Estude antes" e "Veja também" param de ser cadastrados.** Saem do
   formulário e da importação; o que já existe continua funcionando e visível;
   nada é apagado. Eram a maior fonte de complexidade e de envelhecimento da
   rede — um material novo não atualiza os antigos — e não aparecem em nenhum
   passo do ciclo. Revisa a decisão de 2026-09-22 (árvore + dois tipos de
   ligação) no que diz respeito às ligações.
3. **A conexão que importa é questão ↔ materiais.** Uma questão cobra um ou
   vários materiais. Daí saem o "testar o que li", as questões entre materiais
   (aparecem quando todos os materiais que exigem foram lidos) e, se fizer
   falta, um "Veja também" calculado. A rede se atualiza a cada questão nova,
   sem manutenção retroativa.
4. **Busca no banco, no padrão de base de artigos científicos** — várias
   palavras, sem acento, relevância, trecho destacado, abre na seção.

**Por quê**: o dono do produto apontou que o emaranhado de interligações e
subordinações ficava complexo demais e envelheceria com a produção de
material novo. A análise confirmou: a árvore não envelhece (cresce para baixo,
o "Aprofunde-se" é calculado), mas as ligações cadastradas envelhecem e não
servem ao ciclo; o passo que faltava ("testar o que li") depende de outra
conexão.

**Como aplicar**: frente 43 do plano canônico,
[`docs/produto/PLANO-DE-DESENVOLVIMENTO.md`](../produto/PLANO-DE-DESENVOLVIMENTO.md).
Ordem: primeiro o que muda a forma de produzir conteúdo, depois o que só lê.

---

## 2026-09-23 — Fichas de etapa no lugar de prompts

Encaminhamentos deixam de ser prompts persistidos em `docs/archive/diretoria/prompts/`
e passam a ser **fichas de etapa** num documento vivo por iniciativa, em
`docs/produto/`. A ficha guarda só o que não envelhece: por quê, critério de
aceite observável, restrições e armadilhas conhecidas (com onde conferir),
fora de escopo, dependências, estado. O como (arquivos, SQL, comandos,
hashes, passo a passo) é derivado por quem executa, lendo o código naquele
momento. O encaminhamento vira uma linha: "execute a etapa X de Y seguindo o
EXECUTOR_PROTOCOL".

**Por quê**: os prompts envelheciam antes de serem executados. O 42-C ainda
apontava para um caminho de repositório que não existe mais; o plano técnico da
taxonomia foi desmentido três vezes em um dia; e os achados que mais importam
(ex.: o hash de atestação da questão incluir o vínculo com material) só
aparecem lendo o código na hora. O projeto já tinha lugar para o que dura
(`DECISIONS.md`, `standards/`, `TASKS.md`, o PR como diário) e para o como
genérico (`AGENTS.md`, `RUNBOOK.md`, `EXECUTOR_PROTOCOL.md`); o prompt
duplicava tudo num texto perecível.

**O que não muda**: autorização específica para push, PR, merge e escrita
remota; gates completos; verificação independente por outra sessão.

**Como aplicar**: ver `docs/diretoria/MODELO-DIRETORIA.md`, seção "Plano
canônico e unidades", e `docs/operacao/EXECUTOR_PROTOCOL.md`. Uma ficha sem
critério de aceite observável não é executável — "só a ideia" não basta.
`docs/archive/diretoria/prompts/` fica como histórico. *O "documento por iniciativa"
foi substituído no mesmo dia por um plano canônico único — ver a entrada
"Plano canônico único do desenvolvimento", acima; as fichas passaram a se
chamar unidades.*

---

## 2026-09-23 — "Salvar" sem mudança é no-op, e a importação é o caminho de primeira classe

Três decisões, tomadas depois de medir o fluxo real do dono do produto
(produzir fora → **importar** → posicionar → atestar → publicar):

1. **Abrir um material e salvar sem mudar nada não altera nada gravado.**
   Medido: o formulário trocava `mode` nulo por `mecanismos` (os 38 materiais
   de produção), apagava `study_lens` e recriava todas as referências com ids
   novos — cada um invalidava a atestação, e a recriação das referências
   apagava em silêncio o vínculo com fonte curada. Agora a conversão
   formulário ⇄ material parte do original, e `save_compendium` preserva
   referências por texto idêntico.
2. **O vínculo de referência com fonte curada tem um dono só: o painel de
   referências.** `save_compendium` nunca altera `source_id`/`url` de
   referência existente. Nenhum cliente desvincula sem querer.
3. **`nav_short_title` sai do hash de atestação** — revisa o que a Fase 1.5
   definiu (a migration `20260922130000` o colocou no snapshot como "texto
   exibido"). No fluxo de importação o rótulo curto só
   pode ser preenchido depois do texto pronto; reatestar por causa de um
   rótulo de trilha não protegia nada. O snapshot volta a ser idêntico ao
   pré-taxonomia.

**Como aplicar**: importação e formulário usam o mesmo componente de posição
(`MaterialNavigationFields`) e a mesma validação; a importação grava posição e
ligações na mesma transação. Posicionar antes ou depois de atestar tanto faz.
Detalhe em [`standards/taxonomia-materiais.md`](standards/taxonomia-materiais.md)
§4, §6.0 e §6.1b.

---

## 2026-09-22 (revisão) — A árvore é amarrada por disciplina, e o hash de atestação não cobre navegação

Revisa a entrada abaixo, do mesmo dia, depois de medir a fundação contra o
Supabase local. Três regras dela não sobreviveram ao teste:

1. **Pai e filho compartilham a disciplina, não o tema.** Exigir o tema
   congelava cada ramo no tema em que nasceu: mover o pai primeiro, o filho
   primeiro ou os dois no mesmo `UPDATE` falhavam todos, e a única saída era
   destacar os filhos, mover e reanexar — com a árvore quebrada na tela do
   estudante no meio do processo.
2. **O hash de atestação cobre conteúdo, nunca posição nem ligação.** Com
   navegação dentro do snapshot, um link `related` criado em C invalidava a
   revisão aprovada de A (o link é simétrico e aparece nos dois snapshots) e
   reordenar irmãos invalidava a do próprio material. Pior: como
   `create_content_revision` não herda claims, a revisão nova nascia com zero
   claims e era aprovável sem nenhuma verificação — o gate científico viraria
   carimbo justamente no fluxo mais frequente do produto. Quem garante a
   integridade da árvore são os gates de `publish_material`/`unpublish_material`,
   que checam o estado real.
3. **Um par de materiais tem no máximo uma relação, e ancestral nunca é
   pré-requisito.** `prerequisite` e `related` coexistiam no mesmo par (o
   estudante veria o mesmo material em "Estude antes" e em "Veja também"), e o
   catálogo do piloto cadastrava o próprio pai como "Estude antes" — informação
   que a trilha de navegação já dá.

Decisões novas da mesma revisão: a árvore tem teto de **8 níveis**; `materials`
ganha `nav_short_title` (rótulo curto de trilha, separado do título editorial) e
`taxonomy_kind` (nível do nó); mover um material passa pela RPC
`set_material_position`, sem reescrever conteúdo.

**Por quê**: a fundação foi revisada antes de produzir conteúdo, não depois. As
três regras revistas só apareceriam como atrito editorial quando já houvesse
dezenas de materiais na árvore — e aí cada correção custaria migration mais
passada editorial em cada nó.

**Como aplicar**: ver
[`standards/taxonomia-materiais.md`](standards/taxonomia-materiais.md) para as
regras que valem na produção de conteúdo e nas Fases 2 e 3.

---

## 2026-09-22 — Materiais usam uma árvore canônica e apenas dois tipos de ligação transversal

> **Revisada em 2026-09-22 pela entrada acima.** Os pontos sobre tema
> compartilhado, navegação no snapshot e um par com duas ligações não valem
> mais; o restante desta entrada continua em vigor.

Cada material pode ter no máximo um pai, que precisa pertencer à mesma
disciplina e ao mesmo tema. A profundidade não é fixada: visão geral, classe,
subclasse e fármaco são materiais comuns ligados pela mesma árvore. Filhos são
ordenados por número; `Aprofunde-se` será derivado dos filhos, não cadastrado.

Fora da árvore existem somente `prerequisite` (`Estude antes`, direcionado) e
`related` (`Veja também`, simétrico). Tanto a árvore quanto o grafo de
pré-requisitos são acíclicos. Um estudante só enxerga ligações cujas duas
pontas estão publicadas. Filho exige ancestrais publicados; material exige seus
pré-requisitos publicados; despublicação que quebraria uma dessas garantias é
bloqueada, nunca propagada em cascata.

**Como aplicar**: imports continuam criando raízes sem links; reorganização do
acervo legado é tarefa editorial explícita. Posição e ligações são salvas junto
com o compêndio pela RPC transacional. A primeira validação de produto fica
limitada ao caminho piloto dos β-lactâmicos; não criar grafo visual, novos tipos
de ligação ou páginas individuais para todo fármaco antes de validar o piloto.

---

## 2026-09-22 — `work/integracao-estabilizacao-11b` fica pendente de decisão, não é lixo de repositório

Auditoria de organização do repositório (limpeza de branches locais/remotas
já mescladas) encontrou duas branches antigas (2026-09-11) nunca mescladas
em `main`. Investigação decidiu o destino de cada uma de forma diferente:

- **`work/carga-conteudo-nativo-yaml`** (carga de questões via YAML nativo
  com `institution`/`year`, script `scripts/load-native-content.ts`) foi
  **apagada** (local e remota) — confirmado que a RPC `import_question_draft`
  (migration `20260921120000`, botão "Importar questões" do Admin) já cobre
  `institution`/`year` por outro caminho, mais integrado. Superada de fato,
  não por suposição.
- **`work/integracao-estabilizacao-11b`** ("11-B2") **continua existindo, de
  propósito.** Contém um fix real de deduplicação de SRS de flashcard
  (migration `flashcard_srs_unique_creation` + RPC), documentado em
  `docs/archive/diretoria/registro.md` (seção "Achado em produção... 2026-09-11") como
  deliberadamente não mesclado porque depende de uma "reconciliação de
  duplicata remota" (Prompt 11-C) que nunca foi concluída. Só o sintoma mais
  estreito (id de flashcard automático não-uuid) foi extraído e publicado à
  parte como `hotfix/flashcard-auto-uuid`; a correção completa de
  deduplicação segue represada.

**Como aplicar**: não tratar `work/integracao-estabilizacao-11b` como
branch órfã em futuras limpezas de repositório até uma sessão de diretoria
escolher explicitamente entre (a) destravar o Prompt 11-C e mergear a
correção completa, ou (b) confirmar que o bug de duplicata deixou de ser
reproduzível/relevante e só então apagar a branch, registrando isso aqui.
Repositório limpo não é o mesmo que decisão tomada — a ausência de decisão
não deve ser resolvida silenciosamente apagando a evidência do problema.

---

## 2026-09-18 — Mudança entra em `main` só por Pull Request com CI verde

Auditoria de 2026-09-18: o CI do `main` estava vermelho havia vários
commits (specs de importação dependendo de um arquivo do acervo pessoal)
e ninguém notou, porque o push direto em `main` já publicava em produção
antes de o CI terminar. Pelo mesmo caminho entrou o `fe20832` sem revisão.

**Como aplicar**: branch → PR (template em `.github/pull_request_template.md`)
→ CI `fast` e `full` verdes → preview da Vercel conferido quando muda tela →
migration aplicada no remoto antes do merge quando o frontend depende dela
→ merge pelo GitHub. Push direto em `main` não é mais aceito, nem para
"só documentação". Para garantir isso no GitHub (pendente: exige conta
admin do repositório), em *Settings → Branches → Add rule* para `main`:
"Require a pull request before merging" e "Require status checks to pass"
com os checks `fast (typecheck + lint + unit + build)` e
`full (pgTAP + Playwright contra Supabase local)`.

## 2026-09-18 — Quem revisou/atestou conteúdo não pode ser apagado; tirar acesso é `profiles.status = 'blocked'`

`content_revisions.created_by`, `content_reviews.reviewer_user_id`,
`claims.decided_by` e `material_section_versions.changed_by` referenciam
`auth.users` **sem `on delete`** (equivale a `RESTRICT`): o Postgres recusa
apagar um usuário que tem trilha editorial. Isso veio à tona porque o spec
e2e 23-B deixava o admin de teste para trás (TASK-2026-09-17-05) — o
helper `deleteTestUser` ignorava o `{ error }` devolvido pela Admin API, e
a falha passava em silêncio.

Decisão: **manter o `RESTRICT`, de propósito.** A atestação editorial
existe para registrar quem atestou o quê; `ON DELETE SET NULL` apagaria a
autoria (e as colunas `NOT NULL` nem permitem), e `ON DELETE CASCADE`
apagaria a própria trilha de auditoria junto com o usuário.

**Como aplicar**: para remover o acesso de alguém que já revisou conteúdo,
usar `profiles.status = 'blocked'` (gate fail-closed, AGENTS.md risco 9),
nunca excluir o usuário. Não "consertar" uma exclusão de usuário que falha
adicionando cascade/set null a essas FKs. Em testes, limpar na ordem
inversa da criação (conteúdo antes do autor) e nunca engolir erro de
limpeza — usar `runCleanup` de `tests/e2e/fixtures/localSupabase.ts`.

## 2026-09-18 — Tags de material nunca levam rótulo de coleção/curso externo; a plataforma tem que se entender sozinha

Na pré-visualização da importação real de `acidobase.compendium.yaml`, o
usuário notou que as tags incluíam "AS1" e "Saúde do Adulto 1" — o nome da
coleção curricular/prova de uma faculdade específica, não um conceito
clínico. Causa: o prompt da missão AS1-B2
(`docs/archive/diretoria/prompts/AS1-B2.txt`, linha 127) instruía "coleção
curricular: AS1 — Saúde do Adulto 1" sem dizer onde isso deveria ser
registrado; sem um campo próprio de "coleção" no schema, a sessão
executora colocou o rótulo em `tags`, que é visível a qualquer usuário do
NexusMed, misturando "por que produzimos isso agora" com "o que este
material é". Corrigido no YAML antes de importar (removidas as duas tags;
17 seções e 14 referências continuam intactas, confirmado pelo parser
real).

**Como aplicar**: `tags` de um material só leva vocabulário clínico livre
(disciplina, subtemas, fármacos/estruturas — como já instruído em
`docs/archive/architecture/compendium-extraction-prompt.md`, item 8). Identificadores
de coleção/curso/prova externos (AS1, nome de faculdade, sigla de
disciplina de um currículo específico) nunca entram em `tags` — ficam só
no documento da coleção (`docs/archive/diretoria/AS1-TAXONOMIA-PILOTO-2026-09-17.md`,
que já se descreve como "não duplica nenhum material, só referencia").
Prompts futuros de conversão (temas 12, 19 e as próximas ondas da AS1)
devem dizer isso explicitamente, não só mencionar "coleção curricular: X"
e deixar a sessão executora decidir onde colocar.

## 2026-09-17 — Gravação multi-tabela editorial nova deve ser RPC transacional, não requisições independentes

A diretoria rejeitou a 42-A (importação de compêndio) por gravar material,
seções e referências em requisições HTTP independentes
(`saveCompendium()`), com a cópia local escrita antes da confirmação
remota — uma falha intermediária podia deixar rascunho parcial no banco. A
correção (42-B) criou `public.import_compendium_draft()`, uma função
PL/pgSQL que faz a gravação inteira numa única chamada (atômica por
natureza no Postgres) e só atualiza a cópia local depois do sucesso remoto
integral.

**Como aplicar**: qualquer funcionalidade nova que precise criar/atualizar
mais de uma tabela relacionada como uma única operação lógica (não é o caso
de `saveCompendium()` do formulário manual, que fica como está, fora de
escopo) deve seguir esse padrão — RPC dedicada com validação de
autorização/coerência no servidor, não confiar em checagem client-side, e
nunca gravar a cópia local antes de confirmar o Supabase quando a escrita
for multi-etapa. Não "resolver" atomicidade com limpeza client-side
best-effort em caso de falha parcial.

---

## 2026-09-17 — Merge/push que dispara deploy exige sessão fora do modo
automático

Durante a 41-C, `git merge --no-ff` em `main` foi negado duas vezes pelo
classificador de segurança do Claude Code em modo automático (motivos
"[Production Deploy]" e "[Auto-Mode Bypass]"), mesmo com hashes/escopo já
validados e autorização textual da diretoria no prompt. Não é contornável
por texto de autorização nem por ferramentas alternativas — exige sair do
modo automático e aprovar a ação interativamente, ação por ação. **Como
aplicar**: qualquer entrega futura que termine em merge em `main` seguido
de push deve prever que essa etapa específica só roda com o operador
presente e o modo automático desligado; não vale a pena tentar autorizar
isso por texto de prompt com antecedência.

## 2026-09-17 — 41-B aprovada para etapa de publicação

A diretoria conferiu a candidata `367f75c` e confirmou no remoto que
`origin/work/41b-gate-final-fe20832` aponta para o mesmo commit, enquanto
`origin/main` permanece em `fe20832`. Os gates completos passaram: pgTAP
228/228, Playwright 24/24, testes unitários/componentes 26/26, typecheck,
lint, build e bundle sem debug. As supressões de hooks foram substituídas por
dependências reais e teste com controle negativo.

A candidata está tecnicamente aprovada. Publicação somente pela Entrega 41-C,
com preflight sem drift, merge `--no-ff`, repetição dos gates, deploy e smoke.
A fixture residual local do spec 23-B e o worktree órfão são tarefas separadas
e não devem ser misturados com o deploy.

---

## 2026-09-17 — Gate final da 41-B: pgTAP e Playwright oficial fecham a auditoria de `fe20832`

A Entrega 41-B partiu de `work/41a-auditoria-fe20832` @ `6c1f108` numa
worktree separada (`work/41b-gate-final-fe20832`) e fechou os itens que a
41-A tinha deixado pendentes por falta de Docker: com o Docker Desktop
iniciado nesta sessão, pgTAP (228/228 asserções) e Playwright oficial
(24/24 specs, contra Supabase local) passaram integralmente.

Além disso, revisou com ceticismo as duas supressões
`react-hooks/exhaustive-deps` que a 41-A tinha introduzido para voltar ao
teto de warnings — a instrução explícita da diretoria foi não aceitar essas
supressões só porque "reinstalar o listener seria desnecessário", e exigir
prova técnica real. A revisão encontrou um risco genuíno (não hipotético):
o listener de teclado do `QuestionCard` podia ficar preso a uma callback
antiga do componente pai (`onAnswerRecorded`/`onSelectOptionInExam`) se o
pai trocasse essa prop de referência sem que `isSubmitted`/`selectedOption`/
`isExamMode`/`question.options` também mudassem — cenário plausível, já que
o próprio código do `QuestionCard` documenta (comentário sobre `hydrated`)
que o componente pai recria objetos a cada render. Decisão: **as duas
supressões foram removidas**, não mantidas — `playChime` e
`handleConfirmAnswer`/`handleSelectOption` foram estabilizados com
`useCallback` e dependências reais, permitindo listas de dependências
completas e verdadeiras nos `useEffect`. Um teste focado novo
(`tests/component/questionCardKeyboardShortcuts.test.tsx`) prova isso: falha
no código da 41-A (confirmado por controle negativo manual nesta sessão) e
passa no código corrigido.

Decisão: `work/41b-gate-final-fe20832` fica **enviada ao remoto**
(`origin/work/41b-gate-final-fe20832`), mas **não mesclada em `main`** — a
decisão de integração continua sendo da diretoria. `main`, produção
(Vercel) e o Supabase remoto não foram tocados nesta entrega; permanecem no
mesmo estado de antes, com `fe20832` no ar sem as correções das 41-A/41-B.

---

## 2026-09-17 — Veredito da auditoria 41-A sobre `fe20832`: aceitar com correções

A sessão executiva da Entrega 41-A revisou linha a linha o diff completo de
`fe20832` (`git diff 2e342bd..fe20832`, 23 arquivos) e classifica o commit
como **aceitar com correções** — não é caso de reversão, mas também não
podia ser aceito como estava:

- Reprodutibilidade de build estava genuinamente quebrada: `package.json`
  idêntico antes/depois, `package-lock.json` apagado sem substituto;
  restaurado a partir de `2e342bd` (só possível porque o manifesto não
  mudou — se tivesse mudado, teria exigido gerar lockfile novo e revisar
  dependências transitivas).
- `npm run typecheck` e `npm run lint` — os dois gates que compõem
  `npm run verify:fast` junto com testes/build — **falhavam** com o commit
  original. Isso significa que `fe20832` nunca passou por `npm run verify`
  antes de chegar em `main`, reforçando a hipótese (não confirmada como
  fato, mas consistente com a evidência) de que o processo de gate normal
  foi pulado nesse commit específico.
- Dois componentes novos ficavam **inacessíveis** (importados, nunca
  renderizados) — não é o mesmo padrão de "atalho perigoso" (bypass de
  auth, escrita silenciosa), mas é uma funcionalidade anunciada no diff que
  simplesmente não existia para o usuário final até a correção da 41-A.
- Nenhum problema de segurança (segredo exposto, bypass de auth/admin,
  escrita remota silenciosa) foi encontrado no diff.

Decisão: a branch `work/41a-auditoria-fe20832` (40-A + correções da 41-A)
fica **só local** até a diretoria decidir merge/push. `main` continua com
`fe20832` no ar sem essas correções até essa decisão. O gate pgTAP
(`npm run test`) não pôde ser executado nesta entrega por falta de Docker
no ambiente de execução — isso é um item pendente, não uma aprovação
implícita; a diretoria deve mandar rodar esse gate (localmente ou em CI)
antes de aprovar publicação em produção.

---

## 2026-09-17 — Aceitação do 40-A e bloqueio de integração até auditoria P0

A diretoria auditou o retorno e a branch `work/40a-continuidade-operacional`:
escopo exclusivamente documental, preservação histórica, redução do caminho
crítico, links e `git diff --check` foram confirmados. A Entrega 40-A está
**concluída tecnicamente**, mas sua integração em `main` permanece bloqueada.

Motivo: qualquer push em `main` dispara novo deploy, e a base atual `fe20832`
removeu `package-lock.json`. Um novo build sem lockfile pode resolver versões
transitivas diferentes. A próxima entrega obrigatória é a 41-A, auditoria do
commit e restauração da reprodutibilidade. Somente depois haverá decisão
separada de publicação para integrar 40-A e eventuais correções.

---

## 2026-09-17 — Continuidade operacional e fonte única de verdade

Decisão da diretoria, origem da Entrega 40-A:

1. **Chats, memória de uma IA e cópias soltas não são fonte de verdade.**
   A fonte oficial é o repositório GitHub
   `viniciuskato/SynapseMed-firebase-auth`, branch `main`. O estado
   presente deve sempre ser reconfirmado no remoto (`git fetch`), nunca
   assumido a partir de uma conversa anterior ou de memória entre sessões.
2. **Produção exige autorização explícita.** Trabalho local, um commit
   feito, ou uma branch candidata enviada ao remoto **não equivalem a
   publicação** — publicação é `main` avançar e o deploy automático do
   Vercel refletir isso, confirmado por evidência (bundle, smoke test),
   não pela mensagem de sucesso de um comando.
3. **Uma sessão trabalha em um objetivo principal por vez.** Evita
   escritores concorrentes no mesmo arquivo/branch e relatos que misturam
   entregas diferentes.
4. **Ações remotas ou destrutivas exigem gate próprio**, distinto do
   trabalho local: merge em `main`, push, aplicar migration no Supabase
   remoto, qualquer escrita fora do ambiente local de teste. Ver o
   procedimento em [`RUNBOOK.md`](RUNBOOK.md).
5. **Toda sessão encerra com um relatório em linguagem executiva**,
   verificável item a item — ver o checklist em
   [`SESSION_PROTOCOL.md`](SESSION_PROTOCOL.md).
6. **Instituída a camada `docs/operacao/`** (`PROJECT_STATE.md`,
   `DECISIONS.md`, `TASKS.md`, `RUNBOOK.md`, `SESSION_PROTOCOL.md`) como
   porta de entrada única e curta para qualquer sessão nova — substitui a
   necessidade de ler o `AGENTS.md` antigo (114 KB, misturava regra
   permanente, estado e diário histórico) e o
   `docs/archive/diretoria/registro.md` completo (histórico extenso de prompts)
   só para entender o presente. `AGENTS.md` passou a ser um índice curto
   que aponta para cá; o conteúdo histórico integral foi preservado sem
   perdas em
   [`docs/archive/AGENTS-HISTORICO-2026-09-17.md`](../archive/AGENTS-HISTORICO-2026-09-17.md).
7. **Diagnóstico de base desta decisão**: em 2026-09-17, `origin/main`
   estava em `fe20832`. Esse hash é evidência datada, não um valor
   permanente — toda sessão deve reconfirmar com `git fetch` antes de
   editar (ver [`PROJECT_STATE.md`](PROJECT_STATE.md)). O diagnóstico
   também encontrou um commit (`fe20832`) posterior ao último estado
   documentado em `AGENTS.md`/`registro.md`, sem prompt/retorno associado
   — registrado como risco P0 em `PROJECT_STATE.md` e `TASKS.md`, não
   investigado nesta entrega (fora de escopo: só documentação).
8. **Cópias antigas do projeto e o `.git` órfão conhecido permanecem em
   quarentena lógica.** Nenhuma exclusão, movimentação, configuração ou
   reutilização foi autorizada nesta etapa — ver a lista completa em
   [`PROJECT_STATE.md`](PROJECT_STATE.md).

**Por quê**: o projeto já atravessou trocas de máquina, de IA e de sessão
sem um ponto único e curto de retomada — o contexto vivia espalhado entre
memória do usuário, `AGENTS.md` (que cresceu para 114 KB) e um registro de
diretoria de 1400+ linhas. Isso cria risco de uma sessão nova redescobrir
ou contradizer decisões já tomadas, ou pior, tratar uma cópia desatualizada
como se fosse o estado real do produto em produção.

**Como aplicar**: qualquer sessão nova lê `PROJECT_STATE.md` primeiro. Ao
tomar uma decisão durável (não uma tarefa, não um fato de estado), adicione
uma entrada aqui — não deixe decisões implícitas em conversas ou em commits
sem explicação.

---

## 2026-09-07 — Modelo diretoria/executiva

Convenção pré-existente, preservada aqui como referência (detalhamento
completo continua em
[`docs/diretoria/MODELO-DIRETORIA.md`](../diretoria/MODELO-DIRETORIA.md),
que não foi alterado por esta entrega): mudanças maiores são planejadas por
uma sessão de diretoria que escreve um prompt autocontido, e uma sessão
executiva separada implementa, verifica com as próprias ferramentas e
reporta objetivamente — sem mesclar em `main` sozinha, sem inventar escopo
novo.
