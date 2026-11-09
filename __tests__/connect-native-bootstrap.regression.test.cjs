const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const sdkName = '@stream-io/video-react-native-sdk';
const loaderPath = path.resolve('features/live/media/load-stream-video-sdk.ts');
const adapterPath = path.resolve('features/connect/media/native-stream-sdk.ts');
const expoRoot = path.dirname(require.resolve('expo/package.json'));
const cliRoot = path.dirname(require.resolve('@expo/cli/package.json', { paths: [expoRoot] }));
const metroSource = fs.readFileSync(path.join(cliRoot, 'build/metro-require/require.js'), 'utf8');
const compiled = new Map();

function evaluate(file, requireModule, context, importModule) {
  if (!compiled.has(file)) compiled.set(file, ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    transformers: { before: [compiler => source => {
      const visit = node => ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
        ? ts.factory.createCallExpression(ts.factory.createIdentifier('__metroImport'), undefined, node.arguments)
        : ts.visitEachChild(node, visit, compiler);
      return ts.visitNode(source, visit);
    }] },
  }).outputText);
  const module = { exports: {} };
  const run = vm.runInContext(`(function(require, module, exports, __metroImport) {${compiled.get(file)}\n})`, context, { filename: file });
  run(requireModule, module, module.exports, importModule);
  return module.exports;
}

function fixture(platform, { preload = true, runtimeError = null } = {}) {
  const requests = [], reloads = [], events = [];
  const sdk = { __esModule: true, StreamVideoClient: { getOrCreateInstance() { events.push('client-created'); } } };
  const context = vm.createContext({ __DEV__: false, __METRO_GLOBAL_PREFIX__: '',
    process: { env: { NODE_ENV: 'development', EXPO_OS: platform } },
    console: { warn() {} },
    window: { location: { reload() { reloads.push('hmr-unavailable'); } } },
  });
  context.global = context;
  vm.runInContext(metroSource, context);
  context.__d((_global, _require, _default, _all, module) => {
    events.push('sdk-evaluated'); module.exports = sdk;
  }, 1, []);
  if (preload) context.__r(1); // index.js already requires this SDK at normal app startup.

  // Exercise Expo's installed bundle registration and HMR reload behavior. Only
  // the network transport is replaced; no real Metro server or phone is touched.
  let socket;
  class HmrSocket {
    constructor() { socket = this; this.listeners = new Map(); }
    on(event, listener) { this.listeners.set(event, listener); }
    send() {}
    disable() {}
    isEnabled() { return false; }
  }
  const expoFile = name => path.join(expoRoot, 'src/async-require', `${name}.ts`);
  const hmr = evaluate(expoFile('hmr'), name => {
    if (name.includes('/HMRClient')) return HmrSocket;
    if (name === 'pretty-format') return { default() {}, plugins: {} };
    assert.equal(name, './hmrUtils');
    return { getFullBundlerUrl: () => 'http://metro/index.bundle', hideLoading() {} };
  }, context).default;
  hmr.setup(platform, 'index', 'metro', 8081, false);
  socket.listeners.get('close')({ code: 1006 });
  const loadBundle = evaluate(expoFile('loadBundle'), name => {
    if (name === './buildUrlForBundle') return { buildUrlForBundle: value => value };
    if (name === './fetchThenEval') return { fetchThenEvalAsync: async url => { requests.push(url); } };
    assert.equal(name, './hmr'); return { default: hmr };
  }, context).loadBundleAsync;
  context.__loadBundleAsync = loadBundle;
  const asyncRequire = evaluate(expoFile('asyncRequireModule'), context.__r, context);
  let loader;
  const loadSdk = () => loader ??= evaluate(loaderPath, name => {
    assert.equal(name, sdkName); return context.__r(1);
  }, context, name => {
    assert.equal(name, sdkName);
    return asyncRequire(1, { 1: 'http://metro/stream-sdk.bundle' });
  });
  const runtimeCheck = { checkConnectNativeRuntime() {
    events.push('runtime-checked'); if (runtimeError) throw runtimeError;
  } };
  const dependency = name => {
    if (name.includes('load-stream-video-sdk')) return loadSdk();
    if (name === './native-runtime-check') return runtimeCheck;
    if (name === '../experimental/encryption-transform-guard.ts') return evaluate(
      path.resolve('features/connect/experimental/encryption-transform-guard.ts'),
      dependency => assert.fail(`Pure transform guard imported ${dependency}`), context);
    if (name === './native-microphone-pause.ts') return evaluate(
      path.resolve('features/connect/media/native-microphone-pause.ts'),
      dependency => assert.fail(`Pure microphone pause imported ${dependency}`), context);
    if (name === './native-call-activation.ts') return evaluate(
      path.resolve('features/connect/media/native-call-activation.ts'),
      dependency => assert.fail(`Pure native activation imported ${dependency}`), context);
    if (name === './native-microphone-input.ts') return evaluate(
      path.resolve('features/connect/media/native-microphone-input.ts'),
      dependency => assert.fail(`Native input helper eagerly imported ${dependency}`), context);
    if (name === './native-publisher-retirement.ts' || name === './native-reconnect-diagnostics.ts' || name === './native-call-audio.ts') return evaluate(
      path.resolve('features/connect/media', name),
      dependency => assert.fail(`Pure retirement/diagnostic helper imported ${dependency}`), context);
    assert.ok(['./native-capture-tracks.ts', './native-media-engine-owner.ts', './audio-health.ts', './native-ringing-guard.ts', '../experimental/call-encryption.ts',
      '../../live/media/stream-video-background-client.ts', './native-ongoing-call.ts'].includes(name));
    return {};
  };
  return { events, requests, reloads, sdk,
    oldImport: () => asyncRequire(1, { 1: 'http://metro/stream-sdk.bundle' }),
    loader: loadSdk,
    adapter: () => evaluate(adapterPath, dependency, context, async name => {
      assert.equal(name, './native-runtime-check');
      await loadBundle('http://metro/native-runtime-check.bundle'); return runtimeCheck;
    }),
  };
}

for (const platform of ['ios', 'android']) {
  test(`${platform}: installed Expo reloads when a redundant split import registers after HMR disconnects`, async () => {
    const f = fixture(platform);
    assert.equal((await f.oldImport()).StreamVideoClient, f.sdk.StreamVideoClient);
    assert.deepEqual(f.requests, ['http://metro/stream-sdk.bundle']);
    assert.deepEqual(f.reloads, ['hmr-unavailable']);
    assert.deepEqual(f.events, ['sdk-evaluated']);
  });

  test(`${platform}: Accept reuses the installed SDK without split requests, reloads or early client construction`, async () => {
    const f = fixture(platform);
    const adapter = f.adapter();
    assert.deepEqual(f.events, ['sdk-evaluated']);
    const result = await adapter.loadConnectNativeSdk();
    assert.equal(typeof result.createClient, 'function');
    assert.deepEqual(f.events, ['sdk-evaluated', 'runtime-checked']);
    assert.deepEqual(f.requests, []);
    assert.deepEqual(f.reloads, []);
  });
}

test('SDK evaluation stays deferred and concurrent callers share one module and promise', async () => {
  const f = fixture('ios', { preload: false });
  const { loadStreamVideoSdk } = f.loader();
  assert.deepEqual(f.events, []);
  const first = loadStreamVideoSdk(), second = loadStreamVideoSdk();
  assert.equal(first, second);
  assert.deepEqual(f.events, []);
  assert.equal(await first, f.sdk);
  assert.equal(await loadStreamVideoSdk(), f.sdk);
  assert.deepEqual(f.events, ['sdk-evaluated']);
  assert.deepEqual(f.requests, []);
});

test('missing native APIs reject before SDK evaluation without causing a reload', async () => {
  const failure = Error('connect_native_build_incompatible');
  const f = fixture('android', { preload: false, runtimeError: failure });
  await assert.rejects(f.adapter().loadConnectNativeSdk(), error => error === failure);
  assert.deepEqual(f.events, ['runtime-checked']);
  assert.deepEqual(f.requests, []);
  assert.deepEqual(f.reloads, []);
});

test('a failed deferred SDK lookup rejects asynchronously and permits a later retry', async () => {
  let attempts = 0;
  const sdk = {}, failure = Error('lookup-failed');
  const context = vm.createContext({});
  const loader = evaluate(loaderPath, name => {
    assert.equal(name, sdkName);
    if (++attempts === 1) throw failure;
    return sdk;
  }, context, () => Promise.reject(Error('split import must not be used')));
  let first;
  assert.doesNotThrow(() => { first = loader.loadStreamVideoSdk(); });
  assert.equal(first, loader.loadStreamVideoSdk());
  await assert.rejects(first, error => error === failure);
  assert.equal(await loader.loadStreamVideoSdk(), sdk);
  assert.equal(attempts, 2);
});
