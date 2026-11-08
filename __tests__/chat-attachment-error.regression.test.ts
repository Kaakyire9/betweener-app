import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getChatAttachmentFailurePresentation,
  getChatAttachmentRetryLabel,
  isChatMediaProviderUnavailable,
  isTerminalChatAttachmentError,
} from '../lib/chat/attachments/chat-attachment-error.ts';

test('presents moderation rejection as terminal and actionable', () => {
  const failure = getChatAttachmentFailurePresentation('image_content_not_allowed');

  assert.equal(isTerminalChatAttachmentError('image_content_not_allowed'), true);
  assert.equal(failure.retryable, false);
  assert.equal(failure.title, 'Photo not sent');
  assert.match(failure.message, /Choose another photo/);
});

test('keeps temporary moderation failures retryable', () => {
  const failure = getChatAttachmentFailurePresentation('image_moderation_unavailable');

  assert.equal(isTerminalChatAttachmentError('image_moderation_unavailable'), false);
  assert.equal(failure.retryable, true);
  assert.equal(failure.title, 'Couldn’t check this photo');
  assert.equal(failure.message, 'Something interrupted the safety check. Try again.');
  assert.equal(isChatMediaProviderUnavailable('image_moderation_unavailable'), true);
  assert.equal(isChatMediaProviderUnavailable('encrypted_image_moderation_unavailable'), true);
  assert.equal(
    getChatAttachmentRetryLabel('attachment_finalize_http_503'),
    'Safety check delayed · Retrying',
  );
});

test('explains incomplete albums without blaming the network', () => {
  const failure = getChatAttachmentFailurePresentation('album_items_incomplete');

  assert.equal(failure.retryable, true);
  assert.equal(failure.title, 'Album needs attention');
  assert.doesNotMatch(failure.message, /connection/i);
});

test('treats non-retryable HTTP failures as terminal without blocking rate limits', () => {
  assert.equal(isTerminalChatAttachmentError('attachment_finalize_http_422'), true);
  assert.equal(
    getChatAttachmentFailurePresentation('attachment_finalize_http_422').retryable,
    false,
  );
  assert.equal(isTerminalChatAttachmentError('attachment_finalize_http_429'), false);
  assert.equal(isTerminalChatAttachmentError('attachment_finalize_http_503'), false);
});

test('explains staging upload authorization failures without offering a futile retry', () => {
  const failure = getChatAttachmentFailurePresentation('attachment_upload_not_authorized');

  assert.equal(isTerminalChatAttachmentError('attachment_upload_not_authorized'), true);
  assert.equal(failure.retryable, false);
  assert.equal(failure.title, 'Photo upload unavailable');
  assert.match(failure.message, /Sign in again/);
});

test('caption moderation failures explain edit recovery without retrying unchanged content', () => {
  const rejected = getChatAttachmentFailurePresentation('caption_rephrase_required');
  const tooLong = getChatAttachmentFailurePresentation('caption_too_long');

  assert.equal(rejected.retryable, false);
  assert.match(rejected.message, /Edit the album caption/);
  assert.equal(tooLong.retryable, false);
  assert.match(tooLong.message, /2,000/);
});
