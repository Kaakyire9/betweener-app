import AsyncStorage from "@react-native-async-storage/async-storage";

export const PENDING_NOTIFICATION_ROUTE_KEY = "pending_notification_route_v1";
export const PENDING_NOTIFICATION_ROUTE_MAX_AGE_MS = 10 * 60 * 1000;

export type DeferredNotificationRoute = {
  pathname: string;
  params?: Record<string, string>;
  createdAt: number;
};

export type NotificationRouteInput = {
  actionIdentifier: string;
  requestIdentifier?: string | null;
  date?: number | string | Date | null;
  data?: Record<string, unknown> | null;
};

type PendingNotificationRouteListener = () => void;

let pendingNotificationRouteVersion = 0;
const pendingNotificationRouteListeners = new Set<PendingNotificationRouteListener>();

function emitPendingNotificationRouteChange() {
  pendingNotificationRouteVersion += 1;
  pendingNotificationRouteListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Notification route listeners are best-effort only.
    }
  });
}

export function subscribePendingNotificationRouteChanges(listener: PendingNotificationRouteListener) {
  pendingNotificationRouteListeners.add(listener);
  return () => {
    pendingNotificationRouteListeners.delete(listener);
  };
}

export function getPendingNotificationRouteVersion() {
  return pendingNotificationRouteVersion;
}

const DEFAULT_NOTIFICATION_ACTION_IDENTIFIERS = new Set([
  "expo.notifications.actions.DEFAULT",
  "expo.modules.notifications.actions.DEFAULT",
  "DEFAULT",
]);

export function getNotificationResponseKey(input: NotificationRouteInput): string {
  return `${String(input.requestIdentifier ?? "")}:${input.actionIdentifier}`;
}

export function getNotificationTimestampMs(input: NotificationRouteInput): number {
  const raw = input.date;
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function shouldDeferNotificationNavigation(
  input: NotificationRouteInput,
  now = Date.now()
): boolean {
  const createdAt = getNotificationTimestampMs(input);
  if (!createdAt) return true;
  return now - createdAt <= PENDING_NOTIFICATION_ROUTE_MAX_AGE_MS;
}

export function buildNotificationRoute(
  input: NotificationRouteInput
): Omit<DeferredNotificationRoute, "createdAt"> | null {
  const action = input.actionIdentifier;
  const data = input.data ?? undefined;
  const pushType = typeof data?.type === "string" ? data.type : undefined;

  const isDefaultTap =
    DEFAULT_NOTIFICATION_ACTION_IDENTIFIERS.has(action) ||
    action.endsWith(".DEFAULT");
  const isOpenAction =
    action === "OPEN_CHAT" ||
    action === "OPEN_PROFILE" ||
    action === "OPEN_MOMENTS" ||
    action === "OPEN_COMPASS";

  if (!isDefaultTap && !isOpenAction) {
    return null;
  }

  const buildChatRoute = (fallbackId: unknown, extras?: Record<string, string>) => {
    const profileId =
      typeof data?.profile_id === "string" && data.profile_id
        ? String(data.profile_id)
        : typeof data?.reactor_id === "string" && data.reactor_id
          ? String(data.reactor_id)
          : "";
    const peerUserId =
      typeof data?.user_id === "string" && data.user_id ? String(data.user_id) : "";
    const routeId = fallbackId ? String(fallbackId) : peerUserId || profileId;
    if (!routeId) return null;
    return {
      pathname: "/chat/[id]",
      params: {
        id: routeId,
        ...(peerUserId ? { peerUserId } : {}),
        ...(profileId ? { peerProfileId: profileId } : {}),
        ...(data?.name ? { userName: String(data.name) } : {}),
        ...(data?.avatar_url ? { userAvatar: String(data.avatar_url) } : {}),
        ...(extras ?? {}),
      },
    } satisfies Omit<DeferredNotificationRoute, "createdAt">;
  };

  if (pushType === "message" || pushType === "message_reaction") {
    const chatId = data?.profile_id || data?.reactor_id || data?.user_id;
    if (chatId) {
      return buildChatRoute(chatId);
    }
  }

  if (pushType === "match") {
    const chatId = data?.profile_id || data?.user_id;
    if (chatId) {
      return buildChatRoute(chatId);
    }
  }

  if (pushType === "system_message" && data?.event_type === "request_accepted") {
    const chatId = data?.profile_id || data?.user_id;
    if (chatId) {
      return buildChatRoute(chatId);
    }
  }

  if (
    pushType === "system_message" &&
    (
      data?.event_type === "date_plan_accepted" ||
      data?.event_type === "date_plan_declined" ||
      data?.event_type === "date_plan_cancelled" ||
      data?.event_type === "date_plan_concierge_requested"
    )
  ) {
    const chatId = data?.profile_id || data?.user_id;
    if (chatId) {
      return buildChatRoute(chatId, {
        datePlanId: data?.date_plan_id ? String(data.date_plan_id) : "",
      });
    }
  }

  if (pushType === "system_message" && data?.event_type === "request_expired") {
    return {
      pathname: "/(tabs)/intent",
      params: {
        requestId: data?.intent_request_id ? String(data.intent_request_id) : "",
      },
    };
  }

  if (pushType === "system_message" && data?.event_type === "admin_queue_item") {
    return { pathname: "/admin" };
  }

  if (pushType === "moment_post" || pushType === "moment_reaction" || pushType === "moment_comment") {
    const startUserId =
      data?.start_user_id ||
      data?.poster_user_id ||
      data?.moment_owner_user_id ||
      data?.user_id;
    const momentId = data?.moment_id || data?.momentId;
    return {
      pathname: "/moments",
      params: {
        startUserId: startUserId ? String(startUserId) : "",
        startMomentId: momentId ? String(momentId) : "",
        openComments: pushType === "moment_comment" ? "1" : "",
        entrySource: pushType === "moment_comment" ? "comment" : pushType === "moment_reaction" ? "reaction" : "",
        commentId: pushType === "moment_comment" && data?.comment_id ? String(data.comment_id) : "",
        reactionEmoji:
          pushType === "moment_reaction" && data?.emoji
            ? String(data.emoji)
            : pushType === "moment_reaction" && data?.reaction_emoji
              ? String(data.reaction_emoji)
              : "",
      },
    };
  }

  if (pushType === "intent_request" || pushType === "intent_expiring_soon" || pushType === "intent_last_chance") {
    const requestId = data?.request_id || data?.requestId;
    const requestType = data?.request_type || data?.requestType;
    return {
      pathname: "/(tabs)/intent",
      params: {
        requestId: requestId ? String(requestId) : "",
        type: requestType ? String(requestType) : "",
      },
    };
  }

  if (pushType === "verification_outcome") {
    return {
      pathname: "/(tabs)/profile",
      params: {
        openVerification: "true",
      },
    };
  }

  if (pushType === "relationship_compass_ready") {
    return { pathname: "/relationship-compass" };
  }

  if ((pushType === "circle_love_seat" || pushType === "circle_invitation") && data?.circle_id) {
    return {
      pathname: "/circles/[id]",
      params: {
        id: String(data.circle_id),
      },
    };
  }

  if ((pushType === "circle_pulse_discussion" || pushType === "circle_pulse_reaction") && data?.circle_id) {
    const pulseRouteNonce = getNotificationResponseKey(input) || String(Date.now());
    return {
      pathname: "/circles/[id]",
      params: {
        id: String(data.circle_id),
        ...(data?.pulse_item_id ? { openPulseItemId: String(data.pulse_item_id) } : {}),
        ...(data?.comment_id ? { openPulseCommentId: String(data.comment_id) } : {}),
        ...(data?.parent_comment_id ? { openPulseParentCommentId: String(data.parent_comment_id) } : {}),
        openPulseRouteNonce: pulseRouteNonce,
      },
    };
  }

  const route = typeof data?.route === "string" ? String(data.route) : "";
  if (route && route.startsWith("/")) {
    return { pathname: route };
  }

  const profileId = data?.profile_id || data?.profileId;
  if (profileId) {
    return {
      pathname: "/profile-view",
      params: { profileId: String(profileId) },
    };
  }

  return null;
}

export async function persistPendingNotificationRoute(
  target: Omit<DeferredNotificationRoute, "createdAt">
) {
  await AsyncStorage.setItem(
    PENDING_NOTIFICATION_ROUTE_KEY,
    JSON.stringify({
      ...target,
      createdAt: Date.now(),
    } satisfies DeferredNotificationRoute)
  );
  emitPendingNotificationRouteChange();
}

export async function peekPendingNotificationRoute() {
  try {
    const raw = await AsyncStorage.getItem(PENDING_NOTIFICATION_ROUTE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      pathname?: string;
      params?: Record<string, string>;
      createdAt?: number;
    };
    if (!parsed?.pathname || typeof parsed.pathname !== "string") {
      return null;
    }
    if (
      typeof parsed.createdAt === "number" &&
      Date.now() - parsed.createdAt > PENDING_NOTIFICATION_ROUTE_MAX_AGE_MS
    ) {
      await AsyncStorage.removeItem(PENDING_NOTIFICATION_ROUTE_KEY);
      emitPendingNotificationRouteChange();
      return null;
    }
    return {
      pathname: parsed.pathname,
      params: parsed.params && typeof parsed.params === "object" ? parsed.params : undefined,
    };
  } catch {
    return null;
  }
}

export async function consumePendingNotificationRoute() {
  try {
    const next = await peekPendingNotificationRoute();
    if (!next) return null;
    await AsyncStorage.removeItem(PENDING_NOTIFICATION_ROUTE_KEY);
    emitPendingNotificationRouteChange();
    return next;
  } catch {
    return null;
  }
}

export async function clearPendingNotificationRoute() {
  try {
    await AsyncStorage.removeItem(PENDING_NOTIFICATION_ROUTE_KEY);
    emitPendingNotificationRouteChange();
  } catch {
    // best effort only
  }
}
