import { defineConfig, devices } from '@playwright/test';

// Testes de navegador reais contra Supabase LOCAL (nunca remoto/produção —
// ver tests/e2e/fixtures/localSupabase.ts, que se recusa a rodar se a URL
// resolvida não for localhost).
//
// IMPORTANTE — por que NÃO usamos `npm run dev` (achado real desta sessão,
// não documentado antes): `AuthContext.tsx` tem um atalho deliberado de
// preview do AI Studio — quando `import.meta.env.DEV === true` (verdadeiro
// em QUALQUER `vite`/`vite dev`, independente do arquivo `.env` carregado) E
// não há sessão Supabase ativa, o app AUTO-LOGA como um usuário de
// demonstração local (`local-demo-user`, sempre `status: 'active'`),
// pulando a tela de login por completo. Isso torna impossível testar
// login/gates de acesso contra o dev server: `page.goto('/')` numa
// `BrowserContext` nova (sem sessão) nunca mostra `#auth-email-input`.
// Solução: build de PRODUÇÃO (`import.meta.env.DEV === false`, mesmo
// caminho de código que roda no Vercel) apontando para o Supabase local via
// `--mode test` (`.env.test.local`, git-ignorado, mesmo conteúdo de
// `.env.development.local` — nunca `.env.local`, que aponta para o
// remoto). Ver `npm run build:e2e`/`preview:e2e` no package.json. O gate
// separado de "sem `__syncDebug` no bundle" roda contra o `dist/` de
// produção DE VERDADE (`npm run build`, sem `--mode test`), nunca este
// `dist-e2e/` de teste — ver scripts/check-no-debug-bundle.mjs.
export default defineConfig({
  testDir: './specs',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // fixtures de auth/perfil compartilham o mesmo Supabase local — evita corrida entre specs
  workers: 1,
  retries: 0, // proibido mascarar flakiness com retry global (ver restrições do prompt 13-A)
  reporter: [
    ['list'],
    ['html', { outputFolder: '../../playwright-report', open: 'never' }],
    ['json', { outputFile: '../../playwright-report/results.json' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4183',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build:e2e && npm run preview:e2e',
    url: 'http://127.0.0.1:4183',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
