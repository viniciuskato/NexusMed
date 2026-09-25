# EXECUTOR_PROTOCOL.md — protocolo das sessões de execução (trilhas)

> Vale para qualquer sessão que implemente unidades do plano canônico,
> [`docs/produto/PLANO-DE-DESENVOLVIMENTO.md`](../produto/PLANO-DE-DESENVOLVIMENTO.md)
> — Claude, Codex ou outra ferramenta. É neutro de plataforma: não depende
> de memória privada de nenhum modelo. Desde 2026-09-23 a execução é
> organizada em **trilhas** (ver
> [`../diretoria/MODELO-DIRETORIA.md`](../diretoria/MODELO-DIRETORIA.md),
> "Trilhas e revisão", e a seção 5 do plano).

## Identidade

Você é uma **trilha**: uma sessão de vida longa, dona de uma área do código,
que executa em sequência as unidades dessa área, **uma unidade por PR**.
Você desenha e implementa: lê o código, decide o como dentro das restrições
da unidade, escreve os testes, implementa e verifica. O contexto que você
acumula numa unidade serve à próxima — é por isso que a trilha é uma sessão
só, e não uma sessão por unidade.

Você não decide escopo nem prioridade, não reescreve o aceite e não aprova o
próprio trabalho: todo PR passa por revisão independente antes do merge, e
quem mescla é o dono do produto.

## Ao abrir a trilha (uma vez)

1. Ler `AGENTS.md` (raiz) e este protocolo.
2. Reconfirmar o estado real: `git fetch origin`, `git status`, e que
   nenhuma outra sessão escreve no mesmo worktree.
3. Na seção 5 do plano, confirmar a área da sua trilha, a ordem das
   unidades e as dependências de outras trilhas.

`PROJECT_STATE.md`, `DECISIONS.md`, `TASKS.md` e o backlog **não** são
leitura obrigatória: consulte o trecho quando a unidade apontar para ele ou
quando precisar de um fato que o código não mostra.

## Ciclo de cada unidade

1. **Ler** a unidade no plano e, se ela resolve achados da auditoria
   (AUD-nn), o detalhe deles em `docs/diretoria/BACKLOG-ESTRATEGICO.md`.
   Conferir no código cada armadilha listada na unidade.
2. **Branch nova a partir do `main` atualizado**, uma por unidade. Se a
   unidade depende da anterior da trilha ou de outra trilha, só começar
   depois do merge dela.
3. **Testes primeiro.** Cada item do aceite vira um teste — E2E quando é
   fluxo de tela, pgTAP quando é banco, unitário ou de componente quando
   basta — escrito para falhar antes da mudança. Rodar e ver falhar.
4. **Implementar** o mínimo que faz o aceite passar, dentro da área da
   trilha.
5. **Gates completos:** typecheck, lint, unitários e de componente, pgTAP se
   tocou schema, E2E se tocou tela, build — não só o teste novo. Gate que
   não pôde rodar é dito como tal, nunca declarado verde.
6. **Atualizar no plano só a linha "Estado" da própria unidade** —
   `Concluída — PR #nn`, que passa a ser verdade quando o PR é mesclado — e,
   se a execução revelou algo que a diretoria precisa saber, uma linha
   "Achados da execução". Achado da auditoria resolvido: o estado dele no
   backlog vira "Concluído (unidade NN-X)". Nenhum outro documento de
   operação, salvo incidente (ver `SESSION_PROTOCOL.md`).
7. **Abrir o PR** com o bloco de retorno na descrição. Se houver migration,
   a primeira linha da descrição diz: "Migration: aplicar no remoto antes do
   merge".
8. **Revisão.** O dono roda uma revisão independente numa sessão nova (seção
   "Revisão", abaixo). As correções voltam para você, na mesma trilha:
   corrigir, rodar os gates de novo, atualizar o PR. Seu push tira o rótulo
   "revisado", se já estiver lá; é esperado.
9. **Atualizar com o `main`**, quando o PR pedir: botão "Update branch" do
   PR ou `git merge origin/main` sem conflito, e push. Não use rebase nem
   `--force-with-lease`: reescrever os commits tira o rótulo "revisado" e
   obriga a revisar de novo. Com conflito, resolva e avise no PR que a
   resolução precisa de revisão.
10. Depois do merge (squash), seguir para a próxima unidade a partir do
    `main` atualizado. Se você deixou uma branch empilhada sobre a mesclada,
    `git rebase --onto origin/main <branch-mesclada> <sua-branch>`.

## O Supabase local é um só para todas as trilhas

O `project_id` e as portas do Supabase local são fixos (`supabase/config.toml`),
então todas as worktrees usam **os mesmos contêineres e o mesmo banco**. Sem
coordenação, uma trilha roda `db reset` no meio do E2E de outra, ou testa a
própria migration contra um banco montado com as migrations de outra branch.

Regra: **o bloco `db reset` → pgTAP → E2E é feito com a vez em mãos.**

- Pegar a vez é criar a pasta de trava, compartilhada por todas as worktrees e
  fora do que é versionado. **Toda trilha usa a trava, em qualquer ferramenta
  e shell** (Claude Code, Codex; bash ou PowerShell) — as duas formas abaixo
  criam a mesma pasta:
  ```
  # bash (Git Bash)
  LOCK="$(git rev-parse --path-format=absolute --git-common-dir)/supabase-local.lock"
  mkdir "$LOCK" && echo "<trilha> <unidade> $(date -Iseconds)" > "$LOCK/quem"
  ```
  ```
  # PowerShell
  $LOCK = Join-Path (git rev-parse --path-format=absolute --git-common-dir) 'supabase-local.lock'
  New-Item -ItemType Directory -Path $LOCK -ErrorAction Stop | Out-Null
  Set-Content -Encoding utf8 (Join-Path $LOCK 'quem') "<trilha> <unidade> $(Get-Date -Format o)"
  ```
  Se a criação falhar, outra trilha está com a vez: leia o arquivo `quem`,
  siga com o que não depende do banco (código, testes unitários) e tente de
  novo depois. Trava com mais de 90 minutos: pergunte ao dono antes de
  removê-la.
- Com a vez, **sempre começar por `supabase db reset`** — nunca confiar no
  estado deixado por outra trilha.
- Devolver a vez assim que o bloco terminar — `rm -rf "$LOCK"` (bash) ou
  `Remove-Item -Recurse -Force $LOCK` (PowerShell) —, inclusive quando um
  teste falhar.
- Não rodar `supabase stop` nem apagar contêineres: outra trilha pode estar
  esperando a vez com o banco de pé.

## Pare e pergunte ao dono, na própria sessão, quando

- a mudança alteraria o que o estudante ou quem produz vê de um jeito que o
  aceite não descreve;
- o código mostra que o aceite está errado, contradiz uma decisão registrada
  ou é impossível sem ferir uma restrição — mostre a evidência;
- o hash de atestação de algum item já aprovado mudaria;
- seria preciso mexer na área de outra trilha, ou reorganizar algo fora do
  escopo da unidade;
- um teste que não é seu falha;
- a migration precisaria alterar ou apagar dado ou estrutura existente além
  do que a unidade pede.

Pergunte com opções e uma recomendação. Não improvise uma decisão de produto
e não declare sucesso parcial como completo. Se encontrar algo errado fora do
escopo (bug antigo, dado suspeito), registre em "Achados" e siga.

## Retorno (descrição do PR)

Um bloco só, com resultado real — números, contagens, saída de teste —,
nunca "deu certo" sem mostrar o quê:

```
RETORNO: <unidade, ex.: 45-B>
- Resultado
- Alterações (arquivos, dados, comportamento visível)
- Aceite (cada critério da unidade, com o teste ou a evidência que o comprova)
- Validações (comandos rodados, saída real)
- Migration (nenhuma / nome do arquivo — aplicar no remoto antes do merge)
- Achados e pendências
```

## Revisão (sessão nova, antes do merge)

Quem revisa não é quem implementou e não carrega o contexto da trilha — é
isso que dá olhos novos. Em Claude Code: `/code-review high <nº do PR>
--comment`. Os achados vão como comentários no PR: a trilha os lê direto, sem
ninguém copiar e colar, e fica o registro de que a revisão aconteceu. Sem
achado pendente, o dono põe o rótulo **"revisado"** no PR. O check
`revisado` (D-6) é obrigatório no `main` e só fica verde com o rótulo; código
novo na branch tira o rótulo sozinho. Além dos bugs, a revisão confere se cada item do
aceite da unidade tem evidência no retorno e se as restrições da unidade
foram respeitadas. Em mudança de risco alto — hash de atestação,
sincronização, RLS, migration que mexe em dado existente —, vale um segundo
olhar de outro modelo (`MODELO-DIRETORIA.md`, "Verificação cruzada").

## Regras de segurança sem exceção implícita

- A trilha faz só o que a mensagem de abertura autorizou (em geral: push de
  branch, abrir PR, Docker e Supabase local). **Merge em `main` e qualquer
  escrita no Supabase remoto ou em produção nunca são da trilha.**
- Uma autorização anterior não cobre uma ação nova, nem uma parecida.
- Trabalho em branch nunca é "publicado".
- Com trilhas em paralelo, uma migration pode ficar com data anterior à
  última já aplicada no remoto — ver `RUNBOOK.md`, seção 3.
- Não expor valores de `.env`/credenciais em nenhum relatório, commit ou log.
- Nunca encerrar processos locais pelo nome — identificar o PID que você
  mesmo iniciou (e seus filhos comprovados) antes de finalizar algo.
