import { isLikelyNetworkError } from "@/lib/network";
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

export type ChatListTypingStateRow = {
  user_id?: string;
  peer_user_id?: string;
  typing_until?: string | null;
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
  visibleLastMessageIds: string[];
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
  visibleLastMessageIds,
}: UseChatListSyncArgs) => {
  const [isFocused, setIsFocused] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const realtimeActive = isFocused && appState === 'active';
  const visiblePeerUserIdsKey = Array.from(new Set(visiblePeerUserIds.filter(Boolean))).slice(0, 60).sort().join(':');
  const visibleLastMessageIdsKey = Array.from(new Set(visibleLastMessageIds.filter(Boolean))).slice(0, 60).sort().join(':');
  const visiblePeerUserIdSet = useMemo(
    () => new Set(visiblePeerUserIdsKey ? visiblePeerUserIdsKey.split(':') : []),
    [visiblePeerUserIdsKey],
  );
  const visibleLastMessageIdSet = useMemo(
    () => new Set(visibleLastMessageIdsKey ? visibleLastMessageIdsKey.split(':') : []),
    [visibleLastMessageIdsKey],
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

    const applyTypingRow = (row?: ChatListTypingStateRow | null) => {
      if (!row?.user_id || row.peer_user_id !== userId) return;
      const typingUntil = row.typing_until ? new Date(row.typing_until).getTime() : 0;
      setPeerTypingState(row.user_id, typingUntil > Date.now(), typingUntil);
    };

    void (async () => {
      const { data, error } = await supabase
        .from('chat_typing_state')
        .select('user_id,peer_user_id,typing_until')
        .eq('peer_user_id', userId);
      if (error) {
        if (!isLikelyNetworkError(error)) {
          console.log('[chat] list typing state fetch error', error);
        }
        return;
      }
      ((data as ChatListTypingStateRow[] | null) ?? []).forEach((row) => applyTypingRow(row));
    })();

    const channel = supabase
      .channel(`chat_typing_state:list:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_typing_state',
          filter: `peer_user_id=eq.${userId}`,
        },
        (payload) => {
          const row = (payload.new || payload.old) as ChatListTypingStateRow | null;
          if (payload.eventType === 'DELETE') {
            if (row?.user_id) {
              setPeerTypingState(row.user_id, false);
            }
            return;
          }
          applyTypingRow(row);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [realtimeActive, setPeerTypingState, userId]);

  useEffect(() => {
    if (!userId || !realtimeActive) return;
    const channel = supabase.channel(`messages:chatlist:${userId}`);

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${userId}`,
        },
        (payload) => onMessageInsert(payload.new as ChatListMessageRealtimeRow),
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${userId}`,
        },
        (payload) => onMessageInsert(payload.new as ChatListMessageRealtimeRow),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${userId}`,
        },
        (payload) => onMessageReceiverUpdate(payload.new as ChatListMessageRealtimeRow),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${userId}`,
        },
        (payload) => onMessageSenderUpdate(payload.new as ChatListMessageRealtimeRow),
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          void fetchConversations();
        }
      });

    return () => {
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
    if (!userId || !realtimeActive || visibleLastMessageIdSet.size === 0) return;
    const channel = supabase.channel(`message_reactions:chatlist:${userId}`);

    visibleLastMessageIdSet.forEach((messageId) => {
      channel
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'message_reactions', filter: `message_id=eq.${messageId}` },
          (payload) => {
            const row = (payload.new || payload.old) as ChatListReactionRow;
            void onReactionChange(row);
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'message_reactions', filter: `message_id=eq.${messageId}` },
          (payload) => {
            const row = (payload.new || payload.old) as ChatListReactionRow;
            void onReactionChange(row);
          },
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'message_reactions', filter: `message_id=eq.${messageId}` },
          (payload) => {
            const row = (payload.old || payload.new) as ChatListReactionRow;
            void onReactionChange(row);
          },
        );
    });
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onReactionChange, realtimeActive, userId, visibleLastMessageIdSet]);

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
    const channel = supabase.channel(`user_presence:chatlist:${userId}`);
    visiblePeerUserIdSet.forEach((peerUserId) => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_presence', filter: `user_id=eq.${peerUserId}` },
        (payload) => {
          const row = (payload.new || payload.old) as UserPresenceRow;
          if (row?.user_id) {
            onPresenceChange(row);
          }
        },
      );
    });
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onPresenceChange, realtimeActive, userId, visiblePeerUserIdSet]);
};
