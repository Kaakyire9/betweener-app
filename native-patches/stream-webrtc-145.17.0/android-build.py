"""Build a reviewed WebRTC AAR for every existing React Native Android ABI."""
from pathlib import Path
import argparse
import io
import json
import struct
import sys
import zipfile

from artifact_build import VERSION, build, tested_source, write_receipt

parser = argparse.ArgumentParser()
parser.add_argument('--work', type=Path, required=True)
parser.add_argument('--input', type=Path, required=True)
parser.add_argument('--results', type=Path, required=True)
args = parser.parse_args()
source, receipt, manifest = tested_source(args.work, args.input, args.results, 'Linux')
abis = ['armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64']
artifact = args.results / ('webrtc-' + VERSION + '.aar')
build([sys.executable, 'tools_webrtc/android/build_aar.py', '--arch', *abis,
       '--build-dir', str(source / 'out/strict_android'), '--output', str(artifact),
       '--extra-gn-args', 'treat_warnings_as_errors=false', 'rtc_build_examples=false',
       'rtc_build_tools=false', 'rtc_libvpx_build_vp9=true', 'use_rtti=false',
       'use_remoteexec=false', 'use_reclient=false', 'symbol_level=1',
       '--extra-ninja-switches=-local_jobs=4'], source)


def load_alignments(binary):
    if binary[:6] != b'\x7fELF\x02\x01':
        raise SystemExit('Expected a 64-bit little-endian ELF library')
    offset = struct.unpack_from('<Q', binary, 32)[0]
    size, count = struct.unpack_from('<HH', binary, 54)
    return [struct.unpack_from('<Q', binary, offset + index * size + 48)[0]
            for index in range(count) if struct.unpack_from('<I', binary, offset + index * size)[0] == 1]


with zipfile.ZipFile(artifact) as aar:
    actual = {name.split('/')[1] for name in aar.namelist() if name.startswith('jni/') and name.endswith('.so')}
    if actual != set(abis): raise SystemExit('Unexpected AAR ABI inventory')
    with zipfile.ZipFile(io.BytesIO(aar.read('classes.jar'))) as jar:
        classes = sorted(name for name in jar.namelist() if name.endswith('.class'))
        for name in ['org/webrtc/PeerConnectionFactory.class', 'org/webrtc/EncryptionManager.class', 'org/webrtc/RtpReceiver.class']:
            if name not in classes: raise SystemExit('Required Android API missing: ' + name)
    alignment = {}
    for abi in ['arm64-v8a', 'x86_64']:
        values = load_alignments(aar.read('jni/' + abi + '/libjingle_peerconnection_so.so'))
        if not values or min(values) < 16384:
            raise SystemExit('Android 16 KB page alignment check failed for ' + abi)
        alignment[abi] = values
license_path = args.results / 'LICENSE.md'
if not license_path.is_file(): raise SystemExit('Generated third-party licenses missing')
with zipfile.ZipFile(artifact, 'a', compression=zipfile.ZIP_DEFLATED) as aar:
    aar.write(license_path, 'META-INF/NOTICE.md')
    aar.writestr('META-INF/betweener-build.json', json.dumps({'version': VERSION,
        'sourceCommit': manifest['commit'], 'patchSha256': manifest['patchSha256'], 'vp9': True}))
write_receipt(args.results, 'android', artifact, receipt, architectures=abis, vp9=True,
              packageNamespace='org.webrtc', javaClasses=classes, elfLoadAlignments=alignment)
