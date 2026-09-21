# Auditoria do export Google AI Studio — NexusMed — 2026-09-14

## Identificação

- ZIP: `synapsemed-firebase-auth (1).zip`
- SHA-256: `61A456ACD7A75929CBCE4356B541E7489C03AFAC1B0D395871FCF62BEDAFAC58`
- Comparado com produção `2e342bd` e candidata 21-D `b32ce94`.
- O export não é candidato a integração direta.

## Bloqueadores objetivos

1. Remove `package-lock.json`; instalação deixa de ser reproduzível.
2. Regride o 21-D: remove `MaterialReferencesPanel.tsx`, `SourceSelector.tsx`, `cms-human-review-21d.spec.ts` e trechos de repositórios/proveniência.
3. `npm run typecheck` falha com 12 erros em `DailyHandoffModal.tsx` e `BancaPerformanceRadar.tsx` por uso de dados `unknown` como registros tipados.
4. A última execução no AI Studio terminou por cota excedida. A alegação anterior de build/testes verdes não cobre o estado exportado.
5. O AI Studio não executou pgTAP nem Playwright canônico; 24 unitários não provam os fluxos de dados, SRS, CMS ou navegador.

## Blocos reprovados

- `ClinicalCognitiveProfile`: fabrica 50–60% sem respostas e deriva “raciocínio”, “diretrizes” e “consistência” de acurácia/erros sem validade definida; usa linguagem de diagnóstico/prescrição.
- `BancaPerformanceRadar` e chips de banca: 100% das questões publicadas têm instituição/ano ausentes no snapshot 21-A2; o painel agrupa o acervo em “Outras” e não entrega a promessa.
- `DailyHandoffModal`: código não tipa; contém afirmações como “alta precisão diagnóstica” sem evidência; copia dados pessoais para clipboard.
- `ExportCadernoModal`: exporta anotações e erros pessoais antes do diagnóstico de privacidade 16-A.
- `ClinicalPomodoroWidget`: widget global de 343 linhas, áudio e persistência local; aumenta carga e distração sem evidência de necessidade.
- Swipe de flashcard: gesto de 80 px grava imediatamente `rate(1)` ou `rate(3)`, reduz quatro escolhas a duas e permite avaliação acidental sem confirmação/desfazer.
- `SafeMarkdown`: converte texto por palavras-chave em “Diretriz Oficial”, “Consenso” ou “Armadilha”; cria semântica científica sem claim/revisão humana.

## Candidatos aproveitáveis após correção

- tokens de contraste e distinção canvas/superfície;
- estados selecionado/desabilitado mais legíveis;
- modo de foco das questões, desde que não esconda estado necessário;
- atalhos A–E/Enter somente no card com foco real, sem listener global por hover e com testes de formulário/modal;
- “Sugestão para hoje” baseada apenas em contagens reais de SRS/caderno, sem “métricas cognitivas”, prescrição ou promessa de retenção;
- tipografia tabular para contadores;
- caixas editoriais apenas por marcação explícita revisada, nunca por inferência de palavras.

## Melhorias propostas

1. Reduzir o dashboard antes de adicionar widgets: uma ação principal e detalhes progressivos.
2. Separar “dados observados” de “interpretação”: amostra insuficiente deve aparecer como tal.
3. Para gesto que grava SRS, exigir escolha inequívoca ou desfazer imediato; manter quatro avaliações canônicas.
4. Criar preferência de interface somente depois de mapear necessidade; não abrir uma aba genérica de configurações como solução antecipada.
5. Fazer o AI Studio trabalhar sobre tarefa visual pequena e exportar ZIP; integração sempre pelo 28-A sobre o repositório canônico vigente.

## Validações desta auditoria

- inventário e diff completo do export contra os dois snapshots;
- lockfile canônico restaurado apenas na cópia de auditoria;
- `npm ci`: concluído;
- `npm run typecheck`: falhou com 12 erros de código;
- unit/build: inconclusivos nesta cópia por bloqueio de acesso do `esbuild` fora do diretório canônico, não classificados como falha adicional;
- lint interrompido após espera anormal sem saída; typecheck e regressões estruturais já bloqueiam o export.

## Decisão

`REPROVADO_PARA_INTEGRAÇÃO`. Corrigir no AI Studio pelo prompt específico, exportar novo ZIP e repetir o 28-A. Nenhuma alteração foi feita no repositório ou na branch 21-D.
