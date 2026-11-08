import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatChatRestrictionExpiry,
  getChatGuardFailurePresentation,
} from '../lib/chat/moderation/chat-guard-error-presentation.ts';

test('describes an actor restriction without blaming the current message', () => {
  const presentation = getChatGuardFailurePresentation({
    action: 'retry',
    code: 'MESSAGING_TEMPORARILY_RESTRICTED',
  });

  assert.equal(presentation.title, 'Messaging temporarily paused');
  assert.match(presentation.message, /account is temporarily unable to send messages/i);
  assert.doesNotMatch(presentation.message, /remove solicitation|unsafe content/i);
});

test('includes a valid restriction expiry in member-facing copy', () => {
  const restrictedUntil = '2026-09-23T17:30:00.000Z';
  const presentation = getChatGuardFailurePresentation({
    code: 'MESSAGING_TEMPORARILY_RESTRICTED',
    restrictedUntil,
  });

  assert.ok(formatChatRestrictionExpiry(restrictedUntil, 'en-GB'));
  assert.match(presentation.message, /You can message again after/);
});

test('keeps content-specific guidance for actual message rejections', () => {
  const presentation = getChatGuardFailurePresentation({
    code: 'MESSAGE_CONTENT_NOT_ALLOWED',
  });

  assert.equal(presentation.title, 'Message not sent');
  assert.match(presentation.message, /remove solicitation/i);
});
