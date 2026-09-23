import type { ChatMessageRow } from '@/lib/chat/local/chat-db';

export type TextOutboxPayload = {
  kind?: 'chat_text_send';
  senderId?: string;
  receiverId?: string;
  text?: string;
  messageType?: ChatMessageRow['message_type'];
  clientMessageId?: string | null;
  replyToMessageId?: string | null;
  metadataJson?: string | null;
  storagePath?: string | null;
};

export type MediaOutboxPayload = {
  kind?: 'chat_media_send';
  senderId?: string;
  receiverId?: string;
  clientMessageId?: string | null;
  localUri?: string;
  fileName?: string;
  contentType?: string;
  mediaType?: 'image' | 'video' | 'document';
  mediaKind?: 'giphy_gif' | 'giphy_sticker' | 'giphy_emoji' | 'giphy_text' | null;
  attachmentId?: string | null;
  byteSize?: number | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  replyToMessageId?: string | null;
  documentName?: string | null;
  documentSizeLabel?: string | null;
  documentTypeLabel?: string | null;
  albumItems?: MediaOutboxFile[];
  mediaGroupId?: string | null;
  albumCaption?: string | null;
  retryAttachmentIds?: string[];
  compositionRevision?: number;
  uploadCompleted?: boolean;
  previewLocalUri?: string | null;
  previewContentType?: 'image/jpeg' | null;
  previewByteSize?: number | null;
  previewWidth?: number | null;
  previewHeight?: number | null;
};

export type MediaOutboxFile = {
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
  /** Durable proof that deterministic original and preview uploads completed. */
  uploadCompleted?: boolean;
};

export type VoiceOutboxPayload = {
  kind?: 'chat_voice_send';
  senderId?: string;
  receiverId?: string;
  clientMessageId?: string | null;
  localUri?: string;
  fileName?: string;
  contentType?: string;
  durationSeconds?: number;
  waveform?: number[];
  replyToMessageId?: string | null;
  attachmentId?: string | null;
};

export type ViewOnceOutboxPayload = {
  kind: 'chat_view_once_send';
  senderId?: string;
  receiverId?: string;
  clientMessageId?: string | null;
  localUri?: string;
  fileName?: string;
  contentType?: string;
  attachmentId?: string | null;
  byteSize?: number | null;
  attachmentType?: 'image' | 'video';
  encryptedKeySender?: string;
  encryptedKeyReceiver?: string;
  encryptedKeyNonce?: string;
  encryptedMediaNonce?: string;
  encryptedMediaAlg?: 'nacl-secretbox';
  senderPublicKey?: string;
  replyToMessageId?: string | null;
};

export type ChatOutboxPayload =
  | TextOutboxPayload
  | MediaOutboxPayload
  | VoiceOutboxPayload
  | ViewOnceOutboxPayload;

export type RemoteMessageRow = {
  id: string;
  client_message_id?: string | null;
  text: string | null;
  created_at: string;
  sender_id: string;
  receiver_id: string;
  is_read?: boolean | null;
  delivered_at?: string | null;
  message_type?: string | null;
  reply_to_message_id?: string | null;
  audio_path?: string | null;
  audio_duration?: number | null;
  audio_waveform?: unknown;
  storage_path?: string | null;
  media_items?: unknown;
  media_expected_count?: number | null;
  media_group_id?: string | null;
  media_caption?: string | null;
  media_kind?: string | null;
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
};

export type FlushResult = {
  attemptedCount: number;
  sentCount: number;
  failedCount: number;
  touchedThreadIds: string[];
};

export const REMOTE_MESSAGE_SELECT =
  'id,client_message_id,text,created_at,sender_id,receiver_id,is_read,delivered_at,message_type,reply_to_message_id,audio_path,audio_duration,audio_waveform,storage_path,media_items,media_expected_count,media_group_id,media_caption,media_kind,is_view_once,encrypted_media,encrypted_media_path,encrypted_key_sender,encrypted_key_receiver,encrypted_key_nonce,encrypted_media_nonce,encrypted_media_alg,encrypted_media_mime,encrypted_media_size';

export const albumFilesToLocalMediaItems = (files: readonly MediaOutboxFile[]) => JSON.stringify(
  files.map((file, index) => ({
    attachmentId: file.attachmentId,
    index,
    type: file.mediaType ?? (file.contentType.startsWith('video/') ? 'video' : 'image'),
    storagePath: '',
    mimeType: file.contentType,
    width: file.width ?? null,
    height: file.height ?? null,
    byteSize: file.byteSize ?? null,
    localUri: file.localUri,
    localPreviewUri: file.previewLocalUri ?? null,
    transferState: file.transferState ?? 'queued',
    uploadProgress: file.transferState === 'uploaded' ? 1 : file.uploadProgress ?? null,
    transferError: file.lastError ?? null,
  })),
);

const normalizeWaveform = (value: unknown): number[] => {
  if (Array.isArray(value)) return value.filter((entry): entry is number => typeof entry === 'number');
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((entry): entry is number => typeof entry === 'number');
    } catch {
      return [];
    }
  }
  return [];
};

const normalizeRemoteMediaItems = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      attachmentId: String(item.attachmentId ?? ''),
      index: Number(item.index ?? 0),
      type: item.type === 'video' ? 'video' as const : 'image' as const,
      storagePath: String(item.storagePath ?? ''),
      mimeType: typeof item.mimeType === 'string' ? item.mimeType : null,
      width: typeof item.width === 'number' ? item.width : null,
      height: typeof item.height === 'number' ? item.height : null,
      byteSize: typeof item.byteSize === 'number' ? item.byteSize : null,
      durationMs: typeof item.durationMs === 'number' ? item.durationMs : null,
      previewStoragePath: typeof item.previewStoragePath === 'string' ? item.previewStoragePath : null,
    }))
    .filter((item) => item.attachmentId && item.storagePath)
    .sort((left, right) => left.index - right.index);
};

const withRemoteMessageIdentity = (
  metadataJson: string | null | undefined,
  row: RemoteMessageRow,
  status: ChatMessageRow['status'],
  fallbackType: string,
) => {
  if (!metadataJson) return null;
  try {
    const parsed = JSON.parse(metadataJson) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    const resolvedType = String(parsed.type ?? fallbackType);
    const nextText = resolvedType === 'image' || resolvedType === 'video' || resolvedType === 'document'
      ? ''
      : row.text ?? parsed.text ?? '';
    return JSON.stringify({
      ...parsed,
      id: row.id,
      clientMessageId: row.client_message_id ?? parsed.clientMessageId ?? null,
      text: nextText,
      senderId: row.sender_id,
      timestamp: row.created_at,
      status,
      type: resolvedType,
      replyToId: row.reply_to_message_id ?? parsed.replyToId ?? null,
      imageUrl: resolvedType === 'image'
        ? (typeof parsed.imageUrl === 'string' && parsed.imageUrl) || row.text || undefined
        : parsed.imageUrl,
      videoUrl: resolvedType === 'video'
        ? (typeof parsed.videoUrl === 'string' && parsed.videoUrl) || row.text || undefined
        : parsed.videoUrl,
      document: parsed.document,
    });
  } catch {
    return null;
  }
};

const buildMessageMetadataJson = (
  row: RemoteMessageRow,
  payload?: ChatOutboxPayload | null,
  status?: ChatMessageRow['status'],
) => {
  const messageType = payload?.kind === 'chat_media_send'
    ? payload.albumItems && payload.albumItems.length > 1 ? 'image' : payload.mediaType
    : payload?.kind === 'chat_view_once_send'
    ? payload.attachmentType
    : row.message_type === 'audio'
    ? 'voice'
    : row.message_type ?? 'text';
  const remoteMediaItems = normalizeRemoteMediaItems(row.media_items);
  const base = {
    id: row.id,
    clientMessageId: row.client_message_id ?? null,
    text: row.text ?? '',
    senderId: row.sender_id,
    timestamp: row.created_at,
    type: messageType === 'document' ? 'document' : messageType,
    reactions: [],
    status,
    replyToId: row.reply_to_message_id ?? null,
    storagePath: row.storage_path ?? null,
    mediaItems: remoteMediaItems,
    mediaExpectedCount: row.media_expected_count ?? null,
    mediaGroupId: row.media_group_id ?? (payload?.kind === 'chat_media_send' ? payload.mediaGroupId ?? null : null),
    mediaCaption: row.media_caption ?? (payload?.kind === 'chat_media_send' ? payload.albumCaption ?? null : null),
    mediaKind: row.media_kind ?? (payload?.kind === 'chat_media_send' ? payload.mediaKind ?? null : null),
    previewStoragePath: remoteMediaItems[0]?.previewStoragePath ?? null,
    isViewOnce: Boolean(row.is_view_once),
    encryptedMedia: Boolean(row.encrypted_media),
    encryptedMediaPath: row.encrypted_media_path ?? null,
    encryptedKeySender: row.encrypted_key_sender ?? null,
    encryptedKeyReceiver: row.encrypted_key_receiver ?? null,
    encryptedKeyNonce: row.encrypted_key_nonce ?? null,
    encryptedMediaNonce: row.encrypted_media_nonce ?? null,
    encryptedMediaAlg: row.encrypted_media_alg ?? null,
    encryptedMediaMime: row.encrypted_media_mime ?? null,
    encryptedMediaSize: row.encrypted_media_size ?? null,
  };

  if (payload?.kind === 'chat_view_once_send') {
    return JSON.stringify({
      ...base,
      type: payload.attachmentType ?? row.message_type ?? 'image',
      text: '',
      isViewOnce: true,
      encryptedMedia: true,
    });
  }
  if (payload?.kind === 'chat_media_send' && (payload.mediaType === 'image' || (payload.albumItems?.length ?? 0) > 1)) {
    return JSON.stringify({ ...base, type: 'image', imageUrl: row.text ?? undefined });
  }
  if (payload?.kind === 'chat_media_send' && payload.mediaType === 'video') {
    return JSON.stringify({ ...base, type: 'video', videoUrl: row.text ?? undefined });
  }
  if (payload?.kind === 'chat_media_send' && payload.mediaType === 'document') {
    const [, url] = String(row.text ?? '').split('\n');
    return JSON.stringify({
      ...base,
      type: 'document',
      document: {
        name: payload.documentName || payload.fileName || 'Document',
        url: url || '',
        sizeLabel: payload.documentSizeLabel ?? null,
        typeLabel: payload.documentTypeLabel ?? null,
      },
    });
  }
  if (payload?.kind === 'chat_voice_send' || row.message_type === 'voice') {
    const voicePayload = payload?.kind === 'chat_voice_send' ? payload : null;
    return JSON.stringify({
      ...base,
      type: 'voice',
      text: '',
      voiceMessage: {
        duration: Number(row.audio_duration ?? voicePayload?.durationSeconds ?? 0),
        waveform: normalizeWaveform(row.audio_waveform ?? voicePayload?.waveform),
        isPlaying: false,
        audioPath: row.audio_path ?? undefined,
      },
    });
  }
  if (payload?.kind === 'chat_text_send') {
    const enriched = withRemoteMessageIdentity(
      payload.metadataJson,
      row,
      status ?? 'sent',
      payload.messageType ?? row.message_type ?? 'text',
    );
    if (enriched) return enriched;
  }
  return JSON.stringify(base);
};

export const toLocalMessageRow = (
  ownerUserId: string,
  threadId: string,
  row: RemoteMessageRow,
  payload?: ChatOutboxPayload | null,
): ChatMessageRow => {
  const isMine = row.sender_id === ownerUserId;
  const status: ChatMessageRow['status'] = isMine
    ? row.is_read ? 'read' : row.delivered_at ? 'delivered' : 'sent'
    : row.is_read ? 'read' : 'delivered';
  return {
    id: row.id,
    local_id: row.client_message_id ?? null,
    thread_id: threadId,
    owner_user_id: ownerUserId,
    sender_user_id: row.sender_id,
    receiver_user_id: row.receiver_id,
    body: row.text ?? '',
    message_type: row.message_type === 'audio'
      ? 'voice'
      : ((row.message_type ?? 'text') as ChatMessageRow['message_type']),
    status,
    direction: isMine ? 'outgoing' : 'incoming',
    created_at: row.created_at,
    server_created_at: row.created_at,
    edited_at: null,
    deleted_at: null,
    reply_to_message_id: row.reply_to_message_id ?? null,
    is_view_once: row.is_view_once ? 1 : 0,
    local_only: 0,
    error_code: null,
    metadata_json: buildMessageMetadataJson(row, payload, status),
    remote_updated_at: row.created_at,
    local_updated_at: new Date().toISOString(),
  };
};
