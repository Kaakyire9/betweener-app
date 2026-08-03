import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTextRetryPlan,
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

test('keeps network attachment retry failures quiet while surfacing terminal failures', () => {
  assert.equal(shouldShowAttachmentRetryFailure(false), true);
  assert.equal(shouldShowAttachmentRetryFailure(true), false);
});
