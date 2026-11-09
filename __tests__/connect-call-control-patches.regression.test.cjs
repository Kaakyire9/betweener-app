/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const patchPackage = path.join(root, 'node_modules/patch-package/index.js');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 30_000 });
  if (result.error) throw result.error;
  return result;
}
for (const [packageName, version, patchName] of [
  ['@stream-io/video-client', '1.62.0', '@stream-io+video-client+1.62.0.patch'],
  ['@stream-io/video-react-native-sdk', '1.46.3', '@stream-io+video-react-native-sdk+1.46.3.patch'],
]) {
  test(`${packageName}: clean postinstall and repeated application reproduce the reviewed patch`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'connect-call-patch-'));
    try {
      const patch = fs.readFileSync(path.join(root, 'patches', patchName), 'utf8').replace(/\r\n/g, '\n');
      const files = [...patch.matchAll(/^diff --git a\/(.+) b\/(.+)$/gm)].map(match => match[2]);
      fs.mkdirSync(path.join(directory, 'patches'));
      fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'disposable-call-patch-fixture', version: '1.0.0' }));
      for (const file of files) {
        assert.ok(file.startsWith(`node_modules/${packageName}/`));
        const target = path.join(directory, file); fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'));
      }
      fs.writeFileSync(path.join(directory, `node_modules/${packageName}/package.json`), JSON.stringify({ name: packageName, version }));
      const patchPath = path.join(directory, 'patches', patchName); fs.writeFileSync(patchPath, patch);
      // The existing RN patch contains successive edits to the same files.
      // Reconstruct its clean baseline in reverse chronological order.
      const fragments = patch.split(/(?=^diff --git )/m).filter(fragment => fragment.trim());
      for (const fragment of fragments.reverse()) {
        const reversePath = path.join(directory, 'reverse.fragment.patch'); fs.writeFileSync(reversePath, fragment);
        const reverse = run('git', ['apply', '--reverse', '--whitespace=nowarn', reversePath], directory);
        assert.equal(reverse.status, 0, reverse.stderr);
      }
      for (let iteration = 0; iteration < 2; iteration++) {
        const result = run(process.execPath, [patchPackage, '--error-on-fail'], directory);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        for (const file of files) assert.equal(fs.readFileSync(path.join(directory, file), 'utf8').replace(/\r\n/g, '\n'), fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'));
      }
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
}
