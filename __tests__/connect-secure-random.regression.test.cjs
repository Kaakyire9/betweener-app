const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const { createSecureCallRandom } = require('../features/connect/security/secure-call-random.ts');

function commonJs(source, location, overrides, globals = {}) {
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = createRequire(location), exports = {};
  vm.runInNewContext(compiled, { exports, require: id => Object.hasOwn(overrides, id) ? overrides[id] : localRequire(id),
    Uint8Array, Date, Error, ...globals }, { filename: location });
  return exports;
}

function fixture(options = {}) {
  const user = '86000000-0000-4000-8000-000000000001', device = '86000000-0000-4000-8000-000000000003';
  const storage = new Map(), calls = [], fills = [], fallbacks = [];
  const crypto = {
    getRandomValues(bytes) { fills.push(bytes); if (options.fail) { bytes.fill(91); throw Error('native unavailable'); } return bytes.fill(71); },
    getRandomBytes() { fallbacks.push(true); throw Error('insecure development fallback'); },
  };
  const secure = { AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1, getItemAsync: async key => storage.get(key) ?? null,
    setItemAsync: async (key, value) => { storage.set(key, value); } };
  const location = path.resolve('features/connect/security/load-call-security.ts');
  const { loadCallSecurity } = commonJs(fs.readFileSync(location, 'utf8'), location, { 'expo-crypto': crypto, 'expo-secure-store': secure });
  const auth = { snapshot: () => ({ authenticated: true, userId: user, generation: 'synthetic-epoch' }),
    accessToken: () => 'synthetic-bearer', subscribe: () => () => {} };
  const rpc = async name => { calls.push(name); return { data: name === 'rpc_connect_security_capabilities'
    ? { e2ee: true, native_incoming: false } : true, error: null }; };
  return { load: () => loadCallSecurity(auth, device, rpc), storage, calls, fills, fallbacks };
}

test('the actual loader creates its device identity using native filling and never the development fallback', async () => {
  const f = fixture(), security = await f.load();
  assert.equal(security.encryptedCalls, true); assert.ok(security.agent);
  assert.equal(f.fills.length, 1); assert.equal(f.fallbacks.length, 0); assert.equal(f.storage.size, 1);
  assert.deepEqual(f.calls, ['rpc_connect_security_capabilities', 'rpc_connect_register_secure_device']);
});

test('native entropy failure wipes the temporary buffer and prevents identity persistence and registration', async () => {
  const f = fixture({ fail: true });
  await assert.rejects(f.load(), /connect_random_unavailable/);
  assert.equal(f.storage.size, 0); assert.equal(f.fallbacks.length, 0);
  assert.deepEqual(f.calls, ['rpc_connect_security_capabilities']);
  assert.equal(f.fills[0].every(byte => byte === 0), true);
});

test('existing identities are preserved without silently rotating peer trust or requesting new random bytes', async () => {
  const f = fixture(); await f.load(); const stored = [...f.storage]; await f.load();
  assert.deepEqual([...f.storage], stored); assert.equal(f.fills.length, 1);
});

test('the pinned Expo wrapper demonstrates the development fallback while the secure adapter calls only native filling', () => {
  const location = require.resolve('expo-crypto'); let fallback = 0, native = 0;
  const typesLocation = path.join(path.dirname(location), 'Crypto.types.js');
  const types = commonJs(fs.readFileSync(typesLocation, 'utf8'), typesLocation, {});
  const expo = commonJs(fs.readFileSync(location, 'utf8'), location, {
    'expo-modules-core': { UnavailabilityError: Error }, './Crypto.types': types, './aes': {},
    './ExpoCrypto': { __esModule: true, default: { getRandomValues(bytes) { native++; bytes.fill(87); } } },
  }, { __DEV__: true, global: {}, Math: Object.assign(Object.create(Math), { random() { fallback++; return 0.5; } }) });
  expo.getRandomBytes(32); assert.equal(fallback, 32); assert.equal(native, 0);
  const secure = createSecureCallRandom(expo.getRandomValues);
  assert.equal(secure(32).every(byte => byte === 87), true);
  assert.equal(secure(24).length, 24); assert.equal(native, 2); assert.equal(fallback, 32);
});

test('missing, malformed and throwing RNG implementations fail closed without returning partial key material', () => {
  assert.throws(() => createSecureCallRandom(undefined), /connect_random_unavailable/);
  const seen = [], secure = createSecureCallRandom(bytes => { seen.push(bytes); bytes.fill(83); return bytes.slice(); });
  assert.throws(() => secure(32), /connect_random_unavailable/); assert.equal(seen[0].every(byte => byte === 0), true);
  for (const size of [0, -1, 1.5, 1025, NaN, Infinity]) assert.throws(() => secure(size), /connect_random_unavailable/);
  assert.equal(seen.length, 1);
});
