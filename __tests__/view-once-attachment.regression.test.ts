import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildViewOnceFinalizeMetadata,
  createViewOnceOptimisticMessage,
  getViewOnceSizeError,
  getViewOnceUploadErrorMessage,
} from '../lib/chat/attachments/view-once-attachment.ts';
import {
  buildViewOnceStatusFromReceipts,
  isViewOnceAlreadyConsumedError,
  mergeViewOnceStatusMaps,
} from '../lib/chat/view-once-status.ts';

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

test('view-once status is monotonic when stale receipts arrive', () => {
  const current = {
    'message-1': { viewedByMe: true, viewedByPeer: false },
    'message-2': { viewedByMe: false, viewedByPeer: true },
  };

  assert.deepEqual(mergeViewOnceStatusMaps(current, {
    'message-1': { viewedByMe: false, viewedByPeer: false },
    'message-2': { viewedByMe: false, viewedByPeer: false },
  }), current);
});

test('builds participant-specific status without inventing negative receipts', () => {
  assert.deepEqual(buildViewOnceStatusFromReceipts({
    receipts: [
      { message_id: 'incoming', viewer_id: 'me' },
      { message_id: 'outgoing', viewer_id: 'peer' },
    ],
    currentUserId: 'me',
    peerUserId: 'peer',
  }), {
    incoming: { viewedByMe: true, viewedByPeer: false },
    outgoing: { viewedByMe: false, viewedByPeer: true },
  });
});

test('recognises an already-consumed response as canonical viewed state', () => {
  assert.equal(isViewOnceAlreadyConsumedError(new Error('view_once_already_consumed')), true);
  assert.equal(isViewOnceAlreadyConsumedError({ code: '22023', message: 'view_once_already_consumed' }), true);
  assert.equal(isViewOnceAlreadyConsumedError(new Error('network_error')), false);
});
