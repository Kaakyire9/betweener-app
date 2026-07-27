import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createQueuedMediaMessage,
  createQueuedMediaOutboxRow,
} from '../lib/chat/attachments/chat-attachment-queue.ts';
import {
  buildPendingOutboxDueQueryParams,
  CHAT_PENDING_OUTBOX_DUE_QUERY,
} from '../lib/chat/local/chat-outbox-query.ts';

test('creates a durable queued document message and outbox contract', () => {
  const message = createQueuedMediaMessage({
    id: 'temp-document-1', senderId: 'sender', mediaType: 'document',
    stagedUri: 'file://chat/report.pdf', fileName: 'report.pdf',
    documentSizeLabel: '120 KB', documentTypeLabel: 'PDF', now: new Date('2026-01-01T00:00:00.000Z'),
  });
  const row = createQueuedMediaOutboxRow({
    ownerUserId: 'sender', threadId: 'receiver', message, mediaType: 'document',
    file: { localUri: 'file://chat/report.pdf', fileName: 'report.pdf', contentType: 'application/pdf', attachmentId: 'attachment-1' },
    documentSizeLabel: '120 KB', documentTypeLabel: 'PDF', now: new Date('2026-01-01T00:00:00.000Z'),
  });

  assert.equal(message.document?.url, 'file://chat/report.pdf');
  assert.match(message.text, /report.pdf \| 120 KB \| PDF/);
  assert.deepEqual(JSON.parse(row.payload_json), {
    kind: 'chat_media_send', senderId: 'sender', receiverId: 'receiver', clientMessageId: 'temp-document-1',
    localUri: 'file://chat/report.pdf', fileName: 'report.pdf', contentType: 'application/pdf', mediaType: 'document',
    attachmentId: 'attachment-1', byteSize: null, width: null, height: null, durationMs: null,
    replyToMessageId: null, documentName: 'report.pdf', documentSizeLabel: '120 KB', documentTypeLabel: 'PDF',
  });
});

test('builds an index-friendly due outbox query without date wrappers or a cross-status OR scan', () => {
  assert.doesNotMatch(CHAT_PENDING_OUTBOX_DUE_QUERY, /datetime\s*\(/i);
  assert.match(CHAT_PENDING_OUTBOX_DUE_QUERY, /status = 'queued'/);
  assert.match(CHAT_PENDING_OUTBOX_DUE_QUERY, /union all/i);
  assert.match(CHAT_PENDING_OUTBOX_DUE_QUERY, /status = 'sending'/);
  assert.match(CHAT_PENDING_OUTBOX_DUE_QUERY, /updated_at <= \?/);

  assert.deepEqual(
    buildPendingOutboxDueQueryParams({
      ownerUserId: 'owner-1',
      now: '2026-07-26T12:00:00.000Z',
      staleSendingBefore: '2026-07-26T11:58:00.000Z',
      limit: 50,
    }),
    [
      'owner-1',
      '2026-07-26T12:00:00.000Z',
      'owner-1',
      '2026-07-26T11:58:00.000Z',
      '2026-07-26T12:00:00.000Z',
      50,
    ],
  );
});
