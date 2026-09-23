# Standard — árvore de materiais e ligações transversais

> Regras que valem para **produzir conteúdo** na árvore e para implementar as
> Fases 2 e 3. A decisão de fundo está em
> [`DECISIONS.md`](../DECISIONS.md) (entrada de 2026-09-22 e sua revisão do
> mesmo dia). O que o banco garante está em
> `supabase/migrations/20260922120000_material_taxonomy.sql` e
> `20260922130000_material_taxonomy_hardening.sql`, com cobertura em
> `supabase/tests/database/material_taxonomy.test.sql`.

## 1. O que o banco garante (e o que ele recusa)

| Regra | Onde é imposta |
|---|---|
| Um material tem no máximo um pai | FK `parent_material_id` + trigger |
| Pai e filho na **mesma disciplina** (tema é livre) | `validate_material_hierarchy()` |
| Árvore acíclica, no máximo **8 níveis** | `validate_material_hierarchy()` + `app.material_max_depth()` |
| Grafo de `prerequisite` acíclico | `validate_material_link_publication()` |
| Um par de materiais tem **uma** ligação só | índice `material_links_pair_unique` |
| Ancestral não é cadastrável como `Estude antes` | trigger, nos dois sentidos (ao criar o link e ao mudar o pai) |
| Filho só publica com todos os ancestrais publicados | `publish_material()` |
| Material só publica com todos os pré-requisitos publicados | `publish_material()` |
| Despublicar não deixa descendente nem dependente publicado órfão | `unpublish_material()` — bloqueia, nunca propaga em cascata |
| Estudante só vê ligação com as duas pontas publicadas | policy `material_links_select_published` |
| Posição na árvore só muda por RPC | trigger + `save_compendium()` / `set_material_position()` |

Nada disso é validado só no frontend. O Admin deve **mostrar a mensagem do
servidor**, não reimplementar a regra.

## 2. Regras editoriais

**O pai nunca é pré-requisito.** A trilha de navegação já mostra o caminho
inteiro. `Estude antes` existe só para dependência **fora do ramo** — por
exemplo, `Combinações com inibidores → β-lactamases e seus inibidores`. O banco
recusa o cadastro redundante, então isto não é preferência de estilo.

**Um par, uma relação.** `Estude antes` (direcionado, com gate de publicação) ou
`Veja também` (simétrico, sem gate) — nunca os dois entre os mesmos dois
materiais.

**`Aprofunde-se` não se cadastra.** É derivado dos materiais-filhos.

**Assunto transversal mora em um ramo só.** Um mecanismo que atravessa classes
(resistência, alergia a β-lactâmicos) tem um lugar canônico e é alcançado de
fora por `Veja também`. Nunca duplicar o material para que apareça em dois
ramos — o critério de aceite do piloto depende de o caminho ser único.

**Quando abrir material novo:** objetivo de aprendizagem autônomo, ~8 minutos de
estudo útil, e diferenças que não cabem numa tabela comparativa do pai. Acima de
~25 minutos com mais de um objetivo, avaliar divisão.

## 3. Campos de navegação

- **`nav_short_title`** — rótulo curto da trilha e dos cartões, até 40
  caracteres, separado do título editorial: `Terceira geração` para
  `Cefalosporinas de terceira geração`. Preencher em **todo** material da
  árvore: uma trilha de seis níveis com títulos completos não cabe em tela de
  celular. Nulo significa "use o título" e só é aceitável em material legado que
  não está em árvore.
- **`taxonomy_kind`** — `visao_geral` · `mecanismo` · `classe` · `subclasse` ·
  `farmaco` · `condicao`. É a coluna "Tipo" do catálogo editorial.
- **`tree_sort_order`** — ordem entre irmãos, **em passos de 10** (10, 20,
  30...). O passo existe para inserir um irmão entre dois vizinhos sem
  renumerar a lista. Empate é desempatado por título, então a ordenação no
  cliente é sempre `(tree_sort_order, title)`, nunca só o número.

## 4. O que entra no hash de atestação

**Entra:** título, subtítulo, `nav_short_title`, metadados editoriais, seções,
referências — tudo que o revisor científico lê.

**Não entra:** `parent_material_id`, `tree_sort_order`, `taxonomy_kind`,
ligações. Reposicionar um material **não** invalida a revisão aprovada dele nem
a de nenhum vizinho.

Ao mexer em `app.build_material_snapshot`, manter esta fronteira. Colocar
navegação de volta no snapshot reintroduz duas falhas medidas: um material novo
invalida a atestação dos que ele referencia, e a re-atestação resultante é
vazia (revisão nova nasce sem claims, e aprovar sem claims passa).

## 5. Ordem de publicação

Publicação é **de cima para baixo**: raiz primeiro, folha por último.
Despublicação é de baixo para cima. Qualquer rotina de lote precisa disso —
`handlePublishAllDraftCompendiums` repete passadas enquanto houver progresso e
só desiste quando uma passada inteira não publica nada, porque o cliente não
tem como ordenar topologicamente um grafo de pré-requisitos.

## 6. Exclusão

`Veja também` é limpo automaticamente das duas pontas antes do `DELETE` (sem
isso o resultado dependia de qual UUID era menor, porque a relação simétrica é
guardada uma única vez em ordem canônica).

Continuam bloqueando a exclusão, de propósito: ter materiais-filhos, e ser
`Estude antes` de outro material. O Admin traduz essas duas FKs em qual
realocação desbloqueia — ver `INTEGRITY_HINTS` em
[`src/utils/errorMessage.ts`](../../../src/utils/errorMessage.ts).

## 7. Pendente para as Fases 2 e 3

- **Questões por nó da árvore.** Hoje "Resolver questões" no leitor filtra por
  **tema** (`onOpenQuestionsForTheme`), então todos os materiais de um mesmo
  ramo mostram o mesmo conjunto. Com a árvore, o escopo correto é "questões
  deste material e dos descendentes" — `app.material_descendants()` já existe
  para isso. Antes de trocar, é preciso saber quantas questões do acervo remoto
  têm `material_id` preenchido: se forem poucas, o escopo por nó esvazia o botão
  e o filtro precisa de fallback explícito.
- **Leitura sob demanda.** `getCompendiums()` baixa todos os materiais, todas as
  seções e todas as referências a cada login. A árvore incentiva muitos nós
  pequenos, então a Fase 3 deve separar "lista leve para árvore/biblioteca"
  (id, título, `nav_short_title`, pai, ordem, `taxonomy_kind`, status) de
  "seções do material aberto".
- **Árvore defensiva no cliente.** Material cujo pai não está na lista
  carregada (fallback do `ResilientMaterialsRepository` para `localStorage`, por
  exemplo) é renderizado como **raiz**, nunca escondido.
