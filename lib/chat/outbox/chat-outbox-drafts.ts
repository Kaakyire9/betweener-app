import type { MessageType } from '@/components/chat/types';
import { DURABLE_CHAT_OUTBOX_MAX_ATTEMPTS } from '@/constants/chat';
import { createChatAttachmentId } from '@/lib/chat/attachment-lifecycle';
import { ChatRepository, type ChatPendingOutboxRow } from '@/lib/chat/local/chat-db';
import { chatMessageToLocalRow, safeJsonStringify } from '@/lib/chat/message-mappers';
import { ChatOutboxService } from '@/lib/chat/outbox/chat-outbox-service';

const buildTextOutboxRow = ({
  ownerUserId,
  threadId,
  message,
  status,
  error,
}: {
  ownerUserId: string;
  threadId: string;
  message: MessageType;
  status: ChatPendingOutboxRow['status'];
  error?: { code?: string | null; message?: string | null };
}): ChatPendingOutboxRow => {
  const now = new Date().toISOString();
  const localMessageId = message.clientMessageId ?? message.id;
  const durableOutboxStatus: ChatPendingOutboxRow['status'] = status === 'sending' ? 'queued' : status;
  return {
    id: localMessageId,
    local_message_id: localMessageId,
    thread_id: threadId,
    owner_user_id: ownerUserId,
    payload_json: safeJsonStringify({
      kind: 'chat_text_send',
      senderId: ownerUserId,
      receiverId: threadId,
      text: message.providerMedia
        ? ''
        : message.type === 'image'
        ? message.storagePath ? '' : message.imageUrl ?? message.text
        : message.type === 'video'
        ? message.storagePath ? '' : message.videoUrl ?? message.text
        : message.text,
      messageType: message.providerMedia ? 'provider_expression' : message.type,
      clientMessageId: localMessageId,
      replyToMessageId: message.replyToId ?? null,
      storagePath: message.storagePath ?? null,
      providerMedia: message.providerMedia ?? null,
      metadataJson: safeJsonStringify(message),
    }) ?? '{}',
    attempt_count: 0,
    max_attempts: DURABLE_CHAT_OUTBOX_MAX_ATTEMPTS,
    next_retry_at: null,
    status: durableOutboxStatus,
    error_code: error?.code ?? null,
    error_message: error?.message ?? null,
    created_at: now,
    updated_at: now,
  };
};

export const persistLocalTextOutboxState = async ({
  ownerUserId,
  threadId,
  message,
  outboxStatus,
  error,
}: {
  ownerUserId: string;
  threadId: string;
  message: MessageType;
  outboxStatus: ChatPendingOutboxRow['status'];
  error?: { code?: string | null; message?: string | null };
}) => {
  await ChatRepository.upsertMessages(ownerUserId, threadId, [
    chatMessageToLocalRow(ownerUserId, threadId, message),
  ]);
  await ChatRepository.upsertPendingOutboxItem(
    ownerUserId,
    buildTextOutboxRow({ ownerUserId, threadId, message, status: outboxStatus, error }),
  );
};

export const markLocalTextOutboxStatus = async ({
  ownerUserId,
  localMessageId,
  status,
  error,
}: {
  ownerUserId: string;
  localMessageId: string;
  status: ChatPendingOutboxRow['status'];
  error?: { code?: string | null; message?: string | null };
}) => {
  await ChatRepository.markOutboxItemStatus(ownerUserId, localMessageId, status, error);
};

export const flushLocalTextOutbox = async (ownerUserId: string) => {
  await ChatOutboxService.flushPending(ownerUserId);
};

export const buildVoiceOutboxRow = ({
  ownerUserId,
  threadId,
  message,
  localUri,
  fileName,
  contentType,
  durationSeconds,
  waveform,
}: {
  ownerUserId: string;
  threadId: string;
  message: MessageType;
  localUri: string;
  fileName: string;
  contentType: string;
  durationSeconds: number;
  waveform: number[];
}): ChatPendingOutboxRow => {
  const now = new Date().toISOString();
  const localMessageId = message.clientMessageId ?? message.id;
  return {
    id: localMessageId,
    local_message_id: localMessageId,
    thread_id: threadId,
    owner_user_id: ownerUserId,
    payload_json: safeJsonStringify({
      kind: 'chat_voice_send',
      senderId: ownerUserId,
      receiverId: threadId,
      clientMessageId: localMessageId,
      localUri,
      fileName,
      contentType,
      attachmentId: createChatAttachmentId(),
      durationSeconds,
      waveform,
      replyToMessageId: message.replyToId ?? null,
    }) ?? '{}',
    attempt_count: 0,
    max_attempts: DURABLE_CHAT_OUTBOX_MAX_ATTEMPTS,
    next_retry_at: null,
    status: 'queued',
    error_code: null,
    error_message: null,
    created_at: now,
    updated_at: now,
  };
};
