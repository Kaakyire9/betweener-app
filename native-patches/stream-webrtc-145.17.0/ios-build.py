"""Build an unsigned device/simulator XCFramework only after host crypto tests pass."""
from pathlib import Path
import argparse, json, plistlib, subprocess, sys
from artifact_build import VERSION, build, tested_source, write_receipt

parser = argparse.ArgumentParser()
parser.add_argument('--work', type=Path, required=True)
parser.add_argument('--input', type=Path, required=True)
parser.add_argument('--results', type=Path, required=True)
args = parser.parse_args()
work, inputs, results = args.work.resolve(), args.input.resolve(), args.results.resolve()
source, receipt, manifest = tested_source(work, inputs, results, 'Darwin')
output = source / 'out/strict_ios'
build([sys.executable, 'tools_webrtc/ios/build_ios_libs.py', '--build_config', 'release',
                '--arch', 'device:arm64', 'simulator:arm64', 'simulator:x64', '--output-dir', str(output),
                '--deployment-target', '16.4', '--extra-gn-args',
                'treat_warnings_as_errors=false', 'rtc_build_examples=false', 'rtc_build_tools=false',
                'rtc_libvpx_build_vp9=true', 'use_rtti=false',
                'use_remoteexec=false', 'use_reclient=false'], source)
framework = output / 'WebRTC.xcframework'
if not framework.is_dir():
    raise SystemExit('Expected XCFramework missing')
info = plistlib.loads((framework / 'Info.plist').read_bytes())
slices = {(item['SupportedPlatform'], item.get('SupportedPlatformVariant', ''), tuple(sorted(item['SupportedArchitectures'])))
          for item in info['AvailableLibraries']}
if slices != {('ios', '', ('arm64',)), ('ios', 'simulator', ('arm64', 'x86_64'))}:
    raise SystemExit('Unexpected iOS architecture inventory: ' + repr(slices))
headers = {}
for item in info['AvailableLibraries']:
    directory = framework / item['LibraryIdentifier'] / item['LibraryPath']
    headers[item['LibraryIdentifier']] = sorted(path.name for path in (directory / 'Headers').glob('*.h'))
    if not {'WebRTC.h', 'RTCEncryptionManager.h'}.issubset(headers[item['LibraryIdentifier']]):
        raise SystemExit('Required WebRTC public headers missing')
    identifier = subprocess.check_output(['otool', '-D', str(directory / 'WebRTC')], text=True)
    if '@rpath/WebRTC.framework/WebRTC' not in identifier:
        raise SystemExit('Framework install name differs from the existing SDK')
(framework / 'BetweenerBuild.json').write_text(json.dumps({'version': VERSION, 'sourceCommit': manifest['commit'],
    'patchSha256': manifest['patchSha256'], 'vp9': True, 'signed': False}, indent=2) + '\n')
artifact = results / ('WebRTC-' + VERSION + '.xcframework.zip')
build(['ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', str(framework), str(artifact)], source)
write_receipt(results, 'ios', artifact, receipt,
              architectures=['ios-device-arm64', 'ios-simulator-arm64', 'ios-simulator-x86_64'],
              publicHeaders=headers, vp9=True, deploymentTarget='16.4',
              xcode=subprocess.check_output(['xcodebuild', '-version'], text=True).strip())
