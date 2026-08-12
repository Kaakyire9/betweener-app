let activeOwnerUserId: string | null = null;
let activePeerUserId: string | null = null;
let activeToken: symbol | null = null;

type OptimisticThreadRead = {
  readThroughMs: number;
  recordedAtMs: number;
};

type OptimisticThreadReadListener = (
  ownerUserId: string,
  peerUserId: string,
  readThroughMs: number,
) => void;

const OPTIMISTIC_READ_TTL_MS = 10 * 60 * 1000;
const optimisticThreadReads = new Map<string, OptimisticThreadRead>();
const optimisticThreadReadListeners = new Set<OptimisticThreadReadListener>();

const buildThreadKey = (ownerUserId: string, peerUserId: string) =>
  `${ownerUserId}:${peerUserId}`;

const coerceTimestampMs = (
  value?: Date | string | number | null,
): number | null => {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim()) {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  return null;
};

const getOptimisticThreadRead = (
  ownerUserId: string,
  peerUserId: string,
) => {
  const key = buildThreadKey(ownerUserId, peerUserId);
  const entry = optimisticThreadReads.get(key);
  if (!entry) return null;
  if (Date.now() - entry.recordedAtMs <= OPTIMISTIC_READ_TTL_MS) {
    return entry;
  }
  optimisticThreadReads.delete(key);
  return null;
};

export const markChatThreadOptimisticallyRead = (
  ownerUserId: string | null | undefined,
  peerUserId: string | null | undefined,
  readThrough: Date | string | number | null,
) => {
  if (!ownerUserId || !peerUserId) return;
  const readThroughMs = coerceTimestampMs(readThrough);
  if (readThroughMs === null) return;
  const key = buildThreadKey(ownerUserId, peerUserId);
  const current = getOptimisticThreadRead(ownerUserId, peerUserId);
  const nextReadThroughMs = Math.max(current?.readThroughMs ?? 0, readThroughMs);
  optimisticThreadReads.set(key, {
    readThroughMs: nextReadThroughMs,
    recordedAtMs: Date.now(),
  });
  optimisticThreadReadListeners.forEach((listener) => {
    listener(ownerUserId, peerUserId, nextReadThroughMs);
  });
};

export const subscribeOptimisticThreadReads = (
  listener: OptimisticThreadReadListener,
) => {
  optimisticThreadReadListeners.add(listener);
  return () => {
    optimisticThreadReadListeners.delete(listener);
  };
};

export const setActiveChatThread = (
  ownerUserId: string | null | undefined,
  peerUserId: string | null | undefined,
) => {
  const token = Symbol("active-chat-thread");
  activeOwnerUserId = ownerUserId ?? null;
  activePeerUserId = peerUserId ?? null;
  activeToken = token;
  return token;
};

export const clearActiveChatThread = (
  ownerUserId: string | null | undefined,
  peerUserId: string | null | undefined,
  token?: symbol | null,
) => {
  if (activeOwnerUserId !== (ownerUserId ?? null)) return;
  if (activePeerUserId !== (peerUserId ?? null)) return;
  if (token && activeToken !== token) return;
  activeOwnerUserId = null;
  activePeerUserId = null;
  activeToken = null;
};

export const isActiveChatThread = (
  ownerUserId: string | null | undefined,
  peerUserId: string | null | undefined,
) =>
  Boolean(
    ownerUserId &&
      peerUserId &&
      activeOwnerUserId === ownerUserId &&
      activePeerUserId === peerUserId,
  );

export const resolveThreadUnreadCount = (
  ownerUserId: string | null | undefined,
  peerUserId: string | null | undefined,
  unreadCount: number,
  latestMessageAt?: Date | string | number | null,
) => {
  if (isActiveChatThread(ownerUserId, peerUserId)) return 0;
  if (ownerUserId && peerUserId) {
    const optimisticRead = getOptimisticThreadRead(ownerUserId, peerUserId);
    const latestMessageAtMs = coerceTimestampMs(latestMessageAt);
    if (
      optimisticRead &&
      latestMessageAtMs !== null &&
      latestMessageAtMs <= optimisticRead.readThroughMs
    ) {
      return 0;
    }
  }
  return Math.max(0, unreadCount);
};
