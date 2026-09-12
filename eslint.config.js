// ESLint 9 flat config — TypeScript + React Hooks + acessibilidade JSX.
// Escopo: pegar erros reais (hooks incorretos, a11y quebrada, imports/vars
// não usados), sem reformatar o projeto inteiro (não há regra de estilo/
// formatação aqui — isso é papel de um formatter, não deste gate).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'supabase/.branches/**', 'supabase/.temp/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      'unused-imports': unusedImports,
    },
    rules: {
      // Só as duas regras clássicas de Hooks (regras de invocação +
      // dependências de efeito). A partir da v7, o plugin também embute o
      // conjunto de regras do "React Compiler" (set-state-in-effect,
      // immutability, purity, gating, static-components etc.) — um linter
      // bem mais rígido, pensado para preparar adoção do React Compiler,
      // cujos achados exigiriam reescrever lógica de hooks/efeitos em
      // arquivos centrais (inclusive `AuthContext.tsx`) para silenciar.
      // Fora de escopo aqui: a entrega proíbe alterar funcionalidade de
      // autenticação e pede não reformatar o projeto inteiro. Usar só
      // `recommended.rules` traria ~10 regras novas de uma vez sem
      // relação com o objetivo desta entrega (reprodutibilidade/deps).
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      ...jsxA11y.configs.recommended.rules,

      // TypeScript já cobre variáveis/imports não usados de forma mais
      // precisa (com autofix) via unused-imports; desliga a regra nativa
      // para não duplicar/discordar do relatório.
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
      ],

      // Scripts operacionais (CLI, tsx) usam `any`/require pontuais e não
      // passam por revisão de tipos tão estrita quanto o app — mantido
      // como aviso, não erro, para não bloquear o gate por código já
      // conhecido e fora do bundle de produção.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Downgrades pontuais e justificados dentro de jsx-a11y/recommended
      // (as demais ~15 regras do recommended continuam 'error' e já
      // pegaram/corrigiram achados reais nesta entrega — ver
      // label-has-associated-control, todas as 40 ocorrências corrigidas
      // com id/htmlFor ou convertendo cabeçalho-de-grupo para `span`):
      //
      // - click-events-have-key-events / no-static-element-interactions /
      //   no-noninteractive-element-interactions: pedem adicionar
      //   onKeyDown+role+tabIndex a ~20 elementos clicáveis distintos
      //   (cards de questão, chips de filtro, presets de simulado). Fazer
      //   isso sem testar teclado/foco de verdade no navegador arrisca
      //   trocar "clicável" por "clicável mas com foco/teclado quebrado"
      //   — pior que o estado atual. Esta entrega é sobre reprodutibilidade/
      //   dependências, não a suíte de navegador (fora de escopo aqui por
      //   instrução explícita do prompt). Mantido como aviso visível
      //   (não quebra `npm run verify`) até uma entrega dedicada de
      //   acessibilidade de teclado com validação real em navegador.
      // - no-autofocus: o único uso (`GlobalSearchModal.tsx`) é
      //   `autoFocus` no campo de busca ao abrir o modal — UX intencional,
      //   não um acidente; a regra por padrão marca qualquer autofocus
      //   como erro. Remover mudaria comportamento do produto, proibido
      //   nesta entrega. Mantido como aviso para reavaliação futura
      //   (ex.: só focar depois da animação de abertura do modal).
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      'jsx-a11y/no-autofocus': 'warn',
    },
  },
  {
    // Scripts Node executados via tsx (não fazem parte do bundle do
    // navegador) — ambiente Node, regras de hooks/a11y não se aplicam.
    files: ['scripts/**/*.{ts,mjs,cjs,js}'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'jsx-a11y/no-autofocus': 'off',
    },
  },
);
