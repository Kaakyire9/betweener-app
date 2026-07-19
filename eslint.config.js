// Flat ESLint 10 config. Expo SDK 57 still publishes a few ESLint 9-era rules,
// so @eslint/compat supplies the removed rule-context APIs until Expo updates them.
const expoConfig = require('eslint-config-expo/flat');
const { fixupConfigRules } = require('@eslint/compat');
const { defineConfig } = require('eslint/config');
const compatibleExpoConfig = fixupConfigRules(expoConfig);
const tsEslint = compatibleExpoConfig.find(
  (config) => config.plugins?.['@typescript-eslint'],
)?.plugins?.['@typescript-eslint'];

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
  ...compatibleExpoConfig,
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
      // React Compiler is not enabled. Reanimated shared values, Expo Video players,
      // and refs intentionally use imperative mutation; revisit with a compiler rollout.
      'react-hooks/immutability': 'off',

      // `react-native` ships Flow syntax in JS entrypoints which `eslint-plugin-import` can't parse.
      'import/namespace': 'off',
    },
  },
  // Some files intentionally use `require()` (e.g., tests, optional native wrappers).
  {
    files: ['**/__tests__/**', 'components/NativeWrappers/**', 'hooks/useLocationPreference.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
