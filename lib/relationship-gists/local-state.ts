import AsyncStorage from '@react-native-async-storage/async-storage';

export type RelationshipGistLocalState = {
  saved: boolean;
  progress: number;
  lastReadAt: number | null;
  lastOpenedAt: number | null;
  lastPerspective: string | null;
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
  progress: 0,
  lastReadAt: null,
  lastOpenedAt: null,
  lastPerspective: perspective ?? null,
});

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
        progress: clampRelationshipGistProgress(Number(value?.progress ?? 0)),
        lastReadAt: typeof value?.lastReadAt === 'number' ? value.lastReadAt : null,
        lastOpenedAt: typeof value?.lastOpenedAt === 'number' ? value.lastOpenedAt : null,
        lastPerspective: typeof value?.lastPerspective === 'string' ? value.lastPerspective : null,
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
): Promise<void> {
  try {
    await AsyncStorage.setItem(getStorageKey(userId), JSON.stringify(state));
  } catch {
    // Swallow local persistence failures. Reading still works from in-memory state.
  }
}
