"""Compile the installed patched Stream native pods without building/signing an app."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fixture', type=Path, required=True)
    parser.add_argument('--results', type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    fixture, results = args.fixture.resolve(), args.results.resolve()
    if platform.system() != 'Darwin' or not all(shutil.which(tool) for tool in ['pod', 'xcodebuild']):
        parser.error('Use a macOS runner with Xcode and CocoaPods; no simulated compilation result is accepted')
    if fixture.exists() or root.is_relative_to(fixture) or fixture.is_relative_to(root):
        parser.error('Use a new disposable fixture outside the application checkout')
    versions = {
        'react-native': '0.86.3',
        '@stream-io/react-native-webrtc': '145.4.1',
        '@stream-io/video-react-native-sdk': '1.46.3',
        '@stream-io/react-native-callingx': '0.11.5',
    }
    for name, version in versions.items():
        assert json.loads((root / 'node_modules' / name / 'package.json').read_text())['version'] == version, name
    fixture.mkdir(parents=True)
    results.mkdir(parents=True, exist_ok=True)
    (fixture / 'node_modules').symlink_to(root / 'node_modules', target_is_directory=True)
    (fixture / 'package.json').write_text(json.dumps({'name': 'connect-native-pod-preflight', 'version': '0.0.0', 'private': True, 'dependencies': versions}))
    env = {**os.environ, 'APP_VARIANT': 'staging', 'EXPO_PUBLIC_ENVIRONMENT': 'staging',
           'BETWEENER_STRICT_WEBRTC': '1', 'COCOAPODS_DISABLE_STATS': 'true', 'RCT_NEW_ARCH_ENABLED': '1'}
    # Select the same reviewed, checksum-pinned framework as the development profile.
    prepare = "require(process.argv[1]).prepare({projectRoot:process.argv[2],platform:'ios'}).catch(e=>{console.error(e.message);process.exitCode=1})"
    subprocess.run(['node', '-e', prepare, str(root / 'scripts/lib/native-webrtc-artifacts.cjs'), str(root)], env=env, check=True, timeout=60)
    podfile = f"""require_relative 'node_modules/react-native/scripts/react_native_pods'
platform :ios, '16.4'
prepare_react_native_project!
install! 'cocoapods', :integrate_targets => false, :deterministic_uuids => false
target 'ConnectNativePodPreflight' do
  use_react_native!(:path => '{root}/node_modules/react-native', :app_path => '{fixture}', :hermes_enabled => true)
  pod 'StreamWebRTC', :podspec => '{root}/native-artifacts/.cache/ios/StreamWebRTC.podspec'
  pod 'stream-react-native-webrtc', :path => '{root}/node_modules/@stream-io/react-native-webrtc'
  pod 'stream-video-react-native', :path => '{root}/node_modules/@stream-io/video-react-native-sdk'
  pod 'Callingx', :path => '{root}/node_modules/@stream-io/react-native-callingx'
  post_install do |installer|
    react_native_post_install(installer, '{root}/node_modules/react-native', :mac_catalyst_enabled => false)
  end
end
"""
    (fixture / 'Podfile').write_text(podfile)
    with (results / 'pod-install.log').open('w') as log:
        subprocess.run(['pod', 'install'], cwd=fixture, env=env, stdout=log, stderr=subprocess.STDOUT, check=True, timeout=1200)
    # Compile libraries and their real React/WebRTC dependencies. No application,
    # signing identity, EAS credentials, installation or media request exists here.
    for target in ['stream-video-react-native', 'Callingx']:
        with (results / f'{target}.log').open('w') as log:
            subprocess.run(['xcodebuild', '-project', str(fixture / 'Pods/Pods.xcodeproj'),
                            '-target', target, '-configuration', 'Debug', '-sdk', 'iphonesimulator',
                            '-jobs', '3', 'CODE_SIGNING_ALLOWED=NO', 'CODE_SIGNING_REQUIRED=NO',
                            'ARCHS=arm64', 'ONLY_ACTIVE_ARCH=YES', 'build'],
                           cwd=fixture, env=env, stdout=log, stderr=subprocess.STDOUT, check=True, timeout=1800)
    files = ['patches/@stream-io+video-react-native-sdk+1.46.3.patch', 'patches/@stream-io+react-native-callingx+0.11.5.patch',
             'patches/@stream-io+react-native-webrtc+145.4.1.patch', 'node_modules/@stream-io/video-react-native-sdk/ios/StreamInCallManager.swift',
             'node_modules/@stream-io/video-react-native-sdk/ios/StreamInCallManager.m']
    receipt = {'scope': 'IOS_SIMULATOR_NATIVE_POD_COMPILATION_ONLY', 'status': 'PASS', 'versions': versions,
               'revision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
               'sha256': {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in files},
               'applicationBuilds': 0, 'easBuilds': 0, 'signed': False, 'providerCalls': 0, 'physicalDeviceValidation': False}
    (results / 'call-control-ios.json').write_text(json.dumps(receipt, indent=2) + '\n')
    shutil.copyfile(fixture / 'Podfile.lock', results / 'Podfile.lock')
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
