/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const name = '@stream-io+react-native-callingx+0.11.5.patch';
const sourcePath = 'node_modules/@stream-io/react-native-callingx/android/src/main/java/io/getstream/rn/callingx/repo/TelecomCallRepository.kt';
const installed = fs.readFileSync(path.join(root, sourcePath), 'utf8').replace(/\r\n/g, '\n');
const patchPackage = path.join(root, 'node_modules/patch-package/index.js');
const normalize = text => text.replace(/\r\n/g, '\n');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 30_000 });
  if (result.error) throw result.error;
  return result;
}

function freshInstallFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'callingx-endpoint-patch-'));
  const source = path.join(directory, sourcePath);
  try {
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.mkdirSync(path.join(directory, 'patches'));
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'disposable-patch-fixture', version: '1.0.0' }));
    fs.writeFileSync(path.join(directory, 'node_modules/@stream-io/react-native-callingx/package.json'), JSON.stringify({ name: '@stream-io/react-native-callingx', version: '0.11.5' }));
    fs.copyFileSync(path.join(root, 'patches', name), path.join(directory, 'patches', name));
    fs.writeFileSync(source, installed);
    const reverse = run('git', ['apply', '--reverse', '--whitespace=nowarn', path.join(directory, 'patches', name)], directory);
    assert.equal(reverse.status, 0, reverse.stderr);
    return { directory, source, dispose: () => fs.rmSync(directory, { recursive: true, force: true }) };
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

test('a clean Callingx install receives the native endpoint patch through postinstall', () => {
  const fixture = freshInstallFixture();
  try {
    assert.notEqual(normalize(fs.readFileSync(fixture.source, 'utf8')), installed);
    const result = run(process.execPath, [patchPackage, '--error-on-fail'], fixture.directory);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(normalize(fs.readFileSync(fixture.source, 'utf8')), installed);
    const repeated = run(process.execPath, [patchPackage, '--error-on-fail'], fixture.directory);
    assert.equal(repeated.status, 0, repeated.stdout + repeated.stderr);
    assert.equal(normalize(fs.readFileSync(fixture.source, 'utf8')), installed);
  } finally { fixture.dispose(); }
});

test('an incompatible upstream endpoint implementation fails patch application', () => {
  const fixture = freshInstallFixture();
  try {
    fs.writeFileSync(fixture.source, 'package incompatible.upstream\n');
    const result = run(process.execPath, [patchPackage, '--error-on-fail'], fixture.directory);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(fs.readFileSync(fixture.source, 'utf8'), 'package incompatible.upstream\n');
  } finally { fixture.dispose(); }
});
