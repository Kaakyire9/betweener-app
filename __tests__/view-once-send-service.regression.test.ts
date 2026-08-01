import test from 'node:test';
import assert from 'node:assert/strict';

import {
  prepareDurableViewOnceAttachment,
  sendViewOnceAttachment,
} from '../lib/chat/attachments/view-once-send-service.ts';

test('sends view-once media in order and clears plaintext/ciphertext buffers', async () => {
  const plain = new Uint8Array([1, 2, 3]);
  const cipher = new Uint8Array([4, 5, 6, 7]);
  const calls: string[] = [];
  const outcome = await sendViewOnceAttachment({
    kind: 'image', uri: 'file://photo.jpg', fileName: 'photo.jpg', contentType: 'image/jpeg',
    receiverId: 'receiver', clientMessageId: 'message', attachmentId: 'attachment', replyToMessageId: null,
    senderPublicKey: 'sender-key', receiverPublicKey: 'receiver-key', imageLimitBytes: 10, videoLimitBytes: 20,
    getFileSize: async () => 3,
    readBytes: async () => { calls.push('read'); return plain; },
    encrypt: async ({ plainBytes }) => { calls.push(`encrypt:${plainBytes.join(',')}`); return {
      cipherBytes: cipher, encryptedKeySenderB64: 'sender-encrypted', encryptedKeyReceiverB64: 'receiver-encrypted', keyNonceB64: 'key-nonce', mediaNonceB64: 'media-nonce',
    }; },
    upload: async ({ bytes, fileName }) => { calls.push(`upload:${fileName}:${bytes.join(',')}`); return 'encrypted/path'; },
    finalize: async (payload) => { calls.push('finalize'); return payload; },
  });

  assert.deepEqual(calls, ['read', 'encrypt:1,2,3', 'upload:photo.jpg.enc:4,5,6,7', 'finalize']);
  assert.deepEqual(Array.from(plain), [0, 0, 0]);
  assert.deepEqual(Array.from(cipher), [0, 0, 0, 0]);
  assert.equal(outcome.encryptedPath, 'encrypted/path');
  assert.equal(outcome.encryptedByteSize, 4);
  assert.equal((outcome.result as Record<string, unknown>).storagePath, 'encrypted/path');
});

test('durably stages ciphertext while wiping both sensitive buffers', async () => {
  const plain = new Uint8Array([9, 8, 7]);
  const cipher = new Uint8Array([6, 5, 4, 3]);
  let persistedBytes: number[] = [];
  const result = await prepareDurableViewOnceAttachment({
    kind: 'image',
    uri: 'file://photo.jpg',
    fileName: 'photo.jpg',
    contentType: 'image/jpeg',
    receiverPublicKey: 'receiver-key',
    imageLimitBytes: 10,
    videoLimitBytes: 20,
    getFileSize: async () => plain.length,
    readBytes: async () => plain,
    encrypt: async () => ({
      cipherBytes: cipher,
      encryptedKeySenderB64: 'sender-encrypted',
      encryptedKeyReceiverB64: 'receiver-encrypted',
      keyNonceB64: 'key-nonce',
      mediaNonceB64: 'media-nonce',
    }),
    persistCiphertext: async ({ bytes }) => {
      persistedBytes = Array.from(bytes);
      return 'file://account-scope/photo.jpg.enc';
    },
  });

  assert.deepEqual(persistedBytes, [6, 5, 4, 3]);
  assert.deepEqual(Array.from(plain), [0, 0, 0]);
  assert.deepEqual(Array.from(cipher), [0, 0, 0, 0]);
  assert.equal(result.encryptedLocalUri, 'file://account-scope/photo.jpg.enc');
  assert.equal(result.encryptedByteSize, 4);
});
