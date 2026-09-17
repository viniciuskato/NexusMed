import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Testes unitários: lógica pura/estado, sem navegador, sem Supabase real.
// Não confundir com Playwright (tests/e2e) — ver README/AGENTS.md.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    css: false,
  },
});
