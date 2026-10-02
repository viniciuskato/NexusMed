# Plano de desenvolvimento do NexusMed

**Documento canônico.** Diz o que existe, o que está congelado e por quê
(desde a D-7, código só por defeito ou pedido da produção), e em que estado
está cada parte. Substitui a antiga sequência de prompts e os documentos por
iniciativa.

**Última revisão da diretoria:** 25/09/2026. **Revisão pela D-7:** 28/09/2026.
**Estado verificado no código:** 24/09/2026.

> **Desde a D-7 (28/09/2026), funcionalidade nova está congelada, salvo
> pedido da produção.** O código só conserta defeito (fila em issues `bug`,
> sessão de defeitos); as unidades abaixo dizem o que existe e o que está
> congelado. Seção 5 e `docs/operacao/DECISIONS.md`, D-7.

Como ler, conforme o que você procura:
- **Entender o plano:** seções 1 a 4.
- **O que vem agora:** seção 5 (fila de defeitos, meta e congeladas) e seção 6
  (decisões em aberto).
- **O detalhe de uma unidade:** seções 7 a 11, uma por frente.
- **O que já foi feito:** seção 13 (registro).

---

## 0. Como este documento funciona

> **D-8 (28/09) e D-9 (29/09):** onde esta seção fala de quem revisa, põe o
> rótulo, mescla, aplica migration ou abre sessões ("Quem atualiza o quê",
> "Como o código anda", "Como abrir a diretoria e a sessão de defeitos"),
> valem a D-8 e a D-9 (`docs/operacao/DECISIONS.md`): a sessão de defeitos é
> o subagente `dev-junior`; a revisão é do subagente `dev-revisor`, e a
> diretoria põe o rótulo depois do `APROVADO` dele; com o "aprovado" do dono
> a um plano, a diretoria aplica a migration no remoto e mescla o que o
> plano descreve.

### O que ele é

Um documento vivo com **unidades de implementação**. Cada unidade é uma
entrega com começo e fim, que uma sessão de execução consegue fazer num PR (ou
numa sequência curta de PRs) e que a pessoa consegue verificar olhando a tela.

A unidade diz **o quê** e **por quê**, com critério de aceite observável. O
**como** (arquivos, SQL, ordem dos passos) é derivado por quem executa, lendo o
código naquele momento — é isso que impede o plano de envelhecer.

### Formato de uma unidade

- **Por quê** — o problema de quem estuda ou de quem produz.
- **Aceite** — o comportamento que a pessoa vê na tela. É o que define
  "pronto".
- **Restrições e armadilhas conhecidas** — decisões e riscos que valem, com
  *onde conferir* no código em vez de copiar código.
- **Fora de escopo**, **Depende de**, **Estado**.

A unidade **não** contém nome de arquivo como instrução, SQL, comando, hash,
branch nem passo a passo.

### Estados

| Estado | Significa |
|---|---|
| Planejada | Definida, mas falta dependência ou decisão |
| Pronta | Definida e sem dependência pendente. Desde a D-7, só é encaminhada por pedido da produção |
| Em execução | Uma sessão de execução está trabalhando nela |
| Em PR | Implementada, esperando revisão e merge |
| Concluída | Mesclada em `main`; a coluna "publicado" do registro diz se já está em produção |
| Descartada | Não será feita; o motivo fica registrado |
| Congelada | D-7: não se constrói; só volta por pedido da produção (seção 5) |

### Quem atualiza o quê

| Quem | Quando | O que muda aqui |
|---|---|---|
| **Diretoria** | Em lote, no PR de documentação da semana (D-7) | Registra unidade nova só para um pedido da produção aprovado pelo dono; descarta unidades; nunca muda o aceite de unidade concluída; atualiza a seção 5 conforme as decisões do dono; registra e resolve decisões em aberto (seção 6); atualiza "Onde o sistema está" (seção 2), a linha "Estado" das unidades e o registro (seção 13). Toda decisão durável também vai para `docs/operacao/DECISIONS.md`. |
| **Sessão de defeitos** | — | Nada aqui (D-7): conserta pela fila de issues; o registro é da diretoria. |
| **Revisão** | Antes do merge, por quem não escreveu o PR | Nada aqui — comenta o PR. |
| **Dono do produto** | Quando quiser | Lê, decide (seção 6), aplica migration no remoto, mescla e faz as pendências que só ele pode fazer (seção 11). |

### Como o código anda (D-7)

Nenhuma unidade é encaminhada, salvo por pedido da produção. O código vem da
fila de defeitos (issues `bug` com gravidade, seção 5) e, com o "sim" do
dono, de um pedido da produção: a sessão de defeitos conserta com teste e
abre o PR → a diretoria revisa e põe o rótulo → o dono aplica a migration,
se houver, e mescla.
Protocolo: `docs/operacao/EXECUTOR_PROTOCOL.md`.

### Como abrir a diretoria e a sessão de defeitos

**Desde a D-8 (28/09), numa janela só:** toda janela do Claude Code no
computador do dono já abre como a diretoria (agente `dev-senior`), sem colar
linha nenhuma, e a sessão de defeitos não se abre mais: é o subagente
`dev-junior`, chamado pela diretoria. O texto abaixo fica como histórico da
D-7.

Os textos de abertura ficam em `docs/conteúdos/colar-no-claude/`, pasta local
que o git ignora (D-5): existem só no computador do dono, e a diretoria os
mantém sem PR. Por isso eles não concedem autorização: a da sessão de
defeitos está na linha que o dono cola; a da diretoria, no "sim" do dono à
pergunta da primeira rodada (D-7, item 8). Cada sessão é aberta no Claude
Code, na pasta do NexusMed, com o modelo mais capaz, colando uma linha (a
mesma do `docs/conteúdos/LEIA-ME.md`, "Janelas do Claude"):
- **Diretoria nova:** `Leia docs/conteúdos/colar-no-claude/abrir-diretoria.txt e siga, pulando a parte "Só hoje".`
  Uma janela só; toda segunda (ou quando o contexto encher), o dono fecha a
  antiga e abre uma nova.
- **Sessão de defeitos:** `Leia docs/conteúdos/colar-no-claude/abrir-defeitos.txt e siga. Até 09/10 eu autorizo: criar e usar o worktree .claude/worktrees/defeitos, usar o worktree .claude/worktrees/trilha-1 para o #93, push de branch, abrir PR, Docker e Supabase local, mandar mensagem à diretoria, comentar revisão e pôr o rótulo revisado no PR da diretoria que você revisar sem achado bloqueante. Nunca: merge, aplicar migration, escrever no Supabase remoto ou na Vercel.`

A sessão de materiais é o Gem "Redator NexusMed", no Gemini; os passos estão
em `docs/conteúdos/LEIA-ME.md` (local). As trilhas (23 a 28/09) não se abrem
mais.

### Relação com os outros documentos

| Documento | Papel |
|---|---|
| Este plano | O que existe, o que está congelado e por quê, e em que estado |
| `docs/operacao/DECISIONS.md` | Por que cada decisão durável foi tomada (log) |
| `docs/diretoria/BACKLOG-ESTRATEGICO.md` | Achados da auditoria, com o detalhe técnico de cada um (AUD-nn). A unidade que resolve cada achado mora aqui |
| `docs/operacao/TASKS.md` | Fila operacional: incidentes e pendências avulsas. Não repete as unidades deste plano |
| Issues do GitHub com o rótulo `bug` | Fila de defeitos (D-7), mantida pela diretoria (seção 5) |
| `docs/operacao/PROJECT_STATE.md` | Estado dos ambientes (produção, Supabase, CI) |
| `docs/operacao/EXECUTOR_PROTOCOL.md`, `RUNBOOK.md`, `AGENTS.md` | Como executar com segurança |
| `docs/editorial/PADRAO-NEXUSMED-CONTEUDOS.md`, `-QUESTOES.md` | Como produzir conteúdo |
| `docs/editorial/PLANO-ANTIMICROBIANOS.md` | Plano da produção editorial em andamento |

---

## 1. O que estamos construindo

O NexusMed é um **banco de materiais a serviço de um ciclo de estudo**. A
estrutura existe para o estudo, nunca para si mesma. O ciclo, nas palavras do
dono do produto:

1. **"Quero estudar tal assunto."** Encontro o material.
2. **Leio e aprofundo até onde acho necessário.**
3. **Com base no que li nesta sessão, faço questões** para testar o que
   entendi — inclusive questões que cruzam mais de um material.
4. **O que errei vira flashcard.**
5. **Todo dia entro e faço os flashcards do dia**, com a plataforma
   controlando a periodicidade.

Em uso real por um grupo fechado; produção de verdade, não protótipo.

**Escopo:** todo o conhecimento médico, construído por partes — um ramo de
cada vez, com um piloto (hoje, os β-lactâmicos) validando a forma antes de
escalar. A ordem dos ramos é da produção editorial (seção 12).

**Princípios** — valem para toda unidade:
- **Simples e óbvio.** Cada passo do ciclo tem um clique claro a partir do
  anterior.
- **O que o estudante faz não se perde.** Resposta, nota, anotação e progresso
  sobrevivem a rede ruim, clique duplo e troca de aparelho.
- **Conteúdo médico só vai ao ar revisado.** Nada é publicado sem revisão
  humana atestada, e a atestação sempre corresponde ao que o estudante lê.
- **Produzir é importar.** Material e questões entram por arquivo, escritos
  com ajuda de IA a partir de um padrão autocontido.
- **O banco cresce sem duplicar e sem envelhecer.** Um material mora num
  lugar; o padrão tem versão; atualizar é barato.
- **A plataforma é a fonte da verdade.** Arquivos locais são só formato de
  troca.

## 2. Onde o sistema está (verificado em 24/09/2026)

### O ciclo de estudo

| Passo | Estado |
|---|---|
| 1. Encontrar | Parcial. Biblioteca e árvore funcionam. A busca (Ctrl+K) procura a frase exata, diferencia acento e letra grega, não ordena por relevância, não mostra trecho nem abre na seção. |
| 2. Ler e aprofundar | Pronto. Caminho de navegação no topo e "Aprofunde-se" (filhos) no fim. |
| 3. Testar o que li | **Não existe.** "Resolver questões" pega o tema inteiro; só 9 de 420 questões têm vínculo com material; a questão aceita um material só. |
| 4. Erro vira flashcard | Pronto — automático ao errar. |
| 5. Cards do dia | Pronto — repetição espaçada e contagem de vencidos existem; falta uma entrada única e óbvia. |

### Produção de conteúdo

- **Pronto:** importação de material (`.md` e `.yaml`) já posicionada na
  árvore; importação de questões em lote; revisão e atestação obrigatórias;
  publicação de cima para baixo na árvore; "Salvar" sem mudança não altera
  nada; padrão de conteúdos v2, autocontido, que pode ser entregue a uma IA.
- **Falta:** o formulário ainda pede campos que não servem ao estudo; um
  material só aparece numa disciplina; não há como exportar um material nem
  atualizá-lo a partir de arquivo; nada aponta quais materiais estão fora do
  padrão.

### Confiabilidade

Em 24/09 foram publicadas as correções do tempo esgotado no simulado, do
corte em 1000 linhas, da revisão que atestava o item errado e a 45-A inteira:
clique duplo não duplica mais resposta, revisão de flashcard nem simulado; com
rede lenta a tela mostra "correção pendente" em vez de contar a resposta como
errada; a nota do simulado é calculada no servidor. Seguem **21 achados
abertos** da auditoria. Os mais graves:
- excluir um material apaga dados de todos os alunos e a trilha de
  atestação;
- editar material publicado muda na hora o que o estudante lê, sem revisão;
- com a rede oscilando, uma edição antiga pode sobrescrever a nova;
- um PR com migration pode ser mesclado sem ela estar no remoto — aconteceu
  três vezes, em 21/09, 24/09 e na noite de 24/09 (INC-2026-003 a
  INC-2026-005; na última, a busca ficou fora do ar até a manhã seguinte); a
  46-E fecha isso.

### Base técnica

React 19 + Vite + TypeScript estrito; Supabase (Postgres com RLS, RPCs,
testes pgTAP); testes unitários, de componente e E2E (Playwright contra
Supabase local); CI com dois checks obrigatórios; deploy automático a cada
merge em `main`. O componente raiz do app segue com cerca de 970 linhas, sem
roteador — o plano de decomposição (46-A) não começou.

## 3. Decisões de modelo em vigor

O porquê de cada uma está em `docs/operacao/DECISIONS.md`, na data indicada.

**Estudo**
- **A árvore fica.** Pai → filhos é o "aprofundar até onde achar
  necessário". Um pai por material, filhos em ordem. *(22/09 e 23/09)*
- **Ligações cadastradas entre materiais congelam.** "Estude antes", "Veja
  também" e "tipo do nó" saem do formulário e da importação; o que existe
  continua visível; nada é apagado. *(23/09)*
- **A conexão que importa é questão ↔ materiais.** Uma questão cobra um ou
  vários materiais; daí saem o "testar o que li", as questões entre
  materiais e, se fizer falta, um "Veja também" calculado. *(23/09)*
- **Busca no banco, como em base de artigos científicos.** *(23/09)*
- **Sem leitura offline, por ora.** Sem rede, a tela diz "sem conexão";
  responder, anotar e marcar leitura offline continuam funcionando e sobem
  quando a rede volta. Pode voltar como unidade própria se o uso pedir.
  *(23/09, D-2)*

**Base de materiais**
- **Cobertura: todo o conhecimento médico, por partes.** Um ramo de cada
  vez; a ordem é da produção editorial. *(23/09)*
- **Casa:** cada material tem uma disciplina-casa, a do ramo inteiro — o
  material mora onde o conceito é definido (fármaco em Farmacologia).
  *(23/09)*
- **"Também aparece em":** um ramo pode ser mostrado em outras disciplinas,
  sem cópia. *(23/09)*
- **Padrão versionado:** aparência se resolve no leitor; formato, no
  importador; só mudança editorial exige reescrever — apontada por checagem
  e feita por arquivo, sobre o mesmo material. *(23/09)*
- **O texto do material não cita a estrutura.** *(23/09)*

**Garantia editorial**
- **O hash de atestação cobre o que o revisor lê**, não como o item é
  alcançado: posição na árvore, rótulo curto e "também aparece em" ficam
  fora. *(23/09)*
- **"Salvar" sem mudança é no-op.** *(23/09)*
- **Editar material publicado gera um rascunho à parte.** O estudante
  continua lendo a versão atestada, por todos os caminhos, até a edição ser
  atestada; aí ela entra de uma vez. O que fica fora do hash (posição,
  ordem, rótulo curto, "também aparece em") vale na hora, sem rascunho.
  *(23/09, D-1)*

**Processo**
- **Toda mudança entra por PR com CI verde**; merge em `main` é deploy.
  *(18/09)*
- **Unidades com aceite, não prompts.** *(23/09)*
- **Decomposição do componente raiz em duas janelas:** passos 1 a 4 antes
  das telas novas do ciclo; passos 5 a 12 depois da 45-G. *(23/09, D-3)*
- ~~**Execução em trilhas por área do código**, com o modelo mais capaz, uma
  unidade por PR e revisão em sessão nova antes do merge. Diretoria sob
  demanda, não por unidade.~~ *(23/09; revista pela D-7)*
- **Conteúdo é o produto:** diretoria (a única janela do dono), sessão de
  defeitos (o único código de produto: conserta, não constrói) e sessão de
  materiais (o Gemini). Funcionalidade nova congelada, salvo pedido da
  produção; revisão por quem não escreveu, antes do merge. *(28/09, D-7)*
- **Migration vai para o Supabase remoto antes do merge**, e a produção
  continua funcionando com ela. O CI passa a conferir isso no remoto, com
  credencial só de leitura (46-E). *(24/09, D-4)*
- **Sistema e conteúdo evoluem em paralelo.** O conteúdo é operado pelo dono,
  com o Gemini como redator; a interface entre as frentes é o padrão e o
  arquivo `.md` — o Gemini não opera no repositório. Fluxo e regras na seção
  12. *(24/09, D-5; desde a D-7, o sistema é a sessão de defeitos, e a
  diretoria é a mesa editorial)*

## 4. As frentes

| Frente | Objetivo | Unidades |
|---|---|---|
| **43 — Ciclo de estudo** | O estudante percorre os cinco passos com um clique cada | 43-A a 43-E |
| **44 — Base de materiais** | O banco cresce sem duplicar nem envelhecer | 44-A, 44-B, 44-C1, 44-C2 |
| **45 — Confiabilidade** | O que o estudante faz não se perde; a atestação é sempre do item certo | 45-A a 45-K |
| **46 — Base técnica e operação** | Código mais barato de mudar; backup e rollback | 46-A a 46-E |
| **Pendências do dono** | O que só a conta dona do projeto consegue fazer | P-1, P-2 e P-4 |
| **Produção editorial** | Conteúdo, não código — frente paralela, operada pelo dono com o Gemini (D-5); acompanhada aqui para a ordem fazer sentido | seção 12 |

A numeração continua a sequência histórica de entregas (40, 41, 42…) e não
muda quando a ordem muda.

## 5. Sequência (D-7, desde 28/09/2026)

**Critério.** Conteúdo é o produto; o código é ferramenta. Funcionalidade
nova está congelada. O código só termina o que está em voo e não congela,
conserta defeito e atende pedido da produção aprovado pelo dono. Decisão
completa: `docs/operacao/DECISIONS.md`, D-7.

**Meta.** Materiais 01 a 03 do piloto (seção 12) publicados, com questões
ligadas, e o "Testar o que li" (43-C) no ar até 02/10; 04 a 07 até 09/10.
Nunca encurtar a atestação para bater data: se não couber, passa para a
semana seguinte.

**Em voo, sem congelar:** 43-C (#96, a meta); 45-G (#93, conserta defeito);
46-E (#98, prevenção de incidente). A 45-K (#97) fica em rascunho, sem
aplicar a migration. Até 02/10, nada mexe em importar, atestar, publicar ou
ligar questão, salvo o #96, o #93 e defeito `grave` nesse caminho; nenhuma
atualização de dependência de produção.

**Fila de defeitos.** Issues do GitHub com o rótulo `bug` e um de gravidade,
mantidas pela diretoria; a sessão de defeitos conserta uma por vez
(`EXECUTOR_PROTOCOL.md`).
- **Defeito** é comportamento de hoje (no `main`, em produção ou num PR em
  voo) que contradiz o texto que a tela mostra hoje, o aceite de uma unidade
  já concluída, a política de privacidade ou os termos publicados, ou uma
  regra de segurança escrita (riscos numerados do `AGENTS.md`, regras de
  segurança dos protocolos) — e que dá um teste que falha antes do conserto.
  Também: CI do `main` vermelho; prevenção que o registro de um incidente
  lista como pendente; falha de segurança em dependência de produção. Não
  contam como promessa: princípio ou "Por quê" deste plano, "a plataforma vai
  ganhar" do padrão, decisão cujo mecanismo está numa unidade congelada. O
  aceite vale como estava quando a unidade foi concluída; risco numerado
  novo só vale como promessa depois do "sim" do dono.
- Toda issue traz: "Hoje, quando [quem] faz [o quê], acontece [X]. Deveria
  acontecer [Y], como promete [onde]." O repositório é público: issue e PR
  nunca levam dado de estudante (nome, e-mail, id, resposta, saída de
  consulta com linhas) nem valor de `.env`; defeito de segurança ou
  privacidade ainda aberto vai sem o passo a passo de exploração (o detalhe
  segue por mensagem entre as sessões).
- **`grave`** — dado do estudante (perde, grava errado, mostra de outro);
  segurança ou privacidade; produção quebrada ou em risco: entra direto.
  **`menor`** — promessa quebrada sem dano; cosmético: vai à lista do
  "semana" e só entra com o "sim" do dono. A diretoria só abre a issue
  `menor` depois desse "sim"; até lá, o defeito fica só na lista do
  "semana".
- No máximo 5 issues `bug` abertas; acima disso, só entra `grave`. Na mesma
  faixa, primeiro o que está no caminho da produção (importar, checar,
  atestar, publicar, ligar questão, corrigir material).
- **Evolução** (congelada): tela ou fluxo novo; "funciona, mas ficaria
  melhor"; refatoração; desempenho sem sintoma medido; dependência major sem
  falha; teste que falta sem defeito.
- **PR do Dependabot:** major fecha com o comentário "congelada pela D-7
  (46-B)", salvo falha de segurança, que é defeito; minor e patch vão à
  lista do "semana", e o dono aprova ou fecha (dependência de produção, só
  depois de 02/10).

**Pedido da produção** (rótulo `pedido-da-producao`) — a única porta para
evolução. Gatilho, com evidência: (a) a produção de materiais travou — um
passo não se faz, ou só se faz violando uma regra de qualidade; (b) um
contorno manual custa ao dono mais de 30 minutos por semana, medido em dois
materiais; (c) um estudante relatou ter sido prejudicado. A diretoria propõe
em até 5 linhas (o que travou, o custo, o aceite, o tamanho); o dono diz
"sim"; cabe em 1 PR; executa a sessão de defeitos; 1 aberto por vez. A
issue traz a evidência do gatilho — (a) o material e o passo que travou;
(b) os minutos que o dono informou em cada um dos dois materiais; (c) o
relato do estudante, sem dado dele — e a data do "sim" do dono. Unidade
congelada não volta em pedaços: o pedido inteiro cabe em 1 PR, e um pedido
novo precisa de evidência nova.

**Congeladas** — linha "Estado": "Congelada (D-7, 28/09)".

| Unidade | Como volta |
|---|---|
| 45-K (#97, em rascunho) | Pedido da produção, com um de dois gatilhos: erro de fato ou dose em material publicado que ficou mais de 1 dia no ar sem atestação; ou 3 ou mais correções de material publicado em 2 semanas. Até lá, erro de fato ou dose em publicado é corrigido no mesmo dia pelo formulário e reatestado em seguida |
| 44-A, 44-B, 44-C2, 43-E, 46-A, 46-D | Pedido da produção |
| 46-B, só as majors que faltam (TypeScript e ESLint) | Pedido da produção, ou falha de segurança (aí é defeito) |
| 45-H, salvo AUD-31.1 e AUD-07 | Pedido da produção. AUD-31.1 e AUD-07 viram defeito `grave` (issues) |
| 45-I, salvo a parte LGPD (AUD-30.3 e 30.4) | Pedido da produção. A parte LGPD vira defeito `grave` (issue) |

**Sem lista:** a 45-F não congela inteira nem entra inteira — cada item dela
que passar pela fronteira vira issue (a diretoria classifica). A 46-C
(backup com restauração ensaiada) não é decidida aqui: continua esperando a
P-2; quando o dono resolver a P-2, a diretoria pergunta a ele se ela entra
como prevenção de perda de dado ou só por pedido da produção.

O Supabase local continua um só para todas as worktrees: banco de teste,
pgTAP e E2E com a trava de `EXECUTOR_PROTOCOL.md`. Migration com data
anterior à última do remoto: `RUNBOOK.md`, seção 3. A sequência por trilhas
(23 a 28/09) está no histórico deste arquivo e na D-6.

## 6. Decisões em aberto

Cada uma bloqueia unidades. A diretoria recomenda; o dono decide. Resolvida,
vira entrada em `DECISIONS.md` e sai daqui. A numeração continua (a próxima é
D-10; da D-6, de 25/09, à D-9, de 29/09, estão em `DECISIONS.md`).

**Nenhuma em aberto.** D-1 (editar material publicado → rascunho à parte), D-2
(leitura offline → não, por ora) e D-3 (46-A em duas janelas) foram decididas
pelo dono em 23/09, todas conforme a recomendação; estão na seção 3 e em
`DECISIONS.md`. D-4 (o CI confere se a migration está no remoto antes do
merge, com credencial só de leitura) foi levantada e decidida em 24/09 → 46-E.
D-5 (conteúdo em paralelo, com o Gemini como redator) foi decidida pelo dono em
24/09 → seção 12 e 44-C1.

---

## 7. Frente 43 — Ciclo de estudo

### 43-A — Formulário do material mais curto

**Por quê.** Classificar um material hoje exige nove decisões (disciplina,
tema, tags, pai, ordem, rótulo curto, tipo, "Estude antes", "Veja também"). Três
delas não servem ao estudo, e duas têm resposta óbvia que a plataforma sabe
dar sozinha.

**Aceite — quem produz vê:**
- No formulário de edição **e** no modal "Importar material", **não aparecem**
  mais "Tipo do nó", "Estude antes" e "Veja também".
- Ao escolher um pai, **disciplina e tema passam a ser os do pai** (tema ainda
  pode ser trocado). A lista de pais permite achar material de qualquer
  disciplina. Sem pai (raiz), disciplina e tema são escolhidos como hoje.
- Ao escolher um pai sem mexer na ordem, o material vai **para o fim** dos
  irmãos. A ordem continua editável, mas não é mais uma decisão obrigatória.
- O campo de tags passa a se chamar **"Palavras-chave (sinônimos, siglas,
  nomes comerciais)"**; na importação `.md`, um bloco `### Palavras-chave` é
  aceito como equivalente de `### Tags`.
- O padrão de conteúdos descreve o formulário novo. Ele já manda **não
  preencher** os três campos congelados (seção 2.2) e já trata tags como
  palavras-chave (1.6); basta tirar o aviso de "vão sair da tela" e
  descrever o pai que define disciplina e tema. O padrão é autocontido — sem
  caminho de arquivo, nome de função ou jargão interno (AGENTS.md, risco 19).

**Restrições.**
- **Congelar não é apagar.** Um material que já tem "Estude antes", "Veja
  também" ou tipo do nó, aberto e salvo sem mudança, mantém tudo isso intacto.
  A garantia de ida e volta sem perda do formulário precisa cobrir esses
  campos.
- Nada nesta unidade pode mudar o hash de atestação de material já aprovado.
- O estudante continua vendo as caixas "Estude antes"/"Veja também" dos
  vínculos que já existem.

**Fora de escopo.** Busca, questões, tela inicial.
**Depende de.** 45-B (mesma Área Editorial; pequena).
**Achados da execução.** Disciplina e tema entram no hash de atestação. Por
decisão do dono (24/09), na edição de um material que já existe um pai da
mesma disciplina não muda o tema, e um pai de outra disciplina leva disciplina
e tema, com aviso de que a atestação cai; em material novo e na importação, o
pai define os dois (registrar em `DECISIONS.md`). Bugs antigos, fora do
escopo: tempo de leitura desconhecido aparece como 0 num campo de mínimo 1, e
o navegador recusa salvar o material sem mudar o tempo — o que muda o hash
(provado no E2E); trocar a disciplina à mão não troca o tema, e a gravação
pela edição, ao contrário da importação, não confere se o tema é da
disciplina (lido no código). Com as ligações congeladas, nada as remove pela
tela: o aviso de exclusão bloqueada por "Estude antes" manda remover uma
ligação que ninguém consegue remover (olhar na 45-D), e um "Estude antes"
antigo impede pôr o material abaixo do alvo dele (o formulário avisa). O
seletor de vários materiais das ligações ficou sem uso; a 43-B pode
reaproveitá-lo.
**Estado.** Concluída — PR #79.

---

### 43-B — Questão cobre um ou vários materiais

**Por quê.** É a base do "testar o que li" e das questões entre materiais.
Hoje a questão aceita um material só, a importação de questões não aceita
nenhum, e só 9 de 420 questões estão ligadas. Chegar tarde significa produzir
questões sem vínculo e ter de revisitá-las depois.

**Aceite — quem produz vê:**
- Uma questão pode cobrar **um ou vários** materiais (seção opcional por
  material), escolhidos por busca e clique — nunca por título digitado.
- No modal "Importar questões", um campo **"Materiais cobrados por este
  lote"** vale para todas as questões do arquivo. Ajuste por questão, depois,
  pela edição do vínculo.
- Os 9 vínculos existentes continuam valendo.
- O padrão de conteúdos (seção 2.6) deixa de dizer "um material por questão"
  e passa a descrever a escolha no lote.

**Aceite — o estudante vê:**
- "Resolver questões" a partir de um material traz as questões que cobram
  aquele material. Questões sem vínculo continuam acessíveis por tema e em
  simulados.

**Restrições e armadilhas conhecidas.**
- **O hash de atestação da questão inclui o vínculo com material** (conferir
  na função que monta o snapshot da questão). Mudar onde o vínculo mora não
  pode invalidar questão aprovada — mesma decisão tomada para materiais: o
  hash cobre o que o revisor lê, não como o item é alcançado. Decidir e
  registrar antes de migrar.
- O vínculo atual é lido em vários lugares (packs do Estudo Temático, caderno
  de erros, flashcards, leitor, Área Editorial). Levantar todos antes de
  trocar.
- Tabela nova em `public` exige `revoke ... from anon`; RPC nova exige `revoke
  ... from public, anon` (AGENTS.md, riscos 13 e 14).
- Migration aplicada no remoto **antes** do merge.

**Fora de escopo.** A tela "Testar o que li" (43-C). Vincular em massa as 420
questões antigas (tarefa editorial; sugestão automática pode vir depois).
**Depende de.** 43-A.
**Estado.** Concluída — PR #94.
**Achados da execução.** Decisão registrada (migration e PR): o vínculo mora em `question_materials`, fora do hash de atestação — mesma regra dos materiais; `app.build_question_snapshot` não mudou e as colunas antigas `questions.material_id`/`material_section_id` ficam congeladas só como registro, então nenhuma aprovação muda. Consequência: o vínculo passa a ser ajustável com a questão publicada (o E2E do 21-D que provava o bloqueio foi reescrito). O botão "Resolver questões" do leitor abre as questões do material e cai no tema quando nenhuma o cobra; o "Resolver Questões deste Tema" do fim do material continua por tema. Isso tocou `App.tsx` (área da trilha 3, pausada). Material cobrado por questões não é excluído (entrou na guarda da 45-D). O formulário de questão nova vinculava sozinho ao primeiro material da disciplina (ou a um id inválido); o palpite saiu. O #94 foi mesclado antes da triagem da revisão; as 8 correções vieram em PR próprio, com o SQL em migration nova (`20260927130000`). Revisão do PR #94, adiado por triagem da diretoria: a lista de questões do Admin recalcula os materiais de cada questão com busca linear no catálogo a cada render (custo cresce com questões × vínculos × materiais).

---

### 43-C — "Testar o que li"

**Por quê.** É o passo 3 do ciclo, o único que não existe.

**Aceite — o estudante vê:**
- Um botão **"Testar o que li"** no leitor e na tela inicial.
- Ele mostra os materiais lidos **hoje**, cada um marcado, e o estudante pode
  desmarcar algum. O número de questões disponíveis aparece antes de começar.
- Entram as questões que cobram materiais marcados. **Questão que cobra vários
  materiais só entra se todos estiverem marcados** — é assim que as questões
  entre materiais aparecem naturalmente, quando o estudante leu tudo que elas
  exigem.
- Errar gera flashcard, como já acontece hoje.
- Sem questões para os materiais lidos, a tela diz isso claramente e oferece
  "Resolver questões do tema".

**Restrições.** "Lido" usa o progresso de leitura que já existe (seções lidas,
data da última leitura). "Hoje" segue o fuso do estudante. Sem tabela nova de
"sessão", a menos que se prove necessária.

**Fora de escopo.** Recomendação adaptativa, simulado cronometrado.
**Depende de.** 43-B. A D-6 (25/09) a antecipou para antes dos passos 1 a 4
da 46-A, que a D-3 preferia antes.
**Estado.** Concluída — PR #96.
**Achados da execução.** Sem migration: "lido hoje" é material com seção lida e `reading_progress.updated_at` no dia local; marcações ainda na fila contam como leitura de agora. A sessão é a lista de questões recortada pelos ids escolhidos (errar gera flashcard pelo caminho de sempre). O "Marcar lida" do leitor, no `main` de 27/09, volta a mostrar "Marcar lida" logo após o clique (relê o servidor antes de a fila subir) — a 45-G (#93) cobre. Adiados na triagem da revisão do #96: no modo local, sem Supabase, abrir o material conta como leitura (a produção usa Supabase); o recorte do "Testar" se perde ao recarregar a página — o estudante reabre pelo botão; entra quando a navegação guardar o recorte (46-A).

---

### 43-D — Busca como base de artigos científicos

**Por quê.** Passo 1 do ciclo. A busca atual falha no uso mais comum: várias
palavras, sem acento, sigla.

**Aceite — o estudante vê:**
- Várias palavras em qualquer ordem; aspas para frase exata.
- Sem diferença de acento, maiúscula ou letra grega: "betalactamico",
  "beta-lactâmico" e "β-lactâmicos" acham o mesmo material; "geracao" acha
  "geração"; um prefixo de 4+ letras ("cefalosp") já encontra.
- Palavras-chave (sinônimos, siglas, nomes comerciais) encontram o material.
- Ordem por relevância: título > palavras-chave > título de seção > texto.
- Cada resultado mostra título, **onde está na árvore**, trecho com os termos
  destacados e tempo de leitura. O clique abre **direto na seção** que casou.
- Filtros: disciplina; "só o que ainda não li".
- O estudante só encontra material publicado; o administrador encontra também
  rascunhos.

**Restrições e armadilhas conhecidas.**
- A busca roda no banco (busca textual do Postgres), não sobre o conteúdo
  baixado no navegador.
- O trecho destacado vem de texto escrito pelo admin: **nunca** renderizar
  como HTML cru. Usar marcadores próprios e montar o destaque no componente
  (AGENTS.md, risco 15).
- RPC nova: `revoke ... from public, anon`.
- Se a 44-A já estiver mesclada, o filtro de disciplina considera os ramos que
  aparecem naquela disciplina.
- O estudante nunca encontra a edição pendente de um material publicado
  (45-K) — só a versão atestada.
- Questões e flashcards na busca global continuam como estão.

**Fora de escopo.** Sinônimos em dicionário central (as palavras-chave de cada
material bastam por ora); busca dentro da biblioteca.
**Depende de.** Nada.
**Achados da execução.** Índice próprio fora da API, mantido por gatilhos, sem
tocar no snapshot de atestação; com 1.200 seções a busca responde em 5 a 190 ms.
Filtro de disciplina só pela casa (a 44-A precisa estendê-lo) e índice seguindo
as tabelas que o estudante lê (a 45-K precisa mantê-lo na versão atestada).
Corrigido de passagem: abrir o leitor numa seção voltava ao topo no quadro
seguinte.
**Estado.** Concluída — PR #80.

---

### 43-E — Tela "Hoje"

**Por quê.** O ciclo precisa de uma porta de entrada diária óbvia. As peças
existem, mas espalhadas.

**Aceite — o estudante vê, ao entrar:**
- **Continuar lendo** (último material, na seção onde parou).
- **Testar o que li** (se leu algo hoje sem testar).
- **N cards para hoje**, com um botão que abre a revisão.
- Com tudo feito no dia, a tela diz isso.

**Fora de escopo.** Metas, estatísticas novas, gamificação nova.
**Depende de.** 43-C.
**Estado.** Implementada na branch `feat/43e-tela-hoje`; PR ainda não aberto. Voltou à fila pela D-10 (29/09).

---

## 8. Frente 44 — Base de materiais

**Problema de origem (23/09).** Um assunto pertence a várias disciplinas
(antimicrobianos: Farmacologia e Infectologia), mas o material só pode estar
numa; e materiais feitos num padrão antigo ficam para trás, sem jeito de saber
quais nem de atualizá-los barato.

**Verificado no código em 23/09:** pai e filho precisam ter a mesma
disciplina e biblioteca e filtros usam só a do material; o padrão não tinha
versão; a importação confere regras só no arquivo que entra; importar título
repetido é bloqueado e não existe exportar nem atualizar por arquivo. O
salvamento já preserva o id das seções e casa referências por texto,
preservando vínculo com fonte curada — base pronta para a 44-B.

### 44-A — Casa e "também aparece em"

**Por quê.** Um ramo como Antibióticos serve a Farmacologia, Infectologia,
Pediatria e Terapia Intensiva. Hoje aparece numa só; a alternativa seria
copiar, e cópia diverge.

**Aceite — quem produz vê:**
- No formulário do material (e no cartão da Área Editorial), um campo
  **"Também aparece em"**: escolhe-se a disciplina e, nela, o tema sob o qual o
  ramo aparece — por clique, nunca por texto digitado.
- Um material de dentro de um ramo já marcado mostra **"Aparece também em
  Infectologia (herdado de Antibióticos — visão geral)"**, sem editar ali.
- A disciplina-casa continua sendo a do ramo; a regra "pai e filho na mesma
  disciplina" continua valendo.

**Aceite — o estudante vê:**
- Na biblioteca de Infectologia, o ramo inteiro aparece, com as mesmas
  páginas e o mesmo caminho de navegação.
- O filtro por disciplina (biblioteca, busca, Área Editorial) inclui os ramos
  que aparecem naquela disciplina.
- Progresso de leitura é um só: ler pela Infectologia conta como lido em
  qualquer lugar.
- Material em rascunho nunca aparece por esse caminho.

**Restrições e armadilhas conhecidas.**
- **Não entra no hash de atestação.**
- Marcar um ramo na própria casa, ou um ramo que já aparece naquela disciplina
  por um ancestral, é redundante: rejeitar com mensagem clara.
- Tabela nova em `public` exige `revoke ... from anon`; RPC nova exige `revoke
  ... from public, anon`.
- Se a 43-D já estiver mesclada, o filtro de disciplina dela passa a
  considerar os ramos marcados.
- Questões continuam com a disciplina delas.

**Fora de escopo.** Sugestão automática de onde um ramo deveria aparecer;
disciplina de questão derivada dos materiais que ela cobra.
**Depende de.** 43-A (mesmo formulário; é ela que faz o pai definir a
disciplina).
**Estado.** Planejada. Congelada (D-7, 28/09).

---

### 44-B — Exportar e atualizar a partir de arquivo

**Por quê.** É o caminho barato para trazer um material antigo ao padrão atual
e para dividir um material grande em vários, com ajuda de IA, sem perder nada
do que já está ligado a ele (posição, questões, progresso de leitura).

**Aceite — quem produz vê:**
- Em cada material, **"Exportar .md"**: baixa o arquivo no formato do padrão
  vigente (metadados, seções, Pontos-Chave, Pérola, Alerta, palavras-chave,
  referências). Reimportado sem mudança, produz exatamente o mesmo conteúdo.
- Em cada material, **"Atualizar a partir de arquivo"**: escolhe um `.md`, vê
  uma prévia do que muda (seções novas, alteradas e removidas; referências
  novas e removidas) e grava por cima do **mesmo** material.
- Continua igual depois de atualizar: posição na árvore, filhos, "também
  aparece em", progresso de leitura, questões ligadas ao material.
- Seções casadas pelo título mantêm as questões ligadas a elas. A prévia avisa
  quantas questões apontam para seções que vão sumir.
- Referências de texto idêntico mantêm o vínculo com fonte curada.
- Em material publicado, a atualização vira a edição pendente da 45-K: o
  estudante continua lendo a versão atestada até a nova ser atestada. Arquivo
  idêntico ao atual não muda nada — nem a atestação.
- O padrão de conteúdos (Parte 2, seção 2.7) troca o passo a passo manual de
  "atualizar um material antigo" e "dividir um material grande" pelos botões
  novos.

**Restrições e armadilhas conhecidas.**
- Casar seção por título normalizado (sem acento, sem maiúscula). Título
  mudado é seção nova — a prévia mostra. Sem heurística de similaridade.
- "Importar material" continua bloqueando título repetido. Atualizar é ação
  explícita sobre o material escolhido, nunca adivinhada pelo título.
- Exportador e importador andam juntos: o teste de ida e volta (exportar →
  importar → mesmo conteúdo) é o aceite automático, e qualquer mudança futura
  de formato mexe nos dois.
- "Salvar" sem mudança é no-op (AGENTS.md, risco 17).

**Fora de escopo.** Exportar em lote; histórico de versões do material;
editar o `.md` dentro da plataforma.
**Depende de.** 43-A e 45-K.
**Estado.** Planejada. Congelada (D-7, 28/09).

---

A antiga 44-C (versão do padrão e conformidade) foi dividida em 24/09 (D-5):
a checagem sobre o arquivo (44-C1) veio para a frente; o que depende da 44-B
ficou na 44-C2.

### 44-C1 — Checagem do padrão sobre o arquivo, antes de importar

**Origem.** D-5 (24/09): a produção de conteúdo começou em paralelo, com o
Gemini como redator. Primeira metade da antiga 44-C.

**Por quê.** Cada material chega de uma IA de fora e só uma pessoa atesta. Os
erros mecânicos do padrão não deveriam gastar a atenção de quem revisa, e hoje
nada os aponta antes da importação: o rascunho de IA dos β-lactâmicos tem 30
trechos em LaTeX, 3 citações com link quebrado, nenhuma linha de versão do
padrão — tudo aceito em silêncio ou visível só na tela depois de importado.

**Aceite — quem produz vê:**
- Com um comando sobre um arquivo `.md`, sem login nem Supabase, a lista de
  pendências do arquivo contra o padrão, cada uma com a seção e a linha onde
  está e o que corrigir. Arquivo sem pendências aparece como **"Conforme"**.
  Passando uma pasta, uma linha de resultado por arquivo.
- As pendências cobrem as regras mecânicas do padrão: citação sem link ou
  malformada (`[N]` solto, `(#ref-N]`); citação para referência inexistente;
  referência nunca citada; tabela sem frase de abertura citada; LaTeX;
  `<=`/`>=`; lista dentro de lista; subtítulo dentro de seção que não seja
  `####`; texto entre os metadados e a primeira seção (a importação
  descarta); mais de um bloco de Pontos-Chave, Pérola ou Alerta na mesma
  seção (a importação guarda só um); linha de versão do padrão ausente; tempo
  fora de 8–25 minutos; sem palavras-chave; título com numeração; texto que
  remete a outro material ("veja o material", "próximo módulo").
- Um arquivo que a importação recusaria aparece como erro, com a mesma
  mensagem que a importação daria.
- O jeito de rodar fica no RUNBOOK e na seção 12 deste plano — não no padrão,
  que é autocontido (AGENTS.md, risco 19).

**Restrições.**
- A checagem lê o arquivo pelo mesmo caminho da importação de material: o que
  ela aprova a importação aceita, e o que a importação recusa ela aponta.
  Conferir o importador e o leitor antes de escrever cada regra (AGENTS.md,
  risco 19).
- Uma lista só de regras, escrita para ser reusada pela 44-C2 sobre o conteúdo
  guardado — a 44-C2 não reescreve regra.
- Pendência orienta, não bloqueia nada. Não corrige o arquivo.
- Regras de julgamento (profundidade, o que cabe em cada nível) não viram
  checagem; ficam no checklist do padrão e na revisão.
- Cada regra com um teste que passa e um que falha; o exemplo do bloco de
  formato do padrão (seção 1.7) passa sem pendência.
- Aceite comprovado também sobre um arquivo real feito por IA, fornecido pelo
  dono, não só sobre os exemplos dos testes.

**Fora de escopo.** Selo, filtros e versão na Área Editorial (44-C2);
correção automática; nota de qualidade; checagem por IA.
**Depende de.** Nada.
**Estado.** Concluída — PR #85.
**Achados da execução.** O rascunho real dos β-lactâmicos também separa
citações por vírgula (`[1](#ref-1), [2](#ref-2)`) e usa `*` nos Pontos-Chave,
fora do que o padrão pede mas aceitos pela importação e pelo leitor; não viraram
regra (fora do aceite). Se a diretoria quiser, entram numa unidade futura.
Revisão do c11eb05, adiado por triagem da diretoria: `$5 a $10` lido como LaTeX; aviso impreciso com 3+ Pérolas/Alertas; e, para a 44-C2, regex repetidos do importador e do leitor (linha de metadado, citação, marcador de lista), arquivo lido duas vezes e regras de arquivo separadas das de conteúdo.

### 44-C2 — Versão do padrão e conformidade na Área Editorial

**Por quê.** Saber, a qualquer momento, quais materiais estão atrás do padrão
e o que falta em cada um — sem reler tudo. Quando o padrão ganhar uma regra
nova, ver na hora quais materiais ela afeta.

**Aceite — quem produz vê:**
- Cada material mostra a **versão do padrão** em que foi produzido. Material
  importado lê a linha `**Versão do padrão:**` do arquivo (o padrão pede essa
  linha desde a v2); material sem a linha aparece como "sem versão".
  Ajustável na revisão.
- No cartão do material, um selo **"Conforme"** ou **"N pendências"**, com a
  lista ao clicar. As pendências são as regras da 44-C1, aplicadas ao conteúdo
  guardado.
- Filtros na Área Editorial: **"Com pendências"** e **"Em versão antiga do
  padrão"**.
- A mesma lista de checagens roda na prévia da importação e da atualização por
  arquivo.

**Restrições.**
- Reusa as regras da 44-C1; nenhuma regra é reescrita.
- A checagem é calculada, não gravada: regra nova vale na hora para todos, sem
  mudar conteúdo nem hash de atestação.
- Pendência orienta, não bloqueia publicação — o gate continua sendo a
  atestação.
- Daqui em diante, toda regra mecânica nova no padrão vem com a checagem no
  mesmo PR (AGENTS.md, risco 19).

**Fora de escopo.** Correção automática; nota de qualidade; checagem por IA.
**Depende de.** 44-B e 44-C1.
**Estado.** Planejada. Congelada (D-7, 28/09).

### 44-D — Como escrever um material, dentro do site

**Origem.** Pedido do dono (29/09): o NexusMed deve mostrar a estrutura do
material, não só quem está por trás do sistema, e oferecer um prompt para
criar material no padrão e um revisor que diz se ele está apto a entrar.

**Aceite.** Todo usuário ativo abre, pelo menu, "Como escrever um material":
a Parte 1 do padrão, as Disciplinas e os Temas do catálogo e dois textos para
copiar (prompt de criação e prompt revisor), cada um com a Parte 1 junto. O
padrão e os prompts vivem num arquivo só cada, lidos pelo site sem cópia; um
teste reprova jargão interno neles.

**Fora de escopo.** Enviar material (44-E); IA chamada pelo próprio site.
**Depende de.** Nada.
**Estado.** Concluída — PR #100.

---

## 9. Frente 45 — Confiabilidade

**Origem.** Auditorias de 18/09 e 19/09 (`docs/diretoria/BACKLOG-ESTRATEGICO.md`).
Cada unidade aponta os achados (AUD-nn) que resolve; o detalhe técnico, a
reprodução e *onde olhar* estão no achado. Ao concluir, a execução muda o
estado do achado no backlog para "Concluído (unidade 45-X)".

**Regra da frente:** cada unidade traz o teste do próprio fluxo — de
preferência E2E — escrito para falhar antes da correção. As lacunas de teste
estão listadas na AUD-33, que não vira unidade própria.

### 45-A — Simulado e respostas que não se perdem

**Achados.** AUD-17 (crítico), AUD-18, AUD-20; parte da AUD-06 (nota
calculada no cliente).

**Por quê.** O estudante faz uma prova cronometrada inteira e, quando o tempo
acaba, nenhuma resposta é gravada e a nota fica 0. Com rede lenta, clica de
novo e duplica tentativas, revisões e estatísticas; e uma resposta certa pode
aparecer como errada e virar flashcard e caderno de erros indevidos.

**Aceite — o estudante vê:**
- No Modo Prova, quando o tempo acaba, todas as respostas marcadas são
  gravadas e a nota corresponde a elas.
- Clicar duas vezes em "Finalizar Prova", "Confirmar Resposta" ou na nota do
  flashcard registra uma vez só; o botão fica desativado enquanto grava.
- Com rede lenta ou sem rede, uma resposta nunca aparece como errada por falta
  de resposta do servidor: a tela mostra **"correção pendente"** e mostra o
  resultado quando o servidor responder. Nada vira flashcard ou caderno de
  erros antes disso.
- A nota do simulado é calculada no servidor a partir das tentativas gravadas.

**Restrições.**
- Cada ação precisa de um identificador estável, para o servidor reconhecer a
  repetição.
- Nota no servidor muda a gravação do simulado: migration no remoto antes do
  merge, com a produção funcionando nas duas versões.
- Existe uma correção antiga, nunca mesclada, de duplicação na criação de
  flashcards por repetição espaçada (`DECISIONS.md`, 2026-09-22; tarefa
  aberta em `TASKS.md`). Conferir antes de desenhar o identificador estável
  e propor ao dono o destino dela: aproveitar ou descartar com motivo.

**Fora de escopo.** Fila de sincronização em geral (45-E); leitura offline
(45-G).
**Depende de.** Nada.
**Achados da execução.** Parte 1 (tempo esgotado grava as respostas;
"Finalizar Prova" grava uma vez; falha ao gravar avisa e deixa tentar de
novo) feita só no simulado, sem migration. Parte 2: clique duplo em
"Confirmar Resposta" e na nota do flashcard com identificador estável,
"correção pendente" e nota no servidor. Por decisão do dono, a correção
antiga de flashcards foi reaproveitada conceitualmente, sem integrar a branch
obsoleta; ela fica preservada até o merge desta parte 2 e pode ser removida
depois. *(Diretoria, 24/09: removida; três correções menores que só existiam
nela foram para a 45-G e a 45-H — `DECISIONS.md`, 24/09. A migration da parte 2
foi aplicada no remoto cerca de 10 minutos depois do merge — INC-2026-004.)*
Revisão do #76, feita depois do merge, gerou quatro correções: falha
definitiva ao gravar resposta ou simulado aparece como falha, nunca como
"correção pendente" eterna; o rascunho do simulado só é apagado depois da nota
confirmada; revisão de flashcard feita offline num card que a reconciliação
removeu sobe para o card mantido (migration); reenviar uma operação já
sincronizada não trava mais na fila.
**Estado.** Parte 1 concluída — PR #74. Parte 2 concluída — PR #76.
Correções da revisão — PR #81.

---

### 45-B — A revisão atesta o item certo

**Achados.** AUD-23.

**Por quê.** Com o painel de revisão aberto num item, abrir a revisão de outro
troca o título, mas mantém status, claims e revisão do primeiro — "Aprovar"
atesta o item errado. A atestação humana é a garantia editorial do produto.

**Aceite — quem produz vê:**
- Abrir "Revisão" de outro item sempre mostra status, claims e revisão do
  item novo, nunca do anterior.
- O mesmo vale para o painel de referências.

**Restrições.** Teste de componente que troca de item com o painel aberto.
**Fora de escopo.** Qualquer mudança no fluxo de revisão.
**Depende de.** Nada.
**Estado.** Concluída — PR #71.

---

### 45-C — Leituras completas, sem corte em 1000 linhas

**Achados.** AUD-21.

**Por quê.** O banco devolve no máximo 1000 linhas por leitura. Um estudante
que faz 50 questões por dia passa disso em cerca de 3 semanas: questões
respondidas voltam como não respondidas, estatísticas e XP param, o caderno de
erros perde itens — sem nenhum erro na tela.

**Aceite — o estudante vê:**
- Com mais de 1000 tentativas, revisões ou itens no caderno de erros, tudo
  aparece: questões respondidas continuam respondidas, estatísticas e caderno
  completos.
- Onde a tela só precisa de números, eles vêm calculados no servidor, sem
  baixar a lista inteira.

**Restrições.** A leitura de questões já pagina e serve de modelo. O limite do
remoto não foi conferido (P-1): tratar como 1000. Teste com mais de 1000
linhas.
**Depende de.** Nada.
**Achados da execução.** As leituras completas resolvem a perda de dado da
AUD-21. Em 22/09 a produção tinha 836 seções de material: sem a correção, o
acervo cortaria para todos os estudantes ao passar de 1000. O segundo item do
aceite ("números calculados no servidor") é desempenho, não perda de dado, e
foi movido para a 46-D pela diretoria em 24/09.
**Estado.** Concluída — PR #73.

---

### 45-D — Material publicado protegido

**Achados.** AUD-22; AUD-24 na parte da URL da referência (a outra parte,
conteúdo publicado mudando sem revisão, é da 45-K).

**Por quê.** Um clique errado apaga, sem volta, anotações, favoritos e
progresso de todos os alunos no material, e a prova de quem o revisou. Salvar
um material publicado apaga seções (e as anotações nelas) sem checar nada.
Associar uma fonte curada sem URL apaga a URL da referência.

**Aceite — quem produz vê:**
- Excluir material publicado, ou com dado de aluno, é recusado com mensagem
  clara.
- A trilha de revisão e atestação nunca é apagada junto com o material.
- Associar referência a fonte curada sem URL mantém a URL original.

**Aceite — o estudante vê:**
- Anotações dele nunca são apagadas por uma edição. A anotação de uma seção
  que saiu do material continua aparecendo para ele no próprio material,
  indicada como de uma seção removida.

**Restrições.**
- Mesma lógica da guarda que já protege questões contra exclusão (conferir no
  banco).
- As ligações de navegação e a árvore entram na lista do que não pode ser
  apagado em cascata sem querer.
- "Salvar" sem mudança continua no-op.
- Até a 45-K, editar material publicado continua mudando o conteúdo na hora,
  como hoje — esta unidade não muda isso, só garante que nada de aluno se
  perde.
- Migration no remoto antes do merge.

**Fora de escopo.** Lixeira ou restauração de material excluído; a edição
pendente de material publicado (45-K).
**Depende de.** Nada.
**Estado.** Concluída — PR #92.
**Achados da execução.** Decisões do dono em 26/09: anotação de seção removida em linha própria (o app hoje só grava anotação do material, então isso protege dado vindo de outro caminho); material com trilha de revisão, ligações ou filhos também não é excluído (a trilha não pode existir sem o material, e as ligações estão congeladas). Bug anterior corrigido: desde a 43-A nenhuma exclusão de material pela Área Editorial funcionava (`clear_symmetric_material_links` sem permissão em `material_links`). Fica de fora: remover seção ainda apaga o histórico dela (`material_section_versions`), e excluir questão não publicada ainda apaga a trilha dela. Revisão do a4af38c, adiado por triagem da diretoria: o leitor faz uma segunda consulta a `notes` só para as anotações de seção removida; a dica de `material_links_target_fkey` ficou inalcançável pelo app (a guarda responde antes) e as FKs RESTRICT novas não têm dica.

---

### 45-E — Sincronização que não perde nem reordena

**Achados.** AUD-19, AUD-25, AUD-28.

**Por quê.** Com a rede oscilando, uma edição antiga pode sobrescrever a nova
em silêncio. Quem faz o que a tela pede ("faça login novamente") continua com
as respostas presas no aparelho. Responder offline e reabrir online pode
duplicar tentativas.

**Aceite — o estudante vê:**
- Uma anotação editada duas vezes com a rede oscilando termina sempre com o
  texto mais novo. O mesmo vale para favoritar e desfavoritar, marcar e
  desmarcar leitura, e reações.
- Depois de "faça login novamente", ao entrar de novo, tudo o que estava
  pendente sobe sozinho; o botão "tentar novamente" aparece sempre que há
  falha.
- Responder offline e reabrir online não duplica tentativas.

**Restrições.** Núcleo da sincronização: ler o risco 8 do AGENTS.md e
`docs/archive/SINCRONIZACAO-CONFIAVEL.md` antes de mexer. Reproduzir a AUD-28
antes de corrigir. Testes E2E de recarregar com operação pendente e de login
novamente com reenvio.
**Depende de.** 45-A (mesmo caminho de gravação de respostas) — concluída.
**Estado.** Concluída — PR #86.
**Achados da execução.** O envio e o enfileiramento da fila ficaram O(n²) no tamanho da fila (`findIndex`/`some` por operação); não pesa com a fila pequena do uso real — volta quando alguém medir fila longa (revisão do #86, item 9). `enqueueBefore` (recuperação legada de card antigo) ignora dependentes em `syncing`: se a recuperação rodar com o SRS do card em voo, a criação vai para o fim da fila e o SRS em backoff pode segurá-la — corrida de login rara; incluir `syncing` na busca resolve sem efeito colateral (observação da diretoria no #86).

---

### 45-F — Conta e sessão

**Achados.** AUD-01, AUD-26, AUD-27.

**Por quê.** "Esqueci a senha" manda e-mail, mas não deixa definir senha nova.
Uma falha momentânea ao ler o perfil (acontece a cada renovação de sessão)
manda o estudante ativo para "aguardando aprovação" no meio de um simulado.
Ao sair da conta, os dados do estudante continuam no navegador — ruim em
computador compartilhado de hospital.

**Aceite — o estudante vê:**
- O link do e-mail de "Esqueci a senha" abre uma tela para definir a senha
  nova, e ela funciona no login seguinte.
- Uma falha momentânea ao ler o perfil não tira o estudante ativo do app nem
  reinicia o simulado: a tela mantém o que tinha e oferece tentar de novo. Só
  quem nunca teve o perfil carregado vê "aguardando aprovação".
- Sair da conta apaga do aparelho respostas, anotações, fila e simulados do
  usuário.

**Restrições.** A trava de acesso continua negando por padrão (AGENTS.md,
risco 9). A URL de retorno do e-mail precisa ser liberada no painel do
Supabase (P-1).
**Depende de.** P-1, só para testar a senha nova em produção.
**Estado.** Pronta. D-7: não se encaminha como unidade; cada item que passar
pela fronteira vira issue (seção 5).

---

### 45-G — Sem rede, a tela avisa; com rede, o estado é o do servidor

**Achados.** AUD-05, AUD-29. Implementa a D-2 (sem leitura offline, por ora).

**Por quê.** A leitura vinda do servidor não preenche o cache local; offline,
as telas leem um cache vazio ou velho. Isso já causa bug online: num aparelho
novo, clicar na estrela preenchida para remover o favorito grava "favoritar".
A D-2 decidiu não sustentar leitura offline: sem rede, a tela avisa.

**Aceite — o estudante vê:**
- Favoritar e marcar leitura fazem exatamente o que a tela mostra, em
  qualquer aparelho, inclusive num aparelho novo.
- Sem rede, a tela que precisa buscar dado diz claramente **"sem conexão"** e
  carrega sozinha quando a rede volta. Nunca uma tela vazia ou desatualizada
  sem aviso.
- O que já estava na tela quando a rede caiu continua ali (o material aberto
  não some no meio da leitura).
- Responder, anotar, favoritar e marcar leitura sem rede continuam funcionando
  e sobem quando a rede volta, como hoje.
- No caderno de erros, a falha ao carregar o gabarito de uma questão não
  esconde o gabarito das outras. *(Correção que ficou numa branch antiga
  nunca mesclada — `DECISIONS.md`, 24/09.)*

**Restrições e armadilhas conhecidas.**
- A leitura deixa de cair numa cópia local quando o servidor falha; é isso que
  simplifica a camada de dados da 46-A (passos 5 a 12).
- A fila de gravação offline fica exatamente como está (é da 45-E). Ao limpar
  as cópias locais de leitura nos aparelhos dos alunos, nunca tocar nas
  gravações pendentes.
- Favoritar e marcar leitura enviam o estado desejado, nunca "inverter" a
  partir de cópia local (AUD-29).

**Depende de.** 45-C e 45-E (mesmos repositórios). A correção do favorito pode
sair antes, sozinha.
**Estado.** Concluída — PR #93.
**Achados da execução.** A trilha 1 fez a unidade inteira, inclusive a leitura de materiais e questões e o carregamento do `App.tsx` (decisão do dono, 27/09). As cópias locais de leitura não são apagadas nos aparelhos (a fila e a recuperação legada ainda as usam); só deixam de ser lidas com Supabase configurado — a limpeza fica para a 46-A. `ErrorNotebookView` e `CadernoErrosView` não são usados por nenhuma tela (o caderno real é o `IntegratedCadernoErros`) e receberam a mesma correção; removê-los fica para a 46-A, que decompõe o componente raiz (triagem da revisão do #93). A nova tentativa automática ficou num hook só (`useAutoRetry`) por causa do item 4 da revisão; o `QuestionCard` e os cadernos ainda montam o próprio status em vez de usar `useServerLoad` — também para a 46-A.

---

### 45-H — Endurecimento do banco e do front

**Achados.** AUD-31, AUD-06, AUD-32, AUD-08, AUD-07.

**Por quê.** Nada disso é explorável hoje, mas são armadilhas prontas: a
próxima função do banco que esquecer uma linha fica chamável sem login; o
estudante consegue alterar pela API a nota de um simulado fechado; e há
feedback falso para o admin (busca de fonte que quebra com parênteses,
atualização que não gravou nada aparecendo como sucesso).

**Aceite — verificável por quem opera:**
- Função nova no banco não nasce chamável sem login, e um teste automático
  reprova se nascer.
- O estudante não altera pela API nota ou conclusão de simulado fechado,
  percentual de leitura nem status de feedback. Campos de texto livre têm
  limite de tamanho.
- A busca de fonte com parênteses ("Harrison (21ª ed.)") encontra a fonte.
- Atualização que não atinge nenhuma linha aparece como erro.
- Build de produção sem as variáveis do Supabase falha, em vez de abrir o modo
  demonstração.
- O script antigo que usava a chave de serviço e imprimia conteúdo sai do
  repositório público.
- O teto de intervalo da repetição espaçada é igual no cliente e no servidor.
- Link começando com `//` não é tratado como interno; a política de conteúdo
  só libera o projeto Supabase do NexusMed.
- Um link para material inexistente ou despublicado mostra "material não
  encontrado"; nunca abre outro material no lugar.
- Um DOI no fim de frase vira link sem a pontuação final.

*(Os dois últimos itens são correções que ficaram numa branch antiga nunca
mesclada — `DECISIONS.md`, 24/09.)*

**Restrições.** Pode ser dividida em 2 ou 3 PRs. Migrations no remoto antes do
merge.
**Depende de.** 45-A (a nota no servidor sai de lá) — concluída.
**Estado.** Pronta. Congelada (D-7, 28/09), salvo AUD-31.1 e AUD-07, que viram
defeito `grave`.

---

### 45-I — Observabilidade e privacidade

**Achados.** AUD-30.

**Por quê.** Uma sincronização quebrada ou uma regra de acesso errada depois
de uma migration continuam invisíveis para o admin. A política de privacidade
promete apagar registros de erro em 90 dias, mas isso é manual, e ela não cita
tudo que é coletado (LGPD).

**Aceite:**
- Falhas de sincronização e leituras que caem no cache aparecem no registro de
  erros do admin.
- Um erro ocorrido sem sessão é enviado quando a sessão voltar.
- Registros de erro com mais de 90 dias são apagados automaticamente.
- A política de privacidade cita tudo que é coletado, usa a marca NexusMed e
  tem link no app.

**Depende de.** 45-E (as falhas de sincronização mudam de forma lá).
**Estado.** Planejada. Congelada (D-7, 28/09), salvo a parte LGPD (AUD-30.3 e
30.4), que vira defeito `grave`.

---

### 45-J — Plantão de Foco sobre o menu no celular

**Origem.** Achado ao testar a navegação da árvore (TASK-2026-09-23-02).

**Por quê.** Em telas de cerca de 390 px, o widget flutuante "Plantão de
Foco" cobre o primeiro item do menu inferior ("Biblioteca"), e o clique não
chega ao destino.

**Aceite — o estudante vê:** em tela estreita, nenhum item do menu inferior
fica coberto, e o widget continua acessível.
**Depende de.** Nada.
**Estado.** Concluída — PR #72.

---

### 45-K — Editar material publicado sem mudar o que o estudante lê

**Achados.** AUD-24, na parte do conteúdo publicado que muda sem revisão.
Implementa a D-1 (23/09).

**Por quê.** Hoje, salvar um material publicado muda na hora o que o
estudante lê, sem revisão humana — contradiz a garantia central do produto.
Despublicar para editar tiraria o material do ar durante a revisão. A decisão
foi a edição ficar à parte até ser atestada.

**Aceite — quem produz vê:**
- Salvar com mudança de conteúdo um material publicado guarda a edição **à
  parte**. Na Área Editorial, o material mostra "Edição pendente de atestação
  — os alunos leem a versão atestada".
- Reabrir o material mostra a edição pendente, que pode ser continuada,
  enviada à revisão ou **descartada** — descartar volta ao atestado, sem
  mudar nada.
- A revisão mostra a edição pendente. Aprovar faz a edição entrar de uma vez:
  o material continua publicado e atestado, sem nenhum momento em que o
  estudante leia algo não atestado.
- Mudança só no que fica fora do hash (posição na árvore, ordem, rótulo curto,
  "também aparece em") vale na hora, sem edição pendente.
- Material não publicado continua sendo editado direto, como hoje.

**Aceite — o estudante vê:**
- Enquanto há edição pendente, nada muda para ele: leitor, biblioteca, árvore
  e busca mostram a versão atestada.
- Quando a edição é atestada, ele passa a ver a versão nova. Anotações,
  favoritos e progresso continuam; as de seção removida, como na 45-D.

**Restrições e armadilhas conhecidas.**
- **Nenhum caminho de leitura do estudante pode mostrar a edição pendente** —
  leitor, biblioteca, árvore, "Aprofunde-se", busca (43-D), "também aparece
  em" (44-A). O desenho de menor superfície é a edição pendente morar fora das
  tabelas que o estudante lê; guardá-la nas mesmas tabelas obriga a ensinar
  cada caminho de leitura, inclusive os que ainda vão existir, a ignorá-la.
- Achado da diretoria (23/09): a tabela de versões de seção registra edições
  **já gravadas** (antes e depois, só para admin); não serve para guardar
  edição pendente. O snapshot que o revisor atesta já contém a versão
  atestada inteira, com os ids das seções. Conferir os dois no banco antes de
  criar tabela nova.
- O hash atestado da edição pendente tem de ser igual ao hash do material
  depois que ela entra. Um teste prova isso.
- Seção que continua na edição mantém o id; anotações e progresso dependem
  disso. O salvamento já preserva ids: manter.
- "Salvar" sem mudança continua no-op e não cria edição pendente
  (AGENTS.md, risco 17).
- Migration no remoto antes do merge; a produção continua funcionando com o
  front antigo enquanto o novo não sai.

**Fora de escopo.** Comparação lado a lado entre versões; mais de uma edição
pendente por material; histórico de versões; o mesmo mecanismo para questões
(questão publicada já é imutável).
**Depende de.** 45-D (mesma gravação do material; a proteção das anotações
vem de lá).
**Estado.** Planejada — pronta assim que a 45-D for mesclada. Congelada (D-7,
28/09): o #97 fica em rascunho, sem aplicar a migration.

---

## 10. Frente 46 — Base técnica e operação

### 46-A — Componente raiz em partes e roteador

**Achados.** AUD-04. Plano detalhado em 12 passos:
`docs/diretoria/PLANO-AUD-04-APP-TSX.md` (18/09).

**Por quê.** O componente raiz do app (cerca de 970 linhas) é roteador e
armazenamento de estado ao mesmo tempo; as respostas do estudante são
buscadas em vários lugares, com várias fontes de verdade; cada funcionalidade
nova mexe nele e aumenta o risco de regressão.

**Aceite — o estudante não vê nada mudar**, exceto:
- endereços e botão voltar continuam funcionando, e links diretos abrem a
  tela certa;
- a partir do passo 5, uma resposta dada atualiza todas as telas sem
  recarregar.

Cada passo do plano é um PR com o próprio teste; o plano diz quais.

**Restrições.** O plano foi escrito em 18/09: reconferir cada passo contra o
código atual (a árvore de materiais e a importação mudaram desde então).
- **O plano de 18/09 presume leitura offline, e a D-2 decidiu o contrário.**
  O passo 5 prevê que, sem rede, a leitura "resolve do local sem pausar", e
  traz um teste disso. Com a D-2 e a 45-G, sem rede a leitura sinaliza "sem
  conexão"; só a fila de gravação offline continua. Ajustar o passo 5 e o
  teste dele antes de executar.
**Depende de.** Passos 1–4: na trilha 3, antes da 43-C. Passos 5–12: passos
1–4 e 45-G, na janela própria da seção 5.
**Estado.** Planejada — nenhum dos 12 passos executado (conferido em 23/09).
Congelada (D-7, 28/09).

---

### 46-B — Dependências

**Achados.** AUD-14.

**Por quê.** Majors atrasadas acumulam custo de migração e risco de segurança.

**Aceite.** TypeScript e ESLint nas versões atuais, com todos os gates verdes.
**Restrições.** Seguir o padrão de atualização de dependências do repositório
(`docs/operacao/standards/atualizacao-dependencias.md`).
**Estado.** Em andamento — o Dependabot está ativo, e as majors das actions e
do pacote de ícones já foram mescladas; faltam TypeScript e ESLint.
Congelada (D-7, 28/09) nessas majors que faltam.

---

### 46-C — Backup e ensaio de restauração

**Achados.** AUD-13.

**Por quê.** O conteúdo curado e auditado é o principal ativo do produto, e não
há cópia fora do Supabase nem restauração ensaiada. Perder o projeto, ou uma
escrita errada em massa, não tem volta.

**Aceite.** Uma cópia semanal do banco guardada fora do Supabase, e uma
restauração ensaiada no ambiente local, com o passo a passo no RUNBOOK.
**Depende de.** P-2.
**Estado.** Planejada — aguarda P-2. Fora da lista da D-7; como ela entra,
depois da P-2, é pergunta ao dono (seção 5).

---

### 46-D — Monitoramento e rollback de migration

**Achados.** AUD-34, itens 5 e 6; os pontos de carga citados nela.

**Por quê.** Um problema em produção só é descoberto quando um estudante
reclama, e uma migration errada não tem caminho de volta ensaiado.

**Aceite.**
- Aviso automático quando o site sai do ar.
- Procedimento de rollback de migration escrito e ensaiado no local.
- O login deixa de baixar todos os materiais com as seções completas, e o
  caderno de erros deixa de fazer uma chamada por questão.
- Onde a tela só precisa de números (contagens, acertos, XP), eles vêm
  calculados no servidor, sem baixar a lista inteira. *(Veio da 45-C em 24/09:
  depois das leituras completas, é só desempenho.)*

**Depende de.** P-1 (limites do plano).
**Estado.** Planejada. Congelada (D-7, 28/09).

---

### 46-E — O CI confere que a migration está no remoto antes do merge

**Origem.** INC-2026-003 (21/09), INC-2026-004 (24/09) e INC-2026-005 (24/09,
à noite); parte do item 1 da AUD-34 (paridade com o remoto). Decisão D-4 do
dono, 24/09 (`DECISIONS.md`).

**Por quê.** Merge em `main` é deploy imediato. Aplicar a migration no remoto
antes do merge é um passo manual que falhou três vezes em quatro dias, mesmo
escrito na primeira linha do PR, no RUNBOOK e no `AGENTS.md`: a produção
passou a chamar funções que não existiam no banco (importação de questões
parada; erro que não virava flashcard; simulado fechando com nota vazia; busca
de materiais fora do ar a noite toda). Com
três trilhas produzindo migrations em paralelo, a chance só cresce.

**Aceite — o dono vê:**
- Um PR que traz migration ainda não aplicada no remoto fica com um check
  obrigatório vermelho, que diz qual migration falta; o merge fica bloqueado.
- Depois de aplicar a migration, rodar o check de novo o deixa verde, sem
  commit novo.
- PR sem migration, inclusive do Dependabot, não muda em nada.
- No `main`, o CI avisa se alguma migration do repositório não está no remoto.

**Restrições.**
- Credencial mínima: um papel do banco que só lê o histórico de migrations do
  remoto. Nada de token de gerenciamento da conta. Papel novo herda o que
  `PUBLIC` concede, inclusive executar funções (`AGENTS.md`, risco 14):
  conferir e fechar.
- Repositório público: a credencial nunca aparece em log; o CI nunca escreve
  no remoto.
- Falha fechado: sem a credencial configurada, PR com migration reprova com
  mensagem clara, em vez de passar.
- Entra num check já obrigatório ou vira um novo — o que for mais simples;
  mudar o ruleset do `main` é passo do dono.
- O fluxo novo entra no RUNBOOK (seção 3), no mesmo PR.
- Aceite comprovado com o check vermelho (migration fora do remoto) e verde
  (depois de aplicada), não só verde.

**Fora de escopo.** Conferir conteúdo, grants e RLS do remoto (resto da
AUD-34 e 46-D); aplicar migration pelo CI.
**Depende de.** P-4 — o dono cria o papel e o segredo com os passos que a
sessão desta unidade entregar; o PR só mescla depois disso.
**Executa.** Sessão avulsa, fora das trilhas (CI não é área de nenhuma).
**Estado.** Pronta.

---

## 11. Pendências do dono do produto

Nenhuma sessão de IA tem acesso de administrador ao Supabase de produção nem
ao painel do GitHub. Estas pendências destravam unidades.

**P-1 — Conferir o painel do Supabase de produção** (AUD-03 e AUD-34, itens 1
a 4):
- cadastro aberto ou fechado; exigência de confirmação de e-mail;
- URLs de retorno liberadas — incluir a da tela de senha nova (45-F);
- limite de linhas da API (45-C);
- quantas tentativas, revisões de flashcard e itens de caderno de erros o
  aluno mais ativo já tem, e quantas tentativas fez nos últimos 7 dias — mede
  o prazo real da 45-C (uma sessão de IA não lê dado de produção);
- se o login com Google usa PKCE;
- limites do plano (conexões, tráfego, limite de login);
- se as migrations do remoto batem com as do repositório.

Destrava: 45-C (confirmação do limite e do prazo), 45-F (senha nova em
produção), 46-D.

**P-2 — Autorizar o backup** (AUD-13): confirmar o plano do Supabase e criar,
no GitHub, o segredo com a conexão do banco usada pela rotina de backup.
Destrava: 46-C.

**P-4 — Credencial só de leitura para o CI conferir migrations** (46-E):
criar no Supabase de produção o papel que só lê o histórico de migrations e,
no GitHub, o segredo com a conexão dele; incluir o check no ruleset do `main`,
se for um check novo. Os passos exatos vêm da sessão que executar a 46-E.
Destrava: 46-E.

*A P-3 (pendências de 18/09, AUD-16) saiu em 23/09.* O dono definiu que o
NexusMed cobre todo o conhecimento médico, por partes: o material de
Equilíbrio Ácido-Base foi para a produção editorial (seção 12), sem prazo. O
teste autenticado da Área Editorial foi superado pelo uso real dela desde
então (importações e árvore, PRs #57 a #62). A leitura das métricas semanais
continua disponível como rotina no RUNBOOK.

---

## 12. Produção editorial

Conteúdo não é unidade de implementação: é uma frente paralela à do sistema,
operada pelo dono do produto, com o Gemini como redator (D-5, 24/09). Depende
do que é construído e dita prioridades.

**Desde a D-7 (28/09):** a diretoria é a mesa editorial — prepara cada
pedido, grava a resposta do Gemini sem redigitar, checa, faz a revisão médica
e escreve o roteiro de atestação; o dono lê o material inteiro antes de
importar; fontes só on-line; no máximo 2 materiais escritos e ainda não
publicados. Passo a passo: `docs/conteúdos/LEIA-ME.md` (local, fora do git).

**Fluxo de cada material** (revisto pela D-7):
1. **Escrever** — o Gemini (Gem "Redator NexusMed", que já tem o padrão)
   recebe o pedido, o rascunho antigo e, do 02 em diante, o material do pai;
   busca as fontes on-line e entrega o `.md` e a lista de pontos de risco. O
   dono não anexa fonte.
2. **Checar o formato** — a diretoria roda a checagem do padrão sobre o
   arquivo (44-C1).
3. **Revisão cruzada** — a diretoria, com um subagente Claude de contexto
   limpo, sem editar o arquivo: fato contra referência, referência que
   existe, escopo do nível. Os achados voltam ao Gemini, que entrega o
   arquivo corrigido; no máximo 2 voltas.
4. **Ler, importar, atestar e publicar** — o dono lê o material inteiro
   antes de importar; depois importa, atesta e publica na plataforma, de
   cima para baixo na árvore. A atestação humana continua o único portão.

**Regras da frente:**
- O Gemini não opera no repositório. A interface é o padrão e o arquivo: se o
  importador ou o leitor mudar, o padrão muda no mesmo PR (AGENTS.md, risco
  19) e o dono atualiza a cópia do padrão que o Gemini usa.
- Pedidos, rascunhos e fontes ficam em `docs/conteúdos/`, ignorada pelo git:
  o repositório é público. Desde 28/09, fontes só on-line, nenhum
  livro-texto (D-7). O que vale é a plataforma; a lista do que produzir é o
  plano editorial do ramo.
- No máximo 2 materiais escritos e ainda não publicados (D-7; antes, uma
  leva à frente da revisão) — o gargalo é a atestação, não a escrita.
- Questões depois dos materiais: só as já publicadas, ligadas uma a uma
  (D-7). O Gemini não escreve questões.

| Frente editorial | Plano | Estado | Se beneficia de |
|---|---|---|---|
| Antimicrobianos (piloto dos β-lactâmicos) | [`docs/editorial/PLANO-ANTIMICROBIANOS.md`](../editorial/PLANO-ANTIMICROBIANOS.md) | Em produção desde 24/09 — primeira leva (7 materiais), de cima para baixo | 44-C1 (checar cada arquivo), 43-A (pai define disciplina), 43-B (questões ligadas), 44-B (dividir o rascunho antigo), 44-A (aparecer em Infectologia) |
| Clínica: DPOC e Asma (Pneumologia), Injúria Renal Aguda (Nefrologia) | Sem plano ainda — anotadas pelo dono em 25/09 | Em fila: depois do piloto dos β-lactâmicos fechar o ciclo (D-6) | 44-C1, 43-B |
| Equilíbrio Ácido-Base (Nefrologia, tema Distúrbio Acidobásico) | Material pronto e auditado em 18/09, no formato anterior ao padrão v2 (`docs/editorial/acervo/as1/`) | Na fila, sem prazo — não importado; trazer ao padrão vigente antes de publicar | 44-C1 (conferir o arquivo) e 44-B (atualizar por arquivo) |

Temas futuros e acervos a migrar: `docs/editorial/BANCO-EDITORIAL-TEMAS-FUTUROS.md`
e `docs/archive/diretoria/AUDITORIA-BASE-DE-ESTUDOS-2026-09-21.md`.

---

## 13. Registro

A fonte do estado é a linha "Estado" de cada unidade, que a diretoria
atualiza em lote desde a D-7 (antes, a trilha, no PR). Esta tabela é o
resumo, atualizado pela diretoria em lote — assim PRs paralelos não
conflitam aqui. "Publicado" significa em produção
(deploy confirmado e, quando houver, migration aplicada no remoto).

*Em 28/09, a D-7 atualizou só as colunas "Estado" e "PR" pelas linhas
"Estado" das unidades; "Publicado" dos merges de 26 e 27/09 fica para o
próximo "semana". Em dúvida, vale a linha "Estado" de cada unidade.*

| Unidade | Estado | PR | Publicado |
|---|---|---|---|
| 43-A | Concluída | #79 | 24/09 |
| 43-B | Concluída | #94 | a conferir |
| 43-C | Concluída | #96 | a conferir |
| 43-D | Concluída | #80 | 25/09 (migration aplicada ~13h45 depois do merge — INC-2026-005) |
| 43-E | Congelada (D-7) | — | — |
| 44-A | Congelada (D-7) | — | — |
| 44-B | Congelada (D-7) | — | — |
| 44-C1 | Concluída | #85 | a conferir |
| 44-C2 | Congelada (D-7) (antes 44-C) | — | — |
| 45-A | Concluída; correções da revisão do #76 no #81 | #74, #76, #81 | 24/09 (parte 2: migration depois do merge — INC-2026-004); correções: 25/09 (INC-2026-005) |
| 45-B | Concluída | #71 | 24/09 |
| 45-C | Concluída (item de desempenho movido para a 46-D) | #73 | 24/09 |
| 45-D | Concluída | #92 | a conferir |
| 45-E | Concluída | #86 | a conferir |
| 45-F | Pronta; D-7: item a item, como issue | — | — |
| 45-G | Concluída | #93 | a conferir |
| 45-H | Congelada (D-7), salvo AUD-31.1 e AUD-07 | — | — |
| 45-I | Congelada (D-7), salvo a parte LGPD | — | — |
| 45-J | Concluída | #72 | 24/09 |
| 45-K | Congelada (D-7); #97 em rascunho | — | — |
| 46-A | Congelada (D-7) | — | — |
| 46-B | Em andamento; majors que faltam congeladas (D-7) | vários (Dependabot) | parcial |
| 46-C | Planejada (P-2) | — | — |
| 46-D | Congelada (D-7) | — | — |
| 46-E | Pronta (P-4 no meio do caminho) | — | — |

**Concluído antes deste plano** (resumo; o detalhe está em
`docs/operacao/TASKS.md` e nos PRs):
- árvore de materiais, com as fases 1 a 3 da taxonomia (PRs #57, #58 e #60);
- "Salvar" sem perda e importação já posicionada na árvore (PR #62);
- CI resistente ao limite do registro de imagens (PR #63);
- padrão de conteúdos autocontido (PR #66);
- da auditoria: proteção do `main`, lint e acessibilidade, CI endurecido,
  tela em branco depois de deploy, registro de erros em produção, "hoje" no
  fuso local (AUD-02, AUD-09 a AUD-12, AUD-15).

## 14. O que não construir

Grafo visual da rede de materiais; pré-requisito automático; recomendação
adaptativa; novos tipos de ligação entre materiais; vários pais por material;
cópia de material entre disciplinas; sincronização de trechos entre
materiais; histórico e comparação de versões de conteúdo (além da edição
pendente única da 45-K); reescrita por IA dentro da plataforma. Só voltam à mesa se o uso
mostrar necessidade concreta.
