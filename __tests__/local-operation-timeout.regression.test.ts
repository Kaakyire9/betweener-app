import assert from 'node:assert/strict';
import test from 'node:test';
import { withLocalOperationTimeout } from '../lib/chat/local/local-operation-timeout.ts';

test('uses the fallback when local work exceeds its UI timeout', async () => {
  const result = await withLocalOperationTimeout(new Promise<string>(() => {}), 1, 'fallback');
  assert.deepEqual(result, { value: 'fallback', timedOut: true });
});

test('returns a completed local result without reporting a timeout', async () => {
  const result = await withLocalOperationTimeout(Promise.resolve('stored'), 50, 'fallback');
  assert.deepEqual(result, { value: 'stored', timedOut: false });
});
