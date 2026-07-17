// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendMessage,
  applySyncedOutgoingReceiptState,
  markAllOutgoingMessagesDelivered,
  markIncomingMessageRead,
  markOutgoingMessageDelivered,
  mergeMessageWithMonotonicReceipt,
  reconcileMessageWithServer,
  removeMessageById,
  replaceMessageById,
  setMessageStatus,
} from '../lib/chat/message-state.ts';

const baseMessage = {
  id: 'msg-1',
  text: 'Hello',
  senderId: 'user-a',
  timestamp: new Date('2026-05-22T08:00:00.000Z'),
  type: 'text',
  reactions: [],
};

test('appendMessage and removeMessageById manage optimistic list edges', () => {
  const appended = appendMessage([], { ...baseMessage, status: 'sending' });
  assert.equal(appended.length, 1);
  assert.equal(appended[0].id, 'msg-1');

  const removed = removeMessageById(appended, 'msg-1');
  assert.deepEqual(removed, []);
});

test('replaceMessageById and setMessageStatus preserve untouched items', () => {
  const items = [
    { ...baseMessage, id: 'a', status: 'sending' },
    { ...baseMessage, id: 'b', senderId: 'user-b', status: 'sent' },
  ];

  const replaced = replaceMessageById(items, 'a', {
    ...baseMessage,
    id: 'a',
    text: 'Server copy',
    status: 'sent',
  });
  assert.equal(replaced[0].text, 'Server copy');
  assert.equal(replaced[1], items[1]);

  const queued = setMessageStatus(replaced, 'a', 'queued');
  assert.equal(queued[0].status, 'queued');
  assert.equal(queued[1], replaced[1]);
});

test('reconcileMessageWithServer keeps local reply metadata when server copy lacks it', () => {
  const items = [
    {
      ...baseMessage,
      id: 'temp-1',
      status: 'sending',
      replyToId: 'reply-1',
      replyTo: { ...baseMessage, id: 'reply-1', text: 'Earlier' },
    },
  ];

  const reconciled = reconcileMessageWithServer({
    items,
    messageId: 'temp-1',
    serverMessage: {
      ...baseMessage,
      id: 'server-1',
      text: 'Delivered',
      status: 'sent',
    },
  });

  assert.equal(reconciled[0].id, 'server-1');
  assert.equal(reconciled[0].replyToId, 'reply-1');
  assert.equal(reconciled[0].replyTo?.text, 'Earlier');
});

test('server and cache snapshots cannot downgrade delivered or read receipts', () => {
  const delivered = mergeMessageWithMonotonicReceipt(
    { ...baseMessage, status: 'delivered' },
    { ...baseMessage, status: 'sent', text: 'Server copy' },
  );
  assert.equal(delivered.status, 'delivered');
  assert.equal(delivered.text, 'Server copy');

  const readAt = new Date('2026-05-22T09:10:00.000Z');
  const read = mergeMessageWithMonotonicReceipt(
    { ...baseMessage, status: 'read', readAt },
    { ...baseMessage, status: 'delivered' },
  );
  assert.equal(read.status, 'read');
  assert.equal(read.readAt, readAt);
});

test('reconcileMessageWithServer preserves a more advanced local receipt', () => {
  const reconciled = reconcileMessageWithServer({
    items: [{ ...baseMessage, status: 'delivered' }],
    messageId: baseMessage.id,
    serverMessage: { ...baseMessage, status: 'sent' },
  });

  assert.equal(reconciled[0].status, 'delivered');
});

test('markIncomingMessageRead only updates unread incoming messages', () => {
  const readAt = new Date('2026-05-22T09:00:00.000Z');
  const items = [
    { ...baseMessage, id: 'mine', senderId: 'me', status: 'sent' },
    { ...baseMessage, id: 'incoming', senderId: 'peer', status: 'delivered' },
  ];

  const next = markIncomingMessageRead({
    items,
    messageId: 'incoming',
    currentUserId: 'me',
    readAt,
  });

  assert.equal(next[0].status, 'sent');
  assert.equal(next[1].status, 'read');
  assert.equal(next[1].readAt, readAt);
});

test('markOutgoingMessageDelivered and markAllOutgoingMessagesDelivered respect terminal states', () => {
  const items = [
    { ...baseMessage, id: 'a', senderId: 'me', status: 'sending' },
    { ...baseMessage, id: 'b', senderId: 'me', status: 'failed' },
    { ...baseMessage, id: 'c', senderId: 'peer', status: 'sent' },
  ];

  const one = markOutgoingMessageDelivered({
    items,
    messageId: 'a',
    currentUserId: 'me',
  });
  assert.equal(one[0].status, 'delivered');
  assert.equal(one[1].status, 'failed');

  const all = markAllOutgoingMessagesDelivered({
    items,
    currentUserId: 'me',
  });
  assert.equal(all[0].status, 'delivered');
  assert.equal(all[1].status, 'failed');
  assert.equal(all[2].status, 'sent');
});

test('applySyncedOutgoingReceiptState resolves sent, delivered, and read states correctly', () => {
  const items = [
    { ...baseMessage, id: 'msg-sync', senderId: 'me', status: 'queued' },
  ];

  const sent = applySyncedOutgoingReceiptState({
    items,
    messageId: 'msg-sync',
    currentUserId: 'me',
    isRead: false,
    deliveredAt: null,
  });
  assert.equal(sent.resolvedStatus, 'sent');
  assert.equal(sent.items[0].status, 'sent');

  const delivered = applySyncedOutgoingReceiptState({
    items: sent.items,
    messageId: 'msg-sync',
    currentUserId: 'me',
    isRead: false,
    deliveredAt: '2026-05-22T09:05:00.000Z',
  });
  assert.equal(delivered.resolvedStatus, 'delivered');
  assert.equal(delivered.items[0].status, 'delivered');

  const readAt = new Date('2026-05-22T09:06:00.000Z');
  const read = applySyncedOutgoingReceiptState({
    items: delivered.items,
    messageId: 'msg-sync',
    currentUserId: 'me',
    isRead: true,
    deliveredAt: '2026-05-22T09:05:00.000Z',
    readAt,
  });
  assert.equal(read.resolvedStatus, 'read');
  assert.equal(read.items[0].status, 'read');
  assert.equal(read.items[0].readAt, readAt);
});

test('applySyncedOutgoingReceiptState keeps optimistic delivered while the server receipt catches up', () => {
  const items = [
    { ...baseMessage, id: 'msg-optimistic', senderId: 'me', status: 'delivered' },
  ];

  const reconciled = applySyncedOutgoingReceiptState({
    items,
    messageId: 'msg-optimistic',
    currentUserId: 'me',
    isRead: false,
    deliveredAt: null,
  });

  assert.equal(reconciled.resolvedStatus, 'delivered');
  assert.equal(reconciled.items[0].status, 'delivered');
});

test('applySyncedOutgoingReceiptState keeps failed messages failed when server has no receipt yet', () => {
  const items = [
    { ...baseMessage, id: 'msg-failed', senderId: 'me', status: 'failed' },
  ];

  const reconciled = applySyncedOutgoingReceiptState({
    items,
    messageId: 'msg-failed',
    currentUserId: 'me',
    isRead: false,
    deliveredAt: null,
  });

  assert.equal(reconciled.resolvedStatus, 'failed');
  assert.equal(reconciled.items[0].status, 'failed');
});
