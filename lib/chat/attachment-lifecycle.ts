import * as Crypto from 'expo-crypto';

import { supabase } from '@/lib/supabase';
import type { Database } from '@/supabase/types/database';

export type ChatAttachmentKind = 'image' | 'video' | 'document' | 'audio';
export type CanonicalChatAttachmentMessage = Database['public']['Tables']['messages']['Row'];
export const CHAT_ATTACHMENT_GUARD_CONTRACT_V1_2 = '1.2.0';

export type ChatAttachmentFinalizeInput = {
  receiverId: string;
  clientMessageId: string;
  attachmentId: string;
  attachmentType: ChatAttachmentKind;
  bucketId: 'chat-media' | 'voice-messages' | 'chat-attachment-staging-v1-2';
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
  attachmentIndex?: number;
  expectedCount?: number;
  previewStoragePath?: string | null;
  previewMimeType?: string | null;
  previewByteSize?: number | null;
  previewWidth?: number | null;
  previewHeight?: number | null;
};

export type ChatAttachmentBatchFinalizeInput = {
  receiverId: string;
  clientMessageId: string;
  attachmentType: ChatAttachmentKind;
  caption?: string | null;
  replyToMessageId?: string | null;
  attachments: ChatAttachmentFinalizeInput[];
  mediaGroupId?: string | null;
};

export type ChatImageModerationPreflightInput = {
  receiverId: string;
  clientMessageId: string;
  attachmentId: string;
  bucketId: 'chat-media' | 'chat-attachment-staging-v1-2';
  storagePath: string;
  mimeType: string;
  previewStoragePath: string;
  previewMimeType: 'image/jpeg';
};

export type ChatImageModerationBatchPreflightInput = {
  receiverId: string;
  clientMessageId: string;
  attachments: ChatImageModerationPreflightInput[];
};

type FunctionErrorPayload = {
  error?: unknown;
  code?: unknown;
  message?: unknown;
  categories?: unknown;
  retry_after_seconds?: unknown;
  attachmentId?: unknown;
  attachmentIndex?: unknown;
  mediaGroupId?: unknown;
  stage?: unknown;
  retryable?: unknown;
};

export class ChatAttachmentFunctionError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly categories: string[];
  readonly retryAfterSeconds: number | null;
  readonly attachmentId: string | null;
  readonly attachmentIndex: number | null;
  readonly mediaGroupId: string | null;
  readonly stage: string | null;
  readonly retryable: boolean | null;

  constructor(args: {
    code: string;
    status?: number | null;
    categories?: string[];
    retryAfterSeconds?: number | null;
    attachmentId?: string | null;
    attachmentIndex?: number | null;
    mediaGroupId?: string | null;
    stage?: string | null;
    retryable?: boolean | null;
  }) {
    super(args.code);
    this.name = 'ChatAttachmentFunctionError';
    this.code = args.code;
    this.status = args.status ?? null;
    this.categories = args.categories ?? [];
    this.retryAfterSeconds = args.retryAfterSeconds ?? null;
    this.attachmentId = args.attachmentId ?? null;
    this.attachmentIndex = args.attachmentIndex ?? null;
    this.mediaGroupId = args.mediaGroupId ?? null;
    this.stage = args.stage ?? null;
    this.retryable = args.retryable ?? null;
  }
}

const extractInvokeErrorDetails = async (error: unknown) => {
  const context = (error as { context?: Response })?.context;
  const status = typeof context?.status === 'number' ? context.status : null;
  let payload: FunctionErrorPayload | null = null;
  if (context && typeof context.clone === 'function') {
    try {
      const raw = await context.clone().text();
      if (raw) payload = JSON.parse(raw) as FunctionErrorPayload;
    } catch {}
  }
  const payloadCode = [payload?.error, payload?.code, payload?.message]
    .find((value) => typeof value === 'string' && value.trim());
  const inheritedCode = (error as { code?: unknown })?.code;
  const code = typeof payloadCode === 'string'
    ? payloadCode.trim()
    : typeof inheritedCode === 'string' && inheritedCode.trim()
      ? inheritedCode.trim()
      : status
        ? `attachment_finalize_http_${status}`
        : 'attachment_finalize_failed';
  const categories = Array.isArray(payload?.categories)
    ? payload.categories.filter((value): value is string => typeof value === 'string')
    : [];
  const parsedRetryAfter = Number(payload?.retry_after_seconds);
  return {
    code,
    status,
    categories,
    retryAfterSeconds: Number.isFinite(parsedRetryAfter) && parsedRetryAfter > 0
      ? parsedRetryAfter
      : null,
    attachmentId: typeof payload?.attachmentId === 'string' && payload.attachmentId.trim()
      ? payload.attachmentId.trim()
      : null,
    attachmentIndex: Number.isInteger(payload?.attachmentIndex)
      ? Number(payload?.attachmentIndex)
      : null,
    mediaGroupId: typeof payload?.mediaGroupId === 'string' && payload.mediaGroupId.trim()
      ? payload.mediaGroupId.trim()
      : null,
    stage: typeof payload?.stage === 'string' && payload.stage.trim()
      ? payload.stage.trim()
      : null,
    retryable: typeof payload?.retryable === 'boolean' ? payload.retryable : null,
  };
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

export const buildDeterministicChatPreviewPath = (args: {
  senderId: string;
  receiverId: string;
  clientMessageId: string;
  attachmentId: string;
}) =>
  `${args.senderId}/${args.receiverId}/${args.clientMessageId}/${args.attachmentId}-preview.jpg`;

export const finalizeChatAttachment = async (
  input: ChatAttachmentFinalizeInput,
): Promise<CanonicalChatAttachmentMessage> => {
  if (__DEV__) {
    console.log('[chat][attachment-finalize] invoke:start', {
      attachmentType: input.attachmentType,
      mimeType: input.mimeType,
      byteSize: input.byteSize ?? null,
      isViewOnce: input.isViewOnce === true,
      hasSenderPublicKey: Boolean(input.senderPublicKey),
    });
  }
  const { data, error } = await supabase.functions.invoke('chat-attachment-finalize', {
    body: { contractVersion: CHAT_ATTACHMENT_GUARD_CONTRACT_V1_2, ...input },
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
        if (__DEV__) {
          console.log('[chat][attachment-finalize] invoke:error-code', { errorCode });
        }
        const finalizationError = new Error(errorCode);
        (finalizationError as Error & { code?: string }).code = errorCode;
        throw finalizationError;
      }
    }
    if (__DEV__) {
      console.log('[chat][attachment-finalize] invoke:error', {
        message: (error as { message?: string })?.message ?? String(error),
      });
    }
    throw error;
  }
  const message = (data as { message?: CanonicalChatAttachmentMessage } | null)?.message;
  if (!message) throw new Error('attachment_finalize_missing_message');
  if (__DEV__) console.log('[chat][attachment-finalize] invoke:success');
  return message;
};

export const finalizeChatAttachmentBatch = async (
  input: ChatAttachmentBatchFinalizeInput,
): Promise<CanonicalChatAttachmentMessage> => {
  const startedAt = Date.now();
  const { data, error } = await supabase.functions.invoke('chat-attachment-finalize', {
    body: {
      mode: 'finalize_batch',
      contractVersion: CHAT_ATTACHMENT_GUARD_CONTRACT_V1_2,
      ...input,
      expectedCount: input.attachments.length,
      mediaGroupId: input.mediaGroupId ?? null,
    },
  });
  if (error) {
    throw new ChatAttachmentFunctionError(await extractInvokeErrorDetails(error));
  }
  const message = (data as { message?: CanonicalChatAttachmentMessage } | null)?.message;
  if (!message) throw new Error('attachment_batch_finalize_missing_message');
  if (__DEV__) {
    console.log('[chat][attachment-finalize] batch:success', {
      attachmentCount: input.attachments.length,
      roundTripMs: Date.now() - startedAt,
      serverTotalMs: Number((data as { performance?: { totalMs?: unknown } } | null)
        ?.performance?.totalMs) || null,
    });
  }
  return message;
};

/**
 * Persists moderation receipts before the canonical batch commit. Retrying this
 * request is safe: the server keys receipts by sender, client message,
 * attachment, content hash, MIME, and policy version.
 */
export const preflightChatImageAttachment = async (
  input: ChatImageModerationPreflightInput,
): Promise<void> => {
  const startedAt = Date.now();
  const { data, error } = await supabase.functions.invoke('chat-attachment-finalize', {
    body: {
      mode: 'moderate_image_item',
      assetRole: 'pair',
      contractVersion: CHAT_ATTACHMENT_GUARD_CONTRACT_V1_2,
      ...input,
    },
  });
  if (error) {
    const details = await extractInvokeErrorDetails(error);
    if (__DEV__) {
      console.log('[chat][attachment-finalize] preflight:error', {
        assetRole: 'pair',
        durationMs: Date.now() - startedAt,
        code: details.code,
        stage: details.stage,
      });
    }
    throw new ChatAttachmentFunctionError(details);
  }
  if ((data as { approved?: unknown } | null)?.approved !== true) {
    throw new ChatAttachmentFunctionError({
      code: 'attachment_moderation_preflight_invalid',
      attachmentId: input.attachmentId,
      stage: 'content_moderation',
      retryable: true,
    });
  }
  if (__DEV__) {
    console.log('[chat][attachment-finalize] preflight:success', {
      assetRole: 'pair',
      roundTripMs: Date.now() - startedAt,
      serverTotalMs: Number((data as { performance?: { totalMs?: unknown } } | null)
        ?.performance?.totalMs) || null,
    });
  }
};

/**
 * Moderates an album through one authenticated Edge request while the server
 * keeps per-item receipts, rate limits, evidence, and failure identity.
 */
export const preflightChatImageAttachmentBatch = async (
  input: ChatImageModerationBatchPreflightInput,
): Promise<void> => {
  if (input.attachments.length === 0) return;
  const startedAt = Date.now();
  const { data, error } = await supabase.functions.invoke('chat-attachment-finalize', {
    body: {
      mode: 'moderate_image_batch',
      contractVersion: CHAT_ATTACHMENT_GUARD_CONTRACT_V1_2,
      ...input,
    },
  });
  if (error) {
    const details = await extractInvokeErrorDetails(error);
    if (__DEV__) {
      console.log('[chat][attachment-finalize] batch-preflight:error', {
        attachmentCount: input.attachments.length,
        durationMs: Date.now() - startedAt,
        code: details.code,
        attachmentIndex: details.attachmentIndex,
        stage: details.stage,
        retryAfterSeconds: details.retryAfterSeconds,
      });
    }
    throw new ChatAttachmentFunctionError(details);
  }
  if ((data as { approved?: unknown } | null)?.approved !== true) {
    throw new ChatAttachmentFunctionError({
      code: 'attachment_moderation_preflight_invalid',
      stage: 'content_moderation',
      retryable: true,
    });
  }
  if (__DEV__) {
    console.log('[chat][attachment-finalize] batch-preflight:success', {
      attachmentCount: input.attachments.length,
      roundTripMs: Date.now() - startedAt,
      serverTotalMs: Number((data as { performance?: { totalMs?: unknown } } | null)
        ?.performance?.totalMs) || null,
    });
  }
};

export const cancelChatAttachmentBatch = async (input: {
  receiverId: string;
  clientMessageId: string;
  attachments: Pick<ChatAttachmentFinalizeInput, 'attachmentId' | 'bucketId' | 'storagePath' | 'previewStoragePath'>[];
}) => {
  const { error } = await supabase.functions.invoke('chat-attachment-finalize', {
    body: { mode: 'cancel', ...input },
  });
  if (error) throw error;
};

export const cancelChatAttachmentItem = async (input: {
  receiverId: string;
  clientMessageId: string;
  attachment: Pick<ChatAttachmentFinalizeInput, 'attachmentId' | 'bucketId' | 'storagePath' | 'previewStoragePath'>;
}) => {
  const { error } = await supabase.functions.invoke('chat-attachment-finalize', {
    body: { mode: 'cancel_item', ...input },
  });
  if (error) throw error;
};

const extractInvokeErrorCode = async (error: unknown) => {
  const details = await extractInvokeErrorDetails(error);
  return details.code === 'attachment_finalize_failed' ? null : details.code;
};

export const prepareViewOnceAttachment = async (messageId: string) => {
  if (__DEV__) console.log('[chat][view-once-prepare] invoke:start');
  const { data, error } = await supabase.functions.invoke('chat-attachment-consume', {
    body: { messageId, mode: 'consume' },
  });
  if (error) {
    const errorCode = await extractInvokeErrorCode(error);
    if (errorCode) {
      if (__DEV__) console.log('[chat][view-once-prepare] invoke:error-code', { errorCode });
      const consumeError = new Error(errorCode);
      (consumeError as Error & { code?: string }).code = errorCode;
      throw consumeError;
    }
    if (__DEV__) {
      console.log('[chat][view-once-prepare] invoke:error', {
        message: (error as { message?: string })?.message ?? String(error),
      });
    }
    throw error;
  }
  if (__DEV__) {
    console.log('[chat][view-once-prepare] invoke:success', {
      attachmentType: (data as { attachmentType?: string } | null)?.attachmentType ?? null,
      mimeType: (data as { mimeType?: string } | null)?.mimeType ?? null,
    });
  }
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

export const consumeViewOnceAttachment = prepareViewOnceAttachment;
