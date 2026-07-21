import * as Crypto from 'expo-crypto';

import { supabase } from '@/lib/supabase';

export type ChatAttachmentKind = 'image' | 'video' | 'document' | 'audio';

export type ChatAttachmentFinalizeInput = {
  receiverId: string;
  clientMessageId: string;
  attachmentId: string;
  attachmentType: ChatAttachmentKind;
  bucketId: 'chat-media' | 'voice-messages';
  storagePath: string;
  originalName?: string | null;
  mimeType: string;
  byteSize?: number | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  caption?: string | null;
  replyToMessageId?: string | null;
  sha256?: string | null;
  isViewOnce?: boolean;
  encryptedKeySender?: string | null;
  encryptedKeyReceiver?: string | null;
  encryptedKeyNonce?: string | null;
  encryptedMediaNonce?: string | null;
  encryptedMediaAlg?: 'nacl-secretbox' | null;
  senderPublicKey?: string | null;
  waveform?: number[] | null;
};

const SAFE_EXTENSION = /^[a-z0-9]{1,8}$/;

export const createChatAttachmentId = () => Crypto.randomUUID();

/**
 * Gives pre-attachment-lifecycle outbox rows a stable UUID across retries.
 * New rows persist a random UUID when they are queued; this is only a
 * backwards-compatible bridge for rows created by older app versions.
 */
export const createLegacyChatAttachmentId = async (seed: string) => {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `betweener-chat-attachment:${seed}`,
  );
  const hex = digest.slice(0, 32).toLowerCase().split('');
  hex[12] = '5';
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4];
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
};

export const getSafeAttachmentExtension = (fileName: string, mimeType?: string | null) => {
  const candidate = fileName.split('.').pop()?.trim().toLowerCase() ?? '';
  if (SAFE_EXTENSION.test(candidate)) return candidate;
  if (mimeType?.startsWith('image/')) return mimeType.includes('png') ? 'png' : 'jpg';
  if (mimeType?.startsWith('video/')) return mimeType.includes('quicktime') ? 'mov' : 'mp4';
  if (mimeType?.startsWith('audio/')) return 'm4a';
  return 'bin';
};

export const buildDeterministicChatAttachmentPath = (args: {
  senderId: string;
  receiverId: string;
  clientMessageId: string;
  attachmentId: string;
  fileName: string;
  mimeType?: string | null;
}) => {
  const extension = getSafeAttachmentExtension(args.fileName, args.mimeType);
  return `${args.senderId}/${args.receiverId}/${args.clientMessageId}/${args.attachmentId}-attachment.${extension}`;
};

export const finalizeChatAttachment = async (input: ChatAttachmentFinalizeInput) => {
  console.log('[chat][attachment-finalize] invoke:start', {
    receiverId: input.receiverId,
    clientMessageId: input.clientMessageId,
    attachmentId: input.attachmentId,
    attachmentType: input.attachmentType,
    bucketId: input.bucketId,
    storagePath: input.storagePath,
    mimeType: input.mimeType,
    byteSize: input.byteSize ?? null,
    isViewOnce: input.isViewOnce === true,
    hasSenderPublicKey: Boolean(input.senderPublicKey),
  });
  const { data, error } = await supabase.functions.invoke('chat-attachment-finalize', {
    body: input,
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context && typeof context.clone === 'function') {
      let errorCode: string | null = null;
      try {
        const detail = await context.clone().json() as { error?: string };
        errorCode = detail?.error ?? null;
      } catch {}
      if (errorCode) {
        console.log('[chat][attachment-finalize] invoke:error-code', {
          clientMessageId: input.clientMessageId,
          attachmentId: input.attachmentId,
          errorCode,
        });
        const finalizationError = new Error(errorCode);
        (finalizationError as Error & { code?: string }).code = errorCode;
        throw finalizationError;
      }
    }
    console.log('[chat][attachment-finalize] invoke:error', {
      clientMessageId: input.clientMessageId,
      attachmentId: input.attachmentId,
      message: (error as { message?: string })?.message ?? String(error),
    });
    throw error;
  }
  const message = (data as { message?: unknown } | null)?.message;
  if (!message) throw new Error('attachment_finalize_missing_message');
  console.log('[chat][attachment-finalize] invoke:success', {
    clientMessageId: input.clientMessageId,
    attachmentId: input.attachmentId,
    messageId: (message as { id?: string })?.id ?? null,
  });
  return message;
};

const extractInvokeErrorCode = async (error: unknown) => {
  const context = (error as { context?: Response }).context;
  if (context && typeof context.clone === 'function') {
    try {
      const detail = await context.clone().json() as { error?: string };
      return detail?.error ?? null;
    } catch {}
  }
  return null;
};

export const prepareViewOnceAttachment = async (messageId: string) => {
  console.log('[chat][view-once-prepare] invoke:start', { messageId });
  const { data, error } = await supabase.functions.invoke('chat-attachment-consume', {
    body: { messageId, mode: 'prepare' },
  });
  if (error) {
    const errorCode = await extractInvokeErrorCode(error);
    if (errorCode) {
      console.log('[chat][view-once-prepare] invoke:error-code', {
        messageId,
        errorCode,
      });
      const consumeError = new Error(errorCode);
      (consumeError as Error & { code?: string }).code = errorCode;
      throw consumeError;
    }
    console.log('[chat][view-once-prepare] invoke:error', {
      messageId,
      message: (error as { message?: string })?.message ?? String(error),
    });
    throw error;
  }
  console.log('[chat][view-once-prepare] invoke:success', {
    messageId,
    attachmentId: (data as { attachmentId?: string } | null)?.attachmentId ?? null,
    attachmentType: (data as { attachmentType?: string } | null)?.attachmentType ?? null,
    mimeType: (data as { mimeType?: string } | null)?.mimeType ?? null,
  });
  return data as {
    attachmentId: string;
    signedUrl: string;
    attachmentType: 'image' | 'video';
    mimeType: string;
    byteSize: number | null;
    encryptedKeyReceiver: string;
    encryptedKeyNonce: string;
    encryptedMediaNonce: string;
    encryptedMediaAlg: 'nacl-secretbox';
    senderPublicKey: string;
  };
};

export const completeViewOnceAttachment = async (messageId: string) => {
  console.log('[chat][view-once-complete] invoke:start', { messageId });
  const { data, error } = await supabase.functions.invoke('chat-attachment-consume', {
    body: { messageId, mode: 'complete' },
  });
  if (error) {
    const errorCode = await extractInvokeErrorCode(error);
    if (errorCode) {
      console.log('[chat][view-once-complete] invoke:error-code', {
        messageId,
        errorCode,
      });
      const completeError = new Error(errorCode);
      (completeError as Error & { code?: string }).code = errorCode;
      throw completeError;
    }
    console.log('[chat][view-once-complete] invoke:error', {
      messageId,
      message: (error as { message?: string })?.message ?? String(error),
    });
    throw error;
  }
  console.log('[chat][view-once-complete] invoke:success', {
    messageId,
    attachmentId: (data as { attachmentId?: string } | null)?.attachmentId ?? null,
  });
  return data as {
    attachmentId: string;
    consumedAt: string | null;
  };
};

export const consumeViewOnceAttachment = prepareViewOnceAttachment;
