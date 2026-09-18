## O que muda e por quê

<!-- O problema (com o efeito concreto para o usuário) e a solução. -->

## Como foi validado

- [ ] `npm run typecheck` e `npm run lint` limpos
- [ ] `npm run test:unit`
- [ ] pgTAP (`npm run test:db`) — se muda schema/RPC/RLS
- [ ] Playwright (`npm run test:e2e`) — se muda fluxo de usuário
- [ ] Preview da Vercel conferido no navegador — se muda tela

## Banco de dados

- [ ] Sem migration
- [ ] Com migration — aplicar no remoto (`supabase db push --linked`)
      **antes** / **depois** do merge (riscar a que não vale) porque: …

## Riscos e o que não foi verificado

<!-- Seja explícito sobre o que ficou de fora. -->
