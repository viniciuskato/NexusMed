# AGENTS.md — índice operacional para agentes de IA

Este arquivo é lido por qualquer agente de IA (Claude Code, Codex, ou
outro) que trabalhe neste repositório. Desde 2026-09-17 (Entrega 40-A)
ele é um **índice curto** — estado, decisões, fila de trabalho e
procedimentos vivem em `docs/operacao/`. Objetivo: uma sessão nova
entender o presente e a próxima ação em até 10 minutos lendo este arquivo
mais a porta de entrada abaixo.

**O NexusMed é o caderno digital do dono (D-13, 03/10/2026), não um produto
comercial:** só o dono publica, o revisor de IA aconselha, e material,
questões e flashcards dos erros se ligam pelo trecho do material
(`docs/operacao/DECISIONS.md`, D-13). Onde um documento antigo falar em
plataforma comercial, em envio por qualquer usuário ou em "apto" como
portão de publicação, vale a D-13.

## Leia primeiro, nesta ordem

**Modelo D-7 (desde 28/09/2026): conteúdo é o produto.** Três sessões: a
**diretoria** (a única janela do dono; revisa, mantém a fila de defeitos e é
a mesa editorial), a **sessão de defeitos** (a única que escreve código de
produto; conserta, não constrói) e a **sessão de materiais** (o Gemini, fora
do repositório). O congelamento de funcionalidade nova da D-7 não vale mais
(D-10, 29/09, e D-13, 03/10). Papéis: [`docs/diretoria/MODELO-DIRETORIA.md`](docs/diretoria/MODELO-DIRETORIA.md),
"Modelo D-7"; decisão: `DECISIONS.md`, D-7. Desde a D-8 (28/09), numa janela só: a diretoria é o agente `dev-senior`, a
sessão de defeitos é o subagente `dev-junior` e a revisão é do subagente
`dev-revisor` (`DECISIONS.md`, D-8). Desde a D-9 (29/09), com o "aprovado"
do dono a um plano, a diretoria executa e publica tudo o que ele descreve
(`DECISIONS.md`, D-9). Desde a D-12 (03/10), sem limite de publicações por
dia nem proibição à noite (revisto pela D-12, 03/10: sem limite por dia nem
horário), e a revisão dos envios da D-11 é feita pela equipe no Claude Code,
com a cota da conta, sem API paga (`DECISIONS.md`, D-12).

**Se você é a sessão de defeitos:** este arquivo,
[`docs/operacao/EXECUTOR_PROTOCOL.md`](docs/operacao/EXECUTOR_PROTOCOL.md)
e, a cada item, a issue e o que ela aponta. O resto da lista abaixo só quando
faltar um fato — leitura desnecessária custa tokens em toda sessão. A lista
completa é da diretoria, que lê também o `MODELO-DIRETORIA.md`.

1. [`docs/produto/PLANO-DE-DESENVOLVIMENTO.md`](docs/produto/PLANO-DE-DESENVOLVIMENTO.md)
   — plano canônico: o que existe, o que está congelado e por quê (desde a
   D-7, código só por defeito ou pedido da produção), e em que estado está
   cada unidade.
2. [`docs/operacao/PROJECT_STATE.md`](docs/operacao/PROJECT_STATE.md) —
   estado presente verificável, ambientes, baseline, riscos abertos.
3. [`docs/operacao/DECISIONS.md`](docs/operacao/DECISIONS.md) — decisões
   duráveis da diretoria.
4. [`docs/operacao/TASKS.md`](docs/operacao/TASKS.md) — fila única de
   trabalho, com prioridade e próxima ação.
5. [`docs/operacao/RUNBOOK.md`](docs/operacao/RUNBOOK.md) — como iniciar,
   testar, publicar, reverter e encerrar uma sessão com segurança.
6. [`docs/operacao/SESSION_PROTOCOL.md`](docs/operacao/SESSION_PROTOCOL.md)
   — contrato obrigatório de abertura e fechamento de sessão, com o
   checklist de relatório executivo.
7. [`docs/operacao/incidents/index.md`](docs/operacao/incidents/index.md)
   — falhas operacionais relevantes, causas-raiz e prevenções executáveis.

**Histórico completo** (todo o `AGENTS.md` anterior a esta entrega, com o
diário de "Estado atual" prompt a prompt e as 23 armadilhas na íntegra,
sem nenhum corte): [`docs/archive/AGENTS-HISTORICO-2026-09-17.md`](docs/archive/AGENTS-HISTORICO-2026-09-17.md).
Consulte-o quando precisar do detalhamento completo de algo só resumido
abaixo. Não é o estado atual — é arquivo morto, preservado por completo.

**Mapa de `docs/`** ("quero X, abra Y", e a tabela de caminhos antigos para
novos da reorganização de 25/09, útil quando um comentário no código ou um
documento antigo citar um caminho que não existe mais):
[`docs/LEIA-ME.md`](docs/LEIA-ME.md).

## O que é o projeto

O caderno de estudos médicos do dono (NexusMed/SynapseMed — o nome de marca
é "NexusMed", o repositório e o projeto continuam se chamando SynapseMed)
para residência médica, com amigos aprovados lendo e estudando (D-13,
03/10/2026; **não é produto comercial** — regra que existia só por isso,
como a proibição de imagens, deixou de valer). Material (compêndios),
banco de questões comentadas, flashcards com SRS, simulados e caderno de
erros formam um só ciclo, ligado pelo trecho (seção) do material: o erro
leva ao trecho, o trecho ao card, o card à revisão na seção. **Só o dono
publica** (envio de material e de questões é só do admin; envios antigos de
outros usuários ficam guardados) e o revisor de IA **aconselha**: o parecer
aparece ao lado do envio, o dono publica com qualquer parecer, e o selo
"Revisado por IA" só aparece com "apto". Já no ar: PRs #107 a #112 (admin
publica sem "apto", revisor local, "Publicar" do admin, padrão v3 com
figuras, cadeia erro → trecho → card, conta e sessão). Produção real, em
uso por um grupo fechado (não é protótipo).

- **Produzir conteúdo (compêndio) do zero até publicado** — Parte 1
  (autocontida, entregue a quem escreve, pessoa ou IA: níveis da árvore,
  profundidade, citações, formato `.md`) e Parte 2 (importar, posicionar,
  revisar/atestar, publicar):
  [`docs/editorial/PADRAO-NEXUSMED-CONTEUDOS.md`](docs/editorial/PADRAO-NEXUSMED-CONTEUDOS.md).
- **Produzir questão comentada do zero até publicada** — formulário do
  Admin (unitário) ou import em lote por arquivo `.md` (botão "Importar
  questões", RPC `import_question_draft`, desde 2026-09-21), mesmo gate
  de revisão/atestação por questão, e nota de direitos autorais de
  questão de banca real: [`docs/editorial/PADRAO-NEXUSMED-QUESTOES.md`](docs/editorial/PADRAO-NEXUSMED-QUESTOES.md).
- **URL de produção**: `https://synapse-med-firebase-auth.vercel.app`
- **Deploy**: automático a cada push em `main` (Vercel + GitHub). **Por
  isso: nunca trabalhar direto em `main`, nunca publicar sem autorização
  explícita** — ver `docs/operacao/RUNBOOK.md`.
- **Backend**: Supabase (Postgres + Auth + Storage), projeto `synapsemed`,
  ref `jfvhwwvixwvgjfqzlkkb`, região `sa-east-1`.
- **Frontend**: React 19 + Vite 6 + Tailwind v4 + TypeScript.

## Arquitetura em uma tela

- `src/repositories/*Repository.ts` — interface + wrapper "Resilient".
  Leitura: com Supabase configurado, só do servidor — a falha sobe para a
  tela, que avisa "sem conexão" e tenta de novo sozinha (`useServerLoad`,
  `ConnectionNotice`; D-2, desde a 45-G). Gravação: local primeiro e fila de
  sincronização (`src/services/syncQueue.ts`). localStorage puro só sem
  Supabase configurado.
- `src/repositories/Supabase*Repository.ts` — implementação real contra
  o Supabase, é o que efetivamente importa em produção.
- `src/services/gamification.ts` — XP/nível/ofensiva calculados a partir
  de dados reais sincronizados.
- `supabase/migrations/*.sql` — schema, RLS, RPCs. RLS é a linha de
  defesa real (não o frontend) — qualquer tabela nova precisa de policy
  explícita ou fica inacessível/exposta por padrão do Postgres.
- `materials.status`/`questions.status` — conteúdo carregado nasce
  `draft`; só `published` aparece pra estudante. Publicar é ação manual
  na Área Editorial (admin).
- `profiles.status` — cadastro novo nasce `pending`; só `active` acessa o
  app. Aprovação manual na aba "Usuários" da Área Editorial.

## Riscos críticos (versão condensada — detalhamento completo de cada um
no arquivo histórico)

Estes são os riscos de maior probabilidade de recorrência. Para o texto
completo, exemplos e casos-limite de cada um, ver
[`docs/archive/AGENTS-HISTORICO-2026-09-17.md`](docs/archive/AGENTS-HISTORICO-2026-09-17.md),
seção "Armadilhas já descobertas".

1. **Tailwind v4 descarta CSS custom com nome igual a uma utilidade dele**,
   sem erro nem aviso. Não sobrescrever `shadow-md`/`text-sm` etc. — usar
   um nome que o Tailwind não reconheça (ex.: `.elev-*`).
2. **PowerShell do usuário bloqueia scripts `.ps1`** — usar `npx.cmd`, não
   `npx`, ao orientar comandos para o usuário rodar.
3. **O classificador de segurança do Claude Code bloqueia escrita
   remota/deploy de forma não determinística** — não presumir bloqueio
   nem ausência dele; tentar a operação real primeiro.
4. **`.env.local` aponta pro Supabase REMOTO por padrão.** Nunca confiar
   que o ambiente é local sem checar `VITE_SUPABASE_URL` primeiro.
5. **Código vindo de fora da sessão normal de trabalho (ex.: exportação
   de ferramenta externa com preview ao vivo) precisa de revisão linha a
   linha antes de ir para produção** — já causou bug de segurança, lockfile
   apagado e erro de escrita engolido. Ver `PROJECT_STATE.md` para riscos
   críticos abertos relacionados.
6. **Merge em `main` ≠ schema aplicado no Supabase remoto.** São dois
   passos independentes; aplicar migration faz parte do merge, não é
   opcional depois — sempre confirmar com query direta no remoto. Já falhou
   quatro vezes em cinco dias
   ([INC-2026-003](docs/operacao/incidents/INC-2026-003-import-questoes-schema-cache-remoto.md),
   [INC-2026-004](docs/operacao/incidents/INC-2026-004-migration-45a-depois-do-merge.md),
   [INC-2026-005](docs/operacao/incidents/INC-2026-005-busca-43d-sem-migration.md)
   — a busca ficou fora do ar a noite toda;
   [INC-2026-006](docs/operacao/incidents/INC-2026-006-43b-rotulo-antes-da-revisao.md)).
   Desde a 46-E, o check `migration-no-remoto` fica vermelho enquanto a
   migration do PR não está no remoto (`.github/workflows/migracoes.yml`).
   Sessão de diretoria: ao abrir, rodar `supabase migration list --linked`.
7. **`service_role`/service role key não é o mesmo que o usuário Postgres
   `postgres`.** Alguns triggers só liberam alteração para
   `current_user = 'postgres'`; para bootstrapping local, conectar via
   `docker exec -i supabase_db_synapsemed psql -U postgres`.
8. **O padrão `Resilient*Repository` (grava local, espelha no Supabase
   com erro silencioso) é risco real de duplicação/perda de dado.** Ao
   criar repositório novo, seguir o modelo corrigido, não copiar o antigo.
9. **`profiles.status`/gate de acesso é fail-closed:** só
   `status === 'active'` entra no app. Falha momentânea de leitura do perfil
   não derruba quem já foi lido como ativo; o resto continua fail-closed.
10. **O projeto roda com `strict: true` desde 2026-09-18 — não desligar.**
11. **`npm run lint` na raiz varre worktrees aninhadas sem o ignore
    existente; pgTAP deixa fixtures persistentes.** Manter o ignore e
    executar `supabase db reset` entre pgTAP e E2E.
12. **`supabase.auth.admin.deleteUser()` não rejeita a promise em erro;
    devolve `{ error }`.** Limpeza E2E usa `runCleanup`, verifica o retorno
    e remove dependências antes do usuário — nunca
    `.catch(() => undefined)`. Ver
    [`standards/testes-e-fixtures.md`](docs/operacao/standards/testes-e-fixtures.md)
    e [`INC-2026-001`](docs/operacao/incidents/INC-2026-001-fixtures-e2e-residuais.md).
13. **Tabela nova em `public` ainda recebe grant para `anon`** por default
    privileges de outro role do Supabase. Toda migration que cria tabela
    precisa de `revoke all on table public.<tabela> from anon;` explícito —
    a guarda `security_guards.test.sql` reprova se esquecer (NOVO-02).
14. **Função nova não nasce mais chamável sem login** (default privileges
    global sem `PUBLIC`, migration `20261002120000`, 45-H/AUD-31): a guarda
    `security_guards.test.sql` reprova função de `public` executável por
    `anon`/`PUBLIC`. A armadilha que sobra é a inversa: o default do `postgres`
    em `public` concede EXECUTE a `authenticated` e `service_role`, então
    função que deve ser só do servidor nasce chamável por qualquer usuário
    logado e precisa de `revoke ... from authenticated` explícito.
15. **Campo de seção do compêndio com Markdown inline (`content`,
    `keyTakeaways`, `clinicalPearl`, `warningAlert`, `examConsensus`, e
    campos derivados como `Flashcard.back`/`mechanismHighlight`) renderizado
    fora de um formulário sempre passa por `SafeMarkdown`/`parseInline`
    (`src/components/common/SafeMarkdown.tsx`) — nunca string crua no JSX.
    Três componentes diferentes já caíram nessa lacuna antes de ser notada
    (achado revisando visualmente um compêndio real). Ver
    [`INC-2026-002`](docs/operacao/incidents/INC-2026-002-safemarkdown-conteudo-real.md)
    e [`standards/conteudo-markdown-inline.md`](docs/operacao/standards/conteudo-markdown-inline.md).
16. **Toda linha nova em `question_options` já ganha automaticamente uma
    `question_option_keys` correspondente** via trigger
    `trg_create_question_option_key` (`is_correct=false`, `explanation=''`,
    ver `rls_policies.sql`) — uma função/script que insere a alternativa e
    depois faz `INSERT` (em vez de `UPDATE`) em `question_option_keys` para
    a mesma `option_id` viola a PK. `SupabaseQuestionsRepository.saveQuestion`
    já usa `upsert` por isso; `import_question_draft` (migration
    `20260921120000`) baixou a mesma armadilha durante o próprio
    desenvolvimento, pego pelo gate pgTAP antes de publicar — use `UPDATE`
    (ou `upsert`) sempre que uma RPC nova criar alternativas.

17. **"Salvar" sem mudança no formulário de conteúdo do Admin tem que ser
    no-op** — nenhum campo gravado pode mudar, senão o hash de atestação muda
    e a revisão aprovada morre (já aconteceu: `mode` nulo virava
    `mecanismos`, `study_lens` era apagado, referências eram recriadas e
    perdiam o vínculo com fonte curada). A conversão formulário ⇄ material
    vive em `src/utils/compendiumForm.ts` e parte do material original;
    campo novo que o formulário edite entra no teste de ida e volta
    (`tests/unit/compendiumForm.test.ts`). Ver
    [`standards/taxonomia-materiais.md`](docs/operacao/standards/taxonomia-materiais.md) §6.0.
18. **`runCleanup` dos E2E executa na ordem dada, não LIFO.** Quem cria
    revisão/atestação precisa limpá-las ANTES de apagar o usuário autor
    (`content_revisions`/`content_reviews` têm FK restrict para ele) — a
    ordem invertida deixa usuário residual no banco local.
19. **`docs/editorial/PADRAO-NEXUSMED-CONTEUDOS.md` é entregue a uma IA sem
    contexto** para gerar o `.md` do material — é autocontido: nada de
    caminho de arquivo, nome de função, RPC ou jargão interno dentro dele. As
    regras de formato (seção 1.7) descrevem o que o importador
    (`src/utils/compendiumMarkdownImport.ts`) e o leitor
    (`src/components/common/SafeMarkdown.tsx`) fazem hoje; mudou um dos dois,
    atualize o padrão no mesmo PR e rode o exemplo do bloco de formato pelo
    importador para conferir. O padrão tem versão (v3 desde 03/10/2026, P9;
    v2 desde 2026-09-23):
    mudança editorial sobe a versão e ganha entrada na seção 2.7; depois da
    unidade 44-C1, regra mecânica nova vem com a checagem correspondente
    (sob a D-7, essa checagem é pedido da produção; até lá, a revisão
    confere à mão). Desde 24/09 (D-5) quem escreve é o Gemini, fora do
    repositório: o padrão é a interface entre ele e o sistema. Figuras (v3):
    bloco `figura:<uuid>` (imagem + legenda + `Fonte:`), arquivo no bucket
    `material-figures`, imutável; o leitor e a checagem do padrão leem o bloco
    pelo mesmo módulo (`src/utils/figuraDoMaterial.ts`) — não crie uma
    segunda leitura.
20. **Card de flashcard com seção:** `create_flashcard_from_question` tem 12
    parâmetros (o último, `p_material_section_id`) e o card de seção nasce
    por `create_flashcard_from_section`, nunca por `upsert` direto. O revisor
    local agendado roda do checkout principal: não trocar de branch lá.

## Convenções de trabalho

- **Toda mudança entra em `main` por Pull Request com CI verde** (desde
  2026-09-18) — nunca push direto: cada push em `main` é um deploy real.
  Migration da qual o frontend depende é aplicada no remoto **antes** do
  merge. Detalhe em `docs/operacao/RUNBOOK.md`, seção 3.
- **D-6 (25/09):** revisão com rótulo e check `revisado`, rótulo posto pela
  sessão que revisou, nunca pela trilha (pelo dono só se o classificador
  bloquear a sessão, depois do veredito postado no PR) (regras em
  `docs/operacao/EXECUTOR_PROTOCOL.md`, "Revisão"; atualizar branch só com
  merge, nunca rebase), merge por squash, no máximo duas trilhas e três PRs
  esperando o dono, processo congelado até 09/10.
- **O diário de cada mudança é o PR**, não os documentos de operação.
  `PROJECT_STATE.md`/`TASKS.md`/`DECISIONS.md` registram estado presente,
  fila e decisões duráveis em poucas linhas, com link para o PR.
- **Incidente documenta falha relevante; standard guarda regra
  generalizável; runbook guarda procedimento; teste/CI torna a prevenção
  executável.** Não duplicar a mesma narrativa entre camadas.
- **Modelo D-7 (28/09): diretoria, sessão de defeitos e sessão de
  materiais** — substitui as trilhas (23/09) e revê a D-6 acima no que fala
  de trilhas, de PRs esperando, da meta e de "processo congelado até 09/10"
  (09/10 passa a ser a revisão da D-7). O código vem da fila de defeitos;
  todo PR é revisado por quem não o escreveu, antes do merge; a diretoria
  mescla o que está num plano que o dono aprovou (D-9). Modelo:
  [`docs/diretoria/MODELO-DIRETORIA.md`](docs/diretoria/MODELO-DIRETORIA.md).
- **Testar contra Supabase LOCAL** antes de considerar qualquer mudança
  de schema/RPC pronta. Nunca validar escrita direto no remoto.
- **Acessibilidade (desde AUD-09)**: modal novo usa `useDialogA11y`
  (`src/hooks/useDialogA11y.ts`) + `role="dialog"`, `aria-modal`,
  `aria-labelledby`; clicável novo é `<button type="button">` ou, se contiver
  botões internos, `role="button"` + `tabIndex={0}` + `onActivationKey`
  (`src/utils/keyboardActivation.ts`). O teto `--max-warnings` do lint só desce.
- **Ponto de restauração**: tag `v0-beta-amigos`. Rollback de emergência:
  `vercel rollback`. Reverter código: `git revert`.

## Manter este arquivo atualizado

Este arquivo é um índice, não um diário. Uma falha nova de alta
probabilidade de recorrência deve gerar registro em
`docs/operacao/incidents/`; a regra generalizável vai para
`docs/operacao/standards/` ou `RUNBOOK.md`; somente um resumo curto e um
link entram aqui quando todo agente precisar conhecê-los.

O que existe, o que está congelado e por quê (desde a D-7, código só por
defeito ou pedido da produção) vive no plano canônico
(`docs/produto/PLANO-DE-DESENVOLVIMENTO.md`); estado dos ambientes,
decisões e fila operacional, em `PROJECT_STATE.md`, `DECISIONS.md` e
`TASKS.md`, conforme `SESSION_PROTOCOL.md`. `docs/archive/diretoria/registro.md` é
o painel legado da diretoria (histórico até 2026-09-17).

## Comunicação entre as sessões

> **D-8 (28/09):** a sessão de defeitos é o subagente `dev-junior`: recebe da
> diretoria uma ORDEM e devolve um RETORNO, sem mensagem entre janelas. A
> revisão é do subagente `dev-revisor`. Onde esta seção disser outra coisa,
> vale a D-8 (`docs/operacao/DECISIONS.md`).

O dono fala só com a diretoria. A sessão de defeitos fala com a diretoria
por mensagem entre sessões e pelo PR; o Gemini recebe o pedido e devolve a
resposta pelas mãos do dono. Toda sessão de diretoria deve ler e seguir
[`docs/diretoria/MODELO-DIRETORIA.md`](docs/diretoria/MODELO-DIRETORIA.md)
e consultar [`docs/archive/diretoria/registro.md`](docs/archive/diretoria/registro.md)
para o histórico. Preserve os identificadores já emitidos ao continuar
esse histórico.

**Desde 2026-09-28 (D-7) o código vem da fila de defeitos** — issues com o
rótulo `bug` e a gravidade (`grave` ou `menor`) — e, com o "sim" do dono, de
um pedido da produção (`pedido-da-producao`), não das unidades do plano
canônico:
[`docs/produto/PLANO-DE-DESENVOLVIMENTO.md`](docs/produto/PLANO-DE-DESENVOLVIMENTO.md).
O plano continua dizendo o que existe, o que está congelado e por quê, com a
fronteira defeito × evolução na seção 5; quem o atualiza é a diretoria, em
lote. `docs/archive/diretoria/prompts/` e `registro.md` são histórico — nada
novo entra lá.
