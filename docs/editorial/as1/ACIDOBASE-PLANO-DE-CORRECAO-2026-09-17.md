# Plano de correção — Equilíbrio Ácido-Base (AS1, Tema 3)

Missão: AS1-B1 (auditoria iniciada em 17/09/2026, complementada em
18/09/2026 pela AS1-B1.1 — verificação da publicação primária do
BICARICU-2). Este documento **não** contém o conteúdo corrigido — é a
lista objetiva de alterações a executar numa futura missão AS1-B2 (ainda
não aberta, apenas planejada), a partir dos achados de
[`ACIDOBASE-AUDITORIA-CIENTIFICA-2026-09-17.md`](ACIDOBASE-AUDITORIA-CIENTIFICA-2026-09-17.md).

**Nenhum achado impede aproveitar o material como base; quatro correções
impedem publicá-lo sem ajuste.**

## Bloqueia publicação

Nenhum item desta auditoria impede usar o material como base para a
conversão — não há afirmação central sem sustentação, dado clínico
inventado, ou elemento visual não inspecionado (condições de bloqueio do
PADRAO-TUTORIAL.md para *aproveitamento* do material). Esta categoria fica
**vazia** nesta missão. Isso não equivale a "pronto para publicação sem
ajuste": as quatro correções listadas em "Necessário" abaixo impedem a
publicação do material corrigido até serem executadas na AS1-B2.

## Necessário (antes de considerar o material pronto para publicação)

1. **Corrigir a atribuição de estadiamento do BICAR-ICU** (achado E05):
   trocar "subgrupo com injúria renal aguda (IRA) KDIGO 2 e 3" por
   "subgrupo com injúria renal aguda (IRA) AKIN 2 e 3" no trecho sobre o
   BICAR-ICU (p. 7 do PDF original). Adicionar uma frase esclarecendo que
   o desfecho primário do ensaio é composto (óbito por qualquer causa em
   D28 OU presença de ao menos uma falência orgânica em D7), não
   mortalidade isolada.
2. **Corrigir a entrada bibliográfica de Adrogué/Gennari/Galla/Madias**
   (achado E15): trocar "NICOLAOS, E. M." por "MADIAS, N. E." na lista de
   referências. Se a referência for mantida no material corrigido, amarrar
   uma citação `fonte:` a uma afirmação específica do corpo (ela está
   órfã hoje).
3. **Corrigir o ano da referência ao Guia SBN** (achado E12): de "SBN,
   2024" para "SBN/J Bras Nefrol, 2025" (DOI 10.1590/2175-8239-JBN-2024-0239en),
   ou explicitar a dualidade submissão 2024/publicação 2025 se o autor
   original quiser preservar a data de referência da aula.
4. **Resolver a referência "Wilkins RL et al., 2010"** (achado E16): obter
   o título completo da obra usada pela aula para a tabela de valores
   normais de gasometria (p. 5 do PDF), e então (a) confirmar a fonte com
   uma busca dedicada, ou (b) substituí-la por uma fonte primária/diretriz
   verificável para os mesmos valores (ex.: um guideline de gasometria
   arterial já usado em outro ponto do material, como o próprio StatPearls
   "Arterial Blood Gas").

## Recomendável

5. Amarrar as referências "indicadas na aula" que hoje estão órfãs
   (Adrogué et al. 2009, Badr & Nightingale 2007, Rocco 2003, e os quatro
   livros-texto: Johnson, Moura & Alves, Riella, Gomes) a afirmações
   específicas do corpo do texto — ou reclassificá-las explicitamente
   como "leituras recomendadas" (Gate 4 do PADRAO-TUTORIAL.md), separadas
   da lista de referências citadas por afirmação.
6. Adicionar a marca `fonte:` junto à fórmula de Winters (seção 8.1, p. 6),
   amarrando-a a Albert/Dell/Winters 1967 e/ou Narins & Emmett 1980 — hoje
   a fórmula aparece sem citação pontual, embora ambas as referências
   estejam na lista.
7. Citar a publicação primária do BICARICU-2 (Jung B, et al. JAMA.
   2025;334(22):2000-2010, DOI 10.1001/jama.2025.20231, PMID 41159812,
   verificada em AS1-B1.1) junto da meta-análise de 2026 (Fosset et al.),
   preservando no texto a distinção entre a ausência de efeito na
   mortalidade em 90 dias (62,1% vs. 61,7%, p=0,91) e a redução expressiva
   no uso de terapia renal substitutiva (35% vs. 50%).
8. Confirmar o intervalo de referência do StatPearls para ânion-gap
   ("8–12 mEq/L", achado E09) abrindo o capítulo completo (não só o
   título), para poder citar a frase exata.
9. No Caso clínico 3 (estenose pilórica), adicionar uma nota didática
   explícita sobre a pCO2 medida (49 mmHg) cair no limite inferior da
   faixa esperada (49–53 mmHg) — reforço pedagógico, não correção de
   erro.

## Opcional

10. Padronizar a citação das quatro tabelas de compensação (seção 11) com
    uma única marca `fonte:` consolidada para Narins & Emmett 1980, em vez
    de depender só da nota de rodapé da seção 8.4 (p. 10) para cobrir
    todas as quatro regras.
11. Avaliar se vale a pena adicionar uma figura/fluxograma da abordagem
    sistemática em 3 passos (seção 7) para reforço visual — o material
    hoje é 100% tabela/texto, o que é aceitável, mas um fluxograma poderia
    ajudar na revisão de véspera.
12. Avaliar a inclusão de uma tabela específica de diagnóstico diferencial
    de acidose com AG elevado (lática vs. cetoacidose vs. intoxicações
    exógenas vs. renal), hoje apenas listada em texto corrido na seção
    8.1 — não é uma lacuna crítica, mas ajudaria a legibilidade para
    revisão rápida.

## Arquitetura sugerida para o material futuro (AS1-B2)

Não é para escrever o conteúdo corrigido nesta missão — apenas a
arquitetura-alvo, seguindo o Gate 4 do PADRAO-TUTORIAL.md:

1. Situação-problema (pode reaproveitar um dos 5 casos como abertura).
2. Representação clínica preliminar (dados objetivos, sem interpretação).
3. Conteúdo principal, um bloco por objetivo/seção já existente no
   material (gasometria arterial/venosa; por que o equilíbrio importa;
   conceitos fundamentais; fisiologia do tamponamento; Henderson-Hasselbalch;
   valores normais; abordagem sistemática; os quatro distúrbios primários;
   ânion-gap e delta ratio) — a estrutura atual já está muito próxima
   dessa arquitetura e pode ser majoritariamente preservada.
4. Integração e retorno ao caso (os cinco casos clínicos, já prontos e
   validados nesta auditoria, podem ser reaproveitados quase sem
   alteração de conteúdo — só formatação para o padrão NexusMed).
5. Síntese final (a seção 12 já existente é um bom ponto de partida,
   mantendo a regra de não repetir definições nem inserir novas citações).
6. Discussão (ainda não existe no material atual — precisa ser escrita
   na AS1-B2, com os três movimentos exigidos pelo Gate 5: convergência,
   tensão, implicação derivada; um bom candidato de "tensão" é exatamente
   o contraste BICAR-ICU/BICARICU-2/meta-análise/SODa-BIC sobre
   bicarbonato de sódio — nenhum dos quatro mostra benefício de
   mortalidade isolada, mas BICAR-ICU/BICARICU-2 mostram redução
   consistente no uso de terapia renal substitutiva em subgrupos com
   lesão renal, enquanto o SODa-BIC (população mais ampla, sem exigência
   de IRA) não mostra esse efeito — que o material atual já documenta bem
   em blocos separados mas não costura em uma discussão narrativa única).
7. Leituras recomendadas (reclassificar aqui as referências hoje órfãs —
   ver item 5 acima).
8. Referências (citação autor-data conforme NBR 10520:2023/NBR 6023:2018,
   com todas as correções da seção "Necessário" já aplicadas).

Citações no HTML final devem seguir o padrão `navRef` do Gate 6 do
PADRAO-TUTORIAL.md (autor-data navegável, com retorno à posição de
leitura) — o material atual já usa uma convenção parecida com as caixas
"Acréscimo de pesquisa" e a tag `AULA`, que pode inspirar a
implementação visual, mas o mecanismo de citação em si (Vancouver
numerado por parênteses de DOI) precisará ser adaptado para autor-data.
