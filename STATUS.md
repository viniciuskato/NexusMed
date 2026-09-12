# Estado atual — NexusMed

Atualizado em: 2026-09-12

## Sessão ativa

Nenhuma em execução. O 22-A está pronto para despacho executivo.

## Aguardando diretoria

- Reorganização “Estudo Temático / packs”: ZIP auditado contra `main` pós-13-B. O protótipo é aproveitável seletivamente, mas a cópia integral apagaria a suíte/CI e restauraria o SRS inseguro. Prompt 22-A preparado para transposição controlada.

## Próximos candidatos

Gate "retorno e decisão do 13-B" / "fundação de testes publicada" / "testes publicados" está SATISFEITO desde 2026-09-12 (ver Marcos aceitos). Ordem permanece a definir pela diretoria antes do próximo despacho — nenhum destes foi liberado automaticamente só pela queda do gate.

| Ordem | ID | Estado | Gate |
|---:|---|---|---|
| 1 | 22-A | PRONTA | transposição seletiva sobre `42252b9` |
| 2 | 18-A | ELEGÍVEL | gate satisfeito (13-B publicada) |
| 3 | 19-A | ELEGÍVEL | gate satisfeito (suíte publicada) |
| 4 | 14-A | ELEGÍVEL | gate satisfeito; ainda exige reconciliar conflitos antes do despacho |
| 5 | 15-A | ELEGÍVEL | gate satisfeito |
| 6 | 16-A | ELEGÍVEL | gate satisfeito |
| 7 | 21-A2 | ELEGÍVEL | auditoria somente leitura; substitui 21-A |
| 8 | 20-A | CONDICIONAL | valor atual da carga YAML ainda não reavaliado |
| 9 | 17-A | ADIADA | decisão estratégica de offline |

## Marcos aceitos

- 12-B: PUBLICADA; `main`/`origin/main` verificados em `0c7834a`, merge técnico `e90fcee`.
- 12-C: ENCERRADA; Área Editorial validada, sem alteração de código.
- 13-A: PARCIAL; commit local declarado `4bf8dce`; Vitest 15/15, pgTAP 183/183 e Playwright 10/10; complementação no 13-B.
- 13-B: PUBLICADA (2026-09-12); `main`/`origin/main` verificados em `42252b9`, merge `af1dbd4` (`--no-ff`, ancestral de `main` confirmado), 4 fixes de CI confirmados sem tocar RPC/RLS/migration, `FlashcardReviewSession` religada à RPC `submit_flashcard_review` (código morto `FlashcardReviewer.tsx` removido, confirmado ausente), 7 specs de concorrência confirmados em `concurrencia-13b.spec.ts`. Dívida técnica aberta: corrida entre abas do mesmo `BrowserContext` na fila de sync; acessibilidade de teclado do `AdminCMSView`. Ver `sessions/13-B.md`.

## Próxima ação da diretoria

Despachar 22-A em sessão executiva separada; verificar o retorno antes de qualquer publicação.
