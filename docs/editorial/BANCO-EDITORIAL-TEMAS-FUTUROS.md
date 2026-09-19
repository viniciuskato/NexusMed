# Banco editorial de temas futuros — NexusMed

Artefato canônico do prompt executivo `25-A`. Fonte documental para capturar, triar, priorizar e acompanhar temas futuros de conteúdo, **sem** confundi-los com `themes`/`concepts` publicados no produto. Não é CMS, schema Supabase, migration nem interface — é uma tabela versionável (CSV) mais esta especificação.

Dados: [`banco-editorial-temas-futuros.csv`](./banco-editorial-temas-futuros.csv) — 117 linhas, uma por ideia.

## 1. Campos (schema leve)

| Campo | Significado | Preenchido nesta importação? |
|---|---|---|
| `id` | Identificador estável (`IDEA-3`, `IDEA-P4-001`, …). Nunca reutilizar após arquivamento. | Sim |
| `titulo` | Nome curto do candidato. | Sim |
| `ciclo_proposto` | Nível mais alto da localização curricular proposta. | Sim (proposto) |
| `disciplina_proposta` | Disciplina/área proposta. | Sim (proposto) |
| `tema_proposto` | Tema proposto dentro da disciplina. | Sim (proposto) |
| `tipo_schema` | Tipo normalizado ao enum `material\|questions\|flashcards\|complete_pack`, ou `a_definir` quando a pauta de origem não permite mapear sem inventar. | Sim |
| `tipo_pretendido_original` | Texto literal da fonte (plano de ensino/auditoria), preservado sem reinterpretação. | Sim |
| `conceitos_transversais` | Conceitos/sistemas/competências que atravessam mais de um item. | Não (exigiria leitura clínica nova; deixado para triagem) |
| `justificativa` | Por que este tema deveria entrar no NexusMed — decisão editorial, não constatação de origem. | Não (não promovido automaticamente; ver seção 4) |
| `objetivos_preliminares` | Objetivos de aprendizagem preliminares. | Não (mesma razão) |
| `prioridade` | Prioridade editorial. | `a_definir` para todos — ver seção 5 |
| `estado` | Ver seção 2. | `idea` para todos os 117 |
| `origem` | Documento e seção de onde o candidato foi extraído, para rastreabilidade. | Sim |
| `esforco` | Estimativa de esforço. | `a_definir` |
| `dependencias` | IDs de outros itens deste banco de que este depende ou aos quais está ligado. Só preenchido quando a fonte declara o vínculo explicitamente (ex.: "componente do pack X", "ligado ao pack Y"); nunca inferido. | Parcial — ver seção 6 |
| `decisao` | Decisão tomada (aprovar/rejeitar/mesclar) e por quem. | Vazio (nenhuma decisão tomada nesta importação) |
| `notas` | Observações de triagem já existentes na fonte, preservadas verbatim/paráfrase mínima — nunca conteúdo médico novo. | Sim, quando a fonte trazia observação |
| `criado_em` | Data de entrada no banco. | `2026-09-15` |
| `decidido_em` | Data da decisão. | Vazio |

`localizacao curricular proposta` é dividida em três colunas (`ciclo_proposto`/`disciplina_proposta`/`tema_proposto`) em vez de uma string composta, para permitir filtro e validação de unicidade por campo. **Nenhuma dessas colunas cria nó real de taxonomia** — são apenas a proposta textual capturada da fonte, pendente de triagem humana (regra de escopo do 25-A: "não criar disciplina/tema produtivo a partir de uma ideia ainda não aprovada").

## 2. Estados e transições

```
idea → triage → approved → in_production → completed
                    ↓             ↓
                 blocked ←────────┘
                    ↓
                 archived (de qualquer estado, exceto completed)
```

| Estado | Significado |
|---|---|
| `idea` | Capturado, não triado. Estado de todos os 117 itens desta importação. |
| `triage` | Em avaliação editorial (cobertura, fontes, escopo, duplicidade). |
| `approved` | Escopo e fontes aprovados; pronto para entrar na fila de produção. |
| `in_production` | Em desenvolvimento ativo (material/questões/flashcards). |
| `blocked` | Produção interrompida por dependência, decisão pendente ou fonte insuficiente. |
| `completed` | Publicado e vinculado ao `material_id`/`concept_id` real no produto. Depois disso o item deixa de ser "futuro" — mantém-se aqui só como histórico. |
| `archived` | Descartado ou fundido em outro item; motivo obrigatório em `decisao`. |

Transições permitidas: `idea→triage`, `triage→approved`, `triage→archived`, `approved→in_production`, `approved→blocked`, `approved→archived`, `in_production→blocked`, `in_production→completed`, `blocked→approved`, `blocked→archived`. Nenhum estado pula direto para `in_production` ou `completed` sem passar por `triage`/`approved` — isso é o que impede que constar num plano de ensino promova automaticamente um item.

## 3. Critérios editoriais de priorização

Curtos, para orientar a etapa `triage` — não aplicados retroativamente nesta importação:

1. **Necessidade curricular** — o tema é exigido em ciclo/prova/plano vigente?
2. **Impacto** — quantos alunos/quanta prova é afetada?
3. **Cobertura existente** — o acervo já tem material/questões equivalentes (parcial ou total)?
4. **Qualidade de fontes disponíveis** — há diretriz/livro-texto atual e acessível?
5. **Esforço** — tamanho estimado do trabalho de autoria + revisão.
6. **Dependências** — o item depende de outro pack ainda não pronto?

## 4. Lacuna comprovada vs. hipótese vs. oportunidade

Nenhum item desta importação foi classificado nessa distinção — ela é trabalho de `triage`, não de importação. Ficam registrados os únicos casos em que a fonte já apontava uma constatação, para a triagem não repetir o levantamento:

- **Lacuna comprovada** (auditoria 21-A2/09-07 já confirmou por leitura de banco): `IDEA-P4-024` (Endocardite infecciosa), `IDEA-P4-026` (Insuficiência cardíaca) e `IDEA-P4-028` (Hipertensão arterial primária) já têm lotes grandes de questões *published* no acervo — a pergunta de triagem é auditoria de cobertura, não criação do zero.
- **Cobertura parcial relatada pela pauta de origem** (hipótese a confirmar, não lacuna comprovada): `IDEA-3`/`IDEA-4` (Asma/DPOC) e `IDEA-P4-037` (Tosse e hemoptise).
- **Oportunidade sem constatação prévia**: os demais 112 itens — apenas candidatos extraídos de plano de ensino, sem checagem de cobertura.

## 5. Sobre não promover automaticamente

Todos os 117 itens entram como `idea` e com `prioridade = a_definir`, mesmo os que a pauta de origem descreve como "pack completo" ou presentes em mais de um plano de ensino. Constar num plano de ensino do 4º período não é critério de prioridade — é apenas critério de existência do candidato. `Clinical Experience` (`IDEA-P4-100`–`107`) e `Plano de Desenvolvimento Individual I` (`IDEA-P4-108`–`117`) recebem `ciclo_proposto = Transversal/Profissional` e ficam explicitamente fora da árvore clínica, como determinado no prompt.

## 6. Consolidação Asma/DPOC — proveniência preservada

`IDEA-P4-038` (Asma) e `IDEA-P4-039` (DPOC), extraídos da pauta do 4º período, **não** geraram linhas próprias no CSV — foram consolidados nas pautas já existentes `IDEA-3` e `IDEA-4` (registradas em `00-INDICE.md` linhas 358–364, diretoria 2026-09-15), que já cobrem exatamente o mesmo tema (`Clínico → Pneumologia → Doenças obstrutivas`, `complete_pack`). Mapa de consolidação:

| ID da pauta 4º período | Consolidado em | Como a proveniência foi preservada |
|---|---|---|
| `IDEA-P4-038` — Asma | `IDEA-3` | Campo `origem` de `IDEA-3` cita explicitamente `IDEA-P4-038` e o documento de origem. |
| `IDEA-P4-039` — DPOC | `IDEA-4` | Campo `origem` de `IDEA-4` cita explicitamente `IDEA-P4-039` e o documento de origem. |

Os dois itens permanecem separados entre si (Asma ≠ DPOC), como exigido — só a duplicidade de fonte (pauta 4º período vs. registro da diretoria) foi eliminada, não o conteúdo. `Farmacologia e farmacoterapia da asma.docx` permanece registrado (em `IDEA-3.notas`) como entrada legada a auditar, nunca como fonte aprovada — igual a `IDEA-P4-075` (Farmacoterapia da asma), que fica como componente dependente de `IDEA-3`, não fundido a ele.

## 7. Validações executadas

Rodadas sobre o CSV final (117 linhas de dados + 1 cabeçalho):

- **Unicidade de `id`**: 117 valores únicos — sem colisão. `IDEA-P4-038` e `IDEA-P4-039` foram deliberadamente omitidos (consolidados, seção 6), o que fecha a conta 117 pauta + 2 pré-existentes − 2 consolidados = 117.
- **Campos obrigatórios não vazios em todas as linhas**: `id`, `titulo`, `estado`, `origem`, `criado_em` — 100% preenchidos.
- **`estado` restrito ao enum da seção 2**: 100% `idea`.
- **Referências internas em `dependencias`**: todos os IDs citados (`IDEA-3`, `IDEA-4`, `IDEA-P4-001`, `007`, `026`, `028`, `030`, `031`, `032`, `033`, `034`, `061`, `064`, `092`) existem como `id` no próprio banco — nenhuma referência solta.
- **Leitura humana**: título, tipo e origem de cada linha são frase única e direta, sem jargão de banco de dados; o usuário pode auditar o CSV abrindo em qualquer planilha.

## 8. Ambiguidade estrutural encontrada (decisão pendente, não tomada aqui)

42 dos 117 itens ficaram com `tipo_schema = a_definir` (texto original preservado em `tipo_pretendido_original`), por duas razões distintas que não devem ser confundidas:

**8.1 — 25 itens por incompatibilidade do enum com competências, habilidades ou formatos avaliativos.** O enum de `tipo` do prompt (`material|questions|flashcards|complete_pack`) não cobre esse vocabulário, presente sobretudo em Habilidades Profissionais IV, Clinical Experience e Plano de Desenvolvimento Individual I: `IDEA-P4-070`, `082`, `083`, `084`, `085`, `086`, `088`, `100`, `101`, `102`, `103`, `104`, `105`, `106`, `107`, `108`, `109`, `110`, `111`, `112`, `113`, `114`, `115`, `116`, `117`. Aqui a delimitação de escopo não é o problema — é o próprio enum que não tem uma categoria para "competência transversal", "habilidade prática/de comunicação" ou "formato avaliativo" (ex.: `IDEA-P4-086` OSCE clínico integrado). **Decisão que a diretoria precisa tomar**: estender o enum (ex.: incluir `competencia`/`habilidade`/`avaliativo`) ou manter esses itens fora do banco de conteúdo até terem tipo de entrega definido. Não decidido nesta execução — apenas sinalizado.

**8.2 — 17 itens por insuficiência de delimitação do tipo de entrega**, onde o enum poderia se aplicar mas a própria fonte ainda não delimitou qual: `IDEA-P4-002`, `003`, `011`, `014`, `018`, `020`, `022`, `023`, `033`, `034`, `041`, `061`, `063`, `066`, `091`, `094`, `098`. Inclui rótulos vagos ("conjunto a delimitar", "trilha a delimitar", "trilha/conjunto", "conjunto farmacológico/anatomopatológico/geriátrico/dermatológico") e casos em que a fonte lista mais de um formato possível sem decidir ("material/questões/SRS"). Nenhuma dessas 17 foi resolvida por conta própria, conforme a própria regra 5 da pauta ("rótulos vagos precisam de delimitação humana antes da triagem").

Não decidido nesta execução: nem a extensão do enum (8.1), nem a delimitação de escopo (8.2). O enum não foi ampliado nesta correção — essa decisão permanece da diretoria.

## 9. Requisitos futuros de interface (para o AI Studio — não prototipado)

Registro apenas de requisitos, sem desenho de tela:

1. Listagem filtrável por `estado`, `ciclo_proposto`/`disciplina_proposta`, `tipo_schema` e `prioridade`.
2. Visualização de grafo/lista de `dependencias` (quais ideias bloqueiam quais).
3. Formulário de transição de estado que só ofereça as transições permitidas da seção 2 (evita pular etapas por engano).
4. Campo de busca textual em `titulo`/`tema_proposto`/`notas`.
5. Exibição lado a lado de itens candidatos a duplicata/consolidação (como o par `IDEA-3`/`IDEA-P4-038`), para revisão humana antes de arquivar.
6. Exportação/diff amigável — o CSV já é diffável em git; a interface deveria preservar isso e não reescrever a ordem das linhas em toda edição.

## 10. Fora de escopo nesta execução

Sem alteração de produto, banco Supabase, schema, CMS, interface, commit, push, deploy ou dado remoto. Sem pesquisa clínica nova, sem conteúdo médico novo, sem criação de disciplina/tema produtivo real. Nenhum item teve prioridade ou decisão de aprovação atribuída.
