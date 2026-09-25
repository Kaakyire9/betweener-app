// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chatMessageToLocalRow,
  deserializeCachedMessages,
  localRowToChatMessage,
  safeJsonStringify,
  serializeCachedMessages,
} from '../lib/chat/message-mappers.ts';

const message = {
  id: 'temp-client-1',
  clientMessageId: 'client-1',
  text: 'A durable hello',
  senderId: 'owner-1',
  timestamp: new Date('2026-07-31T10:00:00.000Z'),
  readAt: new Date('2026-07-31T10:01:00.000Z'),
  deletedAt: null,
  editedAt: new Date('2026-07-31T10:00:30.000Z'),
  type: 'text',
  reactions: [],
  status: 'queued',
  location: {
    latitude: 51.4545,
    longitude: -2.5879,
    label: 'Bristol',
    expiresAt: new Date('2026-08-01T10:00:00.000Z'),
  },
  dateInvite: {
    scheduledFor: new Date('2026-08-02T18:00:00.000Z'),
  },
  replyTo: {
    id: 'message-parent',
    text: 'The complete original message survives pagination.',
    senderId: 'peer-1',
    timestamp: new Date('2026-07-31T09:59:00.000Z'),
    type: 'text',
    reactions: [],
    status: 'sent',
    replyTo: {
      id: 'older-parent',
      text: 'This nested reply must not be cached.',
      senderId: 'owner-1',
      timestamp: new Date('2026-07-31T09:58:00.000Z'),
      type: 'text',
      reactions: [],
    },
  },
};

test('cached messages preserve durable dates and one safe reply snapshot', () => {
  const cached = serializeCachedMessages([message]);

  assert.equal(cached[0].timestamp, '2026-07-31T10:00:00.000Z');
  assert.equal(cached[0].location.expiresAt, '2026-08-01T10:00:00.000Z');
  assert.equal(cached[0].dateInvite.scheduledFor, '2026-08-02T18:00:00.000Z');
  assert.equal(cached[0].replyTo.id, 'message-parent');
  assert.equal(cached[0].replyTo.text, 'The complete original message survives pagination.');
  assert.equal(cached[0].replyTo.timestamp, '2026-07-31T09:59:00.000Z');
  assert.equal(cached[0].replyTo.replyTo, undefined);

  const hydrated = deserializeCachedMessages(cached)[0];
  assert.equal(hydrated.timestamp.toISOString(), '2026-07-31T10:00:00.000Z');
  assert.equal(hydrated.location.expiresAt.toISOString(), '2026-08-01T10:00:00.000Z');
  assert.equal(hydrated.dateInvite.scheduledFor.toISOString(), '2026-08-02T18:00:00.000Z');
  assert.equal(hydrated.replyTo.text, 'The complete original message survives pagination.');
  assert.equal(hydrated.replyTo.timestamp.toISOString(), '2026-07-31T09:59:00.000Z');
  assert.equal(hydrated.replyTo.replyTo, undefined);
});

test('cached reply snapshots never retain view-once media access material', () => {
  const cached = serializeCachedMessages([{
    ...message,
    replyTo: {
      id: 'view-once-parent',
      text: 'private caption',
      senderId: 'peer-1',
      timestamp: new Date('2026-07-31T09:59:00.000Z'),
      type: 'image',
      reactions: [],
      isViewOnce: true,
      imageUrl: 'https://example.test/private.jpg',
      offlineImageUri: 'file:///private.jpg',
      storagePath: 'private/view-once.jpg',
      previewStoragePath: 'private/view-once-preview.jpg',
      encryptedMedia: true,
      encryptedMediaPath: 'private/path',
      encryptedKeyReceiver: 'secret',
    },
  }])[0];

  assert.equal(cached.replyTo.text, '');
  assert.equal(cached.replyTo.isViewOnce, true);
  assert.equal(cached.replyTo.imageUrl, undefined);
  assert.equal(cached.replyTo.offlineImageUri, undefined);
  assert.equal(cached.replyTo.storagePath, undefined);
  assert.equal(cached.replyTo.previewStoragePath, undefined);
  assert.equal(cached.replyTo.encryptedMediaPath, undefined);
  assert.equal(cached.replyTo.encryptedKeyReceiver, undefined);
});

test('optimistic queued messages map to pending local rows and hydrate back to queued', () => {
  const row = chatMessageToLocalRow('owner-1', 'peer-1', message);

  assert.equal(row.local_id, 'client-1');
  assert.equal(row.status, 'pending');
  assert.equal(row.local_only, 1);
  assert.equal(row.direction, 'outgoing');

  const hydrated = localRowToChatMessage(row);
  assert.equal(hydrated.status, 'queued');
  assert.equal(hydrated.clientMessageId, 'client-1');
  assert.equal(hydrated.timestamp.toISOString(), '2026-07-31T10:00:00.000Z');
});

test('expression semantics survive local message and reply cache round-trips', () => {
  const expression = {
    ...message,
    type: 'image',
    mediaKind: 'giphy_sticker',
    text: '',
    imageUrl: 'file:///expression.gif',
    providerMedia: {
      schemaVersion: 1,
      provider: 'giphy',
      providerMediaId: 'sticker-123',
      title: 'Hello sticker',
      width: 320,
      height: 240,
      kind: 'giphy_sticker',
    },
    replyTo: {
      ...message.replyTo,
      type: 'image',
      mediaKind: 'giphy_emoji',
      text: '',
      providerMedia: {
        schemaVersion: 1,
        provider: 'giphy',
        providerMediaId: 'emoji-456',
        title: 'Wave emoji',
        width: 200,
        height: 200,
        kind: 'giphy_emoji',
      },
    },
  };
  const hydrated = localRowToChatMessage(chatMessageToLocalRow('owner-1', 'peer-1', expression));
  assert.equal(hydrated.mediaKind, 'giphy_sticker');
  assert.equal(hydrated.providerMedia?.providerMediaId, 'sticker-123');
  assert.equal(hydrated.replyTo.mediaKind, 'giphy_emoji');
  assert.equal(hydrated.replyTo.providerMedia?.providerMediaId, 'emoji-456');

  const [snapshot] = deserializeCachedMessages(serializeCachedMessages([expression]));
  assert.equal(snapshot.mediaKind, 'giphy_sticker');
  assert.equal(snapshot.providerMedia?.providerMediaId, 'sticker-123');
  assert.equal(snapshot.replyTo.mediaKind, 'giphy_emoji');
  assert.equal(snapshot.replyTo.providerMedia?.providerMediaId, 'emoji-456');
});

test('malformed local metadata falls back to structured message columns', () => {
  const row = chatMessageToLocalRow('owner-1', 'peer-1', message);
  const hydrated = localRowToChatMessage({ ...row, metadata_json: '{not-json' });

  assert.equal(hydrated.id, 'temp-client-1');
  assert.equal(hydrated.text, 'A durable hello');
  assert.equal(hydrated.senderId, 'owner-1');
  assert.equal(hydrated.status, 'queued');
});

test('legacy cached messages hydrate missing dates deterministically from the local row', () => {
  const row = chatMessageToLocalRow('owner-1', 'peer-1', message);
  const legacySnapshot = serializeCachedMessages([message])[0];
  delete legacySnapshot.timestamp;
  delete legacySnapshot.dateInvite.scheduledFor;
  delete legacySnapshot.replyTo.timestamp;

  const legacyRow = {
    ...row,
    created_at: '2026-07-31T10:00:00.000Z',
    metadata_json: JSON.stringify(legacySnapshot),
  };
  const first = localRowToChatMessage(legacyRow);
  const second = localRowToChatMessage(legacyRow);

  assert.equal(first.timestamp.toISOString(), legacyRow.created_at);
  assert.equal(first.dateInvite.scheduledFor.toISOString(), legacyRow.created_at);
  assert.equal(first.replyTo.timestamp.toISOString(), legacyRow.created_at);
  assert.equal(first.timestamp.getTime(), second.timestamp.getTime());
  assert.equal(first.dateInvite.scheduledFor.getTime(), second.dateInvite.scheduledFor.getTime());
  assert.equal(first.replyTo.timestamp.getTime(), second.replyTo.timestamp.getTime());
});

test('safe JSON serialization reports cyclic payloads without throwing', () => {
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(safeJsonStringify(cyclic), null);
});
