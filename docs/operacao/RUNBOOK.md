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
   separado. E o check `revisado` verde: rótulo posto depois da revisão em
   sessão nova (`EXECUTOR_PROTOCOL.md`, "Revisão").
3. Conferir o *preview* da Vercel (link no próprio PR) quando a mudança
   afeta tela/fluxo de usuário.
4. Se a mudança inclui migration nova: aplicar no Supabase remoto faz
   parte do merge, não é um passo opcional posterior
   (`supabase db push --linked --yes`, rodado pelo usuário; no PowerShell
   dele, o CLI só roda pelo caminho completo,
   `C:\Users\vinic\bin\supabase.exe db push --linked --yes`). **Se o
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

## 3.2. Revisor de IA dos envios (44-F)

> O revisor lê cada material enviado pelo site, confere fontes e formato e
> dá o veredito ("apto", "não apto" ou "erro"). Ele roda no servidor (uma
> Edge Function do Supabase chamada `revisar-envios`), a cada 5 minutos, e usa
> a API de lotes da Anthropic (metade do preço; a revisão de um material leva
> de alguns minutos a algumas horas). **Cada revisão custa dinheiro**: os
> limites abaixo protegem o bolso, mas só funcionam depois dos passos (a) e
> (b). Enquanto eles não forem feitos, os envios ficam "aguardando revisão" e
> nada é gasto.

### (a) Publicar a função e ligar o agendamento

Ordem: primeiro a migration no banco remoto (`20260930120000_revisor_ia_44f.sql`,
como qualquer outra), depois os passos abaixo. Os comandos são para o
PowerShell, na pasta do projeto.

1. Conferir que os textos que a função usa estão em dia com `docs/editorial/`
   e com a checagem do padrão:
   ```
   npm.cmd run gerar:revisor -- --check
   ```
   Deve responder `arquivos em dia`. Se disser que algum arquivo está
   desatualizado, rode `npm.cmd run gerar:revisor`, confira o `git status` e
   faça commit antes de publicar a função.
2. Criar a chave da API e o segredo do agendador, e colá-los no Supabase
   (bloco (b), logo abaixo). **Faça isso antes do passo 3.**
3. Publicar a função:
   ```
   C:\Users\vinic\bin\supabase.exe functions deploy revisar-envios --project-ref jfvhwwvixwvgjfqzlkkb
   ```
   Se o comando reclamar do Docker, repita com `--use-api` no fim.
4. Ligar o agendamento. No painel do Supabase, menu da esquerda, **SQL Editor**
   → **New query**. Cole o texto abaixo, troque `COLE-AQUI-O-SEGREDO` pelo
   **mesmo** segredo do `REVISOR_SEGREDO` (bloco (b)) e clique em **Run**:
   ```sql
   select vault.create_secret('https://jfvhwwvixwvgjfqzlkkb.supabase.co/functions/v1/revisar-envios', 'revisor_url');
   select vault.create_secret('COLE-AQUI-O-SEGREDO', 'revisor_segredo');
   select cron.schedule('revisar-envios', '*/5 * * * *', $$select app.disparar_revisao()$$);
   ```
   Isto guarda o endereço e o segredo no cofre do banco (o Vault) e manda o
   banco chamar a função a cada 5 minutos. Para **desligar** a qualquer
   momento (por exemplo, se o gasto assustar), rode no mesmo lugar:
   ```sql
   select cron.unschedule('revisar-envios');
   ```
5. Conferir que funcionou: envie um material de teste pelo site e espere
   alguns minutos. Na tela "Meus envios" ele passa de "Aguardando revisão" a
   "Em revisão". Se não passar, veja duas coisas no painel do Supabase: em
   **Edge Functions** → `revisar-envios` → **Logs** (mensagem de erro da
   função) e, no SQL Editor, `select * from cron.job_run_details order by start_time desc limit 5;`
   (se o agendador está chamando).

**Trocar os limites de custo** (no SQL Editor, botão **Run**):
```sql
-- máximo de revisões no mês, no site inteiro (começa em 60)
update public.review_settings set monthly_review_cap = 100;
-- máximo de revisões por pessoa por dia (começa em 5)
update public.review_settings set daily_review_cap_per_user = 3;
```
Quando o teto do mês ou do dia é atingido, os envios ficam "aguardando revisão"
e a pessoa lê na tela, em uma frase, que vão esperar. Dia e mês contam no
horário de São Paulo.

### (b) Criar a chave da API com teto mensal e colar o segredo no Supabase

A chave é a "senha" que autoriza a função a usar a IA e cobrar da sua conta.
**Nunca** cole a chave em conversa, em arquivo do projeto ou em mensagem: ela
só vai em dois lugares, o painel da Anthropic (onde nasce) e o painel do
Supabase (onde a função a lê).

1. Abra o **Claude Console** (`https://platform.claude.com`) e entre com a
   conta da empresa/projeto.
2. **Teto mensal de gasto** (faça antes de criar a chave). Menu **Settings**
   → **Billing**. Na seção **Spend limits**, clique em **Adjust limit** (ou
   **Set limit**, se ainda não houver) e digite o valor máximo em dólares por
   mês. Sugestão para começar: **US$ 100** (60 revisões a ~US$ 1 cada dão ~US$
   60, com folga). Quando o gasto do mês chega nesse valor, a API para de
   responder até o mês virar: é a trava final, acima da trava de 60 revisões do
   próprio site.
3. **Criar a chave.** Menu **Settings** → **API keys** → botão **Create Key**.
   Dê o nome `nexusmed-revisor`, confirme e **copie a chave que aparece** (ela
   só é mostrada uma vez; se perder, crie outra e apague a antiga).
4. Gere o segredo do agendador (uma sequência aleatória qualquer). No
   PowerShell:
   ```
   [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
   ```
   Copie o resultado.
5. Abra o painel do **Supabase** (`https://supabase.com/dashboard`), o projeto
   `synapsemed`. Menu da esquerda → **Edge Functions** → **Secrets** (ou
   "Manage secrets"). Clique em **Add new secret** duas vezes:
   - nome `ANTHROPIC_API_KEY`, valor = a chave copiada no passo 3;
   - nome `REVISOR_SEGREDO`, valor = a sequência do passo 4.
   Clique em **Save**.
6. Use a mesma sequência do passo 4 no comando do passo 4 do bloco (a)
   (`COLE-AQUI-O-SEGREDO`).

Se um dia precisar trocar a chave (vazou, ou você só quer renovar): crie uma
nova em **Settings** → **API keys**, troque o valor de `ANTHROPIC_API_KEY` no
Supabase e apague a antiga no Console.

### (c) Medir o custo real de uma revisão

Cada revisão guarda, na tabela `material_reviews`, os tokens de entrada, de
saída, de cache e o número de buscas e leituras de página. No **SQL Editor**
do Supabase, botão **Run**:

```sql
-- Custo estimado por revisão, em dólares (preços do Claude Opus 5.5 pela API de
-- lotes: 50% do preço normal). Confira os números na página Usage do Console e
-- ajuste as constantes se o preço mudar.
select r.created_at::date as dia,
       s.title as material,
       r.input_tokens as entrada,
       r.output_tokens as saida,
       r.cache_creation_tokens as cache_gravado,
       r.cache_read_tokens as cache_lido,
       r.web_searches as buscas,
       r.web_fetches as leituras,
       round((
         coalesce(r.input_tokens, 0) * 2.0
         + coalesce(r.cache_creation_tokens, 0) * 4.0
         + coalesce(r.cache_read_tokens, 0) * 0.1
         + coalesce(r.output_tokens, 0) * 10.0
       ) / 1000000.0 + coalesce(r.web_searches, 0) * 0.01, 3) as custo_usd
from public.material_reviews r
join public.material_submissions s on s.id = r.submission_id
where r.billable
order by r.created_at desc
limit 50;
```

Para o custo médio do mês (mesmas constantes), troque o final por
`group by 1` sobre `date_trunc('month', r.created_at)` e some
`custo_usd`; ou compare o total com **Usage** e **Billing** no Claude
Console. O número que interessa é o da coluna `custo_usd`, que decide se o teto
mensal de 60 revisões cabe no orçamento. Se cada revisão sair mais cara que
o esperado, há duas alavancas no código, em `supabase/functions/revisar-envios/montagem.ts`:
o esforço de raciocínio (`ESFORCO`, começa em `medium`) e o teto de buscas e de
leituras de página por revisão (`MAX_BUSCAS`, `MAX_LEITURAS_DE_PAGINA`).
Depois de mudar, rode `npm.cmd run gerar:revisor -- --check` e publique a
função de novo (passo 3 do bloco (a)).

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
