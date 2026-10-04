import { defineConfig } from 'vitest/config';

// Testes do revisor local (D-12) contra o Supabase LOCAL: `npm run test:revisor-local`.
// Ficam fora do `npm run test:unit` (que roda no CI sem banco). Exigem `supabase start` e o banco recém-resetado
// (`supabase db reset`), com a vez do banco local (docs/operacao/EXECUTOR_PROTOCOL.md). Um arquivo por vez:
// o banco é compartilhado.
export default defineConfig({
  test: {
    name: 'revisor-local',
    environment: 'node',
    include: ['tests/revisor-local/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
