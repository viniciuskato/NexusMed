# AS1 — Taxonomia piloto (missão AS1-A)

> Documentação apenas. Nenhuma tabela, migration ou funcionalidade foi
> criada. Isto é um modelo para a diretoria decidir a taxonomia real
> antes de qualquer implementação — não é a taxonomia do banco (que
> continua sendo `disciplines`/`themes`, sem alteração nesta missão).

## Como ler este documento

Cada um dos 21 temas vira um **conceito canônico**. Conceitos se
relacionam entre si por um vocabulário fechado de 11 relações (listado
na missão). Um "tema integrador" pode ter **conceitos componentes**
— por exemplo, "Abordagem da Anemia" não é uma doença isolada, é um
método de investigação que usa "Anemia Ferropriva" e "Anemia
Macrocítica" como diagnósticos possíveis dentro dele.

## Conceitos canônicos

### 1. Avaliação da Função Renal
- **Sinônimos/abreviações**: TFG, clearance de creatinina, CKD-EPI, MDRD, Cockcroft-Gault, função renal
- **Área principal**: Nefrologia · **Áreas relacionadas**: Farmacologia (ajuste de dose renal), Fisiologia
- **Tipo**: exame / mecanismo
- **Componentes**: creatinina sérica, cistatina C, exame de urina, proteinúria/albuminúria, classificação KDIGO
- **Sobreposição possível**: com "Interpretação de Exame de Urina" (não é um dos 21, mas é insumo direto)
- **Relações**: é pré-requisito de [6 Hipertensão Arterial Secundária]; é pré-requisito de [7 Doença Renal Diabética]; é avaliado por [exame de urina, creatinina, cistatina C]

### 2. Radiologia em Nefrologia
- **Sinônimos**: imagem renal, USG renal, urografia, TC de vias urinárias
- **Área principal**: Nefrologia · **Relacionadas**: Radiologia
- **Tipo**: exame
- **Relações**: é avaliado por [ultrassonografia, tomografia]; aprofunda [1 Avaliação da Função Renal]; é complicação de nenhum (é ferramenta diagnóstica, não desfecho)

### 3. Distúrbio Acidobásico
- **Sinônimos**: equilíbrio ácido-base, gasometria arterial, acidose/alcalose metabólica e respiratória, ânion-gap
- **Área principal**: Nefrologia · **Relacionadas**: Pneumologia (componente respiratório), Medicina de Emergência
- **Tipo**: mecanismo / alteração laboratorial
- **Componentes**: acidose metabólica, alcalose metabólica, acidose respiratória, alcalose respiratória, ânion-gap, distúrbios mistos
- **Relações**: é causa de [alterações do potássio — ver 5]; pode causar [arritmia, depressão do SNC]; é avaliado por [gasometria arterial/venosa]; compartilha mecanismo com [5 Distúrbios do Metabolismo do Potássio] (troca H+/K+)

### 4. Distúrbios do Metabolismo de Sódio e Água
- **Sinônimos**: hiponatremia, hipernatremia, distúrbios da volemia, água corporal total
- **Área principal**: Nefrologia · **Relacionadas**: Medicina de Emergência
- **Tipo**: alteração laboratorial / mecanismo
- **Relações**: é causa de [sintomas neurológicos]; pode causar [edema, desidratação]; compartilha mecanismo com [3 Distúrbio Acidobásico] (ambos regulados pelo rim); é avaliado por [1 Avaliação da Função Renal]

### 5. Distúrbios do Metabolismo do Potássio
- **Sinônimos**: hipercalemia, hipocalemia
- **Área principal**: Nefrologia · **Relacionadas**: Cardiologia (arritmia)
- **Tipo**: alteração laboratorial
- **Relações**: compartilha mecanismo com [3 Distúrbio Acidobásico]
  (troca H+/K+ — a relação é bidirecional: um distúrbio acidobásico
  pode causar hipercalemia/hipocalemia e vice-versa, por isso não é
  tratada aqui como "complicação de" em uma única direção); pode causar
  [arritmia cardíaca]; é avaliado por [gasometria, eletrólitos séricos, ECG]

### 6. Hipertensão Arterial Secundária
- **Sinônimos**: HAS secundária, hipertensão renovascular, hiperaldosteronismo, feocromocitoma (como causas)
- **Área principal**: Nefrologia · **Relacionadas**: Cardiologia, Endocrinologia (fora do escopo da AS1)
- **Tipo**: doença / diagnóstico diferencial
- **Componentes**: estenose de artéria renal, hiperaldosteronismo primário, doença renal parenquimatosa, feocromocitoma, apneia obstrutiva do sono
- **Sobreposição possível**: com o material do banco "Hipertensão Arterial, SRAA e Anti-hipertensivos" (que é majoritariamente sobre HAS primária/farmacologia — cobre a distinção primária×secundária só como lista de sinais de alerta, não como tema central)
- **Relações**: faz diagnóstico diferencial com [HAS primária, fora do escopo direto da AS1 mas mesmo material de origem]; é pré-requisito de nenhum dos 21; é avaliado por [1 Avaliação da Função Renal, exames de imagem — 2]

### 7. Doença Renal Diabética
- **Sinônimos**: nefropatia diabética, DRD
- **Área principal**: Nefrologia · **Relacionadas**: Endocrinologia (fora do escopo direto)
- **Tipo**: doença
- **Relações**: é complicação de [diabetes mellitus, fora do escopo
  direto da AS1]; é avaliado por [1 Avaliação da Função Renal]. Omitida
  a relação com [6 Hipertensão Arterial Secundária]: doença renal
  diabética e HAS secundária são categorias diagnósticas distintas (uma
  é complicação de diabetes, a outra é um diagnóstico diferencial de
  hipertensão) que podem coexistir no mesmo paciente e compartilhar
  escolha de anti-hipertensivo, mas isso é uma nota de manejo clínico
  pontual, não uma relação taxonômica estável entre os dois conceitos —
  registrar "modifica a conduta de" sugeria uma hierarquia que não existe

### 8. Hemograma
- **Sinônimos**: eritrograma, leucograma, plaquetograma, CBC
- **Área principal**: Hematologia
- **Tipo**: exame
- **Relações**: é pré-requisito de [9 Abordagem da Anemia]; é avaliado por [contagem automatizada, esfregaço]

### 9. Abordagem da Anemia
- **Sinônimos**: investigação da anemia, algoritmo VCM/IPR
- **Área principal**: Hematologia
- **Tipo**: tema integrador (método diagnóstico, não doença)
- **Componentes**: [10 Anemia Ferropriva], [11 Anemia Macrocítica], anemia de doença crônica, anemia hemolítica (as duas últimas fora dos 21 mas parte do mesmo algoritmo)
- **Relações**: é pré-requisito de [10 Anemia Ferropriva]; é pré-requisito de [11 Anemia Macrocítica]; é avaliado por [8 Hemograma]

### 10. Anemia Ferropriva
- **Sinônimos**: anemia por deficiência de ferro, IDA
- **Área principal**: Hematologia
- **Tipo**: doença
- **Relações**: é tratado com [reposição de ferro oral/IV]; faz
  diagnóstico diferencial com [11 Anemia Macrocítica] (raro coexistirem
  e mascarar VCM). A relação com [9 Abordagem da Anemia] já está
  registrada em 9 como "componente de" — omitida aqui a relação
  inversa "é achado de", que descrevia um diagnóstico como resultado de
  um método de forma imprecisa

### 11. Anemia Macrocítica
- **Sinônimos**: anemia megaloblástica, deficiência de B12/folato
- **Área principal**: Hematologia
- **Tipo**: doença
- **Componentes**: deficiência de B12, deficiência de folato, causas não-megaloblásticas (hipotireoidismo, hepatopatia, álcool — presentes só em tabela no material atual, não desenvolvidas)
- **Relações**: pode causar [degeneração combinada subaguda da medula
  — só na deficiência de B12]; faz diagnóstico diferencial com [10
  Anemia Ferropriva]. Mesma nota de 10: relação com [9 Abordagem da
  Anemia] já registrada em 9 como "componente de"; "é achado de" omitida
  aqui pelo mesmo motivo

### 12. Diagnóstico Diferencial da Dispneia
- **Sinônimos**: falta de ar, dispneia aguda/crônica
- **Área principal**: Pneumologia · **Relacionadas**: Cardiologia (congestão), Hematologia (anemia como causa)
- **Tipo**: sintoma/sinal / tema integrador de diagnóstico diferencial
- **Relações**: faz diagnóstico diferencial com [13 Dor Torácica]; faz diagnóstico diferencial com [15 Asma]; é achado de [20 Insuficiência Cardíaca]; é causa de nenhum (é sintoma, não doença); pode causar [investigação com BNP, D-dímero, gasometria]; compartilha mecanismo com [11 Anemia Macrocítica]/[10 Anemia Ferropriva] (anemia como causa de dispneia por queda de transporte de O2)

### 13. Diagnóstico Diferencial da Dor Torácica
- **Sinônimos**: precordialgia, dor torácica aguda
- **Área principal**: Pneumologia · **Relacionadas**: Cardiologia (isquemia, pericardite), Medicina de Emergência
- **Tipo**: sintoma/sinal
- **Relações**: faz diagnóstico diferencial com [12 Dispneia]; é achado de [19 Endocardite Infecciosa] (raro), [21 Cardiomiopatias]

### 14. Diagnóstico Diferencial da Tosse e Hemoptise
- **Sinônimos**: tosse crônica, hemoptise
- **Área principal**: Pneumologia
- **Tipo**: sintoma/sinal
- **Relações**: faz diagnóstico diferencial com [15 Asma]; é achado de [17 Valvopatias Aórtica e Pulmonar]/[18 Valvopatias Mitral e Tricúspide] (hemoptise por congestão em estenose mitral, por exemplo)

### 15. Asma
- **Sinônimos**: asma brônquica, doença reativa das vias aéreas
- **Área principal**: Pneumologia
- **Tipo**: doença
- **Relações**: faz diagnóstico diferencial com [12 Dispneia], [14 Tosse e Hemoptise]; é avaliado por [espirometria]; é tratado com [broncodilatador, corticoide inalatório — fora do escopo atual do material do banco, que só cobre semiologia]

### 16. Semiologia Cardíaca
- **Sinônimos**: exame físico cardiovascular, ausculta cardíaca, propedêutica cardiovascular
- **Área principal**: Cardiologia
- **Tipo**: exame / mecanismo
- **Componentes**: ausculta, palpação, inspeção
- **Relações**: é pré-requisito de [17 Valvopatias Aórtica e Pulmonar]; é pré-requisito de [18 Valvopatias Mitral e Tricúspide]; é pré-requisito de [19 Endocardite Infecciosa]; é pré-requisito de [20 Insuficiência Cardíaca]. Removida a relação "é avaliado por [ausculta, palpação, inspeção]": essas técnicas são componentes da própria semiologia cardíaca, não um método externo que a avalia — movidas para "Componentes" acima

### 17. Valvopatias Aórtica e Pulmonar
- **Sinônimos**: estenose aórtica, insuficiência aórtica, valvopatia pulmonar
- **Área principal**: Cardiologia
- **Tipo**: doença
- **Relações**: é causa de [20 Insuficiência Cardíaca]; é complicação
  de [febre reumática — não é um dos 21, mas é pré-requisito causal
  encontrado no acervo]; faz diagnóstico diferencial com [18 Valvopatias
  Mitral e Tricúspide]. Omitida a relação inversa "é achado de [16
  Semiologia Cardíaca]" — o conceito 16 já declara, na direção correta,
  "é pré-requisito de [17]"

### 18. Valvopatias Mitral e Tricúspide
- **Sinônimos**: estenose mitral, insuficiência mitral, valvopatia tricúspide
- **Área principal**: Cardiologia
- **Tipo**: doença
- **Relações**: é causa de [20 Insuficiência Cardíaca]; é complicação
  de [febre reumática — fora dos 21]; faz diagnóstico diferencial com
  [17 Valvopatias Aórtica e Pulmonar]; pode causar [14 Tosse e
  Hemoptise] (congestão pulmonar por estenose mitral). Omitida a
  relação inversa "é achado de [16 Semiologia Cardíaca]" — mesma
  justificativa do conceito 17

### 19. Endocardite Infecciosa
- **Sinônimos**: EI, endocardite bacteriana
- **Área principal**: Cardiologia (**no banco está registrada sob
  Infectologia** — classificação legítima, já que endocardite é tema de
  Infectologia e se relaciona com Cardiologia; o modelo de associação
  única do banco só não permite marcar as duas ao mesmo tempo — ver
  relatório de inventário)
- **Tipo**: doença
- **Relações**: é complicação de [17/18 Valvopatias — valva danificada
  predispõe]; é causa de [20 Insuficiência Cardíaca]; faz diagnóstico
  diferencial com [febre reumática, endocardite trombótica não
  bacteriana, endocardite de Libman-Sacks — fora dos 21]; é tratado com
  [antibioticoterapia prolongada, cirurgia valvar]. Omitida a relação
  inversa "é achado de [16 Semiologia Cardíaca] (sopro novo)" — mesma
  justificativa do conceito 17

### 20. Insuficiência Cardíaca
- **Sinônimos**: IC, ICFEr, ICFEp
- **Área principal**: Cardiologia
- **Tipo**: síndrome
- **Relações**: é complicação de [17 Valvopatias Aórtica e Pulmonar],
  [18 Valvopatias Mitral e Tricúspide], [19 Endocardite Infecciosa],
  [21 Cardiomiopatias]; é causa de [12 Dispneia] (ortopneia, DPN); é
  avaliado por [BNP, ecocardiograma]. Omitida a relação inversa "é
  achado de [16 Semiologia Cardíaca]" — mesma justificativa do conceito 17

### 21. Cardiomiopatias
- **Sinônimos**: cardiomiopatia dilatada, hipertrófica, restritiva
- **Área principal**: Cardiologia
- **Tipo**: doença
- **Componentes**: cardiomiopatia dilatada, hipertrófica (única com material candidato no acervo), restritiva
- **Relações**: é causa de [20 Insuficiência Cardíaca]; faz diagnóstico
  diferencial com [17/18 Valvopatias] (sopros podem confundir). Omitida
  a relação inversa "é achado de [16 Semiologia Cardíaca]" — mesma
  justificativa do conceito 17

## Sobreposições e duplicações identificadas na taxonomia

- **9 (Abordagem da Anemia) não é uma doença** — é um método. Modelá-lo
  como "tema integrador" evita a tentação de escrever mais um material
  redundante com 10 e 11; o material do banco já trata os três como uma
  única cadeia de raciocínio (VCM×IPR → causa específica → conduta), o
  que é cientificamente correto e deveria ser preservado na produção
  futura, não desfeito em 3 materiais separados.
- **6 (HAS Secundária) tem sobreposição de nome, não de escopo**, com o
  material já publicado "Hipertensão Arterial, SRAA e
  Anti-hipertensivos" — esse material é sobre HAS primária/farmacologia;
  produzir o tema 6 exige conteúdo específico (investigação de causas
  secundárias), não uma cópia/expansão superficial do material
  existente.
- **17/18 (Valvopatias) e 19 (Endocardite)** compartilham pré-requisito
  comum (16 — Semiologia Cardíaca) e mecanismo causal comum (febre
  reumática como causa de valvopatia, que predispõe a endocardite) —
  produzir esses três juntos, na mesma onda, tem sinergia real de
  pesquisa, não é redundância.
- **15 (Asma) e 14 (Tosse/Hemoptise)** dividem o mesmo material-mãe no
  banco ("Síndromes Bronco-Pleuro-Pulmonares") só para Asma, mas Tosse/
  Hemoptise tem seu próprio banco de questões separado — são objetivos
  distintos da prova que não devem ser fundidos em um único material,
  mesmo compartilhando semiologia respiratória de base.

## Modelo da coleção curricular

```
Coleção: AS1 — Saúde do Adulto 1
data_prova: 2026-09-21
areas: [Nefrologia, Hematologia, Pneumologia, Cardiologia]
objetivos: 21 (listados nesta taxonomia, IDs 1-21)

conceitos_associados: [1..21] (esta taxonomia)

cobertura_atual:
  A: 0
  B: 9   # 1, 3, 8, 9, 10, 11, 12, 16, 19
  C: 8   # 4, 6, 14, 15, 17, 18, 20, 21   (17 com nota de cautela — ver inventário)
  D: 4   # 2, 5, 7, 13
  NV: 0

materiais_associados:
  - banco: ["Avaliação da Função Renal", "Hematologia Clínica — Hemograma e Anemias",
            "Hipertensão Arterial, SRAA e Anti-hipertensivos", "Semiologia Cardíaca",
            "Síndromes Bronco-Pleuro-Pulmonares"]
  - acervo_nao_publicado: ["Equilíbrio Ácido-Base.pdf", "dispneia-diagnostico-diferencial.docx",
            "Endocardite Infecciosa.docx", "estudo-valvopatia-aortica-mista.html (não lido na íntegra)"]

lacunas: [2, 5, 7, 13]

ordem_recomendada_producao: ver "Ondas de produção" abaixo
```

A coleção **não duplica** nenhum material — ela só referencia os
caminhos acima (banco por título, acervo por caminho relativo). Nenhum
conteúdo foi copiado para dentro deste documento além de trechos
citados como evidência no relatório de inventário.

## Ondas de produção

Ordem aprovada pela diretoria (complemento AS1-A.1): a reconciliação
das duplicatas prováveis não é um bloqueio global — cada onda
reconcilia apenas os arquivos diretamente relacionados aos temas que
produz.

| Onda | Temas | Por quê nesta ordem | Reconciliação local desta onda | Esforço estimado | Risco científico | Pode rodar em paralelo com |
|---|---|---|---|---|---|---|
| **1 — Primeira onda editorial** | 3, 12, 19 | Conteúdo já excelente e completo fora do banco; falta só Gates 7-9 (auditoria científica formal + HTML) | Duplicata 3 (Endocardite — DOCX "em revisão" vs. `Caso 3 - Endocardite Infecciosa.pdf` + anotações), só antes de fechar o tema 19; 3 e 12 sem duplicata | Médio (auditoria, não pesquisa nova) | Baixo (conteúdo já denso, risco é só de auditoria superficial) | Onda 2 |
| **2 — Segunda onda: auditoria dos materiais que cobrem 1, 8, 9, 10, 11 e 16** | 1, 8, 9, 10, 11, 16 | Já publicado no banco, mas sem auditoria formal; decisão de fazer antes/depois da prova é da diretoria | Duplicata 1 (Avaliação da Função Renal), só antes de fechar o tema 1; duplicata 2 (Semiologia Cardíaca), só antes de fechar o tema 16; 8, 9, 10, 11 sem duplicata | Médio | Médio (publicado sem attestação — risco reputacional se erro for encontrado depois da prova) | Onda 1 |
| **3 — Temas C restantes: produção nova apoiada em fragmentos** | 4, 6, 14, 15, 17, 18, 20, 21 | Há questões, seções curtas ou candidatos parciais; produção "do zero" aqui na verdade é "complementar o que existe" | Duplicata 4 (semiologia respiratória), só antes de produzir o tema 15; demais temas desta onda sem duplicata | Alto (redação nova, mas com apoio) | Médio (17 e 19 têm pré-requisito comum, produzir junto reduz risco de inconsistência) | Onda 4, parcialmente |
| **4 — Temas D: produção do zero** | 2, 5, 7, 13 | Nenhum atalho de aproveitamento encontrado | Nenhuma (sem candidato no acervo/banco) | Alto | Alto (sem nenhuma base prévia para conferir consistência) | Onda 3 |

Notas de sequenciamento explícitas pedidas pela missão:

- **Pode seguir para revisão** (já publicado, só falta auditoria):
  1, 8, 9, 10, 11, 16.
- **Precisa ser complementado** (existe fragmento no banco ou acervo,
  mas não fecha o objetivo): 4, 6, 14, 15, 17, 18, 20, 21.
- **Precisa ser produzido do zero**: 2, 5, 7, 13.
- **Depende de outro tema** (ordem importa): 6 depende de 1
  (função renal é pré-requisito de investigar HAS secundária); 7
  depende de 1; 17/18/19/20/21 dependem de 16 (semiologia cardíaca);
  9 depende de 8; 10/11 dependem de 9.
- **Pode ser desenvolvido em paralelo sem conflito**: as 4 áreas entre
  si não competem por nenhum material comum (Nefrologia, Hematologia,
  Pneumologia e Cardiologia não compartilham pré-requisitos diretos
  nesta prova) — exceto o uso cruzado de "Anemia" como causa de
  "Dispneia" (12), que é só uma citação cruzada, não uma dependência de
  produção.

## Pontos que exigem decisão da diretoria

1. Rodar auditoria científica formal (Gates 7-8) nos 5 materiais já
   publicados antes da prova de 21/09, ou aceitar o risco e revisar
   depois?
2. Ampliar a associação disciplina↔questão no banco para permitir mais
   de uma disciplina relacionada (ex.: Endocardite em Infectologia +
   relação com Cardiologia; Sódio/Água em Fisiologia + relação com
   Nefrologia; HAS/SRAA em Farmacologia + relação com
   Nefrologia/Cardiologia), de modo a tornar essas questões
   descobríveis pela coleção AS1 sem mudar a disciplina primária —
   antes ou depois de produzir os materiais que faltam? Esta missão não
   alterou o banco nem implementou esse modelo — é decisão e execução
   futuras (ver item 7 do complemento AS1-A.1).
3. Qual dos pares de "duplicata provável" deve virar o material oficial
   e qual deve ser arquivado/legado — decisão editorial, não técnica.
4. Aceitar DOCX/PDF como fonte de pesquisa e só converter para HTML no
   Gate 9, ou já produzir direto em HTML para os temas da Onda 1 (que
   já têm conteúdo pronto)?
5. Dado o prazo de 4 dias até a prova (21/09), qual das 4 ondas a
   diretoria prioriza primeiro — a mais rápida (Onda 1, conteúdo já
   pronto) ou a de maior lacuna (Onda 4, sem nenhum atalho)?
