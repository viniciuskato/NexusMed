# Como produzir uma questão comentada no NexusMed — do zero até publicada

Este guia é o irmão de
[`PADRAO-NEXUSMED-CONTEUDOS.md`](./PADRAO-NEXUSMED-CONTEUDOS.md), agora
para **questões comentadas** (a aba "Questões Comentadas" da Área
Editorial). O fluxo tem o mesmo esqueleto — escrever, revisar/atestar
(obrigatório no banco, sem exceção), publicar, estudar — mas com
diferenças reais que valem a pena conhecer antes de cadastrar um lote,
porque hoje não existem tantas redes de segurança quanto no fluxo de
conteúdo.

**Escopo deste guia**: cadastrar/importar questões que **já existem**
— provas de residência reais, questões de banca, lotes levantados com
uma IA de fontes (NotebookLM e similares) a partir de material já
publicado por uma instituição. Não é um guia para **autorar** uma
questão original do zero (enunciado e alternativas inventados, sem
prova de origem) — isso muda a seção de direitos autorais no fim deste
guia e o próprio nível de rigor esperado no claim de revisão (Passo 2,
que hoje atesta "correspondência com a prova de origem"). A criação de
questão autoral vai ganhar um documento próprio no futuro; até lá, uma
questão sem prova de origem real está fora do escopo deste guia.

**Fluxo completo, em 4 passos:**

1. Cadastrar a questão — pelo formulário do Admin (unitário) **ou
   importando um lote inteiro de um arquivo `.md`** (Admin → "Importar
   questões" — ver Passo 1).
2. Revisar/atestar o rascunho (obrigatório antes de publicar — mesmo
   mecanismo de conteúdo, mas decidido **questão por questão**, nunca
   em lote).
3. Publicar.
4. Estudar — o resto (caderno de erros, flashcard) já roda sozinho.

Antes de cadastrar questões extraídas de prova real (ex.: um lote que
você levantou com NotebookLM ou outra busca na web), leia a seção
"Direitos autorais de questão de banca" no fim deste guia — é rápida e
evita rotular como "autoral" algo que não é. Se for usar uma IA de
fontes pra levantar o lote, veja "Importar um lote de questões (arquivo
`.md`)" no Passo 1 — é o formato que **Admin → Importar questões**
sabe ler, mesma ideia do import de conteúdo.

---

## Passo 1 — Cadastrar a questão no Admin

Admin → aba **"Questões Comentadas"** → botão **"Nova Questão"** abre
um formulário de criação rápida. Ele é bem mais enxuto que o de
conteúdo, e tem limitações reais que **não aparecem na tela** — leia
antes de cadastrar o lote inteiro, senão você repete o mesmo ajuste
manual em cada questão depois.

### Campos do formulário, na ordem em que aparecem

1. **Disciplina** — dropdown, o mesmo catálogo já cadastrado que o
   formulário de conteúdo usa (sem risco de nome não bater).
2. **Instituição / Banca** — texto livre (ex. `ENARE`, `USP-SP`,
   `UNIFESP`). Preencha com a banca/instituição real da prova — isso
   importa para a seção de direitos autorais no fim deste guia.
3. **Ano** — número.
4. **Enunciado Clínico (Caso / Vinheta)** — texto livre, opcional.
5. **Comando da Questão (Pergunta)** — texto livre, obrigatório.
6. **Alternativas e Explicações Individuais** — exatamente **4
   alternativas, A a D**. Para cada uma: texto da alternativa
   (obrigatório), rádio **"Gabarito"** (só uma pode estar marcada) e
   um campo de explicação comentada (livre no formulário, mas **o
   banco exige preenchido em todas as 4 antes de publicar** — ver
   Passo 3).
7. **Pérola High-Yield (Resumo para fixação rápida)** — texto livre,
   opcional no formulário, mas **o banco também exige preenchido antes
   de publicar**.

### O que o formulário NÃO deixa você escolher (limitações reais, não bugs a se esperar que sumam)

Esta seção descreve o formulário **"Nova Questão" (cadastro unitário)**,
que continua exatamente assim. O importador em lote descrito logo
adiante fecha várias dessas lacunas — cada bullet abaixo diz
explicitamente se o import resolve ou não.

- **Só 4 alternativas (A–D).** O formulário de hoje nunca monta um 5º
  campo (ou mais) — não tem como cadastrar uma questão com mais de 4
  alternativas por aqui. **Resolvido no import, sem teto nenhum**: o
  arquivo aceita `**E)**`, `**F)**`, `**G)**`... — quantas alternativas
  a prova de origem tiver, na ordem em que aparecem no arquivo (não
  reordenadas alfabeticamente). O banco (`question_options.letter`) só
  exige que a letra seja maiúscula — não existe mais um limite fixo em
  `E` em lugar nenhum do fluxo de import.
- **Sem campo de "Comentário Geral".** O banco exige um
  `general_commentary` preenchido para publicar, mas o formulário não
  tem campo para ele — grava um texto fixo genérico
  ("Comentário cadastrado via Painel Administrativo.") em toda questão
  nova, não importa o que você digite em outro lugar. Na prática, hoje
  o conteúdo explicativo real da questão precisa morar nas
  **explicações por alternativa** e na **Pérola High-Yield** — são os
  dois campos que o estudante realmente lê como comentário
  substancioso; o "Comentário Geral" fica genérico até esse gap ser
  fechado. **Resolvido no import**: campo `**Comentário Geral:**`
  próprio; se omitido, cai no mesmo texto genérico de hoje.
- **Tema não é escolhido — é auto-atribuído** ao primeiro tema
  cadastrado dentro da disciplina selecionada. Se a disciplina tiver
  vários temas, pode não ser o tema certo. **Resolvido no import, de um
  jeito mais seguro que um "conserto"**: em vez de repetir esse palpite
  em lote (errar N questões de uma vez é pior que errar uma), o
  importador **nunca adivinha o tema** — sem `**Tema:**` no arquivo ou
  sem bater com o catálogo, a pré-visualização exige escolha manual
  antes de liberar aquela linha, mesma lógica de disciplina/tema do
  import de conteúdo.
- **Dificuldade (`fácil`/`médio`/`difícil`) vem fixa em `médio`** —
  também sem controle nenhum na tela, mesmo padrão do Ciclo abaixo.
  **Resolvido no import**: campo `**Dificuldade:**` opcional.
- **Ciclo (`básico`/`clínico`/`internato_residencia`) vem fixo em
  `internato_residencia`**, qualquer que seja a disciplina — o que
  costuma bater com questão de residência (o caso do lote de
  Espirometria), mas não dá pra mudar por aqui se um dia você cadastrar
  questão de outro ciclo por este mesmo formulário. **Resolvido no
  import**: campo `**Ciclo:**` opcional.
- **Tags vêm fixas** (`Admin`, `CMS`, `Custom`) — o formulário não tem
  campo de tags. **Resolvido no import**: bloco `### Tags` opcional
  (mesma convenção de crases do import de conteúdo); sem ele, cai nas
  mesmas três tags fixas de hoje.
- **O vínculo com o compêndio é um palpite, não uma escolha** no
  cadastro unitário. Ao salvar, o sistema vincula a questão ao
  **primeiro compêndio encontrado na mesma disciplina** — se a
  disciplina tiver mais de um compêndio (ex. Pneumologia com vários
  temas além de Espirometria), pode vincular no compêndio errado.
  **Corrija na hora**: depois de criar a questão, clique **"Vínculo"**
  na listagem — ali sim há dois dropdowns reais (Material e Seção, com
  as seções do material escolhido) para apontar pro compêndio/seção
  certos. O botão "Vínculo" só mexe nesses dois campos — nunca
  reescreve enunciado, alternativas, gabarito ou status. **Não
  "resolvido" no import, de propósito**: repetir esse palpite em lote
  multiplicaria o risco de errar (uma disciplina com vários compêndios
  erra N vezes de uma vez, em vez de uma). Toda questão que sai do
  import nasce **sem vínculo** ("Material: Pendente") — use o botão
  "Vínculo" linha a linha depois, mesmo fluxo de sempre.
- **Markdown inline funciona (desde 2026-09-20); Markdown de bloco,
  não.** Vinheta, enunciado, cada alternativa, cada explicação,
  Comentário Geral e Pérola High-Yield passam por `parseInline`
  (`src/components/common/SafeMarkdown.tsx`) antes de chegar ao
  estudante — `**negrito**`, `*itálico*`, `` `código` `` e
  `[texto](https://...)` já renderizam formatados, não aparecem crus
  com asteriscos/colchetes (ver
  `tests/component/questionCardMarkdown.test.tsx`). O que **não**
  funciona é Markdown de **bloco**: heading (`####`), tabela
  (`| col | col |`) e lista (`- item`/`1. item`) continuam aparecendo
  literalmente, porque questão só passa por `parseInline`, nunca pelo
  `SafeMarkdown` inteiro (o parser de bloco, exclusivo do compêndio).
  Não peça pra uma IA gerar tabela ou lista dentro de um campo de
  questão — vai aparecer com os caracteres de Markdown visíveis.
- **`[N](#ref-N)` de citação agora renderiza como link estilizado, mas
  não leva a lugar nenhum.** Diferente do compêndio, a questão não tem
  um rodapé de referências numeradas com âncora `id="ref-N"` na tela —
  então o link fica com a aparência de citação, mas clicar nele não
  navega pra nada. Não é mais "aparece cru" (era o caso antes de
  2026-09-20), mas segue inútil aqui: não use essa convenção do
  compêndio em questão. Pra citar uma fonte, escreva por extenso ou use
  um link real (`[nome da fonte](https://...)`), que funciona de
  verdade.
- **Sem edição depois de criada.** O Admin não tem uma tela de
  "Editar questão" — só dá pra: vincular material/seção, revisar/
  atestar, publicar/despublicar e excluir. Se errar algo no enunciado
  ou numa alternativa, a única forma de corrigir hoje é **excluir a
  questão em rascunho e cadastrar de novo** (questão publicada nem
  pode ser excluída — despublique primeiro).
- **O botão de salvar diz "Publicar Questão", mas só salva como
  rascunho** — mesma pegadinha de nomenclatura do botão "Publicar
  Conteúdo" no formulário de compêndio. A questão continua invisível
  para quem estuda até você repetir os passos 2 e 3 abaixo.

### Importar um lote de questões (arquivo `.md`)

Admin → aba **"Questões Comentadas"** → botão **"Importar questões"**.
Diferente do cadastro unitário acima (que continua existindo,
inalterado), isto lê um **arquivo `.md` com várias questões de uma
vez** — pensado especificamente para o caso real que motivou esta
seção: um lote levantado com uma IA de fontes (NotebookLM e similares)
ou outra busca na web.

Cada questão do arquivo começa com um heading `## Questão N` (o número
é só para você se orientar — nunca é gravado). Dentro de cada bloco, os
campos seguem a convenção `**Rótulo:** valor` (valor pode ficar na
mesma linha ou nas linhas seguintes, como preferir):

```markdown
## Questão 1

**Disciplina:** Nome da Disciplina (precisa bater com um nome já cadastrado, ou a pré-visualização pede escolha manual)
**Tema:** Nome do Tema (também por nome; sem isto, ou sem bater com o catálogo, exige escolha manual — nunca um palpite automático)
**Instituição / Banca:** ENARE
**Ano:** 2025
**Ciclo:** internato_residencia (opcional — padrão internato_residencia; aceita basico/clinico/internato_residencia)
**Dificuldade:** medio (opcional — padrão medio; aceita facil/medio/dificil)

**Enunciado Clínico (Caso / Vinheta):** (opcional)
Texto da vinheta...

**Comando da Questão (Pergunta):**
Texto da pergunta...

**A)** Texto da alternativa A
**Explicação A:** ...
**B)** Texto da alternativa B [GABARITO]
**Explicação B:** ...
**C)** Texto da alternativa C
**Explicação C:** ...
**D)** Texto da alternativa D
**Explicação D:** ...
**E)** Texto da alternativa E (opcional — além do que o cadastro unitário permite)
**Explicação E:** ...
**F)** Texto da alternativa F (opcional — sem teto: F, G, H... também funcionam se a prova de origem tiver)
**Explicação F:** ...

**Comentário Geral:** (opcional — sem isto, grava o mesmo texto genérico de sempre)
**Pérola High-Yield:** Frase de fixação rápida...

### Tags
`tag1` `tag2`
```

Exatamente **uma** alternativa precisa do marcador `[GABARITO]` colado
no fim do texto da alternativa (`**B)** Texto [GABARITO]`) — nem zero,
nem duas. A ordem das alternativas no arquivo é a ordem final (não uma
reordenação alfabética — uma prova que não numera A,B,C... em sequência
continua fiel ao original); letras `A` em diante são aceitas em
qualquer combinação e **sem teto de quantidade** (a prova de origem
manda, não este importador), mas cada questão precisa de pelo menos 2
alternativas com texto preenchido.

Ao escolher o arquivo, a tela mostra uma **lista** (não uma única
pré-visualização, porque cada questão do lote é uma linha independente
no banco): cada uma marcada **Pronta**, **Falta disciplina/tema** (com
dropdown para resolver ali mesmo, sem editar o arquivo) ou **Bloqueada**
(dado insuficiente para criar — comando da questão vazio, menos de 2
alternativas, ou gabarito ausente/duplicado; a mensagem explica qual).
Um quadro por linha lista o que ficou ausente ou caiu num valor padrão
(Instituição, Ano, Ciclo/Dificuldade inválidos, Comentário
Geral/Pérola/Tags ausentes, explicação vazia em alguma alternativa) —
nada disso bloqueia a criação do rascunho, só avisa o que revisar antes
de publicar (Passo 3). O botão final só importa as linhas **Prontas**;
as demais ficam de fora e continuam disponíveis pelo cadastro unitário
se preferir corrigi-las à mão.

Cada questão importada nasce **rascunho**, sem vínculo com compêndio
("Material: Pendente" — ver o bullet sobre vínculo acima) e sem
revisão/atestação — Passo 2 e Passo 3 abaixo continuam obrigatórios,
questão por questão, exatamente como no cadastro unitário. Importar o
arquivo não publica nada.

Por baixo, cada linha da lista vira uma chamada da função
`import_question_draft()` do banco — toda a gravação de uma questão
(linha em `questions` + alternativas + gabarito + comentário) acontece
numa única transação atômica (mesmo padrão de `import_compendium_draft`
usado pelo import de conteúdo): ou grava tudo, ou não grava nada
daquela questão. Uma falha numa linha do lote é reportada isoladamente
ao final ("N de M rascunhos criados") — não derruba as demais.

**Erro comum: "Could not find the function ... in the schema cache"
em TODAS as linhas do lote.** Isto não é um problema do arquivo `.md`
— é o ambiente Supabase que a tela está usando não ter a função
`import_question_draft()` (ou `question_options.letter` sem o suporte
a mais de 5 alternativas — migrations
`20260921120000_import_question_draft.sql` e
`20260921130000_question_options_letter_unbounded.sql`). Isso acontece
sempre que a migration foi aplicada só no Supabase **local**
(`supabase db reset`) e a tela testada está apontando para o Supabase
**remoto** — o caso mais comum é rodar `npm run build` +
`vite preview` (ou abrir um build de produção) localmente: sem um
`.env.production*`, o build de produção usa `VITE_SUPABASE_URL` de
`.env.local`, que aponta pro remoto por padrão (`AGENTS.md`, risco #4).
`npm run dev` já usa o Supabase local (`.env.development.local`) e não
sofre disso. O sistema já reconhece esse erro específico (código
PostgREST `PGRST202`) e troca a mensagem crua por uma que explica a
causa provável e o que fazer — ver `src/utils/errorMessage.ts`. A
correção real é aplicar a migration pendente no ambiente que faltou
(RUNBOOK seção 3), nunca reinterpretar isso como erro no arquivo.

Existe também um script interno (`scripts/load-questoes.ts`) que
carrega um lote muito grande a partir de um JSON num formato próprio
(`banco-questoes.json`) — é uma ferramenta de operação (linha de
comando, exige acesso de desenvolvedor e Supabase local), não um fluxo
editorial self-service. Para o caso comum (um lote levantado numa
sessão de estudo), "Importar questões" é o caminho certo.

---

## Passo 2 — Revisão e atestação (obrigatória, por questão)

O mesmo gate de proveniência do conteúdo
(`content_revisions`/`content_reviews`, ver Passo 2 de
`PADRAO-NEXUSMED-CONTEUDOS.md`) vale para questão — é literalmente o
mesmo par de tabelas e o mesmo painel de UI, só que cada questão tem a
sua própria revisão. **Não existe atestação em lote**: publicar um
lote de 20 questões de Espirometria exige repetir "Revisão" 20 vezes,
uma por questão.

Na listagem de "Questões Comentadas", ao lado de Publicar/Despublicar,
tem o botão **"Revisão"**. Dentro dele:

1. **Criar revisão** — tira uma foto do estado atual da questão
   (enunciado, alternativas, gabarito, explicações).
2. **Adicionar claim** — mesmos campos obrigatórios de conteúdo: texto
   do claim e uma **"Localização estável"**. Para questão, o seletor
   de "seção/trecho" oferece `question_stem` (enunciado) e
   `option:<letra>:explanation` (explicação de cada alternativa) — com
   preview do texto real, igual ao de seção de compêndio. **Um claim
   por questão inteira já é prática honesta e rápida** — algo como
   "enunciado e alternativas correspondem à prova de origem
   (instituição/banca/ano declarados)", locator `question_stem`,
   decidido **Aprovado**. Reserve um claim extra por alternativa
   (`option:<letra>:explanation`) só quando uma explicação específica
   for de alto risco e você quiser rastreá-la à parte.
3. **Atestar — Aprovar revisão** — só habilita depois de pelo menos um
   claim na lista; libera o botão Publicar desta questão.

Qualquer edição no enunciado/alternativas/gabarito depois de atestado
invalida a aprovação — o hash da revisão aprovada deixa de bater com o
conteúdo atual, e `publish_question()` volta a bloquear até uma nova
revisão ser criada e atestada.

---

## Passo 3 — Publicar

Botão **"Publicar"** na mesma linha da questão (ou **"Publicar
rascunhos (N)"** no topo da aba, que tenta publicar todos os
rascunhos de uma vez e reporta no console quais falharam e por quê).
Por baixo, a função `publish_question()` do banco confere, nesta
ordem:

- pelo menos 2 alternativas cadastradas;
- todas as alternativas com sua respectiva chave de gabarito;
- **exatamente 1** alternativa marcada como correta;
- **todas** as alternativas com explicação preenchida (o campo é
  opcional na tela, mas obrigatório aqui);
- um `general_commentary` e um `high_yield_summary` não vazios (ver a
  ressalva do "Comentário Geral" no Passo 1 — a Pérola High-Yield
  quase sempre é o campo que sobra preenchido de verdade);
- uma revisão atestada como aprovada cujo conteúdo atual, recomputado,
  bate com o hash aprovado (Passo 2).

Faltando qualquer um desses, a publicação falha com um erro descritivo
— não falha silenciosamente.

**Questão publicada (ou arquivada) fica com o conteúdo congelado no
banco**: enunciado, alternativas, gabarito, explicações, vínculo de
material/seção etc. não podem mais ser alterados enquanto o status for
`published`/`archived` — é bloqueado no banco, não só desencorajado.
Para corrigir algo depois de publicada: **Despublicar** (volta a
`draft`), editar (hoje só recriando a questão, ver Passo 1), e repetir
Revisão + Publicar.

---

## Passo 4 — Estudar (isto já roda sozinho)

Igual ao Passo 4 de conteúdo: responder uma questão errada já cadastra
ela no Caderno de Erros e gera o flashcard correspondente
automaticamente, via a mesma chamada que registra a resposta
(`submit_question_attempt`) — nenhuma ação manual sua, e nada neste
passo precisa de documentação própria.

---

## Direitos autorais de questão de banca

Se a questão vem de uma prova real (o caso do lote levantado via
NotebookLM/busca na web sobre Espirometria), vale conhecer
[`POLITICA-QUESTOES-DIREITOS-E-MIDIA.md`](./POLITICA-QUESTOES-DIREITOS-E-MIDIA.md)
antes de cadastrar. Resumo prático:

- **Cadastrar e estudar por uma questão real não é o problema** — o
  acervo já guarda questões assim para estudo/auditoria, sem
  restrição.
- **Disponibilidade pública na internet (qconcursos, sites de banca
  etc.) não é licença nem prova de titularidade.** Não rotule uma
  questão transcrita de prova como "autoral NexusMed" — preencha
  **Instituição / Banca** e **Ano** com a fonte real, honestamente.
  Isso é o que já existe hoje no formulário (Passo 1) — só não deixe
  em branco nem invente "autoral" para simplificar.
  - `origin_kind = public_exam` sozinho, mesmo com fonte declarada, não é `owned`.
- Direito comercial atestado só existe com atestação humana específica
  de titularidade (via `content_reviews`, distinta da atestação
  editorial do Passo 2 acima, que atesta correção de conteúdo, não
  titularidade) ou licença documentada — nenhuma questão do acervo tem
  isso hoje. Isto só importa no dia em que o produto for liberado
  comercialmente; para o uso atual (grupo fechado de amigos, estudo),
  não bloqueia nada.
