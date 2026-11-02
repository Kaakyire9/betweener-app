/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const tests = fs.readdirSync(path.join(root, '__tests__'))
  .filter(file => /\.test\.(?:ts|cjs)$/.test(file))
  .filter(file => /from ['"]node:test|require\(['"]node:test/.test(fs.readFileSync(path.join(root, '__tests__', file), 'utf8')))
  .sort()
  .map(file => path.join('__tests__', file));
if (!tests.length) throw Error('No Node regression suites discovered');
console.log(`Running ${tests.length} Node regression suites with external networking denied.`);
const result = spawnSync(process.execPath, [
  '--require', path.join(root, 'test/offline-network-guard.cjs'),
  '--no-warnings=MODULE_TYPELESS_PACKAGE_JSON', '--experimental-strip-types',
  '--test', '--test-concurrency=4', ...tests,
], {
  cwd: root, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, EXPO_PUBLIC_ENVIRONMENT: 'staging', EXPO_PUBLIC_LIVE_PRODUCT_ENABLED: 'true' },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
