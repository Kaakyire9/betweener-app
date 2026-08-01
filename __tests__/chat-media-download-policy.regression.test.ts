import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_CHAT_MEDIA_DOWNLOAD_POLICY,
  normalizeChatMediaDownloadPolicy,
  shouldAutoDownloadChatMedia,
} from '../lib/chat/media/chat-media-download-policy.ts';

test('download policy normalization rejects malformed persisted values', () => {
  assert.deepEqual(
    normalizeChatMediaDownloadPolicy({
      photo: 'wifi',
      video: 'invalid',
      audio: 'manual',
    }),
    {
      photo: 'wifi',
      video: DEFAULT_CHAT_MEDIA_DOWNLOAD_POLICY.video,
      audio: 'manual',
      document: DEFAULT_CHAT_MEDIA_DOWNLOAD_POLICY.document,
    },
  );
});

test('offline and unknown network states never auto-download media', () => {
  for (const network of ['offline', 'unknown'] as const) {
    assert.equal(
      shouldAutoDownloadChatMedia({
        kind: 'photo',
        network,
        policy: DEFAULT_CHAT_MEDIA_DOWNLOAD_POLICY,
      }),
      false,
    );
  }
});

test('premium defaults cache photos and voice while protecting video and document data', () => {
  assert.equal(
    shouldAutoDownloadChatMedia({
      kind: 'photo',
      network: 'cellular',
      policy: DEFAULT_CHAT_MEDIA_DOWNLOAD_POLICY,
    }),
    true,
  );
  assert.equal(
    shouldAutoDownloadChatMedia({
      kind: 'audio',
      network: 'cellular',
      policy: DEFAULT_CHAT_MEDIA_DOWNLOAD_POLICY,
    }),
    true,
  );
  assert.equal(
    shouldAutoDownloadChatMedia({
      kind: 'video',
      network: 'cellular',
      policy: DEFAULT_CHAT_MEDIA_DOWNLOAD_POLICY,
    }),
    false,
  );
  assert.equal(
    shouldAutoDownloadChatMedia({
      kind: 'video',
      network: 'wifi',
      policy: DEFAULT_CHAT_MEDIA_DOWNLOAD_POLICY,
    }),
    true,
  );
  assert.equal(
    shouldAutoDownloadChatMedia({
      kind: 'document',
      network: 'wifi',
      policy: DEFAULT_CHAT_MEDIA_DOWNLOAD_POLICY,
    }),
    false,
  );
});
