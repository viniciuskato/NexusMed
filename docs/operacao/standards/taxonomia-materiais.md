# Standard — árvore de materiais e ligações transversais

> Regras que valem para **produzir conteúdo** na árvore e para implementar as
> Fases 2 e 3. A decisão de fundo está em
> [`DECISIONS.md`](../DECISIONS.md) (entrada de 2026-09-22 e sua revisão do
> mesmo dia). O que o banco garante está em
> `supabase/migrations/20260922120000_material_taxonomy.sql` e
> `20260922130000_material_taxonomy_hardening.sql`, com cobertura em
> `supabase/tests/database/material_taxonomy.test.sql`.

> **Desde 2026-09-23, "Estude antes" e "Veja também" não são mais
> cadastrados** — decisão "Ciclo de estudo" em [`DECISIONS.md`](../DECISIONS.md);
> a conexão entre materiais passa a vir das questões (frente 43 do
> [plano canônico](../../produto/PLANO-DE-DESENVOLVIMENTO.md)). As regras de
> ligação abaixo continuam valendo para os vínculos que já existem, que seguem
> visíveis e intactos. A árvore (pai → filhos) não muda.

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

**Entra:** título, subtítulo, metadados editoriais (`mode`, `study_lens`,
autor, tags, tempo...), seções, referências (com id e vínculo de fonte) —
tudo que o revisor científico lê. O snapshot é idêntico ao de antes da
taxonomia (`20260914120000`).

**Não entra:** `parent_material_id`, `tree_sort_order`, `taxonomy_kind`,
`nav_short_title`, ligações. Reposicionar um material **não** invalida a
revisão aprovada dele nem a de nenhum vizinho. (`nav_short_title` entrou no
hash na Fase 1.5 e saiu em `20260923120000`: no fluxo real — importar, depois
posicionar — ele só pode ser preenchido depois do conteúdo pronto, e reatestar
por causa de um rótulo de trilha não protegia nada.)

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

**Mensagem de bloqueio lista a ordem inteira.** Quando `publish_material`
recusa por causa da árvore, a mensagem traz **todos** os ancestrais em
rascunho, do mais alto para o mais baixo — a sequência em que cada publicação
vai dar certo. A Fase 1.5 chegou a apontar só o ancestral mais próximo, o que
estava errado: o mais próximo também está bloqueado pelo de cima dele, e a
tentativa seguinte falhava de novo. O cartão do Admin mostra a mesma lista
antes do clique (`publishPrerequisitesInOrder`).

## 6. Exclusão

`Veja também` é limpo automaticamente das duas pontas antes do `DELETE` (sem
isso o resultado dependia de qual UUID era menor, porque a relação simétrica é
guardada uma única vez em ordem canônica).

Continuam bloqueando a exclusão, de propósito: ter materiais-filhos, e ser
`Estude antes` de outro material. O Admin traduz essas duas FKs em qual
realocação desbloqueia — ver `INTEGRITY_HINTS` em
[`src/utils/errorMessage.ts`](../../../src/utils/errorMessage.ts).

## 6.0. "Salvar" sem mudança é no-op (desde 2026-09-23)

Abrir um material no formulário do Admin e clicar **Salvar alterações** sem
mudar nada **não pode alterar nenhum campo gravado**. Antes alterava três e
cada um mudava o hash atestado: `mode` nulo virava `mecanismos` (os 38
materiais de produção tinham `mode` nulo), `study_lens` era apagado (o
formulário não tem o campo), e as referências eram apagadas e recriadas com
ids novos — perdendo, em silêncio, o vínculo com fonte curada.

Como está garantido:

- **Cliente** — `src/utils/compendiumForm.ts` faz a conversão
  formulário ⇄ material partindo do material original, então todo campo que
  o formulário não edita atravessa intacto. Garantia em
  `tests/unit/compendiumForm.test.ts`, com controle negativo feito.
- **Banco** — `save_compendium` casa cada referência com a existente de
  **texto idêntico** e preserva id e vínculo; nunca altera `source_id`/`url`
  de uma referência existente (o vínculo é gerido só pelo painel de
  referências). Garantia em `supabase/tests/database/salvar_sem_perda.test.sql`,
  que usa de propósito o payload do cliente antigo (com `source_id` nulo).

Ao adicionar um campo novo em `materials`: se o formulário não vai editá-lo,
ele atravessa pelo `original`; se vai, acrescente-o a `CompendiumFormState` e
ao teste de ida e volta.

## 6.1. Contrato do Admin com `save_compendium` (desde a Fase 2)

`save_compendium` trata cada campo de navegação como "só altera se a chave
aparecer no payload" (ver §4 da migration 1.5) — pensado para um cliente que
ainda não conhece esses campos. **O formulário do Admin não é esse cliente**:
desde a Fase 2, ele é a fonte de verdade da navegação e envia sempre
`parent_material_id`, `tree_sort_order`, `nav_short_title`, `taxonomy_kind` e
`navigation_links` (mesmo `null`/`0`/`[]`) a cada save. Um novo caminho de
escrita que reutilizar `saveCompendium()` sem passar por esse formulário
precisa decidir explicitamente qual dos dois contratos seguir — omitir por
descuido preserva o valor anterior, o que é surpreendente para quem espera
"salvar limpa o que não foi preenchido".

## 6.1b. Importação já posicionada (desde 2026-09-23)

`import_compendium_draft` aceita `p_parent_material_id`, `p_tree_sort_order`,
`p_nav_short_title`, `p_taxonomy_kind` e `p_navigation_links`, todos com
default — o cliente antigo, que chama só com os dez parâmetros originais, segue
funcionando. Posição e ligações são gravadas **na mesma transação** do
material: se qualquer regra da árvore for violada, nada é criado.

O modal "Importar material" e o formulário de edição usam o **mesmo**
componente (`MaterialNavigationFields`) e a mesma validação
(`src/utils/materialNavigation.ts`). As ligações são gravadas por uma função
única, `app.replace_material_links`, chamada pelas duas RPCs e fora do alcance
do cliente.

## 6.2. Navegação do estudante (Fase 3)

Os três elementos visíveis vivem em
`src/components/compendium/MaterialNavigation.tsx` e derivam todos do mesmo
utilitário puro do Admin (`src/utils/materialTree.ts`) — não reimplementar
travessia de árvore em outro lugar:

- **Trilha de navegação** (`MaterialBreadcrumb`) — colapsa para "… › pai ›
  atual" quando há mais de um ancestral, com botão para abrir o caminho
  inteiro. Nenhum controle depende de hover.
- **`Aprofunde-se`** (`MaterialChildrenCards`) — derivado dos filhos, nunca
  cadastrado. Coluna única no celular.
- **`Estude antes` / `Veja também`** (`MaterialLinkBoxes`) — caixas
  visualmente distintas (âmbar × indigo), cada uma com `role="region"` e nome
  acessível.
- **Árvore da biblioteca** (`MaterialTreeList`) — terceiro modo de exibição,
  ao lado de cartões e lista; construída sobre o resultado **já filtrado**,
  então busca e filtros continuam valendo.

**Destino ausente da lista carregada é omitido em silêncio.** Para o
estudante, um material fora de `compendiums` significa "ainda em rascunho"
(a policy `material_links_select_published` já esconde a ligação e a RLS de
`materials` esconde o material): a UI nunca renderiza link que levaria a
lugar nenhum. Coberto por
`tests/component/materialNavigation.test.tsx` e pelo E2E
`tests/e2e/specs/taxonomia-navegacao-fase3.spec.ts`.

**O rótulo do botão de expandir acompanha o rótulo visível** (curto quando
existe), não o título completo — senão o leitor de tela anuncia dois nomes
diferentes para a mesma linha da árvore.

## 7. Pendente para as Fases 2 e 3

- **Questões por nó da árvore — bloqueado por vinculação editorial, não por
  código.** Hoje "Resolver questões" no leitor filtra por **tema**
  (`onOpenQuestionsForTheme`); com a árvore, o escopo correto seria "questões
  deste material e dos descendentes" (`app.material_descendants()` já existe
  para isso). Inventário remoto de 2026-09-22: **apenas 9 de 420 questões
  (2,1%) têm `material_id` preenchido.** Trocar o filtro agora esvaziaria
  "Resolver questões" para quase todo estudante. Não implementar o escopo por
  nó sem, antes, um plano editorial de vinculação em massa — este item não
  reabre até essa vinculação avançar.
- **Leitura sob demanda.** `getCompendiums()` baixa todos os materiais, todas as
  seções e todas as referências a cada login. Inventário remoto de
  2026-09-22: 38 materiais, 836 seções, ~947 mil caracteres de `content`
  (~1 MB no payload hoje). A árvore incentiva muitos nós pequenos — 21 só no
  piloto de β-lactâmicos —, então a Fase 3 deve separar "lista leve para
  árvore/biblioteca" (id, título, `nav_short_title`, pai, ordem,
  `taxonomy_kind`, status) de "seções do material aberto" antes que esse
  número cresça o suficiente para importar.
- ~~**Árvore defensiva no cliente.**~~ **Resolvido na Fase 2** —
  `buildMaterialTree`/`getAncestors`/`getDescendantIds`
  (`src/utils/materialTree.ts`) tratam pai fora da lista carregada (fallback
  do `ResilientMaterialsRepository` para `localStorage`, por exemplo) e ciclo
  corrompido sem travar nem esconder o material: ele vira raiz visível
  (`isOrphanedParent: true`). Cobertura em `tests/unit/materialTree.test.ts`.
  Reaproveitar este utilitário na árvore/biblioteca e no breadcrumb da Fase 3
  em vez de reimplementar a travessia.
