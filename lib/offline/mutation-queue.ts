import AsyncStorage from '@react-native-async-storage/async-storage';
import { addEventListener, fetch as fetchNetInfo } from '@react-native-community/netinfo';

import { isLikelyNetworkError } from '@/lib/network';
import { readOfflineData, writeOfflineEnvelope } from '@/lib/offline/core';
import { supabase } from '@/lib/supabase';

const OFFLINE_MUTATION_QUEUE_KEY = 'offline:mutation-queue:v1';

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

export type OfflineMutation =
  | {
      id: string;
      dedupeKey: string;
      kind: 'swipe_sync';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      payload: SwipeSyncPayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'profile_image_reaction_sync';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      payload: ProfileImageReactionSyncPayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'profile_note_create';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      payload: ProfileNoteCreatePayload;
    }
  | {
      id: string;
      dedupeKey: string;
      kind: 'chat_text_send';
      createdAt: number;
      attempts: number;
      lastAttemptAt?: number | null;
      payload: ChatTextSendPayload;
    };

type QueueListener = (size: number) => void;

const listeners = new Set<QueueListener>();
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

async function readMutationQueue(): Promise<OfflineMutation[]> {
  const data = await readOfflineData<OfflineMutation[]>(OFFLINE_MUTATION_QUEUE_KEY);
  return Array.isArray(data) ? data : [];
}

async function writeMutationQueue(queue: OfflineMutation[]) {
  await writeOfflineEnvelope(OFFLINE_MUTATION_QUEUE_KEY, queue, { kind: 'mutation-queue' });
  emitQueueSize(queue.length);
}

async function replaceQueue(updater: (current: OfflineMutation[]) => OfflineMutation[]) {
  const current = await readMutationQueue();
  const next = updater(current);
  await writeMutationQueue(next);
  return next;
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

export async function drainOfflineMutationQueue() {
  if (drainInFlight) return drainInFlight;

  drainInFlight = (async () => {
    if (!(await canDrainNow())) return;

    let queue = await readMutationQueue();
    if (!queue.length) return;

    while (queue.length > 0) {
      const current = queue[0]!;
      const nextCurrent = {
        ...current,
        attempts: current.attempts + 1,
        lastAttemptAt: Date.now(),
      } as OfflineMutation;

      await replaceQueue((existing) => {
        if (!existing.length) return existing;
        const [head, ...rest] = existing;
        if (!head || head.id !== current.id) return existing;
        return [nextCurrent, ...rest];
      });

      try {
        await processMutation(nextCurrent);
        queue = await replaceQueue((existing) => existing.filter((item) => item.id !== current.id));
      } catch (error) {
        if (isLikelyNetworkError(error)) {
          break;
        }

        queue = await replaceQueue((existing) => existing.filter((item) => item.id !== current.id));
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

export function startOfflineMutationQueueAutoDrain() {
  void drainOfflineMutationQueue();

  const unsubscribe = addEventListener((state) => {
    if (state.isConnected === false || state.isInternetReachable === false) {
      return;
    }
    void drainOfflineMutationQueue();
  });

  return () => {
    unsubscribe();
  };
}
