"""Offline public-API comparison with integrity-pinned Stream 145.17.0 artifacts."""
from pathlib import Path
import argparse
import hashlib
import io
import json
import shutil
import subprocess
import zipfile

REFERENCES = {
    'android': '18c462cd44ece0d4cea249062b726257c91a94bda3e4609120a72d295020c3e8',
    'ios': 'c2577138a4d4569acd1e26734fe49d3381ce95332baff824f2874f5e7458f6d5',
}


def digest(path):
    with Path(path).open('rb') as file:
        return hashlib.file_digest(file, 'sha256').hexdigest()


def classes(aar_path):
    with zipfile.ZipFile(aar_path) as aar:
        jar = aar.read('classes.jar')
    with zipfile.ZipFile(io.BytesIO(jar)) as archive:
        names = sorted(name for name in archive.namelist() if name.endswith('.class'))
    if not names or len(names) != len(set(names)):
        raise ValueError('Missing or duplicate Android Java classes')
    return jar, names


def java_api(jar_path, names):
    tool = shutil.which('javap')
    if not tool: raise ValueError('JDK javap is required for the real Android API comparison')
    lines = []
    for offset in range(0, len(names), 40):
        batch = [name[:-6].replace('/', '.') for name in names[offset:offset + 40]]
        output = subprocess.check_output([tool, '-protected', '-classpath', str(jar_path), *batch], text=True, timeout=90)
        lines += [line.strip() for line in output.splitlines() if not line.startswith('Compiled from')]
    return '\n'.join(lines)


def compare_android(reference, candidate, directory):
    original_jar, original_names = classes(reference)
    updated_jar, updated_names = classes(candidate)
    if original_names != updated_names:
        raise ValueError('Android Java class inventory changed')
    directory.mkdir(parents=True, exist_ok=True)
    old, new = directory / 'reference-classes.jar', directory / 'candidate-classes.jar'
    old.write_bytes(original_jar); new.write_bytes(updated_jar)
    original_api, updated_api = java_api(old, original_names), java_api(new, updated_names)
    if original_api != updated_api:
        (directory / 'reference-api.txt').write_text(original_api)
        (directory / 'candidate-api.txt').write_text(updated_api)
        raise ValueError('Android public/protected Java API differs from the existing SDK')
    return {'status': 'PASS', 'classes': len(original_names),
            'publicApiSha256': hashlib.sha256(original_api.encode()).hexdigest()}


def ios_headers(archive_path):
    slices = {'ios-arm64': {}, 'ios-arm64_x86_64-simulator': {}}
    with zipfile.ZipFile(archive_path) as archive:
        for name in archive.namelist():
            if '/Headers/' not in name or not name.endswith('.h'): continue
            slice_name = next((item for item in slices if '/' + item + '/' in name), None)
            if slice_name is None: continue
            result = slices[slice_name]
            key = name.split('/Headers/', 1)[1]
            value = hashlib.sha256(archive.read(name)).hexdigest()
            if key in result: raise ValueError('Duplicate iOS public header: ' + key)
            result[key] = value
    for result in slices.values():
        if not {'WebRTC.h', 'RTCEncryptionManager.h'}.issubset(result):
            raise ValueError('Required iOS framework public headers are missing')
    if slices['ios-arm64'] != slices['ios-arm64_x86_64-simulator']:
        raise ValueError('Public iOS header inventories differ between device and simulator slices')
    return slices['ios-arm64']


def compare_ios(reference, candidate):
    old, new = ios_headers(reference), ios_headers(candidate)
    if old != new:
        changed = sorted(name for name in set(old) | set(new) if old.get(name) != new.get(name))
        raise ValueError('iOS public headers differ from the existing SDK: ' + ', '.join(changed))
    return {'status': 'PASS', 'publicHeaders': len(old),
            'headerInventorySha256': hashlib.sha256(json.dumps(old, sort_keys=True).encode()).hexdigest()}


def main():
    parser = argparse.ArgumentParser()
    for name in ['reference-android', 'candidate-android', 'reference-ios', 'candidate-ios', 'results']:
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    if digest(args.reference_android) != REFERENCES['android'] or digest(args.reference_ios) != REFERENCES['ios']:
        raise SystemExit('Existing SDK reference artifact digest mismatch')
    args.results.mkdir(parents=True, exist_ok=True)
    record = {
        'scope': 'OFFLINE_NATIVE_PUBLIC_API_COMPATIBILITY',
        'android': compare_android(args.reference_android, args.candidate_android, args.results / 'java-api'),
        'ios': compare_ios(args.reference_ios, args.candidate_ios),
        'candidateAndroidSha256': digest(args.candidate_android),
        'candidateIosSha256': digest(args.candidate_ios),
    }
    (args.results / 'compatibility.json').write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps(record, indent=2))


if __name__ == '__main__': main()
