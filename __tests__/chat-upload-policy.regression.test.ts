import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChatUploadFingerprint,
  CHAT_TUS_CHECKPOINT_MAX_AGE_MS,
  createDirectStorageOrigin,
  isFreshChatUploadCheckpoint,
} from '../lib/chat/transfer/chat-upload-policy.ts';

test('chat upload fingerprints remain deterministic across retries', () => {
  const input = {
    bucket: 'chat-media',
    objectPath: 'sender/receiver/message/file.mp4',
    byteSize: 10_000_000,
    contentType: 'video/mp4',
  };
  assert.equal(buildChatUploadFingerprint(input), buildChatUploadFingerprint(input));
});

test('Supabase resumable uploads use the direct storage hostname', () => {
  assert.equal(
    createDirectStorageOrigin('https://example.supabase.co'),
    'https://example.storage.supabase.co',
  );
  assert.equal(
    createDirectStorageOrigin('https://storage.example.com/'),
    'https://storage.example.com',
  );
});

test('expired or future resumable checkpoints are rejected', () => {
  const now = Date.parse('2026-07-29T12:00:00.000Z');
  assert.equal(
    isFreshChatUploadCheckpoint(
      new Date(now - CHAT_TUS_CHECKPOINT_MAX_AGE_MS + 1).toISOString(),
      now,
    ),
    true,
  );
  assert.equal(
    isFreshChatUploadCheckpoint(
      new Date(now - CHAT_TUS_CHECKPOINT_MAX_AGE_MS).toISOString(),
      now,
    ),
    false,
  );
  assert.equal(
    isFreshChatUploadCheckpoint(new Date(now + 1).toISOString(), now),
    false,
  );
});
