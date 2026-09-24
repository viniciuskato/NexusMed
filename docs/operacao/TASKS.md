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
| TASK-2026-09-23-07 — Decisões D-1 a D-3, execução em trilhas e enxugamento de `PROJECT_STATE`/`TASKS` | P1 | **em PR** — #68 (decisões e trilhas) e o PR desta limpeza | Nenhuma | Nenhum — só documentação | Dono revisa e mescla os dois PRs; depois, abrir as trilhas (seção 0 do plano) |
| TASK-2026-09-23-09 — Destino da branch `work/integracao-estabilizacao-11b` (correção de duplicação de SRS de flashcard, nunca mesclada) | P2 | pendente — decisão aberta desde 2026-09-22 | Nenhuma | Nenhum enquanto não mesclada | A trilha 1, ao executar a 45-A ou a 45-E (duplicação de revisões), verifica se o bug ainda reproduz e propõe ao dono: (a) destravar a reconciliação e mesclar, ou (b) apagar a branch registrando o motivo em `DECISIONS.md` |
| TASK-2026-09-23-08 — Branch `work/carga-conteudo-nativo-yaml` ainda existe no remoto, embora o `DECISIONS.md` de 2026-09-22 a dê como apagada | P2 | pendente | Nenhuma | Nenhum | Dono confirma e apaga a branch remota (superada pela importação de questões) |
| AS1 — primeira onda editorial: auditoria científica e conversão dos temas 12 (Dispneia) e 19 (Endocardite Infecciosa); decidir a duplicata da Endocardite antes de fechar o tema 19 | P2 | pendente | Nenhuma | Nenhum até publicação | A prova de 21/09 passou; o conteúdo continua valendo (cobertura de todo o conhecimento médico, por partes — `DECISIONS.md`, 2026-09-23). Entra na produção editorial (seção 12 do plano) quando a diretoria ordenar os ramos |
| AS1 — segunda onda editorial: auditoria dos materiais dos temas 1 (Avaliação da Função Renal), 8 a 11 (Hemograma/Anemias) e 16 (Semiologia Cardíaca); decidir as duplicatas de Função Renal e de Semiologia Cardíaca | P2 | pendente | Nenhuma | Nenhum até publicação | Idem à primeira onda |

Encerrado na limpeza de 2026-09-23, sem execução: **TASK-2026-09-17-06**
(worktree órfão `agent-abf9bcb34c941c5ba`) — a pasta não existe mais
(conferido em 2026-09-23).

## Como adicionar uma tarefa

Cada linha nova precisa de: identificador único e estável
(`TASK-AAAA-MM-DD-NN`), prioridade (`P0` bloqueia produção ou segurança,
`P1` é a fila normal, `P2` é melhoria sem urgência), estado, dependência
explícita (ou "nenhuma"), se toca produção ou dado real, e uma próxima ação
concreta — nunca "acompanhar" ou "ver depois". Se o que você vai registrar é
uma entrega com aceite, é uma unidade do plano, não uma tarefa.
