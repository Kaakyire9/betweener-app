import AsyncStorage from '@react-native-async-storage/async-storage';

export type RelationshipGistLocalState = {
  saved: boolean;
  savedVersion: number;
  progress: number;
  lastReadAt: number | null;
  lastOpenedAt: number | null;
  lastPerspective: string | null;
  lastAnchor: string | null;
  lastAnchorOffset: number | null;
  scrollCompletedAt: number | null;
  readAcknowledgedAt: number | null;
  readingDurationMs: number;
  updatedAt: number;
};

export type RelationshipGistLocalStateMap = Record<string, RelationshipGistLocalState>;

const STORAGE_KEY_PREFIX = 'relationship-gist-local-state:v1:';

const getStorageKey = (userId?: string | null) => `${STORAGE_KEY_PREFIX}${userId ?? 'guest'}`;

export const clampRelationshipGistProgress = (progress: number) => {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(1, progress));
};

export const getDefaultRelationshipGistLocalState = (
  perspective?: string | null,
): RelationshipGistLocalState => ({
  saved: false,
  savedVersion: 0,
  progress: 0,
  lastReadAt: null,
  lastOpenedAt: null,
  lastPerspective: perspective ?? null,
  lastAnchor: null,
  lastAnchorOffset: null,
  scrollCompletedAt: null,
  readAcknowledgedAt: null,
  readingDurationMs: 0,
  updatedAt: 0,
});

const parseTimestamp = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

const parseNonNegativeInteger = (value: unknown) => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
};

export async function readRelationshipGistLocalState(
  userId?: string | null,
): Promise<RelationshipGistLocalStateMap> {
  try {
    const raw = await AsyncStorage.getItem(getStorageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, any>;
    return Object.entries(parsed).reduce<RelationshipGistLocalStateMap>((acc, [gistId, value]) => {
      acc[gistId] = {
        saved: value?.saved === true,
        savedVersion: parseNonNegativeInteger(value?.savedVersion),
        progress: clampRelationshipGistProgress(Number(value?.progress ?? 0)),
        lastReadAt: parseTimestamp(value?.lastReadAt),
        lastOpenedAt: parseTimestamp(value?.lastOpenedAt),
        lastPerspective: typeof value?.lastPerspective === 'string' ? value.lastPerspective : null,
        lastAnchor: typeof value?.lastAnchor === 'string' ? value.lastAnchor : null,
        lastAnchorOffset: typeof value?.lastAnchorOffset === 'number'
          && Number.isFinite(value.lastAnchorOffset)
          && value.lastAnchorOffset >= 0
          ? value.lastAnchorOffset
          : null,
        scrollCompletedAt: parseTimestamp(value?.scrollCompletedAt),
        readAcknowledgedAt: parseTimestamp(value?.readAcknowledgedAt),
        readingDurationMs: parseNonNegativeInteger(value?.readingDurationMs),
        updatedAt: parseTimestamp(value?.updatedAt) ?? 0,
      };
      return acc;
    }, {});
  } catch {
    return {};
  }
}

export async function writeRelationshipGistLocalState(
  userId: string | null | undefined,
  state: RelationshipGistLocalStateMap,
): Promise<boolean> {
  try {
    await AsyncStorage.setItem(getStorageKey(userId), JSON.stringify(state));
    return true;
  } catch {
    // Preserve the existing non-throwing API while allowing callers to report failure.
    return false;
  }
}

export async function writeRelationshipGistLocalStateStrict(
  userId: string | null | undefined,
  state: RelationshipGistLocalStateMap,
): Promise<void> {
  await AsyncStorage.setItem(getStorageKey(userId), JSON.stringify(state));
}
