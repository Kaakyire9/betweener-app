import type { ChatMessageRow, ChatPendingOutboxRow, ChatThreadRow } from '@/lib/chat/local/chat-db';
import { ChatRepository } from '@/lib/chat/local/chat-db';
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
  replyToMessageId?: string | null;
  documentName?: string | null;
  documentSizeLabel?: string | null;
  documentTypeLabel?: string | null;
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
};

type ChatOutboxPayload = TextOutboxPayload | MediaOutboxPayload | VoiceOutboxPayload;

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
};

type FlushResult = {
  attemptedCount: number;
  sentCount: number;
  failedCount: number;
  touchedThreadIds: string[];
};

const REMOTE_MESSAGE_SELECT =
  'id,client_message_id,text,created_at,sender_id,receiver_id,is_read,delivered_at,message_type,reply_to_message_id,audio_path,audio_duration,audio_waveform';
const CHAT_MEDIA_BUCKET = 'chat-media';
const VOICE_MESSAGES_BUCKET = 'voice-messages';
const DOCUMENT_TEXT_PREFIX = '\u{1F4CE}';
const RETRY_DELAYS_MS = [5_000, 15_000, 45_000, 120_000, 300_000, 900_000, 1_800_000, 3_600_000];

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
    max_attempts: 5,
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

const encodeStoragePath = (path: string) =>
  path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const uploadQueuedPublicChatMedia = async (payload: MediaOutboxPayload) => {
  if (!payload.senderId || !payload.localUri || !payload.fileName || !payload.contentType) {
    throw new Error('invalid_media_payload');
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('unauthenticated_storage');

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('missing_supabase_upload_config');

  const filePath = `${payload.senderId}/${Date.now()}-${payload.fileName}`;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${CHAT_MEDIA_BUCKET}/${encodeStoragePath(filePath)}?upsert=true`;
  const task = FileSystem.createUploadTask(uploadUrl, payload.localUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'Content-Type': payload.contentType,
      Authorization: `Bearer ${accessToken}`,
      apikey: supabaseAnonKey,
      'x-upsert': 'true',
    },
  });
  const result = await task.uploadAsync();
  if (!result) throw new Error('Upload failed (no response)');
  if (result.status < 200 || result.status >= 300) {
    const uploadError = new Error(result.body || `Upload failed (HTTP ${result.status})`);
    (uploadError as { status?: number }).status = result.status;
    throw uploadError;
  }
  const { data } = supabase.storage.from(CHAT_MEDIA_BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
};

const uploadQueuedVoice = async (payload: VoiceOutboxPayload) => {
  if (!payload.senderId || !payload.localUri || !payload.fileName || !payload.contentType) {
    throw new Error('invalid_voice_payload');
  }
  const filePath = `${payload.senderId}/${Date.now()}-${payload.fileName}`;
  const response = await fetch(payload.localUri);
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const { data, error } = await supabase.storage
    .from(VOICE_MESSAGES_BUCKET)
    .upload(filePath, bytes, { contentType: payload.contentType, upsert: true });
  if (error) throw error;
  return data?.path ?? filePath;
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
  };

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
        url: url || row.text || '',
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
    is_view_once: 0,
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

const scheduleOutboxRetry = async (
  item: ChatPendingOutboxRow,
  error: unknown,
  fallbackCode: string,
  fallbackMessage: string,
) => {
  const errorInfo = getErrorInfo(error, fallbackCode, fallbackMessage);
  const attemptCount = item.attempt_count + 1;

  if (attemptCount >= item.max_attempts) {
    await ChatRepository.markOutboxItemStatus(item.owner_user_id, item.local_message_id, 'failed', errorInfo);
    return;
  }

  await ChatRepository.markOutboxItemStatus(item.owner_user_id, item.local_message_id, 'queued', errorInfo, {
    nextRetryAt: new Date(Date.now() + getRetryDelayMs(attemptCount)).toISOString(),
  });
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
  const publicUrl = await uploadQueuedPublicChatMedia(payload);
  const documentText =
    payload.mediaType === 'document'
      ? `${DOCUMENT_TEXT_PREFIX} ${[
          payload.documentName || payload.fileName,
          payload.documentSizeLabel,
          payload.documentTypeLabel,
        ].filter(Boolean).join(' | ')}\n${publicUrl}`
      : publicUrl;

  const { data, error } = await supabase
    .from('messages')
    .insert({
      text: documentText,
      client_message_id: clientMessageId,
      sender_id: payload.senderId,
      receiver_id: payload.receiverId,
      is_read: false,
      message_type: payload.mediaType === 'document' ? 'text' : payload.mediaType,
      reply_to_message_id: payload.replyToMessageId ?? null,
    })
    .select(REMOTE_MESSAGE_SELECT)
    .single();

  if (error && (error as { code?: string }).code !== '23505') {
    await scheduleOutboxRetry(item, error, 'send_failed', 'Unable to send queued media');
    return { sent: false, threadId: item.thread_id };
  }

  const remoteRow = (data as RemoteMessageRow | null) ?? (await fetchExistingClientMessage(payload.senderId, clientMessageId));
  if (remoteRow) {
    await ChatRepository.upsertMessages(item.owner_user_id, item.thread_id, [
      toLocalMessageRow(item.owner_user_id, item.thread_id, remoteRow, payload),
    ]);
  }
  await ChatRepository.markOutboxItemStatus(item.owner_user_id, item.local_message_id, 'sent');
  await removeStagedOfflineChatUpload(payload.localUri);
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
  const audioPath = await uploadQueuedVoice(payload);
  const { data, error } = await supabase
    .from('messages')
    .insert({
      text: '',
      client_message_id: clientMessageId,
      sender_id: payload.senderId,
      receiver_id: payload.receiverId,
      is_read: false,
      message_type: 'voice',
      audio_path: audioPath,
      audio_duration: payload.durationSeconds ?? 0,
      audio_waveform: payload.waveform ?? [],
      reply_to_message_id: payload.replyToMessageId ?? null,
    })
    .select(REMOTE_MESSAGE_SELECT)
    .single();

  if (error && (error as { code?: string }).code !== '23505') {
    await scheduleOutboxRetry(item, error, 'send_failed', 'Unable to send queued voice message');
    return { sent: false, threadId: item.thread_id };
  }

  const remoteRow = (data as RemoteMessageRow | null) ?? (await fetchExistingClientMessage(payload.senderId, clientMessageId));
  if (remoteRow) {
    await ChatRepository.upsertMessages(item.owner_user_id, item.thread_id, [
      toLocalMessageRow(item.owner_user_id, item.thread_id, remoteRow, payload),
    ]);
  }
  await ChatRepository.markOutboxItemStatus(item.owner_user_id, item.local_message_id, 'sent');
  await removeStagedOfflineChatUpload(payload.localUri);
  return { sent: true, threadId: item.thread_id };
};

const sendOutboxItem = async (item: ChatPendingOutboxRow) => {
  const payload = parseOutboxPayload(item);
  if (payload?.kind === 'chat_media_send') return sendMediaOutboxItem(item, payload);
  if (payload?.kind === 'chat_voice_send') return sendVoiceOutboxItem(item, payload);
  return sendTextOutboxItem(item);
};

export const ChatOutboxService = {
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

    return {
      attemptedCount: items.length,
      sentCount,
      failedCount,
      touchedThreadIds: Array.from(touchedThreadIds),
    };
  },
};
