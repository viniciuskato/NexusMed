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
- **Estado**: Aberto

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
- **Estado**: Aberto

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
- **Estado**: Aberto

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
- **Estado**: Aberto

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
  `src/services/storage.ts`, `docs/SINCRONIZACAO-CONFIAVEL.md`.
- **Estado**: Aberto

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
- **Estado**: Aberto

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
- **Estado**: Aberto

### AUD-08 — Teto de intervalo do SRS também no SQL
- **Registrado em**: 2026-09-18 pela sessão de auditoria
- **Problema**: o PR #5 limitou o intervalo do SRS a 36.500 dias em
  `srsAlgorithm.ts`; a cópia do algoritmo em SQL (`submit_flashcard_review`)
  não tem o teto. Não foi portado no mesmo PR porque o #1 recria essa
  função (dois `create or replace` concorrentes).
- **Por que importa**: paridade entre cliente e servidor; na prática o
  teto é inalcançável (décadas de revisões).
- **Prioridade relativa**: baixa; fazer depois do merge do #1 e do #5.
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
- **Estado**: Aberto

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
- **Estado**: Aberto
