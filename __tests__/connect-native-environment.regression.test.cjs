const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const composition = path.resolve('features/connect/media/native-safety-composition.ts');
const cli = path.dirname(require.resolve('@expo/cli/package.json', { paths: [require.resolve('expo/package.json')] }));
const metroSource = fs.readFileSync(path.join(cli, 'build/metro-require/require.js'), 'utf8');
const compiled = new Map();

function fixture(platform = 'ios') {
  const loaded = [], deprecatedReads = [], subscriptions = new Map(), removed = [];
  let permissionReads = 0, permissionRequests = 0;
  const appState = { currentState: 'active', addEventListener(event, listener) {
    subscriptions.set(event, listener);
    return { remove() { subscriptions.delete(event); removed.push(event); } };
  } };
  const native = { AppState: appState, Platform: { OS: platform } };
  for (const name of ['SafeAreaView', 'Clipboard', 'InteractionManager', 'PushNotificationIOS']) {
    Object.defineProperty(native, name, { enumerable: true, get() {
      deprecatedReads.push(name);
      if (name === 'PushNotificationIOS') throw Error('new NativeEventEmitter() requires a non-null argument');
      return {};
    } });
  }
  const externals = { 'react-native': native, 'expo-audio': {
    async getRecordingPermissionsAsync() { permissionReads++; return { granted: false, canAskAgain: true }; },
    async requestRecordingPermissionsAsync() { permissionRequests++; return { granted: true, canAskAgain: true }; },
  } };
  // Run the installed Metro importAll implementation, including CommonJS getter enumeration.
  const runtime = { __DEV__: false, __METRO_GLOBAL_PREFIX__: '' };
  runtime.global = runtime;
  vm.runInNewContext(metroSource, runtime);
  const registered = new Set();
  function register(id) {
    if (registered.has(id)) return id;
    registered.add(id);
    runtime.__d((_global, _require, _default, _all, module, exports) => {
      loaded.push(id);
      if (Object.hasOwn(externals, id)) { module.exports = externals[id]; return; }
      if (!compiled.has(id)) compiled.set(id, ts.transpileModule(fs.readFileSync(id, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        // Route source import() expressions through Expo's actual importAll, rather
        // than TypeScript's CommonJS transform, which does not reproduce this crash.
        transformers: { before: [context => source => {
          const visit = node => ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
            ? ts.factory.createCallExpression(ts.factory.createIdentifier('__loadAsync'), undefined, node.arguments)
            : ts.visitEachChild(node, visit, context);
          return ts.visitNode(source, visit);
        }] },
      }).outputText);
      const resolve = specifier => {
        if (Object.hasOwn(externals, specifier)) return register(specifier);
        assert.ok(specifier.startsWith('.'), `Unexpected native bootstrap dependency: ${specifier}`);
        const absolute = path.resolve(path.dirname(id), specifier);
        return register(path.extname(absolute) ? absolute : `${absolute}.ts`);
      };
      const run = vm.runInNewContext(`(function(require, module, exports, __loadAsync) {${compiled.get(id)}\n})`, {}, { filename: id });
      run(specifier => runtime.__r(resolve(specifier)), module, exports,
        specifier => Promise.resolve().then(() => runtime.__r.importAll(resolve(specifier))));
    }, id, []);
    return id;
  }
  return { appState, loaded, deprecatedReads, subscriptions, removed,
    loader: () => runtime.__r(register(composition)).loadConnectNativeEnvironment,
    importNativeBarrel: () => runtime.__r.importAll(register('react-native')),
    permissions: () => ({ reads: permissionReads, requests: permissionRequests }),
  };
}

test('pinned Metro importAll reproduces the reported React Native barrel crash', () => {
  const f = fixture();
  assert.throws(f.importNativeBarrel, /NativeEventEmitter.*non-null/);
  assert.deepEqual(f.deprecatedReads, ['SafeAreaView', 'Clipboard', 'InteractionManager', 'PushNotificationIOS']);
});

test('disabled Connect bootstrap evaluates no React Native or microphone modules', async () => {
  const f = fixture();
  await assert.rejects(f.loader()(), /connect_native_owner_disabled/);
  assert.ok(!f.loaded.includes('react-native'));
  assert.ok(!f.loaded.includes('expo-audio'));
  assert.deepEqual(f.permissions(), { reads: 0, requests: 0 });
});

for (const platform of ['ios', 'android']) test(`${platform} bootstrap avoids deprecated getters and preserves lifecycle and explicit permission requests`, async () => {
  const f = fixture(platform);
  const environment = await f.loader()({ nativeSafetyOwner: true, endCallAndBlock: false });
  assert.equal(environment.lifecycle.platform, platform);
  assert.equal(environment.lifecycle.appState(), 'active');
  assert.deepEqual(f.deprecatedReads, []);
  assert.deepEqual(f.permissions(), { reads: 0, requests: 0 });
  const states = [], unsubscribe = environment.lifecycle.subscribeAppState(state => states.push(state));
  f.appState.currentState = 'background';
  assert.equal(environment.lifecycle.appState(), 'background');
  f.subscriptions.get('change')('background');
  if (platform === 'android') f.subscriptions.get('blur')();
  else assert.equal(f.subscriptions.has('blur'), false);
  assert.deepEqual(states, platform === 'android' ? ['background', 'inactive'] : ['background']);
  unsubscribe();
  assert.equal(f.subscriptions.size, 0);
  assert.deepEqual(f.removed, platform === 'android' ? ['change', 'blur'] : ['change']);
  assert.equal(await environment.permission(), 'granted');
  assert.deepEqual(f.permissions(), { reads: 1, requests: 1 });
  assert.deepEqual(f.deprecatedReads, []);
});

test('unsupported platforms reject before the native microphone module loads', async () => {
  const f = fixture('web');
  await assert.rejects(f.loader()({ nativeSafetyOwner: true, endCallAndBlock: false }), /connect_native_platform_unsupported/);
  assert.ok(!f.loaded.includes('expo-audio'));
  assert.deepEqual(f.deprecatedReads, []);
});
