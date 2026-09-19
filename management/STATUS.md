# Estado atual — NexusMed

Atualizado em: 2026-09-12

## Sessão ativa

Nenhuma em execução. Incidente do cache de flashcard corrigido, verificado e publicado (ver Marcos aceitos). 22-A volta a ser o próximo candidato natural.

## Aguardando diretoria

- Reorganização “Estudo Temático / packs”: ZIP auditado contra `main` pós-13-B. O protótipo é aproveitável seletivamente, mas a cópia integral apagaria a suíte/CI e restauraria o SRS inseguro. Prompt 22-A preparado para transposição controlada; base agora é `b8795ab` (pós-hotfix), não mais `42252b9`.

## Próximos candidatos

Gate "retorno e decisão do 13-B" / "fundação de testes publicada" / "testes publicados" está SATISFEITO desde 2026-09-12 (ver Marcos aceitos).

| Ordem | ID | Estado | Gate |
|---:|---|---|---|
| 1 | 22-A | PRONTA | transposição seletiva; rebase sobre `b8795ab` (pós-hotfix) |
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
- HOTFIX-CACHE-FLASHCARD: PUBLICADA (2026-09-12); corrige achado pós-13-B (revisão de flashcard descartada em silêncio quando o card não está no cache local — ver `sessions/13-B-INCIDENTE-CACHE-FLASHCARD.md`). Branch `hotfix/flashcard-review-sem-cache-local` (commit `6c2d682`), CI real verde na branch (run `34724084979`) e em `main` pós-merge (run `34724624300`), merge `--no-ff` `b8795ab` sobre `42252b9`, `main`/`origin/main` = `b8795ab`. Suíte local completa (`verify:full`, com o `supabase db reset` extra entre pgTAP e Playwright que faltava — ver achado lateral abaixo) rodada 2x (pré e pós-merge), 18/18 Playwright + 183/183 pgTAP + 15/15 unit, incluindo o teste novo que reproduz o bug real sem `seedLocalFlashcardCache`. Deploy Vercel confirmado por hash de bundle idêntico byte a byte (`sha256:66b437d2...`) entre build local e produção. Achado lateral corrigido: `package.json`'s `verify:full` não tinha o segundo `supabase db reset` entre pgTAP e Playwright que `ci.yml` já fazia (comentário do próprio 13-B avisava disso) — sem essa correção, `verify:full` local reproduzia 2 falhas inexistentes no CI real (pgTAP deixa fixtures de `questions` publicadas sem rollback, poluindo a listagem que os testes de concorrência/simulado assumem). Não gerou dúvida sobre a aceitação do 13-B: o CI real dele sempre teve o reset duplo. Ver `sessions/13-B-INCIDENTE-CACHE-FLASHCARD.md`.

## Próxima ação da diretoria

Retomar a fila normal de candidatos (22-A em primeiro). Rebasear 22-A sobre `b8795ab`, não mais `42252b9`.
