import type { MessageType } from "@/components/chat/types";
import { ChatRepository } from "@/lib/chat/local/chat-db";
import { supabase } from "@/lib/supabase";
import { Platform } from "react-native";

import type { RemoteSystemMessageRow, RemoteThreadMessageRow } from "./chat-sync-types";
import { shouldFetchThreadIncrementally } from './chat-sync-policy';

type FetchRemoteThreadMessagesArgs = {
  currentUserId: string;
  peerUserId: string;
  pageSize: number;
  selectFields: string;
  currentMessages: MessageType[];
};

const withTimeoutFallback = async <T,>(
  task: Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<{ value: T; timedOut: boolean }> => {
  let timedOut = false;
  const timeoutTask = new Promise<T>((resolve) => {
    setTimeout(() => {
      timedOut = true;
      resolve(fallback);
    }, timeoutMs);
  });
  const value = await Promise.race([task, timeoutTask]);
  return { value, timedOut };
};

export const fetchRemoteThreadMessages = async ({
  currentUserId,
  peerUserId,
  pageSize,
  selectFields,
  currentMessages,
}: FetchRemoteThreadMessagesArgs) => {
  const syncStateStartedAt = Date.now();
  const syncStateTimeoutMs = Platform.OS === 'ios' ? 900 : 1800;
  const { value: syncState, timedOut: syncStateTimedOut } = await withTimeoutFallback(
    ChatRepository.getSyncState(currentUserId, 'thread_messages', peerUserId),
    syncStateTimeoutMs,
    null,
  );
  if (syncStateTimedOut) {
    console.log('[chat][thread][remote] sync-state-timeout', {
      currentUserId,
      peerUserId,
      platform: Platform.OS,
      durationMs: Date.now() - syncStateStartedAt,
      timeoutMs: syncStateTimeoutMs,
    });
  } else {
    console.log('[chat][thread][remote] sync-state-ready', {
      currentUserId,
      peerUserId,
      platform: Platform.OS,
      durationMs: Date.now() - syncStateStartedAt,
      hasCursor: Boolean(syncState?.last_cursor),
    });
  }
  const syncCursor = syncState?.last_cursor ?? null;
  // A partial realtime cache row must never advance us past the canonical
  // attachment record. Force one full page so its private-media metadata is
  // repaired before returning to incremental sync.
  const isIncrementalFetch = shouldFetchThreadIncrementally({ syncCursor, currentMessages });

  let messageQuery = supabase
    .from('messages')
    .select(selectFields)
    .or(
      `and(sender_id.eq.${currentUserId},receiver_id.eq.${peerUserId}),and(sender_id.eq.${peerUserId},receiver_id.eq.${currentUserId})`,
    );

  if (isIncrementalFetch && syncCursor) {
    messageQuery = messageQuery.gt('created_at', syncCursor).order('created_at', { ascending: true }).limit(pageSize);
  } else {
    messageQuery = messageQuery.order('created_at', { ascending: false }).limit(pageSize);
  }

  const remoteQueryStartedAt = Date.now();
  console.log('[chat][thread][remote] query:start', {
    currentUserId,
    peerUserId,
    pageSize,
    platform: Platform.OS,
    isIncrementalFetch,
    hasSyncCursor: Boolean(syncCursor),
  });
  const { data, error } = await messageQuery;
  console.log('[chat][thread][remote] query:finish', {
    currentUserId,
    peerUserId,
    platform: Platform.OS,
    durationMs: Date.now() - remoteQueryStartedAt,
    rowCount: Array.isArray(data) ? data.length : 0,
    code: error?.code ?? null,
    hasError: Boolean(error),
  });
  const rows = ((data || []) as unknown) as RemoteThreadMessageRow[];
  const threadSyncCursor =
    rows.reduce<string | null>((latest, row) => {
      const value = row.created_at;
      if (!value) return latest;
      if (!latest) return value;
      return new Date(value).getTime() > new Date(latest).getTime() ? value : latest;
    }, null) ??
    syncCursor ??
    new Date().toISOString();

  return {
    data: rows,
    error,
    isIncrementalFetch,
    syncCursor,
    threadSyncCursor,
  };
};

type FetchRemoteSystemMessagesArgs<T> = {
  currentUserId: string;
  peerUserId: string;
  mapRow: (row: RemoteSystemMessageRow) => T;
};

export const fetchRemoteSystemMessages = async <T>({
  currentUserId,
  peerUserId,
  mapRow,
}: FetchRemoteSystemMessagesArgs<T>): Promise<T[]> => {
  const { data, error } = await supabase
    .from('system_messages')
    .select('id,user_id,peer_user_id,text,created_at,event_type,intent_request_id,metadata')
    .eq('user_id', currentUserId)
    .eq('peer_user_id', peerUserId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return ((data || []) as RemoteSystemMessageRow[]).map(mapRow);
};
