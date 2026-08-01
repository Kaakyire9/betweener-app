import test from 'node:test';
import assert from 'node:assert/strict';

import { getMessageImageItems, getStableChatImageFrame, normalizeChatMediaItems } from '../lib/chat/media-album.ts';
import { selectChatImageGalleryItem } from '../lib/chat/media/chat-image-gallery.ts';

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

test('opens hidden album photos by index and prefers the original over its preview', () => {
  const message = {
    id: 'album',
    text: '',
    senderId: 'sender',
    timestamp: new Date(),
    type: 'image' as const,
    reactions: [],
    mediaItems: Array.from({ length: 5 }, (_, index) => ({
      attachmentId: `attachment-${index}`,
      index,
      type: 'image' as const,
      storagePath: `original-${index}.jpg`,
      previewStoragePath: `preview-${index}.jpg`,
    })),
  };
  const selection = selectChatImageGalleryItem(message, 4, {
    'original-4.jpg': 'file://cached-original-4.jpg',
    'preview-4.jpg': 'file://cached-preview-4.jpg',
  });

  assert.equal(selection.count, 5);
  assert.equal(selection.index, 4);
  assert.equal(selection.message.storagePath, 'original-4.jpg');
  assert.equal(selection.renderedUri, 'file://cached-original-4.jpg');
});
