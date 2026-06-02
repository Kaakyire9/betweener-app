// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addPinnedMessageId,
  applyDeleteMessageForEveryone,
  applyLocalReactionToggle,
  applyOptimisticMessageEdit,
  reconcileEditedMessage,
  removePinnedMessageId,
  restoreMessageReactions,
} from '../lib/chat/message-actions.ts';
import { resolveChatListPreview } from '../lib/chat/chat-list-preview.ts';

const baseMessage = {
  id: 'msg-1',
  text: 'Hello',
  senderId: 'user-a',
  timestamp: new Date('2026-05-22T08:00:00.000Z'),
  type: 'text',
  reactions: [],
};

test('applyDeleteMessageForEveryone clears rich content and reactions', () => {
  const deletedAt = new Date('2026-05-22T10:00:00.000Z');
  const next = applyDeleteMessageForEveryone({
    items: [
      {
        ...baseMessage,
        id: 'rich-1',
        type: 'image',
        imageUrl: 'https://cdn/image.jpg',
        reactions: [{ userId: 'peer', emoji: '🔥' }],
      },
    ],
    messageId: 'rich-1',
    deletedAt,
    deletedBy: 'user-a',
  });

  assert.equal(next[0].type, 'text');
  assert.equal(next[0].text, 'Message deleted');
  assert.equal(next[0].deletedForAll, true);
  assert.equal(next[0].deletedAt, deletedAt);
  assert.equal(next[0].deletedBy, 'user-a');
  assert.equal(next[0].imageUrl, undefined);
  assert.deepEqual(next[0].reactions, []);
});

test('applyOptimisticMessageEdit and reconcileEditedMessage preserve edit lifecycle', () => {
  const optimisticEditedAt = new Date('2026-05-22T10:05:00.000Z');
  const optimistic = applyOptimisticMessageEdit({
    items: [{ ...baseMessage, id: 'edit-1' }],
    messageId: 'edit-1',
    text: 'Edited locally',
    editedAt: optimisticEditedAt,
  });

  assert.equal(optimistic[0].text, 'Edited locally');
  assert.equal(optimistic[0].editedAt, optimisticEditedAt);

  const reconciled = reconcileEditedMessage({
    items: optimistic,
    messageId: 'edit-1',
    text: 'Edited on server',
    editedAt: null,
  });

  assert.equal(reconciled[0].text, 'Edited on server');
  assert.equal(reconciled[0].editedAt, optimisticEditedAt);
});

test('applyLocalReactionToggle adds, swaps, and removes my reaction', () => {
  const initial = [
    {
      ...baseMessage,
      id: 'react-1',
      reactions: [{ userId: 'peer', emoji: '❤️' }],
    },
  ];

  const added = applyLocalReactionToggle({
    items: initial,
    messageId: 'react-1',
    userId: 'me',
    emoji: '🔥',
  });
  assert.equal(added.shouldRemove, false);
  assert.deepEqual(added.previousReactions, initial[0].reactions);
  assert.deepEqual(added.items[0].reactions, [
    { userId: 'peer', emoji: '❤️' },
    { userId: 'me', emoji: '🔥' },
  ]);

  const swapped = applyLocalReactionToggle({
    items: added.items,
    messageId: 'react-1',
    userId: 'me',
    emoji: '😂',
  });
  assert.equal(swapped.shouldRemove, false);
  assert.deepEqual(swapped.items[0].reactions, [
    { userId: 'peer', emoji: '❤️' },
    { userId: 'me', emoji: '😂' },
  ]);

  const removed = applyLocalReactionToggle({
    items: swapped.items,
    messageId: 'react-1',
    userId: 'me',
    emoji: '😂',
  });
  assert.equal(removed.shouldRemove, true);
  assert.deepEqual(removed.items[0].reactions, [
    { userId: 'peer', emoji: '❤️' },
  ]);
});

test('restoreMessageReactions reverts failed reaction mutations', () => {
  const previousReactions = [{ userId: 'peer', emoji: '❤️' }];
  const next = restoreMessageReactions({
    items: [
      {
        ...baseMessage,
        id: 'react-2',
        reactions: [{ userId: 'peer', emoji: '❤️' }, { userId: 'me', emoji: '🔥' }],
      },
    ],
    messageId: 'react-2',
    reactions: previousReactions,
  });

  assert.deepEqual(next[0].reactions, previousReactions);
});

test('addPinnedMessageId and removePinnedMessageId manage unique pin ids', () => {
  const added = addPinnedMessageId(['a', 'b'], 'b');
  assert.deepEqual(added, ['a', 'b']);

  const addedNew = addPinnedMessageId(['a', 'b'], 'c');
  assert.deepEqual(addedNew, ['a', 'b', 'c']);

  const removed = removePinnedMessageId(['a', 'b', 'c'], 'b');
  assert.deepEqual(removed, ['a', 'c']);
});

test('chat list preview shows an edit when it is newer than the latest reaction', () => {
  const preview = resolveChatListPreview({
    messagePreview: 'Updated text',
    editedAt: new Date('2026-06-01T10:01:00.000Z'),
    reactionPreview: {
      text: 'Jennifer reacted heart to message',
      createdAt: new Date('2026-06-01T10:00:00.000Z'),
    },
    isTyping: false,
  });

  assert.equal(preview.previewText, 'Edited: Updated text');
  assert.equal(preview.visibleReactionPreview, null);
});

test('chat list preview shows a reaction when it is newer than the latest edit', () => {
  const preview = resolveChatListPreview({
    messagePreview: 'Updated text',
    editedAt: new Date('2026-06-01T10:00:00.000Z'),
    reactionPreview: {
      text: 'Jennifer reacted heart to message',
      createdAt: new Date('2026-06-01T10:01:00.000Z'),
    },
    isTyping: false,
  });

  assert.equal(preview.previewText, 'Jennifer reacted heart to message');
  assert.equal(preview.visibleReactionPreview, 'Jennifer reacted heart to message');
});
