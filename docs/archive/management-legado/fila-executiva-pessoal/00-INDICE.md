# Fila executiva de prompts NexusMed

## Execute agora

1. **39-A — recriar script de carga nativa e subir o compêndio de meningite (Supabase LOCAL)**  
   Arquivo: `39-A.txt`; executar no Claude agora. O script `load-native-content.ts` do piloto PCSK9 foi perdido (branch antiga descontinuada); esta execução recria o script, roda dry-run e depois `--execute` **só contra o Supabase local** (`.env.local` do repo aponta pro remoto por padrão — trava de segurança explícita no prompt), carregando `meningite-bacteriana.compendium.yaml` como `draft`. Sem publicação, sem questões/flashcards.
2. **40-A — mapa do projeto NexusMed para o usuário (não-desenvolvedor)**  
   Arquivo: `40-A.txt`; executar no Claude agora. Pedido explícito do usuário em 2026-09-16: crescimento do projeto está disperso do ponto de vista de quem não é desenvolvedor (episódios reais desta mesma sessão — não achar material carregado, achar que o GitHub estava organizado quando não estava). Produz `Organização/NEXUSMED-MAPA-DO-PROJETO.md`, documento único e curto em linguagem simples (peças do projeto, estado atual, glossário mínimo, "onde eu olho quando quero X") — diferente do 27-A, que compacta contexto para sessões de IA, não para o usuário. Sem alteração de código/banco/repositório.

- 38-B (questões + flashcards do compêndio de meningite) continua **deliberadamente adiado**: o usuário decidiu não criar questões/flashcards até a sessão de diretoria conseguir rodar `scripts/read-question-feedback.ts` de ponta a ponta contra o Supabase real — sem esse fechamento de verificação, o risco é criar erro evitável sem forma de conferir. Bloqueio atual: `npm install` trava na rede da faculdade. Retomar o 38-B só depois que esse script rodar com sucesso pelo menos uma vez.


## Congelamento temporário até a AS1

- Até a prova de 21/09/2026, não executar prompts de infraestrutura, taxonomia, integração de interface ou publicação, salvo falha que impeça diretamente o estudo.
- O NexusMed já funcional deve ser usado para os temas cobertos; as lacunas serão supridas primeiro pelos artefatos do 37-A.
- Após a prova, retomar a fila técnica começando pelo 21-D2, sem perder o estado registrado abaixo.

## Execute depois do retorno aprovado

1. **21-D2 — fechar consistência do vínculo questão→material**  
   Arquivo: `21-D2.txt`; primeiro item técnico após a prova. Complemento mínimo na candidata 21-D, sem publicação.
2. **21-E — revisar e publicar o desbloqueio do CMS humano**  
   Arquivo: `21-E.txt`; somente após retorno aprovado do 21-D2; gate de release com smoke remoto não mutável.
3. **21-C3 — retomar pelo CMS o lote humano PCSK9**  
   Arquivo: `21-C3.txt`; somente após o 21-E publicado, usando a aba autenticada, sem atestar ou publicar.
4. **32-A — closures e verificação completa de fixtures no CI**  
   Arquivo: `32-A.txt`; após 21-E, em branch isolada. Não concorre com gates de interface que alterem `App.tsx`/simulado.
5. **27-A — compactar a governança executiva**  
   Arquivo: `27-A.txt`; após o 21-E para não conflitar em `AGENTS.md`/registro; reduz contexto obrigatório sem apagar histórico.
6. **20-A v2 — destino da carga YAML sob o novo contrato editorial**  
   Arquivo: `20-A.txt`; após o 23-C publicado, preferencialmente informado pelos achados do 21-A2.
7. **16-A v2 — diagnóstico de privacidade e ciclo de vida**  
   Arquivo: `16-A.txt`; somente leitura, após 23-A.
8. **24-A — matriz editorial longitudinal do pack piloto**  
   Arquivo: `24-A.txt`; conteúdo puro após 21-A2/21-B, sem UX, algoritmo ou banco.
9. **34-B — gate local de prontidão comercial das questões**  
   Arquivo: `34-B.txt`; liberado pelo 34-A2, mas executar somente após 21-E e sem concorrência no CMS. Implementa revisão comercial fail-closed separada da publicação editorial, sem backfill, produção ou despublicação.
10. **35-A — resolução auditável e delegável de feedback**  
   Arquivo: `35-A.txt`; Codex local em branch isolada. Acrescenta evidência, autoria server-side, histórico append-only e modo `delegated_agent`, preservando o acesso exclusivamente pela sessão de administrador ativo. Executar sem concorrência nos arquivos do CMS e somente após liberar a branch 21-D.
11. **36-A — checklist vivo de qualidade das questões**  
   Arquivo: `36-A.txt`; Claude, somente leitura do acervo/feedback e escrita documental local. Converte defeitos confirmados em regras preventivas versionadas, sem resolver feedbacks nem alterar questões. Pode rodar antes do 35-A; incorporar o retorno do 34-A se ele já existir.

## Nova trilha — organização do acervo

1. **29-A — implementar taxonomia curricular localmente**  
   Arquivo: `29-A.txt`; executar no Codex após o 21-E e após aprovação desta matriz pela diretoria. Preserva conteúdo e termina local.
2. **29-B — publicar taxonomia curricular**  
   Arquivo: `29-B.txt`; somente após retorno aprovado do 29-A. Não excluir taxonomia antiga.
3. **30-A — reconstruir Anatomia Cardíaca em PT-BR**  
   Arquivo: `30-A.txt`; Claude executivo, conteúdo local, independente da migration técnica; exige revisão humana posterior.
4. **31-A — triar as 11 seções vazias publicadas**  
   Arquivo: `31-A.txt`; somente leitura; decide remover, fundir, converter em cabeçalho ou desenvolver antes de gastar pesquisa/redação.
5. **Medicine — decisão pendente**  
   Já está em rascunho. Não traduzir, migrar, arquivar ou publicar até decisão explícita da diretoria.

## Trilha Google AI Studio — RETIRADA em 2026-09-16

Decisão da diretoria, a pedido explícito do usuário: a trilha Google AI Studio para interface foi **retirada da fila**. Motivo declarado pelo usuário: o AI Studio "perde o backend" — cada export/checkpoint roda desconectado do Supabase real, o que já havia causado regressão do 21-D num export anterior, sessão interrompida por cota com ZIPs aninhados e necessidade permanente de um gate técnico separado (28-A) só para auditar o que voltava de lá. Todo esse histórico (`UI-20260914-CORRIGIR-EXPORT-AISTUDIO.txt`, `CHECKPOINT-UI-2026-09-15-01-CLEAN`, `UI-20260915-CONTINUAR-LEITURA*.txt`, `UI-20260915-NAVEGACAO-TAXONOMIA.txt`, `00-PROMPT-BASE-AISTUDIO-INTERFACE.txt`) fica arquivado como referência, mas nenhum desses prompts deve ser reenviado.

**Itens que dependiam do AI Studio e ficam sem venue definido, não cancelados**:
- **26-A — auditoria prática de intuitividade**: precisa de nova decisão sobre onde rodar (ex. navegador real via Claude in Chrome, ou direto no app local) antes de ser reenviado.
- **19-A — teclado, foco e compreensão**: mesma pendência de venue.
- **14-A — lazy loading**: a condição técnica (bundle de 1.067,19 kB) segue válida; passa a ser trabalho direto no repositório (Codex/Claude), sem depender de export.
- **15-A — error boundary**: continua estacionado, agora só no repositório.
- O **28-A** (gate técnico do export) fica sem função — não há mais export para auditar. Removido da fila.

## Condicionais / estacionados

- **18-A v2 — triagem histórica**: enviar somente se houver usuário afetado, dado legado remanescente ou incidente observável.
- **17-A — PWA/offline**: estacionado até decisão explícita de produto ou evidência de necessidade offline real.
- **33-A — sincronização segura entre abas**: frente própria de confiabilidade; executar após 32-A e sem outra sessão alterando `syncQueue`/suítes de concorrência.
- **21-A**: substituído pelo 21-A2; nunca reenviar.

## Regras

### Perfil da LLM executora

- Padrão: **Claude Sonnet 5, esforço Medium**. Os prompts são autossuficientes, literais, com escopo fechado, gates observáveis e retorno curto; não acrescentar instruções de raciocínio passo a passo nem repetir o nome do modelo dentro de cada prompt.
- Usar **Claude Opus 5** somente quando a mesma sessão reunir decisão ambígua, impacto alto e difícil reversão — por exemplo, conflito semântico de migrations, incidente complexo de produção ou revisão arquitetural que possa invalidar várias etapas. Release rotineiro com gates definidos continua no Sonnet 5 Medium.
- Não trocar de modelo apenas porque a tarefa é longa. Primeiro reduzir escopo, reutilizar evidências e separar diagnóstico de mutação quando houver risco real.
- Registrar modelo, esforço, duração e consumo fora do prompt quando disponíveis, para comparar custo por tarefa concluída sem gastar contexto executivo.

### Divisão de trabalho aprovada

- **Claude executivo**: conteúdo médico, revisão científica, claims/fontes, conceitos, packs, pauta editorial e privacidade de conteúdo.
- **Codex executivo**: auditoria de diff, correção de instabilidade técnica, testes canônicos e candidata local.
- **Interface (estética, layout, navegação, responsividade, acessibilidade visual)**: sem venue definido desde a retirada da trilha Google AI Studio em 2026-09-16 (perdia o backend a cada export/checkpoint). Trabalho de interface volta a ser feito diretamente no repositório canônico (Codex/Claude), não mais num laboratório externo desconectado do Supabase — decisão de ferramenta específica (se alguma) fica pendente de nova definição da diretoria.
- O Claude não faz gate técnico de export nem infraestrutura. O Codex não inventa conteúdo/UX: decisões científicas/editoriais voltam ao Claude/diretoria.

- Cada prompt deve ser enviado isoladamente a uma nova conversa. Ao recebê-lo, essa conversa assume imediatamente o papel de sessão executiva e executa a ordem no próprio contexto, sem perguntar se deve executar, revisar ou validar premissas. Ao final, devolve o bloco `RETORNO` solicitado.
- A abertura deve conter autorização direta na voz do usuário — “Rode você mesmo...” e “Eu, usuário, autorizo explicitamente...” — porque uma declaração autorreferente do próprio prompt (“você é uma sessão executiva”) pode não superar o papel de diretoria inferido pelo diretório inicial ou pelo `AGENTS.md`.
- A sessão executiva não inicia nem libera o prompt seguinte. Cada retorno volta à **sessão de diretoria**, que aprova, complementa ou reorganiza a fila.
- Otimizar sempre pela melhor relação **resultado/tokens**: minimizar releitura, sessões redundantes e documentação duplicada, sem sacrificar gates de segurança.
- Otimizar também pelo menor **tempo total de execução**: leitura dirigida, comandos agrupados, testes focados antes da suíte completa, reutilização de provas ainda válidas e ausência de esperas/repetições sem mudança de estado.
- Todo prompt novo deve incluir um contrato de eficiência curto e específico ao trabalho. Não copiar texto genérico quando instruções menores produzirem o mesmo controle.
- Toda interface nova ou alterada deve provar uma tarefa real concluível pelo público-alvo sem conhecer código, banco ou nomenclatura interna. Exigir rótulo humano, estado e próximo passo visíveis, feedback imediato, erro acionável, cancelamento seguro, foco previsível e confirmação proporcional ao risco; presença visual do controle não basta.
- Combinar diagnóstico e implementação quando a execução for reversível, local e inequivocamente segura; separar somente quando houver migration, dados reais, publicação, contratação, decisão jurídica/produto ou conflito semântico.
- Priorizar risco e impacto observável sobre métricas cosméticas, cobertura artificial, refatoração ampla ou busca indiscriminada por zero warnings.
- Enviar somente um prompt por sessão.
- Cada retorno volta à diretoria antes de liberar dependentes.
- `16-A`, `17-A`, `18-A`, `20-A`, `21-A2`, `21-B` e `23-A` são diagnósticos/auditorias; não autorizam integração ou escrita remota. O 21-C autoriza somente o lote remoto explicitamente delimitado e nunca atestação/publicação.
- Não executar novamente o antigo `LEGACY-11-C-estabilizacao` nem prompts históricos já encerrados.
- Incidente real de produção interrompe a ordem e recebe triagem própria.
- Questões reais podem permanecer como referência, mas disponibilidade na internet não prova licença. Uso comercial exige autoria própria, licença documentada ou aprovação jurídica; mídia indispensável ausente ou sem direito comprovado bloqueia publicação comercial. Auditar por banca/origem antes de revisar item a item.
- Feedback confirmado deve alimentar o checklist vivo de qualidade. A resolução registra qual regra prevenia ou passou a prevenir a recorrência; criação e alteração de regra exigem revisão humana e preservam a versão usada em cada revisão editorial.

## Concluídos

- **38-A/38-A2** — compêndio nativo `meningite-bacteriana.compendium.yaml` (Infectologia/Clínica) **aprovado**: 11 seções, estrutura idêntica ao piloto PCSK9, 13 referências (verificadas pela diretoria arquivo por arquivo, não só pelo retorno colado), calendário PNI de meningocócica/pneumocócica incluído ao lado do ACIP americano no 38-A2, `LACUNA_DOCUMENTAL` marcada onde a fonte não permitia afirmação segura. Questões/flashcards (38-B) deliberadamente adiados — ver "Execute agora".
- **37-A** — sprint de estudo da AS1 de Saúde do Adulto I concluído: dossiê, 18 questões autorais e plano até 21/09 produzidos em `Organização/NexusMed-Estudo/SA1-AS1-2026/`. Sem alteração de produto/infraestrutura.
- **34-A/34-A2** — auditoria somente leitura concluída e corrigida: 402/402 questões, todas com direitos `pending`; 400 `hold_rights`, duas `hold_rights_and_media`, zero elegíveis. As questões `82e55bf5-a083-470b-84dd-970a159aaca4` e `aaaccffc-deb9-4476-a059-50ebbed68422` dependem de radiografias ausentes. Autoria provável foi separada de direito comercial atestado.
- **25-A** — banco editorial documental concluído e corrigido: 117 ideias, 117 IDs únicos, Asma/DPOC consolidadas sem duplicação e dependências internas válidas. Há 42 tipos ainda `a_definir`: 25 incompatíveis com o enum atual e 17 sem entrega suficientemente delimitada. Artefatos permanecem não rastreados; integrar somente em branch própria, nunca no commit da 21-D.
- **12-B** — publicado e verificado independentemente: `main`/`origin/main` `0c7834a`, merge técnico `e90fcee` com pais `b67a77c` e `0a33b20`.
- **12-C** — Área Editorial validada; nenhuma regressão ou alteração de código; 13-A liberado.
- **13-A** — parcial em `work/13a-suite-critica`/`4bf8dce`: Vitest 15/15, pgTAP 183/183, Playwright 10/10 e CI versionada; publicação e cenários concorrentes restantes seguem no 13-B.
- **13-B** — publicado: `main`/`origin/main` `42252b9`, merge `af1dbd4`, CI real e suíte crítica verdes.
- **22-A** — implementação local concluída em `work/22a-estudo-tematico`/`bf88bc7`; retorno aceito com uma lacuna de prova: o E2E abre o SRS pelo pack, mas não conclui a revisão nem confirma o retorno ao mesmo pack. Publicação transferida ao 22-B.
- **22-B** — publicado e verificado: `main`/`origin/main` `c942139`, complemento `4279259`; retorno real do SRS ao mesmo pack provado e Estudo Temático publicado. O smoke usou conta remota descartável autorizada e limpa, apesar de uma frase imprecisa no registro versionado dizer que nenhum dado remoto foi criado/alterado.
- **23-A** — diagnóstico concluído em `c942139`, somente leitura. Modelo híbrido aprovado com correções da diretoria: publicação por material/questão; FKs reais no alvo; localização também dentro da fonte; relação evidencial separada do tipo primário/secundário; comparação server-side do conteúdo atual com a revisão aprovada; autoatestação permitida na v1.
- **23-B** — implementação local aprovada em `work/23b-proveniencia-atestacao`, commits `724fb5d`, `cd87336` e `c8dd48d`; `verify:full` verde duas vezes, incluindo pgTAP 228/228 e Playwright 24/24. Sem push, merge, migration remota ou deploy; publicação transferida ao 23-C.
- **23-C** — publicado e verificado em `main = origin/main = 2e342bd`; migration remota reconciliada, deploy byte-idêntico e smoke com JWT real provaram legado, revisão, atestação, publicação e invalidação por edição, com fixtures integralmente removidas. Cobertura residual não bloqueante: faltou screenshot do clique no botão “Revisão” em produção; não abrir sessão exclusiva.
- **21-A2** — auditoria somente leitura concluída em `2e342bd`: 34 materiais, 402 questões, 675 referências e nenhuma inconsistência de FK. Identificou ausência de vínculos publicados e adoção zero da revisão no legado; PCSK9 é o único candidato estrutural, mas suas nove questões são draft, tags não são conceitos revisados e os flashcards associados são pessoais. Artefato: `Organização/AUDITORIA-ACERVO-NEXUSMED-2026-09-14-21A2.json`.
- **21-B** — triagem científica concluída: material e oito questões PCSK9 aptos para revisão humana; Q9 UFPA mistura iSGLT2/nefropatia não cobertos pelo material. Diretoria aprovou desvincular a Q9, preservá-la como draft e preparar o lote das outras oito sem atestação automática.
- **21-C** — bloqueado corretamente antes de qualquer escrita: a sessão Claude Code na nuvem não tinha JWT humano nem acesso de produção permitido. Nenhum dado foi alterado; substituído pelo 21-C2 via Claude in Chrome autenticado.
- **21-C2** — bloqueado corretamente sem escrita. Confirmou duas falhas de produto: revisão de questão não aparece e não existe edição do vínculo questão↔material. Auditoria de código acrescentou uma terceira barreira: vínculo de fonte exige UUID bruto e não captura os campos evidenciais pela UI. Correções transferidas ao 21-D.
- **21-D** — implementação local aprovada em `work/21d-revisao-humana-cms`/`b32ce94`: painel comum às abas, vínculo direcionado de questão, seletor pesquisável e associação explícita de referências. pgTAP 228/228 e Playwright 29/29; sem publicação. Release transferido ao 21-E.

## Achados incorporados à fila em 2026-09-14

- A política de atestação está publicada, mas o acervo real permanece com `content_revisions=0`, `claims=0` e `content_reviews=0`; não declarar conteúdo legado como revisado.
- Organização canônica aprovada para os novos prompts: `ciclo → disciplina → tema → material`, uma localização principal. Packs, sistemas, conceitos, competências, lente e estado editorial são transversais.
- Auditoria de 2026-09-14/15: 34 materiais, 802 seções e 268 referências; `Cardiac Anatomy` deve ir para `Básico → Anatomia → Sistema cardiovascular`; `Medicine` está em rascunho e aguarda decisão; 11 seções vazias permanecem em materiais publicados.
- O pill `Retomar` usa `LastReadingSession` local por UID sem expiração/limpeza e aparece no CMS. Não é histórico inteligente nem botão Voltar; correção separada no prompt `UI-20260915-CONTINUAR-LEITURA.txt`.
- Falha visual reproduzida em 2026-09-15 na tela de Cards: pílula `Retomar` + dock inferior encobrem a ação do flashcard. Incorporada como gate 9 da correção atual, com área segura responsiva e prova em desktop/mobile/zoom; não abrir execução concorrente nos mesmos componentes.
- Auditoria técnica de 2026-09-15: `verify:fast` verde (24/24 unitários), 89 warnings aceitos sob teto 93, bundle JavaScript de 1.067,19 kB; suíte completa não foi repetida porque Docker/Supabase local estava indisponível. Auditoria npm ficou inconclusiva por `ECONNRESET`, portanto não declarar dependências sem vulnerabilidades com base nesta rodada.
- Antes do 21-E, o 21-D2 deve tornar o Supabase autoritativo no vínculo questão→material; o checkpoint `b32ce94` altera cache local antes da confirmação remota.
- O CI verifica resíduos apenas por `e2e-13a-%`, embora as suítes usem outras famílias. O 32-A centraliza a prova de zero fixtures e cobre closures sinalizadas em simulado/caderno de erros.
- A corrida entre duas abas do mesmo `BrowserContext` permanece confirmada e foi isolada no 33-A; não misturar com correções editoriais ou de interface.
- Pauta futura: `IDEA-3 — Asma` e `IDEA-4 — DPOC`, separadas, em `Clínico → Pneumologia → Doenças obstrutivas`, com objetivo de pack completo. O 25-A deve importá-las somente como `idea`.
- Planos de ensino do 4º período (2026/2) triados em 2026-09-15: 117 candidatos editoriais registrados em `Organizacao/PAUTA-CANDIDATOS-PLANOS-ENSINO-4P-2026-09-15.md`. São apenas `idea`; avaliações, datas e rotinas administrativas foram excluídas. Competências de Clinical Experience e PDI permanecem transversais/profissionais, fora da árvore clínica.
- Não há pack editorial completo: nenhuma questão publicada está vinculada a material. PCSK9 continua sendo o primeiro lote, com Q9 a desvincular e oito questões a preparar no 21-C3.
- Intuitividade não está aprovada globalmente. Nota histórica (14/15-09): na época, o plano era o 26-A explorar jornadas no AI Studio com o 28-A fazendo a verificação do export — essa trilha foi retirada em 2026-09-16 (ver seção "Trilha Google AI Studio — RETIRADA"); o 26-A segue pendente de novo venue, e o 28-A foi removido da fila.
- O contexto obrigatório da diretoria supera 38 mil palavras entre `AGENTS.md` e `registro.md`; o 27-A deve compactar a camada ativa e preservar o histórico pesquisável.
