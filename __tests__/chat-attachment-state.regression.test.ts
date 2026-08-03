import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertChatAttachmentTransition,
  canTransitionChatAttachment,
} from '../lib/chat/attachments/chat-attachment-state.ts';
import { buildScopedOfflineCacheKey } from '../lib/offline/cache-key.ts';
import {
  getChatLifecycleDefinition,
  getInitialChatLifecycleState,
  transitionChatLifecycle,
  type ChatLifecycleMachine,
} from '../lib/chat/lifecycle/chat-lifecycle-state-machine.ts';

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

const lifecycleMachines: ChatLifecycleMachine[] = [
  'outgoing_message', 'outgoing_attachment', 'incoming_cache', 'view_once', 'album',
];

test('all declared lifecycle transitions are executable, timestamped, and duplicate-safe', () => {
  const now = new Date('2026-08-02T12:00:00.000Z');
  lifecycleMachines.forEach((machine) => {
    const definition = getChatLifecycleDefinition(machine);
    Object.entries(definition.transitions).forEach(([currentState, events]) => {
      Object.entries(events).forEach(([event, expectedState]) => {
        const result = transitionChatLifecycle({
          machine,
          currentState: currentState as never,
          event: event as never,
          now,
        });
        assert.equal(result.to, expectedState);
        assert.equal(result.occurredAt, now.toISOString());
        assert.equal(result.idempotent, currentState === expectedState);
        const replay = transitionChatLifecycle({
          machine,
          currentState: result.to as never,
          event: event as never,
          now,
        });
        assert.equal(replay.to, result.to);
        assert.equal(replay.idempotent, true);
      });
    });
  });
});

test('lifecycle machines reject invalid regressions and out-of-order events', () => {
  const invalidInitialEvents = {
    outgoing_message: 'read_confirmed',
    outgoing_attachment: 'finalize_succeeded',
    incoming_cache: 'download_succeeded',
    view_once: 'open_completed',
    album: 'finalize_succeeded',
  } as const;
  lifecycleMachines.forEach((machine) => {
    assert.throws(() => transitionChatLifecycle({
      machine,
      currentState: getInitialChatLifecycleState(machine) as never,
      event: invalidInitialEvents[machine],
    }));
  });
  assert.throws(() => transitionChatLifecycle({
    machine: 'outgoing_attachment', currentState: 'sent', event: 'upload_started',
  }));
  assert.throws(() => transitionChatLifecycle({
    machine: 'outgoing_message', currentState: 'read', event: 'delivery_confirmed',
  }));
  assert.throws(() => transitionChatLifecycle({
    machine: 'view_once', currentState: 'consumed', event: 'open_started',
  }));
});

test('lost finalisation responses replay idempotently without resurrecting uploads', () => {
  const committed = transitionChatLifecycle({
    machine: 'album', currentState: 'finalizing', event: 'finalize_succeeded',
  });
  const replay = transitionChatLifecycle({
    machine: 'album', currentState: committed.to, event: 'finalize_succeeded',
  });
  assert.equal(replay.to, 'sent');
  assert.equal(replay.idempotent, true);
});
