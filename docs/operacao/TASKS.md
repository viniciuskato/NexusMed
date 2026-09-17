# TASKS.md — fila única de trabalho

> Uma tarefa, uma linha de identificador. Prioridade, estado, dependência,
> impacto em produção e próxima ação — sempre as cinco colunas. Isto
> registra o **presente e o futuro imediato**; para o diário de tudo que já
> foi executado antes de 2026-09-17, ver
> `docs/diretoria/registro.md` (painel legado, mantido intacto) e
> [`docs/archive/AGENTS-HISTORICO-2026-09-17.md`](../archive/AGENTS-HISTORICO-2026-09-17.md).
>
> Estados possíveis: `pendente` · `preparado` (prompt escrito, envio não
> confirmado) · `em execução` (usuário confirmou envio) · `retorno
> recebido/em análise` · `concluído` · `bloqueado`. Não presumir avanço de
> estado sem evidência (commit, branch, retorno colado pelo usuário) — ver
> [`SESSION_PROTOCOL.md`](SESSION_PROTOCOL.md).

## Fila ativa (a partir de 2026-09-17)

| ID | Prioridade | Estado | Dependência | Impacto em produção | Próxima ação |
|---|---|---|---|---|---|
| TASK-2026-09-17-01 — Entrega 40-A (continuidade operacional) | P1 | **concluído e publicado** (via 41-C) | Nenhuma | Nenhum — já em produção | Nenhuma — ver TASK-2026-09-17-04 |
| TASK-2026-09-17-02 — Entrega 41-A: auditar `fe20832` e restaurar reprodutibilidade | P1 (era P0) | **concluído e publicado** (via 41-C) | Nenhuma | Nenhum — já em produção | Nenhuma — ver TASK-2026-09-17-04 |
| TASK-2026-09-17-03 — Entrega 41-B: gate final da auditoria `fe20832` | P1 | **concluído e publicado** (via 41-C) | Nenhuma | Nenhum — já em produção | Nenhuma — ver TASK-2026-09-17-04 |
| TASK-2026-09-17-04 — Entrega 41-C: integrar e publicar 40-A/41-A/41-B | P1 (era P0) | **concluído e publicado** | Nenhuma | `main` avançou `fe20832` → `a359b3d` (merge `c2b412d` + registro), deploy em produção confirmado | Nenhuma — ver "RETORNO: 41-C" em `docs/diretoria/registro.md` |
| TASK-2026-09-17-05 — Corrigir limpeza residual do spec 23-B | P2 | pendente | Nenhuma; executar depois da publicação | Nenhum em produção; fixture somente local | Auditar `finally`/`afterEach` do spec de proveniência em entrega separada |
| TASK-2026-09-17-06 — Sanear worktree órfão `.claude/worktrees/agent-abf9bcb34c941c5ba` | P2 | **bloqueado** — ver nota abaixo | Nenhuma | Nenhum em produção | Encerrar `node`/`esbuild` ativos na pasta (não autorizado nesta entrega) e então remover com aprovação interativa específica |
| TASK-2026-09-17-07 — Tornar `canonical` realmente canônica (main, limpa, sem worktree aninhado) | P1 | **concluído nesta entrega** — ver nota abaixo | Nenhuma | Nenhum — só limpeza local de worktrees transitórios, sem tocar main/produção/Supabase remoto | Nenhuma para `41b`/branches locais; TASK-2026-09-17-06 segue como único item aberto |
| Missão 42-A — Entrada assistida de materiais ("Importar material" no CMS) | P1 | **concluído tecnicamente, branch candidata só local** | Nenhuma | Nenhum — `work/42a-import-assistido` não foi enviada ao remoto nem mesclada em `main` | Diretoria decide: revisar diff e autorizar push da branch candidata / merge em `main` |

**Nota sobre a limpeza de worktrees da TASK-07 (2026-09-17, execução real)**:

- Removidas com `git worktree remove` (sem `--force`), após confirmar
  árvore limpa e nenhum processo com handle aberto na pasta:
  `worktrees/41a-consolidacao-docfix` (branch `work/41a-consolidacao-docfix`,
  ponta em `66aff30`) e `worktrees/reconciliacao-docs-pos-41c` (branch
  `work/reconciliacao-docs-pos-41c`, ponta em `0cbcb8c`). Em ambos os
  casos o `git worktree remove` desregistrou a worktree mas falhou ao
  apagar alguns arquivos da pasta física (`Permission denied` — lock
  transitório do OneDrive); confirmado que o `.git` interno já tinha sido
  removido (pasta comum, não mais um worktree Git) antes de apagar o
  restante com uma remoção de arquivo comum. As branches não foram
  apagadas — os commits `66aff30` e `0cbcb8c` continuam alcançáveis por
  elas, mas **não estão mesclados em `main` nem na candidata remota
  `work/fase2-reconciliacao-consolidada` (`552dcea`)** — são apenas
  correções de texto em `PROJECT_STATE.md`/`TASKS.md`, sobrepostas pelo
  conteúdo desta própria candidata; decisão de descartar as branches ou
  reaproveitar o texto fica para a diretoria.
- **Não removida**: `worktrees/41b-gate-final-fe20832` (branch
  `work/41b-gate-final-fe20832`, `b5a8f7f` — já mesclada em `main` via
  `c2b412d`, então sem perda de conteúdo se fosse removida). Encontrado
  processo ativo usando a pasta: `node.exe` (PID 33140, `vite --port=3000
  --host=0.0.0.0`, iniciado 2026-09-17 13:50) com filho `esbuild.exe`
  (PID 5656). Como a missão só autorizava remoção após confirmar ausência
  de processo, a remoção foi propositalmente pulada; o processo não foi
  encerrado.
- Pasta órfã `canonical/.claude/worktrees/agent-a24024165df13bbd9`
  (sem `.git`, sem processo ativo, apenas build/`node_modules` de execução
  antiga de agente) removida com aprovação interativa específica do
  usuário, sem curinga, sem tocar `agent-abf9bcb34c941c5ba` (que segue
  pendente — TASK-2026-09-17-06) nem o resto de `.claude/`.
- `canonical` confirmado em `main`, árvore limpa (só `.claude/` não
  rastreado), `main` == `origin/main` == `a359b3d`.
- Nenhum branch local apagado; nenhuma escrita em Supabase/produção/AI
  Studio/clones antigos/junções; esta candidata **não foi publicada**
  nesta sessão.

**Nota sobre a conclusão da limpeza local da Fase 2 (2026-09-17, segunda execução)**:

- Candidata `work/fase2-reconciliacao-consolidada` publicada no remoto no
  commit `555bab2` (ponta desta nota, antes de commitá-la) sem tocar `main`.
- `worktrees/41b-gate-final-fe20832`: confirmado que `node.exe` (PID 33140,
  `vite --port=3000 --host=0.0.0.0`, pai `cmd.exe` PID 8052) e `esbuild.exe`
  (PID 5656, filho do node) pertenciam só a esse servidor de dev. Ambos
  encerrados normalmente (sem `-Force`); pai `cmd.exe` também terminou.
  Árvore confirmada limpa e `git worktree remove` (sem `--force`) executado:
  desregistrou a worktree, mas voltou a falhar em apagar alguns arquivos da
  pasta física (`Permission denied`, provável lock transitório do OneDrive).
  Como da vez anterior, confirmado que a pasta já não era mais um worktree
  Git (metadados removidos) antes de eliminar o restante com uma remoção de
  arquivo comum — conteúdo já preservado no branch `work/41b-gate-final-fe20832`
  (`b5a8f7f`, mesclado em `main` via `c2b412d`), sem perda.
- Branches locais superadas apagadas: `work/41a-consolidacao-docfix`
  (`66aff30`) e `work/reconciliacao-docs-pos-41c` (`0cbcb8c`). Nenhuma branch
  remota tocada; os commits seguem alcançáveis em `origin` pelas branches
  remotas homônimas.
- Pasta `canonical/.claude/worktrees/agent-abf9bcb34c941c5ba` verificada:
  sem `.git` (confirmado — não é worktree Git), conteúdo próprio (checkout
  de `fe20832` mais `node_modules`/`dist` locais), mas **com processo ativo**:
  `node.exe` (PID 28852, `vite --port=3000 --host=0.0.0.0`) e `esbuild.exe`
  filho (PID 32692) rodando dentro dela — diferente da pasta irmã
  `agent-a24024165df13bbd9`, já removida numa entrega anterior. Como esse
  encerramento de processo não estava autorizado no escopo desta tarefa
  (só os PIDs do worktree `41b` foram autorizados) e a missão também exige
  aprovação interativa específica antes de remover, a pasta **não foi
  tocada** — TASK-2026-09-17-06 permanece bloqueada até o usuário autorizar
  encerrar esse servidor e aprovar a remoção.
- `canonical` confirmado em `main`, `main` == `origin/main`, árvore limpa
  (só `.claude/` não rastreado, como antes). Nenhuma escrita em
  Supabase/produção/AI Studio/clones antigos/junções; `main` não foi
  mesclada nem publicada nesta sessão.

## Como adicionar uma tarefa

Cada linha nova precisa, no mínimo: um identificador único e estável
(`TASK-AAAA-MM-DD-NN` ou o número de entrega da diretoria, ex. `41-A`),
prioridade (`P0` bloqueia produção/segurança, `P1` é a fila normal, `P2`
é melhoria sem urgência), estado atual, dependência explícita (ou
"nenhuma"), se toca produção/dado real, e uma próxima ação concreta — nunca
"acompanhar" ou "ver depois".

## Itens do registro legado ainda sem retorno formal (não migrados, só
sinalizados)

`docs/diretoria/registro.md` tem prompts antigos (03, 04, 05, de
2026-09-07) marcados "aguardando retorno"/"sem retorno registrado" na
abertura de suas seções, mas o mesmo arquivo tem entradas posteriores
("Concluído — 09-B", por exemplo) que sugerem que o conteúdo de pelo menos
o Prompt 03 foi efetivamente publicado depois. **Não verificado nesta
entrega** se os Prompts 04 e 05 seguem pendentes de verdade ou se foram
superados por trabalho posterior sem fechamento formal — reconciliar isso
é trabalho de conteúdo/histórico, fora do escopo da 40-A (que é só
estrutura de documentação). Se uma sessão futura for atrás disso, comece
lendo `docs/diretoria/registro.md` na íntegra, não só esta nota.
