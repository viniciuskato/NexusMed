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

> **Exceção explícita (D-9, 29/09):** o "aprovado" do dono a um plano é a
> autorização para cada PR dele e para a manutenção técnica (D-9, item 1): a
> diretoria aplica antes a migration no remoto e mescla, por squash e preso
> ao commit aprovado, nas condições dos itens 2 e 3 da D-9 (revisto pela
> D-12, 03/10: sem limite por dia nem horário); se o classificador ou as
> permissões barrarem, o PR vai ao dono pelos cliques (`DECISIONS.md`, D-9 e
> D-12).

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
   negação por papel. Uma função `security definer` chamável com esta
   credencial valeria como a de qualquer usuário, admin inclusive, porque a
   sessão define `request.jwt.claims`, que é o que `auth.uid()` lê. **Hoje
   isso está fechado por mecanismo (45-H/AUD-31, risco 14 do `AGENTS.md`):**
   função nova de `public` não nasce com `EXECUTE` para `PUBLIC` (a migration
   `20261002120000` tirou o `PUBLIC` dos defaults e das funções existentes), e
   a guarda pgTAP `supabase/tests/database/security_guards.test.sql` reprova,
   nomeando a função ou procedure, qualquer uma chamável (que não seja de
   gatilho) em `public` ou `app` com `EXECUTE` para `PUBLIC` ou `anon` — o PR
   que criar uma fica com o check `full` vermelho. O que a guarda não cobre é
   o que o Supabase gerencia fora das migrations do repositório (schemas como
   `auth`, `storage`, `extensions`, e funções internas deles).
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

## 3.3. Revisor de IA dos envios (D-12, P7)

> O revisor lê cada material, lote de questões ou atualização enviados pelo
> site, confere fontes e formato e dá o veredito ("apto", "não apto" ou
> "erro") com os achados. **Ele só aconselha: nunca publica nem aplica
> atualização.** Quem decide e publica é o dono, pelo painel de administração.
> O parecer aparece em "Meus envios" e na lista de envios do admin.
>
> Ele roda **no notebook do dono**, não no servidor: o Agendador de Tarefas do
> Windows chama o programa a cada 15 minutos. O programa olha a fila no
> Supabase de produção; se não há envio esperando, termina sem chamar a IA (custo
> zero). Se há, pede o veredito ao `claude -p` da assinatura do dono (cota da
> conta, sem Claude API paga), um envio por vez. O notebook precisa estar
> ligado, com o dono logado, e com o Supabase CLI e o Claude já logados.
>
> A API paga foi desligada pela D-12: a Edge Function `revisar-envios` e o job
> `revisar-envios` do pg_cron não são mais usados (o job foi desagendado na
> migration `20261003120700`), e nenhum segredo deles é necessário.

### Como funciona, em uma tela

- Programa: `scripts/revisor-local/` (`npm.cmd run revisor:local`). Reaproveita o
  ciclo, as conferências, os textos de instrução e a leitura do veredito da
  Edge Function; troca só a API de lotes pelo `claude -p`.
- O `claude` roda com `--model opus`, **só com as ferramentas `WebSearch` e
  `WebFetch`** (o prompt revisor manda abrir as fontes na internet; sem isso o
  veredito seria sempre "não apto"), sem pular permissões, sem sessão gravada em
  disco e sem tocar em nenhum `settings.json`. Para rodar **sem** internet, passe
  `--sem-web` (ou defina `REVISOR_WEB=0`): nesse caso o veredito tende a "não apto".
- Todo acesso ao banco é do programa, por `supabase db query --linked` (o login que
  você já tem; nenhum segredo novo, nada de chave em arquivo). Ele só chama as
  funções de revisão (reservar, registrar o veredito, liberar, travar), lê o
  catálogo e a fila, e **não chama nenhuma função de publicar nem de aplicar**.
- Limites de custo (`review_settings`): o teto do mês e o teto por pessoa por dia
  continuam valendo para quem **não** é admin; o **admin não é barrado** por eles
  nem pelo limite de 3 envios esperando (migration `20261003120800`). A revisão
  sai da cota da assinatura, não de dinheiro.
- Uma rodada por vez: um arquivo de trava local; se uma rodada demora, a seguinte
  sai sem fazer nada (e o Agendador não abre uma segunda). Uma rodada para de
  começar envios novos depois de 45 minutos.
- Se o `claude` falhar (cota da assinatura esgotada, queda de rede, tempo
  esgotado), o envio volta para a fila sem contar no limite e a rodada termina com
  erro; a próxima tenta de novo. Um mesmo conteúdo que estoura o tempo duas vezes
  vai a "erro" (para não gastar a cota à toa) e a pessoa reenvia.

### Ligar o agendamento (uma vez; é a diretoria que faz)

Pré-requisitos: `npm.cmd ci` feito na pasta `C:\Users\vinic\dev\NexusMed` (com esta
mudança já mesclada), `C:\Users\vinic\bin\supabase.exe` logado e vinculado ao
projeto (`supabase.exe db query --linked "select 1"` responde), e o `claude` da
extensão do VS Code logado na conta do dono. No PowerShell:

```
C:\Users\vinic\dev\NexusMed\scripts\revisor-local\instalar-agendamento.cmd
```

Isso cria a tarefa **NexusMed Revisor Local**: uma rodada a cada 15 minutos, janela
escondida, só com você logado, também na bateria, sem segunda rodada enquanto uma
está em andamento. Para ver que ela existe e quando rodou:

```
schtasks /Query /TN "NexusMed Revisor Local" /V /FO LIST
```

(`Last Result` 0 = rodada normal, inclusive "fila vazia"; 1 = a rodada parou com
erro, veja o registro.)

O programa acha sozinho o `claude.exe` da versão mais nova da extensão do VS Code
(`C:\Users\vinic\.vscode\extensions\anthropic.claude-code-*-win32-x64\resources\native-binary\claude.exe`)
ou o `claude` do PATH; a atualização da extensão não quebra nada.

### Desligar, ligar, rodar na hora, remover

```
schtasks /Change /TN "NexusMed Revisor Local" /DISABLE     (pausa: nada roda)
schtasks /Change /TN "NexusMed Revisor Local" /ENABLE      (volta)
schtasks /Run /TN "NexusMed Revisor Local"                 (uma rodada agora)
schtasks /Delete /TN "NexusMed Revisor Local" /F           (remove)
```

Com o agendamento desligado, os envios ficam "Aguardando revisão" e nada é gasto.
Para uma rodada à mão, na pasta do projeto: `npm.cmd run revisor:local` (produção)
ou `npm.cmd run revisor:local -- --local` (Supabase local, para teste).

### Onde ver o que aconteceu

O registro fica em `%LOCALAPPDATA%\NexusMedRevisor\revisor.log` (fora do git; passou
de 1 MB vira `revisor.log.1`). Uma linha por fato, com horário, só números e os 8
primeiros caracteres do id da revisão; **nunca o texto do envio nem dado pessoal**:

```
... rodada iniciada (banco remoto)
... fila vazia: nada a fazer, o claude não foi chamado
... ciclo 1: enviados=1 registrados=0 reprovados_antes_da_ia=0 liberadas=0 erros=0
... veredito rev=1a2b3c4d apto gravado=true
... falha: claude: cota — ... (o envio voltou à fila; tenta de novo na próxima rodada)
```

Na mesma pasta: `trava.lock` (a rodada em andamento) e `falhas.json` (contagem de
tempos esgotados por conteúdo, só hashes).

### Se um envio ficar "Em revisão" por muito tempo

1. Veja o registro: há rodada recente? Se não, o agendamento está desligado, o
   notebook estava desligado ou sem rede, ou a tarefa falhou
   (`schtasks /Query ... /V /FO LIST`).
2. Se há rodada com `falha: claude: cota`, a cota da assinatura acabou: espere a
   renovação; o envio não perde nada.
3. Revisão presa ("incerta"/"reservada") por um corte no meio da rodada: sai sozinha.
   Reserva sem pedido volta à fila em 15 minutos; "incerta" é conferida pela
   rodada seguinte e devolvida à fila depois de 15 minutos sem lote. Para ver:
   ```sql
   select status, count(*) from public.material_reviews group by 1;
   ```
   (no SQL Editor do Supabase, botão **Run**.)
4. Revisão "submetida" com um lote da API antiga (de antes da D-12): a primeira
   rodada a marca como "erro" sem custo; a pessoa reenvia.
5. Se nada disso explica, rode uma rodada à mão (`npm.cmd run revisor:local`) e leia
   o registro.

### Trocar os limites de custo (valem só para quem não é admin)

No SQL Editor do Supabase, botão **Run**:

```sql
-- máximo de revisões no mês, no site inteiro (começa em 60)
update public.review_settings set monthly_review_cap = 100;
-- máximo de revisões por pessoa por dia (começa em 5)
update public.review_settings set daily_review_cap_per_user = 3;
```

### Medir o uso de uma revisão

Cada revisão guarda os tokens (entrada, saída, cache) e o número de buscas e de
leituras de página; o custo em dinheiro não existe (cota da assinatura), mas dá para
comparar o tamanho das revisões:

```sql
select r.created_at::date as dia, s.title as material,
       r.input_tokens as entrada, r.output_tokens as saida,
       r.cache_creation_tokens as cache_gravado, r.cache_read_tokens as cache_lido,
       r.web_searches as buscas, r.web_fetches as leituras, r.verdict as veredito
from public.material_reviews r
join public.material_submissions s on s.id = r.submission_id
where r.billable
order by r.created_at desc
limit 50;
```

Se a cota da assinatura apertar, as alavancas estão em
`supabase/functions/revisar-envios/montagem.ts` (esforço de raciocínio `ESFORCO`,
usado também pelo revisor local; o teto de buscas vale só para a API antiga) e no
tempo máximo de cada revisão (`--timeout-min`, padrão 12).

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
