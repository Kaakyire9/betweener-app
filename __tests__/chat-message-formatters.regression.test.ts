import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatFileSize,
  formatIntentExpiresIn,
  formatIntentTypeLabel,
  formatRemainingTime,
  getFileTypeLabel,
} from '../lib/chat/ui/message-formatters.ts';

test('formats common chat attachment and live-location display values', () => {
  assert.equal(formatFileSize(1536), '1.5 KB');
  assert.equal(getFileTypeLabel('application/pdf', 'ignored.bin'), 'PDF');
  assert.equal(formatRemainingTime(new Date(60_000), 0), 'Ends in 1 min');
});

test('formats intent card labels and expiry against a supplied clock', () => {
  assert.equal(formatIntentTypeLabel('date_request'), 'Date request');
  assert.equal(formatIntentTypeLabel('unexpected'), 'Request');
  assert.equal(formatIntentExpiresIn('2026-07-24T14:00:00.000Z', Date.parse('2026-07-24T12:01:00.000Z')), '2h');
});
