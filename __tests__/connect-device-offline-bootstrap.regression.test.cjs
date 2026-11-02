const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { installNetworkDeny } = require('../harnesses/connect-device-safety/network-guard.ts');
const { metroEnvironment } = require('../scripts/lib/connect-device-safety-launcher.cjs');
const config = require('../harnesses/connect-device-safety/metro.config.js');
function resolve(origin, moduleName, platform = 'android') {
  return config.resolver.resolveRequest({ originModulePath: path.resolve(origin), resolveRequest: () => ({ type: 'sourceFile', filePath: 'ordinary-resolution-sentinel' }) }, moduleName, platform);
}
test('pinned Metro HMR constructor reproduces the photographed forbidden network attempt', () => {
  const HmrClient = require('metro-runtime/src/modules/HMRClient');
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket'); let attempts = 0;
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: function () { attempts++; throw Error('device_harness_network_forbidden'); } });
  try { assert.throws(() => new HmrClient('http://127.0.0.1:8094/hot'), /network_forbidden/); assert.equal(attempts, 1); }
  finally { if (previous) Object.defineProperty(globalThis, 'WebSocket', previous); else delete globalThis.WebSocket; }
});
for (const platform of ['android', 'ios']) test(`${platform} native callable HMR, DevSettings and bundle-registration imports resolve offline`, () => {
  for (const [origin, specifier] of [
    ['node_modules/react-native/Libraries/Core/setUpBatchedBridge.js', '../Utilities/HMRClient'],
    ['node_modules/react-native/Libraries/Core/setUpDeveloperTools.js', '../Utilities/HMRClient'],
    ['node_modules/react-native/Libraries/Utilities/DevSettings.js', './HMRClient'],
    ['node_modules/react-native/Libraries/Core/Devtools/loadBundleFromServer.js', '../../Utilities/HMRClient'],
    ['node_modules/expo/src/Expo.fx.tsx', 'react-native/Libraries/Utilities/HMRClient'],
    ['node_modules/expo/src/async-require/setupHMR.ts', './hmr'],
    ['node_modules/expo/src/async-require/loadBundle.ts', './hmr'],
  ]) assert.ok(resolve(origin, specifier, platform).filePath.endsWith('offline-hmr-client.ts'));
});
test('both Expo reload-message import paths resolve offline', () => {
  for (const [origin, specifier] of [
    ['node_modules/expo/src/Expo.fx.tsx', './async-require/messageSocket'],
    ['node_modules/expo/src/async-require/setup.ts', './messageSocket'],
  ]) assert.ok(resolve(origin, specifier).filePath.endsWith('offline-devtools.ts'));
});
test('offline HMR interface accepts native and Expo calls without networking or logging', () => {
  const exports = {}, target = { navigator: {}, exports, module: { exports } }, network = installNetworkDeny(target, true);
  const source = fs.readFileSync('harnesses/connect-device-safety/offline-hmr-client.ts', 'utf8');
  const ts = require('typescript');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  require('node:vm').runInNewContext(compiled, target);
  const hmr = target.module.exports.default;
  assert.equal(Object.isFrozen(hmr), true);
  for (let i = 0; i < 2; i++) {
    hmr.setup('android', 'index.ts', '127.0.0.1', 8094, false, 'http');
    hmr.setup({ isEnabled: true }); hmr.enable(); hmr.disable(); hmr.registerBundle('local-bundle'); hmr.log('log', ['local']);
  }
  assert.deepEqual(network.snapshot(), []);
  assert.throws(() => new target.WebSocket('http://127.0.0.1:8094/hot'), /network_forbidden/);
  assert.throws(() => target.fetch('https://provider.invalid'), /network_forbidden/);
  assert.equal(network.snapshot().length, 2);
});
test('normal application, SDK and transport resolution is unchanged', () => {
  for (const specifier of ['react-native/Libraries/WebSocket/WebSocket', 'react-native/Libraries/Network/RCTNetworking', '@stream-io/react-native-video-sdk', 'expo-audio', './native-hardware']) {
    assert.equal(resolve('harnesses/connect-device-safety/DeviceSafetyScreen.tsx', specifier).filePath, 'ordinary-resolution-sentinel');
  }
  assert.equal(resolve('features/live/media/example.ts', './HMRClient').filePath, 'ordinary-resolution-sentinel');
});
test('launcher disables lazy bundle fetching while preserving all network controls', () => {
  const env = metroEnvironment({}); assert.equal(env.EXPO_NO_METRO_LAZY, '1'); assert.equal(env.EXPO_OFFLINE, '1'); assert.equal(env.CI, '1');
  const guard = fs.readFileSync('harnesses/connect-device-safety/network-guard.ts', 'utf8');
  assert.ok(guard.includes('configurable: false, writable: false')); assert.ok(!guard.includes('127.0.0.1'));
  const flags = require('../features/connect/config/connect-feature-flags.ts').connectFeatureFlags;
  assert.equal(flags.nativeSafetyOwner, false); assert.equal(flags.endCallAndBlock, false);
});
test('pinned Expo serializes and parses eager native bundles without a lazy query parameter', () => {
  const cli = path.dirname(require.resolve('@expo/cli/package.json', { paths: [require.resolve('expo/package.json')] }));
  const { createBundleUrlPath, getMetroOptionsFromUrl } = require(path.join(cli, 'build/src/start/server/middleware/metroOptions.js'));
  const options = { mainModuleName: 'index.ts', platform: 'android', mode: 'development', lazy: false };
  const url = createBundleUrlPath(options);
  assert.equal(new URL(url, 'http://127.0.0.1:8094').searchParams.has('lazy'), false);
  assert.equal(getMetroOptionsFromUrl(url).lazy, false);
  assert.equal(getMetroOptionsFromUrl(createBundleUrlPath({ ...options, lazy: true })).lazy, true);
});
