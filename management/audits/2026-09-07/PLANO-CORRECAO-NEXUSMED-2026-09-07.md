# Plano de Correção por Etapas — NexusMed (2026-09-07)

Todas as etapas abaixo são **propostas para decisão do usuário e execução por sessões executivas separadas** (modelo diretoria/executiva já em uso no projeto) — nenhuma foi executada nesta auditoria. Nenhuma etapa toca `Header.tsx` (outra sessão em andamento). Etapas ordenadas por dependência dentro de cada prioridade.

## Etapa 0 — RESOLVIDA em 2026-09-07 (sessão 2, complemento do Prompt 02)

Ambos os itens abaixo foram verificados por consulta direta e somente leitura ao Supabase remoto nesta sessão (o acesso funcionou desta vez — ver relatório principal, seção 12.1). **Nenhuma ação de correção é necessária para os dois.**

1. ~~Confirmar se a questão demonstrativa de `seed.sql` está em produção~~ — **CONFIRMADO AUSENTE**: `select ... where question_stem ilike '%demonstrativa%' or question_stem ilike '%seed%'` retornou 0 linhas. Adicionalmente, `select n_options, count(*) from (...) group by n_options` confirmou que **100% das 393 questões do remoto têm exatamente 5 alternativas**, sem exceção, cobrindo inclusive rascunhos. Não há questão de 3 alternativas no banco de produção.
2. ~~Confirmar se a migration `20260907130000_feedback_contextual.sql` foi aplicada~~ — **CONFIRMADO APLICADO**: é a versão mais recente em `supabase_migrations.schema_migrations`; a tabela `feedback` tem as colunas `question_id`/`material_id`/`status`; `question_reactions` existe com as 2 políticas RLS esperadas. A funcionalidade de feedback/reações está operacional em produção.

**Nova pendência aberta por este complemento, não estava no plano original**: se a captura de tela do usuário mostrando "3 alternativas" não for um recorte de rolagem (ver relatório principal, seção 12.2), vale pedir uma nova captura completa (rolando até o fim da lista de alternativas) antes de investigar mais — os dados descartam qualquer causa de perda/corte de alternativa no banco, na carga ou no componente de exibição.

## Etapa 1 — Resgatar o vínculo questão↔fonte já pronto na origem (P1)

Script incremental (não recarrega questões, só popula referências):
1. Ler `banco-questoes.json` e, para cada questão já publicada no Supabase, casar `q.referencias[]` (IDs de `fontes.json`) contra a tabela `sources`.
2. Popular `sources` (se ainda não populada para as 393 questões — confirmar primeiro com uma query) a partir de `fontes.json` (87 registros, já tem toda a estrutura pronta: tipo/verificação/identificadores).
3. Inserir em `question_references` o vínculo questão→fonte, preservando a ordem de `referencias[]` em `sort_order`.
4. Rodar só contra o Supabase local primeiro (mesma disciplina de segurança do projeto), validar contagem, e só então aplicar no remoto com aprovação explícita do usuário.

Depende de decisão de produto: vale a pena expor isso na UI (ver Etapa 3) antes ou depois de carregar o dado? Recomendação: carregar o dado primeiro (barato, sem risco), decidir a exibição depois com calma.

## Etapa 2 — Alinhar o formulário de criação manual de questões ao padrão real (P2)

Em `AdminCMSView.tsx`, o formulário de criação de questão tem 4 campos de alternativa fixos. Ajustar para 5 (ou, melhor, permitir de 2 a N alternativas dinamicamente, já que o banco aceita qualquer número ≥2) evita que conteúdo novo criado manualmente daqui em diante tenha formato diferente do restante do banco. Mudança pequena e local, sem risco de schema (schema já aceita qualquer contagem ≥2).

## Etapa 3 — Exibir citação pontual na UI (decisão de produto, P2)

Só depois da Etapa 1 (dado populado). Duas opções, para o usuário escolher:
- (a) Adicionar uma nota discreta por alternativa/seção ("fonte: [n]") linkando ao número da bibliografia geral já exibida — reaproveita o que já existe em `CompendiumReader.tsx`, esforço baixo.
- (b) Popover/tooltip com a citação completa ao passar o mouse/tocar — mais trabalho de UI, mais rico.

## Etapa 4 — Corrigir bug do SRS de flashcards (P2)

Em `src/services/srsAlgorithm.ts`, função `calculateNextSRS`: trocar a referência a `currentSRS.reviewHistory` (parâmetro original, pode ser nulo) pela referência a `baseSRS` (já tratado com `createInitialSRS()` quando nulo). Mudança de uma linha, cobrir com teste unitário simples (SRS de um flashcard novo, sem histórico prévio).

## Etapa 5 — Ferramentas de curadoria de flashcards no admin (P2/P3)

Adicionar à aba "Flashcards SRS" da Área Editorial: criação manual (mesmo padrão de formulário já usado para Compêndios/Questões) e, se houver volume futuro, importação em lote. Não é urgente porque não há conteúdo de origem no acervo para importar hoje (ver relatório principal, seção 5) — a prioridade real aqui é permitir que um editor curador melhore os flashcards gerados automaticamente (hoje só truncam o enunciado), não importar volume novo.

## Etapa 6 — Cobrir os "buracos" de maior impacto na matriz de cobertura (P1, decisão de conteúdo)

Não é uma correção técnica — é trabalho editorial, priorizado pela matriz (`MATRIZ-COBERTURA-NEXUSMED-2026-09-07.md`):
1. **Imunologia**: 14 compêndios sem nenhuma questão — maior volume de material teórico sem prática associada no banco atual. Maior candidato a produção de questões novas.
2. **Farmacologia**: 114 questões sem nenhum compêndio teórico correspondente — maior volume de prática sem base teórica no software (o texto-fonte pode existir só em docx, não convertido — ver item 7).
3. **Neurocirurgia (Tumores do SNC)**: maior tema individual do banco (70 questões) sem compêndio teórico confirmado; resolver também a pendência antiga de direitos autorais das 3 imagens de aula (`imagemMeta.statusDireitos: pendente_verificacao` desde 2026-09-05).
4. **Hematologia**: 3 compêndios carregados sem nenhuma questão prática associada.

## Etapa 7 — Converter material bruto do acervo ainda fora do pipeline (P3, decisão do usuário)

9 arquivos `.docx` + 5 `.pdf` dentro da própria árvore `Biblioteca\Medicina` nunca passaram pelo processo HTML→JSON (porque o pipeline só processa HTML). Se o usuário quiser aproveitá-los, o primeiro passo é converter cada um para o mesmo padrão HTML dos outros 33 (mesmo processo manual/AI Studio já documentado em memória do projeto), depois seguir o pipeline normal de extração já existente. Não é urgente — é conteúdo que hoje simplesmente não existe no produto, não uma regressão.

## Etapa 8 — Decisão de escopo sobre "Casos Clínicos" (P3, decisão do usuário)

165 arquivos em `Base de Estudos\Casos Clínicos` são um acervo inteiro à parte, nunca integrado ao NexusMed. Antes de qualquer trabalho técnico, é preciso uma decisão de produto: isso deveria virar um terceiro tipo de conteúdo no software (ao lado de compêndios e questões), ou continuar como material de estudo pessoal fora da plataforma? Não recomendamos iniciar trabalho técnico aqui sem essa decisão prévia.

## Etapa 9 — Cosmético (P3)

Atualizar `docs/architecture/migration-roadmap.md` para refletir que as Fases 1-7 da migração Firebase→Supabase estão concluídas (hoje só descreve a "Etapa 1"). Sem risco, sem urgência.

## Etapa 10 — Reconciliar a taxonomia de disciplina entre materiais e questões (P1, nova em 2026-09-07 sessão 2)

Achado do complemento (relatório principal, seção 12.3/12.4): a disciplina de um material vem da pasta de topo do HTML; a disciplina de uma questão vem de um campo independente em `banco-questoes.json`. Isso já causa pelo menos 2 casos concretos de desalinhamento:
- `tumores-do-sistema-nervoso-central.json` carregado como "Neurologia", enquanto as 70 questões do mesmo assunto são "Neurocirurgia".
- `hipertensao-sraa-e-anti-hipertensivos.json` e `antiagregantes-anticoagulantes-e-tromboliticos.json` carregados como "Cardiologia"/"Hematologia" respectivamente, enquanto o conteúdo é de Farmacologia (e no caso da hipertensão, coincide com um tema de questão classificado como "Farmacologia" no banco).

Proposta: antes de decidir qualquer re-carga, listar todos os pares material↔tema onde a disciplina diverge (esta auditoria levantou os casos que cruzam com os 10 temas de questão existentes; uma varredura completa dos 33 compêndios contra todas as disciplinas usadas por materiais E questões daria o quadro completo). Decisão de produto pendente: unificar por reclassificação manual (rápido, mas manual) ou introduzir um campo de "disciplina efetiva" que possa divergir da pasta de origem (mais flexível, mais mudança de schema/script).

## Etapa 11 — Fontes candidatas para fechar lacunas confirmadas (P1/P2, nova em 2026-09-07 sessão 2)

Três lacunas de material confirmadas nesta sessão já têm fonte bruta pronta no acervo, só não convertida:
1. `Pneumologia\Diagnóstico\Prova de Função Pulmonar.docx` → tema "Espirometria e Função Pulmonar" (27 questões).
2. `Cardiologia\Clínica\Endocardite Infecciosa.docx` → tema "Endocardite Infecciosa" (52 questões, o maior tema de Infectologia).
3. `tutorial\Pneumologia\Tosse Crônica e Hemoptise - Tutorial 3.pdf` (Casos Clínicos) → tema "Tosse Crônica e Hemoptise" (24 questões), como caso clínico completo, não só compêndio teórico.

Converter esses 3 primeiro (antes dos outros 11 docx/pdf sem tema de questão correspondente) maximiza o retorno por esforço, porque cada um fecha uma lacuna de um tema com dezenas de questões já prontas e auditadas.

## Etapa 12 — Piloto de "resolução progressiva" de casos clínicos (P2, nova em 2026-09-07 sessão 2, proposta de produto)

Ver relatório principal, seção 12.6, para a proposta completa. Resumo: usar `casos-reais\endocardite-infecciosa-avc-embolico.html` (já digitalizado, mesmo template dos compêndios) como piloto de uma experiência de caso em camadas reveláveis (anamnese → exame → exames → conduta, com hipótese registrada a cada etapa antes de revelar a próxima), vinculando ao final às questões que já citam esse caso como fonte (`banco-questoes.json`, campo `fonte`) e a um flashcard gerado do fechamento do caso. Não migrar os ~16-18 casos identificados de uma vez — validar o piloto primeiro.
