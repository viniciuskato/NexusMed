# Fundação Supabase — Esquema e Segurança (Etapa 1 + Schema v2)

> Estado desta etapa: **fundação local, não conectada ao frontend, sem projeto remoto**.
> Firebase Authentication, Firestore e Firebase Hosting continuam sendo a stack em produção.
> Nada neste documento está ativo na aplicação React atual.
>
> **Schema v2** (`20260904140000_schema_v2_conteudo_real.sql`): estende o
> schema da Etapa 1 com as tabelas/colunas exigidas pela auditoria
> campo-a-campo contra os arquivos-fonte reais da Base de Estudos
> (`banco-questoes.json`, `fontes.json`, `correcoes.json`). É só schema —
> nenhum dado real foi migrado nesta rodada.

## 1. Escopo

Modelagem PostgreSQL para Supabase cobrindo:

- Biblioteca médica (disciplinas, temas, materiais, seções, referências, ativos de conteúdo);
- Banco de questões com gabarito protegido;
- Simulados;
- Progresso de leitura, favoritos, anotações;
- Flashcards + SRS (estado atual separado do histórico de revisões);
- Caderno de erros;
- Feedback;
- Perfis, aprovação e controle administrativo.

**Casos Clínicos não existe neste esquema** — módulo removido definitivamente do produto, confirmado por auditoria do código-fonte atual (nenhum componente/tipo/rota relacionado).

## 2. Convenções gerais

- `uuid` com `gen_random_uuid()` (extensão `pgcrypto`) como chave primária em todas as tabelas.
- `auth.users` é a origem única de identidade; `profiles.id` referencia `auth.users.id`.
- `timestamptz` para todas as datas; `created_at`/`updated_at` onde há sentido de ciclo de vida.
- `CHECK` no lugar de `enum` do Postgres — mais simples de alterar sem migração de tipo.
- `ON DELETE` explícito em toda FK (tabela em `20260903120000_initial_schema.sql`).
- Nenhum arquivo binário no Postgres — `content_assets` guarda metadados; o binário fica no Supabase Storage.
- Colunas que seriam palavra reservada (`order`) foram renomeadas para `sort_order`.

## 3. Tabelas

### 3.1 Conteúdo editorial (`disciplines`, `themes`, `materials`, `material_sections`, `material_references`, `questions`, `question_options`, `content_assets`)

Status editorial (`draft` / `published` / `archived`) existe em `materials` e `questions`. Leitura pública (para usuários `active`) é restrita a `status = 'published'`; admin `active` lê e escreve tudo.

### 3.2 Gabarito protegido (`question_answer_keys`, `question_option_keys`)

Separadas de `questions`/`question_options` propositalmente: **nenhuma policy de `SELECT` existe para estudante** nessas duas tabelas. O único caminho para um estudante conhecer o gabarito é a função `submit_question_attempt` (RPC, `SECURITY DEFINER`), que:

1. valida que a questão existe e está `published`;
2. valida que o usuário chamador está `active`;
3. valida que a alternativa pertence à questão;
4. calcula `is_correct` no servidor (nunca aceita esse valor do cliente);
5. grava a tentativa e, se errada, o item no caderno de erros;
6. só então retorna, em JSON, `is_correct`, `correct_option_id`, a explicação de **cada** alternativa da questão respondida, `general_commentary` e `high_yield_summary`.

`question_option_keys.question_id` é uma coluna redundante em relação a `question_options.question_id`, necessária para viabilizar o índice único parcial `question_option_keys_one_correct_per_question` (garante **no máximo** 1 alternativa correta por questão, rejeitando a segunda tentativa já no `INSERT`/`UPDATE`). Ela é sempre preenchida por trigger a partir de `option_id` — nunca aceita diretamente do cliente.

**Criação automática de `question_option_keys`** (trigger `trg_create_question_option_key`, `AFTER INSERT ON question_options`): toda alternativa inserida ganha imediatamente uma linha correspondente em `question_option_keys` com `is_correct=false` e `explanation=''`. Isso existe para que `publish_question` sempre encontre exatamente 1 key por opção sem depender de um segundo `INSERT` manual separado (uma inconsistência real foi encontrada em auditoria: fixtures/seed que assumiam essa linha existente e faziam `UPDATE` sobre ela, quando na verdade nada a havia criado). A função é trigger-only, sem RPC pública, e só executa depois que `trg_guard_question_options_immutable` (BEFORE INSERT) já validou que a questão não está `published`/`archived` — criar opção em questão travada continua bloqueado antes desta trigger ser alcançada.

Garantir **pelo menos** 1 alternativa correta, que `question_option_keys` tenha exatamente uma linha por opção (`option_key_count = option_count`), que nenhuma explicação esteja vazia e que `question_answer_keys.general_commentary`/`.high_yield_summary` não estejam vazios é responsabilidade de `publish_question(uuid)` — ver seção 5.

### 3.3 Dados pessoais

`reading_progress`, `bookmarks`, `notes`, `question_attempts`, `simulations` + `simulation_questions` + `simulation_answers`, `flashcards` + `flashcard_srs_state` + `flashcard_reviews`, `error_notebook`, `feedback`.

- `bookmarks`/`notes` usam FKs reais (`material_id`/`question_id`/`flashcard_id`/`material_section_id`, todas nullable) com `CHECK (num_nonnulls(...) = 1)` em vez de um par `target_type`/`target_id` sem integridade referencial.
- `simulations.question_ids` (que seria um array solto) foi normalizado em `simulation_questions` (tabela associativa com `UNIQUE(simulation_id, question_id)` e `UNIQUE(simulation_id, position)`); `simulation_answers` referencia `simulation_question_id` (não `question_id` diretamente), o que prova estruturalmente que a alternativa respondida pertence ao simulado — reforçado por uma trigger que confere se `selected_option_id` é de fato da mesma questão do `simulation_questions` referenciado.
- `flashcard_srs_state` (estado atual do algoritmo) fica separado de `flashcard_reviews` (histórico de revisões), conforme pedido.
- `question_attempts` e `error_notebook` não têm `INSERT`/`UPDATE` liberado diretamente para `authenticated` — só a RPC `submit_question_attempt` grava neles (roda como `postgres`, dono das funções, contornando a ausência de GRANT). Exceção pontual: o dono pode atualizar `error_notebook.resolved`/`.user_notes` diretamente (GRANT de coluna), nunca `correct_option_id`.

### 3.4 `content_assets`

FKs reais (`material_id`, `material_section_id`, `question_id`, todas nullable, `CHECK` de exatamente um preenchido). Para evitar referência circular com `material_sections`, a "imagem principal de uma seção" é modelada como `content_assets.is_primary = true` com `material_section_id` apontando para a seção (índice único parcial garante no máximo uma primária por seção) — `material_sections` não tem nenhuma coluna apontando de volta para `content_assets`.

Desde o Schema v2, `storage_path` é **nullable** e convive com `external_url`
(`CHECK (num_nonnulls(storage_path, external_url) = 1)`): um ativo está
**ou** no Supabase Storage **ou** é hotlinked de uma fonte externa (comum em
compêndios reais — imagens do Wikimedia Commons com licença já documentada
por imagem), nunca as duas coisas. Colunas novas: `caption` (legenda
visível, diferente de `alt_text`, que é acessibilidade), `rights_status`,
`privacy_verified`, `modifications`, `notes`.

### 3.5 Bibliografia (`sources`, `question_references`)

`sources` é a bibliografia compartilhada (`id` textual, ex.:
`delgado2023-esc-endocardite`) — `tipo` e `verificacao` são `CHECK` fechados
(11 e 6 valores respectivamente, confirmados exaustivamente contra os 87
registros reais de `fontes.json`); `identificadores` é `jsonb` livre porque
o conjunto de chaves varia por fonte (doi, pmid, pmcid, isbn, bookshelfId,
url, elocation, e até chaves ad-hoc de uma única fonte). `substituida_por`
é auto-FK para uma fonte obsoleta apontar para a substituta — **ver
cabeçalho da migration `20260904140000_...` para um achado de auditoria**:
no único registro real dessa relação hoje, o valor gravado é a citação
completa da obra substituta (ainda não cadastrada como fonte própria), não
um id; isso é uma decisão de dado a resolver na migração de conteúdo, não
no schema.

`question_references` é o join estruturado `questions` ↔ `sources`
(substitui/complementa texto solto), com leitura condicionada à mesma regra
de `questions` (published + active, ou admin) e escrita só admin.
`material_references` ganhou uma coluna opcional `source_id` (nullable, não
quebra o `citation_text` existente) para o mesmo vínculo em materiais.

### 3.6 Metadados editoriais novos em `questions`

`subtema`, `disciplinas_relacionadas` (texto livre/array); `competencia`,
`contexto` e `complexidade` são `CHECK` fechados (6, 3 e 3 valores,
confirmados contra as 393 questões reais do banco); `editorial_state`
mapeia o campo de topo `estadoEditorial` do banco real (`CHECK` fechado,
4 valores) — **não** confundir com o campo mais granular
`auditoriaEditorial.status`, que vai dentro de `audit_trail` (jsonb, sem
`CHECK`, pois é um enum de workflow interno mais aberto). `provenance_metadata`
(jsonb) mapeia `proveniencia`; renomeada em relação ao pedido original
porque `questions.provenance` (texto livre, Etapa 1) já existe com outro
sentido. `evidence` e `quality_checklist` (jsonb) mapeiam `evidencia` e
`qualidadeDoItem`. Todas nullable — nenhuma quebra os 65 testes/fixtures
da Etapa 1.

### 3.7 `question_corrections`

Histórico de correções editoriais (mapeia `correcoes.json`). RLS: leitura e
escrita só admin — é trilha de auditoria editorial, não conteúdo para o
estudante ver (decisão documentada no cabeçalho da migration, com
alternativa considerada e descartada). Achado de auditoria: o arquivo-fonte
real tem duas listas com formatos diferentes; a canônica (95 registros,
chaves em português) não usa a maior parte das colunas de versionamento
pedidas (`previous_version`/`new_version`/`impact_level`/`impact_summary`)
— mantidas nullable porque acomodam também o formato alternativo observado
em 1 registro. `before_snapshot`/`after_snapshot` recebem os pares
`de`/`para` (arrays de alternativas) quando existirem.

## 4. Perfis e controle de acesso

`profiles(id, email, display_name, avatar_url, role, status, created_at, updated_at)`. Novo usuário sempre nasce `role='student'`, `status='pending'` — só a trigger `handle_new_user` (em `auth.users`) cria o registro, ignorando qualquer `role`/`status` vindos de `raw_user_meta_data`.

### Proteção de campos (sem GUC/flag arbitrária)

Duas camadas independentes:

1. **Privilégio de coluna**: `REVOKE UPDATE ON profiles FROM authenticated; GRANT UPDATE (display_name, avatar_url) TO authenticated;` — bloqueia fisicamente qualquer tentativa de alterar `id`/`email`/`role`/`status`/`created_at` antes mesmo de qualquer trigger rodar.
2. **Trigger `protect_profile_fields`** (defesa em profundidade, `SECURITY INVOKER` — não `DEFINER`, para que `current_user` reflita quem de fato emitiu o `UPDATE`): rejeita qualquer mudança em `role`/`status` a menos que `current_user = 'postgres'`. Isso não é um flag setável pelo cliente — é a identidade real de execução do Postgres, que só assume o valor `postgres` quando uma função `SECURITY DEFINER` de propriedade de `postgres` (como `admin_set_profile_status`) está no controle da transação. Um cliente autenticado via PostgREST nunca é `postgres`.

`profiles.email` é um **snapshot** de `NEW.email` capturado em `handle_new_user` no momento do cadastro — não há sincronização automática com mudanças posteriores de e-mail em `auth.users` nesta etapa (deliberadamente adiado; ver `migration-roadmap.md`).

### Promoção a admin

Não existe caminho de frontend. `admin_set_profile_status(p_user_id, p_role, p_status)` é a única via, valida `app.is_admin_active(auth.uid())` internamente, e não aceita parâmetros fora do conjunto fixo (`role` ∈ {student, admin}, `status` ∈ {pending, active, blocked}). O **primeiro** admin do sistema não pode ser criado por essa função (exige já haver um admin ativo) — precisa de uma operação administrativa direta e documentada fora do frontend (ver roadmap).

## 5. Fluxo editorial de questões: `draft → published → draft/archived`

1. Admin cria a questão — `INSERT` sempre cai em `status = 'draft'` (inserir já `published` é rejeitado incondicionalmente).
2. Admin cadastra/edita `question_options`, `question_option_keys`, `question_answer_keys` livremente — permitido enquanto `status = 'draft'`.
3. Admin chama `publish_question(id)`, que valida: ≥ 2 alternativas, exatamente 1 correta, `question_answer_keys` presente, todas as explicações preenchidas — só então `UPDATE questions SET status = 'published'`.
4. Com `status IN ('published', 'archived')`: `question_options`, `question_option_keys` e `question_answer_keys` ficam **imutáveis** (`INSERT`/`UPDATE`/`DELETE` rejeitados, validando tanto o vínculo antigo quanto o novo em caso de tentativa de mover um registro entre questões); a própria `questions` fica com o conteúdo editorial congelado (só `status` pode mudar, nunca junto com conteúdo no mesmo `UPDATE`); `DELETE` de questão `published` é sempre rejeitado.
5. Para editar: `UPDATE questions SET status = 'draft'` (permitido, isolado) → editar → `publish_question(id)` de novo, que revalida do zero.
6. `archived → published` passa pelas mesmas validações de `publish_question` (não é um atalho).

Todas essas regras usam a mesma técnica de `current_user = 'postgres'` para diferenciar uma transição feita pela função confiável de uma tentativa direta — nenhuma delas depende de configuração de sessão manipulável pelo cliente.

## 6. Matriz de acesso (RLS)

| Tabela/grupo | Anônimo | Pending/Blocked | Active (dono) | Active (outro uid) | Admin active |
|---|---|---|---|---|---|
| `profiles` | – | SELECT próprio; UPDATE só `display_name`/`avatar_url` | idem | – | SELECT todos; `role`/`status` só via RPC |
| Editorial `published` | – | – | SELECT | SELECT | SELECT + CUD |
| Editorial `draft`/`archived` | – | – | – | – | SELECT + CUD (options/keys imutáveis se published/archived) |
| `question_answer_keys`/`question_option_keys` | – | – | – (só via RPC) | – | SELECT + CUD (mesma trava de imutabilidade) |
| Dados pessoais | – | – | CRUD próprio | – | – |
| `feedback` | – | – | INSERT/SELECT próprio | – | SELECT todos (exceção documentada) |
| Storage `editorial-assets` | – | – | SELECT se publicado | SELECT se publicado | SELECT total + CUD |

## 7. Funções `SECURITY DEFINER`

| Função | Finalidade | Quem executa | search_path |
|---|---|---|---|
| `app.is_admin_active(uuid)` | Helper interno de autorização | Uso interno em policies (não exposta via API) | `''` |
| `app.current_profile_status(uuid)` | Idem, para status | Uso interno | `''` |
| `public.handle_new_user()` | Cria profile após signup | Trigger em `auth.users` | `''` |
| `public.admin_set_profile_status(uuid, text, text)` | Único caminho para alterar role/status | `authenticated`, checagem interna de admin | `''` |
| `public.publish_question(uuid)` | Única via de publicação, valida completude | `authenticated`, checagem interna de admin | `''` |
| `public.submit_question_attempt(...)` | Corrige resposta e libera gabarito da questão respondida | `authenticated`, checagem interna de status active | `''` |

Schema `app` **não** está listado em `[api].schemas` de `supabase/config.toml` — os helpers não têm rota REST/RPC, mesmo com `GRANT EXECUTE` concedido a `authenticated` (esse grant só habilita avaliação interna dentro de uma expressão de policy).

## 8. Storage

Bucket `editorial-assets`: privado (`public = false`), limite de 10 MiB, MIME permitido restrito a imagens comuns e PDF. Caminho: `materials/{material_id}/{asset_id}.{ext}` ou `questions/{question_id}/{asset_id}.{ext}`. Leitura liberada a `active` apenas quando o `content_assets.storage_path` correspondente aponta para conteúdo `published`; upload/alteração/exclusão exclusivos de admin `active`, com validação de prefixo de caminho.

## 9. Concorrência na publicação

Risco corrigido nesta revisão: `publish_question` validava opções/gabarito e só então marcava `published`, sem impedir que outra transação alterasse ou removesse uma alternativa entre a validação e o `UPDATE` final.

Solução — travamento transacional consistente:

- `publish_question` adquire `SELECT ... FOR UPDATE` na linha de `questions` **antes** de qualquer validação (contagem de opções, keys, explicações, answer key). Todas as leituras subsequentes acontecem depois desse lock.
- As triggers de imutabilidade (`guard_question_options_immutable`, `guard_question_option_keys_immutable`, `guard_question_answer_keys_immutable`) também adquirem `FOR UPDATE` na(s) linha(s) de `questions` correspondente(s) **antes** de ler o `status` — se `publish_question` já estiver validando aquela questão, qualquer `INSERT`/`UPDATE`/`DELETE` concorrente em `question_options`/`question_option_keys`/`question_answer_keys` fica bloqueado até a transação de `publish_question` terminar (commit ou rollback), e só então lê um `status` já consistente (`published`, se o commit foi bem-sucedido).
- **Ordem de locks** (para reduzir risco de deadlock): quando uma operação pode envolver duas questões diferentes (mover um registro de uma questão para outra em um único `UPDATE`), os dois ids são bloqueados em uma única instrução `SELECT ... WHERE id IN (...) ORDER BY id FOR UPDATE` — sempre em ordem crescente de `id`, nunca em `SELECT`s separados. Isso garante que duas transações concorrentes que disputam o mesmo par de questões sempre tentam adquiri-las na mesma ordem, eliminando o padrão clássico de deadlock (transação 1 trava A depois B, transação 2 trava B depois A).

**Teste de concorrência**: pgTAP roda em uma única sessão e não consegue simular duas transações concorrentes de verdade. Esse cenário fica classificado como **teste de integração concorrente separado** (não pgTAP, não executado nesta etapa) — roteiro em `migration-roadmap.md`.

## 10. Limitações conhecidas desta etapa

- `profiles.email` não é sincronizado após o cadastro inicial (adiado deliberadamente — ver roadmap).
- Congelamento de conteúdo em `questions` cobre os campos editoriais listados na trigger `guard_question_content_immutable`; não há trava adicional sobre `content_assets` vinculados a questões `published`/`archived`.
- Nada disso foi executado contra um Postgres real — ver `docs/architecture/migration-roadmap.md` para o inventário de testes planejados vs. executados.
