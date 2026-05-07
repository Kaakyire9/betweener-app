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

  if (pushType === "message" || pushType === "message_reaction") {
    const chatId = data?.profile_id || data?.reactor_id || data?.user_id;
    if (chatId) {
      return {
        pathname: "/chat/[id]",
        params: {
          id: String(chatId),
          userName: data?.name ? String(data.name) : "",
          userAvatar: data?.avatar_url ? String(data.avatar_url) : "",
        },
      };
    }
  }

  if (pushType === "match") {
    const chatId = data?.profile_id || data?.user_id;
    if (chatId) {
      return {
        pathname: "/chat/[id]",
        params: {
          id: String(chatId),
          userName: data?.name ? String(data.name) : "",
          userAvatar: data?.avatar_url ? String(data.avatar_url) : "",
        },
      };
    }
  }

  if (pushType === "system_message" && data?.event_type === "request_accepted") {
    const chatId = data?.profile_id || data?.user_id;
    if (chatId) {
      return {
        pathname: "/chat/[id]",
        params: {
          id: String(chatId),
          userName: data?.name ? String(data.name) : "",
          userAvatar: data?.avatar_url ? String(data.avatar_url) : "",
        },
      };
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
      return {
        pathname: "/chat/[id]",
        params: {
          id: String(chatId),
          userName: data?.name ? String(data.name) : "",
          userAvatar: data?.avatar_url ? String(data.avatar_url) : "",
          datePlanId: data?.date_plan_id ? String(data.date_plan_id) : "",
        },
      };
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
    return next;
  } catch {
    return null;
  }
}

export async function clearPendingNotificationRoute() {
  try {
    await AsyncStorage.removeItem(PENDING_NOTIFICATION_ROUTE_KEY);
  } catch {
    // best effort only
  }
}
