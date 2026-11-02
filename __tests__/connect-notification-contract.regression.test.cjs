const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const navigation = require('../features/connect/domain/call-navigation.ts');
const binding = require('../features/connect/domain/notification-binding.ts');
const compiled = ts.transpileModule(fs.readFileSync('lib/notifications/notification-routing.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const id = 'a0330000-0000-4000-8000-000000000010';
function load(enabled) {
  const exports = {}, context = { exports, module: { exports }, process: { env: { EXPO_PUBLIC_ENVIRONMENT: 'staging' } }, require(name) {
    if (name === '@react-native-async-storage/async-storage') return {};
    if (name.includes('connect-runtime-policy')) return { connectProductPolicy: { ui: enabled } };
    if (name.includes('call-navigation')) return navigation;
    if (name.includes('notification-binding')) return binding;
    throw Error(`Unexpected routing dependency ${name}`);
  } };
  vm.runInNewContext(compiled, context); return context.module.exports.buildNotificationRoute;
}
test('actual router requires a navigation tap and the account/generation envelope', () => {
  const route = load(true);
  const data = { type: 'connect_voice_incoming', call_id: id, recipient_user_id: id, call_generation: '2026-10-31T10:00:00Z', call_version: 2 };
  assert.equal(JSON.stringify(route({ actionIdentifier: 'DEFAULT', data })), JSON.stringify(binding.boundConnectNotificationTarget(data, true)));
  for (const extras of [{ token: 'private' }, { apiKey: 'private' }, { name: 'Untrusted' }, { accepted: true }]) assert.equal(route({ actionIdentifier: 'DEFAULT', data: { ...data, ...extras } }), null);
  assert.equal(route({ actionIdentifier: 'ACCEPT_CALL', data }), null);
  assert.equal(load(false)({ actionIdentifier: 'DEFAULT', data }), null);
});
test('unknown/malformed Connect payloads cannot use generic route or profile fallbacks', () => {
  const route = load(true);
  for (const data of [{ type: 'connect_unsafe', call_id: id, route: '/profile-view', profile_id: 'private' },
    { type: 'connect_voice_incoming', call_id: ['array'], route: '/connect/voice' },
    { route: `/connect/voice?callId=${id}&token=private` }, { route: '/connect' }]) assert.equal(route({ actionIdentifier: 'DEFAULT', data }), null);
});
test('Connect additions preserve existing ordinary message navigation', () => {
  const route = load(false)({ actionIdentifier: 'DEFAULT', data: { type: 'message', profile_id: 'peer' } });
  assert.equal(route.pathname, '/chat/[id]'); assert.equal(route.params.peerProfileId, 'peer');
});
