const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('yaml');

const inputs = path.resolve('native-patches/stream-webrtc-145.17.0');
const runner = path.join(inputs, 'run-native-tests.py');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'betweener-native-guard-'));
  t.after(() => {
    const resolved = fs.realpathSync(root);
    assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const input = path.join(root, 'input'), work = path.join(root, 'work'), results = path.join(root, 'results');
  fs.mkdirSync(input);
  for (const name of ['manifest.json', 'strict-framing.patch']) fs.copyFileSync(path.join(inputs, name), path.join(input, name));
  return { root, input, work, results,
    run(extra = []) { return spawnSync('python', [runner, '--work', work, '--input', input, '--results', results, '--min-free-gb', '0', ...extra], { encoding: 'utf8', timeout: 15000 }); },
    record() { return JSON.parse(fs.readFileSync(path.join(results, 'run.json'), 'utf8')); } };
}

for (const alteration of ['patch', 'commit']) {
  test(`a changed ${alteration} is rejected before any toolchain download or native command`, t => {
    const f = fixture(t);
    if (alteration === 'patch') fs.appendFileSync(path.join(f.input, 'strict-framing.patch'), '\nchanged');
    else {
      const name = path.join(f.input, 'manifest.json'), manifest = JSON.parse(fs.readFileSync(name, 'utf8'));
      manifest.commit = '0000000000000000000000000000000000000000';
      fs.writeFileSync(name, JSON.stringify(manifest));
    }
    const result = f.run();
    assert.notEqual(result.status, 0);
    assert.equal(f.record().status, 'FAILED');
    assert.match(f.record().error, /Unexpected native test inputs/);
    assert.equal(fs.existsSync(path.join(f.work, 'src')), false);
    assert.equal(fs.existsSync(path.join(f.work, 'depot_tools')), false);
    assert.equal(result.stdout.includes('"command"'), false);
  });
}

test('overlapping checkout and input paths are rejected before output creation', t => {
  const f = fixture(t), result = f.run(['--work', f.root]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /separate work\/input\/result directories required/);
  assert.equal(fs.existsSync(f.results), false);
});

test('an iOS artifact cannot be built from a failed native test receipt', t => {
  const f = fixture(t); fs.mkdirSync(f.results);
  fs.writeFileSync(path.join(f.results, 'run.json'), JSON.stringify({ status: 'FAILED' }));
  const result = spawnSync('python', [path.join(inputs, 'ios-build.py'), '--work', f.work, '--input', f.input, '--results', f.results], { encoding: 'utf8', timeout: 15000 });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /passing patched native crypto tests/);
  assert.equal(fs.existsSync(path.join(f.work, 'src')), false);
});

test('native CI is manual, read-only and defaults to tests without artifact publication', () => {
  const workflow = yaml.parse(fs.readFileSync('.github/workflows/connect-native-crypto.yml', 'utf8'));
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.equal(workflow.on.workflow_dispatch.inputs.build_ios_artifact.default, false);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.equal(workflow.jobs.macos_crypto['runs-on'], 'macos-26');
  const checkout = workflow.jobs.macos_crypto.steps.find(step => step.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.with['persist-credentials'], false);
});
