import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  RelationshipGistEngagementSnapshot,
  RelationshipGistReaction,
} from '@/features/relationship-gists/engagement/relationship-gist-engagement';

const KEY_PREFIX = 'relationship-gist-engagement-cache:v1:';

export type CachedRelationshipGistEngagementSnapshot = Omit<
  RelationshipGistEngagementSnapshot,
  'reflection'
> & { reflection: null };

export type RelationshipGistEngagementCacheStorage = Pick<
  typeof AsyncStorage,
  'getItem' | 'setItem' | 'removeItem'
>;

type SnapshotMap = Record<string, CachedRelationshipGistEngagementSnapshot>;

const key = (ownerUserId: string) => `${KEY_PREFIX}${ownerUserId}`;

const isReaction = (value: unknown): value is RelationshipGistReaction =>
  value === 'helpful' || value === 'resonated' || value === 'made_me_think';

const normalizeSnapshot = (
  value: unknown,
  gistId: string,
): CachedRelationshipGistEngagementSnapshot | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<RelationshipGistEngagementSnapshot>;
  if (
    candidate.gistId !== gistId
    || typeof candidate.editionId !== 'string'
    || typeof candidate.revisionId !== 'string'
    || !candidate.reactionCounts
    || typeof candidate.reactionCounts.helpful !== 'number'
    || typeof candidate.reactionCounts.resonated !== 'number'
    || typeof candidate.reactionCounts.made_me_think !== 'number'
  ) return null;
  return {
    gistId,
    editionId: candidate.editionId,
    revisionId: candidate.revisionId,
    reaction: isReaction(candidate.reaction) ? candidate.reaction : null,
    reactionRevisionId: typeof candidate.reactionRevisionId === 'string'
      ? candidate.reactionRevisionId
      : null,
    reactionCounts: {
      helpful: Math.max(0, candidate.reactionCounts.helpful),
      resonated: Math.max(0, candidate.reactionCounts.resonated),
      made_me_think: Math.max(0, candidate.reactionCounts.made_me_think),
    },
    // Private Reflection text is deliberately never persisted in this cache.
    reflection: null,
  };
};

const readMap = async (
  ownerUserId: string,
  storage: RelationshipGistEngagementCacheStorage,
): Promise<SnapshotMap> => {
  try {
    const raw = await storage.getItem(key(ownerUserId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as SnapshotMap
      : {};
  } catch {
    return {};
  }
};

export async function readRelationshipGistEngagementCache(
  ownerUserId: string,
  gistId: string,
  storage: RelationshipGistEngagementCacheStorage = AsyncStorage,
) {
  const snapshots = await readMap(ownerUserId, storage);
  return normalizeSnapshot(snapshots[gistId], gistId);
}

export async function writeRelationshipGistEngagementCache(
  ownerUserId: string,
  snapshot: RelationshipGistEngagementSnapshot,
  storage: RelationshipGistEngagementCacheStorage = AsyncStorage,
) {
  try {
    const snapshots = await readMap(ownerUserId, storage);
    const safeSnapshot = normalizeSnapshot({ ...snapshot, reflection: null }, snapshot.gistId);
    if (!safeSnapshot) return;
    await storage.setItem(key(ownerUserId), JSON.stringify({
      ...snapshots,
      [snapshot.gistId]: safeSnapshot,
    }));
  } catch {
    // This is a display cache; the durable mutation outbox remains authoritative.
  }
}

export function applyRelationshipGistReactionIntent<T extends RelationshipGistEngagementSnapshot>(
  snapshot: T,
  previous: RelationshipGistReaction | null,
  next: RelationshipGistReaction | null,
): T {
  if (previous === next) return snapshot;
  const reactionCounts = { ...snapshot.reactionCounts };
  if (previous) reactionCounts[previous] = Math.max(0, reactionCounts[previous] - 1);
  if (next) reactionCounts[next] += 1;
  return {
    ...snapshot,
    reaction: next,
    reactionRevisionId: next ? snapshot.revisionId : null,
    reactionCounts,
  } as T;
}
