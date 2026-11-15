const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const nacl = require('tweetnacl');
const util = require('tweetnacl-util');

function fixture() {
  const storage = new Map(), fills = [];
  const controls = { failAt: 0, fallbacks: 0 };
  const ports = {
    'expo-crypto': {
      getRandomValues(bytes) { fills.push(bytes); bytes.fill(70 + fills.length); if (fills.length === controls.failAt) throw Error('native failure'); return bytes; },
      getRandomBytes() { controls.fallbacks++; throw Error('insecure fallback'); },
    },
    'expo-secure-store': { getItemAsync: async key => storage.get(key) ?? null, setItemAsync: async (key, value) => { storage.set(key, value); } },
    './crypto/secure-random': require('../lib/crypto/secure-random.ts'),
  };
  const location = path.resolve('lib/e2ee.ts'), localRequire = createRequire(location), exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(location, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(compiled, { exports, require: id => Object.hasOwn(ports, id) ? ports[id] : localRequire(id), Uint8Array, Error }, { filename: location });
  return { api: exports, storage, fills, controls };
}

test('actual media encryption round-trips with native key/nonce generation and wipes temporary key copies', async () => {
  const f = fixture(), sender = await f.api.getOrCreateDeviceKeypair();
  const receiver = nacl.box.keyPair.fromSecretKey(new Uint8Array(32).fill(9));
  const plainBytes = new Uint8Array([1, 4, 8, 16, 32]);
  const encrypted = await f.api.encryptMediaBytes({ plainBytes, senderKeypair: sender, receiverPublicKeyB64: util.encodeBase64(receiver.publicKey) });
  const opened = await f.api.decryptMediaBytes({ ...encrypted, encryptedKeyB64: encrypted.encryptedKeyReceiverB64,
    senderPublicKeyB64: sender.publicKeyB64, receiverSecretKeyB64: util.encodeBase64(receiver.secretKey) });
  assert.deepEqual(opened, plainBytes); assert.equal(f.controls.fallbacks, 0);
  assert.deepEqual(f.fills.map(bytes => bytes.length), [32, 32, 24, 24]);
  assert.equal(f.fills[0].every(byte => byte === 0), true);
  assert.equal(f.fills[1].every(byte => byte === 0), true);
});

test('native RNG failure during identity creation persists no key and returns no fallback identity', async () => {
  const f = fixture(); f.controls.failAt = 1;
  await assert.rejects(f.api.getOrCreateDeviceKeypair(), /secure_random_unavailable/);
  assert.equal(f.storage.size, 0); assert.equal(f.controls.fallbacks, 0);
  assert.equal(f.fills[0].every(byte => byte === 0), true);
});

test('a nonce generation failure also wipes the already-created media key', async () => {
  const f = fixture(), sender = await f.api.getOrCreateDeviceKeypair(); f.controls.failAt = 3;
  await assert.rejects(f.api.encryptMediaBytes({ plainBytes: new Uint8Array([1]), senderKeypair: sender,
    receiverPublicKeyB64: sender.publicKeyB64 }), /secure_random_unavailable/);
  assert.equal(f.fills[1].every(byte => byte === 0), true);
  assert.equal(f.fills[2].every(byte => byte === 0), true);
});

test('invalid recipient material cannot retain the generated media key', async () => {
  const f = fixture(), sender = await f.api.getOrCreateDeviceKeypair();
  await assert.rejects(f.api.encryptMediaBytes({ plainBytes: new Uint8Array([1]), senderKeypair: sender, receiverPublicKeyB64: '!!' }));
  assert.equal(f.fills[1].every(byte => byte === 0), true);
});

test('loading a stored identity preserves it without creating or registering a replacement', async () => {
  const f = fixture(), first = await f.api.getOrCreateDeviceKeypair(), second = await f.api.getOrCreateDeviceKeypair();
  assert.equal(second.publicKeyB64, first.publicKeyB64); assert.equal(f.fills.length, 1); assert.equal(f.storage.size, 1);
});
