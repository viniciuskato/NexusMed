# Auditoria científica — Equilíbrio Ácido-Base (AS1, Tema 3)

Missão: AS1-B1. Sessão executiva editorial, somente leitura sobre o PDF de
origem. Ver texto integral da missão em
[`docs/diretoria/prompts/AS1-B1.txt`](../../../archive/diretoria/prompts/AS1-B1.txt).

## Identificação do material

- **Arquivo**: `C:\Users\vinic\OneDrive\Estudos\Base de Estudos\Biblioteca\Medicina\Nefrologia\Fisiologia\Equilíbrio Ácido-Base.pdf`
- **SHA-256**: `781757F12DC9ADDF96E0AFF606C4A81E95B724AD5C33196FCD3DFC416B64B9B8`
- **Tamanho**: 288.236 bytes
- **Data de criação/modificação do arquivo (filesystem)**: 01/09/2026 10:50:37
- **Metadados internos do PDF**: `CreationDate`/`ModDate` = 2026-08-21T11:27:16Z;
  `Producer` = Skia/PDF m141; `Creator` = Chrome headless (impressão para PDF
  a partir de HTML) — confirma que o material foi gerado digitalmente, sem
  digitalização/scan.
- **Páginas**: 18 (confirmado por `pypdf`/PyMuPDF e por inspeção visual
  página a página).
- **Título interno**: "Equilíbrio Ácido-Base".
- **Origem declarada no próprio material**: aula de Nefrologia, PUCPR,
  docente Liz Y. Saguti, 21/08/2026, complementada com "pesquisa ativa" —
  o material já se autodeclara híbrido (conteúdo de aula + acréscimos de
  pesquisa), com marcação visual distinta para cada origem (`AULA` vs. caixa
  bege "Acréscimo de pesquisa").
- **Elementos estruturais**: 13 seções numeradas, ~20 tabelas, 3 fórmulas
  em destaque (Henderson-Hasselbalch, Winters, ânion-gap/ânion-gap
  corrigido/delta ratio), 5 casos clínicos com gasometria completa e
  resolução passo a passo, lista de referências dividida em "fontes
  indicadas na aula" (9 itens) e "acréscimos de pesquisa ativa" (12 itens).
  Nenhuma imagem, figura ou exame de imagem — todo o conteúdo visual é
  tabela ou texto.

## Resumo executivo

*Auditoria iniciada em 17/09/2026 e complementada em 18/09/2026 (AS1-B1.1),
com a verificação da publicação primária do BICARICU-2 e o ajuste de
clareza do parecer final descritos adiante.*

O material é um documento de texto corrido bem estruturado, gerado a
partir de slides de aula e ampliado com pesquisa bibliográfica ativa
explicitamente sinalizada. As 18 páginas foram renderizadas e inspecionadas
visualmente uma a uma: não há cortes, sobreposições, caracteres corrompidos,
tabelas quebradas ou conteúdo truncado — a extração de texto corresponde
integralmente ao que aparece na renderização visual, sem elementos ocultos
ou notas fora da extração.

O núcleo fisiológico (conceitos, Henderson-Hasselbalch, fórmulas de
compensação, ânion-gap, delta ratio) está correto e consistente com a
literatura consultada nesta auditoria. Os cinco casos clínicos foram
recalculados de forma independente e todos os cálculos batem exatamente com
o que o material apresenta. As referências de pesquisa ativa mais centrais —
incluindo o estudo SODa-BIC (2026), citado como não coberto pela aula — são
reais, existem no PubMed, e os números citados (percentuais, RR, IC95%, p)
conferem exatamente com o resumo oficial do artigo.

Foram identificadas divergências pontuais que não invalidam o núcleo
científico, mas precisam de correção antes da conversão: (1) o material
atribui a um subgrupo do BICAR-ICU a classificação de estadiamento "KDIGO 2
e 3", quando o ensaio original estratificou por escore AKIN, não KDIGO —
são sistemas de estadiamento diferentes; (2) a referência a "Androgué,
Gennari, Galla, Nicolaos" no material troca o sobrenome do quarto autor
(o correto é Madias, N. E. — "Nicolaos" é o primeiro nome, não o
sobrenome) e essa referência nunca é citada no corpo do texto (referência
órfã); (3) a referência "SBN, 2024" ao Guia de Assistência Nefrológica
Hospitalar tem o conteúdo citado integralmente confirmado, mas a
publicação indexada saiu em 2025 (J Bras Nefrol. 2025;47(3):e20240239),
não em 2024 como consta na lista de referências; (4) a referência "Wilkins
RL et al., 2010" para a tabela de valores normais de gasometria não pôde
ser verificada — não há título, e não foi possível localizá-la com
segurança nas ferramentas disponíveis nesta sessão; (5) os quatro
livros-texto "indicados na aula" (Johnson, Moura, Riella, Gomes) e mais
dois artigos de revisão em português (Badr & Nightingale; Rocco) estão
listados na bibliografia mas não são citados pontualmente em nenhum trecho
do corpo do texto — são referências de leitura geral da aula, não citações
por afirmação, o que diverge do padrão de rastreabilidade exigido para
conversão ao NexusMed (Gate 6 do PADRAO-TUTORIAL.md).

Nenhuma dessas divergências invalida os cálculos, as fórmulas ou as
condutas centrais do material. São, na sua maioria, problemas de precisão
bibliográfica e de rastreabilidade por afirmação — corrigíveis sem nova
pesquisa de fundo, exceto o item da doença tubular renal referenciada
adiante.

## Cobertura

O material cobre integralmente os objetivos que ele mesmo declara (seção
"Objetivos deste material", p. 1):

| Objetivo declarado | Cobertura no material |
|---|---|
| Visão geral sobre gasometria arterial e venosa | Seção 1 (p. 2) |
| Visão geral sobre o equilíbrio ácido-básico | Seções 2–4 (p. 2–4) |
| Diagnóstico dos quatro distúrbios primários pela gasometria | Seções 7–8 (p. 5–10) |
| Compreensão dos mecanismos-tampão e compensatórios | Seções 4–5 (p. 3–5) |
| Tratamento geral da acidose metabólica | Seção 8.1 "Tratamento" (p. 6–8) |

Cobertura adicional além dos objetivos declarados: ânion-gap e correção
pela albumina, delta ratio, matriz-resumo de fórmulas, síntese e 20
referências. Para o escopo de uma prova de Saúde do Adulto 1 sobre
distúrbio acidobásico, a cobertura de conteúdo é ampla e alinhada ao que a
AS1-A classificou como "cobertura B".

## Matriz de evidências

Situações: **verificado** (fonte aberta e sustenta exatamente a redação),
**parcialmente verificado** (fonte aberta, sustenta o núcleo mas com
diferença de detalhe/terminologia), **não verificado** (fonte não
localizada com segurança pelas ferramentas desta sessão), **divergente**
(fonte aberta e diverge do que o material afirma).

| ID | Objetivo/pergunta | Afirmação do material | Local no PDF | Fonte citada | Fonte verificada | Aplicabilidade | Situação | Ação necessária |
|---|---|---|---|---|---|---|---|---|
| E01 | Abordagem fisiológica em 3 passos | "Abordagem fisiológica clássica... descrita em detalhe por Berend et al. (2014)" | p. 5 | Berend K, de Vries APJ, Gans ROB. N Engl J Med. 2014;371(15):1434-45 | PubMed PMID 25295502, DOI 10.1056/NEJMra1003327 — título, autores, volume, páginas e ano conferem exatamente | Revisão de referência, ainda amplamente citada | verificado | nenhuma |
| E02 | Ânion-gap corrigido pela albumina | "Fórmula... fonte: Seifter JL. N Engl J Med. 2014;371(19):1821-31" | p. 11 | Seifter JL. N Engl J Med. 2014;371(19):1821-31 | PubMed PMID 25372090, DOI 10.1056/NEJMra1215672 — conferido | Revisão de referência sobre distúrbios ácido-base/eletrolíticos | verificado | nenhuma |
| E03 | Origem das 4 regras de compensação (tabelas de bolso) | "seguem a tradição das 'regras de bolso' descritas originalmente por Narins & Emmett em 1980" | p. 10 | Narins RG, Emmett M. Medicine (Baltimore). 1980;59(3):161-87 | PubMed PMID 6774200, DOI 10.1097/00005792-198005000-00001 — título, autores, ano, páginas conferem; abstract confirma que o artigo de fato apresenta fórmulas de compensação esperada | Artigo fundacional, ainda citado como referência primária dessas regras | verificado | nenhuma |
| E04 | Fórmula de Winters (compensação da acidose metabólica) | "pCO2 esperada = 1,5 × HCO3⁻ + 8 (± 2)" | p. 6 | Não citada explicitamente junto à fórmula (aparece na lista de referências como Albert, Dell, Winters 1967) | PubMed PMID 6016545, DOI 10.7326/0003-4819-66-2-312 — artigo existe, é o trabalho original de Winters sobre deslocamento quantitativo do equilíbrio ácido-base na acidose metabólica | Fundamento clássico da fórmula, consistente com a literatura de nefrologia clínica | parcialmente verificado | adicionar `fonte:` explícito junto à fórmula, já que a referência existe na lista mas não está amarrada ao trecho (Gate 6 do PADRAO-TUTORIAL exige citação imediatamente após a afirmação) |
| E05 | BICAR-ICU (2018) — desenho, população, desfecho primário | "ensaio multicêntrico... pH ≤ 7,2... Não houve diferença significativa na mortalidade em 28 dias... mas uma análise pré-especificada mostrou redução da mortalidade e da necessidade de TRS no subgrupo com IRA **KDIGO** 2 e 3" | p. 7 | Jaber S, et al. Lancet. 2018;392(10141):31-40 | PubMed PMID 29910040, DOI 10.1016/S0140-6736(18)31080-8 — artigo real, abstract obtido | Ensaio francês, UTI, acidemia grave | **divergente** | o ensaio original estratificou por **escore AKIN** (Acute Kidney Injury Network), não por estadiamento KDIGO — são classificações diferentes (ainda que semelhantes em espírito). O desfecho primário do BICAR-ICU também é um **composto** (óbito OU falência orgânica em D7), não "mortalidade" isolada como o texto sugere na primeira frase; a diferença de sobrevida por Kaplan-Meier na população geral teve p=0,09 (não significativa), e o benefício estatisticamente significativo (p=0,0283) aparece só no estrato AKIN 2–3. Corrigir "KDIGO 2 e 3" para "AKIN 2 e 3" e precisar que o desfecho primário é composto |
| E06 | Meta-análise BICAR-ICU + BICAR-ICU2 (2026) | Números de mortalidade em 90 dias (58,3% vs. 60,6%; RR 0,96; IC95% 0,86–1,07; p=0,51), TRS (34,8% vs. 50,7%; RR 0,69; IC95% 0,60–0,79; p<0,001; NNT=6,3), subgrupo pH≤7,10 (RR 0,80; IC95% 0,68–0,93; p=0,004), subgrupo pH>7,10 (RR 1,05; p=0,47) | p. 7 | Fosset M, et al. Crit Care. 2026;30(1). DOI 10.1186/s13054-026-06206-3 | PubMed PMID 42472834 — abstract obtido na íntegra; **todos** os números acima conferem exatamente com o abstract oficial, inclusive N (1.016 pacientes, 509/507) | Meta-análise de dados individuais dos dois ensaios BICAR | **verificado** — a citação mais precisa e mais bem sustentada de todo o material | nenhuma |
| E07 | Existência e resultado do BICAR-ICU2 (BICARICU-2) como ensaio independente | Tratado implicitamente como um segundo ensaio já concluído, cujos dados entraram na meta-análise de 2026 | p. 7 | citado apenas via a meta-análise (Fosset et al.) na versão original do material | Jung B, et al.; BICARICU-2 Study Group. Sodium Bicarbonate for Severe Metabolic Acidemia and Acute Kidney Injury: The BICARICU-2 Randomized Clinical Trial. JAMA. 2025;334(22):2000-2010. PMID 41159812, DOI 10.1001/jama.2025.20231 — publicação primária localizada e aberta nesta complementação (AS1-B1.1). Abstract oficial confere exatamente: 640 randomizados, 627 analisados (313 controle/314 bicarbonato), 43 UTIs francesas, acidemia grave (pH ≤7,20) com IRA moderada a grave; mortalidade em 90 dias 62,1% (bicarbonato) vs. 61,7% (controle), diferença 0,4 ponto percentual, IC95% −7,2 a 8,0, p=0,91; terapia renal substitutiva 35% vs. 50%, diferença −15,5 pontos percentuais, IC95% −23,1 a −7,8 | Ensaio francês, ICU, acidemia grave com IRA — a mesma população de continuidade do BICAR-ICU original, cujos dados individuais alimentam a meta-análise de Fosset et al. 2026 | **verificado** | nenhuma — a AS1-B2 deve citar a publicação primária do BICARICU-2 junto da meta-análise (Fosset et al.), preservando a distinção entre ausência de efeito na mortalidade (E07) e a redução expressiva no uso de terapia renal substitutiva |
| E08 | SODa-BIC (2026) — desenho, população, desfecho primário e resultado | "estudo multinacional (55 UTIs, 7 países, 500 pacientes)... pH < 7,30... Não houve diferença no desfecho primário (40,2% vs. 39,4%; diferença ajustada 1,2 pontos percentuais; IC95% −7,1 a 9,4; p=0,78), nem na mortalidade hospitalar (25,4% vs. 24,0%) nem no uso de TRS (16,8% vs. 20,9%)" | p. 7 | Serpa Neto A, et al. (SODa-BIC investigators). N Engl J Med. 2026. DOI 10.1056/NEJMoa2600526 | PubMed PMID 42283370 — abstract oficial obtido; **todos** os números conferem exatamente, incluindo 55 UTIs/7 países/500 pacientes (245 vs. 255 randomizados), MAKE30 40,2% vs. 39,4% com IC95% −7,1 a 9,4 e p=0,78, mortalidade hospitalar 25,4% vs. 24,0%, TRS 16,8% vs. 20,9% | Pacientes graves com acidose metabólica em vasopressor, 2026, publicação recente na NEJM | **verificado** — a citação mais sensível da missão (estudo "não coberto pela aula", risco de fabricação) é real e citada com exatidão | nenhuma |
| E09 | Ânion-gap — valor de referência e divergência de fonte | "aula cita 10–12 mEq/L... StatPearls cita tipicamente 8–12 mEq/L" | p. 11 | StatPearls. Anion Gap and Non-Anion Gap Metabolic Acidosis | NCBI Bookshelf, capítulo confirmado em https://www.ncbi.nlm.nih.gov/books/NBK448090/ (localizado por busca) — título bate exatamente com a referência do material | Referência de bolso amplamente usada | verificado (existência do capítulo); intervalo numérico exato "8–12" não conferido linha a linha por falta de acesso ao texto completo do capítulo nesta sessão | opcional: abrir o capítulo completo do StatPearls para citar o intervalo com precisão de frase, se a citação for reaproveitada no material corrigido |
| E10 | Fisiologia da carga ácida diária / 3 fases de defesa | "fonte: Hopkins E, Sanvictores T, Sharma S. Physiology, Acid Base Balance. StatPearls" | p. 3–4 | StatPearls, "Physiology, Acid Base Balance" | Capítulo confirmado (NCBI Bookshelf NBK507807, também indexado no PubMed sob PMID 29939584) — título e autores conferem | Fisiologia básica, fundamento estável | verificado (existência); conteúdo detalhado do capítulo não comparado frase a frase nesta sessão | nenhuma obrigatória |
| E11 | Gasometria arterial vs. venosa | "fonte: Castro D, Patil SM, Zubair M, Keenaghan M. Arterial Blood Gas. StatPearls" | p. 2 | StatPearls, "Arterial Blood Gas" | Capítulo confirmado (NCBI Bookshelf NBK536919), autores Castro/Patil/Zubair/Keenaghan conferem exatamente | Fisiologia/técnica de coleta, fundamento estável | verificado (existência); conteúdo detalhado não comparado frase a frase | nenhuma obrigatória |
| E12 | Indicações de hemodiálise / limiar de bicarbonato na acidose isolada | "Guia de Assistência Nefrológica Hospitalar (2024) da SBN... limiar... pH < 7,2, sobretudo com HCO3⁻ < 15 mEq/L... hipercalemia... 'principal emergência nefrológica'" | p. 8 | Sociedade Brasileira de Nefrologia. Guia de Assistência Nefrológica Hospitalar. SBN, 2024 | Publicação localizada: Younes-Ibrahim M, et al. J Bras Nefrol. 2025;47(3):e20240239, DOI 10.1590/2175-8239-JBN-2024-0239en (PubMed PMID 40446173, texto completo em PMC12124864). **Todas** as afirmações de conteúdo citadas pelo material foram confirmadas literalmente no texto do guia: indicações clássicas de TRS (acidose, distúrbios eletrolíticos, intoxicação, sobrecarga hídrica, uremia), hipercalemia como "main nephrological emergency" tratada com gluconato de cálcio/glicoinsulinoterapia/beta-2-agonistas/bicarbonato antes de diálise, e o limiar exato "pH < 7.2, particularly ... bicarbonate level of less than 15 mEq/L, and no evidence of hypervolemia" | Diretriz nacional vigente | **parcialmente verificado** — conteúdo 100% confirmado, mas o ano de publicação indexado é **2025**, não 2024; o identificador do artigo (`JBN-2024-0239`) sugere submissão em 2024, o que pode explicar a data usada pela aula/material, mas a citação bibliográfica formal deveria registrar 2025 (ou "submetido 2024, publicado 2025") | corrigir o ano da referência para 2025 (ou explicitar a dualidade submissão/publicação) antes da conversão |
| E13 | Escala pH × [H+] (tabela da p. 4) | Valores de 6,8→158 nmol/L até 7,8→15 nmol/L | p. 4 | Fórmula geral (não referência externa) | Recalculado de forma independente com [H+](nmol/L) = 10^(9−pH): 6,8→158,5; 6,9→125,9; 7,0→100,0; 7,1→79,4; 7,2→63,1; 7,3→50,1; 7,4→39,8; 7,5→31,6; 7,6→25,1; 7,7→20,0; 7,8→15,8 — todos os valores do material batem (arredondamento para inteiro) | Relação matemática universal (não depende de população) | verificado | nenhuma |
| E14 | Fórmula "[H+] (nmol/L) = 24 × pCO2 / HCO3⁻" | Apresentada como forma alternativa da equação de Henderson-Hasselbalch | p. 4 | Fórmula (não referenciada externamente) | Confere com a aproximação clínica padrão derivada da equação de Henderson (constante 24 é a aproximação de 10^(pKa-3) com pKa=6,1 e coeficiente de solubilidade 0,03); consistente com o uso didático amplamente replicado na nefrologia clínica | Válida como aproximação de bolso, não como identidade termodinâmica exata | verificado | nenhuma |
| E15 | Referência a Androgué/Gennari/Galla/Nicolaos, Kidney International 2009 | Listada na bibliografia ("fontes indicadas na aula"), nunca citada com `fonte:` no corpo | p. 18 (referências) | Adrogué HJ, Gennari FJ, Galla JH, **Madias** NE. Kidney Int. 2009;76(12):1239-47 | PubMed PMID 19812535, DOI 10.1038/ki.2009.359 — artigo real e correspondente ao tema (três abordagens de avaliação ácido-base) | Revisão de referência | **divergente** (na grafia) + referência órfã | o material grafa o quarto autor como "NICOLAOS, E. M." — mas Nicolaos é o **primeiro nome** do autor; o sobrenome correto é **Madias**. Corrigir a entrada bibliográfica e, se a referência for mantida, amarrá-la a uma afirmação específica no corpo (não deixá-la órfã) |
| E16 | Tabela de valores normais da gasometria (pH, pCO2, pO2, HCO3⁻, BE) | "fonte: Wilkins RL et al., 2010" | p. 5 | Wilkins, Robert L. et al., 2010 | **Não localizada** — a referência não traz título, o que impede busca confiável no PubMed/web nesta sessão; há candidatos plausíveis (ex.: manuais de terapia respiratória de R. L. Wilkins), mas nenhuma correspondência foi confirmada com segurança | Valores de referência padrão de gasometria (tema estável, baixo risco clínico mesmo se a fonte for imprecisa) | **não verificado** | antes da conversão, obter o título completo da obra citada na aula original (provavelmente um capítulo/livro de fisiologia respiratória) ou substituir por uma fonte primária/diretriz verificável para os valores de referência |
| E17 | Livros-texto "indicados na aula" (Johnson; Moura & Alves; Riella; Gomes) e artigos em português (Badr & Nightingale; Rocco) | Listados na bibliografia, nunca citados pontualmente no corpo do texto | p. 18 (referências) | — | Não verificáveis com as ferramentas desta sessão (livros impressos, artigos não indexados no PubMed por serem nefrologia/terapia intensiva em periódicos nacionais de baixo índice) | Livros-texto de nefrologia amplamente adotados no Brasil; plausíveis como fundamento, mas não confirmados individualmente | **não verificado** | são referências de leitura geral da aula, não amarradas a afirmações — manter apenas como "leituras recomendadas" (Gate 4 do PADRAO-TUTORIAL) e não como citações por afirmação, a menos que uma sessão futura consiga verificá-las individualmente |

## Auditoria das referências (visão consolidada)

Total de referências listadas: **21** (9 "fontes indicadas na aula" + 12
"acréscimos de pesquisa ativa" — a lista de pesquisa ativa tem 12 itens
mesmo contando SODa-BIC, Fosset e Jaber como três entradas distintas).

- **Verificadas com abertura efetiva da fonte e conferência de conteúdo**:
  Berend 2014 (E01), Seifter 2014 (E02), Narins & Emmett 1980 (E03),
  Fosset et al. 2026 (E06), Jung et al. (BICARICU-2) 2025 (E07,
  verificado em AS1-B1.1), Serpa Neto et al. (SODa-BIC) 2026 (E08),
  Guia SBN — conteúdo (E12), Adrogué et al. 2009 — existência (E15).
- **Verificadas quanto à existência do capítulo/artigo, sem comparação
  linha a linha do conteúdo**: Albert/Dell/Winters 1967 (E04), StatPearls
  Anion Gap (E09), StatPearls Acid Base Physiology (E10), StatPearls
  Arterial Blood Gas (E11), Jaber et al. BICAR-ICU 2018 (E05, com
  divergência pontual documentada), KDIGO 2012 AKI Guideline (existência
  confirmada via busca web — Kidney Int Suppl. 2012;2:1-138 — mas seu uso
  no material é indireto, via a menção a "KDIGO 2 e 3" que na verdade
  descreve o estrato AKIN do BICAR-ICU; a divergência está registrada em
  E05).
- **Não verificadas**: Wilkins RL et al. 2010 (E16); os quatro
  livros-texto e dois artigos nacionais "indicados na aula" (E17).
- **Referências órfãs** (na lista, sem citação pontual no corpo):
  Adrogué/Gennari/Galla/Madias 2009, Badr & Nightingale 2007, Rocco 2003,
  e os quatro livros-texto — nenhum deles tem uma marca `fonte:` amarrada a
  uma afirmação específica do texto corrido, diferente do padrão seguido
  consistentemente pelos "acréscimos de pesquisa ativa". Isso é
  estruturalmente esperado, já que o material trata essa lista como
  "fontes indicadas na aula" (leitura de base), não como citações pontuais
  — mas diverge do padrão de citação por afirmação exigido pelo Gate 6 do
  PADRAO-TUTORIAL.md para o produto final do NexusMed.
- **Nenhuma referência duplicada** foi encontrada.
- **Nenhuma citação fabricada** foi encontrada: todo DOI/PMID conferido
  correspondeu a um artigo real, com título, autores e periódico
  compatíveis com o que o material declara. O caso mais sensível — SODa-BIC,
  citado como "ensaio novo, não coberto pela aula" — é o mais solidamente
  verificado de todos, inclusive nos números exatos de desfecho.

## Fórmulas e cálculos

Todas as fórmulas centrais foram conferidas quanto a unidades,
arredondamento e origem:

- **Henderson-Hasselbalch**: pH = 6,1 + log[HCO3⁻/(0,03×pCO2)] — pKa 6,1 e
  coeficiente de solubilidade do CO2 0,03 mmol/L/mmHg são os valores
  padrão da fisiologia respiratória; consistentes com a literatura.
- **Equação de Winters**: pCO2 esperada = 1,5×HCO3⁻ + 8 (±2) — unidades
  corretas (HCO3⁻ em mEq/L, pCO2 em mmHg); fundamento em Albert/Dell/Winters
  1967 (E04) e reproduzido por Narins & Emmett 1980 (E03, verificado).
- **Compensação da alcalose metabólica**: pCO2 esperada = HCO3⁻ + 15 (±2)
  — consistente com a "regra de bolso" clássica.
- **Compensação respiratória (aguda/crônica, acidose/alcalose)**: as
  quatro regras (↑10 mmHg pCO2 → ↑1/↑4 mEq/L HCO3⁻; ↓10 mmHg pCO2 →
  ↓2/↓5 mEq/L HCO3⁻) batem com os valores classicamente atribuídos a
  Narins & Emmett 1980, cuja fonte foi verificada (E03).
- **Ânion-gap**: AG = Na⁺ − (Cl⁻ + HCO3⁻), sem potássio — fórmula padrão;
  o material já sinaliza corretamente a divergência de intervalo de
  referência entre fontes (10–12 vs. 8–12 mEq/L) como uma questão de
  método laboratorial, não de erro.
- **Ânion-gap corrigido pela albumina**: AG corrigido = AG observado +
  2,5×(4,0 − albumina em g/dL) — fórmula padrão (Figge/Seifter),
  consistente com a fonte citada (E02, verificada).
- **Delta ratio**: (AG−12)/(24−HCO3⁻) — fórmula e pontos de corte (<1,
  1–2, >2) consistentes com o uso descrito no StatPearls (E09).
- **Tabela pH × [H+]** (p. 4): recalculada de forma independente nesta
  auditoria com [H+](nmol/L) = 10^(9−pH); todos os 11 valores da tabela
  conferem exatamente (E13).

Nenhum erro de unidade, de arredondamento ou de direção (sinal) foi
encontrado em nenhuma fórmula do material.

## Avaliação dos cinco casos clínicos

Todos os cinco casos foram recalculados de forma independente nesta
auditoria, sem usar a resolução impressa no material como ponto de
partida — apenas os valores brutos de gasometria e eletrólitos de cada
caso.

| Caso | Diagnóstico do material | Recalculo independente | Resultado |
|---|---|---|---|
| 1 — choque séptico, VM | Acidose metabólica (HCO3⁻ 6) + acidose respiratória sobreposta (pCO2 esperada 15–19, medida 36); AG = 18 (elevado) | pCO2 esperada = 1,5×6+8 = 17 (15–19); medida 36, fora da faixa → distúrbio misto confirmado. AG = 136−(112+6) = 18 → confere | **Confere integralmente** |
| 2 — diarreia, hipotensão | Acidose metabólica simples; pCO2 esperada 27–31, medida 30 (dentro); AG = 10 (normal) | pCO2 esperada = 1,5×14+8 = 29 (27–31); medida 30, dentro → simples confirmado. AG = 140−(116+14) = 10 → confere | **Confere integralmente** |
| 3 — vômitos, estenose pilórica | Alcalose metabólica simples; pCO2 esperada 49–53, medida 49 (dentro, no limite inferior) | pCO2 esperada = 36+15 = 51 (49–53); medida 49 → no limite inferior da faixa, ainda "dentro" — confirmado, embora seja o caso com menor margem de tolerância dos cinco | **Confere, com margem estreita** (ver observação abaixo) |
| 4 — DPOC ambulatorial | Acidose respiratória crônica simples; HCO3⁻ esperado 40, medido 40 | ↑40 mmHg de pCO2 = 4×↑10 mmHg; forma crônica → HCO3⁻ esperado = 24+4×4 = 40; medido 40 → confere | **Confere integralmente** |
| 5 — crise de ansiedade, tetania | Alcalose respiratória aguda + alcalose metabólica sobreposta; HCO3⁻ esperado 20, medido 26 (diferente) | ↓20 mmHg de pCO2 = 2×↓10 mmHg; forma aguda → HCO3⁻ esperado = 24−2×2 = 20; medido 26 ≠ 20 → distúrbio misto confirmado | **Confere integralmente** |

**Observação sobre o Caso 3**: a pCO2 medida (49 mmHg) cai exatamente no
limite inferior do intervalo esperado (49–53 mmHg), calculado a partir de
HCO3⁻ + 15 (±2) = 51 (±2). Matematicamente o caso está correto e a
classificação como "compensado" é defensável, mas por estar no próprio
limite da margem de tolerância (±2), este é o caso com menor folga entre
os cinco — vale nota explícita no material corrigido, para que o estudante
entenda que "dentro da faixa" nem sempre significa "no centro da faixa".
Isso não é um erro, é uma oportunidade de reforço didático.

Nenhuma inconsistência entre o diagnóstico apresentado nos casos e a
lógica de três passos da seção 7 foi encontrada. Os achados clínicos
associados a cada caso (hipercalemia no Caso 1, hipocalemia nos Casos 2 e
3, cloro baixo no Caso 3, tetania no Caso 5) são coerentes com a
fisiopatologia descrita nas seções teóricas correspondentes.

## Divergências

1. **BICAR-ICU — AKIN vs. KDIGO** (E05): o material atribui ao subgrupo de
   benefício do BICAR-ICU um estadiamento "KDIGO 2 e 3"; o ensaio original
   usou o escore AKIN. São sistemas de estadiamento de IRA distintos
   (ainda que com lógica semelhante). Correção obrigatória.
2. **Adrogué/Gennari/Galla/Madias — erro de sobrenome** (E15): "Nicolaos"
   é o primeiro nome do quarto autor (Madias, N. E.), não o sobrenome.
   Correção obrigatória (referência bibliográfica incorreta).
3. **Guia SBN — ano de publicação** (E12): citado como "SBN, 2024"; a
   publicação indexada (J Bras Nefrol) é de 2025. O conteúdo citado está
   100% correto — só o ano da referência precisa de ajuste ou
   esclarecimento (submissão 2024 / publicação 2025).
4. **Wilkins RL et al., 2010 — referência não localizável** (E16): sem
   título, não foi possível confirmar a existência exata da fonte nesta
   sessão. Os valores que ela sustenta (faixas normais de pH, pCO2, pO2,
   HCO3⁻, BE) são consenso amplamente replicado na literatura, então o
   risco clínico de manter os números é baixo — mas a citação, como está,
   não pode ser declarada "verificada".
5. **Referências órfãs** (E17): sete das 21 referências da lista
   (Adrogué 2009, Badr & Nightingale 2007, Rocco 2003, e os quatro
   livros-texto) nunca são amarradas a uma afirmação específica do corpo
   do texto com uma marca `fonte:`, ao contrário do padrão consistente
   usado nos "acréscimos de pesquisa ativa". Isso não é necessariamente um
   erro do material — ele mesmo rotula essas sete referências como
   "fontes indicadas na aula" (leitura de base, não citação pontual) — mas
   diverge do padrão de citação por afirmação do Gate 6 do
   PADRAO-TUTORIAL.md, que a versão convertida ao NexusMed precisará
   seguir.

## Correções obrigatórias

Ver detalhamento e priorização completa em
[`ACIDOBASE-PLANO-DE-CORRECAO-2026-09-17.md`](ACIDOBASE-PLANO-DE-CORRECAO-2026-09-17.md).
Resumo das que bloqueiam a conversão sem ajuste:

1. Corrigir "KDIGO 2 e 3" para "AKIN 2 e 3" na descrição do subgrupo de
   benefício do BICAR-ICU (E05), e precisar que o desfecho primário do
   ensaio é composto (óbito OU falência orgânica em D7), não mortalidade
   isolada.
2. Corrigir a entrada bibliográfica de Adrogué/Gennari/Galla/Madias — o
   quarto autor é "MADIAS, N. E.", não "NICOLAOS, E. M." (E15).
3. Corrigir o ano da referência ao Guia SBN de "2024" para "2025" (ou
   explicitar submissão 2024/publicação 2025) (E12).
4. Obter o título completo e verificar (ou substituir) a referência
   "Wilkins RL et al., 2010" antes de reaproveitar a tabela de valores
   normais como citação verificada (E16).

## Melhorias recomendadas (não bloqueiam, mas devem entrar no plano)

- Amarrar cada uma das sete referências "órfãs" a uma afirmação
  específica do corpo do texto, ou reclassificá-las explicitamente como
  "leituras recomendadas" separadas das referências citadas, seguindo a
  arquitetura do Gate 4 do PADRAO-TUTORIAL.md.
- Adicionar a marca `fonte:` junto à fórmula de Winters (E04), amarrando-a
  explicitamente a Albert/Dell/Winters 1967 e/ou Narins & Emmett 1980.
- No Caso 3, adicionar uma nota didática sobre a pCO2 medida cair no
  limite inferior da faixa esperada (49 de 49–53), para reforçar que
  "dentro da faixa" não é sinônimo de "centro da faixa".
- Confirmar o intervalo de referência do StatPearls para ânion-gap
  ("8–12 mEq/L") abrindo o capítulo completo, não só o título (E09).

## Parecer final

**Aprovado para conversão com correções obrigatórias.**

O núcleo científico do material — conceitos fundamentais, equação de
Henderson-Hasselbalch, fórmulas de compensação, ânion-gap, delta ratio e
os cinco casos clínicos — está correto, foi verificado com fontes
efetivamente abertas nesta sessão (PubMed, NCBI Bookshelf, publicação
oficial da SBN) e resistiu a recálculo independente sem nenhuma
divergência numérica. A citação mais sensível da missão — o estudo
SODa-BIC, apontado como não coberto pela aula e por isso de maior risco de
erro ou fabricação — é a mais solidamente verificada de todas, com todos
os números do resumo conferindo exatamente com o artigo original na NEJM
(2026).

As divergências encontradas (E05, E12, E15, E16) são pontuais, concentradas
em precisão bibliográfica e terminológica, e não comprometem a validade
fisiopatológica, as fórmulas ou as condutas centrais do material. Nenhuma
delas exige nova pesquisa de fundo — são correções de redação/citação que
podem ser resolvidas na AS1-B2 sem reabrir a triagem bibliográfica.

**Nenhum achado impede aproveitar o material como base; quatro correções
impedem publicá-lo sem ajuste.** As quatro correções obrigatórias listadas
acima (E05, E12, E15, E16) e detalhadas em
[`ACIDOBASE-PLANO-DE-CORRECAO-2026-09-17.md`](ACIDOBASE-PLANO-DE-CORRECAO-2026-09-17.md)
precisam ser executadas na AS1-B2 antes de o material ser considerado
pronto para publicação no NexusMed — a aprovação para conversão não
equivale a aprovação para publicação sem esses ajustes.

## Fontes consultadas nesta auditoria (ferramentas e datas)

- PubMed (via MCP `claude_ai_PubMed`): `search_articles`,
  `get_article_metadata`, `lookup_article_by_citation` — usado para
  Berend 2014, Seifter 2014, Narins & Emmett 1980, Albert/Dell/Winters
  1967, Jaber et al. (BICAR-ICU) 2018, Fosset et al. 2026, Serpa Neto et
  al. (SODa-BIC) 2026, Adrogué et al. 2009, Younes-Ibrahim et al. (Guia
  SBN) 2025, Hopkins/Sanvictores/Sharma (StatPearls) — todos consultados
  em 2026-09-17.
- Complementação AS1-B1.1 (2026-09-18): PubMed `get_article_metadata`
  (PMID 41159812) — Jung B, et al.; BICARICU-2 Study Group. JAMA.
  2025;334(22):2000-2010, DOI 10.1001/jama.2025.20231 — abstract oficial
  aberto e conferido número a número (640 randomizados, 627 analisados,
  43 UTIs francesas, mortalidade 62,1% vs. 61,7%, TRS 35% vs. 50%).
- WebSearch/WebFetch: confirmação de existência e autoria dos capítulos
  StatPearls "Arterial Blood Gas" e "Anion Gap and Non-Anion Gap Metabolic
  Acidosis" (NCBI Bookshelf), do guideline KDIGO 2012 AKI (Kidney Int
  Suppl. 2012;2:1-138), e leitura de trechos literais do Guia SBN via PMC
  (PMC12124864) — consultados em 2026-09-17.
- Renderização e extração do PDF de origem: PyMuPDF (fitz), 18 páginas
  renderizadas a 150 DPI e inspecionadas visualmente uma a uma nesta
  sessão; extração de texto completa comparada com a inspeção visual.
- Recálculo independente das fórmulas e dos cinco casos clínicos: feito
  manualmente nesta sessão, sem partir da resolução impressa no PDF.
