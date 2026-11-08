"""Build an unsigned device/simulator XCFramework only after host crypto tests pass."""
from pathlib import Path
import argparse, hashlib, json, os, platform, subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--work', type=Path, required=True)
parser.add_argument('--input', type=Path, required=True)
parser.add_argument('--results', type=Path, required=True)
args = parser.parse_args()
work, inputs, results = args.work.resolve(), args.input.resolve(), args.results.resolve()
source = work / 'src'
receipt = json.loads((results / 'run.json').read_text())
manifest = json.loads((inputs / 'manifest.json').read_text())
patched = receipt.get('patched') or {}
if (platform.system() != 'Darwin' or receipt.get('host') != 'Darwin'
        or receipt.get('status') != 'PASSED_NATIVE_HOST_CRYPTO'
        or not isinstance(patched.get('tests'), int) or patched['tests'] <= 0
        or patched.get('failures') != 0 or patched.get('errors', 0) != 0):
    raise SystemExit('A macOS host with passing patched native crypto tests is required')
if receipt['sourceCommit'] != manifest['commit'] or receipt.get('patchSha256') != manifest['patchSha256']:
    raise SystemExit('Native test receipt belongs to another source revision')
for item in manifest['files']:
    if hashlib.sha256((source / item['path']).read_bytes()).hexdigest() != item['afterSha256']:
        raise SystemExit('Native source changed after test: ' + item['path'])
os.environ['PATH'] = str(work / 'depot_tools') + os.pathsep + os.environ['PATH']
os.environ['DEPOT_TOOLS_UPDATE'] = '0'
output = source / 'out/strict_ios'
subprocess.run(['python3', 'tools_webrtc/ios/build_ios_libs.py', '--build_config', 'release',
                '--arch', 'device:arm64', 'simulator:arm64', '--output-dir', str(output),
                '--deployment-target', '16.4', '--extra-gn-args',
                'treat_warnings_as_errors=false', 'rtc_build_examples=false', 'rtc_build_tools=false',
                'use_remoteexec=false', 'use_reclient=false'], cwd=source, check=True)
framework = output / 'WebRTC.xcframework'
if not framework.is_dir():
    raise SystemExit('Expected XCFramework missing')
artifact = results / ('WebRTC-strict-145.17.0-' + manifest['patchSha256'][:12] + '.xcframework.zip')
subprocess.run(['ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', str(framework), str(artifact)], check=True)
(results / 'ios-artifact.json').write_text(json.dumps({
    'status': 'BUILT_NOT_INTEGRATED', 'sourceCommit': manifest['commit'],
    'patchSha256': manifest['patchSha256'], 'artifact': artifact.name,
    'sha256': hashlib.sha256(artifact.read_bytes()).hexdigest(),
    'architectures': ['ios-device-arm64', 'ios-simulator-arm64'],
    'nativeTests': receipt['patched'], 'appBuilds': 0,
    'xcode': subprocess.check_output(['xcodebuild', '-version'], text=True).strip(),
    'installedOnPhone': False, 'published': False,
}, indent=2) + '\n')
