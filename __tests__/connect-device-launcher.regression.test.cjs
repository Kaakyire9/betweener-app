const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectUsbSafety, ensureReverse, inspectMetro, openLab, metroEnvironment, stopOwnedMetro, createLoopbackGet } = require('../scripts/lib/connect-device-safety-launcher.cjs');
const ok = stdout => ({ status: 0, stdout });
function fixture(overrides = {}) {
  const state = { connected: true, authorized: true, airplane: '1', wifi: 'Wifi is disabled', bluetooth: '  enabled: false\n  state: OFF', v4: '', v6: '', mapping: '', serial: 'offline-usb', ...overrides };
  const calls = [];
  const run = args => {
    calls.push([...args]);
    const key = args.join(' ');
    if (key === 'devices -l') return ok(`List of devices attached\n${state.connected ? `${state.serial} ${state.authorized ? 'device' : 'unauthorized'} model:SM_A176B` : ''}\n`);
    if (key === '-d get-serialno') return state.connected ? ok(state.serial) : { status: 1 };
    const tail = args.slice(2).join(' ');
    if (tail === 'shell getprop ro.product.model') return ok('SM-A176B');
    if (tail.startsWith('shell pm path ')) return ok(state.package ?? 'package:/data/app/fixture/com.aduboffour.betweener.staging-a/base.apk');
    if (tail === 'shell settings get global airplane_mode_on') return ok(state.airplane);
    if (tail === 'shell cmd wifi status') return ok(state.wifi);
    if (tail === 'shell dumpsys bluetooth_manager') return ok(state.bluetooth);
    if (tail === 'shell ip -4 route show table all') return state.badRoutes ? { status: 1 } : ok(state.v4);
    if (tail === 'shell ip -6 route show table all') return ok(state.v6);
    if (tail === 'reverse --list') return ok(state.mapping);
    if (tail === 'reverse tcp:8094 tcp:8094') { if (!state.ignoreMapping) state.mapping = 'UsbFfs tcp:8094 tcp:8094'; return ok('8094'); }
    if (tail === 'shell toybox nc -z -w 3 127.0.0.1 8094') return { status: state.tcpFailure ? 1 : 0 };
    if (tail.startsWith('shell am start ')) return state.linkFailure ? ok('Error: Activity not found') : ok('Starting: Intent');
    throw Error('unexpected_command');
  };
  return { state, calls, run, opened: () => calls.some(x => x.includes('am')) };
}
const metro = async () => ({ ready: true });
test('read-only readiness never maps ports or opens an app, and does not certify hardware', () => {
  const f = fixture(); const r = inspectUsbSafety(f.run);
  assert.equal(r.ready, true); assert.equal(r.hardwareVerified, false); assert.equal(r.isolationAttestation, false);
  assert.equal(f.opened(), false); assert.ok(!f.calls.some(x => x.includes('reverse')));
});
for (const [label, options, reason] of [
  ['disconnected', { connected: false }, 'USB_PHONE_NOT_CONNECTED'], ['unauthorized', { authorized: false }, 'USB_AUTHORIZATION_REQUIRED'],
  ['airplane off', { airplane: '0' }, 'EXTERNAL_NETWORK_NOT_ISOLATED'], ['Wi-Fi enabled', { wifi: 'Wifi is enabled' }, 'EXTERNAL_NETWORK_NOT_ISOLATED'],
  ['Bluetooth enabled', { bluetooth: '  enabled: true\n  state: ON' }, 'EXTERNAL_NETWORK_NOT_ISOLATED'],
  ['IPv4 external route', { v4: 'default via 192.0.2.1 dev wlan0 table 10' }, 'EXTERNAL_NETWORK_NOT_ISOLATED'],
  ['IPv6 external route', { v6: 'default via fe80::1 dev rmnet1 table 11' }, 'EXTERNAL_NETWORK_NOT_ISOLATED'],
  ['unreadable routing', { badRoutes: true }, 'PHONE_STATE_UNREADABLE'], ['app absent', { package: '' }, 'STAGING_APP_NOT_INSTALLED'],
]) test(`${label} blocks manual launch without native/media actions`, async () => {
  const f = fixture(options); const r = await openLab(f.run, metro);
  assert.equal(r.ready, false); assert.equal(r.reason, reason); assert.equal(f.opened(), false);
});
test('missing USB map is created and verified again after a disconnection', () => {
  const f = fixture(), device = inspectUsbSafety(f.run);
  assert.deepEqual(ensureReverse(f.run, device), { ready: true, created: true });
  assert.deepEqual(ensureReverse(f.run, device), { ready: true, created: false });
  f.state.mapping = ''; assert.deepEqual(ensureReverse(f.run, device), { ready: true, created: true });
});
test('an existing conflicting mapping is preserved and blocks opening', async () => {
  const f = fixture({ mapping: 'UsbFfs tcp:8094 tcp:9000' });
  assert.equal((await openLab(f.run, metro)).reason, 'USB_MAPPING_CONFLICT');
  assert.equal(f.state.mapping, 'UsbFfs tcp:8094 tcp:9000'); assert.equal(f.opened(), false);
});
test('a successful mapping command without readback is insufficient', async () => {
  const f = fixture({ ignoreMapping: true }); assert.equal((await openLab(f.run, metro)).reason, 'USB_MAPPING_NOT_CONFIRMED'); assert.equal(f.opened(), false);
});
test('manual launch requires a reachable TCP listener', async () => {
  const f = fixture({ tcpFailure: true }); assert.equal((await openLab(f.run, metro)).reason, 'PHONE_CANNOT_REACH_METRO'); assert.equal(f.opened(), false);
});
test('manual launch rechecks phone identity and isolation after awaiting Metro', async () => {
  for (const change of [f => { f.state.serial = 'different-usb'; }, f => { f.state.wifi = 'Wifi is enabled'; }]) {
    const f = fixture(); assert.equal((await openLab(f.run, async () => { change(f); return { ready: true }; })).reason, 'USB_SAFETY_CHANGED'); assert.equal(f.opened(), false);
  }
});
test('operator cancellation while awaiting Metro cannot open a late app', async () => {
  const f = fixture(); let active = true;
  assert.equal((await openLab(f.run, async () => { active = false; return { ready: true }; }, () => active)).reason, 'OPERATOR_CANCELLED'); assert.equal(f.opened(), false);
});
test('only an explicit launch action opens the exact staging lab, never arms sensors', async () => {
  const f = fixture(); assert.equal((await openLab(f.run, metro)).reason, 'LAB_LINK_OPENED_BY_OPERATOR');
  const opened = f.calls.filter(x => x.includes('am')); assert.equal(opened.length, 1);
  assert.ok(opened[0].includes('com.aduboffour.betweener.staging')); assert.ok(opened[0].some(x => x.startsWith('betweenerstaging://expo-development-client/')));
  assert.ok(f.calls.every(x => !x.includes('grant') && !x.includes('install') && !x.includes('force-stop')));
});
test('a rejected activity is not reported as opened', async () => { const f = fixture({ linkFailure: true }); assert.equal((await openLab(f.run, metro)).ready, false); });
test('Metro readiness rejects product bootstrap, remote bundles and malformed manifests', async () => {
  const body = { extra: { expoClient: { slug: 'connect-offline-safety-lab' } }, launchAsset: { url: 'http://127.0.0.1:8094/index.ts.bundle' } };
  const get = async p => ({ status: 200, text: p === '/status' ? 'packager-status:running' : JSON.stringify(body) });
  assert.equal((await inspectMetro(get)).ready, true);
  for (const url of ['https://example.invalid/index.ts.bundle', 'http://127.0.0.1:8094/index.bundle', 'http://127.0.0.1:8081/index.ts.bundle', 'http://127.0.0.1:8094/index.ts.bundle?lazy=true']) {
    body.launchAsset.url = url; assert.equal((await inspectMetro(get)).ready, false);
  }
  assert.equal((await inspectMetro(async () => null)).reason, 'METRO_NOT_RUNNING');
});
test('offline startup removes proxy/host overrides and preserves unrelated caller environment', () => {
  const original = { EXPO_PACKAGER_PROXY_URL: 'untrusted', REACT_NATIVE_PACKAGER_HOSTNAME: '192.0.2.1', UNRELATED: 'keep' };
  const result = metroEnvironment(original); assert.equal(result.EXPO_OFFLINE, '1'); assert.equal(result.EXPO_NO_TYPESCRIPT_SETUP, '1'); assert.equal(result.CI, '1');
  assert.equal(result.EXPO_PACKAGER_PROXY_URL, undefined); assert.equal(result.REACT_NATIVE_PACKAGER_HOSTNAME, undefined); assert.equal(result.UNRELATED, 'keep'); assert.equal(original.EXPO_PACKAGER_PROXY_URL, 'untrusted');
});
test('failed owned process-tree stop cannot claim server shutdown', async () => {
  const result = await stopOwnedMetro({ pid: 123, exitCode: null }, () => ({ status: 1 }), async () => { throw Error('must_not_assume_exit'); });
  assert.equal(result.stopped, false); assert.equal(result.reason, 'OWNED_PROCESS_STOP_REJECTED');
  const thrown = await stopOwnedMetro({ pid: 123, exitCode: null }, () => { throw Error('kill_failed'); }, async () => true);
  assert.equal(thrown.stopped, false);
});
test('accepted stop request without exit evidence remains unconfirmed', async () => {
  const result = await stopOwnedMetro({ pid: 123, exitCode: null }, () => ({ status: 0 }), async () => false);
  assert.equal(result.stopped, false); assert.equal(result.reason, 'OWNED_PROCESS_EXIT_UNCONFIRMED');
  const unreadable = await stopOwnedMetro({ pid: 123, exitCode: null }, () => ({ status: 0 }), async () => { throw Error('exit_unreadable'); });
  assert.equal(unreadable.stopped, false);
});
test('verified stop targets only the child PID handed to the launcher', async () => {
  const killed = []; const child = { pid: 123, exitCode: null };
  const result = await stopOwnedMetro(child, pid => { killed.push(pid); return { status: 0 }; }, async c => { assert.equal(c, child); return true; });
  assert.deepEqual(killed, [123]); assert.equal(result.stopped, true);
});
test('an already exited child is never killed again using a potentially reused PID', async () => {
  const result = await stopOwnedMetro({ pid: 123, exitCode: 0 }, () => { throw Error('pid_reuse'); }, async () => false);
  assert.equal(result.stopped, true);
});
test('a real loopback manifest slower than the former three-second timeout remains usable', async () => {
  const http = require('node:http');
  const server = http.createServer((_req, res) => { setTimeout(() => { res.end('delayed-local-manifest'); }, 3300); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await createLoopbackGet({ port: server.address().port })('/');
    assert.equal(result.status, 200); assert.equal(result.text, 'delayed-local-manifest');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('an unreadable manifest is not labeled a different project', async () => {
  const result = await inspectMetro(async p => p === '/status' ? { status: 200, text: 'packager-status:running' } : null);
  assert.equal(result.reason, 'METRO_MANIFEST_UNAVAILABLE'); assert.equal(result.ready, false);
});
test('loopback readiness has a wall-clock bound even when a server trickles data', async () => {
  const http = require('node:http');
  const server = http.createServer((_req, res) => {
    const timer = setInterval(() => { res.write('x'); }, 10);
    res.on('close', () => clearInterval(timer));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await createLoopbackGet({ port: server.address().port, timeoutMs: 200 })('/');
    assert.equal(result, null);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
