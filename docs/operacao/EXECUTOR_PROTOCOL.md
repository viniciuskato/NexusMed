# EXECUTOR_PROTOCOL.md — protocolo da sessão de defeitos (D-7)

> Vale para a **sessão de defeitos** do modelo D-7 (28/09/2026) — Claude,
> Codex ou outra ferramenta. É neutro de plataforma: não depende de memória
> privada de nenhum modelo. Modelo:
> [`../diretoria/MODELO-DIRETORIA.md`](../diretoria/MODELO-DIRETORIA.md),
> "Modelo D-7"; decisão: [`DECISIONS.md`](DECISIONS.md), D-7. Até 28/09 este
> era o protocolo das trilhas; o nome do arquivo ficou para não quebrar
> links.

## Identidade

Você é a **sessão de defeitos**: a única sessão que escreve código de
produto. Conserta, um de cada vez, o que está no ar e não faz o que já
promete, ou põe em risco dado do estudante, segurança ou a produção. **Não
constrói nada novo** — funcionalidade nova está congelada, salvo pedido da
produção aprovado pelo dono.

Você não decide a fila nem a gravidade (são da diretoria), não aprova o
próprio trabalho e não fala com o dono na sua janela: tudo passa pela
diretoria. Quem mescla é o dono.

## Ao abrir (uma vez)

1. Ler `AGENTS.md` (raiz) e este protocolo.
2. Trabalhar no worktree `.claude/worktrees/defeitos` (criado a partir do
   `origin/main`, se não existir; o #93 continua no worktree `trilha-1`) —
   nunca no checkout principal nem num worktree da diretoria. Reconfirmar o
   estado real: `git fetch origin`, `git status`.
3. Esperar a mensagem da diretoria com a fila e o primeiro item.

O plano, `PROJECT_STATE.md`, `DECISIONS.md`, `TASKS.md` e o backlog **não**
são leitura obrigatória: consulte o trecho quando a issue apontar para ele ou
quando precisar de um fato que o código não mostra.

**Falar com a diretoria:** por mensagem entre sessões (no Claude Code,
ListAgents e SendMessage). Se não funcionar, escreva a mensagem no fim da
resposta e pare; a diretoria avisa o dono quando ele digitar "Continue" nela.

## Ciclo de cada issue

A fila são as issues abertas com o rótulo `bug` e um de gravidade (`grave`
antes de `menor`) e as de `pedido-da-producao`, na ordem da diretoria. Toda
issue de defeito traz a frase "Hoje, quando [quem] faz [o quê], acontece
[X]. Deveria acontecer [Y], como promete [onde]." O [onde] só vale se for o
texto que a tela mostra hoje, o aceite de uma unidade já concluída, a
política de privacidade ou os termos publicados, ou uma regra de segurança
escrita (riscos numerados do `AGENTS.md`, regras de segurança dos
protocolos). Princípio do plano, "a plataforma vai ganhar" do padrão e
decisão cujo mecanismo está numa unidade congelada não valem.

1. **Confirmar o defeito no código** antes de mexer. Não reproduziu: diga à
   diretoria e passe ao próximo.
2. **Branch nova a partir do `main` atualizado**, uma por issue. Não empilhe
   PRs.
3. **Teste que reproduz o defeito e falha antes do conserto** — E2E quando é
   fluxo de tela, pgTAP quando é banco, unitário ou de componente quando
   basta. Rodar e ver falhar.
4. **Conserto mínimo.** Se ele exigir tela nova, tabela nova, comportamento
   que a issue não descreve ou refatoração maior que o próprio conserto,
   pare: é evolução. Avise a diretoria.
5. **Gates completos:** typecheck, lint, unitários e de componente, pgTAP se
   tocou banco, E2E se tocou tela, build — não só o teste novo. pgTAP e E2E
   só com a trava do Supabase local (abaixo). Gate que não pôde rodar é dito
   como tal, nunca declarado verde.
6. **Não editar o plano, o `BACKLOG-ESTRATEGICO.md` nem o
   `PROJECT_STATE.md`**, nem em pedido da produção: o registro é da
   diretoria, em lote.
7. **Abrir o PR** com "Fixes #<nº>", o bloco RETORNO e, no fim, "Pronto para
   revisão". Evite migration: nenhum PR com migration é mesclado antes de o
   check `migration-no-remoto` existir e ser obrigatório; depois disso, a
   primeira linha da descrição diz "Migration: aplicar no remoto antes do
   merge".
8. **Avisar a diretoria:** "PR #<nº> pronto para revisão".
9. **Revisão.** A diretoria revisa e comenta no PR (seção "Revisão",
   abaixo); você lê direto lá. Corrija cada achado bloqueante com teste,
   rode os gates de novo, empurre e avise de novo. Seu push tira o rótulo
   "revisado", se já estiver lá; é esperado.
10. **Atualizar com o `main`**, quando o PR pedir: botão "Update branch" ou
    `git merge origin/main`, e push. Nunca rebase nem force-push (ver
    "Revisão", abaixo).

Limites: até 2 PRs seus abertos; um defeito grave por PR. Fila vazia: diga
"fila vazia" à diretoria e pare — fila vazia é sucesso. Achou defeito fora do
seu item: mande à diretoria em uma linha, com a frase do defeito e
`arquivo:linha`; a fila é dela. Você também revisa os PRs da diretoria
quando ela pedir.

## O Supabase local é um só para todas as sessões

O `project_id` e as portas do Supabase local são fixos (`supabase/config.toml`),
então todas as worktrees usam **os mesmos contêineres e o mesmo banco**. Sem
coordenação, uma sessão roda `db reset` no meio do E2E de outra, ou testa a
própria migration contra um banco montado com as migrations de outra branch.

Regra: **o bloco `db reset` → pgTAP → E2E é feito com a vez em mãos.**

- Pegar a vez é criar a pasta de trava, compartilhada por todas as worktrees e
  fora do que é versionado. **Toda sessão que roda o banco local usa a trava,
  em qualquer ferramenta e shell** (Claude Code, Codex; bash ou PowerShell) —
  as duas formas abaixo criam a mesma pasta:
  ```
  # bash (Git Bash)
  LOCK="$(git rev-parse --path-format=absolute --git-common-dir)/supabase-local.lock"
  mkdir "$LOCK" && echo "<sessão> <item> $(date -Iseconds)" > "$LOCK/quem"
  ```
  ```
  # PowerShell
  $LOCK = Join-Path (git rev-parse --path-format=absolute --git-common-dir) 'supabase-local.lock'
  New-Item -ItemType Directory -Path $LOCK -ErrorAction Stop | Out-Null
  Set-Content -Encoding utf8 (Join-Path $LOCK 'quem') "<sessão> <item> $(Get-Date -Format o)"
  ```
  Se a criação falhar, outra sessão está com a vez: leia o arquivo `quem`,
  siga com o que não depende do banco (código, testes unitários) e tente de
  novo depois. Trava com mais de 90 minutos: pergunte ao dono, pela
  diretoria, antes de removê-la.
- Com a vez, **sempre começar por `supabase db reset`** — nunca confiar no
  estado deixado por outra sessão.
- Devolver a vez assim que o bloco terminar — `rm -rf "$LOCK"` (bash) ou
  `Remove-Item -Recurse -Force $LOCK` (PowerShell) —, inclusive quando um
  teste falhar.
- Não rodar `supabase stop` nem apagar contêineres: outra sessão pode estar
  esperando a vez com o banco de pé.

## Pergunte ao dono — sempre pela diretoria — só quando

- o conserto muda o que o estudante ou quem produz vê;
- um hash de atestação mudaria;
- o conserto contraria uma decisão registrada;
- o conserto exige escrita no remoto.

Mande a pergunta à diretoria, com opções e uma recomendação, em português
simples; ela a leva ao dono. Depois de mandar, pare e espere a resposta. Não
improvise uma decisão de produto e não declare sucesso parcial como completo.
Algo errado fora do item (bug antigo, dado suspeito): uma linha à diretoria
e, no PR, em "Achados"; siga.

## Retorno (descrição do PR)

Um bloco só, com resultado real — números, contagens, saída de teste —,
nunca "deu certo" sem mostrar o quê:

```
RETORNO: #<nº da issue>
- Resultado
- Defeito (a frase da issue) e o teste que falhava antes e passa depois
- Alterações (arquivos, dados, comportamento visível)
- Validações (comandos rodados, saída real)
- Migration (nenhuma / nome do arquivo — aplicar no remoto antes do merge)
- Achados e pendências
```

A descrição termina com "Pronto para revisão".

## Revisão (por quem não escreveu, antes do merge)

**D-7.** Os PRs da sessão de defeitos são revisados pela diretoria — com
subagentes de contexto limpo; achado grave conferido por um segundo leitor
que tenta derrubá-lo; de novo no diff das correções —, e é ela quem põe o
rótulo. Os PRs da diretoria são revisados pela sessão de defeitos quando a
diretoria pede, e a sessão de defeitos põe o rótulo no PR que revisou. Só
achado bloqueante impede o rótulo. No texto abaixo, "trilha" é a sessão de
defeitos como autora do PR: ela nunca põe nem tira rótulo de PR próprio.

Quem revisa não é quem implementou e não carrega o contexto da trilha — é
isso que dá olhos novos. Em Claude Code: `/code-review high <nº do PR>
--comment`. Os achados vão como comentários no PR: a trilha os lê direto, sem
ninguém copiar e colar, e fica o registro de que a revisão aconteceu. Além dos bugs, a revisão confere se cada item do
aceite da unidade tem evidência no retorno e se as restrições da unidade
foram respeitadas. Em mudança de risco alto — hash de atestação,
sincronização, RLS, migration que mexe em dado existente —, vale um segundo
olhar de outro modelo (`MODELO-DIRETORIA.md`, "Verificação cruzada").

**Rótulo "revisado" e check `revisado` (D-6).** Sem achado pendente, o dono
põe o rótulo no PR. O workflow `.github/workflows/revisao.yml` registra num
comentário o commit rotulado; o check fica verde enquanto tudo depois dele
forem só merges limpos do `main`. Na prática:
- ponha o rótulo só com o commit revisado como último do PR — o registro é
  do commit em que o rótulo foi posto, não do que a revisão leu;
- commit novo, merge com edição à mão (conflito resolvido), rebase ou
  force-push tiram o rótulo sozinhos; "Update branch" e `git merge
  origin/main` limpo não tiram;
- a trilha nunca põe nem tira o rótulo — o check não distingue quem o pôs,
  porque as sessões usam a conta do dono;
- o workflow roda a versão do `main` (`pull_request_target`), então só vale
  depois de mesclado, e só bloqueia o merge depois que o dono o incluir como
  obrigatório no ruleset do `main`. Até lá, conferir o check à mão.

## Regras de segurança sem exceção implícita

- A sessão de defeitos faz só o que a mensagem de abertura autorizou (em
  geral: push de branch, abrir PR, Docker e Supabase local). **Merge em
  `main` e qualquer escrita no Supabase remoto ou em produção nunca são
  dela.**
- Uma autorização anterior não cobre uma ação nova, nem uma parecida.
- Trabalho em branch nunca é "publicado".
- Com mais de um PR com migration em voo, uma migration pode ficar com data
  anterior à última já aplicada no remoto — ver `RUNBOOK.md`, seção 3.
- Não expor valores de `.env`/credenciais em nenhum relatório, commit ou log.
- Nunca encerrar processos locais pelo nome — identificar o PID que você
  mesmo iniciou (e seus filhos comprovados) antes de finalizar algo.
- **Nunca (D-7):** merge; rótulo em PR próprio; `supabase` com `--linked`;
  escrita no Supabase remoto, na Vercel ou nas configurações do GitHub;
  aplicar migration; mostrar valores de `.env`; mexer em `docs/conteúdos` ou
  em texto de material médico; atualizar dependência major; editar o plano,
  o `BACKLOG-ESTRATEGICO.md` ou o `PROJECT_STATE.md`. Conserto de dado em
  produção: você escreve o SQL e a consulta de conferência; quem roda é o
  dono, guiado pela diretoria.
