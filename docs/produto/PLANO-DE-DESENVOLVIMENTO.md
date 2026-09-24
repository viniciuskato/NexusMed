# Plano de desenvolvimento do NexusMed

**Documento canônico.** Diz o que está sendo construído, por quê, em que ordem
e em que estado está cada parte. Substitui a antiga sequência de prompts e os
documentos por iniciativa.

**Última revisão da diretoria:** 23/09/2026.
**Estado verificado no código:** 23/09/2026.

Como ler, conforme o que você procura:
- **Entender o plano:** seções 1 a 4.
- **O que vem agora:** seção 5 (trilhas e ordem) e seção 6 (decisões em aberto).
- **O detalhe de uma unidade:** seções 7 a 11, uma por frente.
- **O que já foi feito:** seção 13 (registro).

---

## 0. Como este documento funciona

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
| Pronta | Pode ser encaminhada agora |
| Em execução | Uma sessão de execução está trabalhando nela |
| Em PR | Implementada, esperando revisão e merge |
| Concluída | Mesclada em `main`; a coluna "publicado" do registro diz se já está em produção |
| Descartada | Não será feita; o motivo fica registrado |

### Quem atualiza o quê

| Quem | Quando | O que muda aqui |
|---|---|---|
| **Sessão de diretoria** | Sob demanda: decisão de produto, frente nova, depois de uma leva de merges | Cria, corrige ou descarta unidades; muda trilhas e ordem (seção 5); registra e resolve decisões em aberto (seção 6); atualiza "Onde o sistema está" (seção 2) e o registro (seção 13), em lote. Toda decisão durável também vai para `docs/operacao/DECISIONS.md`. |
| **Trilha (execução)** | **No mesmo PR da unidade** | Só a linha "Estado" da unidade (`Concluída — PR #nn`) e, se for o caso, uma linha **"Achados da execução"**. Não reescreve aceite, ordem nem outras unidades: se o aceite estiver errado, pergunta ao dono (`EXECUTOR_PROTOCOL.md`). |
| **Revisão** | Antes do merge, em sessão nova | Nada aqui — comenta o PR. |
| **Dono do produto** | Quando quiser | Lê, decide (seção 6), aplica migration no remoto, mescla e faz as pendências que só ele pode fazer (seção 11). |

### Como trabalhar uma unidade

Cada unidade é feita pela trilha dona da área dela (seção 5), num PR próprio:
a trilha implementa com testes e abre o PR → uma sessão nova revisa
(`/code-review high <PR>`) → a trilha corrige → o dono aplica a migration,
se houver, e mescla. Protocolo completo: `docs/operacao/EXECUTOR_PROTOCOL.md`.

### Como abrir uma trilha

Uma mensagem, uma vez por trilha, numa sessão nova com o modelo mais capaz,
em worktree próprio:

> *Você é a Trilha 2 (Material e Área Editorial) do NexusMed. Leia
> `AGENTS.md` e siga `docs/operacao/EXECUTOR_PROTOCOL.md`. Execute, uma por
> PR e na ordem da seção 5 de `docs/produto/PLANO-DE-DESENVOLVIMENTO.md`, as
> unidades da sua trilha. Autorizo push de branches, abrir PR e usar Docker e
> Supabase local. Não mesclar; nenhuma escrita no Supabase remoto.*

Uma unidade avulsa, fora de trilha, usa a mesma mensagem com o número dela.

### Relação com os outros documentos

| Documento | Papel |
|---|---|
| Este plano | O que fazer, por quê, em que ordem e em que estado |
| `docs/operacao/DECISIONS.md` | Por que cada decisão durável foi tomada (log) |
| `docs/diretoria/BACKLOG-ESTRATEGICO.md` | Achados da auditoria, com o detalhe técnico de cada um (AUD-nn). A unidade que resolve cada achado mora aqui |
| `docs/operacao/TASKS.md` | Fila operacional: incidentes e pendências avulsas. Não repete as unidades deste plano |
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

## 2. Onde o sistema está (verificado em 23/09/2026)

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

A auditoria de 19/09 deixou **26 achados abertos**. Conferido em 23/09:
nenhum foi corrigido desde então. Os mais graves:
- no simulado em Modo Prova, quando o tempo acaba, as respostas se perdem e a
  nota fica 0;
- clique duplo duplica tentativas;
- com rede lenta, resposta certa conta como errada;
- leituras com mais de 1000 linhas são cortadas em silêncio (afeta alunos
  ativos em semanas);
- excluir um material apaga dados de todos os alunos e a trilha de
  atestação;
- o painel de revisão pode atestar o item errado.

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
- **Execução em trilhas por área do código**, com o modelo mais capaz, uma
  unidade por PR e revisão em sessão nova antes do merge. Diretoria sob
  demanda, não por unidade. *(23/09)*
- **Migration vai para o Supabase remoto antes do merge**, e a produção
  continua funcionando com ela.

## 4. As frentes

| Frente | Objetivo | Unidades |
|---|---|---|
| **43 — Ciclo de estudo** | O estudante percorre os cinco passos com um clique cada | 43-A a 43-E |
| **44 — Base de materiais** | O banco cresce sem duplicar nem envelhecer | 44-A a 44-C |
| **45 — Confiabilidade** | O que o estudante faz não se perde; a atestação é sempre do item certo | 45-A a 45-K |
| **46 — Base técnica e operação** | Código mais barato de mudar; backup e rollback | 46-A a 46-D |
| **Pendências do dono** | O que só a conta dona do projeto consegue fazer | P-1 e P-2 |
| **Produção editorial** | Conteúdo, não código — acompanhada aqui para a ordem fazer sentido | seção 12 |

A numeração continua a sequência histórica de entregas (40, 41, 42…) e não
muda quando a ordem muda.

## 5. Sequência

**Critério:** primeiro o que perde dado do estudante ou atesta errado, junto
com o que muda a forma de *produzir* conteúdo (chegar tarde obriga a refazer
material pronto); depois o que o estudante ganha de novo; a reestruturação
interna entra numa janela própria.

**Trilhas.** A execução corre em três trilhas paralelas, cada uma dona de uma
área do código e num worktree próprio (`EXECUTOR_PROTOCOL.md`). Dentro da
trilha, uma unidade por PR, na ordem da tabela; o contexto de uma unidade serve
à próxima. Como as áreas não se sobrepõem, as trilhas não disputam os mesmos
arquivos; as poucas dependências entre elas estão na última coluna. Com menos
atenção disponível para acompanhar, abrir primeiro as trilhas 1 e 2 (perda de
dado e forma de produzir conteúdo) e a 3 depois.

| Trilha | Área do código | Unidades, na ordem | Espera outra trilha |
|---|---|---|---|
| **1 — Dados do estudante** | Respostas, flashcards, simulados, caderno de erros, sincronização; leitura e gravação nos repositórios | 45-A e 45-C (a que o prazo da 45-C pedir primeiro — P-1; sem a medida, 45-A) → 45-E → 45-G → 45-I | — |
| **2 — Material e Área Editorial** | Formulário, importação, gravação e revisão de material e de questão | 45-B → 43-A → 45-D → 43-B → 45-K → 44-B → 44-A → 44-C | — |
| **3 — Descoberta e casca do app** | Busca, conta e sessão, menu, componente raiz, telas novas do ciclo | 45-J → 43-D → 45-F → 45-H → 46-A passos 1 a 4 → 43-C → 43-E | 45-H espera a 45-A (trilha 1); 43-C espera a 43-B (trilha 2) |

Notas de ordem:
- **Trilha 2:** a 43-B vem antes da 45-K porque está no caminho do "testar o
  que li" (43-C), o passo do ciclo que ainda não existe.
- **45-H é transversal por natureza** (banco, simulado, referências, repetição
  espaçada): a trilha 3 a divide em PRs pequenos e não reorganiza código das
  outras áreas.

**Fora das trilhas:**
- **Janela de reestruturação — 46-A, passos 5 a 12** (camada de dados e
  roteador). Mexe em todas as áreas: roda quando as trilhas 1 e 3 tiverem
  terminado suas listas, com as outras paradas ou só em PR pequeno. Depende dos
  passos 1 a 4 e da 45-G.
- **Contínuo:** 46-B (PRs do Dependabot — tarefa mecânica, modelo mais barato
  serve); 46-C (espera P-2); 46-D (espera P-1; quando destravar, a trilha dona
  de cada parte a executa).

**Duas regras para trilhas em paralelo:**
- **A segunda a mesclar se atualiza sobre o `main`** e roda de novo todos os
  gates antes do merge; nenhuma reorganiza arquivos fora da própria área.
- **Migration de uma trilha pode ficar "antes" da última já aplicada no
  remoto por outra.** O CLI do Supabase recusa aplicar migration com data
  anterior à última do remoto. Quem aplicar depois confere a lista do remoto e,
  se preciso, dá à sua migration uma data posterior, antes de aplicar
  (`RUNBOOK.md`, seção 3).

## 6. Decisões em aberto

Cada uma bloqueia unidades. A diretoria recomenda; o dono decide. Resolvida,
vira entrada em `DECISIONS.md` e sai daqui. A numeração continua (a próxima é
D-4).

**Nenhuma em aberto.** D-1 (editar material publicado → rascunho à parte), D-2
(leitura offline → não, por ora) e D-3 (46-A em duas janelas) foram decididas
pelo dono em 23/09, todas conforme a recomendação; estão na seção 3 e em
`DECISIONS.md`.

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
**Estado.** Pronta assim que a 45-B for mesclada.

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
**Estado.** Planejada.

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
**Depende de.** 43-B; idealmente depois de 46-A passos 1 a 4 (D-3).
**Estado.** Planejada.

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
**Estado.** Pronta.

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
**Estado.** Planejada.

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
**Estado.** Planejada.

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
**Estado.** Planejada.

---

### 44-C — Versão do padrão e conformidade

**Por quê.** Saber, a qualquer momento, quais materiais estão atrás do padrão
e o que falta em cada um — sem reler tudo. Quando o padrão ganhar uma regra
nova, ver na hora quais materiais ela afeta.

**Aceite — quem produz vê:**
- Cada material mostra a **versão do padrão** em que foi produzido. Material
  importado lê a linha `**Versão do padrão:**` do arquivo (o padrão pede essa
  linha desde a v2); material sem a linha aparece como "sem versão".
  Ajustável na revisão.
- No cartão do material, um selo **"Conforme"** ou **"N pendências"**, com a
  lista ao clicar. As pendências vêm de checagens automáticas sobre o
  conteúdo guardado — as regras mecânicas do padrão: citação sem link;
  citação para referência inexistente; referência nunca citada; tabela sem
  frase de abertura citada; LaTeX; `<=`/`>=`; lista dentro de lista;
  subtítulo que não seja `####`; tempo fora de 8–25 minutos; sem
  palavras-chave; texto que remete a outro material ("veja o material",
  "próximo módulo").
- Filtros na Área Editorial: **"Com pendências"** e **"Em versão antiga do
  padrão"**.
- A mesma lista de checagens roda na prévia da importação e da atualização por
  arquivo — uma lista só de regras.

**Restrições.**
- A checagem é calculada, não gravada: regra nova vale na hora para todos, sem
  mudar conteúdo nem hash de atestação.
- Pendência orienta, não bloqueia publicação — o gate continua sendo a
  atestação.
- Regras de julgamento (profundidade, o que cabe em cada nível) não viram
  checagem; ficam no checklist do padrão e na revisão.
- Daqui em diante, toda regra mecânica nova no padrão vem com a checagem no
  mesmo PR (AGENTS.md, risco 19).

**Fora de escopo.** Correção automática; nota de qualidade; checagem por IA.
**Depende de.** 44-B.
**Estado.** Planejada.

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

**Fora de escopo.** Fila de sincronização em geral (45-E); leitura offline
(45-G).
**Depende de.** Nada.
**Estado.** Pronta.

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
**Estado.** Pronta.

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
**Estado.** Pronta.

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
**Estado.** Pronta.

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
**Depende de.** 45-A (mesmo caminho de gravação de respostas).
**Estado.** Planejada.

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
**Estado.** Pronta.

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
**Estado.** Planejada.

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

**Restrições.** Pode ser dividida em 2 ou 3 PRs. Migrations no remoto antes do
merge.
**Depende de.** 45-A (a nota no servidor sai de lá).
**Estado.** Planejada.

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
**Estado.** Planejada.

---

### 45-J — Plantão de Foco sobre o menu no celular

**Origem.** Achado ao testar a navegação da árvore (TASK-2026-09-23-02).

**Por quê.** Em telas de cerca de 390 px, o widget flutuante "Plantão de
Foco" cobre o primeiro item do menu inferior ("Biblioteca"), e o clique não
chega ao destino.

**Aceite — o estudante vê:** em tela estreita, nenhum item do menu inferior
fica coberto, e o widget continua acessível.
**Depende de.** Nada.
**Estado.** Pronta.

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
**Estado.** Planejada — pronta assim que a 45-D for mesclada.

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

---

### 46-B — Dependências

**Achados.** AUD-14.

**Por quê.** Majors atrasadas acumulam custo de migração e risco de segurança.

**Aceite.** TypeScript e ESLint nas versões atuais, com todos os gates verdes.
**Restrições.** Seguir o padrão de atualização de dependências do repositório
(`docs/operacao/standards/atualizacao-dependencias.md`).
**Estado.** Em andamento — o Dependabot está ativo, e as majors das actions e
do pacote de ícones já foram mescladas; faltam TypeScript e ESLint.

---

### 46-C — Backup e ensaio de restauração

**Achados.** AUD-13.

**Por quê.** O conteúdo curado e auditado é o principal ativo do produto, e não
há cópia fora do Supabase nem restauração ensaiada. Perder o projeto, ou uma
escrita errada em massa, não tem volta.

**Aceite.** Uma cópia semanal do banco guardada fora do Supabase, e uma
restauração ensaiada no ambiente local, com o passo a passo no RUNBOOK.
**Depende de.** P-2.
**Estado.** Planejada — aguarda P-2.

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

**Depende de.** P-1 (limites do plano).
**Estado.** Planejada.

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

*A P-3 (pendências de 18/09, AUD-16) saiu em 23/09.* O dono definiu que o
NexusMed cobre todo o conhecimento médico, por partes: o material de
Equilíbrio Ácido-Base foi para a produção editorial (seção 12), sem prazo. O
teste autenticado da Área Editorial foi superado pelo uso real dela desde
então (importações e árvore, PRs #57 a #62). A leitura das métricas semanais
continua disponível como rotina no RUNBOOK.

---

## 12. Produção editorial

Conteúdo não é unidade de implementação, mas depende do que é construído e
dita prioridades.

| Frente editorial | Plano | Estado | Se beneficia de |
|---|---|---|---|
| Antimicrobianos (piloto dos β-lactâmicos) | [`docs/editorial/PLANO-ANTIMICROBIANOS.md`](../editorial/PLANO-ANTIMICROBIANOS.md) | Plano pronto; 7 materiais do piloto a produzir, de cima para baixo | 43-A (pai define disciplina), 43-B (questões ligadas), 44-B (dividir o rascunho antigo), 44-A (aparecer em Infectologia) |
| Equilíbrio Ácido-Base (Nefrologia, tema Distúrbio Acidobásico) | Material pronto e auditado em 18/09, no formato anterior ao padrão v2 (`docs/editorial/as1/`) | Na fila, sem prazo — não importado; trazer ao padrão vigente antes de publicar | 44-B e 44-C (trazer ao padrão e conferir) |

Temas futuros e acervos a migrar: `docs/editorial/BANCO-EDITORIAL-TEMAS-FUTUROS.md`
e `docs/diretoria/AUDITORIA-BASE-DE-ESTUDOS-2026-09-21.md`.

---

## 13. Registro

A fonte do estado é a linha "Estado" de cada unidade, que a trilha atualiza no
PR. Esta tabela é o resumo, atualizado pela diretoria em lote — assim PRs de
trilhas paralelas não conflitam aqui. "Publicado" significa em produção
(deploy confirmado e, quando houver, migration aplicada no remoto).

| Unidade | Estado | PR | Publicado |
|---|---|---|---|
| 43-A | Pronta após 45-B | — | — |
| 43-B | Planejada | — | — |
| 43-C | Planejada | — | — |
| 43-D | Pronta | — | — |
| 43-E | Planejada | — | — |
| 44-A | Planejada | — | — |
| 44-B | Planejada | — | — |
| 44-C | Planejada | — | — |
| 45-A | Pronta | — | — |
| 45-B | Pronta | — | — |
| 45-C | Pronta | — | — |
| 45-D | Pronta | — | — |
| 45-E | Planejada | — | — |
| 45-F | Pronta | — | — |
| 45-G | Planejada | — | — |
| 45-H | Planejada | — | — |
| 45-I | Planejada | — | — |
| 45-J | Pronta | — | — |
| 45-K | Planejada (após 45-D) | — | — |
| 46-A | Planejada | — | — |
| 46-B | Em andamento | vários (Dependabot) | parcial |
| 46-C | Planejada (P-2) | — | — |
| 46-D | Planejada | — | — |

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
