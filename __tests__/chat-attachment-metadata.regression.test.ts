import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeAttachmentDurationMs,
  resolveAuthoritativeAttachmentByteSize,
} from '../lib/chat/attachments/chat-attachment-metadata.ts';

test('uses the staged file size after video optimization', () => {
  assert.equal(
    resolveAuthoritativeAttachmentByteSize({
      localFileInfo: { exists: true, size: 4_200_000 },
      declaredByteSize: 18_750_000,
    }),
    4_200_000,
  );
});

test('falls back to picker metadata only when the staged size is unavailable', () => {
  assert.equal(
    resolveAuthoritativeAttachmentByteSize({
      localFileInfo: { exists: false },
      declaredByteSize: 18_750_000,
    }),
    18_750_000,
  );
});

test('does not submit invalid attachment sizes', () => {
  assert.equal(
    resolveAuthoritativeAttachmentByteSize({
      localFileInfo: { exists: true, size: 0 },
      declaredByteSize: Number.NaN,
    }),
    null,
  );
});

test('rounds fractional iOS video duration metadata for the integer RPC contract', () => {
  assert.equal(normalizeAttachmentDurationMs(27_956.666666666668), 27_957);
  assert.equal(normalizeAttachmentDurationMs(Number.NaN), null);
  assert.equal(normalizeAttachmentDurationMs(0), null);
});
