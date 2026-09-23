# Como produzir conteúdo no NexusMed — do zero até publicado

O NexusMed é uma plataforma de estudo para medicina: você escreve um
conteúdo, publica, estuda por ele, responde questões vinculadas a ele,
e o que você errar cai sozinho no seu caderno de erros e vira
flashcard. Este guia cobre o caminho real, ponta a ponta — inclusive a
etapa de revisão/atestação, que **é obrigatória no banco de dados**
(não dá pra publicar sem ela).

**Fluxo completo, em 4 passos:**

1. Escrever o conteúdo (direto no Admin — não precisa de YAML nem de
   Word, você já vai colar o texto ali mesmo), seguindo o padrão de
   completude e profundidade descrito mais abaixo.
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
     sozinhas, fora do corpo do texto. O formulário não bloqueia se
     ficar vazio, mas trate como obrigatório sempre que a seção tiver
     uma síntese real pra oferecer — critério exato na seção "Padrão de
     completude e profundidade", mais abaixo.
   - **Pérola Clínica** / **Alerta de Armadilha** — preencha sempre que
     houver mesmo algo relevante (não é raro que não haja — não force
     um achado que não existe); mesmo critério da seção abaixo.
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
4. **Tags** e **Referências Bibliográficas** (uma por linha, terminando
   com o tipo de evidência entre colchetes — ex. `[Diretriz de prática
   clínica — nome da entidade]`) ficam no fim do formulário.

   Desde a Fase 2 da taxonomia (2026-09-23), o campo de texto livre "Nós
   de Conexão/Pré-requisitos" foi substituído pelo bloco **Navegação do
   conteúdo**: material-pai, ordem entre irmãos, rótulo curto de trilha,
   tipo do nó, e os seletores **Estude antes**/**Veja também** — todos
   por seleção de material real (busca + clique), nunca título digitado.
   Um ancestral já é pré-requisito implícito pela trilha e não deve ser
   recadastrado em "Estude antes"; o formulário recusa antes mesmo de
   salvar. Ver `docs/operacao/standards/taxonomia-materiais.md` para as
   regras completas de quando usar cada tipo de ligação.
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

## Padrão de completude e profundidade (leia antes de atestar no Passo 2)

Até aqui, o conteúdo equivalente era produzido como HTMLs autônomos —
um arquivo por conteúdo/mecanismo, escrito com skills de IA dedicadas
(`compendio`, `mecanismo`) fora deste repositório. Esse modelo não foi
abandonado por ter um padrão de profundidade insuficiente — foi
abandonado porque a quantidade de HTMLs soltos parou de escalar: sem
banco de dados por trás, não dava pra buscar entre eles, linkar com
questões, alimentar caderno de erros nem manter consistência entre
dezenas de arquivos. O NexusMed existe pra resolver esse problema de
escala, não pra baixar o nível do material. Por isso os critérios
abaixo — que antes só existiam dentro das skills de compêndio — estão
aqui, escritos por extenso: valem tanto escrevendo direto no Admin
quanto importando `.md`/`.yaml`, sem precisar invocar skill nenhuma
pra saber o padrão.

Aplique isto **por seção** (o campo Conteúdo do item 3 do Passo 1), não
pelo Conteúdo inteiro de uma vez — uma seção pode ficar densa e a
vizinha rasa, e uma seção rasa não é compensada pelas outras.

### O critério central: saturação, não brevidade

**O critério de parada de uma seção não é "cobri o essencial" — é:
sobrou algum conceito citado pelo nome sem o mecanismo por trás dele
desenvolvido?** Nomear um conceito ("a inibição da ECA reduz a
angiotensina II", "o choque cardiogênico reduz o débito cardíaco") sem
explicar o porquê ou o como não é cobertura, é menção. Se sobrar
alguma pergunta óbvia do tipo "e por que isso acontece?" sem resposta
no texto, a seção não está pronta.

Nem todo conceito que aparece numa seção precisa do mesmo nível de
profundidade — use esta gradação pra decidir onde investir:

1. **Conceito central da seção** — o que a Tag de Mecanismo promete
   (seção com tag `Fisiopatologia` sobre choque cardiogênico → o
   mecanismo do choque cardiogênico é o central). Saturação total.
2. **Conceito de apoio** — necessário pro central fazer sentido, mas
   não é o foco (ex.: citar a curva de Frank-Starling ao explicar
   choque cardiogênico). Precisa de pelo menos um parágrafo com
   definição própria — não satura, mas não fica só citado de passagem.
3. **Menção contextual** — aparece só pra situar; pertence a outro
   Conteúdo. Nomeie e, se já existir um Conteúdo publicado cobrindo
   aquilo, aponte com o bloco **Navegação do conteúdo** (`Estude antes`
   ou `Veja também`, ver item 4) em vez de reexplicar — mas nunca deixe
   o termo solto sem nenhuma ponte pra onde aprofundar.

**Isto reconcilia com a regra "não invente, escreva `LACUNA_DOCUMENTAL`"
do Passo 1:** ela vale bem pra conceito de apoio ou menção contextual —
não force parágrafo onde a fonte não sustenta. Mas se o buraco cai no
**conceito central** da seção (o que a Tag de Mecanismo promete),
`LACUNA_DOCUMENTAL` ali não é uma seção pronta, é sinal de que falta
fonte melhor antes de fechar a seção — busque a referência que cobre o
mecanismo em vez de publicar o centro da seção com buraco.

### Parta do porquê, não só do o quê

Descrever conduta sem o mecanismo fisiopatológico por trás é a lacuna
mais comum, e a que este padrão existe pra fechar. Sempre que
etiologia, mecanismo e manifestação clínica aparecerem juntos,
**distinga os três explicitamente** — são camadas diferentes
(causa → processo → achado), e é a articulação entre elas que torna o
material didático em vez de decoreba de conduta.

### Um parágrafo por ideia

Profundidade não é motivo pra empilhar teorias, classes de fármacos ou
entidades diferentes na mesma frase corrida. Sinal de alerta: 3 ou
mais entidades nomeadas no mesmo parágrafo, cada uma com definição e
ressalva, sem transição entre elas. Prefira um parágrafo por ideia,
com o termo em **negrito** no início. Vale mesmo quando já existe uma
tabela cobrindo o mesmo conteúdo — tabela é comparação rápida, prosa é
raciocínio passo a passo; uma não substitui a outra.

### Controvérsia e limite do modelo: não esconda a incerteza

Quando a literatura genuinamente diverge (ex.: meta de PA por
população, indicação de anticoagulação em zona cinzenta), apresente as
duas posições — nunca resolva artificialmente escolhendo uma como se
fosse consenso pacífico. Quando um mecanismo ou modelo explicativo tem
limite conhecido (explica bem um cenário e falha em outro), registre
esse limite explicitamente — o lugar natural pra isso é o **Alerta de
Armadilha** da seção.

### Convenções médicas obrigatórias

Ciências básicas (imunologia, fisiologia, bioquímica, microbiologia,
anatomia):
- Nomenclatura padronizada — símbolo grego correto em citocinas
  (IL-1α vs. IL-1β, TNF-α, IFN-γ), nomenclatura anatômica internacional
  pra anatomia, IUPAC pra bioquímica.
- Mecanismo celular/molecular desenvolvido antes de qualquer implicação
  clínica — a implicação clínica é a consequência, não o substituto da
  explicação mecanística.

Clínica (farmacologia, fisiopatologia, semiologia, clínica médica):
- **DCI (Denominação Comum Internacional)** como nome primário de
  fármaco — nome comercial entre parênteses só na primeira ocorrência,
  se relevante.
- **Farmacocinética ≠ farmacodinâmica** — distinga o que o organismo
  faz com o fármaco do que o fármaco faz no organismo; não amalgame os
  dois sob "mecanismo de ação" genérico.
- **Grau de evidência** (Classe I/IIa/IIb ou A/B/C, conforme a
  diretriz) em toda recomendação de conduta — sem isso a recomendação
  fica sem lastro rastreável.

Em ambas:
- **Siglas por extenso na primeira ocorrência** — "insuficiência
  cardíaca (IC)", nunca a sigla solta na primeira aparição.
- **Contexto brasileiro quando pertinente** — epidemiologia local,
  disponibilidade no SUS/RENAME, portaria do Ministério da Saúde. Não é
  obrigatório em todo conteúdo, mas omitir quando existe é deixar
  ponta solta.

### Hierarquia de fontes

Ordem de peso ao decidir o que citar em `[N](#ref-N)` — mais alto
primeiro:

1. **Guidelines de sociedades médicas / consenso oficial** (AHA/ACC,
   ESC, WHO, Ministério da Saúde/CONITEC, CFM) — peso máximo pra
   recomendação de conduta.
2. **Revisões sistemáticas e meta-análises** (Cochrane, PubMed) — pra
   eficácia de intervenção.
3. **Livros-texto canônicos da subárea** — Goodman & Gilman
   (farmacologia), Robbins (fisiopatologia), Harrison (clínica médica),
   Abbas & Lichtman (imunologia), Guyton & Hall (fisiologia), Murray ou
   Lehninger (bioquímica), Murray ou Jawetz (microbiologia), Moore
   (anatomia).
4. **Artigo/trial de referência**, quando a descoberta tem um trabalho
   fundador citável (ex.: HOPE pra IECA em HAS, ISIS-2 pra AAS no IAM,
   Janeway/Medzhitov pra PRRs e imunidade inata).

Evite citar protocolo desatualizado, apostila sem autoria ou Wikipedia
como fonte primária.

### Pontos-Chave, Pérola Clínica e Alerta de Armadilha na prática

O formulário não bloqueia a publicação se esses três campos ficarem
vazios — mas trate-os como obrigatórios sempre que a seção tiver
material real pra eles, e só pule quando genuinamente não houver (ex.:
seção introdutória sem armadilha clínica nenhuma). Critério prático:

- Se dá pra escrever uma frase-síntese que faz sentido lida fora do
  corpo do texto, ela pertence a **Pontos-Chave**.
- Se existe um erro de raciocínio comum nessa seção (confundir dois
  conceitos parecidos, aplicar uma regra fora do contexto certo), ele
  pertence a **Alerta de Armadilha**.
- Se existe um achado, associação ou correlação clinicamente valiosa
  que não é óbvia só lendo o texto corrido, ela pertence a **Pérola
  Clínica**.

Deixar isso vazio por preguiça é lacuna, não economia de tempo.

### Checklist de completude — rode antes de decidir o claim no Passo 2

- [ ] Todo conceito mencionado por nome na seção tem o mecanismo
  desenvolvido, ou é claramente de apoio/contextual (gradação acima)?
- [ ] A seção responde "por quê" antes de "o quê"?
- [ ] Etiologia, mecanismo e manifestação estão distinguidos (quando os
  três aparecem juntos)?
- [ ] Nenhum parágrafo empilha 3+ entidades/teorias sem transição?
- [ ] Controvérsia genuína (se houver) apresentada nos dois lados, sem
  resolução artificial?
- [ ] Limite do modelo/mecanismo registrado quando existe (Alerta de
  Armadilha)?
- [ ] Grau de evidência indicado em toda recomendação de conduta?
- [ ] DCI usada como nome primário de fármaco citado (quando aplicável)?
- [ ] Siglas por extenso na primeira ocorrência?
- [ ] Toda referência da lista amarrada a pelo menos um `[N]` no texto?
- [ ] Pontos-Chave/Pérola/Alerta preenchidos onde havia material real
  pra eles?
- [ ] Nó de Conexão/Pré-requisito criado pra todo conceito contextual
  que já tem Conteúdo publicado cobrindo ele?

Se sobrar algum item sem resposta honesta de "sim" (ou "não se aplica"
genuíno), a seção não está pronta pra virar claim **Aprovado** no
Passo 2 — decida como **Requer correção/fonte** e volte pro Passo 1.

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
   às referências citadas inline, marcadores [N], e passa no checklist
   de completude", decidido como Aprovado **só depois de rodar o
   checklist da seção "Padrão de completude e profundidade" acima** —
   se algum item falhar, decida como Requer correção/fonte em vez de
   Aprovado, mesmo que a citação em si esteja correta. Reserve
   granularidade maior (e o checkbox "Exige fonte",
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
