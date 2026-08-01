import type { ChatMessageRow, ChatPendingOutboxRow, ChatThreadRow } from '@/lib/chat/local/chat-db';
import { ChatRepository } from '@/lib/chat/local/chat-db';
import {
  buildDeterministicChatAttachmentPath,
  buildDeterministicChatPreviewPath,
  cancelChatAttachmentBatch,
  createLegacyChatAttachmentId,
  finalizeChatAttachment,
  finalizeChatAttachmentBatch,
} from '@/lib/chat/attachment-lifecycle';
import {
  normalizeAttachmentDurationMs,
  resolveAuthoritativeAttachmentByteSize,
} from '@/lib/chat/attachments/chat-attachment-metadata';
import {
  createChatAttachmentPreview,
  removeChatAttachmentPreview,
} from '@/lib/chat/attachments/chat-attachment-preview';
import { observeChatAttachmentLifecycle } from '@/lib/chat/attachments/chat-attachment-observability';
import { createChatOutboxFlushGate } from '@/lib/chat/outbox/chat-outbox-flush-gate';
import { ChatUploadTransport } from '@/lib/chat/transfer/chat-upload-transport';
import { persistOfflineAttachmentCopy } from '@/lib/offline/attachment-file-store';
import { removeStagedOfflineChatUpload } from '@/lib/offline/chat-store';
import { supabase } from '@/lib/supabase';
import { captureException, captureMessage } from '@/lib/telemetry/sentry';
import * as FileSystem from 'expo-file-system/legacy';

type TextOutboxPayload = {
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

type MediaOutboxPayload = {
  kind?: 'chat_media_send';
  senderId?: string;
  receiverId?: string;
  clientMessageId?: string | null;
  localUri?: string;
  fileName?: string;
  contentType?: string;
  mediaType?: 'image' | 'video' | 'document';
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
};

type MediaOutboxFile = {
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
};

type VoiceOutboxPayload = {
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

type ViewOnceOutboxPayload = {
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

type ChatOutboxPayload = TextOutboxPayload | MediaOutboxPayload | VoiceOutboxPayload | ViewOnceOutboxPayload;

type RemoteMessageRow = {
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

type FlushResult = {
  attemptedCount: number;
  sentCount: number;
  failedCount: number;
  touchedThreadIds: string[];
};

const REMOTE_MESSAGE_SELECT =
  'id,client_message_id,text,created_at,sender_id,receiver_id,is_read,delivered_at,message_type,reply_to_message_id,audio_path,audio_duration,audio_waveform,storage_path,media_items,media_expected_count,is_view_once,encrypted_media,encrypted_media_path,encrypted_key_sender,encrypted_key_receiver,encrypted_key_nonce,encrypted_media_nonce,encrypted_media_alg,encrypted_media_mime,encrypted_media_size';
const CHAT_MEDIA_BUCKET = 'chat-media' as const;
const VOICE_MESSAGES_BUCKET = 'voice-messages' as const;
const DOCUMENT_TEXT_PREFIX = '\u{1F4CE}';
const RETRY_DELAYS_MS = [5_000, 15_000, 45_000, 120_000, 300_000, 900_000, 1_800_000, 3_600_000];
const DURABLE_OUTBOX_MAX_ATTEMPTS = 48;
const scheduledOwnerFlushes = new Map<string, {
  timer: ReturnType<typeof setTimeout>;
  dueAt: number;
}>();
const outboxFlushGate = createChatOutboxFlushGate<FlushResult>();

const nowIso = () => new Date().toISOString();

const createLocalTextMetadataJson = (args: {
  id: string;
  text: string;
  senderId: string;
  createdAt: string;
  replyToMessageId?: string | null;
}) =>
  JSON.stringify({
    id: args.id,
    clientMessageId: args.id,
    text: args.text,
    senderId: args.senderId,
    timestamp: args.createdAt,
    type: 'text',
    reactions: [],
    status: 'queued',
    replyToId: args.replyToMessageId ?? null,
  });

const createQueuedTextOutboxRow = (args: {
  ownerUserId: string;
  threadId: string;
  localMessageId: string;
  text: string;
  replyToMessageId?: string | null;
  metadataJson: string;
}): ChatPendingOutboxRow => {
  const createdAt = nowIso();
  return {
    id: args.localMessageId,
    local_message_id: args.localMessageId,
    thread_id: args.threadId,
    owner_user_id: args.ownerUserId,
    payload_json: JSON.stringify({
      kind: 'chat_text_send',
      senderId: args.ownerUserId,
      receiverId: args.threadId,
      text: args.text,
      messageType: 'text',
      clientMessageId: args.localMessageId,
      replyToMessageId: args.replyToMessageId ?? null,
      metadataJson: args.metadataJson,
    }),
    attempt_count: 0,
    max_attempts: DURABLE_OUTBOX_MAX_ATTEMPTS,
    next_retry_at: null,
    status: 'queued',
    error_code: null,
    error_message: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
};

const ensureThreadShell = async (args: {
  ownerUserId: string;
  threadId: string;
  peerProfileId?: string | null;
  peerName?: string | null;
  peerAvatarUrl?: string | null;
}) => {
  const existing = await ChatRepository.getThreadById(args.ownerUserId, args.threadId);
  const now = nowIso();
  const thread: ChatThreadRow = {
    id: args.threadId,
    owner_user_id: args.ownerUserId,
    peer_user_id: existing?.peer_user_id ?? args.threadId,
    peer_profile_id: existing?.peer_profile_id ?? args.peerProfileId ?? null,
    peer_name: existing?.peer_name ?? args.peerName ?? null,
    peer_avatar_url: existing?.peer_avatar_url ?? args.peerAvatarUrl ?? null,
    peer_verified: existing?.peer_verified ?? 0,
    peer_presence_status: existing?.peer_presence_status ?? null,
    peer_last_active: existing?.peer_last_active ?? null,
    title: existing?.title ?? null,
    thread_type: existing?.thread_type ?? 'direct',
    last_message_id: existing?.last_message_id ?? null,
    last_message_preview: existing?.last_message_preview ?? null,
    last_message_sender_id: existing?.last_message_sender_id ?? null,
    last_message_status: existing?.last_message_status ?? null,
    last_message_edited_at: existing?.last_message_edited_at ?? null,
    last_message_reaction_emoji: existing?.last_message_reaction_emoji ?? null,
    last_message_reaction_user_id: existing?.last_message_reaction_user_id ?? null,
    last_message_reaction_created_at: existing?.last_message_reaction_created_at ?? null,
    last_message_reaction_target_type: existing?.last_message_reaction_target_type ?? null,
    last_activity_kind: existing?.last_activity_kind ?? null,
    last_activity_message_id: existing?.last_activity_message_id ?? null,
    last_activity_preview: existing?.last_activity_preview ?? null,
    last_activity_at: existing?.last_activity_at ?? null,
    last_message_at: existing?.last_message_at ?? null,
    unread_count: existing?.unread_count ?? 0,
    is_muted: existing?.is_muted ?? 0,
    is_pinned: existing?.is_pinned ?? 0,
    is_archived: existing?.is_archived ?? 0,
    local_status: existing?.local_status ?? 'active',
    remote_updated_at: existing?.remote_updated_at ?? null,
    local_updated_at: now,
    created_at: existing?.created_at ?? now,
  };

  await ChatRepository.upsertThreads(args.ownerUserId, [thread]);
};

const parseTextPayload = (item: ChatPendingOutboxRow): TextOutboxPayload | null => {
  try {
    const parsed = JSON.parse(item.payload_json) as TextOutboxPayload;
    if (!parsed || parsed.kind !== 'chat_text_send') return null;
    if (!parsed.senderId || !parsed.receiverId || typeof parsed.text !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
};

const parseOutboxPayload = (item: ChatPendingOutboxRow): ChatOutboxPayload | null => {
  try {
    const parsed = JSON.parse(item.payload_json) as ChatOutboxPayload;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
};

const assertOutboxNotCancelled = async (ownerUserId: string, localMessageId: string) => {
  const current = await ChatRepository.getOutboxItem(ownerUserId, localMessageId);
  if (current?.status === 'cancelled') {
    throw new Error('chat_upload_cancelled');
  }
};

const uploadQueuedPrivateChatMedia = async (
  payload: MediaOutboxPayload | ViewOnceOutboxPayload,
  file: Pick<MediaOutboxFile, 'localUri' | 'fileName' | 'contentType' | 'attachmentId' | 'byteSize'>,
) => {
  if (!payload.senderId || !payload.receiverId || !file.localUri || !file.fileName || !file.contentType) {
    throw new Error('invalid_media_payload');
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('unauthenticated_storage');

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('missing_supabase_upload_config');

  const clientMessageId = payload.clientMessageId?.trim();
  if (!clientMessageId) throw new Error('missing_client_message_id');
  const attachmentId = file.attachmentId?.trim() || await createLegacyChatAttachmentId(
    `${payload.senderId}:${payload.receiverId}:${clientMessageId}:${
      payload.kind === 'chat_view_once_send' ? payload.attachmentType : payload.mediaType || 'media'
    }`,
  );
  const filePath = buildDeterministicChatAttachmentPath({
    senderId: payload.senderId,
    receiverId: payload.receiverId,
    clientMessageId,
    attachmentId,
    fileName: file.fileName,
    mimeType: file.contentType,
  });
  await ChatUploadTransport.upload({
    bucket: CHAT_MEDIA_BUCKET,
    objectPath: filePath,
    localUri: file.localUri,
    fileName: file.fileName,
    contentType: file.contentType,
    byteSize: file.byteSize,
    accessToken,
    anonKey: supabaseAnonKey,
    supabaseUrl,
  });
  return filePath;
};

const sendViewOnceOutboxItem = async (
  item: ChatPendingOutboxRow,
  payload: ViewOnceOutboxPayload,
) => {
  if (
    !payload.senderId || !payload.receiverId || !payload.localUri ||
    !payload.fileName || !payload.contentType || !payload.attachmentId ||
    !payload.attachmentType || !payload.encryptedKeySender ||
    !payload.encryptedKeyReceiver || !payload.encryptedKeyNonce ||
    !payload.encryptedMediaNonce || !payload.senderPublicKey
  ) {
    await ChatRepository.markOutboxItemStatus(item.owner_user_id, item.local_message_id, 'failed', {
      code: 'invalid_payload',
      message: 'Invalid encrypted media outbox payload',
    });
    return { sent: false, threadId: item.thread_id };
  }

  const clientMessageId = payload.clientMessageId ?? item.local_message_id;
  await ChatRepository.markOutboxItemAttempting(item.owner_user_id, item.local_message_id);
  const canonicalBeforeUpload = await fetchExistingClientMessage(
    payload.senderId,
    clientMessageId,
  ).catch(() => null);
  if (canonicalBeforeUpload) {
    await ChatRepository.settleOutboxMessage(
      item.owner_user_id,
      item.thread_id,
      item.local_message_id,
      toLocalMessageRow(item.owner_user_id, item.thread_id, canonicalBeforeUpload, payload),
    );
    await removeStagedOfflineChatUpload(payload.localUri);
    return { sent: true, threadId: item.thread_id };
  }

  let remoteRow: RemoteMessageRow | null = null;
  try {
    const sourceInfo = await FileSystem.getInfoAsync(payload.localUri);
    if (!sourceInfo.exists) throw new Error('chat_upload_source_unavailable');
    observeChatAttachmentLifecycle('upload_started', {
      clientMessageId,
      attachmentId: payload.attachmentId,
      attachmentCount: 1,
      mediaType: `view_once_${payload.attachmentType}`,
      attemptCount: item.attempt_count + 1,
    });
    const encryptedPath = await uploadQueuedPrivateChatMedia(payload, {
      localUri: payload.localUri,
      fileName: payload.fileName,
      contentType: payload.contentType,
      attachmentId: payload.attachmentId,
      byteSize: payload.byteSize,
    });
    await assertOutboxNotCancelled(item.owner_user_id, item.local_message_id);
    observeChatAttachmentLifecycle('upload_completed', {
      clientMessageId,
      attachmentId: payload.attachmentId,
      attachmentCount: 1,
      mediaType: `view_once_${payload.attachmentType}`,
    });
    observeChatAttachmentLifecycle('finalize_started', {
      clientMessageId,
      attachmentId: payload.attachmentId,
      attachmentCount: 1,
      mediaType: `view_once_${payload.attachmentType}`,
    });
    remoteRow = await finalizeChatAttachment({
      receiverId: payload.receiverId,
      clientMessageId,
      attachmentId: payload.attachmentId,
      attachmentType: payload.attachmentType,
      bucketId: CHAT_MEDIA_BUCKET,
      storagePath: encryptedPath,
      originalName: payload.fileName.replace(/\.enc$/i, ''),
      mimeType: payload.contentType,
      byteSize: payload.byteSize ?? null,
      replyToMessageId: payload.replyToMessageId ?? null,
      isViewOnce: true,
      encryptedKeySender: payload.encryptedKeySender,
      encryptedKeyReceiver: payload.encryptedKeyReceiver,
      encryptedKeyNonce: payload.encryptedKeyNonce,
      encryptedMediaNonce: payload.encryptedMediaNonce,
      encryptedMediaAlg: 'nacl-secretbox',
      senderPublicKey: payload.senderPublicKey,
      attachmentIndex: 0,
      expectedCount: 1,
    }) as RemoteMessageRow;
    observeChatAttachmentLifecycle('ready', {
      clientMessageId,
      attachmentId: payload.attachmentId,
      attachmentCount: 1,
      mediaType: `view_once_${payload.attachmentType}`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('chat_upload_cancelled') || errorMessage.includes('attachment_batch_cancelled')) {
      await removeStagedOfflineChatUpload(payload.localUri);
      observeChatAttachmentLifecycle('cancelled', {
        clientMessageId,
        attachmentId: payload.attachmentId,
        attachmentCount: 1,
        mediaType: `view_once_${payload.attachmentType}`,
      });
      return { sent: false, threadId: item.thread_id };
    }
    if (errorMessage.includes('chat_upload_source_unavailable')) {
      await ChatRepository.markOutboxItemStatus(item.owner_user_id, item.local_message_id, 'failed', {
        code: 'attachment_source_missing',
        message: 'The encrypted staged file is no longer available. Choose the media again.',
      });
      return { sent: false, threadId: item.thread_id };
    }
    observeChatAttachmentLifecycle('failed', {
      clientMessageId,
      attachmentId: payload.attachmentId,
      attachmentCount: 1,
      mediaType: `view_once_${payload.attachmentType}`,
      attemptCount: item.attempt_count + 1,
    }, error);
    const existing = await fetchExistingClientMessage(payload.senderId, clientMessageId).catch(() => null);
    if (!existing) {
      await scheduleOutboxRetry(item, error, 'send_failed', 'Unable to send encrypted media');
      return { sent: false, threadId: item.thread_id };
    }
    remoteRow = existing;
  }

  if (remoteRow) {
    await ChatRepository.settleOutboxMessage(
      item.owner_user_id,
      item.thread_id,
      item.local_message_id,
      toLocalMessageRow(item.owner_user_id, item.thread_id, remoteRow, payload),
    );
  }
  await removeStagedOfflineChatUpload(payload.localUri);
  return { sent: Boolean(remoteRow), threadId: item.thread_id };
};

const uploadQueuedPrivateChatPreview = async (
  payload: MediaOutboxPayload,
  file: MediaOutboxFile,
) => {
  if (!payload.senderId || !payload.receiverId || !payload.clientMessageId || !file.previewLocalUri) {
    return null;
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!accessToken || !supabaseUrl || !anonKey) throw new Error('unauthenticated_storage');
  const path = buildDeterministicChatPreviewPath({
    senderId: payload.senderId,
    receiverId: payload.receiverId,
    clientMessageId: payload.clientMessageId,
    attachmentId: file.attachmentId,
  });
  await ChatUploadTransport.upload({
    bucket: CHAT_MEDIA_BUCKET,
    objectPath: path,
    localUri: file.previewLocalUri,
    fileName: `${file.attachmentId}-preview.jpg`,
    contentType: 'image/jpeg',
    byteSize: file.previewByteSize,
    accessToken,
    anonKey,
    supabaseUrl,
  });
  return path;
};

const uploadQueuedVoice = async (payload: VoiceOutboxPayload) => {
  if (!payload.senderId || !payload.receiverId || !payload.localUri || !payload.fileName || !payload.contentType) {
    throw new Error('invalid_voice_payload');
  }
  const clientMessageId = payload.clientMessageId?.trim();
  if (!clientMessageId) throw new Error('missing_client_message_id');
  const attachmentId = payload.attachmentId?.trim() || await createLegacyChatAttachmentId(
    `${payload.senderId}:${payload.receiverId}:${clientMessageId}:audio`,
  );
  payload.attachmentId = attachmentId;
  const filePath = buildDeterministicChatAttachmentPath({
    senderId: payload.senderId,
    receiverId: payload.receiverId,
    clientMessageId,
    attachmentId,
    fileName: payload.fileName,
    mimeType: payload.contentType,
  });
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!accessToken || !supabaseUrl || !supabaseAnonKey) throw new Error('unauthenticated_storage');
  await ChatUploadTransport.upload({
    bucket: VOICE_MESSAGES_BUCKET,
    objectPath: filePath,
    localUri: payload.localUri,
    fileName: payload.fileName,
    contentType: payload.contentType,
    accessToken,
    anonKey: supabaseAnonKey,
    supabaseUrl,
  });
  return filePath;
};

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
      previewStoragePath:
        typeof item.previewStoragePath === 'string' ? item.previewStoragePath : null,
    }))
    .filter((item) => item.attachmentId && item.storagePath)
    .sort((a, b) => a.index - b.index);
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
    const nextText =
      resolvedType === 'image' || resolvedType === 'video' || resolvedType === 'document'
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
      imageUrl:
        resolvedType === 'image'
          ? (typeof parsed.imageUrl === 'string' && parsed.imageUrl) || row.text || undefined
          : parsed.imageUrl,
      videoUrl:
        resolvedType === 'video'
          ? (typeof parsed.videoUrl === 'string' && parsed.videoUrl) || row.text || undefined
          : parsed.videoUrl,
      document:
        resolvedType === 'document'
          ? parsed.document
          : parsed.document,
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
  const timestamp = row.created_at;
  const messageType = payload?.kind === 'chat_media_send'
    ? payload.mediaType
    : payload?.kind === 'chat_view_once_send'
    ? payload.attachmentType
    : row.message_type === 'audio'
    ? 'voice'
    : row.message_type ?? 'text';
  const base = {
    id: row.id,
    clientMessageId: row.client_message_id ?? null,
    text: row.text ?? '',
    senderId: row.sender_id,
    timestamp,
    type: messageType === 'document' ? 'document' : messageType,
    reactions: [],
    status,
    replyToId: row.reply_to_message_id ?? null,
    storagePath: row.storage_path ?? null,
    mediaItems: normalizeRemoteMediaItems(row.media_items),
    mediaExpectedCount: row.media_expected_count ?? null,
    previewStoragePath:
      normalizeRemoteMediaItems(row.media_items)[0]?.previewStoragePath ?? null,
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

  if (payload?.kind === 'chat_media_send' && payload.mediaType === 'image') {
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

const toLocalMessageRow = (
  ownerUserId: string,
  threadId: string,
  row: RemoteMessageRow,
  payload?: ChatOutboxPayload | null,
): ChatMessageRow => {
  const isMine = row.sender_id === ownerUserId;
  const status: ChatMessageRow['status'] = isMine
    ? row.is_read
      ? 'read'
      : row.delivered_at
      ? 'delivered'
      : 'sent'
    : row.is_read
    ? 'read'
    : 'delivered';

  return {
    id: row.id,
    local_id: row.client_message_id ?? null,
    thread_id: threadId,
    owner_user_id: ownerUserId,
    sender_user_id: row.sender_id,
    receiver_user_id: row.receiver_id,
    body: row.text ?? '',
    message_type: row.message_type === 'audio' ? 'voice' : ((row.message_type ?? 'text') as ChatMessageRow['message_type']),
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

const fetchExistingClientMessage = async (senderId: string, clientMessageId: string) => {
  const { data, error } = await supabase
    .from('messages')
    .select(REMOTE_MESSAGE_SELECT)
    .eq('sender_id', senderId)
    .eq('client_message_id', clientMessageId)
    .maybeSingle();

  if (error) throw error;
  return data as RemoteMessageRow | null;
};

const getErrorInfo = (error: unknown, fallbackCode: string, fallbackMessage: string) => ({
  code: (error as { code?: string })?.code ?? fallbackCode,
  message: (error as { message?: string })?.message ?? fallbackMessage,
});

const getRetryDelayMs = (attemptCount: number) => {
  const index = Math.max(0, Math.min(attemptCount - 1, RETRY_DELAYS_MS.length - 1));
  return RETRY_DELAYS_MS[index];
};

const scheduleOwnerOutboxFlush = (ownerUserId: string, delayMs: number) => {
  const dueAt = Date.now() + Math.max(250, delayMs);
  const existing = scheduledOwnerFlushes.get(ownerUserId);
  if (existing && existing.dueAt <= dueAt) return;
  if (existing) clearTimeout(existing.timer);

  const timer = setTimeout(() => {
    scheduledOwnerFlushes.delete(ownerUserId);
    void ChatOutboxService.flushPending(ownerUserId).catch((error) => {
      captureException(error, { where: 'ChatOutboxService.scheduledFlush' });
    });
  }, Math.max(250, dueAt - Date.now()));
  scheduledOwnerFlushes.set(ownerUserId, { timer, dueAt });
};

const scheduleOutboxRetry = async (
  item: ChatPendingOutboxRow,
  error: unknown,
  fallbackCode: string,
  fallbackMessage: string,
) => {
  const errorInfo = getErrorInfo(error, fallbackCode, fallbackMessage);
  const attemptCount = item.attempt_count + 1;
  const payload = parseOutboxPayload(item);

  const errorCode = String(errorInfo.code || '').toLowerCase();
  const errorMessage = String(errorInfo.message || '').toLowerCase();
  const isPermanentFailure =
    errorCode === '42501' ||
    errorCode === '23514' ||
    errorCode === 'invalid_payload' ||
    errorCode.includes('attachment_size_invalid') ||
    errorCode.includes('attachment_content_mismatch') ||
    errorCode.includes('attachment_metadata_invalid') ||
    errorCode.includes('unsupported_attachment') ||
    errorMessage.includes('attachment_size_invalid') ||
    errorMessage.includes('attachment_content_mismatch') ||
    errorMessage.includes('violates check constraint') ||
    errorMessage.includes('row-level security') ||
    errorMessage.includes('messaging unavailable') ||
    errorMessage.includes('not allowed');

  if (isPermanentFailure || attemptCount >= item.max_attempts) {
    await ChatRepository.markOutboxItemStatus(item.owner_user_id, item.local_message_id, 'failed', errorInfo);
    if (
      payload?.kind === 'chat_media_send' ||
      payload?.kind === 'chat_voice_send' ||
      payload?.kind === 'chat_view_once_send'
    ) {
      observeChatAttachmentLifecycle('failed', {
        clientMessageId: payload.clientMessageId ?? item.local_message_id,
        attachmentId: payload.attachmentId,
        attachmentCount: payload.kind === 'chat_media_send' ? payload.albumItems?.length ?? 1 : 1,
        mediaType: payload.kind === 'chat_media_send'
          ? payload.mediaType
          : payload.kind === 'chat_view_once_send'
          ? `view_once_${payload.attachmentType}`
          : 'audio',
        attemptCount,
      }, error);
    }
    if (__DEV__) {
      console.log('[chat][outbox] permanently-failed', {
        kind: parseOutboxPayload(item)?.kind ?? 'unknown',
        attemptCount,
        code: errorInfo.code,
        message: errorInfo.message,
      });
    }
    return;
  }

  const retryDelayMs = getRetryDelayMs(attemptCount);
  await ChatRepository.markOutboxItemStatus(item.owner_user_id, item.local_message_id, 'queued', errorInfo, {
    nextRetryAt: new Date(Date.now() + retryDelayMs).toISOString(),
  });
  if (
    payload?.kind === 'chat_media_send' ||
    payload?.kind === 'chat_voice_send' ||
    payload?.kind === 'chat_view_once_send'
  ) {
    observeChatAttachmentLifecycle('retry_scheduled', {
      clientMessageId: payload.clientMessageId ?? item.local_message_id,
      attachmentId: payload.attachmentId,
      attachmentCount: payload.kind === 'chat_media_send' ? payload.albumItems?.length ?? 1 : 1,
      mediaType: payload.kind === 'chat_media_send'
        ? payload.mediaType
        : payload.kind === 'chat_view_once_send'
        ? `view_once_${payload.attachmentType}`
        : 'audio',
      attemptCount,
    });
  }
  scheduleOwnerOutboxFlush(item.owner_user_id, retryDelayMs + 100);
  if (__DEV__) {
    console.log('[chat][outbox] retry-scheduled', {
      kind: parseOutboxPayload(item)?.kind ?? 'unknown',
      attemptCount,
      retryDelayMs,
      code: errorInfo.code,
      message: errorInfo.message,
    });
  }
};

const sendTextOutboxItem = async (item: ChatPendingOutboxRow) => {
  const payload = parseTextPayload(item);
  if (!payload) {
    await ChatRepository.markOutboxItemStatus(item.owner_user_id, item.local_message_id, 'failed', {
      code: 'invalid_payload',
      message: 'Invalid chat outbox payload',
    });
    return { sent: false, threadId: item.thread_id };
  }

  const clientMessageId = payload.clientMessageId ?? item.local_message_id;
  await ChatRepository.markOutboxItemAttempting(item.owner_user_id, item.local_message_id);

  const { data, error } = await supabase
    .from('messages')
    .insert({
      text: payload.text,
      client_message_id: clientMessageId,
      sender_id: payload.senderId,
      receiver_id: payload.receiverId,
      is_read: false,
      message_type: payload.messageType ?? 'text',
      reply_to_message_id: payload.replyToMessageId ?? null,
      storage_path: payload.storagePath ?? null,
    })
    .select(REMOTE_MESSAGE_SELECT)
    .single();

  if (error && (error as { code?: string }).code !== '23505') {
    await scheduleOutboxRetry(item, error, 'send_failed', 'Unable to send queued message');
    return { sent: false, threadId: item.thread_id };
  }

  const remoteRow = (data as RemoteMessageRow | null) ?? (await fetchExistingClientMessage(payload.senderId, clientMessageId));
  if (remoteRow) {
    await ChatRepository.upsertMessages(item.owner_user_id, item.thread_id, [
      toLocalMessageRow(item.owner_user_id, item.thread_id, remoteRow, payload),
    ]);
  }
  await ChatRepository.markOutboxItemStatus(item.owner_user_id, item.local_message_id, 'sent');
  return { sent: true, threadId: item.thread_id };
};

const sendMediaOutboxItem = async (item: ChatPendingOutboxRow, payload: MediaOutboxPayload) => {
  if (!payload.senderId || !payload.receiverId || !payload.localUri || !payload.fileName || !payload.contentType || !payload.mediaType) {
    await ChatRepository.markOutboxItemStatus(item.owner_user_id, item.local_message_id, 'failed', {
      code: 'invalid_payload',
      message: 'Invalid chat media outbox payload',
    });
    return { sent: false, threadId: item.thread_id };
  }

  const clientMessageId = payload.clientMessageId ?? item.local_message_id;
  await ChatRepository.markOutboxItemAttempting(item.owner_user_id, item.local_message_id);
  const albumItems = payload.mediaType === 'image' && payload.albumItems && payload.albumItems.length > 1
    ? payload.albumItems
    : null;
  const files: MediaOutboxFile[] = albumItems ?? [{
    localUri: payload.localUri,
    fileName: payload.fileName,
    contentType: payload.contentType,
    attachmentId: payload.attachmentId || await createLegacyChatAttachmentId(
      `${payload.senderId}:${payload.receiverId}:${clientMessageId}:${payload.mediaType}`,
    ),
    byteSize: payload.byteSize,
    width: payload.width,
    height: payload.height,
    durationMs: payload.durationMs,
  }];
  const canonicalBeforeUpload = await fetchExistingClientMessage(
    payload.senderId,
    clientMessageId,
  ).catch(() => null);
  if (canonicalBeforeUpload) {
    await ChatRepository.settleOutboxMessage(
      item.owner_user_id,
      item.thread_id,
      item.local_message_id,
      toLocalMessageRow(item.owner_user_id, item.thread_id, canonicalBeforeUpload, payload),
    );
    await Promise.all(files.flatMap((file) => [
      removeStagedOfflineChatUpload(file.localUri),
      removeChatAttachmentPreview(file.previewLocalUri),
    ]));
    return { sent: true, threadId: item.thread_id };
  }
  let remoteRow: RemoteMessageRow | null = null;
  try {
    const finalizedAttachments: Parameters<typeof finalizeChatAttachmentBatch>[0]['attachments'] = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const sourceInfo = await FileSystem.getInfoAsync(file.localUri);
      if (!sourceInfo.exists) {
        throw new Error('chat_upload_source_unavailable');
      }
      observeChatAttachmentLifecycle('upload_started', {
        clientMessageId,
        attachmentId: file.attachmentId,
        attachmentIndex: index,
        attachmentCount: files.length,
        mediaType: payload.mediaType,
        attemptCount: item.attempt_count + 1,
      });
      if (__DEV__) {
        console.log('[chat][outbox] media-upload-started', {
          mediaType: payload.mediaType,
          attachmentIndex: index,
          attachmentCount: files.length,
          attemptCount: item.attempt_count + 1,
        });
      }
      const storagePath = await uploadQueuedPrivateChatMedia(payload, file);
      await assertOutboxNotCancelled(item.owner_user_id, item.local_message_id);
      observeChatAttachmentLifecycle('upload_completed', {
        clientMessageId,
        attachmentId: file.attachmentId,
        attachmentIndex: index,
        attachmentCount: files.length,
        mediaType: payload.mediaType,
      });
      let preview = file.previewLocalUri
        ? {
            localUri: file.previewLocalUri,
            mimeType: 'image/jpeg' as const,
            byteSize: file.previewByteSize ?? null,
            width: file.previewWidth ?? null,
            height: file.previewHeight ?? null,
          }
        : null;
      if ((payload.mediaType === 'image' || payload.mediaType === 'video') && !preview) {
        preview = await createChatAttachmentPreview({
          attachmentId: file.attachmentId,
          kind: payload.mediaType,
          localUri: file.localUri,
          width: file.width,
          height: file.height,
        });
        if (preview) {
          file.previewLocalUri = preview.localUri;
          file.previewContentType = preview.mimeType;
          file.previewByteSize = preview.byteSize;
          file.previewWidth = preview.width;
          file.previewHeight = preview.height;
        }
      }
      const previewStoragePath = preview
        ? await uploadQueuedPrivateChatPreview(payload, file)
        : null;
      await assertOutboxNotCancelled(item.owner_user_id, item.local_message_id);
      if (previewStoragePath) {
        observeChatAttachmentLifecycle('preview_completed', {
          clientMessageId,
          attachmentId: file.attachmentId,
          attachmentIndex: index,
          attachmentCount: files.length,
          mediaType: payload.mediaType,
        });
      }
      const fileInfo = await FileSystem.getInfoAsync(file.localUri);
      const byteSize = resolveAuthoritativeAttachmentByteSize({
        localFileInfo: fileInfo,
        declaredByteSize: file.byteSize,
      });
      finalizedAttachments.push({
        receiverId: payload.receiverId,
        clientMessageId,
        attachmentId: file.attachmentId,
        attachmentType: payload.mediaType,
        bucketId: CHAT_MEDIA_BUCKET,
        storagePath,
        originalName: payload.documentName || file.fileName,
        mimeType: file.contentType,
        byteSize,
        width: file.width,
        height: file.height,
        durationMs: normalizeAttachmentDurationMs(file.durationMs),
        caption: payload.mediaType === 'document'
          ? `${DOCUMENT_TEXT_PREFIX} ${[
              payload.documentName || file.fileName,
              payload.documentSizeLabel,
              payload.documentTypeLabel,
            ].filter(Boolean).join(' | ')}`
          : '',
        replyToMessageId: payload.replyToMessageId ?? null,
        attachmentIndex: index,
        expectedCount: files.length,
        previewStoragePath,
        previewMimeType: preview?.mimeType ?? null,
        previewByteSize: preview?.byteSize ?? null,
        previewWidth: preview?.width ?? null,
        previewHeight: preview?.height ?? null,
      });
      if (payload.mediaType === 'document') {
        await persistOfflineAttachmentCopy({
          sourceKey: `document:${storagePath}`,
          localUri: file.localUri,
          category: 'document',
          fileName: payload.documentName || file.fileName,
        }).catch(() => null);
      }
      if (__DEV__) {
        console.log('[chat][outbox] media-finalized', {
          mediaType: payload.mediaType,
          attachmentIndex: index,
          attachmentCount: files.length,
          byteSize,
        });
      }
    }
    observeChatAttachmentLifecycle('finalize_started', {
      clientMessageId,
      attachmentCount: files.length,
      mediaType: payload.mediaType,
    });
    await assertOutboxNotCancelled(item.owner_user_id, item.local_message_id);
    remoteRow = await finalizeChatAttachmentBatch({
      receiverId: payload.receiverId,
      clientMessageId,
      attachmentType: payload.mediaType,
      caption: payload.mediaType === 'document'
        ? `${DOCUMENT_TEXT_PREFIX} ${[
            payload.documentName || payload.fileName,
            payload.documentSizeLabel,
            payload.documentTypeLabel,
          ].filter(Boolean).join(' | ')}`
        : '',
      replyToMessageId: payload.replyToMessageId ?? null,
      attachments: finalizedAttachments,
    }) as RemoteMessageRow;
    observeChatAttachmentLifecycle('ready', {
      clientMessageId,
      attachmentCount: files.length,
      mediaType: payload.mediaType,
    });
  } catch (error) {
    observeChatAttachmentLifecycle('failed', {
      clientMessageId,
      attachmentCount: files.length,
      mediaType: payload.mediaType,
      attemptCount: item.attempt_count + 1,
    }, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('chat_upload_cancelled') || errorMessage.includes('attachment_batch_cancelled')) {
      observeChatAttachmentLifecycle('cancelled', {
        clientMessageId,
        attachmentCount: files.length,
        mediaType: payload.mediaType,
      });
      await Promise.all(files.flatMap((file) => [
        removeStagedOfflineChatUpload(file.localUri),
        removeChatAttachmentPreview(file.previewLocalUri),
      ]));
      return { sent: false, threadId: item.thread_id };
    }
    if (errorMessage.includes('chat_upload_source_unavailable')) {
      await ChatRepository.markOutboxItemStatus(item.owner_user_id, item.local_message_id, 'failed', {
        code: 'attachment_source_missing',
        message: 'The original file is no longer available. Choose it again to resend.',
      });
      const remoteAttachments = files.map((file) => ({
        attachmentId: file.attachmentId,
        bucketId: CHAT_MEDIA_BUCKET,
        storagePath: buildDeterministicChatAttachmentPath({
          senderId: payload.senderId!,
          receiverId: payload.receiverId!,
          clientMessageId,
          attachmentId: file.attachmentId,
          fileName: file.fileName,
          mimeType: file.contentType,
        }),
        previewStoragePath:
          payload.mediaType === 'image' || payload.mediaType === 'video'
            ? buildDeterministicChatPreviewPath({
                senderId: payload.senderId!,
                receiverId: payload.receiverId!,
                clientMessageId,
                attachmentId: file.attachmentId,
              })
            : null,
      }));
      await cancelChatAttachmentBatch({
        receiverId: payload.receiverId!,
        clientMessageId,
        attachments: remoteAttachments,
      }).catch(() => undefined);
      await Promise.all(files.map((file) => removeChatAttachmentPreview(file.previewLocalUri)));
      return { sent: false, threadId: item.thread_id };
    }
    if (files.length > 1) {
      // A partially uploaded album is not delivered. Retrying is safe because
      // every object path and attachment index is deterministic/idempotent.
      await scheduleOutboxRetry(item, error, 'album_send_incomplete', 'Unable to finish the photo album');
      return { sent: false, threadId: item.thread_id };
    }
    const existing = await fetchExistingClientMessage(payload.senderId, clientMessageId).catch(() => null);
    if (!existing) {
      await scheduleOutboxRetry(item, error, 'send_failed', 'Unable to finalize queued media');
      return { sent: false, threadId: item.thread_id };
    }
    remoteRow = existing;
  }

  if (remoteRow) {
    await ChatRepository.settleOutboxMessage(
      item.owner_user_id,
      item.thread_id,
      item.local_message_id,
      toLocalMessageRow(item.owner_user_id, item.thread_id, remoteRow, payload),
    );
  } else {
    await ChatRepository.markOutboxItemStatus(item.owner_user_id, item.local_message_id, 'sent');
  }
  await Promise.all(files.flatMap((file) => [
    removeStagedOfflineChatUpload(file.localUri),
    removeChatAttachmentPreview(file.previewLocalUri),
  ]));
  return { sent: true, threadId: item.thread_id };
};

const sendVoiceOutboxItem = async (item: ChatPendingOutboxRow, payload: VoiceOutboxPayload) => {
  if (!payload.senderId || !payload.receiverId || !payload.localUri || !payload.fileName || !payload.contentType) {
    await ChatRepository.markOutboxItemStatus(item.owner_user_id, item.local_message_id, 'failed', {
      code: 'invalid_payload',
      message: 'Invalid chat voice outbox payload',
    });
    return { sent: false, threadId: item.thread_id };
  }

  const clientMessageId = payload.clientMessageId ?? item.local_message_id;
  await ChatRepository.markOutboxItemAttempting(item.owner_user_id, item.local_message_id);
  const canonicalBeforeUpload = await fetchExistingClientMessage(
    payload.senderId,
    clientMessageId,
  ).catch(() => null);
  if (canonicalBeforeUpload) {
    await ChatRepository.settleOutboxMessage(
      item.owner_user_id,
      item.thread_id,
      item.local_message_id,
      toLocalMessageRow(item.owner_user_id, item.thread_id, canonicalBeforeUpload, payload),
    );
    await removeStagedOfflineChatUpload(payload.localUri);
    return { sent: true, threadId: item.thread_id };
  }
  let remoteRow: RemoteMessageRow | null = null;
  try {
    const sourceInfo = await FileSystem.getInfoAsync(payload.localUri);
    if (!sourceInfo.exists) throw new Error('chat_upload_source_unavailable');
    observeChatAttachmentLifecycle('upload_started', {
      clientMessageId,
      attachmentId: payload.attachmentId,
      attachmentCount: 1,
      mediaType: 'audio',
      attemptCount: item.attempt_count + 1,
    });
    const audioPath = await uploadQueuedVoice(payload);
    observeChatAttachmentLifecycle('upload_completed', {
      clientMessageId,
      attachmentId: payload.attachmentId,
      attachmentCount: 1,
      mediaType: 'audio',
    });
    await assertOutboxNotCancelled(item.owner_user_id, item.local_message_id);
    const byteSize = 'size' in sourceInfo && typeof sourceInfo.size === 'number' ? sourceInfo.size : null;
    observeChatAttachmentLifecycle('finalize_started', {
      clientMessageId,
      attachmentId: payload.attachmentId,
      attachmentCount: 1,
      mediaType: 'audio',
    });
    remoteRow = await finalizeChatAttachmentBatch({
      receiverId: payload.receiverId,
      clientMessageId,
      attachmentType: 'audio',
      attachments: [{
        receiverId: payload.receiverId,
        clientMessageId,
        attachmentId: payload.attachmentId!,
        attachmentType: 'audio',
        bucketId: VOICE_MESSAGES_BUCKET,
        storagePath: audioPath,
        originalName: payload.fileName,
        mimeType: payload.contentType,
        byteSize,
        durationMs: Math.max(0, Math.round((payload.durationSeconds ?? 0) * 1000)),
        waveform: payload.waveform ?? [],
        attachmentIndex: 0,
        expectedCount: 1,
      }],
      replyToMessageId: payload.replyToMessageId ?? null,
    }) as RemoteMessageRow;
    observeChatAttachmentLifecycle('ready', {
      clientMessageId,
      attachmentId: payload.attachmentId,
      attachmentCount: 1,
      mediaType: 'audio',
    });
    await persistOfflineAttachmentCopy({
      sourceKey: `voice:${audioPath}`,
      localUri: payload.localUri,
      category: 'audio',
      fileName: payload.fileName,
    }).catch(() => null);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('chat_upload_cancelled') || errorMessage.includes('attachment_batch_cancelled')) {
      observeChatAttachmentLifecycle('cancelled', {
        clientMessageId,
        attachmentId: payload.attachmentId,
        attachmentCount: 1,
        mediaType: 'audio',
      });
      await removeStagedOfflineChatUpload(payload.localUri);
      return { sent: false, threadId: item.thread_id };
    }
    if (errorMessage.includes('chat_upload_source_unavailable')) {
      await ChatRepository.markOutboxItemStatus(item.owner_user_id, item.local_message_id, 'failed', {
        code: 'attachment_source_missing',
        message: 'The original recording is no longer available. Record it again to resend.',
      });
      return { sent: false, threadId: item.thread_id };
    }
    observeChatAttachmentLifecycle('failed', {
      clientMessageId,
      attachmentId: payload.attachmentId,
      attachmentCount: 1,
      mediaType: 'audio',
      attemptCount: item.attempt_count + 1,
    }, error);
    const existing = await fetchExistingClientMessage(payload.senderId, clientMessageId).catch(() => null);
    if (!existing) {
      await scheduleOutboxRetry(item, error, 'send_failed', 'Unable to finalize queued voice message');
      return { sent: false, threadId: item.thread_id };
    }
    remoteRow = existing;
  }
  if (remoteRow) {
    await ChatRepository.settleOutboxMessage(
      item.owner_user_id,
      item.thread_id,
      item.local_message_id,
      toLocalMessageRow(item.owner_user_id, item.thread_id, remoteRow, payload),
    );
  } else {
    await ChatRepository.markOutboxItemStatus(item.owner_user_id, item.local_message_id, 'sent');
  }
  await removeStagedOfflineChatUpload(payload.localUri);
  return { sent: true, threadId: item.thread_id };
};

const sendOutboxItem = async (item: ChatPendingOutboxRow) => {
  const payload = parseOutboxPayload(item);
  if (payload?.kind === 'chat_media_send') return sendMediaOutboxItem(item, payload);
  if (payload?.kind === 'chat_voice_send') return sendVoiceOutboxItem(item, payload);
  if (payload?.kind === 'chat_view_once_send') return sendViewOnceOutboxItem(item, payload);
  return sendTextOutboxItem(item);
};

export const ChatOutboxService = {
  async cancelMessage(ownerUserId: string, localMessageId: string) {
    const item = await ChatRepository.getOutboxItem(ownerUserId, localMessageId);
    if (!item || item.status === 'sent' || item.status === 'cancelled') return false;
    const payload = parseOutboxPayload(item);
    await ChatRepository.markOutboxItemStatus(ownerUserId, localMessageId, 'cancelled');

    if (payload?.kind === 'chat_media_send' && payload.receiverId) {
      const clientMessageId = payload.clientMessageId ?? localMessageId;
      const files = payload.albumItems?.length
        ? payload.albumItems
        : payload.attachmentId && payload.fileName && payload.contentType && payload.localUri
          ? [{
              attachmentId: payload.attachmentId,
              fileName: payload.fileName,
              contentType: payload.contentType,
              localUri: payload.localUri,
              byteSize: payload.byteSize,
              previewLocalUri: null,
            }]
          : [];
      const remoteAttachments = files.map((file) => ({
        attachmentId: file.attachmentId,
        bucketId: CHAT_MEDIA_BUCKET,
        storagePath: buildDeterministicChatAttachmentPath({
          senderId: ownerUserId,
          receiverId: payload.receiverId!,
          clientMessageId,
          attachmentId: file.attachmentId,
          fileName: file.fileName,
          mimeType: file.contentType,
        }),
        previewStoragePath:
          payload.mediaType === 'image' || payload.mediaType === 'video'
            ? buildDeterministicChatPreviewPath({
                senderId: ownerUserId,
                receiverId: payload.receiverId!,
                clientMessageId,
                attachmentId: file.attachmentId,
              })
            : null,
      }));
      await Promise.all(remoteAttachments.map((attachment) =>
        ChatUploadTransport.cancel({
          bucket: attachment.bucketId,
          objectPath: attachment.storagePath,
          byteSize: 0,
          contentType: 'application/octet-stream',
        }).catch(() => false),
      ));
      await cancelChatAttachmentBatch({
        receiverId: payload.receiverId,
        clientMessageId,
        attachments: remoteAttachments,
      }).catch((error) => {
        observeChatAttachmentLifecycle('cleanup_failed', {
          clientMessageId,
          attachmentCount: remoteAttachments.length,
          mediaType: payload.mediaType,
        }, error);
        captureException(error, { tags: { area: 'chat_attachment_cancel_cleanup' } });
      });
      await Promise.all(files.flatMap((file) => [
        removeStagedOfflineChatUpload(file.localUri),
        removeChatAttachmentPreview(file.previewLocalUri),
      ]));
      observeChatAttachmentLifecycle('cancelled', {
        clientMessageId,
        attachmentCount: files.length,
        mediaType: payload.mediaType,
      });
    } else if (
      payload?.kind === 'chat_view_once_send' &&
      payload.receiverId &&
      payload.localUri &&
      payload.fileName &&
      payload.contentType &&
      payload.attachmentId
    ) {
      const clientMessageId = payload.clientMessageId ?? localMessageId;
      const storagePath = buildDeterministicChatAttachmentPath({
        senderId: ownerUserId,
        receiverId: payload.receiverId,
        clientMessageId,
        attachmentId: payload.attachmentId,
        fileName: payload.fileName,
        mimeType: payload.contentType,
      });
      await ChatUploadTransport.cancel({
        bucket: CHAT_MEDIA_BUCKET,
        objectPath: storagePath,
        byteSize: payload.byteSize ?? 0,
        contentType: payload.contentType,
      }).catch(() => false);
      await cancelChatAttachmentBatch({
        receiverId: payload.receiverId,
        clientMessageId,
        attachments: [{
          attachmentId: payload.attachmentId,
          bucketId: CHAT_MEDIA_BUCKET,
          storagePath,
          previewStoragePath: null,
        }],
      }).catch((error) => {
        observeChatAttachmentLifecycle('cleanup_failed', {
          clientMessageId,
          attachmentId: payload.attachmentId,
          attachmentCount: 1,
          mediaType: `view_once_${payload.attachmentType}`,
        }, error);
      });
      await removeStagedOfflineChatUpload(payload.localUri);
      observeChatAttachmentLifecycle('cancelled', {
        clientMessageId,
        attachmentId: payload.attachmentId,
        attachmentCount: 1,
        mediaType: `view_once_${payload.attachmentType}`,
      });
    } else if (
      payload?.kind === 'chat_voice_send' &&
      payload.receiverId &&
      payload.localUri &&
      payload.fileName &&
      payload.contentType
    ) {
      const clientMessageId = payload.clientMessageId ?? localMessageId;
      const attachmentId = payload.attachmentId?.trim() || await createLegacyChatAttachmentId(
        `${ownerUserId}:${payload.receiverId}:${clientMessageId}:audio`,
      );
      const storagePath = buildDeterministicChatAttachmentPath({
        senderId: ownerUserId,
        receiverId: payload.receiverId,
        clientMessageId,
        attachmentId,
        fileName: payload.fileName,
        mimeType: payload.contentType,
      });
      await ChatUploadTransport.cancel({
        bucket: VOICE_MESSAGES_BUCKET,
        objectPath: storagePath,
        byteSize: 0,
        contentType: payload.contentType,
      }).catch(() => false);
      await cancelChatAttachmentBatch({
        receiverId: payload.receiverId,
        clientMessageId,
        attachments: [{
          attachmentId,
          bucketId: VOICE_MESSAGES_BUCKET,
          storagePath,
          previewStoragePath: null,
        }],
      }).catch((error) => {
        observeChatAttachmentLifecycle('cleanup_failed', {
          clientMessageId,
          attachmentId,
          attachmentCount: 1,
          mediaType: 'audio',
        }, error);
      });
      await removeStagedOfflineChatUpload(payload.localUri);
      observeChatAttachmentLifecycle('cancelled', {
        clientMessageId,
        attachmentId,
        attachmentCount: 1,
        mediaType: 'audio',
      });
    }
    return true;
  },

  async retryMessage(ownerUserId: string, localMessageId: string) {
    const requeued = await ChatRepository.requeueOutboxItem(
      ownerUserId,
      localMessageId,
      DURABLE_OUTBOX_MAX_ATTEMPTS,
    );
    if (!requeued) return { requeued: false, result: null };
    const result = await ChatOutboxService.flushPending(ownerUserId);
    return { requeued: true, result };
  },

  async queueTextMessage(args: {
    ownerUserId: string;
    threadId: string;
    text: string;
    peerProfileId?: string | null;
    peerName?: string | null;
    peerAvatarUrl?: string | null;
    replyToMessageId?: string | null;
    flush?: boolean;
  }) {
    const trimmedText = args.text.trim();
    if (!trimmedText) {
      throw new Error('empty_quick_reply');
    }

    const createdAt = nowIso();
    const localMessageId = `temp-text-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const metadataJson = createLocalTextMetadataJson({
      id: localMessageId,
      text: trimmedText,
      senderId: args.ownerUserId,
      createdAt,
      replyToMessageId: args.replyToMessageId ?? null,
    });

    await ensureThreadShell({
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      peerProfileId: args.peerProfileId ?? null,
      peerName: args.peerName ?? null,
      peerAvatarUrl: args.peerAvatarUrl ?? null,
    });

    await ChatRepository.upsertMessages(args.ownerUserId, args.threadId, [
      {
        id: localMessageId,
        local_id: localMessageId,
        thread_id: args.threadId,
        owner_user_id: args.ownerUserId,
        sender_user_id: args.ownerUserId,
        receiver_user_id: args.threadId,
        body: trimmedText,
        message_type: 'text',
        status: 'pending',
        direction: 'outgoing',
        created_at: createdAt,
        server_created_at: null,
        edited_at: null,
        deleted_at: null,
        reply_to_message_id: args.replyToMessageId ?? null,
        is_view_once: 0,
        local_only: 1,
        error_code: null,
        metadata_json: metadataJson,
        remote_updated_at: null,
        local_updated_at: createdAt,
      },
    ]);

    await ChatRepository.upsertPendingOutboxItem(
      args.ownerUserId,
      createQueuedTextOutboxRow({
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        localMessageId,
        text: trimmedText,
        replyToMessageId: args.replyToMessageId ?? null,
        metadataJson,
      }),
    );

    if (args.flush !== false) {
      await ChatOutboxService.flushPending(args.ownerUserId);
    }

    return { localMessageId };
  },

  async flushPending(ownerUserId: string, options?: { limit?: number }): Promise<FlushResult> {
    return outboxFlushGate.run(ownerUserId, async () => {
      const items = await ChatRepository.getPendingOutboxItems(ownerUserId, { limit: options?.limit ?? 25 });
      if (items.length > 0) {
        captureMessage('chat_outbox_flush_started', { attemptedCount: items.length });
      }
      const touchedThreadIds = new Set<string>();
      let sentCount = 0;
      let failedCount = 0;

      for (const item of items) {
        touchedThreadIds.add(item.thread_id);
        try {
          const result = await sendOutboxItem(item);
          if (result.sent) sentCount += 1;
          else failedCount += 1;
        } catch (error) {
          failedCount += 1;
          captureException(error, {
            where: 'ChatOutboxService.flushPending',
            localMessageId: item.local_message_id,
            threadId: item.thread_id,
          });
          await scheduleOutboxRetry(item, error, 'flush_failed', 'Unable to flush chat outbox');
        }
      }

      if (items.length > 0) {
        captureMessage(failedCount > 0 ? 'chat_outbox_flush_failed' : 'chat_outbox_flush_succeeded', {
          attemptedCount: items.length,
          sentCount,
          failedCount,
          touchedThreadCount: touchedThreadIds.size,
        });
      }

      await ChatRepository.purgeTerminalOutboxItems(
        ownerUserId,
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      ).catch((error) => {
        captureException(error, { where: 'ChatOutboxService.purgeTerminalOutboxItems' });
      });

      return {
        attemptedCount: items.length,
        sentCount,
        failedCount,
        touchedThreadIds: Array.from(touchedThreadIds),
      };
    });
  },
};
