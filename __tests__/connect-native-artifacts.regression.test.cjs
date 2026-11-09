const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Buffer } = require('node:buffer');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const native = require('../scripts/lib/native-webrtc-artifacts.cjs');
const { patchPodfile, patchGradle } = require('../plugins/with-betweener-strict-webrtc.js');

const env = { BETWEENER_STRICT_WEBRTC: '1', APP_VARIANT: 'staging', EXPO_PUBLIC_ENVIRONMENT: 'development' };
const bytes = Buffer.from('controlled native artifact fixture; not an SDK binary');
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
function manifest() {
  const item = name => ({ url: `https://github.com/Kaakyire9/betweener-app/releases/download/${native.RELEASE}/${name}`,
    sha256, bytes: bytes.length, compatibility: 'PASS' });
  return { status: 'VERIFIED', version: native.VERSION, sourceCommit: native.SOURCE, patchSha256: native.PATCH,
    reactNativePackage: '145.4.1', releaseTag: native.RELEASE,
    android: item(`webrtc-${native.VERSION}.aar`), ios: item(`WebRTC-${native.VERSION}.xcframework.zip`) };
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'betweener-native-artifact-'));
  t.after(() => {
    const real = fs.realpathSync(root);
    assert.ok(real.startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
    fs.rmSync(real, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(root, 'native-artifacts'));
  fs.writeFileSync(path.join(root, 'native-artifacts/strict-webrtc.json'), JSON.stringify(manifest()));
  return root;
}

test('ordinary profiles perform no artifact filesystem access or downloads', async () => {
  let requests = 0;
  const value = await native.prepare({ projectRoot: '/does-not-exist', platform: 'android', env: {},
    fetchImpl: () => { requests++; throw Error('Unexpected request'); } });
  assert.deepEqual(value, { enabled: false }); assert.equal(requests, 0);
});

test('only the explicit native-validation development profile opts in', () => {
  const eas = JSON.parse(fs.readFileSync('eas.json', 'utf8'));
  assert.equal(eas.build.developmentNativeCrypto.extends, 'development');
  assert.equal(eas.build.developmentNativeCrypto.env.BETWEENER_STRICT_WEBRTC, '1');
  assert.equal(eas.build.development.env.APP_VARIANT, 'staging');
  assert.equal(eas.build.development.env.EXPO_PUBLIC_ENVIRONMENT, 'development');
  for (const [name, profile] of Object.entries(eas.build)) {
    if (name !== 'developmentNativeCrypto') assert.equal(profile.env?.BETWEENER_STRICT_WEBRTC, undefined);
  }
});

for (const invalid of [
  { ...env, APP_VARIANT: 'production' }, { ...env, EXPO_PUBLIC_ENVIRONMENT: 'production' },
  { ...env, EXPO_PUBLIC_ENVIRONMENT: 'staging' }, { ...env, BETWEENER_STRICT_WEBRTC: 'yes' },
]) {
  test(`invalid strict build environment is rejected: ${JSON.stringify(invalid)}`, () => {
    assert.throws(() => native.enabled(invalid));
  });
}

for (const mutate of [value => { value.status = 'PENDING_BUILD_VERIFICATION'; },
  value => { value.patchSha256 = '0'.repeat(64); }, value => { value.reactNativePackage = '145.4.2'; },
  value => { value.android.url = 'https://example.invalid/artifact.aar'; },
  value => { value.ios.compatibility = 'UNVERIFIED'; }]) {
  test('unreviewed or substituted artifact metadata is rejected', () => {
    const value = manifest(); mutate(value); assert.throws(() => native.validateManifest(value));
  });
}

test('verified Android data creates the exact Maven coordinate and is reused offline', async t => {
  const root = fixture(t); let requests = 0;
  const options = { projectRoot: root, platform: 'android', env,
    fetchImpl: async url => { assert.equal(url, manifest().android.url); requests++; return new Response(bytes); } };
  const result = await native.prepare(options);
  assert.equal(result.coordinate, native.COORDINATE); assert.equal(result.sha256, sha256);
  await native.prepare({ ...options, fetchImpl: () => { throw Error('Cached artifact must be offline'); } });
  assert.equal(requests, 1);
  const directory = path.join(root, 'native-artifacts/.cache/maven', native.GROUP.replaceAll('.', '/'), native.ARTIFACT, native.VERSION);
  assert.match(fs.readFileSync(path.join(directory, `${native.ARTIFACT}-${native.VERSION}.pom`), 'utf8'), /<packaging>aar<\/packaging>/);
  fs.writeFileSync(path.join(directory, `${native.ARTIFACT}-${native.VERSION}.aar`), 'modified');
  await assert.rejects(native.prepare(options), /checksum mismatch/);
  assert.equal(requests, 1);
});

for (const payload of [Buffer.alloc(bytes.length, 42), Buffer.alloc(bytes.length + 1)]) {
  test('a mismatched or oversized download cannot become a usable native artifact', async t => {
    const root = fixture(t);
    await assert.rejects(native.prepare({ projectRoot: root, platform: 'android', env,
      fetchImpl: async () => new Response(payload) }), /checksum mismatch|exceeds/);
    const files = fs.readdirSync(path.join(root, 'native-artifacts/.cache'), { recursive: true });
    assert.equal(files.some(name => String(name).endsWith('.aar') || String(name).includes('.download-')), false);
  });
}

test('a redirected artifact cache cannot write outside the owned project', async t => {
  const root = fixture(t), outside = path.join(root, 'outside');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(root, 'native-artifacts/.cache'), 'junction');
  await assert.rejects(native.prepare({ projectRoot: root, platform: 'android', env }), /symbolic links or junctions/);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('iOS preparation pins the reviewed pod version and download SHA without fetching other resources', async t => {
  const root = fixture(t);
  const result = await native.prepare({ projectRoot: root, platform: 'ios', env,
    fetchImpl: () => { throw Error('Pod preparation must not make an unrelated request'); } });
  const spec = fs.readFileSync(result.podspec, 'utf8');
  assert.ok(spec.includes(native.VERSION)); assert.ok(spec.includes(sha256));
  assert.ok(spec.includes(manifest().ios.url));
});

test('Podfile integration is idempotent and rejects an altered or partial integration', () => {
  const result = patchPodfile('prepare_react_native_project!\ntarget "Betweener" do\nend\n');
  assert.equal(patchPodfile(result), result);
  assert.throws(() => patchPodfile(result.replace('StreamWebRTC', 'OtherPod')), /Unexpected/);
  assert.throws(() => patchPodfile('# BEGIN BETWEENER STRICT WEBRTC'), /Unexpected/);
  assert.throws(() => patchPodfile('no supported anchor'), /anchor missing/);
});

test('Gradle integration pins the custom coordinate, checks bytes and rejects drift', () => {
  const result = patchGradle('buildscript {}\n', manifest());
  assert.equal(patchGradle(result, manifest()), result);
  assert.ok(result.includes(native.COORDINATE)); assert.ok(result.includes(sha256));
  assert.match(result, /requested.version != '145.17.0'/);
  assert.match(result, /AAR checksum mismatch/);
  assert.match(result, /exclusiveContent/);
  assert.throws(() => patchGradle(result.replace(native.COORDINATE, 'other:artifact:1'), manifest()), /Unexpected/);
});
