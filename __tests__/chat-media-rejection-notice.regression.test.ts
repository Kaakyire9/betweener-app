import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { isChatMediaModerationRejection } from '../lib/chat/attachments/chat-attachment-error.ts';
import {
  publishChatMediaRejectionNotice,
  subscribeChatMediaRejectionNotices,
} from '../lib/chat/moderation/chat-media-rejection-notice.ts';

test('only conclusive media decisions classify as moderation rejection', () => {
  assert.equal(isChatMediaModerationRejection('image_content_not_allowed'), true);
  assert.equal(isChatMediaModerationRejection('image_review_required'), true);
  assert.equal(isChatMediaModerationRejection('image_moderation_unavailable'), false);
  assert.equal(isChatMediaModerationRejection('encrypted_image_moderation_unavailable'), false);
  assert.equal(isChatMediaModerationRejection('network request failed'), false);
});

test('rejection notices are transient events and are never replayed', () => {
  const received: string[] = [];
  const unsubscribe = subscribeChatMediaRejectionNotices((notice) => received.push(notice.localMessageId));
  publishChatMediaRejectionNotice({
    ownerUserId: 'sender',
    threadId: 'recipient',
    localMessageId: 'temp-image-one',
    attachmentType: 'image',
    reasonCategory: 'MEDIA_POLICY_REJECTED',
    viewOnce: false,
  });
  unsubscribe();
  publishChatMediaRejectionNotice({
    ownerUserId: 'sender',
    threadId: 'recipient',
    localMessageId: 'temp-image-two',
    attachmentType: 'image',
    reasonCategory: 'MEDIA_POLICY_REJECTED',
    viewOnce: true,
  });
  assert.deepEqual(received, ['temp-image-one']);
});

test('terminal rejection is removed from durable chat state before the UI event', () => {
  const outbox = readFileSync('lib/chat/outbox/chat-outbox-service.ts', 'utf8');
  const repository = readFileSync('lib/chat/local/chat-repository.ts', 'utf8');
  const discardStart = outbox.indexOf('const discardModerationRejectedOutboxItem');
  const discardEnd = outbox.indexOf('const assertOutboxNotCancelled', discardStart);
  const discardImplementation = outbox.slice(discardStart, discardEnd);

  assert.ok(discardImplementation.indexOf('discardRejectedOutboxMessage') >= 0);
  assert.ok(
    discardImplementation.indexOf('discardRejectedOutboxMessage') <
      discardImplementation.indexOf('publishChatMediaRejectionNotice'),
  );
  assert.match(repository, /discardRejectedOutboxMessage[\s\S]*status = 'cancelled'/);
  assert.match(repository, /discardRejectedOutboxMessage[\s\S]*delete from chat_messages/);
  assert.match(repository, /discardRejectedOutboxMessage[\s\S]*refreshThreadSummaryFromMessages/);
});

test('normal and view-once moderation rejections converge on sender-only transient feedback', () => {
  const outbox = readFileSync('lib/chat/outbox/chat-outbox-service.ts', 'utf8');
  const screen = readFileSync('components/chat/ChatScreen.tsx', 'utf8');

  assert.match(outbox, /getModerationRejectionError\(error\)[\s\S]*discardModerationRejectedOutboxItem/);
  assert.match(outbox, /purgeLegacyModerationRejectedItems/);
  assert.match(screen, /moderateEncryptAndSendViewOnceImage[\s\S]*publishChatMediaRejectionNotice/);
  assert.match(screen, /subscribeChatMediaRejectionNotices[\s\S]*setMessages/);
  assert.match(screen, /isChatMediaModerationRejection\(message\.sendErrorCode\)/);
});
