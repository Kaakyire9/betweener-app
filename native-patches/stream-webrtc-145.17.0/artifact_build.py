"""Fail-closed shared validation for unsigned WebRTC library builds."""
from pathlib import Path
import hashlib
import json
import os
import platform
import shutil
import signal
import subprocess
import time

COMMIT = 'eeff9252f32a40d1671974c31c096ce9fa776130'
PATCH = '789936f4866c5f05760715fba633ceb402a8089d50bc1674161d3afdfb8aa7d5'
VERSION = '145.17.0-betweener.789936f4866c.1'


def sha256(path):
    with Path(path).open('rb') as file:
        return hashlib.file_digest(file, 'sha256').hexdigest()


def tested_source(work, inputs, results, host):
    work, inputs, results = (Path(value).resolve() for value in [work, inputs, results])
    receipt = json.loads((results / 'run.json').read_text())
    green, red = receipt.get('patched') or {}, receipt.get('unpatched') or {}
    if (platform.system() != host or receipt.get('host') != host
            or receipt.get('status') != 'PASSED_NATIVE_HOST_CRYPTO'
            or green.get('tests') != 79 or green.get('failures') != 0
            or green.get('errors') != 0 or green.get('disabled') != 0
            or red.get('tests') != 79 or red.get('failures') != 6
            or red.get('errors') != 0 or red.get('disabled') != 0):
        raise SystemExit('A matching host with passing patched native crypto tests is required')
    source = work / 'src'
    if work == Path(work.anchor) or inputs.is_relative_to(work) or results.is_relative_to(work):
        raise SystemExit('Separate, dedicated native work/input/results paths are required')
    manifest = json.loads((inputs / 'manifest.json').read_text())
    if (manifest['commit'] != COMMIT or manifest['patchSha256'] != PATCH
            or receipt.get('sourceCommit') != COMMIT or receipt.get('patchSha256') != PATCH
            or sha256(inputs / 'strict-framing.patch') != PATCH):
        raise SystemExit('Native build source or patch differs from reviewed inputs')
    actual = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=source, text=True).strip()
    if actual != COMMIT:
        raise SystemExit('Native checkout revision changed after validation')
    for item in manifest['files']:
        if sha256(source / item['path']) != item['afterSha256']:
            raise SystemExit('Native source changed after test: ' + item['path'])
    changes = subprocess.check_output(['git', 'diff', '--name-only'], cwd=source, text=True).splitlines()
    if set(changes) != {item['path'] for item in manifest['files']}:
        raise SystemExit('Unexpected tracked native source modifications')
    os.environ['PATH'] = str(work / 'depot_tools') + os.pathsep + os.environ['PATH']
    os.environ['DEPOT_TOOLS_UPDATE'] = '0'
    return source, receipt, manifest


def build(command, source, timeout=7200):
    print(json.dumps({'nativeBuild': command, 'freeGB': round(shutil.disk_usage(source).free / 1024**3, 1)}), flush=True)
    process = subprocess.Popen(command, cwd=source, start_new_session=True)
    start = time.monotonic()
    while process.poll() is None:
        if time.monotonic() - start > timeout or shutil.disk_usage(source).free < 2 * 1024**3:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
            raise SystemExit('Native library build exceeded its time or free-space reserve')
        time.sleep(2)
    if process.returncode:
        raise SystemExit('Native library build failed: ' + str(process.returncode))


def write_receipt(results, platform_name, artifact, receipt, **metadata):
    value = {'status': 'BUILT_NOT_INTEGRATED', 'platform': platform_name,
             'version': VERSION, 'sourceCommit': COMMIT, 'patchSha256': PATCH,
             'artifact': artifact.name, 'sha256': sha256(artifact),
             'bytes': artifact.stat().st_size, 'nativeTests': receipt['patched'],
             'appBuilds': 0, 'providerCalls': 0, 'installedOnPhone': False,
             'published': False, **metadata}
    (Path(results) / (platform_name + '-artifact.json')).write_text(json.dumps(value, indent=2) + '\n')
    print(json.dumps(value), flush=True)
