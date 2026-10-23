import AsyncStorage from '@react-native-async-storage/async-storage';

export type LastSignInMethod = 'google' | 'apple' | 'email_link' | 'password';

export type LastSignInMethodRecord = {
  version: 1;
  scope: string;
  method: LastSignInMethod;
  completedAt: number;
};

export type PendingSignInMethodAttempt = {
  version: 1;
  scope: string;
  attemptId: string;
  method: LastSignInMethod;
  createdAt: number;
  guidanceEpoch: number;
};

const ATTEMPT_TTL_MS = 24 * 60 * 60 * 1_000;

const getProjectRef = () => {
  try {
    const hostname = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL || '').hostname;
    return hostname.split('.')[0] || 'unconfigured';
  } catch {
    return 'unconfigured';
  }
};

export const getSignInMethodScope = () => {
  const environment = String(process.env.EXPO_PUBLIC_ENVIRONMENT || 'development')
    .trim()
    .toLowerCase() || 'development';
  return `${environment}:${getProjectRef()}`;
};

const scopedKey = (suffix: string) =>
  `auth_sign_in_guidance_v1:${getSignInMethodScope()}:${suffix}`;

const getLastMethodKey = () => scopedKey('last');
const getPendingAttemptKey = () => scopedKey('pending');
const getGuidanceEpochKey = () => scopedKey('epoch');

let operationQueue: Promise<unknown> = Promise.resolve();

const enqueue = async <T,>(operation: () => Promise<T>): Promise<T> => {
  const result = operationQueue.then(operation, operation);
  operationQueue = result.then(() => undefined, () => undefined);
  return await result;
};

const readGuidanceEpoch = async () => {
  const raw = await AsyncStorage.getItem(getGuidanceEpochKey());
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
};

const isMethod = (value: unknown): value is LastSignInMethod =>
  value === 'google' ||
  value === 'apple' ||
  value === 'email_link' ||
  value === 'password';

const parsePendingAttempt = (raw: string | null): PendingSignInMethodAttempt | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingSignInMethodAttempt>;
    if (
      parsed.version !== 1 ||
      parsed.scope !== getSignInMethodScope() ||
      typeof parsed.attemptId !== 'string' ||
      !parsed.attemptId ||
      !isMethod(parsed.method) ||
      typeof parsed.createdAt !== 'number' ||
      typeof parsed.guidanceEpoch !== 'number' ||
      Date.now() - parsed.createdAt > ATTEMPT_TTL_MS
    ) {
      return null;
    }
    return parsed as PendingSignInMethodAttempt;
  } catch {
    return null;
  }
};

export const readLastSignInMethod = async (): Promise<LastSignInMethodRecord | null> => {
  try {
    const raw = await AsyncStorage.getItem(getLastMethodKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastSignInMethodRecord>;
    if (
      parsed.version !== 1 ||
      parsed.scope !== getSignInMethodScope() ||
      !isMethod(parsed.method) ||
      typeof parsed.completedAt !== 'number'
    ) {
      await AsyncStorage.removeItem(getLastMethodKey());
      return null;
    }
    return parsed as LastSignInMethodRecord;
  } catch {
    return null;
  }
};

export const readPendingSignInMethodAttempt = async () => {
  const key = getPendingAttemptKey();
  const raw = await AsyncStorage.getItem(key);
  const parsed = parsePendingAttempt(raw);
  if (!parsed && raw) await AsyncStorage.removeItem(key);
  return parsed;
};

export const beginSignInMethodAttempt = async (
  method: LastSignInMethod,
): Promise<PendingSignInMethodAttempt> => enqueue(async () => {
  const guidanceEpoch = await readGuidanceEpoch();
  const attempt: PendingSignInMethodAttempt = {
    version: 1,
    scope: getSignInMethodScope(),
    attemptId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
    method,
    createdAt: Date.now(),
    guidanceEpoch,
  };
  await AsyncStorage.setItem(getPendingAttemptKey(), JSON.stringify(attempt));
  return attempt;
});

export const cancelSignInMethodAttempt = async (attemptId?: string | null) => enqueue(async () => {
  const pending = await readPendingSignInMethodAttempt();
  if (!pending) return;
  if (attemptId && pending.attemptId !== attemptId) return;
  await AsyncStorage.removeItem(getPendingAttemptKey());
});

export const completeSignInMethodAttempt = async ({
  attemptId,
  method,
  sessionUserId,
}: {
  attemptId: string;
  method: LastSignInMethod;
  sessionUserId: string;
}) => enqueue(async () => {
  if (!sessionUserId) return false;
  const [pending, guidanceEpoch] = await Promise.all([
    readPendingSignInMethodAttempt(),
    readGuidanceEpoch(),
  ]);
  if (
    !pending ||
    pending.attemptId !== attemptId ||
    pending.method !== method ||
    pending.guidanceEpoch !== guidanceEpoch
  ) {
    return false;
  }

  const record: LastSignInMethodRecord = {
    version: 1,
    scope: getSignInMethodScope(),
    method,
    completedAt: Date.now(),
  };
  await AsyncStorage.setItem(getLastMethodKey(), JSON.stringify(record));

  // A newer attempt may have replaced this one while the durable write was in
  // progress. Never remove the newer marker.
  const latest = await readPendingSignInMethodAttempt();
  if (latest?.attemptId === attemptId) {
    await AsyncStorage.removeItem(getPendingAttemptKey());
  }
  return true;
});

export const invalidatePendingSignInMethodAttempt = async () => enqueue(async () => {
  const nextEpoch = (await readGuidanceEpoch()) + 1;
  await AsyncStorage.setItem(getGuidanceEpochKey(), String(nextEpoch));
  await AsyncStorage.removeItem(getPendingAttemptKey());
});

export const forgetSignInMethodOnDevice = async () => enqueue(async () => {
  const nextEpoch = (await readGuidanceEpoch()) + 1;
  // Persist the epoch before deletion. A completion that started before this
  // action must observe the new epoch and cannot recreate the hint afterward.
  await AsyncStorage.setItem(getGuidanceEpochKey(), String(nextEpoch));
  await AsyncStorage.multiRemove([getLastMethodKey(), getPendingAttemptKey()]);
});

export const SIGN_IN_METHOD_LABELS: Record<LastSignInMethod, string> = {
  google: 'Google',
  apple: 'Apple',
  email_link: 'Email link',
  password: 'Email and password',
};
