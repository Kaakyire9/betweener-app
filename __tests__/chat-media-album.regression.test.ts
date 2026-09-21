import test from 'node:test';
import assert from 'node:assert/strict';

import { getMessageImageItems, getStableChatImageFrame, normalizeChatMediaItems } from '../lib/chat/media-album.ts';
import { selectChatImageGalleryItem } from '../lib/chat/media/chat-image-gallery.ts';
import {
  ChatAlbumWorkError,
  CHAT_MEDIA_ALBUM_MAX_ITEMS,
  clampChatAlbumUploadProgress,
  getChatAlbumLayout,
  mapChatAlbumItemsBounded,
  normalizeDurableChatAlbumItems,
  prepareChatAlbumItemsForAttempt,
  removeChatAlbumItemFromComposition,
  resolveChatAlbumUploadBucket,
  resolveChatMediaAlbumUploadConcurrency,
  updateChatAlbumItemTransfer,
  unwrapSingleChatAlbumWorkError,
} from '../lib/chat/album/chat-media-album.ts';
import type { DurableChatAlbumItem } from '../lib/chat/album/chat-media-album.ts';

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

test('preserves the underlying error for a single-image worker failure', () => {
  const cause = Object.assign(new Error('image_content_not_allowed'), {
    code: 'image_content_not_allowed',
  });
  const wrapped = new ChatAlbumWorkError([{ index: 0, error: cause }]);

  assert.equal(unwrapSingleChatAlbumWorkError(wrapped), cause);
  const multiple = unwrapSingleChatAlbumWorkError(new ChatAlbumWorkError([
    { index: 0, error: cause },
    { index: 1, error: new Error('upload_failed') },
  ]));
  assert.ok(multiple instanceof ChatAlbumWorkError);
  assert.equal(multiple.message, 'chat_album_item_work_failed');
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

test('uses deterministic WhatsApp-style layouts for 2, 3, 4, 5 and 10 items', () => {
  assert.deepEqual(getChatAlbumLayout(2), { kind: 'split', visibleCount: 2, hiddenCount: 0 });
  assert.deepEqual(getChatAlbumLayout(3), { kind: 'hero-stack', visibleCount: 3, hiddenCount: 0 });
  assert.deepEqual(getChatAlbumLayout(4), { kind: 'grid', visibleCount: 4, hiddenCount: 0 });
  assert.deepEqual(getChatAlbumLayout(5), { kind: 'grid', visibleCount: 4, hiddenCount: 1 });
  assert.deepEqual(getChatAlbumLayout(10), { kind: 'grid', visibleCount: 4, hiddenCount: 6 });
});

test('normalizes mixed image/video albums without changing selection order', () => {
  const items = normalizeDurableChatAlbumItems([
    { attachmentId: 'one', contentType: 'video/mp4', mediaType: 'video' as const },
    { attachmentId: 'two', contentType: 'image/jpeg', mediaType: 'image' as const },
  ]);
  assert.deepEqual(items.map(({ attachmentId, index, mediaType }) => ({ attachmentId, index, mediaType })), [
    { attachmentId: 'one', index: 0, mediaType: 'video' },
    { attachmentId: 'two', index: 1, mediaType: 'image' },
  ]);
});

test('routes every mixed album item by its own type in either selection order', () => {
  const image = { attachmentId: 'image', contentType: 'image/jpeg', mediaType: 'image' as const };
  const video = { attachmentId: 'video', contentType: 'video/mp4', mediaType: 'video' as const };

  assert.deepEqual(
    [image, video].map(resolveChatAlbumUploadBucket),
    ['chat-attachment-staging-v1-2', 'chat-media'],
  );
  assert.deepEqual(
    [video, image].map(resolveChatAlbumUploadBucket),
    ['chat-media', 'chat-attachment-staging-v1-2'],
  );
});

test('album upload concurrency is configurable but remains safely bounded', () => {
  assert.equal(resolveChatMediaAlbumUploadConcurrency(undefined), 2);
  assert.equal(resolveChatMediaAlbumUploadConcurrency('3'), 3);
  assert.equal(resolveChatMediaAlbumUploadConcurrency(0), 1);
  assert.equal(resolveChatMediaAlbumUploadConcurrency(99), 4);
});

test('persists real per-item progress without mutating sibling items', () => {
  const items = [
    { attachmentId: 'one', transferState: 'uploading' as const, uploadProgress: 0 },
    { attachmentId: 'two', transferState: 'uploading' as const, uploadProgress: 0.2 },
  ];
  const updated = updateChatAlbumItemTransfer(items, 'one', {
    uploadProgress: clampChatAlbumUploadProgress(0.625),
  });
  assert.equal(updated[0].uploadProgress, 0.625);
  assert.equal(updated[1], items[1]);
  assert.equal(clampChatAlbumUploadProgress(4), 1);
  assert.equal(clampChatAlbumUploadProgress(-2), 0);
});

test('retry after restart preserves completed items and retries only requested failures', () => {
  const persisted = JSON.stringify([
    {
      attachmentId: 'uploaded', index: 0, contentType: 'image/jpeg', mediaType: 'image',
      transferState: 'uploaded', uploadProgress: 1, attemptCount: 1, lastError: null,
    },
    {
      attachmentId: 'failed-one', index: 1, contentType: 'video/mp4', mediaType: 'video',
      transferState: 'retryable_failed', uploadProgress: null, attemptCount: 1, lastError: 'network',
    },
    {
      attachmentId: 'failed-two', index: 2, contentType: 'image/jpeg', mediaType: 'image',
      transferState: 'retryable_failed', uploadProgress: null, attemptCount: 1, lastError: 'timeout',
    },
  ]);
  const restored = normalizeDurableChatAlbumItems<DurableChatAlbumItem>(JSON.parse(persisted));
  const next = prepareChatAlbumItemsForAttempt(restored, ['failed-two']);

  assert.equal(next[0].transferState, 'uploaded');
  assert.equal(next[0].attemptCount, 1);
  assert.equal(next[1].transferState, 'retryable_failed');
  assert.equal(next[1].attemptCount, 1);
  assert.equal(next[2].transferState, 'uploading');
  assert.equal(next[2].uploadProgress, 0);
  assert.equal(next[2].attemptCount, 2);
});

test('item cancellation removes exactly one identity and reindexes the composition', () => {
  const remaining = removeChatAlbumItemFromComposition([
    { attachmentId: 'one', index: 0 },
    { attachmentId: 'two', index: 1 },
    { attachmentId: 'three', index: 2 },
  ], 'two');
  assert.deepEqual(remaining, [
    { attachmentId: 'one', index: 0 },
    { attachmentId: 'three', index: 1 },
  ]);
  assert.throws(
    () => removeChatAlbumItemFromComposition([{ attachmentId: 'one', index: 0 }], 'one'),
    /chat_album_cannot_remove_last_item/,
  );
});

test('rejects duplicate identities, invalid order and more than ten items', () => {
  assert.throws(() => normalizeDurableChatAlbumItems([
    { attachmentId: 'same', contentType: 'image/jpeg' },
    { attachmentId: 'same', contentType: 'image/jpeg' },
  ]), /chat_album_attachment_identity_invalid/);
  assert.throws(() => normalizeDurableChatAlbumItems([
    { attachmentId: 'first', index: 1, contentType: 'image/jpeg' },
  ]), /chat_album_order_invalid/);
  assert.throws(() => normalizeDurableChatAlbumItems(Array.from(
    { length: CHAT_MEDIA_ALBUM_MAX_ITEMS + 1 },
    (_, index) => ({ attachmentId: String(index), contentType: 'image/jpeg' }),
  )), /chat_album_item_count_invalid/);
});

test('bounded album work runs concurrently but returns canonical input order', async () => {
  let active = 0;
  let peak = 0;
  const result = await mapChatAlbumItemsBounded([30, 5, 15, 1], async (delay, index) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, delay));
    active -= 1;
    return `item-${index}`;
  }, 2);
  assert.equal(peak, 2);
  assert.deepEqual(result, ['item-0', 'item-1', 'item-2', 'item-3']);
});

test('bounded album work waits for every worker and reports failed canonical indexes', async () => {
  const completed: number[] = [];
  await assert.rejects(
    mapChatAlbumItemsBounded(
      Array.from({ length: 5 }, (_, index) => index),
      async (index) => {
        await new Promise((resolve) => setTimeout(resolve, (5 - index) * 4));
        completed.push(index);
        if (index === 1 || index === 4) throw new Error(`failed-${index}`);
        return index;
      },
      2,
    ),
    (error: unknown) => {
      assert.ok(error instanceof ChatAlbumWorkError);
      assert.deepEqual(error.failures.map((failure) => failure.index), [1, 4]);
      return true;
    },
  );
  assert.equal(completed.length, 5);
});

test('prompt 4 migration and edge finalizer enforce atomic media albums', async () => {
  const { readFile } = await import('node:fs/promises');
  const migration = await readFile(
    new URL('../supabase/migrations/20260804120000_whatsapp_style_chat_media_albums.sql', import.meta.url),
    'utf8',
  );
  const edge = await readFile(
    new URL('../supabase/functions/chat-attachment-finalize/index.ts', import.meta.url),
    'utf8',
  );
  assert.match(migration, /messages_sender_media_group_unique/);
  assert.match(migration, /message_attachments_media_group_position_unique/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /rpc_claim_chat_attachment_finalization/);
  assert.match(migration, /chat_media_album_item_cancellations/);
  assert.match(migration, /rpc_cancel_chat_media_album_item/);
  assert.match(migration, /attachmentType'.*order by/s);
  assert.match(edge, /rpc_finalize_chat_media_album_v4/);
  assert.match(edge, /rpc_cancel_chat_media_album_item/);
  assert.match(edge, /isMediaAlbum/);
});

test('active cancellation tombstones staging uploads before byte cleanup', async () => {
  const { readFile } = await import('node:fs/promises');
  const edge = await readFile(
    new URL('../supabase/functions/chat-attachment-finalize/index.ts', import.meta.url),
    'utf8',
  );
  const cancellationMigration = await readFile(
    new URL('../supabase/migrations/20260919120000_chat_album_cancellation_staging_hardening.sql', import.meta.url),
    'utf8',
  );
  const outbox = await readFile(
    new URL('../lib/chat/outbox/chat-outbox-service.ts', import.meta.url),
    'utf8',
  );

  assert.match(edge, /Tombstone every batch before deleting bytes/);
  assert.match(edge, /Always commit the cancellation tombstone before deleting bytes/);
  assert.match(cancellationMigration, /chat-attachment-staging-v1-2/);
  assert.match(cancellationMigration, /pg_advisory_xact_lock/);
  assert.match(cancellationMigration, /create or replace function public\.rpc_cancel_chat_attachment_batch\(/);
  assert.doesNotMatch(cancellationMigration, /drop\s+(?:function|table|column|policy)/i);
  assert.match(outbox, /assertAlbumCompositionCurrent/);
  assert.match(outbox, /activeAlbumItemCancellations/);
});

test('v1.2 album client changes are isolated from the production 1.1.1 runtime', async () => {
  const { readFile } = await import('node:fs/promises');
  const appConfig = JSON.parse(await readFile(new URL('../app.json', import.meta.url), 'utf8'));
  const cancellationMigration = await readFile(
    new URL('../supabase/migrations/20260919120000_chat_album_cancellation_staging_hardening.sql', import.meta.url),
    'utf8',
  );

  assert.equal(appConfig.expo.version, '1.2.0');
  assert.equal(appConfig.expo.runtimeVersion?.policy, 'appVersion');
  assert.match(cancellationMigration, /grant execute[\s\S]*to service_role/i);
  assert.match(cancellationMigration, /'chat-media', 'voice-messages', 'chat-attachment-staging-v1-2'/);
});

test('album outbox wires item progress and per-item bucket routing into the real upload path', async () => {
  const { readFile } = await import('node:fs/promises');
  const outbox = await readFile(
    new URL('../lib/chat/outbox/chat-outbox-service.ts', import.meta.url),
    'utf8',
  );
  assert.match(outbox, /resolveChatAlbumUploadBucket\(file\)/);
  assert.match(outbox, /onProgress: onProgress/);
  assert.match(outbox, /ALBUM_PROGRESS_PERSIST_INTERVAL_MS/);
  assert.match(outbox, /updateAlbumTransferSnapshot/);
  assert.match(outbox, /album_items_incomplete/);
});

test('album lifecycle audit events are accepted by the database contract', async () => {
  const { readFile } = await import('node:fs/promises');
  const albumMigration = await readFile(
    new URL('../supabase/migrations/20260804120000_whatsapp_style_chat_media_albums.sql', import.meta.url),
    'utf8',
  );
  const eventContractMigration = await readFile(
    new URL('../supabase/migrations/20260804190000_allow_album_committed_attachment_event.sql', import.meta.url),
    'utf8',
  );

  assert.match(albumMigration, /'album_committed'/);
  assert.match(eventContractMigration, /chat_attachment_event_type_valid/);
  assert.match(eventContractMigration, /'album_committed'/);
  assert.match(eventContractMigration, /validate constraint chat_attachment_event_type_valid/);
});

test('album finalization canonicalizes provisional MIME and preserves actionable invariant errors', async () => {
  const { readFile } = await import('node:fs/promises');
  const migration = await readFile(
    new URL('../supabase/migrations/20260804153000_canonicalize_chat_attachment_storage_mime.sql', import.meta.url),
    'utf8',
  );
  const edge = await readFile(
    new URL('../supabase/functions/chat-attachment-finalize/index.ts', import.meta.url),
    'utf8',
  );

  assert.match(migration, /new\.mime_type := v_object_mime/);
  assert.match(migration, /not coalesce\(new\.is_view_once, false\)/);
  assert.match(migration, /application\/octet-stream/);
  assert.match(migration, /attachment_authoritative_mime_invalid/);
  assert.match(edge, /safeDatabaseError/);
  assert.match(edge, /normalizePreviewDimensions/);
  assert.match(edge, /attachment_lifecycle_event_invalid/);
  assert.match(edge, /attachment_preview_metadata_invalid/);
  assert.match(edge, /attachment_metadata_invalid/);
});

test('failed finalized albums route tile presses to durable retry instead of the media viewer', async () => {
  const { readFile } = await import('node:fs/promises');
  const content = await readFile(
    new URL('../components/chat/message-variants/MediaMessageContent.tsx', import.meta.url),
    'utf8',
  );

  assert.match(content, /isMyMessage && item\.status === 'failed'/);
  assert.match(content, /onRetryFailedMessage\?\.\(item\.id\)/);
  assert.match(content, /onManageAlbumItem\?\.\(item, albumIndex\)/);
});
