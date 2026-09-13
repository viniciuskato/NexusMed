# SynapseMed 🧠🩺

O **SynapseMed** é uma plataforma acadêmica e clínica de estudos voltada para estudantes de medicina e médicos residentes. O ecossistema reúne compêndios teóricos estruturados, banco de questões comentadas, simulados dinâmicos com cronômetro, flashcards com algoritmo de repetição espaçada (SRS), caderno inteligente de erros e painel administrativo (CMS) com controle de acesso baseado em papéis (RBAC).

---

## 📋 Requisitos do Sistema

- **Node.js**: `>=20.19 <25` (testado com v24.18.0; `engines` em `package.json`)
- **npm**: `>=10` (testado com v11.16.0)
- **Navegador**: Navegadores modernos com suporte a ES Modules (Chrome, Firefox, Safari, Edge)
- **Projeto no Supabase**: Com URL e chave anônima (`anon key`) disponíveis

---

## 🚀 Instalação e Configuração

### 1. Clonar e Instalar Dependências

O projeto utiliza o **npm** como gerenciador oficial de pacotes, com
`package-lock.json` versionado — use `npm ci` sempre que possível (instalação
limpa e reprodutível a partir do lockfile, mesma árvore de dependências em
qualquer máquina). Use `npm install` só quando for de propósito alterar
dependências.

```bash
# Instalação limpa e reprodutível (recomendado)
npm ci

# Instalar/atualizar dependências (só quando for mudar o package.json)
npm install
```

### 2. Configuração de Variáveis de Ambiente

Copie o arquivo de exemplo `.env.example` para `.env`:

```bash
cp .env.example .env
```

Preencha o arquivo `.env` com as chaves do seu projeto Supabase. **Atenção**: os nomes das variáveis utilizadas pelo Vite são:

- `VITE_SUPABASE_URL`: URL do projeto Supabase (`https://<project-ref>.supabase.co`).
- `VITE_SUPABASE_ANON_KEY`: Chave anônima (`anon key`) do projeto, segura para uso no cliente desde que a Row Level Security esteja configurada corretamente.

> ⚠️ **AVISO DE SEGURANÇA CRÍTICO**:
> - **NUNCA** versione arquivos `.env`, `.env.*` ou `.env.local` no Git.
> - **NUNCA** adicione a `SUPABASE_SERVICE_ROLE_KEY` ou chaves privadas (`*.key`, `*.pem`) ao repositório.
> - O `.gitignore` do projeto já está configurado para bloquear esses arquivos e permitir apenas o `.env.example`.

---

## 🔐 Configuração do Supabase Authentication

Para que o fluxo de autenticação funcione integralmente:

1. Acesse o **Supabase Dashboard** → **Authentication** → **Providers**.
2. **Provedor E-mail/senha**:
   - Ative o provedor **Email**.
   - Configure a exigência de confirmação de e-mail conforme o desejado.
3. **Provedor Google**:
   - Ative o provedor **Google** e configure o Client ID/Secret do OAuth.
4. **URLs de Redirecionamento**:
   - Em **URL Configuration**, adicione a Site URL e as Redirect URLs do app (ex.: `localhost` para desenvolvimento e os domínios de deploy em produção).
5. **Templates de E-mail**:
   - Em **Email Templates**, personalize o idioma e remetente para a **Confirmação de e-mail** e **Redefinição de senha**.

A segurança de acesso aos dados é garantida por Row Level Security (RLS) no Postgres — ver `supabase/migrations/` e `docs/architecture/supabase-schema.md` para o desenho completo das políticas.

---

## 💻 Scripts de Execução

### Executar em Desenvolvimento

Inicia o servidor de desenvolvimento local na porta 3000:

```bash
npm run dev
```

### Validação de Tipos, Lint, Testes e Build

Scripts separados por finalidade — cada um pode ser rodado isoladamente:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint real: TypeScript + React Hooks + acessibilidade JSX
                     # (--max-warnings 93: baseline transitório, não sobe)
npm run test        # pgTAP (supabase/tests/database) contra o Supabase LOCAL;
                     # OBRIGATÓRIO — falha (exit != 0) se CLI/stack local
                     # não estiverem disponíveis, nunca pula em silêncio
npm run test:optional  # mesma coisa, mas pula com aviso e exit 0 se CLI/
                        # stack não estiverem disponíveis — conveniência
                        # explícita, NÃO faz parte de `npm run verify`
npm run build       # vite build -> dist/
npm run clean       # remove artefatos gerados (dist/ etc.), nunca código-fonte
```

`npm run verify` roda os quatro primeiros em sequência (typecheck → lint →
test → build) — é a barreira técnica única a rodar antes de commitar/publicar,
equivalente ao que esta seção descrevia separadamente antes. Requer Supabase
local rodando (`supabase start`) — sem isso, `npm run verify` falha no passo
de teste em vez de ficar verde sem ter rodado o pgTAP:

```bash
npm run verify
```

Fluxo reproduzível completo, do zero:

```bash
npm ci
npm run verify
```

`npm run lint` cobre TypeScript (`typescript-eslint`), regras clássicas de
React Hooks (`rules-of-hooks`/`exhaustive-deps`) e acessibilidade JSX
(`eslint-plugin-jsx-a11y`), além de detectar imports/variáveis não usados
(`eslint-plugin-unused-imports`) — ver `eslint.config.js` para as regras
deliberadamente rebaixadas a aviso (e por quê) em vez de bloquear o gate.

### Pré-visualização do Build

Executa um servidor local servindo a pasta `dist/`:

```bash
npm run preview
```

---

## 🧪 Suíte de testes críticos (Prompt 13-A)

Três camadas, cada uma provando uma coisa diferente — não são substitutas
umas das outras:

| Camada | Onde | O que prova | O que NÃO prova |
|---|---|---|---|
| **Unitário** (Vitest) | `tests/unit/**` | Lógica pura/estado isolado (classificação de erro de sincronização, seleção/sorteio de simulado) | Nada sobre navegador, rede ou banco real |
| **pgTAP** | `supabase/tests/database/**` | Contratos de servidor (RPCs, RLS, triggers) direto no Postgres | Comportamento do código do CLIENTE (dedupe de promises, checagem de sessão ativa, React) — ver AGENTS.md, lição do Prompt 07-B |
| **Playwright** (browser real) | `tests/e2e/specs/**` | Fluxos reais de navegador contra Supabase LOCAL: gates de acesso, isolamento entre contas, resposta+reidratação de questão, fila offline/reconexão/idempotência | Produção/remoto — a suíte se recusa a rodar se a URL resolvida não for localhost (ver `tests/e2e/fixtures/localSupabase.ts`) |

### Rodando localmente (Windows)

Pré-requisitos: Docker Desktop rodando, Supabase CLI instalada, navegadores do
Playwright instalados uma vez (`npx playwright install chromium`).

```bash
npm ci
supabase start          # sobe o Supabase local (Postgres, Auth, Storage)
supabase db reset       # aplica migrations + seed determinístico do zero

npm run test:unit       # Vitest — rápido, sem Docker
npm run test:db         # pgTAP — requer Supabase local rodando
npm run test:e2e        # Playwright — builda em modo `test` (.env.test.local,
                         # nunca .env.local) e sobe um preview isolado na
                         # porta 4183 antes de rodar os specs
```

`npm run verify:fast` roda typecheck+lint+unit+build (sem Docker — rápido,
todo push). `npm run verify:full` roda isso e mais pgTAP+Playwright (requer
Supabase local — gate completo antes de qualquer merge).

**Por que build de produção (`--mode test`), não `npm run dev`, para o
Playwright**: `AuthContext.tsx` tem um atalho de preview do AI Studio que
auto-loga um usuário de demonstração sempre que `import.meta.env.DEV===true`
e não há sessão ativa — isso torna `npm run dev` incompatível com testar
login/gates (a tela de login nunca apareceria numa `BrowserContext` nova).
`npm run test:e2e` builda com `vite build --mode test` (mesmo código de
produção, `DEV=false`) lendo `.env.test.local` (git-ignorado, mesmo conteúdo
de `.env.development.local` — nunca `.env.local`, que aponta para o Supabase
remoto) e serve com `vite preview` numa porta dedicada (4183, para não
colidir com um `npm run dev` pessoal que porventura já esteja rodando na
3000).

Fixtures de teste usam e-mails com prefixo `e2e-13a-` (`@e2e.local`) e são
sempre removidas em `finally`/`afterEach` — nunca dependem de conta pessoal
nem de dado remoto. Para conferir manualmente que nada ficou para trás:

```bash
docker exec supabase_db_synapsemed psql -U postgres -t -A -c \
  "select count(*) from auth.users where email like 'e2e-13a-%';"
# esperado: 0
```

### Gate "sem instrumentação de debug em produção"

```bash
npm run build                     # build de produção REAL (sem --mode test)
npm run check:no-debug-bundle     # falha se __syncDebug/__setTestBackoffOverride aparecerem em dist/assets/*.js
```

### CI (GitHub Actions)

`.github/workflows/ci.yml` — dois jobs, ambos em todo push/PR (`pull_request`,
nunca `pull_request_target`; sem segredos de repositório usados no workflow):

- **fast**: `npm ci` → typecheck → lint → unit → build → gate de bundle limpo.
- **full** (depende do fast): sobe Supabase local no runner (`supabase start`
  + `supabase db reset`), roda pgTAP, builda/serve o app em modo `test` contra
  esse Supabase local e roda a suíte Playwright completa; falha o job se
  sobrar qualquer fixture `e2e-13a-`. Artefatos de falha do Playwright (trace,
  screenshot, vídeo — nunca segredos/e-mails reais, já que as fixtures são
  sempre `@e2e.local`) publicados via `actions/upload-artifact`.

---

## 📂 Estrutura Principal do Projeto

- `src/components/auth/`: Telas e modais de login, cadastro, verificação de e-mail e redefinição de senha.
- `src/components/admin/`: Painel administrativo com controle de acesso protegido.
- `src/components/compendium/`: Módulos de leitura e navegação do compêndio médico.
- `src/components/questions/` e `src/components/simulados/`: Banco de questões e motor de simulados.
- `src/components/flashcards/`: Flashcards com algoritmo SRS de repetição espaçada.
- `src/contexts/AuthContext.tsx`: Provedor central de autenticação e sessão com Supabase Auth.
- `src/services/storage.ts`: Serviço de persistência com isolamento de dados por UID (`synapse_<uid>_*`).
- `supabase/`: Modelagem PostgreSQL, migrações versionadas e Row Level Security (ver seção abaixo).
- `docs/architecture/`: Documentação de arquitetura, incluindo a migração para Supabase.

---

## 🧱 Backend Supabase

O diretório `supabase/` contém a modelagem PostgreSQL, migrações versionadas, Row Level Security e um seed local mínimo. Supabase (Auth + Postgres) é o backend ativo em produção: o app React autentica e persiste dados via Supabase.

- `supabase/config.toml`: configuração do Supabase CLI.
- `supabase/migrations/`: DDL de tabelas, RLS/policies/funções/triggers e políticas de Storage, em ordem.
- `supabase/seed.sql`: dados demonstrativos mínimos e não sensíveis (sem usuário admin com senha fixa).
- `supabase/tests/database/rls_policies.test.sql`: suíte pgTAP de testes de RLS.
- `docs/architecture/supabase-schema.md`: esquema completo, matriz de acesso e desenho de segurança.
- `docs/architecture/migration-roadmap.md`: histórico da migração de backend para Supabase.

Variáveis de ambiente (documentadas em `.env.example`, sem valores reais): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. `SUPABASE_SERVICE_ROLE_KEY` nunca deve ter prefixo `VITE_` nem aparecer em código cliente, Git ou logs.
