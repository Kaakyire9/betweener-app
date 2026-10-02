import { supabase } from '@/lib/supabase';

export type UserChatBroadcastChange = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  table: 'messages' | 'system_messages';
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
};

type Listener = (change: UserChatBroadcastChange) => void;
type StatusListener = (status: string) => void;
type Entry = {
  channel: ReturnType<typeof supabase.channel> | null;
  listeners: Set<Listener>;
  statusListeners: Set<StatusListener>;
  status: string | null;
  startPromise: Promise<void> | null;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
};

const entries = new Map<string, Entry>();

const normalizeChange = (
  eventType: UserChatBroadcastChange['eventType'],
  envelope: any,
): UserChatBroadcastChange | null => {
  const payload = envelope?.payload ?? envelope;
  const table = payload?.table;
  if (table !== 'messages' && table !== 'system_messages') return null;
  return {
    eventType,
    table,
    new: payload?.new && typeof payload.new === 'object' ? payload.new : null,
    old: payload?.old && typeof payload.old === 'object' ? payload.old : null,
  };
};

const start = (userId: string, entry: Entry) => {
  if (entry.channel || entry.startPromise) return;
  entry.startPromise = (async () => {
    await supabase.realtime.setAuth();
    if (entries.get(userId) !== entry || entry.listeners.size === 0) return;

    const notify = (eventType: UserChatBroadcastChange['eventType'], envelope: any) => {
      const change = normalizeChange(eventType, envelope);
      if (!change) return;
      entry.listeners.forEach((listener) => listener(change));
    };
    const channel = supabase
      .channel(`user:${userId}:chat`, { config: { private: true } })
      .on('broadcast', { event: 'INSERT' }, (payload) => notify('INSERT', payload))
      .on('broadcast', { event: 'UPDATE' }, (payload) => notify('UPDATE', payload))
      .on('broadcast', { event: 'DELETE' }, (payload) => notify('DELETE', payload));
    entry.channel = channel;
    channel.subscribe((status) => {
      entry.status = status;
      entry.statusListeners.forEach((listener) => listener(status));
    });
  })().catch(() => {
    entry.status = 'CHANNEL_ERROR';
    entry.statusListeners.forEach((listener) => listener('CHANNEL_ERROR'));
  }).finally(() => {
    entry.startPromise = null;
  });
};

export const subscribeUserChatBroadcast = (
  userId: string,
  listener: Listener,
  statusListener?: StatusListener,
) => {
  let entry = entries.get(userId);
  if (!entry) {
    entry = {
      channel: null,
      listeners: new Set(),
      statusListeners: new Set(),
      status: null,
      startPromise: null,
      cleanupTimer: null,
    };
    entries.set(userId, entry);
  }
  if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);
  entry.cleanupTimer = null;
  entry.listeners.add(listener);
  if (statusListener) {
    entry.statusListeners.add(statusListener);
    if (entry.status) statusListener(entry.status);
  }
  start(userId, entry);

  return () => {
    const current = entries.get(userId);
    if (current !== entry) return;
    entry.listeners.delete(listener);
    if (statusListener) entry.statusListeners.delete(statusListener);
    if (entry.listeners.size > 0 || entry.cleanupTimer) return;
    entry.cleanupTimer = setTimeout(() => {
      entry!.cleanupTimer = null;
      if (entry!.listeners.size > 0 || entries.get(userId) !== entry) return;
      entries.delete(userId);
      const channel = entry!.channel;
      entry!.channel = null;
      entry!.status = null;
      if (channel) void supabase.removeChannel(channel);
    }, 1_000);
  };
};
