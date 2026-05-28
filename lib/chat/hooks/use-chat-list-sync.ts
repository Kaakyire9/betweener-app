import { isLikelyNetworkError } from "@/lib/network";
import { subscribeToNetworkRestored } from "@/lib/network-recovery";
import { buildUserScopedRealtimeTopic } from "@/lib/presence";
import { supabase } from "@/lib/supabase";
import { useFocusEffect } from "expo-router";
import { AppState } from "react-native";
import { useEffect } from "react";

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
}: UseChatListSyncArgs) => {
  useFocusEffect(refreshConversationsOnFocus);

  useEffect(() => {
    return subscribeToNetworkRestored(() => {
      void fetchConversations();
    });
  }, [fetchConversations]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      refreshConversationsOnFocus();
      void fetchNewMatches();
    });

    return () => {
      subscription.remove();
    };
  }, [fetchNewMatches, refreshConversationsOnFocus]);

  useEffect(() => {
    if (!userId) return;
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
  }, [setPeerTypingState, userId]);

  useEffect(() => {
    if (!userId) return;

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
  }, [setPeerTypingState, userId]);

  useEffect(() => {
    if (!userId) return;
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
        if (status === 'SUBSCRIBED') {
          void fetchConversations();
          return;
        }
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
    userId,
  ]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`message_reactions:chatlist:${userId}`);

    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions' }, (payload) =>
        void onReactionChange((payload.new || payload.old) as ChatListReactionRow),
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'message_reactions' }, (payload) =>
        void onReactionChange((payload.new || payload.old) as ChatListReactionRow),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onReactionChange, userId]);

  useEffect(() => {
    if (!userId) return;
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
  }, [onChatPrefChange, userId]);
};
