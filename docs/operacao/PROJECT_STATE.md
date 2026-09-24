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

**Última atualização:** 2026-09-24, pela diretoria.

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
| **Produção** | `https://synapse-med-firebase-auth.vercel.app`. Último deploy: `main` em `095e2ab` (merge do PR #76), confirmado pelo SHA no bundle (`__APP_RELEASE__` = `095e2abf5ce3`), sem instrumentação de teste (0 em 22 arquivos JS). Publicadas em 24/09: 45-B (#71), 45-J (#72), 45-C (#73), 45-A parte 1 (#74) e parte 2 (#76, com migration). | 2026-09-24 |
| **Supabase remoto** | Projeto `synapsemed`, ref `jfvhwwvixwvgjfqzlkkb`, `sa-east-1`. 30 migrations, igual ao repositório (`migration list --linked`). A última, `20260924120000_student_data_reliability_45a`, foi aplicada pelo dono ~10 min **depois** do merge do #76 ([INC-2026-004](incidents/INC-2026-004-migration-45a-depois-do-merge.md)). | 2026-09-24 |
| **Conteúdo em produção** | 38 materiais (todos com `mode` nulo); 420 questões, 9 ligadas a material. | 2026-09-23 |
| **CI** | GitHub Actions, `fast` e `full`, em todo PR, no push do `main` e à mão (desde o PR #70; antes, rodava duas vezes por push de PR). O `full` baixa as imagens do Supabase do ECR Public desde o PR #63. | 2026-09-24 |
| **Local** | Supabase via CLI (`supabase start` / `db reset` / `test db`), onde toda mudança de schema é testada — um só banco para todas as worktrees; ver a trava em `EXECUTOR_PROTOCOL.md`. Última suíte completa relatada (PR #76): Vitest 277/277, pgTAP 442/442, E2E 49/49, lint 3 avisos (teto 3). | 2026-09-24 |

Painel do Supabase (cadastro, URLs de retorno, limite de linhas da API,
PKCE, limites do plano): **não verificado** — pendência P-1 do plano.

## Riscos abertos

- **21 achados da auditoria continuam abertos** (de 26; em 24/09 fecharam
  AUD-17, AUD-18, AUD-20, AUD-21 e AUD-23), todos agendados em unidades do
  plano (frentes 45 e 46); os mais graves estão na seção 2 do plano. Detalhe técnico em `docs/diretoria/BACKLOG-ESTRATEGICO.md`.
- **PR com migration pode ser mesclado sem ela no remoto** — aconteceu em
  21/09 e 24/09 (INC-2026-003 e INC-2026-004). Até a 46-E (CI confere o
  remoto), o dono confere `supabase migration list --linked` antes de mesclar.
- **Sem backup fora do Supabase** (AUD-13) — unidade 46-C, espera a P-2.
- **Leitura de dados de produção por sessão de IA:** em 2026-09-23 o
  classificador do Claude Code bloqueou uma consulta só de leitura no remoto
  (`supabase db query --linked`). Consultas em produção ficam com o dono.

## Branches e quarentenas

- **`work/integracao-estabilizacao-11b`** — destino decidido em 24/09
  (`DECISIONS.md`): o que ela tinha de útil está na 45-A ou virou aceite da
  45-G e da 45-H. Apagada assim que o registro de 24/09 for mesclado (ponta
  `cc09bb1`).
- **`work/carga-conteudo-nativo-yaml`** — apagada do remoto em 24/09 (ponta
  `a5dce95`).
- **Branches remotas já mescladas** (docs/*, work/*, feat/*, ci/*) — podem ser
  apagadas quando o dono quiser; nenhuma guarda trabalho fora do `main`.
- **Cópias antigas no OneDrive e um `.git` órfão** — quarentena desde
  2026-09-17: não são fonte de verdade, não usar nem apagar sem pedido
  explícito. Lista no arquivo histórico, seção "Riscos e quarentenas
  conhecidas". Conteúdo não reauditado desde então.
