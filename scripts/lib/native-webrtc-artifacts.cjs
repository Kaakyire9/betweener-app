const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const VERSION = '145.17.0-betweener.789936f4866c.1';
const SOURCE = 'eeff9252f32a40d1671974c31c096ce9fa776130';
const PATCH = '789936f4866c5f05760715fba633ceb402a8089d50bc1674161d3afdfb8aa7d5';
const GROUP = 'io.nyansapa.betweener';
const ARTIFACT = 'webrtc-strict';
const COORDINATE = `${GROUP}:${ARTIFACT}:${VERSION}`;
const RELEASE = 'connect-native-145.17.0-strict-789936f4866c.1';
const SHA = /^[a-f0-9]{64}$/;

function enabled(env = process.env) {
  const flag = env.BETWEENER_STRICT_WEBRTC ?? '0';
  if (!['0', '1'].includes(flag)) throw new Error('BETWEENER_STRICT_WEBRTC must be 0 or 1');
  if (flag === '0') return false;
  if (env.APP_VARIANT !== 'staging' || env.EXPO_PUBLIC_ENVIRONMENT !== 'development') {
    throw new Error('Strict WebRTC artifacts require the staging development environment');
  }
  return true;
}

function validateManifest(value) {
  if (value.status !== 'VERIFIED' || value.version !== VERSION || value.sourceCommit !== SOURCE
      || value.patchSha256 !== PATCH || value.reactNativePackage !== '145.4.1' || value.releaseTag !== RELEASE) {
    throw new Error('Reviewed strict WebRTC artifact manifest is missing or unverified');
  }
  const expected = { android: `webrtc-${VERSION}.aar`, ios: `WebRTC-${VERSION}.xcframework.zip` };
  for (const platform of ['android', 'ios']) {
    const item = value[platform];
    const url = `https://github.com/Kaakyire9/betweener-app/releases/download/${RELEASE}/${expected[platform]}`;
    if (!item || !SHA.test(item.sha256) || item.url !== url || !Number.isSafeInteger(item.bytes)
        || item.bytes < 1 || item.bytes > 512 * 1024 * 1024 || item.compatibility !== 'PASS') {
      throw new Error(`Invalid ${platform} strict WebRTC artifact contract`);
    }
  }
  return value;
}

function readManifest(projectRoot) {
  return validateManifest(JSON.parse(fs.readFileSync(path.join(projectRoot, 'native-artifacts/strict-webrtc.json'), 'utf8')));
}

function safePath(projectRoot, relative) {
  const root = fs.realpathSync(projectRoot);
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) throw new Error('Native artifact path escapes the project');
  let cursor = root;
  for (const part of path.relative(root, target).split(path.sep)) {
    cursor = path.join(cursor, part);
    try {
      if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Native artifact paths cannot contain symbolic links or junctions');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return target;
}

async function digest(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

function podspec(manifest) {
  validateManifest(manifest);
  return `Pod::Spec.new do |spec|
  spec.name = 'StreamWebRTC'
  spec.version = '${VERSION}'
  spec.summary = 'Betweener staging strict framed WebRTC'
  spec.homepage = 'https://github.com/Kaakyire9/betweener-app'
  spec.license = { :type => 'BSD', :file => 'WebRTC.xcframework/LICENSE.md' }
  spec.author = 'Nyansapa Ltd'
  spec.ios.deployment_target = '16.4'
  spec.source = { :http => '${manifest.ios.url}', :sha256 => '${manifest.ios.sha256}' }
  spec.vendored_frameworks = 'WebRTC.xcframework'
end
`;
}

function pom() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion>
<groupId>${GROUP}</groupId><artifactId>${ARTIFACT}</artifactId><version>${VERSION}</version>
<packaging>aar</packaging><name>Betweener strict WebRTC</name>
<licenses><license><name>BSD-3-Clause</name><url>https://opensource.org/licenses/BSD-3-Clause</url></license></licenses>
</project>
`;
}

async function prepare({ projectRoot, platform, env = process.env, fetchImpl = globalThis.fetch }) {
  if (!enabled(env)) return { enabled: false };
  if (!['android', 'ios'].includes(platform)) throw new Error('Explicit native build platform required');
  const manifest = readManifest(projectRoot);
  if (platform === 'ios') {
    const spec = safePath(projectRoot, 'native-artifacts/.cache/ios/StreamWebRTC.podspec');
    fs.mkdirSync(path.dirname(spec), { recursive: true });
    fs.writeFileSync(spec, podspec(manifest));
    return { enabled: true, platform, version: VERSION, podspec: spec };
  }
  const directory = `native-artifacts/.cache/maven/${GROUP.replaceAll('.', '/')}/${ARTIFACT}/${VERSION}`;
  const target = safePath(projectRoot, `${directory}/${ARTIFACT}-${VERSION}.aar`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const expected = manifest.android;
  if (fs.existsSync(target)) {
    if (fs.statSync(target).size !== expected.bytes || await digest(target) !== expected.sha256) {
      throw new Error('Cached strict WebRTC artifact checksum mismatch');
    }
  } else {
    const temporary = safePath(projectRoot, `${directory}/.download-${crypto.randomUUID()}`);
    try {
      const response = await fetchImpl(expected.url, { signal: AbortSignal.timeout(180000) });
      if (!response.ok || !response.body) throw new Error('Strict WebRTC artifact download unavailable');
      let bytes = 0;
      const hash = crypto.createHash('sha256');
      const verifier = new Transform({
        transform(chunk, _encoding, done) {
          bytes += chunk.length;
          if (bytes > expected.bytes) return done(new Error('Strict WebRTC artifact exceeds its verified size'));
          hash.update(chunk); done(null, chunk);
        },
      });
      await pipeline(Readable.fromWeb(response.body), verifier, fs.createWriteStream(temporary, { flags: 'wx' }));
      if (bytes !== expected.bytes || hash.digest('hex') !== expected.sha256) {
        throw new Error('Strict WebRTC downloaded artifact checksum mismatch');
      }
      fs.renameSync(temporary, target);
    } finally {
      safePath(projectRoot, path.relative(projectRoot, temporary));
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  fs.writeFileSync(safePath(projectRoot, `${directory}/${ARTIFACT}-${VERSION}.pom`), pom());
  return { enabled: true, platform, version: VERSION, sha256: expected.sha256, coordinate: COORDINATE };
}

module.exports = { VERSION, SOURCE, PATCH, GROUP, ARTIFACT, COORDINATE, RELEASE,
  enabled, validateManifest, readManifest, safePath, digest, podspec, pom, prepare };
