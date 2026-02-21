module.exports = {
  root: true,
  extends: ['expo'],
  rules: {
    // These "react compiler" style rules are too aggressive for this codebase right now
    // and generate lots of noise/errors for normal, intentional React patterns.
    'react-hooks/set-state-in-effect': 'off',
    'react-hooks/preserve-manual-memoization': 'off',
    'react-hooks/static-components': 'off',
    'react-hooks/refs': 'off',
    'react-hooks/purity': 'off',
    'react-hooks/use-memo': 'off',
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    '.expo/',
    '.turbo/',
    'android/',
    'ios/',
    // Deno edge functions import by URL; ESLint's node resolver can't resolve these.
    'supabase/functions/',
    // SQL migrations aren't lintable by ESLint.
    'supabase/migrations/',

    // Tooling configs; linting these often produces false positives.
    'metro.config.js',
  ],
};
