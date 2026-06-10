import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { canSendWebsocketBroadcast } from '@/lib/chat/realtime-channel';
import { supabase } from '@/lib/supabase';

const TYPING_IDLE_MS = 3_200;
const TYPING_HEARTBEAT_MS = 800;

type Options = {
  itemId: string | null;
  actorProfileId: string | null;
  actorDisplayName?: string | null;
  enabled: boolean;
  onDiscussionChanged?: () => void;
};

type PresenceEntry = {
  profileId?: string;
  displayName?: string;
  typing?: boolean;
};

type CirclePulseActivityEvent = {
  id: string;
  profileId: string;
  displayName: string;
  type: 'join' | 'leave';
};

const ACTIVITY_EVENT_TTL_MS = 3_200;

export function useCirclePulseLiveDiscussion({
  itemId,
  actorProfileId,
  actorDisplayName,
  enabled,
  onDiscussionChanged,
}: Options) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const subscribedRef = useRef(false);
  const localTypingRef = useRef(false);
  const lastTypingAnnouncementAtRef = useRef(0);
  const typingIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const activityTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const activeMembersRef = useRef<Record<string, string>>({});
  const [activeViewerCount, setActiveViewerCount] = useState(0);
  const [activeMembers, setActiveMembers] = useState<Record<string, string>>({});
  const [activityEvents, setActivityEvents] = useState<CirclePulseActivityEvent[]>([]);
  const [typingMembers, setTypingMembers] = useState<Record<string, string>>({});
  const displayName = actorDisplayName?.trim() || 'Someone';

  const pushActivityEvent = useCallback((event: CirclePulseActivityEvent) => {
    if (!event.profileId || event.profileId === actorProfileId) return;
    const timerKey = `${event.type}:${event.profileId}`;
    const existingTimer = activityTimersRef.current[timerKey];
    if (existingTimer) clearTimeout(existingTimer);
    setActivityEvents((current) => [
      ...current.filter((entry) => !(entry.profileId === event.profileId && entry.type === event.type)),
      event,
    ]);
    activityTimersRef.current[timerKey] = setTimeout(() => {
      delete activityTimersRef.current[timerKey];
      setActivityEvents((current) => current.filter((entry) => entry.id !== event.id));
    }, ACTIVITY_EVENT_TTL_MS);
  }, [actorProfileId]);

  const clearTypingIdleTimer = useCallback(() => {
    if (!typingIdleTimerRef.current) return;
    clearTimeout(typingIdleTimerRef.current);
    typingIdleTimerRef.current = null;
  }, []);

  const clearRemoteTyping = useCallback((profileId?: string | null) => {
    if (!profileId) return;
    const timer = remoteTypingTimersRef.current[profileId];
    if (timer) clearTimeout(timer);
    delete remoteTypingTimersRef.current[profileId];
    setTypingMembers((current) => {
      if (!current[profileId]) return current;
      const next = { ...current };
      delete next[profileId];
      return next;
    });
  }, []);

  const setRemoteTyping = useCallback((profileId?: string | null, memberName?: string | null, typing = false) => {
    if (!profileId || profileId === actorProfileId) return;
    clearRemoteTyping(profileId);
    if (!typing) return;
    setTypingMembers((current) => ({
      ...current,
      [profileId]: memberName?.trim() || 'Someone',
    }));
    remoteTypingTimersRef.current[profileId] = setTimeout(() => {
      clearRemoteTyping(profileId);
    }, TYPING_IDLE_MS + 500);
  }, [actorProfileId, clearRemoteTyping]);

  const sendTypingState = useCallback((typing: boolean) => {
    const now = Date.now();
    const stateChanged = localTypingRef.current !== typing;
    if (!stateChanged && (!typing || now - lastTypingAnnouncementAtRef.current < TYPING_HEARTBEAT_MS)) return;
    localTypingRef.current = typing;
    if (typing) lastTypingAnnouncementAtRef.current = now;
    const channel = channelRef.current;
    if (!channel || !subscribedRef.current || AppState.currentState !== 'active') return;
    const at = new Date().toISOString();
    void channel.track({ profileId: actorProfileId, displayName, typing, at });
    if (!canSendWebsocketBroadcast(channel as any)) return;
    void channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { profileId: actorProfileId, displayName, typing, at },
    });
  }, [actorProfileId, displayName]);

  const notifyTyping = useCallback((typing: boolean) => {
    clearTypingIdleTimer();
    sendTypingState(typing);
    if (!typing) return;
    typingIdleTimerRef.current = setTimeout(() => {
      sendTypingState(false);
    }, TYPING_IDLE_MS);
  }, [clearTypingIdleTimer, sendTypingState]);

  const announceDiscussionChanged = useCallback(() => {
    const channel = channelRef.current;
    if (!channel || !subscribedRef.current || AppState.currentState !== 'active') return;
    if (!canSendWebsocketBroadcast(channel as any)) return;
    void channel.send({
      type: 'broadcast',
      event: 'discussion_changed',
      payload: {
        itemId,
        profileId: actorProfileId,
        displayName,
        at: new Date().toISOString(),
      },
    });
  }, [actorProfileId, displayName, itemId]);

  useEffect(() => {
    if (!enabled || !itemId || !actorProfileId) {
      setActiveViewerCount(0);
      setActiveMembers({});
      setActivityEvents([]);
      setTypingMembers({});
      return;
    }

    const channel = supabase.channel(`circle-pulse-discussion:${itemId}`, {
      config: {
        presence: { key: actorProfileId },
      },
    });
    channelRef.current = channel;
    let stopped = false;

    const syncPresence = () => {
      if (stopped) return;
      const state = channel.presenceState() as Record<string, PresenceEntry[]>;
      const profileIds = Object.keys(state);
      const nextMembers = Object.fromEntries(
        profileIds.map((profileId) => {
          const entries = state[profileId] ?? [];
          const memberName = entries.find((entry) => entry.displayName)?.displayName?.trim() || 'Someone';
          return [profileId, memberName];
        }),
      );
      setActiveViewerCount(profileIds.length);
      setActiveMembers(nextMembers);
      activeMembersRef.current = nextMembers;
      profileIds.forEach((profileId) => {
        const entries = state[profileId] ?? [];
        const typing = entries.some((entry) => entry.typing) === true;
        const memberName = entries.find((entry) => entry.displayName)?.displayName;
        setRemoteTyping(profileId, memberName, typing);
      });
      setTypingMembers((current) =>
        Object.fromEntries(Object.entries(current).filter(([profileId]) => profileIds.includes(profileId))),
      );
      return nextMembers;
    };

    const trackPresence = () => {
      if (stopped || !subscribedRef.current || AppState.currentState !== 'active') return;
      void channel.track({
        profileId: actorProfileId,
        displayName,
        typing: localTypingRef.current,
        joinedAt: new Date().toISOString(),
      });
    };

    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .on('presence', { event: 'join' }, (payload) => {
        const previousMembers = { ...activeMembersRef.current };
        const nextMembers = syncPresence() ?? {};
        const newPresences = Array.isArray((payload as any)?.newPresences) ? (payload as any).newPresences as PresenceEntry[] : [];
        newPresences.forEach((presence, index) => {
          const profileId = String(presence?.profileId ?? (payload as any)?.key ?? '');
          if (!profileId || previousMembers[profileId] || !nextMembers[profileId]) return;
          pushActivityEvent({
            id: `join:${profileId}:${Date.now()}:${index}`,
            profileId,
            displayName: presence?.displayName?.trim() || 'Someone',
            type: 'join',
          });
        });
      })
      .on('presence', { event: 'leave' }, (payload) => {
        const previousMembers = { ...activeMembersRef.current };
        const nextMembers = syncPresence() ?? {};
        const leftPresences = Array.isArray((payload as any)?.leftPresences) ? (payload as any).leftPresences as PresenceEntry[] : [];
        leftPresences.forEach((presence, index) => {
          const profileId = String(presence?.profileId ?? (payload as any)?.key ?? '');
          if (!profileId || !previousMembers[profileId] || nextMembers[profileId]) return;
          pushActivityEvent({
            id: `leave:${profileId}:${Date.now()}:${index}`,
            profileId,
            displayName: presence?.displayName?.trim() || previousMembers[profileId] || 'Someone',
            type: 'leave',
          });
        });
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        setRemoteTyping(payload?.profileId, payload?.displayName, payload?.typing === true);
      })
      .on('broadcast', { event: 'discussion_changed' }, ({ payload }) => {
        if (payload?.profileId === actorProfileId) return;
        onDiscussionChanged?.();
      })
      .subscribe((status) => {
        if (stopped) return;
        if (status === 'SUBSCRIBED') {
          subscribedRef.current = true;
          trackPresence();
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          subscribedRef.current = false;
        }
      });

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        trackPresence();
        return;
      }
      notifyTyping(false);
      if (subscribedRef.current) void channel.untrack();
    });

    return () => {
      stopped = true;
      appStateSubscription.remove();
      clearTypingIdleTimer();
      localTypingRef.current = false;
      lastTypingAnnouncementAtRef.current = 0;
      subscribedRef.current = false;
      void channel.untrack();
      supabase.removeChannel(channel);
      channelRef.current = null;
      Object.values(remoteTypingTimersRef.current).forEach((timer) => clearTimeout(timer));
      remoteTypingTimersRef.current = {};
      Object.values(activityTimersRef.current).forEach((timer) => clearTimeout(timer));
      activityTimersRef.current = {};
      setActiveViewerCount(0);
      setActiveMembers({});
      activeMembersRef.current = {};
      setActivityEvents([]);
      setTypingMembers({});
    };
  }, [actorProfileId, clearTypingIdleTimer, displayName, enabled, itemId, notifyTyping, onDiscussionChanged, pushActivityEvent, setRemoteTyping]);

  const activeMemberNames = useMemo(
    () =>
      Object.entries(activeMembers)
        .filter(([profileId]) => profileId !== actorProfileId)
        .map(([, memberName]) => memberName),
    [activeMembers, actorProfileId],
  );

  const presenceLabel = useMemo(() => {
    if (activeViewerCount <= 0) return 'Live discussion';
    if (activeMemberNames.length === 0) return 'Just you here';
    if (activeMemberNames.length === 1) return `${activeMemberNames[0]} here`;
    if (activeMemberNames.length === 2) return `${activeMemberNames[0]} and ${activeMemberNames[1]} here`;
    return `${activeMemberNames[0]}, ${activeMemberNames[1]} and ${activeMemberNames.length - 2} others here`;
  }, [activeMemberNames, activeViewerCount]);

  const typingLabel = useMemo(() => {
    const names = Object.values(typingMembers);
    if (names.length === 0) return null;
    if (names.length === 1) return `${names[0]} is typing`;
    return `${names[0]} and ${names.length - 1} other${names.length > 2 ? 's' : ''} are typing`;
  }, [typingMembers]);

  return {
    activeViewerCount,
    activeMemberNames,
    activityEvents,
    presenceLabel,
    typingLabel,
    notifyTyping,
    announceDiscussionChanged,
  };
}
