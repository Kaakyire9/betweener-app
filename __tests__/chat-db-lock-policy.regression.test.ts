import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CHAT_DB_BUSY_TIMEOUT_MS,
  CHAT_DB_DURABLE_ENQUEUE_LOCK_RETRY_DELAYS,
  getChatDbLockRetryDelays,
  shouldUseSynchronousChatTransaction,
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

test('keeps synchronous iOS thread-cache writes out of the async finalizer path', () => {
  const repository = readFileSync('lib/chat/local/chat-repository.ts', 'utf8');
  const threadCacheWrite = repository.slice(
    repository.indexOf('async upsertThreads('),
    repository.indexOf('async getMessages('),
  );

  assert.match(threadCacheWrite, /label: 'upsert-thread-cache-chunk',[\s\S]*preferSynchronous: true/);
});

test('uses bounded synchronous transactions by default on iOS', () => {
  assert.equal(shouldUseSynchronousChatTransaction('ios'), true);
  assert.equal(shouldUseSynchronousChatTransaction('ios', false), false);
  assert.equal(shouldUseSynchronousChatTransaction('android'), true);
  assert.equal(shouldUseSynchronousChatTransaction('android', true), true);
});

test('keeps all serialized chat transactions on the owned SQLite connection', () => {
  const sqlite = readFileSync('lib/storage/sqlite.ts', 'utf8');
  const repository = readFileSync('lib/chat/local/chat-repository.ts', 'utf8');

  assert.match(sqlite, /openDatabaseAsync\(CHAT_DB_NAME, \{[\s\S]*useNewConnection: true/);
  assert.doesNotMatch(sqlite, /\.withExclusiveTransactionAsync\(/);
  assert.doesNotMatch(repository, /\.withExclusiveTransactionAsync\(/);
});
