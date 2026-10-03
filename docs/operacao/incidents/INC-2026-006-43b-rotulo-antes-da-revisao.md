---
id: INC-2026-006
status: mitigated
severity: high
area: publicacao-migration
detected_at: 2026-09-27
owner: nexusmed
pr: [94, 95]
commits: [3f3bbbd, 5426a4c]
prevention:
  test: false
  ci: true
  standard: false
  runbook: true
---

# INC-2026-006 — 43-B mesclada com o rótulo "revisado", sem revisão e sem as migrations

Quarta ocorrência da mesma causa de
[INC-2026-003](INC-2026-003-import-questoes-schema-cache-remoto.md),
[INC-2026-004](INC-2026-004-migration-45a-depois-do-merge.md) e
[INC-2026-005](INC-2026-005-busca-43d-sem-migration.md), e a primeira depois
da trava de revisão da D-6.

## Sintoma e impacto

- **#94 (43-B):** mesclado às 14:42 UTC de 27/09, com o rótulo "revisado",
  antes da revisão (14:52) e sem a migration `20260927120000`.
- **#95 (correções da 43-B):** mesclado às 18:03 UTC, também com o rótulo e
  sem revisão, com a migration `20260927130000` fora do remoto.

Entre as 14:42 e as ~18:05 UTC, o front em produção lia `question_materials`
e chamava a `import_question_draft` nova, e nenhuma das duas existia no banco:
- a lista de questões por material caía na cópia local do aparelho (a 45-G,
  que tira esse fallback, ainda não estava mesclada);
- o botão "Vínculo" e a importação de questões do Admin falhavam.

As correções de banco do #95 (trava de exclusão, repetição, clique duplo)
ficaram fora do ar até ~18:12 UTC. O front do #95 não dependia delas: mesma
assinatura.

Nenhum vínculo se perdeu: depois das duas aplicações, os 9 vínculos antigos
estão em `question_materials` (consulta direta, 0 sem cópia).

## Causa-raiz

A trava da D-6 confia em quem põe o rótulo. O rótulo foi posto antes da
revisão, e o check ficou verde. A mensagem da trilha terminava com "faltam a
revisão, a aplicação da migration, o rótulo e o merge": uma lista de passos
que o dono executou na ordem em que chegou. A conferência da migration
continuava sem nenhum bloqueio mecânico (a 46-E ainda não existia).

## Correção

- O dono aplicou as duas migrations (~18:05 e ~18:12 UTC). A diretoria
  conferiu por consulta direta: tabela, RLS, grants, funções, `for update` e
  cópia dos vínculos.
- O SQL da `20260927130000` foi lido pela diretoria antes da aplicação.

## Prevenção

- **46-E:** o check `migration-no-remoto` lê o remoto e fica vermelho
  enquanto a migration do PR não estiver aplicada.
- **Quem põe o rótulo é a sessão que revisou, não o dono** (D-6, revisão de
  27/09). O dono só mescla com todos os checks verdes.
- As trilhas encerram a mensagem com "pronto para revisão", sem listar rótulo
  e merge como passos do dono.

## Pendências e critério de encerramento

- Dono: P-4 (credencial e segredo) e os checks `revisado` e
  `migration-no-remoto` como obrigatórios no ruleset do `main`.
- `resolved` quando a 46-E estiver comprovada num PR real: vermelho com a
  migration fora do remoto e verde depois de aplicada.
