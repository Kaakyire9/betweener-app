// @ts-nocheck
import test from 'node:test';
import { buildThreadPresenceBatchWrite } from '../lib/chat/local/chat-presence-write.ts';
import { createPresenceWriteCoordinator } from '../lib/presence-write-coordinator.ts';
import assert from 'node:assert/strict';

import {
  ACTIVE_WINDOW_MS,
  ONLINE_HEARTBEAT_STALE_MS,
  RECENTLY_ACTIVE_WINDOW_MS,
  getAuthoritativePresenceDisplay,
  getChatThreadPresenceKind,
  resolveLatestPeerActivityAt,
} from '../lib/presence.ts';
import {
  getThreadRealtimeReconnectDelayMs,
  THREAD_ACTIVITY_FOREGROUND_REANNOUNCE_DELAYS_MS,
  THREAD_ACTIVITY_HEARTBEAT_MS,
  THREAD_ACTIVITY_LEASE_MS,
  THREAD_REALTIME_RECONNECT_DELAYS_MS,
  isPeerThreadActivityLeaseFresh,
} from '../lib/chat/thread-activity.ts';
import { canSendWebsocketBroadcast } from '../lib/chat/realtime-channel.ts';
import {
  clearActiveChatThread,
  isActiveChatThread,
  markChatThreadOptimisticallyRead,
  resolveThreadUnreadCount,
  setActiveChatThread,
} from '../lib/chat/active-thread.ts';
import { isNetworkConnectionAvailable } from '../lib/network-state.ts';
import {
  getJwtExpirySeconds,
  isSupabaseAccessTokenUsable,
  isSupabaseSessionUsable,
} from '../lib/auth/session-token.ts';

test('presence persistence collapses duplicate peers into one atomic statement', () => {
  const batch = buildThreadPresenceBatchWrite(
    'owner-a',
    [
      { threadId: 'peer-a', online: false, lastActive: '2026-07-31T09:00:00.000Z' },
      { threadId: 'peer-b', online: true, lastActive: '2026-07-31T09:01:00.000Z' },
      { threadId: 'peer-a', online: true, lastActive: '2026-07-31T09:02:00.000Z' },
    ],
    '2026-07-31T09:03:00.000Z',
  );

  assert.ok(batch);
  assert.equal(batch.updateCount, 2);
  assert.match(batch.query, /update chat_threads/);
  assert.match(batch.query, /owner_user_id = \?/);
  assert.deepEqual(batch.params.slice(-4), [
    '2026-07-31T09:03:00.000Z',
    'owner-a',
    'peer-a',
    'peer-b',
  ]);
  assert.equal(batch.params[1], 'online');
});

test('presence persistence ignores an empty or invalid batch', () => {
  assert.equal(buildThreadPresenceBatchWrite('owner-a', [], 'now'), null);
  assert.equal(
    buildThreadPresenceBatchWrite('owner-a', [{ threadId: '', online: true }], 'now'),
    null,
  );
});

test('presence writes collapse concurrent duplicate lifecycle signals', async () => {
  let releaseFirstWrite;
  const firstWrite = new Promise((resolve) => {
    releaseFirstWrite = resolve;
  });
  const writes = [];
  const coordinator = createPresenceWriteCoordinator();
  const execute = async (_scopeKey, online) => {
    writes.push(online);
    if (writes.length === 1) await firstWrite;
    return true;
  };

  const first = coordinator.request('user-a', true, execute);
  const duplicate = coordinator.request('user-a', true, execute);
  releaseFirstWrite();
  await Promise.all([first, duplicate]);

  assert.deepEqual(writes, [true]);
});

test('presence writes preserve the latest state requested during an active write', async () => {
  let releaseFirstWrite;
  const firstWrite = new Promise((resolve) => {
    releaseFirstWrite = resolve;
  });
  const writes = [];
  const coordinator = createPresenceWriteCoordinator();
  const execute = async (_scopeKey, online) => {
    writes.push(online);
    if (writes.length === 1) await firstWrite;
    return true;
  };

  const online = coordinator.request('user-a', true, execute);
  const offline = coordinator.request('user-a', false, execute);
  releaseFirstWrite();
  await Promise.all([online, offline]);

  assert.deepEqual(writes, [true, false]);
});

test('presence heartbeats refresh after the minimum interval', async () => {
  let now = 1_000;
  const writes = [];
  const coordinator = createPresenceWriteCoordinator({
    minimumOnlineRefreshMs: 5_000,
    now: () => now,
  });
  const execute = async (_scopeKey, online) => {
    writes.push(online);
    return true;
  };

  await coordinator.request('user-a', true, execute);
  now += 4_999;
  await coordinator.request('user-a', true, execute);
  now += 1;
  await coordinator.request('user-a', true, execute);

  assert.deepEqual(writes, [true, true]);
});

const now = Date.parse('2026-06-01T12:00:00.000Z');
const ago = (ageMs: number) => new Date(now - ageMs).toISOString();
const jwtWithExpiry = (expiresAt: number) =>
  `header.${Buffer.from(JSON.stringify({ exp: expiresAt })).toString('base64url')}.signature`;

test('authoritative chat presence requires both an online flag and a fresh heartbeat', () => {
  assert.deepEqual(
    getAuthoritativePresenceDisplay(true, ago(ONLINE_HEARTBEAT_STALE_MS - 1), now),
    {
      online: true,
      activeNow: false,
      recentlyActive: false,
      showPresence: true,
      label: 'Online',
    },
  );
});

test('authoritative chat presence drops Online immediately when backend marks peer offline', () => {
  assert.deepEqual(
    getAuthoritativePresenceDisplay(false, ago(10_000), now),
    {
      online: false,
      activeNow: true,
      recentlyActive: false,
      showPresence: true,
      label: 'Active now',
    },
  );
});

test('authoritative chat presence expires stale Online flags when an offline event is missed', () => {
  assert.deepEqual(
    getAuthoritativePresenceDisplay(true, ago(ONLINE_HEARTBEAT_STALE_MS + 1), now),
    {
      online: false,
      activeNow: true,
      recentlyActive: false,
      showPresence: true,
      label: 'Active now',
    },
  );
});

test('authoritative chat presence progresses from Active now to Recently active to hidden', () => {
  assert.equal(
    getAuthoritativePresenceDisplay(false, ago(ACTIVE_WINDOW_MS + 1), now).label,
    'Recently active',
  );
  assert.equal(
    getAuthoritativePresenceDisplay(false, ago(RECENTLY_ACTIVE_WINDOW_MS + 1), now).label,
    '',
  );
});

test('thread presence wording prioritizes direct room membership over durable heartbeat lag', () => {
  const fresh = ago(10_000);
  assert.equal(getChatThreadPresenceKind(true, fresh, true, now), 'active_now');
  assert.equal(getChatThreadPresenceKind(true, fresh, false, now), 'recently_active');
  assert.equal(getChatThreadPresenceKind(false, fresh, true, now), 'active_now');
});

test('a received peer message advances stale last-seen evidence', () => {
  assert.equal(
    resolveLatestPeerActivityAt(ago(10 * 60_000), ago(2 * 60_000), now),
    ago(2 * 60_000),
  );
});

test('message evidence never downgrades a fresher heartbeat or renders in the future', () => {
  assert.equal(
    resolveLatestPeerActivityAt(ago(30_000), ago(2 * 60_000), now),
    ago(30_000),
  );
  assert.equal(
    resolveLatestPeerActivityAt(null, new Date(now + 60_000).toISOString(), now),
    new Date(now).toISOString(),
  );
});

test('thread activity lease absorbs transient sync gaps but expires without heartbeats', () => {
  assert.ok(THREAD_ACTIVITY_LEASE_MS > THREAD_ACTIVITY_HEARTBEAT_MS * 2);
  assert.equal(
    isPeerThreadActivityLeaseFresh(now - THREAD_ACTIVITY_LEASE_MS + 1, now),
    true,
  );
  assert.equal(
    isPeerThreadActivityLeaseFresh(now - THREAD_ACTIVITY_LEASE_MS - 1, now),
    false,
  );
});

test('foreground presence retries while the websocket channel rejoins', () => {
  assert.deepEqual(THREAD_ACTIVITY_FOREGROUND_REANNOUNCE_DELAYS_MS, [0, 750]);
});

test('thread realtime reconnect uses bounded backoff', () => {
  assert.deepEqual(THREAD_REALTIME_RECONNECT_DELAYS_MS, [750, 2_000, 5_000, 10_000]);
  assert.equal(getThreadRealtimeReconnectDelayMs(-1), 750);
  assert.equal(getThreadRealtimeReconnectDelayMs(0), 750);
  assert.equal(getThreadRealtimeReconnectDelayMs(1), 2_000);
  assert.equal(getThreadRealtimeReconnectDelayMs(99), 10_000);
});

test('ephemeral broadcasts only send through a joined websocket channel', () => {
  assert.equal(
    canSendWebsocketBroadcast({
      state: 'joined',
      socket: { isConnected: () => true },
    }),
    true,
  );
  assert.equal(
    canSendWebsocketBroadcast({
      state: 'joined',
      socket: { isConnected: () => false },
    }),
    false,
  );
  assert.equal(
    canSendWebsocketBroadcast({
      state: 'joining',
      socket: { isConnected: () => true },
    }),
    false,
  );
});

test('global chat hydration yields ownership to the focused thread', () => {
  const token = setActiveChatThread('me', 'peer-a');
  assert.equal(isActiveChatThread('me', 'peer-a'), true);
  assert.equal(isActiveChatThread('me', 'peer-b'), false);
  clearActiveChatThread('me', 'peer-a', token);
  assert.equal(isActiveChatThread('me', 'peer-a'), false);
});

test('stale screen cleanup cannot clear newer active-thread ownership', () => {
  const staleToken = setActiveChatThread('me', 'peer-a');
  const currentToken = setActiveChatThread('me', 'peer-a');
  clearActiveChatThread('me', 'peer-a', staleToken);
  assert.equal(isActiveChatThread('me', 'peer-a'), true);
  clearActiveChatThread('me', 'peer-a', currentToken);
  assert.equal(isActiveChatThread('me', 'peer-a'), false);
});

test('active thread rejects stale remote unread counts', () => {
  const token = setActiveChatThread('me', 'peer-a');

  assert.equal(resolveThreadUnreadCount('me', 'peer-a', 3), 0);
  assert.equal(resolveThreadUnreadCount('me', 'peer-b', 3), 3);

  clearActiveChatThread('me', 'peer-a', token);
  assert.equal(resolveThreadUnreadCount('me', 'peer-a', 3), 3);
});

test('recently read thread rejects stale summaries but accepts a newer message', () => {
  const readThrough = new Date('2026-07-23T10:00:00.000Z');
  markChatThreadOptimisticallyRead('reader', 'peer-read', readThrough);

  assert.equal(
    resolveThreadUnreadCount(
      'reader',
      'peer-read',
      4,
      new Date('2026-07-23T09:59:59.000Z'),
    ),
    0,
  );
  assert.equal(
    resolveThreadUnreadCount(
      'reader',
      'peer-read',
      1,
      new Date('2026-07-23T10:00:01.000Z'),
    ),
    1,
  );
});

test('auth recovery does not treat unknown or disconnected NetInfo state as online', () => {
  assert.equal(isNetworkConnectionAvailable(null), false);
  assert.equal(
    isNetworkConnectionAvailable({ isConnected: null, isInternetReachable: null }),
    false,
  );
  assert.equal(
    isNetworkConnectionAvailable({ isConnected: false, isInternetReachable: false }),
    false,
  );
  assert.equal(
    isNetworkConnectionAvailable({ isConnected: true, isInternetReachable: null }),
    true,
  );
});

test('auth recovery never reuses an expired persisted JWT for data requests', () => {
  const nowMs = Date.parse('2026-06-01T12:00:00.000Z');
  const nowSeconds = Math.floor(nowMs / 1000);
  const expiredToken = jwtWithExpiry(nowSeconds - 60);
  const freshToken = jwtWithExpiry(nowSeconds + 3600);

  assert.equal(getJwtExpirySeconds(expiredToken), nowSeconds - 60);
  assert.equal(isSupabaseAccessTokenUsable(expiredToken, nowMs), false);
  assert.equal(isSupabaseAccessTokenUsable(freshToken, nowMs), true);
  assert.equal(isSupabaseSessionUsable({ access_token: expiredToken, expires_at: nowSeconds - 60 }, nowMs), false);
  assert.equal(isSupabaseSessionUsable({ access_token: freshToken, expires_at: nowSeconds + 3600 }, nowMs), true);
});
