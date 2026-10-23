import { describe, expect, it, jest } from '@jest/globals';

import {
  drainRelationshipGistEngagementOutbox,
  enqueueRelationshipGistEngagement,
  readRelationshipGistEngagementOutbox,
  type RelationshipGistEngagementStorage,
} from '@/features/relationship-gists/engagement/relationship-gist-engagement-outbox';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

const storage = (): RelationshipGistEngagementStorage => {
  const values = new Map<string, string>();
  return {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
  } as RelationshipGistEngagementStorage;
};

const reaction = (ownerUserId: string, value: 'helpful' | 'resonated' | null) => ({
  ownerUserId,
  gistId: 'gist-1',
  revisionId: 'revision-1',
  source: 'circles' as const,
  kind: 'reaction' as const,
  reaction: value,
});

describe('Relationship Gist engagement outbox', () => {
  it('is account scoped and refuses cross-account replay', async () => {
    const memory = storage();
    await enqueueRelationshipGistEngagement(reaction(USER_A, 'helpful'), {
      storage: memory, createId: () => 'op-a',
    });
    const send = jest.fn(async () => ({}));
    const result = await drainRelationshipGistEngagementOutbox({
      ownerUserId: USER_A, activeUserId: USER_B, send,
    }, { storage: memory });
    expect(result.status).toBe('owner_mismatch');
    expect(send).not.toHaveBeenCalled();
    expect(await readRelationshipGistEngagementOutbox(USER_A, memory)).toHaveLength(1);
    expect(await readRelationshipGistEngagementOutbox(USER_B, memory)).toHaveLength(0);
  });

  it('compacts offline reaction changes to the latest intent', async () => {
    const memory = storage();
    await enqueueRelationshipGistEngagement(reaction(USER_A, 'helpful'), {
      storage: memory, createId: () => 'op-1',
    });
    await enqueueRelationshipGistEngagement(reaction(USER_A, 'resonated'), {
      storage: memory, createId: () => 'op-2',
    });
    await enqueueRelationshipGistEngagement(reaction(USER_A, null), {
      storage: memory, createId: () => 'op-3',
    });
    expect(await readRelationshipGistEngagementOutbox(USER_A, memory)).toEqual([
      expect.objectContaining({ id: 'op-3', reaction: null }),
    ]);
  });

  it('retries failed delivery without losing the idempotency key', async () => {
    const memory = storage();
    let now = 1000;
    await enqueueRelationshipGistEngagement(reaction(USER_A, 'helpful'), {
      storage: memory, createId: () => 'stable-operation', now: () => now,
    });
    const send = jest.fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(Object.assign(new Error('missing RPC'), { code: 'PGRST202' }))
      .mockResolvedValueOnce({});
    const first = await drainRelationshipGistEngagementOutbox({
      ownerUserId: USER_A, activeUserId: USER_A, send,
    }, { storage: memory, now: () => now });
    expect(first.status).toBe('deferred');
    expect(first.items[0]).toMatchObject({ id: 'stable-operation', attemptCount: 1 });
    expect(first.failures).toEqual([{ itemId: 'stable-operation', code: 'PGRST202' }]);
    now += 5000;
    const second = await drainRelationshipGistEngagementOutbox({
      ownerUserId: USER_A, activeUserId: USER_A, send,
    }, { storage: memory, now: () => now });
    expect(second.status).toBe('drained');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('discards permanently unavailable revision activity instead of retrying forever', async () => {
    const memory = storage();
    const base = {
      ownerUserId: USER_A,
      gistId: 'gist-1',
      revisionId: 'stale-revision',
      source: 'canonical_reader' as const,
      kind: 'analytics' as const,
      sessionId: 'session-1',
    };
    await enqueueRelationshipGistEngagement({ ...base, eventType: 'open' }, {
      storage: memory, createId: () => 'stale-open',
    });
    await enqueueRelationshipGistEngagement({ ...base, eventType: 'share' }, {
      storage: memory, createId: () => 'stale-share',
    });
    const unavailable = Object.assign(new Error('relationship_gist_revision_unavailable'), {
      code: 'P0002',
    });
    const send = jest.fn<() => Promise<unknown>>().mockRejectedValue(unavailable);

    const result = await drainRelationshipGistEngagementOutbox({
      ownerUserId: USER_A, activeUserId: USER_A, send,
    }, { storage: memory });

    expect(result.status).toBe('drained');
    expect(result.discarded).toBe(2);
    expect(result.items).toHaveLength(0);
    expect(result.failures).toEqual([{ itemId: 'stale-open', code: 'P0002' }]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('deduplicates the same text-free progress bucket per Gist', async () => {
    const memory = storage();
    const analytics = {
      ownerUserId: USER_A, gistId: 'gist-1', revisionId: 'revision-1',
      source: 'canonical_reader' as const, kind: 'analytics' as const,
      eventType: 'progress' as const, progressBucket: 50 as const, sessionId: 'session-1',
    };
    await enqueueRelationshipGistEngagement(analytics, { storage: memory, createId: () => 'event-1' });
    await enqueueRelationshipGistEngagement(analytics, { storage: memory, createId: () => 'event-2' });
    expect(await readRelationshipGistEngagementOutbox(USER_A, memory)).toEqual([
      expect.objectContaining({ id: 'event-2', progressBucket: 50 }),
    ]);
  });
});
