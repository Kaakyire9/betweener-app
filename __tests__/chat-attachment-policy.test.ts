import { CHAT_ATTACHMENT_LIMITS, validateChatAttachment } from '@/lib/chat/attachment-policy';
import { describe, expect, it } from '@jest/globals';

describe('chat attachment policy', () => {
  it('accepts supported files within the safe limits', () => {
    expect(validateChatAttachment({ kind: 'image', sizeBytes: 2_000_000, mimeType: 'image/jpeg' })).toBeNull();
    expect(validateChatAttachment({ kind: 'video', sizeBytes: 12_000_000, durationMs: 45_000 })).toBeNull();
    expect(validateChatAttachment({ kind: 'document', fileName: 'plans.pdf', mimeType: 'application/pdf', sizeBytes: 500_000 })).toBeNull();
  });

  it('rejects oversized or long media', () => {
    expect(validateChatAttachment({ kind: 'image', sizeBytes: CHAT_ATTACHMENT_LIMITS.imageBytes + 1 })).toContain('15 MB');
    expect(validateChatAttachment({ kind: 'video', sizeBytes: CHAT_ATTACHMENT_LIMITS.videoBytes + 1 })).toContain('100 MB');
    expect(validateChatAttachment({ kind: 'video', durationMs: CHAT_ATTACHMENT_LIMITS.videoDurationMs + 1 })).toContain('2 minutes');
  });

  it('rejects executable and unknown documents', () => {
    expect(validateChatAttachment({ kind: 'document', fileName: 'installer.exe', mimeType: 'application/octet-stream' })).toContain('For safety');
  });
});
