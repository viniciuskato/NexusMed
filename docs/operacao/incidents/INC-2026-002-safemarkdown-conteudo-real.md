---
id: INC-2026-002
status: verifying
severity: medium
area: compendium-render
detected_at: 2026-09-20
owner: nexusmed
pr: null
commits:
  - f49220f
  - 526e482
  - 510f850
prevention:
  test: true
  ci: false
  standard: true
  runbook: false
---

# INC-2026-002 — três defeitos reais de `SafeMarkdown` achados revisando o compêndio de Espirometria

## Sintoma e impacto

Revisão visual do compêndio real "Espirometria: Padronizações Técnicas..."
(rascunho, 5 seções) na Área Editorial encontrou Markdown aparecendo como
texto literal em vez de renderizado: `####` e `|` de tabela/lista colados
ao texto anterior, asteriscos soltos em negrito com itálico aninhado, e
depois — já com os dois primeiros corrigidos — `[N](#ref-N)` de citação
aparecendo cru dentro do box "Pontos-Chave & Mecanismos". Afeta qualquer
compêndio publicado, não só o de Espirometria; o terceiro também afeta os
flashcards derivados de `keyTakeaways`/`clinicalPearl` (tela real de
revisão SRS) e a busca global.

## Causa-raiz

Três mecanismos técnicos distintos, todos em torno do parser de Markdown
"seguro" (`src/components/common/SafeMarkdown.tsx`, sem
`dangerouslySetInnerHTML`):

1. **Fronteira de bloco exige linha em branco.** O split em blocos
   (`content.split(/\n\n+/)`) só reconhece heading/tabela/lista/blockquote
   quando o bloco INTEIRO começa com `#`/`|`/marcador/`>` — ou seja, exige
   linha em branco antes. Conteúdo real (Markdown de IA externa, colado no
   form, ou vindo do importador) nem sempre respeita isso: um `####`
   colado à linha de cima, ou uma lista/tabela começando na linha seguinte
   a uma frase, caem no MESMO bloco que o texto vizinho e o bloco inteiro
   vira parágrafo comum.
2. **Negrito não casava com itálico aninhado dentro.** O regex de negrito
   em `parseInline` era `\*\*[^*]+\*\*` — "sem nenhum asterisco dentro".
   Em `**Ponto de Igual Pressão (*Equal Pressure Point*)**` (padrão comum
   em texto médico: sigla em inglês em itálico dentro de um termo em
   negrito), o par externo nunca casava, e os asteriscos do itálico
   aninhado apareciam como texto literal solto.
3. **Campos curtos da seção nunca passavam por nenhum parser.**
   `keyTakeaways`, `clinicalPearl`, `warningAlert` e `examConsensus`
   carregam o mesmo Markdown inline do corpo do texto (negrito, e
   sobretudo `[N](#ref-N)` — a convenção editorial exige citação em toda
   afirmação de peso clínico, sem exceção pra esses campos), mas
   `CompendiumReader.tsx`, `FlashcardsView.tsx`,
   `FlashcardReviewSession.tsx`, `GlobalSearchModal.tsx` e a prévia de
   flashcards do `AdminCMSView.tsx` interpolavam a string crua direto no
   JSX (`{sec.clinicalPearl}` em vez de qualquer parser).

## Condições de reprodução

1. Seção com heading `####`/tabela/lista colados sem linha em branco ao
   texto anterior → `####`/`|`/`*` aparecem como texto literal (achado 1).
2. `**negrito (*itálico*)**` em qualquer campo que passe por
   `parseInline` → asteriscos soltos em vez de negrito/itálico aninhado
   (achado 2).
3. Qualquer `keyTakeaways`/`clinicalPearl`/`warningAlert`/`examConsensus`
   com `[N](#ref-N)` → citação aparece como texto cru no box
   correspondente, nos flashcards derivados, e na busca global (achado 3).

## Correção

- `f49220f`: `normalizeBlockBoundaries()` insere a linha em branco que
  falta antes de heading/tabela/lista/blockquote (e depois de
  heading/tabela), preservando o reflow de item de lista multi-linha.
- `526e482`: regex de negrito trocado para
  `\*\*(?:\*(?!\*)|[^*])+\*\*` (lookahead negativo) — aceita asterisco
  isolado dentro do bloco de negrito desde que não seja seguido de outro
  asterisco (ou seja, não é o fechamento real).
- `510f850`: `parseInline` exportado de `SafeMarkdown.tsx` e chamado
  direto nos 7 pontos de renderização crua identificados (sem envolver o
  `SafeMarkdown` inteiro, que geraria markup de bloco `<div>`/`<p>` onde
  o layout já é uma `<li>`/`<span>`/`<p>` existente).

## Prevenção

- Regra: qualquer componente novo que renderize um campo de seção do
  compêndio (`content`, `keyTakeaways`, `clinicalPearl`, `warningAlert`,
  `examConsensus`, ou qualquer campo futuro derivado deles, como
  `Flashcard.back`/`mechanismHighlight`) chama `SafeMarkdown` (bloco) ou
  `parseInline` (inline, dentro de um elemento já existente) — nunca
  interpola a string crua no JSX. Comentário extenso deixado em
  `parseInline` (exportado) em `SafeMarkdown.tsx` documentando isso pra
  quem for adicionar um campo novo.
- Teste de regressão: `tests/component/safeMarkdown.test.tsx` — 9 casos,
  cobrindo os três achados (incluindo o texto real do print que motivou a
  investigação).
- CI: nenhum gate novo — os testes rodam no `npm run test:unit` já
  existente; não há verificação automática que impeça um componente novo
  de voltar a interpolar string crua (checagem manual/code review).
- Standard: [`../standards/conteudo-markdown-inline.md`](../standards/conteudo-markdown-inline.md).

## Evidências

- Reprodução do achado 1 e 2: trace do regex antigo contra o texto real
  do compêndio (`node` ad hoc), confirmando a quebra antes de escrever a
  correção.
- Reprodução do achado 3: print real do usuário mostrando
  `[1](#ref-1)[3](#ref-3)` cru dentro do box "Pontos-Chave & Mecanismos",
  no mesmo compêndio onde o corpo do texto (achados 1/2, já corrigidos)
  renderizava certo.
- Validação pós-correção: `tsc --noEmit` limpo; `vitest run` 155/155 (achado
  1/2) e depois 155/155 de novo (achado 3, mesma contagem — só trocou
  cobertura); varredura por `grep` em todo `src/` confirmando que não
  sobrou nenhum outro ponto interpolando `.back`/`clinicalPearl`/
  `warningAlert`/`examConsensus`/`mechanismHighlight` cru fora de inputs
  de formulário (que são o comportamento correto).
- Limitações da verificação: não houve smoke visual em navegador real
  contra o material publicado (Supabase remoto não foi tocado nesta
  sessão — ver `AGENTS.md`, risco de escrita remota); a correção foi
  validada por teste automatizado com o texto exato do print, não por
  reabrir o compêndio publicado depois do deploy.

## Pendências e critério de encerramento

Código corrigido e testado localmente; branch `fix/safemarkdown-blocos-
sem-linha-em-branco` enviada ao remoto, PR ainda não mesclado em `main`
no momento deste registro. Encerra quando: (1) mesclado em `main` e
publicado no Vercel; (2) confirmação visual (usuário ou sessão futura)
de que o compêndio de Espirometria em produção renderiza os quatro
achados corretamente.
