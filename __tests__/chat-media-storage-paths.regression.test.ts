import assert from 'node:assert/strict';
import test from 'node:test';
import {
  encodeChatMediaStoragePath,
  getLegacyChatMediaStoragePath,
} from '../lib/chat/media/chat-media-storage-paths.ts';

test('round-trips a legacy signed chat-media path without decoding separators', () => {
  assert.equal(
    getLegacyChatMediaStoragePath('https://x/storage/v1/object/sign/chat-media/thread%201/photo%201.jpg?token=x'),
    'thread 1/photo 1.jpg',
  );
  assert.equal(encodeChatMediaStoragePath('thread 1/photo 1.jpg'), 'thread%201/photo%201.jpg');
});
