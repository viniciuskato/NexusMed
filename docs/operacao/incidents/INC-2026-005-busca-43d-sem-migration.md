---
id: INC-2026-005
status: mitigated
severity: high
area: publicacao-migration
detected_at: 2026-09-25
owner: nexusmed
pr: [80, 81]
commits: [bdb8626, 7207269]
prevention:
  test: false
  ci: false
  standard: false
  runbook: true
---

# INC-2026-005 — Busca (43-D) e correções da 45-A publicadas sem as migrations no remoto

Terceira ocorrência da mesma causa, depois de
[INC-2026-003](INC-2026-003-import-questoes-schema-cache-remoto.md) (21/09) e
[INC-2026-004](INC-2026-004-migration-45a-depois-do-merge.md) (24/09, ~10 min).
Desta vez a janela foi de cerca de 13h45, a noite inteira.

## Sintoma e impacto

O PR #80 (43-D) foi mesclado às 22:55 UTC de 24/09, e o #81 (correções da
45-A) às 23:03 UTC. A Vercel publicou o front novo. As duas migrations não
foram aplicadas no Supabase remoto:

- `20260924140000_busca_materiais` (#80);
- `20260924193000_flashcard_review_alias_45a` (#81).

A diretoria achou isso às ~11:35 UTC de 25/09, conferindo o registro do
plano: `migration list --linked` mostrava as duas sem par remoto.

O que o front novo fazia contra o banco antigo:
- **A busca de materiais (Ctrl+K) falhava sempre.** O bundle de produção
  (`index-Dpx1KUNs.js`) chama a RPC `search_materials`, que não existia no
  remoto (conferido em `pg_proc`), e a tabela `app.material_search` também
  não. A busca nova não tem fallback local de propósito, então a tela dizia
  que não conseguiu buscar. Afetou todos os usuários desde o deploy do #80.
- **A revisão offline de um flashcard removido pela reconciliação da 45-A
  continuava falhando.** A `submit_flashcard_review` do remoto não tinha a
  resolução do id removido (sem `v_effective_flashcard_id` no corpo). O front
  trata `flashcard_id` como opcional na resposta, então o resto da revisão de
  flashcards funcionava. A falha fica na fila do aparelho com "Tentar
  novamente" e passa depois que a migration é aplicada.

Uso real no período não verificado.

## Causa-raiz

A mesma do INC-2026-003 e do INC-2026-004: aplicar a migration antes do merge
é passo manual, sem bloqueio mecânico. Os dois PRs traziam "Migration: aplicar
no remoto antes do merge" na primeira linha, e o #81 ainda explicava a ordem
em relação ao #80.

Depois do INC-2026-004, a diretoria decidiu (D-4, 24/09) que a 46-E entraria
"antes do próximo merge com migration" e que, até lá, o dono conferiria a
lista do remoto antes de cada merge com migration. Nenhuma das duas coisas
aconteceu antes destes merges. **Regra escrita não segurou a terceira
ocorrência, nem com a decisão tomada no mesmo dia.**

Fator agravante: dois PRs com migration mesclados em oito minutos, à noite,
sem conferência entre um e outro.

## Condições de reprodução

1. PR com migration nova da qual o front depende (RPC nova).
2. Merge em `main` antes de `supabase db push --linked`.
3. A Vercel publica em segundos; toda chamada à função nova devolve
   `PGRST202` até a migration ser aplicada.

## Correção

- O dono aplicou as duas com `supabase db push --linked --yes` às ~12:40 UTC
  de 25/09 (o PowerShell dele não acha `supabase` pelo nome; foi pelo caminho
  completo do executável).
- Conferido depois, com consulta direta ao remoto:
  - `db push --dry-run`: "Remote database is up to date";
  - `public.search_materials(text,uuid,boolean,integer)` existe, com EXECUTE
    para `authenticated` e sem EXECUTE para `anon`;
  - `public.submit_flashcard_review` com a resolução do id removido e sem
    EXECUTE para `anon`;
  - índice da busca preenchido: 38 de 38 materiais em `app.material_search`
    e 836 seções em `app.material_section_search`;
  - consulta de teste no índice ("imunidade inata") encontra 36 seções em 15
    materiais.
- Não houve chamada à RPC com a conta de um usuário real. A busca na tela
  fica para o dono conferir (Ctrl+K).

## Prevenção

- Gate de CI: **unidade 46-E** (D-4). Passa a ser a próxima coisa a entrar,
  antes de qualquer PR com migration. Depende da P-4 (credencial só de
  leitura, passo do dono).
- Regra operacional até a 46-E (proposta da diretoria, a confirmar pelo dono):
  não mesclar PR com migration. Se for inevitável, o merge acontece numa
  sessão que aplica a migration e confere o remoto.
- Teste de regressão: não se aplica.

## Evidências

- Reprodução: `supabase migration list --linked` e `db push --linked
  --dry-run` às ~11:40 UTC de 25/09 listando as duas migrations; `pg_proc`
  sem `search_materials`; `to_regclass('app.material_search')` nulo;
  `submit_flashcard_review` sem a resolução de alias; o bundle de produção
  contém a chamada a `search_materials`.
- Horários dos merges: `gh pr view 80` e `gh pr view 81` (`mergedAt`).

## Pendências e critério de encerramento

- Dono: abrir o Ctrl+K em produção e buscar um termo qualquer — deve listar
  materiais, não a mensagem de erro.
- `resolved` quando a 46-E estiver mesclada e comprovada (check vermelho com
  migration fora do remoto, verde depois de aplicada).
