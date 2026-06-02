export const ONLINE_WINDOW_MS = 3 * 60 * 1000;
export const ONLINE_HEARTBEAT_STALE_MS = 90 * 1000;
export const ACTIVE_WINDOW_MS = 15 * 60 * 1000;
export const RECENTLY_ACTIVE_WINDOW_MS = 45 * 60 * 1000;

const getLastActiveTime = (lastActive?: string | null) => {
  if (!lastActive) return null;
  const time = new Date(lastActive).getTime();
  return Number.isNaN(time) ? null : time;
};

export const getPresenceAgeMs = (lastActive?: string | null, now = Date.now()) => {
  const time = getLastActiveTime(lastActive);
  if (time == null) return null;
  return Math.max(0, now - time);
};

export const isOnlineFromLastActive = (lastActive?: string | null, now = Date.now()) => {
  const ageMs = getPresenceAgeMs(lastActive, now);
  return ageMs != null && ageMs <= ONLINE_WINDOW_MS;
};

export const isActiveFromLastActive = (lastActive?: string | null, now = Date.now()) => {
  const ageMs = getPresenceAgeMs(lastActive, now);
  return ageMs != null && ageMs <= ACTIVE_WINDOW_MS;
};

export const isRecentlyActiveFromLastActive = (lastActive?: string | null, now = Date.now()) => {
  const ageMs = getPresenceAgeMs(lastActive, now);
  return ageMs != null && ageMs > ACTIVE_WINDOW_MS && ageMs <= RECENTLY_ACTIVE_WINDOW_MS;
};

export const getPresenceDisplay = (lastActive?: string | null, now = Date.now()) => {
  const online = isOnlineFromLastActive(lastActive, now);
  const activeNow = !online && isActiveFromLastActive(lastActive, now);
  const recentlyActive = !online && !activeNow && isRecentlyActiveFromLastActive(lastActive, now);

  return {
    online,
    activeNow,
    recentlyActive,
    showPresence: online || activeNow || recentlyActive,
    label: online ? 'Online' : activeNow ? 'Active now' : recentlyActive ? 'Recently active' : '',
  };
};

export const getAuthoritativePresenceDisplay = (
  online?: boolean | null,
  lastActive?: string | null,
  now = Date.now(),
) => {
  const ageMs = getPresenceAgeMs(lastActive, now);
  const isFreshHeartbeat = ageMs != null && ageMs <= ONLINE_HEARTBEAT_STALE_MS;
  const isOnline = online === true && isFreshHeartbeat;
  const activeNow = !isOnline && ageMs != null && ageMs <= ACTIVE_WINDOW_MS;
  const recentlyActive =
    !isOnline &&
    !activeNow &&
    ageMs != null &&
    ageMs <= RECENTLY_ACTIVE_WINDOW_MS;

  return {
    online: isOnline,
    activeNow,
    recentlyActive,
    showPresence: isOnline || activeNow || recentlyActive,
    label: isOnline ? 'Online' : activeNow ? 'Active now' : recentlyActive ? 'Recently active' : '',
  };
};

export const getChatThreadPresenceKind = (
  online?: boolean | null,
  lastActive?: string | null,
  threadActive = false,
  now = Date.now(),
) => {
  const presence = getAuthoritativePresenceDisplay(online, lastActive, now);
  if (!presence.online) return 'offline' as const;
  return threadActive ? 'active_now' as const : 'recently_active' as const;
};

const hashRealtimeTopic = (value: string) => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const buildPairScopedRealtimeTopic = (
  prefix: string,
  userA: string,
  userB: string,
) => {
  const seed = [userA, userB].sort().join(':');
  return `${prefix}:${hashRealtimeTopic(seed)}`;
};

export const buildUserScopedRealtimeTopic = (prefix: string, userId: string) => {
  return `${prefix}:${hashRealtimeTopic(userId)}`;
};
