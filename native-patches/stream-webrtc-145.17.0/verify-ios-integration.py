"""Resolve the actual patched wrapper and verified framework; never compile an app."""
from pathlib import Path
import argparse
import base64
import hashlib
import json
import os
import platform
import shutil
import subprocess
import tarfile
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--fixture', type=Path, required=True)
parser.add_argument('--results', type=Path, required=True)
args = parser.parse_args()
project = Path(__file__).resolve().parents[2]
fixture = args.fixture.resolve()
results = args.results.resolve()
if platform.system() != 'Darwin' or not shutil.which('pod'):
    raise SystemExit('Use the macOS runner with CocoaPods; this is a real resolver test')
if fixture == Path(fixture.anchor) or fixture.exists() or project.is_relative_to(fixture) or fixture.is_relative_to(project):
    raise SystemExit('Use a new, dedicated fixture outside the application checkout')
manifest_path = project / 'native-artifacts/strict-webrtc.json'
manifest = json.loads(manifest_path.read_text())
validation = json.loads((project / 'native-artifacts/validation.json').read_text())
if manifest['status'] != 'VERIFIED' or validation['status'] != 'VERIFIED_NATIVE_LIBRARIES_NOT_INSTALLED':
    raise SystemExit('Verified native library receipts are required before dependency integration')
fixture.mkdir(parents=True)
(fixture / 'native-artifacts').mkdir()
(fixture / 'native-artifacts/strict-webrtc.json').write_bytes(manifest_path.read_bytes())
for name in ['package.json', 'package-lock.json']:
    shutil.copyfile(project / name, fixture / name)
env = {**os.environ, 'BETWEENER_STRICT_WEBRTC': '1', 'APP_VARIANT': 'staging',
       'EXPO_PUBLIC_ENVIRONMENT': 'development', 'COCOAPODS_DISABLE_STATS': 'true'}
prepare = "require(process.argv[1]).prepare({projectRoot:process.argv[2],platform:'ios'}).catch(e=>{console.error(e.message);process.exitCode=1})"
subprocess.run(['node', '-e', prepare, str(project / 'scripts/lib/native-webrtc-artifacts.cjs'), str(fixture)],
               env=env, check=True, timeout=30)

lock = json.loads((project / 'package-lock.json').read_text())
package = lock['packages']['node_modules/@stream-io/react-native-webrtc']
url = 'https://registry.npmjs.org/@stream-io/react-native-webrtc/-/react-native-webrtc-145.4.1.tgz'
assert package['version'] == '145.4.1' and package['resolved'] == url
with urllib.request.urlopen(url, timeout=60) as response: data = response.read(32 * 1024**2 + 1)
assert len(data) <= 32 * 1024**2
assert 'sha512-' + base64.b64encode(hashlib.sha512(data).digest()).decode() == package['integrity']
archive_path = fixture / 'wrapper.tgz'
archive_path.write_bytes(data)
with tarfile.open(archive_path, 'r:gz') as archive:
    entries = archive.getmembers()
    assert len(entries) < 3000 and sum(item.size for item in entries) < 128 * 1024**2
    for item in entries:
        assert item.name.startswith('package/') and not item.issym() and not item.islnk()
    archive.extractall(fixture / 'download', filter='data')
sdk = fixture / 'node_modules/@stream-io/react-native-webrtc'
sdk.parent.mkdir(parents=True)
(fixture / 'download/package').rename(sdk)
patch = project / 'patches/@stream-io+react-native-webrtc+145.4.1.patch'
for options in [['--check'], []]:
    subprocess.run(['git', 'apply', *options, str(patch)], cwd=fixture, check=True, timeout=30)

# React is a resolver-only fixture. Its native implementation is not compiled or validated here.
react = fixture / 'react-fixture'
react.mkdir()
(react / 'Fixture.h').write_text('#pragma once\n')
(react / 'LICENSE').write_text('Disposable resolver fixture; not a React implementation.\n')
(react / 'React-Core.podspec').write_text("""Pod::Spec.new do |s|
  s.name = 'React-Core'
  s.version = '0.86.3'
  s.summary = 'Disposable dependency resolver fixture'
  s.homepage = 'https://github.com/Kaakyire9/betweener-app'
  s.author = 'Nyansapa Ltd'
  s.license = { :type => 'MIT', :file => 'LICENSE' }
  s.source = { :git => 'https://example.invalid/fixture.git', :tag => '0.86.3' }
  s.ios.deployment_target = '13.0'
  s.source_files = 'Fixture.h'
end
""")
ios = fixture / 'ios'
ios.mkdir()
(ios / 'Podfile').write_text("""install! 'cocoapods', :integrate_targets => false
platform :ios, '16.4'
pod 'StreamWebRTC', :podspec => '../native-artifacts/.cache/ios/StreamWebRTC.podspec'
target 'NativeIntegrationFixture' do
  pod 'React-Core', :path => '../react-fixture'
  pod 'stream-react-native-webrtc', :path => '../node_modules/@stream-io/react-native-webrtc'
end
""")
pod_version = subprocess.check_output(['pod', '--version'], env=env, text=True).strip()
subprocess.run(['pod', 'install', '--project-directory=' + str(ios)], env=env, check=True, timeout=600)
resolved = (ios / 'Podfile.lock').read_text()
assert 'StreamWebRTC (' + manifest['version'] + ')' in resolved
assert 'stream-react-native-webrtc (145.4.1)' in resolved
libraries = validation['ios']['nativeLibrarySha256']
assert set(libraries) == {'WebRTC.xcframework/ios-arm64/WebRTC.framework/WebRTC',
                         'WebRTC.xcframework/ios-arm64_x86_64-simulator/WebRTC.framework/WebRTC'}
for relative, expected in libraries.items():
    binary = ios / 'Pods/StreamWebRTC' / relative
    with binary.open('rb') as stream: actual = hashlib.file_digest(stream, 'sha256').hexdigest()
    assert actual == expected, 'CocoaPods selected a different native framework payload'
results.mkdir(parents=True, exist_ok=True)
shutil.copyfile(ios / 'Podfile.lock', results / 'Podfile.lock')
record = {'scope': 'REAL_IOS_COCOAPODS_RESOLUTION_ONLY', 'status': 'PASS', 'cocoaPods': pod_version,
          'wrapperVersion': '145.4.1', 'nativeVersion': manifest['version'],
          'frameworkArchiveSha256': manifest['ios']['sha256'], 'nativePayloadMatches': True,
          'reactImplementation': 'DISPOSABLE_RESOLVER_FIXTURE_NOT_COMPILED',
          'applicationBuilds': 0, 'signed': False, 'providerCalls': 0, 'installedOnPhone': False}
(results / 'ios-integration.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record))
