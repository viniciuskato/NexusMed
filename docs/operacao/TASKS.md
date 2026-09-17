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
| TASK-2026-09-17-01 — Entrega 40-A (continuidade operacional) | P1 | concluído; integração bloqueada | Retorno 40-A auditado pela diretoria em 2026-09-17 | Nenhum no conteúdo; merge em `main` acionaria novo deploy | Decidir integração junto com a 41-A (mesma branch candidata contém as duas) |
| TASK-2026-09-17-02 — Entrega 41-A: auditar `fe20832` e restaurar reprodutibilidade | P1 (era P0) | concluído; superado pela 41-B | Nenhuma | Nenhum diretamente — branch candidata substituída por `work/41b-gate-final-fe20832` | Ver TASK-2026-09-17-03 |
| TASK-2026-09-17-03 — Entrega 41-B: gate final da auditoria `fe20832` | P1 | concluído e aprovado; candidata remota `367f75c` | Gates completos verdes | Nenhum até integração; candidata não mesclada | Publicar somente pela Entrega 41-C |
| TASK-2026-09-17-04 — Entrega 41-C: integrar e publicar 40-A/41-A/41-B | P1 (era P0) | **concluído e publicado** | Nenhuma | `main` avançou `fe20832` → `c2b412d`, deploy em produção confirmado | Nenhuma — ver "RETORNO: 41-C" em `docs/diretoria/registro.md` |
| TASK-2026-09-17-05 — Corrigir limpeza residual do spec 23-B | P2 | pendente | Nenhuma; executar depois da publicação | Nenhum em produção; fixture somente local | Auditar `finally`/`afterEach` do spec de proveniência em entrega separada |
| TASK-2026-09-17-06 — Sanear worktree órfão `.claude/worktrees/agent-abf9bcb34c941c5ba` | P2 | pendente | Commits 41-A/41-B preservados local e remotamente | Nenhum em produção | Fazer manutenção Git separada, com permissões adequadas; não remover manualmente sem inventário final |

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
