import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  insertChatEmoji,
} from '../lib/chat/expressions/chat-expression-catalog.ts';
import {
  buildChatProviderMediaReference,
  isApprovedChatGifUrl,
  parseChatProviderMediaReference,
  parseChatGifProviderResult,
} from '../lib/chat/expressions/chat-gif-provider.ts';
import {
  getChatExpressionFrame,
  getChatExpressionPreviewLabel,
} from '../lib/chat/expressions/chat-expression-presentation.ts';
import { getEmojiOnlyPresentation } from '../lib/chat/expressions/emoji-only.ts';
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

test('classifies only one to three complete Unicode emoji sequences for large rendering', () => {
  assert.equal(getEmojiOnlyPresentation('💚')?.fontSize, 64);
  assert.equal(getEmojiOnlyPresentation('  👍🏾  🇬🇭 ')?.count, 2);
  assert.equal(getEmojiOnlyPresentation('👩🏿‍💻 1️⃣ ❤️')?.count, 3);
  assert.equal(getEmojiOnlyPresentation('😀😃😄😁'), null);
});

test('rejects mixed text, punctuation, bare numbers, isolated modifiers and malformed sequences', () => {
  ['hello 😀', '😀!', '123', '🏽', '🇬', '👩‍', '\u200d', '   '].forEach((value) => {
    assert.equal(getEmojiOnlyPresentation(value), null, JSON.stringify(value));
  });
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

test('builds a durable provider reference without persisting provider URLs', () => {
  const reference = buildChatProviderMediaReference({
    schemaVersion: 1,
    source: 'provider',
    provider: 'giphy',
    providerMediaId: 'expression_123',
    id: 'expression_123',
    title: 'Warm hello',
    previewUrl: 'https://media2.giphy.com/preview.gif',
    originalUrl: 'https://media2.giphy.com/original.gif',
    width: 320,
    height: 240,
    byteSize: 1200,
    kind: 'giphy_gif',
    isAnimated: true,
    attributionLabel: 'GIPHY',
  });
  assert.deepEqual(reference, {
    schemaVersion: 1,
    provider: 'giphy',
    providerMediaId: 'expression_123',
    title: 'Warm hello',
    width: 320,
    height: 240,
    kind: 'giphy_gif',
  });
  assert.equal(JSON.stringify(reference).includes('giphy.com'), false);
  assert.deepEqual(parseChatProviderMediaReference(reference), reference);
  assert.equal(parseChatProviderMediaReference({ ...reference, originalUrl: 'https://media.giphy.com/a.gif' }), null);
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
    schemaVersion: 1,
    source: 'provider',
    provider: 'giphy',
    providerMediaId: 'animated-reaction-1',
    id: 'animated-reaction-1',
    title: 'Warm hello',
    previewUrl: 'https://media2.giphy.com/media/animated-reaction-1/100w.gif',
    originalUrl: 'https://media2.giphy.com/media/animated-reaction-1/giphy.gif',
    width: 500,
    height: 400,
    byteSize: 1200000,
    kind: 'giphy_gif',
    isAnimated: true,
    attributionLabel: 'GIPHY',
  });
});

test('preserves expression kind and uses compact premium chat frames', () => {
  const sticker = parseChatGifProviderResult({
    id: 'sticker-1',
    images: {
      fixed_width_small: { url: 'https://media2.giphy.com/a.gif' },
      downsized: {
        url: 'https://media2.giphy.com/b.gif',
        width: '500',
        height: '400',
      },
    },
  }, 'giphy_sticker');
  assert.equal(sticker?.kind, 'giphy_sticker');
  assert.deepEqual(getChatExpressionFrame({
    kind: 'giphy_gif',
    sourceWidth: 500,
    sourceHeight: 400,
    availableWidth: 340,
  }), { width: 244, height: 195 });
  assert.deepEqual(getChatExpressionFrame({
    kind: 'giphy_emoji',
    sourceWidth: 500,
    sourceHeight: 400,
    availableWidth: 340,
  }), { width: 136, height: 109 });
});

test('accepts animated emoji renditions when GIPHY omits the usual GIF sizes', () => {
  const emoji = parseChatGifProviderResult({
    id: 'emoji-1',
    images: {
      fixed_height_small: {
        url: 'https://media2.giphy.com/media/emoji-1/100.gif',
        width: '100',
        height: '100',
      },
      fixed_height: {
        url: 'https://media2.giphy.com/media/emoji-1/200.gif',
        width: '200',
        height: '200',
      },
    },
  }, 'giphy_emoji');

  assert.deepEqual(emoji, {
    schemaVersion: 1,
    source: 'provider',
    provider: 'giphy',
    providerMediaId: 'emoji-1',
    id: 'emoji-1',
    title: 'GIF',
    previewUrl: 'https://media2.giphy.com/media/emoji-1/100.gif',
    originalUrl: 'https://media2.giphy.com/media/emoji-1/200.gif',
    width: 200,
    height: 200,
    byteSize: null,
    kind: 'giphy_emoji',
    isAnimated: true,
    attributionLabel: 'GIPHY',
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

test('uses semantic expression labels without trusting arbitrary image metadata', () => {
  assert.equal(getChatExpressionPreviewLabel('giphy_gif'), 'GIF');
  assert.equal(getChatExpressionPreviewLabel('giphy_sticker'), 'Sticker');
  assert.equal(getChatExpressionPreviewLabel('giphy_emoji'), 'Animated emoji');
  assert.equal(getChatExpressionPreviewLabel('giphy_text'), 'Animated text');
  assert.equal(getChatExpressionPreviewLabel('untrusted_kind'), null);
});

test('the semantic preview migration preserves media kind before insert-side push delivery', () => {
  const migration = readFileSync(
    new URL('../supabase/migrations/20260924100000_chat_expression_semantic_previews.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /last_message_media_kind/i);
  assert.match(migration, /request\.chat_expression_media_kind/i);
  assert.match(migration, /perform set_config\([\s\S]*rpc_finalize_chat_attachment_batch_v3/i);
  assert.match(migration, /chat_message_semantic_preview/i);
  assert.match(migration, /'media_kind', new\.media_kind/i);
});

test('the trusted finalize boundary rejects provider republishing unless explicitly approved', () => {
  const edgeFunction = readFileSync(
    new URL('../supabase/functions/chat-attachment-finalize/index.ts', import.meta.url),
    'utf8',
  );
  assert.match(edgeFunction, /GIPHY_MEDIA_CACHING_APPROVED/);
  assert.match(edgeFunction, /chat_expression_delivery_disabled/);
});

test('provider expressions use a service-only ID reference boundary', () => {
  const migration = readFileSync(
    new URL('../supabase/migrations/20260924230000_giphy_provider_reference_messages.sql', import.meta.url),
    'utf8',
  );
  const guard = readFileSync(
    new URL('../supabase/functions/private-message-guard-send/index.ts', import.meta.url),
    'utf8',
  );
  const chatScreen = readFileSync(
    new URL('../components/chat/ChatScreen.tsx', import.meta.url),
    'utf8',
  );
  assert.match(migration, /provider_media jsonb/i);
  assert.match(migration, /rpc_service_send_provider_expression/i);
  assert.match(migration, /CHAT_PROVIDER_MEDIA_WRITE_FORBIDDEN/i);
  assert.match(guard, /messageType === 'provider_expression'/i);
  assert.match(guard, /rpc_service_send_provider_expression/i);
  assert.doesNotMatch(chatScreen, /downloadAsync\(gif\.originalUrl/);
  assert.doesNotMatch(chatScreen, /Expression sharing unavailable/);
});

test('provider expressions use direct-send premium UI and one atomic publication RPC', () => {
  const migration = readFileSync(
    new URL('../supabase/migrations/20260925090000_provider_expression_fast_path.sql', import.meta.url),
    'utf8',
  );
  const guard = readFileSync(
    new URL('../supabase/functions/private-message-guard-send/index.ts', import.meta.url),
    'utf8',
  );
  const tray = readFileSync(
    new URL('../components/chat/ChatExpressionTray.tsx', import.meta.url),
    'utf8',
  );
  assert.match(migration, /rpc_service_consume_content_guard_rate_limit[\s\S]*insert into public\.messages/i);
  assert.match(guard, /if \(!providerExpression\)[\s\S]*rpc_service_consume_content_guard_rate_limit/i);
  assert.match(tray, /const selectProviderExpression[\s\S]*sendProviderExpression\(item\)/i);
  assert.doesNotMatch(tray, /item\.kind === 'giphy_gif'[\s\S]{0,160}setPreviewExpression\(item\)/i);
  assert.match(tray, /accessibilityHint="Tap to send\. Hold to preview and manage favourites\."/i);
});

test('provider expression retries recover and atomically settle the canonical message', () => {
  const outbox = readFileSync(
    new URL('../lib/chat/outbox/chat-outbox-service.ts', import.meta.url),
    'utf8',
  );
  const sendTextStart = outbox.indexOf('const sendTextOutboxItem');
  const sendTextEnd = outbox.indexOf('const sendMediaOutboxItem', sendTextStart);
  const sendText = outbox.slice(sendTextStart, sendTextEnd);
  const retryRecovery = sendText.indexOf("item.attempt_count > 0 || item.status === 'sending'");
  const attempting = sendText.indexOf('markOutboxItemAttempting');

  assert.ok(retryRecovery >= 0 && retryRecovery < attempting);
  assert.match(sendText, /canonicalBeforeRetry[\s\S]*settleOutboxMessage/i);
  assert.match(sendText, /canonical_message_missing_after_send/i);
  assert.doesNotMatch(sendText, /markOutboxItemStatus\([^)]*'sent'/i);
});

test('the unfinished Between Us pack stays production-hidden behind a versioned renderer contract', () => {
  const manifest = readFileSync(
    new URL('../lib/chat/expressions/between-us-pack.ts', import.meta.url),
    'utf8',
  );
  const renderer = readFileSync(
    new URL('../components/chat/FirstPartyExpressionAssetView.tsx', import.meta.url),
    'utf8',
  );
  assert.match(manifest, /productionVisible: false/);
  assert.match(manifest, /releaseStatus: 'assets_required'/);
  assert.match(renderer, /useReduceMotion/);
  assert.match(renderer, /playedInstances/);
  assert.match(renderer, /accessibilityLabel=\{asset\.accessibilityLabel\}/);
});
