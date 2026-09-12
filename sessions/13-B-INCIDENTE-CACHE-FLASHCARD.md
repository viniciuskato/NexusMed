# Incidente: revisão de flashcard não gravada quando o card não está no cache local

- Estado: CONFIRMADO (verificação independente por leitura de código, não por execução em runtime)
- Severidade: CRÍTICA — perda silenciosa de dado do usuário, já em produção (13-B publicado e deployado)
- Origem da investigação: sessão de diretoria no Codex, interrompida por limite de uso ao investigar se os testes de concorrência do 13-B validam o fluxo real ou preenchem um cache que o app não preenche sozinho.

## Cadeia confirmada

1. `src/App.tsx:199` (`refreshData`) busca flashcards via `flashcardsRepository.getFlashcards()` e só faz `setFlashcards(nextFlashcards)` — nunca chama `saveFlashcards`/hidrata o cache local. Único call site de `flashcardsRepository.getFlashcards()` em `App.tsx` (confirmado por grep).
2. `src/repositories/FlashcardsRepository.ts` → `ResilientFlashcardsRepository.reviewFlashcard(cardId, rating)` chama primeiro `this.local.reviewFlashcard(cardId, rating)`.
3. `src/services/storage.ts:231-234` (`StorageService.reviewFlashcard`): `const idx = cards.findIndex((c) => c.id === cardId); if (idx < 0) return null;` — `cards` vem do cache local (`synapse_<uid>_flashcards_v1`), que nunca contém os cards vindos do Supabase (passo 1).
4. De volta em `reviewFlashcard`: `if (isSupabaseConfigured && userId && localRes)` — com `localRes === null`, o bloco que chama `enqueueAndTry(userId, 'flashcard_review', ...)` (a RPC `submit_flashcard_review`) é pulado inteiro. Retorna `null` sem nunca contatar o servidor.
5. `src/components/flashcards/FlashcardReviewSession.tsx` (`handleRate`): `const updatedCard = reviewedCard ?? currentCard;` absorve o `null` silenciosamente, incrementa `reviewedCount`, avança a fila e mostra a tela de sessão concluída (com confete) — sem nunca ter gravado nada.

## Por que o teste do 13-B não pegou isso

`tests/e2e/specs/concurrencia-13b.spec.ts` chama `seedLocalFlashcardCache(page, user.id, flashcardId, seed)` antes de abrir a revisão — grava o card manualmente em `localStorage` na chave `synapse_${userId}_flashcards_v1`. Isso faz `idx >= 0` em `StorageService.reviewFlashcard`, então `localRes` fica truthy e a RPC é chamada de verdade. O teste prova que a RPC/lock funcionam quando invocados; não prova que o app real os invoca, porque contorna exatamente o passo que falha em produção.

## Alcance

Afeta qualquer flashcard cujo id não esteja no cache local do navegador/dispositivo no momento da revisão — na prática, todo flashcard de conteúdo real (carregado via `scripts/load-*` direto no Supabase), em qualquer sessão/dispositivo novo, sempre, porque nada nunca escreve esse cache a partir da leitura do servidor. Cards criados localmente pelo próprio usuário (`createFlashcardFromQuestion`, que já escreve local-first) não são afetados.

## Impacto em produção

13-B foi publicado e deployado (ver `sessions/13-B.md`, main = `42252b9`, deploy Vercel confirmado). Este bug já está ativo em produção: revisões de flashcard de conteúdo real provavelmente não estão sendo gravadas para nenhum usuário, silenciosamente.

## Decisão

Não subir nada novo para o servidor até corrigir. Prioridade máxima, acima de 22-A/18-A/19-A/etc. na fila. Correção precisa de autorização explícita por tocar o mesmo caminho sensível (`reviewFlashcard`/RPC) que o 13-B já mexeu — mesma exigência de autorização especial de antes.

Direção de correção candidata (não implementada ainda): não condicionar a chamada de `enqueueAndTry('flashcard_review', ...)` à existência do card no cache local; o servidor já recalcula o SRS a partir do estado autoritativo (comentário em `FlashcardReviewSession.tsx`), então `localRes` não deveria ser pré-requisito para contatar o servidor — só para a otimização de UX local. Precisa de teste novo que reproduza o cenário sem `seedLocalFlashcardCache` (card só existe no servidor) para provar a correção.
