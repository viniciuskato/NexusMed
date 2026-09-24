# Ciclo de estudo — iniciativa 43

**Estado da iniciativa:** planejada (2026-09-23)
**Formato:** fichas de etapa — ver [`docs/diretoria/MODELO-DIRETORIA.md`](../diretoria/MODELO-DIRETORIA.md),
seção "Fichas de etapa". Cada ficha diz **o quê** e **por quê**, com critério
de aceite observável. O **como** (arquivos, SQL, ordem dos passos) é derivado
por quem executa, lendo o código naquele momento.

Para executar uma etapa: *"Execute a etapa 43-X de
`docs/produto/CICLO-DE-ESTUDO.md` seguindo `docs/operacao/EXECUTOR_PROTOCOL.md`."*

---

## 1. O objetivo

O NexusMed é um banco de materiais a serviço de um ciclo de estudo — a
estrutura existe para o estudo, nunca para si mesma. O ciclo, nas palavras do
dono do produto:

1. **"Quero estudar tal assunto."** Encontro o material.
2. **Leio e aprofundo até onde acho necessário.**
3. **Com base no que li nesta sessão, faço questões** para testar o que
   entendi — inclusive questões que cruzam mais de um material.
4. **O que errei vira flashcard.**
5. **Todo dia entro e faço os flashcards do dia**, com a plataforma
   controlando a periodicidade.

Tudo deve ser simples, intuitivo e eficiente. Cada passo precisa de um clique
óbvio a partir do anterior.

## 2. Onde o ciclo está hoje (verificado no código em 2026-09-23)

| Passo | Estado |
|---|---|
| 1. Encontrar | Parcial. Biblioteca e árvore funcionam. A busca (Ctrl+K) procura a frase exata, diferencia acento e letra grega, não ordena por relevância, não mostra trecho nem abre na seção. |
| 2. Ler e aprofundar | Pronto. Trilha de navegação e "Aprofunde-se" (filhos). |
| 3. Testar o que li | **Não existe.** "Resolver questões" pega o tema inteiro; só 9 de 420 questões têm vínculo com material; a questão aceita um material só. |
| 4. Erro vira flashcard | Pronto — automático ao errar. |
| 5. Cards do dia | Pronto — repetição espaçada e contagem de vencidos existem; falta uma entrada única e óbvia. |

## 3. Decisão de modelo

Registrada em [`DECISIONS.md`](../operacao/DECISIONS.md) (2026-09-23,
"Ciclo de estudo").

- **A árvore fica.** Pai → filhos é o mecanismo de "aprofundar até onde achar
  necessário", com a trilha e o "Aprofunde-se". Um pai, filhos em ordem.
- **Ligações cadastradas entre materiais ficam congeladas.** "Estude antes" e
  "Veja também" saem do formulário e da importação. O que já existe continua
  funcionando e aparecendo para o estudante; nada é apagado. Motivo: era a
  maior fonte de complexidade e de envelhecimento da rede (um material novo não
  atualiza os antigos), e não aparece em nenhum passo do ciclo.
- **A conexão que importa é questão ↔ materiais.** Cada questão diz quais
  materiais ela cobra (um ou vários). Isso produz, sem cadastro extra, o
  "testar o que li", as questões entre materiais, e — se fizer falta — um "Veja
  também" calculado (materiais que dividem questões). A rede se atualiza
  sozinha: cada questão nova liga o material novo aos antigos que ela cobra.
- **Busca no banco, como em base de artigos científicos**, não no navegador.

**Critério de ordem das etapas:** primeiro o que muda a forma de *produzir*
conteúdo (chegar tarde obriga a revisitar material pronto); depois o que só
*lê* o que já existe.

## 4. Fichas

### 43-A — Formulário do material mais curto

**Por quê.** Classificar um material hoje exige nove decisões (disciplina,
tema, tags, pai, ordem, rótulo curto, tipo, "Estude antes", "Veja também"). Três
delas não servem ao estudo, e duas têm resposta óbvia que a plataforma sabe
dar sozinha.

**Aceite — quem produz vê:**
- No formulário de edição **e** no modal "Importar material", **não aparecem**
  mais "Tipo do nó", "Estude antes" e "Veja também".
- Ao escolher um pai, **disciplina e tema passam a ser os do pai** (tema ainda
  pode ser trocado). A lista de pais permite achar material de qualquer
  disciplina. Sem pai (raiz), disciplina e tema são escolhidos como hoje.
- Ao escolher um pai sem mexer na ordem, o material vai **para o fim** dos
  irmãos. A ordem continua editável, mas não é mais uma decisão obrigatória.
- O campo de tags passa a se chamar **"Palavras-chave (sinônimos, siglas,
  nomes comerciais)"**; na importação `.md`, um bloco `### Palavras-chave` é
  aceito como equivalente de `### Tags`.
- O padrão editorial (`docs/editorial/PADRAO-NEXUSMED-CONTEUDOS.md`) descreve
  o formulário novo — quem produz não pode encontrar instrução de preencher
  campo que sumiu. Desde 2026-09-23 o padrão já manda **não preencher** os três
  campos congelados (seção 2.2) e já trata tags como palavras-chave (1.6);
  aqui basta tirar o aviso de "vão sair da tela" e descrever o pai que define
  disciplina e tema. O padrão é autocontido — sem caminho de arquivo, nome de
  função ou jargão interno.

**Restrições.**
- **Congelar não é apagar.** Um material que já tem "Estude antes", "Veja
  também" ou tipo do nó, aberto e salvo sem mudança, mantém tudo isso intacto.
  A garantia de ida e volta sem perda (`tests/unit/compendiumForm.test.ts`)
  precisa cobrir esses campos.
- Nada nesta etapa pode mudar o hash de atestação de material já aprovado.
- O estudante continua vendo as caixas "Estude antes"/"Veja também" dos
  vínculos que já existem.

**Fora de escopo.** Busca, questões, tela inicial.
**Depende de.** Nada.
**Estado.** Planejada — pode executar.

---

### 43-B — Questão cobre um ou vários materiais

**Por quê.** É a base do "testar o que li" e das questões entre materiais.
Hoje a questão aceita um material só, a importação de questões não aceita
nenhum, e só 9 de 420 questões estão ligadas. Chegar tarde significa produzir
questões sem vínculo e ter de revisitá-las depois.

**Aceite — quem produz vê:**
- Uma questão pode cobrar **um ou vários** materiais (seção opcional por
  material), escolhidos por busca e clique — nunca por título digitado.
- No modal "Importar questões", um campo **"Materiais cobrados por este
  lote"** vale para todas as questões do arquivo. Ajuste por questão, depois,
  pela edição do vínculo.
- Os 9 vínculos existentes continuam valendo.
- O padrão editorial de conteúdos (seção 2.6) deixa de dizer "um material por
  questão" e passa a descrever a escolha no lote.

**Aceite — o estudante vê:**
- "Resolver questões" a partir de um material traz as questões que cobram
  aquele material. Questões sem vínculo continuam acessíveis por tema e em
  simulados.

**Restrições e armadilhas conhecidas.**
- **O hash de atestação da questão inclui o vínculo com material** (conferir em
  `app.build_question_snapshot`). Mudar onde o vínculo mora não pode invalidar
  questão aprovada — mesma decisão tomada para materiais em 2026-09-23: o hash
  cobre o que o revisor lê, não como o item é alcançado. Decidir e registrar
  antes de migrar.
- O vínculo atual é lido em vários lugares (packs do Estudo Temático, caderno
  de erros, flashcards, leitor, Admin). Levantar todos antes de trocar.
- Tabela nova em `public` exige `revoke ... from anon`; RPC nova exige `revoke
  ... from public, anon` (AGENTS.md, riscos 13 e 14).
- Migration aplicada no remoto **antes** do merge; o frontend em produção
  precisa continuar funcionando com ela.

**Fora de escopo.** A tela "Testar o que li" (43-C). Vincular em massa as 420
questões antigas (tarefa editorial; sugestão automática pode vir depois).
**Depende de.** 43-A mesclada — as duas mexem na Área Editorial.
**Estado.** Planejada.

---

### 43-C — "Testar o que li"

**Por quê.** É o passo 3 do ciclo, o único que não existe.

**Aceite — o estudante vê:**
- Um botão **"Testar o que li"** no leitor e na tela inicial.
- Ele mostra os materiais lidos **hoje**, cada um marcado, e o estudante pode
  desmarcar algum. O número de questões disponíveis aparece antes de começar.
- Entram as questões que cobram materiais marcados. **Questão que cobra vários
  materiais só entra se todos estiverem marcados** — é assim que as questões
  entre materiais aparecem naturalmente, quando o estudante leu tudo que elas
  exigem.
- Errar gera flashcard, como já acontece hoje.
- Sem questões para os materiais lidos, a tela diz isso claramente e oferece
  "Resolver questões do tema".

**Restrições.** "Lido" usa o progresso de leitura que já existe (seções lidas,
data da última leitura). "Hoje" segue o fuso do estudante. Sem tabela nova de
"sessão", a menos que se prove necessária.

**Fora de escopo.** Recomendação adaptativa, simulado cronometrado.
**Depende de.** 43-B.
**Estado.** Planejada.

---

### 43-D — Busca como base de artigos científicos

**Por quê.** Passo 1 do ciclo. A busca atual falha no uso mais comum: várias
palavras, sem acento, sigla.

**Aceite — o estudante vê:**
- Várias palavras em qualquer ordem; aspas para frase exata.
- Sem diferença de acento, maiúscula ou letra grega: "betalactamico",
  "beta-lactâmico" e "β-lactâmicos" acham o mesmo material; "geracao" acha
  "geração"; um prefixo de 4+ letras ("cefalosp") já encontra.
- Palavras-chave (sinônimos, siglas, nomes comerciais) encontram o material.
- Ordem por relevância: título > palavras-chave > título de seção > texto.
- Cada resultado mostra título, **onde está na árvore**, trecho com os termos
  destacados e tempo de leitura. O clique abre **direto na seção** que casou.
- Filtros: disciplina; "só o que ainda não li".
- O estudante só encontra material publicado; o administrador encontra também
  rascunhos.

**Restrições e armadilhas conhecidas.**
- A busca roda no banco (busca textual do Postgres), não sobre o conteúdo
  baixado no navegador — a leitura sob demanda vai tirar esse conteúdo de lá.
- O trecho destacado vem de texto escrito pelo admin: **nunca** renderizar
  como HTML cru. Usar marcadores próprios e montar o destaque em React
  (AGENTS.md, risco 15).
- RPC nova: `revoke ... from public, anon`.
- Questões e flashcards na busca global continuam como estão.

**Fora de escopo.** Sinônimos em dicionário central (as palavras-chave de cada
material bastam por ora); busca dentro da biblioteca (decidir depois de ver a
global funcionando).
**Depende de.** Nada — pode rodar em paralelo com 43-A (arquivos diferentes).
**Estado.** Planejada — pode executar.

---

### 43-E — Tela "Hoje"

**Por quê.** O ciclo precisa de uma porta de entrada diária óbvia. As peças
existem, mas espalhadas.

**Aceite — o estudante vê, ao entrar:**
- **Continuar lendo** (último material, na seção onde parou).
- **Testar o que li** (se leu algo hoje sem testar).
- **N cards para hoje**, com um botão que abre a revisão.
- Com tudo feito no dia, a tela diz isso.

**Fora de escopo.** Metas, estatísticas novas, gamificação nova.
**Depende de.** 43-C.
**Estado.** Planejada.

## 5. Liberação

| Etapa | Pode executar agora? |
|---|---|
| 43-A | Sim |
| 43-D | Sim, em paralelo com 43-A, em worktree separado |
| 43-B | Depois de 43-A mesclada |
| 43-C | Depois de 43-B |
| 43-E | Depois de 43-C |

Regras que valem para todas as etapas estão em `EXECUTOR_PROTOCOL.md`,
`RUNBOOK.md` e `AGENTS.md` — em especial: nenhuma escrita remota, push ou merge
sem autorização específica; gates completos antes de declarar pronto; migration
no remoto antes do merge.

## 6. O que não construir

Grafo visual da rede, pré-requisito automático, recomendação adaptativa,
novos tipos de ligação entre materiais. Só voltam à mesa se o ciclo em uso
mostrar necessidade concreta.

## 7. Relação com o piloto dos β-lactâmicos

O plano de produção do piloto está em
[`docs/editorial/PLANO-ANTIMICROBIANOS.md`](../editorial/PLANO-ANTIMICROBIANOS.md)
(2026-09-23): a árvore e os 21 materiais continuam, a casa é Farmacologia e as
tabelas de "Estude antes"/"Veja também" saíram. Substitui
`TAXONOMIA-ANTIBIOTICOS-PILOTO.md`, que nunca entrou no repositório.

Onde um material mora e onde aparece, e como manter materiais atualizados com
o padrão, é da iniciativa irmã: [`BASE-DE-MATERIAIS.md`](BASE-DE-MATERIAIS.md)
(44). Ordem conjunta sugerida lá, na seção 5.

## 8. Registro das etapas

| Etapa | Estado | PR / retorno |
|---|---|---|
| 43-A | Planejada | — |
| 43-B | Planejada | — |
| 43-C | Planejada | — |
| 43-D | Planejada | — |
| 43-E | Planejada | — |
