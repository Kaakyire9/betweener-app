import { subscribeToNetworkRestored } from "@/lib/network-recovery";
import { buildUserScopedRealtimeTopic } from "@/lib/presence";
import { supabase } from "@/lib/supabase";
import { useFocusEffect } from "expo-router";
import { AppState } from "react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { UserPresenceRow } from "@/lib/user-presence";

export type ChatListMessageRealtimeRow = {
  id: string;
  client_message_id?: string | null;
  text: string;
  created_at: string;
  sender_id: string;
  receiver_id: string;
  is_read: boolean;
  delivered_at?: string | null;
  deleted_for_all?: boolean | null;
  deleted_at?: string | null;
  edited_at?: string | null;
  message_type?: string | null;
  is_view_once?: boolean | null;
};

export type ChatListReactionRow = {
  message_id?: string;
  emoji?: string;
  user_id?: string;
  created_at?: string | null;
};

export type ChatListChatPrefRow = {
  peer_id?: string;
  muted?: boolean;
  pinned?: boolean;
};

type UseChatListSyncArgs = {
  userId?: string | null;
  refreshConversationsOnFocus: () => void;
  fetchConversations: () => void | Promise<void>;
  fetchNewMatches: () => void | Promise<void>;
  setPeerTypingState: (peerUserId: string, typing: boolean, expiresAtOverride?: number) => void;
  onMessageInsert: (row: ChatListMessageRealtimeRow) => void;
  onMessageReceiverUpdate: (row: ChatListMessageRealtimeRow) => void;
  onMessageSenderUpdate: (row: ChatListMessageRealtimeRow) => void;
  onReactionChange: (row: ChatListReactionRow) => void | Promise<void>;
  onChatPrefChange: (row: ChatListChatPrefRow) => void;
  onPresenceChange: (row: UserPresenceRow) => void;
  visiblePeerUserIds: string[];
};

export const useChatListSync = ({
  userId,
  refreshConversationsOnFocus,
  fetchConversations,
  fetchNewMatches,
  setPeerTypingState,
  onMessageInsert,
  onMessageReceiverUpdate,
  onMessageSenderUpdate,
  onReactionChange,
  onChatPrefChange,
  onPresenceChange,
  visiblePeerUserIds,
}: UseChatListSyncArgs) => {
  const [isFocused, setIsFocused] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const realtimeActive = isFocused && appState === 'active';
  const visiblePeerUserIdsKey = Array.from(new Set(visiblePeerUserIds.filter(Boolean))).slice(0, 60).sort().join(':');
  const visiblePeerUserIdSet = useMemo(
    () => new Set(visiblePeerUserIdsKey ? visiblePeerUserIdsKey.split(':') : []),
    [visiblePeerUserIdsKey],
  );

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      refreshConversationsOnFocus();
      return () => setIsFocused(false);
    }, [refreshConversationsOnFocus]),
  );

  useEffect(() => {
    return subscribeToNetworkRestored(() => {
      if (!realtimeActive) return;
      void fetchConversations();
    });
  }, [fetchConversations, realtimeActive]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppState(state);
      if (state !== 'active' || !isFocused) return;
      refreshConversationsOnFocus();
      void fetchNewMatches();
    });

    return () => {
      subscription.remove();
    };
  }, [fetchNewMatches, isFocused, refreshConversationsOnFocus]);

  useEffect(() => {
    if (!userId || !realtimeActive) return;
    const channel = supabase.channel(buildUserScopedRealtimeTopic('typing:chatlist', userId));

    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload || typeof payload.senderId !== 'string') return;
        setPeerTypingState(payload.senderId, Boolean(payload.typing));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [realtimeActive, setPeerTypingState, userId]);

  useEffect(() => {
    if (!userId || !realtimeActive) return;
    let cancelled = false;
    const channel = supabase.channel(`messages:chatlist:${userId}`);

    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          if (cancelled) return;
          if (payload.eventType === 'DELETE') {
            void fetchConversations();
            return;
          }

          const row = payload.new as ChatListMessageRealtimeRow;
          if (!row?.id) return;
          if (payload.eventType === 'INSERT') {
            onMessageInsert(row);
            return;
          }
          if (row.receiver_id === userId) onMessageReceiverUpdate(row);
          if (row.sender_id === userId) onMessageSenderUpdate(row);
        },
      )
      .subscribe((status) => {
        if (cancelled) return;
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          void fetchConversations();
        }
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [
    fetchConversations,
    onMessageInsert,
    onMessageReceiverUpdate,
    onMessageSenderUpdate,
    realtimeActive,
    userId,
  ]);

  useEffect(() => {
    if (!userId || !realtimeActive) return;
    let cancelled = false;
    const channel = supabase.channel(`message_reactions:chatlist:${userId}`);

    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        (payload) => {
          if (cancelled) return;
          const row = (payload.new || payload.old) as ChatListReactionRow;
          void onReactionChange(row);
        },
      )
      .subscribe((status) => {
        if (cancelled) return;
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          void fetchConversations();
        }
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [fetchConversations, onReactionChange, realtimeActive, userId]);

  useEffect(() => {
    if (!userId || !realtimeActive) return;
    const channel = supabase
      .channel(`chat_prefs:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_prefs',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => onChatPrefChange((payload.new || payload.old) as ChatListChatPrefRow),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onChatPrefChange, realtimeActive, userId]);

  useEffect(() => {
    if (!userId || !realtimeActive || visiblePeerUserIdSet.size === 0) return;
    let cancelled = false;
    const peerUserIds = Array.from(visiblePeerUserIdSet);
    const refreshPresence = async () => {
      const { data, error } = await supabase
        .from('user_presence')
        .select('user_id,online,last_active,updated_at')
        .in('user_id', peerUserIds);
      if (cancelled || error) return;
      (data || []).forEach((row) => onPresenceChange(row as UserPresenceRow));
    };

    void refreshPresence();
    const interval = setInterval(() => void refreshPresence(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [onPresenceChange, realtimeActive, userId, visiblePeerUserIdSet]);
};
