import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  buildDeterministicChatAttachmentPath,
  consumeViewOnceAttachment,
  finalizeChatAttachment,
} from '@/lib/chat/attachment-lifecycle';

jest.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

const mockInvoke = (jest.requireMock('@/lib/supabase') as {
  supabase: { functions: { invoke: jest.Mock } };
}).supabase.functions.invoke as unknown as jest.MockedFunction<
  (...args: unknown[]) => Promise<{ data: unknown; error: unknown }>
>;

describe('chat attachment lifecycle', () => {
  beforeEach(() => mockInvoke.mockReset());

  it('uses one retry-stable path scoped to both participants and the client message', () => {
    const input = {
      senderId: 'sender-id',
      receiverId: 'receiver-id',
      clientMessageId: 'temp-video-123',
      attachmentId: 'attachment-id',
      fileName: 'Holiday Clip.MP4',
      mimeType: 'video/mp4',
    };
    expect(buildDeterministicChatAttachmentPath(input)).toBe(
      'sender-id/receiver-id/temp-video-123/attachment-id-attachment.mp4',
    );
    expect(buildDeterministicChatAttachmentPath(input)).toBe(buildDeterministicChatAttachmentPath(input));
  });

  it('finalizes through the authenticated server boundary', async () => {
    mockInvoke.mockResolvedValue({ data: { message: { id: 'message-id' } }, error: null });
    const input = {
      receiverId: 'receiver-id',
      clientMessageId: 'client-id',
      attachmentId: 'attachment-id',
      attachmentType: 'document' as const,
      bucketId: 'chat-media' as const,
      storagePath: 'sender/receiver/client-id/attachment-id-attachment.pdf',
      originalName: 'document.pdf',
      mimeType: 'application/pdf',
    };
    await expect(finalizeChatAttachment(input)).resolves.toEqual({ id: 'message-id' });
    expect(mockInvoke).toHaveBeenCalledWith('chat-attachment-finalize', { body: input });
  });

  it('preserves the server error code when a view-once claim is rejected', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: {
        context: new Response(JSON.stringify({ error: 'view_once_already_consumed' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }),
      },
    });

    await expect(consumeViewOnceAttachment('message-id')).rejects.toMatchObject({
      code: 'view_once_already_consumed',
      message: 'view_once_already_consumed',
    });
  });

  it('returns the sender key snapshot required to decrypt view-once media reliably', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        attachmentId: 'attachment-id',
        signedUrl: 'https://signed.example/view-once',
        attachmentType: 'image',
        mimeType: 'image/jpeg',
        byteSize: 1234,
        encryptedKeyReceiver: 'receiver-key',
        encryptedKeyNonce: 'nonce',
        encryptedMediaNonce: 'media-nonce',
        encryptedMediaAlg: 'nacl-secretbox',
        senderPublicKey: 'sender-public-key',
      },
      error: null,
    });

    await expect(consumeViewOnceAttachment('message-id')).resolves.toMatchObject({
      senderPublicKey: 'sender-public-key',
    });
  });
});
