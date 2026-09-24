# Como produzir material para o NexusMed

**Versão 2 do padrão — 23/09/2026**

O NexusMed é uma plataforma de estudo para medicina. O estudante escolhe um
assunto, lê o material, aprofunda até onde achar necessário, testa o que leu
com questões, e o que errar vira flashcard revisado pela própria plataforma
nos dias certos. O material é a base de tudo isso.

Este documento é completo em si mesmo: tudo o que é preciso para produzir um
material está aqui, sem depender de nenhum outro arquivo. Ele tem duas partes:

- **Parte 1 — Para quem escreve o material.** Pode ser uma pessoa ou uma
  inteligência artificial. Cobre o que escrever, com que profundidade, como
  citar e o formato exato do arquivo.
- **Parte 2 — Para quem opera a plataforma.** Importar o arquivo, posicionar
  o material, revisar, atestar e publicar.

**Se você é uma IA recebendo este documento:** sua tarefa é a Parte 1 —
entregar **um arquivo `.md` por material**, no formato da seção 1.7. A Parte 2
é feita por uma pessoa dentro da plataforma; leia só para entender o contexto
e **não** produza nada dela. Se receber junto o texto de um material antigo,
sua tarefa é reescrevê-lo neste padrão, aproveitando o conteúdo e as
referências que ainda valem.

---

# Parte 1 — Para quem escreve o material

## 1.1 O que é um material

Um material cobre **um assunto com objetivo de aprendizagem próprio** — algo
que o estudante consegue estudar de uma vez e sair sabendo. Tamanho de
referência: **8 a 25 minutos de leitura**. Abaixo de uns 8 minutos, o assunto
cabe como seção ou linha de tabela no material de cima. Acima de uns 25
minutos com mais de um objetivo, o material deve ser dividido.

Os materiais formam uma **árvore**: cada material pode ter um material
acima dele (o "pai") e vários abaixo (os "filhos"). O estudante começa pelo
panorama e desce até onde precisar. Exemplo:

```text
Antibióticos — visão geral
└── Inibidores da síntese da parede celular
    └── β-lactâmicos
        └── Cefalosporinas
            └── Cefalosporinas de terceira geração
                ├── Ceftriaxona
                └── Ceftazidima
```

A plataforma mostra ao estudante o caminho até o material atual e oferece os
filhos no fim da leitura, com o título "Aprofunde-se". **Por isso um material
nunca repete o que o pai já explica** — ele parte de onde o pai parou.

## 1.2 O que você precisa receber antes de escrever

Quem encomenda o material deve informar os itens abaixo. **Se algum faltar,
pergunte antes de escrever — não invente.**

1. **Título** do material.
2. **Disciplina** e **Tema**, escritos exatamente como existem no catálogo da
   plataforma. O Tema é uma categoria ampla e fixa do currículo (por exemplo,
   `Clínica` ou `Básica`), não um resumo do assunto — nunca crie um Tema novo
   para combinar com o título. Você não tem acesso ao catálogo: use
   exatamente os nomes que receber. A Disciplina é a "casa" do material — onde
   o conceito é definido (um fármaco mora em Farmacologia mesmo sendo muito
   usado em Infectologia). Escreva a partir dessa casa: um material de
   Farmacologia sobre um antibiótico não vira tratado sobre as infecções que
   ele trata.
3. **Lugar na árvore:** qual material fica acima (o pai), quais ficam ao
   lado (os irmãos) e quais virão abaixo (os filhos previstos). É isso que
   diz o que este material deve cobrir e o que ele deve deixar para os
   outros.
4. **Nível** do material (ver 1.3).
5. **Tempo-alvo** de leitura.
6. **Fontes** disponíveis — diretrizes, livros-texto, revisões, artigos.

## 1.3 O que escrever em cada nível

**Visão geral ou classe** — deve responder:
1. o que reúne os membros daquele grupo;
2. qual é o mecanismo compartilhado;
3. como os subgrupos se diferenciam;
4. quais mecanismos de resistência ou complicações são centrais;
5. quais ramos existem abaixo e o que distingue cada um — descreva os ramos
   como conteúdo ("as cefalosporinas se organizam em gerações..."), sem citar
   títulos de materiais.

**Subclasse** — deve responder:
1. o que diferencia a subclasse dentro da classe;
2. quais fármacos ou entidades ela contém;
3. quais diferenças entre eles mudam o raciocínio clínico;
4. quais fármacos têm particularidades que serão aprofundadas mais abaixo —
   nomeie-os e diga em uma frase o que os distingue, sem remeter a páginas.

**Fármaco ou entidade individual** — contém **somente o que é distintivo**:
farmacocinética, espectro, indicações, segurança, resistência, pontos de
prova que o separam dos irmãos. O mecanismo compartilhado é do pai: cite-o em
uma frase e siga — **não reconte a classe inteira**.

**Condição clínica** (doença, síndrome) — etiologia, mecanismo e
manifestação, diagnóstico e conduta, distinguidos entre si. Fármacos que já
têm material próprio são nomeados, não reexplicados.

## 1.4 Padrão de profundidade

Aplique **por seção**, não ao material inteiro: uma seção densa não compensa a
vizinha rasa.

### O critério central: saturação, não brevidade

A seção só está pronta quando **nenhum conceito ficou citado pelo nome sem o
mecanismo por trás desenvolvido**. Nomear ("a inibição da ECA reduz a
angiotensina II") sem explicar o porquê e o como é menção, não cobertura. Se
sobrar uma pergunta óbvia do tipo "e por que isso acontece?", a seção não
está pronta.

Nem todo conceito pede a mesma profundidade:

1. **Conceito central** — o que a seção promete. Saturação total.
2. **Conceito de apoio** — necessário para o central fazer sentido, mas não é
   o foco. Pelo menos um parágrafo com definição própria.
3. **Menção contextual** — aparece só para situar e pertence a outro material
   (o pai, um irmão, outra disciplina). Nomeie e dê uma frase de contexto,
   sem reexplicar. Não é preciso fazer nenhuma ligação: a plataforma conecta
   os materiais pela busca e pelas questões que cobram os dois.

Se a fonte não cobre algo, não invente: deixe o trecho mais enxuto ou
escreva `LACUNA_DOCUMENTAL` onde ele faltaria. Isso é aceitável em conceito
de apoio ou menção contextual. **No conceito central, `LACUNA_DOCUMENTAL`
significa que falta fonte** — a seção não está pronta.

### Parta do porquê, não só do o quê

Conduta sem o mecanismo por trás é a lacuna mais comum. Sempre que etiologia,
mecanismo e manifestação clínica aparecem juntos, **distinga os três
explicitamente**: causa → processo → achado.

### Um parágrafo por ideia

Não empilhe teorias, classes ou entidades na mesma frase corrida. Sinal de
alerta: três ou mais entidades no mesmo parágrafo, cada uma com definição e
ressalva, sem transição. Prefira um parágrafo por ideia, com o termo em
**negrito** no início. Tabela não substitui prosa: tabela compara; prosa
explica o raciocínio.

### Controvérsia e limite do modelo

Quando a literatura diverge de verdade, apresente as posições — nunca escolha
uma como se fosse consenso. Quando um modelo explicativo tem limite conhecido,
registre o limite; o lugar natural é o **Alerta de Armadilha** da seção.

### Convenções médicas obrigatórias

Ciências básicas (imunologia, fisiologia, bioquímica, microbiologia,
anatomia):
- Nomenclatura padronizada: símbolo grego correto (IL-1α, IL-1β, TNF-α,
  IFN-γ), nomenclatura anatômica internacional, IUPAC em bioquímica.
- Mecanismo celular e molecular antes de qualquer implicação clínica.

Clínica (farmacologia, fisiopatologia, semiologia, clínica médica):
- **DCI (Denominação Comum Internacional)** como nome do fármaco; nome
  comercial entre parênteses só na primeira ocorrência, se relevante.
- **Farmacocinética é diferente de farmacodinâmica**: o que o organismo faz
  com o fármaco não é o que o fármaco faz no organismo.
- **Grau de evidência** (Classe I/IIa/IIb ou A/B/C, conforme a diretriz) em
  toda recomendação de conduta.

Em ambas:
- **Texto em português do Brasil**, mesmo quando a fonte está em inglês.
- **Sigla por extenso na primeira ocorrência**: "insuficiência cardíaca
  (IC)".
- **Contexto brasileiro quando pertinente**: epidemiologia local,
  disponibilidade no SUS e na RENAME, portarias do Ministério da Saúde.

### Hierarquia de fontes

Da mais forte para a mais fraca:

1. Diretrizes de sociedades médicas e consensos oficiais (AHA/ACC, ESC, OMS,
   Ministério da Saúde, CONITEC, CFM) — peso máximo para conduta.
2. Revisões sistemáticas e meta-análises (Cochrane, PubMed) — para eficácia.
3. Livros-texto canônicos: Goodman & Gilman (farmacologia), Robbins
   (fisiopatologia), Harrison (clínica médica), Abbas & Lichtman
   (imunologia), Guyton & Hall (fisiologia), Lehninger (bioquímica), Murray
   ou Jawetz (microbiologia), Moore (anatomia).
4. Artigo ou ensaio de referência, quando a descoberta tem trabalho fundador
   citável.

Não use protocolo desatualizado, apostila sem autoria ou Wikipédia como
fonte primária.

### Pontos-Chave, Pérola Clínica e Alerta de Armadilha

Não são obrigatórios em toda seção, mas preencha sempre que houver material
real — deixar vazio por pressa é lacuna.

- **Pontos-Chave:** frases-síntese que fazem sentido lidas sozinhas, fora do
  texto.
- **Pérola Clínica:** um achado, associação ou correlação clinicamente
  valiosa que não é óbvia lendo o texto corrido.
- **Alerta de Armadilha:** um erro de raciocínio comum nessa seção —
  confundir dois conceitos parecidos, aplicar uma regra fora do contexto.

No máximo **um** bloco de Pontos-Chave, **uma** Pérola e **um** Alerta por
seção — se houver dois, a plataforma guarda só um e o outro se perde.

Além desses três, há caixas de destaque opcionais, para usar com
parcimônia dentro do texto da seção:

- `> **Diretriz:** texto` — recomendação oficial de diretriz, com grau de
  evidência.
- `> **Mecanismo:** texto` — um mecanismo que merece ficar isolado do texto
  corrido.
- `> **Consenso de Prova:** texto` — quando o que as provas cobram difere
  da prática de plantão.

## 1.5 Citações

- Toda afirmação de peso clínico (dose, corte numérico, sequência de
  conduta, dado epidemiológico) leva uma citação no formato
  **`[N](#ref-N)`**, em que **N é a posição da referência na lista** do fim
  do arquivo. Várias fontes: `[1](#ref-1)[4](#ref-4)`.
- **Nunca** `[N]` sozinho, sem o `(#ref-N)`: não vira link e a importação
  reclama.
- **Cite por ideia, não por frase.** Uma ideia pode ocupar uma ou três
  frases vindas da mesma fonte e leva **uma** citação, no fim. Errado:
  `A retração elástica está preservada [1](#ref-1)[4](#ref-4). Há redução
  harmônica dos volumes [1](#ref-1)[4](#ref-4).` Certo: `A retração elástica
  está preservada. Há redução harmônica dos volumes [1](#ref-1)[4](#ref-4).`
  Cite mais de uma vez no mesmo trecho só quando frases vizinhas vêm de
  fontes realmente diferentes.
- **Toda tabela precisa de uma frase de abertura citada, logo acima dela**,
  terminada pela citação e seguida de uma linha em branco. A plataforma
  transforma essa citação na legenda "Fonte: [N]" da tabela. Não repita a
  mesma citação em todas as células.
- **Toda referência da lista precisa ser citada pelo menos uma vez** no
  texto.
- Se o texto veio de uma ferramenta que numera fontes pela ordem interna
  dela, renumere cada citação para a posição certa na lista final antes de
  entregar.

## 1.6 Palavras-chave

O bloco `### Palavras-chave` é o que a busca da plataforma usa para achar o
material por outros nomes. Inclua:

- **sinônimos** e grafias alternativas: `β-lactâmico`, `beta-lactâmico`,
  `betalactâmico`;
- **siglas**: `ATB`, `MRSA`, `ESBL`;
- **nomes comerciais** relevantes no Brasil;
- **termos de prova** pelos quais o estudante procuraria o assunto.

Entre 5 e 15 palavras-chave costuma bastar. Não repita o título inteiro.

## 1.7 Formato do arquivo `.md`

Entregue **um arquivo `.md` por material**, exatamente nesta estrutura:

````markdown
# Título completo do material

**Subtítulo:** Uma frase que resume o material
**Disciplina:** Nome exato da disciplina no catálogo
**Tema:** Nome exato do tema no catálogo
**Autor:** Nome de quem assina
**Tempo estimado de leitura:** 18 minutos
**Versão do padrão:** 2

### Título da primeira seção
**Tag de Mecanismo:** Mecanismo de ação

Texto da seção em Markdown, com citação [1](#ref-1) em toda afirmação de peso clínico. Cada parágrafo fica numa linha só.

#### Um subtítulo dentro da seção

Mais texto. Frase que introduz a tabela abaixo [2](#ref-2).

| Coluna A | Coluna B |
|---|---|
| valor | valor |

**Pontos-Chave:**
- Primeira frase-síntese, que faz sentido lida sozinha.
- Segunda frase-síntese.

> 💡 **Pérola Clínica:** o achado que não é óbvio lendo o texto.

> ⚠️ **Alerta de Armadilha:** o erro de raciocínio comum nesta seção.

### Título da segunda seção
**Tag de Mecanismo:** Farmacocinética

Texto da segunda seção [1](#ref-1).

### Palavras-chave
`palavra-chave 1` `sigla` `sinônimo` `nome comercial`

### Referências Bibliográficas
1. Referência completa da primeira fonte. [Diretriz de prática clínica — nome da entidade]
2. Referência completa da segunda fonte. [Livro-texto]
````

**Regras do formato — a importação segue estas regras à risca:**

1. **A primeira linha é `# Título`**, com um único `#`.
2. **Os metadados vêm logo abaixo do título**, um por linha, no formato
   `**Rótulo:** valor`, com os rótulos exatamente como no modelo. O tempo de
   leitura é um número seguido de "minutos". Autor é opcional: sem autor,
   omita a linha inteira. **Versão do padrão** é sempre `2` — a versão deste
   documento; ela diz, no futuro, contra qual padrão o material foi escrito.
   O título não leva numeração ("Antimicrobianos I", "Módulo 2"): a ordem
   entre materiais é dada pela plataforma.
3. **Não escreva nada entre os metadados e a primeira seção.** Todo texto
   ali é descartado.
4. **Cada `###` inicia uma seção nova.** Por isso, **dentro de uma seção,
   subtítulo é sempre `####`** — nunca `###`, `##` ou `#`. Um `###` no meio
   do texto parte a seção em duas.
5. **Tag de Mecanismo** é o rótulo curto exibido acima da seção no leitor
   (uma a três palavras). Exemplos: `Visão geral`, `Mecanismo de ação`,
   `Farmacocinética`, `Espectro de ação`, `Resistência`, `Indicações`,
   `Segurança`, `Fisiopatologia`, `Diagnóstico`, `Conduta`, `Prognóstico`,
   `Prevenção`, `Comparação`. Opcional, mas recomendado. Uma por seção, na
   linha logo abaixo do título da seção.
6. **Pontos-Chave:** a linha `**Pontos-Chave:**` sozinha, seguida de itens
   começando com `- `.
7. **Pérola Clínica e Alerta de Armadilha:** cada um numa citação própria
   (`> `), com o rótulo em negrito exatamente como no modelo. Deixe uma linha
   em branco entre os dois.
8. **O bloco de palavras-chave se chama exatamente `### Palavras-chave`**
   (o nome antigo, `### Tags`, também é aceito), com cada palavra-chave entre
   crases (`` ` ``). Qualquer outro nome vira uma seção de conteúdo.
9. **O bloco de referências se chama `### Referências Bibliográficas`**, com
   uma referência por item numerado (`1.`, `2.`...). Cada referência termina
   com o tipo de evidência entre colchetes. A numeração é a que as citações
   `[N](#ref-N)` usam.
10. **Não inclua** blocos de "pré-requisitos", "conexões", "veja também",
    "estude antes" ou posição na árvore: nada disso é lido da importação.

**O que o leitor da plataforma exibe — e o que não exibe:**

- Exibe: parágrafos, `**negrito**`, `*itálico*`, subtítulos `####`, listas
  com `- `, listas numeradas, tabelas, citações `[N](#ref-N)`, links
  `https://...`, caixas de destaque com `> ` e fórmulas (regra abaixo).
- **Escreva cada parágrafo numa linha só**, sem quebrar linha no meio.
- **Deixe uma linha em branco antes e depois** de todo subtítulo, lista,
  tabela e caixa `> `. Depois de uma lista isso é obrigatório: um parágrafo
  colado no último item vira parte dele.
- **Não use lista dentro de lista.** Não há recuo de nível: reescreva como
  itens do mesmo nível ou como frases dentro do item.
- **Fórmula:** sozinha numa linha própria, com `=`, sem ponto final; o
  leitor a exibe numa caixa de fórmula. Expoente com `^`: `x^2`,
  `0,9938^Idade`, `(Cr/κ)^(-1,200)`. Para citar a fonte da fórmula, ponha a
  citação na frase que a apresenta, ou escreva a fórmula como
  `> TFG = ... [1](#ref-1)`. **Por isso, fora de fórmula, nunca deixe uma
  linha com `=` sem pontuação no fim.**
- **Não use LaTeX** (`$...$`, `$$...$$`, `\frac`, `\ge`): aparece literal na
  tela. Escreva em texto e Unicode: `≥`, `≤`, `≈`, `×`, `÷`, `±`, `→`, `µg`,
  `mL/min/1,73 m²`; intervalos com traço-en sem espaço (`60–89`).
- **Não use `<=` nem `>=`**: use `≤` e `≥`.
- **Não use imagens nem HTML.**

## 1.8 O que não fazer

- Não invente Disciplina, Tema, referência, dose, corte numérico ou grau de
  evidência. Sem fonte, use `LACUNA_DOCUMENTAL`.
- Não reconte o que o material de cima já explica.
- Não cubra no mesmo material um assunto que tem material próprio abaixo —
  nomeie e deixe o aprofundamento para ele.
- Não escreva introdução solta antes da primeira seção.
- Não use formatação fora da lista da seção 1.7.
- **Não cite outros materiais como navegação**: nada de "veja o material
  X", "no próximo módulo", "como vimos na aula anterior", "nas páginas
  seguintes". Mencionar um assunto é normal ("a meningite bacteriana exige
  penetração liquórica"); remeter a uma página, não. Quem liga os materiais
  é a plataforma — assim, criar, mover ou dividir um material nunca obriga a
  editar o texto de outro.

## 1.9 Checklist antes de entregar

Conteúdo, por seção:
- [ ] Todo conceito nomeado tem o mecanismo desenvolvido, ou é claramente de
  apoio ou contextual?
- [ ] A seção responde "por quê" antes de "o quê"?
- [ ] Etiologia, mecanismo e manifestação estão distinguidos, quando os três
  aparecem?
- [ ] Nenhum parágrafo empilha três ou mais entidades sem transição?
- [ ] Controvérsia real apresentada dos dois lados?
- [ ] Limite do modelo registrado, quando existe?
- [ ] Grau de evidência em toda recomendação de conduta?
- [ ] Fármacos pelo nome DCI? Siglas por extenso na primeira ocorrência?
- [ ] Pontos-Chave, Pérola e Alerta preenchidos onde havia material real?
- [ ] Nada repete o material de cima, e nada invade o que é de um material
  abaixo?
- [ ] Nenhuma remissão a outro material ou página ("veja o material",
  "próximo módulo")? Título sem numeração?

Citações e formato, no arquivo inteiro:
- [ ] Toda citação no formato `[N](#ref-N)`, com N certo? Nenhum `[N]` solto?
- [ ] Toda referência citada pelo menos uma vez? Toda tabela com frase de
  abertura citada?
- [ ] Dentro das seções, só `####` como subtítulo? Nenhum texto antes da
  primeira seção?
- [ ] `### Palavras-chave` com sinônimos, siglas e nomes comerciais?
- [ ] Linha `**Versão do padrão:** 2` nos metadados?
- [ ] Nada de LaTeX, `<=`, `>=`, imagem, HTML ou lista dentro de lista?
- [ ] Cada parágrafo numa linha só? Linha em branco antes e depois de
  subtítulos, listas, tabelas e caixas `> `?
- [ ] No máximo um bloco de Pontos-Chave, uma Pérola e um Alerta por seção?

---

# Parte 2 — Para quem opera a plataforma

Esta parte é feita por uma pessoa, na Área Editorial da plataforma.

## 2.1 Fluxo completo

1. **Importar** o arquivo, já escolhendo onde o material fica na árvore.
2. **Revisar e atestar** — obrigatório; sem isso a plataforma não publica.
3. **Publicar**, de cima para baixo na árvore.
4. **Produzir as questões** do material e ligá-las a ele.

Importe **de cima para baixo** (a classe antes da subclasse, a subclasse antes
do fármaco): o pai precisa existir para ser escolhido.

**Antes de pedir o material a uma IA**, passe a ela os itens da seção 1.2.
Para os nomes exatos de Disciplina e Tema: Área Editorial → **Novo
Conteúdo / Mecanismo** e veja as opções dos dois menus (não precisa criar
nada). Mande junto a lista dos materiais que já existem naquele ramo da
árvore, para ela saber o que não repetir.

**Onde o material mora (a Disciplina).** Cada material tem uma casa só, e o
ramo inteiro da árvore mora na mesma. Regra: **o material mora onde o
conceito é definido.**

- Fármaco e classe de fármaco → Farmacologia.
- Doença e síndrome → a especialidade clínica (Infectologia, Cardiologia...).
- Mecanismo e fisiologia → a ciência básica (Fisiologia, Imunologia...).

Exemplo: "Ceftriaxona" mora em Farmacologia; "Meningite bacteriana" mora em
Infectologia e menciona a ceftriaxona sem reexplicá-la. Nunca copie um
material para ele aparecer em outra disciplina. Hoje o material aparece na
biblioteca só da casa, e a busca o encontra de qualquer lugar; a plataforma
vai ganhar a opção de mostrar um ramo inteiro em outras disciplinas, sem
cópia.

**A plataforma é a referência, não a pasta.** Arquivos `.md` guardados no
computador envelhecem: depois de importado, o material pode ser corrigido na
plataforma. Para mudar um material, parta sempre do que está publicado nela.

## 2.2 Importar o material

Área Editorial → **Importar material** → escolha o arquivo `.md`. A tela
mostra, em ordem:

1. **Prévia** — título, disciplina, tema, número de seções e de referências,
   palavras-chave e campos faltando. Se a disciplina ou o tema do arquivo não
   baterem com o catálogo, a tela pede para escolher — ou escolha o
   material-pai, que resolve os dois.
2. **Posição na árvore** — escolha o **material-pai**. A lista traz materiais
   de todas as disciplinas, agrupados por disciplina, e **o pai define a
   disciplina e o tema do material**: os do arquivo são trocados pelos do pai.
   O tema ainda pode ser trocado na prévia; a disciplina, não (pai e filho
   ficam sempre na mesma). O material entra **no fim dos irmãos**; mexa na
   ordem só se quiser outra posição. Se o título for longo, preencha um
   **rótulo curto** (até 40 caracteres) para o caminho de navegação:
   "Terceira geração" em vez de "Cefalosporinas de terceira geração". O
   **Caminho resultante** mostra onde o material vai aparecer. Sem pai, o
   material entra como raiz, com a disciplina e o tema do arquivo, e pode ser
   posicionado depois.
3. **Salvar rascunho** — grava tudo de uma vez. Se algo violar uma regra da
   árvore (por exemplo, pai de outra disciplina), nada é criado, a tela
   mostra o motivo, e **Voltar e corrigir** retorna à prévia sem reenviar o
   arquivo.
4. **Sucesso** — mostra onde o material ficou e os próximos passos.

O formato `.compendium.yaml` também é aceito, mas o formato padrão é o `.md`
da Parte 1.

**Alternativa sem arquivo:** Área Editorial → **Novo Conteúdo / Mecanismo**
abre um formulário para digitar ou colar o texto, com os mesmos campos e a
mesma posição na árvore. O botão final é **Salvar rascunho**.

**Para reabrir um material:** na lista de conteúdos, **Editar → Metadados e
posição na árvore**. Na edição, trocar o pai por outro **da mesma
disciplina** não mexe no tema. Um pai **de outra disciplina** leva o material
para ela, com o tema do pai — e a tela avisa que a atestação vai cair (ver
2.3). Um material que tem outros abaixo dele não muda de disciplina por aqui.

## 2.3 Revisar e atestar

A plataforma só publica material com uma revisão aprovada.

Na lista de conteúdos, botão **Revisão**:

1. **Criar primeira revisão** — tira uma foto do texto atual.
2. **Adicionar claim** — um claim é uma afirmação do conteúdo que você
   confere. O menu **Selecionar seção/trecho** preenche o texto e a
   **localização estável** a partir de uma seção real; se preferir, digite
   os dois (a localização é um identificador livre, como
   `section:mecanismo-de-acao`). Não precisa ser um claim por
   fato: **um claim por seção** é prática honesta e rápida — por exemplo,
   "o conteúdo desta seção corresponde às referências citadas e passa no
   checklist de completude". Decida cada claim: **Aprovar**, **Requer
   correção/fonte** ou **Inferência aceita**. Só aprove depois de rodar o
   checklist da seção 1.9; se algo falhar, marque **Requer correção/fonte** e
   volte ao texto. Para uma afirmação específica de alto risco, use um claim
   próprio com **Exige fonte**, que pede o vínculo com uma fonte formal.
3. **Atestar — Aprovar revisão** — só habilita com pelo menos um claim na
   lista; libera o botão Publicar.

**O que invalida a atestação:** mudar o conteúdo depois de atestado —
título, subtítulo, disciplina, tema, autor, tempo de leitura, palavras-chave,
qualquer coisa nas seções (inclusive Pontos-Chave, Pérola e Alerta) ou nas
referências (inclusive vincular uma referência a uma fonte curada). Aí é
preciso criar uma revisão nova e atestar de novo — por isso, faça esses
ajustes antes de atestar.

**O que não invalida:** mudar a posição na árvore dentro da mesma disciplina,
o rótulo curto ou a ordem, e abrir o material e salvar sem mudar nada.
Posicionar antes ou depois de atestar tanto faz. A exceção é escolher um pai
de outra disciplina: isso muda a disciplina e o tema do material, e aí a
atestação cai.

**Referência vinculada a fonte curada** (feito no painel de referências): o
vínculo sobrevive a qualquer salvamento enquanto o texto da referência não
mudar. Se o texto de uma referência vinculada for editado ou removido, o
formulário avisa antes de salvar; refaça o vínculo depois.

## 2.4 Publicar

Botão **Publicar** na linha do material. Um material só publica depois de
tudo acima dele na árvore estar publicado. O cartão de cada material mostra
**"Na árvore:"** (onde ele está) e, quando algo bloqueia, **"Publique antes,
nesta ordem:"** com a sequência certa. O botão **Publicar rascunhos**
publica vários de uma vez e resolve a ordem sozinho.

## 2.5 O que acontece depois

O estudante encontra o material na biblioteca, pela árvore ou pela busca,
lê, aprofunda pelos filhos e resolve questões. Ao errar uma questão, ela cai
no caderno de erros e vira flashcard automaticamente; a plataforma agenda as
revisões.

## 2.6 Questões

As questões têm padrão próprio de produção (Padrão NexusMed de Questões) e
entram pelo botão **Importar questões**. O que importa aqui é o vínculo:
**cada questão deve ser ligada ao material — ou aos materiais — que ela
cobra.** Hoje é ele que leva o estudante da questão errada de volta à seção
de origem. Em breve, é ele que vai montar o "Testar o que li" e as questões
que cruzam materiais (uma questão que compara ceftriaxona com ceftazidima
cobra os dois). É também ele que conecta um material aos outros — não há
ligação a cadastrar entre materiais.

Na prática, hoje:
- Produza as questões **por material**, num arquivo de questões para cada
  material; isso deixa o vínculo óbvio.
- Depois de importar, ligue cada questão ao material pelo botão **Vínculo**
  na lista de questões. A plataforma aceita hoje **um** material por
  questão; em breve aceitará vários e permitirá escolher os materiais do
  lote inteiro já na importação.

## 2.7 Versões do padrão e materiais antigos

Este padrão tem número de versão. Quando mudar, o novo documento diz aqui o
que mudou e se os materiais antigos precisam ser refeitos.

Nem toda mudança exige refazer material:
- **Aparência** (como uma fórmula ou tabela aparece na tela) é resolvida
  pela plataforma e vale para todos os materiais, antigos e novos.
- **Formato do arquivo** só afeta o que ainda vai ser importado.
- **Editorial** (profundidade, o que cabe em cada nível, dividir um material)
  é a única que pede reescrita.

**v2 — 23/09/2026.** O que muda em relação aos materiais anteriores:
- o material tem um lugar na árvore e segue as regras do seu nível (1.3):
  não repete o material de cima nem invade o de baixo;
- um material por objetivo, entre 8 e 25 minutos — material que cobre uma
  classe inteira com todas as subclasses precisa ser dividido;
- a Disciplina é a casa do material (fármaco em Farmacologia);
- o texto não remete a outros materiais, e o título não tem numeração;
- palavras-chave com sinônimos, siglas e nomes comerciais;
- a linha `**Versão do padrão:** 2`.

**Como atualizar um material antigo hoje:** peça à IA que reescreva o
material para a v2, entregando junto este documento e o texto atual do
material. Para dividir um material grande, peça um arquivo para cada parte,
seguindo a árvore; importe as partes novas como filhos e coloque a parte que
fica no material original (Editar, substituindo o texto das seções). A
atestação do original cai e ele precisa ser revisado de novo. A plataforma vai
ganhar botões para exportar um material como arquivo e para atualizá-lo a
partir de um arquivo, preservando posição e questões.
