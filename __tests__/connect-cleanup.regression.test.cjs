const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

test('retired service wrappers and mock app route are absent from active code', () => {
  for (const f of ['features/connect/data/connect-service.ts', 'features/connect/data/voice-service.ts', 'app/connect/voice-preview.tsx']) assert.equal(fs.existsSync(f), false, f);
  const composition = fs.readFileSync('features/connect/data/load-connect-product.ts', 'utf8');
  assert.match(composition, /createAuthenticatedConnectServices/);
});

test('retired entry-point source is preserved at its recorded byte hashes', () => {
  const manifest = JSON.parse(fs.readFileSync('docs/betweener-connect/archive/retired-code/manifest.json', 'utf8'));
  for (const file of manifest.files) {
    assert.equal(createHash('sha256').update(fs.readFileSync(file.archivePath)).digest('hex'), file.sha256, file.previousPath);
  }
  const evidence = JSON.parse(fs.readFileSync('docs/betweener-connect/stream-staging-live-connect-architecture-comparison.json', 'utf8'));
  const original = evidence.sourceHashes.find(f => f.path === 'app/connect/voice-preview.tsx');
  assert.equal(manifest.files.find(f => f.previousPath === original.path).sha256, original.sha256);
});

test('old launcher returns a retirement notice without loading device or network modules', () => {
  const source = fs.readFileSync('scripts/start-connect-device-safety.cjs', 'utf8');
  assert.doesNotMatch(source, /require\s*\(|\bspawn\s*\(|\bfetch\s*\(/);
  const result = spawnSync(process.execPath, ['scripts/start-connect-device-safety.cjs', '--check'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
  assert.equal(result.status, 1); assert.match(result.stderr, /harness is retired/); assert.equal(result.stdout, '');
});

test('current Connect entry point indexes historical records without renumbering them', () => {
  const reports = fs.readdirSync('docs/betweener-connect').filter(f => /^\d\d-.*\.md$/.test(f));
  const index = fs.readFileSync('docs/betweener-connect/archive/README.md', 'utf8');
  for (const name of reports) assert.ok(index.includes(`](../${name})`), name);
  assert.ok(fs.existsSync('docs/betweener-connect/README.md'));
});
