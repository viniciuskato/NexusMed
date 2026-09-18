# AS1 — Inventário editorial (missão AS1-A)

> Executada em 2026-09-17, branch `docs/as1-a-inventario` a partir de
> `origin/main` = `6d65054`. Sessão executiva — não produziu conteúdo,
> não alterou banco, não alterou acervo. Ver seção "Ambientes tocados"
> no retorno para a diretoria.

## Resumo executivo

Dos 21 temas da AS1, **nenhum tem cobertura A completa e formalmente
auditada**. Isso não significa que o acervo esteja vazio — pelo
contrário: existem **três materiais publicados no banco** com conteúdo
denso e bem referenciado que cobrem, juntos, sete dos 21 temas (total
ou parcialmente, alguns como seções de um material mais amplo), e
existem **pelo menos oito arquivos no acervo de estudo, fora do banco,
com conteúdo forte e citações verificáveis**, cobrindo mais seis temas.
O achado central para a diretoria: **grande parte do trabalho de
pesquisa e redação para uns 12-13 dos 21 temas já foi feito** — em
lugares diferentes (banco de dados, `Biblioteca/Medicina`, `Casos
Clínicos/tutorial`), em formatos diferentes (HTML, DOCX, PDF), e com
graus de acabamento e de auditoria editorial diferentes. O trabalho
que falta não é, na maior parte dos casos, "escrever do zero" — é
"localizar, ler por completo, auditar cientificamente, converter para
o padrão canônico (HTML) e publicar", ou, para 8 dos 21 temas, "escrever
do zero mesmo", porque nenhum conteúdo aproveitável foi localizado.

Nenhum material published no banco tem registro de auditoria formal
(`content_revisions`, `claims`, `content_reviews` — ver seção
"Materiais encontrados no banco"). Isso significa que "publicado" no
banco, hoje, é um status técnico de visibilidade ao estudante, não uma
certificação científica. Este relatório trata as duas coisas como
distintas em toda a matriz abaixo.

## Matriz dos 21 temas

| # | Tema | Área | Cobertura | Evidência resumida |
|---|---|---|---|---|
| 1 | Avaliação da Função Renal | Nefrologia | **B** | Material publicado no banco ("Avaliação da Função Renal", 16 seções, 9 referências, lido integralmente) + 2 candidatos adicionais no acervo (tutorial de caso e exame de urina), não integrados |
| 2 | Radiologia em Nefrologia | Nefrologia | **D** | Nada encontrado no banco nem no acervo especificamente sobre imagem renal |
| 3 | Distúrbio Acidobásico | Nefrologia | **B** | Nenhum material/questão no banco; acervo tem PDF de 18 páginas lido na íntegra, excelente, não importado |
| 4 | Distúrbios do Metabolismo de Sódio e Água | Nefrologia | **C** | 24 questões publicadas no banco, mas sob disciplina errada (Fisiologia, não Nefrologia) e sem material vinculado; 1 arquivo de caso no acervo, localizado não lido |
| 5 | Distúrbios do Metabolismo do Potássio | Nefrologia | **D** | Nada encontrado como tema dedicado (só menções pontuais dentro do material de ácido-base) |
| 6 | Hipertensão Arterial Secundária | Nefrologia | **C** | Material do banco sobre HAS cobre primária/farmacologia, com só 2 parágrafos sobre secundária (sinais de alerta, sem investigação); 38 questões + 13 flashcards no banco sob tema/disciplina que não é Nefrologia, sem material |
| 7 | Doença Renal Diabética | Nefrologia | **D** | Nada encontrado |
| 8 | Hemograma | Hematologia | **B** | Seção de material publicado no banco ("Hematologia Clínica — Hemograma e Anemias"), lida integralmente, referenciada |
| 9 | Abordagem da Anemia | Hematologia | **B** | Mesma seção/material — matriz VCM×IPR como algoritmo central |
| 10 | Anemia Ferropriva | Hematologia | **B** | Mesmo material — seção dedicada + conduta terapêutica (PCDT MS), lida integralmente |
| 11 | Anemia Macrocítica | Hematologia | **B** | Mesmo material — seção "megaloblásticas" bem desenvolvida; causas não-megaloblásticas só em tabela, não desenvolvidas |
| 12 | Diagnóstico Diferencial da Dispneia | Pneumologia | **B** | Nenhum material/questão no banco; acervo tem DOCX lido na íntegra, excelente, não importado |
| 13 | Diagnóstico Diferencial da Dor Torácica | Pneumologia | **D** | Nada dedicado encontrado (dor torácica só aparece como diferencial dentro do material de dispneia) |
| 14 | Diagnóstico Diferencial da Tosse e Hemoptise | Pneumologia | **C** | 24 questões publicadas no banco, sem material; 1 PDF de tutorial no acervo com título idêntico, localizado não lido |
| 15 | Asma | Pneumologia | **C** | Seção curta (só semiologia de exame físico) dentro de material mais amplo do banco; nenhum material dedicado |
| 16 | Semiologia Cardíaca | Cardiologia | **B** | Material publicado no banco (23 seções, 7 referências, lido integralmente) + candidato mais antigo no acervo (possível duplicata/precursor) |
| 17 | Valvopatias Aórtica e Pulmonar | Cardiologia | **C*** | Nenhum material/questão no banco; acervo tem HTML de tutorial com citação estruturada (confirmado por busca, não lido na íntegra) — candidato forte, pendente de leitura completa |
| 18 | Valvopatias Mitral e Tricúspide | Cardiologia | **C** | Nenhum material/questão no banco; 1 PDF de caso no acervo cobrindo só estenose mitral, localizado não lido; nada sobre tricúspide |
| 19 | Endocardite Infecciosa | Cardiologia | **B** | 52 questões + 19 flashcards publicados no banco sob disciplina errada (Infectologia, não Cardiologia), sem material; acervo tem DOCX lido na íntegra, excelente, com manifesto editorial próprio declarando "em revisão"; mais 2 arquivos de caso relacionados, não lidos |
| 20 | Insuficiência Cardíaca | Cardiologia | **C** | 40 questões + 2 flashcards publicados no banco (disciplina correta), sem material nenhum |
| 21 | Cardiomiopatias | Cardiologia | **C** | Nenhum material/questão no banco; 1 DOCX recente no acervo cobrindo só cardiomiopatia hipertrófica, localizado não lido |

`*` Ver nota de cautela na cobertura 17 — grep confirma estrutura de tutorial completo (citação NBR, referência a diretriz vigente), mas o conteúdo não foi lido integralmente nesta missão; não deve ser tratado como B sem essa leitura.

**Nenhum tema recebeu cobertura A** porque nenhum material publicado no
banco tem `content_revisions`/`claims`/`content_reviews` preenchidos —
ou seja, nenhum passou pelo gate formal de auditoria científica descrito
em `PADRAO-TUTORIAL.md` (Gates 7-8), mesmo quando a leitura manual do
conteúdo (feita nesta missão para 3 materiais) mostrou qualidade
editorial alta.

## Cobertura por área — visão consolidada

| Área | A | B | C | D | NV |
|---|---|---|---|---|---|
| Nefrologia (7 temas) | 0 | 2 | 2 | 3 | 0 |
| Hematologia (4 temas) | 0 | 4 | 0 | 0 | 0 |
| Pneumologia (4 temas) | 0 | 1 | 2 | 1 | 0 |
| Cardiologia (6 temas) | 0 | 2 | 4 | 0 | 0 |
| **Total (21 temas)** | **0** | **9** | **8** | **4** | **0** |

Hematologia é, de longe, a área mais coberta — mas por um único
material do banco que se estende por quatro objetivos da prova. Isso é
uma força (não precisa produzir do zero) e um risco (uma revisão
malfeita nesse único material derruba a cobertura de 4 temas ao mesmo
tempo).

## Materiais encontrados no banco (Supabase remoto, leitura direta)

Acesso obtido via `supabase db dump --data-only` (modo leitura,
sem senha exposta nesta sessão, sem nenhuma escrita) sobre um recorte de
tabelas de conteúdo, excluindo explicitamente tabelas com dado pessoal
de usuário (perfis, notas, favoritos, tentativas de questão, revisões
de flashcard, notificações). Contagens confirmadas por script próprio
de parsing do dump (não por inspeção visual): 34 materiais, 402
questões, 42 flashcards, 15 disciplinas, 41 temas cadastrados, 268
referências de material, 675 referências de questão no total da base
— não só da AS1.

Dos 34 materiais publicados no banco, **12 pertencem às 4 disciplinas
da AS1** (Nefrologia, Hematologia, Pneumologia, Cardiologia). Os que
tocam algum dos 21 temas oficiais:

| Material (banco) | Disciplina | Status | Seções | Referências | Toca o(s) tema(s) AS1 |
|---|---|---|---|---|---|
| Avaliação da Função Renal | Nefrologia | published | 16 | 9 | 1 |
| Hematologia Clínica — Hemograma e Anemias | Hematologia | published | 34 | 12 | 8, 9, 10, 11 |
| Hipertensão Arterial, SRAA e Anti-hipertensivos | Cardiologia | published | 21 | 10 | 6 (parcial) |
| Semiologia Cardíaca | Cardiologia | published | 23 | 7 | 16 |
| Síndromes Bronco-Pleuro-Pulmonares | Pneumologia | published | 33 | 7 | 15 (seção curta) |

Outros 7 materiais do banco nessas 4 disciplinas (Ciclo Cardíaco,
Patologia das Doenças Circulatórias, Cardiac Anatomy, Hipotensão
Pós-Exercício, PCSK9/LDL-c, Antiagregantes/Anticoagulantes/Trombolíticos,
Trombose e Hemostasia) são conteúdo de qualidade comparável, mas **não
correspondem a nenhum dos 21 temas oficiais da AS1** — são pré-requisitos
ou temas adjacentes úteis para referência cruzada, não objetivos da
prova em si.

Três materiais foram **lidos integralmente** nesta missão (não só
localizados) para poder classificar além de "publicado no banco":
"Avaliação da Função Renal" (seções relevantes ao tema 1), as seções
de anemia do material de Hemograma, e a seção "HAS primária versus
secundária" do material de hipertensão. Todos citam fontes verificáveis
(KDIGO 2024, CKD-EPI 2021/NEJM, PCDT MS 1247/2014, OMS 2024 etc.) e
seguem estrutura próxima da exigida por `PADRAO-TUTORIAL.md`
(fundamentos → mecanismo → discussão → perguntas em aberto). **Isso não
equivale a uma auditoria científica formal** — não foi feita checagem
fonte a fonte de cada afirmação, e as tabelas `claims`/`content_revisions`/
`content_reviews` do próprio sistema de proveniência do NexusMed estão
zeradas para esses materiais.

**Questões e flashcards sem material vinculado** (achado relevante —
"ilhas" de banco de questões sem o material que as embasa):

| Tema/theme no banco | Disciplina no banco | Questões publicadas | Flashcards | Material vinculado | Tema AS1 |
|---|---|---|---|---|---|
| Insuficiência Cardíaca | Cardiologia (correta) | 40 | 2 | Nenhum | 20 |
| Endocardite Infecciosa | **Infectologia** (deveria ser Cardiologia p/ AS1) | 52 | 19 | Nenhum | 19 |
| Tosse Crônica e Hemoptise | Pneumologia (correta) | 24 | 0 | Nenhum | 14 |
| Espirometria e Função Pulmonar | Pneumologia (correta) | 27 | 0 | Nenhum | tangencial a 12 |
| Distúrbios de Sódio e Água | **Fisiologia e fisiopatologia** (deveria ser Nefrologia p/ AS1) | 24 | 0 | Nenhum | 4 |
| Hipertensão Arterial e SRAA | **Farmacologia** (deveria cruzar com Nefrologia p/ AS1) | 38 | 13 | Nenhum | 6 (tangencial) |
| Radiografia de Tórax Básica | Radiologia | 18 | 0 | Nenhum | não corresponde a nenhum dos 21 (é tórax, não renal) |

O desalinhamento de disciplina/tema já era um achado registrado em
auditorias anteriores do NexusMed (ver memória de sessões passadas
sobre desalinhamento de taxonomia disciplina×material×questão); esta
missão confirma que ele **também afeta diretamente 3 dos 21 temas da
AS1** (4, 6, 19) — quem for buscar essas questões filtrando por
"Nefrologia" ou "Cardiologia" no admin não as encontra, porque estão
etiquetadas noutra disciplina.

**Flashcards são conteúdo de usuário, não editorial**: a tabela
`flashcards` tem `user_id` obrigatório e `is_custom` — os 42 flashcards
do banco foram criados por usuários reais estudando, não por uma
esteira de produção editorial. Contá-los como "cobertura" seria
enganoso; eles aparecem na tabela acima só para mostrar onde há
interesse de estudo já registrado, não como ativo produzido.

## Arquivos encontrados no acervo

Busca feita em `Biblioteca/Medicina/{Cardiologia,Hematologia,
Nefrologia,Pneumologia}`, `Casos Clínicos/tutorial/{Cardiologia,
Nefrologia,Pneumologia,Infectologia}`, `_acervo/{semiologia,
farmacologia,fisiopatologia}` e `provas/medicina`. `_archive` foi
localizado mas não tratado como fonte vigente, conforme instrução.

### Lidos integralmente nesta missão

| Caminho | Formato | Tema provável | Modificado | Refs/imagens | Observação |
|---|---|---|---|---|---|
| `Biblioteca/Medicina/Nefrologia/Fisiologia/Equilíbrio Ácido-Base.pdf` | PDF, 18 pág. | 3 — Distúrbio Acidobásico | 01/09 | 20+ refs, sem imagens, 5 casos clínicos comentados, cita ensaios de 2026 (SODa-BIC) | Excelente; não está no banco; candidato prioritário |
| `Biblioteca/Medicina/Pneumologia/Semiologia/dispneia-diagnostico-diferencial.docx` | DOCX | 12 — Dispneia | 01/09 | 8 refs, sem imagens, declara explicitamente "lido só por abstract" quando é o caso | Excelente; não está no banco; candidato prioritário |
| `Biblioteca/Medicina/Cardiologia/Clínica/Endocardite Infecciosa.docx` | DOCX | 19 — Endocardite Infecciosa | 29/08 | 4 refs (ESC 2023, Duke-ISCVID 2023, POET/NEJM 2019, AHA 2021), sem imagens | Excelente; manifesto editorial próprio: estado "em_revisão", **não aprovado** |
| `Biblioteca/Medicina/Cardiologia/Clínica/Febre Reumática.pdf` | PDF, 15 pág. | Não é um dos 21 (mas fundamenta 17/18) | 01/09 | 12 refs, 2 figuras reais (Robbins & Cotran) | Excelente; útil como pré-requisito de valvopatias, não substitui os temas 17/18 |
| `Biblioteca/Medicina/Nefrologia/Diagnóstico/Interpretação de Exame de Urina Tipo 1.pdf` | PDF, 11 pág. | Complementar ao tema 1 | 01/09 | 10 refs, 5 fotomicrografias reais (Atlas CHUAC) | Excelente; não é um dos 21 temas em si, mas material de apoio direto do tema 1 |

### Localizados, não auditados (existência e metadados confirmados; conteúdo não lido ou só verificado por amostragem/grep)

| Caminho | Formato | Tema provável | Modificado | Nota |
|---|---|---|---|---|
| `Casos Clínicos/tutorial/Cardiologia/estudo-valvopatia-aortica-mista.html` | HTML | 17 — Valvopatias Aórtica e Pulmonar | 24/08 | Grep confirma título exato, citação NBR (`navRef`), referência à Diretriz Brasileira de Valvopatias 2020 — estrutura de tutorial completo, mas texto não lido |
| `Casos Clínicos/tutorial/Cardiologia/Valvopatia Aórtica Mista - Caso Clínico 1.pdf` | PDF | 17 | 24/08 | Provável par/derivado do HTML acima; não lido |
| `Casos Clínicos/tutorial/Cardiologia/Estenose Mitral - Caso Clínico 2.pdf` | PDF | 18 — Valvopatias Mitral e Tricúspide (só estenose mitral; nada sobre tricúspide) | 24/08 | Não lido |
| `Casos Clínicos/tutorial/Cardiologia/Caso 3 - Endocardite Infecciosa.pdf` | PDF | 19 | 24/08 | Não lido; possível sobreposição com o DOCX já lido |
| `Casos Clínicos/tutorial/Cardiologia/Anotações do caso 3 endocardite.docx` | DOCX | 19 | data não verificada | Não lido |
| `Casos Clínicos/tutorial/Cardiologia/Cardiomiopatia Hipertrófica - Tutorial V.docx` | DOCX | 21 — Cardiomiopatias (só hipertrófica) | 14/09 (recente) | Não lido; escopo aparente é só um subtipo |
| `Casos Clínicos/tutorial/Nefrologia/Avaliação da Função Renal - Caso Clínico.pdf` | PDF | 1 (versão caso clínico/Atenção Básica) | 24/08 | Não lido; ver duplicata provável abaixo |
| `Casos Clínicos/tutorial/Nefrologia/fechamento-avaliacao-funcao-renal.html` | HTML | 1 | 24/08 | Grep confirma título "Fechamento — Avaliação da Função Renal na Atenção Básica"; possível duplicata parcial do material do banco |
| `Casos Clínicos/tutorial/Nefrologia/Acidose Metabólica - Caso Clínico 3.pdf` | PDF | 3 (versão caso clínico) | 24/08 | Não lido; complementa o PDF de 18 páginas já lido |
| `Casos Clínicos/tutorial/Nefrologia/Hipovolemia, lesão renal aguda e hipernatremia - Caso Clínico 4.docx` | DOCX | 4 (tangencial) | data não verificada | Não lido |
| `Casos Clínicos/tutorial/Pneumologia/Tosse Crônica e Hemoptise - Tutorial 3.pdf` | PDF | 14 | 24/08 | Título idêntico ao tema; não lido |
| `Casos Clínicos/tutorial/Pneumologia/DPOC - Tutorial 4.docx` | DOCX | Não é um dos 21 (DPOC ≠ Asma) | data não verificada | Não lido |
| `_acervo/semiologia/Propedeutica_Cardiovascular.docx` | DOCX | 16 — Semiologia Cardíaca | 28/05 (mais antigo que o material do banco) | Não lido; possível precursor/legado do material publicado |
| `_acervo/semiologia/Semiologia_Pulmonar.docx` | DOCX | 12-15 (semiologia respiratória geral) | 31/05 | Não lido |
| `_acervo/semiologia/Semiologia_Sistema_Respiratorio_Completo.docx` | DOCX | 12-15 | 31/05 | Não lido; nome sugere sobreposição com o arquivo acima |
| `_acervo/semiologia/Semiologia_Sistema_Respiratorio_FINAL.docx` | DOCX | 12-15 | 31/05 | Não lido; três arquivos de nome muito parecido no mesmo tema — ver duplicatas |
| `_acervo/semiologia/Sindromes_Pleuropulmonares.docx` | DOCX | 15 (Asma está entre as síndromes brônquicas) | 28/05 | Não lido; mais antigo que "Síndromes Bronco-Pleuro-Pulmonares" do banco |

Arquivos de nome genérico ("Caso 4.docx", "Quarto caso clínico.docx",
"Quinto caso.docx", em Cardiologia/Nefrologia/Pneumologia) foram
localizados mas **não foi possível atribuir tema provável sem
leitura** — aparecem na pasta certa por disciplina, mas o nome não
identifica o objetivo da AS1 a que correspondem, se algum.

### Fora do acervo principal (registrados separadamente, conforme instrução)

Nenhum candidato relevante aos 21 temas foi localizado fora de
`C:\Users\vinic\OneDrive\Estudos\Base de Estudos` nesta busca.

## Lacunas (nenhum conteúdo aproveitável encontrado)

- Tema 2 — Radiologia em Nefrologia
- Tema 5 — Distúrbios do Metabolismo do Potássio
- Tema 7 — Doença Renal Diabética
- Tema 13 — Diagnóstico Diferencial da Dor Torácica

Esses 4 temas precisam de produção do zero segundo o padrão
`PADRAO-TUTORIAL.md` completo (Gates 0-9) — nenhum atalho de
aproveitamento foi encontrado.

## Duplicatas prováveis (precisam de decisão da diretoria, não foram reconciliadas nesta missão)

1. **Avaliação da Função Renal** — material publicado no banco
   (framing de especialista, aula PUC/UEL) versus
   `fechamento-avaliacao-funcao-renal.html` + PDF de caso clínico no
   acervo (framing de Atenção Básica, formato PBL). Gêneros diferentes
   (compêndio de área vs. tutorial de caso), mesmo tema central —
   podem ser complementares, não necessariamente redundantes, mas
   nenhum dos dois cita o outro.
2. **Semiologia Cardíaca** — material publicado no banco versus
   `_acervo/semiologia/Propedeutica_Cardiovascular.docx`, mais antigo
   (28/05, dois meses antes do material do banco, 06/09). Padrão
   consistente com precursor/rascunho que pode ter sido superado.
3. **Endocardite Infecciosa** — DOCX da Biblioteca (lido, "em_revisão")
   versus `Caso 3 - Endocardite Infecciosa.pdf` + anotações no
   tutorial de casos. Mesma doença, gêneros diferentes; risco real de
   sobreposição de conteúdo se ambos forem promovidos sem comparação.
4. **Semiologia respiratória/Pneumologia** — quatro arquivos distintos
   tocando o mesmo assunto em `_acervo/semiologia/`
   (`Semiologia_Pulmonar.docx`, `Semiologia_Sistema_Respiratorio_
   Completo.docx`, `Semiologia_Sistema_Respiratorio_FINAL.docx`,
   `Sindromes_Pleuropulmonares.docx`), todos de maio, mais antigos que
   "Síndromes Bronco-Pleuro-Pulmonares" do banco (06/09). O próprio
   nome "_FINAL" ao lado de "_Completo" sugere histórico de
   iteração/substituição não resolvido.

Nenhuma dessas quatro situações foi lida a ponto de confirmar
conteúdo idêntico — "duplicata provável" aqui significa sobreposição
de tema/título/data que **merece leitura comparativa antes de
qualquer produção nova**, não uma conclusão de que o conteúdo é
redundante.

## Riscos

- **Taxonomia de disciplina no banco não bate com a área da AS1** para
  3 temas (4, 6, 19) — quem planejar produção olhando só pela
  disciplina no admin vai concluir erroneamente que não há nenhuma
  questão para Nefrologia/Cardiologia nesses pontos.
- **"Publicado" ≠ "auditado"**: nenhum dos materiais existentes,
  mesmo os de leitura excelente, tem attestação formal no sistema de
  proveniência (`content_revisions`/`claims`/`content_reviews`
  zerados). Produzir em cima deles sem rodar os Gates 7-8 do
  `PADRAO-TUTORIAL.md` repetiria o problema, não resolveria.
- **Duplicação de esforço é o risco mais imediato para o prazo**: pelo
  menos 4 pares de arquivos (ver seção anterior) cobrem o mesmo tema
  em lugares diferentes. Produzir um tema "do zero" sem checar essas
  duplicatas primeiro desperdiça o trabalho já feito e pode gerar
  inconsistência entre duas versões publicadas do mesmo assunto.
- **Formato não canônico**: os candidatos de maior qualidade fora do
  banco estão em DOCX/PDF, não HTML — mesmo aprovados cientificamente,
  precisam do Gate 9 (conversão para HTML canônico) antes de virar
  material do NexusMed.
- **Genérico demais para classificar**: vários arquivos de caso
  clínico têm nome que não identifica o tema ("Caso 4.docx"). Uma
  sessão futura vai precisar abri-los para saber se cobrem algum dos
  21 temas ou são de outro assunto.

## Itens não verificados nesta missão

- Conteúdo integral de 12 dos ~20 arquivos do acervo listados como
  "localizado, não auditado" (tabela acima).
- Se as quatro "duplicatas prováveis" são de fato conteúdo
  sobreposto/redundante ou complementar.
- Estado do Supabase remoto além do recorte de tabelas de conteúdo
  consultado (não foram lidas tabelas de usuário/comportamento, por
  decisão deliberada de minimizar dado pessoal, conforme restrição da
  missão).
- Legibilidade e integridade visual de páginas de PDF (não houve
  necessidade de inspecionar imagem/tabela quebrada nos documentos
  lidos — nenhum problema de renderização foi encontrado nos 5 PDFs/
  DOCX efetivamente lidos, mas os demais PDFs não foram abertos).

## Ordem recomendada de produção

Ver `docs/diretoria/AS1-TAXONOMIA-PILOTO-2026-09-17.md`, seção "Ondas
de produção", para o detalhamento tema a tema com pré-requisitos,
esforço estimado e risco científico.

Resumo em uma frase por onda:

- **Onda 0 (antes de produzir qualquer coisa)**: ler por completo os
  ~12 arquivos "localizados, não auditados" e decidir as 4 duplicatas
  prováveis — sem isso, qualquer ordem de produção corre risco de
  duplicar trabalho.
- **Onda 1 (auditoria + conversão, não produção nova)**: os 3 temas
  com material excelente já fora do banco e ainda não publicado (3, 12,
  19) — rodar Gates 7-9 do `PADRAO-TUTORIAL.md` sobre conteúdo já
  escrito.
- **Onda 2 (revisão/complementação do que já está publicado)**: os
  temas 1, 8, 9, 10, 11, 16 — já têm material publicado no banco, mas
  sem auditoria formal; a decisão da diretoria aqui é se roda auditoria
  retroativa antes ou depois da prova, dado o prazo.
- **Onda 3 (produção nova apoiada em fragmentos)**: temas 4, 6, 14, 15,
  17, 18, 20, 21 — há questões, seções curtas ou candidatos de leitura
  parcial, mas nenhum material completo; produção precisa considerar o
  que já existe para não repetir.
- **Onda 4 (produção do zero, sem atalho)**: temas 2, 5, 7, 13 — nada
  aproveitável encontrado.
