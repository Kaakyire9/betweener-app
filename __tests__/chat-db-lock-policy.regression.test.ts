import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHAT_DB_BUSY_TIMEOUT_MS,
  CHAT_DB_DURABLE_ENQUEUE_LOCK_RETRY_DELAYS,
  getChatDbLockRetryDelays,
} from '../lib/chat/local/chat-db-lock-policy.ts';

test('bounds SQLite lock recovery by operation priority', () => {
  assert.equal(CHAT_DB_BUSY_TIMEOUT_MS, 500);
  assert.deepEqual(getChatDbLockRetryDelays('background'), []);
  assert.ok(
    getChatDbLockRetryDelays('user-blocking').length >
      getChatDbLockRetryDelays('background').length,
  );
});

test('gives durable message enqueue a longer bounded lock recovery window', () => {
  const standardWindow = getChatDbLockRetryDelays('user-blocking').reduce(
    (total, delay) => total + delay,
    0,
  );
  const durableEnqueueWindow =
    CHAT_DB_DURABLE_ENQUEUE_LOCK_RETRY_DELAYS.reduce(
      (total, delay) => total + delay,
      0,
    );

  assert.ok(durableEnqueueWindow > standardWindow);
  assert.ok(durableEnqueueWindow <= 10_000);
});
