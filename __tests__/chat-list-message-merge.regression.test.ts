// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  selectChatListLastMessage,
  selectLatestChatListActivity,
} from '../lib/chat/chat-list-message-merge.ts';

const message = (overrides = {}) => ({
  id: 'message-1',
  text: 'Hello',
  timestamp: new Date('2026-06-12T20:23:00.000Z'),
  isRead: false,
  deliveredAt: null,
  localStatus: 'sent',
  ...overrides,
});

test('newer remote message wins over a stale reacted local summary', () => {
  const remote = message();
  const local = message({
    id: 'older-message',
    text: 'Jennifer reacted heart to message',
    timestamp: new Date('2026-06-12T19:05:00.000Z'),
    reactionPreview: { emoji: 'heart' },
  });

  assert.equal(selectChatListLastMessage(remote, local), remote);
});

test('newer optimistic local message wins while awaiting server hydration', () => {
  const remote = message({
    id: 'older-message',
    timestamp: new Date('2026-06-12T19:05:00.000Z'),
  });
  const local = message({
    id: 'optimistic-message',
    timestamp: new Date('2026-06-12T20:24:00.000Z'),
    localStatus: 'sending',
  });

  assert.equal(selectChatListLastMessage(remote, local), local);
});

test('same message preserves the most advanced local receipt', () => {
  const remote = message({ localStatus: 'sent' });
  const local = message({
    localStatus: 'delivered',
    deliveredAt: new Date('2026-06-12T20:23:04.000Z'),
  });

  const merged = selectChatListLastMessage(remote, local);
  assert.equal(merged.localStatus, 'delivered');
  assert.equal(merged.deliveredAt, local.deliveredAt);
});

test('a new reaction to a previous message becomes latest activity', () => {
  const lastMessage = message();
  const activity = {
    kind: 'reaction',
    messageId: 'older-message',
    createdAt: new Date('2026-06-12T20:24:00.000Z'),
    preview: 'Reacted ❤️ to your message',
  };

  assert.equal(
    selectLatestChatListActivity(lastMessage, [activity]),
    activity,
  );
});

test('historical reactions older than the last message are ignored', () => {
  const lastMessage = message();
  const activity = {
    kind: 'reaction',
    messageId: 'older-message',
    createdAt: new Date('2026-06-12T20:22:00.000Z'),
    preview: 'Reacted ❤️ to your message',
  };

  assert.equal(selectLatestChatListActivity(lastMessage, [activity]), null);
});
