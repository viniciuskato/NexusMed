# Incidente: revisão de flashcard não gravada quando o card não está no cache local

- Estado: RESOLVIDO E PUBLICADO (2026-09-12)
- Severidade: CRÍTICA — perda silenciosa de dado do usuário, esteve em produção desde a publicação do 13-B até o hotfix
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

RESOLVIDO. Correção implementada e verificada com ferramentas próprias, autorizada pelo usuário diretamente nesta sessão (não foi preciso prompt formal separado — a mesma sessão de diretoria implementou, testou e publicou).

## Correção aplicada

`ResilientFlashcardsRepository.reviewFlashcard` (`src/repositories/FlashcardsRepository.ts`) deixou de condicionar a chamada de `enqueueAndTry('flashcard_review', ...)` à existência do card no cache local. Assinatura mudou de `reviewFlashcard(cardId, rating)` para `reviewFlashcard(card: Flashcard, rating)` — o chamador (`FlashcardReviewSession.tsx`) já tinha o card completo em mãos, então quando o cache local não tem o card (`localRes === null`), o card passado pelo chamador vira a base para o resultado convergido, e a RPC é chamada de qualquer forma. O resultado do servidor grava no cache local depois (self-healing). `SupabaseFlashcardsRepository.reviewFlashcard` (código morto, mantido só pela interface) e `scripts/validate-personal-repos.ts` atualizados para a nova assinatura.

Teste novo em `concurrencia-13b.spec.ts` ("flashcard que NUNCA passou por saveFlashcard local...") reproduz o cenário real (card só inserido no servidor via SQL, sem `seedLocalFlashcardCache`) e prova que a revisão é gravada.

## Achado lateral: gate `verify:full` local incompleto

Ao rodar a suíte completa localmente pela primeira vez, apareceram 2 falhas em testes não relacionados (reação a questão, finalização de simulado). Investigação por eliminação (rodar os 2 testes isolados após `supabase db reset`: passam; rodar a suíte inteira: falham de novo) apontou a causa real: `rls_policies.test.sql` (pgTAP) insere fixtures de `public.questions`, algumas com `status='published'`, e roda em autocommit (sem `BEGIN`/`ROLLBACK` — comentário no próprio arquivo já documentava isso), então essas questões de teste ficam poluindo a tabela depois do `npm run test:db`. O `ci.yml` já sabia disso e faz um segundo `supabase db reset` entre o passo de pgTAP e o de Playwright (comentário: "pg_prove grava permanentemente, sem rollback (achado do Prompt 13-B)") — mas o script `verify:full` do `package.json`, usado localmente, não tinha esse segundo reset. Corrigido: `"verify:full": "npm run verify:fast && npm run test:db && supabase db reset && npm run test:e2e"`. Isso não bate em nada a aceitação do 13-B (o CI real dele sempre teve o reset duplo) — era só uma divergência entre o script de conveniência local e o pipeline real.

## Verificação e publicação

- CI real (GitHub Actions) verde na branch `hotfix/flashcard-review-sem-cache-local` (commit `6c2d682`, run `34724084979`, conclusion=success).
- Merge `--no-ff` em `main`: commit `b8795ab` sobre base `42252b9`.
- CI real verde em `main` pós-merge (run `34724624300`, conclusion=success).
- `npm run verify:full` local rodado 2x (pré e pós-merge) com o script corrigido: 18/18 Playwright, 183/183 pgTAP, 15/15 unit, typecheck e lint (90 warnings, dentro do limite de 93) limpos em ambas as vezes.
- `git push origin main`: `42252b9..b8795ab`.
- Deploy Vercel confirmado: hash do bundle em produção (`https://synapse-med-firebase-auth.vercel.app/assets/index-DdHpjmJ2.js`) idêntico byte a byte (`sha256:66b437d231361dd519db54872b1244c1f2b32e756f34a7be11b96d8e57cf97a5`) ao build local do commit publicado. Confirmado por comparação com o hash do build da versão anterior (`index-Bfi7dsF5.js`, hash diferente), descartando coincidência.
- Não foi rodado `scripts/smoke-test-remote.ts` (cria usuário real em produção, exige passo manual no dashboard, e testa só Materials/Questions — não flashcard); a verificação de bundle + CI real foi considerada suficiente e mais segura dado o alerta existente sobre `.env.local` deste projeto apontar pro remoto por padrão.
