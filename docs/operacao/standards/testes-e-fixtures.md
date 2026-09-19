# Standard — testes e fixtures descartáveis

## Objetivo

Garantir que testes locais e de CI sejam isolados, repetíveis e falhem de
forma visível quando a limpeza estiver incompleta.

## Regras obrigatórias

1. Toda fixture tem prefixo ou identificador determinístico.
2. Registre o cleanup imediatamente após criar o recurso.
3. Execute callbacks em ordem LIFO: filhos/dependências primeiro;
   proprietários/autores por último.
4. Use `runCleanup` para executar todos os callbacks e agregar falhas.
5. Nunca use `.catch(() => undefined)` em limpeza.
6. APIs Supabase devem ter o campo `error` verificado explicitamente.
7. A suíte termina com uma asserção independente de zero resíduos.
8. Se pgTAP rodou antes do Playwright, execute `supabase db reset` entre
   as suítes.
9. Limpeza que falha é falha do teste, não ruído de teardown.

## Padrão TypeScript

```ts
const cleanup: Array<() => Promise<void> | void> = [];

const user = await createTestUser(...);
cleanup.push(() => deleteTestUser(user.id));

const dependent = createDependentFixture(user.id);
cleanup.push(() => deleteDependentFixture(dependent.id));

test.afterEach(async () => {
  await runCleanup(cleanup.slice().reverse());
  cleanup.length = 0;
});
```

## Gate de encerramento

Um teste que cria recursos persistentes somente está concluído quando:

- comportamento funcional passou;
- callbacks de cleanup passaram;
- consulta independente confirmou zero resíduos.
