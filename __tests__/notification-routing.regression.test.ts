import test from "node:test";
import assert from "node:assert/strict";

import {
  buildNotificationRoute,
  getNotificationResponseKey,
  shouldDeferNotificationNavigation,
} from "../lib/notifications/notification-routing.ts";

test("message tap maps to chat route", () => {
  const route = buildNotificationRoute({
    actionIdentifier: "expo.notifications.actions.DEFAULT",
    requestIdentifier: "msg-1",
    data: {
      type: "message",
      profile_id: "user-123",
      name: "Akosua",
      avatar_url: "https://example.com/a.jpg",
    },
  });

  assert.deepEqual(route, {
    pathname: "/chat/[id]",
    params: {
      id: "user-123",
      userName: "Akosua",
      userAvatar: "https://example.com/a.jpg",
    },
  });
});

test("expo modules default action also maps to chat route", () => {
  const route = buildNotificationRoute({
    actionIdentifier: "expo.modules.notifications.actions.DEFAULT",
    requestIdentifier: "msg-1b",
    data: {
      type: "message",
      profile_id: "user-456",
      name: "Kojo",
      avatar_url: "https://example.com/k.jpg",
    },
  });

  assert.deepEqual(route, {
    pathname: "/chat/[id]",
    params: {
      id: "user-456",
      userName: "Kojo",
      userAvatar: "https://example.com/k.jpg",
    },
  });
});

test("request expired maps to intent inbox", () => {
  const route = buildNotificationRoute({
    actionIdentifier: "expo.notifications.actions.DEFAULT",
    requestIdentifier: "intent-1",
    data: {
      type: "system_message",
      event_type: "request_expired",
      intent_request_id: "req-9",
    },
  });

  assert.deepEqual(route, {
    pathname: "/(tabs)/intent",
    params: {
      requestId: "req-9",
    },
  });
});

test("verification outcome maps to profile verification state", () => {
  const route = buildNotificationRoute({
    actionIdentifier: "expo.notifications.actions.DEFAULT",
    requestIdentifier: "verify-1",
    data: {
      type: "verification_outcome",
    },
  });

  assert.deepEqual(route, {
    pathname: "/(tabs)/profile",
    params: {
      openVerification: "true",
    },
  });
});

test("custom deep route passthrough is preserved", () => {
  const route = buildNotificationRoute({
    actionIdentifier: "expo.notifications.actions.DEFAULT",
    requestIdentifier: "custom-1",
    data: {
      route: "/admin",
    },
  });

  assert.deepEqual(route, {
    pathname: "/admin",
  });
});

test("unknown action is ignored", () => {
  const route = buildNotificationRoute({
    actionIdentifier: "MARK_AS_READ",
    requestIdentifier: "custom-2",
    data: {
      type: "message",
      profile_id: "user-123",
    },
  });

  assert.equal(route, null);
});

test("response key stays stable across duplicate taps", () => {
  const key = getNotificationResponseKey({
    requestIdentifier: "abc123",
    actionIdentifier: "expo.notifications.actions.DEFAULT",
  });

  assert.equal(key, "abc123:expo.notifications.actions.DEFAULT");
});

test("recent cold-start notification should defer navigation", () => {
  const now = Date.UTC(2026, 4, 3, 18, 0, 0);
  const recent = now - 60_000;

  assert.equal(
    shouldDeferNotificationNavigation(
      {
        actionIdentifier: "expo.notifications.actions.DEFAULT",
        requestIdentifier: "recent-1",
        date: recent,
      },
      now
    ),
    true
  );
});

test("stale notification should not force gate redirect", () => {
  const now = Date.UTC(2026, 4, 3, 18, 0, 0);
  const stale = now - 11 * 60 * 1000;

  assert.equal(
    shouldDeferNotificationNavigation(
      {
        actionIdentifier: "expo.notifications.actions.DEFAULT",
        requestIdentifier: "stale-1",
        date: stale,
      },
      now
    ),
    false
  );
});
