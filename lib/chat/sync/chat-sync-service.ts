import type { MessageType } from "@/components/chat/types";
import { ChatRepository } from "@/lib/chat/local/chat-db";
import { supabase } from "@/lib/supabase";

import type { RemoteSystemMessageRow, RemoteThreadMessageRow, RemoteTypingStateRow } from "./chat-sync-types";

type FetchRemoteThreadMessagesArgs = {
  currentUserId: string;
  peerUserId: string;
  pageSize: number;
  selectFields: string;
  currentMessages: MessageType[];
};

export const fetchRemoteThreadMessages = async ({
  currentUserId,
  peerUserId,
  pageSize,
  selectFields,
  currentMessages,
}: FetchRemoteThreadMessagesArgs) => {
  const syncState = await ChatRepository.getSyncState(currentUserId, 'thread_messages', peerUserId);
  const syncCursor = syncState?.last_cursor ?? null;
  const hasLocalRemoteMessages = currentMessages.some(
    (message) =>
      !message.isSystem &&
      message.type !== 'system' &&
      !String(message.id).startsWith('temp-') &&
      message.status !== 'queued' &&
      message.status !== 'sending',
  );
  const isIncrementalFetch = Boolean(syncCursor && hasLocalRemoteMessages);

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

  const { data, error } = await messageQuery;
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

type FetchPeerTypingStateArgs = {
  currentUserId: string;
  peerUserId: string;
};

export const fetchPeerTypingState = async ({
  currentUserId,
  peerUserId,
}: FetchPeerTypingStateArgs): Promise<RemoteTypingStateRow | null> => {
  const { data, error } = await supabase
    .from('chat_typing_state')
    .select('user_id,peer_user_id,typing_until,updated_at')
    .eq('user_id', peerUserId)
    .eq('peer_user_id', currentUserId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as RemoteTypingStateRow | null) ?? null;
};
