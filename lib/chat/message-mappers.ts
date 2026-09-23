import type { MessageType } from '@/components/chat/types';
import type { ChatMessageRow } from '@/lib/chat/local/chat-db';

type CachedReplyTarget = {
  id: string;
  text: string;
  senderId: string;
  timestamp: string;
  type: MessageType['type'];
  deletedForAll?: boolean;
  isViewOnce?: boolean;
  imageUrl?: string;
  offlineImageUri?: string;
  storagePath?: string | null;
  previewStoragePath?: string | null;
  offlinePreviewUri?: string | null;
  previewUrl?: string | null;
  document?: MessageType['document'];
  location?: Omit<NonNullable<MessageType['location']>, 'expiresAt'> & {
    expiresAt?: string | null;
  };
  dateInvite?: Omit<NonNullable<MessageType['dateInvite']>, 'scheduledFor'> & {
    scheduledFor: string;
  };
  sticker?: MessageType['sticker'];
};

export type CachedMessageType = Omit<
  MessageType,
  'timestamp' | 'readAt' | 'deletedAt' | 'editedAt' | 'replyTo' | 'location' | 'dateInvite'
> & {
  timestamp: string;
  readAt?: string;
  deletedAt?: string | null;
  editedAt?: string | null;
  location?: Omit<NonNullable<MessageType['location']>, 'expiresAt'> & {
    expiresAt?: string | null;
  };
  dateInvite?: Omit<NonNullable<MessageType['dateInvite']>, 'scheduledFor'> & {
    scheduledFor: string;
  };
  replyTo?: CachedReplyTarget;
};

export type MessageDatabaseRow = {
  id: string;
  client_message_id?: string | null;
  text: string;
  created_at: string;
  sender_id: string;
  receiver_id: string;
  is_read: boolean;
  delivered_at: string | null;
  message_type?: MessageType['type'];
  audio_path?: string | null;
  audio_duration?: number | null;
  audio_waveform?: number[] | string | null;
  deleted_for_all?: boolean | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  reply_to_message_id?: string | null;
  edited_at?: string | null;
  is_view_once?: boolean | null;
  encrypted_media?: boolean | null;
  encrypted_media_path?: string | null;
  encrypted_key_sender?: string | null;
  encrypted_key_receiver?: string | null;
  encrypted_key_nonce?: string | null;
  encrypted_media_nonce?: string | null;
  encrypted_media_alg?: string | null;
  encrypted_media_mime?: string | null;
  encrypted_media_size?: number | null;
  storage_path?: string | null;
  media_items?: unknown;
  media_expected_count?: number | null;
  media_group_id?: string | null;
  media_caption?: string | null;
};

const serializeReplyTarget = (message: MessageType | undefined): CachedReplyTarget | undefined => {
  if (!message) return undefined;
  const timestamp = message.timestamp instanceof Date
    ? message.timestamp.toISOString()
    : new Date().toISOString();
  if (message.deletedForAll) {
    return {
      id: message.id,
      text: 'Message deleted',
      senderId: message.senderId,
      timestamp,
      type: 'text',
      deletedForAll: true,
    };
  }
  const isPrivateViewOnce = Boolean(
    message.isViewOnce && (message.type === 'image' || message.type === 'video'),
  );
  return {
    id: message.id,
    text: isPrivateViewOnce ? '' : message.text,
    senderId: message.senderId,
    timestamp,
    type: message.type,
    isViewOnce: message.isViewOnce,
    imageUrl: isPrivateViewOnce ? undefined : message.imageUrl,
    offlineImageUri: isPrivateViewOnce ? undefined : message.offlineImageUri,
    storagePath: isPrivateViewOnce ? undefined : message.storagePath,
    previewStoragePath: isPrivateViewOnce ? undefined : message.previewStoragePath,
    offlinePreviewUri: isPrivateViewOnce ? undefined : message.offlinePreviewUri,
    previewUrl: isPrivateViewOnce ? undefined : message.previewUrl,
    document: isPrivateViewOnce ? undefined : message.document,
    location: isPrivateViewOnce
      ? undefined
      : message.location
        ? {
            ...message.location,
            expiresAt: message.location.expiresAt instanceof Date
              ? message.location.expiresAt.toISOString()
              : (message.location.expiresAt ?? null),
          }
        : undefined,
    dateInvite: isPrivateViewOnce
      ? undefined
      : message.dateInvite
        ? {
            ...message.dateInvite,
            scheduledFor: message.dateInvite.scheduledFor instanceof Date
              ? message.dateInvite.scheduledFor.toISOString()
              : new Date().toISOString(),
          }
        : undefined,
    sticker: isPrivateViewOnce ? undefined : message.sticker,
  };
};

const deserializeReplyTarget = (message: CachedReplyTarget | undefined): MessageType | undefined => {
  if (!message) return undefined;
  return {
    ...message,
    timestamp: message.timestamp ? new Date(message.timestamp) : new Date(),
    reactions: [],
    status: 'sent',
    location: message.location
      ? {
          ...message.location,
          expiresAt: message.location.expiresAt ? new Date(message.location.expiresAt) : null,
        }
      : undefined,
    dateInvite: message.dateInvite
      ? {
          ...message.dateInvite,
          scheduledFor: message.dateInvite.scheduledFor
            ? new Date(message.dateInvite.scheduledFor)
            : new Date(),
        }
      : undefined,
  };
};

export const serializeCachedMessages = (messages: MessageType[]): CachedMessageType[] =>
  (messages || []).map((message) => ({
    ...message,
    timestamp: message.timestamp instanceof Date ? message.timestamp.toISOString() : new Date().toISOString(),
    readAt: message.readAt instanceof Date ? message.readAt.toISOString() : undefined,
    deletedAt: message.deletedAt instanceof Date ? message.deletedAt.toISOString() : (message.deletedAt ?? null),
    editedAt: message.editedAt instanceof Date ? message.editedAt.toISOString() : (message.editedAt ?? null),
    location: message.location
      ? {
          ...message.location,
          expiresAt: message.location.expiresAt instanceof Date
            ? message.location.expiresAt.toISOString()
            : (message.location.expiresAt ?? null),
        }
      : undefined,
    dateInvite: message.dateInvite
      ? {
          ...message.dateInvite,
          scheduledFor:
            message.dateInvite.scheduledFor instanceof Date
              ? message.dateInvite.scheduledFor.toISOString()
              : new Date().toISOString(),
        }
      : undefined,
    replyTo: serializeReplyTarget(message.replyTo),
  }));

export const deserializeCachedMessages = (raw: unknown): MessageType[] => {
  if (!Array.isArray(raw)) return [];
  return (raw as CachedMessageType[]).map((message) => ({
    ...message,
    timestamp: message.timestamp ? new Date(message.timestamp) : new Date(),
    readAt: message.readAt ? new Date(message.readAt) : undefined,
    deletedAt: message.deletedAt ? new Date(message.deletedAt) : null,
    editedAt: message.editedAt ? new Date(message.editedAt) : null,
    location: message.location
      ? {
          ...message.location,
          expiresAt: message.location.expiresAt ? new Date(message.location.expiresAt) : null,
        }
      : undefined,
    dateInvite: message.dateInvite
      ? {
          ...message.dateInvite,
          scheduledFor: message.dateInvite.scheduledFor
            ? new Date(message.dateInvite.scheduledFor)
            : new Date(),
        }
      : undefined,
    replyTo: deserializeReplyTarget(message.replyTo),
  }));
};

export const safeJsonStringify = (value: unknown): string | null => {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

const normalizeLocalChatMessageType = (type: MessageType['type']): ChatMessageRow['message_type'] => {
  switch (type) {
    case 'voice':
    case 'image':
    case 'video':
    case 'document':
    case 'location':
    case 'date_plan':
    case 'mood_sticker':
    case 'system':
      return type;
    default:
      return 'text';
  }
};

const normalizeLocalChatMessageStatus = (status: MessageType['status']): ChatMessageRow['status'] => {
  switch (status) {
    case 'sending':
      return 'sending';
    case 'queued':
      return 'pending';
    case 'delivered':
      return 'delivered';
    case 'read':
      return 'read';
    case 'failed':
      return 'failed';
    case 'sent':
    default:
      return 'sent';
  }
};

export const chatMessageToLocalRow = (
  ownerUserId: string,
  threadId: string,
  message: MessageType,
): ChatMessageRow => {
  const createdAt = message.timestamp instanceof Date ? message.timestamp.toISOString() : new Date().toISOString();
  const localStatus: ChatMessageRow['status'] = message.deletedForAll
    ? 'deleted'
    : normalizeLocalChatMessageStatus(message.status);
  const serialized = serializeCachedMessages([message])[0] ?? null;
  const localId = message.clientMessageId ?? (String(message.id).startsWith('temp-') ? String(message.id) : null);
  return {
    id: String(message.id),
    local_id: localId,
    thread_id: threadId,
    owner_user_id: ownerUserId,
    sender_user_id: String(message.senderId || ''),
    receiver_user_id: message.senderId === ownerUserId ? threadId : ownerUserId,
    body: typeof message.text === 'string' ? message.text : null,
    message_type: normalizeLocalChatMessageType(message.type),
    status: localStatus,
    direction: message.senderId === ownerUserId ? 'outgoing' : 'incoming',
    created_at: createdAt,
    server_created_at: String(message.id).startsWith('temp-') ? null : createdAt,
    edited_at: message.editedAt instanceof Date ? message.editedAt.toISOString() : null,
    deleted_at: message.deletedAt instanceof Date ? message.deletedAt.toISOString() : (message.deletedForAll ? createdAt : null),
    reply_to_message_id: message.replyToId ? String(message.replyToId) : null,
    is_view_once: message.isViewOnce ? 1 : 0,
    local_only: localStatus === 'pending' || localStatus === 'sending' || localStatus === 'failed' ? 1 : 0,
    error_code: localStatus === 'failed' ? 'send_failed' : null,
    metadata_json: safeJsonStringify(serialized),
    remote_updated_at: String(message.id).startsWith('temp-') ? null : createdAt,
    local_updated_at: new Date().toISOString(),
  };
};

export const localRowToChatMessage = (row: ChatMessageRow): MessageType => {
  const structuredStatus: MessageType['status'] =
    row.status === 'pending' ? 'queued' : row.status === 'deleted' ? 'sent' : row.status;

  if (row.metadata_json) {
    try {
      const hydrated = deserializeCachedMessages([JSON.parse(row.metadata_json)])[0];
      if (hydrated) {
        return {
          ...hydrated,
          status: structuredStatus,
          sendErrorCode: row.error_code ?? null,
          deletedForAll: row.status === 'deleted',
          deletedAt: row.deleted_at ? new Date(row.deleted_at) : hydrated.deletedAt ?? null,
          editedAt: row.edited_at ? new Date(row.edited_at) : hydrated.editedAt ?? null,
          replyToId: row.reply_to_message_id ?? hydrated.replyToId ?? undefined,
        };
      }
    } catch {
      // Fall back to the structured columns below.
    }
  }

  return {
    id: row.id,
    clientMessageId: row.local_id,
    text: row.body ?? '',
    senderId: row.sender_user_id,
    timestamp: new Date(row.created_at),
    type: row.message_type === 'audio' ? 'voice' : (row.message_type as MessageType['type']),
    reactions: [],
    status: structuredStatus,
    sendErrorCode: row.error_code ?? null,
    deletedForAll: row.status === 'deleted',
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
    isViewOnce: row.is_view_once === 1,
    replyToId: row.reply_to_message_id,
  };
};
