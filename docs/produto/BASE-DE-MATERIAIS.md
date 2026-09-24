# Base de materiais que cresce sem envelhecer — iniciativa 44

**Estado da iniciativa:** planejada (2026-09-23)
**Formato:** fichas de etapa — ver [`docs/diretoria/MODELO-DIRETORIA.md`](../diretoria/MODELO-DIRETORIA.md),
seção "Fichas de etapa". Cada ficha diz **o quê** e **por quê**, com critério
de aceite observável. O **como** é derivado por quem executa, lendo o código
naquele momento.

Para executar uma etapa: *"Execute a etapa 44-X de
`docs/produto/BASE-DE-MATERIAIS.md` seguindo `docs/operacao/EXECUTOR_PROTOCOL.md`."*

Iniciativa irmã: [`CICLO-DE-ESTUDO.md`](CICLO-DE-ESTUDO.md) (43). A 43 cuida do
que o estudante faz com os materiais; esta cuida de o banco de materiais
crescer em quantidade e complexidade sem duplicar e sem envelhecer.

---

## 1. O objetivo

Dois problemas estruturais apontados pelo dono do produto (2026-09-23):

1. **Um assunto pertence a várias disciplinas.** Antimicrobianos são de
   Farmacologia e de Infectologia (e aparecem em Pediatria, Terapia
   Intensiva...). Hoje o material só pode estar numa.
2. **O padrão editorial melhora e os materiais antigos ficam para trás.**
   Não há como saber quais estão atrasados nem um jeito barato de atualizá-los.

Objetivo: o banco cresce — mais materiais, mais disciplinas, mais versões do
padrão — sem cópia de material e sem obrigar a reescrever tudo a cada melhoria.

## 2. Onde está hoje (verificado no código em 2026-09-23)

- Material tem **uma** disciplina e **um** tema (o tema pertence à disciplina).
  Pai e filho precisam ter a mesma disciplina (regra no banco). Biblioteca e
  filtros usam só a disciplina do próprio material.
- O padrão editorial não tem versão; nada registra contra qual padrão cada
  material foi escrito.
- A importação já confere regras mecânicas (citação sem link, campos
  faltando) — mas só no arquivo que entra, nunca no que já está guardado.
- Importar com título já existente é bloqueado. Não existe exportar um
  material como arquivo, nem atualizar um material a partir de arquivo.
- O salvamento já preserva o id das seções (e, com ele, o vínculo das questões
  com a seção) e casa referências por texto idêntico, preservando o vínculo com
  fonte curada — a base para atualizar a partir de arquivo já existe.
- Seções, Pontos-Chave, Pérola, Alerta e referências são campos separados no
  banco: mudar o formato do arquivo `.md` não afeta material já guardado.

## 3. Decisão de modelo

Registrada em [`DECISIONS.md`](../operacao/DECISIONS.md) (2026-09-23, "Casa e
'também aparece em'; padrão versionado").

**Onde o material mora e onde aparece — duas perguntas separadas.**
- **Casa:** todo material tem uma única disciplina-casa, a mesma do ramo
  inteiro (a 43-A faz o pai definir a disciplina). Regra para escolher: **o
  material mora onde o conceito é definido** — fármaco e classe de fármaco em
  Farmacologia; doença e síndrome na especialidade clínica; mecanismo e
  fisiologia na ciência básica.
- **Também aparece em:** um ramo (um material e tudo abaixo dele) pode ser
  exibido em outras disciplinas. Marca-se uma vez, no topo do ramo; o que for
  criado depois dentro dele aparece junto. Sem cópia; o caminho de navegação é
  o mesmo em qualquer disciplina.
- Descartados: cópia por disciplina (versões divergem), vários pais
  (caminho ambíguo), fim das disciplinas (estudante e provas pensam por
  disciplina).

**Mudanças no padrão, por tipo.**
- **Aparência** (caixa de fórmula, legenda de tabela): resolvida no leitor,
  nunca no texto. Os materiais antigos melhoram sozinhos.
- **Formato do arquivo** (nome de um bloco, campo novo): o importador aceita a
  forma antiga e a nova por um tempo. Material guardado não é afetado.
- **Editorial** (profundidade, divisão de um material): a única que exige
  reescrita — por isso o padrão tem versão, a plataforma aponta o que está
  atrás (44-C) e a reescrita é feita por arquivo, sobre o mesmo material (44-B).

**A plataforma é a única fonte da verdade.** Arquivos `.md` são formato de
troca: antes de pedir mudança à IA, exporta-se a versão atual. Cópia guardada
em pasta local não é referência.

**O texto do material não cita a estrutura.** Nada de "veja o material X",
"no próximo módulo" ou número no título ("Antimicrobianos I"). Navegação é da
plataforma. Assim, criar, mover ou dividir um material nunca obriga a editar o
texto de outro.

## 4. Fichas

### 44-A — Casa e "também aparece em"

**Por quê.** Um ramo como Antibióticos serve a Farmacologia, Infectologia,
Pediatria e Terapia Intensiva. Hoje aparece numa só; a alternativa seria
copiar, e cópia diverge.

**Aceite — quem produz vê:**
- No formulário do material (e no cartão da Área Editorial), um campo
  **"Também aparece em"**: escolhe-se a disciplina e, nela, o tema sob o qual o
  ramo aparece — por clique, nunca por texto digitado.
- Um material de dentro de um ramo já marcado mostra **"Aparece também em
  Infectologia (herdado de Antibióticos — visão geral)"**, sem editar ali.
- A disciplina-casa continua sendo a do ramo; a regra "pai e filho na mesma
  disciplina" continua valendo.

**Aceite — o estudante vê:**
- Na biblioteca de Infectologia, o ramo inteiro aparece, com as mesmas
  páginas e o mesmo caminho de navegação.
- O filtro por disciplina (biblioteca, busca, Área Editorial) inclui os ramos
  que aparecem naquela disciplina.
- Progresso de leitura é um só: ler pela Infectologia conta como lido em
  qualquer lugar.
- Material em rascunho nunca aparece por esse caminho.

**Restrições e armadilhas conhecidas.**
- **Não entra no hash de atestação** — é como o material é alcançado, não o
  que o revisor lê (mesma decisão de 2026-09-23 para a posição na árvore).
- Marcar um ramo na própria casa, ou um ramo que já aparece naquela disciplina
  por um ancestral, é redundante: rejeitar com mensagem clara.
- Tabela nova em `public` exige `revoke ... from anon`; RPC nova exige `revoke
  ... from public, anon` (AGENTS.md, riscos 13 e 14).
- Se a 43-D (busca) já estiver mesclada, o filtro de disciplina dela passa a
  considerar os ramos marcados.
- Questões continuam com a disciplina delas.

**Fora de escopo.** Sugestão automática de onde um ramo deveria aparecer;
disciplina de questão derivada dos materiais que ela cobra.
**Depende de.** 43-A mesclada (mesmo formulário; é ela que faz o pai definir a
disciplina).
**Estado.** Planejada.

---

### 44-B — Exportar e atualizar a partir de arquivo

**Por quê.** É o caminho barato para trazer um material antigo ao padrão atual
e para dividir um material grande em vários, com ajuda de IA, sem perder nada
do que já está ligado a ele (posição, questões, progresso de leitura).

**Aceite — quem produz vê:**
- Em cada material, **"Exportar .md"**: baixa o arquivo no formato do padrão
  vigente (metadados, seções, Pontos-Chave, Pérola, Alerta, palavras-chave,
  referências). Reimportado sem mudança, produz exatamente o mesmo conteúdo.
- Em cada material, **"Atualizar a partir de arquivo"**: escolhe um `.md`, vê
  uma prévia do que muda (seções novas, alteradas e removidas; referências
  novas e removidas) e grava por cima do **mesmo** material.
- Continua igual depois de atualizar: posição na árvore, filhos, "também
  aparece em", progresso de leitura, questões ligadas ao material.
- Seções casadas pelo título mantêm as questões ligadas a elas. A prévia avisa
  quantas questões apontam para seções que vão sumir.
- Referências de texto idêntico mantêm o vínculo com fonte curada.
- A prévia avisa que a atestação vai cair quando o conteúdo muda. Arquivo
  idêntico ao atual não muda nada — nem a atestação.
- O padrão editorial (Parte 2) ganha o passo a passo de "atualizar um material
  antigo" e de "dividir um material grande": atualizar o original com a parte
  que fica nele e importar as partes novas como filhos.

**Restrições e armadilhas conhecidas.**
- Casar seção por título normalizado (sem acento, sem maiúscula). Título
  mudado é seção nova — a prévia mostra. Sem heurística de similaridade.
- "Importar material" continua bloqueando título repetido. Atualizar é ação
  explícita sobre o material escolhido, nunca adivinhada pelo título.
- Exportador e importador andam juntos: o teste de ida e volta (exportar →
  importar → mesmo conteúdo) é o aceite automático, e qualquer mudança futura
  de formato mexe nos dois.
- "Salvar" sem mudança é no-op (AGENTS.md, risco 17): nenhum campo pode mudar
  sem mudança no arquivo.

**Fora de escopo.** Exportar em lote; histórico de versões do material;
editar o `.md` dentro da plataforma.
**Depende de.** 43-A mesclada (as duas mexem na Área Editorial).
**Estado.** Planejada.

---

### 44-C — Versão do padrão e conformidade

**Por quê.** Saber, a qualquer momento, quais materiais estão atrás do padrão
e o que falta em cada um — sem reler tudo. Quando o padrão ganhar uma regra
nova, ver na hora quais materiais ela afeta.

**Aceite — quem produz vê:**
- Cada material mostra a **versão do padrão** em que foi produzido. Material
  importado lê a linha `**Versão do padrão:**` do arquivo (o padrão já pede
  essa linha desde a v2); material sem a linha aparece como "sem versão".
  Ajustável na revisão.
- No cartão do material, um selo **"Conforme"** ou **"N pendências"**, com a
  lista ao clicar. As pendências vêm de checagens automáticas sobre o
  conteúdo guardado — as regras mecânicas do padrão: citação sem link;
  citação para referência inexistente; referência nunca citada; tabela sem
  frase de abertura citada; LaTeX; `<=`/`>=`; lista dentro de lista;
  subtítulo que não seja `####`; tempo fora de 8–25 minutos; sem
  palavras-chave; texto que remete a outro material ("veja o material",
  "próximo módulo").
- Filtros na Área Editorial: **"Com pendências"** e **"Em versão antiga do
  padrão"**.
- A mesma lista de checagens roda na prévia da importação e da atualização por
  arquivo — uma lista só de regras.

**Restrições.**
- A checagem é calculada, não gravada: regra nova vale na hora para todos, sem
  mudar conteúdo nem hash de atestação.
- Pendência orienta, não bloqueia publicação — o gate continua sendo a
  atestação.
- Regras de julgamento (profundidade, o que cabe em cada nível) não viram
  checagem; ficam no checklist do padrão e na revisão.
- Daqui em diante, toda regra mecânica nova no padrão vem com a checagem no
  mesmo PR (AGENTS.md, risco 19).

**Fora de escopo.** Correção automática; nota de qualidade; checagem por IA.
**Depende de.** 44-B (a pendência aponta; a atualização por arquivo resolve).
**Estado.** Planejada.

## 5. Liberação

| Etapa | Pode executar quando |
|---|---|
| 44-B | Depois de 43-A mesclada |
| 44-A | Depois de 43-A mesclada; em sequência com 44-B (mesma Área Editorial) |
| 44-C | Depois de 44-B |

Ordem sugerida com a iniciativa 43 — primeiro o que muda a forma de produzir:
**43-A → 44-B → 43-B → 44-A → 44-C**, com 43-D em paralelo a qualquer momento;
depois o que só lê: **43-C → 43-E**.

Regras que valem para todas as etapas estão em `EXECUTOR_PROTOCOL.md`,
`RUNBOOK.md` e `AGENTS.md`.

## 6. Já feito sem código (2026-09-23)

- Padrão editorial na **v2**: regra da casa, texto que não cita a estrutura,
  linha `**Versão do padrão:**` no arquivo.
- Plano de produção dos antimicrobianos com a casa em Farmacologia:
  [`docs/editorial/PLANO-ANTIMICROBIANOS.md`](../editorial/PLANO-ANTIMICROBIANOS.md).

## 7. O que não construir

Vários pais por material; cópia de material entre disciplinas; sincronização
de trechos entre materiais; histórico e comparação de versões de conteúdo;
reescrita por IA dentro da plataforma. Só voltam à mesa com necessidade
concreta.

## 8. Registro das etapas

| Etapa | Estado | PR / retorno |
|---|---|---|
| 44-A | Planejada | — |
| 44-B | Planejada | — |
| 44-C | Planejada | — |
