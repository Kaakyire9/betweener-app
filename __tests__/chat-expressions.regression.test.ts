import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  insertChatEmoji,
} from '../lib/chat/expressions/chat-expression-catalog.ts';
import {
  isApprovedChatGifUrl,
  parseChatGifProviderResult,
} from '../lib/chat/expressions/chat-gif-provider.ts';
import {
  buildStickerPayload,
  MOOD_STICKERS,
  parseStickerPayload,
} from '../lib/chat-stickers.ts';

test('inserts emoji at the active selection without exceeding composer capacity', () => {
  assert.deepEqual(
    insertChatEmoji('Hello world', '💚', { start: 6, end: 11 }),
    { text: 'Hello 💚', selection: { start: 8, end: 8 } },
  );
  assert.equal(insertChatEmoji('12345', '🔥', { start: 5, end: 5 }, 5).text, '12345');
  assert.equal(insertChatEmoji('1234', '🔥', { start: 4, end: 4 }, 5).text, '1234');
});

test('the server allowlist covers every curated sticker name', () => {
  const guard = readFileSync(
    new URL('../supabase/functions/private-message-guard-send/index.ts', import.meta.url),
    'utf8',
  );
  MOOD_STICKERS.forEach((sticker) => {
    const sourceLiteral = sticker.name.replaceAll("'", "\\'");
    assert.ok(
      guard.includes(`'${sourceLiteral}'`),
      `private-message guard is missing ${sticker.name}`,
    );
  });
});

test('only accepts HTTPS GIPHY media URLs for provider GIF downloads', () => {
  assert.equal(isApprovedChatGifUrl('https://media4.giphy.com/media/abc/giphy.gif'), true);
  assert.equal(isApprovedChatGifUrl('http://media.giphy.com/media/abc/giphy.gif'), false);
  assert.equal(isApprovedChatGifUrl('https://giphy.example.com/media/abc.gif'), false);
  assert.equal(isApprovedChatGifUrl('file:///private/sticker.gif'), false);
});

test('maps native GIPHY SDK media data into the existing safe send contract', () => {
  assert.deepEqual(parseChatGifProviderResult({
    id: 'animated-reaction-1',
    title: 'Warm hello',
    images: {
      fixed_width_small: {
        url: 'https://media2.giphy.com/media/animated-reaction-1/100w.gif',
        width: '100',
        height: '80',
      },
      downsized_medium: {
        url: 'https://media2.giphy.com/media/animated-reaction-1/giphy.gif',
        width: '500',
        height: '400',
        size: '1200000',
      },
    },
  }), {
    id: 'animated-reaction-1',
    title: 'Warm hello',
    previewUrl: 'https://media2.giphy.com/media/animated-reaction-1/100w.gif',
    originalUrl: 'https://media2.giphy.com/media/animated-reaction-1/giphy.gif',
    width: 500,
    height: 400,
    byteSize: 1200000,
  });
});

test('every curated sticker has a stable identity and round-trips through the wire payload', () => {
  assert.equal(new Set(MOOD_STICKERS.map((sticker) => sticker.id)).size, MOOD_STICKERS.length);
  MOOD_STICKERS.forEach((sticker) => {
    const parsed = parseStickerPayload(buildStickerPayload(sticker));
    assert.deepEqual(parsed, {
      emoji: sticker.emoji,
      name: sticker.name,
      color: sticker.color,
    });
  });
});
