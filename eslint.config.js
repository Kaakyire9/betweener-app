// Local ESLint config (flat) so we can run `eslint` directly without relying on `expo lint`.
// `expo lint` may try to fetch SDK metadata from the network in some environments.
const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.expo/**',
      '**/.turbo/**',
      '**/android/**',
      '**/ios/**',
      // Deno edge functions import by URL; ESLint's node resolver can't resolve these.
      'supabase/functions/**',
      // SQL migrations aren't lintable by ESLint.
      'supabase/migrations/**',
    ],
  },
]);
