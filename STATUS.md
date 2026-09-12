# Estado atual — NexusMed

Atualizado em: 2026-09-12

## Sessão ativa

Nenhuma. 13-B publicada e verificada (ver Marcos aceitos); nenhum prompt novo foi despachado ainda.

## Aguardando diretoria

- Reorganização “Estudo Temático / packs”: retorno funcional recebido; causa declarada (rota não mapeada) e desenho de packs por material CONFIRMADOS por inspeção direta do snapshot exportado do Google AI Studio (`synapsemed-firebase-auth.zip`, sem segredos, sem lockfile). Ainda faltam: diff contra a base pós-13-B, typecheck/lint/test/build executados, evidência de navegador e checagem do gate de admin. Ver `sessions/ESTUDO-TEMATICO-PACKS.md`. A restrição de não concorrer com o 13-B caiu (13-B encerrada); publicação/merge continuam bloqueados pelas lacunas de evidência, agora só disputando prioridade com a fila abaixo.

## Próximos candidatos

Gate "retorno e decisão do 13-B" / "fundação de testes publicada" / "testes publicados" está SATISFEITO desde 2026-09-12 (ver Marcos aceitos). Ordem permanece a definir pela diretoria antes do próximo despacho — nenhum destes foi liberado automaticamente só pela queda do gate.

| Ordem | ID | Estado | Gate |
|---:|---|---|---|
| 1 | 18-A | ELEGÍVEL | gate satisfeito (13-B publicada) |
| 2 | 19-A | ELEGÍVEL | gate satisfeito (suíte publicada) |
| 3 | 14-A | ELEGÍVEL | gate satisfeito; ainda exige reconciliar conflitos antes do despacho |
| 4 | 15-A | ELEGÍVEL | gate satisfeito |
| 5 | 16-A | ELEGÍVEL | gate satisfeito |
| 6 | 21-A2 | ELEGÍVEL | auditoria somente leitura; substitui 21-A; pode rodar em paralelo a qualquer uma acima |
| 7 | 20-A | CONDICIONAL | valor atual da carga YAML ainda não reavaliado |
| 8 | 17-A | ADIADA | decisão estratégica de offline |

## Marcos aceitos

- 12-B: PUBLICADA; `main`/`origin/main` verificados em `0c7834a`, merge técnico `e90fcee`.
- 12-C: ENCERRADA; Área Editorial validada, sem alteração de código.
- 13-A: PARCIAL; commit local declarado `4bf8dce`; Vitest 15/15, pgTAP 183/183 e Playwright 10/10; complementação no 13-B.
- 13-B: PUBLICADA (2026-09-12); `main`/`origin/main` verificados em `42252b9`, merge `af1dbd4` (`--no-ff`, ancestral de `main` confirmado), 4 fixes de CI confirmados sem tocar RPC/RLS/migration, `FlashcardReviewSession` religada à RPC `submit_flashcard_review` (código morto `FlashcardReviewer.tsx` removido, confirmado ausente), 7 specs de concorrência confirmados em `concurrencia-13b.spec.ts`. Dívida técnica aberta: corrida entre abas do mesmo `BrowserContext` na fila de sync; acessibilidade de teclado do `AdminCMSView`. Ver `sessions/13-B.md`.

## Próxima ação da diretoria

Escolher, entre os candidatos elegíveis (18-A, 19-A, 14-A, 15-A, 16-A, 21-A2), qual despachar em seguida — ou fechar antes as lacunas de evidência do "Estudo Temático / packs". Nenhum despacho foi feito automaticamente por esta atualização.
