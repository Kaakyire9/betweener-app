import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { resolveSupabaseAdminCredential } from '../supabase/functions/_shared/supabase-admin-key.ts';

const secret = (suffix: string) => `sb_secret_${suffix}`;

test('prefers the injected default Supabase secret key', () => {
  const result = resolveSupabaseAdminCredential({
    injectedSecretKeys: JSON.stringify({ default: secret('injected') }),
    dedicatedSecretKey: secret('dedicated'),
  });

  assert.deepEqual(result, {
    key: secret('injected'),
    source: 'injected_secret_key',
  });
});

test('supports an explicitly named injected secret key', () => {
  const result = resolveSupabaseAdminCredential({
    injectedSecretKeys: JSON.stringify({
      default: secret('default'),
      edge: secret('edge'),
    }),
    keyName: 'edge',
  });

  assert.equal(result.key, secret('edge'));
  assert.equal(result.source, 'injected_secret_key');
});

test('uses a dedicated server-only key when no injected map is present', () => {
  const result = resolveSupabaseAdminCredential({
    dedicatedSecretKey: secret('dedicated'),
  });

  assert.equal(result.source, 'dedicated_secret_key');
});

test('does not fall back to the legacy service-role key', () => {
  assert.throws(
    () => resolveSupabaseAdminCredential({}),
    /missing_supabase_admin_key/,
  );
});

test('fails closed for malformed or incomplete injected key maps', () => {
  assert.throws(
    () => resolveSupabaseAdminCredential({ injectedSecretKeys: '{bad-json' }),
    /invalid_supabase_secret_keys_json/,
  );
  assert.throws(
    () => resolveSupabaseAdminCredential({
      injectedSecretKeys: JSON.stringify({ other: secret('other') }),
    }),
    /missing_supabase_secret_key:default/,
  );
});

test('rejects publishable or malformed keys in privileged new-key slots', () => {
  assert.throws(
    () => resolveSupabaseAdminCredential({
      injectedSecretKeys: JSON.stringify({ default: 'sb_publishable_not_admin' }),
    }),
    /invalid_supabase_admin_key:injected_secret_key/,
  );
});

test('legacy service-role key access is removed from Edge Function runtime', () => {
  const functionsRoot = path.join(process.cwd(), 'supabase', 'functions');
  const matches: string[] = [];

  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.name.endsWith('.ts')) {
        const source = fs.readFileSync(target, 'utf8');
        if (source.includes('SUPABASE_SERVICE_ROLE_KEY')) {
          matches.push(path.relative(process.cwd(), target).replaceAll('\\', '/'));
        }
      }
    }
  };

  visit(functionsRoot);
  assert.deepEqual(matches, []);
});

test('client and mobile code never reference server-only Supabase keys', () => {
  const roots = ['app', 'components', 'features', 'hooks', 'lib'];
  const forbidden = ['SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY', 'sb_secret_'];
  const matches: string[] = [];

  const visit = (directory: string) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
        const source = fs.readFileSync(target, 'utf8');
        if (forbidden.some((token) => source.includes(token))) {
          matches.push(path.relative(process.cwd(), target).replaceAll('\\', '/'));
        }
      }
    }
  };

  roots.forEach(visit);
  assert.deepEqual(matches, []);
});
