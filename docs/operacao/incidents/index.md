# Incidentes operacionais

Fonte canônica de falhas relevantes, suas causas-raiz e prevenções.
O PR continua sendo o diário da mudança; este diretório registra apenas
o aprendizado que precisa sobreviver ao PR.

## Quando abrir um incidente

Abra um registro quando ocorrer pelo menos um destes casos:

- falha em CI ou produção;
- risco de perda, corrupção ou exposição de dados;
- causa difícil de descobrir ou com chance razoável de recorrência;
- impacto em mais de um componente, ambiente ou sessão;
- necessidade de mudar processo, arquitetura, teste ou monitoramento.

Falhas triviais, imediatamente compreensíveis e sem aprendizado
generalizável ficam somente no commit ou PR.

## Estados

`investigating` → `mitigated` → `verifying` → `resolved`

Use `resolved` somente quando a prevenção executável estiver validada.

## Registros

| ID | Data | Severidade | Área | Estado | Resumo |
|---|---|---|---|---|---|
| [INC-2026-001](INC-2026-001-fixtures-e2e-residuais.md) | 2026-09-18 | média | E2E/CI | resolved | Teardown deixou três usuários `e2e-13a-*` no Supabase local |

## Regra de consolidação

- Fato do evento: permanece no incidente.
- Regra generalizável: vai para `../standards/`.
- Procedimento: vai para `../runbooks/` ou `../RUNBOOK.md`.
- Decisão arquitetural: vai para `../DECISIONS.md`.
- Prevenção verificável: vira teste ou gate de CI.
- `AGENTS.md`: recebe apenas resumo e link quando o risco for crítico.
