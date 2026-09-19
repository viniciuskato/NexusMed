# Como produzir conteúdo no NexusMed — do zero até publicado

O NexusMed é uma plataforma de estudo para medicina: você escreve um
conteúdo, publica, estuda por ele, responde questões vinculadas a ele,
e o que você errar cai sozinho no seu caderno de erros e vira
flashcard. Este guia cobre o caminho real, ponta a ponta — inclusive a
etapa de revisão/atestação, que **é obrigatória no banco de dados**
(não dá pra publicar sem ela).

**Fluxo completo, em 4 passos:**

1. Escrever o conteúdo (direto no Admin — não precisa de YAML nem de
   Word, você já vai colar o texto ali mesmo).
2. Revisar/atestar o rascunho (obrigatório antes de publicar).
3. Publicar.
4. Estudar — o resto (questões, caderno de erros, flashcards) já roda sozinho.

Escreva e reescreva o texto livremente no passo 1. Só faça o passo 2
quando o texto já estiver do jeito que você quer — **qualquer edição
depois de atestado invalida a aprovação** e te obriga a repetir o
passo 2.

---

## Passo 1 — Escrever o conteúdo direto no Admin

**Não precisa de arquivo nenhum.** Existe um formulário pronto pra
digitar ou colar o texto — inclusive colado direto do Word, já que o
campo de conteúdo é texto simples (aceita Markdown: `**negrito**`,
`*itálico*`, listas, tabelas `| col | col |`).

1. Admin → CMS → botão **"Novo Conteúdo / Mecanismo"**.
2. Preencha título, subtítulo, disciplina e tema (ambos são um
   *dropdown* do catálogo já cadastrado — sem risco de nome não bater
   com nada), autor e tempo estimado de leitura.
3. Clique **"Adicionar Seção"** para cada seção. Por seção, preencha:
   - **Título da Seção** e, opcionalmente, **Tag de Mecanismo**
     (`Fisiopatologia`, `Diagnóstico`, `Conduta`, `Prognóstico` ou
     `Prevenção` — mantenha um desses valores, ajuda a filtrar depois).
   - **Conteúdo** — cole aqui o texto da seção. Toda afirmação de peso
     clínico (dose, corte numérico, sequência de conduta, dado
     epidemiológico) deve levar `[N](#ref-N)` no corpo do texto, onde
     `N` é a posição da referência na lista de Referências (item 4).
     Se a fonte não cobrir algo, não invente — deixe mais enxuto ou
     escreva `LACUNA_DOCUMENTAL` no lugar do trecho que faltaria.
   - **Pontos-Chave** — frases de resumo que fazem sentido lidas
     sozinhas, fora do corpo do texto. Opcional, mas ajuda no estudo.
   - **Pérola Clínica** / **Alerta de Armadilha** — só preencha quando
     houver mesmo algo relevante; não são obrigatórios.
4. **Tags**, **Nós de Conexão/Pré-requisitos** (só se houver um
   pré-requisito explícito) e **Referências Bibliográficas** (uma por
   linha, terminando com o tipo de evidência entre colchetes — ex.
   `[Diretriz de prática clínica — nome da entidade]`) ficam no fim do
   formulário.
5. Clique em salvar. **Atenção**: o botão diz "Publicar Conteúdo", mas
   isso é só o nome do botão — o conteúdo continua como rascunho,
   invisível para quem estuda, até você fazer os passos 2 e 3 abaixo.

Toda referência listada precisa ter pelo menos um `[N]` amarrado a ela
no texto — evite deixar referência "órfã", sem citação nenhuma.

Você pode reabrir e editar esse mesmo formulário quantas vezes quiser
antes do passo 2, sem custo nenhum.

### Alternativa: escrever num arquivo `.compendium.yaml` e importar

Só vale a pena se você for gerar o conteúdo com IA (que produz o
arquivo pronto) ou já tiver um texto estruturado assim. Nesse caso,
Admin → **Importar material** → escolha o arquivo — a tela mostra um
preview com campos faltando e pede escolha manual de disciplina/tema
se o nome não bateu com o catálogo. O formato é o mesmo conteúdo do
formulário acima, só que em arquivo:

```yaml
id: slug-legivel-do-conteudo
title: "Título completo"
subtitle: "Subtítulo"
disciplineName: Nome da Disciplina     # precisa bater com um nome já cadastrado, ou a importação pede escolha manual
themeName: Nome do Tema
sections:
  - id: slug-da-secao
    title: Título da Seção
    mechanismTag: Fisiopatologia
    content: |
      Texto em Markdown, com [N](#ref-N) em toda afirmação clínica.
    keyTakeaways:
      - Frase-síntese autossuficiente
references:
  - "Referência completa, com [tipo de evidência entre colchetes]"
```

Único requisito técnico real (`src/utils/compendiumImport.ts:86-201`):
`title`, `disciplineName`, `themeName` preenchidos e pelo menos uma
seção com `title` e `content`. Fora isso é a mesma qualidade editorial
de sempre — ninguém valida por você.

## Passo 2 — Revisão e atestação (o passo que trava a publicação)

Isto é o que o Postgres exige antes de deixar publicar: uma revisão
com pelo menos um "claim" (uma afirmação do conteúdo) decidido, e
atestada como aprovada. Sem isso, o botão **Publicar** falha com um
erro de "publicação bloqueada". A boa notícia: é 100% solo — a mesma
conta cria a revisão, decide e aprova, sem precisar de uma segunda
pessoa.

Na lista de conteúdos do Admin, ao lado de Publicar/Despublicar, tem
um botão **Revisão**. Nele:

1. **Criar revisão** — tira uma foto do texto atual.
2. **Adicionar claim** — dois campos são obrigatórios pra o botão
   "Adicionar" ativar: o texto do claim e uma **"Localização estável"**
   (um identificador livre, ex. `section:slug-da-secao`). Depois
   decida o claim (**Aprovar** / **Requer correção/fonte** /
   **Inferência aceita**). Você escolhe a granularidade: **não precisa
   ser um claim por fato citado** — um claim por seção já é uma
   prática honesta e rápida, do tipo "conteúdo desta seção corresponde
   às referências citadas inline, marcadores [N]", decidido como
   Aprovado. Reserve granularidade maior (e o checkbox "Exige fonte",
   que pede vincular uma fonte formal) para alguma afirmação específica
   de alto risco que você queira rastrear à parte.
3. **Atestar — Aprovar revisão** — só habilita depois de ter pelo menos
   um claim na lista; libera o botão Publicar.

## Passo 3 — Publicar

Botão **Publicar** na mesma linha do conteúdo. A partir daqui fica
visível para quem tem conta ativa na plataforma (você e quem você
liberou).

## Passo 4 — Estudar (isto já roda sozinho)

Questões e flashcards **não são YAML** — são cadastrados direto na UI
do Admin, e se conectam ao conteúdo pelo `compendiumRefId` (e,
opcionalmente, `compendiumSectionId` para apontar pra uma seção
específica). A partir daí, tudo é automático:

- Responder uma questão errada já cadastra ela no seu Caderno de Erros
  e gera o flashcard correspondente — nenhuma ação manual sua.
- O Caderno de Erros e o compêndio ficam linkados: dá pra abrir a
  seção de origem direto a partir da questão errada.

Nada neste passo precisa de documentação — é o único trecho do fluxo
que já é enxuto por padrão.
