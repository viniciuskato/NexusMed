---
id: INC-2026-003
status: verifying
severity: alta
area: questoes-import
detected_at: 2026-09-21
owner: nexusmed
pr: 49
commits: []
prevention:
  test: true
  ci: false
  standard: false
  runbook: false
---

# INC-2026-003 — Import de um lote inteiro de questões falha em massa com "Could not find the function ... in the schema cache"

## Sintoma e impacto

Usuário tentou importar um lote real de 18 questões (Pneumologia/
Espirometria, `.md` no formato de
`docs/editorial/PADRAO-NEXUSMED-QUESTOES.md`) pela tela **Admin →
Questões Comentadas → Importar questões**. As 18 linhas foram
pré-visualizadas como "Prontas" (sem erro de parsing), mas **todas as
18** falharam ao confirmar, cada uma com:

```
Questão N: Could not find the function public.import_question_draft(p_clinical_vignette, p_cycle, p_difficulty, p_discipline_id, p_general_commentary, p_high_yield_summary, p_id, p_institution, p_options, p_question_stem, p_tags, p_theme_id, p_year) in the schema cache
```

Nenhuma questão do lote foi criada. Falha uniforme em 100% das linhas —
não é um problema de dado de uma questão específica.

**Severidade real (revista após a investigação): alta, não média.**
`origin/main` já continha `b00e7b5`, merge da PR #49
(`feat/questoes-markdown-previa-busca-overflow`, até o commit
`1803548`) — ou seja, o botão "Importar questões" e o código que chama
`import_question_draft()` **já estavam publicados em produção**
(`synapse-med-firebase-auth.vercel.app`, deploy automático da Vercel),
confirmado pelo usuário com print da própria tela em produção. Não era
uma branch aguardando merge: era uma funcionalidade já no ar, quebrada
para qualquer administrador que tentasse usá-la.

## Causa-raiz

`PGRST202` é o código que o PostgREST devolve quando a função chamada
via `.rpc()` **não existe** no schema cache do projeto Supabase de
destino daquela chamada. A função `import_question_draft()` (migration
`20260921120000_import_question_draft.sql`) tinha sido aplicada ao
Supabase **local** (`supabase db reset`, dentro de sessões de
desenvolvimento anteriores) mas nunca ao Supabase **remoto**
(`jfvhwwvixwvgjfqzlkkb`) — apesar do frontend que a chama já estar
mesclado em `main` e deployado. Aplicar migration no remoto é um passo
manual (RUNBOOK seção 3); o merge da PR #49 aparentemente aconteceu sem
esse passo ter sido executado.

(`20260921130000_question_options_letter_unbounded.sql`, o complemento
de suporte a mais de 5 alternativas feito na mesma sessão que investigou
este incidente, NÃO estava envolvido no sintoma reportado — o lote real
do usuário usa só letras A–E, dentro do teto antigo. Esse código ainda
não foi mesclado, então essa migration foi deliberadamente mantida fora
do remoto por enquanto, ver "Correção" abaixo.)

## Condições de reprodução

1. Mesclar em `main` (deploy automático na Vercel) um frontend que
   chama uma RPC nova, sem aplicar a migration correspondente no
   Supabase remoto (passo manual, RUNBOOK seção 3) antes ou durante o
   merge.
2. Abrir a tela em produção (confirmado pelo usuário:
   `synapse-med-firebase-auth.vercel.app/#/admin` → Questões
   Comentadas → Importar questões).
3. Qualquer chamada a essa RPC falha com `PGRST202`, porque o Supabase
   remoto nunca ganhou a função — mesmo com o frontend certo já no ar.

(A mesma classe de erro também aconteceria com um build de produção
rodado localmente sem `.env.production*` — `.env.local` aponta pro
remoto por padrão neste repositório, confirmado com
`loadEnv('production', ...)` do Vite — mas neste caso específico o
usuário testou a produção real, não um build local.)

Confirmado localmente: uma chamada HTTP direta ao PostgREST local
(`curl .../rest/v1/rpc/import_question_draft`) com os mesmos 13
parâmetros resolve normalmente (chega à checagem de admin ativo,
`P0001`) — ou seja, a função e seus nomes de parâmetro estão corretos;
o schema cache local reconhece a função sem problema. O parser
(`src/utils/questionsImport.ts`) também foi validado à parte contra o
arquivo real de 18 questões: as 18 linhas produzem `blockingErrors: []`
e `missingFields: []` — a falha é exclusivamente na camada RPC/ambiente,
nunca no parsing ou no formato do arquivo.

## Correção

- `src/utils/errorMessage.ts`: `getErrorMessage()` agora reconhece
  `code === 'PGRST202'` e substitui a mensagem crua do Postgres por uma
  que explica a causa mais provável (migration aplicada só localmente)
  e o próximo passo (`supabase db reset` se for local; aplicar a
  migration no ambiente certo se não for) — mantendo o detalhe técnico
  original anexado, nunca escondido. Usado pelos 6 pontos do Admin que
  já chamam esse helper (`ImportQuestionsModal`, `ImportMaterialModal`,
  `ProvenanceReviewPanel`, `MaterialReferencesPanel`, `AdminCMSView`),
  não só pelo import de questões — o mesmo `PGRST202` pode acontecer em
  qualquer RPC nova testada nas mesmas condições.
- `docs/editorial/PADRAO-NEXUSMED-QUESTOES.md`: nova nota "Erro comum"
  na seção de import, explicando o sintoma, a causa (migration só local)
  e apontando para o RUNBOOK em vez de fazer o operador reinterpretar
  isso como defeito no arquivo `.md`.
- **Correção real, aplicada nesta sessão com autorização explícita do
  usuário**: `20260921120000_import_question_draft.sql` foi aplicada ao
  Supabase remoto via `supabase db push --linked` — confirmado por
  `supabase migration list --linked` (`local` == `remote` para essa
  migration). Só essa migration foi ao remoto:
  `20260921130000_question_options_letter_unbounded.sql` (código ainda
  não mesclado) foi retirada da pasta `supabase/migrations/` antes do
  push (`--dry-run` confirmou a lista exata antes e depois) e restaurada
  logo em seguida, para não aplicar schema de um recurso cujo frontend
  ainda não foi revisado. Nenhum dado existente foi alterado — a
  migration só cria a função/RPC.

## Prevenção

- Regra generalizável (candidata a virar item do `AGENTS.md`/standard
  próprio se recorrer de novo): qualquer sessão que valide uma RPC nova
  só com `supabase db reset` + pgTAP prova o SQL, mas não prova que o
  build de PRODUÇÃO local consegue chamá-la — os dois ambientes (dev vs.
  build de produção) resolvem `VITE_SUPABASE_URL` de arquivos `.env`
  diferentes neste repositório. Rodar `npm run test:e2e`/smoke de
  navegador cobriria isto indiretamente, mas não foi executado nas
  entregas que introduziram `import_question_draft`.
- Teste: `tests/unit/errorMessage.test.ts` (novo) cobre a detecção de
  `PGRST202` e garante que outros códigos de erro não são afetados.
- CI: nenhum gate novo — mensagem melhor é mitigação de diagnóstico, não
  previne a causa raiz (migration não aplicada); não há verificação
  automática de paridade schema-local-vs-remoto.
- Standard/Runbook: nenhum arquivo novo criado; o guia editorial já
  ganhou a nota "Erro comum" (acima) como prevenção mais próxima do
  ponto de uso real.

## Evidências

- Print do usuário mostrando as 18 falhas idênticas (`Questão 1` a
  `Questão 18`, mesma mensagem `PGRST202`).
- Reprodução controlada: `curl` direto ao PostgREST local com os mesmos
  13 parâmetros nomeados → resolve a função (chega ao `P0001` de admin),
  provando que a função/nomes estão corretos e o schema cache LOCAL a
  reconhece.
- `curl` com nome de função inexistente (`import_question_draft_typo`)
  → reproduz literalmente o formato de mensagem do print
  (`PGRST202`, `Could not find the function ... in the schema cache`),
  confirmando que o sintoma é "função ausente", não um erro de
  parâmetro.
- `node -e "require('vite').loadEnv(...)"` confirmando que o modo
  `development` resolve `VITE_SUPABASE_URL` para o Supabase local e o
  modo `production` resolve para o Supabase remoto, nas env vars atuais
  deste repositório.
- Arquivo real de 18 questões rodado através de
  `parseQuestionsMarkdownText` fora do navegador (script `tsx` ad hoc):
  as 18 linhas retornam `blockingErrors: []`/`missingFields: []` —
  descarta bug de parsing/formato como causa.
- `npx vitest run tests/unit/errorMessage.test.ts` — 7/7.

## Pendências e critério de encerramento

`20260921120000_import_question_draft.sql` já foi aplicada ao Supabase
remoto (ver "Correção" acima) — a causa raiz reportada pelo usuário
está corrigida no ambiente onde ele testou. Falta só a confirmação
prática: o usuário reabrir **Importar questões** em produção e
confirmar que o lote real de 18 questões de Espirometria importa com
sucesso agora. Encerra (`resolved`) quando essa confirmação chegar.

Fora do escopo de fechamento deste incidente (rastreado separadamente
em `TASKS.md`, TASK-2026-09-21-01): `20260921130000_question_options_
letter_unbounded.sql` (remoção do teto de 5 alternativas) segue sem
aplicar em lugar nenhum fora do Supabase local — só deve ir ao remoto
junto com o merge do código que a usa.
