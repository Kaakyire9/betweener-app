import { describe, expect, it } from '@jest/globals';

import {
  applyRelationshipGistReactionIntent,
  readRelationshipGistEngagementCache,
  writeRelationshipGistEngagementCache,
  type RelationshipGistEngagementCacheStorage,
} from '@/features/relationship-gists/engagement/relationship-gist-engagement-cache';
import {
  readRelationshipGistCoverCache,
  relationshipGistCoverImageKey,
  writeRelationshipGistCoverCache,
  type RelationshipGistCoverCacheStorage,
} from '@/features/relationship-gists/media/relationship-gist-cover-cache';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); },
  } as RelationshipGistEngagementCacheStorage & RelationshipGistCoverCacheStorage;
};

const snapshot = {
  gistId: 'gist-1',
  editionId: 'edition-1',
  revisionId: 'revision-1',
  reaction: 'helpful' as const,
  reactionRevisionId: 'revision-1',
  reactionCounts: { helpful: 2, resonated: 3, made_me_think: 4 },
  reflection: {
    body: 'private text must not be cached',
    revisionId: 'revision-1',
    createdAt: '2026-10-14T09:00:00Z',
    updatedAt: '2026-10-14T09:00:00Z',
  },
};

describe('Relationship Gist offline display caches', () => {
  it('keeps reaction snapshots account-scoped and excludes Reflection text', async () => {
    const memory = storage();
    await writeRelationshipGistEngagementCache(USER_A, snapshot, memory);

    expect(await readRelationshipGistEngagementCache(USER_A, 'gist-1', memory)).toEqual({
      ...snapshot,
      reflection: null,
    });
    expect(await readRelationshipGistEngagementCache(USER_B, 'gist-1', memory)).toBeNull();
  });

  it('applies the latest offline reaction intent without producing negative counts', () => {
    const removed = applyRelationshipGistReactionIntent(
      { ...snapshot, reflection: null, reactionCounts: { ...snapshot.reactionCounts, helpful: 0 } },
      'helpful',
      null,
    );
    expect(removed.reaction).toBeNull();
    expect(removed.reactionCounts.helpful).toBe(0);

    const changed = applyRelationshipGistReactionIntent(removed, null, 'resonated');
    expect(changed.reaction).toBe('resonated');
    expect(changed.reactionCounts.resonated).toBe(4);
  });

  it('keeps cover metadata account-scoped and derives a stable image key', async () => {
    const memory = storage();
    const cover = {
      id: 'cover-1', revisionId: 'revision-1', perspective: 'general',
      storagePath: 'gist-1/cover.webp', altText: 'Two people talking',
      width: 1536, height: 1024, sha256: 'sha-1',
    };
    await writeRelationshipGistCoverCache(USER_A, 'gist-1', 'general', cover, memory);

    expect(await readRelationshipGistCoverCache(USER_A, 'gist-1', 'general', memory)).toEqual(cover);
    expect(await readRelationshipGistCoverCache(USER_B, 'gist-1', 'general', memory)).toBeNull();
    expect(relationshipGistCoverImageKey(cover)).toBe('relationship-gist-cover:cover-1:sha-1');
  });
});
