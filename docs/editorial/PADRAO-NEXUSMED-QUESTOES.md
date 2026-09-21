# Como produzir uma questão comentada no NexusMed — do zero até publicada

Este guia é o irmão de
[`PADRAO-NEXUSMED-CONTEUDOS.md`](./PADRAO-NEXUSMED-CONTEUDOS.md), agora
para **questões comentadas** (a aba "Questões Comentadas" da Área
Editorial). O fluxo tem o mesmo esqueleto — escrever, revisar/atestar
(obrigatório no banco, sem exceção), publicar, estudar — mas com
diferenças reais que valem a pena conhecer antes de cadastrar um lote,
porque hoje não existem tantas redes de segurança quanto no fluxo de
conteúdo.

**Fluxo completo, em 4 passos:**

1. Cadastrar a questão (só pelo formulário do Admin — **não existe
   import de arquivo para questões hoje**, diferente de conteúdo).
2. Revisar/atestar o rascunho (obrigatório antes de publicar — mesmo
   mecanismo de conteúdo, mas decidido **questão por questão**, nunca
   em lote).
3. Publicar.
4. Estudar — o resto (caderno de erros, flashcard) já roda sozinho.

Antes de cadastrar questões extraídas de prova real (ex.: um lote que
você levantou com NotebookLM ou outra busca na web), leia a seção
"Direitos autorais de questão de banca" no fim deste guia — é rápida e
evita rotular como "autoral" algo que não é.

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

- **Só 4 alternativas (A–D).** O modelo de dados aceita uma 5ª
  (`E`), mas o formulário de hoje nunca monta essa opção — não tem
  como cadastrar uma questão de 5 alternativas por aqui.
- **Sem campo de "Comentário Geral".** O banco exige um
  `general_commentary` preenchido para publicar, mas o formulário não
  tem campo para ele — grava um texto fixo genérico
  ("Comentário cadastrado via Painel Administrativo.") em toda questão
  nova, não importa o que você digite em outro lugar. Na prática, hoje
  o conteúdo explicativo real da questão precisa morar nas
  **explicações por alternativa** e na **Pérola High-Yield** — são os
  dois campos que o estudante realmente lê como comentário
  substancioso; o "Comentário Geral" fica genérico até esse gap ser
  fechado.
- **Tema não é escolhido — é auto-atribuído** ao primeiro tema
  cadastrado dentro da disciplina selecionada. Se a disciplina tiver
  vários temas, pode não ser o tema certo.
- **Ciclo (`básico`/`clínico`/`internato_residencia`) vem fixo em
  `internato_residencia`**, qualquer que seja a disciplina — o que
  costuma bater com questão de residência (o caso do lote de
  Espirometria), mas não dá pra mudar por aqui se um dia você cadastrar
  questão de outro ciclo por este mesmo formulário.
- **Tags vêm fixas** (`Admin`, `CMS`, `Custom`) — o formulário não tem
  campo de tags.
- **O vínculo com o compêndio é um palpite, não uma escolha.** Ao
  salvar, o sistema vincula a questão ao **primeiro compêndio
  encontrado na mesma disciplina** — se a disciplina tiver mais de um
  compêndio (ex. Pneumologia com vários temas além de Espirometria),
  pode vincular no compêndio errado. **Corrija na hora**: depois de
  criar a questão, clique **"Vínculo"** na listagem — ali sim há dois
  dropdowns reais (Material e Seção, com as seções do material
  escolhido) para apontar pro compêndio/seção certos. O botão
  "Vínculo" só mexe nesses dois campos — nunca reescreve enunciado,
  alternativas, gabarito ou status.
- **Sem Markdown.** Diferente do conteúdo (que passa por
  `SafeMarkdown`), todo texto de questão — vinheta, enunciado,
  alternativas, explicação por alternativa, Pérola High-Yield — é
  renderizado como texto puro para o estudante. `**negrito**`,
  `[N](#ref-N)` ou tabela em Markdown aparecem literalmente com
  asteriscos/colchetes na tela, não formatados. Não use a convenção de
  citação `[N](#ref-N)` do compêndio aqui — ela não faz nada numa
  questão.
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

### Sem import de arquivo (diferente de conteúdo)

Hoje **não existe** um "Importar questões" na Área Editorial — nem
`.md`, nem `.yaml`, nem `.csv`. Para um lote pequeno (como as questões
de Espirometria levantadas via NotebookLM), o caminho real é cadastrar
uma de cada vez pelo formulário "Nova Questão" descrito acima.

Existe um script interno (`scripts/load-questoes.ts`) que carrega um
lote grande a partir de um JSON num formato próprio
(`banco-questoes.json`), mas é uma ferramenta de operação — roda por
linha de comando, exige acesso de desenvolvedor e Supabase local, e
não é um fluxo editorial self-service. Não é o caminho para um lote
pontual; é a ferramenta que existe para migrações grandes já feitas
pelo projeto.

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
