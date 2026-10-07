import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { resolveSupabasePublicApiKey } from '../supabase/functions/_shared/supabase-public-key.ts';

const defaultKey = 'sb_publishable_staging_default';
const namedKey = 'sb_publishable_staging_named';

test('server resolver prefers the injected default publishable key', () => {
  assert.equal(resolveSupabasePublicApiKey({
    injectedPublishableKeys: JSON.stringify({ default: defaultKey }),
    dedicatedPublishableKey: 'sb_publishable_dedicated',
  }), defaultKey);
});

test('server resolver supports an explicitly selected injected key', () => {
  assert.equal(resolveSupabasePublicApiKey({
    injectedPublishableKeys: JSON.stringify({ default: defaultKey, staging: namedKey }),
    keyName: 'staging',
  }), namedKey);
});

test('server resolver supports a dedicated publishable-key secret', () => {
  assert.equal(resolveSupabasePublicApiKey({
    dedicatedPublishableKey: 'sb_publishable_dedicated',
  }), 'sb_publishable_dedicated');
});

test('server resolver fails closed for missing, malformed, or legacy keys', () => {
  assert.throws(() => resolveSupabasePublicApiKey({}), /missing_supabase_publishable_key/);
  assert.throws(
    () => resolveSupabasePublicApiKey({ injectedPublishableKeys: '{' }),
    /invalid_supabase_publishable_keys_json/,
  );
  assert.throws(
    () => resolveSupabasePublicApiKey({
      injectedPublishableKeys: JSON.stringify({ default: 'legacy-anon-jwt' }),
    }),
    /invalid_supabase_publishable_key/,
  );
});

test('Edge Function runtime code has no legacy anon-key dependency', () => {
  const root = path.join(process.cwd(), 'supabase/functions');
  const pending = [root];
  const offenders: string[] = [];

  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        const source = fs.readFileSync(fullPath, 'utf8');
        if (source.includes('SUPABASE_ANON_KEY')) {
          offenders.push(path.relative(process.cwd(), fullPath));
        }
      }
    }
  }

  assert.deepEqual(offenders, []);
});

test('anonymous phone functions explicitly bypass gateway JWT verification', () => {
  const config = fs.readFileSync(path.join(process.cwd(), 'supabase/config.toml'), 'utf8');
  for (const functionName of ['send-verification', 'verify-phone']) {
    assert.match(
      config,
      new RegExp(`\\[functions\\.${functionName}\\][\\s\\S]*?verify_jwt\\s*=\\s*false`),
    );
  }
});
