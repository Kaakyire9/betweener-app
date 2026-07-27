import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildViewOnceFinalizeMetadata,
  createViewOnceOptimisticMessage,
  getViewOnceSizeError,
  getViewOnceUploadErrorMessage,
} from '../lib/chat/attachments/view-once-attachment.ts';

test('creates an encrypted, one-time optimistic video message', () => {
  const message = createViewOnceOptimisticMessage({
    id: 'temp-viewonce-1', senderId: 'sender', kind: 'video', now: new Date('2026-01-01T00:00:00.000Z'),
  });
  assert.equal(message.isViewOnce, true);
  assert.equal(message.encryptedMedia, true);
  assert.equal(message.status, 'sending');
  assert.equal(message.videoUrl, undefined);
});

test('keeps view-once size and finalize metadata rules outside the screen', () => {
  assert.equal(getViewOnceSizeError({ kind: 'image', byteSize: 16, imageLimitBytes: 15, videoLimitBytes: 25 }), 'view_once_media_exceeds_0mb');
  assert.equal(getViewOnceSizeError({ kind: 'video', byteSize: 25, imageLimitBytes: 15, videoLimitBytes: 25 }), null);
  assert.match(getViewOnceUploadErrorMessage('video', new Error('view_once_media_exceeds_25mb')), /video smaller than 25 MB/);
  assert.deepEqual(buildViewOnceFinalizeMetadata({
    payload: { encryptedKeySenderB64: 'sender', encryptedKeyReceiverB64: 'receiver', keyNonceB64: 'key', mediaNonceB64: 'media' },
    senderPublicKey: 'public',
  }), {
    isViewOnce: true, encryptedKeySender: 'sender', encryptedKeyReceiver: 'receiver', encryptedKeyNonce: 'key',
    encryptedMediaNonce: 'media', encryptedMediaAlg: 'nacl-secretbox', senderPublicKey: 'public',
  });
});
