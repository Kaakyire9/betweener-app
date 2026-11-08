import AsyncStorage from '@react-native-async-storage/async-storage';

import type { RelationshipGistCover } from '@/features/relationship-gists/media/relationship-gist-cover-repository';

const KEY_PREFIX = 'relationship-gist-cover-cache:v1:';

export type RelationshipGistCoverCacheStorage = Pick<
  typeof AsyncStorage,
  'getItem' | 'setItem' | 'removeItem'
>;

const key = (ownerUserId: string, gistId: string, perspective: string) =>
  `${KEY_PREFIX}${ownerUserId}:${gistId}:${perspective.toLowerCase()}`;

const normalizeCover = (value: unknown): RelationshipGistCover | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<RelationshipGistCover>;
  if (
    typeof candidate.id !== 'string'
    || typeof candidate.revisionId !== 'string'
    || typeof candidate.perspective !== 'string'
    || typeof candidate.storagePath !== 'string'
    || typeof candidate.altText !== 'string'
    || typeof candidate.sha256 !== 'string'
  ) return null;
  return {
    id: candidate.id,
    revisionId: candidate.revisionId,
    perspective: candidate.perspective,
    storagePath: candidate.storagePath,
    altText: candidate.altText,
    width: Number(candidate.width) || 1536,
    height: Number(candidate.height) || 1024,
    sha256: candidate.sha256,
  };
};

export const relationshipGistCoverImageKey = (cover: RelationshipGistCover) =>
  `relationship-gist-cover:${cover.id}:${cover.sha256}`;

export async function readRelationshipGistCoverCache(
  ownerUserId: string,
  gistId: string,
  perspective: string,
  storage: RelationshipGistCoverCacheStorage = AsyncStorage,
) {
  try {
    const raw = await storage.getItem(key(ownerUserId, gistId, perspective));
    return raw ? normalizeCover(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export async function writeRelationshipGistCoverCache(
  ownerUserId: string,
  gistId: string,
  perspective: string,
  cover: RelationshipGistCover,
  storage: RelationshipGistCoverCacheStorage = AsyncStorage,
) {
  try {
    await storage.setItem(key(ownerUserId, gistId, perspective), JSON.stringify(cover));
  } catch {
    // Best-effort display cache only.
  }
}
