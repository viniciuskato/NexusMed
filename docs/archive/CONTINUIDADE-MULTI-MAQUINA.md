# Continuidade entre notebook e PC — auditoria (Prompt 06, 2026-09-07)

> Executado nesta sessão em UMA máquina (a acessível agora). Nada aqui foi
> verificado na outra máquina — trate as seções "Checklist para a segunda
> máquina" como pendências, não como fato confirmado.

## 1. O que já é compartilhado (não depende da máquina)

- **Código-fonte via GitHub**: remoto único `origin` →
  `https://github.com/viniciuskato/SynapseMed-firebase-auth.git`. Branch
  local `main` está em `2d58efd`, **igual a `origin/main`** — sem commits
  pendentes de push.
- **Conteúdo publicado (compêndios/questões) e dados de usuário
  sincronizados com sucesso**: tudo que passou pela escrita no Supabase
  (Postgres remoto, projeto `synapsemed`, ref `jfvhwwvixwvgjfqzlkkb`)
  aparece em qualquer máquina autenticada, porque vem do backend, não do
  disco local.
- **Migrations SQL** (`supabase/migrations/*.sql`) — versionadas no Git,
  então acompanham o código. O que NÃO é garantido é que o schema remoto
  já reflita a última migration do repo (ver risco R3).
- **AGENTS.md / CLAUDE.md** — versionados, então a "memória do projeto"
  para qualquer IA viaja junto com o `git pull`. Mas ver risco R4: o
  conteúdo já está com uma inconsistência real.

## 2. O que é local ou sem sincronização confirmada

### 2.1 Trabalho não commitado nesta máquina (precisa ser preservado)

```
Modificados (Prompt 01 — correção mobile):
  AGENTS.md
  src/components/Header.tsx
  src/components/compendium/CompendiumReader.tsx
  src/components/feedback/ContextualFeedbackPopover.tsx

Não rastreados:
  preview_tmp.html
  vite.preview.config.ts
  src/_preview_tmp/  (PreviewApp.tsx, main.tsx, mockAuthContext.tsx)
```

- O diff do Header/CompendiumReader/ContextualFeedbackPopover é
  claramente a correção mobile do Prompt 01 (responsividade: quebra de
  linha da barra de ações, `aria-label`, popover de feedback centralizado
  em telas pequenas). Está intacto — nada foi alterado por esta sessão.
- O diff em `AGENTS.md` é a seção "Comunicação entre diretoria e
  executivas" adicionada pela diretoria. Também intacto.
- `preview_tmp.html`, `vite.preview.config.ts` e `src/_preview_tmp/` são
  um harness de preview isolado (app React mínimo com mock de auth,
  ~17 KB) que não está no `.gitignore`. Parecem sobra de uma sessão
  anterior testando a correção mobile sem depender do app inteiro. Não
  foram tocados nesta auditoria — decidir com o usuário se descartam ou
  se entram no `.gitignore` (não decidi por conta própria, é reversível
  e pode ser trabalho em andamento).
- **Nenhum desse trabalho existe fora desta máquina.** Se o notebook for
  aberto agora, ele não vai ter a correção mobile nem a nota de
  convenções da diretoria.

### 2.2 Segredos e variáveis de ambiente (nunca vão pelo Git — corretamente)

- `.env.local` contém `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e
  `SUPABASE_SERVICE_ROLE_KEY` (não vi os valores, só os nomes — os três
  estão preenchidos). `.gitignore` cobre `.env`/`.env.*` corretamente.
  `.env.example` documenta os nomes sem valores, mas propositalmente
  **não lista** `SUPABASE_SERVICE_ROLE_KEY` — comentário no próprio
  arquivo explica que é para não sugerir que essa chave deveria estar no
  cliente. Isso é uma decisão de segurança correta, mas significa que
  quem só olhar `.env.example` não vai saber que precisa dessa terceira
  variável para rodar `scripts/load-*.ts` localmente.
- **Risco real**: `SUPABASE_SERVICE_ROLE_KEY` dá acesso total ao banco,
  ignorando RLS. Ela existe hoje em texto plano num `.env.local` dentro
  de uma pasta sincronizada pelo OneDrive (ver risco R1). Não é exposta
  no Git, mas está exposta a qualquer sincronização de arquivo do
  OneDrive.

### 2.3 Ferramentas e configuração específicas desta máquina

- **Node/npm**: `package.json` não declara `engines`, então a versão de
  Node instalada nesta máquina não está documentada nem travada.
- **Vercel CLI**: `.vercel/` existe mas contém só `README.txt` e
  `repo.json` — **não há `project.json`**, ou seja, o projeto **não está
  linkado** via `vercel link` nesta máquina. Comandos como `vercel
  rollback`/`vercel promote` (citados no AGENTS.md como parte do
  procedimento de rollback) exigiriam rodar `vercel link` primeiro.
- **Supabase CLI**: `supabase/` (config.toml, migrations, seed.sql,
  tests) está versionado, mas o estado local do CLI
  (`supabase/.branches/`, `supabase/.temp/`) está no `.gitignore` — ou
  seja, qualquer ambiente Supabase local (Docker) desta máquina não
  acompanha o Git. A segunda máquina precisa rodar `supabase start` do
  zero se quiser testar contra Supabase local (convenção do AGENTS.md).
- **PowerShell**: AGENTS.md já registra que a política de execução desta
  máquina bloqueia `.ps1`, exigindo `npx.cmd` em vez de `npx`. Não sei se
  a outra máquina tem a mesma política — é uma configuração do Windows,
  não do projeto.
- **Firebase leftover**: `.firebase/hosting.*.cache` existe localmente
  (ignorado pelo Git), resquício da migração Firebase → Supabase já
  concluída. Inofensivo, mas é lixo local que não deveria orientar nada.
- **Configuração de IA local**: esta sessão roda em Claude Code; não há
  como esta auditoria verificar se a outra máquina tem Claude Code
  instalado/autenticado, nem se tem as mesmas skills/AGENTS.md carregado
  (isso é local ao editor, não ao repo, exceto pelo próprio arquivo
  `AGENTS.md`/`CLAUDE.md` que via Git).

### 2.4 Banco local e materiais de estudo

- Não há banco de dados local dedicado ao projeto nesta máquina (o
  Supabase local, quando existe, é efêmero via Docker/CLI e não
  versionado — ver acima).
- "Materiais de estudo" no sentido de conteúdo do app (compêndios,
  questões) vêm do Supabase remoto quando configurado — não há cópia de
  estudo em arquivo solto fora do repo que eu tenha encontrado nesta
  pasta.

## 3. OneDrive: papel na sincronização e conflito com o Git

- O repositório inteiro (`C:\Users\vinic\OneDrive\Projetos\SynapseMed\
  firebase-auth`, **incluindo a pasta `.git`**) está dentro da área
  sincronizada pelo OneDrive.
- Os arquivos verificados (inclusive dentro de `node_modules`) têm o
  atributo `ReparsePoint`, característico do OneDrive Files On-Demand.
  Isso confirma que arquivos podem existir apenas como placeholders
  ("disponível só online") em vez de estarem fisicamente no disco.
  **Não presuma que o conteúdo está disponível offline na outra
  máquina** — isso depende da configuração de "Sempre manter neste
  dispositivo" feita manualmente lá.
- **Risco R1 (o mais sério deste relatório): Git + OneDrive no mesmo
  caminho.** OneDrive sincroniza arquivo por arquivo, sem entender que
  `.git/index`, `.git/objects/` e `.git/HEAD` formam uma transação
  atômica do Git. Isso pode causar:
  - Sincronização de um `.git` em estado intermediário (ex.: durante um
    commit ou checkout) para a nuvem, e a outra máquina puxando esse
    estado inconsistente.
  - "Arquivos de conflito" do OneDrive (`nome-PC.ext`) se as duas
    máquinas editarem o mesmo arquivo do repo quase ao mesmo tempo —
    isso corrompe silenciosamente o working tree do Git (cria arquivos
    extra que o Git não reconhece, não é um merge de verdade).
  - Nesta auditoria não encontrei nenhum arquivo de conflito do OneDrive
    no momento, mas isso não é garantia de que nunca vai acontecer.
  - **A recomendação do Git/GitHub é nunca ter um repositório Git dentro
    de uma pasta sincronizada por serviço de nuvem tipo OneDrive/Dropbox
    justamente por isso.** Não sugiro mover a pasta nesta etapa (foi
    pedido explicitamente para não mexer), mas é o ajuste estrutural
    mais importante da lista de prioridades abaixo.
- Enquanto o repo continuar dentro do OneDrive, o fluxo de troca entre
  máquinas (seção 5) deve depender do **GitHub como fonte da verdade**,
  nunca do OneDrive terminar de sincronizar sozinho — sempre fechar o
  editor/parar processos de build e confirmar `git status` limpo antes
  de considerar a troca de máquina segura.

## 4. Dados compartilhados (Supabase) vs. dados só locais

Toda a camada de dados de progresso do usuário segue o mesmo padrão
"Resilient*Repository" (`src/repositories/*Repository.ts`, sem prefixo
`Supabase`): grava **sempre** no `localStorage` do navegador primeiro,
e tenta espelhar no Supabase **em melhor esforço, engolindo erro
silenciosamente** (`try { await supa... } catch {}`). Isso vale para:

- Respostas de questões (`AnswersRepository`)
- Flashcards e progresso de SRS (`FlashcardsRepository`)
- Favoritos (`BookmarksRepository`)
- Notas pessoais (`NotesRepository`)
- Progresso de leitura de compêndio (`ReadingProgressRepository`)
- Simulados (`SimuladosRepository`)
- Caderno de erros (`ErrorNotebookRepository`)
- Reações 👍/👎 em questões (`QuestionReactionsRepository`)
- Feedback contextual (`FeedbackRepository`)

**Consequência prática para troca de dispositivo:**

- **Risco R2**: se a gravação no Supabase falhar silenciosamente (rede
  instável, `.env` mal configurado, RLS bloqueando por algum motivo) — o
  usuário não vê erro nenhum — os dados ficam **só no `localStorage`
  daquele navegador**. Ao abrir o app em outro dispositivo (ou outro
  navegador na mesma máquina, ou uma aba anônima), esses dados
  simplesmente não aparecem. Não há fila de reenvio nem indicador visual
  de "isso não sincronizou".
- Além disso, `localStorage` é isolado por **origem do navegador**, não
  pelo dispositivo — trocar de navegador na mesma máquina tem o mesmo
  efeito que trocar de máquina.
- Em leitura, o padrão inverso também existe: se a leitura do Supabase
  falhar, o app cai para o `localStorage` local (que pode estar
  desatualizado) sem avisar o usuário que está vendo dados velhos.
- Conteúdo administrativo (compêndios, questões — `MaterialsRepository`,
  `QuestionsRepository`) segue o mesmo padrão. Uma edição feita na Área
  Editorial nesta máquina, se o espelhamento pro Supabase falhar
  silenciosamente, fica presa no `localStorage` do navegador do editor e
  não aparece para os usuários nem na outra máquina.
- **Isso já está registrado como armadilha conhecida** no próprio
  AGENTS.md (item 6: "padrão de `catch {}` vazio engolindo erros de
  escrita no Supabase"), mas o texto atual do AGENTS.md fala dele só no
  contexto do incidente do AI Studio — vale generalizar a advertência
  para qualquer repositório `Resilient*`, não só para código externo.

**Não há uso de IndexedDB** neste projeto — toda persistência local é
via `localStorage` (`src/services/storage.ts`).

## 5. Inconsistência encontrada no próprio AGENTS.md (Risco R4)

O commit `2d58efd` ("feat(feedback): feedback contextual...") **já está
em `main` e já foi enviado para `origin/main`** — não há commits
pendentes de push. Só que a seção "Estado atual" do `AGENTS.md`, na
íntegra do HEAD atual (não é parte do diff não commitado), ainda
descreve esse trabalho como estando "na branch `feature/feedback-
contextual` (AINDA NÃO mesclado em `main`, migration AINDA NÃO aplicada
no remoto)". Ou seja: o código já foi mesclado, mas o texto que deveria
avisar a próxima sessão sobre isso não foi atualizado no mesmo commit.

**Por que isso importa para troca de máquina**: `AGENTS.md` é o
mecanismo que o projeto já escolheu para uma sessão nova (em qualquer
máquina) não redescobrir o estado do projeto. Se ele estiver
desatualizado, uma sessão executiva na outra máquina pode:
- Presumir que a migration `20260907130000_feedback_contextual.sql`
  ainda não foi aplicada no Supabase remoto e tentar aplicá-la de novo
  (idealmente idempotente, mas não é garantido sem inspecionar o SQL).
- Perder tempo procurando uma branch `feature/feedback-contextual` que
  não existe mais (nem local, nem remota — só existe `main`).

Não teria como esta auditoria confirmar com segurança, sem tocar no
Supabase remoto, se a migration `20260907130000_feedback_contextual.sql`
já foi de fato aplicada lá — isso é justamente o tipo de verificação que
o AGENTS.md pede para ser feita com uma query direta antes de confiar em
qualquer mensagem de sucesso. Fica como pendência explícita para a
diretoria/próxima sessão executiva confirmar e corrigir o texto.

## 6. Checklist para preparar a segunda máquina

Nada abaixo foi executado ou verificado nesta sessão — é o roteiro para
alguém rodar na outra máquina.

1. `git clone https://github.com/viniciuskato/SynapseMed-firebase-auth.git`
   **fora de qualquer pasta sincronizada por nuvem** (OneDrive, Dropbox,
   Google Drive) — ver risco R1. Se por algum motivo precisar ficar
   dentro do OneDrive mesmo assim, pelo menos confirmar que a pasta está
   marcada "sempre manter neste dispositivo" e nunca abrir o projeto em
   duas máquinas simultaneamente.
2. Instalar a mesma versão principal de Node/npm usada no notebook (não
   documentada no `package.json` — perguntar ao usuário qual versão está
   rodando lá, ou padronizar e registrar em `engines` no `package.json`
   como parte dos ajustes recomendados).
3. `npm install`.
4. Criar `.env.local` a partir de `.env.example`, preenchendo:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (não documentada no `.env.example` de
     propósito — só necessária se essa máquina for rodar os scripts
     `scripts/load-*.ts`; se for só desenvolvimento de frontend, as duas
     primeiras bastam).
   Transferir os valores por um canal seguro (gerenciador de senhas,
   nunca por chat/e-mail em texto puro); não colar os valores em
   arquivos versionados nem em prints.
5. Se for testar contra Supabase local: instalar Supabase CLI e rodar
   `supabase start` (vai puxar `supabase/config.toml`, `migrations/` e
   `seed.sql` do próprio repo — nenhum segredo adicional necessário para
   o ambiente local, que usa chaves de desenvolvimento padrão do CLI).
6. Se for rodar `vercel rollback`/`vercel promote` a partir dessa
   máquina: `vercel link` (autenticação própria, não compartilha config
   com esta máquina — aqui nem está linkado, ver seção 2.3).
7. Conferir a política de execução do PowerShell (`Get-ExecutionPolicy`)
   — se bloquear scripts `.ps1`, usar `npx.cmd` em vez de `npx`, como já
   registrado no AGENTS.md.
8. Ler `AGENTS.md` e `CLAUDE.md` inteiros antes de qualquer mudança —
   mas com a ressalva da seção 5 acima (a seção "Estado atual" pode
   estar desatualizada até alguém corrigir).
9. Não presumir que dados de progresso de estudo (respostas, flashcards
   revisados, notas, favoritos) do notebook aparecerão automaticamente —
   eles só aparecem se tiverem sido gravados com sucesso no Supabase
   (usuário autenticado com a mesma conta, e sem falha silenciosa — ver
   risco R2).

## 7. Rotina de troca entre máquinas (sem disparar deploy)

Push em `main` já dispara deploy automático no Vercel — por isso a
rotina de troca de máquina deve usar uma branch de trabalho, nunca
empurrar direto para `main` só para sincronizar.

**Ao encerrar em uma máquina:**
1. `git status` para ver o que está sujo.
2. Se o trabalho estiver pela metade: `git checkout -b work/<nome-curto>`
   (ex.: `work/mobile-fix-continuacao`), `git add` dos arquivos
   relevantes (revisar a lista, não usar `git add -A` às cegas — há
   arquivos soltos como `preview_tmp.html` que talvez não devam entrar),
   `git commit`, `git push -u origin work/<nome-curto>`. Isso NÃO
   dispara deploy (só `main` dispara).
3. Se o trabalho estiver pronto para ir ao ar: seguir a convenção atual
   do projeto (commit direto em `main`, rodar `tsc --noEmit` + `npm run
   build` antes — já documentado no AGENTS.md) — mas isso é uma decisão
   consciente de "publicar agora", não parte da rotina de troca de
   máquina.
4. Anotar em `AGENTS.md`/`CLAUDE.md` (ou no registro de decisões da
   seção 8) o que ficou pendente e em qual branch.

**Ao retomar na outra máquina:**
1. `git fetch --all` e `git status` antes de qualquer coisa.
2. `git checkout work/<nome-curto>` (ou `git pull` se já for `main`).
3. Continuar o trabalho; ao terminar, decidir entre abrir PR/mesclar
   manualmente em `main` (o que dispara deploy) ou deixar a branch aberta
   para a próxima sessão.
4. Branches `work/*` que já foram mescladas podem ser apagadas
   (`git push origin --delete work/<nome-curto>`) para não acumular lixo.

Isso evita o único mecanismo hoje disponível para "sincronizar as
máquinas" (push em `main`) ser usado por engano como atalho — o que
dispararia deploy de código potencialmente incompleto.

## 8. Registro versionado de decisões da diretoria (proposta)

Hoje as decisões e o acompanhamento de prompts vivem só na conversa da
sessão de diretoria — se a conversa não estiver disponível, uma nova
sessão (em qualquer máquina) não tem como reconstruir o histórico.
Proposta mínima, sem inventar tooling novo:

- Criar `docs/diretoria/registro.md` (versionado no Git, então some
  automaticamente com o `git pull`/`git clone`), com uma entrada por
  prompt encaminhado, no formato:

  ```
  ## Prompt NN — <título curto> (vN, <data>)
  Status: preparado | aguardando retorno | retorno recebido/em análise | concluído
  Dependências: <prompt(s) anterior(es) ou "nenhuma">
  Resumo do prompt: <1-3 frases, não copiar o prompt inteiro>
  Retorno: <link do commit/branch, ou "colar aqui o bloco RETORNO DO PROMPT NN quando chegar">
  ```

- Cada sessão de diretoria, ao gerar um novo prompt, adiciona/atualiza a
  entrada correspondente nesse arquivo antes de encerrar. Cada sessão
  executiva, ao terminar, cola o próprio "RETORNO DO PROMPT NN" também
  no arquivo (não só na conversa), e atualiza o status.
- Isso não substitui a tabela de acompanhamento dentro da conversa
  (continua útil para leitura humana em tempo real), mas dá uma cópia
  persistente e versionada que sobrevive à troca de máquina, de sessão,
  ou de ferramenta de IA.
- Não criei esse arquivo agora — é uma proposta para a diretoria decidir
  o formato exato antes de eu (ou uma próxima executiva) criar.

## 9. Riscos concretos — resumo

| # | Risco | Gravidade |
|---|---|---|
| R1 | Repositório Git inteiro (incl. `.git/`) dentro de pasta sincronizada pelo OneDrive com Files On-Demand — risco de corrupção do working tree ou de sincronizar estado intermediário do Git | Alto |
| R2 | Dados de progresso do usuário (`Resilient*Repository`) gravam local-first e espelham no Supabase engolindo erro silenciosamente — podem nunca aparecer na outra máquina sem aviso nenhum | Alto |
| R3 | `AGENTS.md` desatualizado: código de `feedback contextual` já mesclado e enviado a `main`, mas o texto ainda descreve como pendente numa branch que não existe mais | Médio |
| R4 | `SUPABASE_SERVICE_ROLE_KEY` (acesso total ao banco) vive em `.env.local` dentro da árvore sincronizada pelo OneDrive | Médio |
| R5 | Projeto Vercel não está linkado localmente (`vercel link` pendente) — comandos de rollback/promote citados no AGENTS.md não funcionam nesta máquina sem esse passo | Baixo |
| R6 | `package.json` sem `engines` — versão de Node não travada nem documentada entre máquinas | Baixo |
| R7 | Arquivos soltos não rastreados e fora do `.gitignore` (`preview_tmp.html`, `vite.preview.config.ts`, `src/_preview_tmp/`) — ficam presos nesta máquina e podem ser perdidos ou confundidos com lixo | Baixo |

## 10. Ajustes recomendados, em ordem de prioridade

1. **Tirar o repositório Git de dentro do OneDrive** (mover a pasta para
   fora da árvore sincronizada, ex. `C:\Users\vinic\dev\SynapseMed\
   firebase-auth`, ou desativar sincronização daquela subpasta
   especificamente). É o único item desta lista que resolve uma causa
   estrutural em vez de um sintoma — mas é uma mudança de estado que
   pedi para não fazer nesta etapa; fica como recomendação para
   autorização explícita.
2. **Adicionar um mecanismo de fila/retry ou pelo menos um log visível
   de falha de sincronização** nos `Resilient*Repository` — hoje o
   `catch {}` silencioso é indistinguível de "sincronizou com sucesso"
   do ponto de vista do usuário. Mesmo um `console.warn` ou uma flag
   "não sincronizado" no registro local já reduziria o risco R2.
3. **Corrigir a seção "Estado atual" do `AGENTS.md`** para refletir que
   o feedback contextual já está em `main`/`origin main`, e confirmar
   (por sessão executiva, com query direta como o próprio arquivo
   recomenda) se a migration já foi aplicada no remoto.
4. Criar `docs/diretoria/registro.md` conforme a seção 8, para o
   histórico de prompts não depender só da conversa corrente.
5. Adotar a rotina de branch `work/*` (seção 7) como convenção
   documentada no `AGENTS.md`, para não haver tentação de usar push em
   `main` como mecanismo de sincronização entre máquinas.
6. Declarar `engines.node` no `package.json` com a versão realmente
   usada nesta máquina, e confirmar/alinhar com o notebook.
7. Rodar `vercel link` nesta máquina (ou documentar por que não é
   necessário) para os comandos de rollback citados no AGENTS.md
   funcionarem quando precisar.
8. Decidir o destino de `preview_tmp.html`, `vite.preview.config.ts` e
   `src/_preview_tmp/` (versionar, mover para fora do repo, ou apagar) e
   ajustar o `.gitignore` de acordo.

---

## 11. Complemento (2026-09-07) — procedimento de transição para clone fora do OneDrive

> Decisão da diretoria: a arquitetura-alvo é um clone Git independente
> **fora do OneDrive em cada máquina**, com transporte de trabalho pelo
> GitHub. Esta seção documenta o procedimento; **nada abaixo foi
> executado nesta etapa** — a pasta atual continua intacta até a
> conferência da transição. Nenhum commit, push, deploy ou movimentação
> de diretório foi feito para produzir esta seção.

### 11.0 Aviso: working tree em edição concorrente

No momento em que este procedimento foi escrito, **outra sessão
executiva estava editando este mesmo working tree ao vivo** —
`src/repositories/SupabaseMaterialsRepository.ts` passou de "sem
alteração" para "modificado" entre duas checagens de `git status -s`
feitas com segundos de diferença nesta auditoria. Isso é evidência de
que o trabalho do Prompt 03 (recuperação/exibição de referências) está
em andamento nesta máquina agora. Consequência prática:

- **A transição real só deve começar quando não houver nenhuma sessão
  ativa escrevendo neste working tree.** Um baseline de integridade
  (checksums) capturado enquanto algo mais está gravando é inútil — pode
  faltar metade de uma edição.
- O arquivo `docs/diretoria/baseline-transicao-2026-09-07.txt` (gerado
  nesta sessão) é só uma **referência do estado observado agora**, não o
  baseline que deve valer no dia da transição. Regenerar o comando da
  seção 11.3 imediatamente antes de transferir, com todas as sessões de
  IA e o editor fechados.

### 11.1 Inventário do que existe hoje fora de `HEAD` (categorizado)

| Categoria | Arquivos | Tratamento na transição |
|---|---|---|
| **Trabalho de código (rastreado, modificado)** | `AGENTS.md`, `scripts/load-questoes.ts`, `src/components/Header.tsx`, `src/components/compendium/CompendiumReader.tsx`, `src/components/feedback/ContextualFeedbackPopover.tsx`, `src/components/questions/QuestionCard.tsx`, `src/repositories/AnswersRepository.ts`, `src/repositories/QuestionsRepository.ts`, `src/repositories/SupabaseMaterialsRepository.ts`, `src/repositories/questionReviewMapper.ts`, `src/types/index.ts` | Levar via **commit em branch + push pro GitHub** (nunca copiar `.git` pelo OneDrive) |
| **Trabalho de código (não rastreado, claramente fonte)** | `scripts/recover-question-references.ts`, `supabase/migrations/20260907140000_question_references_in_review.sql` | Idem — `git add` explícito (nomeado, nunca `-A` às cegas) + commit + push |
| **Relatório desta auditoria** | `docs/CONTINUIDADE-MULTI-MAQUINA.md`, `docs/diretoria/` (novo) | Levar via commit + push (é documentação do projeto, não trabalho de código) |
| **Harness de preview (status indefinido)** | `preview_tmp.html`, `vite.preview.config.ts`, `src/_preview_tmp/` | **Não apagar.** Confirmar com a executiva do Prompt 01 se isso ainda é necessário para o trabalho dela antes de decidir entre versionar ou descartar. Enquanto não houver confirmação, transportar do mesmo jeito que o resto (branch dedicada, ver 11.2), para não ficar preso só nesta máquina nem se perder |
| **Segredos** | `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) | **Nunca** via Git, **nunca** via cópia de arquivo pelo OneDrive. Ver 11.4 |
| **Gerado localmente / regenerável** | `node_modules/`, `dist/`, `.vercel/`, `.firebase/`, `supabase/.branches/`, `supabase/.temp/`, `load-*.report.txt` | **Não transportar.** Regenerar no destino (`npm install`, `supabase start`, etc.) |

### 11.2 Procedimento de transição (passo a passo)

**Pré-condição obrigatória**: confirmar que nenhuma sessão de IA ou
editor está com o repositório aberto/editando (ver 11.0). Rodar `git
status -s` duas vezes com alguns segundos de intervalo — se o resultado
mudar entre as duas, ainda há atividade; esperar estabilizar.

**Passo 1 — Baseline "antes" (seguro, só leitura)**
```powershell
cd "C:\Users\vinic\OneDrive\Projetos\SynapseMed\firebase-auth"
git status -s
git rev-parse HEAD
git rev-parse origin/main
```
Confirmar: `HEAD` == `origin/main` (sem commits pendentes de push) e
anotar a lista exata de arquivos modificados/não rastreados. Regerar o
arquivo de checksums (mesmo comando usado para gerar
`docs/diretoria/baseline-transicao-2026-09-07.txt`, adaptando a lista de
arquivos para o que `git status -s` mostrar naquele momento).

**Passo 2 — Consolidar o trabalho em branches (requer autorização
explícita para commitar/dar push — não incluso nesta etapa)**
```powershell
git checkout -b work/transicao-onedrive-2026-09-07
git add AGENTS.md scripts/load-questoes.ts src/components/Header.tsx `
  src/components/compendium/CompendiumReader.tsx `
  src/components/feedback/ContextualFeedbackPopover.tsx `
  src/components/questions/QuestionCard.tsx `
  src/repositories/AnswersRepository.ts `
  src/repositories/QuestionsRepository.ts `
  src/repositories/SupabaseMaterialsRepository.ts `
  src/repositories/questionReviewMapper.ts `
  src/types/index.ts `
  scripts/recover-question-references.ts `
  supabase/migrations/20260907140000_question_references_in_review.sql `
  docs/CONTINUIDADE-MULTI-MAQUINA.md docs/diretoria/
git status
git commit -m "wip: consolida trabalho em andamento antes da transição para clone fora do OneDrive"
git push -u origin work/transicao-onedrive-2026-09-07
```
Se a diretoria decidir manter os arquivos de preview no repositório,
adicionar também `preview_tmp.html`, `vite.preview.config.ts` e
`src/_preview_tmp/` ao mesmo commit (ou a um commit separado claramente
identificado como "harness de preview, remover após confirmação do
Prompt 01"). **Revisar a saída de `git status` antes do commit** — não
usar `git add -A`.

Isso **não** dispara deploy porque é uma branch, não `main`.

**Passo 3 — Criar o clone novo, fora do OneDrive**
```powershell
git clone https://github.com/viniciuskato/SynapseMed-firebase-auth.git `
  C:\Users\vinic\dev\NexusMed\firebase-auth
cd C:\Users\vinic\dev\NexusMed\firebase-auth
git fetch origin
git checkout work/transicao-onedrive-2026-09-07
```
(`C:\Users\vinic\dev\NexusMed\firebase-auth` é uma sugestão de caminho —
qualquer pasta fora de `OneDrive`, `Dropbox` etc. serve; ajustar
conforme preferência.)

**Passo 4 — Verificação "depois" (comparação byte a byte)**
```powershell
cd C:\Users\vinic\dev\NexusMed\firebase-auth
git rev-parse HEAD
```
Deve bater com o commit criado no Passo 2. Depois, comparar os
checksums:
```powershell
Get-FileHash AGENTS.md, scripts\load-questoes.ts, src\components\Header.tsx, `
  src\components\compendium\CompendiumReader.tsx, `
  src\components\feedback\ContextualFeedbackPopover.tsx, `
  src\components\questions\QuestionCard.tsx, `
  src\repositories\AnswersRepository.ts, `
  src\repositories\QuestionsRepository.ts, `
  src\repositories\SupabaseMaterialsRepository.ts, `
  src\repositories\questionReviewMapper.ts, `
  src\types\index.ts, `
  scripts\recover-question-references.ts, `
  supabase\migrations\20260907140000_question_references_in_review.sql `
  -Algorithm SHA256
```
Comparar cada hash com o baseline regenerado no Passo 1 (mesmos
arquivos, mesmo algoritmo). **Qualquer divergência = não prosseguir**,
investigar antes de continuar (ex.: normalização de fim de linha
LF/CRLF pode alterar o hash sem alterar o conteúdo logicamente — nesse
caso comparar com `git diff` entre as duas árvores em vez de só o hash
bruto).

**Passo 5 — Verificação funcional no clone novo**
```powershell
npm install
Copy-Item .env.example .env.local   # depois editar com os valores reais, ver 11.4
npm run lint    # tsc --noEmit
npm run build
npm run dev
```
Abrir o app localmente e confirmar que carrega, autentica e mostra
conteúdo — só então considerar o clone novo "funcional".

**Passo 6 — Manter a pasta antiga intacta até conferência**
Por decisão explícita da diretoria, a pasta dentro do OneDrive **não é
apagada nem movida nesta etapa nem na próxima automaticamente** — fica
como está até alguém confirmar visualmente, no clone novo, que:
(a) o histórico de commits é idêntico (`git log` bate);
(b) o trabalho da branch `work/transicao-onedrive-2026-09-07` está
100% presente e sem diferenças (Passo 4);
(c) o app builda e roda.
Só depois disso a diretoria decide o que fazer com a pasta antiga
(arquivar, remover da sincronização do OneDrive, ou apagar).

### 11.3 Comando de baseline (para regenerar antes da transição real)

```bash
cd "C:\Users\vinic\OneDrive\Projetos\SynapseMed\firebase-auth"
{
  echo "# Baseline de integridade — $(date -Iseconds)"
  git rev-parse HEAD
  git rev-parse origin/main
  git diff --name-only | while read -r f; do sha256sum "$f"; done
  git status -s | awk '/^\?\?/{print $2}' | while read -r f; do
    if [ -d "$f" ]; then find "$f" -type f | sort | while read -r ff; do sha256sum "$ff"; done
    else [ -f "$f" ] && sha256sum "$f"; fi
  done
} > "docs/diretoria/baseline-transicao-$(date +%F).txt"
```
(Requer Git Bash — no PowerShell puro, usar `Get-FileHash` como no
Passo 4, arquivo por arquivo.)

### 11.4 Configuração de ambiente por máquina (sem expor credenciais)

Variáveis necessárias, por finalidade — nomes apenas, nenhum valor
aparece neste documento nem deveria aparecer em nenhum outro:

| Variável | Necessária para | Sensibilidade |
|---|---|---|
| `VITE_SUPABASE_URL` | Rodar o frontend (`npm run dev`/`build`) em qualquer máquina | Pública por natureza (vai no bundle do cliente) |
| `VITE_SUPABASE_ANON_KEY` | Rodar o frontend em qualquer máquina | Pública por natureza (protegida pelo RLS, não por sigilo) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Só** para scripts administrativos (`scripts/load-*.ts`, `scripts/recover-question-references.ts`) — nunca é usada pelo frontend nem deve ganhar prefixo `VITE_` | Alta — acesso total ao banco, ignora RLS |

Transporte recomendado para a segunda máquina:
- Copiar os três valores para um gerenciador de senhas (ou anotá-los
  manualmente a partir do painel do Supabase, que é a fonte da verdade)
  e digitá-los no `.env.local` da máquina nova a partir de lá.
- **Não** copiar o arquivo `.env.local` em si por OneDrive, e-mail, chat
  ou qualquer outro canal não criptografado ponta a ponta.
- Se a máquina nova só vai rodar o frontend (não vai carregar conteúdo
  nem rodar scripts administrativos), **não precisa** de
  `SUPABASE_SERVICE_ROLE_KEY` — só as duas primeiras.
- `.env.example` já documenta os nomes das duas variáveis de frontend;
  vale considerar adicionar `SUPABASE_SERVICE_ROLE_KEY=` comentada lá
  (só o nome, sem valor) para quem for configurar uma máquina nova saber
  que ela existe e quando é necessária — decisão da diretoria, não feita
  nesta etapa.

### 11.5 Recuperação em caso de falha na transição

- Se o Passo 4 (verificação de checksum) encontrar divergência: **não
  prosseguir para o Passo 5**. A pasta antiga continua sendo a fonte da
  verdade até o clone novo bater 100%. Investigar a causa (normalização
  de linha, encoding, arquivo esquecido no commit) antes de tentar de
  novo.
- Se o Passo 5 (build/lint/dev) falhar no clone novo por motivo de
  ambiente (Node, dependência nativa, etc.) e não por conteúdo: o
  trabalho em si não foi perdido (está na branch, no GitHub) — o
  problema é local à máquina nova, resolver como problema de ambiente,
  sem tocar na branch nem na pasta antiga.
- Em qualquer momento antes do Passo 6 ser concluído com sucesso, a
  pasta antiga dentro do OneDrive continua sendo a versão confiável — a
  transição só é considerada segura para descartar a pasta antiga depois
  que (a), (b) e (c) do Passo 6 forem confirmados por alguém olhando de
  fato, não por suposição.
- Se, depois da transição considerada bem-sucedida, aparecer a
  necessidade de recuperar algo que ficou só na pasta antiga (ex.: um
  arquivo esquecido fora do commit): copiar esse arquivo pontualmente
  (não a pasta inteira, não o `.git`) para o clone novo antes de
  descontinuar a pasta antiga.

### 11.6 Estado da transição — caminho ativo (2026-09-08)

Autorizada pela diretoria (gate 06-C) e executada nesta data:

- **Caminho ativo a partir de agora:**
  `C:\Users\vinic\dev\NexusMed\firebase-auth` (este clone).
- **Origem** (`C:\Users\vinic\OneDrive\Projetos\SynapseMed\firebase-auth`)
  **permanece intacta como cópia de segurança**, sem apagar, mover ou
  renomear, até decisão posterior do usuário.
- Branch consolidada: `work/consolidacao-diretoria-2026-09-08`,
  commit `1e89a2f18f0d16d1b2aec40386ec44d5dc47f331`. `main` e
  `origin/main` permanecem em `2d58efd99947cd00458c1716501ad6451c49ec8d`
  — não foram alteradas nesta transição, sem merge/push em `main`, sem
  deploy, sem escrita no Supabase remoto.
- Clone feito via `git clone --branch work/consolidacao-diretoria-2026-09-08
  --single-branch` do remoto GitHub (não via cópia local do `.git` pelo
  OneDrive).
- Verificações realizadas neste clone, todas com sucesso, antes desta
  declaração: `npm install`, `npx tsc --noEmit` (sem erros), `npm run
  build` (build de produção concluído, mesmo aviso pré-existente de
  chunk >500kB), `.env.local` transferido por cópia local pontual (não
  versionado, confirmado ignorado pelo Git aqui), checksums de conteúdo
  de todos os 120 arquivos rastreados confirmados idênticos entre origem
  e destino a partir do blob do Git (`git cat-file -p HEAD:<arquivo> |
  sha256sum`), que é a fonte de verdade — não a partir de sha256 direto
  do working tree, que difere por normalização CRLF/LF (`core.autocrlf`
  aplicado no checkout de cada máquina; ver nota abaixo).
- **Diferença esperada e não é divergência de conteúdo**: o sha256 direto
  dos arquivos de texto no *working tree* difere entre origem (LF) e este
  clone (CRLF), porque `core.autocrlf=true` normaliza terminadores de
  linha no checkout. Confirmado com `git hash-object` (idêntico nos dois
  lados) e com o blob do commit (`git cat-file -p HEAD:<arquivo>`,
  idêntico nos dois lados) — o conteúdo versionado é byte-a-byte o
  mesmo; só a materialização em disco muda os terminadores de linha.
- Checklist para o notebook: repetir o mesmo procedimento — clonar
  `work/consolidacao-diretoria-2026-09-08` (ou a branch vigente na época)
  do GitHub para um diretório fora de qualquer pasta sincronizada
  (OneDrive/Google Drive/etc.), copiar `.env.local` manualmente (nunca
  pelo Git), rodar `npm install`, `npx tsc --noEmit` e `npm run build`
  antes de considerar o notebook pronto para uso.
- Pendências: `main` segue sem receber este trabalho — publicação em
  produção depende de decisão futura da diretoria (merge/PR explícito,
  fora do escopo desta transição). A pasta de origem no OneDrive não foi
  descontinuada e não deve ser apagada só por esta transição ter sido
  bem-sucedida.
