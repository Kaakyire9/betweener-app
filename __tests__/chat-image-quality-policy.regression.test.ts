import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canReuseChatImageWithoutCompression,
  CHAT_IMAGE_QUALITY_PROFILES,
  shouldPreserveAnimatedChatImage,
} from '../lib/chat/media/chat-image-quality-policy.ts';

test('standard chat photos use a bounded messaging profile', () => {
  assert.equal(CHAT_IMAGE_QUALITY_PROFILES.standard.maxEdge, 1920);
  assert.equal(CHAT_IMAGE_QUALITY_PROFILES.standard.targetBytes, 2 * 1024 * 1024);
  assert.ok(
    CHAT_IMAGE_QUALITY_PROFILES.standard.targetBytes
      < CHAT_IMAGE_QUALITY_PROFILES.hd.targetBytes,
  );
});

test('small standard photos avoid a redundant lossy pass', () => {
  assert.equal(canReuseChatImageWithoutCompression({
    mime: 'image/jpeg', byteSize: 900_000, width: 1280, height: 960, quality: 'standard',
  }), true);
  assert.equal(canReuseChatImageWithoutCompression({
    mime: 'image/jpeg', byteSize: 5_344_517, width: 4032, height: 3024, quality: 'standard',
  }), false);
});

test('HD accepts larger sources while HEIC still requires normalization', () => {
  assert.equal(canReuseChatImageWithoutCompression({
    mime: 'image/jpeg', byteSize: 5_344_517, width: 4032, height: 3024, quality: 'hd',
  }), true);
  assert.equal(canReuseChatImageWithoutCompression({
    mime: 'image/heic', byteSize: 1_000_000, width: 1200, height: 900, quality: 'hd',
  }), false);
});

test('animated GIFs remain animated instead of entering raster compression', () => {
  assert.equal(shouldPreserveAnimatedChatImage('image/gif', 'photo.bin'), true);
  assert.equal(shouldPreserveAnimatedChatImage('application/octet-stream', 'dance.GIF'), true);
  assert.equal(shouldPreserveAnimatedChatImage('image/jpeg', 'photo.jpg'), false);
});
