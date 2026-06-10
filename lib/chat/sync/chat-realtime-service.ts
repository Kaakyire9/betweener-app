import { buildPairScopedRealtimeTopic, buildUserScopedRealtimeTopic } from "@/lib/presence";
import { supabase } from "@/lib/supabase";
import { AppState } from "react-native";
import {
  THREAD_ACTIVITY_FOREGROUND_REANNOUNCE_DELAYS_MS,
  THREAD_ACTIVITY_HEARTBEAT_MS,
} from "@/lib/chat/thread-activity";
import { canSendWebsocketBroadcast } from "@/lib/chat/realtime-channel";

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
        filter: `user_id=eq.${currentUserId}`,
      },
      (payload) => onReactionInsert(payload.new as RemoteReactionRow),
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'message_reactions',
        filter: `user_id=eq.${currentUserId}`,
      },
      (payload) => onReactionUpdate(payload.new as RemoteReactionRow),
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'message_reactions',
        filter: `user_id=eq.${currentUserId}`,
      },
      (payload) => onReactionDelete(payload.old as RemoteReactionRow),
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'message_reactions',
        filter: `user_id=eq.${peerUserId}`,
      },
      (payload) => onReactionInsert(payload.new as RemoteReactionRow),
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'message_reactions',
        filter: `user_id=eq.${peerUserId}`,
      },
      (payload) => onReactionUpdate(payload.new as RemoteReactionRow),
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'message_reactions',
        filter: `user_id=eq.${peerUserId}`,
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
        filter: `viewer_id=eq.${currentUserId}`,
      },
      (payload) => onMessageViewInsert(payload.new as RemoteMessageViewRow),
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'message_views',
        filter: `viewer_id=eq.${peerUserId}`,
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
  let appIsActive = AppState.currentState === 'active';
  const foregroundAnnouncementTimers = new Set<ReturnType<typeof setTimeout>>();

  const clearForegroundAnnouncementTimers = () => {
    foregroundAnnouncementTimers.forEach((timer) => clearTimeout(timer));
    foregroundAnnouncementTimers.clear();
  };

  const announceThreadOpen = (reason: string) => {
    if (stopped || !presenceSubscribed || !appIsActive) return;
    const openedAt = new Date().toISOString();
    void presenceChannel.track({ onlineAt: openedAt, typing: false, reason });
    if (canSendWebsocketBroadcast(presenceChannel as any)) {
      void presenceChannel.send({
        type: 'broadcast',
        event: 'opened_thread',
        payload: {
          senderId: currentUserId,
          threadWith: peerUserId,
          openedAt,
          reason,
        },
      });
    }
  };

  const syncPeerPresence = () => {
    const state = presenceChannel.presenceState();
    const peer = (state as any)[peerUserId] as { typing?: boolean }[] | undefined;
    const hasPeer = Boolean(peer && peer.length > 0);
    const peerTyping = Boolean(peer?.some((entry) => entry.typing));
    onPeerPresenceSync({ hasPeer, peerTyping });
  };

  const scheduleThreadOpenAnnouncements = (reason: string) => {
    clearForegroundAnnouncementTimers();
    THREAD_ACTIVITY_FOREGROUND_REANNOUNCE_DELAYS_MS.forEach((delayMs) => {
      const timer = setTimeout(() => {
        foregroundAnnouncementTimers.delete(timer);
        if (stopped || !appIsActive || AppState.currentState !== 'active') return;
        announceThreadOpen(reason);
        syncPeerPresence();
      }, delayMs);
      foregroundAnnouncementTimers.add(timer);
    });
  };

  const broadcastTyping = (typing: boolean) => {
    if (stopped) return;
    void persistTypingState(typing);
    if (
      presenceSubscribed &&
      appIsActive &&
      canSendWebsocketBroadcast(presenceChannel as any)
    ) {
      const at = new Date().toISOString();
      void presenceChannel.track({
        onlineAt: at,
        typing,
      });
      void presenceChannel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { senderId: currentUserId, typing, at },
      });
    }
    if (
      chatListTypingSubscribed &&
      canSendWebsocketBroadcast(chatListTypingChannel as any)
    ) {
      void chatListTypingChannel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { senderId: currentUserId, typing, at: new Date().toISOString() },
      });
    }
  };

  const leaveThreadRoom = () => {
    if (stopped) return;
    appIsActive = false;
    void persistTypingState(false);
    if (
      chatListTypingSubscribed &&
      canSendWebsocketBroadcast(chatListTypingChannel as any)
    ) {
      void chatListTypingChannel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { senderId: currentUserId, typing: false, at: new Date().toISOString() },
      });
    }
    if (presenceSubscribed) {
      void presenceChannel.untrack();
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
        if (appIsActive) {
          announceThreadOpen('subscribed');
        } else {
          void presenceChannel.untrack();
        }
        setTimeout(syncPeerPresence, 350);
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        presenceSubscribed = false;
      }
    });

  const appStateSubscription = AppState.addEventListener('change', (state) => {
    if (stopped) return;
    if (state !== 'active') {
      clearForegroundAnnouncementTimers();
      leaveThreadRoom();
      return;
    }
    appIsActive = true;
    try {
      supabase.realtime.connect();
    } catch {
      // best effort only
    }
    scheduleThreadOpenAnnouncements('app_active');
    setTimeout(() => {
      onAppActive?.();
    }, 250);
  });

  const presenceHeartbeat = setInterval(() => {
    if (stopped || !appIsActive || AppState.currentState !== 'active') return;
    announceThreadOpen('heartbeat');
    syncPeerPresence();
  }, THREAD_ACTIVITY_HEARTBEAT_MS);

  return {
    broadcastTyping,
    stop: () => {
      if (stopped) return;
      appStateSubscription.remove();
      clearInterval(presenceHeartbeat);
      clearForegroundAnnouncementTimers();
      leaveThreadRoom();
      stopped = true;
      presenceSubscribed = false;
      chatListTypingSubscribed = false;
      presenceChannel.unsubscribe();
      chatListTypingChannel.unsubscribe();
    },
  };
};
