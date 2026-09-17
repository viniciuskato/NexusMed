# Auditoria de consolidação do ambiente operacional — 2026-09-17 (Fase 2)

Registro somente leitura das verificações pendentes da Fase 2 de
consolidação do ambiente. Nenhuma ação destrutiva foi tomada: nada foi
publicado, apagado, movido, arquivado, nem removido (branch/worktree), e o
Supabase remoto não foi tocado.

## 1. Clones `nexusmed-review-*` (confirmados pessoalmente)

- `C:\Users\vinic\OneDrive\nexusmed-review-20260910` — HEAD em `fb989a4`
  ("feat: implement integrated Error Notebook in dashboard"), remoto
  `origin` apontando para o GitHub oficial
  (`viniciuskato/SynapseMed-firebase-auth.git`).
- `C:\Users\vinic\OneDrive\nexusmed-review-latest` — HEAD no mesmo
  `fb989a4`, mas com `origin` apontando para o clone acima (nested clone
  local, não para o GitHub).
- `fb989a4` é muito anterior a toda a linha 07/09/11–13/21–23/40/41
  documentada em `docs/diretoria/registro.md`. Ambos os clones já constam
  na lista de "cópias antigas, não são fonte de verdade" em
  `PROJECT_STATE.md` — confirmação pessoal não encontrou conteúdo
  divergente ou único que justifique revisar essa classificação. Ambos têm
  arquivos `docs/diretoria/*.txt` não rastreados (prompts avulsos
  copiados manualmente em sessões anteriores) e uma modificação local não
  commitada em `docs/diretoria/registro.md`/`MODELO-DIRETORIA.md` — não
  inspecionado byte a byte nesta auditoria por serem clones já quarentenados
  e fora de escopo de qualquer entrega ativa.

## 2. Links de fase4/fase5 (`PROJECT_STATE.md`, seção "Riscos e quarentenas")

- `C:\Users\vinic\OneDrive\Projetos\SynapseMed\fase4-personal-repos` e
  `...\fase5-auth-supabase` existem, mas cada um contém **apenas** uma
  junção `node_modules` (para `C:\DevCache\SynapseMed\...\node_modules`) —
  nenhum arquivo de projeto, nenhum `.git`. São cascas vazias remanescentes
  de uma reorganização anterior. A classificação atual de quarentena
  ("não usar como base de trabalho, não apagar/mover sem pedido explícito")
  segue válida; não há conteúdo de código para reconciliar.

## 3. Inventário de `tmp/nexusmed-sa1-audit` e `tmp/nexusmed-tutorial-skill`

- `C:\Users\vinic\OneDrive\tmp\nexusmed-sa1-audit` (criado 2026-09-16): 5
  arquivos, ~575 KB — `Cronograma cardiologia 2026_2 oficial.png`,
  `CronogramaPneumologia oficial.png`, `nefro-page-1.png`,
  `nefro-page-2.png`, `nefro.pdf`. Conteúdo de cronograma/material de
  estudo, não relacionado ao código do NexusMed nem à Fase 2 — parece
  resíduo de uma tarefa de auditoria de compêndios/materiais, não deste
  repositório.
- `C:\Users\vinic\OneDrive\tmp\nexusmed-tutorial-skill` (criado
  2026-09-14): 1 arquivo, `SKILL.md` (~1,4 KB) — rascunho de skill,
  também não relacionado ao código do repositório.
- Espaço recuperável identificado aqui: ~577 KB no total. Nenhum dos dois
  foi tocado; decisão de remoção fica para o usuário (fora do escopo desta
  candidata, que só mexe no repositório Git).

## 4. Linhagem de scripts "AI Studio" — inventário por hash (não executados, não integrados)

Três clones locais fora do Git do repositório contêm um diretório
`scripts/`, em três gerações distintas por conteúdo (hash SHA-256):

| Script | Geração A (`base-2e342bd` / `candidate-b32ce94`, em `nexusmed-aistudio-audit-20260914`) | Geração B (`export` em `nexusmed-aistudio-audit-20260914`, `nexusmed-aistudio-clean-base-20260915`, `nexusmed-aistudio-continuar-leitura-20260915`) — idêntica ao `scripts/` atual de `origin/main` |
|---|---|---|
| `check-no-debug-bundle.mjs` | `bff593f9…` | `c530a088…` |
| `clean.mjs` | `6469a013…` | `b961b5b7…` |
| `fix-anatomia-cardiaca-caption.sql` | `33fa9038…` | `d837e2a5…` |
| `load-compendios.ts` | `7509b594…` | `6fc3f21b…` (= `origin/main`) |
| `load-pilot-cardiologia.ts` | `06fe9341…` | `2b339184…` |
| `load-questoes.ts` | `fa328d4d…` | `5290d18f…` |
| `recover-question-references.ts` | `936206ae…` | `2a23fb7f…` |
| `run-db-tests.mjs` | `54112f66…` | `052c8460…` |
| `smoke-test-remote.ts` | `08b6d4d1…` | `e9bc3625…` |
| `upload-pending-images.ts` | `3d08ed75…` | `23ffdc6d…` |
| `validate-personal-repos.ts` | `66fc029c…` | `3b933812…` |
| `validate-supabase-repos.ts` | `a17d6254…` | `96261279…` |

Scripts **únicos** à linhagem AI Studio, ausentes de `scripts/` em
`origin/main` — encontrados apenas em
`nexusmed-aistudio-continuar-leitura-20260915/scripts/`:

| Script | SHA-256 |
|---|---|
| `load-native-content.ts` | `6e47ddd3b1898fcfa496271d0537fff698c2516b4ca917355584ac153d6add1e` |
| `read-question-feedback.ts` | `7e22af8d722c5921e086a78e0e6e2d8f7230023a805d691ee7f26a3b17a90d6f` |

Nenhum script foi executado nem copiado para este repositório. Decisão
sobre se `load-native-content.ts`/`read-question-feedback.ts` têm valor a
integrar fica para uma entrega futura com escopo próprio.

## 5. Distinção documental — três coisas que não devem ser confundidas

1. **`e2e-13a-prov-admin-*@e2e.local`** — fixture **local**, criada pelo
   spec `provenance-attestation-23b.spec.ts` (suíte 13-A/23-B), no
   Supabase **local** (resetado a cada `supabase db reset`). Achado
   registrado em `PROJECT_STATE.md`/`registro.md`: contagem residual de 1
   quando o README esperava 0 — indício de limpeza incompleta em
   `finally`/`afterEach` do spec. **Não afeta produção.** Task de correção:
   TASK-2026-09-17-05.
2. **`fase3-validation-*@synapsemed.local`** — conta residual no Supabase
   **remoto**, criada por `scripts/validate-supabase-repos.ts` (script de
   validação da migração Firebase→Supabase, template
   `` `fase3-validation-${Date.now()}@synapsemed.local` ``), sobrevivente a
   um crash antes dos pontos de auto-limpeza do script. `profiles.status`
   já neutralizado (`blocked`) desde 2026-09-07. **Ainda não removida** —
   avaliada como fixture inerte, mas a remoção exige escrita destrutiva no
   remoto fora do escopo de qualquer sessão local até hoje; decisão de
   remover continua pendente de autorização explícita do usuário.
3. **Resíduo antigo de pgTAP (`*@test.local`)** — usuários que reaparecem
   a cada execução de `supabase test db`, comportamento **esperado e já
   documentado** em `docs/SINCRONIZACAO-CONFIAVEL.md` (não é bug, não gera
   ação pendente). **Já resolvido/explicado**, distinto dos dois itens
   acima.

Nenhuma conflação entre esses três itens foi encontrada nos arquivos atuais
de `origin/main` durante esta auditoria — cada um já está descrito no
contexto correto. Esta seção consolida a distinção num único lugar para
evitar confusão em sessões futuras.

## 6. Achados que ainda exigem decisão da diretoria (não resolvidos nesta candidata)

- Descartar (ou não) `work/41a-auditoria-fe20832` — conteúdo já coberto
  por 41-B/41-C; texto de `f945fa2` já preservado em
  `docs/diretoria/prompts/41-B.txt` por esta candidata.
- Remover (ou não) a conta residual `fase3-validation-*@synapsemed.local`
  no remoto — escrita destrutiva remota, exige autorização explícita.
- Corrigir o `finally`/`afterEach` do spec `provenance-attestation-23b.spec.ts`
  (TASK-2026-09-17-05, P2, pendente).
- Sanear o worktree órfão `.claude/worktrees/agent-abf9bcb34c941c5ba`
  (TASK-2026-09-17-06, P2, pendente) — fora de escopo desta candidata.
- Destino final de `tmp/nexusmed-sa1-audit` e `tmp/nexusmed-tutorial-skill`
  (item 3 acima) — não são deste repositório.
- Valor de integração (ou descarte) de `load-native-content.ts` e
  `read-question-feedback.ts` (item 4 acima).
