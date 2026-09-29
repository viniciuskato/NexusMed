# RUNBOOK.md — procedimentos seguros

> Passo a passo verificável. Se um passo aqui não bater com o que você
> observa no repositório (comando não existe, script foi renomeado),
> **pare e reporte a divergência** — não improvise um substituto sem
> registrar que o runbook estava desatualizado nesse ponto.

## 0. Antes de começar, sempre

```
git status --short --branch
git fetch origin
git rev-parse origin/main
```

- Se houver mudanças não commitadas de outra sessão, ou o HEAD local
  divergir de `origin/main` de um jeito inesperado, **pare e relate — não
  sobrescreva** (ver [`SESSION_PROTOCOL.md`](SESSION_PROTOCOL.md)).
- Leia [`PROJECT_STATE.md`](PROJECT_STATE.md) para saber se há um risco
  aberto que muda o que é seguro fazer agora.

## 1. Início de uma mudança

1. Nunca trabalhar direto em `main`.
2. Criar branch isolada a partir de `origin/main` atualizado:
   `git checkout -b work/<slug-da-entrega>`.
3. Confirmar isolamento: nenhuma outra sessão/branch mexendo nos mesmos
   arquivos ao mesmo tempo (checar `TASKS.md` e perguntar ao usuário se
   houver dúvida).

## 2. Teste local (obrigatório antes de considerar qualquer mudança pronta)

- Muda TypeScript/frontend: `tsc --noEmit` e `npm run build` limpos.
- Muda schema/RPC/RLS: testar **só contra Supabase LOCAL**
  (`supabase start`, `supabase db reset`, `supabase test db`) — nunca
  validar escrita de schema direto no remoto.
- Agregador do projeto (quando disponível): `npm run verify`
  (`typecheck` → `lint` → `test` → `build`) — falha (exit 1) se o
  Supabase local não estiver de pé; não é um "pulo silencioso".
- Mudança de comportamento client-side com concorrência (fila de
  sincronização, revisão de flashcard, etc.): teste de navegador real
  (Playwright/Chromium) contra Supabase local — pgTAP prova contrato de
  servidor, não comportamento de cliente (dedupe de promises, sessão
  ativa, etc.) — ver `docs/archive/AGENTS-HISTORICO-2026-09-17.md` para o
  histórico de bugs que só apareceram em teste de navegador real.
- Testes E2E que criam dados persistentes: seguir o standard
  [`standards/testes-e-fixtures.md`](standards/testes-e-fixtures.md) e o
  runbook específico
  [`runbooks/supabase-e2e-local.md`](runbooks/supabase-e2e-local.md).
- Servidor de desenvolvimento: `npm run dev` escuta só em `127.0.0.1:3000` (abre também por `http://localhost:3000`)
  (desde AUD-10). Para abrir no celular/outro aparelho da rede local, use
  `npm run dev:lan` (`--host=0.0.0.0`) — só em rede confiável.
- Antes de commitar: `git diff --check` (sem marcadores de conflito, sem
  espaço em branco problemático) e revisão do diff completo.

## 2.1. Checar um material antes de importar (44-C1)

Todo `.md` de material que chega de fora (Gemini, pessoa) passa pela checagem
do padrão antes de ir para "Importar material" — sem login nem Supabase:

```
npm run checar:material -- "docs/conteúdos/<ramo>/<arquivo>.md"   # pendências, com seção e linha
npm run checar:material -- "docs/conteúdos/<ramo>"                # uma linha por .md da pasta
npm run checar:material -- a.md b.md "docs/conteúdos/<ramo>"      # vários caminhos: uma linha por arquivo
```

- **Conforme**: nenhuma pendência mecânica. **N pendências**: cada uma diz a
  seção, a linha e o que corrigir — os achados voltam a quem escreveu. **ERRO**:
  a importação recusaria o arquivo, com a mesma mensagem dela (saída 1).
- A checagem orienta, não bloqueia nem corrige. Profundidade e escopo do nível
  continuam com a revisão cruzada e o checklist do padrão (seção 1.9).
- As regras vivem em `src/utils/compendiumStandardCheck.ts`. Regra mecânica
  nova no padrão entra lá no mesmo PR, com teste que passa e teste que falha.

## 3. Publicação (merge em `main` + push)

**Exige autorização explícita e específica do usuário/diretoria para ESTA
mudança** — uma autorização anterior não cobre outra.

Desde 2026-09-18, **toda mudança entra em `main` por Pull Request** — nunca
por push direto. O PR dá três coisas que o push direto não dá: o CI roda
antes (e não depois) de a mudança estar em produção, a Vercel publica um
*preview* do branch para conferir no navegador, e fica o registro da
revisão.

1. `git push -u origin <branch>` e abrir o PR (`gh pr create`), usando o
   template (`.github/pull_request_template.md`): o que muda, como foi
   validado, se há migration e a ordem de publicação.
2. Esperar o CI (`fast` e `full`) **verde**. CI vermelho não se mescla —
   nem "porque a falha já existia": conserte a falha antes ou em PR
   separado. E o check `revisado` verde: rótulo posto pela sessão que
   revisou (`EXECUTOR_PROTOCOL.md`, "Revisão"). Com migration, também o
   `migration-no-remoto` (passo 4).
3. Conferir o *preview* da Vercel (link no próprio PR) quando a mudança
   afeta tela/fluxo de usuário.
4. Se a mudança inclui migration nova: aplicar no Supabase remoto faz
   parte do merge, não é um passo opcional posterior
   (`supabase db push --linked --yes`, rodado pelo usuário; no PowerShell
   dele, o CLI só roda pelo caminho completo,
   `C:\Users\vinic\bin\supabase.exe db push --linked --yes`). O check
   `migration-no-remoto` (46-E) fica vermelho enquanto a migration do PR não
   está no remoto; depois de aplicar, "Re-run jobs" nele o deixa verde. O
   check compara a versão, não o conteúdo: migration já aplicada no remoto
   não se corrige no mesmo arquivo, porque o `db push` não a aplica de novo —
   a correção vai numa migration nova. PR que altera (`modified`) uma
   migration já aplicada reprova; migration nova do próprio PR editada depois
   de aplicada continua verde, e o check não vê a diferença. **Se o
   frontend novo depende da migration (RPC nova, coluna nova), aplicar a
   migration ANTES do merge** — o deploy da Vercel é imediato. Conferir
   depois com uma query direta contra o schema remoto — não confiar só na
   mensagem de sucesso do CLI. **Com unidades em paralelo**, a migration de
   uma pode ter data anterior à última já aplicada no remoto pela outra, e o
   `db push` recusa. Antes de aplicar, conferir `supabase migration list
   --linked` e, se preciso, renomear a própria migration para uma data
   posterior (no branch, antes do merge) — não usar `--include-all` para
   contornar.
5. Merge do PR por "Squash and merge" (D-6) — **isso aciona deploy
   automático no Vercel**. Não há passo de confirmação adicional do lado do
   Vercel.
6. Confirmar o deploy: comparar hash/tamanho de bundle publicado com o
   build local, checar ausência de instrumentação de teste
   (`__syncDebug`, `__setTestBackoffOverride`) no bundle de produção.
7. Smoke test não destrutivo em produção quando a mudança afeta fluxo de
   usuário — preferir contas descartáveis criadas e removidas na mesma
   sessão, nunca dado real.

## 3.1. Métricas semanais (somente leitura)

Uma vez por semana, a diretoria (ou o dono) roda
`supabase db query --linked -f scripts/sql/metricas-semanais.sql` (ou cola o
arquivo no SQL Editor) e acrescenta uma linha em
[`docs/produto/METRICAS.md`](../produto/METRICAS.md). O arquivo só lê; nunca
escreve.

## 3.2. Credencial do check de migrations (P-4, uma vez)

O check `migration-no-remoto` (46-E) lê o histórico de migrations do Supabase
de produção com um papel cujo único privilégio concedido é ler esse histórico
(o que ele herda de `PUBLIC` está no passo 1).

**Ordem.** Os passos 1 a 3 vêm **antes** do merge do PR que traz o workflow:
sem o segredo, o push no `main` fica vermelho e todo PR com migration
reprova. Os passos 4 e 5 vêm **só depois** desse merge, nessa ordem: o check
roda pela versão do workflow que está no `main` (`pull_request_target`),
então antes do merge ele não existe e não aparece no próprio PR — torná-lo
obrigatório antes prende o PR para sempre.

1. No Supabase, SQL Editor do projeto `synapsemed`, trocando a senha por uma
   que você gerar (não a use em mais nada). **Só letras e números, com uns 40
   caracteres, sem símbolos:** símbolo como `@`, `/` ou `%` quebra a URI do
   passo 2, e a mensagem de erro de conexão pode mostrar pedaços da senha.
   ```sql
   create role ci_migracoes_leitura with login password 'TROQUE-POR-UMA-SENHA-SO-LETRAS-E-NUMEROS'
     noinherit connection limit 3;
   grant usage on schema supabase_migrations to ci_migracoes_leitura;
   grant select on supabase_migrations.schema_migrations to ci_migracoes_leitura;
   alter role ci_migracoes_leitura set default_transaction_read_only = on;
   alter role ci_migracoes_leitura set statement_timeout = '10s';
   ```
   A barreira é o `grant`: o papel só tem `select` no histórico de
   migrations. O `default_transaction_read_only` é uma camada a mais, não a
   barreira — a própria sessão consegue desligá-lo. O papel também herda o
   que `PUBLIC` concede, e isso não se fecha só para ele: o Postgres não tem
   negação por papel (um `revoke` tira só o que foi dado ao próprio papel, e
   tirar de `PUBLIC` tiraria de todos). O limite: objeto novo com permissão
   para `PUBLIC` passaria a valer para ele também — inclusive uma função
   `security definer` nova sem o `revoke ... from public` (risco 14 do
   `AGENTS.md`), que seria chamável com esta credencial, e a sessão pode
   definir `request.jwt.claims`, que é o que `auth.uid()` lê: a chamada
   valeria como a de qualquer usuário, admin inclusive. **Isso está fechado
   por mecanismo (AUD-31.1):** a guarda pgTAP
   `supabase/tests/database/security_guards.test.sql` reprova, nomeando a
   função, qualquer função chamável (que não seja de gatilho) de um schema
   que o repositório cria e onde `PUBLIC` tem `USAGE` (`public`; `app` entra
   pela mesma lista, mesmo sem ter `USAGE` hoje) que fique com `EXECUTE`
   para `PUBLIC` ou para `anon` — o PR que criar essa função fica com o
   check full vermelho e não é mesclado nem tem a migration aplicada. Função
   de gatilho (`returns trigger`/`returns event trigger`) de `public` com
   `EXECUTE` para `PUBLIC` não é risco, porque não é chamável fora do
   disparo do gatilho — em 28/09 há 15 assim, todas sem esse revoke, como
   esperado; `rls_auto_enable()` não é uma delas, porque não está em nenhuma
   migration deste repositório. O que a guarda não cobre é o que o Supabase
   gerencia fora das migrations do repositório (schemas como `auth`,
   `storage`, `extensions`, e funções internas deles).
2. No Supabase, botão "Connect", aba "Session pooler": copie a URI. Nela,
   troque `postgres.jfvhwwvixwvgjfqzlkkb` por
   `ci_migracoes_leitura.jfvhwwvixwvgjfqzlkkb` e `[YOUR-PASSWORD]` pela senha
   do passo 1. No fim, acrescente `?sslmode=require`.
3. No GitHub: Settings → Secrets and variables → Actions → New repository
   secret. Nome `MIGRACOES_REMOTO_URL`, valor a URI do passo 2.
4. **Depois do merge**, conferir: Actions → migracoes → Run workflow no
   `main`. Verde é "a versão de todas as migrations do repositório está no
   histórico do Supabase de produção". Vermelho mostra só a categoria do erro
   (senha recusada, URI inválida, não conectou), nunca a mensagem do psql.
5. Com o passo 4 verde, no ruleset "Proteger main": inclua
   `migration-no-remoto` (e `revisado`) entre os checks obrigatórios. Um PR
   já aberto no momento desse passo só ganha o check novo num evento novo
   (push de commit ou "Update branch") — sem isso ele fica preso, exigindo
   um check que nunca rodou nele.

## 4. Rollback

- **Rollback de emergência do site** (instantâneo, não mexe no código):
  `vercel rollback`.
- **Reverter código**: `git revert` (nunca reescrever histórico
  compartilhado de `main` com `reset --hard`/force-push).
- Ponto de restauração conhecido: tag git `v0-beta-amigos` (estado
  histórico conhecido-bom — confirmar que ainda é relevante antes de usar
  como referência, dado o tempo decorrido).
- Migration aplicada no remoto não é revertida automaticamente por um
  `git revert` de código — schema e deploy são dois passos independentes
  (ver `AGENTS.md`, riscos críticos).

## 4.1. Encerramento de processos locais

Nunca encerrar processos Node pelo nome globalmente; registrar e finalizar apenas o PID iniciado pela própria missão e seus filhos comprovados.

## 5. Encerramento de sessão

Ver o checklist obrigatório em
[`SESSION_PROTOCOL.md`](SESSION_PROTOCOL.md). Resumo: atualizar
`TASKS.md` (estado real, não otimista), registrar decisão durável nova em
`DECISIONS.md` quando houver, atualizar `PROJECT_STATE.md` se o estado
presente mudou, e devolver o relatório executivo padrão.

## Onde este runbook não é suficiente

Para armadilhas técnicas específicas já descobertas (comportamento do
Tailwind v4, bloqueios do classificador de segurança, padrões do
Supabase local, etc.), ver a seção "Riscos críticos" do `AGENTS.md` (raiz)
e, para o detalhamento completo de cada uma, o arquivo histórico
[`docs/archive/AGENTS-HISTORICO-2026-09-17.md`](../archive/AGENTS-HISTORICO-2026-09-17.md).
