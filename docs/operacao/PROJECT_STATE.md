# PROJECT_STATE.md — estado presente verificável (NexusMed)

> Fatos sobre os ambientes, curtos e verificáveis. **O que construir e em que
> estado está cada unidade** está no plano canônico,
> [`docs/produto/PLANO-DE-DESENVOLVIMENTO.md`](../produto/PLANO-DE-DESENVOLVIMENTO.md);
> **por que** cada decisão foi tomada, em [`DECISIONS.md`](DECISIONS.md). O
> diário de cada entrega até 2026-09-23 está preservado sem cortes em
> [`docs/archive/PROJECT_STATE-HISTORICO-2026-09-23.md`](../archive/PROJECT_STATE-HISTORICO-2026-09-23.md).
>
> O que não pôde ser confirmado por leitura direta está marcado **não
> verificado**. Hash e contagem citados aqui são baseline da data indicada —
> reconfira antes de agir. Este arquivo cabe numa tela: atualize o fato, não
> acrescente narrativa (a narrativa é o PR).

**Última atualização:** 2026-09-23, pela diretoria.

## Fonte de verdade

- **Repositório:** `github.com/viniciuskato/NexusMed` (**público** — nada de
  segredo em commit), branch `main`. O nome antigo,
  `SynapseMed-firebase-auth`, ainda aparece em documentos históricos.
- **Cópia de trabalho:** `C:\Users\vinic\dev\NexusMed`; worktrees de trabalho
  em `.claude/worktrees/`.
- **`main` protegido** pelo ruleset "Proteger main (PR + CI obrigatorios)",
  ativo: PR obrigatório, checks `fast (typecheck + lint + unit + build)` e
  `full (pgTAP + Playwright contra Supabase local)`, sem force-push nem
  exclusão. Conferido pela API do GitHub em 2026-09-23.
- **Merge em `main` é deploy** automático na Vercel.
- Chats, memória de IA e cópias soltas não são fonte de verdade.

## Como reconfirmar

```
git fetch origin
git status --short --branch
git log --oneline -5 origin/main
supabase migration list --linked
```

## Ambientes

| Ambiente | Estado | Conferido em |
|---|---|---|
| **Produção** | `https://synapse-med-firebase-auth.vercel.app`. Último deploy com mudança de app: PR #62 (`6d1f71d`), confirmado pelo SHA no bundle, sem instrumentação de teste. Depois dele, só CI (#63) e documentação (#64 a #67); `main` em `fcc5421`. | 2026-09-23 |
| **Supabase remoto** | Projeto `synapsemed`, ref `jfvhwwvixwvgjfqzlkkb`, `sa-east-1`. 29 migrations, igual ao repositório; a última, `20260923120000_salvar_sem_perda_e_importar_na_arvore`, aplicada antes do merge do #62 e verificada por leitura direta. | 2026-09-23 |
| **Conteúdo em produção** | 38 materiais (todos com `mode` nulo); 420 questões, 9 ligadas a material. | 2026-09-23 |
| **CI** | GitHub Actions, `fast` e `full`; o `full` baixa as imagens do Supabase do ECR Public desde o PR #63 (o ghcr.io passou a recusar). | 2026-09-23 |
| **Local** | Supabase via CLI (`supabase start` / `db reset` / `test db`), onde toda mudança de schema é testada. Última suíte completa: pgTAP 398/398, Vitest 257/257, E2E do fluxo de importação 7/7. | 2026-09-23 (PR #62) |

Painel do Supabase (cadastro, URLs de retorno, limite de linhas da API,
PKCE, limites do plano): **não verificado** — pendência P-1 do plano.

## Riscos abertos

- **26 achados da auditoria de 19/09 continuam abertos**, todos agendados em
  unidades do plano (frentes 45 e 46); os mais graves estão na seção 2 do
  plano. Detalhe técnico em `docs/diretoria/BACKLOG-ESTRATEGICO.md`.
- **Sem backup fora do Supabase** (AUD-13) — unidade 46-C, espera a P-2.
- **Leitura de dados de produção por sessão de IA:** em 2026-09-23 o
  classificador do Claude Code bloqueou uma consulta só de leitura no remoto
  (`supabase db query --linked`). Consultas em produção ficam com o dono.

## Branches e quarentenas

- **`work/integracao-estabilizacao-11b`** — não mesclada, **de propósito**:
  guarda uma correção de duplicação de SRS de flashcard que depende de uma
  reconciliação nunca concluída. Não apagar sem decisão (DECISIONS,
  2026-09-22).
- **`work/carga-conteudo-nativo-yaml`** — o DECISIONS de 2026-09-22 diz que
  foi apagada, mas **continua no remoto** (2 commits fora do `main`, último
  de 2026-09-11). Superada pela importação de questões; apagar é decisão do
  dono.
- **Branches remotas já mescladas** (docs/*, work/*, feat/*, ci/*) — podem ser
  apagadas quando o dono quiser; nenhuma guarda trabalho fora do `main`.
- **Cópias antigas no OneDrive e um `.git` órfão** — quarentena desde
  2026-09-17: não são fonte de verdade, não usar nem apagar sem pedido
  explícito. Lista no arquivo histórico, seção "Riscos e quarentenas
  conhecidas". Conteúdo não reauditado desde então.
