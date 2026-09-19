# Plano AUD-04 — decompor o `App.tsx`, adotar roteador e camada de dados

> Sessão de planejamento (diretoria), 2026-09-18. Base: `origin/main` @ `582e64c`
> (PR #7 e #8 já mesclados). Item de origem: `AUD-04` em
> `docs/diretoria/BACKLOG-ESTRATEGICO.md` (branch `docs/auditoria-sistemica`,
> ainda não em `main`). Este documento é **plano**, não implementação: nenhum
> código foi alterado. Cada PR abaixo vira um encaminhamento próprio.

## 1. Diagnóstico (números medidos no código)

- `src/App.tsx`: **963 linhas**, **37 `useState`**, **10 `useEffect`**, 1
  `useRef`, 1 `useCallback`, **19 handlers** (16 de navegação); 31 commits no
  arquivo, 28 deles desde 2026-09-03.
- Componentes grandes: `AdminCMSView` 1.856 linhas / 46 `useState`;
  `DashboardView` 1.191 / 7; `CompendiumReader` 1.013 / 13;
  `CompendiumView` 901; `ThematicStudyView` 825; `IntegratedCadernoErros`
  809 / 13.
- **Código morto** (não é importado em lugar nenhum de `src/` ou `tests/`):
  `components/caderno-erros/CadernoErrosView.tsx` (182),
  `components/errors/ErrorNotebookView.tsx` (490),
  `components/navigation/FloatingNavHub.tsx` (417) — 1.089 linhas, duas delas
  com buscas próprias de respostas.
- Dados carregados **uma vez** em `refreshData()` (6 chamadas em paralelo) e
  repassados por props; `refreshData` é repassado como `onUpdate` /
  `onRefreshData` / `onFlashcardUpdated` / `onFinishSession` /
  `onFlashcardCreated` / `onComplete` para **9 consumidores** — é o
  "invalidar cache" artesanal.

### 1.1 Estado do `App.tsx` → quem lê / quem escreve

| Grupo (qtd) | Estados | Lido por | Escrito por |
|---|---|---|---|
| Tela ativa (4) | `activeView`, `navStateRestored`, `libraryLastView`, `dashboardTab` | `Header`, `MobileBottomNav`, padding do `<main>`, switch de telas, 4 efeitos de hash/persistência, `DashboardView` (`initialTab`) | `handleSelectView` + ~15 handlers, `popstate`, restauração pós-reload |
| Contexto de pack / filtros (9) | `selectedPackId`, `invalidSavedPackId`, `scopeCompendiumFor{Questions,Flashcards}`, `packReturnContext`, `filterThemeFor{Questions,Flashcards}`, `filterStatusForQuestions`, `focusQuestionId` | `ThematicStudyView`, `QuestionsView`, `FlashcardsView` | handlers de pack/tema, `handleSelectView`, `handleTrainMistakesUntimed`, `handleReturnTo*` |
| Retorno contextual (4) | `selectedCompendiumId`, `selectedSectionId`, `libraryOrigin`, `flashcardOriginView` | `CompendiumView`, `CompendiumReader`, `FlashcardReviewSession` (onFinish) | `handleOpenCompendium`, `handleReturnToQuestions`, `handleStartSRS` |
| Sessão efêmera (3) | `activeSimuladoConfig`, `activeSimuladoSelection`, `reviewCardsQueue` | `SimuladoSession`, `FlashcardReviewSession` | `handleStartCustomSimulado`, `handleStartSRS` |
| Modais (5) | `isSearchOpen`, `isPlanModalOpen`, `isFeedbackOpen`, `isCreateSimuladoOpen`, `isCreateFlashcardOpen` | os 5 modais | `Header`, `MobileBottomNav`, `QuestionsView`, `SimuladosView`, `FlashcardsView`, Ctrl+K |
| Preferências (3) | `theme`, `plan`, `lastReadingSession` | `Header`, `MobileBottomNav`, `PlanModal`, `CompendiumView`, `QuestionsView` | toggles; `lastReadingSession` relido do `StorageService` a cada troca de tela e em `focus` |
| Migração (1) | `migrationSummary` | `MigrateDataModal` | efeito de troca de usuário |
| **Dados do servidor (8)** | `disciplines`, `themes`, `compendiums`, `questions`, `flashcards`, `answers`, `stats`, `dataLoading` | `disciplines`/`themes`: 10 telas + 2 modais; `compendiums`: 10; `questions`: 5 telas + 2 modais + badges + seleção de simulado; `flashcards`: 5 + badges + fila SRS; `answers`: só `ThematicStudyView`, badges e seleção de simulado; `stats`: `Header` | só `refreshData` |

Leitura: 17 dos 37 estados são **navegação/contexto** (deveriam ser URL),
8 são **cache de servidor** (deveriam ser camada de dados), 5 são modais, 3
são sessão efêmera em memória, 4 preferências/migração.

### 1.2 Onde se buscam dados (fontes de verdade paralelas)

| Dado | Sites de busca em código vivo | Cópias em `useState` |
|---|---|---|
| **Respostas** (`answersRepository.getAnswers`) | `App.refreshData`; `DashboardView` (mount + `reloadData`, que ainda chama `onUpdate` → busca de novo no App); `IntegratedCadernoErros` (mount); `QuestionsView` (mount); `QuestionCard` (mount de **cada** card sem `hydrated` + `checkStreakCelebration` a cada resposta, junto com `getQuestions()` inteiro) — **7 sites em 5 arquivos**, +2 em código morto | **4** (App, Dashboard, CadernoErros integrado, QuestionsView) |
| Progresso de leitura | `DashboardView` ×2, `CompendiumReader` ×2, `CompendiumView`, `ThematicStudyView` | 4 |
| Favoritos | `CompendiumReader`, `CompendiumView`, `QuestionCard`, `QuestionsView` | 4 |
| Caderno de erros | `DashboardView` ×2, `IntegratedCadernoErros` | 2 |
| Materiais/questões/flashcards | só `App.refreshData` (+ `QuestionCard.getQuestions`, `SectionEditor.getSectionVersions`) | 1 |

Consequências concretas já visíveis no código (confirmar com teste antes de
mudar): responder em `QuestionsView` **não** atualiza `answers` do App (a
view não recebe `onUpdate`) — badge de erros do `Header`/`MobileBottomNav`,
`ThematicStudyView` e a seleção "apenas erros" do simulado ficam defasados
até outra ação disparar `refreshData`. `stats` do App é calculado sem
`readingProgress` (`compendiumsReadCount` sempre 0), o do Dashboard com.
`filterStatusForQuestions` nunca é zerado depois de "Treinar erros".

Semântica que **não** pode mudar sem decisão própria:
`ResilientAnswersRepository.getAnswers()` online devolve só o servidor
(`question_attempts`); offline/erro devolve o `localStorage`. Uma resposta
ainda `pending`/`failed` na fila não aparece na leitura online. Isso é
tema de AUD-05 / sincronização, não do AUD-04.

## 2. Decisões recomendadas

### 2.1 Camada de dados: **TanStack Query v5** (`@tanstack/react-query`)

- **Por quê aqui**: o problema nº 1 é deduplicar e invalidar leituras (7
  sites de respostas, 4 cópias). Query resolve exatamente isso (dedup por
  chave, `invalidateQueries` no lugar de `refreshData` repassado por prop),
  sem tocar nos repositórios. ~13 KB gz, zero dependências, padrão que
  qualquer agente de IA conhece bem.
- **Alternativas**: store próprio com `useSyncExternalStore` (0 KB, mas
  reinventa dedup/stale/invalidação e vira mais código para manter);
  Zustand/Redux (resolvem estado de cliente, não cache de servidor); SWR
  (menor, mas invalidação por prefixo e devtools mais fracos).
- **Regras obrigatórias de configuração** (senão regride a fila offline):
  - `networkMode: 'always'` em queries **e** mutations. O padrão `'online'`
    pausa o `queryFn` sem rede → o `Resilient*` nunca chega ao fallback
    local e a tela fica em "carregando" offline.
  - `retry: false` nas queries: o fallback já está no repositório; retry
    só atrasaria a ida ao `localStorage`.
  - **Escritas continuam indo só pelos repositórios / `syncQueue`**
    (`client_op_id`, backoff, estados). `useMutation` no máximo como casca
    fina (`retry: 0`) que chama o repositório e invalida chaves. Nunca
    `persistQueryClient`, nunca mutation com retry/persistência própria —
    seria uma segunda fila sem idempotência.
  - Chaves sempre com `userId` (`['answers', uid]`) e `queryClient.clear()`
    na troca de usuário/logout (isolamento A/B, `storageLogout.test`).
  - `syncQueue.subscribe(uid, …)` invalida as chaves afetadas quando uma
    operação vira `synced`.
  - Paridade primeiro: `staleTime: Infinity` + invalidação explícita e
    `refetchOnWindowFocus: false` no PR de fundação; afrouxar depois, em PR
    próprio.

### 2.2 Roteador: **react-router v7, modo declarativo, `<HashRouter>`**

- **Por quê**: preserva os links atuais **sem redirect** (`#/questions` é a
  rota `/questions` sob `HashRouter`); mantém `React.lazy` como está;
  filtros viram `?tema=&material=&status=&foco=` (elimina ~9 estados e
  torna o contexto de pack sobrevivente ao reload); maior corpus de
  treinamento entre os roteadores → agentes erram menos. Sem mudança no
  `vercel.json` (hash não exige rewrite).
- **Não usar o modo data/framework** (loaders/actions): duplicaria a camada
  de dados e empurraria o gate de acesso para loaders fora do React.
- **TanStack Router**: melhor tipagem de rotas/search params, mas pede
  plugin/codegen ou config verbosa, corpus menor, e para 11 telas o ganho
  não paga a troca. **Manter hash próprio**: 0 KB e funciona, mas já custa
  4 efeitos + `useRef` + lista de permissão manual, e search params/rotas
  aninhadas seriam reinventados.
- **Go/no-go explícito**: o PR 3 (extrair a navegação para um módulo com
  contrato) vem antes. Se, depois dele, a diretoria achar o módulo próprio
  suficiente, os PRs 9–10 podem ser trocados por "search params no hash
  próprio". Orçamento: o chunk inicial não pode crescer mais que **~25 KB
  gz** somando Query + Router (medir com `npm run build` em cada PR).
- **O gate fail-closed fica acima do roteador**: o `<HashRouter>` só monta
  depois de `profile.status === 'active'`. Não vira route guard/loader.

## 3. Sequência de PRs (cada um mergeável sozinho, CI `fast` + `full` verde)

Specs e2e existentes por fluxo: gate → `auth-gates`; histórico/link direto
→ `navegacao-historico`; pack/retorno/reload → `estudo-tematico-22a`; fila
offline → `offline-queue`; resposta/reidratação → `question-answer-rehydration`;
concorrência/SRS/simulado → `concurrencia-13b`; isolamento → `isolation`;
CMS → `import-material`, `provenance-attestation-23b`.

| # | Escopo | Arquivos | Risco | Como testar |
|---|---|---|---|---|
| 1 | **Rede de segurança + remover código morto.** Novo `tests/e2e/specs/rotas-hash.spec.ts`: cada `#/tela` persistida abre a tela certa; `#/errors` abre o caderno; `#/admin` como estudante cai no painel; hash efêmero (`#/simulado-session`) e hash desconhecido após reload caem em `#/dashboard`. Apagar os 3 arquivos mortos. | spec novo; 3 deletes | Baixo | spec novo verde contra `main` atual (documenta o contrato) |
| 2 | **Extrair `AccessGate`** (loading/login/e-mail/pending/`!== 'active'`) e `AppShell`; `App` vira `AuthProvider > AccessGate > AppShell`. Movimento puro. | `App.tsx`, `src/app/AccessGate.tsx` | Médio (gate) | `auth-gates` (5 casos) + teste de componente novo com os 5 status, incluindo valor inesperado |
| 3 | **Extrair navegação** para `src/navigation/` (`routes.ts` tipado com os ids atuais, `useAppNavigation()` com os handlers e os 4 efeitos de hash/persistência). Mesmo mecanismo, só muda de lugar. **Ponto de go/no-go do roteador.** | `App.tsx`, `src/navigation/*` | Médio | `navegacao-historico`, `estudo-tematico-22a`, `rotas-hash`; unit de `routes.ts` (lista de permissão, admin) |
| 4 | **Extrair modais** para `ModalsProvider` + `useModals()` (5 booleans + Ctrl+K). | `App.tsx`, `src/app/Modals.tsx` | Baixo | teste de componente Ctrl+K; smoke e2e |
| 5 | **Fundação TanStack Query**: `QueryClientProvider` com as regras da §2.1, `src/data/queryKeys.ts`, hooks `useCatalog()` (disciplinas/temas/compêndios/questões), `useFlashcards()`, `useAnswers()` sobre os **mesmos** repositórios; App lê dos hooks e continua passando props; `refreshData` vira `invalidateQueries`; clear na troca de usuário; ponte `syncQueue.subscribe` → invalidate. | `package.json`, `main.tsx`/`App.tsx`, `src/data/*` | **Alto** (offline) | `offline-queue`, `isolation`, `question-answer-rehydration`; unit novo: offline (`navigator.onLine=false`, Supabase rejeitando) → `useAnswers` resolve do local sem pausar; config com `networkMode:'always'`/`retry:false` fixada por teste |
| 6 | **Migrar Questões**: `QuestionsView` + `QuestionCard` usam `useAnswers`/`useBookmarks`/`useMyReactions`; fim da busca por card e do `getQuestions()` no streak; gravar resposta invalida `answers`. | `QuestionsView`, `QuestionCard`, `src/data/*` | Alto (hot path) | teste novo **que falha antes**: responder errado em `#/questions` atualiza o badge de erros sem reload; `question-answer-rehydration`, `offline-queue`, `questionCardKeyboardShortcuts.test` |
| 7 | **Migrar Painel/Caderno**: `DashboardView` + `IntegratedCadernoErros` com `useAnswers`/`useReadingProgress`/`useErrorLogs`; remover `reloadData`→`onUpdate`; stats de `Header` e Dashboard da mesma função/entrada. | 2 componentes, `src/data/*` | Médio | `estudo-tematico-22a` (navegação), e2e novo de caderno de erros (criar card a partir de erro) |
| 8 | **Migrar Biblioteca e Estudo Temático**: `CompendiumReader`, `CompendiumView`, `ThematicStudyView` (progresso, favoritos, notas). | 3 componentes | Médio | `concurrencia-13b` (nota/progresso), `estudo-tematico-22a` |
| 9 | **Migrar CMS e sessões**: `AdminCMSView`/`SectionEditor`/`ImportMaterialModal` invalidam `catalog`; `SimuladosView`, `FlashcardsView`, `FlashcardReviewSession`, `SimuladoSession`, `CreateFlashcardModal`, `MigrateDataModal` perdem `onUpdate`. Sem refatorar a UI do CMS. | ~9 componentes | Médio | `import-material`, `provenance-attestation-23b`, `concurrencia-13b` (SRS/simulado) |
| 10 | **Trocar o motor de navegação por react-router v7** (`HashRouter`, mesmas paths; `lazy` preservado; `Navigate replace` para hash desconhecido/efêmero sem estado; `/admin` com guarda de papel; restauração do `localStorage` só quando a URL vem sem hash). Contrato de `useAppNavigation` mantido. | `src/navigation/*`, `AppShell` | Alto | `rotas-hash`, `navegacao-historico`, `estudo-tematico-22a` sem alteração nos specs |
| 11 | **Filtros e retorno na URL**: `scope*/filterTheme*/filterStatus/focusQuestionId/packReturnContext/selectedCompendium/section` → path/search params (`/compendiums/:id?secao=`); sessões efêmeras num `SessionContext` pequeno. Corrige de brinde o `filterStatus` que nunca zera. | `src/navigation/*`, views afetadas | Médio | `estudo-tematico-22a`; e2e novo: link com `?tema=` abre filtrado; "Treinar erros" → menu Questões mostra todas |
| 12 | **Trava para agentes**: regra ESLint `no-restricted-imports` proibindo `src/repositories/*` em `src/components/**` (só `src/data/**` e `src/services/**`); AGENTS.md com a convenção. | `eslint.config.js`, `AGENTS.md` | Baixo | `npm run lint` |

PRs 6–9 são independentes entre si depois do 5 (podem ir em qualquer
ordem), mas todos tocam `App.tsx` em poucas linhas — **serializar o merge**
e rebasear, não abrir em paralelo na mesma árvore. PR 10 exige 3 e 5;
PR 11 exige 10.

## 4. Pré-requisitos e critérios de pronto

**Antes do PR 5** (bloqueante): testes unitários dos repositórios
`Resilient*` (branch `test/repositorios-resilientes-gamificacao`, outra
sessão) mesclados — em especial o fallback de leitura e o caminho
`enqueueAndTry`. Antes do PR 1: nenhum. Coordenar com
`fix/recarga-apos-deploy` (pelo nome, provavelmente mexe nos `lazy()` do
`App.tsx`): mesclar ela antes do PR 2 ou rebasear em cima. Checar também
`chore/lint-acessibilidade-aud-09` e `ci/endurecimento-aud-10` antes do PR
12 (ESLint/CI).

**Critérios por PR**: CI `fast` e `full` verdes; nenhum spec existente
alterado para passar (só adicionados); tamanho do chunk inicial antes/depois
na descrição do PR; preview da Vercel conferido (login, voltar do
navegador, uma resposta offline→online).

**Critérios do AUD-04 inteiro**:
- `App.tsx` ≤ 150 linhas e ≤ 3 `useState`.
- Zero chamadas `*Repository.get*` em `src/components/**` (grep e lint).
- Uma única query por dado por usuário (`answers` buscado 1× por
  invalidação, verificável no Network).
- Todo link `#/tela` existente continua abrindo a mesma tela; code splitting
  preservado (CMS fora do chunk inicial — conferir no `dist/`).
- `offline-queue`, `concurrencia-13b`, `isolation`, `auth-gates` verdes sem
  alteração.

## 5. O que NÃO fazer

- **Big-bang**: nada de "reescrever o App" num PR; roteador e camada de
  dados nunca no mesmo PR.
- Não mexer em `syncQueue.ts`, `syncHandlers.ts` nem na semântica dos
  `Resilient*` dentro do AUD-04. Mudar "o que conta como resposta" (overlay
  de pendentes) é decisão separada (AUD-05).
- Não usar `persistQueryClient`, retry de query, nem mutation com retry ou
  fila própria do TanStack Query.
- Não deixar `networkMode` no padrão `'online'`.
- Não levar o gate de `profiles.status` para loader/route guard nem trocar
  a lista de permissão (`=== 'active'`) por lista de exclusão.
- Não renomear ids de tela nem trocar hash por path (`BrowserRouter`) —
  quebraria links salvos e exigiria rewrite no `vercel.json`.
- Não usar o modo data/framework do react-router, nem SSR.
- Não decompor a UI do `AdminCMSView`/`DashboardView` aqui — só a busca de
  dados; quebrar a UI é item próprio depois.
- Não adicionar Redux/Zustand para estado de UI: URL + 2 contextos pequenos
  bastam.
- Não habilitar `refetchOnWindowFocus`/`staleTime` finito no mesmo PR que
  migra um consumidor.
