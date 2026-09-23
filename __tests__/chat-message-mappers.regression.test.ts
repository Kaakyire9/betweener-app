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

test('malformed local metadata falls back to structured message columns', () => {
  const row = chatMessageToLocalRow('owner-1', 'peer-1', message);
  const hydrated = localRowToChatMessage({ ...row, metadata_json: '{not-json' });

  assert.equal(hydrated.id, 'temp-client-1');
  assert.equal(hydrated.text, 'A durable hello');
  assert.equal(hydrated.senderId, 'owner-1');
  assert.equal(hydrated.status, 'queued');
});

test('safe JSON serialization reports cyclic payloads without throwing', () => {
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(safeJsonStringify(cyclic), null);
});
