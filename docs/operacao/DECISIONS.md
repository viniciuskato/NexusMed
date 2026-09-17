# DECISIONS.md — log de decisões duráveis da diretoria

> Log, não diário. Cada entrada é uma decisão que vale para sessões
> futuras até ser explicitamente revista aqui. Não narra o trabalho feito
> (isso é [`TASKS.md`](TASKS.md) para o presente e
> `docs/diretoria/registro.md` / `docs/archive/` para o histórico
> encerrado). Ordem cronológica, mais recente no topo.

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
   `docs/diretoria/registro.md` completo (histórico extenso de prompts)
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
