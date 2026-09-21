# NexusMed — fila executiva persistente

Última atualização: 2026-09-12 (12-B publicado em produção; merge da fundação 12-A/12-A2 em `main`).

## Finalidade e autoridade

Este arquivo é a cópia persistente, fora de qualquer conversa, branch ou clone Git, das melhorias levantadas na auditoria técnica do NexusMed em 2026-09-11. Ele existe para permitir a retomada em uma sessão nova, mesmo que a conversa atual seja encerrada ou o repositório seja movido.

Fontes versionadas atuais, que devem ser reconciliadas quando disponíveis:

- `C:\Users\vinic\OneDrive\nexusmed-review-latest\docs\diretoria\registro.md`
- `C:\Users\vinic\OneDrive\nexusmed-review-latest\docs\diretoria\prompts\11-A.txt`
- `C:\Users\vinic\OneDrive\nexusmed-review-latest\docs\diretoria\prompts\12-A.txt`
- `C:\Users\vinic\OneDrive\nexusmed-review-latest\docs\diretoria\prompts\13-A.txt`

O clone oficial esperado pelo histórico é `C:\Users\vinic\dev\NexusMed\firebase-auth`, mas toda sessão deve confirmar o caminho real antes de editar. A cópia auditada estava em `C:\Users\vinic\OneDrive\nexusmed-review-latest`, HEAD destacado `fb989a4`, um commit à frente de `origin/main`, com `package-lock.json` não rastreado. Ela não deve ser presumida como produção.

## Regras de retomada

1. Ler integralmente `AGENTS.md`, `docs/diretoria/MODELO-DIRETORIA.md` e `docs/diretoria/registro.md` do clone canônico.
2. Registrar caminho, branch, HEAD, `origin/main` e working tree antes de editar.
3. Verificar se outra sessão está escrevendo nos mesmos arquivos.
4. Não presumir que um prompt foi enviado. Somente confirmação explícita do usuário muda o estado para “Em execução”.
5. Não presumir conclusão por existência de arquivos; exigir retorno formal e validações.
6. Não fazer merge, push, deploy ou escrita no Supabase remoto, salvo autorização explícita em um prompt posterior de publicação.
7. Toda escrita de teste usa Supabase LOCAL, contas descartáveis e limpeza comprovada.
8. Ao concluir uma etapa, atualizar o registro versionado e este arquivo persistente.

## Ordem obrigatória

| Prioridade | Entrega | Estado em 2026-09-12 | Liberação |
|---|---|---|---|
| P0 | 11-A — acesso e autenticação | Concluído e aprovado; publicado via 11-B | Encerrado |
| P0 | 11-B — revisão e publicação do 11-A | **Concluído e publicado em produção** (merge `a9ed258` em `main`, deploy Vercel confirmado, smoke test 4/4) | Encerrado |
| P1 | 12-A — reprodutibilidade e dependências | Concluído e publicado (via 12-B) | Encerrado |
| P1 | 12-A2 — falsos positivos do gate | Concluído e publicado (via 12-B) | Encerrado |
| P1 | 12-B — integração/publicação da fundação | **Concluído e publicado em produção** (merge `e90fcee` em `main`, deploy Vercel confirmado por hash de assets, smoke não destrutivo OK) | Encerrado |
| P1 | 13-A — testes automatizados e CI | Planejado; texto preparado | Dependência de publicação do 12-B satisfeita; liberação em si fica para uma sessão diretoria avaliar |
| P2 | 14 — desempenho e modularização | Backlog; prompt ainda não emitido | Após 13-A |
| P2 | 15 — observabilidade | Backlog; prompt ainda não emitido | Após 13-A |
| P2 | 16 — privacidade e comunicação de segurança | Backlog; prompt ainda não emitido | Após 11-A; revisão jurídica humana quando aplicável |
| P3 | 17 — estratégia PWA/offline | Backlog; prompt ainda não emitido | Após 13-A e decisão de produto |

Não executar 12-B e 13-A em paralelo: 13-A precisa partir da fundação técnica integrada em `main`.

## Retorno 11-A recebido — 2026-09-12

Resultado aprovado tecnicamente. Clone oficial `C:\Users\vinic\dev\NexusMed\firebase-auth`; branch `work/11a-bloqueio-contas-auth`; base `origin/main` `7fb3400`; commits locais `0e20009` e `1b977a0`; sem push, merge, deploy ou escrita remota. A executiva relatou TypeScript limpo, pgTAP 183/183, Playwright 6/6 e remoção das 7 contas locais. A diretoria revisou o diff completo e confirmou o gate fail-closed, admin ativo, tela de bloqueio e correção do texto de segurança. Publicação deve ocorrer somente pelo 11-B, arquivado em `C:\Users\vinic\OneDrive\nexusmed-review-latest\docs\diretoria\prompts\11-B.txt`.

## PUBLICADO — 11-B, 2026-09-12

Revisão/publicação concluída sem bloqueios. `origin/main` não avançou em nenhum momento do gate (permaneceu `7fb3400` do início até imediatamente antes do push de `main`). Diff final revisado contra `origin/main`: só os 6 arquivos do 11-A (código + `AGENTS.md` + `registro.md`), nenhuma alteração alheia. Gates locais revalidados nesta sessão (não só herdados do retorno do 11-A): `tsc --noEmit` limpo, `npm run build` limpo (bundle byte-idêntico antes/depois do merge), `supabase test db` 183/183, e 7/7 cenários Playwright reais contra Supabase local — os 6 do 11-A mais um cenário novo pedido pelo 11-B (reload após logout não reexibe a sessão antiga). Branch enviada e mesclada em `main` com `--no-ff` (commit `a9ed258`, `main`/`origin/main` `7fb3400` → `a9ed258`, push sem force). Deploy automático do Vercel confirmado (bundle publicado byte-a-byte idêntico ao build local, 0 instrumentação de teste). Smoke test real de produção com 3 contas descartáveis (ativa, bloqueada, admin bloqueado) — 4/4 cenários, 0 erros de console recorrentes, 0 requisições 5xx; contas removidas ao final, `profiles` remoto restaurado ao baseline (12→9). Detalhamento completo em `docs/diretoria/registro.md`, entrada "PUBLICADO — 11-B, 2026-09-12", e em `AGENTS.md`, seção "Estado atual".

**12-A liberado**: a dependência declarada ("somente após retorno do 11-B") está satisfeita — 11-B publicado e sem pendência bloqueante na área de autenticação/bloqueio de contas.

## PUBLICADO — 12-B, 2026-09-12

Revisão/integração/publicação de `work/12a-reprodutibilidade-deps` (12-A + 12-A2) em `main`, executada por sessão executiva. `origin/main` confirmado parado em `b67a77c` do início ao fim do gate — sem reconciliação necessária. Diff completo (35 arquivos) revisado linha a linha: nenhuma mudança de regra de negócio; as 26 alterações de label/id seguem um padrão sistemático único (associação real `label`/`htmlFor`/`id`, ou `label`→`span` quando o rótulo é cabeçalho de grupo sem controle nativo). Corrigida a inconsistência documental do 12-A2 (frase desatualizada "nenhum commit novo" quando o commit `c667424` já existia) via `git commit --amend` local, sem force-push (branch nunca havia sido publicada em nenhum remoto) — commit passou a ser `0a33b20`.

Revalidação completa do zero: `npm ci` (0 vulnerabilidades), `npm audit`/`npm audit --omit=dev` (0/0), `typecheck` limpo, `lint` 93/93 avisos (0 erros), pgTAP 183/183 em 5 arquivos, `build` limpo, `npm run verify` completo, `git diff --check` limpo, bundle de produção sem instrumentação de teste. Provas negativas repetidas e revertidas sem resíduo (teste obrigatório falha sem Supabase; `test:optional` sai 0; 94º warning derruba lint/verify). Testes de UI via Playwright/Chromium (desktop 1440×900 e mobile 390×844): Feedback, Criar Flashcard, Criar Simulado (sessão de demonstração local) e tela de login real (via `npm run preview`, sem dados submetidos) — IDs únicos, clique no label focando o controle correto, abertura/fechamento/cancelamento de modal, sem erros de console, em todos os casos testados.

**Pendência explícita**: Área Editorial (`AdminCMSView`, 22 das 40 correções de label/id) não pôde ser testada ao vivo por falta de conta local com `role=admin` (seed local não cria admin com senha fixa por design, e a sessão não teve acesso a `docker exec`/`psql` direto para promover uma conta de teste). A revisão de diff já confirmou o mesmo padrão sistemático usado nos formulários testados ao vivo, mas isso fica registrado como validação pendente, não concluída.

Branch enviada ao remoto pela primeira vez, merge em `main` com `--no-ff` (commit `e90fcee`), `npm run verify` revalidado em `main` pós-merge, push (`b67a77c..e90fcee`), e documentação adicional (`0c7834a`). Deploy automático do Vercel confirmado por comparação de hash de assets entre o build local pós-merge e o bundle publicado em produção (idênticos). Smoke de produção não destrutivo: tela de login real carrega, sem erros de console, IDs únicos, nenhum dado criado/alterado. Detalhamento completo em `docs/diretoria/registro.md`, entrada "Retorno recebido — 12-B", e em `AGENTS.md`, seção "Estado atual".

**13-A**: a publicação bem-sucedida do 12-B satisfaz a dependência declarada para 13-A. Esta sessão executiva não libera nem declara início do 13-A — fica para avaliação de uma sessão diretoria futura, que deveria também considerar a pendência de Área Editorial acima antes de dar o 13-A por coberto na frente de acessibilidade.

## Retorno 12-A recebido e revisado — 2026-09-12

Branch `work/12a-reprodutibilidade-deps`, commit local `2f9e34c`, sem push/merge/deploy. Méritos confirmados: lockfile reproduzível; dependências ociosas/vulneráveis removidas; auditorias completa/produção em zero; scripts multiplataforma; ESLint real; typecheck/build limpos; pgTAP 183/183 quando executado; bundle sem instrumentação de teste.

Aprovação de integração retida por duas lacunas objetivas: `scripts/run-db-tests.mjs` retorna sucesso quando CLI/Supabase local estão ausentes, permitindo `verify` verde sem testes; e lint aceita 93 warnings sem teto, portanto warnings novos não quebram o gate. Complemento 12-A2 preparado em `docs/diretoria/prompts/12-A2.txt`. 13-A aguarda correção e integração dessa fundação.

## Prompt 11-A — resumo operacional completo

Objetivo: garantir que somente `profiles.status === 'active'` entre no aplicativo; impedir que admin bloqueado seja tratado como admin; revisar logout e a corrida entre `getSession()`/`onAuthStateChange`; retirar a alegação de “criptografia de ponta a ponta”.

Escopo obrigatório:

- Reproduzir `active`, `pending`, `blocked`, status ausente e inválido, para estudante e administrador.
- Gate fail-closed: `pending` mantém tela de espera; `blocked` recebe tela própria com logout; qualquer outro estado não concede acesso.
- `isAdmin` deve exigir role admin e status ativo.
- Corrigir corrida de sessão apenas se reproduzida; caso contrário, registrar prova.
- Logout deve limpar estado autenticado da UI sem apagar dados de estudo locais e sem esconder erro real.
- Não modificar RLS/migrations sem comprovar defeito de backend e parar para decisão.
- Validar em navegador real, typecheck, build, pgTAP local quando disponível, limpeza das fixtures e ausência de instrumentação de teste no bundle.
- Sem merge, push, deploy ou escrita remota.

Retorno obrigatório: `RETORNO: 11-A`, resultado, estado Git inicial, diagnóstico por status, alterações, validações numéricas, fixtures/limpeza, pendências e estado de publicação.

## Prompt 12-A — resumo operacional completo

Dependência: retorno 11-A recebido e aprovado.

Objetivo: reconciliar lockfile e estado Git; provar instalação limpa; remover dependências ociosas/vulneráveis; tornar scripts multiplataforma; configurar lint real e um gate `npm run verify`.

Escopo obrigatório:

- Reconfirmar se `express`, `@google/genai` e `motion` estão sem uso e se `dotenv` é apenas operacional.
- Resolver os dois advisories moderados encontrados em `express -> qs`, sem `npm audit fix --force`.
- Versionar lockfile coerente e provar `npm ci` em ambiente temporário limpo.
- Separar `typecheck`, ESLint real (TypeScript, React Hooks e acessibilidade JSX), testes, build e `verify`.
- Substituir `rm -rf` por limpeza multiplataforma com alvos explícitos.
- Documentar versões Node/npm e execução Windows/CI.
- Validar auditoria antes/depois, typecheck, lint, testes, build, clean seguro e bundle.
- Sem mudança de produto, migration, merge, push, deploy ou escrita remota.

Retorno obrigatório: `RETORNO: 12-A`, resultado, estado Git inicial, inventário de dependências, advisories antes/depois, prova de `npm ci`, scripts/validações, alterações, pendências e publicação.

## Prompt 13-A — resumo operacional completo

Dependências: retornos 11-A e 12-A recebidos e aprovados.

Objetivo: versionar testes unitários e Playwright dos fluxos críticos e criar CI bloqueadora antes de deploy.

Cobertura mínima:

- gates `active`, `pending`, `blocked`, inválido e admin bloqueado;
- login/logout e isolamento A/B;
- resposta, reidratação sem nova tentativa/XP e escolha da tentativa mais recente;
- fila offline, reconexão, retry idempotente e duas operações rápidas;
- duas abas/dispositivos para reação, favorito, nota e progresso;
- revisão SRS concorrente;
- rascunho e término idempotente de simulado;
- ausência de `__syncDebug` no bundle de produção;
- pgTAP como camada separada, deixando explícito o que cada camada prova.

Regras de teste:

- Supabase LOCAL, fixtures determinísticas e limpeza em `finally`.
- Executar duas vezes a partir de banco resetado.
- Provar zero resíduos após sucesso e falha induzida.
- Sem sleeps fixos ou retries globais para esconder flakiness; aguardar condições observáveis.
- CI deve usar lockfile, permissões mínimas e artefatos sanitizados.
- Nenhum acesso a produção, merge, push ou deploy.

Retorno obrigatório: `RETORNO: 13-A`, resultado, estado Git, arquitetura de testes, cobertura, contagens/duração, desenho do CI, limpeza/segurança, pendências e publicação.

## Melhorias preservadas para prompts posteriores

## Reconciliação com prompts e branches anteriores — 2026-09-12

A fila 11-A a 17 criada pela auditoria de 2026-09-11 NÃO representa todo o passivo histórico do NexusMed. A revisão do registro canônico e das branches encontrou os fluxos abaixo.

### Colisão de numeração “Prompt 11”

Antes da auditoria atual já existia outra família 11-A/11-B/11-B2/11-B3/11-C, ligada à estabilização do snapshot do Google AI Studio (`fb989a4`) e à branch `work/integracao-estabilizacao-11b`. A família nova 11-A/11-B (bloqueio de contas) reutilizou esses números porque a cópia auditada estava desatualizada. Não renumerar retroativamente retornos já executados; em toda referência futura usar nomes explícitos:

- `11-B-contas`: publicação do gate de contas, concluída em `a9ed258`/`b67a77c`;
- `LEGACY-11-C-estabilizacao`: branch antiga de estabilização, ainda não integrada.

O prompt antigo `LEGACY-11-C-estabilizacao` NÃO pode ser executado como escrito: seu gate manda parar se `main` avançou além de `fb989a4`, e `main` já chegou a `b67a77c`. Precisa de uma nova auditoria/reconciliação contra o `main` atual, nunca merge/cherry-pick em bloco.

### Fluxo histórico ativo: estabilização/deduplicação de flashcards

Branch local/remota: `work/integracao-estabilizacao-11b` / `origin/work/integracao-estabilizacao-11b`.

Contém um conjunto amplo de mudanças, parte já publicada por hotfixes equivalentes e parte ainda não integrada: proteção contra segredo Supabase em variável Vite, paginação/ordenação de questões, correções de seleção/reação, referências honestas, vínculos explícitos de Biblioteca, deduplicação de flashcard automático e SRS, migration `20260911120000_flashcard_srs_unique_creation.sql`, testes e script de reconciliação remota.

Pendências históricas associadas:

- confirmar quais patches já foram substituídos por commits posteriores de `main`;
- reauditar o que ainda agrega valor sem regredir o estado atual;
- reconciliar o grupo de duplicata remota somente após nova leitura do estado real;
- decidir e aplicar, se ainda necessária, a migration de unicidade/RPC;
- tratar os flashcards antigos presos no dispositivo do usuário por IDs não UUID, sem duplicar ou apagar progresso.

Esse fluxo deve ganhar um NOVO número futuro, posterior a 17, e começar por diagnóstico/reconciliação somente leitura. Não reutilizar o texto antigo do 11-C.

### Fluxo histórico ativo: autoria/carga de conteúdo nativo YAML

Branch local `work/carga-conteudo-nativo-yaml`, commits `e273762` e `a5dce95`, ainda não integrada em `main`. Implementa carregamento de compêndio/questões no formato nativo YAML e suporte a `institution/year` por questão.

Relaciona-se ao antigo Prompt 05 (fluxo de autoria), cujo registro inicial nunca foi formalmente encerrado. Também pode absorver parte do antigo Prompt 04 (listas de questões), cujo escopo original ficou sem documentação suficiente. Antes de integrar:

- reavaliar a necessidade de produto e o contrato editorial atual;
- reconciliar `package.json`/`package-lock.json` depois do 12-B;
- revisar segurança local-only/`--allow-remote`, idempotência e rollback;
- testar contra Supabase local e conteúdo piloto;
- decidir se Prompt 04 foi superado ou se ainda existe uma necessidade distinta.

### Registros antigos que parecem abertos, mas foram superados/concluídos

- Prompt 01 (responsividade): implementado e publicado dentro das consolidações posteriores.
- Prompt 02/02-C (auditorias de acervo/cobertura): retornos recebidos; achados viraram backlog editorial.
- Prompt 03 (referências): recuperação/publicação concluída no 09-B; curadoria inline de materiais continua como backlog editorial, não como execução do prompt antigo.
- Prompt 06/06-C (transição): clone canônico criado e adotado; concluído.
- Prompt 07 e complementos: sincronização confiável categorias 1–9 publicada pelos 07-D/07-E4/07-F2.
- Prompt 08: investigação encerrada sem nova rodada automática; reabrir somente com evidência nova.
- Prompt 09-B e 10-A2: publicados.

### Pendências operacionais/editoriais preservadas

- feedbacks reais da Área Editorial não devem ser marcados resolvidos automaticamente só porque uma correção semelhante foi publicada;
- curadoria bibliográfica pontual dos compêndios ainda é diferente da bibliografia geral já publicada;
- lacunas de cobertura editorial identificadas pelas auditorias 02/02-C continuam como planejamento editorial, não necessariamente como bugs de código;
- a antiga conta de teste residual `fase3-validation-*` foi documentada como inerte; confirmar estado atual antes de decidir remoção.

### Ordem consolidada após esta reconciliação

1. Concluir e publicar 12-B.
2. Executar 13-A (suíte versionada e CI).
3. Criar nova entrega de reconciliação da branch `work/integracao-estabilizacao-11b` contra `main`, somente leitura primeiro.
4. Avaliar/integrar o pipeline YAML como retomada formal do fluxo de autoria (antigo 05) e decidir o destino do antigo 04.
5. Seguir com desempenho, observabilidade, privacidade e PWA (14–17), reordenando apenas se surgir incidente real de produção.

### Entrega 14 — desempenho e modularização

- Bundle auditado: 962,96 kB minificado e 249,66 kB gzip; Vite alertou para chunk acima de 500 kB.
- Não foram encontrados imports dinâmicos.
- Priorizar lazy loading da Área Editorial, compêndios, simulados, flashcards, caderno de erros e modais raros.
- Dividir componentes muito grandes: `AdminCMSView.tsx` (1.659 linhas), `DashboardView.tsx` (1.131), `CompendiumReader.tsx` (853), `App.tsx` (665), `QuestionCard.tsx` (653) e `syncQueue.ts` (634).
- Exigir medições antes/depois e testes de regressão do 13-A.

### Entrega 15 — observabilidade

- Adicionar error boundary global e captura sanitizada de exceções.
- Medir saúde da fila de sincronização, falhas permanentes, incompatibilidade de migrations/RPCs e erros 5xx.
- Correlacionar operações por `client_op_id` sem registrar conteúdo de notas, respostas, tokens ou dados pessoais.
- Definir health check e alerta pós-deploy.

### Entrega 16 — privacidade e comunicação

- A política atual não explicita retenção, exclusão/exportação, backups, subprocessadores, incidentes, armazenamento local e registros técnicos.
- Revisar textos para não prometer propriedades técnicas não implementadas.
- Separar revisão técnica de eventual validação jurídica humana; nenhuma executiva deve declarar conformidade legal definitiva sozinha.

### Entrega 17 — PWA/offline

- Há manifesto e ícones, mas não foi encontrado service worker ou estratégia de cache.
- Diretoria deve decidir entre “instalável” e suporte offline real.
- Se offline real for aprovado, definir versionamento de cache, atualização segura e interação com a fila de sincronização antes da implementação.

## Evidências da auditoria-base

- `npm run lint` (atualmente apenas `tsc --noEmit`) passou.
- Build passou fora do sandbox.
- `npm audit --omit=dev`: 2 vulnerabilidades moderadas, 0 altas, 0 críticas.
- Supabase remoto não foi acessado.
- pgTAP não foi reexecutado porque o Supabase CLI não estava no PATH da sessão.
- Pontos positivos preservados: RLS abrangente, RPCs recentes com `search_path` fixado, Markdown sem `dangerouslySetInnerHTML`, sincronização idempotente documentada e testes pgTAP versionados.

## Retorno 12-A2 recebido e aprovado — 2026-09-12

Branch `work/12a-reprodutibilidade-deps`, novo commit local `c667424`, working tree limpo, `origin/main` ainda em `b67a77c`. Revisão incremental confirmou: teste obrigatório retorna exit 1 sem CLI/stack; skip só existe em `test:optional` e não entra em `verify`; lint usa baseline transitório `--max-warnings 93`, e o warning nº 94 derruba lint/verify. Com infraestrutura ativa: auditorias zeradas, pgTAP 183/183 e verify completo verde. Nenhuma mudança em produto/RLS/migrations.

12-A/12-A2 tecnicamente aprovados. Publicação pendente pelo 12-B. O 12-B deve corrigir a frase documental desatualizada no registro do commit `c667424` (afirma que não houve commit novo) e amostrar em navegador as associações `label`/`id` modificadas no diff amplo do 12-A antes de integrar. 13-A permanece aguardando publicação.

## Reauditoria e fila consolidada — 2026-09-12

Reauditoria registrada em `Organização/AUDITORIA-DIRETORIA-NEXUSMED-2026-09-12.md`. O HEAD atual observado da branch 12-A2 é `0a33b20`, embora o retorno anterior cite `c667424`; o 12-B foi atualizado para reconciliar essa divergência antes de integrar. O `fetch` não pôde atualizar `.git/FETCH_HEAD` nesta sessão por restrição de escrita, portanto o 12-B deve reconfirmar o remoto.

Validação atual: typecheck passou, lint permaneceu em 0 erros/93 avisos e `verify` falhou corretamente com a stack Supabase parada. A validação positiva anterior de 183/183 continua sendo a evidência disponível para o caminho com infraestrutura ativa.

Fila executiva canônica:

1. `12-B`: revisão, integração e publicação da fundação 12-A/12-A2 — executar agora.
2. `13-A`: suíte automatizada crítica e CI bloqueadora — após 12-B.
3. `18-A`: reconciliação somente leitura da estabilização histórica e dos flashcards antigos — após 13-A; substitui o uso do antigo 11-C.
4. `19-A`: acessibilidade de teclado e redução do baseline de lint — após 13-A.
5. `14-A`: desempenho/code splitting/modularização — após 13-A e decisão do 18-A.
6. `15-A`: observabilidade sanitizada — após 13-A.
7. `16-A`: privacidade, retenção, exportação e exclusão — após 13-A; revisão jurídica permanece humana.
8. `17-A`: diagnóstico e decisão PWA/offline — após 13-A; sem implementação automática.
9. `20-A`: reauditoria da carga YAML e encerramento/retomada dos fluxos 04/05 — após 12-B e 13-A.
10. `21-A`: consolidação do backlog editorial/científico — após 13-A.

Prompts novos persistidos em `C:\Users\vinic\OneDrive\Organização\NexusMed-Prompts-Executivos`. Enviar apenas um bloco por sessão e sempre trazer o retorno à diretoria antes de liberar dependentes.

## Confirmação independente do 12-B e gate complementar — 2026-09-12

A publicação do 12-B foi confirmada independentemente, não apenas pelo retorno executor:

- `main` local e `origin/main` em `0c7834a`;
- merge técnico `e90fcee`, com pais `b67a77c` e `0a33b20`;
- `AGENTS.md` e `docs/diretoria/registro.md` atualizados;
- produção HTTP 200 servindo os bundles `index-C6B6pPEV.js` e `index-C2LuE45k.css`.

O alerta “Blocked by classifier” correspondeu à tentativa bloqueada de `docker exec`/`psql` para promover uma fixture local a admin. O executor não contornou o bloqueio e declarou a lacuna corretamente. Não há evidência, nesta revisão, de ação indevida contra repositório ou produção.

Pendência objetiva: `AdminCMSView` contém 22 das 40 correções de `label`/`id` do 12-B que foram revisadas por diff, mas não validadas ao vivo com Playwright. Foi criado o Prompt 12-C para fechar exclusivamente essa lacuna por mecanismo permitido, sem escrita remota e sem reabrir o escopo publicado.

Nova ordem imediata: 12-C e, somente após retorno aprovado, 13-A. O 12-B passa a concluído/publicado.

## Retorno 12-C — validado

O usuário/diretoria informou o fechamento do 12-C: Área Editorial validada, nenhuma pendência nova e nenhuma alteração de código. O marco também foi registrado na memória do projeto. A diretoria aceita o retorno e libera formalmente o 13-A.

Próxima execução: `13-A — suíte automatizada crítica e CI bloqueadora`. O prompt existente permanece canônico; não foi criada nova variante.

## Princípio permanente de eficiência da diretoria

Toda organização futura deve buscar a melhor relação **resultado/tokens**. Isso significa consolidar tarefas relacionadas para evitar releitura repetida do repositório, privilegiar correções com impacto observável e não criar sessões separadas por formalismo. Gates continuam separados apenas quando necessários por segurança ou autoridade: migrations, reparo de dados, produção/publicação, contratação de serviço, decisões jurídicas/produto, credenciais ou conflitos semânticos. Metas cosméticas — como zerar `any`, reduzir linhas ou elevar cobertura sem risco associado — não têm prioridade automática.

## Retorno 22-A e decisão da diretoria

Retorno recebido e auditado: implementação local em `work/22a-estudo-tematico`, commit `bf88bc7`, baseada no `origin/main` real `eb37a91`; sem push, merge, deploy, migration ou escrita remota. O desenho central foi aceito: um pack por `compendium.id`, vínculo exclusivamente por `compendiumRefId === compendium.id`, conteúdo sem material em seção única, referências inválidas factuais e cards `isCustom` somente em “Meus Cards Personalizados”, mesmo quando possuam referência válida, para preservar a invariante de não duplicação.

Gates informados: Vitest 24/24, pgTAP 183/183, Playwright 23/23, lint 0 erros/89 avisos, bundle sem debug e zero fixtures. A revisão independente confirmou a reutilização do `FlashcardReviewSession` canônico e o retorno programado para `thematic-study`, mas encontrou uma lacuna objetiva no teste obrigatório: o spec abre o SRS pelo pack e vê o card, porém não envia avaliação, não conclui a sessão e não confirma o retorno ao mesmo `data-pack-id`.

Decisão: 22-A aceito tecnicamente, mas ainda não liberado para publicação. O complemento/publicação 22-B deve fechar somente essa prova, revisar o diff integral e publicar se todos os gates permanecerem verdes.

## Política de proveniência científica e revisão humana — decisão da diretoria

A diretoria aprovou como princípio que o NexusMed referencia claims verificáveis, não frases por regra mecânica; admite fontes primárias e secundárias adequadas ao claim; proíbe citation laundering; distingue source claim, síntese e inferência; e mantém texto didático limpo com vínculo interno claim–fonte e bibliografia final.

Aprovação humana futura deve ser uma atestação auditável de uma revisão imutável: identidade derivada no servidor por `auth.uid()` de admin ativo, horário do banco, revisão/hash do conteúdo e versão da política. Nome digitado, checkbox ou assinatura desenhada podem servir à confirmação visual, mas não comprovam identidade. Qualquer edição posterior invalida a aprovação para publicação. Atestação não deve ser denominada assinatura digital qualificada nem interpretada como conclusão jurídica.

Prompt 23-A preparado como diagnóstico arquitetural somente leitura. Executar após o retorno/publicação do 22-B e antes de implementar novo pipeline de autoria ou correções editoriais amplas. Migration e implementação dependerão de retorno aprovado e prompt posterior.

## Racionalização da fila por resultado/tokens/tempo

Auditoria de pertinência aplicada aos prompts ativos. Decisões:

- 22-B permanece como única execução imediata.
- 23-A foi compactado e continua como próximo gate arquitetural.
- 21-A2 foi reescrito como auditoria incremental, com um artefato canônico e dependência explícita do 23-A.
- 20-A passou a avaliar a carga YAML somente contra o contrato aprovado no 23-A, sem arqueologia ampla dos fluxos 04/05.
- 15-A foi reduzido a error boundary e sanitização local, sem fornecedor ou transmissão.
- 14-A foi reduzido a lazy loading mensurável; modularização por tamanho foi removida.
- 16-A tornou-se diagnóstico somente leitura; exportação, exclusão e textos finais exigirão etapas posteriores.
- 19-A passou a tratar apenas barreiras reproduzíveis de teclado/foco; zero warnings deixou de ser meta.
- 18-A tornou-se triagem curta e condicional a impacto atual.
- 17-A ficou estacionado até decisão de produto ou evidência de necessidade offline.
- 21-A permanece substituído e não deve ser reenviado.

Regra permanente refinada: cada prompt traz um contrato de eficiência específico e curto; não se replica texto genérico quando isso aumenta tokens sem melhorar controle. Testes focados precedem uma única suíte completa no gate final, salvo falha que exija repetição. Diagnósticos não executam build/suíte por hábito.

## 22-B publicado e verificado — 2026-09-13

Retorno aprovado. Verificação independente confirmou `main = origin/main = c942139`, merge com pais `eb37a91` e `4279259`, árvore limpa, branch candidata preservada e diff check limpo. O commit complementar altera apenas o spec E2E e documentação: conclui revisão real via caminho canônico, confirma uma linha em `flashcard_reviews`, encerra a fila e retorna ao mesmo `data-pack-id`.

Gates reportados aceitos: spec 5/5; Vitest 24/24; pgTAP 183/183; Playwright 23/23; bundle sem debug; zero fixtures. Produção publicada com Estudo Temático.

Inconsistência documental não bloqueante: `docs/diretoria/registro.md` afirma que o smoke não criou/alterou dado remoto, enquanto o retorno detalhado informa criação, promoção, uso e remoção de conta descartável autorizada, com `profiles` restaurado a 9 e zero resíduos. A execução foi reversível e limpa; a frase deve ser corrigida na próxima alteração documental do repositório, sem abrir sessão exclusiva.

22-B encerrado. 23-A v2 formalmente liberado como próxima execução.

## Retorno 23-A e decisão arquitetural da diretoria

23-A concluído em `main = origin/main = c942139`, somente leitura. Confirmado: questões têm gate estrutural por `publish_question`; materiais publicam por UPDATE direto; não existe revisão versionada/atestação; referências estão no nível de item inteiro; `material_references.source_id` está vazio nos compêndios atuais; JSONB de proveniência existe mas não participa do produto.

Modelo híbrido aprovado, com correções ao retorno: (1) unidade publicável é material inteiro ou questão, não seção; (2) `content_revisions` usa FKs nullable reais para material/questão e CHECK de exclusividade, evitando referência polimórfica frouxa; (3) `claim_sources` registra localização dentro da fonte e separa relação evidencial de tipo primário/secundário; (4) publicação recompõe server-side o snapshot atual e compara o hash da revisão aprovada; (5) RLS não é descrita como barreira contra `service_role`/owner.

Decisão de produto v1: autoatestação permitida. A conta autenticada registra separadamente autoria da revisão e revisão/aprovação, permitindo política de dupla pessoa no futuro. Legado publicado permanece visível como não mapeado, sem aprovação retroativa fictícia; nova publicação após edição entra no gate.

23-B preparado para implementação e validação somente local. Sem push, merge, deploy, migration remota ou dados reais.

## Iniciativa planejada — banco de temas futuros / pauta editorial

Decisão de produto: criar no NexusMed uma pauta editorial estruturada para assuntos a desenvolver futuramente. Ela não se confunde com `themes` (taxonomia usada pelo conteúdo existente) nem com `concepts` (unidades de conhecimento avaliadas longitudinalmente).

Cada item futuro deve poder registrar, no mínimo: título provisório; disciplina; tema/taxonomia existente quando aplicável; conceitos-alvo opcionais; tipo de entrega desejada (material, questões, flashcards ou pack completo); justificativa/lacuna observada; objetivos de aprendizagem; prioridade; estado (`ideia`, `triagem`, `aprovado`, `em_producao`, `bloqueado`, `concluido`, `arquivado`); dependências; fonte do pedido/achado; esforço aproximado; autoria e datas auditáveis. Relações com conteúdo real só surgem quando ele for criado; a pauta não deve fabricar `material_id`, `question_id` ou vínculo científico antecipado.

Fluxo proposto: captura rápida → triagem editorial → priorização → aprovação da pauta → produção → revisão científica/atestação → publicação → fechamento com links para os artefatos produzidos. Duplicatas devem ser detectadas como sugestões, nunca fundidas automaticamente.

A auditoria 21-A2 poderá alimentar sugestões de pauta, mas não gravá-las automaticamente como aprovadas. A implementação deve ocorrer somente após retorno aprovado e publicação do 23-B, reutilizando identidade, revisão e trilha auditável. O prompt 25-A foi preparado depois como implementação local mínima e aguarda também o 21-A2.

Itens acrescentados pela diretoria em 2026-09-15, ambos no estado `ideia`:

- `IDEA-3 — Asma`: `Clínico → Pneumologia → Doenças obstrutivas`; entrega pretendida `complete_pack`. Há cobertura apenas parcial no compêndio de síndromes bronco-pleuro-pulmonares e existe o documento legado `Farmacologia e farmacoterapia da asma.docx`, que deve entrar como fonte de entrada a auditar, não como conteúdo aprovado.
- `IDEA-4 — DPOC`: `Clínico → Pneumologia → Doenças obstrutivas`; entrega pretendida `complete_pack`. A menção atual no compêndio de síndromes respiratórias não substitui material próprio com fisiopatologia, diagnóstico, estratificação, tratamento, exacerbação, prevenção, questões e SRS.

Asma e DPOC são pautas separadas, relacionadas pelo mesmo tema curricular. Não fundir automaticamente e não promover para produção sem triagem de escopo, cobertura e fontes.

## Novas iniciativas incorporadas à fila — aprendizagem longitudinal e pauta

O modelo longitudinal foi aprovado como visão com mudanças: micropré-teste opcional, estudo, pós-teste com item preferencialmente paralelo e feedback, recuperação tardia e estado por conceito. Estados v1 limitados a `insufficient_evidence`, `emerging`, `needs_reinforcement` e `retained`; conhecimento prévio, possível esquecimento, reaprendizado e misconception são qualificadores/eventos. Um acerto isolado não representa domínio. Eventos brutos/versionados permanecem fonte de verdade e estados derivados são recalculáveis.

Prompt 24-A preparado como diagnóstico de MVP em um único pack, após a fundação 23-B publicada e o inventário 21-A2 aprovado. Não autoriza implementação, IRT/BKT, IA de domínio ou escrita remota.

Prompt 25-A preparado para implementar localmente uma pauta editorial mínima após 23-B/21-A2. A pauta é distinta de `themes`, `concepts` e conteúdo publicado; candidatos de auditoria entram apenas como `idea`; nenhuma criação ou aprovação automática de conteúdo.

Integrações para evitar retrabalho: 23-B apenas documenta pontos de extensão, sem criar conceitos/pauta; 21-A2 mede conceitos/formas paralelas e produz candidatos de pauta; 20-A avalia YAML também contra proveniência e conceitos revisáveis. A publicação do 23-B exigirá complemento próprio após o retorno; não antecipar o texto antes de conhecer migrations e commits.

## Retorno 13-A parcial e decisão da diretoria

Retorno aceito como parcial: Vitest 15/15, pgTAP 183/183 e Playwright 10/10, com duas execuções completas após reset; autenticação, isolamento A/B, questão/reidratação, fila offline/reconexão/idempotência e duas operações rápidas cobertas. CI `fast`/`full` versionada, mas ainda não executada em runner real. Branch `work/13a-suite-critica`, commit local `4bf8dce`, sem publicação.

Permanecem: concorrência em duas abas/contextos para reação, nota e progresso; SRS concorrente; simulado idempotente; validação real do GitHub Actions. Pela relação resultado/tokens, a diretoria decidiu fechar agora, reaproveitando o contexto e as fixtures ainda recentes, em vez de reabrir esse domínio no futuro.

Achados: status desconhecido permanece fail-closed ao ser normalizado para `pending`; alinhar documentação/teste, sem mudança de autenticação. A espera de até ~20 s da questão offline é dívida de UX separada; não ampliar o 13-B para UI otimista.

Prompt 13-B criado para completar as lacunas, validar CI real e publicar somente com todos os gates verdes.

## Convenção obrigatória das sessões executivas

Todos os prompts ativos são ordens para **sessões executivas separadas**. A sessão receptora executa somente o escopo recebido, entrega o bloco `RETORNO` e encerra. Ela não deve tratar o prompt como material para revisão, iniciar outro prompt ou decidir a sequência. Aprovação, complementação e liberação pertencem exclusivamente à sessão de diretoria.

A diretriz de **melhor relação resultado/tokens** passa a integrar o modelo permanente de criação de prompts, não apenas a fila atual. Todo novo prompt deve trazer o contrato de eficiência dentro do próprio texto, pois pode ser colado isoladamente em outra sessão. Prompts sem essa diretriz devem ser corrigidos antes da liberação.
