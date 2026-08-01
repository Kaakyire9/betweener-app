import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertChatAttachmentTransition,
  canTransitionChatAttachment,
} from '../lib/chat/attachments/chat-attachment-state.ts';
import { buildScopedOfflineCacheKey } from '../lib/offline/cache-key.ts';

test('attachment lifecycle permits retry and successful publication', () => {
  assert.equal(canTransitionChatAttachment('queued', 'uploading'), true);
  assert.equal(canTransitionChatAttachment('uploading', 'uploaded'), true);
  assert.equal(canTransitionChatAttachment('uploaded', 'validating'), true);
  assert.equal(canTransitionChatAttachment('validating', 'ready'), true);
  assert.equal(canTransitionChatAttachment('failed', 'queued'), true);
});

test('attachment lifecycle rejects resurrection and skipped validation', () => {
  assert.equal(canTransitionChatAttachment('deleted', 'ready'), false);
  assert.equal(canTransitionChatAttachment('cancelled', 'uploading'), false);
  assert.equal(canTransitionChatAttachment('uploaded', 'ready'), false);
  assert.throws(
    () => assertChatAttachmentTransition('ready', 'uploading'),
    /invalid_chat_attachment_transition:ready:uploading/,
  );
});

test('attachment lifecycle treats duplicate transitions as idempotent', () => {
  assert.equal(canTransitionChatAttachment('ready', 'ready'), true);
  assert.doesNotThrow(() => assertChatAttachmentTransition('failed', 'failed'));
});

test('offline attachment keys are isolated by account and cannot be double-scoped', () => {
  const firstAccount = buildScopedOfflineCacheKey('user-a', 'image:private/path.jpg');
  const secondAccount = buildScopedOfflineCacheKey('user-b', 'image:private/path.jpg');

  assert.notEqual(firstAccount, secondAccount);
  assert.equal(firstAccount, 'owner/user-a/image:private/path.jpg');
  assert.equal(buildScopedOfflineCacheKey('user-a', firstAccount), firstAccount);
});
