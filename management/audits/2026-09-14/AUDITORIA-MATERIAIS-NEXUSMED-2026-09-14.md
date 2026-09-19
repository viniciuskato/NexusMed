# Auditoria dos materiais do NexusMed — 2026-09-14

## Resultado executivo

**Resultado geral: REPROVADO PARA CONFORMIDADE INTEGRAL.**

Foram lidos, sem qualquer escrita no produto, os 34 materiais do acervo, suas 802 seções e 268 referências no Supabase de produção. Na reconferência taxonômica, havia 33 publicados e `Medicine` já estava em rascunho.

- 2/34 materiais estão integralmente em inglês.
- 9/34 materiais têm ao menos uma seção vazia; são 12 seções vazias no total. Destas, 11 estão em materiais publicados e uma (`Active controversies`) está no rascunho `Medicine`.
- 0/268 referências têm `source_id` associado ao cadastro estruturado de fontes.
- 34/34 materiais não têm `author`, `provenance`, `source` nem `license` preenchidos.
- Conforme a auditoria 21-A2, 0/34 têm revisão, claims e atestação no novo fluxo: todo o acervo permanece `legacy_unmapped`.
- Não foi detectado mojibake nos textos didáticos.
- Não foi detectada duplicação exata entre seções não vazias nesta fotografia do banco. O achado anterior de “conteúdo duplicado” corresponde às seções vazias idênticas, não a repetição de prosa preenchida.

Conclusão: o conteúdo pode continuar legível como legado, mas **nenhum material deve receber selo de conformidade ao padrão novo sem reconciliação científica e atestação humana**.

## Reprovações P0 — corrigir primeiro

### P0-1 — Material didático em inglês

1. `Cardiac Anatomy` (`0eafe80a-fdd9-40f4-a67a-4c013589df3d`)
   - Título, subtítulo implícito, 28 títulos de seção e aproximadamente 3.335 palavras estão em inglês.
   - Exemplos: “What this compendium covers”, “Cardiac chambers”, “Electrical conduction system”, “Open questions” e “Discussion”.
   - Os atributos `data-pt` presentes em alguns termos não tornam o texto português: a prosa exibida continua em inglês.
   - Correção: revisão e adaptação editorial completa para PT-BR, preservando nomenclatura anatômica oficial e referências; não fazer tradução cega nem publicar automaticamente.

2. `Medicine` (`ff74dc19-35db-4f6d-ba31-ac855d295a0e`, atualmente em rascunho)
   - Título “Medicine”, subtítulo “Broad map”, tags, 35 títulos de seção e aproximadamente 7.890 palavras estão em inglês.
   - Há mistura ocasional de palavras portuguesas dentro da prosa inglesa, indício de importação/adaptação incompleta.
   - Além do idioma, a seção “Active controversies” está vazia.
   - Correção: decidir primeiro se o material genérico pertence ao escopo editorial do NexusMed; se pertencer, reconstruí-lo em PT-BR e submetê-lo à revisão científica. Se não pertencer, arquivar — não apenas traduzir.

### P0-2 — Publicação sem proveniência e atestação do paradigma novo

Todos os 34 materiais reprovam este gate:

- `content_revisions = 0`, `claims = 0` e `content_reviews = 0` na fotografia 21-A2;
- nenhuma das 268 referências do acervo está ligada por `source_id` a uma fonte estruturada;
- `author`, `provenance`, `source` e `license` estão ausentes em 34/34 materiais.

Isso não prova que as referências estejam erradas; prova que sua consulta, correspondência com alegações e aprovação humana **não são demonstráveis pelo sistema atual**. A correção deve ser progressiva, material a material, sem atestação retroativa em massa.

## Reprovações P1 — estrutura incompleta

| Material | Seção(ões) vazia(s) |
|---|---|
| Choque Circulatório | Leituras recomendadas |
| Medicine | Active controversies |
| Resposta Imune a Bactérias — Extracelulares e Intracelulares | Chlamydia trachomatis e Bordetella pertussis |
| Resposta Imune a Patógenos | Evasão viral — corrida armamentista molecular |
| Respostas Th1, Th2 e Th17 | Discussão |
| Semiologia Cardíaca | Palpação |
| Síndromes Bronco-Pleuro-Pulmonares | Fundamentos necessários; Síndromes diafragmáticas e mediastínicas |
| Tumores do Sistema Nervoso Central | Apresentação clínica; Raciocínio por imagem; Classificação dos tumores do SNC |
| Virologia Geral | Conceitos-chave |

As 12 seções devem ser preenchidas com conteúdo revisado ou removidas intencionalmente. Um título vazio em material publicado cria promessa editorial não cumprida e prejudica a navegação.

## Risco P1 — citações e referências

Os 34 materiais têm uma lista final de referências, mas a ligação entre alegações e fontes ainda é legado textual. A triagem encontrou citações autor-data em muitos textos, porém a densidade varia muito. O caso mais evidente é `Síndromes Bronco-Pleuro-Pulmonares`: 7 referências finais e nenhuma ocorrência autor-data reconhecida no corpo. `Ciclo Cardíaco`, `Imunidade Inata` e `Sistema Complemento` também têm somente uma ocorrência detectada cada.

Essa métrica é triagem, não veredito bibliográfico: fórmulas de citação diferentes podem escapar ao detector. O gate definitivo deve reconciliar cada alegação crítica com a fonte realmente consultada, criar os vínculos estruturados e remover referências órfãs.

## O que não foi reprovado pela varredura automática

- Os outros 32 materiais têm prosa predominantemente em português brasileiro.
- Não há caracteres corrompidos detectáveis no texto didático.
- Não há material sem referência final.
- Foram encontradas 214 seções com menos de 80 palavras, mas isso **não é falha por si só**: várias são cartões introdutórios ou subdivisões deliberadamente breves. Elas devem ser avaliadas no contexto, não preenchidas por volume artificial.
- O material PCSK9 já teve auditoria científica específica no 21-B e foi considerado `APTO_COM_CORREÇÕES`; isso não substitui o registro da revisão/atestação no banco.

## Ordem mínima de saneamento

1. Corrigir ou retirar de publicação `Cardiac Anatomy` e decidir o destino editorial de `Medicine`.
2. Preencher/remover as 12 seções vazias, sem alterar seções vizinhas nem fazer salvamento integral destrutivo.
3. Executar lotes pequenos de revisão científica: claims críticos → fontes consultadas → decisão humana → atestação.
4. Priorizar materiais de maior risco clínico e temporal (conduta, doses, diretrizes e terapêutica) antes dos conteúdos básicos estáveis.
5. Só depois atribuir conformidade; manter o legado explicitamente identificado até a revisão.

## Limites desta auditoria

Esta foi uma auditoria completa de idioma, integridade estrutural, metadados e rastreabilidade dos 34 materiais. Não é uma validação linha a linha de todas as alegações médicas contra as 268 referências: essa etapa exige consulta efetiva às fontes e aprovação humana por lotes. Ausência de defeito estrutural automático não equivale a aprovação científica.

## Segurança e reprodutibilidade

- Operação realizada somente com leituras REST (`GET`/`SELECT`) no Supabase remoto.
- Nenhum material, seção, referência, status, revisão ou atestação foi alterado.
- Script de auditoria: `Organizacao/auditar-materiais-nexusmed.mjs`.
