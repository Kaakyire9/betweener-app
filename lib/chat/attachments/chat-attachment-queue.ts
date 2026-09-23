import type { MessageType } from '../../../components/chat/types';
import type { ChatPendingOutboxRow } from '../local/chat-db';

const DOCUMENT_TEXT_PREFIX = '📎';
const DEFAULT_MAX_ATTEMPTS = 48;

export type QueuedAttachmentType = 'image' | 'video' | 'document';

export type QueuedAttachmentFile = {
  localUri: string;
  fileName: string;
  contentType: string;
  attachmentId: string;
  byteSize?: number | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  previewLocalUri?: string | null;
  previewContentType?: 'image/jpeg' | null;
  previewByteSize?: number | null;
  previewWidth?: number | null;
  previewHeight?: number | null;
  index?: number;
  mediaType?: 'image' | 'video';
  transferState?: 'queued' | 'preparing' | 'uploading' | 'uploaded' | 'cancelling' | 'retryable_failed' | 'terminal_failed' | 'cancelled';
  attemptCount?: number;
  uploadProgress?: number | null;
  lastError?: string | null;
  uploadCompleted?: boolean;
};

export type QueuedViewOnceAttachment = {
  localUri: string;
  fileName: string;
  contentType: string;
  attachmentId: string;
  byteSize: number;
  attachmentType: 'image' | 'video';
  encryptedKeySender: string;
  encryptedKeyReceiver: string;
  encryptedKeyNonce: string;
  encryptedMediaNonce: string;
  senderPublicKey: string;
};

export type CreateQueuedMediaMessageInput = {
  id: string;
  senderId: string;
  mediaType: QueuedAttachmentType;
  stagedUri: string;
  fileName: string;
  replyTo?: MessageType;
  documentSizeLabel?: string | null;
  documentTypeLabel?: string | null;
  previewUri?: string | null;
  now?: Date;
};

export type PreparingMediaItem = {
  attachmentId: string;
  type: 'image' | 'video';
  localUri: string;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  byteSize?: number | null;
  durationMs?: number | null;
};

export const createPreparingMediaMessage = ({
  id,
  senderId,
  items,
  replyTo,
  caption = '',
  mediaGroupId,
  now = new Date(),
}: {
  id: string;
  senderId: string;
  items: PreparingMediaItem[];
  replyTo?: MessageType;
  caption?: string;
  mediaGroupId?: string | null;
  now?: Date;
}): MessageType => {
  const first = items[0];
  const messageType = items.length > 1 || first?.type === 'image' ? 'image' : 'video';
  return {
    id,
    clientMessageId: id,
    text: caption.trim(),
    senderId,
    timestamp: now,
    type: messageType,
    reactions: [],
    status: 'sending',
    imageUrl: messageType === 'image' ? first?.localUri : undefined,
    videoUrl: messageType === 'video' ? first?.localUri : undefined,
    offlineImageUri: messageType === 'image' ? first?.localUri : undefined,
    offlineVideoUri: messageType === 'video' ? first?.localUri : undefined,
    mediaItems: items.map((item, index) => ({
      attachmentId: item.attachmentId,
      index,
      type: item.type,
      storagePath: '',
      mimeType: item.mimeType ?? null,
      width: item.width ?? null,
      height: item.height ?? null,
      byteSize: item.byteSize ?? null,
      durationMs: item.durationMs ?? null,
      localUri: item.localUri,
      transferState: 'preparing',
      uploadProgress: 0,
    })),
    mediaExpectedCount: items.length,
    mediaGroupId: mediaGroupId ?? null,
    mediaCaption: caption.trim() || null,
    replyToId: replyTo?.id ?? null,
    replyTo,
  };
};

export const createQueuedMediaMessage = ({
  id,
  senderId,
  mediaType,
  stagedUri,
  fileName,
  replyTo,
  documentSizeLabel,
  documentTypeLabel,
  previewUri,
  now = new Date(),
}: CreateQueuedMediaMessageInput): MessageType => {
  const documentLabel = [fileName, documentSizeLabel, documentTypeLabel].filter(Boolean).join(' | ');
  return {
    id,
    clientMessageId: id,
    text: mediaType === 'document' ? `${DOCUMENT_TEXT_PREFIX} ${documentLabel}\n${stagedUri}` : '',
    senderId,
    timestamp: now,
    type: mediaType,
    reactions: [],
    status: 'queued',
    imageUrl: mediaType === 'image' ? stagedUri : undefined,
    videoUrl: mediaType === 'video' ? stagedUri : undefined,
    offlineImageUri: mediaType === 'image' ? stagedUri : undefined,
    offlineVideoUri: mediaType === 'video' ? stagedUri : undefined,
    offlinePreviewUri: previewUri ?? undefined,
    document: mediaType === 'document'
      ? {
          name: fileName,
          url: stagedUri,
          sizeLabel: documentSizeLabel ?? null,
          typeLabel: documentTypeLabel ?? null,
        }
      : undefined,
    replyToId: replyTo?.id ?? null,
    replyTo,
  };
};

export const createQueuedMediaOutboxRow = ({
  ownerUserId,
  threadId,
  message,
  file,
  mediaType,
  documentSizeLabel,
  documentTypeLabel,
  albumItems,
  mediaGroupId,
  albumCaption,
  now = new Date(),
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
}: {
  ownerUserId: string;
  threadId: string;
  message: MessageType;
  file: QueuedAttachmentFile;
  mediaType: QueuedAttachmentType;
  documentSizeLabel?: string | null;
  documentTypeLabel?: string | null;
  albumItems?: QueuedAttachmentFile[];
  mediaGroupId?: string | null;
  albumCaption?: string | null;
  retryAttachmentIds?: string[];
  now?: Date;
  maxAttempts?: number;
}): ChatPendingOutboxRow => {
  const localMessageId = message.clientMessageId ?? message.id;
  const createdAt = now.toISOString();
  // Keep visual attachments in the same durable per-item state machine even
  // when there is only one item. A successful immutable upload must survive a
  // later moderation/finalisation retry without attempting to overwrite the
  // staging object.
  const durableMediaItems = albumItems?.length
    ? albumItems
    : mediaType === 'image' || mediaType === 'video'
      ? [file]
      : undefined;
  return {
    id: localMessageId,
    local_message_id: localMessageId,
    thread_id: threadId,
    owner_user_id: ownerUserId,
    payload_json: JSON.stringify({
      kind: 'chat_media_send',
      senderId: ownerUserId,
      receiverId: threadId,
      clientMessageId: localMessageId,
      localUri: file.localUri,
      fileName: file.fileName,
      contentType: file.contentType,
      mediaType,
      ...(message.mediaKind ? { mediaKind: message.mediaKind } : {}),
      ...(mediaGroupId ? { mediaGroupId } : {}),
      ...(albumCaption ? { albumCaption } : {}),
      ...(durableMediaItems?.length ? { compositionRevision: 0 } : {}),
      attachmentId: file.attachmentId,
      byteSize: file.byteSize ?? null,
      width: file.width ?? null,
      height: file.height ?? null,
      durationMs: file.durationMs ?? null,
      previewLocalUri: file.previewLocalUri ?? null,
      previewContentType: file.previewContentType ?? null,
      previewByteSize: file.previewByteSize ?? null,
      previewWidth: file.previewWidth ?? null,
      previewHeight: file.previewHeight ?? null,
      replyToMessageId: message.replyToId ?? null,
      documentName: mediaType === 'document' ? file.fileName : null,
      documentSizeLabel: documentSizeLabel ?? null,
      documentTypeLabel: documentTypeLabel ?? null,
      albumItems: durableMediaItems?.length
        ? durableMediaItems.map((item, index) => ({
            ...item,
            index,
            mediaType: item.mediaType ?? (item.contentType.startsWith('video/') ? 'video' : 'image'),
            transferState: item.transferState ?? 'queued',
            attemptCount: item.attemptCount ?? 0,
            uploadProgress: item.uploadProgress ?? 0,
            lastError: item.lastError ?? null,
            uploadCompleted: item.uploadCompleted ?? false,
          }))
        : undefined,
    }),
    attempt_count: 0,
    max_attempts: maxAttempts,
    next_retry_at: null,
    status: 'queued',
    error_code: null,
    error_message: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
};

export const createQueuedViewOnceOutboxRow = ({
  ownerUserId,
  threadId,
  message,
  attachment,
  now = new Date(),
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
}: {
  ownerUserId: string;
  threadId: string;
  message: MessageType;
  attachment: QueuedViewOnceAttachment;
  now?: Date;
  maxAttempts?: number;
}): ChatPendingOutboxRow => {
  const localMessageId = message.clientMessageId ?? message.id;
  const createdAt = now.toISOString();
  return {
    id: localMessageId,
    local_message_id: localMessageId,
    thread_id: threadId,
    owner_user_id: ownerUserId,
    payload_json: JSON.stringify({
      kind: 'chat_view_once_send',
      senderId: ownerUserId,
      receiverId: threadId,
      clientMessageId: localMessageId,
      localUri: attachment.localUri,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      attachmentId: attachment.attachmentId,
      byteSize: attachment.byteSize,
      attachmentType: attachment.attachmentType,
      encryptedKeySender: attachment.encryptedKeySender,
      encryptedKeyReceiver: attachment.encryptedKeyReceiver,
      encryptedKeyNonce: attachment.encryptedKeyNonce,
      encryptedMediaNonce: attachment.encryptedMediaNonce,
      encryptedMediaAlg: 'nacl-secretbox',
      senderPublicKey: attachment.senderPublicKey,
      replyToMessageId: message.replyToId ?? null,
    }),
    attempt_count: 0,
    max_attempts: maxAttempts,
    next_retry_at: null,
    status: 'queued',
    error_code: null,
    error_message: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
};
