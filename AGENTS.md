# AGENTS.md — índice operacional para agentes de IA

Este arquivo é lido por qualquer agente de IA (Claude Code, Codex, ou
outro) que trabalhe neste repositório. Desde 2026-09-17 (Entrega 40-A)
ele é um **índice curto** — estado, decisões, fila de trabalho e
procedimentos vivem em `docs/operacao/`. Objetivo: uma sessão nova
entender o presente e a próxima ação em até 10 minutos lendo este arquivo
mais a porta de entrada abaixo.

## Leia primeiro, nesta ordem

1. [`docs/operacao/PROJECT_STATE.md`](docs/operacao/PROJECT_STATE.md) —
   estado presente verificável, ambientes, baseline, riscos abertos.
2. [`docs/operacao/DECISIONS.md`](docs/operacao/DECISIONS.md) — decisões
   duráveis da diretoria.
3. [`docs/operacao/TASKS.md`](docs/operacao/TASKS.md) — fila única de
   trabalho, com prioridade e próxima ação.
4. [`docs/operacao/RUNBOOK.md`](docs/operacao/RUNBOOK.md) — como iniciar,
   testar, publicar, reverter e encerrar uma sessão com segurança.
5. [`docs/operacao/SESSION_PROTOCOL.md`](docs/operacao/SESSION_PROTOCOL.md)
   — contrato obrigatório de abertura e fechamento de sessão, com o
   checklist de relatório executivo.

**Histórico completo** (todo o `AGENTS.md` anterior a esta entrega, com o
diário de "Estado atual" prompt a prompt e as 23 armadilhas na íntegra,
sem nenhum corte): [`docs/archive/AGENTS-HISTORICO-2026-09-17.md`](docs/archive/AGENTS-HISTORICO-2026-09-17.md).
Consulte-o quando precisar do detalhamento completo de algo só resumido
abaixo. Não é o estado atual — é arquivo morto, preservado por completo.

## O que é o projeto

Plataforma de estudos médicos (NexusMed/SynapseMed — o nome de marca é
"NexusMed", o repositório e o projeto continuam se chamando SynapseMed)
para residência médica: compêndios teóricos, banco de questões
comentadas, flashcards com SRS, simulados, caderno de erros. Produção
real, em uso por um grupo fechado de amigos do dono do projeto (não é
protótipo).

- **URL de produção**: `https://synapse-med-firebase-auth.vercel.app`
- **Deploy**: automático a cada push em `main` (Vercel + GitHub). **Por
  isso: nunca trabalhar direto em `main`, nunca publicar sem autorização
  explícita** — ver `docs/operacao/RUNBOOK.md`.
- **Backend**: Supabase (Postgres + Auth + Storage), projeto `synapsemed`,
  ref `jfvhwwvixwvgjfqzlkkb`, região `sa-east-1`.
- **Frontend**: React 19 + Vite 6 + Tailwind v4 + TypeScript.

## Arquitetura em uma tela

- `src/repositories/*Repository.ts` — interface + wrapper "Resilient"
  (tenta Supabase, cai pra localStorage em erro/config ausente).
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
   linha antes de ir para produção** — já causou bug de segurança (login
   de demonstração sempre visível), `package-lock.json` apagado sem
   necessidade, e `catch {}` vazio engolindo erro de escrita. **Ver
   `docs/operacao/PROJECT_STATE.md`, risco crítico aberto em 2026-09-17**:
   há um commit exatamente com esse padrão (`package-lock.json` apagado)
   em `origin/main` sem revisão registrada.
6. **Merge em `main` ≠ schema aplicado no Supabase remoto.** São dois
   passos independentes; aplicar migration faz parte do merge, não é
   opcional depois — sempre confirmar com query direta no remoto.
7. **`service_role`/service role key não é o mesmo que o usuário Postgres
   `postgres`.** Alguns triggers só liberam alteração para
   `current_user = 'postgres'` — para bootstrapping local, conectar via
   `docker exec -i supabase_db_synapsemed psql -U postgres` (a flag `-i`
   é obrigatória para heredoc funcionar).
8. **O padrão `Resilient*Repository` (grava local, espelha no Supabase
   com `catch {}` silencioso) é risco real de duplicação/perda de dado
   sob falha de rede.** Corrigido para as categorias 1-9 do backlog de
   sincronização (ver histórico) — ao criar um repositório novo com esse
   padrão, seguir o modelo já corrigido, não copiar o antigo.
9. **`profiles.status`/gate de acesso é fail-closed por decisão
   deliberada**: só `status === 'active'` entra no app; qualquer outro
   valor (inclusive um futuro valor de enum não tratado) cai em tela de
   bloqueio. Não "corrigir" isso para ser permissivo.
10. **TypeScript (5.8, este projeto) às vezes não estreita uma union
    discriminada por `!resultado.ok`/`if (resultado.ok)` quando o tipo vem
    de um `import` de outro arquivo** (confirmado com repro mínimo isolado,
    2026-09-17, missão 42-A) — o mesmo padrão funciona perfeitamente
    quando a interface e o uso estão no mesmo arquivo. Sintoma: erro
    `Property 'x' does not exist on type 'A | B'` mesmo com `ok: true`/
    `ok: false` literais corretos nas duas interfaces. Contorno que
    funciona sempre: comparar explicitamente (`if (resultado.ok === false)`
    em vez de `if (!resultado.ok)`). Não gastar tempo tentando "consertar"
    os tipos — o problema é o `!`/truthy check cross-módulo, não a
    modelagem dos tipos.
11. **`npm run lint` rodado direto na raiz de `canonical` varre também
    outras worktrees aninhadas em `.claude/worktrees/**`** (não
    rastreadas pelo git, mas presentes em disco) — sem uma entrada de
    `ignores` para esse caminho, isso gera milhares de erros fantasmas de
    código de outras branches/checkouts. Corrigido em 2026-09-18
    (`eslint.config.js`), achado só porque foi a primeira vez que um gate
    completo rodou a partir da raiz canônica em vez de uma worktree isolada
    fora dela. Rodar `npm run test:e2e` (Playwright completo) logo depois
    de `npm run test` (pgTAP) sem `supabase db reset` entre os dois também
    falha de forma parecida (specs `estudo-tematico-22a`/`concurrencia-13b`)
    por fixtures do pgTAP não limpas — sempre resetar antes do e2e se o
    pgTAP rodou primeiro na mesma sessão.

## Convenções de trabalho

- **Commits vão direto pra `main`** hoje (sem PR obrigatório) — mas cada
  push é um deploy real em produção. Rodar `tsc --noEmit` + `npm run
  build` antes de commitar, sempre. Detalhe completo em
  `docs/operacao/RUNBOOK.md`.
- **Modelo "sessão de auditoria / sessão diretoria / sessão
  executiva"** (três papéis desde 2026-09-18): mudanças maiores são
  planejadas por uma sessão diretoria que escreve um prompt autocontido,
  e uma sessão executiva separada implementa, verifica com as próprias
  ferramentas e reporta objetivamente — sem mesclar em `main` sozinha,
  sem inventar escopo novo. Acima delas, uma sessão de auditoria
  esporádica (só sob pedido explícito) pensa o projeto inteiro e a
  evolução de longo prazo, sem gerar encaminhamento — só registra itens
  em [`docs/diretoria/BACKLOG-ESTRATEGICO.md`](docs/diretoria/BACKLOG-ESTRATEGICO.md)
  para a diretoria consultar depois. Modelo completo:
  [`docs/diretoria/MODELO-DIRETORIA.md`](docs/diretoria/MODELO-DIRETORIA.md).
- **Testar contra Supabase LOCAL** antes de considerar qualquer mudança
  de schema/RPC pronta. Nunca validar mudança de escrita direto no
  remoto.
- **Ponto de restauração**: tag git `v0-beta-amigos`. Rollback de
  emergência do site: `vercel rollback`. Reverter código: `git revert`.

## Manter este arquivo atualizado

Isto não é um documento estático, mas também não é mais o lugar para
diário de estado. **Toda sessão que descobrir uma armadilha nova de alta
probabilidade de recorrência, ou mudar uma convenção de trabalho, deve
atualizar a seção correspondente aqui** (curto, condensado) — o
detalhamento completo vai para
`docs/archive/AGENTS-HISTORICO-2026-09-17.md` só se for reescrever
história antiga; uma armadilha nova de hoje em diante pode simplesmente
ser adicionada à lista acima, sem precisar do arquivo morto.

**Estado presente, decisões e fila de trabalho não são mais registrados
aqui** — atualize `docs/operacao/PROJECT_STATE.md`,
`docs/operacao/DECISIONS.md` e `docs/operacao/TASKS.md`, conforme o
contrato de fechamento de sessão em
`docs/operacao/SESSION_PROTOCOL.md`. `docs/diretoria/registro.md`
continua existindo como painel legado da diretoria (acompanhamento de
prompts número a número) — sua abertura aponta para a camada operacional
atual; o conteúdo histórico dele não foi movido nesta entrega.

## Comunicação entre diretoria e executivas

Toda sessão de diretoria deve ler e seguir
[`docs/diretoria/MODELO-DIRETORIA.md`](docs/diretoria/MODELO-DIRETORIA.md)
e consultar [`docs/diretoria/registro.md`](docs/diretoria/registro.md)
para o histórico de prompts. O modelo vigente organiza entregas com
etapas NN-A/NN-B, fila priorizada, histórico, estados baseados em
confirmação do usuário e verificação separada de dependências e
conflitos de execução — preserve os identificadores de prompts já
emitidos ao continuar esse histórico.
