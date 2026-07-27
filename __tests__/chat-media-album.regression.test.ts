import test from 'node:test';
import assert from 'node:assert/strict';

import { getMessageImageItems, getStableChatImageFrame, normalizeChatMediaItems } from '../lib/chat/media-album.ts';

test('normalizes and orders server-owned chat album metadata', () => {
  const items = normalizeChatMediaItems([
    { attachmentId: 'second', index: 1, type: 'image', storagePath: 'sender/peer/message/second.jpg', width: 800, height: 600 },
    { attachmentId: 'first', index: 0, type: 'image', storagePath: 'sender/peer/message/first.jpg', width: 600, height: 800 },
    { attachmentId: '', index: 2, storagePath: '' },
  ]);

  assert.deepEqual(items.map((item) => item.attachmentId), ['first', 'second']);
  assert.equal(items[0].width, 600);
  assert.equal(items[0].height, 800);
});

test('uses deterministic portrait, square and landscape frames', () => {
  assert.deepEqual(getStableChatImageFrame(600, 1000, 320), { width: 320, height: 400 });
  assert.deepEqual(getStableChatImageFrame(1000, 1000, 320), { width: 320, height: 320 });
  assert.deepEqual(getStableChatImageFrame(1200, 600, 320), { width: 320, height: 240 });
});

test('keeps an album frame stable while remaining photos finish uploading', () => {
  const items = getMessageImageItems({
    id: 'message',
    text: '',
    senderId: 'sender',
    timestamp: new Date(),
    type: 'image',
    reactions: [],
    mediaExpectedCount: 3,
    mediaItems: [{ attachmentId: 'first', index: 0, type: 'image', storagePath: 'first.jpg' }],
  });

  assert.equal(items.length, 3);
  assert.equal(items[1].attachmentId, 'pending-message-1');
});
