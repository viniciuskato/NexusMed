# TASKS.md — fila operacional

> Só o que está **aberto**: incidentes, pendências avulsas e decisões
> operacionais que não são unidades do plano. **As unidades de implementação
> não entram aqui** — estão no plano canônico,
> [`docs/produto/PLANO-DE-DESENVOLVIMENTO.md`](../produto/PLANO-DE-DESENVOLVIMENTO.md).
> Tarefa concluída sai desta tabela; o PR é o registro dela. Tudo que foi
> executado até 2026-09-23 está preservado em
> [`docs/archive/TASKS-HISTORICO-2026-09-23.md`](../archive/TASKS-HISTORICO-2026-09-23.md).
>
> Estados: `pendente` · `em execução` · `em PR` · `bloqueado`. Não presumir
> avanço sem evidência (commit, PR, retorno) — ver
> [`SESSION_PROTOCOL.md`](SESSION_PROTOCOL.md).

## Fila

| ID | Prioridade | Estado | Dependência | Impacto em produção | Próxima ação |
|---|---|---|---|---|---|
| TASK-2026-09-24-01 — Simulados finalizados na janela do INC-2026-004 podem ter ficado com nota vazia | P2 | pendente | Nenhuma | Nota exibida como 0 para quem finalizou simulado entre 19:03 e 19:15 UTC de 24/09 | Dono roda no SQL Editor, só leitura: simulados com `completed_at` nessa janela e `score` nulo. Nenhum → encerrar; havendo → a trilha 1 recalcula a nota a partir das tentativas gravadas |
| AS1 — primeira onda editorial: auditoria científica e conversão dos temas 12 (Dispneia) e 19 (Endocardite Infecciosa); decidir a duplicata da Endocardite antes de fechar o tema 19 | P2 | pendente | Nenhuma | Nenhum até publicação | A prova de 21/09 passou; o conteúdo continua valendo (cobertura de todo o conhecimento médico, por partes — `DECISIONS.md`, 2026-09-23). Entra na produção editorial (seção 12 do plano) quando a diretoria ordenar os ramos |
| AS1 — segunda onda editorial: auditoria dos materiais dos temas 1 (Avaliação da Função Renal), 8 a 11 (Hemograma/Anemias) e 16 (Semiologia Cardíaca); decidir as duplicatas de Função Renal e de Semiologia Cardíaca | P2 | pendente | Nenhuma | Nenhum até publicação | Idem à primeira onda |

Encerradas em 2026-09-24, pela diretoria: **TASK-2026-09-23-09** (destino
da `work/integracao-estabilizacao-11b`: correção reaproveitada na 45-A parte
2, PR #76; restos viraram aceite da 45-G e da 45-H; branch apagada) e
**TASK-2026-09-23-08** (`work/carga-conteudo-nativo-yaml` apagada do remoto) —
`DECISIONS.md`, 2026-09-24.

Encerradas antes: **TASK-2026-09-23-07** (decisões D-1 a
D-3, trilhas e enxugamento destes documentos — PRs #68 e #69, mesclados em
2026-09-24). Sem execução, na limpeza de 2026-09-23: **TASK-2026-09-17-06**
(worktree órfão `agent-abf9bcb34c941c5ba`) — a pasta não existe mais
(conferido em 2026-09-23).

## Como adicionar uma tarefa

Cada linha nova precisa de: identificador único e estável
(`TASK-AAAA-MM-DD-NN`), prioridade (`P0` bloqueia produção ou segurança,
`P1` é a fila normal, `P2` é melhoria sem urgência), estado, dependência
explícita (ou "nenhuma"), se toca produção ou dado real, e uma próxima ação
concreta — nunca "acompanhar" ou "ver depois". Se o que você vai registrar é
uma entrega com aceite, é uma unidade do plano, não uma tarefa.
