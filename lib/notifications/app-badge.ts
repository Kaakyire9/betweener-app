import * as Notifications from 'expo-notifications';

let lastAppliedBadgeCount: number | null = null;

const normalizeBadgeCount = (count: number) => {
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.min(999, Math.floor(count)));
};

export const setAppIconBadgeCount = async (count: number) => {
  const next = normalizeBadgeCount(count);
  if (lastAppliedBadgeCount === next) return;
  lastAppliedBadgeCount = next;
  try {
    await Notifications.setBadgeCountAsync(next);
  } catch {
    // Some launchers/platform settings do not support badges. Best effort only.
  }
};

export const clearAppIconBadgeCount = async () => {
  await setAppIconBadgeCount(0);
};
