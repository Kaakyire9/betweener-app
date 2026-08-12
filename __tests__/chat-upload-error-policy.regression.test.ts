import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAttachmentUploadErrorMessage,
  isRetryableUploadError,
} from '../lib/chat/attachments/upload-error-policy.ts';

test('queues only transient upload failures for retry', () => {
  assert.equal(isRetryableUploadError({ status: 503 }), true);
  assert.equal(isRetryableUploadError(new Error('network timeout')), true);
  assert.equal(isRetryableUploadError({ status: 413 }), false);
});

test('provides actionable attachment failure copy', () => {
  assert.match(getAttachmentUploadErrorMessage(new Error('payload too large')), /too large/i);
  assert.match(getAttachmentUploadErrorMessage(new Error('network timeout')), /timed out/i);
});
