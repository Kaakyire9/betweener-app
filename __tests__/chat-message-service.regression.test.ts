import assert from 'node:assert/strict';
import test from 'node:test';
import { createOptimisticTextMessage } from '../lib/chat/messages/chat-message-service.ts';

test('creates a stable optimistic text message with reply linkage', () => {
  const timestamp = new Date('2026-07-24T12:00:00.000Z');
  const replyTo = { id: 'reply-1' } as any;
  const message = createOptimisticTextMessage({
    text: 'Hello',
    senderId: 'sender-1',
    replyTo,
    now: timestamp,
  });

  assert.equal(message.id, 'temp-1784894400000');
  assert.equal(message.clientMessageId, message.id);
  assert.equal(message.status, 'sending');
  assert.equal(message.replyToId, 'reply-1');
  assert.equal(message.timestamp, timestamp);
});
