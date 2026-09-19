---
id: INC-2026-001
status: resolved
severity: medium
area: e2e-ci
detected_at: 2026-09-18
owner: nexusmed
pr: 18
commits:
  - 17af650
  - cacc940
  - 94ba148
prevention:
  test: true
  ci: true
  standard: true
  runbook: true
---

# INC-2026-001 — usuários E2E residuais após a suíte 21-D

## Sintoma e impacto

O job `full` do PR #18 executou pgTAP e Playwright com sucesso, mas falhou
na verificação final porque restaram três usuários com prefixo
`e2e-13a-` no Supabase local do runner. Não houve impacto em produção;
o defeito afetava isolamento e confiabilidade da suíte.

## Causa-raiz

O spec `cms-human-review-21d.spec.ts` registrava a exclusão do usuário
antes da limpeza do conteúdo criado por ele e executava callbacks na mesma
ordem. Nos três cenários que geravam revisões ou atestados editoriais, as
FKs `RESTRICT` impediam apagar o autor antes dos registros dependentes.

A falha era ocultada por dois mecanismos:

1. `auth.admin.deleteUser()` devolve `{ error }`; não rejeita a promise.
2. O teardown aplicava `.catch(() => undefined)`, descartando falhas.

Depois, o conteúdo era apagado, mas o usuário que falhou primeiro
permanecia. Isso explica a contagem exata de três resíduos.

## Condições de reprodução

1. Criar usuário E2E administrador.
2. Criar revisão/atestado que referencie esse usuário.
3. Tentar apagar o usuário antes do conteúdo dependente.
4. Ignorar o campo `error` retornado pela Admin API.
5. Consultar `auth.users` por `email like 'e2e-13a-%'` ao final.

## Correção

- Commit `17af650`: teardown passou a executar callbacks em ordem LIFO.
- Integração com `main`: o spec passou a usar `runCleanup`, que executa
  todos os callbacks e reprova o teste se qualquer limpeza falhar.
- `deleteTestUser` da base atual verifica explicitamente `{ error }`.

## Prevenção

- Regra: dependências são removidas antes de seus proprietários/autores.
- Helper: specs E2E usam `runCleanup`; não usam `catch` vazio.
- CI: o job `full` termina consultando zero usuários `e2e-13a-*`.
- Standard: [`../standards/testes-e-fixtures.md`](../standards/testes-e-fixtures.md).
- Runbook: [`../runbooks/supabase-e2e-local.md`](../runbooks/supabase-e2e-local.md).

## Evidências

- Reprodução: job `full` do PR #18 encontrou três resíduos após os
  testes passarem.
- Typecheck local após a primeira correção: aprovado.
- Teste E2E local: bloqueado porque o Supabase CLI não estava no `PATH`;
  a suíte falhou antes dos cenários, sem invalidar a causa-raiz.
- CI após integrar a `main`: os dois jobs `full` passaram em 5m57s e
  5m58s, incluindo pgTAP, Playwright e a consulta independente de zero
  fixtures `e2e-13a-*` remanescentes.

## Pendências e critério de encerramento

Encerrado em 2026-09-19: o PR #18 executou os dois jobs `full` com
Playwright verde e contagem final igual a zero.
