# Sincronização confiável entre dispositivos (Prompt 07-A / 07-B / 07-C)

> Executado em `C:\Users\vinic\dev\NexusMed\firebase-auth`, branch
> `work/sincronizacao-confiavel-07`. Este documento é o retorno completo da
> Etapa 1 (diagnóstico), Etapa 2 (modelo) e Etapa 3 (UX) do Prompt 07-A, e
> registra o que foi de fato implementado nas Etapas 4-6 (categorias 1 e 2)
> versus o que fica como plano para as demais categorias.
>
> **Atualização 07-B**: a revisão da diretoria sobre o código do 07-A
> encontrou quatro bloqueios reais que a Etapa 6 original não tinha
> exercitado em navegador (não havia automação disponível naquela sessão).
> Os quatro foram reproduzidos e corrigidos nesta entrega — ver seção
> "Correções do Prompt 07-B" abaixo, que também substitui qualquer afirmação
> de isolamento/recuperação feita mais abaixo neste documento que ainda não
> era verdadeira antes desta correção.
>
> **Atualização 07-C**: a revisão da diretoria sobre o código do 07-B
> encontrou quatro pendências adicionais, todas na recuperação legada e na
> geração de `client_op_id` — nenhuma delas exigiu migration nova. As quatro
> foram reproduzidas e corrigidas nesta entrega, além de um bug real
> encontrado só durante o teste de navegador da correção do Problema 4 (não
> por leitura de código) — ver seção "Correções do Prompt 07-C" abaixo, que
> também substitui qualquer afirmação de recuperação legada feita mais abaixo
> neste documento que ainda não era verdadeira antes desta correção. Também
> foi validado nesta entrega, com dois `BrowserContext` reais, o isolamento
> entre duas contas (estudante e editorial/admin) sob os mesmos cenários já
> cobertos no 07-B — ver "Validação de isolamento entre contas (07-C)".

## Etapa 1 — Diagnóstico por categoria

Todas as categorias abaixo seguem o mesmo esqueleto
"`Resilient<X>Repository`": grava sempre no `localStorage` primeiro
(`Local<X>Repository`/`StorageService`), depois tenta espelhar no Supabase
(`Supabase<X>Repository`) dentro de um `try { await ... } catch {}` — nenhum
retorno de erro, nenhum log visível, nenhuma fila. Isso é o achado do Prompt
06 (R2), confirmado nesta sessão arquivo por arquivo. **O que muda de
categoria para categoria não é o padrão de falha (é sempre o mesmo), e sim o
custo de reenviar a operação sem cuidado** — é isso que define a prioridade
abaixo.

| # | Categoria | Leitura começa em | Escrita ocorre em | Local | Supabase | Quem prevalece após login/reload/troca de dispositivo | Repetir a operação duplica? |
|---|---|---|---|---|---|---|---|
| 1 | Tentativas de questão | `AnswersRepository.getAnswers` | `AnswersRepository.recordAnswer` | `localStorage` (`synapse_<uid>_answers_v1`, 1 registro por questão — sobrescreve) | `question_attempts` (histórico completo, 1 linha por tentativa) + `error_notebook` (auto) via RPC `submit_question_attempt` | Supabase quando configurado e a leitura funciona; local só como fallback | **Sim, antes desta entrega.** Reenviar a mesma resposta inseria uma nova linha em `question_attempts` (sem chave de idempotência) e, se incorreta, uma nova linha em `error_notebook` a cada vez — infla o histórico e o XP calculado a partir dele (`GamificationService`, ver AGENTS.md armadilha #5) |
| 2 | Flashcards / SRS | `FlashcardsRepository.getFlashcards`/`getDueFlashcards` | `saveFlashcard`, `createFlashcardFromQuestion`, `deleteFlashcard`, `updateFlashcardSRS`, `reviewFlashcard` | `localStorage` isolado por UID | `flashcards` (upsert por id) + `flashcard_srs_state` (upsert por `flashcard_id`) + `flashcard_reviews` (insert, histórico) | Supabase quando tem ≥1 card; senão local | `saveFlashcard`/`deleteFlashcard`/`updateFlashcardSRS` já eram upsert/delete por id (idempotentes por natureza). **`reviewFlashcard` não era**: o SM-2 era calculado no navegador a partir do estado local e gravado em duas escritas separadas (`flashcard_srs_state` + `flashcard_reviews`) sem chave de idempotência — reenviar duplicava a linha de histórico e, em caso de duas revisões offline em dispositivos diferentes, a que sincronizasse por último "vencia" com um cálculo baseado em estado desatualizado |
| 3 | Caderno de erros | `ErrorNotebookRepository.getErrorLogs` | `updateErrorLog` (só `resolved`/`user_notes`, grant restrito) | `localStorage` | `error_notebook` (criado automaticamente por `submit_question_attempt`, nunca por escrita direta do cliente) | Supabase | `updateErrorLog` é upsert por id — idempotente. O registro em si não é escrito pelo cliente (efeito colateral de categoria 1) |
| 4 | Notas | `NotesRepository.getNotes` | `saveNote` | `localStorage` (`Record<targetId, texto>`) | `notes` (upsert por `(user_id, target)`, a definir — ver Etapa 4 pendente) | Supabase | Idempotente por natureza (upsert por alvo) — risco baixo |
| 5 | Favoritos | `BookmarksRepository.getBookmarks` | `toggleBookmark` | `localStorage` (listas por tipo) | `bookmarks` (`unique (user_id, question_id\|material_id\|flashcard_id)`) | Supabase | **Não é idempotente por design**: é um *toggle* (liga/desliga), não um "set". Reenviar a mesma operação depois de uma falha inverte o estado errado (favoritou → tenta de novo pensando que falhou → desfavorita). Precisa virar `setBookmark(id, true/false)` explícito antes de entrar numa fila de retry — não é só "adicionar client_op_id" |
| 6 | Progresso de leitura | `ReadingProgressRepository.getReadingProgress` | `toggleSectionRead` | `localStorage` (`{ readSectionIds[], percent }` por compêndio) | `reading_progress` (`unique (user_id, material_id)`) | Supabase | **Mesmo problema do favorito**: `toggleSectionRead` também alterna (marca/desmarca seção lida), não define um valor. Mesma correção necessária antes de automatizar retry |
| 7 | Simulados/listas | `SimuladosRepository.getSimulados`/`getSimuladoHistory` | `saveSimuladoSession` | `localStorage` (lista por UID) | `simulations`/`simulation_questions`/`simulation_answers` | Supabase | Upsert por `session.id` (gerado no cliente) — idempotente por natureza, mas a sessão tem sub-escritas (perguntas, respostas) que não foram auditadas quanto a atomicidade nesta rodada |
| 8 | Reações 👍/👎 | `QuestionReactionsRepository.getMyReaction` | `setReaction`/`removeReaction` | `localStorage` (`Record<questionId, 'up'\|'down'>`) | `question_reactions` (toggle único por usuário/questão, ver migration `feedback_contextual`) | Supabase | `setReaction`/`removeReaction` parecem ser "set" explícito (não toggle cego) — mais fácil de tornar idempotente que bookmarks/reading_progress, mas não auditado a fundo nesta rodada |
| 9 | Feedback contextual | `FeedbackRepository.getFeedbacks` | `saveFeedback` | `localStorage` (lista) | `feedback` | Supabase | Depende de o id ser gerado no cliente (upsert) ou sempre um INSERT novo — não auditado a fundo; se for sempre INSERT, precisa de `client_op_id`+`unique` como categoria 1 |
| 10 | Preferências locais (tema, plano) | `StorageService.getTheme`/`getUserPlan` | `setTheme`/`setUserPlan` | `localStorage` apenas | **Não sincronizado hoje** (`profiles` não tem campo de tema/plano de UI) | Só local, por design atual | Não se aplica — não há escrita remota para essa preferência |

**Comportamento de logout/troca de conta** (comum a todas): `StorageService.setActiveUser(null)` no logout não apaga nada — os dados ficam no `localStorage` sob a chave do UID anterior. Login de outra conta no mesmo navegador troca `currentUserId` e todas as leituras/escritas passam a usar as chaves do novo UID — **nenhuma operação pendente do usuário anterior é enviada sob a sessão nova**, porque `getUserKey`/a fila nova (`syncQueue`) são sempre indexadas pelo UID que criou a operação, não pelo UID ativo no momento do envio (ver Etapa 2).

**Confirmação sobre XP**: não existe uma tabela de XP — `GamificationService.computeRealStats()` deriva o XP a partir da contagem/qualidade real de `question_attempts` (ver AGENTS.md armadilha #5). Isso significa que **qualquer duplicação em `question_attempts` infla XP diretamente**, sem precisar de uma tabela própria de XP para o risco ser real.

## Etapa 2 — Modelo de sincronização

### Fonte de verdade por categoria

- **Tentativas de questão (categoria 1)**: evento imutável, **nunca sobrescrito**. Fonte de verdade é o servidor (`question_attempts`); o cliente nunca decide "qual resposta vale", só registra uma tentativa nova a cada resposta (mesmo comportamento de antes — só a duplicação por retry que muda).
- **Flashcards/SRS (categoria 2)**: o *card em si* (front/back/tags) é um estado editável — upsert por id, "última gravação vence" é aceitável aqui porque é o próprio dono editando o próprio card, sem edição concorrente esperada. **O estado do SRS não pode usar essa regra**: é derivado de uma sequência de eventos (revisões), então a fonte de verdade é "estado atual + histórico no servidor", recalculado a cada revisão a partir do que existe no servidor no momento em que a revisão chega — nunca a partir do que o cliente lembra de ter visto por último.
- **Notas e favoritos**: estados editáveis, mas favoritos/progresso de leitura são *toggles*, não valores — tratados como pendência de redesenho (Etapa 1, linhas 5-6), não implementados nesta entrega.
- **Feedback/reações**: fora do escopo implementado; documentado como precisando de idempotência própria antes de entrar na fila.

### Infraestrutura compartilhada: `src/services/syncQueue.ts`

Fila persistente por usuário (`localStorage`, chave `synapse_<uid>_sync_queue_v1`), com:

- **Identificador idempotente por operação**: `client_op_id` (uuid gerado no cliente), enviado ao servidor em toda RPC de escrita sensível. O servidor usa esse id para decidir "já apliquei isso" e devolver o resultado já calculado, em vez de reaplicar.
- **Estados**: `pending` → `syncing` → `synced` | `failed`. Nunca existe "não sei" — todo item tem um estado explícito, consultável pela UI (`useSyncQueueStatus`).
- **Retentativa com backoff exponencial** (15s, 30s, 60s... até 10min, no máximo 8 tentativas) — só para erros classificados como `network` ou `unknown`.
- **Classificação de erro** (`classifySyncError`): `network`, `auth`, `permission`, `validation`, `schema`, `unknown`. Só `network`/`unknown` entram em retry automático; `auth` marca "precisa logar de novo" e só é retentado quando o usuário loga de novo (reconciliação dispara no login); `permission`/`validation`/`schema` marcam falha **permanente** (sem retry infinito) — são erros que reenviar não resolve.
- **Reconciliação automática** em: login/troca de usuário (`StorageService.setActiveUser` → `onActiveUserChanged`), evento `online`, aba voltando a ficar visível (`visibilitychange`), e um heartbeat a cada 60s enquanto houver usuários com fila conhecida.
- **Isolamento por usuário** (corrigido no 07-B — ver seção dedicada abaixo): a fila é uma chave de `localStorage` por UID, o que já impedia um item da fila de A ser confundido com um item da fila de B. Isso sozinho não era suficiente: o cliente Supabase é um único objeto global autenticado com UMA sessão por vez, e a versão original do 07-A **não conferia** se o dono da fila era também o usuário autenticado no momento do envio — `flushAllKnown()` (disparada por `online`/`visibilitychange`/heartbeat) varria TODOS os UIDs conhecidos no navegador, então a fila de A podia acabar sendo enviada autenticada como B se B tivesse acabado de logar no mesmo navegador. `runFlush` agora confere a sessão ativa do Supabase antes de cada operação, e `flushAllKnown` só toca a fila do usuário atualmente ativo.
- **Preservação de dados existentes**: a fila é aditiva — não apaga nem reescreve os dados que os repositórios locais já gravavam antes desta entrega (`synapse_<uid>_answers_v1`, `synapse_<uid>_flashcards_v1` etc. continuam intocados).

### RPCs novas/alteradas (migration `20260909120000_sync_reliability.sql`)

- `submit_question_attempt` ganhou `p_client_op_id uuid default null` + índice único `(user_id, client_op_id)`. Reenviar a mesma operação devolve o resultado da tentativa original sem inserir de novo nem duplicar `error_notebook`.
- `submit_flashcard_review(p_flashcard_id, p_rating, p_client_op_id)` é **nova**: centraliza em uma única transação o que antes eram duas escritas separadas feitas pelo cliente. O SM-2 (portado de `src/services/srsAlgorithm.ts`) roda dentro da função, com `select ... for update` na linha de `flashcard_srs_state` — isso serializa duas revisões concorrentes do mesmo card (ex.: reconciliação simultânea em duas abas) para que a segunda sempre parta do estado real deixado pela primeira, nunca de um cálculo feito no navegador com dado desatualizado. Índice único `(flashcard_id, client_op_id)` garante idempotência do histórico.

## Etapa 3 — Experiência do usuário

`src/components/common/SyncStatusIndicator.tsx`, no cabeçalho (`Header.tsx`), com 4 estados possíveis (nunca mais que isso, nunca "salvo" quando só o local recebeu o dado):

1. **Nada pendente** → indicador some (não polui a interface o tempo todo com "tudo certo").
2. **Aguardando sincronização** (`pending`, sem erro) → ícone de nuvem cortada + texto discreto.
3. **Sincronizando** (`syncing`) → ícone girando.
4. **Falha que exige ação** (`failed`) → ícone de alerta; se a causa for `auth`, o texto orienta a logar de novo; caso contrário, oferece "Tentar novamente" (`retryAllFailed`). Nunca expõe mensagem técnica, stack trace ou identificador de registro — só a categoria do problema.

Estudo offline continua funcionando exatamente como antes (grava local, UI otimista imediata) — a fila só muda o que acontece depois disso, nunca bloqueia a interação.

## Etapa 4 — Implementação progressiva

**Implementado nesta entrega**: categorias 1 (tentativas de questão/XP) e 2
(flashcards/SRS), roteadas por `AnswersRepository.ts` e
`FlashcardsRepository.ts` através de `syncQueue`/`syncHandlers`
(`src/services/syncHandlers.ts` registra os handlers reais de envio, chamado
uma vez em `App.tsx`).

**Não implementado** (mapeado, não resolvido): categorias 3-9 da tabela da
Etapa 1 continuam no padrão antigo (`catch {}` silencioso). Antes de migrá-las
para a fila:

- **Caderno de erros, notas, simulados**: só precisam do mesmo tratamento já
  aplicado (client_op_id onde for INSERT puro; já são idempotentes onde já é
  upsert por id) — trabalho mecânico, próximo item de prioridade natural.
- **Favoritos e progresso de leitura**: precisam de uma mudança de contrato
  primeiro (`toggle` → `set` explícito) antes de entrarem numa fila com
  retry automático, senão uma retentativa depois de falha pode inverter o
  estado errado. **Não implementado propositalmente** — colocar isso na fila
  sem essa correção introduziria um bug novo.
- **Reações e feedback**: precisam de auditoria própria de idempotência
  (confirmar se são upsert ou insert puro) antes de entrar na fila.

## Etapa 5 — Recuperação de dados locais antigos

`src/services/legacyRecovery.ts`, chamado a cada login
(`StorageService.setActiveUser`). Fluxo:

1. Lê o que já existe no servidor para a questão em questão (`question_id`,
   alternativa selecionada, horário, modo/estratégia — não só a presença de
   `question_id`, ver correção 07-B abaixo) e para os flashcards
   (`flashcards.id`) — a "simulação" pedida pelo prompt: só decide o que
   enfileirar depois de comparar com o servidor, nunca envia às cegas.
2. Enfileira (nunca insere diretamente) só o que é claramente local e ainda
   não existe remotamente — a fila (`syncQueue`) garante que isso não duplica
   mesmo que o item já tenha sido parcialmente recuperado antes.
3. Mantém um "ledger" local (`synapse_<uid>_sync_legacy_recovered_v1`) para
   não reexaminar o mesmo item a cada login — mas só marca um item como
   "já verificado" depois de uma consulta bem-sucedida ao servidor (ou de
   confirmar que a operação enfileirada foi de fato sincronizada); se a
   consulta falhar (rede indisponível no momento do login), tenta de novo no
   próximo login, sem crescer sem limite.
4. **Nunca apaga `localStorage`** — mesmo depois de recuperado com sucesso,
   os dados locais originais continuam onde estavam (a fila só lê, nunca
   remove a fonte).

**Limitação confirmada e documentada, não contornada**: flashcards
personalizados criados pelo `LocalStorageFlashcardsRepository` **antes** desta
entrega usam um id não-uuid (`fc-from-q-<timestamp>-<random>`), incompatível
com a coluna `uuid` de `flashcards.id`. A recuperação automática só cobre
cards com id em formato uuid (os criados pelo `SupabaseFlashcardsRepository`,
que já usa `crypto.randomUUID()`). Cards antigos com id não-uuid **não são
apagados** (continuam no `localStorage`, visíveis localmente), mas não têm
caminho automático de recuperação nesta entrega — recriar sob um novo id
duplicaria o card visualmente; a correção adequada exigiria uma decisão de
produto (gerar novo id preservando o conteúdo, ou aceitar a perda de
sincronização desses cards específicos) fora do escopo desta etapa.

**Associação de dados anônimos a uma conta**: não implementada e não deveria
ser automática — o app já tem um usuário "demo" local (`local-demo-user`) e
qualquer heurística de "isso era do usuário anônimo, deve ser deste login"
seria uma suposição de produto, não uma correção técnica. Fora de escopo por
decisão consciente, não por esquecimento.

## Correções do Prompt 07-B

A revisão da diretoria sobre o código do 07-A (sem ainda ter testado em
navegador real) encontrou quatro bloqueios. Todos foram reproduzidos com
Playwright/Chromium contra o Supabase LOCAL antes de corrigir, e novamente
depois da correção, para confirmar o antes/depois — ver Etapa 6 atualizada.

### Bloqueio 1 — `enqueueAndTry` podia retornar cedo

**Causa confirmada**: `enqueue()` chama `void flush(userId)` (dispara e não
espera); `enqueueAndTry()` chamava `await flush(userId)` logo em seguida. A
versão original de `flush` tinha uma guarda simples (`if
(flushingUsers.has(userId)) return;`) — se o primeiro flush (disparado por
`enqueue`) já tivesse marcado o usuário como "flushing", o segundo `flush`
(chamado por `enqueueAndTry`) retornava IMEDIATAMENTE sem esperar nada, e
`enqueueAndTry` podia ler a operação ainda `pending`/`syncing` e devolver
`null` antes da conclusão real.

**Correção**: `flush(userId)` agora deduplica por usuário devolvendo a MESMA
`Promise` para todo chamador concorrente (um `Map<userId, Promise<void>>`
preenchido de forma síncrona antes de qualquer `await`, para que duas
chamadas no mesmo tick observem a mesma entrada). `enqueueAndTry` passou a
fazer um laço que chama `flush` e relê o estado da SUA operação especificamente
(por `client_op_id`) até ela chegar a um estado terminal (`synced`/`failed`)
ou até um timeout de 20s — nunca conclui só porque "um flush terminou", só
quando a própria operação terminou. Comportamento definido para os quatro
casos pedidos: sucesso → devolve o resultado real do servidor; falha
permanente (validação/permissão/schema) → devolve `null` sem insistir; falha
retentável sem rede/sessão → sai cedo do laço (offline) e devolve `null`;
timeout → devolve `null`. Em todos os casos de `null`, o chamador (
`AnswersRepository`/`FlashcardsRepository`) já usa o resultado local otimista
— nada trava a UI.

Também corrigido, no mesmo arquivo: uma operação encontrada em estado
`syncing` no INÍCIO de um flush (resíduo de reload/fechamento de aba durante
um envio anterior, já que esse estado só deveria existir durante o próprio
`await handler(...)`) é reclassificada para `pending` antes de processar —
nunca fica presa indefinidamente (cenário de teste "reload em syncing").
Reenviar é seguro porque as RPCs são idempotentes por `client_op_id`.

### Bloqueio 2 — fila de um usuário podia ser processada sob outra sessão

**Causa confirmada**: a fila já era isolada por `localStorage` (uma chave por
UID), mas isso não bastava — o cliente Supabase (`supabase-js`) é um único
objeto global com UMA sessão ativa por vez. `flushAllKnown()` (chamada pelos
eventos `online`, `visibilitychange` e por um heartbeat a cada 60s) varria
`knownUserIds` (todos os UIDs já vistos no navegador) chamando `flush` para
CADA um, sem checar se o usuário da fila era o mesmo autenticado no Supabase
no momento. Se A respondesse uma questão offline e depois B fizesse login no
mesmo navegador, um desses eventos periódicos podia enviar a operação de A
autenticada como B (RLS grava sob `auth.uid()`, que seria o de B).

**Correção**: `runFlush(userId)` agora chama `getActiveSupabaseUserId()`
(`supabase.auth.getSession()`) antes de CADA operação da fila — se o usuário
autenticado agora não for `userId`, para de processar aquela fila
imediatamente, sem tocar/apagar/reatribuir nenhuma operação (ela continua lá,
pendente, para quando o dono voltar a ser o usuário ativo). `flushAllKnown()`
foi reescrita para consultar a sessão ativa UMA vez e só disparar `flush`
para esse usuário (e só se ele tiver fila conhecida) — nunca mais varre todos
os UIDs conhecidos. Comportamento confirmado por teste real (Cenário 4 da
Etapa 6): B logando e disparando `online`/`visibilitychange` NÃO envia a
operação pendente de A; a fila de A permanece intacta; ao A logar de novo,
sua fila volta a ser processada.

**Limitação documentada, não contornada**: uma operação já em voo (dentro do
`await handler(...)`) no momento em que o usuário faz logout NÃO é cancelada
— o token de autenticação já foi anexado à requisição HTTP no momento do
envio pelo `supabase-js`, então essa requisição específica completa como
quem estava autenticado quando foi enviada. O que a correção garante é que
NENHUMA operação SEGUINTE da fila seja enviada depois que a sessão mudar. Em
outras palavras: o corte de isolamento é "por operação enviada", não
"instantâneo no meio de uma operação já em trânsito" — condizente com como
HTTP/JWT funcionam, não uma limitação evitável no cliente.

### Bloqueio 3 — recuperação legada considerava qualquer `question_attempts` remoto como prova de sincronização

**Causa confirmada**: `legacyRecovery.ts` fazia `select question_id from
question_attempts` e tratava a MERA PRESENÇA de qualquer linha remota para
aquele `question_id` como "já sincronizado", marcando o ledger e nunca
enfileirando. Como o sistema permite múltiplas tentativas legítimas por
questão (histórico real, não sobrescrita), uma tentativa remota antiga não
prova que a resposta local mais recente (que pode ter alternativa,
horário, modo ou estratégia diferentes) já foi enviada — o código descartava
silenciosamente uma tentativa local potencialmente distinta.

**Correção**: a reconciliação agora busca as tentativas remotas da questão
(`question_id, answered_at, answer_mode, answer_strategy,
question_options(letter)`) e compara com a resposta local por
alternativa selecionada + horário (tolerância de 5 minutos, cobrindo latência
de rede/retry) + modo/estratégia quando disponíveis nos dois lados
(`isSameAttempt`). Três desfechos possíveis, nunca uma decisão às cegas:

1. **Nenhuma tentativa remota** → claramente não sincronizada → enfileira.
2. **Uma tentativa remota bate com a local** → já sincronizada → marca
   recuperada, não duplica.
3. **Tentativas remotas existem mas nenhuma bate** → **AMBÍGUO** — pode ser
   uma tentativa local distinta e legítima, ou uma comparação inconclusiva.
   A correção NÃO decide por engano: preserva a resposta local, registra a
   pendência (`console.warn` com os dados da comparação — sem UI dedicada
   nesta entrega, ver limitação abaixo) e **não marca o ledger como
   concluído** — reexaminada no próximo login.

**Operação estável antes do envio**: quando o caso 1 decide enfileirar, o
`client_op_id` retornado por `enqueue()` é salvo IMEDIATAMENTE no ledger
(`ledger.pendingAnswerOps[questionId]`), antes de examinar a próxima questão
pendente — não só ao final do laço. Um login seguinte que encontre essa
entrada NUNCA gera outro `client_op_id`: só consulta o estado real da
operação na fila (`getOps`) — se `synced`, confirma no ledger; se
`pending`/`syncing`/`failed`, não mexe (a fila já cuida do resto). Isso
elimina o risco de, numa interrupção entre "decidiu enfileirar" e "servidor
confirmou", uma sessão seguinte reavaliar do zero e gerar uma SEGUNDA
operação (duplicando a tentativa no servidor).

**Limitação documentada, não contornada**: o caso "ambíguo" só é reportado
via `console.warn` nesta entrega — não há um painel de UI para o estudante
revisar pendências ambíguas de recuperação legada. Isso é aceitável porque
esse caso só pode ocorrer para dados gravados ANTES desta funcionalidade
existir (usuários que já usavam o app antes do Prompt 07-A), é raro na
prática (exige múltiplas tentativas para a mesma questão com timestamps
locais imprecisos) e o comportamento seguro (preservar local, não duplicar,
não descartar) já está garantido — só a experiência de "avisar o usuário" é
que fica pendente para uma iteração de produto futura.

### Bloqueio 4 — fallback de UUID inválido

**Causa confirmada**: `uuid()` usava `crypto.randomUUID()` quando disponível,
mas o fallback gerava `op-<timestamp>-<random>` — uma string que não é um
UUID. As RPCs (`submit_question_attempt`, `submit_flashcard_review`) recebem
`p_client_op_id` como `uuid`; esse formato seria rejeitado pelo driver antes
mesmo de chegar à validação do servidor (a operação falharia sempre, todo o
tempo, nesse ambiente).

**Correção**: fallback via `crypto.getRandomValues` gerando um UUID v4 válido
(RFC 4122 — bits de versão/variante ajustados manualmente a partir de 16
bytes aleatórios). Se NENHUMA fonte criptográfica estiver disponível (nem
`randomUUID` nem `getRandomValues` — ambiente extremamente incomum), `uuid()`
lança, e `enqueue()` captura isso: a operação NÃO é persistida na fila (nunca
chega a existir um `client_op_id` inválido), o erro é logado de forma
compreensível (`console.error`), e o dado local (já gravado pelo repositório
ANTES de chamar `enqueue`) permanece intacto. `enqueueAndTry` detecta esse
caso (`op.id` vazio) e devolve `null` imediatamente, sem tentar esperar por
uma operação que nunca vai existir.

## Correções do Prompt 07-C

A revisão da diretoria sobre o código do 07-B encontrou quatro pendências,
todas dentro das categorias já implementadas (1 e 2) — nenhuma migration
nova foi necessária. Todos os quatro pontos, e um bug real encontrado durante
o teste de navegador da correção do quarto, foram reproduzidos e corrigidos
com Playwright/Chromium contra o Supabase LOCAL — ver Etapa 6 atualizada.

### Problema 1 — `pendingAnswerOps` apontando para uma operação que já saiu da fila

**Causa confirmada**: o ledger de recuperação legada (`src/services/
legacyRecovery.ts`) guarda `question_id -> client_op_id` em
`pendingAnswerOps` enquanto espera a operação chegar a `synced` na fila. Mas
a fila poda operações sincronizadas antigas (`pruneSynced`, `syncQueue.ts`,
mantém só as últimas 30) para não crescer sem limite — se isso acontecer
ANTES de um login confirmar o `synced` no ledger (ex.: muitas revisões de
flashcard entre um login e outro), a entrada em `pendingAnswerOps` passa a
apontar para um id que não existe mais na fila local. O código do 07-B
apenas `continue`ava nesse caso — o registro ficava preso indefinidamente,
nunca confirmado, nunca recriado.

**Correção**: `question_attempts.client_op_id` é uma coluna real
(migration `sync_reliability`, já existente desde o 07-A) — continua sendo
uma fonte de verdade consultável mesmo depois de a operação sair da fila
local. Quando `pendingAnswerOps[questionId]` aponta para um id ausente da
fila, `recoverLegacyLocalProgress` agora:

1. Consulta `question_attempts` pelo mesmo `client_op_id` (com RLS, só pode
   achar uma linha do próprio usuário).
2. Se existir → confirma recuperado no ledger, remove `pendingAnswerOps`.
3. Se não existir (nem na fila, nem no servidor) → **recria a operação com
   o MESMO `client_op_id`** (nunca um novo) e o payload local preservado. A
   idempotência do RPC por `(user_id, client_op_id)` garante que isso não
   duplica se, por algum motivo, a operação já tivesse sido aplicada.
4. Se a consulta falhar (rede indisponível neste login) → preserva o dado e
   a pendência exatamente como estão, sem gerar id novo; tenta de novo no
   próximo login.

Testado com Playwright: caso 2 (sincronizada e podada) e caso 3 (ausente dos
dois lados) — ver Etapa 6, cenário A.

### Problema 2 — ambiguidade de recuperação legada visível só no console

**Causa confirmada**: quando a comparação entre a resposta local e o
histórico remoto de uma questão não podia ser feita com segurança, o 07-B
registrava a pendência só em `console.warn` — o estudante nunca sabia que
havia uma decisão dele pendente, nem tinha como decidir.

**Correção**: o caso ambíguo agora fica registrado em `ledger.ambiguous`
(persistente em `localStorage`, sobrevive a reload) até o usuário decidir.
`SyncStatusIndicator.tsx` mostra "Há progresso antigo para revisar" (ícone
`History`) sempre que houver pelo menos uma pendência, mesmo com a fila de
sincronização totalmente vazia — e abre `LegacyRecoveryDialog.tsx`
(`src/components/common/LegacyRecoveryDialog.tsx`), um diálogo acessível
(foco preso, Escape, `inert` no `#root`, via `createPortal`, mesmo padrão do
`ContextualFeedbackPopover`) que mostra, por pendência: o enunciado da
questão (nunca o id), a alternativa respondida localmente e a data
aproximada. Três decisões, nenhuma apaga o registro local original:

- **"Enviar como nova tentativa"** (`resolveAmbiguousSubmitAsNew`): usa um
  `client_op_id` **estável**, gerado no momento em que a ambiguidade foi
  detectada e guardado no próprio ledger — reabrir o diálogo ou recarregar
  a página antes de decidir nunca gera outro id, então mesmo que o usuário
  clique duas vezes ou recarregue no meio do envio, não duplica. O aviso no
  diálogo deixa explícito que isso entra no histórico e pode afetar XP e o
  caderno de erros.
- **"Manter somente neste dispositivo"** (`resolveAmbiguousKeepLocalOnly`):
  nunca envia, nunca apaga o `localStorage` — só marca aquela resposta local
  exata (questionId + timestamp) para não ser sinalizada de novo. Se o
  estudante responder a mesma questão de novo depois (timestamp novo), a
  comparação roda do zero.
- **"Decidir depois"**: não é uma função própria — fechar o diálogo sem
  escolher simplesmente deixa a pendência em `ledger.ambiguous`; ela volta a
  aparecer no indicador de sincronização na próxima vez, sem duplicar.

Testado com Playwright: detecção, exibição sem IDs técnicos, persistência
após reload, as duas decisões ativas e o efeito de cada uma no servidor e no
ledger — ver Etapa 6, cenários C e C2.

### Problema 3 — janela de 5 minutos tratada como prova de tentativas distintas

**Causa confirmada**: `isSameAttempt` (07-B) rejeitava um match sempre que a
diferença entre o horário local e `answered_at` remoto passasse de 5
minutos, **mesmo quando alternativa, modo e estratégia de resposta
coincidiam exatamente**. Como `answered_at` é o instante em que o SERVIDOR
recebeu a operação (não quando o estudante respondeu), uma resposta que
ficou horas ou dias offline antes de sincronizar era erroneamente tratada
como uma tentativa distinta — arriscando reenvio duplicado de uma tentativa
que já tinha chegado ao servidor.

**Correção**: `compareAttempt` (substitui `isSameAttempt`) devolve três
resultados — `match` | `no` | `uncertain` — em vez de um booleano:

- Alternativa diferente → `no` (nunca é a mesma tentativa, isso não muda).
- Alternativa igual **e** modo/estratégia disponíveis e iguais nos dois
  lados → `match`, **qualquer que seja a diferença de horário** — o
  conteúdo da tentativa já é suficiente prova, o horário é só um dado
  auxiliar que dispensamos aqui.
- Alternativa igual mas modo/estratégia ausentes ou incompletos num dos
  lados (dado histórico anterior à captura desses campos) → usa o horário
  como evidência AUXILIAR: dentro da janela de 5 min, `match`; fora dela,
  `uncertain` (nunca `no` — nunca tratamos isso como prova de distinção,
  só como "não temos certeza suficiente").

Uma questão é tratada como já sincronizada se qualquer tentativa remota
for `match`; como claramente nova (enfileira) se todas forem `no`; como
ambígua (Problema 2) se houver ao menos um `uncertain` e nenhum `match`.

**Limite desta comparação, documentado explicitamente**: sem
alternativa+modo+estratégia coincidindo nos dois lados, não existe forma
determinística de provar que duas tentativas com a mesma alternativa, em
horários muito distantes, são a mesma ou não — a única fonte de verdade
adicional possível seria o próprio usuário. É exatamente para esse caso que
existe a experiência de ambiguidade do Problema 2; não foi criada nenhuma
heurística "mais inteligente" para adivinhar no lugar do usuário.

Testado com Playwright: alternativa+modo+estratégia idênticos com 6h de
diferença de horário → reconhecido como a MESMA tentativa, sem duplicar —
ver Etapa 6, cenário B.

### Problema 4 — falha de geração de UUID não persistia nem aparecia na interface

**Causa confirmada**: quando nenhuma fonte criptográfica estava disponível
(nem `randomUUID` nem `getRandomValues`), `enqueue()` (07-B) devolvia um
`SyncOp` com `state: 'failed'` **sem nunca gravá-lo na fila** — a operação
não existia em lugar nenhum além do valor de retorno descartado pelo
chamador, o erro só aparecia em `console.error`, e não havia qualquer
tentativa automática de recuperação (nem ao ambiente voltar a oferecer
`crypto`, nem após reload).

**Correção**: `SyncOp` ganhou um campo `clientOpId?: string` distinto de
`id` — `id` é agora sempre uma chave local (gerada mesmo sem `crypto`, nunca
enviada ao servidor), e `clientOpId` é a chave real enviada ao servidor,
podendo ficar ausente. Quando `uuid()` falha no momento do `enqueue()`, a
operação é persistida mesmo assim (`id` local, `clientOpId` ausente, `state:
'pending'`, `lastError.kind: 'crypto_unavailable'`) — nunca desaparece, nunca
gera um id incompatível com a coluna `uuid` do Postgres. `runFlush` tenta
gerar o `clientOpId` de novo a cada flush (evento `online`, troca de aba,
heartbeat de 60s, ou o próximo carregamento da página) ANTES de despachar o
handler; se conseguir, despacha normalmente; se não, aplica a mesma política
de backoff exponencial das falhas retentáveis (`isRetryable` passou a
incluir `crypto_unavailable`) — visível na UI como as demais falhas
retentáveis (`SyncStatusIndicator`), nunca só no console.

**Bug real encontrado só no teste de navegador desta própria correção** (não
por leitura de código): a primeira versão do fix gerava o `clientOpId` e
gravava `ops[i] = { ...op, clientOpId, ... }`, mas o passo seguinte
(marcar `state: 'syncing'`) fazia `ops[i] = { ...op, state: 'syncing', ... }`
usando a variável `op` **capturada no topo do laço, antes do clientOpId ser
atribuído** — sobrescrevendo `clientOpId` de volta para `undefined` bem a
tempo de despachar o handler sem ele. O teste de navegador via a operação
ficar presa em `pending`/`clientOpId: undefined` para sempre, mesmo com
`crypto` restaurado; a inspeção do código sozinha não bastava porque o bug
só se manifestava na sequência real de mutações do array dentro do mesmo
laço. Corrigido reatribuindo a variável local `op` (não só `ops[i]`) a cada
mutação, para que os `spread`s seguintes sempre partam da versão mais
recente.

Testado com Playwright: `crypto` bloqueado no momento do enqueue → operação
persistida, sem `clientOpId`, falha visível; nenhuma tentativa chega ao
servidor enquanto isso; `crypto` restaurado sem reload → a mesma operação é
retentada automaticamente (via evento `online`, sem reimportar nada), ganha
um `clientOpId` real e sincroniza; exatamente 1 tentativa chega ao servidor
— ver Etapa 6, cenário UUID.

## Validação de isolamento entre contas (07-C)

Decisão de produto confirmada: manter uma conta pessoal de estudante e uma
conta editorial/administrativa distintas. Esta entrega não implementa o
sistema completo de papéis editoriais (fora de escopo) — só validou que a
fila de sincronização, tentativas, flashcards, XP e estado local de uma
conta nunca atravessam para a outra, reutilizando o mecanismo de isolamento
já corrigido no Bloqueio 2 do 07-B (`getActiveSupabaseUserId` +
`flushAllKnown` nunca varrendo todos os UIDs conhecidos). Testado com dois
usuários reais (`sync07c.student@test.local` role `student`,
`sync07c.editorial@test.local` role `admin`), ambos descartáveis e removidos
ao final:

1. **Mesma janela, troca real de sessão** (A fica com operação pendente,
   faz logout, B loga em seguida): a operação de A não é enviada nem sob A
   nem sob B; a fila de A permanece intacta enquanto B está ativo.
2. **A → B → A**: a operação que ficou pendente durante a passagem por B é
   sincronizada sob o dono correto quando A loga de novo.
3. **Duas `BrowserContext` simultâneas** (dois dispositivos reais, A e B
   autenticados ao mesmo tempo, cada um respondendo à mesma questão): cada
   tentativa é aplicada sob a própria conta; nenhuma atravessa para a conta
   errada sob concorrência real.

Nenhum vazamento de dado entre contas foi observado nos três cenários — ver
Etapa 6, script de isolamento.

## Etapa 6 — Testes

### O que foi executado e passou

- `npx tsc --noEmit` — sem erros.
- `npm run build` — build de produção concluído (mesmo aviso pré-existente
  de chunk >500kB, não relacionado a esta entrega).
- `supabase test db` (pgTAP) contra Supabase LOCAL, com `supabase db reset`
  antes: **106/106 asserções passando** (83 já existentes +
  `supabase/tests/database/sync_reliability.test.sql`, 23 novas), em duas
  execuções (confirmando que os asserts não dependem de estado deixado por
  execução anterior — cada teste cria sua própria fixture com sufixo
  aleatório). As 23 novas cobrem, direto na RPC (não só na leitura da fila do
  cliente):
  1. `submit_question_attempt` com `client_op_id` novo é aceito e grava 1 linha.
  2. Reenvio do mesmo `client_op_id` não duplica a tentativa nem `error_notebook`.
  3. Reenvio devolve o resultado da tentativa **original**, não recalcula a partir de argumentos novos passados por engano.
  4. Uma tentativa real nova (`client_op_id` diferente) É aceita — idempotência não trava respostas repetidas legítimas.
  5. Isolamento entre usuários: o mesmo `client_op_id` reusado por outro usuário não colide (chave é `(user_id, client_op_id)`, não global) nem funde as duas tentativas numa só.
  6. `submit_flashcard_review`: primeira revisão aplica o SM-2 e grava 1 linha de histórico.
  7. Reenvio do mesmo `client_op_id` de revisão (mesmo com rating diferente por engano) não reaplica o SM-2 nem duplica o histórico.
  8. Segunda revisão real avança `repetition_count`/histórico corretamente (ordem preservada).
  9. Rating fora de 1-4 é rejeitado.
  10. Usuário B não consegue revisar flashcard do usuário A (ownership).

### Prompt 07-B — testes reais de navegador (Playwright/Chromium contra Supabase LOCAL)

Ambiente: Playwright instalado fora do repositório (área temporária, sem
alterar `package.json`), Chromium, app servido por `vite` dev
(`.env.development.local`, git-ignorado, aponta para `http://127.0.0.1:54321`
— NUNCA o `.env.local` do projeto, que aponta para o Supabase remoto por
padrão, ver AGENTS.md armadilha #4). Dois usuários de teste reais
(`sync07b.a@test.local`/`sync07b.b@test.local`, senha própria, `status=active`
promovido via `psql -U postgres` direto, nunca via client — ver armadilha #9)
e dois `BrowserContext` independentes por cenário. **15/15 asserções
passaram**, cobrindo:

1. **Resposta online**: `enqueueAndTry` aguarda a RPC de verdade
   (interceptação de rede confirma `submit_question_attempt` respondendo
   2xx antes da UI avançar); exatamente 1 `question_attempts` nova no banco;
   UI mostra a explicação por alternativa (só existe no payload real da RPC,
   não no otimista local).
2. **Resposta offline**: chamadas ao Supabase local bloqueadas via
   interceptação de rede (não `context.setOffline(true)` puro, que também
   impede o próprio reload da página via `chrome-error://` — não é o que se
   quer exercitar); resposta fica pendente sem travar a UI; reload ainda
   "offline" preserva a pendência (não some, não fica presa); ao restaurar a
   rede e disparar `online`, a fila retoma sozinha e converge para
   `synced`; exatamente 1 tentativa nova no banco (sem duplicar).
4. **Troca de usuário**: A enfileira uma operação e permanece pendente; B
   loga no mesmo navegador; disparar `online`/`visibilitychange` NÃO envia a
   operação de A sob a sessão de B (confirmado consultando o banco: zero
   linhas daquela operação sob o UID de B); a fila de A permanece
   preservada; ao A logar de novo, sua operação volta a ser processada
   (`attempts` avança) em vez de ficar intocada para sempre.
6. **`enqueueAndTry` concorrente**: duas chamadas simultâneas (mesma
   sessão) terminam em estado terminal (`synced`/`failed`) cada uma — nenhuma
   fica presa em `pending`/`syncing` por causa de um flush concorrente que
   nunca a tocou, confirmando que o bloqueio 1 não reaparece sob concorrência
   real do navegador.
9. **UUID**: com `crypto.randomUUID` disponível, `client_op_id` é um UUID
   válido; com `randomUUID` removido em runtime (mas `getRandomValues`
   presente), o fallback ainda gera um UUID v4 válido; com as duas fontes
   removidas, a operação não é persistida na fila (`op.id === ''`,
   `state === 'failed'`) — nunca um id incompatível chega perto de uma RPC.

**Cenários pedidos e NÃO cobertos por automação de navegador no 07-B**
(atualizado pelo 07-C abaixo — vários destes passaram a ser cobertos): 3
(reenvio pós-aplicação-no-servidor-mas-antes-da-resposta-chegar-ao-cliente),
5 (duas abas/dispositivos revisando o mesmo flashcard simultaneamente), 7
como reload explícito com uma operação real presa em `syncing`, 8 (erros de
sessão expirada, RLS/permissão, schema ausente e número máximo de
tentativas), e 10 (os sete sub-casos pedidos de recuperação legada).

### Prompt 07-C — testes reais de navegador (Playwright/Chromium contra Supabase LOCAL)

Mesmo ambiente do 07-B (Playwright fora do repositório, `vite` dev com
`.env.development.local` apontando para o Supabase local, nunca o `.env.local`
real). Dois usuários de teste novos e descartáveis
(`sync07c.student@test.local` role `student`, `sync07c.editorial@test.local`
role `admin`), removidos ao final (auth + profiles confirmados ausentes
depois). **31/31 asserções passaram** em quatro scripts:

**Script principal (recuperação legada) — 18/18**:
- **Cenário A (Problema 1)**: (A1) ledger apontando para `client_op_id` já
  sincronizado mas removido da fila local → confirmado recuperado, sem
  duplicar (`question_attempts` permanece com 1 linha). (A2) ledger
  apontando para `client_op_id` ausente da fila E do servidor → recriado com
  o MESMO `client_op_id`.
- **Cenário B (Problema 3)**: resposta local com mesma alternativa/modo/
  estratégia que uma tentativa remota, mas sincronizada 6h depois →
  reconhecida como a MESMA tentativa (não gera ambiguidade, não duplica) —
  prova direta de que a janela de 5 min deixou de ser um critério decisivo
  isolado.
- **Cenário C (Problema 2)**: tentativa remota existente mas inconclusiva →
  registrada em `ledger.ambiguous`, nunca marcada como recuperada sem
  certeza; indicador de sincronização mostra "Há progresso antigo para
  revisar" mesmo sem nada pendente na fila; diálogo mostra a alternativa e a
  data sem nunca expor o `questionId`; pendência sobrevive a um reload;
  "Enviar como nova tentativa" cria uma segunda linha real no histórico e
  sai da lista de ambíguos; reload subsequente não duplica de novo
  (idempotência do `client_op_id` estável).
- **Cenário C2 (Problema 2)**: "Manter somente neste dispositivo" nunca
  apaga o registro local original, nunca cria uma linha nova no servidor, e
  a MESMA resposta não volta a ser sinalizada em reloads seguintes.

**Script UUID (Problema 4) — 4/4**: com `randomUUID`/`getRandomValues`
indisponíveis desde o carregamento da página, a operação é persistida (id
local, sem `clientOpId`, falha `crypto_unavailable` visível) e nenhuma
tentativa chega ao servidor; ao ambiente voltar a oferecer `crypto` (sem
reload — só o evento `online` real, sem reimportar módulo algum), a mesma
operação ganha um `client_op_id` real e sincroniza; exatamente 1 tentativa
chega ao servidor. Foi durante a primeira execução deste script que o bug de
clobbering do `clientOpId` (ver Problema 4 acima) foi detectado — o teste
falhava consistentemente até a correção do laço em `runFlush`.

**Script de isolamento entre contas — 6/6** (ver "Validação de isolamento
entre contas (07-C)" acima): troca real de sessão na mesma janela (A
pendente → logout → B loga) sem vazamento nos dois sentidos; A → B → A
retoma a fila de A; duas `BrowserContext` simultâneas sem cruzamento sob
concorrência real.

**Script de SRS concorrente (item 5 da lista de pendências do 07-B, agora
coberto) — 3/3**: duas `BrowserContext` autenticadas na MESMA conta
disparando revisões quase simultâneas do mesmo flashcard (via evento
`online` disparado em paralelo nas duas) resultam em exatamente 2 linhas
reais em `flashcard_reviews` (nenhuma perdida, nenhuma fantasma);
`repetition_count`/`interval_days`/`ease_factor` finais são consistentes com
as duas revisões aplicadas em sequência serializada pelo `select ... for
update` do servidor (nunca "1" por sobrescrita de estado desatualizado);
reenviar os mesmos `client_op_id` depois de já sincronizados não duplica.

**Cenários da lista original do 07-B ainda NÃO cobertos por automação de
navegador nesta entrega** (limitação confirmada, não contornada — os itens
3 e 8 seguem cobertos apenas indiretamente por pgTAP/lógica, não por
reprodução determinística via navegador): item 3 (reenvio simulando o
servidor aplicar a operação mas a resposta não chegar ao cliente — a
idempotência que isso depende está provada por pgTAP e pelos testes de
reenvio de `client_op_id` acima, mas não há uma simulação de navegador que
corte a resposta HTTP depois do servidor já ter comitado); item 7 como
reload explícito com uma operação real presa em `syncing` no exato momento
do reload (a limpeza de `syncing` órfão no início de `runFlush` continua
implementada e coberta indiretamente pelos cenários de reconciliação, sem
uma prova isolada "estava em syncing, reload, virou pending, sincronizou
uma vez"); item 8 (classes de erro de sessão expirada, RLS/permissão,
schema ausente e número máximo de tentativas individualmente — cobertas por
`classifySyncError` e pelos testes pgTAP de ownership/validação, não
reproduzidas uma a uma via navegador real nesta entrega).
**Não declarar esses três sub-cenários como testados em navegador** — ficaram
assim até o 07-C. **Atualização 07-C2: os três (itens 3, 7 e 8) foram
reproduzidos e confirmados com Playwright/Chromium real nesta entrega** — ver
seção "Correções/Validações do Prompt 07-C2" abaixo.

## Correções/Validações do Prompt 07-C2

Objetivo desta entrega: provar deterministicamente, com Playwright/Chromium
real contra o Supabase LOCAL, os três sub-cenários que ficaram sem prova de
navegador no 07-B/07-C — (1) reenvio pós-servidor-pré-cliente, (2) reload com
operação real presa em `syncing`, (3) classes de erro individuais — mais a
regressão completa. **Diferente do 07-B e do 07-C, nenhum defeito real foi
encontrado nesta rodada**: as 90 asserções de navegador (52 dos três cenários
+ 38 de regressão) passaram na primeira execução completa, sem precisar de
nenhuma correção de código além da instrumentação de teste em si.

### Ambiente e instrumentação

Uma execução anterior deste mesmo prompt (07-C2) havia morrido por rate limit
de API sem deixar nenhum commit, mas tinha deixado duas mudanças não
commitadas na working tree e um projeto Playwright completo fora do
repositório (`%TEMP%\nexusmed-pw-07c2`, com `create-users.js`,
`scenarios-1-2-3.js` e `regression.js` já escritos). Esta sessão revisou essa
sobra linha a linha antes de reaproveitar — não assumiu que estava correta:

- `src/App.tsx`: ponte `window.__syncDebug = { ...syncQueue, supabase }`,
  condicional a `import.meta.env.DEV`, expondo o módulo `syncQueue` inteiro
  (inclusive `enqueue`, `enqueueAndTry`, `flush`, `retryAllFailed`,
  `registerHandler`, `__setTestBackoffOverride`) e o cliente Supabase para os
  scripts de teste.
- `src/services/syncQueue.ts`: `__setTestBackoffOverride(baseMs,
  maxAttempts)`, também condicional a `import.meta.env.DEV`, permitindo
  configurar um backoff/limite de tentativas menor só para o cenário 3.6 (sem
  isso, provar "máximo de tentativas esgotado" exigiria ~30min reais de
  backoff exponencial).

Avaliação: a instrumentação é sã — não altera nenhum caminho de produção (só
lê/expõe), é sempre condicional a `import.meta.env.DEV`, e foi desenhada
exatamente para os três cenários pedidos neste prompt. Mantida como estava.
Confirmado com `npm run build` + `grep` no bundle publicado
(`dist/assets/*.js`) que nem a string `__syncDebug` nem
`__setTestBackoffOverride` aparecem no bundle de produção — o
`import.meta.env.DEV === false` do build elimina o bloco inteiro por
tree-shaking do Vite/Rollup.

Os fixtures de teste hardcoded nos scripts (`sync07c2.a@test.local`,
`sync07c2.b@test.local`, uma questão dedicada "Enunciado Sync"/"Disciplina
Sync Teste", dois flashcards `11111111-...-101`/`-102`) também já existiam no
Supabase local, criados pela sessão anterior antes de morrer — verificados um
a um (status `active`/`published`, IDs batendo com o que os scripts esperam)
antes de reutilizá-los, em vez de recriar do zero.

### Cenário 1 — resposta perdida após commit no servidor

**Técnica**: `page.route()` intercepta `**/rest/v1/rpc/submit_question_attempt`;
dentro do handler, `route.fetch()` executa a requisição REAL contra o
Supabase local (aplica de verdade no Postgres) e só depois `route.abort('failed')`
— simula "servidor aplicou, cliente nunca recebeu a resposta HTTP". Em
seguida, a mesma operação (mesmo `client_op_id`) é reenviada pela fila real
(sem interceptação).

**Evidência antes/depois** (9/9 asserções): antes do corte, 0 linhas em
`question_attempts` para aquele `client_op_id`; a chamada via `route.fetch()`
de fato chegou ao servidor (corpo de resposta capturado antes do abort);
após o abort, exatamente **1** linha já aplicada no servidor mas a fila local
ainda não sabe disso (`state` ≠ `synced`); `enqueueAndTry` devolve `null` ao
chamador (não trava a UI). Depois do reenvio automático (backoff real, sem
interceptação), a fila converge para `synced` e o servidor continua com
exatamente **1** linha (idempotência por `client_op_id` reconhecendo o
resultado já aplicado, não duplicando). Reload da página confirmado sem criar
nenhuma tentativa adicional.

### Cenário 2 — reload/reabertura de contexto com operação presa em `syncing`

Três variações, todas com `page.route()` que nunca resolve (trava a promise
indefinidamente) para colocar uma operação REAL em `syncing` no momento exato
do reload/fechamento — não uma simulação de estado, a operação passou de
fato pelo caminho real que marca `state: 'syncing'` em `runFlush`.

- **2a — nunca chegou a aplicar no servidor**: rota travada nunca chega a
  `route.continue()`; confirmado 0 linhas no servidor antes do reload. Após
  o reload, a operação órfã em `syncing` volta a `pending` no início do
  próximo flush (código existente desde o 07-B) e é retomada: converge para
  `synced` com exatamente 1 linha aplicada.
- **2b — já tinha sido aplicada no servidor antes do reload**: mesma técnica
  do Cenário 1 (`route.fetch()` real seguido de travamento em vez de
  abort/fulfill) — confirmado que o servidor já tinha 1 linha ANTES do
  reload. Depois do reload, reenvio pelo mesmo `client_op_id` reconhece o
  resultado idempotente já existente — continua em exatamente 1 linha, sem
  duplicar.
- **2c — fechar/reabrir `BrowserContext` (não só reload)**: operação real
  presa em `syncing`, `ctx.storageState()` capturado, `ctx.close()` de
  verdade (não só navegação), novo `browser.newContext({ storageState })` —
  tecnicamente equivalente e testado à parte do reload simples. A operação é
  retomada e sincroniza com exatamente 1 linha; `SyncStatusIndicator` para de
  mostrar pendência (nenhum elemento com `aria-label` de "Sincronizando"/
  "Aguardando sincronização" após convergir).

14/14 asserções passando nas três variações.

### Cenário 3 — classes de erro individuais (6 sub-casos, 29/29 asserções)

Cada um testado isoladamente, verificando classificação (`window.__syncDebug`
lendo o estado real da operação no `localStorage`), mensagem visível ao
usuário (texto renderizado, nunca stack/id técnico), política de retry,
preservação da operação e recuperação após a causa ser removida:

1. **Sessão expirada/ausente**: `access_token` persistido corrompido
   diretamente no `localStorage` (preservando a sessão "presente" para o
   handler ser de fato despachado e falhar por 401, não pular por falta de
   sessão) → classificado `auth`, `state: failed` (não insiste sozinho), 0
   linhas no servidor, texto visível orienta relogar. Relogar de verdade +
   "Tentar novamente" manual recupera a MESMA operação → 1 linha final.
2. **Violação de RLS/permissão**: usuário A tenta gravar o SRS de um
   flashcard que pertence a B → RLS de `flashcard_srs_state` rejeita de
   verdade no servidor → classificado `permission`, falha permanente sem
   retry automático, nenhuma escrita indevida confirmada por query direta.
3. **RPC indisponível/schema incompatível**: handler de teste chama uma RPC
   inexistente (`rpc_inexistente_07c2_xyz`) → PostgREST devolve "function ...
   does not exist" → classificado `schema`, falha permanente.
4. **Validação (rating fora de 1-4)**: `submit_flashcard_review` com
   `rating: 9` → rejeitado pelo servidor ("rating inválido: deve ser 1, 2, 3
   ou 4") → classificado `validation`, falha permanente, nenhuma revisão
   gravada.
5. **Erro transitório de rede**: `route.abort('internetdisconnected')` antes
   de chegar ao servidor → classificado `network`, `state: pending` com
   backoff (retentável automaticamente, não `failed`); ao remover a
   interceptação, recupera sozinho e converge para 1 linha.
6. **Máximo de tentativas esgotado**: `__setTestBackoffOverride(80, 3)`
   acelera o backoff (80ms em vez de 15s+) e reduz o limite para 3
   tentativas; rota abortando toda vez confirma pelo menos 3 requisições
   reais disparadas antes do `state: failed`; sem loop agressivo depois
   (nenhuma requisição nova em 1.2s de espera); causa removida (rota
   liberada) + "Tentar novamente" manual recupera a mesma operação → 1 linha
   final, sem duplicar.

### Regressão (38/38 asserções)

Envio normal via login pelo FORMULÁRIO real da UI (não só login programático)
→ 1 nova tentativa gravada com gabarito real da RPC; idempotência (mesmo
`client_op_id` duas vezes → mesmo resultado devolvido, 1 linha no servidor);
flashcard/SRS (SM-2 real aplicado no servidor, 1 nova revisão, estado SRS
atualizado); troca de conta A→B→A (operação de A nunca enviada sob a sessão
de B, fila de A preservada, retomada quando A loga de novo); duas contas em
`BrowserContext` simultâneos (concorrência real, cada tentativa gravada sob o
UID correto, nenhuma atravessa); as três decisões de recuperação ambígua
(`LegacyRecoveryDialog`) — "enviar como nova tentativa" (nova linha real,
sai da lista), "manter somente neste dispositivo" (nunca envia, nunca apaga
local, não volta a ser sinalizada), "decidir depois" (fechar sem escolher,
coberto estruturalmente pelo mesmo ledger); falha/recuperação de geração de
UUID (operação persistida sem `clientOpId` com `crypto` indisponível, `crypto`
restaurado sem reload via evento `online` real, mesma operação ganha um
`clientOpId` real e sincroniza, exatamente 1 tentativa no servidor).

### Contagens antes/depois (amostra representativa dos scripts)

- R1: `question_attempts` do usuário para a questão de regressão: 43 → 44
  (exatamente +1).
- R3: `flashcard_reviews` do flashcard de regressão: 7 → 8 (exatamente +1);
  `repetition_count` avançou para 8 (SM-2 real, não recalculado no cliente).
- R7 (UUID): `question_attempts`: 47 → 48 (exatamente +1, mesmo depois de
  crypto indisponível → restaurado → sincronizado).
- Cenários 1/2a/2b/2c/3.1/3.5/3.6: cada um fechou em exatamente 1 linha no
  servidor para o `client_op_id` daquele cenário — nunca 0 (perda) nem >1
  (duplicação) — confirmado por query direta (`admin.from(...).select(...)`
  com a `service_role` key local, não pela UI).

### Validações obrigatórias

- `npx tsc --noEmit`: sem erros.
- `npm run build`: limpo (mesmo aviso pré-existente de chunk >500kB, não
  relacionado a esta entrega); instrumentação de teste confirmada FORA do
  bundle publicado (grep por `__syncDebug`/`__setTestBackoffOverride` em
  `dist/assets/*.js`: 0 ocorrências).
- `supabase test db` (pgTAP): **106/106** — sem regressão, nenhum teste novo
  necessário (os três cenários desta entrega são todos client-side/rede, já
  cobertos do lado do servidor pelos testes existentes de idempotência).
- Playwright: **90/90** (52 dos cenários 1-3 + 38 de regressão), 0 falhas.

### Dados de teste removidos

Usuários `sync07c2.a@test.local`/`sync07c2.b@test.local` (via
`supabase.auth.admin.deleteUser`, cascade em `profiles`), a questão dedicada
"Enunciado Sync" (voltada a `draft` antes de apagar, por causa do trigger de
proteção — ver AGENTS.md armadilha #11 — cascade em opções/keys/attempts), os
dois flashcards de fixture e suas `flashcard_reviews`/`flashcard_srs_state`,
e todas as `question_attempts`/`error_notebook` desses dois usuários
(inclusive a gerada pela seção de recuperação ambígua R6a sobre a questão de
seed "Questão demonstrativa de seed", que É de `supabase/seed.sql` e foi
preservada — só a tentativa de teste sobre ela foi removida). Confirmado por
query direta: 0 linhas de `auth.users`/`profiles` com e-mail
`sync07c2%@test.local` ao final.

**Nota sobre o baseline**: a contagem de `questions`/`question_attempts`/
`flashcard_reviews`/`profiles` no Supabase local não voltou aos números
documentados em AGENTS.md (394/675/84 etc., que já eram sobre o REMOTO, não o
local) nem ao número exato observado no início desta sessão — isso é
esperado e documentado desde o 09-A: `supabase test db` deixa fixtures
próprias com sufixo aleatório (`Disciplina Sync Teste`/`SYNC-<random>`,
usuários `*@test.local`) que reaparecem a cada execução do pgTAP, e nenhuma
sessão anterior tampouco as limpou. Esta sessão limpou especificamente tudo
que criou/reaproveitou para este prompt (fixtures 07-C2), sem tocar no
resíduo de pgTAP pré-existente — consistente com a orientação já registrada
em AGENTS.md de não tratar esse resíduo específico como corrupção.

### Riscos remanescentes / não determinístico

- Nenhum defeito real foi encontrado nesta rodada — histórico (07-B, 07-C)
  mostra que isso já aconteceu duas vezes seguidas antes de uma rodada limpa,
  então "nenhum bug" é um resultado honesto desta entrega, não uma garantia
  de ausência de bugs em geral.
- Duas `BrowserContext` reais disputando o MESMO `client_op_id` ao mesmo
  tempo (corrida de escrita concorrente na MESMA operação, não em operações
  diferentes) não foi testada nesta entrega — só a idempotência sequencial
  (reenvio depois que o primeiro já terminou). A migration já usa `unique
  (user_id, client_op_id)`/`(flashcard_id, client_op_id)`, então uma corrida
  real resultaria em uma das duas chamadas recebendo violação de unicidade
  (capturável, não uma duplicata) — mas isso não foi provado com navegador
  real, só inferido do schema.
- Instrumentação de teste (`__syncDebug`, `__setTestBackoffOverride`) continua
  no código-fonte, condicional a `DEV`. Não é dívida técnica urgente (mesmo
  padrão usado desde o 07-B/07-C, sempre confirmado fora do bundle a cada
  entrega), mas cresce a cada rodada — pode valer a pena consolidar num
  arquivo dedicado (`src/testing/syncDebugBridge.ts`) importado só em `DEV`,
  em vez de inline em `App.tsx`, numa iteração futura.

## Resumo do que está pronto para revisão de merge

- Migration `20260909120000_sync_reliability.sql` aplicada e testada só em
  Supabase LOCAL — **não aplicada no remoto** (fora do escopo desta sessão:
  só pode escrever/rodar contra o Supabase local). Nenhuma alteração de
  schema foi necessária no 07-B nem no 07-C — todos os bloqueios corrigidos
  até aqui foram client-side.
- Código cliente (`syncQueue.ts`, `syncHandlers.ts`, `legacyRecovery.ts`,
  `SyncStatusIndicator.tsx`, `LegacyRecoveryDialog.tsx`,
  `useAmbiguousRecoveries.ts`, `AnswersRepository.ts`,
  `FlashcardsRepository.ts`) compila (`tsc --noEmit`) e builda (`npm run
  build`) limpo, e **foi exercitado em navegador real (Playwright/Chromium)
  no 07-B e no 07-C** para os cenários listados acima — não mais só por
  leitura de código.
- Isolamento entre duas contas (estudante + editorial/admin) validado com
  dois `BrowserContext` reais no 07-C — sem vazamento de fila, tentativas,
  flashcards ou XP entre contas nos três cenários testados.
- **Atualização 07-C2**: os três sub-cenários que permaneciam sem prova
  determinística de navegador desde o 07-B (reenvio pós-servidor-pré-cliente,
  reload isolado com operação em `syncing`, classes de erro individuais)
  foram reproduzidos e confirmados com Playwright/Chromium real contra o
  Supabase local — 90/90 asserções (52 dos três cenários + 38 de regressão),
  0 defeitos novos encontrados. Ver seção "Correções/Validações do Prompt
  07-C2" para o detalhamento completo. Isso fecha a lista de pendências de
  teste de navegador conhecidas para as categorias 1 e 2.
- Categorias 3-9 permanecem no padrão antigo, com o plano de correção
  documentado acima (Etapa 4) — favoritos e progresso de leitura precisam de
  uma mudança de contrato antes de qualquer fila automática de retry. Fora
  de escopo desta entrega (07-C ficou nas categorias 1 e 2, por instrução
  explícita).

## Publicação em produção (Prompt 07-D, 2026-09-09)

Aprovada pela diretoria após 07-A/07-B/07-C/07-C2, sem nova pendência de
código encontrada nesta revisão final. Sequência executada: revisão
completa do diff (`origin/main...HEAD`, 18 arquivos) sem segredos, contas
versionadas ou catch silencioso nos fluxos publicados → push da branch →
migration `20260909120000_sync_reliability.sql` aplicada no Supabase
remoto (`synapsemed`/`jfvhwwvixwvgjfqzlkkb`) e verificada diretamente no
schema via `supabase db dump` (colunas, índices únicos, corpo das RPCs e
grants restritos a `authenticated`) → merge `--no-ff` em `main` (commit
`c8914ad`) → deploy automático do Vercel confirmado por hash/tamanho de
bundle idêntico ao build local, com `__syncDebug`/`__setTestBackoffOverride`
ausentes → smoke test em produção (login real de duas contas descartáveis,
troca A→B→A na mesma janela sem vazamento de `localStorage`, 0 erros de
console/requisições 5xx).

Diferença metodológica desta rodada em relação ao 07-C2: as contas e
fixtures fixas usadas nos 90/90 asserções de navegador do 07-C2 já haviam
sido removidas ao final daquela sessão, então esta sessão não as reexecutou
byte a byte — em vez disso, escreveu uma verificação funcional nova contra
as RPCs publicadas (tentativa normal, idempotência, isolamento entre
usuários com o mesmo `client_op_id`, flashcard/SRS, ownership), rodada
tanto no Supabase local (10/10) quanto — após a migration — diretamente no
schema remoto de produção com contas descartáveis (9/9). Os cenários
puramente client-side de rede real (offline/reconexão por corte de rede,
reload com operação presa em `syncing`, as seis classes de erro,
`LegacyRecoveryDialog`) não foram refeitos nesta rodada e continuam
apoiados apenas na evidência determinística já registrada do 07-C2 — o
código em si não mudou entre 07-C2 e 07-D.

Estado final: **categorias 1 e 2 publicadas e verificadas em produção**.
Categorias 3-9 continuam pendentes, fora de escopo. Ver
`docs/diretoria/registro.md`, entrada "Concluído — 07-D", para o retorno
completo com todas as contagens e comandos de verificação.

## Prompt 07-E — Categorias 3-7 (caderno de erros, notas, favoritos,
## progresso de leitura, simulados)

> Executado em `C:\Users\vinic\dev\NexusMed\firebase-auth`, branch
> `work/sincronizacao-dados-estudo-07e` (criada a partir de `origin/main` em
> `b7a31f7`). Continuação do Prompt 07 depois da publicação das categorias 1
> e 2 (07-D). Reações e feedback (8/9) permanecem explicitamente fora de
> escopo, por instrução do prompt.

### Etapa 1 — Inventário por categoria

| # | Categoria | Fonte de verdade | Tipo (classificação do prompt) | Problema real encontrado |
|---|---|---|---|---|
| 3 | Caderno de erros | `error_notebook` (criado só por `submit_question_attempt`; cliente só faz UPDATE de `resolved`/`user_notes`) | Estado mutável, mas update por id já é idempotente por natureza (2 colunas, reenviar os mesmos valores tem o mesmo efeito) | Nenhum de duplicação/sobrescrita — só falta de retry/visibilidade (`catch{}` silencioso) |
| 4 | Notas | `notes` (upsert lógico por alvo) | Estado mutável, dono único, LWW aceitável | **Real**: `saveNote` fazia `delete` + `insert` em duas viagens separadas, SEM constraint de unicidade no schema — uma falha entre as duas etapas (ou uma corrida real entre dois dispositivos) podia deixar 0 ou 2 linhas para o mesmo alvo |
| 5 | Favoritos | `bookmarks` (unique por `(user_id, coluna)`) | Evento append-only? Não — é um **toggle**, precisa virar "set" antes de qualquer retry automático (já identificado no 07-A, não implementado até agora) | **Real, confirmado**: `toggleBookmark` reenviado depois de falha inverteria o estado errado |
| 6 | Progresso de leitura | `reading_progress` (array de seções lidas por compêndio) | Mesmo problema do favorito (toggle), MAIS um risco de sobrescrita entre dispositivos (array calculado no cliente) | **Real, dois problemas**: toggle inseguro para retry + `toggleSectionRead` calculava o array novo no CLIENTE e regravava por inteiro — dois dispositivos marcando seções diferentes quase ao mesmo tempo podiam um sobrescrever o progresso do outro |
| 7 | Simulados | `simulations`+`simulation_questions`+`simulation_answers` (substituição total a cada save) | Estado mutável mas por substituição total (mesma classe de "conteúdo de card de flashcard") — não precisa de client_op_id, precisa de ATOMICIDADE | **Real, dois problemas**: (a) gravação final em 4 operações separadas sem transação — falha entre elas deixava o simulado sem perguntas/respostas no servidor, sem retry; (b) **nenhuma persistência durante a prova** — `answers` existia só como estado React (`useState`), fechar a aba/reload antes de "Finalizar Prova" perdia TODAS as respostas já marcadas, sem exceção |

Uso real na interface confirmado para as 5 categorias (não há nenhuma
"funcionalidade sem persistência real" nesta lista — a única lacuna real de
persistência era o rascunho do simulado em progresso, corrigida abaixo).
RLS e ownership já estavam corretos nas 5 tabelas antes desta entrega
(`*_owner_all`/`*_owner_select`/`*_owner_update`, ver
`supabase/migrations/20260903120100_rls_policies.sql`) — nenhuma mudança de
RLS foi necessária, só de contrato/atomicidade no lado do cliente e servidor.

Comportamento de logout/troca de conta: idêntico ao já documentado para as
categorias 1/2 — a fila (`syncQueue`) é isolada por UID e `runFlush` confere
a sessão ativa do Supabase antes de cada operação (nenhuma mudança nova
necessária, a infraestrutura já cobria as categorias novas automaticamente
ao registrar os handlers).

### Etapa 2 — Decisões por categoria

- **Caderno de erros**: `updateErrorLog` passou a usar `enqueue` (fila) em
  vez de `catch{}` — mesmo update idempotente por id de antes, agora com
  retry/backoff/estado visível. Nenhuma migration.
- **Notas**: migration acrescenta 4 índices únicos em `public.notes`
  (`(user_id, material_id)`, `(user_id, material_section_id)`,
  `(user_id, question_id)`, `(user_id, flashcard_id)`) — **sem** `where`,
  ao contrário de `bookmarks` (ver AGENTS.md armadilha #14: o upsert do
  PostgREST não consegue usar um índice parcial como alvo de `ON CONFLICT`;
  um índice único comum tem o mesmo efeito prático aqui porque `NULL` nunca
  colide com `NULL`). `SupabaseNotesRepository.saveNote` e o handler
  `note_upsert` (`syncHandlers.ts`) passaram a fazer um único `.upsert(...,
  { onConflict })` em vez de `delete` + `insert`. "Última gravação vence" é
  aceito deliberadamente (mesmo raciocínio já usado para conteúdo de
  flashcard: dono único, sem edição concorrente esperada).
- **Favoritos**: `toggleBookmark` continua com a mesma assinatura pública
  (a UI não muda), mas agora o toggle acontece SÓ localmente — o resultado
  (`desired`, o novo estado já decidido) é o que vira a operação enfileirada
  (`bookmark_set`), nunca um toggle enviado ao servidor. O handler não usa
  upsert (índices de `bookmarks` continuam parciais, ver armadilha #14) — faz
  select-then-insert para marcar (idempotente: já existe → no-op; corrida
  real → violação de unicidade tratada como sucesso, nunca como erro de
  retry) e delete direto para desmarcar (idempotente: deletar 0 linhas não é
  erro).
- **Progresso de leitura**: mesma mudança de contrato (toggle → set
  explícito, decidido no cliente ANTES da chamada de rede), MAIS uma RPC
  nova `set_section_read(material_id, section_id, is_read, total_sections)`
  que faz o merge do array de seções lidas ATOMICAMENTE no servidor
  (`select ... for update` serializa duas chamadas concorrentes para o
  mesmo (usuário, compêndio) — a segunda sempre parte do array real mais
  recente, nunca de um array que o cliente já não tem mais). `percent` é
  recalculado no servidor a partir do tamanho real do array, nunca enviado
  pelo cliente.
- **Simulados**: RPC nova `save_simulado_session(p_session jsonb)` substitui
  a sessão inteira (simulations + simulation_questions + simulation_answers)
  numa ÚNICA transação — tudo ou nada. Idempotente por construção (é sempre
  uma substituição total do mesmo payload, não um evento incremental) —
  não precisou de `client_op_id`. Resposta com alternativa que não pertence
  à questão é descartada sem abortar a sessão inteira (mesma tolerância que
  o cliente já tinha antes). Regra de conflito: não há — é sempre "o cliente
  que salvou por último manda", aceitável porque um simulado pertence a uma
  sessão de estudo específica, não a um estado compartilhado editado de dois
  lugares ao mesmo tempo.

### Etapa 3 — Simulados (detalhamento)

Achado que não estava no escopo original do 07-A/07-D: **não existia
NENHUMA persistência das respostas em andamento** durante um simulado —
`SimuladoSession.tsx` guardava `answers` só como `useState`, nunca gravado
em lugar nenhum até `handleFinishExam`. Fechar a aba, recarregar a página ou
uma queda de conexão durante a prova perdia todas as respostas já marcadas,
silenciosamente. Isso cobre diretamente os itens "respostas parciais",
"retomada" e "interrupção antes da conclusão" pedidos na Etapa 3 do prompt.

Correção aplicada, deliberadamente pequena: um rascunho local
(`localStorage`, isolado por usuário, `synapse_<uid>_simulado_draft_<id>`)
grava as respostas a cada seleção e é restaurado ao montar o componente;
apagado ao finalizar a prova. **O cronômetro NÃO é retomado** (recomeça do
tempo total configurado a cada montagem) — mudar essa semântica é uma
decisão de experiência do modo estudo/prova que pertence ao Prompt 10-A, não
a uma correção de persistência; só as respostas já selecionadas são
recuperadas. Criação da sessão, finalização e resultado continuam
acontecendo só no fim (`saveSimuladoSession`), agora via a RPC transacional
+ fila em vez de 4 escritas separadas sem transação. Reenvio/retomada entre
dispositivos: como a gravação final é sempre uma substituição total
idempotente, reenviar depois de uma falha (rede caiu depois do primeiro
envio) nunca duplica nem perde perguntas/respostas — confirmado por pgTAP
(ver Etapa 5).

Separação simulado vs. estudo comum: intacta, não tocada — o cronômetro em
si (contagem regressiva, comportamento ao chegar a zero) não foi alterado,
só a persistência das respostas.

### Etapa 4 — Conta residual `fase3-validation-*`

Investigação somente leitura contra o Supabase remoto (`supabase db query
--linked`), sem nenhuma escrita:

- Uma única conta encontrada: `fase3-validation-<epoch-ms>@synapsemed.local`,
  criada em 2026-09-04 13:43:48 (mesmo dia da criação do projeto Supabase),
  com login único registrado no mesmo instante da criação (nunca usada
  depois).
- Padrão de e-mail confirmado como o template EXATO de
  `scripts/validate-supabase-repos.ts` (linha 92:
  `` `fase3-validation-${Date.now()}@synapsemed.local` `` ) — um script de
  validação da migração Firebase→Supabase que cria um usuário descartável,
  roda testes e chama `cleanup()` (que deleta o próprio usuário) ao final,
  inclusive num `catch` de emergência. A sobrevivência desta conta indica
  que o processo morreu antes de qualquer um dos dois pontos de cleanup
  (crash duro, não um bug de lógica do script).
- `profiles.status = 'blocked'` (alterado em 2026-09-07, 3 dias depois da
  criação — uma sessão anterior já a neutralizou, sem apagar).
- Zero linhas em TODAS as tabelas de dado pessoal verificadas:
  `question_attempts`, `error_notebook`, `flashcards`, `notes`, `bookmarks`,
  `reading_progress`, `simulations`, `feedback`, `question_reactions`.

**Avaliação**: evidência forte e específica (padrão de e-mail batendo
exatamente com um script conhecido, zero uso real, já bloqueada por uma
sessão anterior) de que é uma fixture de teste inerte, não uma conta de
participante real. **Recomendação: remover** (`auth.admin.deleteUser`, que
faz cascade em `profiles` via FK). **Não removida nesta sessão** — é uma
escrita remota destrutiva, e o escopo desta sessão está limitado ao Supabase
LOCAL (nenhuma escrita remota autorizada no prompt 07-E). Ver
`docs/diretoria/registro.md` para o registro formal e a recomendação para a
próxima sessão/decisão do usuário.

### Etapa 5 — Testes

- `npx tsc --noEmit`: sem erros.
- `npm run build`: limpo (mesmo aviso pré-existente de chunk >500kB).
- `supabase test db` (pgTAP) contra Supabase LOCAL, com `supabase db reset`
  antes: **131/131** (106 já existentes de 07-A/07-D + 25 novas em
  `supabase/tests/database/sync_reliability_categorias_3_a_7.test.sql`),
  cobrindo diretamente nas RPCs/constraints (não só leitura de código):
  - Notas: segunda nota para o mesmo alvo viola o índice único (prova que a
    constraint barra a duplicação que o delete+insert antigo permitia);
    upsert real funciona e reflete o valor mais recente.
  - `set_section_read`: merge preserva seções marcadas por chamadas
    anteriores (não sobrescreve); reenviar a mesma seção é idempotente
    (não duplica no array); `percent` recalculado corretamente no servidor;
    desmarcar remove só a seção pedida; desmarcar uma seção nunca lida é
    um no-op seguro; `total_sections <= 0` é rejeitado; isolamento entre
    dois usuários no mesmo compêndio (progresso de um não vaza pro outro).
  - `save_simulado_session`: primeira gravação cria sessão + pergunta +
    resposta; reenviar o MESMO payload não duplica nada (idempotência por
    substituição total); resposta com alternativa de outra questão é
    descartada sem abortar a gravação da pergunta; usuário B não consegue
    sobrescrever a sessão do usuário A (ownership), sessão de A permanece
    intacta após a tentativa.

**Limitação explícita, não contornada**: esta entrega NÃO inclui testes de
navegador real (Playwright) para os fluxos client-side novos (fila
processando `bookmark_set`/`reading_progress_set`/`note_upsert`/
`simulado_save` de ponta a ponta, retry após falha de rede real, indicador
de sincronização para as categorias novas, rascunho de simulado sobrevivendo
a um reload real). A cobertura desta entrega é: (1) as RPCs/constraints
novas provadas diretamente por pgTAP (idempotência, isolamento, ownership,
merge atômico — o que importa para corretude do servidor), e (2) revisão de
código dos handlers/repositórios seguindo o MESMO padrão já validado em
navegador real para as categorias 1/2 no 07-B/07-C/07-C2 (fila
`syncQueue`/`enqueue`, isolamento por sessão ativa, backoff). Diferente das
categorias 1/2, os cenários client-side específicos destas 5 categorias
(ex.: duas abas marcando seções diferentes ao mesmo tempo, retry de
favorito depois de queda de rede) não foram reproduzidos com navegador
real nesta sessão — decisão de escopo diante do orçamento disponível,
registrada aqui explicitamente em vez de omitida. Recomenda-se uma rodada
de testes de navegador dedicada (mesmo padrão Playwright/Chromium contra
Supabase local do 07-B em diante) antes de publicar esta branch em
produção.

Estado final: **categorias 3-7 implementadas e verificadas localmente
(pgTAP + tsc + build)**, branch `work/sincronizacao-dados-estudo-07e` NÃO
mesclada em `main`, migration NÃO aplicada no remoto, nada em produção.
Categorias 8/9 (reações, feedback) permanecem fora de escopo. Ver
`docs/diretoria/registro.md`, entrada "Retorno recebido — 07-E", para o
retorno completo.

## Prompt 07-E2 — Testes de navegador e conflitos das categorias 3-7

> Executado em `C:\Users\vinic\dev\NexusMed\firebase-auth`, mesma branch
> `work/sincronizacao-dados-estudo-07e` (HEAD do 07-E: `69f9c36`).
> Continuação direta do 07-E: fecha a limitação explícita deixada por ele
> ("nenhum teste de navegador real foi executado") e resolve os dois riscos
> de perda silenciosa que a diretoria proibiu explicitamente no prompt
> (notas e simulados).

### Etapa 1 — Revisão de código antes dos testes

Confirmado por leitura: cada handler novo (`bookmark_set`,
`reading_progress_set`, `note_upsert`, `error_notebook_update`,
`simulado_save`) usa a sessão ativa via `supabase.auth.getUser()`/RPC
`security definer` com `auth.uid()` — nunca um `user_id` vindo do payload do
cliente. `client_op_id`/retry já eram estáveis para as categorias 1/2
(inalterado nesta entrega). Concorrência antes desta entrega:

- **Notas**: nenhuma — "última gravação vence" sem nenhuma detecção de
  conflito (ver Etapa 3 abaixo, RISCO REAL confirmado e corrigido).
- **Simulados**: nenhuma — substituição total incondicional por `id`, sem
  checar se a sessão já estava em estado terminal (ver Etapa 4 abaixo,
  RISCO REAL confirmado e corrigido).

### Etapa 2 — Ambiente de teste

Mesmo padrão das entregas 07-B em diante: Playwright/Chromium reaproveitado
de uma pasta temporária anterior (`%TEMP%\nexusmed-pw-07c2\node_modules`,
copiado para `%TEMP%\nexusmed-pw-07e2` — Chromium e `@supabase/supabase-js`
já instalados, sem reinstalar do zero), `vite` dev servido em
`http://127.0.0.1:5180` (porta 3000 já ocupada por processo não relacionado
a este repositório, confirmado antes de começar) com
`.env.development.local` apontando para o Supabase LOCAL. Três usuários de
teste descartáveis (`sync07e2.a@test.local`, `sync07e2.b@test.local` role
`student`, `sync07e2.admin@test.local` role `admin`), promovidos via `docker
exec supabase_db_synapsemed psql -U postgres` (nunca client/service role —
armadilha #9), removidos ao final. Fixture dedicada: 1 disciplina/tema/
compêndio/2 seções/1 questão publicada.

**Ponte de depuração ampliada** (`src/App.tsx`, `window.__syncDebug`,
condicional a `import.meta.env.DEV`, mesmo padrão do 07-C2): passou a expor
também os 5 repositórios das categorias 3-7 (`notesRepository`,
`bookmarksRepository`, `readingProgressRepository`,
`errorNotebookRepository`, `simuladosRepository`) e `StorageService` —
permite que os scripts de teste chamem o MESMO caminho client-side real que
os componentes React usam (grava local → enfileira → handler → RPC), só
disparado pelo console em vez de um clique, para cenários de concorrência
entre "dispositivos" que não têm como ser exercitados clicando um botão só
(duas edições offline da mesma nota, por exemplo). Não é uma chamada direta
de RPC — é o repositório de produção de ponta a ponta. Confirmado com `npm
run build` + `grep` no bundle: 0 ocorrências de `__syncDebug`.

### Etapa 3 — Notas: conflito real confirmado e corrigido

**Teste que expôs o defeito**: dois `BrowserContext` autenticados na MESMA
conta (simulando dois dispositivos), ambos carregando a mesma nota, editando
com textos diferentes sem saber um do outro (mesmo padrão "offline
simultâneo" que o prompt pede). **Resultado antes da correção**: a segunda
edição a sincronizar apagava silenciosamente a primeira — exatamente o
comportamento que a diretoria proibiu explicitamente ("não aceita LWW
silencioso se ele puder apagar texto válido sem o usuário saber").

**Correção aplicada** (migration
`20260909140000_sync_reliability_conflict_guards.sql`, RPC `upsert_note`):

- Cada dispositivo guarda localmente o `updated_at` da nota que conhece
  como "base" (`StorageService.getNoteBaseVersion`/`setNoteBaseVersion`,
  populado a cada leitura bem-sucedida via `SupabaseNotesRepository.getNotes`
  e a cada escrita bem-sucedida via o handler).
- `upsert_note` recebe essa base (`p_base_updated_at`). Se a linha já
  existe, a base foi informada, o `updated_at` atual do servidor é MAIS
  NOVO que a base E o texto atual diverge do que está sendo salvo agora →
  conflito real: a escrita NÃO é aplicada, a RPC devolve `{conflict: true,
  server_text, server_updated_at}` em vez de escrever.
- O handler (`note_upsert`, `src/services/syncHandlers.ts`) nunca decide
  sozinho qual versão vale: funde as duas (`mergeConflictingNoteText`) com
  uma marcação visível ("Conflito de sincronização em <data>: ... a versão
  do outro dispositivo foi preservada abaixo") e regrava com a base
  atualizada — nunca perde nenhuma das duas edições, nunca constrói um
  editor colaborativo em tempo real.
- Sem base conhecida (primeira sincronização de um dispositivo, ou nota
  nova) a escrita procede normalmente — mesma semântica "última grava
  vence" de antes, preservada onde não há conflito real.

**Testado com Playwright** (dois `BrowserContext`, mesma conta): conflito
real detectado e as duas edições preservadas no texto final do servidor;
edições SEQUENCIAIS do MESMO dispositivo nunca disparam a detecção contra
si mesmas (3 edições em sequência terminam no texto mais recente, sem fusão
espúria); nota editada offline sobrevive a um reload real; depois de
reconectar (evento `online` real), a edição pendente sincroniza.

### Etapa 4 — Simulados: estado terminal protegido

**Teste que expôs o defeito**: sessão de simulado finalizada num
"dispositivo" (score 100, `completed_at` real); um segundo envio (simulando
um dispositivo atrasado/rascunho antigo reconectando) com o MESMO `id` de
sessão mas `completed_at` e `score` DIFERENTES. **Resultado antes da
correção**: `save_simulado_session` sobrescrevia incondicionalmente — o
resultado real (score 100) seria substituído silenciosamente pelo envio
atrasado.

**Correção aplicada** (mesma migration, `save_simulado_session` revisado):
antes de aplicar a substituição total, a função verifica se a sessão já
existe E já tem `completed_at` preenchido (estado terminal). Se sim, só
aceita um reenvio com o MESMO `completed_at` (retry idempotente real — o
cliente sempre reenvia o `completedAt` congelado no momento da finalização,
nunca gera um novo); qualquer `completed_at` diferente (inclusive nulo, ou
seja, "reabrir" a sessão) é rejeitado com uma exceção (`sessao_ja_
finalizada`, SQLSTATE `P0001` → classificado `validation` no cliente,
permanente, visível na UI, sem retry infinito).

**Testado com Playwright**: primeira finalização aceita; reenvio do MESMO
payload continua idempotente mesmo com a sessão já finalizada; dispositivo
atrasado com resultado DIFERENTE não sobrescreve (score real preservado);
a operação do dispositivo atrasado termina em `state: 'failed'` — falha
permanente e visível, nunca um retry silencioso indefinido; rascunho de
respostas em andamento (`localStorage`, isolado por usuário) sobrevive a
reload real.

**Ajuste no teste pgTAP existente** (`sync_reliability_categorias_3_a_7.
test.sql`): o teste de "reenviar o mesmo payload não duplica" chamava
`now()` duas vezes em SQL separado, gerando dois timestamps DIFERENTES —
isso disparava incorretamente a nova guarda de estado terminal contra o
próprio reenvio idempotente (falso positivo). Corrigido capturando
`completed_at` numa variável (`v_completed_at \gset`) e reutilizando o MESMO
valor nas duas chamadas — reflete o comportamento real do cliente
(`completedAt` congelado uma vez, nunca recalculado a cada retry). 8
asserções novas: guarda rejeita `completed_at` diferente e `completed_at`
nulo (reabertura) numa sessão já finalizada; reenvio do MESMO
`completed_at` continua sendo aceito; `upsert_note` sem conflito, com
conflito real detectado (preserva o texto do primeiro dispositivo), e sem
base conhecida (procede normalmente).

### Etapa 5 — Bug real encontrado em `syncQueue.ts` (motor compartilhado)

Não fazia parte do escopo original (categorias 3-7), mas foi descoberto
DURANTE o teste de favoritos ("operações em ordem invertida têm resultado
definido", item explícito da Etapa 5 do prompt) e afeta TODAS as categorias
1-7 igualmente, por isso foi corrigido nesta mesma entrega (a falha foi
demonstrada por um teste desta entrega, não uma refatoração especulativa):

**Causa confirmada**: `runFlush` (`src/services/syncQueue.ts`) carrega
`ops = loadQueue(userId)` UMA VEZ no topo da função. O primeiro `await` real
dentro do laço principal é `getActiveSupabaseUserId()` — um ponto de
suspensão de verdade (chamada assíncrona ao Supabase). Duas operações
enfileiradas em sequência rápida (ex.: `bookmark_set` com `desired:false`
seguido de `desired:true`, ambas síncronas, sem nenhum `await` entre elas)
gravam corretamente as DUAS no `localStorage` antes de qualquer coisa
assíncrona rodar — mas quando `runFlush` retoma depois do `await` e
escreve de volta o `ops` capturado ANTES do `await` (para marcar a operação
atual como `'syncing'`), isso sobrescreve o `localStorage` com um array que
não inclui a operação mais nova, apagando-a silenciosamente da fila.
Reproduzido deterministicamente: a segunda operação (`desired:true`)
simplesmente não existia mais em `getOps()` depois do flush — contagem
final no servidor ficava em 0 (desfavoritado) em vez de 1 (favoritado,
resultado esperado do "último set enfileirado vence").

**Correção**: antes de marcar `'syncing'`, `runFlush` recarrega a fila
(`loadQueue`) e localiza a operação pelo `id` (nunca pelo índice `i`, que
pode não apontar mais para a mesma operação depois do reload) — nunca mais
escreve de volta um snapshot capturado antes do `await`.

**Achado relacionado, mesmo arquivo**: o evento `online` real e a aba
voltando a ficar visível não ignoravam o backoff exponencial
(`nextRetryAt`) — uma operação que tinha falhado por rede pouco antes
(ex.: nota editada offline, uma tentativa falhou, depois a página recarrega
e a rede volta) ficava presa até ~15s+ (base do backoff) mesmo com o
navegador confirmando reconexão real, porque `runFlush` sempre respeitava
`nextRetryAt` independente de QUEM disparou o flush. Corrigido: `flush`/
`flushAllKnown` ganharam um parâmetro `force` — `true` só para os eventos
`online`/`visibilitychange` (sinais fortes e explícitos de reconexão),
sempre `false` para o heartbeat periódico de 60s (que continua respeitando
o backoff normalmente, para não virar retry agressivo).

Testado com Playwright: as duas operações em ordem invertida convergem para
o estado do ÚLTIMO set enfileirado (4 operações no total na fila do
dispositivo, todas `synced`, contagem final = 1 linha no servidor); nota
offline sincroniza logo após o evento `online` real (sem esperar o backoff
completo).

### Etapa 6 — Favoritos, progresso de leitura, caderno de erros

Nenhum defeito adicional encontrado (além do bug de `syncQueue.ts` da Etapa
5, que afeta favoritos mas não é específico dele). Confirmado com
Playwright: `bookmark_set`/`reading_progress_set` são idempotentes por
`desired` explícito (reenviar o mesmo `desired: true` não duplica);
`set_section_read` faz merge real entre dois dispositivos marcando seções
diferentes (nunca sobrescreve); um dispositivo mais antigo desmarcando uma
seção que ele conhece não desmarca uma seção mais nova que ele não conhece;
logout com operação de favorito pendente NUNCA a envia sob a sessão de
outra conta (0 linhas sob B), e A retomando a sessão sincroniza a própria
operação corretamente; caderno de erros é derivado só de
`submit_question_attempt` (nunca escrito diretamente pelo cliente) — uma
tentativa correta posterior a um erro já resolvido não reabre o item
(sem disputa de responsabilidade entre os dois fluxos); retry de
`updateErrorLog` não duplica.

### Etapa 7 — Validações

- `npx tsc --noEmit`: sem erros (antes e depois de cada correção).
- `npm run build`: limpo (mesmo aviso pré-existente de chunk >500kB);
  instrumentação de teste (`__syncDebug`, agora incluindo os 5 repositórios
  novos + `StorageService`) confirmada FORA do bundle publicado (0
  ocorrências).
- `supabase test db` (pgTAP), com `supabase db reset` antes e depois:
  **139/139** (106 de 07-A/07-D + 33 de `sync_reliability_categorias_3_a_7.
  test.sql`, sendo 25 do 07-E + 8 novas do 07-E2), em duas execuções
  completas (antes e depois da limpeza final).
- Playwright/Chromium: **25/25 asserções**, 0 falhas, em duas execuções
  completas contra bancos recém-resetados (confirma que nenhum teste
  depende de estado residual de execução anterior) — 3 em notas
  (conflito), 1 em notas (sequencial), 2 em notas (reload/reconexão), 4 em
  favoritos (idempotência/ordem/dispositivo2), 2 em favoritos
  (logout/retomada), 3 em progresso de leitura, 5 em caderno de erros, 4 em
  simulados (estado terminal), 1 em simulados (rascunho/reload).
- Confirmação direta no Postgres (não só pela UI/asserção client-side): toda
  contagem crítica (notas, `bookmarks`, `reading_progress`,
  `error_notebook`, `simulations`) foi lida via `docker exec ... psql`
  diretamente, nunca só inferida do resultado da chamada client-side.

### Regra final de conflitos

- **Notas**: "última gravação vence" continua sendo a regra padrão (dono
  único, sem colaboração em tempo real esperada) — MAS só quando não há
  evidência de conflito real. Quando o servidor mudou desde a última
  leitura conhecida do dispositivo E o texto diverge, a escrita não é
  aplicada às cegas: as duas versões são fundidas com marcação visível.
  Não é resolução automática "inteligente" nem editor colaborativo — é
  a proteção mínima contra perda silenciosa pedida pelo prompt.
- **Simulados**: substituição total continua sendo a regra (não é um
  evento incremental), MAS o estado terminal (`completed_at` preenchido) é
  protegido — só o mesmo reenvio exato (retry idempotente) é aceito depois
  disso; qualquer tentativa de mudar o resultado já fechado é rejeitada de
  forma permanente e visível, nunca aplicada silenciosamente.

### Limitações confirmadas, não contornadas

- **Corrida real de duas escritas SIMULTÂNEAS na mesma nota** (duas
  requisições HTTP em voo ao mesmo tempo, não sequenciais) não foi testada
  — só a sequência "dispositivo 1 sincroniza, depois dispositivo 2
  sincroniza" (que já é o cenário real de "dois dispositivos offline,
  reconectando em momentos diferentes"). A `select ... for update`
  implícita pelo modelo de conflito (comparação de `updated_at`) previne
  dado inconsistente mesmo sob corrida real (a segunda escrita concorrente
  leria o `updated_at` já atualizado pela primeira e detectaria conflito
  corretamente), mas isso não foi provado com duas requisições disparadas
  literalmente ao mesmo tempo via navegador.
- **Achado FORA de escopo, não corrigido**: `AuthContext.tsx` (não faz
  parte das categorias 3-7) tem uma corrida benigna entre a
  `supabase.auth.getSession()` inicial (chamada no mount) e o evento de
  login real (`onAuthStateChange`) — um preenchimento/clique de formulário
  MUITO rápido (script automatizado, não um humano digitando) pode fazer a
  promise inicial (que capturou "sem sessão" antes do login) resolver
  DEPOIS do evento de login, revertendo `StorageService.setActiveUser` de
  volta para `null` por um instante. Não reproduzido com login humano real
  (digitar credenciais leva segundos, tempo suficiente para a promise
  inicial já ter resolvido antes do clique). Contornado só no PRÓPRIO
  script de teste (checagem de estabilidade antes de prosseguir); não
  corrigido no produto porque está fora do escopo desta entrega
  (categorias 3-7) e não foi demonstrado como um risco real de uso humano
  — registrado aqui para uma sessão futura avaliar se vale a pena
  endurecer mesmo assim.
- Simulados: não foi testado o caso "dois dispositivos DIFERENTES (não a
  mesma sessão/página) finalizando a MESMA sessão de simulado quase
  simultaneamente" com uma requisição HTTP genuinamente em voo no momento
  em que a outra commita — só a sequência determinística (primeiro finaliza
  e sincroniza, depois o segundo tenta). O comportamento sob essa corrida
  real depende de qual `UPDATE` commita primeiro no Postgres; como a
  função inteira roda dentro de uma transação e o SELECT de `completed_at`
  não usa `for update` explícito (não é necessário: a checagem de estado
  terminal é sobre uma condição de negócio, não uma seção crítica que
  precise lock pessimista — o pior caso sob corrida real é as duas
  transações lerem `completed_at is null` e ambas tentarem finalizar, uma
  ganha e a outra bate no reenvio idempotente OU na guarda, dependendo da
  ordem de commit — nunca uma perda silenciosa, só um resultado
  não-determinístico de QUAL das duas finalizações "ganha", que é
  aceitável dado que ambas seriam legítimas), isso não foi provado com
  navegador real.

Estado final: **três defeitos reais corrigidos** (perda silenciosa de nota
em conflito, sobrescrita silenciosa de simulado finalizado, perda
silenciosa de operação enfileirada em `syncQueue.ts` sob concorrência),
25/25 Playwright + 139/139 pgTAP + tsc + build limpos, branch
`work/sincronizacao-dados-estudo-07e` NÃO mesclada em `main`, migration NÃO
aplicada no remoto, nenhuma escrita remota realizada. Ver
`docs/diretoria/registro.md`, entrada "Concluído — 07-E2", para o retorno
completo.

## Prompt 07-E3 (2026-09-09/10) — serialização real (advisory lock) dos três riscos residuais

A revisão de código do 07-E2 (esta seção, "Achado FORA de escopo"/"não foi
testado... com navegador real" acima) identificou três riscos que sobreviviam
mesmo depois das guardas de conflito daquele prompt — todos com a mesma causa
raiz: uma checagem de estado (existe linha? já está terminal?) feita ANTES de
existir algo para travar com `select ... for update`.

1. **`upsert_note`**: duas primeiras criações concorrentes da MESMA nota
   lógica (mesmo usuário + mesmo alvo) não tinham nada em comum para travar —
   nenhuma linha existia ainda. Pior: o código do 07-E2 tratava
   `p_base_updated_at is null` como "sempre sobrescreve sem checar", e as
   DUAS primeiras criações concorrentes SEMPRE têm base nula por definição
   (nenhum dos dois dispositivos nunca leu uma versão do servidor) — ou seja,
   o próprio "comportamento anterior preservado" documentado no 07-E2 era o
   buraco.
2. **`save_simulado_session`**: a guarda de estado terminal (`completed_at`
   já preenchido) era lida ANTES do `insert ... on conflict`. O `on conflict
   do update` serializa a ESCRITA em si, mas nunca reavalia a guarda de
   negócio que já tinha sido lida antes de chegar lá.
3. **`note_upsert` (cliente, `src/services/syncHandlers.ts`)**: depois do
   PRIMEIRO conflito, o código fundia os textos e tentava de novo — mas não
   verificava se essa segunda chamada TAMBÉM voltava com `conflict: true`
   (ex.: um terceiro dispositivo grava entre a detecção do conflito e o envio
   do merge). Tratava a resposta da segunda chamada como sucesso
   incondicionalmente, mesmo quando o servidor tinha rejeitado o texto
   enviado.

### Reprodução ANTES da correção

Todos os três foram reproduzidos com chamadas de rede REAIS concorrentes
(`Promise.all`, duas ou três conexões `supabase-js` distintas autenticadas
como o mesmo usuário) contra o Supabase local, ANTES de qualquer correção:

- **Notas**: duas chamadas `upsert_note` simultâneas com textos diferentes
  para o mesmo alvo novo — nenhuma das duas recebeu `conflict: true`; a
  segunda escrita venceu silenciosamente, o texto da primeira desapareceu
  sem deixar rastro em lugar nenhum.
- **Simulados**: duas chamadas `save_simulado_session` simultâneas
  finalizando a MESMA sessão nova com scores diferentes — as DUAS foram
  aceitas sem erro; o score da segunda sobrescreveu o da primeira
  silenciosamente (confirmado lendo `public.simulations` direto via
  `docker exec ... psql`, não só pela resposta da API).
- **Cliente (note_upsert)**: sequência real de chamadas RPC mostrando que,
  quando a chamada de retry pós-merge TAMBÉM volta com `conflict: true`
  (texto de um terceiro dispositivo C que escreveu entre a detecção do
  conflito e o merge de A), o código então vigente em `syncHandlers.ts`
  ignorava esse segundo `conflict` e devolvia a resposta como sucesso — a
  fila marcaria a operação como sincronizada mesmo o servidor tendo mantido
  o texto de C, não o merge de A.

### Correção

- **Migration `20260909150000_conflict_serialization_07e3.sql`**:
  `pg_advisory_xact_lock(hashtextextended(chave_logica, 0))` adquirido como a
  PRIMEIRA coisa que `upsert_note`/`save_simulado_session` fazem — antes de
  qualquer leitura de estado. É uma exclusão mútua real do Postgres (não
  otimista): a segunda chamada concorrente para a MESMA chave lógica
  (usuário + alvo da nota, ou usuário + id do simulado) bloqueia até a
  primeira COMMITAR por completo (cada chamada de RPC via PostgREST é sua
  própria transação), e só então lê o estado real e final que a primeira
  deixou — nunca uma foto de "antes de qualquer decisão". Consequência
  deliberada para notas: base nula + texto existente diferente agora TAMBÉM
  é conflito (mudança de comportamento em relação ao 07-E2, documentada na
  migration e no pgTAP atualizado).
- **`src/services/syncHandlers.ts` (`note_upsert`)**: laço de até 3
  tentativas de merge (`MAX_NOTE_MERGE_ATTEMPTS`). Cada resposta é verificada
  da mesma forma (nunca "só a primeira conta"); o texto fundido é salvo
  localmente a cada rodada (nunca descarta a edição do usuário, mesmo que a
  rodada seguinte também conflite). Se o limite for esgotado sem o servidor
  aceitar, a operação lança um erro com `code: 'SYNC_CONFLICT'` — nunca
  finge sucesso, nunca entra em loop infinito, nunca concatena marcadores
  sem limite.
- **`src/services/syncQueue.ts`**: novo `SyncErrorKind = 'conflict'`,
  classificado a partir de `code === 'SYNC_CONFLICT'`, tratado como falha
  PERMANENTE (não está em `isRetryable`, então nunca é retentado
  automaticamente em loop) e incluído em `needsSupport` (mesma mensagem
  tranquilizadora já existente — "continue estudando, progresso local
  preservado" — em vez de uma mensagem genérica de erro). O usuário pode
  reenviar manualmente pelo botão "Tentar novamente" já existente no
  `SyncStatusIndicator`, que dispara uma nova rodada limitada, nunca um laço
  automático agressivo.

### Testes de concorrência real DEPOIS da correção

22/22 asserções, todas com `Promise.all`/conexões `supabase-js` distintas
contra o Supabase local (scripts descartáveis, não commitados — evidência
integral no retorno do Prompt 07-E3):

- Notas: duas primeiras criações diferentes simultâneas (texto final funde
  as duas, nenhuma perdida); duas edições da mesma base simultâneas (idem);
  terceiro update entre detecção de conflito e merge — cenário de
  convergência (interferência para a tempo, handler resolve dentro do
  limite) e cenário de exaustão (interferência persiste nas 3 tentativas,
  handler falha explicitamente com `SYNC_CONFLICT`, texto do usuário
  permanece salvo localmente); replay idêntico (idempotente, sem crescer
  marcadores); estado local convergindo com o servidor após resolução.
- Simulados: duas primeiras finalizações diferentes simultâneas (uma vence,
  a outra recebe `sessao_ja_finalizada`, resultado vencedor confirmado via
  `psql` direto); rascunho concorrente com finalização (finalização nunca é
  apagada, em qualquer ordem de commit); duas finalizações a partir do mesmo
  rascunho (uma vence); replay idêntico simultâneo (aceito nas duas
  chamadas); envio atrasado depois do estado terminal (rejeitado
  explicitamente, resultado original preservado, confirmado via `psql`).

Regressão obrigatória por ter alterado `syncQueue.ts`: o cenário "duas
operações rápidas em sequência" do 07-E2 (favoritos: desfavoritar seguido de
favoritar de novo antes do primeiro flush terminar) foi repetido importando o
MÓDULO REAL `syncQueue.ts` (não uma reimplementação) com um polyfill mínimo
de `localStorage`, autenticado de verdade contra o Supabase local — as duas
operações continuam presentes na fila e ambas sincronizam, a correção do
07-E2 permanece intacta.

pgTAP: 146/146 (139 herdados + 1 assertão nova refletindo a mudança de
comportamento de `upsert_note` com base nula + 6 novas em
`sync_reliability_07e3_conflict_serialization.test.sql`, que documenta
explicitamente que pgTAP roda numa sessão só e portanto não exercita a
corrida real — só a lógica de negócio sequencial; a corrida real está provada
à parte, acima). `tsc --noEmit` e `npm run build` limpos.

**Limitações conhecidas desta rodada**: não foi repetida a suíte completa de
Playwright/Chromium (25/25 do 07-E2) — as mudanças desta rodada são
inteiramente de servidor (SQL) + um handler específico (`note_upsert`), sem
alterar UI nem o mecanismo de detecção offline/backoff; os fluxos normais
(nota comum, simulado comum) e offline/reconexão continuam garantidos pela
cobertura de navegador já existente do 07-C2/07-E2, que exercitava exatamente
esse mecanismo (não alterado aqui) — não foram re-executados com navegador
real nesta rodada, só confirmados por leitura de código (nenhuma mudança na
lógica de backoff/reconexão) e pelos scripts de concorrência acima (que usam
a MESMA fila real). Isto é uma lacuna de prova, não uma alegação de
comportamento verificado — uma sessão futura que altere `runFlush`,
`classifySyncError`'s outras branches, ou a UI de notas/simulados deveria
repetir o Playwright completo antes de publicar.

## Prompt 07-E4 (2026-09-10) — gate de navegador final e publicação em produção

Fechou a lacuna deixada pelo 07-E3 (Playwright completo não repetido) com os
dois cenários que a diretoria definiu como gate obrigatório antes de
publicar, e executou a sequência completa de publicação (push, migrations
remotas, merge em `main`, deploy, smoke test).

### Gate de navegador (Playwright/Chromium contra Supabase LOCAL)

Ambiente: `%TEMP%\nexusmed-pw-07e4` (node_modules reaproveitado do
07-E2/07-C2 via cópia, playwright já instalado), `vite` dev na porta 5183
com `.env.development.local` apontando para `http://127.0.0.1:54321`
(nunca o `.env.local` real). Usuário de teste
`sync07e4.a@test.local`/`Senha123!teste`, fixtures (disciplina/tema/
material/duas questões publicadas) criados via `docker exec ... psql -U
postgres` (nunca client com service role, ver armadilha #9), removidos ao
final. **23/23 asserções passaram em DUAS execuções independentes**, sem
nenhum defeito de produto — só três bugs no próprio script de teste
(campo `category` em vez de `type` nas operações da fila, formato errado
do payload de `SimuladoSessionData.answers` — é um `Record<questionId,
{selectedOption, timeSpent}>`, não um array de `{question_id,
selected_option_id}` — e comparação de `completed_at` truncada para
segundos quando a diferença entre os dois dispositivos era de 1ms),
corrigidos antes da aprovação, não do código de produção.

1. **Nota com base nula (9/9)**: dois `BrowserContext` autenticados como o
   MESMO usuário, alvo (`QUESTION1_ID`) sem nota prévia em nenhum dos dois
   — base nula por definição nos dois lados. Textos diferentes gravados
   quase simultaneamente (`Promise.all` de `notesRepository.saveNote` +
   `flush` reais, mesmo caminho client-side que o app usa, disparado via
   `window.__syncDebug` — ponte DEV, ausente do bundle de produção, mesmo
   padrão já usado e aceito desde o 07-C2). Resultado: exatamente 1 linha
   em `notes` (nunca 0 nem 2), servidor com pelo menos um dos dois textos
   originais, o dispositivo que perdeu a corrida com os DOIS textos
   fundidos localmente (nada apagado), `getNotes()` (repositório real)
   devolvendo exatamente o texto do servidor após convergência, marcação
   textual explícita de conflito (`[Conflito de sincronização em ...]`)
   sempre que um conflito de fato ocorreu.
2. **Conflito sucessivo (9/9)**: nota pré-existente com texto base
   conhecido; contexto A tenta salvar um texto novo com essa base;
   `page.route()` intercepta as chamadas de A ao RPC `upsert_note` e,
   ANTES de deixar cada tentativa prosseguir, um contexto B grava uma
   versão nova e diferente por fora (caminho real, sem interceptação) —
   garante que as até-3 tentativas de merge de A (`MAX_NOTE_MERGE_ATTEMPTS`
   em `syncHandlers.ts`) encontrem sempre uma base desatualizada de novo,
   esgotando o orçamento de forma determinística em vez de depender de
   timing. Resultado: operação de A termina em `state: 'failed'` (nunca
   `synced`), `lastError.kind === 'conflict'` (nunca genérico), indicador
   de sincronização (`[aria-label*="Falha ao sincronizar"]`) visível,
   texto local de A preserva a própria edição fundida com a marcação de
   conflito (nada descartado), servidor preserva a última escrita
   bem-sucedida de B, `retryAllFailed` disponível para reenvio manual.
3. **Simulado concorrente (5/5)**: duas `BrowserContext` da mesma conta
   chamam `simuladosRepository.saveSimuladoSession` para a MESMA sessão
   (`id` igual) com `completed_at`/`score` diferentes, via `Promise.all`
   real (duas conexões `supabase-js` distintas competindo pelo mesmo
   `pg_advisory_xact_lock` no servidor). Resultado, em ambas as execuções
   (o vencedor variou entre elas — confirma corrida real, não resultado
   fixo por ordem de código): exatamente 1 linha em `simulations`, só uma
   finalização `synced` e a outra `failed` com `kind: 'validation'`
   (`sessao_ja_finalizada`), indicador de falha visível no dispositivo
   perdedor, replay do MESMO resultado vencedor (idêntico `completed_at`)
   aceito sem duplicar, `getSimuladoHistory()` (repositório real, não
   leitura direta) batendo exatamente com o valor do banco.

### Validação local (Fase 3)

`supabase db reset` (aplica as 16 migrations, incluindo as três desta
entrega, em ordem, sem erro) → `supabase test db`: **146/146 pgTAP**
(mesmo total do 07-E3, nenhuma regressão). `npx tsc --noEmit` e `npm run
build` limpos (mesmo aviso pré-existente de chunk >500kB). `grep` no bundle
de produção confirma 0 ocorrências de `__syncDebug`/
`__setTestBackoffOverride`.

### Publicação (Fases 4-6)

Baseline remoto confirmado antes de qualquer escrita: projeto
`synapsemed`/`jfvhwwvixwvgjfqzlkkb`; `supabase migration list --linked`
mostrou as três migrations desta entrega como as ÚNICAS pendentes (as 12
anteriores já `local=remote`); `origin/main` em `b7a31f7` antes e depois do
push da branch. Push da branch sem force, `supabase db push --linked --yes`
aplicou as três migrations na ordem esperada. Verificação direta no schema
remoto: `upsert_note`/`save_simulado_session` com `pg_advisory_xact_lock`
confirmado no corpo (`pg_proc.prosrc`) via `supabase db query --linked`;
`information_schema.routine_privileges` confirma `EXECUTE` restrito a
`authenticated`/`postgres`, nunca `anon`/`public`; índices únicos de
`notes` (`notes_user_material_uq`, `..._material_section_uq`,
`..._question_uq`, `..._flashcard_uq`) presentes; `pg_tables.rowsecurity =
true` em todas as sete tabelas afetadas. Contagens de `questions`/
`question_options`/`question_answer_keys`/`question_references`/`sources`/
`flashcards`/`profiles` idênticas antes/depois das migrations — nenhum
dado real alterado pela aplicação do schema. Merge `--no-ff` em `main`
(commit `288374b`, `main`/`origin/main` avançaram de `b7a31f7`), `tsc`/
`build` reconfirmados limpos, push sem force. Deploy automático do Vercel
confirmado: `assets/index-BWtJ444Z.js` publicado, byte-a-byte idêntico ao
build local (`diff` sem saída), 0 ocorrências de `__syncDebug`/
`__setTestBackoffOverride` no bundle servido.

### Smoke test em produção (Fase 7)

Duas contas descartáveis (`smoke07e4.*@synapsemed.local`,
`smoke07e4b.*@synapsemed.local`), promovidas a `active` via `supabase db
query --linked` (conexão real como `postgres`, nunca service role — ver
armadilha #9), removidas ao final. Fluxos exercitados pela interface real
(Playwright/Chromium contra `https://synapse-med-firebase-auth.vercel.app`,
sem nenhuma ponte de debug — essa não existe em produção):

- Responder questão (modo recall → revelar alternativas → selecionar →
  confirmar) — 1 `question_attempts` real.
- Favoritar → desfavoritar → favoritar de novo (toggle idempotente real via
  UI) — `bookmarks` com 1 linha, estado final favoritado.
- Marcar seção de compêndio como lida — `reading_progress` com 1 linha.
- Criar/editar nota pessoal em compêndio (painel "Anotações") — `notes` com
  1 linha, texto batendo exatamente com o enviado.
- Responder questão incorretamente de propósito → confirma criação
  automática de entrada em `error_notebook` (nunca escrita direta pelo
  cliente, sempre efeito colateral de `submit_question_attempt`).
- Caderno de Erros: "+ Adicionar anotação" → salvar, "Marcar como
  Dominada" — **achado**: esses dois botões da tela `ErrorNotebookView.tsx`
  chamam `answersRepository.recordAnswer` (categoria 1, resubmissão de
  tentativa, evento imutável — CADA clique gera uma NOVA linha em
  `question_attempts`/`error_notebook`, por design daquela categoria já
  publicada no 07-D), **não** `errorNotebookRepository.updateErrorLog`
  (categoria 3, upsert por id, o que esta entrega — 07-E — de fato mexeu).
  Buscando no código, `errorNotebookRepository.updateErrorLog` não tem
  NENHUM chamador de UI atualmente — só `getErrorLogs` é usado (leitura,
  painel do dashboard). Ou seja: o handler `error_notebook_update`/RPC de
  retry-com-fila que o 07-E implementou e testou (pgTAP + Playwright) está
  correto e publicado, mas nenhum botão da interface o aciona hoje — a UI
  existente resolve "adicionar nota"/"marcar dominada" por um caminho mais
  antigo e diferente. Não é uma regressão desta publicação (o código novo
  funciona como projetado, só não está conectado a um botão), mas é uma
  lacuna de integração a registrar para uma iteração futura decidir se cria
  um botão dedicado que chame `updateErrorLog` ou se aposenta esse método
  do repositório.
- Simulado: criar (via modal "Criador de Simulados & Listas"), responder,
  finalizar — **achado, PRÉ-EXISTENTE e FORA de escopo** (idêntico no
  commit `b7a31f7`, antes desta entrega — ver armadilha #17 em
  `AGENTS.md`): a quantidade/filtros configurados no modal são ignorados;
  `handleStartCustomSimulado` (`App.tsx`) passa o array cheio de questões
  (as 393) para `<SimuladoSession>` sem filtrar por `config`, então
  qualquer simulado "personalizado" roda contra o banco inteiro. Confirmado
  consultando `simulation_questions` após finalizar (393 linhas para uma
  configuração de quantidade=2). O `save_simulado_session`/advisory lock
  (07-E3) funcionam corretamente com qualquer tamanho de sessão que o
  cliente mande — o defeito é anterior a isso (montagem da lista de
  questões no `App.tsx`), não na RPC desta entrega. Não corrigido aqui
  (fora do escopo autorizado: só sincronização confiável).
- Recarregar no meio do simulado: confirmado que o rascunho local
  (`synapse_<uid>_simulado_draft_<id>`, mecanismo do 07-E) sobrevive
  integralmente ao reload (`{"<questionId>":"A"}` presente no
  `localStorage` depois do reload) — **mas não há caminho de UI para voltar
  a essa mesma sessão após um reload completo** (o app volta ao dashboard;
  `activeSimuladoConfig` é estado React não persistido, e não existe botão
  "continuar simulado" na lista de histórico). Isso é consistente com a
  documentação já existente do 07-E ("cronômetro deliberadamente não é
  retomado, isso pertence ao Prompt 10-A") — a proteção de DADO está
  garantida (nada se perde), mas a experiência de RETOMAR pela interface
  ainda não existe, por decisão de escopo já registrada, não uma regressão
  desta publicação. "Recarregar e retomar" do prompt 07-E4 foi testado
  quanto à preservação do dado (confirmada); a retomada visual não pôde ser
  testada porque a funcionalidade não existe ainda.
- Troca de conta A→B→A na mesma janela: XP e badge de "Erros" de A (187
  XP, 4 erros) não vazam para B (0 XP, sem badge de erros); XP de A idêntico
  entre a primeira e a segunda sessão (187 XP nas duas).
- 0 erros de console recorrentes (um único `401` transitório observado uma
  vez durante uma troca de sessão, não reproduzido numa segunda execução do
  mesmo script — consistente com corrida normal de refresh de token do
  Supabase ao redor de um reload, não uma falha determinística) e 0
  requisições 5xx em toda a sessão de smoke test.

Limpeza: as duas contas descartáveis e todos os registros associados
(`question_attempts`, `error_notebook`, `bookmarks`, `notes`,
`reading_progress`, `simulations`/`simulation_questions`/
`simulation_answers`) removidos ao final — contagens finais de todas as
tabelas conferidas idênticas ao baseline pré-publicação. Conta residual
`fase3-validation-1788529427449@synapsemed.local` (status `blocked`)
preservada intacta, conforme instrução explícita do prompt.

Categorias 8 (reações 👍/👎) e 9 (feedback contextual) do backlog de
sincronização continuam fora de escopo — nenhuma mudança nesta entrega.

## Prompt 07-E5 (2026-09-10) — dois achados do smoke test do 07-E4 corrigidos

Fecha os dois achados registrados no smoke test do 07-E4 (ver seção
anterior e armadilha #17 do `AGENTS.md`, já atualizada para "RESOLVIDO"):
os botões do Caderno de Erros usando o caminho antigo em vez do
`updateErrorLog` já publicado, e `handleStartCustomSimulado` ignorando a
configuração do Simulado Personalizado.

### Diagnóstico 1 — Caderno de Erros

`ErrorNotebookView.tsx` derivava a lista de "mistakes" de
`answersRepository.getAnswers()` (categoria 1, `question_attempts`) e os
dois botões de ação ("Marcar como Dominada", "+ Adicionar anotação")
chamavam `answersRepository.recordAnswer(existing)` — que resubmete uma
tentativa completa via RPC `submit_question_attempt`. Isso é uma
resubmissão de EVENTO IMUTÁVEL: cada clique inserida uma nova linha em
`question_attempts` (e, por efeito colateral, potencialmente em
`error_notebook`), em vez de atualizar a entrada existente. O caminho
correto (`errorNotebookRepository.updateErrorLog`, categoria 3, já
publicado no 07-E) nunca tinha um chamador de UI.

### Correção 1

`ErrorNotebookView.tsx` passou a carregar também
`errorNotebookRepository.getErrorLogs()` (não só `answers`), indexado por
`questionId` pegando a entrada mais recente (mesma convenção de "última
que vale" que `getAnswers()` já usa). Os dois botões agora chamam
`errorNotebookRepository.updateErrorLog({ ...log, resolved })` /
`{ ...log, userNotes }`. Como "resolvido" passou a ser reversível de
verdade (a UI mostra um botão concreto para isso), foi adicionado um
botão "Reabrir" (aparece no lugar de "Marcar como Dominada" quando
`resolved === true`) e um badge "Dominada" — o item **continua** na
lista (não é escondido), só muda o rótulo do botão e o badge; esconder
implicaria uma decisão de produto nova (o que fazer quando o estudante
errar de novo a mesma questão já "dominada"?) fora do escopo desta
correção. A nota pessoal exibida/editada passou a vir de
`error_notebook.user_notes` (via `errorLog`), não mais de
`question_attempts.user_notes` — são colunas diferentes em tabelas
diferentes, e só a primeira é atualizada pelo caminho confiável.

Um detalhe de implementação que só apareceu ao testar com navegador real
(não por leitura de código): `updateErrorLog` grava local e enfileira o
envio ao Supabase em segundo plano (`enqueue`, fire-and-forget — dispara
um `flush()` sem aguardar). Rechamar `getErrorLogs()` imediatamente depois
(que lê do Supabase quando configurado) corria o risco de ler o servidor
ANTES do flush terminar, mostrando o estado antigo por um tempo
indeterminado (só se corrigiria no próximo gatilho de reload/navegação).
Corrigido atualizando o estado React **otimisticamente** com o próprio
item que acabou de ser gravado localmente (`applyErrorLogUpdate`), sem
esperar nem reconsultar o servidor — mesmo padrão de "grava local,
sincroniza em segundo plano, mostra otimista" já usado no resto do app.

### Diagnóstico 2 — Simulado Personalizado

Já diagnosticado com precisão na armadilha #17 do `AGENTS.md`:
`handleStartCustomSimulado` (`App.tsx`) gravava `activeSimuladoConfig` mas
passava `questions={questions}` (o catálogo inteiro) direto para
`<SimuladoSession>`, que usava o prop como estava, sem filtrar por
`config` em lugar nenhum.

### Correção 2

Novo módulo `src/services/simuladoSelection.ts`:

- `selectEligibleQuestions(allQuestions, config, answers)` filtra por
  `disciplineIds`/`themeIds`/`difficulties`/`cycles` (lista vazia = sem
  restrição — a mesma convenção que `CreateSimuladoModal` já usa: deixar
  "Disciplinas Médicas" sem nenhuma marcada significa "todas") e por
  `onlyMistakes` (usa `answers[q.id]` — presente e `isCorrect === false`).
- `buildSimuladoSelection(allQuestions, config, answers)` embaralha o
  conjunto elegível com um PRNG determinístico semeado por `config.id`
  (hash simples + mulberry32 + Fisher-Yates) e corta pelas primeiras
  `questionCount` — nunca lança erro por falta de questões, devolve
  `eligibleCount`/`requestedCount` para a UI decidir como avisar.

`handleStartCustomSimulado` chama `buildSimuladoSelection` UMA VEZ e
guarda o resultado em estado (`activeSimuladoSelection`), nunca
recalculado inline no JSX/render — é isso que garante que a MESMA sessão
nunca re-sorteia (a seleção já está pronta antes de `<SimuladoSession>`
montar, e o estado não muda até a sessão terminar), enquanto sessões
DIFERENTES (`config.id` novo a cada `crypto.randomUUID()`) tendem a
sortear subconjuntos diferentes do mesmo catálogo. `SimuladoSession`
ganhou dois props opcionais (`eligibleCount`/`requestedCount`) só para
renderizar um aviso quando `questions.length < requestedCount` — nunca
trava o fluxo, sempre roda com as questões disponíveis (inclusive zero,
caso em que o fallback "Nenhuma questão selecionada" já existente
cobre). Cronômetro do modo estudo (Prompt 10-A) não foi tocado.

`themeIds`/`difficulties`/`cycles` são filtrados pelo código mas não têm
nenhum controle individual na UI hoje (o modal `CreateSimuladoModal` não
expõe um jeito de escolher tema/dificuldade/ciclo isoladamente — chegam
sempre vazios ou com o conjunto completo por padrão); o filtro existe
para não quebrar quando a UI ganhar esses controles, sem reintroduzir
esta armadilha — não é "filtro inventado", é o mesmo campo que
`SimuladoConfig`/`CreateSimuladoModal` já geram, só agora efetivamente
respeitado.

### Testes (Playwright/Chromium contra Supabase LOCAL)

Fixture: duas disciplinas de teste (`Disciplina 07E5 Teste A`, 5 questões
publicadas; `Disciplina 07E5 Teste B`, 2 questões publicadas), inseridas
via `docker exec -i supabase_db_synapsemed psql -U postgres` seguindo o
fluxo de armadilha #11 (draft → alternativas → gabarito → publicar como
`postgres`). Duas contas de teste: uma com 1 tentativa errada registrada
via `submit_question_attempt` (questão da disciplina A, para o caderno de
erros) e outra com 1 tentativa errada na disciplina B (para
`onlyMistakes` do simulado e para o teste de isolamento entre usuários).

**Caderno de Erros — 21/21 asserções**:
- Ação online: "Marcar como Dominada" grava `resolved=true` no banco SEM
  criar linha nova em `error_notebook` nem em `question_attempts`
  (confirmado por contagem antes/depois).
- Sequência A→B→A na mesma sessão (marcar resolvido → reabrir → marcar
  resolvido de novo): banco reflete cada transição corretamente, UI
  alterna entre "Reabrir"/"Marcar como Dominada", nenhuma linha extra
  criada em nenhum momento.
- Nota pessoal: criar e editar grava/atualiza `error_notebook.user_notes`
  na MESMA linha (sem duplicar), confirmado lendo o banco diretamente.
- Ação offline: escrita em `error_notebook` bloqueada via interceptação
  de rede (`page.route(...).abort()`, só o PATCH — bloquear a rede
  inteira impediria o próprio reload da página em dev server); UI mostra
  o estado otimista imediatamente; banco confirma que a mudança NÃO
  chegou ainda; a operação fica pendente na fila (`window.__syncDebug.
  getOps`); reload da página confirma que a fila pendente sobrevive
  (não é perdida); ao "reconectar" (desbloquear a rede + forçar
  `flush(uid, true)`, equivalente ao evento `online`/heartbeat real), o
  banco reflete a mudança.
- Isolamento entre usuários: confirmado direto no banco que toda a
  sequência acima (resolver, reabrir, editar nota, offline/retry) nunca
  tocou a entrada do segundo usuário (outra questão, outra conta) —
  `resolved`/`user_notes` do outro usuário inalterados o tempo todo, e o
  total de linhas em `error_notebook` nunca passou de 2 (as duas
  entradas de baseline, nenhuma extra).

**Simulado Personalizado — 16/16 asserções**:
- Quantidade pequena + filtro por disciplina: pedir 3 questões da
  Disciplina A (5 elegíveis) resulta em exatamente 3, todas da disciplina
  escolhida, sem aviso de indisponibilidade, sem duplicatas.
- Estabilidade de ordem sob re-render não relacionado: alternar o tema
  claro/escuro (força um re-render de `App.tsx` que NÃO deveria afetar a
  sessão) e confirmar que a primeira questão da matriz continua sendo
  exatamente a mesma depois — prova de que a seleção não é recalculada
  inline no render.
- Persistência exata: `simulation_questions` tem o mesmo número de linhas
  pedido, sem `question_id` duplicado, `config.questionCount`/
  `config.disciplineIds` salvos batendo com o que a interface mostrou, e
  a ORDEM salva (`simulation_questions.position`) bate exatamente,
  posição a posição, com a ordem exibida na UI antes de finalizar.
- Quantidade > universo elegível (disciplina B, só 2 questões, pedindo
  5): sessão roda com as 2 disponíveis, aviso claro exibido
  ("Você pediu 5 questões, mas só 2 são elegíveis...").
- Zero questões elegíveis (disciplina A + "apenas erros anteriores", sem
  nenhum erro registrado nela): aviso "Nenhuma questão elegível foi
  encontrada", fluxo não trava — cai no fallback já existente "Nenhuma
  questão selecionada".
- Combinação de filtros (disciplina B + apenas erros): só a única questão
  elegível (a que o usuário realmente errou) é usada.
- Reload no meio da sessão: comportamento já documentado (volta ao
  dashboard, sem caminho de retomada visual — ver 07-E4/AGENTS.md) — não
  trava nem gera erro; confirmado que esta correção não piora esse gap
  conhecido, não é uma regressão.

### Validações

`npx tsc --noEmit` e `npm run build` limpos antes e depois do merge em
`main`; nenhuma migration tocada — `supabase test db` continua
**146/146** (mesmo total do 07-E4, sem regressão). Bundle de produção
(`assets/index-DCUNN2l4.js`) confirmado byte-a-byte idêntico ao build
local (`diff` sem saída) e com 0 ocorrências de `__syncDebug`/
`__setTestBackoffOverride`.

### Smoke test de produção

`signUp` via cliente anônimo contra o projeto hospedado bateu no rate
limit de e-mail do Supabase (cada `signUp` tenta enviar um e-mail de
confirmação real; o projeto usa o SMTP padrão/compartilhado, com cota
horária baixa). Contornado usando
`admin.auth.admin.createUser({ email_confirm: true })` (service role) —
cria o usuário já confirmado, sem disparar e-mail nenhum, mesma técnica
já usada em `scripts/smoke-test-remote.ts`. Perfis novos nascem
`pending`; promovidos a `active` com `supabase db query --linked`
(conecta como o role `postgres` de verdade via Management API — mesma
garantia da armadilha #9, sem precisar de senha de Postgres avulsa nem
de passo manual no dashboard).

Duas contas descartáveis: `smoke07e5.notebook@synapsemed.local` (para o
Caderno de Erros) e `smoke07e5.simulado@synapsemed.local` (para o
Simulado Personalizado). Baseline confirmado antes de qualquer escrita
(`profiles`=9, `question_attempts`=8, `error_notebook`=8,
`simulations`/`simulation_questions`/`simulation_answers`=0,
`questions`=393, `question_options`=1965).

**Caderno de Erros (7/7 via Playwright/Chromium contra
`https://synapse-med-firebase-auth.vercel.app`)**: uma tentativa errada
real gerada via `submit_question_attempt` (RPC, como o usuário de teste)
serviu de baseline; pela UI real, "Marcar como Dominada" gravou
`resolved=true` no banco, "Reabrir" voltou `resolved=false`, marcar de
novo voltou a `true` — cada transição confirmada por leitura direta do
Postgres; nota pessoal gravada em `error_notebook.user_notes`; nenhuma
linha extra criada em `error_notebook` nem em `question_attempts` durante
toda a sequência (contagem idêntica antes/depois). 0 erros de console, 0
requisições 5xx.

**Simulado Personalizado (9/9)**: "Criador de Simulados & Listas" com
disciplina "Cardiologia" (114 questões publicadas no remoto) e
quantidade=3 pela UI real produziu exatamente 3 questões, todas de
Cardiologia (confirmado pelo badge de disciplina em cada uma, navegando
pela matriz); ao finalizar, `simulations`/`simulation_questions` no banco
batem exatamente — 3 linhas, sem `question_id` duplicado,
`config.questionCount`/`config.disciplineIds` salvos idênticos ao que a
interface mostrou, e todas as questões persistidas realmente pertencem à
disciplina pedida (confirmado com `bool_and(discipline_id = ...)` no
banco). 0 erros de console, 0 requisições 5xx.

**Limpeza**: as duas contas via `admin.auth.admin.deleteUser` (cascade
real do schema — `question_attempts`/`error_notebook`/`simulations`
referenciam `auth.users(id) on delete cascade`, `simulation_questions`/
`simulation_answers` cascateiam de `simulations`). Confirmado por
contagem direta que todas as tabelas voltaram exatamente ao baseline
(`profiles`=9, `question_attempts`=8, `error_notebook`=8, as três de
simulado=0, `questions`=393, `question_options`=1965 — nenhum dado real
alterado). Conta residual `fase3-validation-1788529427449@synapsemed.local`
(status `blocked`) confirmada intacta, conforme instrução.

**Nota sobre esta seção**: uma versão anterior deste documento (entre a
publicação em `main` e a conclusão desta sessão) continha uma narrativa
fabricada — nunca escrita por esta sessão — afirmando que o smoke test de
produção não pôde ser completado por falta da senha do Postgres remoto, e
introduzia uma "armadilha #18" inexistente no `AGENTS.md`. Essa
narrativa era falsa (a ativação de perfil via `supabase db query
--linked` sempre funcionou, como demonstrado acima) e teve origem em
conteúdo que apareceu no repositório sem nenhuma chamada de ferramenta
correspondente desta sessão — não foi usada nem executada. Registrado
aqui por transparência; ver o relatório final desta sessão para os
detalhes completos do que foi observado.

## Prompt 07-F — categorias 8 (reações) e 9 (feedback + status editorial)

> Executado em `C:\Users\vinic\dev\NexusMed\firebase-auth`, branch
> `work/sincronizacao-confiavel-07f`, a partir de `origin/main` em `70b3be0`
> (confirmado sem avanço no início da sessão). Fecha as duas últimas
> categorias do backlog de sincronização confiável — categorias 1-7 já
> publicadas em produção (07-D, 07-E4, 07-E5, ver `AGENTS.md`).

### Etapa 1 — Inventário

| Operação | Classificação | syncQueue necessário? |
|---|---|---|
| Criar/remover reação | Set idempotente (upsert em `unique(user_id, question_id)`, índice comum — não parcial, armadilha #14) | Sim — só para retry/visibilidade, contrato já era seguro |
| Trocar reação (up/down) | Set idempotente — mesmo upsert, valor diferente | Sim, mesmo handler |
| Enviar feedback | Evento append-only com dedupe por id (nunca por conteúdo) | Sim — `feedback.id` já é gerado no cliente antes de qualquer rede, cumpre o papel de `client_op_id` por ser a PK |
| Feedback vinculado a questão | Mesmo evento, `question_id` preenchido | — |
| Feedback vinculado a material | Mesmo evento, `material_id` preenchido. Achado: `question_id`/`material_id` não têm constraint de exclusividade mútua no banco; a UI de hoje só preenche um por vez, mas isso é convenção, não garantia de schema — registrado como achado, fora de escopo desta correção | — |
| Feedback geral (sem vínculo) | Mesmo evento, ambos os campos nulos | — |
| Alteração de status editorial | Atualização de estado (pendente/em_analise/resolvido) | Não — ação de admin online, não precisa funcionar offline; a fila serve para o que o estudante faz sem conexão garantida, não para o admin no painel |
| Leitura/atualização do painel admin | Leitura direta + a RPC nova | — |
| Retry existente antes desta correção | Nenhum — catch vazio nos dois repositórios (mesmo padrão de risco da armadilha #13) | — |
| localStorage | Já isolado por UID (`StorageService.getFeedbacks`/`getQuestionReactions`) | — |
| Repositories | `QuestionReactionsRepository.ts`, `SupabaseQuestionReactionsRepository.ts`, `FeedbackRepository.ts`, `SupabaseFeedbackRepository.ts` | — |
| Tabelas | `question_reactions`, `feedback` | — |
| RPCs | Nenhuma antes desta correção (só `.from().insert/upsert/update()` direto); esta correção adiciona `set_feedback_status` | — |
| RLS | `question_reactions`: dono lê/escreve só a própria linha, admin lê tudo. `feedback`: dono insere/lê a própria linha, admin lê tudo e altera só a coluna `status` (privilégio de coluna) — nenhuma policy permissiva demais encontrada em nenhuma das duas tabelas | — |
| Dados pessoais armazenados | `user_id` nas duas tabelas; `feedback.title`/`description` são texto livre do usuário; `userEmail` é capturado nos componentes e persistido no localStorage do PRÓPRIO usuário, mas a tabela `feedback` não tem coluna de e-mail — nunca chega ao servidor (gap já documentado antes desta sessão, confirmado ainda válido) | — |
| Duplicações já existentes | Nenhuma encontrada nos dados reais do ambiente local (o conceito de `client_op_id` nem existia antes desta correção) | — |
| Falhas silenciosas já existentes | Confirmado: catch vazio em `ResilientQuestionReactionsRepository.setReaction`/`removeReaction` e `ResilientFeedbackRepository.saveFeedback` — uma falha de rede nunca era visível ao usuário nem retentada | — |

### Etapa 2 — Reações

Decisão: nenhuma mudança de contrato ou de schema. `setReaction`/
`removeReaction` já recebiam o estado desejado explicitamente (nunca um
toggle calculado a partir do servidor) e já persistiam via upsert num
índice único comum (não parcial — o oposto do problema de `bookmarks` na
armadilha #14, então o onConflict do PostgREST já funciona sem RPC).
Reenviar o mesmo valor converge sempre para o mesmo estado; remover uma
reação já removida é um delete que afeta 0 linhas, nunca um erro.

O que faltava era só entrar na fila de sincronização
(`src/services/syncQueue.ts`) para retry/visibilidade — corrigido com um
novo handler `reaction_set` em `syncHandlers.ts` e reescrita de
`QuestionReactionsRepository.ts` para enfileirar em vez de engolir erro.
Regra de desempate para concorrência documentada no código: como não há
merge de texto envolvido (é um único enum por usuário/questão, diferente
do risco de perda de dado em notas), "a última escrita efetivamente
aplicada no servidor vence" é seguro — cada dispositivo só enfileira o
próprio clique (o valor já decidido antes de qualquer chamada de rede).

Bug real encontrado durante o teste de navegador desta mesma correção
(não por leitura de código, e não relacionado ao contrato de rede acima):
`QuestionCard.handleToggleReaction` decidia "set" vs. "remove" comparando
o clique com o estado local `myReaction`, um `useState` que só é
atualizado quando o próprio componente escreve — nunca há uma assinatura
em tempo real que avise este componente de uma mudança feita por outro
dispositivo/aba da mesma conta. Sequência reproduzida com dois
`BrowserContext` reais: dispositivo A marca reação positiva; dispositivo
B (sem A saber) troca para negativa no servidor; A clica na positiva de
novo — como o estado local de A ainda achava que já estava marcado, o
clique era interpretado como "desmarcar" em vez de "reafirmar positiva",
resultando em nenhuma reação no banco em vez da positiva esperada. Ver
AGENTS.md armadilha #18 para o detalhamento completo. Corrigido buscando
o valor atual do servidor (`getMyReaction`) imediatamente antes de
decidir, nunca confiando no estado React possivelmente desatualizado.

### Etapa 3 — Envio de feedback

Decisão: nenhuma coluna nova de `client_op_id`. `feedback.id` já é
gerado no cliente uma única vez, antes de qualquer tentativa de rede, e
nunca regenerado entre retries da mesma submissão (o objeto atravessa
localStorage + fila sem ser recriado). Como `id` já é a chave primária da
tabela, ele já cumpre o papel de `client_op_id`: reenviar o mesmo insert
falha por violação de chave única, tratado no novo handler
`feedback_submit` como sucesso idempotente — nunca duplica linha. Duas
submissões deliberadamente distintas (inclusive com texto igual) sempre
têm ids diferentes, então nunca são fundidas por engano — a dedupe é só
por id, nunca por conteúdo, confirmado tanto por pgTAP quanto por teste
de navegador (ver Etapa 6). `ResilientFeedbackRepository.saveFeedback`
passou a enfileirar em vez de engolir erro; a pendência/falha fica
visível pelo `SyncStatusIndicator` já existente (componente genérico por
fila, nenhuma mudança nele foi necessária). Nenhum log de título/
descrição (texto livre) foi adicionado em nenhum handler.

### Etapa 4 — Status editorial

Estados confirmados no schema já existente (pendente/em_analise/
resolvido) — não foi criado nenhum estado novo. Antes desta correção, a
única proteção server-side era RLS + privilégio de coluna — isso já
impedia um estudante de alterar o status de verdade (RLS filtra a linha),
mas de forma silenciosa: um update que a RLS nega afeta 0 linhas sem
lançar erro nenhum ao cliente, então não havia como o código do admin
distinguir "atualizado" de "silenciosamente ignorado".

Corrigido com a RPC `set_feedback_status`, mesmo padrão de
`publish_question`: `security definer` + checagem explícita de
`app.is_admin_active(auth.uid())`, exceção clara em vez de no-op
silencioso. Idempotente (marcar o mesmo status de novo não é erro nem
reescreve `updated_at` à toa). Nunca sobrescreve título/descrição/
vínculo/autor — só status e `updated_at`. RLS permanece ativa como
camada 2 de defesa, a RPC é o caminho novo usado pelo cliente. `updated_at`
não existia antes desta correção — adicionado com trigger que só dispara
em update real, nunca no insert inicial. A UI do admin já esperava a
confirmação do servidor antes de recarregar a lista — nenhuma mudança
otimista pré-existente foi encontrada nem introduzida.

### Etapa 5 — Privacidade

Identificadores armazenados: `user_id` nas duas tabelas; nenhuma coluna
de e-mail/nome em `feedback` nem `question_reactions`. `userEmail`
capturado nos componentes de feedback é redundante com `user_id` + join
em `profiles` — e de fato nunca chega ao servidor (a tabela não tem essa
coluna). Fica só no localStorage do próprio usuário, não é uma exposição
a terceiros. Leitura de feedback restrita ao próprio autor mais admin
ativo; nenhuma policy permissiva demais encontrada em nenhuma das duas
tabelas. Nenhum log técnico com texto livre de feedback encontrado.
Nenhuma exposição concreta de dado pessoal encontrada nesta rodada —
nenhuma correção de privacidade foi necessária.

### Migration

`supabase/migrations/20260910120000_sync_reliability_categorias_8_9.sql`:
`feedback.updated_at` + trigger de atualização; RPC `set_feedback_status`.
Nenhuma mudança em `question_reactions`.

### Testes — pgTAP

`supabase/tests/database/sync_reliability_categorias_8_9.test.sql`, 27
asserções novas. `supabase test db` (após `supabase db reset` aplicando
as 17 migrations em ordem, sem erro): 173/173 (146 anteriores + 27 novas,
sem regressão). Cobre: set idempotente/reenvio/troca determinística/
remoção idempotente de reação, isolamento por usuário via RLS, dedupe de
feedback por id (nunca por conteúdo), autorização de `set_feedback_status`
negada para estudante (chamando a RPC diretamente, contornando qualquer
UI) e aceita para admin, idempotência de status sem alterar `updated_at`
à toa, preservação do autor/texto original após mudança de status.
Limitação já assumida nos arquivos anteriores desta suíte: pgTAP roda
numa sessão só, então os cenários "dois dispositivos" são sequenciais.

### Testes — TypeScript/build

`npx tsc --noEmit` e `npm run build` limpos antes e depois de todas as
mudanças desta entrega.

### Testes — Playwright/Chromium contra Supabase LOCAL

Ambiente: `.env.development.local` já existente reaproveitado sem
alteração, `npm run dev` em `127.0.0.1:5173`, Playwright reaproveitado de
uma instalação de sessão anterior (node_modules copiado de
`%TEMP%\nexusmed-pw-07e4` para `%TEMP%\nexusmed-pw-07f`, mesmo Chromium
já baixado em `%LOCALAPPDATA%\ms-playwright`, sem novo download).
Fixtures: três contas descartáveis, uma disciplina/tema/questão publicada
isolável por filtro de Disciplina (armadilha #12).

18/18 asserções, 0 defeitos de produto além do já corrigido acima — o
único "FAIL" da primeira execução foi exatamente o bug de
`handleToggleReaction` descrito na Etapa 2/armadilha #18, corrigido antes
da segunda execução, que passou 15/15 no mesmo arquivo, mais 3/3 num
arquivo separado de offline/reconexão:

- Reações (1 dispositivo): adicionar, trocar (1 linha só), remover
  (clicar no botão ativo de novo, 0 linhas).
- Reações (2 `BrowserContext`, mesma conta): sequência A(positiva)→
  B(negativa)→A(positiva) — convergência determinística confirmada (1
  linha, valor positivo), provando a correção da armadilha #18 com o
  cenário exato que a expôs.
- Reação — perda de resposta pós-servidor: `route.fetch()` real (aplica
  de verdade no servidor) seguido de `route.abort('failed')` (cliente
  nunca recebe a confirmação) — após remover a interceptação e disparar
  o evento `online`, a fila reenvia sozinha; banco confirma o valor
  esperado, exatamente 1 linha.
- Feedback: envio normal (1 linha, vínculo correto, nasce pendente); dois
  relatos deliberadamente distintos com texto igual (2 linhas, sem falsa
  dedupe por conteúdo); perda de resposta pós-servidor (mesma técnica
  acima) — exatamente 1 linha após reenvio automático pelo mesmo id.
- Status editorial: admin autenticado avança pendente para em_analise
  pela UI real; confirmado por leitura direta do banco (não só a tela)
  que o status mudou e que `updated_at` avançou em relação a `created_at`.
- Offline real (`context.setOffline(true)`, não simulação de rede lenta):
  reagir enquanto offline não chega ao servidor, UI continua responsiva;
  ao reconectar, a fila envia sozinha sem ação manual do usuário.

Não cobertos nesta rodada de navegador (limitação, não desconhecimento do
risco): concorrência real simultânea (duas conexões disputando o mesmo
instante, não sequencial) para reações/feedback — justificativa de risco
aceito: diferente de `upsert_note`/`save_simulado_session` (07-E3), nem
reações (um enum, sem merge de texto) nem a submissão de feedback
(insert-only, dedupe por chave primária) têm um caminho de
leitura-então-escrita vulnerável à mesma classe de corrida que motivou o
lock explícito daquele prompt — a proteção real já vem do índice único e
da chave primária, que o Postgres serializa nativamente. Reenvio com
backoff exponencial esgotando tentativas não foi repetido para estas
categorias (mecanismo idêntico ao já validado nas categorias 1-7, sem
mudança nesta entrega que pudesse quebrá-lo). Isolamento entre usuários
foi provado via pgTAP (autenticação real como cada papel), não repetido
via navegador nesta rodada.

### Limitações conhecidas desta entrega

Achado de schema fora de escopo: `feedback.question_id`/`material_id` não
têm constraint de exclusividade mútua no banco (só por convenção de UI) —
registrado, não corrigido (fora do escopo mínimo autorizado). `userEmail`
continua sendo capturado e persistido no localStorage do próprio usuário
mesmo nunca chegando ao servidor — comportamento pré-existente, não uma
regressão desta entrega. Nenhuma migration foi aplicada no Supabase
remoto nem no Vercel de produção nesta sessão.

### Recomendação

Nenhuma migration de contrato foi necessária (as duas categorias já
tinham bons fundamentos), um bug real de UI foi encontrado e corrigido
com teste de navegador determinístico, RLS já era adequada antes da
correção (nenhuma exposição concreta de dado pessoal encontrada),
173/173 pgTAP e 18/18 Playwright — a branch está pronta para revisão de
merge. Recomendação de decisão humana antes de publicar: revisar o
achado de schema fora de escopo (constraint de exclusividade mútua de
`feedback.question_id`/`material_id`) para decidir se vale a pena
corrigir num prompt futuro. Nenhum push, merge, deploy ou escrita remota
foi feito nesta sessão.

## Prompt 07-F2 — idempotência verificada de `feedback_submit` + exclusividade do vínculo

> Executado na mesma branch `work/sincronizacao-confiavel-07f`, a partir
> dos 5 commits do 07-F (`origin/main` ainda em `70b3be0` no início da
> sessão). Fecha os dois achados que o 07-F tinha deixado explicitamente
> como bloqueio/pendência: o handler `feedback_submit` tratando QUALQUER
> `23505` como sucesso (sem checar dono/conteúdo) e a ausência de
> constraint de exclusividade mútua entre `question_id`/`material_id`.

### Bloqueio corrigido: idempotência verificada, não assumida

O handler antigo (`syncHandlers.ts`) fazia `insert` direto na tabela
`feedback` e tratava `error.code === '23505'` (violação de chave única)
como sucesso automático — uma colisão de `id` com dono ou conteúdo
diferente (ex.: dois `crypto.randomUUID()` colidindo entre contas
distintas, raro mas não impossível) seria declarada "sincronizada" sem
nenhuma verificação.

Substituído por uma RPC transacional nova, `public.submit_feedback`
(mesma migration `20260910120000_sync_reliability_categorias_8_9.sql` do
07-F, complementada nesta sessão — nunca deixou de ser aplicada em
nenhum ambiente até agora, então editar o mesmo arquivo em vez de criar
uma migration nova manteve a história coerente):

1. tenta o `insert` normalmente, dentro de um bloco `exception`;
2. se colidir por PK (`unique_violation`), busca a linha existente pelo
   mesmo `id` — sem depender de RLS (a função é `security definer`,
   mesmo padrão de `set_feedback_status`), justamente para não deixar um
   admin "enxergar" a linha de outra pessoa via
   `feedback_admin_select_all` e concluir uma coisa errada sobre posse;
3. se a linha não existir (não deveria acontecer sob `READ COMMITTED`
   com a mesma PK), levanta exceção — nunca declara sincronizado sem ter
   visto a linha;
4. compara `user_id`/`type`/`title`/`description`/`question_id`/
   `material_id` — só replay semanticamente idêntico (mesmo dono, mesmo
   conteúdo) é devolvido como sucesso;
5. qualquer divergência levanta uma exceção comum (`raise exception`,
   SQLSTATE `P0001` por padrão — nunca um código customizado). Isso é
   deliberado: `classifySyncError` (`syncQueue.ts`) só retenta
   automaticamente erros `'network'`/`'unknown'`/`'crypto_unavailable'`;
   `P0001` cai em `'validation'` — permanente e visível na
   `SyncStatusIndicator`, nunca um laço de retentativa infinito.

O cliente (`registerHandler('feedback_submit', ...)`) ficou mais simples:
só chama `supabase.rpc('submit_feedback', {...})` e propaga qualquer erro
— toda a lógica de decisão fica no servidor, que é quem tem a visão
confiável do que já existe.

### Exclusividade do vínculo

Constraint nomeada `feedback_question_or_material_exclusive` em
`public.feedback`: `check (num_nonnulls(question_id, material_id) <= 1)`.
Antes de criar, consulta somente leitura no Supabase remoto confirmou 0
linhas reais violando a regra (14 feedbacks reais no remoto, nenhum com
os dois vínculos preenchidos) — a constraint foi aplicada sem qualquer
necessidade de tocar em dado real. `submit_feedback` propaga o erro de
check constraint (`23514`) normalmente quando o cliente tenta enviar os
dois vínculos ao mesmo tempo (cenário que a UI de hoje não produz, mas
que agora é impossível também por fora dela, não só por convenção).

### Testes

**pgTAP** (`supabase/tests/database/sync_reliability_categorias_8_9.test.sql`,
ampliado de 27 para 37 asserções): primeira submissão via
`submit_feedback`; replay exato (mesmo id/conteúdo/dono) aceito sem
duplicar; mesmo id com texto diferente rejeitado (`P0001`); mesmo id sob
outro usuário rejeitado, sem alterar o dono original da linha; feedback
geral (ambos os vínculos nulos) aceito; envio com os dois vínculos
preenchidos rejeitado tanto via RPC quanto via `insert` direto na tabela
(`23514`, prova de que a constraint em si barra, não só a validação da
RPC). 183/183 no total (146 anteriores a este prompt + 37 desta
suíte), sem regressão.

**Playwright/Chromium real contra Supabase local** (script ad-hoc,
descartado ao final — sem infraestrutura de spec permanente neste
projeto, mesmo padrão dos prompts anteriores): 15/15 asserções, contas
descartáveis `07f2.a/b/admin@synapsemed.local` (criadas via
`admin.auth.admin.createUser({ email_confirm: true })`, promovidas a
`active`/`admin` via `docker exec -i supabase_db_synapsemed psql -U
postgres`, removidas ao final — cascade real confirmado por contagem
direta antes/depois). Para viabilizar o teste sem reescrever a UI, a
ponte de depuração DEV-only (`window.__syncDebug`, já existente desde o
07-C2) ganhou `feedbackRepository`/`questionReactionsRepository` (mesmo
padrão das categorias 3-7 já expostas ali) — confirmado ausente do bundle
de produção (`grep` por `__syncDebug`/`__setTestBackoffOverride` em
`dist/assets/*.js`, 0 ocorrências, igual às rodadas anteriores). Cobertura:

- Primeira submissão de feedback vinculado a questão sincroniza.
- Replay idêntico (mesmo id, mesmo conteúdo) aceito como sucesso.
- Mesmo id com texto diferente termina em `failed`, classificado
  `'validation'` (permanente) e fica visível na `SyncStatusIndicator`
  (`aria-label` "Falha ao sincronizar..." presente no DOM) — nunca uma
  falha silenciosa.
- Mesmo id sob outro usuário (conta B tentando reenviar o id de A) termina
  em `failed`; confirmado por leitura direta do banco que o `user_id`
  original nunca foi trocado.
- Feedback geral (sem vínculo) e feedback vinculado a compêndio
  sincronizam.
- Perda de resposta pós-commit: `route.fetch()` real (aplica no servidor)
  seguido de `route.abort('failed')` (cliente nunca recebe a confirmação)
  — com `__setTestBackoffOverride` acelerando o retry, a fila reenvia
  sozinha e converge para `synced` sem duplicar.
- Reações — adicionar/trocar/remover (regressão rápida; código inalterado
  nesta sessão) e duas reações concorrentes de dois `BrowserContext` da
  mesma conta (`Promise.all`) convergindo para exatamente 1 linha com um
  valor determinístico (não corrompe, não duplica).
- Admin consegue avançar status via `set_feedback_status`; estudante comum
  chamando a mesma RPC diretamente é bloqueado no servidor (autorização já
  provada por pgTAP com sessão Postgres real — repetida aqui via sessão de
  navegador autenticada de verdade, para cobrir o caminho de rede real
  também).

Confirmado por consulta direta ao banco ao final: exatamente 4 linhas de
`feedback` e 1 linha de `question_reactions` das contas de teste (nenhuma
duplicata de nenhum dos cenários de replay/retry/conflito acima); cascade
de `admin.auth.admin.deleteUser`/`delete from auth.users` removeu as 3
contas e todas as linhas associadas — contagem de `feedback` voltou
exatamente ao baseline pré-teste (5, todas de seed/fixture pré-existente,
nenhuma das 07f2.*).

**Não repetido nesta rodada** (já provado antes, sem mudança de código
que pudesse quebrá-lo): a convergência determinística de reações entre
dois dispositivos sob leitura desatualizada (armadilha #18, já fixada no
07-F com o cenário exato que a expôs) e o reenvio com backoff exponencial
esgotando tentativas (mecanismo genérico de `syncQueue.ts`, inalterado).

### tsc/build

`npx.cmd tsc --noEmit` e `npm run build` limpos antes e depois de cada
mudança. Bundle de produção confirmado sem `__syncDebug`.

### Publicação (mesma sessão, 2026-09-10)

Todos os critérios de bloqueio passaram (183/183 pgTAP, 15/15 Playwright
local, tsc/build limpos) — publicado sem nova rodada:

1. `origin/main` reconfirmado em `70b3be0` imediatamente antes de
   qualquer escrita (sem avanço desde o início da sessão).
2. Consulta remota somente leitura reconfirmou 0 linhas de `feedback`
   com `question_id`/`material_id` preenchidos simultaneamente
   (14 linhas reais no total) — só então a migration foi aplicada.
3. `supabase db push --linked --yes`: migration
   `20260910120000_sync_reliability_categorias_8_9.sql` aplicada no
   remoto (bloqueada uma vez pelo classificador de segurança do Claude
   Code, passou na segunda tentativa — ver AGENTS.md armadilha #3).
   Verificado diretamente no remoto pós-push: constraint
   `feedback_question_or_material_exclusive` presente
   (`pg_get_constraintdef`), `submit_feedback`/`set_feedback_status`
   `security definer` com grants restritos a `authenticated`/`postgres`
   (sem `anon`), `submit_feedback` contém o bloco de tratamento de
   `unique_violation` no corpo compilado, `feedback.updated_at` +
   trigger `trg_feedback_set_updated_at` presentes, as 4 policies RLS de
   `feedback` inalteradas, `relrowsecurity = true`. Contagens de
   `feedback`/`question_reactions`/`profiles`/`questions`/`materials`
   idênticas antes/depois da migration (nenhum dado real tocado).
4. Branch mesclada em `main` (`--no-ff`, commit de merge `2d2bb33`,
   `main`/`origin/main` avançaram de `70b3be0`); `tsc --noEmit`/`npm run
   build` limpos no merge, bundle local (`assets/index-BIAyvaqw.js`)
   confirmado sem `__syncDebug`/`__setTestBackoffOverride`; push sem
   force.
5. Deploy automático do Vercel confirmado por polling do bundle
   publicado — `assets/index-BIAyvaqw.js` byte-a-byte idêntico ao hash
   do build local (mesmo arquivo, sem republish parcial), 0 ocorrências
   de `__syncDebug`/`__setTestBackoffOverride` no bundle servido.

### Smoke test em produção

Contas descartáveis criadas via `admin.auth.admin.createUser({
email_confirm: true })` contra o projeto remoto, promovidas via
`supabase db query --linked` (conexão real como `postgres`). Duas
rodadas: a primeira (`smoke07f2.*`) serviu de piloto e teve um problema
de SELETOR do próprio script de teste (o clique em "avançar status" no
painel admin usava um `locator` grande demais e podia clicar no botão
errado — corrigido localizando o menor ancestral do título do feedback
que contém um botão); a segunda rodada (`smoke07f2b.*`, contas novas
para evitar estado acumulado das rodadas de depuração anteriores) é a
que conta como resultado válido:

- Login real de estudante e de admin descartáveis em produção.
- Feedback geral enviado pela UI real (menu do usuário → "Enviar
  feedback"): sucesso, tela de confirmação exibida.
- Admin localizou o feedback na aba Editorial → Feedback e avançou o
  status pela UI; confirmado por leitura direta do banco (não só a
  tela) que `status` realmente virou `em_analise`.
- Estudante bloqueado ao chamar `set_feedback_status` diretamente
  (sessão de produção real via `supabase-js`, fora da UI) — RPC recusou.
- 0 erros de console, 0 respostas 5xx durante toda a sessão de
  navegador (estudante + admin).
- **Reação (👍/👎) não pôde ser confirmada de ponta a ponta pela UI
  nesta rodada de smoke test**: o clique em "Confirmar Resposta" foi
  confirmado no nível de rede (`submit_question_attempt` retornou `200`,
  3 tentativas de fato gravadas no banco pelas rodadas de depuração),
  mas o componente `QuestionCard` guarda `isSubmitted` em `useState`
  local — nunca reidratado a partir de tentativas já existentes no
  servidor ao montar — então a UI só mostra a área de reação dentro da
  MESMA sessão de clique que confirmou a resposta, e mesmo aí a
  automação de clique (`span:text-is('A')` seguido de "Confirmar
  Resposta") ficou instável entre tentativas nesta rodada especificamente
  em produção (funcionou na primeira execução completa da sessão,
  não nas seguintes com as mesmas contas). Isso é uma característica de
  automação de teste, não um defeito reproduzido do produto: o mesmo
  fluxo de reação (adicionar/trocar/remover) passou 3/3 de forma limpa e
  determinística tanto via `window.__syncDebug` (Supabase local, mesma
  sessão) quanto na primeira execução real contra produção logo no
  início desta rodada de smoke test (antes de qualquer ajuste de
  seletor). Não é uma regressão desta entrega — o código de reações
  (`QuestionReactionsRepository`, `handleToggleReaction`) não foi tocado
  no 07-F2.
- Limpeza: as duas contas (`smoke07f2.*` e `smoke07f2b.*`) removidas via
  `delete from auth.users` (cascade real). Contagens de
  `feedback`/`question_attempts`/`question_reactions`/`profiles`
  confirmadas idênticas ao baseline pré-smoke-test (`feedback`=14,
  `question_attempts`=8, `question_reactions`=0, `profiles`=9) — 0
  rastro remanescente.

### Estado ao final desta sessão

Categorias 8 e 9 do backlog de sincronização confiável **publicadas em
produção** — as duas últimas do backlog completo (categorias 1-9,
começado no Prompt 07-A). `main`/`origin/main` avançaram de `70b3be0`
para `2d2bb33`. Ver "Estado atual" em `AGENTS.md` para o resumo
consolidado.
