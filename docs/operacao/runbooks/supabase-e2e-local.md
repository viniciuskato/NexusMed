# Runbook — E2E contra Supabase local

## Pré-requisitos

- Docker acessível.
- Supabase CLI acessível no `PATH` ou por caminho absoluto conhecido.
- URL resolvida pelo CLI limitada a `localhost`/`127.0.0.1`.
- No Windows com PowerShell restrito, usar executáveis `.cmd` quando
  aplicável.

## Preflight

```text
docker info
supabase --version
supabase status -o json
```

Se qualquer item falhar, registre `infraestrutura não disponível`; não
declare os testes como executados ou aprovados.

## Sequência completa

```text
supabase start
supabase db reset
npm.cmd run test:db
supabase db reset
npm.cmd run test:e2e
```

O segundo reset é obrigatório porque pgTAP deixa fixtures persistentes.

## Verificação de limpeza

Ao final, confirmar zero usuários de teste:

```sql
select count(*)
from auth.users
where email like 'e2e-13a-%';
```

O job `full` do CI executa esta prova independentemente do resultado do
Playwright. Não remover nem transformar a falha em aviso.

## Diagnóstico de resíduos

1. Identificar quais testes criaram os usuários restantes.
2. Procurar FKs que referenciem seus IDs.
3. Confirmar a ordem dos callbacks de teardown.
4. Confirmar que a API verifica `{ error }`, não apenas rejeição.
5. Corrigir a causa; não apagar resíduos como substituto do teste.
