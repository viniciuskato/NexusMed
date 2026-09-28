# Modelo de operação da diretoria

Convenção aprovada pelo usuário em 2026-09-07. Este modelo substitui formatos anteriores de acompanhamento que conflitem com ele.

## Modelo D-7 (desde 28/09/2026)

Decisão do dono: conteúdo é o produto (`docs/operacao/DECISIONS.md`, D-7).
Funcionalidade nova está congelada, salvo pedido da produção. Três sessões:

1. **Diretoria** — Claude Code, modelo mais capaz, no checkout principal; PR
   próprio em worktree próprio. **É a única janela em que o dono fala no dia
   a dia; ele não carrega texto entre sessões Claude.**
   - Faz: a rodada "bom dia" (painel de até ~10 linhas: o que mesclar agora,
     um PR por vez, com link; no máximo uma decisão pendente, com
     recomendação; a pergunta da sessão de defeitos; o estado de cada
     material; a próxima ação do dono); revisa os PRs que não escreveu e põe
     o rótulo; atualiza com o `main` (merge, nunca rebase) o PR rotulado que
     ficou atrás; confere CI e deploy depois de cada merge do dono; é a mesa
     editorial (fluxo em `docs/conteúdos/LEIA-ME.md`, local); mantém a fila de
     defeitos (issues) e decide defeito × evolução; leva ao dono as perguntas
     da sessão de defeitos e devolve a resposta; às segundas, o "semana"
     (materiais publicados, a fila, os defeitos `menor` para o dono aprovar
     ou descartar, até 2 decisões e um PR de documentação com o registro da
     semana).
   - Não faz: código de produto; merge; migration no remoto; escrita no
     Supabase remoto ou na Vercel; mudança na configuração do GitHub sem o
     "sim" do dono na hora; edição do texto de um material (só grava cópias
     exatas); importar, atestar ou publicar; revisar PR que ela escreveu.
   - Propõe ao dono tornar `revisado` obrigatório nas regras do `main` e,
     depois do #98, também `migration-no-remoto`.
2. **Sessão de defeitos** — Claude Code, modelo mais capaz, worktree
   próprio, nunca o checkout principal. **É a única que escreve código de
   produto**: conserta, um de cada vez, o que está no ar e não faz o que já
   promete, ou põe em risco dado do estudante, segurança ou a produção. Não
   constrói nada novo. Fala com a diretoria por mensagem entre sessões e
   pergunta ao dono só pela diretoria. Protocolo:
   [`../operacao/EXECUTOR_PROTOCOL.md`](../operacao/EXECUTOR_PROTOCOL.md).
3. **Sessão de materiais** — o Gemini, no Gem "Redator NexusMed", uma
   conversa por material. Escreve cada material no padrão de conteúdos e o
   corrige pelos achados da revisão. Sem acesso ao computador, ao
   repositório, ao banco nem ao GitHub; não escreve questões; não decide
   tema nem escopo. O dono leva o pedido ao Gem e traz a resposta à
   diretoria.

**Quem revisa quem** (sempre antes do merge; só o dono mescla):

| Autor | Quem revisa | Quem põe o rótulo `revisado` |
|---|---|---|
| Sessão de defeitos | Diretoria, com subagentes de contexto limpo; achado grave conferido por um segundo leitor que tenta derrubá-lo; de novo no diff das correções | Diretoria |
| Diretoria | Sessão de defeitos, quando a diretoria pede | Sessão de defeitos |
| Gemini (material) | Diretoria (checagem e revisão médica por subagente de contexto limpo); depois o dono, que lê o material inteiro antes de importar | Não há rótulo: o portão é a atestação humana, presa ao hash |

Só achado bloqueante impede o rótulo. Nenhuma sessão revisa o que escreveu
nem põe rótulo em PR próprio.

Limites, autorizações, métrica e a revisão da D-7 em 09/10: na própria
decisão. Textos para abrir a diretoria e a sessão de defeitos: seção 0 do
plano canônico. A sessão de auditoria continua só sob pedido explícito do
dono (seção própria, abaixo). As seções "Três papéis" e "Trilhas e revisão"
ficam como histórico; o resto deste documento vale onde não contradiz esta
seção.

## Três papéis, não dois (atualização 2026-09-18)

*Substituída pela D-7 (28/09/2026) — ver "Modelo D-7", acima. Mantida como
histórico.*

Desde 2026-09-18 existem três papéis de sessão, não dois. O que este
documento chama de "diretoria" abaixo permanece **exatamente como
sempre foi** — planeja, formula encaminhamentos, verifica retorno — não
foi renomeado. O que mudou é que um papel novo, mais raro, foi separado
dela: a **sessão de auditoria** (ver seção própria mais abaixo), que
pensa o projeto inteiro e a evolução de longo prazo, sem gerar
encaminhamento nenhum. Resumo dos três:

1. **Sessão de auditoria** — esporádica, só sob pedido explícito do
   usuário (equivalente ao `raio-x-cowork`/`autocritica-cowork` do
   ambiente Cowork, aplicado a este projeto). Lê o projeto inteiro,
   audita, propõe evolução criativa. Não escreve encaminhamento — só
   registra itens em
   [`docs/diretoria/BACKLOG-ESTRATEGICO.md`](BACKLOG-ESTRATEGICO.md).
2. **Sessão diretoria** — o papel já descrito no resto deste documento,
   sem mudança. Escopo fechado (uma entrega/fase), pega itens do
   backlog estratégico ou pendências já conhecidas, formula
   encaminhamentos, verifica retorno.
3. **Sessão executiva** — desde 2026-09-23, organizada em **trilhas**; ver
   a seção seguinte e `EXECUTOR_PROTOCOL.md`.

A ponte entre auditoria e diretoria é sempre o arquivo de backlog, nunca
uma sessão viva esperando resposta síncrona da outra — isso evita
inflar o laço barato e frequente diretoria→executiva com mais uma troca
de sessão obrigatória a cada entrega.

## Trilhas e revisão (desde 2026-09-23)

*Substituída pela D-7 (28/09/2026) — ver "Modelo D-7", acima. Mantida como
histórico.*

A execução deixou de ser uma sessão por unidade e passou a ser **uma sessão
por área do código**. Motivo: o custo dominante deste projeto não era o preço
por token, era a releitura e o retrabalho. Cada sessão nova lia cerca de
250 KB de documentos antes de tocar em código; diretoria e executiva liam o
mesmo código duas vezes; o que uma entendia se perdia na passagem; e o
trabalho de um modelo mais barato voltava para ser refeito.

- **Trilha** — sessão de vida longa, com o modelo mais capaz disponível,
  dona de uma área do código (a seção 5 do plano diz quais e em que ordem).
  Desenha e implementa, uma unidade por PR; o contexto de uma unidade serve
  à próxima. Quando uma escolha muda o que o usuário vê ou contradiz uma
  decisão registrada, pergunta ao dono na própria sessão, sem passar por uma
  diretoria. Protocolo: `EXECUTOR_PROTOCOL.md`.
- **Revisão** — sessão nova, sem o contexto da trilha, **antes do merge**
  (`/code-review high <PR>`). As correções voltam para a trilha, que ainda
  tem o contexto.
- **Diretoria** — sob demanda, não por unidade: decisão de produto, frente
  nova, correção de unidade, atualização do plano em lote depois de uma
  leva de merges. Não escreve briefing de execução: com a trilha no modelo
  mais capaz, o briefing só duplicaria a leitura do código.
- **Dono** — decide, aplica migration no remoto e mescla. São os dois únicos
  portões manuais.
- **Modelo mais barato** só para tarefa mecânica em que errar é barato e
  conferir é trivial (PR do Dependabot, ajuste de texto). Desenho, banco,
  atestação, sincronização e revisão ficam com o mais capaz.

## Papel
A diretoria é criativa e interativa: discute, questiona, decide, prepara instruções autocontidas e avalia resultados. As executivas implementam e verificam. A diretoria registra decisões e convenções; não assume a execução por receber um retorno ou uma cópia de prompt. A diretoria também tem autoridade para recusar um plano falho na raiz — não se limita a decidir escopo dentro de um plano ruim; se o pedido não faz sentido técnico, o correto é dizer isso e propor refazer, não executar mesmo assim.

## Organização por entrega
A unidade de acompanhamento é a entrega, com número estável (01, 02 etc.). Cada encaminhamento recebe uma letra: 01-A inicial, 01-B complemento. Revisões do mesmo encaminhamento indicam versão e qual texto substituem. Preserve os identificadores antigos como aliases; não invalide prompts já enviados. Não renumere o histórico.

Mantenha três perspectivas: fila priorizada do que pode executar agora; acompanhamento do que está em execução, voltou ou exige decisão; histórico de instruções, retornos e aprovações.

## Encaminhamentos
**Desde 2026-09-23 o encaminhamento é uma unidade do plano canônico, não um prompt** — ver a seção "Plano canônico e unidades" logo abaixo. A executiva encerra com o bloco de retorno descrito em `docs/operacao/EXECUTOR_PROTOCOL.md`.

Não detalhe o *como* com antecedência: arquivos, SQL, comandos e ordem de passos mudam a cada entrega mesclada e são derivados por quem executa, lendo o código naquele momento. Registre na unidade só o que não envelhece. Não invente tarefas para encerrar uma conversa exploratória.

A executiva encerra com um bloco copiável: RETORNO: 01-B; Resultado; Alterações; Validações; Pendências; Estado de publicação. Aceite retornos legados e linguagem natural.

## Plano canônico e unidades (desde 2026-09-23)

*Desde a D-7: unidade só volta a ser encaminhada como pedido da produção; a
sessão de defeitos não edita o plano (quem atualiza, inclusive a linha
"Estado", é a diretoria, em lote); "Como abrir uma trilha", abaixo, não vale
mais.*

Substituem os prompts persistidos em `docs/archive/diretoria/prompts/`. Motivo: os prompts
envelheciam antes de serem executados — o 42-C ainda apontava para um caminho de
repositório que não existe mais; planos detalhados eram desmentidos por decisões
tomadas horas depois; e os achados que mais importam (ex.: o hash de atestação da
questão incluir o vínculo com material) só aparecem lendo o código na hora de
executar. `docs/archive/diretoria/prompts/` fica como histórico; nada novo entra lá.

**Onde mora.** Um único documento:
[`docs/produto/PLANO-DE-DESENVOLVIMENTO.md`](../produto/PLANO-DE-DESENVOLVIMENTO.md).
Nele estão a visão, o estado verificado do sistema, as decisões de modelo em
vigor, as frentes, a sequência, as decisões em aberto, todas as unidades e o
registro. É o painel da diretoria e o que o dono do produto lê para entender o
planejamento. Não há mais documento por iniciativa. Os achados da auditoria
continuam descritos em `BACKLOG-ESTRATEGICO.md`; a unidade que resolve cada um
mora no plano.

**O que uma unidade contém — só o que não envelhece:**
- **Por quê** — o problema de quem estuda ou de quem produz.
- **Aceite** — comportamento observável, como a pessoa vê a tela. É a parte que
  diz quando está pronto; sem ela a unidade é só uma ideia, e ideia solta não é
  executável.
- **Restrições e armadilhas conhecidas** — decisões e riscos que valem, com
  *onde conferir* no código em vez de copiar o código.
- **Fora de escopo**, **Depende de**, **Estado**.

**O que a unidade NÃO contém:** nomes de arquivo como instrução, linhas, SQL,
comandos, hashes, branches, caminhos de máquina, passo a passo. Isso é derivado
por quem executa; o *como* genérico já vive em `AGENTS.md`, `RUNBOOK.md` e
`EXECUTOR_PROTOCOL.md`.

**Quem atualiza o quê** (detalhe na seção 0 do plano):
- **A diretoria** cria, corrige e descarta unidades, muda a sequência, registra
  e resolve decisões em aberto e mantém "Onde o sistema está". Decisão durável
  também entra em `DECISIONS.md`.
- **A trilha**, no mesmo PR da implementação, atualiza só a linha "Estado" da
  unidade e, se for o caso, uma linha "Achados da execução". Não reescreve
  aceite, ordem nem outras unidades. A tabela de registro (seção 13) é da
  diretoria, atualizada em lote — assim PRs de trilhas paralelas não
  conflitam nela.

**Como abrir uma trilha.** Uma mensagem, uma vez por trilha (modelo na seção 0
do plano): qual trilha, quais unidades e em que ordem, e as autorizações —
push de branch, abrir PR, Docker e Supabase local; nunca merge nem escrita
remota.

**Ao voltar o PR.** O RETORNO vai na descrição do PR (o diário da mudança). A
revisão independente acontece antes do merge; o dono mescla. A diretoria, quando
aberta, atualiza o registro e ajusta a sequência se algo mudou. Se a execução
mostrou que o aceite estava errado ou incompleto, a diretoria corrige a unidade
— ela é viva.

## Estados e evidência
Planejado; Preparado (envio não confirmado); Em execução (usuário confirmou envio); Retorno recebido/em análise; Concluído (critérios atendidos). Publicação é informação separada: implementação local não significa entrega publicada.

Aceite “ENVIEI: 06-B” ou “mandei para rodar”. Só marque Em execução após confirmação do usuário. Arquivos locais podem indicar atividade, mas não comprovam o envio de um encaminhamento. Preserve essa evidência como observação sem promover o status. Um retorno parcial não encerra automaticamente a entrega.

## Liberação e concorrência
Avalie separadamente: há informações suficientes para enviar? Pode executar junto das sessões ativas? Confira dependências e sobreposição de arquivos, dados, migrações e decisões. Sem evidência de isolamento, não libere implementações conflitantes na mesma árvore. Diagnósticos somente leitura podem avançar em paralelo quando independentes. Não presuma que branches na mesma pasta isolam executivas.

*Sob a D-7, o painel da rodada "bom dia" substitui a tabela a seguir.* A tabela final deve conter: Trilha | Unidade atual | Estado | Próxima ação / dependência. Diga explicitamente “Pode enviar”, “Aguarda retorno de NN — motivo”, “Definir isolamento antes de enviar” ou “Já enviado; aguardar retorno”. Indique prioridade quando útil. Mostre apenas o histórico necessário na conversa.

## Persistência
Use o plano canônico (`docs/produto/PLANO-DE-DESENVOLVIMENTO.md`) como painel atual: sequência, estados, decisões em aberto e registro. Retornos vão na descrição do PR da unidade. Desde 2026-09-23; antes, o painel era docs/archive/diretoria/registro.md, com prompts em docs/archive/diretoria/prompts/ e retornos em docs/archive/diretoria/retornos/ — todos mantidos como histórico. Não fabrique transcrições completas a partir de resumos; rotule resumos. Atualize o acompanhamento quando houver envio confirmado, retorno ou decisão, preservando trabalho concorrente e fatos anteriores.

Ao retomar uma sessão, leia AGENTS.md, este modelo e o plano canônico. Reconcilie divergências com a última confirmação do usuário e mantenha incertezas explícitas.

## Independência de sessão
Toda unidade deve poder ser executada por uma sessão nova sem acesso à conversa anterior — com o plano canônico, `AGENTS.md` e o código daquele momento. Inclua as decisões e restrições que valem e o estado conhecido — o caminho do projeto e o estado do repositório quem executa lê de `AGENTS.md` e do próprio git. Oriente a inspecionar e aproveitar alterações existentes, sem exigir continuidade na mesma sessão. Confirme ausência de escritores concorrentes nos mesmos arquivos antes da edição. Esta regra substitui recomendações anteriores de encaminhamento obrigatório à mesma executiva. A trilha (desde 2026-09-23) aproveita o contexto acumulado por economia, não por necessidade: se ela for reiniciada, a próxima unidade continua executável por uma sessão nova.

## Eficiência de execução
Por padrão, diretoria e executiva resolvem cada passo com ferramentas diretas (ler arquivo, rodar comando, editar) — não delegam a subagentes a menos que a tarefa exija pesquisa genuinamente paralela ou isolamento de contexto que a própria sessão não consegue fazer sozinha. Um passo único e prescrito (rodar um teste, conferir um diff, aplicar uma correção) nunca justifica abrir um subagente. Ao formular um encaminhamento para a executiva, inclua essa restrição quando o escopo for fechado.

## Verificação cruzada
Para mudanças de risco alto (merge em `main`, decisão de taxonomia/conteúdo médico, qualquer escrita remota), prefira que a verificação seja feita por um modelo diferente do que executou, quando disponível — o mesmo modelo reconferindo o próprio trabalho tende a repetir os mesmos pontos cegos. Verificação pelo mesmo modelo que executou ainda vale mais que nenhuma verificação, mas não é equivalente a uma checagem cruzada real.

## Sessão de auditoria (papel estratégico, adicionado 2026-09-18)

**Quando abrir**: só sob pedido explícito do usuário — "faz um raio-x do projeto", pedido de evolução criativa, fechamento de um marco grande. Nunca automaticamente ao fechar uma entrega ou fase; isso continua sendo fechamento normal de diretoria. **Cadência recomendada** (desde a auditoria de 2026-09-18): a diretoria sugere ao usuário convocar uma auditoria a cada ~2 semanas de desenvolvimento ativo ou antes de qualquer marco que mude o risco (abrir para usuários novos, cobrar, importar conteúdo em lote). Motivo: a verificação por entrega olha bem o diff de cada missão, mas os bugs graves de 2026-09-18 (gabarito vazando por RPC, "Salvar" do CMS apagando anotações por cascata, tipagem desligada, CI vermelho sem ninguém notar) estavam *entre* as entregas — nenhum diff isolado os mostrava.

**Checklist mínimo da auditoria** (além da leitura de estado):
1. Toda RPC `SECURITY DEFINER`: checagem de usuário ativo/admin **antes** de qualquer caminho que devolva dado (inclusive atalhos de idempotência).
2. Todo caminho de escrita que faz `DELETE`: o que cai em cascata (`ON DELETE CASCADE`/`SET NULL`) nas tabelas que apontam para a apagada.
3. CI do `main` verde de verdade (`gh run list --branch main`), não só "passou na minha máquina".
4. `tsc` com `strict`, dependências (`npm audit --omit=dev`) e segredos no diff do período.
5. Dados fictícios ou de demonstração alcançáveis em produção.
6. O que o usuário final vê de fato: fluxos de conta (cadastro, senha), navegação e conteúdo publicado.

**Escopo**: o projeto inteiro, não uma entrega. Ler `AGENTS.md`, `docs/operacao/PROJECT_STATE.md`, `DECISIONS.md`, `TASKS.md`, `docs/archive/diretoria/registro.md` e o que mais for necessário para avaliar direção, não só estado pontual.

**Saída — e só esta**: itens novos ou atualizados em [`docs/diretoria/BACKLOG-ESTRATEGICO.md`](BACKLOG-ESTRATEGICO.md). A sessão de auditoria **não escreve encaminhamento** (isso é trabalho da diretoria) e **não implementa nada**. Cada item precisa ser autocontido o bastante para uma sessão de diretoria futura, sem contexto da auditoria, entender do que se trata e decidir se/quando puxar — ver formato exigido no próprio arquivo de backlog.

**Depois de registrar os itens**, a sessão de auditoria encerra. Não fica aguardando uma diretoria pegar o item nem cobra retorno — a diretoria consulta o backlog estratégico por conta própria ao abrir uma sessão nova, do mesmo jeito que já consulta `TASKS.md` e `docs/archive/diretoria/registro.md`.

**A diretoria também pode escrever no backlog estratégico**, no sentido contrário: se, no meio de uma entrega, perceber algo maior que o escopo daquela entrega ("isso é reformulação, não ajuste"), registra um item novo lá em vez de tentar resolver dentro do encaminhamento atual ou convocar uma sessão de auditoria ao vivo.
