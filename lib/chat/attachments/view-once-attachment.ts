import type { MessageType } from '../../../components/chat/types';

export type ViewOnceAttachmentKind = 'image' | 'video';

export type EncryptedViewOncePayload = {
  encryptedKeySenderB64: string;
  encryptedKeyReceiverB64: string;
  keyNonceB64: string;
  mediaNonceB64: string;
};

export const createViewOnceOptimisticMessage = ({
  id,
  senderId,
  kind,
  replyTo,
  now = new Date(),
}: {
  id: string;
  senderId: string;
  kind: ViewOnceAttachmentKind;
  replyTo?: MessageType;
  now?: Date;
}): MessageType => ({
  id,
  clientMessageId: id,
  text: '',
  senderId,
  timestamp: now,
  type: kind,
  reactions: [],
  status: 'sending',
  isViewOnce: true,
  encryptedMedia: true,
  encryptedMediaPath: null,
  replyToId: replyTo?.id ?? null,
  replyTo,
});

export const getViewOnceSizeError = ({
  kind,
  byteSize,
  imageLimitBytes,
  videoLimitBytes,
}: {
  kind: ViewOnceAttachmentKind;
  byteSize: number;
  imageLimitBytes: number;
  videoLimitBytes: number;
}) => {
  const limit = kind === 'video' ? videoLimitBytes : imageLimitBytes;
  if (byteSize <= limit) return null;
  return `view_once_media_exceeds_${Math.round(limit / (1024 * 1024))}mb`;
};

export const getViewOnceUploadErrorMessage = (kind: ViewOnceAttachmentKind, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (message.startsWith('view_once_media_exceeds_')) {
    return `For reliable encrypted delivery, choose a ${kind} smaller than ${kind === 'video' ? '25 MB' : '15 MB'}.`;
  }
  if (message.includes('image_content_not_allowed')) {
    return 'This photo cannot be sent because it contains prohibited or unsafe content.';
  }
  if (message.includes('image_review_required')) {
    return 'This photo has been held for a safety review and was not sent.';
  }
  if (message.includes('image_moderation_unavailable') || message.includes('view_once_moderation_unavailable')) {
    return 'The safety check is temporarily unavailable. The photo was not sent. Please try again.';
  }
  if (message.includes('view_once_keys_unavailable')) {
    return 'Secure viewing is not ready for this conversation yet. Please try again shortly.';
  }
  if (message.includes('view_once_auth_required')) {
    return 'Please reconnect or sign in again before sending a view-once photo.';
  }
  return 'Unable to send encrypted media.';
};

export const buildViewOnceFinalizeMetadata = ({
  payload,
  senderPublicKey,
}: {
  payload: EncryptedViewOncePayload;
  senderPublicKey: string;
}) => ({
  isViewOnce: true,
  encryptedKeySender: payload.encryptedKeySenderB64,
  encryptedKeyReceiver: payload.encryptedKeyReceiverB64,
  encryptedKeyNonce: payload.keyNonceB64,
  encryptedMediaNonce: payload.mediaNonceB64,
  encryptedMediaAlg: 'nacl-secretbox' as const,
  senderPublicKey,
});
