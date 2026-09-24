# BACKLOG-ESTRATEGICO.md — itens produzidos pela sessão de auditoria

Criado em 2026-09-18, junto com a separação do papel "sessão de
auditoria" descrita em
[`MODELO-DIRETORIA.md`](MODELO-DIRETORIA.md#sessão-de-auditoria-papel-estratégico-adicionado-2026-09-18).

Este arquivo é a **única saída** de uma sessão de auditoria e a
**única ponte** entre ela e a diretoria — não existe sessão viva de
auditoria esperando resposta. A diretoria lê este arquivo ao abrir uma
sessão nova (junto com `TASKS.md` e `docs/diretoria/registro.md`) e
decide, por conta própria, se/quando puxar um item.

## Formato de item

Cada item precisa ser entendível por uma sessão de diretoria **sem**
contexto da auditoria que o escreveu. Use este esqueleto:

```
### <ID> — <título curto>
- **Registrado em**: <data> pela sessão de auditoria
- **Problema**: o que foi observado, em termos concretos (não "poderia
  ser melhor" — o quê, exatamente, e onde).
- **Por que importa**: consequência real de não resolver, ou ganho real
  de resolver. Sem isso o item não é priorizável.
- **Prioridade relativa**: como se compara a outros itens abertos aqui
  e às entregas já em `TASKS.md` (bloqueia algo? é independente?).
- **Contexto mínimo pra puxar**: arquivos/decisões/estado que uma
  diretoria precisa ler antes de transformar isto num encaminhamento —
  não repetir a auditoria inteira, só o necessário.
- **Estado**: Aberto | Em andamento (entrega NN-X) | Descartado (motivo)
  | Concluído (entrega NN-X)
```

Itens descartados ou concluídos **não são apagados** — mudam de estado
e ficam como histórico (mesma lógica de preservação já usada em
`docs/diretoria/registro.md` e `DECISIONS.md`).

## Itens

> **Desde 2026-09-23, todo item aberto está agendado numa unidade do plano
> canônico** ([`docs/produto/PLANO-DE-DESENVOLVIMENTO.md`](../produto/PLANO-DE-DESENVOLVIMENTO.md),
> frentes 45 e 46, e pendências do dono P-1 a P-3). Este arquivo continua
> sendo o detalhe técnico de cada achado; a ordem e o estado de execução
> estão no plano. Ao concluir uma unidade, a execução muda aqui o estado dos
> achados que ela resolve para "Concluído (unidade NN-X)". Conferido em
> 2026-09-23: nenhum achado aberto foi corrigido desde a 3ª rodada.

Itens da auditoria técnica de 2026-09-18 (arquitetura, qualidade,
segurança e negócio). O que já virou PR não está aqui: RPCs de gabarito
(#1), `saveCompendium` sem cascata (#2), mocks fora de produção (#3),
headers/grants/logout (#4), strict + bugs do painel/SRS (#5), CI
autocontido (#6), code splitting + botão voltar (#7), processo via PR
(#8), este backlog (#9) e produto/negócio (#10).

### AUD-01 — "Esqueci a senha" não deixa definir senha nova
- **Registrado em**: 2026-09-18 pela sessão de auditoria
- **Problema**: `resetPasswordForEmail` (`AuthContext.tsx`) envia o e-mail,
  mas o `onAuthStateChange` ignora o evento `PASSWORD_RECOVERY` e não
  existe tela que chame `supabase.auth.updateUser({ password })`. O link do
  e-mail só faz login; a pessoa nunca troca a senha.
- **Por que importa**: quem esquece a senha fica dependente do link de
  e-mail para sempre (ou do admin). Fluxo de conta quebrado em produção.
- **Prioridade relativa**: alta — é o bug funcional mais visível que
  sobrou; independente dos PRs abertos.
- **Contexto mínimo pra puxar**: `src/contexts/AuthContext.tsx`
  (`onAuthStateChange`, `resetPassword`), `ForgotPasswordModal.tsx`;
  configurar `redirectTo` e a URL no Supabase (Authentication → URL
  Configuration).
- **Estado**: Aberto (reconfirmado em 2026-09-19: `onAuthStateChange`
  ignora o evento e `resetPasswordForEmail` não passa `redirectTo`)

### AUD-02 — Proteção de branch `main` no GitHub
- **Registrado em**: 2026-09-18 pela sessão de auditoria
- **Problema**: a decisão "mudança só por PR com CI verde" (DECISIONS.md,
  2026-09-18) não é imposta pelo GitHub; a sessão de auditoria não tinha
  permissão de admin para ativar.
- **Por que importa**: sem a regra, um push direto volta a publicar em
  produção sem CI, como no `fe20832`.
- **Prioridade relativa**: alta; depende do merge do PR #6 (CI verde).
- **Contexto mínimo pra puxar**: Settings → Branches → regra para `main`
  com "Require a pull request" e os checks `fast` e `full`.
- **Estado**: Concluído (ruleset no `main` ativado em 2026-09-18: PR obrigatório, checks `fast` e `full`, branch atualizado, sem force-push)

### AUD-03 — Conferir a configuração de Auth do Supabase remoto
- **Registrado em**: 2026-09-18 pela sessão de auditoria
- **Problema**: pelo repositório não dá para saber se o cadastro está
  aberto, se exige confirmação de e-mail, quais redirect URLs estão
  liberadas e quais schemas a API expõe (`config.toml` só vale para o
  local).
- **Por que importa**: o gate `pending` → `active` protege os dados, mas
  cadastro aberto sem confirmação permite criar contas em massa com
  e-mail de terceiros.
- **Prioridade relativa**: média; leitura no dashboard, sem código.
- **Contexto mínimo pra puxar**: Supabase Dashboard → Authentication
  (Providers, URL Configuration) e Settings → API.
- **Estado**: Aberto (2026-09-19: aproveitar a mesma leitura para conferir
  os itens de paridade do remoto listados em AUD-34)

### AUD-04 — Decompor o `App.tsx` e adotar um roteador
- **Registrado em**: 2026-09-18 pela sessão de auditoria
- **Problema**: `App.tsx` (~950 linhas, ~38 `useState`) é roteador e store
  ao mesmo tempo; componentes de 1.000–1.850 linhas (`AdminCMSView`,
  `DashboardView`, `CompendiumReader`) buscam dados por conta própria; as
  respostas do usuário são buscadas em pelo menos 7 lugares, com várias
  fontes de verdade. O PR #7 resolveu o botão voltar e o link direto via
  hash, sem reestruturar.
- **Por que importa**: é o maior custo de manutenção do código — cada
  funcionalidade nova mexe no `App.tsx` (29 commits nele em 15 dias) e
  aumenta o risco de regressão.
- **Prioridade relativa**: média; fazer antes de abrir o produto para mais
  usuários, depois dos itens de segurança/conta.
- **Contexto mínimo pra puxar**: `src/App.tsx`, PR #7; decidir entre
  react-router (ou TanStack Router) e uma camada de dados por tela
  (ex.: TanStack Query) antes de começar.
- **Estado**: Aberto — plano aprovado em PR #14 (`docs/diretoria/PLANO-AUD-04-APP-TSX.md`, 12 PRs pequenos) e pré-requisito de testes cumprido (#13), mas nenhum dos 12 passos foi executado (conferido em 2026-09-23: `App.tsx` com ~970 linhas, sem roteador nem camada de dados). Agendado como unidade 46-A do plano canônico

### AUD-05 — Leitura offline incoerente
- **Registrado em**: 2026-09-18 pela sessão de auditoria
- **Problema**: a escrita offline é robusta (fila com idempotência), mas a
  leitura vinda do Supabase nunca preenche o cache local; offline, as telas
  leem um cache vazio ou antigo. O próprio comentário em
  `FlashcardsRepository.ts` reconhece isso.
- **Por que importa**: o app promete "resiliência", mas estudar offline
  (metrô, hospital) não funciona de forma previsível.
- **Prioridade relativa**: média-baixa; decidir antes se offline de leitura
  é requisito de produto. Se não for, remover o fallback de leitura e
  simplificar.
- **Contexto mínimo pra puxar**: `src/repositories/Resilient*`,
  `src/services/storage.ts`, `docs/archive/SINCRONIZACAO-CONFIAVEL.md`.
- **Estado**: Aberto (reconfirmado em 2026-09-19; o cache vazio já causa
  bugs visíveis online — ver AUD-29 e AUD-20)

### AUD-06 — Integridade de dados controlada pelo cliente
- **Registrado em**: 2026-09-18 pela sessão de auditoria
- **Problema**: `save_simulado_session` aceita `score` do cliente;
  `set_section_read` aceita `p_total_sections`/`p_section_id` sem validar
  que pertencem ao material; `submit_feedback` não limita o tamanho de
  `title`/`description`; `profiles.avatar_url` aceita qualquer URL (pixel
  de rastreamento).
- **Por que importa**: permite inflar estatísticas/XP e gravar lixo; o
  impacto é baixo com um grupo fechado, mas cresce se houver ranking ou
  mais usuários.
- **Prioridade relativa**: baixa-média.
- **Contexto mínimo pra puxar**: migrations `20260909130000_*`,
  `20260910120000_*`; seguir o padrão de validação de
  `submit_question_attempt`.
- **Estado**: Aberto — o item da nota de simulado calculada no cliente foi
  concluído na unidade 45-A; validação de leitura/feedback/avatar e escrita
  direta nas tabelas seguem para a 45-H (ver AUD-31)

### AUD-07 — Modo demonstração alcançável em build de produção
- **Registrado em**: 2026-09-18 pela sessão de auditoria
- **Problema**: sem as variáveis de ambiente do Supabase, o build de
  produção abre o app em modo local, com botão de demonstração que cria um
  perfil `admin` local (`AuthContext.tsx`, ramo `!isSupabaseConfigured`).
- **Por que importa**: um deploy com variável faltando mostraria um CMS
  "funcionando" com dados fictícios, em vez de falhar de forma clara.
- **Prioridade relativa**: baixa.
- **Contexto mínimo pra puxar**: `AuthContext.tsx`, `LoginView.tsx`,
  `scripts/check-no-debug-bundle.mjs` (pode também procurar
  `local-demo-user`).
- **Estado**: Aberto (reconfirmado em 2026-09-19; inerte hoje porque a
  produção tem as variáveis, mas o `build` não falha sem elas)

### AUD-08 — Teto de intervalo do SRS também no SQL
- **Registrado em**: 2026-09-18 pela sessão de auditoria
- **Problema**: o PR #5 limitou o intervalo do SRS a 36.500 dias em
  `srsAlgorithm.ts`; a cópia do algoritmo em SQL (`submit_flashcard_review`)
  não tem o teto. Não foi portado no mesmo PR porque o #1 recria essa
  função (dois `create or replace` concorrentes).
- **Por que importa**: paridade entre cliente e servidor; na prática o
  teto é inalcançável (décadas de revisões).
- **Prioridade relativa**: baixa; já desbloqueado (#1 e #5 mesclados).
- **Contexto mínimo pra puxar**: `tests/unit/srsAlgorithm.test.ts`
  (comentário no topo), migration do #1.
- **Estado**: Aberto

### AUD-09 — Dívida de lint e acessibilidade
- **Registrado em**: 2026-09-18 pela sessão de auditoria
- **Problema**: 89 avisos de lint com teto fixo de 93 (33 `any`, 22
  variáveis não usadas, 28 de acessibilidade — `div` clicável sem
  teclado); só 5 de ~10 modais declaram `role="dialog"`, sem focus trap;
  166 usos de texto a 9–10px.
- **Por que importa**: o teto só impede piorar; acessibilidade ruim afeta
  uso real no celular e com leitor de tela.
- **Prioridade relativa**: baixa-média; baixar o teto a cada PR que tocar
  o arquivo.
- **Contexto mínimo pra puxar**: `npm run lint`, `eslint.config.js`.
- **Estado**: Concluído — PR #20 mesclado (lint 89 → 5 avisos, teto 5, `useDialogA11y` em 12 modais); texto 9–10px e os 5 `exhaustive-deps` ficam para depois

### AUD-10 — Endurecimento do CI e do ambiente de dev
- **Registrado em**: 2026-09-18 pela sessão de auditoria
- **Problema**: actions do CI fixadas por tag (`@v4`), não por SHA, e
  `supabase/setup-cli` com `version: latest`; `vite.config.ts` expõe o
  dev server na rede (`host 0.0.0.0`, `allowedHosts: true`), resquício do
  Google AI Studio (assim como `metadata.json`).
- **Por que importa**: supply chain e exposição do dev server na rede
  local; baixo risco hoje.
- **Prioridade relativa**: baixa.
- **Contexto mínimo pra puxar**: `.github/workflows/ci.yml`,
  `vite.config.ts`, `metadata.json`.
- **Estado**: Concluído — PR #12 mesclado (actions por SHA, CLI 2.117.0, Dependabot, dev em 127.0.0.1, `metadata.json` removido)

### AUD-11 — Tela em branco depois de deploy (code splitting)
- **Registrado em**: 2026-09-18 pela sessão de diretoria (2ª rodada)
- **Problema**: com o code splitting do #7, quem estava com o app aberto e
  trocava de tela depois de um deploy pedia um chunk inexistente e ficava
  com a tela em branco.
- **Estado**: Concluído — PR #11 (`lazyWithReload` + `AppErrorBoundary`)

### AUD-12 — Nenhuma visibilidade de erro em produção
- **Registrado em**: 2026-09-18 pela sessão de diretoria (2ª rodada)
- **Problema**: sem Sentry nem log de cliente; bug só aparecia quando alguém
  reclamava.
- **Estado**: Concluído — PR #17 mesclado em 2026-09-19 (`client_errors` +
  RPC `log_client_error`; migration aplicada no remoto). Consultas em
  `docs/operacao/OBSERVABILIDADE.md`. Lacunas que sobraram: AUD-30.

### AUD-13 — Backup e restauração do Supabase
- **Registrado em**: 2026-09-18 pela sessão de diretoria (2ª rodada)
- **Problema**: o conteúdo curado/auditado é o ativo principal e não há
  backup baixável fora do Supabase nem teste de restauração.
- **Por que importa**: perda do projeto ou erro de escrita em massa não tem
  volta.
- **Prioridade relativa**: alta; sem código no primeiro passo.
- **Contexto mínimo pra puxar**: confirmar o plano do Supabase (free não tem
  backup baixável); `pg_dump` semanal via GitHub Action com secret, guardado
  fora do Supabase; restaurar uma vez no local.
- **Estado**: Aberto — precisa da conta dona do projeto (reconfirmado em
  2026-09-19: nenhum workflow agendado, nenhum `pg_dump`, nada em
  `docs/operacao`)

### AUD-14 — Dependências com majors atrasados
- **Registrado em**: 2026-09-18 pela sessão de diretoria (2ª rodada)
- **Problema**: Vite 6→8, TypeScript 5.8→7, ESLint 9→10, Vitest 3→5,
  lucide 0.x→1.x; sem atualização automática.
- **Estado**: Em andamento — Dependabot ativo desde o #12; majors das actions
  (#22–#25) e do `lucide-react` (#27) mesclados; majors de
  ESLint/TypeScript bloqueados para migração planejada (#31,
  `docs/operacao/standards/atualizacao-dependencias.md`)

### AUD-15 — Ofensiva e "hoje" calculados em UTC
- **Registrado em**: 2026-09-18 (achado pelos testes do PR #13)
- **Problema**: ofensiva, cards de hoje, missões e Passagem de Plantão
  usavam o dia UTC; em Brasília, estudo depois das 21h caía no dia seguinte.
- **Estado**: Concluído — PR #19 mesclado (`diaLocal`)

### AUD-16 — Pendências que só o dono do projeto executa
- **Registrado em**: 2026-09-18 pela sessão de diretoria (2ª rodada)
- **Problema**: importar o Acidobásico como rascunho + smoke autenticado
  da Área Editorial (roteiro no PR #15, ensaiado no local: 17 seções, 14
  referências) e a primeira leitura de métricas (PR #16,
  `scripts/sql/metricas-semanais.sql`). Nenhuma sessão de IA tem acesso de
  admin/Supabase ao projeto de produção.
- **Estado**: Encerrado em 2026-09-23 pela diretoria, sem execução. O material
  de Equilíbrio Ácido-Base foi para a fila editorial do plano canônico
  (seção 12), sem prazo; o teste autenticado da Área Editorial foi superado
  pelo uso real dela (PRs #57 a #62); as métricas semanais seguem como
  rotina no RUNBOOK.


## 3ª rodada — auditoria de 2026-09-19

Auditoria feita depois da fila de PRs #11–#35, sobre a `main` em `02bcaf9`.
Quatro frentes, todas só de leitura:
- segurança do banco: migrations e catálogo do Postgres local, só `SELECT`;
- cliente e infraestrutura: código, headers reais de produção e `npm audit`;
- estabilidade e dados: fila de sincronização, repositórios e telas;
- revisão dos PRs mesclados sem revisão aprofundada: #17, #18, #31, #33, #34 e #35.

Os achados de maior severidade foram conferidos no código. Três foram
reproduzidos com testes, guardados fora do repositório: AUD-17, AUD-18 e AUD-19.

**Não foi verificado**: o Supabase remoto (schema, grants, configuração de
Auth e `max_rows`). Tudo que depende disso está em AUD-34.

**O que ficou bem**:
- as 34 tabelas têm RLS e nenhuma tem grant para `anon`;
- toda RPC `SECURITY DEFINER` checa usuário ativo ou admin antes de
  devolver ou gravar dado, e tem `search_path` fixo;
- o bucket de storage é privado;
- a CSP não tem `unsafe-inline` nem `unsafe-eval` em `script`;
- não há `dangerouslySetInnerHTML` no código;
- não há segredo real no histórico do git;
- `npm audit --omit=dev` não encontrou nenhuma vulnerabilidade;
- a trava de acesso nega por padrão, o aluno não consegue virar admin, e
  toda ação de admin é barrada também no servidor.

**Ordem sugerida** (a diretoria decide):
1. **Antes de os alunos usarem simulado de verdade:**
   - AUD-17: tempo esgotado perde as respostas;
   - AUD-18: clique duplo duplica tentativas;
   - AUD-20: nota do simulado errada com rede lenta.
2. **Antes de o acervo e o uso crescerem:**
   - AUD-22: exclusão em cascata;
   - AUD-23: atestação do item errado;
   - AUD-21: corte silencioso em 1000 linhas;
   - AUD-19: a fila reordena gravações.
3. **Estabilidade de sessão e conta:** AUD-25, AUD-26 e AUD-27, junto com
   AUD-01 e AUD-03, que continuam abertos.
4. **Endurecimento e operação:** AUD-24 e AUD-28 a AUD-34.

### AUD-17 — Simulado em Modo Prova: tempo esgotado descarta as respostas
- **Registrado em**: 2026-09-19 pela sessão de auditoria
- **Problema**: o timer em `src/components/questions/SimuladoSession.tsx`
  (efeito com dependências `[isFinished, config.isExamMode]`, ~linha 122)
  chama o `handleFinishExam` capturado no primeiro render. Esse
  `handleFinishExam` ainda tem `answers` vazio e `secondsRemaining`
  inicial. Em seguida, `clearDraftAnswers` apaga o rascunho. É o aviso de
  lint `exhaustive-deps` da linha 142, e o bug é real.
  - Um teste de componente reproduziu: com uma alternativa marcada e 61 s
    avançados, `recordAnswer` é chamado 0 vezes e a sessão é salva com
    `answers {}`, `score 0` e `totalTime 0`.
- **Por que importa**: o aluno faz uma prova cronometrada inteira e, quando
  o tempo acaba, nenhuma resposta é gravada e a nota fica 0. É perda de dado
  no fluxo principal de preparação para prova.
- **Prioridade relativa**: crítica. É independente dos outros itens e deve
  ser corrigida antes de qualquer simulado real.
- **Contexto mínimo pra puxar**: `SimuladoSession.tsx`, com o timer,
  `handleFinishExam` e `clearDraftAnswers`. Correção provável: guardar
  `answers` e o tempo em refs, ou `useCallback` com as dependências
  certas. Escrever o teste de expiração do timer antes (TDD).
- **Estado**: Concluído (unidade 45-A, parte 1)

### AUD-18 — Clique duplo em "Finalizar Prova", "Confirmar Resposta" ou nota de flashcard duplica o registro
- **Registrado em**: 2026-09-19 pela sessão de auditoria
- **Problema**: nenhum desses botões bloqueia uma segunda chamada enquanto
  a primeira está em andamento:
  - em `SimuladoSession.tsx` (`handleFinishExam`), `isFinished` só é
    marcado depois de esperar `recordAnswer`, que pode levar até 20 s;
  - em `QuestionCard.tsx`, o botão só é desativado quando não há
    alternativa escolhida;
  - em `FlashcardReviewSession.tsx`, não há bloqueio nenhum.

  Cada chamada gera um `client_op_id` novo (`AnswersRepository.ts`, sem id
  estável), então a idempotência do servidor não segura. Um teste reproduziu:
  `recordAnswer` e `saveSimuladoSession` são chamados 2 vezes.
- **Por que importa**: com rede lenta, a tela fica cerca de 20 s sem
  resposta, e o aluno clica de novo. Isso duplica tentativas e revisões de
  SRS e infla XP e estatísticas.
- **Prioridade relativa**: alta. Pode ser feita junto com a AUD-17, porque
  o componente é o mesmo.
- **Contexto mínimo pra puxar**: os três componentes citados;
  `enqueueAndTry` em `src/services/syncQueue.ts`. Correção provável: um
  estado `submitting` que desativa o botão, mais um `client_op_id` estável
  por ação.
- **Estado**: Concluído (unidade 45-A)

### AUD-19 — A fila de sincronização reordena gravações: uma edição antiga pode sobrescrever a nova
- **Registrado em**: 2026-09-19 pela sessão de auditoria
- **Problema**: em `src/services/syncQueue.ts` (~linha 432), uma operação em
  backoff é pulada com `continue`, e as seguintes são enviadas antes dela.
  `retryAllFailed` também reenvia as antigas depois das novas. No handler
  `note_upsert` (`syncHandlers.ts`), a versão-base é lida no envio, então a
  versão antiga passa sem ser detectada como conflito. Um teste reproduziu:
  a ordem aplicada no servidor foi `['versao-2','versao-1']`.
- **Por que importa**: com uma oscilação de rede, o texto novo de uma
  anotação se perde em silêncio. O mesmo vale para favoritar e desfavoritar,
  marcar e desmarcar leitura, e reações.
- **Prioridade relativa**: alta. Mexe no núcleo da sincronização, então
  exige cuidado e testes.
- **Contexto mínimo pra puxar**: `syncQueue.ts` (`runFlush` e
  `retryAllFailed`), `syncHandlers.ts`, `docs/archive/SINCRONIZACAO-CONFIAVEL.md` e
  a armadilha #8 do `AGENTS.md`. Correção provável: serializar por alvo
  (categoria + id), ou fazer operações do tipo "set" substituírem as
  pendentes do mesmo alvo ao enfileirar.
- **Estado**: Aberto

### AUD-20 — Com rede lenta ou offline, respostas certas contam como erradas e a nota do simulado fica errada
- **Registrado em**: 2026-09-19 pela sessão de auditoria
- **Problema**: as telas enviam `isCorrect: false` como valor provisório
  (`SimuladoSession.tsx` e `QuestionCard.tsx`). Quando `enqueueAndTry`
  devolve `null` (offline ou prazo de 20 s estourado), o resultado vem do
  cache local com esse `false` (`AnswersRepository.ts`). A fila processa em
  série, com 2 requisições por resposta, então um simulado de 100 questões
  em 4G passa facilmente do prazo.
- **Por que importa**:
  - o score salvo em `simulations` fica permanentemente errado, porque vem
    do cliente (AUD-06);
  - no `QuestionCard`, uma resposta certa aparece como "incorreta" e gera
    flashcard e entrada no caderno de erros indevidos, que depois são
    sincronizados.
- **Prioridade relativa**: alta. Está ligada à AUD-06 (score calculado no
  cliente) e à AUD-05 (cache de leitura).
- **Contexto mínimo pra puxar**: os componentes citados,
  `AnswersRepository.ts`, `syncHandlers.ts` (handler de resposta) e a RPC
  `save_simulado_session`. Correção provável: mostrar "correção pendente"
  quando o servidor não respondeu, e calcular o score no servidor a partir
  das tentativas.
- **Estado**: Concluído (unidade 45-A)

### AUD-21 — Leituras sem paginação são cortadas em silêncio em 1000 linhas
- **Registrado em**: 2026-09-19 pela sessão de auditoria
- **Problema**: o PostgREST devolve no máximo `max_rows` linhas. É 1000 no
  local (`supabase/config.toml`), que também é o padrão do Supabase, mas o
  valor no remoto não foi verificado. Só `SupabaseQuestionsRepository` pagina
  (`fetchAllRows`, correção do 11-B). Não paginam:
  - `question_attempts` (`SupabaseAnswersRepository.getAnswers`);
  - `flashcard_reviews` (ordem crescente, então as revisões mais novas são
    as cortadas);
  - `simulation_questions` e `simulation_answers`;
  - `error_notebook`;
  - `material_sections` e `material_references`.
- **Por que importa**: um aluno que faz 50 questões por dia passa de 1000
  tentativas em cerca de 3 semanas. Questões já respondidas voltam como
  "não respondidas", estatísticas e XP param de crescer, e o caderno de
  erros perde itens. Tudo isso sem erro nenhum.
- **Prioridade relativa**: alta, e tem prazo: começa a afetar os alunos
  mais ativos em semanas.
- **Contexto mínimo pra puxar**: `fetchAllRows` em
  `SupabaseQuestionsRepository.ts` como modelo; os repositórios `Supabase*`
  citados. Onde a lista inteira não é necessária, preferir agregação no
  servidor (RPC).
- **Estado**: Concluído (unidade 45-C, parte 1 — leituras completas)

### AUD-22 — Excluir um compêndio apaga em cascata dados de alunos e a trilha de atestação editorial
- **Registrado em**: 2026-09-19 pela sessão de auditoria
- **Problema**:
  - `questions` tem `trg_guard_question_delete`, mas `materials` não tem
    trava nenhuma contra DELETE. A política `materials_admin_write` é
    `FOR ALL`.
  - Conferido no catálogo local, estas tabelas apagam em cascata junto com
    `materials`: `material_sections`, `notes`, `bookmarks`,
    `reading_progress`, `content_revisions` (e com ela `claims`,
    `content_reviews` e `claim_sources`), `content_assets` e
    `material_dependencies`. Apagar uma seção também apaga
    `material_section_versions`.
  - O CMS (`AdminCMSView.tsx`, ação de excluir) faz o `delete` depois de um
    único `window.confirm`.
  - A RPC `save_compendium` (`20260918130000_save_compendium_rpc.sql`) apaga
    as seções que não vieram no formulário, sem checar o status do material.
    Com isso, as notas dos alunos naquelas seções e o histórico delas somem.
- **Por que importa**: um clique errado apaga, sem volta, as anotações, os
  favoritos e o progresso de todos os alunos no material, e a prova de quem
  revisou e atestou o conteúdo. Não há backup para recuperar (AUD-13).
- **Prioridade relativa**: alta. É o mesmo tipo de bug do "Salvar apagava
  por cascata", corrigido no PR #2.
- **Contexto mínimo pra puxar**: `guard_question_delete` como modelo;
  migrations `20260903120000_initial_schema.sql`, `20260911120000_*`,
  `20260914120000_content_provenance_attestation.sql` e
  `20260918130000_save_compendium_rpc.sql`; checklist item 2 do
  `MODELO-DIRETORIA.md`. Correção provável:
  - `guard_material_delete`, que bloqueia a exclusão de material publicado
    ou com dado de aluno;
  - `RESTRICT` no lugar de `CASCADE` nas FKs de trilha editorial e de
    histórico;
  - em material publicado, `save_compendium` passa a recusar a remoção de
    seção.
- **Estado**: Aberto

### AUD-23 — CMS: o painel de revisão pode mostrar e atestar o item errado
- **Registrado em**: 2026-09-19 pela sessão de auditoria (revisão do PR #18)
- **Problema**:
  - `AdminCMSView.tsx` renderiza `<ProvenanceReviewPanel>` sem `key`, numa
    posição comum a todas as abas.
  - O painel só chama `load()` na montagem (`useEffect(..., [])` em
    `ProvenanceReviewPanel.tsx`).
  - Com o painel aberto no item A, clicar em "Revisão" do item B troca o
    título, mas status, claims e `revisionId` continuam os de A. "Aprovar"
    atesta a revisão de A, e "Criar revisão" usa B.
  - O `MaterialReferencesPanel` tem o mesmo problema (`pendingByIndex`
    indexado por posição).
- **Por que importa**: a atestação humana é a garantia editorial do
  produto, e um erro aqui publica como revisado um conteúdo que ninguém
  revisou.
- **Prioridade relativa**: alta, e a correção é pequena: `key` com tipo e
  id do alvo nos dois painéis. Mais um teste de componente.
- **Contexto mínimo pra puxar**: `src/components/admin/AdminCMSView.tsx`
  (render do painel e `openProvenance`),
  `src/components/admin/ProvenanceReviewPanel.tsx` e
  `MaterialReferencesPanel.tsx`.
- **Estado**: Concluído (unidade 45-B)

### AUD-24 — Material publicado pode ser editado sem nova atestação, e "Associar" apaga a URL da referência
- **Registrado em**: 2026-09-19 pela sessão de auditoria
- **Problema**:
  - Questões publicadas ficam congeladas por
    `guard_question_content_immutable`. `materials`, `material_sections` e
    `material_references` não têm guarda equivalente: `save_compendium` e
    os updates diretos de admin alteram conteúdo publicado.
    `guard_material_publish` só controla a transição para `published`.
  - O status passa a `aprovacao_desatualizada`, mas o material continua
    visível para os alunos.
  - Em `MaterialReferencesPanel.tsx` com
    `SupabaseMaterialsRepository.ts` (update de `source_id`), associar uma
    fonte sem URL grava `url = NULL` e perde a URL original da referência.
- **Por que importa**: conteúdo médico publicado muda sem passar pela
  revisão humana, e isso contradiz a política editorial do PR #18. A perda
  de URL é perda de dado curado.
- **Prioridade relativa**: média. Só admin consegue causar, mas é a
  garantia central do produto.
- **Contexto mínimo pra puxar**: `guard_question_content_immutable` como
  modelo; `docs/editorial/POLITICA-QUESTOES-DIREITOS-E-MIDIA.md`. Decidir
  antes: editar publicado exige despublicar, ou gera uma nova revisão que
  fica pendente?
- **Estado**: Aberto

### AUD-25 — "Faça login novamente" nunca se resolve, e os dados ficam presos no aparelho
- **Registrado em**: 2026-09-19 pela sessão de auditoria
- **Problema**:
  - Operações que falham com `kind: 'auth'` viram `failed` não retentável
    (`syncQueue.ts`, `classifySyncError`; a regex `/jwt/` também pega
    "JWT expired").
  - Depois do novo login, `onActiveUserChanged` → `flush` continua pulando
    essas operações.
  - O botão "Tentar novamente" fica escondido enquanto `failedNeedsLogin`
    for verdadeiro (`SyncStatusIndicator.tsx`).
- **Por que importa**: o aluno faz o que a tela pede (sai e entra de novo),
  e mesmo assim as respostas e anotações nunca sobem. Um relógio de aparelho
  atrasado basta para causar isso.
- **Prioridade relativa**: alta. A correção é pequena: no login,
  recolocar em `pending` as operações `auth` e sempre mostrar o botão de
  reenvio.
- **Contexto mínimo pra puxar**: `syncQueue.ts` (`classifySyncError`,
  `onActiveUserChanged`, `retryAllFailed`) e `SyncStatusIndicator.tsx`.
- **Estado**: Aberto

### AUD-26 — Falha momentânea ao ler o perfil manda aluno ativo para "aguardando aprovação"
- **Registrado em**: 2026-09-19 pela sessão de auditoria
- **Problema**: quando a leitura do perfil falha, `fetchProfile`
  (`AuthContext.tsx`) devolve `status: 'pending'`. Isso roda a cada
  `onAuthStateChange` com sessão, inclusive `TOKEN_REFRESHED`, que acontece
  mais ou menos a cada hora. Então `App.tsx` desmonta o app inteiro.
- **Por que importa**: uma oscilação de rede no meio de um simulado troca a
  tela por "aguardando aprovação" e reinicia o timer. A trava de acesso
  deve continuar negando por padrão (armadilha #9 do `AGENTS.md`), mas sem
  rebaixar quem já estava liberado por causa de um erro momentâneo.
- **Prioridade relativa**: média.
- **Contexto mínimo pra puxar**: `AuthContext.tsx` (`fetchProfile` e
  `onAuthStateChange`) e o gate em `App.tsx`. Correção provável: em erro,
  manter o perfil anterior e mostrar "tentar de novo". Só usar `pending`
  quando não houver perfil anterior. O app também usa a forma assíncrona
  de `onAuthStateChange`, que foi descontinuada no auth-js 2.116.
- **Estado**: Aberto

### AUD-27 — A limpeza local no logout (PR #4) na prática nunca roda
- **Registrado em**: 2026-09-19 pela sessão de auditoria
- **Problema**:
  - `storage.ts` (limpeza no logout) testa `getOps(uid).length > 0`, e isso
    conta também operações `synced`. A fila mantém até 30 delas, então uma
    única operação sincronizada impede a limpeza.
  - A fila (com o texto das notas) e o ledger não estão na lista de
    remoção.
  - O teste `tests/component/storageLogout.test.tsx` usa uma operação sem
    `state`, então não pega o problema.
- **Por que importa**: num computador compartilhado de hospital, as
  respostas, notas e simulados do aluno anterior continuam no
  `localStorage`. Não aparecem na interface, mas qualquer um vê pelo
  devtools. A promessa do PR #4 não é cumprida.
- **Prioridade relativa**: média. A correção é pequena.
- **Contexto mínimo pra puxar**: `storage.ts` (logout), `syncQueue.ts`
  (`SYNCED_RETENTION`) e o teste citado.
- **Estado**: Aberto

### AUD-28 — Recuperação de progresso legado pode duplicar tentativas feitas offline
- **Registrado em**: 2026-09-19 pela sessão de auditoria (análise do
  código, não reproduzida)
- **Problema**:
  - `recoverLegacyLocalProgress` (`legacyRecovery.ts`) roda a cada
    `setActiveUser`. No boot são pelo menos duas chamadas concorrentes:
    `getSession` e `INITIAL_SESSION`.
  - Se uma resposta local não está no ledger e o servidor não tem a linha,
    ela enfileira uma operação nova com `client_op_id` novo, sem conferir
    se a fila já tem uma operação pendente para a mesma questão.
- **Por que importa**: o aluno responde offline, reabre o app online e fica
  com 2 ou 3 tentativas da mesma resposta.
- **Prioridade relativa**: média. Reproduzir antes de corrigir.
- **Contexto mínimo pra puxar**: `legacyRecovery.ts` e `syncQueue.ts`.
  Correção provável: pular questões com operação pendente e rodar uma vez
  só por UID.
- **Estado**: Aberto

### AUD-29 — Favoritar e marcar leitura decidem o estado a partir do cache local vazio
- **Registrado em**: 2026-09-19 pela sessão de auditoria
- **Problema**: `BookmarksRepository.ts` e `ReadingProgressRepository.ts`
  calculam o estado desejado ("inverter") a partir do `localStorage`. Só
  que a interface mostra o estado vindo do Supabase (`CompendiumReader.tsx`
  e `QuestionCard.tsx`), e o cache local está vazio por causa da AUD-05.
- **Por que importa**: num aparelho novo, a estrela aparece preenchida. O
  aluno clica para remover, o app grava "favoritar" e avisa "Adicionado aos
  favoritos", e ele precisa clicar de novo. O mesmo acontece com
  "desmarcar seção lida".
- **Prioridade relativa**: média. Some se a AUD-05 for resolvida, mas pode
  ser corrigida antes passando o estado desejado explicitamente.
- **Contexto mínimo pra puxar**: os dois repositórios, os dois componentes
  e AUD-05.
- **Estado**: Aberto

### AUD-30 — Observabilidade e privacidade: lacunas depois do PR #17
- **Registrado em**: 2026-09-19 pela sessão de auditoria
- **Problema**:
  1. As falhas de sincronização (`syncQueue.ts`, operação indo para
     `failed`) e os fallbacks de leitura dos `Resilient*` (`catch` que cai
     no local) não são registrados em `client_errors`.
  2. `errorReporting.ts` marca o erro como enviado antes de conferir a
     sessão, então um erro sem sessão é descartado de vez.
  3. A retenção de 90 dias, prometida em `public/privacidade.html`, é só
     manual: a consulta está em `docs/operacao/OBSERVABILIDADE.md` e não
     existe `pg_cron`.
  4. A política de privacidade não cita o `stack`, o feedback enviado pelo
     usuário nem o Google Fonts (que envia o IP ao Google). Ela ainda usa a
     marca SynapseMed e não tem link em lugar nenhum do app.
  5. O limite de 50 registros por hora (`count(*)` sem lock) passa com
     chamadas paralelas, e contas `pending` também gravam.
- **Por que importa**:
  - uma sincronização quebrada ou uma RLS errada depois de uma migration
    continua invisível para o admin, que era o objetivo do NOVO-02;
  - a promessa pública de retenção pode ser descumprida (LGPD, ver
    `docs/produto/PRODUTO.md`, seção 3).
- **Prioridade relativa**: média. Os pontos 3 e 4 são baratos e combinam
  com o item de LGPD do checklist de produto.
- **Contexto mínimo pra puxar**: `src/services/errorReporting.ts`,
  `src/lib/clientErrorReporter.ts`, migration `20260918150000_client_errors.sql`
  (o check de `kind` precisa aceitar `sync`), `public/privacidade.html` e
  `OBSERVABILIDADE.md`.
- **Estado**: Aberto

### AUD-31 — Endurecimento de privilégios no banco
- **Registrado em**: 2026-09-19 pela sessão de auditoria
- **Problema**: nenhum desses pontos é explorável hoje, mas são latentes:
  1. Funções novas nascem com EXECUTE para `PUBLIC`, e o `anon` herda. O
     `alter default privileges ... from anon` de `20260918140000` não tira
     o `PUBLIC`, e `security_guards.test.sql` não confere EXECUTE de
     função. A próxima RPC `SECURITY DEFINER` que esquecer o
     `revoke ... from public` fica chamável com a chave pública.
  2. `authenticated` tem TRUNCATE em todas as tabelas de `public`, e o
     default de tabelas novas dá TRUNCATE a `anon`. O PostgREST não emite
     TRUNCATE, então não há exploração hoje.
  3. As regras que só existem dentro das RPCs podem ser contornadas por
     escrita direta pela API:
     - `simulations`/`simulation_questions` (`FOR ALL`): o aluno altera
       score e conclusão de simulado já fechado;
     - `reading_progress`: grava qualquer percentual;
     - `feedback`: dá para inserir já com `status` "resolvido".
  4. Não há limite de tamanho em `feedback`, `notes.note_text`,
     `flashcards.front`/`back`, `error_notebook.user_notes`,
     `profiles.display_name` e `avatar_url`. Os arrays de
     `save_simulado_session` também não têm limite.
- **Por que importa**: hoje o impacto é baixo (o aluno só mexe nos
  próprios dados), mas cresce com ranking, mais usuários ou uma RPC nova
  descuidada. Os pontos 1 e 2 são uma armadilha pronta para a próxima
  migration.
- **Prioridade relativa**: média para o ponto 1 (barato, com teste pgTAP
  que reprova); baixa para os demais. Amplia a AUD-06.
- **Contexto mínimo pra puxar**: `20260903120100_rls_policies.sql`,
  `20260918140000_revoke_anon_grants.sql` e
  `supabase/tests/database/security_guards.test.sql`. Correção provável:
  `alter default privileges for role postgres revoke execute on functions
  from public` (global), um teste pgTAP de EXECUTE por `anon` e políticas
  só de SELECT/DELETE nas tabelas que têm RPC de escrita.
- **Estado**: Aberto

### AUD-32 — Pequenos endurecimentos no front e no repositório
- **Registrado em**: 2026-09-19 pela sessão de auditoria
- **Problema**:
  1. `SafeMarkdown.tsx` aceita `//site-externo` como link interno.
  2. A CSP `connect-src` aceita qualquer `*.supabase.co`, e não só o
     projeto (`vite.config.ts`).
  3. A busca de fontes em `ContentProvenanceRepository.ts` monta o
     `.or()` do PostgREST escapando só `%` e `,`. Com parênteses (por
     exemplo, "Harrison (21ª ed.)"), a busca devolve 400, e
     `SourceSelector.tsx` mostra "Fonte não cadastrada".
  4. Updates que atingem 0 linhas contam como sucesso
     (`SupabaseQuestionsRepository` e `SupabaseMaterialsRepository`, nos
     vínculos de fonte; `error_notebook_update`).
  5. `docs/archive/management-legado/audits/2026-09-14/auditar-materiais-nexusmed.mjs` usa a
     chave `service_role` e imprime conteúdo completo, e o repositório é
     público.
- **Por que importa**: são mitigações de defesa em profundidade e de
  feedback falso para o admin. O item 3 induz o revisor a erro.
- **Prioridade relativa**: baixa. Dá para agrupar num PR só.
- **Contexto mínimo pra puxar**: os arquivos citados.
- **Estado**: Aberto

### AUD-33 — Fluxos críticos do aluno sem teste e2e
- **Registrado em**: 2026-09-19 pela sessão de auditoria
- **Problema**: os 12 specs em `tests/e2e/specs` não cobrem:
  - a expiração do timer do simulado;
  - o clique duplo;
  - simulado grande com rede lenta;
  - "faça login novamente" com reenvio;
  - recarregar a página com operação pendente;
  - aluno com mais de 1000 tentativas;
  - o `localStorage` depois do logout;
  - sessão de flashcards pela interface;
  - caderno de erros;
  - painel e estatísticas;
  - favoritos e anotações em aparelho novo;
  - criação de simulado personalizado;
  - "esqueci a senha";
  - leitura offline.

  As AUD-17 a AUD-21 e AUD-25 a AUD-29 vivem justamente nessas lacunas.
- **Por que importa**: sem esses testes, as correções da 3ª rodada podem
  regredir sem ninguém notar.
- **Prioridade relativa**: média. Cada correção da 3ª rodada deve trazer o
  teste do próprio fluxo, e não é preciso um PR só de testes.
- **Contexto mínimo pra puxar**: `tests/e2e/specs/`,
  `tests/e2e/fixtures/localSupabase.ts` e
  `docs/operacao/standards/testes-e-fixtures.md`.
- **Estado**: Aberto

### AUD-34 — Operação: paridade com o remoto, monitoramento e rollback de banco
- **Registrado em**: 2026-09-19 pela sessão de auditoria
- **Problema**: nenhuma sessão de IA tem acesso ao Supabase remoto, e a
  auditoria só viu o local. Faltam:
  1. conferir que o remoto bate com o repositório (`supabase migration
     list --linked`, grants, RLS);
  2. conferir o `max_rows` da API (afeta a AUD-21);
  3. conferir se o login Google usa PKCE;
  4. levantar os limites do plano (conexões, egress, rate limit de Auth);
  5. ter monitoramento de disponibilidade;
  6. ter procedimento de rollback de migration. O RUNBOOK, seção 4, só
     cobre `vercel rollback` e `git revert`.

  Há também dois pontos de carga para o egress: o login carrega todos os
  compêndios com as seções completas, e o caderno de erros faz 1 RPC por
  questão errada.
- **Por que importa**: sem esses pontos, um problema em produção só é
  descoberto quando um aluno reclama, e uma migration errada não tem
  caminho de volta ensaiado (AUD-13).
- **Prioridade relativa**: média. Os itens 1 a 4 são leitura no dashboard,
  pelo dono do projeto, e podem ir junto com a AUD-03.
- **Contexto mínimo pra puxar**: `docs/operacao/RUNBOOK.md` (seções 3 e 4),
  `supabase/config.toml` para comparar e AUD-03 e AUD-13.
- **Estado**: Aberto — precisa da conta dona do projeto (itens 1 a 4)
