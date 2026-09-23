# PROJECT_STATE.md — estado presente verificável (NexusMed/SynapseMed)

> Porta de entrada operacional. Leia isto primeiro, depois
> [`DECISIONS.md`](DECISIONS.md), [`TASKS.md`](TASKS.md),
> [`RUNBOOK.md`](RUNBOOK.md) e [`SESSION_PROTOCOL.md`](SESSION_PROTOCOL.md).
> Caminho crítico de leitura: estes 5 arquivos + `AGENTS.md` (raiz) — alvo de
> até 10 minutos.
>
> Este documento é sobre **fatos verificáveis**, não narrativa. Tudo que não
> pôde ser confirmado por comando/leitura direta está marcado **não
> verificado**. Não presuma que algo é verdade só porque estava documentado
> antes — reconfira.

## Fonte de verdade

- Repositório oficial: `https://github.com/viniciuskato/SynapseMed-firebase-auth.git`, branch `main`.
- `main` tem deploy automático no Vercel a cada push — **nunca trabalhar
  direto em `main`, nunca publicar/mesclar sem autorização explícita da
  diretoria e sem passar pelo gate do** [`RUNBOOK.md`](RUNBOOK.md).
- Chats, memória de qualquer IA e cópias locais soltas **não são fonte de
  verdade** — ver decisão de 2026-09-17 em [`DECISIONS.md`](DECISIONS.md).
- Cópia de trabalho canônica, fora do OneDrive:
  `C:\Users\vinic\dev\NexusMed\firebase-auth`.

## Como reconfirmar o estado antes de qualquer trabalho

```
git fetch origin
git rev-parse origin/main
git log --oneline -10 origin/main
```

Qualquer hash citado neste documento é **baseline histórica de quando foi
escrito**, não valor permanente. Sempre rode o comando acima antes de editar.

## Taxonomia hierárquica de materiais — Fase 1 + 1.5 publicadas (2026-09-22/23)

- **Objetivo**: fundação de banco para materiais em árvore e ligações
  transversais, começando pelo piloto de antibióticos/β-lactâmicos.
- **Estado**: **concluída e publicada** — PR #57 mesclado em `main`
  (`8d1232e`); migrations `20260922120000` e `20260922130000` aplicadas no
  Supabase remoto (junto com uma pendência anterior, `20260921130000`);
  deploy confirmado em produção (bundle carrega o SHA do merge commit, sem
  instrumentação de teste). Schema remoto verificado ponta a ponta por
  leitura direta, não só pela mensagem de sucesso do CLI.
- **Impacto**: `materials` tem pai opcional (mesma disciplina, teto de 8
  níveis), ordem entre irmãos, `nav_short_title` e `taxonomy_kind`. A tabela
  legada `material_dependencies` virou `material_links`
  (`prerequisite`/`related`, um vínculo por par), preservando as 14 linhas
  existentes. Ciclos (árvore e pré-requisitos) bloqueados com guarda `CYCLE`.
  Publicação/despublicação respeitam ancestrais e pré-requisitos, nunca em
  cascata. `save_compendium` grava navegação atomicamente; hash de atestação
  cobre só conteúdo (decisão revisada no mesmo dia — navegação no hash
  invalidava revisões aprovadas de material que ninguém editou). RPCs
  `unpublish_material`/`set_material_position` dedicadas.
- **Revisão ultra (multi-agente)** rodada sobre a branch antes do merge: 2
  achados reais corrigidos (ordem do ancestral bloqueador em
  `publish_material`; contador de `sort_order` misturado entre tipos de link
  em `save_compendium`).
- **Inventário remoto** (somente leitura, antes do merge): zero pares
  bidirecionais em `material_dependencies` (a migration não falhava); só
  9/420 questões (2,1%) têm `material_id` — trava editorial documentada para
  o escopo de "questões por nó", não pendência de código; ~1 MB de
  `material_sections.content` hoje — mantém leitura sob demanda como item de
  Fase 3.
- **Regras completas**: `docs/operacao/standards/taxonomia-materiais.md`.
- **Evidência**: pgTAP 13 arquivos/375 testes; Vitest 22 arquivos/205 testes;
  typecheck limpo; lint 0 erros/5 warnings da baseline; build ok; CI verde
  (fast + full) nas duas rodadas do PR.

## Taxonomia, Fase 2 — bloco "Navegação do conteúdo" no Admin (2026-09-23)

- **Objetivo**: dar ao Admin uma interface estruturada para posicionar
  materiais na árvore e cadastrar `Estude antes`/`Veja também`, substituindo
  o campo de texto livre "Nós de Conexão/Pré-requisitos" (nunca persistido).
- **Estado**: **concluída e publicada** — PR #58 mesclado em `main`
  (`3d126f6`), deploy confirmado em produção (bundle carrega o SHA do merge
  commit, sem instrumentação de teste). CI verde (fast + full) nas duas
  rodadas. **Nenhuma migration nova** — usa `save_compendium` já publicada na
  Fase 1.5.
- **Impacto**: `Compendium` ganha `parentMaterialId`/`treeSortOrder`/
  `navShortTitle`/`taxonomyKind`/`navigationLinks`; `SupabaseMaterialsRepository`
  passa a ler `material_links` e a sempre enviar os campos de navegação ao
  salvar (o formulário do Admin é agora a fonte de verdade — omitir a chave
  faria a RPC preservar o valor anterior, contrato pensado para cliente
  antigo). Utilitário puro novo `src/utils/materialTree.ts` (árvore,
  ancestrais, descendentes, trilha — espelha as travessias do banco, mas só
  para UX; o Postgres continua a autoridade final). Formulário: seletor de
  pai (exclui self/descendente/outra disciplina), ordem entre irmãos, rótulo
  curto, tipo do nó, dois multi-seletores por busca com aviso de rascunho,
  trilha resultante, bloqueio client-side de redundância (ancestral como
  pré-requisito) antes de chamar o servidor.
- **Por desenho, o estudante ainda NÃO recebe a nova navegação** — é a
  condição de parada da Fase 2 no plano técnico (§12); fica para a Fase 3.
- **Evidência local**: Vitest 23 arquivos/218 testes (13 novos em
  `materialTree.test.ts`); typecheck limpo; lint 0 erros/5 warnings da
  baseline; build ok; `git diff --check` limpo.
- **Pendente**: Fase 3 (árvore na biblioteca, breadcrumb no leitor, cartões
  `Aprofunde-se`, caixas `Estude antes`/`Veja também` visíveis ao estudante) —
  ainda não autorizada. Ver `docs/operacao/standards/taxonomia-materiais.md`
  §7 para o que fica desenhado, mas não implementado, antes dela: escopo de
  questões por nó (bloqueado por vinculação editorial) e leitura sob demanda.

## Criar Tema direto na UI do Admin (2026-09-22) — PR #55 mesclado em `main` (`88a0fb7`)

- **Objetivo**: usuário tentou importar um compêndio de Endocardite e o
  catálogo de Cardiologia não tinha tema correspondente; não havia nenhuma
  tela para criar um novo (só `insert` SQL direto, ver precedente
  "Distúrbio Acidobásico"/Nefrologia em `docs/diretoria/registro.md`).
- **Impacto/arquivos**: novo `src/components/admin/CreateThemeModal.tsx`
  (nome, descrição, disciplina, high-yield; bloqueia nome duplicado na
  mesma disciplina; chama `materialsRepository.saveThemes`). Opção "+
  Criar novo tema..." adicionada ao dropdown de Tema em dois pontos:
  formulário manual "Novo Conteúdo/Mecanismo" (`AdminCMSView.tsx`) e wizard
  "Importar material" (`ImportMaterialModal.tsx` — este último mescla o
  tema recém-criado numa cópia local antes do refresh do catálogo global,
  pra já vir selecionável/selecionado sem esperar round-trip).
- **Ambiente tocado**: só frontend. Nenhuma migration nova — a RLS
  `themes_admin_write` (migration `20260903120100`) já liberava escrita
  para admin ativo; a lacuna era 100% de UI (nenhuma tela chamava
  `materialsRepository.saveThemes` antes disso).
- **Risco**: baixo — feature aditiva, sem tocar fluxo existente de leitura
  de temas; validação de nome duplicado por disciplina evita poluir o
  catálogo com temas redundantes por erro de digitação.
- **Evidência**: `tsc --noEmit` limpo; `eslint` limpo nos arquivos tocados;
  `npm run build` OK; `vitest run tests/component/importMaterialModal.test.tsx`
  7/7 (6 pré-existentes + 1 novo cobrindo exatamente o cenário reportado:
  tema do arquivo não encontrado → "+ Criar novo tema..." → preenche nome
  → salva → tema aparece selecionado na pré-visualização → "Salvar
  rascunho" grava com o novo `themeId`).
- **Publicação**: commit isolado (`d2d1358`) construído num worktree à
  parte a partir de `origin/main`, pois o checkout principal tinha ~80
  arquivos de uma reorganização de `management/` de outra sessão já
  staged no mesmo diretório — evitado misturar os dois. PR #55 aberto e
  mesclado pelo usuário; `main`/`origin/main` = `88a0fb7`. Deploy
  automático via Vercel (não confirmado por smoke test nesta sessão).
- **Não verificado nesta entrega**: QA visual manual em produção do botão
  "+ Criar novo tema..." (só testes automatizados + revisão de código).
- **Nota operacional**: esta sessão encontrou o repositório com ~24 outras
  sessões Claude Code no mesmo projeto (todas ociosas no momento da
  checagem) e uma reorganização de repositório em andamento por outra
  sessão concorrente (commit `6a511f8`/`chore(repo): organiza raiz...`,
  seguido de `0ba247c`/`docs(operacao): registra decisão pendente sobre
  work/integracao-estabilizacao-11b`, ambos na mesma branch
  `feat/questoes-markdown-previa-busca-overflow`, sem PR aberto ainda no
  fim desta sessão). Não investigado a fundo nem mesclado por esta sessão
  — fora do escopo do pedido original do usuário.

## Filtro de status (Todas/Publicadas/Não publicadas) em Questões Comentadas (2026-09-21) — commitado (`e379cba`), não publicado

- **Objetivo**: pedido explícito do usuário — a listagem de "Questões
  Comentadas" no Admin misturava questões publicadas e em rascunho, só
  distinguíveis pelo selo de cada card; sem forma de olhar só um dos dois
  grupos.
- **Impacto/arquivos**: `src/components/admin/AdminCMSView.tsx` — novo
  estado persistido `questionStatusFilter` (`'all' | 'published' |
  'unpublished'`, mesmo padrão `usePersistedState` já usado por
  `questionSearch`/`activeTab`); `filteredQuestions` agora combina esse
  filtro com a busca por texto já existente (E lógico: status bate E texto
  bate); três botões novos ("Todas"/"Publicadas"/"Não publicadas", com
  contagem) na barra de controle da aba, ao lado da busca.
  "Não publicadas" agrupa `draft` e `archived` juntos — mesmo agrupamento
  que o selo do card já usa (rótulo "rascunho" para qualquer status
  diferente de `published`). Só a aba de Questões — a de Conteúdos não
  tinha esse pedido e não foi tocada.
- **Ambiente tocado**: só local (código React puro, sem migration nem RPC
  nova — filtra um array já carregado, não faz nenhuma query nova).
- **Evidência**: `tsc --noEmit` e `npm run lint` limpos (mesma baseline de
  5 warnings pré-existentes); `npm run build` OK; novo teste E2E
  `tests/e2e/specs/admin-questoes-filtro-status.spec.ts` (Playwright real
  contra Supabase local, 3 fixtures — 2 publicadas + 1 rascunho — via SQL
  direto) — 1/1, provando que "Publicadas" esconde o rascunho, "Não
  publicadas" esconde as publicadas, "Todas" mostra as três, e o contador
  "N de M questões" acompanha cada filtro; resíduo de fixtures confirmado
  zero após o teste (`select count(*) ... where question_stem like
  'e2e-filtro-status-%'` = 0).
- **Não verificado nesta entrega**: smoke manual em produção (a mudança é
  só frontend, sem risco de schema, mas ainda não foi vista pelo usuário
  na tela real).
- **Publicação**: commitado em `e379cba`, mesma branch local
  `feat/questoes-markdown-previa-busca-overflow`, ainda não mesclada.
  **Estendido para Conteúdos & Mecanismos e para Usuários** na entrega
  seguinte — ver seção abaixo.

## Filtro de status estendido para Conteúdos & Mecanismos e Usuários (2026-09-21) — implementado, não commitado

- **Objetivo**: pedido explícito do usuário, depois de ver o filtro acima
  em Questões Comentadas — "faça isso para conteúdos também" + "veja se
  essa função pode ser útil em outro lugar e já aplique". Mesmo problema
  (itens publicados/rascunho, ou pendente/ativo/bloqueado, misturados numa
  única lista, só distinguíveis pelo selo de cada linha) existia em dois
  outros lugares do Admin.
- **Impacto/arquivos**: `src/components/admin/AdminCMSView.tsx`.
  - **Conteúdos & Mecanismos**: réplica exata do padrão de Questões —
    estado persistido `compStatusFilter` (`usePersistedState`, mesma chave
    `admin_comp_status_filter`), `filteredCompendiums` agora combina esse
    filtro com a busca por texto já existente, três botões
    ("Todos"/"Publicados"/"Não publicados", com contagem) e o contador "N
    de M conteúdos". A aba ganhou também um bloco de cabeçalho (título +
    descrição + os 3 botões de ação) igual ao de Questões — antes a aba
    não tinha esse cabeçalho, só a barra de busca+botões numa linha só.
  - **Usuários**: `profileStatusFilter` (`useState` simples, sem persistir
    — segue o padrão já existente de `feedbackFilter` na aba Feedback, não
    o de busca persistida) com 4 estados (`todos`/`pendentes`/`ativos`/
    `bloqueados`); `filteredProfiles` filtra a lista antes de renderizar;
    segmented control igual ao já usado em Feedback, ao lado do botão
    "Atualizar" no cabeçalho da aba.
  - Flashcards e Feedback não foram tocados: flashcards não têm campo de
    status/publicação (nada a separar); Feedback já tinha esse exato
    padrão de filtro (Todos/Pendentes/Resolvidos) antes desta entrega.
- **Ambiente tocado**: só local (código React puro, sem migration nem RPC
  nova — filtra arrays já carregados, não faz nenhuma query nova).
- **Evidência**: `tsc --noEmit` e `npm run lint` limpos; novo teste E2E
  `tests/e2e/specs/admin-conteudos-filtro-status.spec.ts` (mesmo desenho
  do de Questões — 3 fixtures em `materials` via SQL direto, 2 publicadas +
  1 rascunho) — 1/1 contra Supabase local, rodado 3x seguidas (incluindo
  junto com `admin-questoes-filtro-status.spec.ts` e
  `provenance-attestation-23b.spec.ts`) sem flakiness; resíduo de fixtures
  confirmado zero após o teste. Filtro de Usuários não ganhou E2E dedicado
  nesta entrega (sem fixture de perfil pendente/bloqueado pronta nos
  helpers de teste) — verificado só por leitura do componente
  (`filteredProfiles` e os 4 botões) e pelos gates de tipo/lint.
- **Não verificado nesta entrega**: smoke manual em produção; E2E do
  filtro de Usuários.
- **Publicação**: mesma branch local `feat/questoes-markdown-previa-busca-
  overflow`, ainda não commitada nem mesclada.

## Importação de questões em lote (2026-09-21) — implementado, não publicado

- **Objetivo**: paridade de import entre questões e conteúdo — antes desta
  entrega não existia NENHUM caminho de arquivo para questão (só o
  formulário "Nova Questão"), pedido explícito do usuário depois de tentar
  usar NotebookLM para levantar um lote de Espirometria e não ter para onde
  levar o resultado.
- **Impacto/arquivos**: novo parser puro `src/utils/questionsImport.ts`
  (Markdown, lote com vários `## Questão N` por arquivo — diferente do
  import de conteúdo, que é uma entidade só); nova migration
  `supabase/migrations/20260921120000_import_question_draft.sql` (RPC
  atômica `import_question_draft`, mesmo padrão de `import_compendium_draft`
  da Missão 42-B); `QuestionsRepository`/`SupabaseQuestionsRepository` ganham
  `importQuestionDraft` (remoto-antes-do-local, mesma regra de
  `importCompendiumDraft`); novo componente
  `src/components/admin/ImportQuestionsModal.tsx` (pré-visualização em
  LISTA, cada questão do lote resolvida/bloqueada independentemente — nunca
  tudo-ou-nada por arquivo) plugado na aba "Questões Comentadas"
  (`AdminCMSView.tsx`) como botão "Importar questões". Decisão deliberada:
  o import **não adivinha tema nem vínculo de compêndio** (exige escolha
  manual quando ausente/não encontrado) — diferente do formulário unitário,
  que adivinha os dois e já é uma limitação documentada; um palpite errado
  multiplicado por um lote inteiro é pior que nenhum palpite.
  `docs/editorial/PADRAO-NEXUSMED-QUESTOES.md` reescrita nas seções de
  limitações/import; `AGENTS.md` ganhou o risco #16 (trigger
  `trg_create_question_option_key` já insere a linha de gabarito — RPC nova
  precisa de `UPDATE`, não `INSERT`, achado durante o próprio
  desenvolvimento desta entrega).
- **Ambiente tocado**: local (código) e Supabase **local** (migration
  aplicada via `supabase db reset`, dados de teste só do próprio pgTAP).
  Supabase remoto, `main` e produção **não tocados**.
- **Evidência**: `npm run typecheck` limpo; `npm run lint` 0 erros/5
  warnings (mesma baseline pré-existente, nenhum novo); `npx vitest run`
  182/182 (20 arquivos), incluindo os 3 novos desta entrega
  (`questionsImport.test.ts` 12, `questionsRepository.importQuestionDraft.test.ts`
  3, `importQuestionsModal.test.tsx` 6); `supabase db reset` limpo + `npm run
  test` (pgTAP) 315 asserções/12 arquivos, `Result: PASS`, incluindo o novo
  `import_question_draft.test.sql` (23 asserções: bloqueio de
  estudante/admin bloqueado, disciplina/tema incompatível ou inexistente,
  ciclo/dificuldade inválidos, importação válida, validação de alternativas,
  controle negativo de rollback integral, nenhuma `content_revisions`
  criada); `npm run build` e `npm run check:no-debug-bundle` OK (0
  ocorrências de debug).
- **Não verificado nesta entrega**: `npm run test:e2e` (Playwright) não foi
  executado — a cobertura desta entrega é pgTAP (RPC/segurança) + Vitest
  (parser + repositório resiliente + wizard completo com repositório
  mockado), sem um smoke em navegador real. Declarado aqui em vez de
  presumido como coberto.
- **Publicação**: branch local `feat/questoes-markdown-previa-busca-overflow`
  (mesma branch da correção de Markdown/doc anterior desta sessão, ainda não
  mesclada) — ver `TASKS.md` para o estado de push/PR. `main`/produção
  inalterados; a migration nova **não foi aplicada no Supabase remoto**
  (pré-requisito de publicação, RUNBOOK seção 3 — decisão/execução do
  usuário).

### Complemento (mesmo dia, mesma branch): sem teto de 5 alternativas (A–E deixa de ser o limite)

- **Objetivo**: pedido explícito do usuário — o import (pensado para
  questão de residência real) não deve forçar truncar/reordenar uma prova
  que tenha mais de 5 alternativas, nem reordenar alfabeticamente quando a
  banca não numera em sequência A,B,C...; o cadastro unitário do Admin
  continua fixo em A-D, de propósito (limitação da TELA, não do banco).
- **Impacto/arquivos**: nova migration
  `supabase/migrations/20260921130000_question_options_letter_unbounded.sql`
  — troca o `check (letter in ('A'..'E'))` de `question_options` por
  `check (letter ~ '^[A-Z]{1,3}$')` e replica a mesma validação em
  `import_question_draft` (era uma lista fechada `not in ('A'..'E')`).
  `src/utils/questionsImport.ts`: `OPTION_LETTERS` fixo removido — as
  letras são descobertas dinamicamente no arquivo, e a ORDEM final das
  alternativas passa a ser a ordem de aparição no arquivo (não mais uma
  varredura alfabética A→E), preservando a questão fiel ao original.
  `src/types/index.ts`: os 4 pontos com union literal `'A'|'B'|'C'|'D'|'E'`
  (`QuestionOption.letter`, `QuestionReviewOption.letter`,
  `QuestionAnswerRecord.selectedOption`,
  `SimuladoSessionData.answers[].selectedOption`) viram `string` — achado
  ao investigar: a submissão de resposta real (`submit_question_attempt`)
  já opera por `option_id` (uuid), nunca por letra: o teto vivia só no
  parser, no schema e nos atalhos de teclado, nunca na lógica de
  corrigir/gravar resposta. Atalhos de teclado generalizados (sem lista
  `['A'..'E']` hardcoded) em `QuestionCard.tsx` e `SimuladoSession.tsx` —
  agora aceitam qualquer letra que exista de fato nas opções da questão; o
  atalho numérico do simulado passou a marcar pela alternativa na POSIÇÃO
  real (`options[n].letter`), não mais por um alfabeto A-E assumido.
  `SupabaseSimuladosRepository.ts` perdeu o cast agora redundante para o
  union antigo. Formulário unitário (`AdminCMSView.tsx`, fixo em A-D) e
  `publish_question`/`submit_question_attempt` (já genéricos por
  `option_id`) não precisaram de nenhuma mudança.
- **Ambiente tocado**: local (código) e Supabase **local** (nova migration
  aplicada via `supabase db reset`). Supabase remoto, `main` e produção
  **não tocados** — mesmo estado de pendência de publicação do complemento
  acima (as duas migrations desta branch, `20260921120000` e
  `20260921130000`, precisam ser aplicadas juntas no remoto antes do merge).
- **Evidência**: `tsc --noEmit` limpo; `npm run lint` 0 erros/5 warnings
  (mesma baseline pré-existente — os 2 warnings novos listados em
  `SimuladoSession.tsx` são do padrão já conhecido de dependências de
  `useEffect`, não introduzidos por esta mudança); `npm run build` OK;
  `npx vitest run` 186/186 (20 arquivos), incluindo 2 casos novos em
  `questionsImport.test.ts` (mais de 5 alternativas; ordem de arquivo
  preservada para letras fora de sequência) e 1 caso novo em
  `questionCardKeyboardShortcuts.test.tsx` (atalho de tecla funciona para
  uma 6ª alternativa e ignora letra inexistente na questão); `supabase db
  reset` limpo + `supabase test db` (pgTAP) 319 asserções/12 arquivos,
  `Result: PASS`, incluindo 4 novas asserções em
  `import_question_draft.test.sql` (6 alternativas com letra F aceitas e
  gravadas corretamente; letra minúscula e letra numérica seguem
  rejeitadas).
- **Não verificado nesta entrega**: `npm run test:e2e` (Playwright) não foi
  executado — mesma lacuna já declarada no complemento anterior desta
  branch.

### Complemento (mesmo dia, mesma branch): INC-2026-003 — import falhava 100% contra ambiente sem a migration

- **Sintoma real reportado pelo usuário**: lote de 18 questões reais
  (Espirometria) falhou por inteiro ao importar, cada linha com
  `Questão N: Could not find the function public.import_question_draft(...)
  in the schema cache` (código PostgREST `PGRST202` — função ausente do
  schema cache daquele Supabase, não erro de dado da questão).
- **Causa-raiz confirmada** (ver
  [`INC-2026-003`](incidents/INC-2026-003-import-questoes-schema-cache-remoto.md)
  para a investigação completa): as duas migrations desta branch só
  foram aplicadas ao Supabase **local**; a tela testada pelo usuário
  resolvia `VITE_SUPABASE_URL` para o Supabase **remoto** — confirmado
  que um build de produção local (`npm run build`, sem
  `.env.production*` neste repo) cai em `.env.local` (remoto), enquanto
  só `npm run dev` usa `.env.development.local` (local). Parser e
  formato do arquivo `.md` foram validados à parte e estão corretos (as
  18 linhas produzem `blockingErrors: []`); a função também resolve
  normalmente via chamada HTTP direta ao PostgREST local. Não é um bug
  de lógica no import — é o gap de publicação já pendente (ver
  complemento anterior), agora com reprodução real.
- **Impacto/arquivos**: `src/utils/errorMessage.ts` — `getErrorMessage()`
  reconhece `PGRST202` e troca a mensagem crua por uma acionável (causa
  provável + próximo passo), mantendo o detalhe técnico original;
  beneficia os 6 pontos do Admin que usam esse helper, não só questões.
  `docs/editorial/PADRAO-NEXUSMED-QUESTOES.md` ganhou nota "Erro comum"
  na seção de import e uma clarificação de escopo (este guia é para
  IMPORTAR questão que já existe — prova de residência real — não para
  autorar questão original; documento de criação fica para o futuro,
  pedido explícito do usuário).
- **Ainda não corrigido, de propósito**: as migrations `20260921120000`
  e `20260921130000` seguem não aplicadas no Supabase remoto — é a única
  ação que resolve o sintoma de verdade, e é uma escrita em produção que
  exige autorização explícita (RUNBOOK seção 3), não executada nesta
  entrega.
- **Evidência**: `npx vitest run tests/unit/errorMessage.test.ts` 7/7
  (novo); reprodução controlada via `curl` direto ao PostgREST local
  (função resolve com os 13 parâmetros reais; nome inexistente reproduz
  o formato exato do erro do print); `node -e loadEnv(...)` confirmando
  a resolução de env var por modo; arquivo real de 18 questões rodado
  via `parseQuestionsMarkdownText` fora do navegador, 0 `blockingErrors`.
- **Descoberta crítica ao investigar**: `origin/main` já tinha
  `b00e7b5` — merge da PR #49 (`feat/questoes-markdown-previa-busca-
  overflow`, até o commit `1803548`) — ou seja, **o import de questões
  já estava em produção real** (Vercel, deploy automático), não era
  "branch pendente de merge" como o estado anterior deste documento
  registrava. O usuário confirmou (print de
  `synapse-med-firebase-auth.vercel.app/#/admin`) que o teste foi na
  própria produção. Isso eleva a severidade do INC-2026-003: era uma
  funcionalidade já publicada e quebrada para qualquer administrador
  que tentasse usá-la, não um risco futuro.
- **Ação corretiva executada, com autorização explícita do usuário**:
  `20260921120000_import_question_draft.sql` foi aplicada ao Supabase
  **remoto** (`jfvhwwvixwvgjfqzlkkb`) via `supabase db push --linked`
  — só essa migration, a que o código já deployado (PR #49) de fato
  usa. `20260921130000_question_options_letter_unbounded.sql` (o
  complemento de remoção do teto de alternativas, código ainda só
  local/não mesclado) foi deliberadamente removida da pasta
  `supabase/migrations/` antes do push (`supabase db push --dry-run`
  confirmou a lista exata antes e depois) e restaurada logo em seguida
  — nunca chegou a ir para o remoto, para não aplicar schema de um
  recurso cujo frontend ainda não foi revisado/mesclado.
  `supabase migration list --linked` confirma `20260921120000` com
  `local` == `remote` após o push. Nenhum dado existente foi tocado —
  a migration só cria a função/RPC.
- **Ainda pendente**: `20260921130000` continua não aplicada em lugar
  nenhum fora do Supabase local desta sessão — só deve ir ao remoto
  junto com o merge do código que a usa (mesmo processo normal do
  RUNBOOK). Falta também a confirmação do usuário de que o lote real de
  18 questões importa com sucesso agora em produção (ver INC-2026-003).

## Auditoria técnica de 2026-09-18 — publicada

PRs #1 a #8 mesclados e no ar em 2026-09-18; migrations `20260918120000`,
`20260918130000` e `20260918140000` aplicadas no Supabase remoto; `main`
protegido (PR obrigatório, checks `fast` e `full`, branch atualizado).

- #1 RPCs de gabarito exigem usuário ativo e mesma questão na idempotência.
- #2 "Salvar" do compêndio no CMS via RPC `save_compendium` — não apaga mais anotações, histórico nem imagens.
- #3 mocks e autoria fictícia fora de produção. #4 CSP/headers, sem grants para `anon`, limpeza no logout.
- #5 `strict` + `@types/react`. #6 CI autocontido. #7 code splitting e navegação por `#/tela`. #8 processo via PR.

Lição de publicação: o #2 foi mesclado antes da migration, e o "Salvar" do
CMS ficou quebrado até ela ser aplicada — migration da qual o frontend
depende vai **antes** do merge (RUNBOOK, seção 3).

Pendências: `docs/diretoria/BACKLOG-ESTRATEGICO.md` — 3ª rodada de
auditoria (2026-09-19, AUD-17 a AUD-34) com a ordem sugerida no topo da
seção; da 1ª rodada seguem abertos AUD-01, 03, 05, 06, 07, 08 e 13.

## Baseline verificada nesta entrega (Entrega 40-A, 2026-09-17)

- `origin/main` = `fe20832791bad02d174461f7cf4bab8d0dcd632e` (confirmado por
  `git fetch` em 2026-09-17; sem drift entre o diagnóstico da diretoria e o
  início desta entrega).
- Último estado **documentado** em `AGENTS.md`/`docs/diretoria/registro.md`
  antes desta entrega: Prompt 23-C (2026-09-14), fundação de proveniência
  editorial e atestação humana — publicado e verificado no Supabase remoto
  naquela data (ver detalhamento arquivado em
  [`docs/archive/AGENTS-HISTORICO-2026-09-17.md`](../archive/AGENTS-HISTORICO-2026-09-17.md)).

## Missão AS1-B3.2 — Publicação (2026-09-18)

Publica a cadeia AS1-B1→AS1-B3.2 (auditoria científica, conversão para
`.compendium.yaml`, auditoria independente e correção da sobreposição
visual do importador — tema Distúrbio Acidobásico). Detalhamento
completo de cada missão em `docs/operacao/TASKS.md`, linhas AS1-B1 a
AS1-B3.2.

- **Preflight**: `origin/main` confirmado em `d84f52a` (sem drift) antes
  do merge. Candidata `work/as1-b3-2-correcao-visual-importador-acidobasico`
  em `d0f92c0`, merge-base = `d84f52a` (descendente limpa). Diff completo
  `main...candidata`: 18 arquivos — só documentação/YAML de rascunho em
  `docs/editorial/as1/` e `docs/diretoria/prompts/`, mais o código real:
  `ImportMaterialModal.tsx` (overlay `fixed inset-0 z-[60]`) e o teste de
  regressão `import-material.spec.ts`. `git diff --check` e varredura de
  segredos no diff completo, limpos.
- **Merge**: `git merge --no-ff`, commit `5104763`. Sem conflitos (a
  única sobreposição de arquivo — `MODELO-DIRETORIA.md`, que só `main`
  havia tocado, com a seção de eficiência de subagentes — foi resolvida
  automaticamente pelo merge, sem perda).
- **Achado durante o próprio gate desta entrega, corrigido antes de
  publicar** (commit `f42917d`): `eslint.config.js` não ignorava
  `.claude/worktrees/**` — rodar `npm run lint` a partir da raiz
  `canonical` (nunca feito antes; gates anteriores sempre rodaram numa
  worktree fora dessa árvore) varre também o conteúdo em disco de outras
  worktrees registradas ali, gerando ~2900 erros fantasmas de código de
  outras branches. Corrigido; confirmado de volta à baseline real (0
  erros, 89 warnings). Registrado como risco #11 em `AGENTS.md`.
- **Gates completos pós-merge, todos verdes**: `npm ci` limpo (reprodutível,
  408 pacotes); `tsc --noEmit` 0 erros; `npm run lint` 0 erros/89 warnings;
  `npm run test:unit` (Vitest) 40/40; `supabase db reset` limpo + `npm run
  test` (pgTAP) 249/249; `npm run test:e2e` (Playwright, Chromium) **30/30**
  após reset limpo (uma primeira rodada, sem reset entre pgTAP e e2e na
  mesma sessão, teve 4 falhas em `estudo-tematico-22a`/`concurrencia-13b`
  — poluição de fixtures do pgTAP, mesmo padrão já documentado na 42-B;
  desapareceram com reset, não é regressão); `npm run build` e `check:
  no-debug-bundle` OK.
- **Push**: `git push origin main` — `d84f52a..f42917d main -> main`,
  confirmado pelo usuário (bloqueio do classificador de segurança do
  Claude Code para escrita remota, mesmo padrão já documentado).
- **Deploy confirmado em produção**: bundle
  `https://synapse-med-firebase-auth.vercel.app/assets/index-BR5TcDUB.js`
  (1.228.904 bytes, `Last-Modified` coerente com o horário do push) contém
  a string `import-missing-fields-panel` (1 ocorrência, marca única do
  fix desta missão) e 0 ocorrências de `__syncDebug`/
  `__setTestBackoffOverride`.
- **Smoke de produção (não autenticado)**: Chromium headless via
  Playwright contra a URL real — título "NexusMed", `#auth-email-input`/
  `#auth-password-input` presentes, 0 erros de console. Nenhuma conta
  criada, nenhum arquivo importado, nenhuma escrita em produção além do
  próprio push de código.
- **Taxonomia (fora deste merge, decisão relacionada)**: disciplina
  "Nefrologia" já existia no catálogo remoto real; tema "Distúrbio
  Acidobásico" foi criado pelo usuário via `insert` direto (comando
  fornecido pela diretoria, escrita confirmada pelo `RETURNING` da
  query) — id `cbc160bc-9666-45a2-aa73-fbfccc8a7732`. Nenhum material,
  questão ou outra linha criada.
- **Não verificado nesta entrega**: importação real do material
  Acidobásico como rascunho (decisão pendente do usuário — precisa de
  sessão admin autenticada em produção); smoke autenticado da Área
  Editorial (mesma restrição já registrada na 42-C).

## Entrega 41-A (2026-09-17) — auditoria de `fe20832` concluída

O risco crítico abaixo foi **auditado e corrigido** na branch local
`work/41a-auditoria-fe20832` (base: `23de8fe`, topo da 40-A). Veredito:
**aceitar com correções**. Resumo:

- `package-lock.json` restaurado a partir do estado imediatamente anterior
  ao commit (`2e342bd`) — `package.json` estava byte-idêntico antes/depois
  de `fe20832`, então o lockfile antigo é 100% coerente com o manifesto
  atual. `npm ci` volta a funcionar (352 pacotes, reprodutível).
- `npm run typecheck` **falhava** (12 erros TS2339/TS2538, todos em
  `DailyHandoffModal.tsx` e `BancaPerformanceRadar.tsx`) — corrigido com
  tipagem explícita em `Object.values(...)`/`new Map(...)` (mesmo padrão já
  usado em `DashboardView.tsx`) e um bug real: o filtro de "respostas de
  hoje" usava `a.answeredAt`, campo que não existe em `QuestionAnswerRecord`
  (o campo correto é `timestamp`) — o handoff diário sempre mostraria zero.
- `npm run lint` **excedia o teto de 93 warnings** (103 com o commit
  original) — corrigido removendo imports/estado mortos introduzidos pelo
  commit e suprimindo 2 `react-hooks/exhaustive-deps` com o mesmo padrão já
  usado no arquivo; voltou a 89 warnings, igual à baseline pré-`fe20832`.
  `vitest.config.ts` também tinha um `as any` desnecessário mascarando o
  plugin do Vite — removido, testa limpo.
- **Dois componentes ficaram órfãos** (importados, nunca renderizados):
  `DailyHandoffModal` (botão "Passagem de Plantão" não fazia nada) e
  `BancaPerformanceRadar` (seção inteira inacessível). Ambos foram ligados
  em `DashboardView.tsx` com os dados já disponíveis no componente — sem
  criar funcionalidade nova, só religando o que o próprio commit construiu
  e esqueceu de expor.
- Nenhum bypass de autenticação/admin, segredo exposto ou escrita remota
  silenciosa encontrada. `npm run build` e `npm run test:unit` (24/24)
  passam. Smoke test em navegador real (dev server + Chromium headless via
  Playwright) confirmou as 3 funcionalidades novas funcionando sem erros de
  console.
- **Não verificado nesta entrega**: pgTAP (`npm run test`/`supabase test
  db`) — Docker Desktop não estava rodando no ambiente de execução
  (`docker info` falhou ao conectar no daemon). Gate não pôde ser
  executado, não foi declarado como passando.

Ver `docs/diretoria/registro.md` (retorno 41-A) para a matriz completa
achado → evidência → ação, e `docs/diretoria/prompts/41-A.txt` para o
prompt original. Branch candidata **só local**, não enviada ao remoto.

## Entrega 41-B (2026-09-17) — gate final da auditoria `fe20832`

Fechou os gates que a 41-A deixou pendentes (Docker indisponível) e revisou
as duas supressões de lint introduzidas para satisfazer o teto de warnings.
Base: `work/41a-auditoria-fe20832` @ `6c1f108`. Branch candidata:
`work/41b-gate-final-fe20832`, em worktree separada (fora da árvore do
checkout principal): `C:\Users\vinic\OneDrive\Projetos\SynapseMed\worktrees\41b-gate-final-fe20832`.

- **As duas supressões `react-hooks/exhaustive-deps` da 41-A foram
  removidas**, não mantidas com justificativa: `playChime` (Pomodoro) e
  `handleConfirmAnswer`/`handleSelectOption` (atalhos de teclado do
  `QuestionCard`) foram estabilizados com `useCallback` e suas dependências
  reais, e as listas de dependências dos `useEffect` voltaram a ser
  completas e verdadeiras (sem `eslint-disable`). Risco concreto
  identificado: no código da 41-A, o listener de teclado do `QuestionCard`
  não era remontado quando `onAnswerRecorded`/`onSelectOptionInExam`
  mudavam de referência sem que `isSubmitted`/`selectedOption`/`isExamMode`/
  `question.options` também mudassem — nesse caso o Enter/tecla de letra
  continuaria chamando a callback **antiga** do pai. Prova por teste
  automatizado (ver abaixo) e por controle negativo manual: revertendo só
  esses dois arquivos para a versão `6c1f108` (suprimida), os dois testes
  novos falham exatamente como esperado; com a correção, passam.
- **Teste focado novo**: `tests/component/questionCardKeyboardShortcuts.test.tsx`
  (categoria nova, `tests/component/**`, jsdom via `vitest` projects — só
  para este tipo de prova; `tests/unit/**` continua puro/sem DOM como
  antes). Dois casos: Enter chama o `onAnswerRecorded` **atual** após
  rerender que só troca essa prop; tecla de letra chama o
  `onSelectOptionInExam` **atual** da mesma forma. Ambos falham no código da
  41-A e passam no código desta entrega — controle negativo executado e
  revertido manualmente durante a auditoria, não é suposição.
  Dependências novas (dev-only): `jsdom`, `@testing-library/react`,
  `@testing-library/dom` — `package-lock.json` regenerado com `npm install`
  e depois validado com `npm ci` limpo (`rm -rf node_modules && npm ci`).
- **Gates executados nesta entrega, com Docker Desktop ativo** (a sessão
  encontrou o daemon parado, iniciou o Docker Desktop instalado em
  `%LOCALAPPDATA%\Programs\DockerDesktop`, e confirmou o daemon pronto antes
  de prosseguir — nenhuma etapa foi pulada por indisponibilidade):
  - `npm ci` limpo (via `rm -rf node_modules && npm ci`): reproduzível.
  - `npm run typecheck`: limpo, 0 erros.
  - `npm run lint`: 0 erros, 89 warnings (teto vigente: 93; mesmo número da
    baseline pré-`fe20832`, mesmo depois de remover as duas supressões).
  - `npm run test:unit` (Vitest): 26/26 passam (24 pré-existentes + 2 novos
    do teste focado).
  - `npm run test` (pgTAP via `supabase test db`, Supabase local via
    Docker): 228/228 asserções, 6/6 arquivos, `Result: PASS`.
  - `npm run test:e2e` (Playwright oficial, `chromium`, contra Supabase
    local em `127.0.0.1`, build `--mode test` + preview isolado na porta
    4183): 24/24 specs passam.
  - `npm run build`: build de produção real, sem `--mode test`, ok.
  - `npm run check:no-debug-bundle`: `0 ocorrências` de
    `__syncDebug`/`__setTestBackoffOverride` no bundle de produção.
- **Achado não bloqueante, fora de escopo desta entrega**: após rodar a
  suíte Playwright oficial completa, `select count(*) from auth.users where
  email like 'e2e-13a-%'` no Supabase local retornou `1`
  (`e2e-13a-prov-admin-...@e2e.local`, do spec
  `provenance-attestation-23b.spec.ts`), quando o README documenta `0`
  esperado. Não é código tocado por `fe20832` nem por esta entrega — apenas
  registrado para uma futura auditoria da suíte 23-B. Não afeta produção
  (fixture só existe no Supabase local, resetado a cada `supabase db
  reset`).
- **Smoke em navegador real** (Chromium via Playwright, `npm run dev` em
  `localhost:3000`, modo demo local — `local-demo-user`, sem Supabase
  configurado, dados em `localStorage`, sessão descartada ao fechar o
  browser): Plantão de Foco (Pomodoro) inicia e mostra o cronômetro
  rodando; Modo Foco Zen alterna o layout da tela de Questões; uma questão
  respondida via atalho de teclado (tecla `B` seleciona, `Enter` confirma)
  aparece corretamente registrada; Passagem de Plantão reflete a resposta
  do dia (`Questões Hoje: 1`, `Erros Catalogados: 1`); Aproveitamento por
  Banca Examinadora atualiza a banca correspondente (`USP - Residência
  Médica`) com o resultado real. Zero erros de console/página em toda a
  sessão. **Isto é smoke local, não é verificação de produção** — produção
  continua não verificada nesta entrega, como nas anteriores.
- **Vulnerabilidades moderadas**: `npm audit` continua reportando as mesmas
  2 vulnerabilidades moderadas pré-existentes, ambas em `vitest`/`@vitest/mocker`
  (dev-only — `npm audit --omit=dev` retorna 0). Não introduzidas pelas
  dependências novas desta entrega (`jsdom`, `@testing-library/*`), não
  bloqueiam `npm ci`, e não foram investigadas/corrigidas — fora de escopo
  por instrução explícita.
- **Segredos**: varredura do diff completo desde `23de8fe` (excluindo
  `package-lock.json`) por padrões de chave/token/JWT não encontrou nenhuma
  ocorrência. `.env.test.local`, criado nesta sessão só para rodar o
  Playwright contra o Supabase local, está coberto por `.env.*` no
  `.gitignore` e não foi commitado.
- **Não verificado nesta entrega**: produção/Vercel (não tocado, por
  restrição explícita); estado do Supabase remoto (não tocado); se
  `work/41b-gate-final-fe20832` deve ser mesclada em `main` — decisão da
  diretoria.

Ver `docs/diretoria/registro.md` (retorno 41-B) para o relato completo.
Branch candidata enviada **apenas** a `origin/work/41b-gate-final-fe20832`
— `main` e produção permanecem inalterados.

## Missão 42-C (2026-09-17/18) — Publicação controlada da importação assistida

Publica a candidata 42-A+42-B (aprovada pela diretoria) — "Importar
material" na Área Editorial, com gravação atômica via RPC
`import_compendium_draft`.

- **Preflight**: `origin/main` confirmado em `b56e828` (sem drift),
  candidata `work/42a-import-assistido` em `364678c`, merge-base = `b56e828`
  (candidata é descendente limpa, sem divergência).
- **Auditoria do diff** `origin/main...work/42a-import-assistido`: **19
  arquivos exatos**, confirmado por `git diff --stat` — valor autoritativo
  desta entrega (a 42-A isolada tinha 13 arquivos, não 10 como relatado
  originalmente; a 42-B acrescentou 8, cumulativo 18; o fechamento
  documental da própria 42-B fecha em 19). Migration nova contém só
  `CREATE OR REPLACE FUNCTION
  public.import_compendium_draft` + `REVOKE`/`GRANT` — nenhum DML, nenhuma
  carga de conteúdo, nenhuma alteração de taxonomia. Sem segredos no diff.
  `git diff --check` limpo.
- **Branch remota**: `work/42a-import-assistido` enviada a
  `origin/work/42a-import-assistido` (push confirmado pelo próprio Git:
  `* [new branch]`). Não é publicação em produção.
- **Merge**: `git merge --no-ff work/42a-import-assistido` em `main` local,
  commit `4850429` (main local ficou 5 commits à frente de `origin/main`
  antes do push final).
- **Gates pós-merge, todos verdes**: `npm ci` reproduzível; `tsc --noEmit`
  limpo; `npm run lint` 0 erros/89 warnings; Vitest 40/40; `supabase db
  reset` limpo + pgTAP 249/249; `npm run test:e2e` completo **28/28** após
  reset limpo (uma primeira tentativa falhou sistemicamente por
  `.env.test.local` ausente neste checkout — achado da própria sessão,
  corrigido recriando o arquivo git-ignorado, não uma regressão de
  código); `npm run build` e `check:no-debug-bundle` OK; `git diff --check`
  limpo; segredos sem ocorrências.
- **Limpeza de fixtures locais**: confirmada (0 materiais/disciplinas de
  teste remanescentes) — exceto 1 usuário `e2e-13a-prov-admin-...`
  residual do spec de proveniência 23-B, achado **pré-existente e já
  registrado** (ver `TASK-2026-09-17-05`), não introduzido por esta
  publicação.
- **Migration remota**: `supabase migration list` confirmou, antes de
  qualquer escrita, que a ÚNICA migration pendente local×remoto era
  `20260917120000_import_compendium_draft.sql` — nenhuma outra divergente.
  Aplicada via `supabase db push --linked` (procedimento canônico) somente
  após confirmação interativa do usuário. Verificado por
  `supabase migration list` pós-push (local=remoto em todas as entradas) e
  por `supabase db dump --linked` (schema-only): a função existe
  exatamente como definida, `REVOKE ALL ... FROM PUBLIC` +
  `GRANT ... TO authenticated` — `anon` nunca teve grant próprio, logo sem
  acesso. Nenhuma linha de material foi criada: garantido estruturalmente,
  a migration aplicada não contém nenhum `INSERT`/`UPDATE`/`DELETE`.
- **Push de `main`**: confirmado interativamente pelo usuário. Executado
  `git push origin main` — `b56e828..62091da main -> main`. `origin/main`
  passou a apontar para `62091da` (commit documental de fechamento da
  42-C, sobre o merge `4850429`).
- **Deploy confirmado**: bundle de produção
  (`https://synapse-med-firebase-auth.vercel.app/assets/index-ksOjcgwi.js`,
  1.228.604 bytes, HTTP 200) contém as strings `"Importar material"` (2
  ocorrências) e `"import_compendium_draft"` (1 ocorrência) — confirma que
  o deploy corresponde ao novo `main`, não a uma versão anterior em cache.
  Zero ocorrências de `__syncDebug`/`__setTestBackoffOverride` no bundle
  publicado.
- **Smoke de produção (não destrutivo)**: Chromium headless via Playwright
  contra a URL de produção real — título "NexusMed", tela de login
  carrega com `#auth-email-input`/`#auth-password-input` presentes, **zero
  erros de console**. Nenhum arquivo foi selecionado, nenhum material foi
  importado, nenhuma conta foi criada em produção.
- **Smoke autenticado NÃO executado**: esta sessão não tinha (nem tentou
  obter ou inventar) credenciais de administrador de produção. Portanto
  não foi verificado visualmente nesta entrega: acesso à Área Editorial em
  produção, presença do botão "Importar material" na UI real, abertura/
  fechamento do modal, ou o aviso de "só cria rascunho" em produção — isso
  fica como verificação pendente para quando houver sessão administrativa
  disponível (não é um "não verificado" motivo de suspeita; é uma
  restrição explícita desta missão, que proibia criar usuário remoto sem
  autorização específica).
- **Confirmação de que nenhum conteúdo foi importado**: nenhum arquivo
  (Meningite, PCSK9 ou qualquer outro) foi selecionado ou submetido contra
  o Supabase remoto em nenhum momento desta entrega; nenhuma disciplina,
  tema, material, revisão ou atestação foi criada no remoto. A única
  escrita remota desta entrega foi a migration (função + grants).

## Missão 42-B (2026-09-17) — Correção da importação atômica

A diretoria revisou a 42-A e exigiu correção antes de qualquer publicação:
`SupabaseMaterialsRepository.saveCompendium()` grava material, seções e
referências em requisições HTTP independentes, e o repositório resiliente
gravava a cópia local antes de confirmar o Supabase — uma falha
intermediária podia deixar rascunho parcial no banco e divergência local.

- Branch candidata **ainda só local**, mesma branch da 42-A:
  `work/42a-import-assistido`, agora em `2bcac36` (dois commits acima da
  42-A: `8f7c4cb` + `80ba996` + `2bcac36`). Não enviada ao remoto, não
  mesclada em `main`.
- **Correção real, não superficial**: nova função `public.import_compendium_draft()`
  (migration `20260917120000_import_compendium_draft.sql`) faz TODA a
  gravação (material + seções + referências) dentro de uma única chamada
  PL/pgSQL — em Postgres isso já é atômico por natureza (uma função
  invocada como instrução única roda dentro de uma transação implícita;
  qualquer exceção não capturada desfaz tudo). A função exige admin ativo,
  valida disciplina/tema existentes e coerentes entre si, bloqueia
  duplicidade de título no servidor (case-insensitive, independente da
  checagem client-side) e só aceita criação em `draft` (nem recebe
  parâmetro de status).
- Cliente: `SupabaseMaterialsRepository.importCompendiumDraft()` chama essa
  RPC; `ResilientMaterialsRepository.importCompendiumDraft()` só grava a
  cópia local **depois** do sucesso remoto integral (ao contrário do padrão
  usado pelos demais métodos deste repositório) — sem Supabase configurado,
  grava só local, sem fingir sincronização inexistente.
  `ImportMaterialModal` passou a chamar este método em vez de
  `saveCompendium` (que continua existindo, intocado, para o formulário
  manual de edição/criação — fora do escopo desta correção).
- **Prova de atomicidade (controle negativo)**: teste pgTAP
  (`supabase/tests/database/import_compendium_draft.test.sql`, 21
  asserções) provoca deliberadamente uma violação de constraint
  (`citation_text` nulo numa referência) DEPOIS que material e seção já
  teriam sido inseridos na mesma chamada — confirmado por consulta SQL
  direta: 0 materiais, 0 seções, 0 referências remanescentes.
- Validações executadas: `tsc --noEmit` limpo; `npm run lint` 0 erros/89
  warnings; `npm run test` (pgTAP) 249/249 (228 pré-existentes + 21 novos);
  Vitest unit+component 43/43 (3 novos casos de repositório + 1 novo caso
  de componente para falha remota); `npm run test:e2e` completo 28/28 após
  `supabase db reset` limpo (as 4 falhas observadas numa execução anterior,
  sem reset entre duas rodadas seguidas da suíte no mesmo dia, foram
  isoladas como poluição de dados de execuções repetidas — specs
  `estudo-tematico-22a`/`concurrencia-13b`, não tocados por esta missão —
  e desapareceram com o banco local resetado; não é regressão introduzida
  aqui); `npm run build` e `check:no-debug-bundle` OK; `git diff --check`
  limpo; varredura de segredos no diff sem ocorrências.
- **Correção de contagem da 42-A**: o retorno anterior relatou 10 arquivos
  alterados — a contagem real (incluindo a atualização de documentação
  operacional feita no fechamento daquela sessão) é **13 arquivos**. Com a
  42-B, o total acumulado da branch candidata é 18 arquivos.
- Ambientes tocados: local (código) e Supabase **local** (schema novo via
  migration + dados de teste criados/removidos pelos próprios testes
  pgTAP/e2e). Supabase remoto, `main` e produção **não tocados**.
- Fora de escopo, deliberadamente não implementado nesta correção: criação
  automática de disciplina/tema, atualização por reimportação, taxonomia
  nova, questões/flashcards, publicação do material, refatoração geral de
  `saveCompendium()` (mantido intacto — só o caminho de importação passou a
  usar a RPC nova).

## Missão 42-A (2026-09-17) — Entrada assistida de materiais ("Importar material")

Fase 3 (Área Editorial operacional sem programação). Objetivo: uma pessoa
leiga consegue escolher o arquivo de um compêndio (formato de autoria
`.compendium.yaml`), conferir uma pré-visualização e criar um rascunho no
CMS só pela interface — sem terminal, UUID ou conhecimento de YAML.

- Branch candidata **só local**: `work/42a-import-assistido`, commit
  `8f7c4cb`, worktree
  `C:\Users\vinic\OneDrive\Projetos\SynapseMed\worktrees\42a-import-assistido`
  (base: `origin/main` = `b56e828`, sem drift confirmado no preflight). Não
  enviada ao remoto, não mesclada em `main`.
- Adiciona botão "Importar material" na aba de compêndios do
  `AdminCMSView`, o componente `ImportMaterialModal` (wizard: escolher
  arquivo → pré-visualização → confirmar/cancelar → rascunho) e o módulo
  puro `src/utils/compendiumImport.ts` (parse YAML, validação, resolução de
  disciplina/tema por nome, detecção de duplicata por título normalizado).
- Dependência nova: `yaml` (`^2.9.1`), único parser YAML do projeto até
  aqui.
- **Caso de prova real** (`meningite-bacteriana.compendium.yaml`, fora do
  repositório, **não modificado** — hash MD5 conferido antes/depois):
  confirmado em navegador real (Playwright/Chromium) contra Supabase
  local — rascunho criado com exatamente 11 seções e 13 referências,
  `status = 'draft'`, nenhuma publicação/atestação acionada. Disciplina
  "Infectologia"/tema "Clínica" não existiam no seed mínimo local (só
  Cardiologia) — criados como fixture do próprio teste e2e, removidos no
  `afterEach`.
- Se disciplina/tema do arquivo não existem no catálogo carregado, a
  pré-visualização exige seleção manual (dropdown, mesmo padrão do form
  manual existente) antes de liberar "Salvar rascunho" — **decisão
  deliberada de não criar disciplina/tema novos automaticamente** nesta
  missão (ver "descobertas separadas" no retorno de diretoria, RETORNO
  42-A, categoria "opcional").
- Validações executadas: `tsc --noEmit` limpo; `npm run lint` 0 erros/89
  warnings (mesma baseline); `npm run test` (pgTAP) 228/228; unit tests
  (Vitest) 6 novos casos do parser + suíte completa 36/36; component tests
  4 novos casos do wizard (arquivo válido, arquivo inválido, duplicata
  bloqueada, cancelar); `npm run test:e2e` completo 28/28 (24 specs
  pré-existentes + 4 novos casos de import, incluindo o caso de prova real
  de Meningite); `npm run build` e `check:no-debug-bundle` OK; `git diff
  --check` limpo; varredura de segredos no diff sem ocorrências (só senha
  de fixture de teste, mesmo padrão já usado nos specs existentes).
- **Achado técnico novo registrado em `AGENTS.md`** (risco #10): TypeScript
  5.8 neste projeto não estreita union discriminada por `!x.ok` quando o
  tipo vem de outro módulo — contorno é comparar explicitamente
  (`=== false`/`=== true`).
- Ambientes tocados: local (código) e Supabase **local** (schema não
  alterado, só dados de teste criados/removidos pelo próprio teste e2e).
  Supabase remoto, `main` e produção **não tocados**.

## Risco crítico — HISTÓRICO, resolvido pela 41-A acima

**Existe um commit em `origin/main`, posterior ao último estado documentado,
que não tem retorno, prompt ou entrada de registro associada:**

- `fe20832` "feat: add Clinical Pomodoro and UI enhancements", autor
  `viniciuskato <vinicius.kato.734@gmail.com>`, 2026-09-14 21:19 (America/
  Sao_Paulo) — **um commit depois** de `2e342bd` (merge do 23-B/23-C, o
  último estado documentado).
- Toca 23 arquivos: novos componentes (`ClinicalPomodoroWidget.tsx`,
  `DailyHandoffModal.tsx`, `BancaPerformanceRadar.tsx`,
  `ClinicalCognitiveProfile.tsx`, `ExportCadernoModal.tsx`,
  `IntegratedCadernoErros.tsx`), mudanças em `QuestionCard.tsx`,
  `QuestionsView.tsx`, `FlashcardReviewSession.tsx`, `DashboardView.tsx`,
  `SafeMarkdown.tsx`, `Header.tsx`, `index.css`, e outros.
- **`package-lock.json` foi apagado neste commit** (6999 linhas removidas,
  sem recriação) — o mesmo padrão de risco já documentado como armadilha
  recorrente (ver `AGENTS.md`, seção "Riscos críticos"): perda de
  reprodutibilidade de build (`npm ci` volta a falhar com `ENOLOCK`) e
  assinatura característica de exportação manual de uma ferramenta externa
  de edição com preview ao vivo (ver armadilha arquivada #6).
- **Não verificado**: se este código foi revisado linha a linha antes do
  commit, se passou por `tsc --noEmit`/`npm run build`/testes, se está
  atualmente no ar em produção (push em `main` = deploy automático, então
  **provavelmente sim, mas isso não foi confirmado nesta entrega** — esta
  entrega é só de documentação, não tocou build/deploy), e se há
  migration/schema associado.
- **Nenhuma ação de código foi tomada sobre este commit nesta entrega** —
  fora de escopo da 40-A. Registrado aqui e em [`TASKS.md`](TASKS.md) para
  que a diretoria decida: auditar linha a linha, testar, e só então
  aceitar/registrar retroativamente ou reverter.

## Ambientes

- **Produção**: `https://synapse-med-firebase-auth.vercel.app` — deploy
  automático a cada push em `main` (Vercel + GitHub). Estado atual do que
  está realmente no ar **não verificado nesta entrega** (ver risco acima).
- **Backend**: Supabase (Postgres + Auth + Storage), projeto `synapsemed`,
  ref `jfvhwwvixwvgjfqzlkkb`, região `sa-east-1`. Estado das migrations
  aplicadas no remoto **não verificado nesta entrega** — não verificado
  significa "não reconfirmado agora", não "motivo para suspeitar de
  problema": a última verificação documentada (23-C, 2026-09-14) confirmou
  aplicação correta.
- **Local**: Supabase local via CLI (`supabase start`/`db reset`/`test db`)
  — é onde toda mudança de schema/RPC deve ser testada antes de considerar
  pronta. Ver [`RUNBOOK.md`](RUNBOOK.md).
- **Frontend**: React 19 + Vite 6 + Tailwind v4 + TypeScript.

## Riscos e quarentenas conhecidas (não modificar nesta nem em entregas de
documentação futuras sem autorização específica)

- **Cópias antigas do projeto no OneDrive** — não são fonte de verdade, não
  usar como base de trabalho, não apagar/mover sem pedido explícito:
  - `C:\Users\vinic\OneDrive\nexusmed-aistudio-audit-20260914`
  - `C:\Users\vinic\OneDrive\nexusmed-aistudio-clean-base-20260915`
  - `C:\Users\vinic\OneDrive\nexusmed-aistudio-continuar-leitura-20260915`
  - `C:\Users\vinic\OneDrive\nexusmed-review-20260910`
  - `C:\Users\vinic\OneDrive\nexusmed-review-latest`
  - `C:\Users\vinic\OneDrive\Projetos\SynapseMed\firebase-auth`
  - `C:\Users\vinic\OneDrive\Projetos\SynapseMed\fase4-personal-repos`
  - `C:\Users\vinic\OneDrive\Projetos\SynapseMed\fase5-auth-supabase`
  (Lista obtida por listagem de diretório em 2026-09-17; conteúdo de cada
  uma não auditado nesta entrega.)
- **`.git` órfão conhecido**: `C:\Users\vinic\OneDrive\nexusmed-aistudio-
  continuar-leitura-20260915\.git` — branch `master`, sem commits
  confirmados, sem remoto configurado, e com **ownership diferente do
  usuário atual no Windows** (`git status` recusa operar ali sem
  `safe.directory`, confirmado em 2026-09-17). Não tocado, não configurado,
  não reutilizado nesta entrega, conforme instrução.

## Objetivo atual e próximo gate

- **Objetivo desta entrega (40-A)**: instituir a camada `docs/operacao/`
  (este conjunto de 5 arquivos) como porta de entrada única para sessões
  novas, e reduzir `AGENTS.md` a um índice curto — ver
  [`DECISIONS.md`](DECISIONS.md) para o racional completo.
- **Próximo gate (aberto pela 41-A, resolvido pela 41-C — ver seção
  seguinte)**: esta pendência (mesclar `work/41a-auditoria-fe20832` em
  `main` e rodar o gate pgTAP faltante) foi superada por um caminho
  diferente do previsto: a 41-B abriu `work/41b-gate-final-fe20832` a
  partir de `fe20832` (não a partir de `work/41a-auditoria-fe20832`, que
  permanece sem merge e com um commit — `f945fa2`, "exige gate final
  41-B" — não presente em `main`), executou os gates pendentes (pgTAP e
  Playwright) e foi mesclada `--no-ff` em `main` pela 41-C, já publicada.
  Não há mais gate técnico em aberto nesta frente; falta apenas a decisão
  da diretoria sobre descartar `work/41a-auditoria-fe20832` (conteúdo já
  coberto por 41-B/41-C). O texto de `f945fa2` foi preservado em
  [`docs/diretoria/prompts/41-B.txt`](../diretoria/prompts/41-B.txt) por
  esta própria entrega, antes de qualquer proposta de exclusão da branch.

## Estado de publicação desta própria entrega

**Atualizado pela 41-C (2026-09-17): publicado.** `main = origin/main =
a359b3d` (commit de registro documental sobre `c2b412d`, merge `--no-ff`
de `work/41b-gate-final-fe20832`, hash `b5a8f7f`, sobre `fe20832`),
contendo 40-A + as correções auditadas em 41-A/41-B (lockfile restaurado,
`useCallback` real nos atalhos de teclado
do `QuestionCard`, ajustes de tipagem/lint). Deploy automático no Vercel
confirmado (bundle publicado com tamanho e timestamp coerentes com o
build local imediatamente após o push). Ver "RETORNO: 41-C" em
`docs/diretoria/registro.md` para a matriz completa de gates e o smoke de
produção realizado (limitado a verificação não autenticada, por restrição
explícita de não tocar o Supabase remoto nesta entrega).
