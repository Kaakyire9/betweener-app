import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTextRetryPlan,
  getAttachmentRetryStatus,
  shouldShowAttachmentRetryFailure,
} from '../lib/chat/retry/chat-retry-service.ts';

test('keeps an existing client id when retrying a failed text message', () => {
  const plan = createTextRetryPlan({
    message: { id: 'server-1', clientMessageId: 'client-1', type: 'text', status: 'failed' } as any,
    now: 100,
  });

  assert.equal(plan.clientMessageId, 'client-1');
  assert.equal(plan.sendingMessage.status, 'sending');
});

test('derives a durable retry id for a server-owned failed text message', () => {
  const plan = createTextRetryPlan({
    message: { id: 'server-1', type: 'text', status: 'failed' } as any,
    now: 100,
  });

  assert.equal(plan.clientMessageId, 'retry-server-1-100');
});

test('keeps attachment retries queued offline without a terminal failure alert', () => {
  assert.equal(getAttachmentRetryStatus(false), 'queued');
  assert.equal(getAttachmentRetryStatus(true), 'sending');
  assert.equal(shouldShowAttachmentRetryFailure(false), true);
  assert.equal(shouldShowAttachmentRetryFailure(true), false);
});
