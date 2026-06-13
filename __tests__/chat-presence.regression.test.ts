// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTIVE_WINDOW_MS,
  ONLINE_HEARTBEAT_STALE_MS,
  RECENTLY_ACTIVE_WINDOW_MS,
  getAuthoritativePresenceDisplay,
  getChatThreadPresenceKind,
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
  resolveThreadUnreadCount,
  setActiveChatThread,
} from '../lib/chat/active-thread.ts';
import { isNetworkConnectionAvailable } from '../lib/network-state.ts';
import {
  getJwtExpirySeconds,
  isSupabaseAccessTokenUsable,
  isSupabaseSessionUsable,
} from '../lib/auth/session-token.ts';

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
