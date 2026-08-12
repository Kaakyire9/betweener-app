import { buildPairScopedRealtimeTopic, buildUserScopedRealtimeTopic } from "@/lib/presence";
import { supabase } from "@/lib/supabase";
import { AppState } from "react-native";
import {
  getThreadRealtimeReconnectDelayMs,
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
  let stopped = false;
  const channelStates = new Map<string, ChatRealtimeStatus>();
  let reportedSubscribed = false;
  let reportedFailure: ChatRealtimeStatus | null = null;
  const reportStatus = (channelName: string, status: ChatRealtimeStatus) => {
    // Removing a Supabase channel emits CLOSED. That is an intentional
    // teardown, not a connectivity failure, and must never start recovery
    // work while the user is navigating away from the thread.
    if (stopped) return;
    channelStates.set(channelName, status);
    if (status === 'SUBSCRIBED') {
      reportedFailure = null;
      if (
        !reportedSubscribed &&
        channelStates.get('inbox') === 'SUBSCRIBED' &&
        channelStates.get('sent') === 'SUBSCRIBED' &&
        channelStates.get('system') === 'SUBSCRIBED'
      ) {
        reportedSubscribed = true;
        onStatus('SUBSCRIBED');
      }
      return;
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      reportedSubscribed = false;
      if (reportedFailure !== status) {
        reportedFailure = status;
        onStatus(status);
      }
    }
  };

  const inboxChannel = supabase
    .channel(`messages:thread:inbox:${currentUserId}:${peerUserId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${currentUserId}`,
      },
      (payload) => {
        if (payload.eventType === 'DELETE') return;
        const row = payload.new as RemoteThreadMessageRow;
        if (row.sender_id !== peerUserId) return;
        if (payload.eventType === 'INSERT') {
          onInboxInsert(row);
          return;
        }
        onInboxUpdate(row);
      },
    )
    .subscribe((status) => reportStatus('inbox', status));

  const sentChannel = supabase
    .channel(`messages:thread:sent:${currentUserId}:${peerUserId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `sender_id=eq.${currentUserId}`,
      },
      (payload) => {
        if (payload.eventType === 'DELETE') return;
        const row = payload.new as RemoteThreadMessageRow;
        if (row.receiver_id !== peerUserId) return;
        if (payload.eventType === 'INSERT') {
          onSentInsert(row);
          return;
        }
        onSentUpdate(row);
      },
    )
    .subscribe((status) => reportStatus('sent', status));

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
    .subscribe((status) => reportStatus('system', status));

  return () => {
    stopped = true;
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
};

export const subscribeThreadAncillaryRealtime = ({
  currentUserId,
  conversationId,
  peerUserId,
  onReactionInsert,
  onReactionUpdate,
  onReactionDelete,
  onMessageViewInsert,
}: SubscribeThreadAncillaryRealtimeArgs) => {
  const reactionsChannel = supabase
    .channel(`message_reactions:${conversationId}:${currentUserId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'message_reactions',
      },
      (payload) => {
        const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as RemoteReactionRow;
        if (row.user_id !== currentUserId && row.user_id !== peerUserId) return;
        if (payload.eventType === 'INSERT') {
          onReactionInsert(row);
        } else if (payload.eventType === 'UPDATE') {
          onReactionUpdate(row);
        } else {
          onReactionDelete(row);
        }
      },
    )
    .subscribe();

  const viewsChannel = supabase
    .channel(`message_views:${conversationId}:${currentUserId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'message_views',
      },
      (payload) => {
        if (payload.eventType === 'DELETE') return;
        const row = payload.new as RemoteMessageViewRow;
        if (row.viewer_id !== currentUserId && row.viewer_id !== peerUserId) return;
        onMessageViewInsert(row);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(reactionsChannel);
    supabase.removeChannel(viewsChannel);
  };
};

type StartThreadPresenceSessionArgs = {
  currentUserId: string;
  peerUserId: string;
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
  onPeerPresenceSync,
  onPeerJoin,
  onPeerLeave,
  onPeerOpenedThread,
  onPeerTypingBroadcast,
  onAppActive,
}: StartThreadPresenceSessionArgs) => {
  const presenceRoom = buildPairScopedRealtimeTopic('presence:chat', currentUserId, peerUserId);
  const chatListTypingRoom = buildUserScopedRealtimeTopic('typing:chatlist', peerUserId);
  type ThreadRealtimeChannel = ReturnType<typeof supabase.channel>;

  let stopped = false;
  let presenceSubscribed = false;
  let presenceConnecting = false;
  let chatListTypingSubscribed = false;
  let chatListTypingConnecting = false;
  let appIsActive = AppState.currentState === 'active';
  let presenceChannel: ThreadRealtimeChannel | null = null;
  let chatListTypingChannel: ThreadRealtimeChannel | null = null;
  let presenceReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let chatListTypingReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let presenceReconnectAttempt = 0;
  let chatListTypingReconnectAttempt = 0;
  const foregroundAnnouncementTimers = new Set<ReturnType<typeof setTimeout>>();
  let peerAbsenceTimer: ReturnType<typeof setTimeout> | null = null;
  let peerWasPresent = false;

  const clearForegroundAnnouncementTimers = () => {
    foregroundAnnouncementTimers.forEach((timer) => clearTimeout(timer));
    foregroundAnnouncementTimers.clear();
  };

  const clearPeerAbsenceTimer = () => {
    if (!peerAbsenceTimer) return;
    clearTimeout(peerAbsenceTimer);
    peerAbsenceTimer = null;
  };

  const clearPresenceReconnectTimer = () => {
    if (!presenceReconnectTimer) return;
    clearTimeout(presenceReconnectTimer);
    presenceReconnectTimer = null;
  };

  const clearChatListTypingReconnectTimer = () => {
    if (!chatListTypingReconnectTimer) return;
    clearTimeout(chatListTypingReconnectTimer);
    chatListTypingReconnectTimer = null;
  };

  const trackThreadPresence = (typing: boolean, reason: string) => {
    const channel = presenceChannel;
    if (stopped || !channel || !presenceSubscribed || !appIsActive) {
      return;
    }
    void channel.track({
      onlineAt: new Date().toISOString(),
      typing,
      reason,
    });
  };

  const announceThreadOpen = (reason: string) => {
    const channel = presenceChannel;
    if (stopped || !channel || !presenceSubscribed || !appIsActive) return;
    const openedAt = new Date().toISOString();
    trackThreadPresence(false, reason);
    if (canSendWebsocketBroadcast(channel as any)) {
      void channel.send({
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

  const syncPeerPresence = (sourceChannel = presenceChannel) => {
    if (
      stopped ||
      !appIsActive ||
      AppState.currentState !== 'active' ||
      !sourceChannel ||
      sourceChannel !== presenceChannel
    ) {
      return;
    }
    const state = sourceChannel.presenceState();
    const peer = (state as any)[peerUserId] as { typing?: boolean }[] | undefined;
    const hasPeer = Boolean(peer && peer.length > 0);
    const peerTyping = Boolean(peer?.some((entry) => entry.typing));
    if (hasPeer) {
      clearPeerAbsenceTimer();
      peerWasPresent = true;
      onPeerPresenceSync({ hasPeer: true, peerTyping });
      return;
    }
    if (peerAbsenceTimer) return;
    peerAbsenceTimer = setTimeout(() => {
      peerAbsenceTimer = null;
      if (
        stopped ||
        !appIsActive ||
        AppState.currentState !== 'active' ||
        sourceChannel !== presenceChannel
      ) {
        return;
      }
      const latestState = sourceChannel.presenceState();
      const latestPeer = (latestState as any)[peerUserId] as { typing?: boolean }[] | undefined;
      if (latestPeer?.length) {
        peerWasPresent = true;
        onPeerPresenceSync({
          hasPeer: true,
          peerTyping: latestPeer.some((entry) => entry.typing),
        });
        return;
      }
      onPeerPresenceSync({ hasPeer: false, peerTyping: false });
      if (peerWasPresent) {
        peerWasPresent = false;
        onPeerLeave();
      }
    }, 2500);
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

  const removePresenceChannel = (channel: ThreadRealtimeChannel | null) => {
    if (!channel) return;
    void supabase.removeChannel(channel);
  };

  const removeChatListTypingChannel = (channel: ThreadRealtimeChannel | null) => {
    if (!channel) return;
    void supabase.removeChannel(channel);
  };

  function schedulePresenceReconnect(_reason: string) {
    if (
      stopped ||
      !appIsActive ||
      AppState.currentState !== 'active' ||
      presenceReconnectTimer ||
      presenceConnecting
    ) {
      return;
    }
    const delayMs = getThreadRealtimeReconnectDelayMs(presenceReconnectAttempt);
    presenceReconnectAttempt += 1;
    presenceReconnectTimer = setTimeout(() => {
      presenceReconnectTimer = null;
      connectPresenceChannel('retry');
    }, delayMs);
  }

  function scheduleChatListTypingReconnect(_reason: string) {
    if (
      stopped ||
      !appIsActive ||
      AppState.currentState !== 'active' ||
      chatListTypingReconnectTimer ||
      chatListTypingConnecting
    ) {
      return;
    }
    const delayMs = getThreadRealtimeReconnectDelayMs(chatListTypingReconnectAttempt);
    chatListTypingReconnectAttempt += 1;
    chatListTypingReconnectTimer = setTimeout(() => {
      chatListTypingReconnectTimer = null;
      connectChatListTypingChannel('retry');
    }, delayMs);
  }

  const broadcastTyping = (typing: boolean) => {
    if (stopped) return;
    const activePresenceChannel = presenceChannel;
    if (
      activePresenceChannel &&
      presenceSubscribed &&
      appIsActive &&
      canSendWebsocketBroadcast(activePresenceChannel as any)
    ) {
      const at = new Date().toISOString();
      void activePresenceChannel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { senderId: currentUserId, typing, at },
      });
    }
    const activeTypingChannel = chatListTypingChannel;
    if (
      activeTypingChannel &&
      chatListTypingSubscribed &&
      canSendWebsocketBroadcast(activeTypingChannel as any)
    ) {
      void activeTypingChannel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { senderId: currentUserId, typing, at: new Date().toISOString() },
      });
    }
  };

  const leaveThreadRoom = () => {
    if (stopped) return;
    appIsActive = false;
    const activeTypingChannel = chatListTypingChannel;
    if (
      activeTypingChannel &&
      chatListTypingSubscribed &&
      canSendWebsocketBroadcast(activeTypingChannel as any)
    ) {
      void activeTypingChannel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { senderId: currentUserId, typing: false, at: new Date().toISOString() },
      });
    }
    if (presenceSubscribed && presenceChannel) {
      void presenceChannel.untrack();
    }
  };

  function connectChatListTypingChannel(_reason: string) {
    if (stopped || chatListTypingConnecting || chatListTypingSubscribed) return;
    clearChatListTypingReconnectTimer();
    chatListTypingConnecting = true;
    const previousChannel = chatListTypingChannel;
    const channel = supabase.channel(chatListTypingRoom);
    chatListTypingChannel = channel;
    if (previousChannel && previousChannel !== channel) {
      removeChatListTypingChannel(previousChannel);
    }
    channel.subscribe((status) => {
      if (stopped || channel !== chatListTypingChannel) return;
      if (status === 'SUBSCRIBED') {
        chatListTypingConnecting = false;
        chatListTypingSubscribed = true;
        chatListTypingReconnectAttempt = 0;
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        chatListTypingConnecting = false;
        chatListTypingSubscribed = false;
        chatListTypingChannel = null;
        removeChatListTypingChannel(channel);
        scheduleChatListTypingReconnect(status);
      }
    });
  }

  function connectPresenceChannel(_reason: string) {
    if (stopped || presenceConnecting || presenceSubscribed) return;
    clearPresenceReconnectTimer();
    presenceConnecting = true;
    const previousChannel = presenceChannel;
    const channel = supabase.channel(presenceRoom, {
      config: {
        presence: { key: currentUserId },
      },
    });
    presenceChannel = channel;
    if (previousChannel && previousChannel !== channel) {
      removePresenceChannel(previousChannel);
    }

    channel
      .on('presence', { event: 'sync' }, () => syncPeerPresence(channel))
      .on('presence', { event: 'join' }, ({ key }) => {
        if (
          !appIsActive ||
          AppState.currentState !== 'active' ||
          channel !== presenceChannel ||
          key !== peerUserId
        ) {
          return;
        }
        clearPeerAbsenceTimer();
        peerWasPresent = true;
        onPeerJoin();
        syncPeerPresence(channel);
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (
          !appIsActive ||
          AppState.currentState !== 'active' ||
          channel !== presenceChannel ||
          key !== peerUserId
        ) {
          return;
        }
        syncPeerPresence(channel);
      })
      .on('broadcast', { event: 'opened_thread' }, ({ payload }) => {
        if (
          !appIsActive ||
          AppState.currentState !== 'active' ||
          channel !== presenceChannel ||
          !payload ||
          payload.senderId !== peerUserId
        ) {
          return;
        }
        onPeerOpenedThread({ openedAt: payload.openedAt ?? null });
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (
          !appIsActive ||
          AppState.currentState !== 'active' ||
          channel !== presenceChannel ||
          !payload ||
          payload.senderId !== peerUserId
        ) {
          return;
        }
        onPeerTypingBroadcast({
          typing: Boolean(payload.typing),
          at: payload.at ?? null,
        });
      })
      .subscribe((status) => {
        if (stopped || channel !== presenceChannel) return;
        if (status === 'SUBSCRIBED') {
          presenceConnecting = false;
          presenceSubscribed = true;
          presenceReconnectAttempt = 0;
          if (appIsActive) {
            announceThreadOpen('subscribed');
          } else {
            void channel.untrack();
          }
          setTimeout(() => syncPeerPresence(channel), 350);
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          presenceConnecting = false;
          presenceSubscribed = false;
          presenceChannel = null;
          removePresenceChannel(channel);
          schedulePresenceReconnect(status);
        }
      });
  }

  connectChatListTypingChannel('initial');
  connectPresenceChannel('initial');

  const appStateSubscription = AppState.addEventListener('change', (state) => {
    if (stopped) return;
    if (state !== 'active') {
      clearForegroundAnnouncementTimers();
      clearPresenceReconnectTimer();
      clearChatListTypingReconnectTimer();
      leaveThreadRoom();
      return;
    }
    appIsActive = true;
    try {
      supabase.realtime.connect();
    } catch {
      // best effort only
    }
    if (!presenceSubscribed && !presenceConnecting) {
      connectPresenceChannel('app_active');
    }
    if (!chatListTypingSubscribed && !chatListTypingConnecting) {
      connectChatListTypingChannel('app_active');
    }
    scheduleThreadOpenAnnouncements('app_active');
    setTimeout(() => {
      onAppActive?.();
    }, 250);
  });

  const presenceHeartbeat = setInterval(() => {
    if (stopped || !appIsActive || AppState.currentState !== 'active') return;
    trackThreadPresence(false, 'heartbeat');
    syncPeerPresence();
  }, THREAD_ACTIVITY_HEARTBEAT_MS);

  return {
    broadcastTyping,
    stop: () => {
      if (stopped) return;
      appStateSubscription.remove();
      clearInterval(presenceHeartbeat);
      clearForegroundAnnouncementTimers();
      clearPeerAbsenceTimer();
      clearPresenceReconnectTimer();
      clearChatListTypingReconnectTimer();
      leaveThreadRoom();
      stopped = true;
      presenceSubscribed = false;
      presenceConnecting = false;
      chatListTypingSubscribed = false;
      chatListTypingConnecting = false;
      const activePresenceChannel = presenceChannel;
      const activeTypingChannel = chatListTypingChannel;
      presenceChannel = null;
      chatListTypingChannel = null;
      removePresenceChannel(activePresenceChannel);
      removeChatListTypingChannel(activeTypingChannel);
    },
  };
};
