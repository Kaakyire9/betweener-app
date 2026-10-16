import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const {
  WINDOWS_METRO_EXCLUDED_PATHS,
  createPathPattern,
  createWindowsMetroBlockList,
  mergeMetroBlockList,
} = require('../config/metro/windows-block-list.js');

test('Windows Metro exclusions cover local caches and duplicate dependency trees', () => {
  for (const relativePath of ['.npm-cache', '%cd%', 'betweener', 'tmp']) {
    assert.ok(WINDOWS_METRO_EXCLUDED_PATHS.includes(relativePath));
  }
});

test('Metro block patterns accept Windows and POSIX separators without matching siblings', () => {
  const root = path.resolve('C:/Projects/betweener-app');
  const pattern = createPathPattern(root, '.npm-cache');
  const target = path.resolve(root, '.npm-cache');

  assert.match(path.join(target, '_cacache', 'content'), pattern);
  assert.match(path.join(target, '_cacache', 'content').replaceAll('\\', '/'), pattern);
  assert.doesNotMatch(path.resolve(root, '.npm-cache-safe', 'content'), pattern);
  assert.doesNotMatch(path.resolve(root, 'app', 'index.tsx'), pattern);
});

test('Metro block list preserves existing exclusions', () => {
  const existing = /existing-cache/;
  const additions = createWindowsMetroBlockList(process.cwd());
  const merged = mergeMetroBlockList(existing, additions);

  assert.equal(merged[0], existing);
  assert.equal(merged.length, additions.length + 1);
});

test('Windows transformation remains bounded without serialising the full graph', () => {
  const metroConfig = readFileSync('metro.config.js', 'utf8');

  assert.match(metroConfig, /config\.maxWorkers = 4/);
  assert.match(metroConfig, /unstable_workerThreads: false/);
  assert.match(metroConfig, /maxConcurrency: 8/);
});
