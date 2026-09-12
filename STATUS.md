# Estado atual — NexusMed

Atualizado em: 2026-09-12

## INCIDENTE ATIVO — bloqueia qualquer publicação nova

Revisão de flashcard não é gravada no servidor quando o card não está no cache local do navegador (`localStorage`) — o que é o caso de praticamente todo flashcard de conteúdo real, sempre, em qualquer dispositivo/sessão. `ResilientFlashcardsRepository.reviewFlashcard` só chama a RPC `submit_flashcard_review` quando `StorageService.reviewFlashcard` encontra o card no cache local; como nada nunca hidrata esse cache a partir da leitura do Supabase, a chamada é pulada e a UI mostra sucesso (avança fila, confete) sem gravar nada. CONFIRMADO por leitura de código (não é suposição), CRÍTICO, já em produção desde a publicação do 13-B. Ver `sessions/13-B-INCIDENTE-CACHE-FLASHCARD.md`.

**Não subir mais nada para o servidor até este incidente ser corrigido e verificado.**

## Sessão ativa

Nenhuma em execução. Próxima sessão deve ser o hotfix do incidente acima, não o 22-A.

## Aguardando diretoria

- Reorganização “Estudo Temático / packs”: ZIP auditado contra `main` pós-13-B. O protótipo é aproveitável seletivamente, mas a cópia integral apagaria a suíte/CI e restauraria o SRS inseguro. Prompt 22-A preparado para transposição controlada. Fica atrás do hotfix do incidente na fila.

## Próximos candidatos

Gate "retorno e decisão do 13-B" / "fundação de testes publicada" / "testes publicados" está SATISFEITO desde 2026-09-12 (ver Marcos aceitos). A ordem abaixo foi reordenada para colocar o hotfix do incidente na frente; o resto permanece a definir pela diretoria.

| Ordem | ID | Estado | Gate |
|---:|---|---|---|
| 1 | HOTFIX-CACHE-FLASHCARD | A DEFINIR | incidente crítico confirmado; precisa de prompt formal e autorização para tocar `reviewFlashcard`/RPC |
| 2 | 22-A | PRONTA | transposição seletiva sobre `42252b9`; aguarda o hotfix acima |
| 3 | 18-A | ELEGÍVEL | gate satisfeito (13-B publicada) |
| 4 | 19-A | ELEGÍVEL | gate satisfeito (suíte publicada) |
| 5 | 14-A | ELEGÍVEL | gate satisfeito; ainda exige reconciliar conflitos antes do despacho |
| 6 | 15-A | ELEGÍVEL | gate satisfeito |
| 7 | 16-A | ELEGÍVEL | gate satisfeito |
| 8 | 21-A2 | ELEGÍVEL | auditoria somente leitura; substitui 21-A |
| 9 | 20-A | CONDICIONAL | valor atual da carga YAML ainda não reavaliado |
| 10 | 17-A | ADIADA | decisão estratégica de offline |

## Marcos aceitos

- 12-B: PUBLICADA; `main`/`origin/main` verificados em `0c7834a`, merge técnico `e90fcee`.
- 12-C: ENCERRADA; Área Editorial validada, sem alteração de código.
- 13-A: PARCIAL; commit local declarado `4bf8dce`; Vitest 15/15, pgTAP 183/183 e Playwright 10/10; complementação no 13-B.
- 13-B: PUBLICADA (2026-09-12); `main`/`origin/main` verificados em `42252b9`, merge `af1dbd4` (`--no-ff`, ancestral de `main` confirmado), 4 fixes de CI confirmados sem tocar RPC/RLS/migration, `FlashcardReviewSession` religada à RPC `submit_flashcard_review` (código morto `FlashcardReviewer.tsx` removido, confirmado ausente), 7 specs de concorrência confirmados em `concurrencia-13b.spec.ts`. Dívida técnica aberta: corrida entre abas do mesmo `BrowserContext` na fila de sync; acessibilidade de teclado do `AdminCMSView`. Ver `sessions/13-B.md`.

## Próxima ação da diretoria

Preparar e despachar hotfix do incidente de cache de flashcard antes de qualquer outra coisa. Só depois retomar 22-A/demais candidatos.
