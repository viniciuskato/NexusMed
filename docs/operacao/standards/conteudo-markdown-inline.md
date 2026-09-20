# Standard — renderizar campos de compêndio que carregam Markdown inline

## Objetivo

Garantir que todo campo de seção do compêndio que pode carregar Markdown
inline (negrito, itálico, `` `código` ``, e sobretudo `[N](#ref-N)` de
citação bibliográfica) seja efetivamente interpretado antes de chegar à
tela — nunca interpolado como string crua. Ver
[`../incidents/INC-2026-002-safemarkdown-conteudo-real.md`](../incidents/INC-2026-002-safemarkdown-conteudo-real.md)
para o incidente que motivou este standard: três defeitos reais achados
revisando visualmente um compêndio publicado, o terceiro deles sendo
exatamente a violação da regra abaixo.

## Regras obrigatórias

1. **Todo campo que guarda Markdown de autoria — `content`,
   `keyTakeaways`, `clinicalPearl`, `warningAlert`, `examConsensus` de
   `CompendiumSection`, e qualquer campo derivado deles (ex.:
   `Flashcard.back`/`mechanismHighlight`, gerados a partir de
   `keyTakeaways`/`clinicalPearl` em `CompendiumReader.handleCreateFlashcardFromSection`)
   — passa por `SafeMarkdown` ou `parseInline`
   (`src/components/common/SafeMarkdown.tsx`) antes de virar JSX. Nunca
   `{campo}` cru.
2. **Escolha entre os dois pela posição no layout**, não por preferência:
   - `<SafeMarkdown content={texto} />` quando o campo pode ter múltiplos
     parágrafos, heading, tabela ou lista — ele já é o container de bloco
     (`<div>` com `<p>`/`<table>`/`<ul>` dentro).
   - `parseInline(texto)` quando o campo é curto (uma frase, um item de
     lista, um parágrafo único) e vai dentro de um elemento que já existe
     no layout (`<li>`, `<span>`, `<p>`, `<strong>`) — evita `<div>`/`<p>`
     de bloco aninhado onde não deveria haver.
3. **Exceção deliberada**: campo de formulário de edição (`<input>`,
   `<textarea>` no Admin/`SectionEditor`) mostra o texto cru — é o
   comportamento correto ali, o usuário está editando o Markdown, não
   lendo o resultado renderizado.
4. **Ao adicionar um campo novo** que aceite Markdown de autoria (seção,
   flashcard, questão, ou qualquer outro), aplique a regra 1 já no
   primeiro componente que o renderiza fora de um formulário — não é
   aceitável "renderizar cru por enquanto, formatar depois": é assim que
   o INC-2026-002 aconteceu (três componentes diferentes, mesma lacuna,
   descobertos só ao revisar visualmente um compêndio real).
5. **Ao mudar o regex/parser de `parseInline` ou `normalizeBlockBoundaries`
   em `SafeMarkdown.tsx`**, adicione o caso a
   `tests/component/safeMarkdown.test.tsx` antes de considerar a mudança
   pronta — é o único gate automatizado contra regressão nesse parser (não
   há CI dedicado).

## Como verificar

- Busca rápida por violação da regra 1:
  `grep -rn "clinicalPearl}\|warningAlert}\|examConsensus}\|\.back}\|mechanismHighlight}" src/`
  — qualquer ocorrência fora de um `value={...}` de input/textarea é
  suspeita.
- Rodar `npx tsx` com o parser real
  (`src/utils/compendiumMarkdownImport.ts`) contra um `.md` real antes de
  reimportar, comparando contagem de blocos "bruto" vs. "normalizado" —
  divergência indica heading/tabela/lista colados sem linha em branco no
  arquivo-fonte (ver INC-2026-002, achado 1).
