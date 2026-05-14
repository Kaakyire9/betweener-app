import { addEventListener, fetch as fetchNetInfo } from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';

import { isLikelyNetworkError } from '@/lib/network';
import { removeStagedOfflineChatUpload } from '@/lib/offline/chat-store';
import { readOfflineData, writeOfflineEnvelope } from '@/lib/offline/core';
import { supabase } from '@/lib/supabase';

const OFFLINE_MUTATION_QUEUE_KEY = 'offline:mutation-queue:v1';
const OFFLINE_MUTATION_FAILED_KEY = 'offline:mutation-failed:v1';
const MAX_MUTATION_ATTEMPTS = 8;
const AUTO_DRAIN_INTERVAL_MS = 30_000;
const CHAT_MEDIA_BUCKET = 'chat-media';
const VOICE_MESSAGES_BUCKET = 'voice-messages';
const DOCUMENT_TEXT_PREFIX = '\u{1F4CE}';
const RETRY_DELAYS_MS = [
  5_000,
  15_000,
  45_000,
  2 * 60_000,
  5 * 60_000,
  15 * 60_000,
  30 * 60_000,
  60 * 60_000,
];

type SwipeSyncPayload = {
  userId: string;
  targetId: string;
  action: 'LIKE' | 'PASS' | 'SUPERLIKE';
  mirrorIntent: boolean;
  message?: string | null;
};

type ProfileImageReactionSyncPayload = {
  profileId: string;
  imageUrl: string;
  reactorUserId: string;
  emoji: string | null;
};

type ProfileNoteCreatePayload = {
  profileId: string;
  senderId: string;
  note: string;
};

type ChatTextSendPayload = {
  senderId: string;
  receiverId: string;
  text: string;
  replyToMessageId?: string | null;
};

type ChatReactionSyncPayload = {
  messageId: string;
  userId: string;
  emoji: string | null;
};

type ChatMediaSendPayload = {
  senderId: string;
  receiverId: string;
  localUri: string;
  fileName: string;
  contentType: string;
  mediaType: 'image' | 'video' | 'document';
  replyToMessageId?: string | null;
  documentName?: string | null;
  documentSizeLabel?: string | null;
  documentTypeLabel?: string | null;
};

type ChatVoiceSendPayload = {
  senderId: string;
  receiverId: string;
  localUri: string;
  fileName: string;
  contentType: string;
  durationSeconds: number;
  waveform: number[];
  replyToMessageId?: string | null;
};

type IntentRequestCreatePayload = {
  recipientId: string;
  type: 'connect' | 'date_request' | 'like_with_note' | 'circle_intro';
  message?: string | null;
  suggestedTime?: string | null;
  suggestedPlace?: string | null;
  metadata?: Record<string, unknown> | null;
};

type IntentRequestDecisionPayload = {
  requestId: string;
  decision: 'accept' | 'pass';
  insertAcceptanceSystemMessages?: boolean;
};

type IntentRequestCancelPayload = {
  requestId: string;
};

type ProfileUpdatePayload = {
  userId: string;
  updates: Record<string, unknown>;
  updatedAt: string;
};

type ProfileInterestsUpdatePayload = {
  profileId: string;
  interests: string[];
};

type LocalProfileMediaUpload = {
  localUri: string;
  fileName: string;
  contentType: string;
};

type ProfileMediaSyncPayload = {
  userId: string;
  avatar?: LocalProfileMediaUpload | null;
  photos?: string[] | null;
  photoItems?: LocalProfileMediaUpload[];
  video?: (LocalProfileMediaUpload & { previousPath?: string | null }) | null;
  updatedAt: string;
};

export type OfflineMutation =
  | {
      id: string;
      dedupeKey: string;
      kind: 'swipe_sync';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: SwipeSyncPayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'profile_image_reaction_sync';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: ProfileImageReactionSyncPayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'profile_note_create';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: ProfileNoteCreatePayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'chat_text_send';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: ChatTextSendPayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'chat_reaction_sync';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: ChatReactionSyncPayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'chat_media_send';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: ChatMediaSendPayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'chat_voice_send';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: ChatVoiceSendPayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'intent_request_create';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: IntentRequestCreatePayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'intent_request_decision';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: IntentRequestDecisionPayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'intent_request_cancel';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: IntentRequestCancelPayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'profile_update';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: ProfileUpdatePayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'profile_interests_update';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: ProfileInterestsUpdatePayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'profile_media_sync';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      nextAttemptAt?: number | null;
      lastError?: string | null;
      payload: ProfileMediaSyncPayload;
    };

export type FailedOfflineMutation = OfflineMutation & {
  failedAt: number;
  failureReason: string;
};

type QueueListener = (size: number) => void;
type QueueMutationEvent =
  | { type: 'completed'; mutation: OfflineMutation }
  | { type: 'failed'; mutation: FailedOfflineMutation }
  | { type: 'queued'; mutation: OfflineMutation };
type QueueMutationListener = (event: QueueMutationEvent) => void;

const listeners = new Set<QueueListener>();
const mutationListeners = new Set<QueueMutationListener>();
let drainInFlight: Promise<void> | null = null;

const emitQueueSize = (size: number) => {
  listeners.forEach((listener) => {
    try {
      listener(size);
    } catch {
      // ignore listener failures
    }
  });
};

const emitMutationEvent = (event: QueueMutationEvent) => {
  mutationListeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // ignore listener errors
    }
  });
};

const buildOfflineMutationId = () =>
  `mutation:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

const buildSwipeDedupeKey = (payload: SwipeSyncPayload) =>
  `swipe_sync:${payload.userId}:${payload.targetId}`;

const buildProfileImageReactionDedupeKey = (payload: ProfileImageReactionSyncPayload) =>
  `profile_image_reaction_sync:${payload.profileId}:${payload.imageUrl}:${payload.reactorUserId}`;

const buildProfileNoteDedupeKey = (payload: ProfileNoteCreatePayload) =>
  `profile_note_create:${payload.profileId}:${payload.senderId}:${payload.note.trim().toLowerCase()}`;

const buildChatTextSendDedupeKey = (payload: ChatTextSendPayload) =>
  `chat_text_send:${payload.senderId}:${payload.receiverId}:${payload.text.trim().toLowerCase()}:${payload.replyToMessageId ?? 'root'}:${Date.now()}`;

const buildChatReactionDedupeKey = (payload: ChatReactionSyncPayload) =>
  `chat_reaction_sync:${payload.messageId}:${payload.userId}`;

const buildChatMediaSendDedupeKey = (payload: ChatMediaSendPayload) =>
  `chat_media_send:${payload.senderId}:${payload.receiverId}:${payload.localUri}:${Date.now()}`;

const buildChatVoiceSendDedupeKey = (payload: ChatVoiceSendPayload) =>
  `chat_voice_send:${payload.senderId}:${payload.receiverId}:${payload.localUri}:${Date.now()}`;

const buildIntentRequestCreateDedupeKey = (payload: IntentRequestCreatePayload) =>
  `intent_request_create:${payload.recipientId}:${payload.type}:${String(payload.message ?? '').trim().toLowerCase()}:${Date.now()}`;

const buildIntentRequestDecisionDedupeKey = (payload: IntentRequestDecisionPayload) =>
  `intent_request_decision:${payload.requestId}`;

const buildIntentRequestCancelDedupeKey = (payload: IntentRequestCancelPayload) =>
  `intent_request_cancel:${payload.requestId}`;

const buildProfileUpdateDedupeKey = (payload: ProfileUpdatePayload) =>
  `profile_update:${payload.userId}`;

const buildProfileInterestsUpdateDedupeKey = (payload: ProfileInterestsUpdatePayload) =>
  `profile_interests_update:${payload.profileId}`;

const buildProfileMediaSyncDedupeKey = (payload: ProfileMediaSyncPayload) =>
  `profile_media_sync:${payload.userId}`;

const stringifyMutationError = (error: unknown) => {
  const message =
    typeof error === 'string'
      ? error
      : (error as any)?.message || (error as any)?.error_description || (error as any)?.details || 'mutation_failed';
  const code = (error as any)?.code || (error as any)?.status || (error as any)?.name;
  return [code, message].filter(Boolean).join(': ').slice(0, 500);
};

const getRetryDelayMs = (attempts: number) => {
  const index = Math.max(0, Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1));
  return RETRY_DELAYS_MS[index] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]!;
};

const isRetryableMutationError = (error: unknown) => {
  if (isLikelyNetworkError(error)) return true;
  const status = Number((error as any)?.status ?? (error as any)?.statusCode ?? 0);
  if ([408, 425, 429].includes(status)) return true;
  if (status >= 500 && status <= 599) return true;
  const lower = String((error as any)?.message || error || '').toLowerCase();
  return (
    lower.includes('temporarily unavailable') ||
    lower.includes('service unavailable') ||
    lower.includes('too many requests')
  );
};

const isBenignIntentQueueError = (error: unknown) => {
  const lower = String((error as any)?.message || error || '').toLowerCase();
  return (
    lower.includes('already sent') ||
    lower.includes('already placed') ||
    lower.includes('request pending') ||
    lower.includes('already have a request') ||
    lower.includes('already matched') ||
    lower.includes('request not found or expired')
  );
};

async function readMutationQueue(): Promise<OfflineMutation[]> {
  const data = await readOfflineData<OfflineMutation[]>(OFFLINE_MUTATION_QUEUE_KEY);
  return Array.isArray(data) ? data : [];
}

async function readFailedMutationQueue(): Promise<FailedOfflineMutation[]> {
  const data = await readOfflineData<FailedOfflineMutation[]>(OFFLINE_MUTATION_FAILED_KEY);
  return Array.isArray(data) ? data : [];
}

async function writeMutationQueue(queue: OfflineMutation[]) {
  await writeOfflineEnvelope(OFFLINE_MUTATION_QUEUE_KEY, queue, { kind: 'mutation-queue' });
  emitQueueSize(queue.length);
}

async function writeFailedMutationQueue(queue: FailedOfflineMutation[]) {
  await writeOfflineEnvelope(OFFLINE_MUTATION_FAILED_KEY, queue.slice(-100), { kind: 'mutation-failed' });
}

async function replaceQueue(updater: (current: OfflineMutation[]) => OfflineMutation[]) {
  const current = await readMutationQueue();
  const next = updater(current);
  await writeMutationQueue(next);
  return next;
}

async function moveMutationToFailed(mutation: OfflineMutation, failureReason: string) {
  const failed = await readFailedMutationQueue();
  const failedMutation = {
    ...mutation,
    failedAt: Date.now(),
    failureReason,
  };
  await writeFailedMutationQueue([
    ...failed,
    failedMutation,
  ]);
  emitMutationEvent({ type: 'failed', mutation: failedMutation });
  return replaceQueue((existing) => existing.filter((item) => item.id !== mutation.id));
}

async function canDrainNow() {
  try {
    const state = await fetchNetInfo();
    if (state.isConnected === false) return false;
    if (state.isInternetReachable === false) return false;
    return true;
  } catch {
    return true;
  }
}

async function processSwipeSync(payload: SwipeSyncPayload) {
  const { error: swipeError } = await supabase.from('swipes').upsert(
    [
      {
        swiper_id: payload.userId,
        target_id: payload.targetId,
        action: payload.action,
      },
    ],
    { onConflict: 'swiper_id,target_id' },
  );
  if (swipeError) throw swipeError;

  if (!payload.mirrorIntent) return;

  const { error: intentError } = await supabase.rpc('rpc_create_intent_request', {
    p_recipient_id: payload.targetId,
    p_type: 'like_with_note',
    p_message: payload.message ?? null,
    p_metadata: {
      source: 'swipe',
      swipe_action: payload.action.toLowerCase(),
    },
  });
  if (intentError) throw intentError;
}

async function processProfileImageReactionSync(payload: ProfileImageReactionSyncPayload) {
  if (!payload.emoji) {
    const { error } = await supabase
      .from('profile_image_reactions')
      .delete()
      .eq('profile_id', payload.profileId)
      .eq('image_url', payload.imageUrl)
      .eq('reactor_user_id', payload.reactorUserId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('profile_image_reactions')
    .upsert(
      {
        profile_id: payload.profileId,
        image_url: payload.imageUrl,
        reactor_user_id: payload.reactorUserId,
        emoji: payload.emoji,
      },
      { onConflict: 'profile_id,image_url,reactor_user_id' },
    );
  if (error) throw error;
}

async function processProfileNoteCreate(payload: ProfileNoteCreatePayload) {
  const { error } = await supabase.from('profile_notes').insert({
    profile_id: payload.profileId,
    sender_id: payload.senderId,
    note: payload.note,
  });
  if (error) throw error;
}

async function processChatTextSend(payload: ChatTextSendPayload) {
  const { error } = await supabase.from('messages').insert({
    text: payload.text,
    sender_id: payload.senderId,
    receiver_id: payload.receiverId,
    is_read: false,
    message_type: 'text',
    reply_to_message_id: payload.replyToMessageId ?? null,
  });
  if (error) throw error;
}

const encodeStoragePath = (path: string) =>
  path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

async function uploadQueuedPublicChatMedia(payload: ChatMediaSendPayload) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error('unauthenticated_storage');
  }

  const filePath = `${payload.senderId}/${Date.now()}-${payload.fileName}`;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('missing_supabase_upload_config');
  }

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
  if (!result) {
    throw new Error('Upload failed (no response)');
  }
  if (result.status < 200 || result.status >= 300) {
    const uploadError = new Error(result.body || `Upload failed (HTTP ${result.status})`);
    (uploadError as any).status = result.status;
    throw uploadError;
  }

  const { data } = supabase.storage.from(CHAT_MEDIA_BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

async function uploadQueuedVoice(payload: ChatVoiceSendPayload) {
  const filePath = `${payload.senderId}/${Date.now()}-${payload.fileName}`;
  const response = await fetch(payload.localUri);
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const { data, error } = await supabase.storage
    .from(VOICE_MESSAGES_BUCKET)
    .upload(filePath, bytes, { contentType: payload.contentType, upsert: true });
  if (error) throw error;
  return data?.path ?? filePath;
}

async function processChatReactionSync(payload: ChatReactionSyncPayload) {
  if (!payload.emoji) {
    const { error } = await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', payload.messageId)
      .eq('user_id', payload.userId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('message_reactions').upsert(
    {
      message_id: payload.messageId,
      user_id: payload.userId,
      emoji: payload.emoji,
    },
    { onConflict: 'message_id,user_id' },
  );
  if (error) throw error;
}

async function processChatMediaSend(payload: ChatMediaSendPayload) {
  const publicUrl = await uploadQueuedPublicChatMedia(payload);
  const documentText =
    payload.mediaType === 'document'
      ? `${DOCUMENT_TEXT_PREFIX} ${[
          payload.documentName || payload.fileName,
          payload.documentSizeLabel,
          payload.documentTypeLabel,
        ].filter(Boolean).join(' | ')}\n${publicUrl}`
      : publicUrl;

  const { error } = await supabase.from('messages').insert({
    text: documentText,
    sender_id: payload.senderId,
    receiver_id: payload.receiverId,
    is_read: false,
    message_type: payload.mediaType === 'document' ? 'text' : payload.mediaType,
    reply_to_message_id: payload.replyToMessageId ?? null,
  });
  if (error) throw error;
  await removeStagedOfflineChatUpload(payload.localUri);
}

async function processChatVoiceSend(payload: ChatVoiceSendPayload) {
  const audioPath = await uploadQueuedVoice(payload);
  const { error } = await supabase.from('messages').insert({
    text: '',
    sender_id: payload.senderId,
    receiver_id: payload.receiverId,
    is_read: false,
    message_type: 'voice',
    audio_path: audioPath,
    audio_duration: payload.durationSeconds,
    audio_waveform: payload.waveform,
    reply_to_message_id: payload.replyToMessageId ?? null,
  });
  if (error) throw error;
  await removeStagedOfflineChatUpload(payload.localUri);
}

async function processIntentRequestCreate(payload: IntentRequestCreatePayload) {
  const { error } = await supabase.rpc('rpc_create_intent_request', {
    p_recipient_id: payload.recipientId,
    p_type: payload.type,
    p_message: payload.message ?? null,
    p_suggested_time: payload.suggestedTime ?? null,
    p_suggested_place: payload.suggestedPlace ?? null,
    p_metadata: payload.metadata ?? {},
  });
  if (error && !isBenignIntentQueueError(error)) throw error;
}

async function processIntentRequestDecision(payload: IntentRequestDecisionPayload) {
  const { error } = await supabase.rpc('rpc_decide_intent_request', {
    p_request_id: payload.requestId,
    p_decision: payload.decision,
  });
  if (error) {
    if (isBenignIntentQueueError(error)) return;
    throw error;
  }

  if (payload.decision === 'accept' && payload.insertAcceptanceSystemMessages !== false) {
    const { error: systemError } = await supabase.rpc('rpc_insert_request_acceptance_system_messages', {
      p_request_id: payload.requestId,
    });
    if (systemError) throw systemError;
  }
}

async function processIntentRequestCancel(payload: IntentRequestCancelPayload) {
  const { error } = await supabase.rpc('rpc_cancel_intent_request', {
    p_request_id: payload.requestId,
  });
  if (error && !isBenignIntentQueueError(error)) throw error;
}

async function processProfileUpdate(payload: ProfileUpdatePayload) {
  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        ...payload.updates,
        user_id: payload.userId,
        updated_at: payload.updatedAt,
      },
      { onConflict: 'user_id' },
    );
  if (error) throw error;
}

async function processProfileInterestsUpdate(payload: ProfileInterestsUpdatePayload) {
  const { error: deleteError } = await supabase
    .from('profile_interests')
    .delete()
    .eq('profile_id', payload.profileId);
  if (deleteError) throw deleteError;

  if (!payload.interests.length) return;

  const { data: interestData, error: interestError } = await supabase
    .from('interests')
    .select('id, name')
    .in('name', payload.interests);
  if (interestError) throw interestError;

  const profileInterests = (interestData ?? []).map((interest: any) => ({
    profile_id: payload.profileId,
    interest_id: interest.id,
  }));

  if (!profileInterests.length) return;

  const { error: insertError } = await supabase
    .from('profile_interests')
    .insert(profileInterests);
  if (insertError) throw insertError;
}

async function uploadQueuedStorageObject(params: {
  bucket: string;
  localUri: string;
  filePath: string;
  contentType: string;
  upsert?: boolean;
}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error('unauthenticated_storage');
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('missing_supabase_upload_config');
  }

  const uploadUrl = `${supabaseUrl}/storage/v1/object/${params.bucket}/${encodeStoragePath(params.filePath)}?upsert=${params.upsert ? 'true' : 'false'}`;
  const task = FileSystem.createUploadTask(uploadUrl, params.localUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'Content-Type': params.contentType,
      Authorization: `Bearer ${accessToken}`,
      apikey: supabaseAnonKey,
      'x-upsert': params.upsert ? 'true' : 'false',
    },
  });

  const result = await task.uploadAsync();
  if (!result) {
    throw new Error('Upload failed (no response)');
  }
  if (result.status < 200 || result.status >= 300) {
    const uploadError = new Error(result.body || `Upload failed (HTTP ${result.status})`);
    (uploadError as any).status = result.status;
    throw uploadError;
  }
}

async function uploadQueuedProfilePhoto(userId: string, item: LocalProfileMediaUpload) {
  const filePath = `${userId}/${Date.now()}-${item.fileName}`;
  await uploadQueuedStorageObject({
    bucket: 'profile-photos',
    localUri: item.localUri,
    filePath,
    contentType: item.contentType,
  });
  const { data } = supabase.storage.from('profile-photos').getPublicUrl(filePath);
  return data.publicUrl;
}

async function uploadQueuedProfileVideo(userId: string, item: LocalProfileMediaUpload) {
  const filePath = `${userId}/profile-video-${Date.now()}-${item.fileName}`;
  await uploadQueuedStorageObject({
    bucket: 'profile-videos',
    localUri: item.localUri,
    filePath,
    contentType: item.contentType,
  });
  return filePath;
}

async function processProfileMediaSync(payload: ProfileMediaSyncPayload) {
  const updates: Record<string, unknown> = {};

  if (payload.avatar?.localUri) {
    updates.avatar_url = await uploadQueuedProfilePhoto(payload.userId, payload.avatar);
  }

  const photoItems = payload.photoItems ?? [];
  if (payload.photos && photoItems.length > 0) {
    const replacementByLocalUri: Record<string, string> = {};
    for (const item of photoItems) {
      replacementByLocalUri[item.localUri] = await uploadQueuedProfilePhoto(payload.userId, item);
    }
    updates.photos = payload.photos
      .map((photo) => replacementByLocalUri[photo] ?? photo)
      .filter((photo) => typeof photo === 'string' && photo.length > 0);
  }

  if (payload.video?.localUri) {
    const nextPath = await uploadQueuedProfileVideo(payload.userId, payload.video);
    updates.profile_video = nextPath;
    if (payload.video.previousPath && !payload.video.previousPath.startsWith('http')) {
      try {
        await supabase.storage.from('profile-videos').remove([payload.video.previousPath]);
      } catch {
        // best effort cleanup
      }
    }
  }

  if (Object.keys(updates).length === 0) return;

  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        ...updates,
        user_id: payload.userId,
        updated_at: payload.updatedAt,
      },
      { onConflict: 'user_id' },
    );
  if (error) throw error;
}

async function processMutation(mutation: OfflineMutation) {
  switch (mutation.kind) {
    case 'swipe_sync':
      await processSwipeSync(mutation.payload);
      return;
    case 'profile_image_reaction_sync':
      await processProfileImageReactionSync(mutation.payload);
      return;
    case 'profile_note_create':
      await processProfileNoteCreate(mutation.payload);
      return;
    case 'chat_text_send':
      await processChatTextSend(mutation.payload);
      return;
    case 'chat_reaction_sync':
      await processChatReactionSync(mutation.payload);
      return;
    case 'chat_media_send':
      await processChatMediaSend(mutation.payload);
      return;
    case 'chat_voice_send':
      await processChatVoiceSend(mutation.payload);
      return;
    case 'intent_request_create':
      await processIntentRequestCreate(mutation.payload);
      return;
    case 'intent_request_decision':
      await processIntentRequestDecision(mutation.payload);
      return;
    case 'intent_request_cancel':
      await processIntentRequestCancel(mutation.payload);
      return;
    case 'profile_update':
      await processProfileUpdate(mutation.payload);
      return;
    case 'profile_interests_update':
      await processProfileInterestsUpdate(mutation.payload);
      return;
    case 'profile_media_sync':
      await processProfileMediaSync(mutation.payload);
      return;
    default:
      return;
  }
}

export async function enqueueSwipeSyncMutation(payload: SwipeSyncPayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildSwipeDedupeKey(payload),
    kind: 'swipe_sync',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
}

export async function enqueueProfileImageReactionSyncMutation(payload: ProfileImageReactionSyncPayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildProfileImageReactionDedupeKey(payload),
    kind: 'profile_image_reaction_sync',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
}

export async function enqueueProfileNoteCreateMutation(payload: ProfileNoteCreatePayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildProfileNoteDedupeKey(payload),
    kind: 'profile_note_create',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
}

export async function enqueueChatTextSendMutation(payload: ChatTextSendPayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildChatTextSendDedupeKey(payload),
    kind: 'chat_text_send',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => [...current, mutation]);
}

export async function enqueueChatReactionSyncMutation(payload: ChatReactionSyncPayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildChatReactionDedupeKey(payload),
    kind: 'chat_reaction_sync',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
}

export async function enqueueChatMediaSendMutation(payload: ChatMediaSendPayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildChatMediaSendDedupeKey(payload),
    kind: 'chat_media_send',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => [...current, mutation]);
}

export async function enqueueChatVoiceSendMutation(payload: ChatVoiceSendPayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildChatVoiceSendDedupeKey(payload),
    kind: 'chat_voice_send',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => [...current, mutation]);
}

export async function enqueueIntentRequestCreateMutation(payload: IntentRequestCreatePayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildIntentRequestCreateDedupeKey(payload),
    kind: 'intent_request_create',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => [...current, mutation]);
  emitMutationEvent({ type: 'queued', mutation });
}

export async function enqueueIntentRequestDecisionMutation(payload: IntentRequestDecisionPayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildIntentRequestDecisionDedupeKey(payload),
    kind: 'intent_request_decision',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
  emitMutationEvent({ type: 'queued', mutation });
}

export async function enqueueIntentRequestCancelMutation(payload: IntentRequestCancelPayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildIntentRequestCancelDedupeKey(payload),
    kind: 'intent_request_cancel',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
  emitMutationEvent({ type: 'queued', mutation });
}

export async function enqueueProfileUpdateMutation(payload: ProfileUpdatePayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildProfileUpdateDedupeKey(payload),
    kind: 'profile_update',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
  emitMutationEvent({ type: 'queued', mutation });
}

export async function enqueueProfileInterestsUpdateMutation(payload: ProfileInterestsUpdatePayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildProfileInterestsUpdateDedupeKey(payload),
    kind: 'profile_interests_update',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
  emitMutationEvent({ type: 'queued', mutation });
}

export async function enqueueProfileMediaSyncMutation(payload: ProfileMediaSyncPayload) {
  const mutation: OfflineMutation = {
    id: buildOfflineMutationId(),
    dedupeKey: buildProfileMediaSyncDedupeKey(payload),
    kind: 'profile_media_sync',
    createdAt: Date.now(),
    attempts: 0,
    payload,
  };

  await replaceQueue((current) => {
    const filtered = current.filter((item) => item.dedupeKey !== mutation.dedupeKey);
    return [...filtered, mutation];
  });
  emitMutationEvent({ type: 'queued', mutation });
}

export async function hasPendingSwipeSyncMutation(
  userId: string,
  targetId: string,
  actions?: SwipeSyncPayload['action'][],
) {
  const queue = await readMutationQueue();
  return queue.some((item) => {
    if (item.kind !== 'swipe_sync') return false;
    if (item.payload.userId !== userId || item.payload.targetId !== targetId) return false;
    if (!actions?.length) return true;
    return actions.includes(item.payload.action);
  });
}

export async function getPendingProfileImageReactionMap(profileId: string, reactorUserId?: string | null) {
  const queue = await readMutationQueue();
  const next: Record<string, string | null> = {};

  queue.forEach((item) => {
    if (item.kind !== 'profile_image_reaction_sync') return;
    if (item.payload.profileId !== profileId) return;
    if (reactorUserId && item.payload.reactorUserId !== reactorUserId) return;
    next[item.payload.imageUrl] = item.payload.emoji;
  });

  return next;
}

export async function getPendingOfflineMutationCount() {
  const queue = await readMutationQueue();
  return queue.length;
}

export async function getOfflineMutationQueueSnapshot() {
  const [pending, failed] = await Promise.all([
    readMutationQueue(),
    readFailedMutationQueue(),
  ]);
  const now = Date.now();
  return {
    pendingCount: pending.length,
    failedCount: failed.length,
    readyCount: pending.filter((item) => !item.nextAttemptAt || item.nextAttemptAt <= now).length,
    nextAttemptAt:
      pending
        .map((item) => item.nextAttemptAt)
        .filter((value): value is number => typeof value === 'number' && value > now)
        .sort((a, b) => a - b)[0] ?? null,
    pending,
    failed,
  };
}

export async function getIntentOfflineMutationSnapshot() {
  const { pending, failed } = await getOfflineMutationQueueSnapshot();
  return {
    pending: pending.filter((item) =>
      item.kind === 'intent_request_create' ||
      item.kind === 'intent_request_decision' ||
      item.kind === 'intent_request_cancel',
    ),
    failed: failed.filter((item) =>
      item.kind === 'intent_request_create' ||
      item.kind === 'intent_request_decision' ||
      item.kind === 'intent_request_cancel',
    ),
  };
}

export async function drainOfflineMutationQueue() {
  if (drainInFlight) return drainInFlight;

  drainInFlight = (async () => {
    if (!(await canDrainNow())) return;

    let queue = await readMutationQueue();
    if (!queue.length) return;

    while (queue.length > 0) {
      const current = queue[0]!;
      if (current.nextAttemptAt && current.nextAttemptAt > Date.now()) {
        break;
      }

      const nextCurrent = {
        ...current,
        attempts: current.attempts + 1,
        lastAttemptAt: Date.now(),
        nextAttemptAt: null,
        lastError: null,
      } as OfflineMutation;

      await replaceQueue((existing) => {
        if (!existing.length) return existing;
        const [head, ...rest] = existing;
        if (!head || head.id !== current.id) return existing;
        return [nextCurrent, ...rest];
      });

      try {
        await processMutation(nextCurrent);
        emitMutationEvent({ type: 'completed', mutation: nextCurrent });
        queue = await replaceQueue((existing) => existing.filter((item) => item.id !== current.id));
      } catch (error) {
        const failureReason = stringifyMutationError(error);
        const failedCurrent = {
          ...nextCurrent,
          lastError: failureReason,
        } as OfflineMutation;

        if (isRetryableMutationError(error) && nextCurrent.attempts < MAX_MUTATION_ATTEMPTS) {
          const nextAttemptAt = Date.now() + getRetryDelayMs(nextCurrent.attempts);
          await replaceQueue((existing) =>
            existing.map((item) =>
              item.id === current.id
                ? {
                    ...failedCurrent,
                    nextAttemptAt,
                  } as OfflineMutation
                : item,
            ),
          );
          break;
        }

        if (nextCurrent.attempts >= MAX_MUTATION_ATTEMPTS) {
          queue = await moveMutationToFailed(failedCurrent, failureReason);
          continue;
        }

        queue = await moveMutationToFailed(failedCurrent, failureReason);
      }
    }
  })().finally(() => {
    drainInFlight = null;
  });

  return drainInFlight;
}

export function subscribeToOfflineMutationQueue(listener: QueueListener) {
  listeners.add(listener);
  void getPendingOfflineMutationCount().then((size) => listener(size));
  return () => {
    listeners.delete(listener);
  };
}

export function subscribeToOfflineMutationEvents(listener: QueueMutationListener) {
  mutationListeners.add(listener);
  return () => {
    mutationListeners.delete(listener);
  };
}

export function startOfflineMutationQueueAutoDrain() {
  void drainOfflineMutationQueue();

  const interval = setInterval(() => {
    void drainOfflineMutationQueue();
  }, AUTO_DRAIN_INTERVAL_MS);

  const unsubscribe = addEventListener((state) => {
    if (state.isConnected === false || state.isInternetReachable === false) {
      return;
    }
    void drainOfflineMutationQueue();
  });

  return () => {
    clearInterval(interval);
    unsubscribe();
  };
}
