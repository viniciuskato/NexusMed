# Como produzir material para o NexusMed

**Versão 3 do padrão — 03/10/2026**

O NexusMed é um caderno digital de estudo para medicina. A pessoa escolhe um
assunto, lê o material, aprofunda até onde achar necessário, testa o que leu
com questões, e o que errar vira flashcard revisado pela própria plataforma
nos dias certos. O material é a base de tudo isso — e, como num bom caderno de
estudo, pode ter figuras, tabelas, casos clínicos e uma revisão rápida no fim.

Este documento é completo em si mesmo: tudo o que é preciso para produzir um
material está aqui, sem depender de nenhum outro arquivo. Ele tem duas partes:

- **Parte 1 — Para quem escreve o material.** Pode ser uma pessoa ou uma
  inteligência artificial. Cobre o que escrever, em que estrutura, com que
  profundidade, como citar, como marcar as figuras e o formato exato do
  arquivo.
- **Parte 2 — Para quem opera a plataforma.** Enviar as imagens, importar o
  arquivo, posicionar o material, revisar, atestar e publicar.

**Se você é uma IA recebendo este documento:** sua tarefa é a Parte 1 —
entregar **um arquivo `.md` por material**, no formato da seção 1.7. A Parte 2
é feita por uma pessoa dentro da plataforma; leia só para entender o contexto
e **não** produza nada dela. Você não gera imagens: onde uma figura ajuda,
marque o lugar dela como a seção 1.7 manda, e a pessoa coloca a imagem. Se
receber junto o texto de um material antigo, sua tarefa é reescrevê-lo neste
padrão, aproveitando o conteúdo e as referências que ainda valem.

---

# Parte 1 — Para quem escreve o material

## 1.1 O que é um material

Um material cobre **um assunto com objetivo de aprendizagem próprio** — algo
que o estudante consegue estudar de uma vez e sair sabendo. Tamanho de
referência: **8 a 25 minutos de leitura**. Abaixo de uns 8 minutos, o assunto
cabe como seção ou linha de tabela no material de cima. Acima de uns 25
minutos com mais de um objetivo, o material deve ser dividido. Um material de
doença com o esqueleto completo da seção 1.3 costuma ficar perto do teto: o
que não cabe vira material abaixo, não parágrafo a mais.

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
7. **Figuras** que a pessoa já sabe que quer (um fluxograma, uma curva, um
   exame de imagem), se houver. Sem indicação, decida onde uma figura ajuda
   de verdade (seção 1.7) — nunca por enfeite.

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
têm material próprio são nomeados, não reexplicados. A ordem das seções segue
o esqueleto abaixo.

### 1.3.1 Esqueleto de uma condição clínica

Toda seção abaixo é um `###` do arquivo, com a Tag de Mecanismo sugerida. A
ordem é fixa; o conteúdo se adapta.

```text
Introdução                       Tag: Visão geral
Epidemiologia                    Tag: Epidemiologia
Fisiopatologia                   Tag: Fisiopatologia
Fatores de risco                 Tag: Fatores de risco
Quadro clínico                   Tag: Quadro clínico
Diagnóstico e exames             Tag: Diagnóstico
Avaliação e classificação        Tag: Classificação
Tratamento não farmacológico     Tag: Conduta
Tratamento cirúrgico             Tag: Conduta
Tratamento farmacológico         Tag: Conduta
Como escolher o tratamento       Tag: Conduta
Complicações e exacerbação       Tag: Complicações
Casos clínicos guiados           Tag: Casos
Revisão rápida                   Tag: Revisão
Autoavaliação                    Tag: Revisão
Considerações finais             Tag: Fechamento
```

O que cada seção responde:

- **Introdução** — o que é a condição e por que importa; os **objetivos de
  aprendizagem** ("Ao final deste material você deve ser capaz de...", de três a
  cinco itens, cada um verificável); e o **aviso do que é essencial e do que é
  aprofundamento** (seção 1.4). Pode abrir com uma **pergunta motivadora**: um
  caso curto, sem resposta, que o material vai responder ao longo do texto.
- **Epidemiologia** — frequência, quem adoece, peso para o sistema de saúde,
  com o dado brasileiro quando existir.
- **Fisiopatologia** — o porquê: causa → processo → achado. É a seção que a
  saturação da seção 1.4 mais cobra.
- **Fatores de risco** — o que aumenta a chance, com a força da associação
  quando a fonte a traz.
- **Quadro clínico** — sintomas e sinais, o que é típico e o que é atípico, e o
  que diferencia de condições parecidas.
- **Diagnóstico e exames** — o critério diagnóstico, o exame que o define e os
  que o complementam; para cada exame, o que ele responde. Condições
  precursoras ou formas de apresentação especiais entram aqui.
- **Avaliação e classificação** — como medir a gravidade e o risco (escores,
  estágios, grupos), e **para que a classificação serve**: o que ela muda na
  conduta.
- **Tratamento não farmacológico, cirúrgico e farmacológico** — um por seção,
  cada um com o objetivo, a indicação, a conduta e os cuidados. Fármaco que tem
  material próprio é nomeado, não reexplicado. Omita a seção que não existe
  para a condição (sem cirurgia, sem seção de cirurgia).
- **Como escolher o tratamento** — o raciocínio de decisão, em duas etapas
  quando couber: o **tratamento inicial** (por onde começar, segundo a
  classificação) e o **de manutenção** (o que fazer quando o inicial não basta;
  quando ajustar; quando trocar). É aqui que entra o **fluxograma de decisão**,
  como figura (seção 1.7), acompanhado do mesmo caminho descrito em palavras.
- **Complicações e exacerbação** — o que pode dar errado, como reconhecer e a
  conduta aguda.
- **Casos clínicos guiados, Revisão rápida e Autoavaliação** — o fecho de todo
  material (seção 1.3.3).
- **Considerações finais** — três a cinco frases: o fio que liga as seções e o
  que o estudante precisa levar.

### 1.3.2 Material que não é doença

O esqueleto acima é de condição clínica. Os outros assuntos têm esqueleto
próprio, na mesma lógica (do porquê para o como, da definição para a conduta):

- **Exame ou procedimento:** introdução; indicações e contraindicações;
  preparo e execução; parâmetros e interpretação; classificação dos achados;
  limitações e erros comuns.
- **Conceito de ciência básica ou de fisiologia:** introdução; definições;
  mecanismo; integração com outros sistemas; relevância clínica.
- **Fármaco, classe ou subclasse:** os pontos de cada nível acima, mais a
  conduta de escolha entre os irmãos.
- **Escore, fórmula ou classificação:** o que mede; como se calcula;
  interpretação por faixa; limitações.

Omita o que não se aplica, funda seções curtas e **não escreva "não se aplica"**.
O que não pode faltar em nenhum esqueleto: o porquê antes do como, a
distinção entre o essencial e o aprofundamento, a Revisão rápida e a
Autoavaliação.

### 1.3.3 O fecho de todo material

**Casos clínicos guiados** (obrigatório em condição clínica; opcional nos
outros assuntos). Seção `### Casos clínicos guiados`, com um `####` por caso
("Caso 1 — título curto"). Os casos são **hipotéticos e sem dado real de
pessoa**: idade, sexo e achados são inventados para o exercício, e isso fica
dito na primeira linha da seção. Cada caso, um parágrafo por item, com o rótulo
em negrito:

- **Apresentação:** o quadro, com os achados que importam;
- **Pergunta de raciocínio:** o que o estudante deve decidir primeiro;
- **Pistas:** quais achados apontam o caminho;
- **Hipótese principal:** a resposta, com a citação do critério que a sustenta;
- **Diferenciais:** o que mais caberia e por que cai;
- **Conduta:** o princípio de conduta, com citação e grau de evidência.

**Revisão rápida** (obrigatória). Seção `### Revisão rápida`, que só junta o que
as seções anteriores já explicaram — nada de assunto novo. Tem, nesta ordem, os
subtítulos `####`:

- **Fluxograma de abordagem** — a figura de decisão do material (seção 1.7),
  quando a condição tem um caminho de decisão; sem decisão, omita;
- **Tabela-mestra** — uma tabela que reúne as entidades do material lado a lado
  (por exemplo, cada tipo, o achado que o define e a conduta);
- **Pares para não confundir** — uma tabela de duas colunas: o par de conceitos
  parecidos e o critério que os separa;
- **Mensagens essenciais** — o bloco `**Pontos-Chave:**` da seção, de 8 a 20
  frases curtas, cada uma legível sozinha.

**Autoavaliação** (obrigatória). Seção `### Autoavaliação`, com dois subtítulos
`####`: **Perguntas**, uma lista numerada de 8 a 15 perguntas de recordação e
raciocínio, de resposta curta e sem alternativas; e **Respostas comentadas**,
uma lista numerada, na mesma ordem, em que cada resposta tem uma ou duas frases
e a citação de onde sai. Questões de múltipla escolha têm padrão próprio e não
entram aqui.

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

### Tom

Escreva como quem explica a um colega que quer entender, não como um tratado:
direto, em frases curtas, falando com a pessoa ("note que...", "repare que...",
"antes de decidir, pergunte-se..."). Faça a pergunta que o estudante faria e
responda. Sem gíria, sem diminutivo e sem tom professoral. O rigor da fonte não
muda: o tom é de conversa, o conteúdo é de diretriz.

### O essencial e o aprofundamento

Todo material separa o que o estudante **precisa dominar** do que é **para ir
além**, e diz isso na Introdução: um parágrafo curto com o que é essencial (o
que a Revisão rápida vai cobrar) e o que é aprofundamento (marcado no texto com
o bloco **Aprofundar**). **Só afirme que algo "cai em prova" se a pessoa que
encomendou ou a fonte disse isso**; sem essa base, diga "é essencial" ou "é
aprofundamento", nunca "cai" nem "não cai". Quando a prova e o plantão
divergem, use o **Consenso de Prova** (abaixo).

### Aplicando o conceito

Sempre que o material ensina a **interpretar números** (um exame, um escore, uma
dose ajustada, uma classificação), feche a seção com um subtítulo `#### Aplicando
o conceito`: um exemplo resolvido, com valores concretos, passo a passo — o
dado, a regra aplicada, a conclusão. O paciente e os valores do exemplo são
**hipotéticos** e a primeira linha do exemplo o diz ("Exemplo hipotético:");
**todo corte, fórmula e conduta usados nele vêm de fonte citada**. O exemplo
nunca cria um número novo de dose ou de corte.

### Blocos com função

Além do texto corrido, o material usa blocos que dizem **para que serve** o
trecho. Cada bloco é um parágrafo numa citação `> `, com o rótulo em negrito
exatamente como na tabela, uma linha em branco antes e depois, e **no máximo
dois ou três por seção** — bloco demais deixa de destacar.

| Rótulo | Para que serve |
|---|---|
| `**Essencial:**` | o que o estudante precisa dominar naquele ponto |
| `**Raciocínio:**` | a ligação explícita entre um achado e a hipótese ou a conduta |
| `**Cuidado:**` | uma simplificação didática, uma controvérsia ou uma ambiguidade que merece atenção |
| `**Não confundir:**` | um par de conceitos parecidos que costumam ser trocados, e o que os separa |
| `**Atualização:**` | o que mudou na diretriz ou na prática, **e desde quando** (o ano, ou a versão, no texto do bloco) |
| `**Aprofundar:**` | um detalhe opcional, para quem quer ir além do essencial |
| `**Diretriz:**` | recomendação oficial, com o grau de evidência |
| `**Mecanismo:**` | um mecanismo que merece ficar isolado do texto corrido |
| `**Consenso de Prova:**` | quando o que as provas cobram difere da prática de plantão |

O **Atualização** nunca amplia o que é essencial: ele informa a mudança. Sem
data ou versão, não é atualização.

### Controvérsia e limite do modelo

Quando a literatura diverge de verdade, apresente as posições — nunca escolha
uma como se fosse consenso. Quando um modelo explicativo tem limite conhecido,
registre o limite; o lugar natural é o **Alerta de Armadilha** da seção ou um
bloco **Cuidado**.

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
seção — se houver dois, a plataforma guarda só um e o outro se perde. Os
blocos com função da tabela acima não têm esse limite de um por seção (só o
de dois ou três, de bom senso).

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
- **Numere as tabelas** na ordem em que aparecem, começando a frase de
  abertura por `**Tabela N.**` (em negrito) e o título da tabela, por exemplo:
  `**Tabela 2.** Classificação da obstrução pelo VEF1 após o broncodilatador
  [3](#ref-3).` O mesmo vale para as figuras (seção 1.7), numeradas à parte
  (`**Figura N.**`).
- **Toda figura leva legenda e fonte** (seção 1.7). A fonte de uma figura é a
  referência de onde ela vem — uma citação `[N](#ref-N)` ou "autor, título,
  ano" —; figura que você descreve e a pessoa vai desenhar ou buscar traz a
  **fonte sugerida**, e quem coloca a imagem confirma a fonte real.
- **Toda referência da lista precisa ser citada pelo menos uma vez** no
  texto (a citação na linha "Fonte:" de uma figura conta).
- Se o texto veio de uma ferramenta que numera fontes pela ordem interna
  dela, renumere cada citação para a posição certa na lista final antes de
  entregar.

### Referências em camadas

A lista de referências é uma só, numerada, mas **ordenada em três camadas**, e
cada referência diz a sua no colchete final:

- **Ponto de entrada** — a fonte que o estudante abre primeiro: a diretriz, o
  consenso ou a revisão que cobre o tema inteiro;
- **Aprofundamento** — artigos, revisões e textos para quem quer ir além de um
  ponto específico;
- **Consulta especializada** — o documento técnico de um tema estreito: uma
  bula, um protocolo, uma classificação, um escore.

Cada referência termina com **`[Camada — tipo de evidência]`**, por exemplo
`[Ponto de entrada — Diretriz de prática clínica]`. Liste primeiro as de ponto
de entrada, depois as de aprofundamento, depois as de consulta especializada. A
numeração das citações no texto é a posição na lista final.

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
**Versão do padrão:** 3

### Introdução
**Tag de Mecanismo:** Visão geral

Texto da seção em Markdown, com citação [1](#ref-1) em toda afirmação de peso clínico. Cada parágrafo fica numa linha só.

Ao final deste material você deve ser capaz de reconhecer o quadro, escolher o exame e justificar a conduta [1](#ref-1).

> **Essencial:** o que o estudante precisa dominar neste ponto.

#### Um subtítulo dentro da seção

Mais texto. Frase que abre a tabela abaixo, com o número e a citação.

**Tabela 1.** Título da tabela, em uma frase [2](#ref-2).

| Coluna A | Coluna B |
|---|---|
| valor | valor |

Texto que apresenta a figura abaixo [2](#ref-2).

![Descrição da imagem, para quem não a vê](figura:PENDENTE)
**Figura 1.** Legenda da figura, em uma frase.
Fonte: fonte sugerida, com autor ou entidade, título e ano.
Mostrar: o que a figura deve conter — elementos, eixos e rótulos.

> **Cuidado:** uma simplificação, controvérsia ou ambiguidade que merece atenção.

> **Atualização:** o que mudou e desde quando, por exemplo a partir de 2023 [1](#ref-1).

**Pontos-Chave:**
- Primeira frase-síntese, que faz sentido lida sozinha.
- Segunda frase-síntese.

> 💡 **Pérola Clínica:** o achado que não é óbvio lendo o texto.

> ⚠️ **Alerta de Armadilha:** o erro de raciocínio comum nesta seção.

### Revisão rápida
**Tag de Mecanismo:** Revisão

#### Pares para não confundir

Frase que abre a tabela de pares [2](#ref-2).

**Tabela 2.** Pares que costumam ser trocados [2](#ref-2).

| Par | O que separa |
|---|---|
| A × B | o critério que distingue |

**Pontos-Chave:**
- Mensagem essencial, legível sozinha.

### Autoavaliação
**Tag de Mecanismo:** Revisão

#### Perguntas

1. Pergunta de recordação ou de raciocínio, de resposta curta?

#### Respostas comentadas

1. Resposta em uma ou duas frases [1](#ref-1).

### Palavras-chave
`palavra-chave 1` `sigla` `sinônimo` `nome comercial`

### Referências Bibliográficas
1. Referência completa da primeira fonte. [Ponto de entrada — Diretriz de prática clínica]
2. Referência completa da segunda fonte. [Aprofundamento — Revisão sistemática]
````

**Regras do formato — a importação segue estas regras à risca:**

1. **A primeira linha é `# Título`**, com um único `#`.
2. **Os metadados vêm logo abaixo do título**, um por linha, no formato
   `**Rótulo:** valor`, com os rótulos exatamente como no modelo. O tempo de
   leitura é um número seguido de "minutos". Autor é opcional: sem autor,
   omita a linha inteira. **Versão do padrão** é sempre `3` — a versão deste
   documento; ela diz, no futuro, contra qual padrão o material foi escrito.
   O título não leva numeração ("Antimicrobianos I", "Módulo 2"): a ordem
   entre materiais é dada pela plataforma.
3. **Não escreva nada entre os metadados e a primeira seção.** Todo texto
   ali é descartado.
4. **Cada `###` inicia uma seção nova.** Por isso, **dentro de uma seção,
   subtítulo é sempre `####`** — nunca `###`, `##` ou `#`. Um `###` no meio
   do texto parte a seção em duas.
5. **Tag de Mecanismo** é o rótulo curto exibido acima da seção no leitor
   (uma a três palavras). Exemplos: `Visão geral`, `Epidemiologia`,
   `Mecanismo de ação`, `Farmacocinética`, `Espectro de ação`, `Resistência`,
   `Indicações`, `Segurança`, `Fisiopatologia`, `Fatores de risco`,
   `Quadro clínico`, `Diagnóstico`, `Classificação`, `Conduta`,
   `Complicações`, `Casos`, `Revisão`, `Fechamento`, `Prognóstico`,
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
   uma referência por item numerado (`1.`, `2.`...), ordenadas por camada
   (seção 1.5). Cada referência termina com a camada e o tipo de evidência
   entre colchetes, `[Camada — tipo de evidência]`. A numeração é a que as
   citações `[N](#ref-N)` usam.
10. **Não inclua** blocos de "pré-requisitos", "conexões", "veja também",
    "estude antes" ou posição na árvore: nada disso é lido da importação.
11. **Blocos com função** (seção 1.4): cada um é um parágrafo numa citação
    `> `, com o rótulo em negrito escrito exatamente como na tabela da seção
    1.4 (`**Essencial:**`, `**Raciocínio:**`, `**Cuidado:**`, `**Não confundir:**`,
    `**Atualização:**`, `**Aprofundar:**`). O bloco **Atualização** traz o ano ou
    a versão da mudança no próprio texto.
12. **Tabelas:** a frase de abertura citada, seguida da linha `**Tabela N.**`
    com o título, ou as duas na mesma frase, sempre logo acima da tabela e
    terminando na citação (seção 1.5).
13. **Figuras** — veja abaixo. A figura é o **único** lugar onde uma imagem
    pode aparecer.

**Figuras: como marcar onde entra cada uma.** Você não gera nem busca
imagem. Onde uma figura ajuda de verdade — um fluxograma de decisão, uma curva,
um esquema de mecanismo, um exame de imagem típico, uma tabela que fica
melhor desenhada —, escreva um **bloco de figura pendente**, de quatro linhas
seguidas, sem linha em branco entre elas, com linha em branco antes e depois do
bloco:

1. `![texto alternativo](figura:PENDENTE)` — o texto alternativo descreve a
   imagem em uma frase, para quem não a vê;
2. `**Figura N.** legenda` — a legenda diz o que a figura mostra e por que ela
   está ali; N numera as figuras do material na ordem em que aparecem;
3. `Fonte: ...` — a **fonte sugerida** da figura: a referência da lista de onde
   ela vem (`Fonte: [3](#ref-3)`), ou autor, título e ano. Nunca invente: sem
   fonte, escreva `Fonte: LACUNA_DOCUMENTAL`;
4. `Mostrar: ...` — o que a figura deve conter: os elementos, os eixos, os
   rótulos, os valores que precisam aparecer.

O texto da seção também apresenta a figura e diz o que observar nela; o que a
figura mostra precisa estar dito em palavras, para o material valer sem a
imagem (para um fluxograma, descreva o caminho de decisão em frases ou numa
lista numerada). Use `PENDENTE` exatamente assim, em maiúsculas: depois, a
pessoa que opera a plataforma envia a imagem, e o bloco passa a trazer, no
lugar de `PENDENTE`, um identificador gerado pelo site e sem a linha `Mostrar:`.
**Você nunca escreve esse identificador, nem endereço de imagem de outro site,
nem caminho de arquivo, nem `data:`: só `figura:PENDENTE`.** Imagem escrita de
outra forma, ou no meio de um parágrafo, não é mostrada.

**O que o leitor da plataforma exibe — e o que não exibe:**

- Exibe: parágrafos, `**negrito**`, `*itálico*`, subtítulos `####`, listas
  com `- `, listas numeradas, tabelas, citações `[N](#ref-N)`, links
  `https://...`, caixas de destaque com `> `, blocos com função, figuras com
  legenda e fonte e fórmulas (regra abaixo).
- **Escreva cada parágrafo numa linha só**, sem quebrar linha no meio.
- **Deixe uma linha em branco antes e depois** de todo subtítulo, lista,
  tabela, figura e caixa `> `. Depois de uma lista isso é obrigatório: um
  parágrafo colado no último item vira parte dele.
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
- **Não use HTML.** Imagem só no bloco de figura (acima).

## 1.8 O que não fazer

- Não invente Disciplina, Tema, referência, dose, corte numérico ou grau de
  evidência. Sem fonte, use `LACUNA_DOCUMENTAL`.
- Não invente imagem, identificador de figura nem fonte de figura.
- Não reconte o que o material de cima já explica.
- Não cubra no mesmo material um assunto que tem material próprio abaixo —
  nomeie e deixe o aprofundamento para ele.
- Não escreva introdução solta antes da primeira seção.
- Não use formatação fora da lista da seção 1.7.
- Não afirme que algo "cai em prova" sem que a pessoa ou a fonte o diga.
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

Estrutura e tom:
- [ ] As seções seguem o esqueleto da seção 1.3 (ou o do assunto), adaptado,
  sem "não se aplica"?
- [ ] A Introdução traz os objetivos e separa o essencial do aprofundamento,
  sem dizer que algo "cai em prova" sem base?
- [ ] Há "Aplicando o conceito" onde o material ensina a interpretar números,
  com exemplo hipotético e fontes para cada corte?
- [ ] Casos clínicos guiados (condição clínica) hipotéticos, sem dado de pessoa
  real, com hipótese, diferenciais e conduta citada?
- [ ] Revisão rápida com tabela-mestra, pares para não confundir e mensagens
  essenciais (e fluxograma, quando há decisão)? Autoavaliação com perguntas e
  respostas comentadas?
- [ ] Blocos com função com o rótulo exato, no máximo dois ou três por seção, e
  toda Atualização com ano ou versão?
- [ ] Tom direto, falando com a pessoa, sem gíria?

Citações, figuras e formato, no arquivo inteiro:
- [ ] Toda citação no formato `[N](#ref-N)`, com N certo? Nenhum `[N]` solto?
- [ ] Toda referência citada pelo menos uma vez? Toda tabela numerada, com
  frase de abertura citada?
- [ ] Referências ordenadas em ponto de entrada, aprofundamento e consulta
  especializada, cada uma com `[Camada — tipo de evidência]`?
- [ ] Toda figura com `figura:PENDENTE`, texto alternativo, legenda numerada,
  `Fonte:` e `Mostrar:`, em bloco próprio? O que a figura mostra está dito em
  palavras no texto?
- [ ] Dentro das seções, só `####` como subtítulo? Nenhum texto antes da
  primeira seção?
- [ ] `### Palavras-chave` com sinônimos, siglas e nomes comerciais?
- [ ] Linha `**Versão do padrão:** 3` nos metadados?
- [ ] Nada de LaTeX, `<=`, `>=`, HTML, imagem fora do bloco de figura ou lista
  dentro de lista?
- [ ] Cada parágrafo numa linha só? Linha em branco antes e depois de
  subtítulos, listas, tabelas, figuras e caixas `> `?
- [ ] No máximo um bloco de Pontos-Chave, uma Pérola e um Alerta por seção?

---

# Parte 2 — Para quem opera a plataforma

Esta parte é feita por uma pessoa, na Área Editorial da plataforma.

## 2.1 Fluxo completo

1. **Enviar as imagens** das figuras, se o material tiver (seção 2.2).
2. **Importar** o arquivo, já escolhendo onde o material fica na árvore.
3. **Revisar e atestar** — obrigatório; sem isso a plataforma não publica.
4. **Publicar**, de cima para baixo na árvore.
5. **Produzir as questões** do material e ligá-las a ele.

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

## 2.2 Enviar as imagens e importar o material

**Imagens.** A IA não gera imagem: ela marca cada figura com um bloco
`figura:PENDENTE`, a legenda, a fonte sugerida e a linha `Mostrar:` (seção 1.7).
Para cada figura:

1. Consiga a imagem (um arquivo PNG, JPEG ou WebP de até 10 MB): uma figura da
   diretriz que você pode citar, um esquema seu, uma captura. **A fonte da
   imagem tem de estar na legenda do bloco**, e a imagem é usada com a
   responsabilidade de quem a coloca.
2. Área Editorial → **Enviar material** → **Enviar imagem**. Escolha o arquivo e
   preencha o **texto alternativo** (descreve a imagem em uma frase), a
   **legenda** e a **fonte**; o número da figura é opcional. A tela envia a
   imagem e mostra o **trecho pronto para colar**: o bloco de figura, já com o
   identificador da imagem.
3. No arquivo `.md`, **troque o bloco pendente inteiro** (as quatro linhas) pelo
   trecho. Se preferir, copie só o identificador e troque `PENDENTE` por ele —
   nesse caso apague também a linha `Mostrar:`.

Enquanto houver `figura:PENDENTE` no arquivo, a checagem do padrão aponta a
figura e o envio não passa. A imagem enviada **não pode ser trocada**: para usar
outra, envie uma nova e troque o identificador no texto. Quem vê a imagem é só
quem tem conta aprovada; ela aparece depois que o material é publicado.

**Importar.** Área Editorial → **Importar material** → escolha o arquivo `.md`.
A tela mostra, em ordem:

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
qualquer coisa nas seções (inclusive Pontos-Chave, Pérola e Alerta, os blocos
com função e as figuras: trocar, tirar ou pôr uma figura é mudar o texto) ou nas
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

Na prática:
- Produza as questões **por material**, num arquivo de questões para cada
  material; isso deixa o vínculo óbvio.
- Na importação, escolha em **"Materiais cobrados por este lote"** o
  material — ou os materiais — que as questões do arquivo cobram: busque
  pelo nome e clique para escolher. A escolha vale para todas as questões
  do arquivo.
- Depois, ajuste questão por questão pelo botão **Vínculo** na lista de
  questões: uma questão pode cobrar **um ou vários** materiais, cada um com
  uma seção opcional. O vínculo pode ser ajustado mesmo com a questão
  publicada — ele não faz parte do conteúdo atestado.
- Questão sem vínculo continua acessível ao estudante pelo tema e nos
  simulados; com vínculo, ela aparece também a partir de cada material que
  cobra.

## 2.7 Versões do padrão e materiais antigos

Este padrão tem número de versão. Quando mudar, o novo documento diz aqui o
que mudou e se os materiais antigos precisam ser refeitos.

Nem toda mudança exige refazer material:
- **Aparência** (como uma fórmula ou tabela aparece na tela) é resolvida
  pela plataforma e vale para todos os materiais, antigos e novos.
- **Formato do arquivo** só afeta o que ainda vai ser importado.
- **Editorial** (profundidade, o que cabe em cada nível, dividir um material)
  é a única que pede reescrita.

**v3 — 03/10/2026.** O NexusMed passa a ser um caderno digital de estudo, e o
material ganha a estrutura de um bom caderno. O que muda em relação à v2:
- **imagens e figuras são permitidas**, sempre com texto alternativo, legenda
  numerada e fonte. A IA não gera imagem: ela marca o lugar com
  `figura:PENDENTE` e a linha `Mostrar:`, e a pessoa envia a imagem pelo botão
  **Enviar imagem** (seção 2.2). Imagem escrita de qualquer outra forma e HTML
  cru passam a ser apontados pela checagem do padrão; a figura pendente também,
  até a imagem ser enviada;
- **esqueleto fixo para a condição clínica** (introdução, epidemiologia,
  fisiopatologia, fatores de risco, quadro clínico, diagnóstico e exames,
  avaliação e classificação, tratamento não farmacológico, cirúrgico e
  farmacológico, como escolher o tratamento, complicações e exacerbação,
  considerações finais), adaptável aos outros assuntos (seção 1.3);
- **fecho de todo material:** casos clínicos guiados, revisão rápida (fluxograma,
  tabela-mestra, pares para não confundir, mensagens essenciais) e
  autoavaliação (seção 1.3.3);
- **blocos com função:** Essencial, Raciocínio, Cuidado, Não confundir,
  Atualização (com o ano ou a versão da mudança — a checagem confere) e
  Aprofundar (seção 1.4);
- **tabelas e figuras numeradas**, com legenda e fonte; **fluxogramas de
  decisão** como figura, também descritos em palavras;
- **referências em três camadas** (ponto de entrada, aprofundamento, consulta
  especializada), no colchete final de cada referência;
- **"Aplicando o conceito"** com exemplo hipotético resolvido, **tom direto** e
  **aviso do que é essencial e do que é aprofundamento** (sem afirmar o que
  "cai em prova" sem base);
- a linha de metadado passa a ser `**Versão do padrão:** 3`.

**Materiais da v2 não precisam ser refeitos para continuar no ar:** o que foi
publicado segue como está. Para reenviar um material antigo (por exemplo, para
atualizá-lo), a linha de versão passa a `3` e, para ganhar a estrutura nova, o
conteúdo pede reescrita editorial.

**Como atualizar um material antigo hoje:** peça à IA que reescreva o
material para a v3, entregando junto este documento e o texto atual do
material. Para dividir um material grande, peça um arquivo para cada parte,
seguindo a árvore; importe as partes novas como filhos e coloque a parte que
fica no material original (Editar, substituindo o texto das seções). A
atestação do original cai e ele precisa ser revisado de novo. A plataforma vai
ganhar botões para exportar um material como arquivo e para atualizá-lo a
partir de um arquivo, preservando posição e questões.
