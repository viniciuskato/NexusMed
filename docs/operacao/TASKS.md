# TASKS.md — fila única de trabalho

> Uma tarefa, uma linha de identificador. Prioridade, estado, dependência,
> impacto em produção e próxima ação — sempre as cinco colunas. Isto
> registra o **presente e o futuro imediato**; para o diário de tudo que já
> foi executado antes de 2026-09-17, ver
> `docs/diretoria/registro.md` (painel legado, mantido intacto) e
> [`docs/archive/AGENTS-HISTORICO-2026-09-17.md`](../archive/AGENTS-HISTORICO-2026-09-17.md).
>
> Estados possíveis: `pendente` · `preparado` (prompt escrito, envio não
> confirmado) · `em execução` (usuário confirmou envio) · `retorno
> recebido/em análise` · `concluído` · `bloqueado`. Não presumir avanço de
> estado sem evidência (commit, branch, retorno colado pelo usuário) — ver
> [`SESSION_PROTOCOL.md`](SESSION_PROTOCOL.md).

## Fila ativa (a partir de 2026-09-17)

| ID | Prioridade | Estado | Dependência | Impacto em produção | Próxima ação |
|---|---|---|---|---|---|
| TASK-2026-09-17-01 — Entrega 40-A (continuidade operacional) | P1 | **concluído e publicado** (via 41-C) | Nenhuma | Nenhum — já em produção | Nenhuma — ver TASK-2026-09-17-04 |
| TASK-2026-09-17-02 — Entrega 41-A: auditar `fe20832` e restaurar reprodutibilidade | P1 (era P0) | **concluído e publicado** (via 41-C) | Nenhuma | Nenhum — já em produção | Nenhuma — ver TASK-2026-09-17-04 |
| TASK-2026-09-17-03 — Entrega 41-B: gate final da auditoria `fe20832` | P1 | **concluído e publicado** (via 41-C) | Nenhuma | Nenhum — já em produção | Nenhuma — ver TASK-2026-09-17-04 |
| TASK-2026-09-17-04 — Entrega 41-C: integrar e publicar 40-A/41-A/41-B | P1 (era P0) | **concluído e publicado** | Nenhuma | `main` avançou `fe20832` → `a359b3d` (merge `c2b412d` + registro), deploy em produção confirmado | Nenhuma — ver "RETORNO: 41-C" em `docs/diretoria/registro.md` |
| TASK-2026-09-17-05 — Corrigir limpeza residual do spec 23-B | P2 | **concluído** (PR #6, mesclado em 2026-09-18) | Nenhuma | Nenhum em produção; só testes e2e | Causa: FK `RESTRICT` de `content_reviews`/`content_revisions` para `auth.users` (mantida de propósito, ver DECISIONS.md 2026-09-18) + `deleteTestUser` ignorando o `{ error }` da Admin API. Correção: limpeza LIFO no 23-B, `deleteTestUser` lança em erro, `runCleanup` reprova o teste em qualquer falha de limpeza, nenhum `.catch(() => undefined)` restante nos specs |
| TASK-2026-09-17-06 — Sanear worktree órfão `.claude/worktrees/agent-abf9bcb34c941c5ba` | P2 | **bloqueado** — ver nota abaixo | Nenhuma | Nenhum em produção | Encerrar `node`/`esbuild` ativos na pasta (não autorizado nesta entrega) e então remover com aprovação interativa específica |
| TASK-2026-09-17-07 — Tornar `canonical` realmente canônica (main, limpa, sem worktree aninhado) | P1 | **concluído nesta entrega** — ver nota abaixo | Nenhuma | Nenhum — só limpeza local de worktrees transitórios, sem tocar main/produção/Supabase remoto | Nenhuma para `41b`/branches locais; TASK-2026-09-17-06 segue como único item aberto |
| Missão 42-A — Entrada assistida de materiais ("Importar material" no CMS) | P1 | **superada pela 42-B/42-C** — ver nota abaixo | Nenhuma | Ver 42-C | Nenhuma isolada |
| Missão 42-B — Corrigir gravação da importação para atômica (RPC `import_compendium_draft`) | P1 | **superada pela 42-C** — ver nota abaixo | Nenhuma | Ver 42-C | Nenhuma isolada |
| Missão 42-C — Publicação controlada da importação assistida (merge + migration remota + deploy) | P1 | **concluído e publicado** | Nenhuma | `main`/`origin/main` = `6d65054`, deploy confirmado em produção (bundle com o novo código, sem debug), migration remota aplicada e verificada | Smoke autenticado (Área Editorial/botão "Importar material" em produção) fica pendente para quando houver sessão de admin disponível — não bloqueia a entrega |
| Missão AS1-A — Inventário editorial e mapa taxonômico da AS1 (Saúde do Adulto 1, prova 21/09) | P1 | **concluído, não publicado; corrigido pelo complemento AS1-A.1** | Nenhuma | Nenhum — só documentação, branch candidata `docs/as1-a-inventario` local | Diretoria decide, a partir de `docs/diretoria/AS1-INVENTARIO-2026-09-17.md` e `docs/diretoria/AS1-TAXONOMIA-PILOTO-2026-09-17.md` (ambos reconciliados em 2026-09-17): (1) autorizar a ordem de produção aprovada (primeira onda 3/12/19, segunda onda 1/8/9/10/11/16, depois temas D e C restantes); (2) ampliar a associação disciplina↔questão no banco para mais de uma disciplina relacionada; (3) qual material vence em cada uma das 4 duplicatas prováveis identificadas |
| Missão AS1-B1 — Auditoria científica do tema 3 (Distúrbio Acidobásico), material "Equilíbrio Ácido-Base.pdf" | P1 | **concluído, não publicado; complementado pela AS1-B1.1 (2026-09-18)** — branch local `work/as1-b1-auditoria-acidobasico`, worktree `agent-acbd22c8eb240edfb` | Nenhuma | Nenhum — só documentação (`docs/editorial/as1/`, `docs/diretoria/prompts/AS1-B1.txt`), PDF original não tocado, nada importado no NexusMed, Supabase não tocado | Ver missão AS1-B2 abaixo (aberta e concluída em 2026-09-18) |
| Missão AS1-B2 — Correção e conversão do material de Distúrbio Acidobásico para `.compendium.yaml` | P1 | **concluído, não publicado** — branch local `work/as1-b2-conversao-acidobasico`, a partir de `work/as1-b1-auditoria-acidobasico`@`bfa2d93` | Depende da AS1-B1 (concluída) | Nenhum — só documentação e um `.compendium.yaml` de rascunho (`docs/editorial/as1/acidobase.compendium.yaml`, `docs/editorial/as1/ACIDOBASE-RELATORIO-DE-CONVERSAO-2026-09-18.md`, `docs/diretoria/prompts/AS1-B2.txt`), PDF original não tocado, Supabase não tocado, nada importado/salvo como rascunho no CMS | Ver missão AS1-B3 abaixo (aberta e concluída em 2026-09-18) |
| Missão AS1-B3 — Auditoria independente do material convertido (Distúrbio Acidobásico) | P1 | **concluído, não publicado — retificado pela AS1-B3.1 (2026-09-18)** — branch local `work/as1-b3-auditoria-conversao-acidobasico`, worktree `.claude/worktrees/as1-b3-auditoria`, a partir de `work/as1-b2-conversao-acidobasico`@`4285231` | Depende da AS1-B2 (concluída) | Nenhum — só documentação, YAML não alterado nesta missão, PDF original não tocado, Supabase local consultado só em leitura, Supabase remoto/produção/main não tocados | Ver missão AS1-B3.1 abaixo (concluída em 2026-09-18) |
| Missão AS1-B3.1 — Retificação da auditoria AS1-B3 e QA visual | P1 | **executado — verificação independente da diretoria encontrou defeito visual, ver AS1-B3.2** — branch local `work/as1-b3-1-retificacao-qa-acidobasico`, worktree `.claude/worktrees/as1-b3-1-retificacao-qa`, a partir de `work/as1-b3-auditoria-conversao-acidobasico`@`68a54d7` | Depende da AS1-B3 (concluída) | Nenhum — YAML corrigido (referência Johnson/Feehally/Floege, 5ª ed.), relatório AS1-B3 retificado, parser real validado (17 seções, 14 referências, ok:true), QA visual executado com navegador real (Playwright/Chromium) até a tela de pré-visualização (sem "Salvar rascunho"); a verificação independente da diretoria encontrou sobreposição entre o dock flutuante de navegação e o quadro de campos ausentes nessa evidência, não capturada pela conclusão original desta missão | Ver missão AS1-B3.2 abaixo (concluída em 2026-09-18) |
| Missão AS1-B3.2 — Correção da sobreposição visual do importador e retificação da matriz científica residual | P1 | **verificado pela diretoria em 2026-09-18 (sessão independente, ferramentas próprias)** — branch local `work/as1-b3-2-correcao-visual-importador-acidobasico`@`f05e697`, worktree `.claude/worktrees/as1-b3-2-correcao-visual`, a partir de `work/as1-b3-1-retificacao-qa-acidobasico`@`e6320f2` | Depende da AS1-B3.1 (executada) | Nenhum — corrigida a matriz científica residual do SODa-BIC (linha da matriz da seção 2 do relatório, sem alteração do YAML); corrigida a descrição do QA anterior (seção 10 do relatório) para registrar a sobreposição encontrada; `ImportMaterialModal.tsx` agora renderiza num overlay `fixed inset-0 z-[60]` (acima do dock, `z-40`), eliminando a sobreposição; teste de regressão E2E em `tests/e2e/specs/import-material.spec.ts` (2 casos: desktop 1400×1000 e mobile 390×844, prova por bounding box + `elementFromPoint`). **Verificação independente da diretoria**: `git diff --stat` confirma exatamente os 8 arquivos relatados; diff do componente e do teste lidos linha a linha e batem com a descrição; `tsc --noEmit` limpo; `npm run lint` 0 erros/89 warnings (baseline); `npm run test:unit` 40/40; suíte completa `import-material.spec.ts` 6/6 (Playwright/Chromium real contra Supabase local); controle negativo reexecutado pela própria diretoria (revertido só `ImportMaterialModal.tsx` para `HEAD^`, os 2 testes novos falham; restaurado, voltam a passar); `git diff --check` limpo; varredura de segredos no diff sem ocorrências; as duas evidências (`ACIDOBASE-PREVIEW-AS1-B3-1.png`/`-MOBILE.png`) inspecionadas, sem sobreposição visível; portas 3000/4183 livres após os testes; único usuário de teste residual no Supabase local é `e2e-13a-prov-admin-...@e2e.local`, resíduo pré-existente do spec 23-B (TASK-2026-09-17-05), não introduzido por esta missão nem pela verificação. YAML não tocado; Supabase remoto/produção/main/Vercel não tocados; nada importado/publicado | Usuário decide apenas (2) autorizar ou não a importação real como rascunho no CMS — ver seção de publicação em `PROJECT_STATE.md`. **(1) taxonomia RESOLVIDA em 2026-09-18**: disciplina "Nefrologia" já existia no catálogo remoto real (`73fedd18-3600-40fc-bfc3-48bf4334d70a`, sem ambiguidade — o "não encontrada" da evidência visual era efeito do QA ter rodado contra Supabase *local*, com seed mínimo); tema "Distúrbio Acidobásico" não existia e foi criado pelo usuário via `supabase db query --linked` (comando fornecido pela diretoria, escrita confirmada por leitura do próprio `RETURNING`), vinculado a essa disciplina: `cbc160bc-9666-45a2-aa73-fbfccc8a7732`. **(3) merge RESOLVIDO em 2026-09-18**: mesclado em `main` e publicado — `origin/main` = `f42917d`, deploy confirmado em produção. |
| Primeira onda editorial proposta (AS1) — Auditoria científica (Gates 7-8) + conversão para HTML dos temas 12 (Dispneia) e 19 (Endocardite Infecciosa); o tema 3 (Distúrbio Acidobásico) já teve sua auditoria concluída na missão AS1-B1 acima. Reconciliação local: decidir a duplicata da Endocardite (DOCX "em revisão" vs. `Caso 3 - Endocardite Infecciosa.pdf` + anotações) antes de fechar o tema 19 — não bloqueia o tema 12 | P1 | pendente — depende de aprovação da diretoria para abrir | Depende da AS1-A | Nenhum até publicação | Diretoria aprovar abertura, dado o prazo de prova em 21/09 |
| Segunda onda proposta (AS1) — Auditoria dos materiais que já cobrem os temas 1 (Avaliação da Função Renal), 8/9/10/11 (Hemograma/Anemias) e 16 (Semiologia Cardíaca). Reconciliação local: decidir a duplicata de Avaliação da Função Renal antes de fechar o tema 1, e a de Semiologia Cardíaca antes de fechar o tema 16 | P1 | pendente — depende de aprovação da diretoria para abrir | Depende da AS1-A | Nenhum até publicação | Diretoria aprovar abertura e decidir se roda antes ou depois da prova |
| Auditoria técnica 2026-09-18 — PRs #1 a #10 | P1 | **#1 a #8 mesclados e publicados; #9 e #10 (só documentação) em revisão** | Nenhuma | Migrations de #1, #2 e #4 aplicadas no remoto; proteção do `main` ativa (PR + checks `fast`/`full` obrigatórios) | Mesclar #9 e #10. Pendências em `docs/diretoria/BACKLOG-ESTRATEGICO.md` (AUD-01 e AUD-03 a AUD-10); AUD-01 (recuperação de senha) é a próxima de maior impacto |
| TASK-2026-09-23-03 — "Salvar" sem perda e importação já posicionada na árvore | P1 | **concluído e publicado** — PR #62 mesclado em `main` (`6d1f71d`); migration `20260923120000` aplicada no remoto ANTES do merge e verificada por leitura direta (29/29 migrations, `import_compendium_draft` resolve com 15 e com 10 parâmetros, `replace_material_links` não exposta); deploy confirmado (bundle carrega o SHA do merge, sem instrumentação de teste). CI verde: pgTAP 398/398, Playwright 47/47 | Nenhuma | Publicado. Nenhuma aprovação existente mudou de hash (0 rótulos curtos em produção); as 3 revisões aprovadas passam a sobreviver a um "Salvar" sem mudança | Corrigido: "Salvar" sem mudar nada alterava o hash atestado, recriava referências com ids novos e apagava o vínculo com fonte curada; o formulário trocava `mode` nulo por `mecanismos` e apagava `study_lens`. `nav_short_title` saiu do hash. Processo: importação já posicionada (mesma transação), erro com a causa real e "Voltar e corrigir", sucesso com trilha e próximos passos, cartão do Admin com "Na árvore" e "Publique antes, nesta ordem", botão "Salvar rascunho". Regras em [`standards/taxonomia-materiais.md`](standards/taxonomia-materiais.md) §4, §6.0, §6.1b |
| TASK-2026-09-23-04 — CI: `supabase start` barrado pelo limite do ghcr.io | P1 | **concluído e publicado** — PR #63 mesclado em `main` (`9b9c8f7`) | Nenhuma | Nenhum no app — só CI e um teste E2E | A partir de 2026-09-23 19h12 UTC o ghcr.io passou a responder `toomanyrequests` ao baixar as imagens do Supabase (5 falhas seguidas, antes de qualquer teste). Pull autenticado foi testado e descartado. Solução: imagens pelo ECR Public (gravado no `GITHUB_ENV` para o job inteiro), `supabase start -x edge-runtime,studio` com até 3 tentativas, checagem de limpeza só quando o Supabase subiu, e corrida fechada no E2E `cms-human-review-21d` (aviso do salvamento anterior fazia o teste ler o banco cedo demais — só aparecia no CI) |
| TASK-2026-09-21-01 — Importação de questões em lote ("Importar questões", RPC `import_question_draft`) já em produção (PR #49); complemento local de remoção do teto de 5 alternativas (A–E) ainda não mesclado | P1 | **RPC base já mesclada e deployada (PR #49); `20260921120000_import_question_draft.sql` aplicada ao Supabase remoto nesta sessão (autorizada pelo usuário) após INC-2026-003 revelar que a produção estava quebrada. Complemento de alternativas ilimitadas segue local, gates verdes, não commitado** | Nenhuma | Produção: RPC agora existe no remoto — falta confirmação do usuário de que o lote real de 18 questões importa com sucesso. Complemento local (teto de alternativas): nenhum impacto ainda, `20260921130000_question_options_letter_unbounded.sql` não está em nenhum commit nem no remoto | Usuário confirmar que a importação funciona agora em produção (fecha INC-2026-003); separadamente, quando o complemento de alternativas ilimitadas for commitado/revisado, abrir PR e só então aplicar `20260921130000` no remoto (RUNBOOK seção 3) + rodar `npm run test:e2e` |
| TASK-2026-09-21-02 — Filtro de status (Todas/Publicadas/Não publicadas) na listagem de Questões Comentadas do Admin | P2 | **concluído e commitado** (`e379cba`, junto com o teto de alternativas e o diagnóstico de RPC ausente) | Nenhuma | Nenhum — só frontend (filtra array já carregado), sem migration/RPC nova | Nenhuma — segue a fila normal desta branch até abrir PR |
| TASK-2026-09-21-03 — Auditoria de `Base de Estudos` (acervo Cowork) e do projeto-irmão `OneDrive/Questões`: o que falta migrar para o NexusMed | P1 | **auditoria concluída, só leitura — ver `docs/diretoria/AUDITORIA-BASE-DE-ESTUDOS-2026-09-21.md`** | Nenhuma | Nenhum — nenhum arquivo do acervo, do NexusMed ou do Supabase foi alterado | Diretoria decide a ordem (seção 7 do documento): (1) produzir os ~25 mecanismos/compêndios de `compêndios/medicina/` sem correspondente no banco pela pipeline vigente (auditoria → `.md`/`.yaml` → Admin — **não** a pipeline antiga de `compendium-extraction-prompt.md`, declarada superada nesta auditoria); (2) investigar se as questões já publicadas no NexusMed vieram do banco-irmão `Questões/_banco/banco-questoes.json` sem a auditoria editorial ter sido migrada junto; (3) decisão de produto sobre casos clínicos e guias de prova por edital, gêneros sem tipo de conteúdo no NexusMed hoje |
| TASK-2026-09-21-04 — Estender o filtro de status (TASK-2026-09-21-02) para a listagem de Conteúdos & Mecanismos e para a de Usuários no Admin | P2 | **concluído e publicado** — commitado em `e3c9101`, mesclado em `main` via PR #54 (`0539e57`) | Nenhuma | Nenhum — só frontend (filtra arrays já carregados), sem migration/RPC nova | Nenhuma |
| TASK-2026-09-22-01 — Permitir criar Tema (e futuramente Disciplina) direto na UI do Admin — pedido do usuário ao tentar importar compêndio de Endocardite sem tema correspondente em Cardiologia | P2 | **concluído e publicado** — PR #55 (`d2d1358`), mesclado em `main` (`88a0fb7`) | Nenhuma | Nenhum novo — RLS `themes_admin_write` já existia (migration `20260903120100`), só faltava UI chamando `materialsRepository.saveThemes` | Nenhuma. Segue aberto, se algum dia for pedido: criar Disciplina pela mesma UI (não implementado agora, escopo era só Tema) |
| TASK-2026-09-22-02 — Taxonomia hierárquica de materiais, piloto antibióticos/β-lactâmicos (Fase 1 + 1.5) | P1 | **concluído e publicado** — PR #57 mesclado em `main` (`8d1232e`), migrations aplicadas no Supabase remoto (`20260922120000` + `20260922130000`, mais a pendência `20260921130000`), deploy confirmado em produção (bundle carrega o SHA do merge commit) | Nenhuma | Nenhum além do já publicado: schema remoto verificado ponta a ponta (tabela renomeada com dados preservados, colunas novas, RPCs com grants corretos, `anon` sem acesso) | Nenhuma — ver TASK-2026-09-22-05 para a Fase 2 (Admin), próxima etapa autorizada |
| TASK-2026-09-22-05 — Taxonomia, Fase 2: bloco "Navegação do conteúdo" no Admin | P1 | **concluído e publicado** — PR #58 mesclado em `main` (`3d126f6`), deploy confirmado em produção (bundle carrega o SHA do merge commit, sem instrumentação de teste). CI verde (fast + full) nas duas rodadas | Nenhuma | Nenhum além do já publicado: sem migration, usa RPCs da Fase 1.5 já em produção | Substituiu o campo de texto livre "Nós de Conexão/Pré-requisitos" (nunca persistido) pelo bloco estruturado: seletor de material-pai (mesma disciplina, exclui self/descendentes), ordem entre irmãos, rótulo curto de trilha, tipo do nó, multi-seletores `Estude antes`/`Veja também` por busca (nunca texto livre), trilha resultante, bloqueio client-side de ciclo/redundância antes de chamar o servidor. Utilitário puro `src/utils/materialTree.ts` (13 testes). `docs/editorial/PADRAO-NEXUSMED-CONTEUDOS.md` atualizado. Estudante ainda NÃO recebe a nova navegação — por desenho, condição de parada da Fase 2 (plano técnico §12) — fica para a Fase 3, ainda não autorizada |
| TASK-2026-09-23-01 — Taxonomia, Fase 3: navegação da árvore para o estudante | P1 | **concluído e publicado** — PR #60 mesclado em `main` (`612b72d`), deploy confirmado em produção (bundle carrega o SHA do merge commit, sem instrumentação de teste), CI verde (fast + full) nas duas rodadas | Nenhuma | Nenhum além do já publicado: sem migration, só frontend contra o schema já em produção | Entregou trilha de navegação clicável no leitor (colapsável no celular, usa `nav_short_title`), cartões `Aprofunde-se` derivados dos filhos, caixas `Estude antes`/`Veja também` visualmente distintas, e terceiro modo de exibição da biblioteca (árvore recolhível) sobre o resultado já filtrado — tudo em `MaterialNavigation.tsx`, derivando do utilitário puro da Fase 2. Validação: 13 testes de componente novos + E2E novo de 4 casos contra Supabase local, zero fixture residual. **Dois achados corrigidos no caminho**: `deleteE2EMaterials()` falhava com link `prerequisite` (FK restrict) e deixava resíduo — 60 materiais acumulados; e o `aria-label` do botão de expandir usava o título completo enquanto o item visível usava o rótulo curto. Regras em [`standards/taxonomia-materiais.md`](standards/taxonomia-materiais.md) §6.2 |
| TASK-2026-09-23-02 — Sobreposição do "Plantão de Foco" sobre o dock inferior em telas estreitas | P3 | **pendente** | Nenhuma | Afeta produção hoje: em ~390px o widget flutuante `Plantão de Foco` (`fixed bottom-20 left-4 z-40`) cobre o primeiro item ("Biblioteca") do menu Recursos do dock inferior e o clique não chega ao destino | Achado ao escrever o E2E da Fase 3, em componentes que aquela fase não toca — por isso não foi corrigido junto. O spec `taxonomia-navegacao-fase3.spec.ts` navega em largura de desktop e só então reduz o viewport, de propósito, em vez de mascarar com `force: true`; se a sobreposição for corrigida, esse contorno pode sair. Decidir se reposiciona o widget (ex.: subir acima do dock quando o menu abre) ou reduz o z-index || TASK-2026-09-22-04 — Inventário remoto somente leitura, pré-requisito da 02 | P1 | **concluído em 2026-09-22** | Nenhuma | Nenhum — só SELECT via `SUPABASE_SERVICE_ROLE_KEY`/PostgREST, nenhuma escrita | Resultado: `material_dependencies` remoto tem 14 linhas, 14 pares distintos, **zero pares nos dois sentidos** — a migration 1.5 não falha por isso, pode aplicar direto. `questions.material_id` preenchido em **9 de 420** questões (2,1%) — confirma que o escopo de questões por nó da árvore (seção 7 do standard) não pode substituir o filtro por tema sem uma vinculação editorial em massa antes; fica registrado como bloqueio explícito, não como código a escrever agora. `material_sections.content` remoto soma ~947 mil caracteres em 836 seções (38 materiais) — ~1 MB no payload de `getCompendiums()` hoje; cresce com a árvore, mantém a leitura sob demanda como item da Fase 3 |
| TASK-2026-09-22-03 — Fase 1.5: revisão da fundação da taxonomia antes de produzir conteúdo | P1 | **concluído, não publicado** — mesma branch da 02 | Nenhuma | Nenhum: só código local e Supabase local | Corrigidos, contra o Supabase local: hash de atestação voltou a cobrir só conteúdo; pai/filho amarrados por disciplina (tema livre); teto de 8 níveis e guarda de ciclo nas travessias; exclusão determinística dos dois lados de `Veja também`; um par com uma ligação só; ancestral recusado como `Estude antes`; `nav_short_title`/`taxonomy_kind`; RPC `set_material_position`; exclusão e publicação em lote no Admin com mensagem acionável. Revisão ultra (multi-agente) rodada sobre a branch: 2 achados reais corrigidos — `publish_material` apontava o ancestral mais distante como bloqueador em vez do mais próximo; `save_compendium` misturava contadores de ordem entre `prerequisite`/`related`. pgTAP 375/375. Regras em [`standards/taxonomia-materiais.md`](standards/taxonomia-materiais.md). **Aberto, confirmado pelo inventário remoto (TASK-2026-09-22-04)**: escopo de questões por nó fica bloqueado por vinculação editorial (só 9/420 questões têm `material_id`); leitura sob demanda fica para a Fase 3 |
| 43-A — Formulário do material mais curto | P1 | **planejada — pode executar** | Nenhuma | Nenhum até publicar | Ficha em [`CICLO-DE-ESTUDO.md`](../produto/CICLO-DE-ESTUDO.md) §4. Pai primeiro (disciplina/tema herdados), ordem automática, "Estude antes"/"Veja também"/tipo do nó fora do formulário e da importação (congelar ≠ apagar), campo "Palavras-chave" |
| 43-B — Questão cobre um ou vários materiais | P1 | **planejada** | 43-A mesclada (mesma Área Editorial) | Tem migration — aplicar no remoto antes do merge | Ficha em [`CICLO-DE-ESTUDO.md`](../produto/CICLO-DE-ESTUDO.md) §4. Armadilha já conhecida: o hash de atestação da questão inclui o vínculo com material |
| 43-C — "Testar o que li" | P1 | **planejada** | 43-B | Nenhum até publicar | Ficha em [`CICLO-DE-ESTUDO.md`](../produto/CICLO-DE-ESTUDO.md) §4. Passo do ciclo que ainda não existe |
| 43-D — Busca como base de artigos científicos | P2 | **planejada — pode executar** | Nenhuma (paralela a 43-A, worktree separado) | Tem migration — aplicar no remoto antes do merge | Ficha em [`CICLO-DE-ESTUDO.md`](../produto/CICLO-DE-ESTUDO.md) §4. Busca no banco, sem acento/letra grega, relevância, trecho destacado, abre na seção |
| 43-E — Tela "Hoje" | P2 | **planejada** | 43-C | Nenhum até publicar | Ficha em [`CICLO-DE-ESTUDO.md`](../produto/CICLO-DE-ESTUDO.md) §4. Continuar lendo, testar o que li, cards do dia |

**Nota sobre a limpeza de worktrees da TASK-07 (2026-09-17, execução real)**:

- Removidas com `git worktree remove` (sem `--force`), após confirmar
  árvore limpa e nenhum processo com handle aberto na pasta:
  `worktrees/41a-consolidacao-docfix` (branch `work/41a-consolidacao-docfix`,
  ponta em `66aff30`) e `worktrees/reconciliacao-docs-pos-41c` (branch
  `work/reconciliacao-docs-pos-41c`, ponta em `0cbcb8c`). Em ambos os
  casos o `git worktree remove` desregistrou a worktree mas falhou ao
  apagar alguns arquivos da pasta física (`Permission denied` — lock
  transitório do OneDrive); confirmado que o `.git` interno já tinha sido
  removido (pasta comum, não mais um worktree Git) antes de apagar o
  restante com uma remoção de arquivo comum. As branches não foram
  apagadas — os commits `66aff30` e `0cbcb8c` continuam alcançáveis por
  elas, mas **não estão mesclados em `main` nem na candidata remota
  `work/fase2-reconciliacao-consolidada` (`552dcea`)** — são apenas
  correções de texto em `PROJECT_STATE.md`/`TASKS.md`, sobrepostas pelo
  conteúdo desta própria candidata; decisão de descartar as branches ou
  reaproveitar o texto fica para a diretoria.
- **Não removida**: `worktrees/41b-gate-final-fe20832` (branch
  `work/41b-gate-final-fe20832`, `b5a8f7f` — já mesclada em `main` via
  `c2b412d`, então sem perda de conteúdo se fosse removida). Encontrado
  processo ativo usando a pasta: `node.exe` (PID 33140, `vite --port=3000
  --host=0.0.0.0`, iniciado 2026-09-17 13:50) com filho `esbuild.exe`
  (PID 5656). Como a missão só autorizava remoção após confirmar ausência
  de processo, a remoção foi propositalmente pulada; o processo não foi
  encerrado.
- Pasta órfã `canonical/.claude/worktrees/agent-a24024165df13bbd9`
  (sem `.git`, sem processo ativo, apenas build/`node_modules` de execução
  antiga de agente) removida com aprovação interativa específica do
  usuário, sem curinga, sem tocar `agent-abf9bcb34c941c5ba` (que segue
  pendente — TASK-2026-09-17-06) nem o resto de `.claude/`.
- `canonical` confirmado em `main`, árvore limpa (só `.claude/` não
  rastreado), `main` == `origin/main` == `a359b3d`.
- Nenhum branch local apagado; nenhuma escrita em Supabase/produção/AI
  Studio/clones antigos/junções; esta candidata **não foi publicada**
  nesta sessão.

**Nota sobre a conclusão da limpeza local da Fase 2 (2026-09-17, segunda execução)**:

- Candidata `work/fase2-reconciliacao-consolidada` publicada no remoto no
  commit `555bab2` (ponta desta nota, antes de commitá-la) sem tocar `main`.
- `worktrees/41b-gate-final-fe20832`: confirmado que `node.exe` (PID 33140,
  `vite --port=3000 --host=0.0.0.0`, pai `cmd.exe` PID 8052) e `esbuild.exe`
  (PID 5656, filho do node) pertenciam só a esse servidor de dev. Ambos
  encerrados normalmente (sem `-Force`); pai `cmd.exe` também terminou.
  Árvore confirmada limpa e `git worktree remove` (sem `--force`) executado:
  desregistrou a worktree, mas voltou a falhar em apagar alguns arquivos da
  pasta física (`Permission denied`, provável lock transitório do OneDrive).
  Como da vez anterior, confirmado que a pasta já não era mais um worktree
  Git (metadados removidos) antes de eliminar o restante com uma remoção de
  arquivo comum — conteúdo já preservado no branch `work/41b-gate-final-fe20832`
  (`b5a8f7f`, mesclado em `main` via `c2b412d`), sem perda.
- Branches locais superadas apagadas: `work/41a-consolidacao-docfix`
  (`66aff30`) e `work/reconciliacao-docs-pos-41c` (`0cbcb8c`). Nenhuma branch
  remota tocada; os commits seguem alcançáveis em `origin` pelas branches
  remotas homônimas.
- Pasta `canonical/.claude/worktrees/agent-abf9bcb34c941c5ba` verificada:
  sem `.git` (confirmado — não é worktree Git), conteúdo próprio (checkout
  de `fe20832` mais `node_modules`/`dist` locais), mas **com processo ativo**:
  `node.exe` (PID 28852, `vite --port=3000 --host=0.0.0.0`) e `esbuild.exe`
  filho (PID 32692) rodando dentro dela — diferente da pasta irmã
  `agent-a24024165df13bbd9`, já removida numa entrega anterior. Como esse
  encerramento de processo não estava autorizado no escopo desta tarefa
  (só os PIDs do worktree `41b` foram autorizados) e a missão também exige
  aprovação interativa específica antes de remover, a pasta **não foi
  tocada** — TASK-2026-09-17-06 permanece bloqueada até o usuário autorizar
  encerrar esse servidor e aprovar a remoção.
- `canonical` confirmado em `main`, `main` == `origin/main`, árvore limpa
  (só `.claude/` não rastreado, como antes). Nenhuma escrita em
  Supabase/produção/AI Studio/clones antigos/junções; `main` não foi
  mesclada nem publicada nesta sessão.

## Como adicionar uma tarefa

Cada linha nova precisa, no mínimo: um identificador único e estável
(`TASK-AAAA-MM-DD-NN` ou o número de entrega da diretoria, ex. `41-A`),
prioridade (`P0` bloqueia produção/segurança, `P1` é a fila normal, `P2`
é melhoria sem urgência), estado atual, dependência explícita (ou
"nenhuma"), se toca produção/dado real, e uma próxima ação concreta — nunca
"acompanhar" ou "ver depois".

## Itens do registro legado ainda sem retorno formal (não migrados, só
sinalizados)

`docs/diretoria/registro.md` tem prompts antigos (03, 04, 05, de
2026-09-07) marcados "aguardando retorno"/"sem retorno registrado" na
abertura de suas seções, mas o mesmo arquivo tem entradas posteriores
("Concluído — 09-B", por exemplo) que sugerem que o conteúdo de pelo menos
o Prompt 03 foi efetivamente publicado depois. **Não verificado nesta
entrega** se os Prompts 04 e 05 seguem pendentes de verdade ou se foram
superados por trabalho posterior sem fechamento formal — reconciliar isso
é trabalho de conteúdo/histórico, fora do escopo da 40-A (que é só
estrutura de documentação). Se uma sessão futura for atrás disso, comece
lendo `docs/diretoria/registro.md` na íntegra, não só esta nota.
