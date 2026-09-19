# Standard — atualização de dependências

## Objetivo

Manter dependências atualizadas sem aceitar árvores inválidas, mascarar
conflitos de peer dependencies ou transformar upgrades de toolchain em
mudanças automáticas de alto risco.

## Política

1. Atualizações `minor` e `patch` continuam sendo propostas semanalmente
   pelo Dependabot e só entram com CI verde.
2. Majors de `eslint`, `@eslint/js` e `typescript` não são abertas
   automaticamente. Elas exigem uma tarefa de migração planejada.
3. Uma migração de toolchain deve atualizar em conjunto o pacote principal,
   seus presets, parsers e plugins compatíveis.
4. Nunca contornar `ERESOLVE` com `--force` ou `--legacy-peer-deps` para
   aprovar uma atualização.
5. Antes de publicar a branch, executar `npm ci`, `npm run verify:fast` e,
   quando o toolchain puder afetar E2E ou build, o gate completo do CI.

## Como executar uma major planejada

1. Confirmar as faixas de peer dependencies de todos os pacotes envolvidos.
2. Criar uma branch exclusiva a partir da `main` atualizada.
3. Atualizar o ecossistema como uma unidade e regenerar o lockfile com
   `npm install` sem flags de coerção.
4. Corrigir configuração, regras e código afetados pela nova major.
5. Validar instalação limpa e todos os gates.
6. Remover ou ajustar temporariamente o `ignore` em
   `.github/dependabot.yml` somente dentro da própria migração.

## Critério de rejeição

Fechar sem merge qualquer PR automático que:

- falhe no `npm ci` por incompatibilidade de peer dependency;
- atualize apenas uma parte de um toolchain acoplado;
- dependa de coerção do resolvedor para instalar;
- ainda não tenha suporte declarado pelos plugins adotados no projeto.
