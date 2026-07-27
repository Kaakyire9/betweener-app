import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHAT_DB_BUSY_TIMEOUT_MS,
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
