import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { subscribeThreadMessageRealtime } from '@/lib/chat/sync/chat-realtime-service';
import { subscribeUserChatBroadcast } from '@/lib/realtime/user-chat-broadcast';

const mockHandlers = new Map<string, (envelope: unknown) => void>();
const mockChannel = {
  on: jest.fn((_type: string, filter: { event: string }, handler: (envelope: unknown) => void) => {
    mockHandlers.set(filter.event, handler);
    return mockChannel;
  }),
  subscribe: jest.fn(() => mockChannel),
};
const mockCreateChannel = jest.fn((_topic: string, _options: unknown) => mockChannel);

jest.mock('@/lib/supabase', () => ({
  supabase: {
    realtime: { setAuth: jest.fn(async () => undefined) },
    channel: (...args: unknown[]) => Reflect.apply(mockCreateChannel, undefined, args),
    removeChannel: jest.fn(async () => undefined),
  },
}));

const releases: (() => void)[] = [];
const message = {
  id: 'message-1',
  sender_id: 'peer',
  receiver_id: 'me',
  text: 'Synthetic regression message',
  created_at: '2026-11-15T15:43:02.135Z',
  is_read: false,
  delivered_at: null,
};

const startThread = async () => {
  const callbacks = {
    onStatus: jest.fn(),
    onInboxInsert: jest.fn(),
    onInboxUpdate: jest.fn(),
    onSentInsert: jest.fn(),
    onSentUpdate: jest.fn(),
    onSystemInsert: jest.fn(),
  };
  releases.push(subscribeThreadMessageRealtime({ currentUserId: 'me', peerUserId: 'peer', ...callbacks }));
  await Promise.resolve();
  return callbacks;
};

const broadcast = (event: string, payload: unknown) => {
  const handler = mockHandlers.get(event);
  expect(handler).toBeDefined();
  handler!({ type: 'broadcast', event, payload });
};

describe('private user chat database broadcasts', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockHandlers.clear();
  });

  afterEach(() => {
    releases.splice(0).forEach(release => release());
    jest.advanceTimersByTime(1_000);
    jest.useRealTimers();
  });

  it.each([
    ['INSERT', false, 'onInboxInsert'],
    ['UPDATE', false, 'onInboxUpdate'],
    ['INSERT', true, 'onSentInsert'],
    ['UPDATE', true, 'onSentUpdate'],
  ] as const)('routes %s records for the correct direction (outgoing=%s)', async (event, outgoing, callback) => {
    const callbacks = await startThread();
    const row = outgoing ? { ...message, sender_id: 'me', receiver_id: 'peer' } : message;
    broadcast(event, { schema: 'public', table: 'messages', operation: event, record: row, old_record: null });
    expect(callbacks[callback]).toHaveBeenCalledWith(row);
    const otherCallbacks = Object.entries(callbacks).filter(([name]) => name !== callback);
    otherCallbacks.forEach(([, handler]) => expect(handler).not.toHaveBeenCalled());
  });

  it('routes system message records without creating another channel', async () => {
    const callbacks = await startThread();
    const listener = jest.fn();
    releases.push(subscribeUserChatBroadcast('me', listener));
    const row = { id: 'system-1', user_id: 'me', peer_user_id: 'peer', text: 'Synthetic notice' };
    broadcast('INSERT', { schema: 'public', table: 'system_messages', operation: 'INSERT', record: row });
    expect(callbacks.onSystemInsert).toHaveBeenCalledWith(row);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ new: row }));
    expect(mockCreateChannel).toHaveBeenCalledTimes(1);
    expect(mockCreateChannel).toHaveBeenCalledWith('user:me:chat', { config: { private: true } });
  });

  it('preserves receipt updates and delivers the event to every shared subscriber', async () => {
    const callbacks = await startThread();
    const listListener = jest.fn();
    releases.push(subscribeUserChatBroadcast('me', listListener));
    const oldRow = { ...message, sender_id: 'me', receiver_id: 'peer' };
    const row = { ...oldRow, is_read: true, delivered_at: '2026-11-15T15:43:03.000Z' };
    broadcast('UPDATE', { table: 'messages', operation: 'UPDATE', record: row, old_record: oldRow });
    expect(callbacks.onSentUpdate).toHaveBeenCalledWith(row);
    expect(listListener).toHaveBeenCalledWith({ eventType: 'UPDATE', table: 'messages', new: row, old: oldRow });
  });

  it('keeps delete identity in old and does not route it as an insert or update', async () => {
    const callbacks = await startThread();
    const listener = jest.fn();
    releases.push(subscribeUserChatBroadcast('me', listener));
    broadcast('DELETE', { table: 'messages', operation: 'DELETE', record: null, old_record: { id: message.id } });
    expect(listener).toHaveBeenCalledWith({ eventType: 'DELETE', table: 'messages', new: null, old: { id: message.id } });
    Object.values(callbacks).forEach(handler => expect(handler).not.toHaveBeenCalled());
  });

  it.each([null, {}, [], 'invalid', { id: '' }, { sender_id: 'peer', receiver_id: 'me' }])(
    'ignores missing or malformed rows without breaking the next event (%p)', async record => {
      const callbacks = await startThread();
      const listener = jest.fn();
      releases.push(subscribeUserChatBroadcast('me', listener));
      expect(() => broadcast('INSERT', { table: 'messages', record })).not.toThrow();
      expect(listener).not.toHaveBeenCalled();
      broadcast('INSERT', { table: 'messages', record: message });
      expect(callbacks.onInboxInsert).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledTimes(1);
    },
  );

  it('retains compatibility with existing new/old envelopes and direct payloads', async () => {
    const callbacks = await startThread();
    broadcast('INSERT', { table: 'messages', new: message, old: null });
    mockHandlers.get('UPDATE')!({ table: 'messages', new: message, old: message });
    expect(callbacks.onInboxInsert).toHaveBeenCalledWith(message);
    expect(callbacks.onInboxUpdate).toHaveBeenCalledWith(message);
  });

  it('ignores unrelated tables, schemas, operations and conversations', async () => {
    const callbacks = await startThread();
    broadcast('INSERT', { table: 'profiles', record: message });
    broadcast('INSERT', { schema: 'private', table: 'messages', record: message });
    broadcast('INSERT', { table: 'messages', operation: 'DELETE', record: message });
    broadcast('INSERT', { table: 'messages', record: { ...message, sender_id: 'someone-else' } });
    Object.values(callbacks).forEach(handler => expect(handler).not.toHaveBeenCalled());
  });
});
