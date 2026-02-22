// Flat ESLint config for ESLint v9 (Expo SDK 54+ toolchain).
// Keep it local so `npm run lint` works without `expo lint`.
const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');

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
    settings: {
      // `eslint-plugin-import` can't resolve Deno remote URLs. Ignore them so lint works offline.
      'import/ignore': ['^https?://'],
    },
    rules: {
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
]);
