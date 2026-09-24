---
id: INC-2026-004
status: mitigated
severity: high
area: publicacao-migration
detected_at: 2026-09-24
owner: nexusmed
pr: 76
commits: [095e2ab]
prevention:
  test: false
  ci: false
  standard: false
  runbook: true
---

# INC-2026-004 — PR #76 (45-A parte 2) mesclado e publicado sem a migration no remoto

Recorrência de [INC-2026-003](INC-2026-003-import-questoes-schema-cache-remoto.md)
(21/09): mesma causa, três dias depois.

## Sintoma e impacto

O PR #76 foi mesclado às 19:03 UTC de 24/09 e a Vercel publicou o front novo
(bundle com `__APP_RELEASE__` = `095e2abf5ce3`). A migration do PR,
`20260924120000_student_data_reliability_45a`, não estava no Supabase remoto:
a diretoria achou isso na verificação pós-merge (`supabase migration list
--linked` e `db push --dry-run` às ~19:07). O dono aplicou em seguida; às
~19:12 o remoto estava em dia. Janela: cerca de 10 minutos.

O que o front novo fazia contra o banco antigo, nessa janela:
- **Errar uma questão não virava flashcard.** O front chamava
  `create_flashcard_from_question`, que não existia → `PGRST202`. A fila de
  sincronização classifica `PGRST202` como falha permanente: a operação fica
  como falha no aparelho do estudante, com "Tentar novamente", e passa agora
  que a função existe. Nada se perde, mas depende do clique do estudante.
- **Simulado finalizado fechava com nota vazia.** O front novo não manda mais a
  nota; a `save_simulado_session` antiga gravava `score` a partir do que o
  cliente mandava → nulo, e a tela mostrava 0. Nada recalcula essas linhas
  sozinho.
- Responder questão e revisar flashcard não dependiam da migration.

Uso real no período não verificado (ver pendências).

## Causa-raiz

Aplicar a migration no remoto antes do merge é um passo manual do dono, sem
nenhum bloqueio mecânico. O PR trazia "Migration: aplicar no remoto antes do
merge" na primeira linha, como o `EXECUTOR_PROTOCOL.md` manda, e a regra está
no RUNBOOK (seção 3) e no `AGENTS.md` (risco 6). Mesmo assim o merge veio
primeiro. O INC-2026-003 registrou exatamente esse risco e fechou com "CI:
nenhum gate novo"; a regra escrita não segurou a segunda ocorrência. Com três
trilhas produzindo migrations em paralelo, o passo manual fica mais frequente.

Fator agravante: o PR foi mesclado sem a revisão em sessão nova que o modelo
das trilhas exige antes do merge — um segundo portão que também não rodou.

## Condições de reprodução

1. PR com migration nova da qual o front depende (RPC nova ou assinatura
   mudada).
2. Merge em `main` antes de `supabase db push --linked`.
3. A Vercel publica o front em segundos; toda chamada à função nova devolve
   `PGRST202` até a migration ser aplicada.

## Correção

- Migration aplicada no remoto pelo dono, `supabase db push --linked`, ~19:10
  UTC. Conferido: `migration list --linked` com local = remoto para
  `20260924120000`, e `db push --dry-run` responde "Remote database is up to
  date". Não houve chamada às funções novas para conferir — o classificador de
  segurança bloqueou, com razão, uma chamada de escrita em produção.
- Bundle de produção sem instrumentação de teste (0 ocorrências em 22 arquivos
  JS).

## Prevenção

- Regra operacional: até a 46-E entrar, o dono confere a lista de migrations do
  remoto antes de mesclar qualquer PR com migration.
- Teste de regressão: não se aplica.
- Gate de CI: **unidade 46-E** do plano (decisão D-4, `DECISIONS.md` 24/09) —
  o CI lê o histórico de migrations do remoto com credencial só de leitura e
  reprova PR cuja migration ainda não foi aplicada.
- Standard/runbook: RUNBOOK seção 3 já tinha a regra; a 46-E acrescenta o
  fluxo do check.

## Evidências

- Reprodução: `migration list --linked` às ~19:06 UTC com `20260924120000`
  sem par remoto; `db push --linked --dry-run` listando só ela.
- Validação posterior: mesma lista com local = remoto; dry-run "up to date".
- Limitações: a existência das funções foi inferida do histórico de migrations
  (o CLI só registra depois de executar o SQL), não de uma chamada direta.

## Pendências e critério de encerramento

- Dono: conferir, com consulta só de leitura no SQL Editor, se algum simulado
  foi finalizado entre 19:03 e 19:15 UTC de 24/09 com `score` nulo. Havendo,
  a trilha 1 recalcula a nota a partir das tentativas gravadas.
- `resolved` quando a 46-E estiver mesclada e comprovada (check vermelho com
  migration fora do remoto, verde depois de aplicada).
