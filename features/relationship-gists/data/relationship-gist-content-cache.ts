import AsyncStorage from '@react-native-async-storage/async-storage';

import type { RelationshipGist } from '@/features/relationship-gists/domain/relationship-gist';

const CACHE_KEY_PREFIX = 'relationship-gist-content:v1:';

type RelationshipGistContentEnvelope = {
  savedAt: number;
  items: RelationshipGist[];
};

export type RelationshipGistContentStorage = Pick<
  typeof AsyncStorage,
  'getItem' | 'setItem' | 'removeItem'
>;

const key = (ownerUserId: string) => `${CACHE_KEY_PREFIX}${ownerUserId}`;

const isGist = (value: unknown): value is RelationshipGist => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RelationshipGist>;
  return typeof candidate.id === 'string'
    && typeof candidate.title === 'string'
    && typeof candidate.body === 'string';
};

export async function readRelationshipGistContentCache(
  ownerUserId: string,
  storage: RelationshipGistContentStorage = AsyncStorage,
): Promise<{ items: RelationshipGist[]; savedAt: number | null }> {
  if (!ownerUserId) return { items: [], savedAt: null };
  try {
    const raw = await storage.getItem(key(ownerUserId));
    if (!raw) return { items: [], savedAt: null };
    const parsed = JSON.parse(raw) as Partial<RelationshipGistContentEnvelope>;
    if (!Array.isArray(parsed.items) || parsed.items.some((item) => !isGist(item))) {
      return { items: [], savedAt: null };
    }
    return {
      items: parsed.items,
      savedAt: typeof parsed.savedAt === 'number' && Number.isFinite(parsed.savedAt)
        ? parsed.savedAt
        : null,
    };
  } catch {
    return { items: [], savedAt: null };
  }
}

export async function writeRelationshipGistContentCache(
  ownerUserId: string,
  items: RelationshipGist[],
  storage: RelationshipGistContentStorage = AsyncStorage,
): Promise<void> {
  if (!ownerUserId) return;
  const safeItems = items.filter(isGist);
  await storage.setItem(key(ownerUserId), JSON.stringify({
    savedAt: Date.now(),
    items: safeItems,
  } satisfies RelationshipGistContentEnvelope));
}

export async function clearRelationshipGistContentCache(
  ownerUserId: string,
  storage: RelationshipGistContentStorage = AsyncStorage,
): Promise<void> {
  if (!ownerUserId) return;
  await storage.removeItem(key(ownerUserId));
}
