import { buildPairScopedRealtimeTopic, buildUserScopedRealtimeTopic } from "@/lib/presence";
import { supabase } from "@/lib/supabase";
import { AppState } from "react-native";

import type {
  ChatRealtimeStatus,
  RemoteMessageViewRow,
  RemoteReactionRow,
  RemoteSystemMessageRow,
  RemoteThreadMessageRow,
  RemoteTypingStateRow,
} from "./chat-sync-types";

type SubscribeThreadMessageRealtimeArgs = {
  currentUserId: string;
  peerUserId: string;
  onStatus: (status: ChatRealtimeStatus) => void;
  onInboxInsert: (row: RemoteThreadMessageRow) => void;
  onInboxUpdate: (row: RemoteThreadMessageRow) => void;
  onSentInsert: (row: RemoteThreadMessageRow) => void;
  onSentUpdate: (row: RemoteThreadMessageRow) => void;
  onSystemInsert: (row: RemoteSystemMessageRow) => void;
};

export const subscribeThreadMessageRealtime = ({
  currentUserId,
  peerUserId,
  onStatus,
  onInboxInsert,
  onInboxUpdate,
  onSentInsert,
  onSentUpdate,
  onSystemInsert,
}: SubscribeThreadMessageRealtimeArgs) => {
  const inboxChannel = supabase
    .channel(`messages:inbox:${currentUserId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${currentUserId}`,
      },
      (payload) => {
        const row = payload.new as RemoteThreadMessageRow;
        if (row.sender_id !== peerUserId) return;
        onInboxInsert(row);
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${currentUserId}`,
      },
      (payload) => {
        const row = payload.new as RemoteThreadMessageRow;
        if (row.sender_id !== peerUserId) return;
        onInboxUpdate(row);
      },
    )
    .subscribe(onStatus);

  const sentChannel = supabase
    .channel(`messages:sent:${currentUserId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `sender_id=eq.${currentUserId}`,
      },
      (payload) => {
        const row = payload.new as RemoteThreadMessageRow;
        if (row.receiver_id !== peerUserId) return;
        onSentInsert(row);
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `sender_id=eq.${currentUserId}`,
      },
      (payload) => {
        const row = payload.new as RemoteThreadMessageRow;
        if (row.receiver_id !== peerUserId) return;
        onSentUpdate(row);
      },
    )
    .subscribe(onStatus);

  const systemChannel = supabase
    .channel(`system_messages:${currentUserId}:${peerUserId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'system_messages',
        filter: `user_id=eq.${currentUserId}`,
      },
      (payload) => {
        const row = payload.new as RemoteSystemMessageRow;
        if (row.peer_user_id !== peerUserId) return;
        onSystemInsert(row);
      },
    )
    .subscribe(onStatus);

  return () => {
    supabase.removeChannel(inboxChannel);
    supabase.removeChannel(sentChannel);
    supabase.removeChannel(systemChannel);
  };
};

type SubscribeThreadAncillaryRealtimeArgs = {
  currentUserId: string;
  conversationId: string;
  peerUserId: string;
  onReactionInsert: (row: RemoteReactionRow) => void;
  onReactionUpdate: (row: RemoteReactionRow) => void;
  onReactionDelete: (row: RemoteReactionRow) => void;
  onMessageViewInsert: (row: RemoteMessageViewRow) => void;
  onTypingUpsert: (row: RemoteTypingStateRow | null) => void;
  onTypingDelete: (row: RemoteTypingStateRow | null) => void;
};

export const subscribeThreadAncillaryRealtime = ({
  currentUserId,
  conversationId,
  peerUserId,
  onReactionInsert,
  onReactionUpdate,
  onReactionDelete,
  onMessageViewInsert,
  onTypingUpsert,
  onTypingDelete,
}: SubscribeThreadAncillaryRealtimeArgs) => {
  const reactionsChannel = supabase
    .channel(`message_reactions:${conversationId}:${currentUserId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'message_reactions',
      },
      (payload) => onReactionInsert(payload.new as RemoteReactionRow),
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'message_reactions',
      },
      (payload) => onReactionUpdate(payload.new as RemoteReactionRow),
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'message_reactions',
      },
      (payload) => onReactionDelete(payload.old as RemoteReactionRow),
    )
    .subscribe();

  const viewsChannel = supabase
    .channel(`message_views:${conversationId}:${currentUserId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'message_views',
      },
      (payload) => onMessageViewInsert(payload.new as RemoteMessageViewRow),
    )
    .subscribe();

  const typingChannel = supabase
    .channel(`chat_typing_state:${currentUserId}:${peerUserId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'chat_typing_state',
        filter: `peer_user_id=eq.${currentUserId}`,
      },
      (payload) => {
        const row = (payload.new || payload.old) as RemoteTypingStateRow | null;
        if (payload.eventType === 'DELETE') {
          onTypingDelete(row);
          return;
        }
        onTypingUpsert(row ?? null);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(reactionsChannel);
    supabase.removeChannel(viewsChannel);
    supabase.removeChannel(typingChannel);
  };
};

type StartThreadPresenceSessionArgs = {
  currentUserId: string;
  peerUserId: string;
  persistTypingState: (typing: boolean) => void | Promise<void>;
  onPeerPresenceSync: (payload: { hasPeer: boolean; peerTyping: boolean }) => void;
  onPeerJoin: () => void;
  onPeerLeave: () => void;
  onPeerOpenedThread: (payload: { openedAt?: string | null }) => void;
  onPeerTypingBroadcast: (payload: { typing: boolean; at?: string | null }) => void;
  onAppActive?: () => void;
};

export const startThreadPresenceSession = ({
  currentUserId,
  peerUserId,
  persistTypingState,
  onPeerPresenceSync,
  onPeerJoin,
  onPeerLeave,
  onPeerOpenedThread,
  onPeerTypingBroadcast,
  onAppActive,
}: StartThreadPresenceSessionArgs) => {
  const presenceRoom = buildPairScopedRealtimeTopic('presence:chat', currentUserId, peerUserId);
  const presenceChannel = supabase.channel(presenceRoom, {
    config: {
      presence: { key: currentUserId },
    },
  });
  const chatListTypingChannel = supabase.channel(
    buildUserScopedRealtimeTopic('typing:chatlist', peerUserId),
  );

  let stopped = false;
  let presenceSubscribed = false;
  let chatListTypingSubscribed = false;

  const announceThreadOpen = (reason: string) => {
    if (stopped || !presenceSubscribed) return;
    const openedAt = new Date().toISOString();
    void presenceChannel.track({ onlineAt: openedAt, typing: false, reason });
    void presenceChannel.httpSend('opened_thread', {
      senderId: currentUserId,
      threadWith: peerUserId,
      openedAt,
      reason,
    });
  };

  const syncPeerPresence = () => {
    const state = presenceChannel.presenceState();
    const peer = (state as any)[peerUserId] as { typing?: boolean }[] | undefined;
    const hasPeer = Boolean(peer && peer.length > 0);
    const peerTyping = Boolean(peer?.some((entry) => entry.typing));
    onPeerPresenceSync({ hasPeer, peerTyping });
  };

  const broadcastTyping = (typing: boolean) => {
    if (stopped) return;
    void persistTypingState(typing);
    if (presenceSubscribed) {
      const at = new Date().toISOString();
      void presenceChannel.track({
        onlineAt: at,
        typing,
      });
      void (presenceChannel as any).httpSend({
        type: 'broadcast',
        event: 'typing',
        payload: { senderId: currentUserId, typing, at },
      });
    }
    if (chatListTypingSubscribed) {
      void (chatListTypingChannel as any).httpSend({
        type: 'broadcast',
        event: 'typing',
        payload: { senderId: currentUserId, typing, at: new Date().toISOString() },
      });
    }
  };

  chatListTypingChannel.subscribe((status) => {
    if (stopped) return;
    if (status === 'SUBSCRIBED') {
      chatListTypingSubscribed = true;
      return;
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      chatListTypingSubscribed = false;
    }
  });

  presenceChannel
    .on('presence', { event: 'sync' }, syncPeerPresence)
    .on('presence', { event: 'join' }, ({ key }) => {
      if (key !== peerUserId) return;
      onPeerJoin();
      syncPeerPresence();
    })
    .on('presence', { event: 'leave' }, ({ key }) => {
      if (key !== peerUserId) return;
      onPeerLeave();
    })
    .on('broadcast', { event: 'opened_thread' }, ({ payload }) => {
      if (!payload || payload.senderId !== peerUserId) return;
      onPeerOpenedThread({ openedAt: payload.openedAt ?? null });
    })
    .on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (!payload || payload.senderId !== peerUserId) return;
      onPeerTypingBroadcast({
        typing: Boolean(payload.typing),
        at: payload.at ?? null,
      });
    })
    .subscribe((status) => {
      if (stopped) return;
      if (status === 'SUBSCRIBED') {
        presenceSubscribed = true;
        announceThreadOpen('subscribed');
        setTimeout(syncPeerPresence, 350);
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        presenceSubscribed = false;
      }
    });

  const appStateSubscription = AppState.addEventListener('change', (state) => {
    if (stopped || state !== 'active') return;
    setTimeout(() => {
      announceThreadOpen('app_active');
      syncPeerPresence();
      onAppActive?.();
    }, 250);
  });

  const presenceHeartbeat = setInterval(() => {
    if (stopped || AppState.currentState !== 'active') return;
    announceThreadOpen('heartbeat');
    syncPeerPresence();
  }, 25_000);

  return {
    broadcastTyping,
    stop: () => {
      if (stopped) return;
      appStateSubscription.remove();
      clearInterval(presenceHeartbeat);
      broadcastTyping(false);
      stopped = true;
      presenceSubscribed = false;
      chatListTypingSubscribed = false;
      presenceChannel.unsubscribe();
      chatListTypingChannel.unsubscribe();
    },
  };
};
