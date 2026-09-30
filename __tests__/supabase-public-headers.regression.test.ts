import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  buildSupabasePublicHeaders,
  isSupabasePublicApiKey,
} from '../lib/supabase-public-headers.ts';

const publishableKey = 'sb_publishable_staging_public_key';
const legacyAnonKey = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature';
const userAccessToken = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.signature';

test('publishable key is emitted only as apikey for anonymous requests', () => {
  assert.deepEqual(buildSupabasePublicHeaders({ apiKey: publishableKey }), {
    apikey: publishableKey,
  });
});

test('real user JWT is emitted separately as Authorization', () => {
  assert.deepEqual(buildSupabasePublicHeaders({
    apiKey: publishableKey,
    accessToken: userAccessToken,
  }), {
    apikey: publishableKey,
    Authorization: `Bearer ${userAccessToken}`,
  });
});

test('legacy anon JWT remains accepted as an API key during migration', () => {
  assert.equal(isSupabasePublicApiKey(legacyAnonKey), true);
  assert.deepEqual(buildSupabasePublicHeaders({ apiKey: legacyAnonKey }), {
    apikey: legacyAnonKey,
  });
});

test('API key can never be mistaken for a user access token', () => {
  assert.throws(
    () => buildSupabasePublicHeaders({
      apiKey: publishableKey,
      accessToken: publishableKey,
    }),
    /invalid_supabase_user_access_token/,
  );
  assert.throws(
    () => buildSupabasePublicHeaders({
      apiKey: legacyAnonKey,
      accessToken: legacyAnonKey,
    }),
    /invalid_supabase_user_access_token/,
  );
});

test('invalid public API keys fail closed', () => {
  assert.throws(
    () => buildSupabasePublicHeaders({ apiKey: 'not-a-key' }),
    /invalid_supabase_public_api_key/,
  );
});

test('manual client requests use the canonical public-header helper', () => {
  const expectedFiles = [
    'app/(auth)/verify-phone.tsx',
    'lib/auth-context.tsx',
    'lib/phone-verification.ts',
    'lib/supabase.ts',
  ];

  for (const relativePath of expectedFiles) {
    const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
    assert.match(source, /buildSupabasePublicHeaders/);
    assert.doesNotMatch(
      source,
      /Authorization\s*:\s*`Bearer \$\{(?:SUPABASE_ANON_KEY|anonKey|config\.supabaseKey)/,
    );
  }
});

test('phone verification preserves anonymous and authenticated call semantics', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'lib/phone-verification.ts'),
    'utf8',
  );
  assert.match(
    source,
    /buildSupabasePublicHeaders\(\{ apiKey: config\.supabaseKey, accessToken \}\)/,
  );
  assert.doesNotMatch(source, /accessToken\s*\?\?\s*config\.supabaseKey/);
  assert.doesNotMatch(source, /process\.env\.SUPABASE_ANON_KEY/);
});

test('authenticated REST fallbacks pass the user token separately', () => {
  const authSource = fs.readFileSync(
    path.join(process.cwd(), 'lib/auth-context.tsx'),
    'utf8',
  );
  const verificationSource = fs.readFileSync(
    path.join(process.cwd(), 'app/(auth)/verify-phone.tsx'),
    'utf8',
  );

  assert.match(
    authSource,
    /buildSupabasePublicHeaders\(\{ apiKey: anonKey, accessToken \}\)/,
  );
  assert.match(
    verificationSource,
    /buildSupabasePublicHeaders\(\{ apiKey: anonKey, accessToken \}\)/,
  );
});

test('storage upload keeps API key and user JWT in separate headers', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'lib/chat/transfer/chat-upload-transport.ts'),
    'utf8',
  );
  assert.match(source, /authorization:\s*`Bearer \$\{request\.accessToken\}`/);
  assert.match(source, /apikey:\s*request\.anonKey/);
});
