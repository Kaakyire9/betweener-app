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
  const channelStates = new Map<string, ChatRealtimeStatus>();
  let reportedSubscribed = false;
  let reportedFailure: ChatRealtimeStatus | null = null;
  const reportStatus = (channelName: string, status: ChatRealtimeStatus) => {
    channelStates.set(channelName, status);
    if (status === 'SUBSCRIBED') {
      reportedFailure = null;
      if (
        !reportedSubscribed &&
        channelStates.get('messages') === 'SUBSCRIBED' &&
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

  const messagesChannel = supabase
    .channel(`messages:thread:${currentUserId}:${peerUserId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'messages',
      },
      (payload) => {
        if (payload.eventType === 'DELETE') return;
        const row = payload.new as RemoteThreadMessageRow;
        const isInbox = row.receiver_id === currentUserId && row.sender_id === peerUserId;
        const isSent = row.sender_id === currentUserId && row.receiver_id === peerUserId;
        if (!isInbox && !isSent) return;
        if (payload.eventType === 'INSERT') {
          if (isInbox) onInboxInsert(row);
          if (isSent) onSentInsert(row);
          return;
        }
        if (isInbox) onInboxUpdate(row);
        if (isSent) onSentUpdate(row);
      },
    )
    .subscribe((status) => reportStatus('messages', status));

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
    supabase.removeChannel(messagesChannel);
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

  const trackThreadPresence = (typing: boolean, reason: string) => {
    if (stopped || !presenceSubscribed || !appIsActive) return;
    void presenceChannel.track({
      onlineAt: new Date().toISOString(),
      typing,
      reason,
    });
  };

  const announceThreadOpen = (reason: string) => {
    if (stopped || !presenceSubscribed || !appIsActive) return;
    const openedAt = new Date().toISOString();
    trackThreadPresence(false, reason);
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
    if (hasPeer) {
      clearPeerAbsenceTimer();
      peerWasPresent = true;
      onPeerPresenceSync({ hasPeer: true, peerTyping });
      return;
    }
    if (peerAbsenceTimer) return;
    peerAbsenceTimer = setTimeout(() => {
      peerAbsenceTimer = null;
      if (stopped) return;
      const latestState = presenceChannel.presenceState();
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

  const broadcastTyping = (typing: boolean) => {
    if (stopped) return;
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
      clearPeerAbsenceTimer();
      peerWasPresent = true;
      onPeerJoin();
      syncPeerPresence();
    })
    .on('presence', { event: 'leave' }, ({ key }) => {
      if (key !== peerUserId) return;
      syncPeerPresence();
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
      leaveThreadRoom();
      stopped = true;
      presenceSubscribed = false;
      chatListTypingSubscribed = false;
      presenceChannel.unsubscribe();
      chatListTypingChannel.unsubscribe();
    },
  };
};
