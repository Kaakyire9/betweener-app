const http = require('node:http');

const PORT = 8094;
const METRO_READ_TIMEOUT_MS = 10000;
const PACKAGE = 'com.aduboffour.betweener.staging';
const LAB_URI = `betweenerstaging://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A${PORT}`;
const success = r => r && r.status === 0 && !r.error;
const output = r => String(r?.stdout || '').trim();

function selectUsbDevice(run) {
  const devices = run(['devices', '-l']);
  if (!success(devices)) return { ready: false, reason: 'ADB_UNAVAILABLE' };
  const rows = output(devices).split(/\r?\n/).filter(s => s && !s.startsWith('List of') && !s.startsWith('*'));
  const usb = run(['-d', 'get-serialno']);
  if (!success(usb) || !output(usb) || output(usb) === 'unknown') {
    const unauthorized = rows.some(s => /\sunauthorized(?:\s|$)/.test(s));
    return { ready: false, reason: unauthorized ? 'USB_AUTHORIZATION_REQUIRED' : rows.length > 1 ? 'SELECT_ONE_USB_PHONE' : 'USB_PHONE_NOT_CONNECTED' };
  }
  const serial = output(usb);
  if (rows.some(s => s.split(/\s+/)[0] === serial && /\sunauthorized(?:\s|$)/.test(s))) return { ready: false, reason: 'USB_AUTHORIZATION_REQUIRED' };
  if (!rows.some(s => s.split(/\s+/)[0] === serial && /\sdevice(?:\s|$)/.test(s))) return { ready: false, reason: 'USB_PHONE_NOT_READY' };
  return { ready: true, serial, reason: 'USB_CONNECTED' };
}

function inspectUsbSafety(run) {
  const selected = selectUsbDevice(run);
  if (!selected.ready) return selected;
  const read = args => run(['-s', selected.serial, 'shell', ...args]);
  const observations = {
    model: read(['getprop', 'ro.product.model']),
    package: read(['pm', 'path', PACKAGE]),
    airplane: read(['settings', 'get', 'global', 'airplane_mode_on']),
    wifi: read(['cmd', 'wifi', 'status']),
    bluetooth: read(['dumpsys', 'bluetooth_manager']),
    v4: read(['ip', '-4', 'route', 'show', 'table', 'all']),
    v6: read(['ip', '-6', 'route', 'show', 'table', 'all']),
  };
  if (Object.values(observations).some(r => !success(r))) return { ready: false, reason: 'PHONE_STATE_UNREADABLE' };
  const facts = {
    installed: /^package:\/data\/app\/.+\/base\.apk$/m.test(output(observations.package)),
    airplaneMode: output(observations.airplane) === '1',
    wifiOff: /^Wifi is disabled\r?$/m.test(output(observations.wifi)),
    bluetoothOff: /^\s*enabled: false\r?$/m.test(output(observations.bluetooth)) && /^\s*state: OFF\r?$/m.test(output(observations.bluetooth)),
    externalDefaultRoute: (output(observations.v4) + '\n' + output(observations.v6)).split(/\r?\n/).some(s => /^default /.test(s) && !/dev (dummy0|lo)(?:\s|$)/.test(s)),
  };
  const ready = facts.installed && facts.airplaneMode && facts.wifiOff && facts.bluetoothOff && !facts.externalDefaultRoute;
  return { ready, serial: selected.serial, model: output(observations.model), facts,
    reason: !facts.installed ? 'STAGING_APP_NOT_INSTALLED' : ready ? 'USB_SAFETY_PREFLIGHT_READY' : 'EXTERNAL_NETWORK_NOT_ISOLATED',
    hardwareVerified: false, nativeRegistrationVerified: false, isolationAttestation: false };
}

function ensureReverse(run, selected) {
  if (!selected.ready || !selected.serial) return { ready: false, reason: 'USB_PHONE_NOT_READY' };
  const args = ['-s', selected.serial];
  const existing = run([...args, 'reverse', '--list']);
  if (!success(existing)) return { ready: false, reason: 'USB_MAPPING_UNREADABLE' };
  const rows = output(existing).split(/\r?\n/).map(s => s.trim().split(/\s+/));
  const binding = rows.find(s => s[1] === `tcp:${PORT}`);
  if (binding) return binding[2] === `tcp:${PORT}` ? { ready: true, created: false } : { ready: false, reason: 'USB_MAPPING_CONFLICT' };
  const write = run([...args, 'reverse', `tcp:${PORT}`, `tcp:${PORT}`]);
  if (!success(write)) return { ready: false, reason: 'USB_MAPPING_FAILED' };
  const verified = run([...args, 'reverse', '--list']);
  if (!success(verified) || !output(verified).split(/\r?\n/).some(s => s.trim().split(/\s+/).slice(1).join(' ') === `tcp:${PORT} tcp:${PORT}`)) return { ready: false, reason: 'USB_MAPPING_NOT_CONFIRMED' };
  return { ready: true, created: true };
}

function createLoopbackGet({ port = PORT, timeoutMs = METRO_READ_TIMEOUT_MS } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) throw Error('invalid_loopback_reader_options');
  return path => new Promise(resolve => {
    let bytes = 0, timer;
    const finish = value => { clearTimeout(timer); resolve(value); };
    const req = http.get({ hostname: '127.0.0.1', port, path, headers: { 'Expo-Platform': 'android', Accept: 'application/expo+json', 'Expo-Protocol-Version': '0' } }, res => {
      let text = '';
      res.on('data', chunk => { bytes += chunk.length; if (bytes > 1024 * 1024) req.destroy(); else text += chunk; });
      res.on('end', () => finish({ status: res.statusCode, text }));
      res.on('error', () => finish(null));
      res.on('aborted', () => finish(null));
    });
    req.on('error', () => finish(null));
    // Absolute deadline: a trickle of data must not keep readiness pending forever.
    timer = setTimeout(() => { finish(null); req.destroy(); }, timeoutMs);
  });
}
const localGet = createLoopbackGet();

async function inspectMetro(get = localGet) {
  const status = await get('/status');
  if (status?.status !== 200 || status.text !== 'packager-status:running') return { ready: false, reason: 'METRO_NOT_RUNNING' };
  const manifest = await get('/');
  if (!manifest) return { ready: false, reason: 'METRO_MANIFEST_UNAVAILABLE' };
  if (manifest.status !== 200) return { ready: false, reason: 'METRO_MANIFEST_HTTP_ERROR' };
  try {
    const body = JSON.parse(manifest?.text || '');
    const url = new URL(body.launchAsset?.url);
    if (manifest.status !== 200 || body.extra?.expoClient?.slug !== 'connect-offline-safety-lab'
      || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.port !== String(PORT)
      || url.pathname !== '/index.ts.bundle') return { ready: false, reason: 'WRONG_METRO_PROJECT' };
    if (![null, 'false'].includes(url.searchParams.get('lazy'))) return { ready: false, reason: 'LAB_SERVER_RESTART_REQUIRED' };
    return { ready: true, reason: 'STANDALONE_LAB_METRO_READY' };
  } catch { return { ready: false, reason: 'WRONG_METRO_PROJECT' }; }
}

async function openLab(run, metro = inspectMetro, active = () => true) {
  if (!active()) return { ready: false, reason: 'OPERATOR_CANCELLED' };
  const before = inspectUsbSafety(run);
  if (!before.ready) return before;
  const server = await metro();
  if (!active()) return { ready: false, reason: 'OPERATOR_CANCELLED' };
  if (!server.ready) return server;
  // The phone may disconnect or its radios may change during the server await.
  const fresh = inspectUsbSafety(run);
  if (!fresh.ready || fresh.serial !== before.serial) return { ready: false, reason: 'USB_SAFETY_CHANGED' };
  const mapping = ensureReverse(run, fresh);
  if (!mapping.ready) return mapping;
  const probe = run(['-s', fresh.serial, 'shell', 'toybox', 'nc', '-z', '-w', '3', '127.0.0.1', String(PORT)]);
  if (!success(probe)) return { ready: false, reason: 'PHONE_CANNOT_REACH_METRO' };
  if (!active()) return { ready: false, reason: 'OPERATOR_CANCELLED' };
  const opened = run(['-s', fresh.serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', LAB_URI, PACKAGE]);
  if (!success(opened) || /Error:|Exception/.test(output(opened) + String(opened.stderr || ''))) return { ready: false, reason: 'LAB_LINK_NOT_OPENED' };
  return { ready: true, reason: 'LAB_LINK_OPENED_BY_OPERATOR', hardwareVerified: false };
}

function metroEnvironment(env) {
  const next = { ...env, EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1', EXPO_NO_DOTENV: '1', EXPO_NO_TYPESCRIPT_SETUP: '1', EXPO_NO_METRO_LAZY: '1', CI: '1', SENTRY_DISABLE_AUTO_UPLOAD: 'true' };
  delete next.EXPO_PACKAGER_PROXY_URL;
  delete next.REACT_NATIVE_PACKAGER_HOSTNAME;
  return next;
}

async function stopOwnedMetro(child, killTree, waitForExit) {
  if (!child.pid || child.exitCode !== null) return { stopped: true, reason: 'OWNED_PROCESS_ALREADY_EXITED' };
  try {
    const result = killTree(child.pid);
    if (!success(result)) return { stopped: false, reason: 'OWNED_PROCESS_STOP_REJECTED' };
    if (!await waitForExit(child)) return { stopped: false, reason: 'OWNED_PROCESS_EXIT_UNCONFIRMED' };
    return { stopped: true, reason: 'OWNED_PROCESS_EXIT_CONFIRMED' };
  } catch { return { stopped: false, reason: 'OWNED_PROCESS_STOP_UNCONFIRMED' }; }
}

module.exports = { PORT, PACKAGE, LAB_URI, selectUsbDevice, inspectUsbSafety, ensureReverse, inspectMetro, openLab, metroEnvironment, stopOwnedMetro, createLoopbackGet };
