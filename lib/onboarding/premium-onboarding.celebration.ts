import AsyncStorage from "@react-native-async-storage/async-storage";

const CELEBRATION_VERSION = 1;
const CELEBRATION_TTL_MS = 24 * 60 * 60 * 1000;
const RECENT_COMPLETION_WINDOW_MS = 30 * 60 * 1000;
const CELEBRATION_KEY_PREFIX = "@betweener/onboarding-celebration/v1";
const CELEBRATION_SEEN_KEY_PREFIX = "@betweener/onboarding-celebration-seen/v1";

type PendingOnboardingCelebration = {
  version: typeof CELEBRATION_VERSION;
  userId: string;
  completionRequestId: string;
  createdAt: number;
  expiresAt: number;
};

const celebrationKey = (userId: string) => `${CELEBRATION_KEY_PREFIX}/${userId}`;
const celebrationSeenKey = (userId: string) => `${CELEBRATION_SEEN_KEY_PREFIX}/${userId}`;

export async function markOnboardingCelebrationSeen(userId: string): Promise<void> {
  await AsyncStorage.setItem(celebrationSeenKey(userId), String(Date.now()));
}

export async function markPendingOnboardingCelebration(args: {
  userId: string;
  completionRequestId: string;
}): Promise<void> {
  const now = Date.now();
  const pending: PendingOnboardingCelebration = {
    version: CELEBRATION_VERSION,
    userId: args.userId,
    completionRequestId: args.completionRequestId,
    createdAt: now,
    expiresAt: now + CELEBRATION_TTL_MS,
  };
  await AsyncStorage.setItem(celebrationKey(args.userId), JSON.stringify(pending));
}

export async function consumePendingOnboardingCelebration(userId: string): Promise<boolean> {
  const key = celebrationKey(userId);
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return false;

  // Remove first so remounts, retries, and tab changes cannot replay it.
  await AsyncStorage.removeItem(key);
  try {
    const pending = JSON.parse(raw) as Partial<PendingOnboardingCelebration>;
    const valid = pending.version === CELEBRATION_VERSION
      && pending.userId === userId
      && typeof pending.completionRequestId === "string"
      && pending.completionRequestId.length > 0
      && typeof pending.expiresAt === "number"
      && pending.expiresAt > Date.now();
    if (valid) await markOnboardingCelebrationSeen(userId);
    return valid;
  } catch {
    return false;
  }
}

export async function consumeRecentOnboardingCompletion(args: {
  userId: string;
  onboardingCompletedAt: string | null | undefined;
}): Promise<boolean> {
  if (!args.onboardingCompletedAt) return false;
  const completedAt = Date.parse(args.onboardingCompletedAt);
  const now = Date.now();
  if (!Number.isFinite(completedAt)
    || completedAt > now + 5 * 60 * 1000
    || now - completedAt > RECENT_COMPLETION_WINDOW_MS) return false;

  const seenAt = Number(await AsyncStorage.getItem(celebrationSeenKey(args.userId)) || "0");
  if (Number.isFinite(seenAt) && seenAt >= completedAt) return false;
  await markOnboardingCelebrationSeen(args.userId);
  return true;
}
