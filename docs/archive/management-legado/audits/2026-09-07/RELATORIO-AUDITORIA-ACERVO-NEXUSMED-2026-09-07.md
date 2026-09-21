# Auditoria comparativa: Acervo de Estudos Médicos × NexusMed — 2026-09-07

**Sessão executiva** (diagnóstico apenas — nenhum conteúdo, banco de produção ou interface foi alterado nesta auditoria). Referente ao "Prompt 02" de uma sequência diretoria/executiva; o bloco de retorno copiável está ao final deste documento.

---

## 1. Escopo auditado

**Software**: NexusMed (nome de marca; repositório e projeto continuam se chamando SynapseMed) em `C:\Users\vinic\OneDrive\Projetos\SynapseMed\firebase-auth`. Produção real em `https://synapse-med-firebase-auth.vercel.app`, backend Supabase projeto `synapsemed` (ref `jfvhwwvixwvgjfqzlkkb`, `sa-east-1`).

**Acervo (fonte)**:
- `C:\Users\vinic\OneDrive\Questões\_banco\` — banco de questões, fontes bibliográficas, correções editoriais, piloto de conceitos.
- `C:\Users\vinic\OneDrive\Estudos\Base de Estudos\Biblioteca\Medicina\` — compêndios teóricos (HTML) e extrações JSON.
- `C:\Users\vinic\OneDrive\Estudos\Base de Estudos\Casos Clínicos\` — inspecionado apenas para confirmar que é um acervo separado, não integrado ao NexusMed (ver seção 8).

**Excluído deliberadamente**: pastas pessoais sem relação com estudo/software (Saúde Pessoal, Valores, Línguas, Investimentos, Desktop). Não foi tocado `Header.tsx` nem qualquer arquivo relacionado ao cabeçalho mobile (há outra sessão trabalhando nisso).

**Dependência explícita não resolvida**: não existe hoje uma matriz curricular formal (lista oficial de temas/objetivos de aprendizagem que o produto se propõe a cobrir) contra a qual medir "cobertura completa". Toda afirmação de cobertura abaixo é relativa ao que **já existe no acervo do usuário**, não a um currículo de residência médica completo — isso é uma limitação estrutural da auditoria, não um achado a corrigir tecnicamente.

## 2. Metodologia e limitação de acesso mais importante

A investigação foi feita por leitura direta de código-fonte, dados JSON de origem, migrations SQL, e memória de sessões anteriores (tratada como ponto-no-tempo, não como fato atual — sempre re-verificada quando possível). Quatro agentes de pesquisa paralelos cobriram: flashcards, referências bibliográficas, workflow de publicação, e inventário de compêndios; os achados foram conferidos por mim antes de entrar neste relatório.

**Limitação central: não foi possível consultar o Supabase remoto (produção) nesta sessão** — toda tentativa de rodar `supabase db query --linked`, mesmo estritamente de leitura (`select count(*) ...`), foi bloqueada pelo classificador de segurança automático do Claude Code, que trata qualquer acesso ao banco remoto como ação de alto risco independentemente do modo. Isso é documentado como comportamento conhecido em `AGENTS.md` do próprio projeto (armadilha #3) e em memória de sessões anteriores — sessões interativas com o usuário presente conseguem aprovar esse tipo de comando na hora; esta sessão, rodando em modo automático, não conseguiu. **Consequência prática**: vários achados abaixo (marcados "NÃO VERIFICADO NO REMOTO") são conclusões por análise de código/dados de origem, não confirmação direta do estado atual do banco de produção. A última verificação direta e independente do banco remoto registrada em memória é de 2026-09-06.

## 3. Achado principal — questões com 3 alternativas (ponto 3 do pedido)

**A fonte do banco de questões está 100% íntegra**: os 393 registros de `Questões\_banco\banco-questoes.json` têm, sem exceção, exatamente 5 alternativas, gabarito (`correta`) dentro do intervalo válido, e `explicacaoPorAlternativa` completo para todas as 5 alternativas de todas as 393 questões (verificado por script próprio rodado sobre o arquivo, não por amostragem). **Nenhuma questão da fonte foi originalmente criada com 3 alternativas.**

O script de carga real (`scripts/load-questoes.ts`) itera `for (let i = 0; i < q.alternativas.length; i++)` — grava exatamente o número de alternativas presente na fonte, sem truncar nem completar. O componente de exibição (`src/components/questions/QuestionCard.tsx`) renderiza `question.options.map(...)` sem nenhum `slice`/limite. **Ou seja: nem a carga nem a exibição cortam alternativas.**

**Causa raiz identificada, com uma ressalva de verificação pendente**: `supabase/seed.sql` cria, de propósito, uma "questão demonstrativa de seed" com **exatamente 3 alternativas (A/B/C)** — no **mesmo tema** (`Cardiologia` / `Insuficiência Cardíaca`) das 40 questões reais migradas do banco. O script marca essa questão como `status = 'published'` (linha 95 do arquivo), ou seja, se estivesse presente no banco de produção, apareceria misturada com as 40 questões reais de Insuficiência Cardíaca, visível a estudantes reais, com enunciado "Questão demonstrativa de seed — qual alternativa está correta?" e alternativas como "Alternativa demonstrativa A (correta)".

Uma memória de 2026-09-06 já havia detectado esse mesmo material ("Insuficiência Cardíaca — Visão Geral (Seed)") entre os "40 materials" do banco **local** de teste, mas não há registro de que o `seed.sql` tenha sido aplicado ao banco **remoto** de produção — a criação do projeto remoto e as cargas de conteúdo real documentadas usaram apenas `supabase db push` (migrations) e os scripts `load-compendios.ts`/`load-questoes.ts`, nunca `db reset`/seed contra o remoto (isso seria destrutivo e é bloqueado por design). **Portanto, o mais provável é que a questão demonstrativa NÃO esteja em produção — mas isso não pôde ser confirmado nesta sessão** (ver limitação de acesso, seção 2). É a verificação de menor custo e maior valor desta auditoria: uma única query `select question_stem from questions where question_stem ilike '%demonstrativa%'` contra o remoto, rodada por uma sessão interativa com o usuário presente, resolve a dúvida em segundos.

**Achado secundário, relevante para o futuro (não é sobre o passado)**: o formulário de criação manual de questões na Área Editorial (`AdminCMSView.tsx`) tem **campos fixos para 4 alternativas**, não 5. O schema do banco permite publicar com apenas **2 ou mais** alternativas (`publish_question`, migration `20260903120100_rls_policies.sql:687-689`: `if v_option_count < 2 then raise exception`). Isso significa que **qualquer questão nova criada manualmente pelo editor hoje nasce com 4 alternativas**, divergindo do padrão de 5 alternativas de todo o banco migrado — uma inconsistência de formato que só vai crescer se o CMS continuar sendo usado para criar questões novas sem ajuste. Gabarito e explicação por alternativa, porém, são rigorosamente validados pelo RPC (exatamente 1 correta, todas com explicação preenchida) — a integridade estrutural de "uma questão publicada é sempre uma questão completa" está garantida pelo banco, independentemente do número de alternativas.

## 4. Referências bibliográficas — geral vs. citação pontual (ponto 4 do pedido)

O acervo tem um catálogo curado real: `fontes.json` com **87 fontes**, cada uma com `tipo` (11 categorias), `verificacao` (6 níveis de rigor, de "vaga pendente" a "verificada por texto integral e inspeção visual"), `substituidaPor`, identificadores (DOI/PMID/ISBN). `correcoes.json` tem 488 registros de histórico editorial (todos com `questaoId` válido contra o banco atual — nenhum órfão), a maioria (460) classificada como "melhoria de item".

O schema do NexusMed foi desenhado corretamente para replicar essa distinção: tabela `sources` (curada, mesmo CHECK de tipo/verificação do acervo), `question_references` (join estruturado questão↔fonte, para citação pontual por questão), e `material_references` (com `source_id` opcional, mantendo `citation_text` como texto de fallback).

**Lacuna real confirmada por leitura de código**: `question_references` está desenhada e foi usada no **piloto** de 40 questões de Cardiologia (script `load-pilot-cardiologia.ts`, que popula `sources` e `question_references` de fato) — mas esse piloto foi descartado por decisão do usuário em 2026-09-06 (as 40 questões reais do banco substituíram as do piloto). O script que efetivamente carregou as **393 questões reais** (`load-questoes.ts`) lê o campo `referencias` de cada questão da fonte, mas **nunca grava em `question_references` nem em `sources`** — o dado é descartado silenciosamente na carga. Resultado: hoje, para nenhuma das 393 questões reais publicadas existe um vínculo estruturado a uma fonte específica no banco, apesar de a fonte (banco-questoes.json) ter esse dado pronto (`referencias: ["delgado2023-esc-endocardite", ...]` por questão) e o catálogo de 87 fontes existir.

Mesmo se a tabela fosse populada, **nenhum componente de UI ou repositório do lado de questões lê `question_references`/`sources` hoje** (`SupabaseQuestionsRepository.ts` não faz nenhuma referência a essas tabelas) — a lacuna é dupla: dado não carregado E canal de exibição não implementado.

Do lado dos compêndios, `material_references` é gravado só como texto livre (`citation_text`), com `source_id` sempre nulo por decisão documentada no próprio script ("inviável curar 33 compêndios manualmente contra `sources`") — o usuário final vê apenas uma lista de bibliografia geral ao final do compêndio (`CompendiumReader.tsx`, um `<footer>` numerado), nunca uma citação vinculada a uma afirmação específica do texto. Não existe, em nenhum lugar do admin, uma tela de gestão centralizada do catálogo de 87 fontes — cada compêndio tem seu próprio campo de texto livre, sem checagem de duplicidade contra o catálogo curado.

**Conclusão do ponto 4**: a distinção entre "bibliografia geral" e "referência vinculada a afirmação" existe no desenho do schema, mas **não existe na prática hoje** — nem para compêndios (nunca foi essa a intenção do carregamento atual) nem para questões (a intenção existia — o piloto provou o conceito — mas a carga real não a implementou).

## 5. Flashcards — acervo ausente, software com lacunas de implementação

**Acervo**: não existe nenhum conteúdo de flashcards pronto ou planejado no OneDrive — pasta `Biblioteca\Medicina\_anki` está vazia, e nenhum arquivo do acervo tem formato frente/verso. O software teria que gerar todo esse conteúdo do zero.

**Software**: schema e algoritmo estão implementados de forma séria — SuperMemo SM-2 completo em `src/services/srsAlgorithm.ts`, com tabelas `flashcards`/`flashcard_srs_state`/`flashcard_reviews`. Dois achados de qualidade:

1. **Bug real confirmado por leitura**: `calculateNextSRS` monta `reviewHistory` a partir do parâmetro `currentSRS` original (não do `baseSRS` já tratado para nulo) — se chamado sem SRS prévio (`currentSRS` nulo/indefinido), lança `TypeError` em vez de usar o estado inicial. Isso pode quebrar a primeira revisão de um flashcard novo dependendo do caminho de chamada.
2. **Funcionalidade parcial no admin**: a aba "Flashcards SRS" da Área Editorial só lista e permite excluir — não há criação manual nem importação em massa pela UI. A única via de criação é automática, a partir de uma questão já respondida pelo estudante (`createFlashcardFromQuestion`), com conteúdo genérico (primeiros 180 caracteres do enunciado + resumo high-yield duplicado como "mechanism highlight").

Isso não é uma "lacuna de migração" (não havia nada a migrar) — é uma funcionalidade do produto que hoje só existe no caminho automático, sem ferramenta de curadoria dedicada.

## 6. Workflow atual de produção/importação/revisão/publicação (ponto 5 do pedido)

A Área Editorial (`AdminCMSView.tsx`) tem 5 abas reais: **Compêndios**, **Questões Comentadas**, **Flashcards SRS** (só leitura+exclusão, ver seção 5), **Usuários** (aprovação de cadastro) e **Feedback** (triagem de reports de estudantes).

**Criação de conteúdo**: exclusivamente manual, campo a campo, via formulário — **não existe nenhum botão de importar arquivo/JSON/CSV em lugar nenhum do admin** (confirmado por busca no código inteiro). A única via real de carga em massa hoje são os scripts de terminal `scripts/load-compendios.ts` e `scripts/load-questoes.ts`, que só quem tem acesso ao repositório/terminal consegue rodar — um editor comum sem acesso técnico não tem como importar conteúdo em volume, só cadastrar item a item pela tela.

**Publicação**: ação binária de um clique — `draft` → `published` via RPC `publish_question` (valida no banco: ≥2 alternativas, exatamente 1 correta, todas as explicações preenchidas, comentário geral e resumo high-yield não vazios) ou equivalente para compêndios. Não existe um segundo estado de aprovação por outra pessoa — quem publica é quem decide sozinho, sem revisão cruzada formal. Despublicar não tem validação nenhuma (UPDATE direto liberado por RLS).

**Ciclo de revisão pós-publicação**: existe e está mesclado em produção (`main`, commit `2d58efd` — a memória de que essa feature estaria "pendente em branch separada" estava desatualizada, corrigido nesta auditoria). Estudante reage com 👍/👎 a uma explicação, ou reporta "algo errado aqui" via popover contextual; isso alimenta a aba Feedback do admin, com fila `pendente → em_analise → resolvido` e link direto para abrir o item e corrigi-lo manualmente no mesmo formulário de criação. Não há correção automática nem reabertura formal de estado editorial — é edição manual comum.

**Achado de infraestrutura, não verificado no remoto**: a migration `20260907130000_feedback_contextual.sql` (que cria as tabelas usadas por essa mesma feature de feedback/reações) foi documentada em memória de hoje (2026-09-07) como "ainda não aplicada no remoto" no momento em que a feature foi implementada. O código já está mesclado em `main` (e portanto já deployado no Vercel, pois deploy é automático a cada push). **Se a migration não tiver sido aplicada ao Supabase remoto, a funcionalidade de feedback/reações está quebrando silenciosamente em produção agora** (padrão de incidente já documentado no próprio `AGENTS.md` do projeto, armadilha #8: "merge em main != schema aplicado no remoto", que já causou uma quebra real de poucos minutos em produção antes). **Não foi possível confirmar nesta sessão** (mesma limitação de acesso da seção 2) — é a segunda verificação de menor custo e maior valor desta auditoria.

## 7. Estado do repositório (achado colateral)

`git status` mostra mudanças não commitadas em `AGENTS.md`, `Header.tsx` e `CompendiumReader.tsx`, além de arquivos novos não rastreados (`preview_tmp.html`, `src/_preview_tmp/`, `vite.preview.config.ts`). **`Header.tsx` está sendo trabalhado por outra sessão em paralelo (cabeçalho mobile) — não foi tocado nem investigado por esta auditoria, por instrução explícita.** A mudança não commitada em `CompendiumReader.tsx` não foi investigada (pode ser parte do mesmo trabalho de cabeçalho, ou outra coisa — registrar para quem for revisar depois, não é urgente).

## 8. Inventário do acervo de compêndios (ponto 1 do pedido)

Inventário completo (não amostragem) de `Biblioteca\Medicina`, com validação aprofundada por amostragem de 5 arquivos claramente identificada como tal:

- **33 arquivos HTML de compêndio** no acervo (excluindo `index.html`/`_archive`), cobrindo 10 disciplinas (Cardiologia 6, Imunologia 14, Infectologia 4, Hematologia 3, Pneumologia 1, Nefrologia 1, Neurologia 1, Medicina de Emergência 1, Medicina de Família e Comunidade 1, Medicina Geral 1).
- **Correspondência 100% com `_extracted-supabase\*.json`**: nenhum HTML sem JSON, nenhum JSON órfão — todo o acervo de compêndios HTML já foi extraído.
- **Carga no Supabase**: 33 materiais carregados e publicados no remoto (confirmado por auditoria independente anterior, 2026-09-06 — não reconfirmado nesta sessão por falta de acesso).
- **Amostra de 5 JSONs** (Cardiologia, Hematologia, Imunologia, Nefrologia, Pneumologia): todos com referências preenchidas; 2 dos 5 (`hemograma-e-anemias.json`, `imunidade-inata.json`) têm **zero imagens** apesar de conteúdo extenso (34 e 15 seções) — candidatos a receber ilustração, não confirmado como lacuna em todos os 33 (amostra, não inventário completo de imagens).
- **Conteúdo do acervo que NUNCA entrou no pipeline HTML→JSON**: 9 arquivos `.docx` + 5 arquivos `.pdf` dentro da própria árvore `Biblioteca\Medicina` (ex.: "Endocardite Infecciosa.docx", "Febre Reumática.pdf") — o pipeline de extração só processa HTML; esse material nunca foi convertido, é uma lacuna de cobertura do acervo em relação ao próprio processo de digitalização do usuário, não do software.
- **Casos Clínicos** (`Base de Estudos\Casos Clínicos`, 165 arquivos: 17 pdf, 13 docx, 11 html, 22 md, resto diverso) é um **acervo separado e completamente não integrado** ao NexusMed — nenhum desses arquivos passa pelo pipeline de compêndios ou questões hoje. Isso é uma decisão/lacuna de escopo de produto explícita a ser tomada pelo usuário (não uma falha técnica).
- **Sem arquivos só-na-nuvem**: verificado atributo `Offline` em todos os arquivos relevantes — nenhum estava em estado "placeholder não baixado", então não há limitação de leitura a registrar aqui.

Sobre o **banco de questões** (393 questões, 87 fontes, 488 correções): inventário completo já feito nesta sessão (seção 3) e é o mesmo conjunto cuja carga no Supabase remoto foi verificada de forma independente em 2026-09-06 (393/393 questões, 1965/1965 question_options) — não reconfirmado por query direta nesta sessão.

## 9. Matriz de cobertura rastreável

Ver arquivo separado `MATRIZ-COBERTURA-NEXUSMED-2026-09-07.md` (mesma pasta) — tabela completa por tema/disciplina com as colunas pedidas (assunto | objetivo de aprendizagem | material | questões | flashcards | fontes | situação editorial | lacuna | evidência/localização | prioridade), distinguindo cobertura **ausente**, **parcial** e **verificada** (nenhum tema é considerado "coberto" só por ter um item).

## 10. Priorização por impacto

**P0 — confiabilidade do estudo / risco de conteúdo incorreto em produção (verificação barata, decisão do usuário):**
1. Confirmar (query única, sessão interativa) se a questão demonstrativa de `seed.sql` (3 alternativas) está no banco remoto — se estiver, despublicá-la/removê-la é uma correção trivial e de alto valor (evita que um estudante real veja "Alternativa demonstrativa A (correta)" misturada com conteúdo clínico).
2. Confirmar se a migration `20260907130000_feedback_contextual.sql` foi aplicada ao remoto — se não, a funcionalidade de feedback/reações (já em produção pelo deploy automático do Vercel) está falhando silenciosamente para usuários reais agora.

**P1 — perda de valor editorial já investido:**
3. `question_references`/`sources` não populados na carga real das 393 questões — o vínculo questão↔fonte específica que o usuário já tem pronto em `banco-questoes.json` (campo `referencias`) está sendo descartado. Corrigir é um script incremental (não precisa recarregar as questões, só popular as tabelas de referência para as questões já existentes), mas exige primeiro decidir se vale investir em exibir isso na UI (ver P2).

**P2 — experiência do usuário / consistência de produto:**
4. Nenhuma UI exibe citação pontual por afirmação/questão, mesmo quando o dado existir — decisão de produto pendente (vale a pena expor isso ao estudante, ou é só rastreabilidade editorial interna?).
5. Formulário de criação manual de questões no CMS tem 4 campos de alternativa, não 5 — divergência de padrão para conteúdo novo daqui pra frente.
6. Bug do `srsAlgorithm.ts` (`reviewHistory` de `currentSRS` nulo) — pode quebrar a primeira revisão de flashcards novos.
7. Aba Flashcards do admin não permite criar/editar/importar, só listar e excluir.

**P3 — cosmético / documentação:**
8. `docs/architecture/migration-roadmap.md` desatualizado (só descreve a "Etapa 1").
9. 9 docx + 5 pdf de compêndios no próprio acervo nunca digitalizados para HTML — decisão do usuário sobre se vale converter.
10. Casos Clínicos (165 arquivos) como acervo não integrado — decisão de escopo de produto, não bug.

## 11. Sugestões críticas e criativas ligadas aos achados

- **Sobre referências (achado 3/4)**: em vez de tentar curar `sources` retroativamente para as 393 questões de uma vez, um script poderia popular `question_references` automaticamente casando o campo `referencias` de cada questão (que já usa os IDs de `fontes.json`) contra a tabela `sources` — é uma migração de dado mecânica, sem trabalho editorial novo, que resgata um investimento que já foi feito na fonte e está sendo jogado fora silenciosamente.
- **Sobre a questão demonstrativa (achado 1)**: se a decisão for manter algum tipo de conteúdo de exemplo/onboarding no produto, vale criar isso como um fluxo de produto deliberado (ex.: um tour guiado ou uma questão de "aquecimento" claramente marcada como tal na UI), em vez de depender de um `seed.sql` cuja função original é só popular ambiente de desenvolvimento local — reduz o risco de recorrência do mesmo tipo de vazamento acidental.
- **Sobre o formulário de 4 alternativas (achado 5)**: alinhar o formulário ao padrão real do banco (5 alternativas) é uma mudança pequena e evita que o acervo comece a ter dois "formatos" de questão coexistindo sem que ninguém tenha decidido isso deliberadamente.
- **Sobre o ciclo de feedback (achado do workflow)**: hoje o link estudante→admin já existe (reação + popover); o próximo passo natural e de baixo custo seria a aba Feedback também mostrar, ao lado de cada item, se aquela questão/compêndio tem correções históricas registradas em `correcoes.json`/`question_corrections` — hoje são dois sistemas de histórico editorial paralelos (um no acervo/JSON, outro na tabela do banco) sem visibilidade cruzada.

---

## 12. Complemento de verificação — 2026-09-07, sessão 2 (Prompt 02 — Complemento)

Esta seção foi adicionada numa segunda sessão executiva, no mesmo dia, para confirmar por leitura direta o que a sessão anterior não conseguiu acessar. **Nada do texto acima foi apagado ou reescrito** — o que muda de conclusão está marcado explicitamente aqui, com data e grau de certeza.

### 12.1 Acesso ao Supabase remoto — desta vez funcionou

Ao contrário da sessão anterior (bloqueada pelo classificador automático em modo de execução em segundo plano), nesta sessão o comando `supabase db query --linked` (estritamente leitura) executou normalmente. Três consultas rodadas em 2026-09-07, todas de leitura, sem exposição de credenciais ou dados pessoais:

**Consulta 1 — questão demonstrativa de seed:**
```sql
select question_stem, status, (select count(*) from question_options where question_id = questions.id) as n_options
from questions
where question_stem ilike '%demonstrativa%' or question_stem ilike '%seed%';
```
Resultado: **0 linhas**. **CONFIRMADO (grau de certeza: alto, consulta direta): a questão demonstrativa de `seed.sql` NÃO está no banco remoto de produção.** O item P0.1 do plano de correção está resolvido — não por correção, mas porque o risco nunca se concretizou.

**Consulta 2 — distribuição do número de alternativas por questão, banco inteiro (draft + published, sem filtro de status):**
```sql
select n_options, count(*) as n_questions
from (select question_id, count(*) as n_options from question_options group by question_id) sub
group by n_options order by n_options;
```
Resultado: **uma única linha — `n_options = 5, n_questions = 393`.** **CONFIRMADO (grau de certeza: alto): as 393 questões no banco remoto têm, sem exceção, exatamente 5 alternativas.** Não existe nenhuma questão com 2, 3 ou 4 alternativas no banco de produção, publicada ou rascunho. Isso fecha definitivamente a hipótese de perda de dado na importação ou na exibição.

**Consulta 3 — migration de feedback contextual (objetos esperados):**
```sql
select version from supabase_migrations.schema_migrations order by version desc limit 5;
select column_name, data_type from information_schema.columns where table_schema='public' and table_name='feedback' and column_name in ('question_id','material_id','status');
select policyname from pg_policies where tablename='question_reactions';
```
Resultado: `20260907130000` (a migration de feedback contextual) é a **versão mais recente aplicada** no remoto; a tabela `feedback` já tem as colunas `question_id`/`material_id`/`status`; a tabela `question_reactions` existe com as 2 políticas RLS esperadas (`question_reactions_owner_all`, `question_reactions_admin_select_all`). **CONFIRMADO (grau de certeza: alto): a migration está aplicada e os objetos batem com o que o código do app espera.** O item P0.2 do plano de correção também está resolvido — a funcionalidade de feedback/reações está operacional em produção, não quebrada.

**Conclusão prática**: os dois itens P0 do relatório original eram, de fato, os de maior incerteza — e ambos se resolveram como "nenhum problema real", não como "problema confirmado". Isso não invalida o valor de tê-los levantado (o risco era real e barato de descartar), mas muda a priorização: não há mais nenhum item P0 pendente nesta auditoria.

### 12.2 De onde vêm então as "questões com 3 alternativas" que o usuário viu na captura de tela

Com o banco remoto descartado como causa (seção 12.1), a hipótese 2 do Prompt 02 — origem local/cache/fallback — foi investigada por leitura de código:

- `src/repositories/QuestionsRepository.ts` define `ResilientQuestionsRepository`, que tenta o Supabase e **cai para `LocalStorageQuestionsRepository` (dado local do navegador) se a chamada falhar OU se vier uma lista vazia** (`res.length > 0 ? res : this.local.getQuestions()`). Esse fallback local lê `StorageService.getQuestions()`, cujo valor padrão (quando o `localStorage` do navegador está vazio) é `INITIAL_QUESTIONS`, um array de **5 questões mockadas** em `src/data/mockData.ts` (`q-cardio-01`, `q-pneumo-01`, `q-infecto-01`, `q-farmaco-01`, `q-gastro-01`).
- **Essas 5 questões mockadas têm, cada uma, exatamente 4 alternativas (A–D), não 3, e nenhuma delas tem o enunciado de insuficiência cardíaca com hepatomegalia/turgência jugular/ascite** que o usuário descreveu na captura — a `q-cardio-01` mockada é sobre otimização terapêutica de ICFEr (Enalapril/Carvedilol/Espironolactona/Dapagliflozina), um caso clínico diferente. **Portanto, o fallback local/mock NÃO explica nem o número de alternativas (4, não 3) nem o conteúdo específico da captura.**
- Busquei por qualquer `slice`/corte de array aplicado à lista de alternativas em toda a base de código (`options.slice`, `alternativas.slice`) — **nenhuma ocorrência**. Os únicos `slice(0, N)` do projeto são em listas não relacionadas (disciplinas no simulado, conquistas no dashboard, iniciais no avatar do cabeçalho).
- **O enunciado exato da captura** ("paciente com insuficiência cardíaca... hepatomegalia dolorosa... turgência jugular... ascite") **corresponde a uma questão real do banco** (`Questões\_banco\banco-questoes.json`, tema Insuficiência Cardíaca, fonte "Casos Clínicos/tutorial/Cardiologia/Caso 4.docx") — e essa questão real tem **5 alternativas completas** (confirmado tanto na fonte quanto, agora, na consulta 2 acima, que cobre literalmente essa questão dentro do total de 393).

**Conclusão, com grau de certeza correspondente:**
- **Alto grau de certeza**: a questão em si, no banco (fonte e produção), tem 5 alternativas. Não há perda de dado.
- **Não verificado / hipótese, não fato**: a causa mais provável de a captura de tela mostrar só A–C é um **recorte de tela que não capturou as alternativas D e E abaixo da dobra** (rolagem), possivelmente relacionado ao mesmo layout mobile que outra sessão está corrigindo agora no `Header.tsx` — mas isso **não foi confirmado**, porque não abri o app real no dispositivo do usuário nem inspecionei o CSS do cabeçalho (fora do escopo desta auditoria, por instrução explícita de não interferir nessa correção em andamento). **Recomendação prática**: pedir ao usuário para repetir a captura rolando a tela até o fim das alternativas antes de concluir que há um bug de exibição — se D e E aparecerem ao rolar, o caso está encerrado sem necessidade de mudança de código.

### 12.3 Correspondência completa dos 33 compêndios com os 10 temas de questão — e uma correção importante ao relatório original

Reli o campo `sections[].title`, `discipline_hint`, `theme_hint` e uma varredura de palavras-chave no corpo de texto (não só título) dos 33 JSONs, cruzando com os 10 temas de `banco-questoes.json`. **Achado que corrige o relatório original**: a lista de "10 disciplinas de compêndios" da sessão anterior vinha da pasta de TOPO de cada HTML (ex.: `Cardiologia`, `Hematologia`), mas várias pastas de topo têm uma subpasta `Farmacologia` interna (`Cardiologia\Farmacologia\`, `Hematologia\Farmacologia\`, `Infectologia\Farmacologia\`) — o que faz **três compêndios de farmacologia real existirem no acervo, só que classificados, no software, pela disciplina da pasta de TOPO (Cardiologia/Hematologia/Infectologia), nunca como "Farmacologia"**, porque `load-compendios.ts` deriva a disciplina da pasta de nível mais alto, não da subpasta nem do `discipline_hint` do JSON (decisão de arquitetura documentada no próprio script).

| Tema de questão | Compêndio candidato (arquivo) | Cobertura | Evidência |
|---|---|---|---|
| Farmacologia :: Hipertensão Arterial e SRAA (38 questões) | `hipertensao-sraa-e-anti-hipertensivos.json` (pasta `Cardiologia\Farmacologia\`) | **VERIFICADA — correspondência forte** (título quase idêntico; seções cobrem SRAA, IECA, BRA, diuréticos, betabloqueadores, BCC) | Seções do JSON listadas nesta sessão; `discipline_hint` do próprio JSON também diz "Cardiologia" |
| — (sem tema de questão específico, mas subject-matter de Farmacologia) | `antiagregantes-anticoagulantes-e-tromboliticos.json` (pasta `Hematologia\Farmacologia\`) | Compêndio de farmacologia real e detalhado (AAS, clopidogrel, heparina, varfarina, trombolíticos) — **é o material que aparece no app como "Antiagregantes, Anticoagulantes e Trombolíticos" sob Hematologia** (ver seção 12.4) | `discipline_hint` do próprio JSON diz "Farmacologia", mas a pasta de topo é `Hematologia` |
| Neurocirurgia :: Tumores do Sistema Nervoso Central (70 questões, maior tema do banco) | `tumores-do-sistema-nervoso-central.json` (pasta `Neurologia\Clínica\`) | **VERIFICADA — correspondência muito forte** (compêndio extenso: epidemiologia, apresentação clínica, classificação, astrocitoma/glioma/GBM/meningioma/meduloblastoma, regime de Stupp, e até uma seção final "Praticar questões") — **mas classificado no software como disciplina "Neurologia", não "Neurocirurgia"**, porque a pasta de topo é `Neurologia` (o próprio `discipline_hint` do JSON diz "Neurologia e Neurocirurgia", um valor composto que o loader não usa) | Seções do JSON; caminho `Neurologia\Clínica\tumores-do-sistema-nervoso-central.html` |
| Pneumologia :: Tosse Crônica e Hemoptise (24 questões) | `sindromes-bronco-pleuro-pulmonares.json` | **PARCIAL** — cobre semiologia respiratória geral (asma, DPOC, derrame pleural, pneumotórax) mas não tem seção dedicada a "tosse crônica" nem "hemoptise" como síndromes específicas | Lista de seções extraída nesta sessão |
| Pneumologia :: Espirometria e Função Pulmonar (27 questões) | nenhum dos 33 | **AUSENTE confirmado** — o único compêndio de Pneumologia não menciona espirometria/VEF1/capacidade vital em nenhum ponto do texto (varredura de palavra-chave no corpo inteiro, não só título) | Varredura de keywords nesta sessão |
| Cardiologia :: Insuficiência Cardíaca (40 questões reais) | nenhum dedicado; `semiologia-cardiaca.json` cobre os SINAIS (B3, turgência jugular, sopros) | **PARCIAL** — semiologia da IC está bem coberta; fisiopatologia e tratamento farmacológico da IC (o que a maioria das 40 questões cobra) não tem compêndio dedicado | Varredura de keywords + leitura de seções |
| Infectologia :: Endocardite Infecciosa (52 questões) | nenhum dos 33 (só menções tangenciais em `anatomia-cardiaca`, `doencas-circulatorias`, `semiologia-cardiaca`) | **AUSENTE confirmado** (corrige/confirma o relatório original) | Varredura de keywords |
| Radiologia :: Radiografia de Tórax Básica (18 questões) | nenhum dos 33 (menção tangencial só em `sindromes-bronco-pleuro-pulmonares`) | **AUSENTE confirmado** | Varredura de keywords |
| Fisiologia e fisiopatologia :: Distúrbios de Sódio e Água (24 questões) | nenhum dos 33 (`avaliacao-da-funcao-renal.json` cobre TFG/creatinina, não sódio/água) | **AUSENTE confirmado** | Leitura de seções |
| Farmacologia :: Antimicrobianos, fundamentos (76 questões) | `antifungicos.json` cobre só a fatia antifúngica; nenhum compêndio cobre antibacterianos/betalactâmicos | **PARCIAL/AUSENTE em grande parte** — a maior massa de questões de Farmacologia (76 de 114) segue sem material teórico correspondente | Leitura de seções |
| Gastroenterologia :: Endoscopia Digestiva (24 questões) | nenhum dos 33 | **AUSENTE confirmado** | Varredura de keywords |

**Achado estrutural mais importante desta seção**: a disciplina de um MATERIAL no software vem da pasta física onde o HTML mora; a disciplina de uma QUESTÃO vem de um campo de classificação independente (`classificacao.disciplina` em `banco-questoes.json`). As duas taxonomias foram construídas em momentos e por processos diferentes e **não foram nunca reconciliadas** — por isso conteúdo real sobre o mesmo assunto (farmacologia da hipertensão, farmacologia da hemostasia, tumores do SNC) acaba classificado sob rótulos de disciplina diferentes dos usados pelas questões equivalentes. Isso é mais amplo do que o achado original "Farmacologia: 0 compêndios" — não é ausência de conteúdo, é **desalinhamento de taxonomia**, e provavelmente afeta outros pares tema/compêndio além dos listados aqui (esta tabela cobre os 10 temas de questão contra os 33 compêndios; não foi feita a via inversa exaustiva — os 33 compêndios contra todas as combinações possíveis de disciplina).

### 12.4 Reconciliação do achado "Farmacologia: zero compêndios" com o que aparece no aplicativo

O usuário reportou ver, no aplicativo, um material chamado **"Antiagregantes, Anticoagulantes e Trombolíticos"**, classificado sob **Hematologia**, com subtítulo **"Farmacologia · Hemostasia e Coagulação · Rang & Dale · 2024"**.

**Confirmado por leitura direta**: existe exatamente esse compêndio na extração (`antiagregantes-anticoagulantes-e-tromboliticos.json`), com `title: "Antiagregantes, Anticoagulantes e Trombolíticos"` e `discipline_hint: "Farmacologia"` — mas o arquivo físico está em `Biblioteca\Medicina\Hematologia\Farmacologia\antiagregantes-anticoagulantes-e-tromboliticos.html`. Como `load-compendios.ts` usa a pasta de TOPO (`Hematologia`) como disciplina de carga, **o material foi corretamente extraído e provavelmente carregado como disciplina "Hematologia" no banco**, exatamente como o usuário viu na tela — o subtítulo "Farmacologia · Hemostasia e Coagulação..." é só um texto descritivo dentro do card, não o campo de classificação real.

**Determinação, com grau de certeza**: isto é **classificação cruzada confirmada por leitura de código e dado de origem** (grau de certeza alto) — não é lacuna real de conteúdo (o material existe e está correto), não é diferença de versão, e não é limitação de acesso. É uma decisão de arquitetura (derivar disciplina da pasta de topo) que produz um resultado organizacionalmente inconsistente quando o acervo aninha subpastas temáticas (`Farmacologia`) dentro de pastas de disciplina "anatômica" (`Hematologia`, `Cardiologia`, `Infectologia`). **Isso também explica, ao menos parcialmente, o achado original "Farmacologia: 0 compêndios"** — a contagem de disciplinas do inventário original olhou só para a pasta de topo (correto para saber o que o LOADER vai classificar como "Farmacologia"), mas não para o conteúdo temático real, que existe, só que rotulado de outro jeito.

### 12.5 Os 9 DOCX + 5 PDF — distintos, versões alternativas ou duplicatas?

Lista completa (confirmada nesta sessão, corrigindo a contagem para exatidão de caminho):

| Arquivo | Situação |
|---|---|
| `Cardiologia\Clínica\Endocardite Infecciosa.docx` | **Conteúdo distinto**, sem equivalente nos 33 — é a fonte candidata para preencher a lacuna de "Infectologia :: Endocardite Infecciosa" (52 questões) |
| `Cardiologia\Clínica\Febre Reumática.pdf` | **Conteúdo distinto**, sem equivalente nos 33 nem tema de questão correspondente hoje |
| `Farmacologia e farmacoterapia da asma.docx` | **Conteúdo distinto** — nota organizacional: está solto na raiz de `Biblioteca\Medicina`, fora de qualquer pasta de disciplina, diferente do padrão dos outros 32 |
| `Infectologia\Antimicrobianos.docx` | **Provável duplicata/mesma fonte** que o próximo item (ver nota abaixo) |
| `Infectologia\Farmacologia\Antimicrobianos.pdf` | **Provável duplicata/mesma fonte** que o item anterior — mesmo `LastWriteTime` exato (01/09/2026 10:50:36) para os dois arquivos, nomes idênticos, pastas irmãs (`Infectologia\` vs `Infectologia\Farmacologia\`); consistente com "mesmo documento exportado em dois formatos". **Não confirmado por leitura de conteúdo** (arquivos binários não comparados byte a byte nem por texto extraído) — grau de certeza médio, não alto. Se confirmado, é a fonte candidata para "Farmacologia :: Antimicrobianos, fundamentos" (76 questões, hoje só parcialmente coberto por `antifungicos.json`) |
| `Infectologia\Clínica\Leishmaniose.pdf` | **Conteúdo distinto**, sem equivalente nos 33 nem tema de questão correspondente hoje |
| `Infectologia\Infecções hospitalares.docx` | **Conteúdo distinto** |
| `Infecção no sitio cirurgico.docx` | **Conteúdo distinto** — nota organizacional: solto na raiz, fora de pasta de disciplina |
| `Nefrologia\Diagnóstico\Interpretação de Exame de Urina Tipo 1.pdf` | **Conteúdo distinto**, sem equivalente nos 33 |
| `Nefrologia\Fisiologia\Equilíbrio Ácido-Base.pdf` | **Conteúdo distinto, mas tematicamente adjacente** ao tema "Distúrbios de Sódio e Água" (24 questões) — ácido-base e sódio/água são eixos de fisiopatologia renal relacionados mas não idênticos; não cobre o tema diretamente |
| `Pneumologia\Diagnóstico\Prova de Função Pulmonar.docx` | **Conteúdo distinto — é a fonte candidata exata** para a lacuna confirmada "Pneumologia :: Espirometria e Função Pulmonar" (27 questões, seção 12.3) |
| `Pneumologia\Pneumonia.docx` | **Conteúdo distinto**, sem tema de questão correspondente hoje |
| `Pneumologia\Semiologia\dispneia-diagnostico-diferencial.docx` | **Conteúdo distinto**, tematicamente adjacente a "Tosse Crônica e Hemoptise" e a "Insuficiência Cardíaca" (diagnóstico diferencial de dispneia toca as duas) |
| `Quarto caso clínico - Nefrologia.docx` | **Provavelmente misclassificado** — pelo nome ("caso clínico"), parece pertencer ao acervo de Casos Clínicos (seção 12.6), não ao de compêndios teóricos; solto na raiz de `Biblioteca\Medicina` |

**Nenhum dos 14 tem título coincidente com os 33 já extraídos** — nenhum é duplicata do que já está no software (confirmado por comparação de nome, não de conteúdo integral).

### 12.6 Casos Clínicos — arquivos vs. casos únicos, e proposta de experiência

**Contagem de arquivos ≠ contagem de casos.** Dos 165 arquivos originalmente reportados, uma quantidade grande é estrutura de apoio, não conteúdo clínico:
- **~66 arquivos são internos de 2 repositórios Git aninhados** (`Anamnese e Exame Físico\.git\*` e `tutorial\.git\*` — hooks de amostra, objects, refs, HEAD, index) — não são conteúdo, são metadados de versionamento. **Achado colateral, fora do escopo desta auditoria de conteúdo, mas vale registrar**: ter dois repositórios Git completos aninhados dentro de uma árvore sincronizada pelo OneDrive é incomum e pode gerar conflito de sincronização; não foi investigado a fundo aqui.
- **~9 arquivos são documentação/governança** (`CLAUDE.md` e variantes em `_archive`, `PADRAO-CASOS-CLINICOS.md`, `AUDITORIA-PRIVACIDADE-CASOS-CLINICOS-2026-08-29.md`, `CHECKLIST-INTEGRIDADE-E-PRIVACIDADE.md`, `.gitignore`).
- **6 arquivos são imagens** de apoio a 2 casos específicos (endocardite, pneumotórax).
- **5 arquivos são material de referência/técnica de exame** (`Anamnese e Exame Físico\Dados\*.pdf` — roteiros de exame físico por sistema, não casos em si).
- **Múltiplos arquivos representam o MESMO caso em formatos diferentes** (docx de trabalho + pdf final + versão digitalizada em html) — ex.: "Hipóxia de Altitude - Tutorial 1" existe como `.docx` + `.pdf` + `estudo-mal-agudo-da-montanha.html` (3 arquivos, 1 caso).

**Contagem de casos clínicos únicos, por amostragem identificada** (contagem por padrão de nomenclatura "Caso N"/"Tutorial N"/"Problema N", não confirmada célula a célula):
- Cardiologia: ~4 casos (Valvopatia Aórtica Mista=1, Estenose Mitral=2, Endocardite=3, Insuficiência Cardíaca=4) — o Caso 3 (Endocardite) e o Caso 1 (Valvopatia) já têm versão HTML digitalizada.
- Infectologia: ~3 casos (Caso 4, Pneumonia, ITU complicada por ESBL — este último já digitalizado em HTML).
- Nefrologia: ~4-5 casos (Avaliação da Função Renal, Acidose Metabólica=3, Hipovolemia/hipernatremia=4, e um "Quarto caso clínico.docx" cujo título sugere ser o MESMO caso 4 em arquivo separado — **possível duplicata, não confirmada por leitura de conteúdo**, mais "Quinto caso.docx").
- Pneumologia: ~4 casos (Hipóxia de Altitude/Problema5 — já digitalizado, Pneumotórax=2, **Tosse Crônica e Hemoptise=3** — ver achado abaixo, e um "Caso 4.docx" de tópico não confirmado).
- `casos-reais`: 2 casos já em HTML pronto (Endocardite Infecciosa com AVC Embólico; Infecção pós-quadricepsplastia).
- Anamnese e Exame Físico: 1 caso completo de anamnese real (paciente nomeado — ver nota de privacidade abaixo).

**Total estimado: ~16-18 casos clínicos únicos**, não 165 — a maioria do "volume" reportado originalmente era estrutura de repositório, não conteúdo.

**Achado de alto valor**: `tutorial\Pneumologia\Tosse Crônica e Hemoptise - Tutorial 3.pdf` é um caso-tutorial inteiro dedicado exatamente ao tema "Pneumologia :: Tosse Crônica e Hemoptise" (24 questões, cobertura hoje só PARCIAL via `sindromes-bronco-pleuro-pulmonares.json` — seção 12.3). Esse caso é uma fonte direta e pronta para fechar essa lacuna com um caso clínico completo, não só um compêndio teórico genérico.

**Amostra de conteúdo avaliada**: abri `casos-reais\endocardite-infecciosa-avc-embolico.html` — usa o mesmo template rico dos 33 compêndios (barra lateral com seções, blocos de pergunta motivadora, "kbox" de pontos-chave, "qa-block" de perguntas e respostas, tabelas de dados, seção de controvérsias). É um formato já pronto para virar uma experiência interativa, não um documento estático.

**Nota de privacidade, não aprofundada**: o caso de Anamnese e Exame Físico é nomeado com uma pessoa real ("Maria Aparecida Molina Gomes") e já existe um arquivo próprio de auditoria de privacidade na mesma pasta (`Auditoria - Maria Aparecida Molina Gomes (2026-08-29).md`, `AUDITORIA-PRIVACIDADE-CASOS-CLINICOS-2026-08-29.md`) — sinal de que essa questão já foi tratada antes; não reaberta nesta auditoria.

**Proposta de experiência de resolução progressiva (proposta de produto, não implementação — nenhum acervo foi migrado ou reescrito nesta etapa):**

1. **Estrutura em camadas reveláveis**, reaproveitando o padrão que os próprios HTML de caso já usam (`.pergunta`/pergunta motivadora no início, `.kbox`/pontos-chave, `.qa-block`): apresentar a vinheta clínica primeiro, com os achados indo sendo revelados em etapas (anamnese → exame físico → exames complementares → conduta), cada etapa travada até o estudante registrar uma hipótese — o mesmo princípio de "recall antes de revelar" que o `QuestionCard.tsx` já implementa para questões (`answerMode: 'open_recall'`), aplicado a um caso inteiro em vez de uma pergunta isolada.
2. **Vínculo automático a questões e compêndios existentes**: cada caso já cita, na fonte (`banco-questoes.json`, campo `fonte`), o arquivo de caso clínico do qual a questão derivou (ex.: "Casos Clínicos/tutorial/Cardiologia/Caso 4.docx" para várias das 40 questões de Insuficiência Cardíaca). Isso significa que **o vínculo caso↔questão já existe como dado, só não está estruturado nem exposto** — um caso resolvido poderia, ao final, sugerir automaticamente as questões que derivam dele como prática dirigida, sem precisar de curadoria manual nova.
3. **Vínculo a flashcards**: ao final de um caso, oferecer a geração de flashcard nos mesmos moldes de `createFlashcardFromQuestion` (já existente), mas a partir do "pérola" ou "kbox" de fechamento do caso, não de uma questão de múltipla escolha — reaproveita a infraestrutura de SRS já implementada (seção 5 do relatório original) para um tipo de conteúdo novo.
4. **Não recomendado nesta etapa**: migrar os 165 arquivos de uma vez. Recomenda-se um piloto com 1-2 casos já digitalizados em HTML (`casos-reais\endocardite-infecciosa-avc-embolico.html` é o candidato mais pronto, já no formato certo) para validar a experiência antes de decidir se vale converter o resto.

---

*(A matriz de cobertura completa, com o complemento de verificação, está em `MATRIZ-COBERTURA-NEXUSMED-2026-09-07.md`. O plano de correção atualizado está em `PLANO-CORRECAO-NEXUSMED-2026-09-07.md`, ambos na mesma pasta.)*
