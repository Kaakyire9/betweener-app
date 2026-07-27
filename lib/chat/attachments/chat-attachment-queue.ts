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
  now?: Date;
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
      kind: 'chat_media_send',
      senderId: ownerUserId,
      receiverId: threadId,
      clientMessageId: localMessageId,
      localUri: file.localUri,
      fileName: file.fileName,
      contentType: file.contentType,
      mediaType,
      attachmentId: file.attachmentId,
      byteSize: file.byteSize ?? null,
      width: file.width ?? null,
      height: file.height ?? null,
      durationMs: file.durationMs ?? null,
      replyToMessageId: message.replyToId ?? null,
      documentName: mediaType === 'document' ? file.fileName : null,
      documentSizeLabel: documentSizeLabel ?? null,
      documentTypeLabel: documentTypeLabel ?? null,
      albumItems: albumItems?.length ? albumItems : undefined,
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
