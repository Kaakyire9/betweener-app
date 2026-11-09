const fs = require('node:fs');
const path = require('node:path');
const { createRunOncePlugin, withPodfile, withProjectBuildGradle } = require('expo/config-plugins');
const { enabled, validateManifest, readManifest, safePath, podspec, VERSION, COORDINATE, GROUP, ARTIFACT } = require('../scripts/lib/native-webrtc-artifacts.cjs');

const BEGIN = '# BEGIN BETWEENER STRICT WEBRTC';
const END = '# END BETWEENER STRICT WEBRTC';

function patchPodfile(contents) {
  const block = `${BEGIN}
pod 'StreamWebRTC', :podspec => File.join(__dir__, '../native-artifacts/.cache/ios/StreamWebRTC.podspec')
${END}`;
  if (contents.includes(BEGIN) || contents.includes(END)) {
    if (!contents.includes(block) || contents.split(BEGIN).length !== 2) throw new Error('Unexpected strict WebRTC Podfile integration');
    return contents;
  }
  const anchor = 'prepare_react_native_project!';
  if (!contents.includes(anchor)) throw new Error('Strict WebRTC Podfile anchor missing');
  return contents.replace(anchor, `${anchor}\n\n${block}`);
}

function patchGradle(contents, manifest) {
  validateManifest(manifest);
  const block = `// BEGIN BETWEENER STRICT WEBRTC
def betweenerStrictAar = new File(rootProject.projectDir, '../native-artifacts/.cache/maven/${GROUP.replaceAll('.', '/')}/${ARTIFACT}/${VERSION}/${ARTIFACT}-${VERSION}.aar')
if (!betweenerStrictAar.isFile()) throw new GradleException('Verified strict WebRTC AAR is missing')
def betweenerStrictDigest = java.security.MessageDigest.getInstance('SHA-256')
new java.security.DigestInputStream(new FileInputStream(betweenerStrictAar), betweenerStrictDigest).withCloseable {
    stream -> stream.transferTo(java.io.OutputStream.nullOutputStream())
}
if (betweenerStrictDigest.digest().encodeHex().toString() != '${manifest.android.sha256}') {
    throw new GradleException('Strict WebRTC AAR checksum mismatch')
}
allprojects {
    repositories {
        exclusiveContent {
            forRepository {
                maven { url = uri(new File(rootProject.projectDir, '../native-artifacts/.cache/maven')) }
            }
            filter { includeGroup('io.nyansapa.betweener') }
        }
    }
    configurations.configureEach {
        resolutionStrategy.eachDependency { details ->
            if (details.requested.group == 'io.getstream' && details.requested.name == 'stream-video-webrtc-android') {
                if (details.requested.version != '145.17.0') {
                    throw new GradleException('Strict WebRTC requires the reviewed 145.17.0 dependency')
                }
                details.useTarget('${COORDINATE}')
                details.because('Reviewed staging strict framed native crypto')
            }
        }
    }
}
// END BETWEENER STRICT WEBRTC
`;
  if (contents.includes('// BEGIN BETWEENER STRICT WEBRTC') || contents.includes('// END BETWEENER STRICT WEBRTC')) {
    if (!contents.includes(block) || contents.split('// BEGIN BETWEENER STRICT WEBRTC').length !== 2) throw new Error('Unexpected strict WebRTC Gradle integration');
    return contents;
  }
  return `${contents.trimEnd()}\n\n${block}`;
}

function withStrictWebRtc(config) {
  if (!enabled()) return config;
  if (config.ios?.bundleIdentifier !== 'com.aduboffour.betweener.staging'
      || config.android?.package !== 'com.aduboffour.betweener.staging') {
    throw new Error('Strict WebRTC requires exact staging app identities');
  }
  if (typeof config.version !== 'string' || !config.version.trim()) throw new Error('Strict WebRTC requires an app version');
  // The call-control bridge API changed independently of the WebRTC binary.
  // Older development binaries must not accept updates requiring that new API.
  config.runtimeVersion = `${config.version}-strict-webrtc-${VERSION}-controls-1`;
  config = withPodfile(config, mod => {
    const manifest = readManifest(mod.modRequest.projectRoot);
    const spec = safePath(mod.modRequest.projectRoot, 'native-artifacts/.cache/ios/StreamWebRTC.podspec');
    fs.mkdirSync(path.dirname(spec), { recursive: true });
    fs.writeFileSync(spec, podspec(manifest));
    mod.modResults.contents = patchPodfile(mod.modResults.contents);
    return mod;
  });
  config = withProjectBuildGradle(config, mod => {
    const manifest = readManifest(mod.modRequest.projectRoot);
    if (mod.modResults.language !== 'groovy') throw new Error('Strict WebRTC requires the reviewed Groovy Gradle template');
    mod.modResults.contents = patchGradle(mod.modResults.contents, manifest);
    return mod;
  });
  config.extra = { ...config.extra, nativeCryptoCandidate: VERSION, nativeCallControlRevision: 1 };
  return config;
}

module.exports = createRunOncePlugin(withStrictWebRtc, 'with-betweener-strict-webrtc', '1.0.0');
module.exports.patchPodfile = patchPodfile;
module.exports.patchGradle = patchGradle;
