/* global __dirname */
// App tsc excludes Deno globals using @ts-nocheck. Remove it in isolated copies
// so `deno check` actually validates every new Edge entrypoint and pinned SDK API.
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const name of [
  '_shared/connect-edge.ts', '_shared/connect-environment.ts', '_shared/connect-stream-adapter.ts',
  '_shared/connect-provider-worker.ts', '_shared/connect-credential-issuance.ts', '_shared/connect-consent-revocation.ts', '_shared/connect-webhook.ts', '_shared/supabase-public-key.ts', '_shared/supabase-admin-key.ts', '_shared/cors.ts',
  'connect-credentials/index.ts', 'connect-revoke-consent/index.ts', 'connect-provider-worker/index.ts', 'connect-webhook/index.ts',
]) {
  const destination = path.join(root, 'tmp/connect-m1/edge', name);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, readFileSync(path.join(root, 'supabase/functions', name), 'utf8').replace(/^\/\/ @ts-nocheck[^\n]*\n/gm, ''));
}
writeFileSync(path.join(root, 'tmp/connect-m1/edge/deno.json'), readFileSync(path.join(root, 'supabase/functions/connect-credentials/deno.json')));
console.log('Prepared isolated Edge sources with type checking enabled.');
