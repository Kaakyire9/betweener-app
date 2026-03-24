// Flat ESLint config for ESLint v9 (Expo SDK 54+ toolchain).
// Keep it local so `npm run lint` works without `expo lint`.
const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');
const tsEslint = require('@typescript-eslint/eslint-plugin');

module.exports = defineConfig([
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.expo/**',
      '**/.turbo/**',
      '**/android/**',
      '**/ios/**',
      // Supabase edge functions use Deno-style remote imports; lint them separately.
      'supabase/functions/**',
      '**/supabase/functions/**',
      'supabase/migrations/**',
      '**/supabase/migrations/**',
      'metro.config.js',
    ],
  },
  expoConfig,
  {
    plugins: {
      '@typescript-eslint': tsEslint,
    },
    settings: {
      // `eslint-plugin-import` can't resolve Deno remote URLs. Ignore them so lint works offline.
      'import/ignore': ['^https?://'],
    },
    rules: {
      // `react-hooks/exhaustive-deps` is very noisy in this repo right now (lots of intentional
      // one-shot effects + memoized style objects). We'll re-enable under a stricter lint script
      // once the codebase is cleaned up.
      'react-hooks/exhaustive-deps': 'off',

      // Allow underscore-prefixed bindings for intentionally-unused values.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
        },
      ],

      // Too aggressive for this repo right now; treat as perf guidance, not errors.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/use-memo': 'off',

      // `react-native` ships Flow syntax in JS entrypoints which `eslint-plugin-import` can't parse.
      'import/namespace': 'off',
    },
  },
  // Some files intentionally use `require()` (e.g., tests, optional native wrappers).
  {
    plugins: {
      '@typescript-eslint': tsEslint,
    },
    files: ['**/__tests__/**', 'components/NativeWrappers/**', 'hooks/useLocationPreference.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
