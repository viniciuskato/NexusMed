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
- Servidor de desenvolvimento: `npm run dev` escuta só em `127.0.0.1:3000` (abre também por `http://localhost:3000`)
  (desde AUD-10). Para abrir no celular/outro aparelho da rede local, use
  `npm run dev:lan` (`--host=0.0.0.0`) — só em rede confiável.
- Antes de commitar: `git diff --check` (sem marcadores de conflito, sem
  espaço em branco problemático) e revisão do diff completo.

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
   separado.
3. Conferir o *preview* da Vercel (link no próprio PR) quando a mudança
   afeta tela/fluxo de usuário.
4. Se a mudança inclui migration nova: aplicar no Supabase remoto faz
   parte do merge, não é um passo opcional posterior
   (`supabase db push --linked --yes`, rodado pelo usuário). **Se o
   frontend novo depende da migration (RPC nova, coluna nova), aplicar a
   migration ANTES do merge** — o deploy da Vercel é imediato. Conferir
   depois com uma query direta contra o schema remoto — não confiar só na
   mensagem de sucesso do CLI.
5. Merge do PR (botão do GitHub) — **isso aciona deploy automático no
   Vercel**. Não há passo de confirmação adicional do lado do Vercel.
6. Confirmar o deploy: comparar hash/tamanho de bundle publicado com o
   build local, checar ausência de instrumentação de teste
   (`__syncDebug`, `__setTestBackoffOverride`) no bundle de produção.
7. Smoke test não destrutivo em produção quando a mudança afeta fluxo de
   usuário — preferir contas descartáveis criadas e removidas na mesma
   sessão, nunca dado real.

## 3.1. Métricas semanais (somente leitura)

Uma vez por semana, o dono do projeto roda
`supabase db query --linked -f scripts/sql/metricas-semanais.sql` (ou cola o
arquivo no SQL Editor) e acrescenta uma linha em
[`docs/produto/METRICAS.md`](../produto/METRICAS.md). O arquivo só lê; nunca
escreve.

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
