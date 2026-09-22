# Taxonomia dos materiais do NexusMed — proposta de 2026-09-14

## Decisão

Adotar uma classificação primária simples e exclusiva:

`Ciclo → Disciplina → Tema → Material`

Usar conceitos, sistemas orgânicos, competências e lentes de estudo como metadados transversais — não como novas cópias do mesmo material em várias áreas.

## Problemas da taxonomia atual

- 15 disciplinas e 41 temas para somente 34 materiais.
- 10 temas não têm material associado.
- Cinco disciplinas não têm material associado: Radiologia, Fisiologia e fisiopatologia, Farmacologia, Neurocirurgia e Gastroenterologia.
- Todos os registros de disciplina e tema têm `sort_order = 0`; portanto, não existe sequência curricular intencional.
- Em grande parte do acervo, “tema” é apenas uma repetição ou expansão do título do único material, e não um agrupador reutilizável.
- O mesmo nível mistura ciências básicas (Imunologia) com especialidades clínicas (Cardiologia).
- Anatomia Cardíaca e Ciclo Cardíaco estão incorretamente em Cardiologia clínica.
- Materiais farmacológicos estão dispersos entre Cardiologia, Hematologia e Infectologia, embora Farmacologia já exista como disciplina básica vazia.
- Há inconsistência entre disciplina e tema: Tumores do SNC está em Neurologia, enquanto existe um tema órfão homônimo em Neurocirurgia.
- O material `Medicine` e seu tema enciclopédico não correspondem ao escopo atual do produto.

## Vocabulário controlado

### Ciclos

1. `basico` — estrutura, função, mecanismos, agentes, patologia e farmacologia.
2. `clinico` — semiologia, diagnóstico, prevenção e manejo por especialidade.
3. `internato_residencia` — decisão clínica avançada, urgências, procedimentos, provas e protocolos. Criar somente quando houver materiais cujo objetivo dominante justifique essa separação.

O ciclo é determinado pelo **objetivo educacional dominante**, não pela presença de exemplos clínicos. Uma correlação clínica não transforma Anatomia em Cardiologia clínica.

### Metadados transversais

- `content_type`: fundamento, tutorial/PBL, revisão temática, questão comentada ou protocolo.
- `study_lens`: anatomia, fisiologia, fisiopatologia, diagnóstico, conduta, farmacologia ou alto rendimento.
- `systems`: cardiovascular, respiratório, renal, hematolinfoide etc.
- `concepts`: vínculos reutilizáveis para busca, pré-requisitos e formas paralelas.
- `editorial_state`: legado, revisão necessária, auditoria científica, auditoria editorial, QA visual, publicado conforme ou arquivado.

Não usar tags livres para substituir ciclo, disciplina ou tema.

## Matriz proposta dos 34 materiais

| Material | Ciclo | Disciplina | Tema | Decisão editorial |
|---|---|---|---|---|
| Anatomia Cardíaca (`Cardiac Anatomy`) | Básico | Anatomia | Sistema cardiovascular | Manter; traduzir, revisar e reenquadrar |
| Ciclo Cardíaco | Básico | Fisiologia | Fisiologia cardiovascular | Reclassificar |
| Hipotensão Pós-Exercício e Controle Barorreflexo | Básico | Fisiologia | Regulação cardiovascular | Reclassificar |
| Patologia das Doenças Circulatórias | Básico | Patologia | Distúrbios circulatórios | Reclassificar |
| Trombose e Hemostasia | Básico | Patologia | Hemostasia e trombose | Reclassificar; Farmacologia como conceito secundário |
| Antiagregantes, Anticoagulantes e Trombolíticos | Básico | Farmacologia | Farmacologia da hemostasia | Reclassificar |
| Antifúngicos | Básico | Farmacologia | Farmacologia anti-infecciosa | Reclassificar |
| Hipertensão Arterial, SRAA e Anti-hipertensivos | Básico | Farmacologia | Farmacologia cardiovascular | Reclassificar; Cardiologia como sistema secundário |
| Micologia Médica | Básico | Microbiologia | Micologia | Reclassificar |
| Virologia Geral | Básico | Microbiologia | Virologia | Reclassificar |
| Anticorpos e Imunidade Humoral | Básico | Imunologia | Imunidade adaptativa | Manter disciplina; consolidar tema |
| Células do Sistema Imune | Básico | Imunologia | Organização do sistema imune | Manter disciplina; consolidar tema |
| Citocinas: Visão Integradora | Básico | Imunologia | Mediadores e sinalização | Manter disciplina; consolidar tema |
| Hipersensibilidade | Básico | Imunologia | Imunopatologia | Manter disciplina; consolidar tema |
| Imunidade Inata | Básico | Imunologia | Imunidade inata | Manter |
| Linfócitos T: Diferenciação e Funções | Básico | Imunologia | Imunidade adaptativa | Manter disciplina; consolidar tema |
| MHC e Apresentação Antigênica | Básico | Imunologia | Imunidade adaptativa | Manter disciplina; consolidar tema |
| Moléculas do Sistema Imune | Básico | Imunologia | Mediadores e sinalização | Manter disciplina; consolidar tema |
| Órgãos e Tecidos Linfoides | Básico | Imunologia | Organização do sistema imune | Manter disciplina; consolidar tema |
| Resposta Imune a Bactérias — Extracelulares e Intracelulares | Básico | Imunologia | Imunidade contra patógenos | Manter disciplina; consolidar tema |
| Resposta Imune a Patógenos | Básico | Imunologia | Imunidade contra patógenos | Manter |
| Respostas Th1, Th2 e Th17 | Básico | Imunologia | Imunidade adaptativa | Manter disciplina; consolidar tema |
| Sistema Complemento | Básico | Imunologia | Imunidade inata | Manter disciplina; consolidar tema |
| Vacinas e Imunidade Protetora | Básico | Imunologia | Imunidade protetora e vacinação | Manter disciplina; consolidar tema |
| Semiologia Cardíaca | Clínico | Cardiologia | Semiologia cardiovascular | Manter disciplina; corrigir tema genérico |
| PCSK9 e a Nova Fronteira da Redução de LDL-c | Clínico | Cardiologia | Dislipidemias e prevenção cardiovascular | Corrigir tema; Farmacologia como lente secundária |
| Hematologia Clínica — Hemograma e Anemias | Clínico | Hematologia | Hemograma e anemias | Manter |
| Fundamentos de Infectologia | Clínico | Infectologia | Abordagem das doenças infecciosas | Manter; simplificar tema |
| Avaliação da Função Renal | Clínico | Nefrologia | Avaliação da função renal | Manter; simplificar tema |
| Choque Circulatório | Clínico | Medicina de Emergência | Choque | Manter disciplina; corrigir tema |
| Medicina de Família e Comunidade | Clínico | Medicina de Família e Comunidade | Fundamentos da atenção primária | Manter; simplificar tema |
| Síndromes Bronco-Pleuro-Pulmonares | Clínico | Pneumologia | Semiologia respiratória | Manter |
| Tumores do Sistema Nervoso Central | Clínico | Neurologia | Neuro-oncologia | Manter provisoriamente; Neurocirurgia como conceito secundário |
| Medicine | — | — | — | Manter despublicado e arquivar; não migrar |

## Estrutura resultante

### Ciclo básico

- Anatomia
  - Sistema cardiovascular
- Fisiologia
  - Fisiologia cardiovascular
  - Regulação cardiovascular
- Patologia
  - Distúrbios circulatórios
  - Hemostasia e trombose
- Farmacologia
  - Farmacologia cardiovascular
  - Farmacologia da hemostasia
  - Farmacologia anti-infecciosa
- Microbiologia
  - Micologia
  - Virologia
- Imunologia
  - Organização do sistema imune
  - Imunidade inata
  - Imunidade adaptativa
  - Mediadores e sinalização
  - Imunidade contra patógenos
  - Imunopatologia
  - Imunidade protetora e vacinação

### Ciclo clínico

- Cardiologia
  - Semiologia cardiovascular
  - Dislipidemias e prevenção cardiovascular
- Hematologia
  - Hemograma e anemias
- Infectologia
  - Abordagem das doenças infecciosas
- Nefrologia
  - Avaliação da função renal
- Medicina de Emergência
  - Choque
- Medicina de Família e Comunidade
  - Fundamentos da atenção primária
- Pneumologia
  - Semiologia respiratória
- Neurologia
  - Neuro-oncologia

## Ordem curricular sugerida

Dentro de cada ciclo: disciplina → fundamentos estruturais → mecanismos → integração → aplicação. Dentro de cada tema, usar `sort_order` explícito e estável. Não ordenar alfabeticamente quando houver dependência pedagógica.

Exemplo cardiovascular básico:

1. Anatomia Cardíaca.
2. Ciclo Cardíaco.
3. Hipotensão Pós-Exercício e Controle Barorreflexo.
4. Patologia das Doenças Circulatórias.
5. Trombose e Hemostasia.
6. Farmacologia cardiovascular/da hemostasia.

## Implementação segura

1. Aprovar esta matriz como decisão editorial.
2. Criar/reutilizar disciplinas e temas canônicos, com nomes e `sort_order` definidos.
3. Fazer uma migração somente de taxonomia: atualizar `discipline_id` e `theme_id`, sem reenviar conteúdo, referências, status ou vínculos.
4. Preservar IDs dos materiais e todos os vínculos existentes.
5. Manter aliases/redirecionamentos se URLs dependem da taxonomia atual.
6. Não apagar imediatamente temas/disciplinas antigos; primeiro confirmar que ficaram sem referências e arquivá-los ou removê-los em operação separada.
7. Validar contagens antes/depois, navegação por ciclo, busca, packs, questões e retorno ao pack de origem.
8. Não atestar cientificamente materiais apenas por terem sido reclassificados.

## Estado desta entrega

Auditoria e proposta apenas. Nenhuma linha do banco foi modificada.
