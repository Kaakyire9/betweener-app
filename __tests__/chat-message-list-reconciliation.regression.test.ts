// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getChatMessageRevisionKey,
  preserveUnchangedMessageReferences,
} from '../lib/chat/message-list-reconciliation.ts';

const message = (id: string, status = 'sent') => ({
  id,
  text: id,
  senderId: 'user-a',
  timestamp: new Date('2026-06-11T10:00:00.000Z'),
  type: 'text',
  reactions: [],
  status,
});

const getKey = (item) => `${item.id}:${item.status}:${item.text}`;

test('message reconciliation keeps the current array when nothing changed', () => {
  const current = [message('one'), message('two')];
  const next = current.map((item) => ({ ...item }));

  const reconciled = preserveUnchangedMessageReferences(current, next, getKey);

  assert.equal(reconciled, current);
  assert.equal(reconciled[0], current[0]);
  assert.equal(reconciled[1], current[1]);
});

test('message reconciliation replaces only the changed message', () => {
  const current = [message('one'), message('two'), message('three')];
  const next = [
    { ...current[0] },
    { ...current[1], status: 'read' },
    { ...current[2] },
  ];

  const reconciled = preserveUnchangedMessageReferences(current, next, getKey);

  assert.notEqual(reconciled, current);
  assert.equal(reconciled[0], current[0]);
  assert.notEqual(reconciled[1], current[1]);
  assert.equal(reconciled[2], current[2]);
  assert.equal(reconciled[1].status, 'read');
});

test('message reconciliation preserves stable rows when the list grows', () => {
  const current = [message('one'), message('two')];
  const next = [{ ...current[0] }, { ...current[1] }, message('three')];

  const reconciled = preserveUnchangedMessageReferences(current, next, getKey);

  assert.equal(reconciled[0], current[0]);
  assert.equal(reconciled[1], current[1]);
  assert.equal(reconciled[2].id, 'three');
});

test('canonical attachment finalization replaces a partial realtime image row', () => {
  const partial = {
    ...message('image-one', 'delivered'),
    type: 'image',
    text: '',
    storagePath: null,
    mediaItems: [],
    mediaExpectedCount: 1,
  };
  const finalized = {
    ...partial,
    storagePath: 'sender/receiver/client/attachment-image.jpg',
    mediaItems: [
      {
        attachmentId: 'attachment-one',
        index: 0,
        type: 'image',
        storagePath: 'sender/receiver/client/attachment-image.jpg',
        mimeType: 'image/jpeg',
        width: 1200,
        height: 1600,
        byteSize: 245000,
      },
    ],
  };

  const reconciled = preserveUnchangedMessageReferences(
    [partial],
    [finalized],
    getChatMessageRevisionKey,
  );

  assert.notEqual(reconciled[0], partial);
  assert.equal(reconciled[0].storagePath, finalized.storagePath);
  assert.equal(reconciled[0].mediaItems[0].attachmentId, 'attachment-one');
});

test('identical finalized attachment metadata preserves the rendered row reference', () => {
  const finalized = {
    ...message('image-two', 'delivered'),
    type: 'image',
    text: '',
    storagePath: 'sender/receiver/client/attachment-image.jpg',
    mediaExpectedCount: 1,
    mediaItems: [
      {
        attachmentId: 'attachment-two',
        index: 0,
        type: 'image',
        storagePath: 'sender/receiver/client/attachment-image.jpg',
        width: 900,
        height: 900,
      },
    ],
  };

  const reconciled = preserveUnchangedMessageReferences(
    [finalized],
    [{ ...finalized, mediaItems: finalized.mediaItems.map((item) => ({ ...item })) }],
    getChatMessageRevisionKey,
  );

  assert.equal(reconciled[0], finalized);
});
