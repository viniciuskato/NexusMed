import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Testes unitários: lógica pura/estado, sem navegador, sem Supabase real.
// Não confundir com Playwright (tests/e2e) — ver README/AGENTS.md.
//
// `tests/component/**` é uma segunda categoria, adicionada na 41-B: testes
// focados de componentes React que precisam de DOM real (ex.: provar que um
// listener de teclado não usa callback/estado obsoleto após rerender) usam
// jsdom via um projeto Vitest dedicado, mantendo o padrão node+sem-DOM para
// tudo em `tests/unit`.
export default defineConfig({
  plugins: [react()],
  test: {
    css: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'component',
          environment: 'jsdom',
          include: ['tests/component/**/*.test.tsx'],
        },
      },
    ],
  },
});
