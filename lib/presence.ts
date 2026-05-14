export const ONLINE_WINDOW_MS = 3 * 60 * 1000;
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
