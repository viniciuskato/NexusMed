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
6. [`docs/operacao/incidents/index.md`](docs/operacao/incidents/index.md)
   — falhas operacionais relevantes, causas-raiz e prevenções executáveis.

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
   linha antes de ir para produção** — já causou bug de segurança, lockfile
   apagado e erro de escrita engolido. Ver `PROJECT_STATE.md` para riscos
   críticos abertos relacionados.
6. **Merge em `main` ≠ schema aplicado no Supabase remoto.** São dois
   passos independentes; aplicar migration faz parte do merge, não é
   opcional depois — sempre confirmar com query direta no remoto.
7. **`service_role`/service role key não é o mesmo que o usuário Postgres
   `postgres`.** Alguns triggers só liberam alteração para
   `current_user = 'postgres'`; para bootstrapping local, conectar via
   `docker exec -i supabase_db_synapsemed psql -U postgres`.
8. **O padrão `Resilient*Repository` (grava local, espelha no Supabase
   com erro silencioso) é risco real de duplicação/perda de dado.** Ao
   criar repositório novo, seguir o modelo corrigido, não copiar o antigo.
9. **`profiles.status`/gate de acesso é fail-closed:** só
   `status === 'active'` entra no app.
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

## Convenções de trabalho

- **Toda mudança entra em `main` por Pull Request com CI verde** (desde
  2026-09-18) — nunca push direto: cada push em `main` é um deploy real.
  Migration da qual o frontend depende é aplicada no remoto **antes** do
  merge. Detalhe em `docs/operacao/RUNBOOK.md`, seção 3.
- **O diário de cada mudança é o PR**, não os documentos de operação.
  `PROJECT_STATE.md`/`TASKS.md`/`DECISIONS.md` registram estado presente,
  fila e decisões duráveis em poucas linhas, com link para o PR.
- **Incidente documenta falha relevante; standard guarda regra
  generalizável; runbook guarda procedimento; teste/CI torna a prevenção
  executável.** Não duplicar a mesma narrativa entre camadas.
- **Modelo "sessão de auditoria / sessão diretoria / sessão executiva"**:
  mudanças maiores são planejadas por diretoria, implementadas e
  verificadas por executiva, sem mesclar em `main` sozinha. Modelo:
  [`docs/diretoria/MODELO-DIRETORIA.md`](docs/diretoria/MODELO-DIRETORIA.md).
- **Testar contra Supabase LOCAL** antes de considerar qualquer mudança
  de schema/RPC pronta. Nunca validar escrita direto no remoto.
- **Ponto de restauração**: tag `v0-beta-amigos`. Rollback de emergência:
  `vercel rollback`. Reverter código: `git revert`.

## Manter este arquivo atualizado

Este arquivo é um índice, não um diário. Uma falha nova de alta
probabilidade de recorrência deve gerar registro em
`docs/operacao/incidents/`; a regra generalizável vai para
`docs/operacao/standards/` ou `RUNBOOK.md`; somente um resumo curto e um
link entram aqui quando todo agente precisar conhecê-los.

Estado presente, decisões e fila vivem em `PROJECT_STATE.md`,
`DECISIONS.md` e `TASKS.md`, conforme `SESSION_PROTOCOL.md`.
`docs/diretoria/registro.md` continua como painel legado da diretoria.

## Comunicação entre diretoria e executivas

Toda sessão de diretoria deve ler e seguir
[`docs/diretoria/MODELO-DIRETORIA.md`](docs/diretoria/MODELO-DIRETORIA.md)
e consultar [`docs/diretoria/registro.md`](docs/diretoria/registro.md)
para o histórico de prompts. Preserve os identificadores de prompts já
emitidos ao continuar esse histórico.
