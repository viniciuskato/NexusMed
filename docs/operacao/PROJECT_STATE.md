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
- Cópia de trabalho recomendada (limpa, sem drift na criação):
  `C:\Users\vinic\OneDrive\Projetos\SynapseMed\canonical`.

## Como reconfirmar o estado antes de qualquer trabalho

```
git fetch origin
git rev-parse origin/main
git log --oneline -10 origin/main
```

Qualquer hash citado neste documento é **baseline histórica de quando foi
escrito**, não valor permanente. Sempre rode o comando acima antes de editar.

## Baseline verificada nesta entrega (Entrega 40-A, 2026-09-17)

- `origin/main` = `fe20832791bad02d174461f7cf4bab8d0dcd632e` (confirmado por
  `git fetch` em 2026-09-17; sem drift entre o diagnóstico da diretoria e o
  início desta entrega).
- Último estado **documentado** em `AGENTS.md`/`docs/diretoria/registro.md`
  antes desta entrega: Prompt 23-C (2026-09-14), fundação de proveniência
  editorial e atestação humana — publicado e verificado no Supabase remoto
  naquela data (ver detalhamento arquivado em
  [`docs/archive/AGENTS-HISTORICO-2026-09-17.md`](../archive/AGENTS-HISTORICO-2026-09-17.md)).

## Risco crítico aberto — requer decisão da diretoria (P0)

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
- **Próximo gate**: a diretoria decide, com base no risco crítico acima,
  se a próxima entrega é uma auditoria do commit `fe20832` (recomendado,
  prioridade P0 em [`TASKS.md`](TASKS.md)) antes de qualquer outro trabalho
  de produto. Nenhum código de produto foi alterado por esta entrega.

## Estado de publicação desta própria entrega

Ver o "RETORNO: 40-A" devolvido pela sessão executiva que produziu esta
camada — branch candidata `work/40a-continuidade-operacional`, **não
mesclada em `main`** até autorização explícita.
