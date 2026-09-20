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
     **Citação é por claim, não por frase.** Um claim é uma ideia
     completa — pode levar 1 frase ou 3, tudo bem, desde que venha da(s)
     mesma(s) fonte(s) — e leva UMA citação no fim dele, não uma citação
     repetida atrás de cada frase/oração que o compõe. Errado:
     `A retração elástica está preservada [1][4]. Há redução harmônica
     dos volumes [1][4].` (mesmo par de fontes duas vezes — é 1 claim
     só). Certo: `A retração elástica está preservada. Há redução
     harmônica dos volumes [1][4].` Cite mais de uma vez dentro do mesmo
     trecho só quando frases vizinhas vêm de fontes GENUINAMENTE
     diferentes (nesse caso a citação já é informativa, não redundante)
     — nunca por hábito. Isso vale para prosa, bullets e tabelas: numa
     tabela onde toda linha repete a mesma citação, ela pertence à frase
     que introduz a tabela, não a cada célula (achado real: compêndio de
     Espirometria, 198 citações caindo pra 123 depois de aplicar esta
     regra, sem perder nenhuma referência — nenhuma das 8 ficou sem
     citação nenhuma no texto).
     **Toda tabela precisa dessa frase de abertura citada — nunca zero
     citação.** Não é só estilo: o `SafeMarkdown` lê o bloco
     imediatamente anterior a cada tabela e, se ele terminar com
     `[N](#ref-N)`, gera sozinho uma legenda "Fonte: [N]" grudada na
     tabela — por isso a frase precisa ficar a **um parágrafo de
     distância** da tabela, sem heading nem bloco extra no meio (`Frase
     citada [N](#ref-N):` numa linha, linha em branco, `| tabela |` na
     seguinte). Sem essa frase citada logo acima, a tabela renderiza sem
     nenhuma citação visível grudada nela (achado real: compêndio de
     Espirometria, 3 tabelas já tinham a frase citada corretamente no
     parágrafo acima, mas nenhuma citação aparecia colada na tabela em
     si — o dono do conteúdo leu isso como "tabela sem referência" antes
     de existir a legenda automática; a citação já estava certa no
     texto, só longe demais pra ser percebida olhando só a tabela).
     **Se o texto veio de uma IA de fontes (NotebookLM e similares):**
     ela numera as citações pela ordem interna dela sobre as fontes que
     carregou ali — isso quase nunca bate com a posição real na SUA
     lista de Referências aqui embaixo. Antes de colar, renumere à mão
     cada marcador para a posição certa e garanta que está no formato
     `[N](#ref-N)`, nunca só `[N]` solto (isso não vira link nenhum e o
     preview de importação vai reclamar).
   - **Pontos-Chave** — frases de resumo que fazem sentido lidas
     sozinhas, fora do corpo do texto. Opcional, mas ajuda no estudo.
   - **Pérola Clínica** / **Alerta de Armadilha** — só preencha quando
     houver mesmo algo relevante; não são obrigatórios.
   - **Sempre deixe uma linha em branco antes e depois de um
     subtítulo (`####`), de uma tabela ou de uma lista com
     marcadores/numerada.** Um `#### Subtítulo` ou uma lista colados
     direto na linha de cima (sem linha em branco separando) já
     apareceram publicados como texto literal pro estudante —
     `#### Subtítulo Texto do parágrafo...` numa linha só, ou
     `* Item da lista` sem virar bullet — em vez de virar o elemento
     visual esperado (achado real: compêndio de Espirometria, 2026-09).
     O renderer (`SafeMarkdown`) foi endurecido pra tolerar essa falta
     em boa parte dos casos, mas trate isso como rede de segurança, não
     como desculpa pra pular a linha em branco — é a convenção correta
     de Markdown e evita depender do endurecimento cobrir todo caso.
     **Evite listas aninhadas** (um sub-item indentado dentro de um
     item numerado, ex. `1. Item` seguido de `    * Sub-item`) — o
     renderer não suporta aninhamento hoje; reescreva como itens de
     mesmo nível (`1.`, `2.`, `3.`...) ou como frases dentro do próprio
     item, em vez de indentar.
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

### Alternativa: importar um arquivo (`.md` ou `.compendium.yaml`)

Vale a pena se você gerar o conteúdo com uma IA de fontes (NotebookLM e
similares — que produzem Markdown nativamente, não YAML) ou já tiver
um texto pronto. Admin → **Importar material** → escolha o arquivo — a
tela mostra um preview com campos faltando e pede escolha manual de
disciplina/tema se o nome não bateu com o catálogo.

**Antes de escrever `Disciplina`/`Tema` no arquivo, confira o valor
exato do catálogo real** — abra "Novo Conteúdo / Mecanismo" no Admin e
veja os dois *dropdowns* (não precisa criar nada, só olhar as opções
já cadastradas). O erro mais comum aqui é **inventar um Tema
específico pro assunto** (ex.: "Espirometria e Testes de Função
Pulmonar"). `Tema` não é um resumo do conteúdo — é uma categoria ampla
e fixa do currículo, a mesma para dezenas de conteúdos diferentes
dentro da disciplina (ex.: `Clínica`, `Básica`). Use exatamente um
valor que já existe no *dropdown*, nunca um termo novo criado pra
combinar com o título. Se uma IA gerou o arquivo, ela não tem como
saber esse valor sozinha — informe o Tema certo antes de pedir pra
gerar, ou edite essa linha manualmente depois. Isso não trava a
importação (só pede escolha manual na hora), mas evita o retrabalho.

**Formato `.md`** — mesmo conteúdo do formulário, em Markdown simples:

```markdown
# Título completo

**Subtítulo:** Subtítulo
**Disciplina:** Nome da Disciplina     (precisa bater com um nome já cadastrado, ou a importação pede escolha manual)
**Tema:** Nome do Tema
**Autor:** (opcional)
**Tempo estimado de leitura:** 18 minutos (opcional)

### Título da Seção
**Tag de Mecanismo:** Fisiopatologia (opcional)

Texto em Markdown, com [N](#ref-N) em toda afirmação clínica — N é a
posição da referência na lista de Referências abaixo.

**Pontos-Chave:**
*   Frase-síntese autossuficiente

> 💡 **Pérola Clínica:** opcional
> ⚠️ **Alerta de Armadilha:** opcional

### Tags
`tag1` `tag2`

### Referências Bibliográficas
1. Referência completa, com [tipo de evidência entre colchetes]
```

Como rede de segurança, o preview de importação também avisa (sem
bloquear) se ainda sobrar alguma citação em formato antigo tipo
`[268]` sem virar link — mas o ideal é já entregar corrigido, como
descrito acima; ninguém remapeia isso por você automaticamente, porque
adivinhar a referência certa seria inventar citação.

**Formato `.yaml`** — o formato de autoria original, mais verboso mas
igualmente válido:

```yaml
title: "Título completo"
subtitle: "Subtítulo"
disciplineName: Nome da Disciplina     # precisa bater com um nome já cadastrado, ou a importação pede escolha manual
themeName: Nome do Tema
sections:
  - title: Título da Seção
    mechanismTag: Fisiopatologia
    content: |
      Texto em Markdown, com [N](#ref-N) em toda afirmação clínica.
    keyTakeaways:
      - Frase-síntese autossuficiente
references:
  - "Referência completa, com [tipo de evidência entre colchetes]"
```

Único requisito técnico real, nos dois formatos
(`src/utils/compendiumImport.ts`): `title`, `disciplineName`,
`themeName` preenchidos e pelo menos uma seção com `title` e
`content`. Fora isso é a mesma qualidade editorial de sempre — ninguém
valida por você.

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
