# Padrão NexusMed de questões — para quem escreve

Este documento é para quem escreve questões comentadas para o NexusMed, uma plataforma de estudo para estudantes de medicina: uma pessoa ou uma IA. Ele diz o que uma questão precisa ter, como citar as fontes e qual é o formato exato do arquivo que você entrega. Tudo o que você precisa saber para escrever está aqui; nada depende de outro documento.

Você entrega um único arquivo `.md` com várias questões (um lote). Antes de a questão ir ao ar, um revisor confere o gabarito, as fontes e o formato. O que você escreve será estudado como verdade: uma questão que você não consegue sustentar com fonte não deve ser escrita.

## 1. Dois tipos de questão

Toda questão é de um de dois tipos. O tipo aparece no campo **Instituição / Banca** do arquivo (seção 4).

### 1.1 Banca real

É uma questão que existiu numa prova de uma banca ou instituição.

- A banca e o ano são verdadeiros e verificáveis na internet: existe a prova ou o gabarito oficial, com endereço (URL) que qualquer pessoa consegue abrir. Nunca invente banca, ano ou número de questão.
- O gabarito é o oficial. Marque como correta a alternativa que o gabarito oficial vigente indica.
- Se a questão foi anulada ou teve o gabarito alterado, diga isso no início do **Comentário Geral**: o que mudou e o endereço do documento da banca. Se ela foi anulada e não há alternativa oficial vigente, não envie a questão.
- Cite no **Comentário Geral** o endereço da prova ou do gabarito oficial que você abriu.
- Direitos: a disponibilidade pública de uma prova na internet não é licença nem prova de que o texto é livre. Por isso, nunca apresente como "autoral" uma questão copiada de prova, e preencha banca e ano com a fonte real. Use o enunciado como a prova o traz, sem trocar palavras para disfarçar a origem. Reproduzir o enunciado e as alternativas de uma questão de banca real, com banca, ano e endereço da fonte verdadeiros, é o que esta regra pede e não é transcrição indevida; o que não vale é apresentá-la como autoral ou esconder a origem. Se a questão depende de imagem, gráfico ou tabela que não cabe por extenso no texto do enunciado, não a envie: o arquivo só aceita texto.
- O NexusMed hoje é usado só para estudo. Uso comercial de questão de prova real exigirá comprovação de direitos, e por isso a origem precisa estar registrada com honestidade.

### 1.2 Autoral

É uma questão escrita por você para o NexusMed.

- No campo **Instituição / Banca**, escreva exatamente: `NexusMed (questão autoral)`.
- Nunca atribua a questão a uma banca e nunca escreva o campo **Ano**: deixe-o de fora.
- O caso clínico é original. Não copie nem adapte de perto o enunciado de nenhuma prova.
- Na dúvida entre os dois tipos, é autoral: se você não tem certeza de que a questão veio de uma prova real, escreva o caso com as suas palavras e marque como autoral. Nunca marque como banca real por suposição.

## 2. Regras de toda questão

1. **Uma única alternativa correta**, marcada com `[GABARITO]` no fim do texto dela. Nem zero, nem duas.
2. **Comentário de cada alternativa**: para cada alternativa, um campo **Explicação** que diz por que ela está certa ou por que está errada. Nenhuma alternativa fica sem explicação.
3. **Comentário Geral** e **Pérola High-Yield** sempre preenchidos: o primeiro resume o raciocínio da questão; a segunda é uma frase de fixação rápida.
4. **Fonte on-line para o gabarito.** A afirmação que sustenta a alternativa correta tem fonte on-line identificável, citada no comentário. Cite só o que você abriu e consegue identificar por completo: autores ou entidade responsável, título, ano ou versão, e DOI ou endereço (URL). Vale o que qualquer pessoa consegue abrir na internet: bula do profissional de saúde no Bulário Eletrônico da ANVISA, BrCAST, OMS, Ministério da Saúde, diretrizes públicas de sociedades e agências, revisões de acesso aberto.
5. **Nada de livro-texto**, capítulo de livro, apostila sem autoria nem Wikipédia como fonte.
6. **Alto risco** (dose, corte numérico, ajuste renal ou hepático, gestação, lactação, recém-nascido, idoso, contraindicação, interação): só com fonte primária pública identificável (bula do profissional, BrCAST, diretriz oficial ou de sociedade médica), citada na mesma frase do comentário. Sem ela, não use o número nem a restrição na questão.
7. **Nunca invente** fonte, autor, ano, versão de diretriz, endereço, dose, corte ou grau de evidência. Sem fonte que sustente o gabarito, não escreva a questão e diga por quê.
8. **Toda fonte com endereço**: cite o nome da fonte e sempre o endereço (URL) ou o DOI dela, por extenso ou como link no formato `[nome da fonte](https://endereço)`. Fonte sem endereço nem DOI não vale. Não use citação numerada do tipo `[1](#ref-1)`: a questão não tem lista de referências.
9. **Ligação com o material**: indique no campo **Materiais cobertos** o título exato de cada material do NexusMed que a questão cobre, separados por ponto e vírgula. Quando a questão cobra um trecho específico do material, escreva depois do título o sinal `>` e o título exato da seção que traz esse trecho: `Título do material > Título da seção`. Cada material leva no máximo uma seção por questão. Copie os títulos exatamente como a pessoa que pediu a questão informou, e nunca invente uma seção: se ela não informou a seção, escreva só o título do material (a questão fica ligada ao material inteiro). Se ela não informou nenhum material, deixe o campo de fora: a pessoa escolhe o material na tela de envio. O ponto e vírgula separa os itens e o sinal `>` separa o material da seção, então um título que tem ponto e vírgula ou o sinal `>` não pode ser escrito neste campo: nesse caso, deixe o campo de fora e a pessoa escolhe o material na tela de envio. Seção que não existe no material, ou que se repete nele, faz o lote ser recusado.
10. **Texto puro com marcas simples**: português do Brasil, sem LaTeX, HTML ou imagem. `**negrito**`, `*itálico*` e links funcionam; título, tabela e lista dentro de um campo aparecem com os símbolos à mostra, então não use. Escreva β, ≥, ≤, ×, Cmáx em texto. Nunca escreva três crases seguidas dentro de uma questão.
11. **Disciplina e Tema** com os nomes exatos do catálogo do NexusMed, como a pessoa informou. Nunca crie um Tema novo.
12. **Tags**: de duas a cinco palavras-chave entre crases, no bloco `### Tags`.

## 3. Dificuldade

O campo **Dificuldade** é opcional. Quando usado, escreva `facil`, `medio` ou `dificil`, sem acento. Não escreva o campo Ciclo: o valor padrão vale para todas as questões.

## 4. Formato do arquivo

O arquivo começa direto na primeira questão. Cada questão começa com um título de nível 2 (`## Questão 1`, `## Questão 2`, ...). Não use nenhum outro título de nível 2 no arquivo, e não escreva nada antes da primeira questão. Dentro de cada questão, os campos seguem a forma `**Rótulo:** valor`; o valor pode ficar na mesma linha ou nas linhas seguintes.

Questão de banca real:

````markdown
## Questão 1

**Disciplina:** Nome exato da Disciplina
**Tema:** Nome exato do Tema
**Instituição / Banca:** Nome real da banca ou instituição
**Ano:** 2024
**Dificuldade:** medio
**Materiais cobertos:** Título exato de um material > Título exato da seção; Título exato de outro material

**Enunciado Clínico (Caso / Vinheta):**
Caso clínico como a prova o traz (deixe em branco se a prova não traz caso).

**Comando da Questão (Pergunta):**
Pergunta como a prova a traz.

**A)** Texto da alternativa A
**Explicação A:** Por que está certa ou errada, com a fonte.
**B)** Texto da alternativa B [GABARITO]
**Explicação B:** Por que está certa, com a fonte.
**C)** Texto da alternativa C
**Explicação C:** Por que está certa ou errada, com a fonte.
**D)** Texto da alternativa D
**Explicação D:** Por que está certa ou errada, com a fonte.

**Comentário Geral:** Resumo do raciocínio. Prova ou gabarito oficial: [Banca, prova e ano](https://endereço-do-gabarito). Fonte que sustenta o gabarito: [Entidade, título, ano ou versão](https://endereço).
**Pérola High-Yield:** Uma frase de fixação rápida.

### Tags
`tag1` `tag2`
````

Questão autoral (mudam só os campos de origem):

````markdown
## Questão 2

**Disciplina:** Nome exato da Disciplina
**Tema:** Nome exato do Tema
**Instituição / Banca:** NexusMed (questão autoral)
**Materiais cobertos:** Título exato de um material > Título exato da seção

**Enunciado Clínico (Caso / Vinheta):**
Caso clínico original, escrito por você.

**Comando da Questão (Pergunta):**
Pergunta.

**A)** Texto da alternativa A [GABARITO]
**Explicação A:** Por que está certa, com a fonte.
**B)** Texto da alternativa B
**Explicação B:** Por que está errada, com a fonte.
**C)** Texto da alternativa C
**Explicação C:** Por que está errada, com a fonte.
**D)** Texto da alternativa D
**Explicação D:** Por que está errada, com a fonte.

**Comentário Geral:** Resumo do raciocínio, com a fonte que sustenta o gabarito: [Entidade, título, ano ou versão](https://endereço).
**Pérola High-Yield:** Uma frase de fixação rápida.

### Tags
`tag1` `tag2`
````

Regras do formato:

- Alternativas: no mínimo duas, com texto. Uma prova de origem pode ter mais de quatro; use as letras na ordem em que a prova as traz. Numa questão autoral, use quatro ou cinco alternativas (A a D ou A a E).
- Cada alternativa é uma linha `**X)** texto`, e a explicação dela vem logo abaixo, em `**Explicação X:** texto`, com a mesma letra.
- O marcador `[GABARITO]` fica colado no fim do texto de uma única alternativa.
- O campo **Enunciado Clínico (Caso / Vinheta)** pode ficar em branco só quando a questão realmente não traz caso.
- O campo **Ano** só existe em questão de banca real, com quatro dígitos.
- O campo **Materiais cobertos** pode ser omitido só como diz a regra 9 da seção 2. A seção depois do `>` é opcional: sem ela, a questão se liga ao material inteiro.

## 5. Checklist antes de entregar

- [ ] Cada questão é de banca real ou autoral, e o campo **Instituição / Banca** diz qual.
- [ ] Banca real: banca e ano verdadeiros, endereço da prova ou do gabarito oficial no Comentário Geral, gabarito oficial marcado, anulação ou mudança de gabarito dita.
- [ ] Autoral: `NexusMed (questão autoral)`, sem Ano, caso clínico original.
- [ ] Uma única alternativa com `[GABARITO]`.
- [ ] Toda alternativa tem Explicação, que diz por que está certa ou errada.
- [ ] Comentário Geral e Pérola High-Yield preenchidos.
- [ ] A afirmação que sustenta o gabarito tem fonte on-line identificável (autor ou entidade, título, ano ou versão, DOI ou endereço), que você abriu.
- [ ] Nenhum livro-texto, nenhuma fonte inventada; alto risco só com fonte primária pública na mesma frase.
- [ ] Nenhuma citação numerada `[N](#ref-N)`; nenhum título, tabela ou lista dentro de campo.
- [ ] Disciplina e Tema com os nomes exatos do catálogo; Materiais cobertos com os títulos exatos e, quando a questão cobra um trecho, a seção exata depois do `>` (nunca inventada), ou o campo omitido.
- [ ] Nenhum título de nível 2 além de `## Questão N`; nada antes da primeira questão; de duas a cinco Tags.
- [ ] Português do Brasil, sem LaTeX, HTML, imagem nem três crases seguidas.
