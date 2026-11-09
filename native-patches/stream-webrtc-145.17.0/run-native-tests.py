"""Isolated upstream C++ red/green test; never imports Betweener or contacts Stream."""
from pathlib import Path
import argparse, ast, hashlib, json, os, platform, shutil, signal, subprocess, sys, time, warnings

parser = argparse.ArgumentParser()
parser.add_argument('--work', type=Path, default=Path('/work'))
parser.add_argument('--input', type=Path, default=Path('/input'))
parser.add_argument('--results', type=Path, default=Path('/results'))
mobile_target = parser.add_mutually_exclusive_group()
mobile_target.add_argument('--prepare-ios', action='store_true')
mobile_target.add_argument('--prepare-android', action='store_true')
parser.add_argument('--min-free-gb', type=int, default=30)
args = parser.parse_args()
ROOT = args.work.resolve()
INPUT = args.input.resolve()
RESULTS = args.results.resolve()
if ROOT == Path(ROOT.anchor) or ROOT in [INPUT, RESULTS] or INPUT.is_relative_to(ROOT) or RESULTS.is_relative_to(ROOT):
    parser.error('Dedicated, separate work/input/result directories required')
COMMIT = 'eeff9252f32a40d1671974c31c096ce9fa776130'
SOURCE = ROOT / 'src'
PATCH = INPUT / 'strict-framing.patch'
MANIFEST = json.loads((INPUT / 'manifest.json').read_text())
SYSTEM_NINJA = shutil.which('ninja')
BUILD_JOBS = min(4, os.cpu_count() or 2)
record = {'status': 'RUNNING', 'sourceCommit': COMMIT, 'patchSha256': MANIFEST['patchSha256'],
          'phase': 'preflight', 'host': platform.system(), 'architecture': platform.machine(), 'buildJobs': BUILD_JOBS,
          'providerCalls': 0, 'appBuilds': 0, 'startedAt': time.time()}
RESULTS.mkdir(parents=True, exist_ok=True)

def save():
    (RESULTS / 'run.json').write_text(json.dumps(record, indent=2) + '\n')

def run(args, cwd=ROOT, expected=None):
    print(json.dumps({'command': args, 'phase': record['phase']}), flush=True)
    process = subprocess.Popen(args, cwd=cwd, start_new_session=True)
    started = time.monotonic()
    while process.poll() is None:
        if time.monotonic() - started > 2700 or shutil.disk_usage(ROOT).free < 2 * 1024**3:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
            raise RuntimeError('Native command stopped: time or free-disk reserve exhausted')
        time.sleep(2)
    if expected is None and process.returncode != 0:
        raise RuntimeError('Native command failed with exit ' + str(process.returncode))
    return process.returncode

def phase(value):
    record['phase'] = value
    save()
    print(json.dumps({'phase': value, 'at': time.time()}), flush=True)

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def verify_sources(key):
    for item in MANIFEST['files']:
        if digest(SOURCE / item['path']) != item[key]:
            raise RuntimeError('Pinned native source hash mismatch: ' + item['path'])

def build():
    if not SYSTEM_NINJA:
        raise RuntimeError('A system Ninja binary is required')
    run([SYSTEM_NINJA, '-C', 'out/crypto_native', '-j', str(BUILD_JOBS), 'frame_crypto_transformer_unittests'], SOURCE)

def native_test(name, expect_failure=False):
    output = RESULTS / (name + '.json')
    code = run([str(SOURCE / 'out/crypto_native/frame_crypto_transformer_unittests'),
                '--gtest_output=json:' + str(output)], SOURCE, expected='inspect')
    if not output.exists():
        raise RuntimeError('Native test binary did not produce a result')
    data = json.loads(output.read_text())
    if not isinstance(data.get('tests'), int) or data['tests'] < 6:
        raise RuntimeError('Native crypto test inventory is missing')
    result = {key: data.get(key) for key in ['tests', 'failures', 'disabled', 'errors', 'time']}
    failed_names = {suite['name'] + '.' + item['name'] for suite in data.get('testsuites', [])
                    for item in suite.get('testsuite', []) if item.get('failures')}
    result['failedTests'] = sorted(failed_names)
    record[name] = result
    if expect_failure:
        expected = {'FrameCryptorTransformer.FrameTrailerUnframedDrops',
                    'DefaultEncryptionManager.DecodeOversizeClearBytesDropsAsUnencrypted',
                    'DefaultEncryptionManager.DecodeBadMagicDropsAsUnencrypted',
                    'DefaultEncryptionManager.DecodeTooShortDropsAsUnencrypted',
                    'DefaultEncryptionManager.UnframedDropsEveryTrackBeforeAndAfterKeySetup',
                    'DefaultEncryptionManager.StrictUnframedDropDoesNotPoisonAes256RoundTrip'}
        if code == 0 or failed_names != expected:
            raise RuntimeError('Expected exactly the six reviewed strict-receive failures on the pinned implementation')
    elif code != 0 or data.get('failures') or data.get('errors'):
        raise RuntimeError('Patched native crypto tests failed')
    elif data['tests'] != record['unpatched']['tests']:
        raise RuntimeError('Patched native test inventory changed')
    save()

try:
    ROOT.mkdir(parents=True, exist_ok=True)
    free_gb = shutil.disk_usage(ROOT).free / 1024**3
    record['initialFreeGB'] = round(free_gb, 1)
    if free_gb < args.min_free_gb:
        raise RuntimeError('Native build requires at least ' + str(args.min_free_gb) + ' GiB free; runner has ' + str(round(free_gb, 1)))
    if MANIFEST['commit'] != COMMIT or digest(PATCH) != MANIFEST['patchSha256']:
        raise RuntimeError('Unexpected native test inputs')
    if platform.system() not in ['Linux', 'Darwin'] or not SYSTEM_NINJA:
        raise RuntimeError('Use Linux Docker or macOS with a system Ninja binary for native validation')
    marker = ROOT / '.betweener-native-validation'
    if not marker.exists():
        if list(ROOT.iterdir()):
            raise RuntimeError('Refusing to use an existing unrelated build volume')
        marker.write_text(COMMIT)
    elif marker.read_text() != COMMIT:
        raise RuntimeError('Build volume belongs to a different native revision')
    phase('bootstrap_depot_tools')
    depot = ROOT / 'depot_tools'
    if not (depot / '.git').exists():
        run(['git', 'init', str(depot)])
        run(['git', 'remote', 'add', 'origin', 'https://chromium.googlesource.com/chromium/tools/depot_tools.git'], depot)
        run(['git', 'fetch', '--depth=1', 'origin', MANIFEST['depotToolsCommit']], depot)
        run(['git', 'checkout', '--detach', 'FETCH_HEAD'], depot)
    record['depotToolsCommit'] = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=depot, text=True).strip()
    if record['depotToolsCommit'] != MANIFEST['depotToolsCommit']:
        raise RuntimeError('depot_tools revision differs from the reviewed toolchain')
    os.environ['PATH'] = str(depot) + os.pathsep + os.environ['PATH']
    os.environ['DEPOT_TOOLS_UPDATE'] = '0'
    os.environ.pop('VPYTHON_BYPASS', None)
    phase('checkout_pinned_source')
    if not (SOURCE / '.git').exists():
        run(['git', 'init', str(SOURCE)])
        run(['git', 'remote', 'add', 'origin', 'https://github.com/GetStream/webrtc.git'], SOURCE)
        run(['git', 'fetch', '--depth=1', 'origin', COMMIT], SOURCE)
        run(['git', 'checkout', '--detach', 'FETCH_HEAD'], SOURCE)
    actual = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=SOURCE, text=True).strip()
    if actual != COMMIT:
        raise RuntimeError('Native checkout does not match reviewed commit')
    changes = subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=no'], cwd=SOURCE, text=True)
    if changes:
        raise RuntimeError('Native source already modified; inspect before retrying')
    verify_sources('beforeSha256')
    # The reviewed DEPS has exactly one anonymous hook: unrelated RTC media
    # fixtures. Suppress only that hook using gclient's supported override.
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', SyntaxWarning)
        tree = ast.parse((SOURCE / 'DEPS').read_text())
    hook_lists = [node.value for node in tree.body if isinstance(node, ast.Assign)
                  and any(isinstance(target, ast.Name) and target.id == 'hooks' for target in node.targets)]
    anonymous = [ast.literal_eval(hook) for hooks in hook_lists if isinstance(hooks, ast.List)
                 for hook in hooks.elts if isinstance(hook, ast.Dict)
                 and 'name' not in [ast.literal_eval(key) for key in hook.keys]]
    expected_hook = ['download_from_google_storage', '--directory', '--recursive', '--num_threads=10',
                     '--no_auth', '--quiet', '--bucket', 'chromium-webrtc-resources', 'src/resources']
    if len(anonymous) != 1 or anonymous[0].get('action') != expected_hook:
        raise RuntimeError('Anonymous upstream hook changed; review before suppressing media fixtures')
    record['unrelatedMediaFixtureHookSkipped'] = True
    config = "solutions = [{'name': 'src', 'url': 'https://github.com/GetStream/webrtc.git', 'managed': False, 'custom_deps': {}, 'custom_hooks': [{'name': ''}], 'custom_vars': {'checkout_instrumented_libraries': False, 'checkout_clang_coverage_tools': False, 'checkout_clangd': False, 'checkout_clang_tidy': False}}]\n"
    targets = ['ios'] if args.prepare_ios else ['android'] if args.prepare_android else []
    config += 'target_os = ' + repr(targets) + '\n'
    (ROOT / '.gclient').write_text(config)
    phase('sync_dependencies')
    run(['gclient', 'sync', '--no-history', '--nohooks', '--jobs=4', '--revision=src@' + COMMIT])
    phase('download_pinned_toolchain')
    run(['gclient', 'runhooks'])
    verify_sources('beforeSha256')
    phase('check_patch')
    run(['git', 'apply', '--check', str(PATCH)], SOURCE)
    # Build new assertions against the original manager to prove the defect.
    run(['git', 'apply', '--include=api/crypto/frame_crypto_transformer_unittest.cc', str(PATCH)], SOURCE)
    phase('configure_crypto_target')
    gn_args = ('is_debug=false is_component_build=false rtc_include_tests=true '
            'rtc_build_examples=false rtc_build_tools=false treat_warnings_as_errors=false '
            'rtc_use_x11=false rtc_use_pipewire=false symbol_level=0 '
            'use_siso=false use_remoteexec=false use_reclient=false')
    record['gnArgs'] = gn_args
    run([sys.executable, str(depot / 'gn.py'), 'gen', 'out/crypto_native', '--args=' + gn_args], SOURCE)
    phase('build_unpatched_regression')
    build()
    phase('test_unpatched_regression')
    native_test('unpatched', expect_failure=True)
    run(['git', 'apply', '--include=api/crypto/default_encryption_manager.cc', str(PATCH)], SOURCE)
    verify_sources('afterSha256')
    phase('build_patched_crypto')
    build()
    phase('test_patched_crypto')
    native_test('patched')
    record['status'] = 'PASSED_NATIVE_HOST_CRYPTO'
except Exception as error:
    record['status'] = 'FAILED'
    record['error'] = str(error)
    raise
finally:
    record['finishedAt'] = time.time()
    save()
