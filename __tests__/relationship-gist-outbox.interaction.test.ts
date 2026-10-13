import { describe, expect, it, jest } from '@jest/globals';

import {
  drainRelationshipGistOutbox,
  enqueueRelationshipGistMutation,
  readRelationshipGistOutbox,
  RelationshipGistOutboxCorruptError,
  type RelationshipGistOutboxMutation,
  type RelationshipGistOutboxStorage,
} from '@/features/relationship-gists/sync/relationship-gist-outbox';
import type { RelationshipGistMutationResult } from '@/features/relationship-gists/data/relationship-gist-repository';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const PROFILE_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const GIST_ID = '99999999-1111-4111-8111-111111111111';

const createMemoryStorage = (): RelationshipGistOutboxStorage => {
  const values = new Map<string, string>();
  return {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
  } as RelationshipGistOutboxStorage;
};

const result = (
  saved: boolean,
  savedVersion: number,
  savedOutcome: RelationshipGistMutationResult['savedOutcome'],
): RelationshipGistMutationResult => ({
  delivery: 'processed',
  savedOutcome,
  gistId: GIST_ID,
  saved,
  savedVersion,
  progress: 0,
  lastReadAt: null,
  lastOpenedAt: null,
  lastPerspective: 'general',
  lastAnchor: null,
  lastAnchorOffset: null,
  scrollCompletedAt: null,
  readAcknowledgedAt: null,
  readingDurationMs: 0,
  updatedAt: new Date(0).toISOString(),
});

describe('Relationship Gist durable outbox', () => {
  it('never drains one account through another authenticated account', async () => {
    const storage = createMemoryStorage();
    await enqueueRelationshipGistMutation({
      ownerUserId: USER_A,
      ownerProfileId: PROFILE_A,
      gistId: GIST_ID,
      patch: { saved: true, expectedSavedVersion: 0 },
    }, { storage, createId: () => 'operation-a' });
    const send = jest.fn(async () => result(true, 1, 'applied'));

    const drain = await drainRelationshipGistOutbox({
      ownerUserId: USER_A,
      activeUserId: USER_B,
      send,
    }, { storage });

    expect(drain.status).toBe('owner_mismatch');
    expect(send).not.toHaveBeenCalled();
    expect(await readRelationshipGistOutbox(USER_A, storage)).toHaveLength(1);
    expect(await readRelationshipGistOutbox(USER_B, storage)).toHaveLength(0);
  });

  it('preserves the latest offline save/unsave intent through a version conflict', async () => {
    const storage = createMemoryStorage();
    let id = 0;
    const createId = () => `operation-${++id}`;
    await enqueueRelationshipGistMutation({
      ownerUserId: USER_A,
      ownerProfileId: PROFILE_A,
      gistId: GIST_ID,
      patch: { saved: true, expectedSavedVersion: 0 },
    }, { storage, createId });
    await enqueueRelationshipGistMutation({
      ownerUserId: USER_A,
      ownerProfileId: PROFILE_A,
      gistId: GIST_ID,
      patch: { saved: false, expectedSavedVersion: 0 },
    }, { storage, createId });

    let authoritativeSaved = false;
    let authoritativeVersion = 0;
    const send = jest.fn(async (mutation: RelationshipGistOutboxMutation) => {
      const expected = mutation.patch.expectedSavedVersion;
      const desired = mutation.patch.saved ?? authoritativeSaved;
      if (expected !== authoritativeVersion && desired !== authoritativeSaved) {
        return result(authoritativeSaved, authoritativeVersion, 'conflict');
      }
      if (desired !== authoritativeSaved) {
        authoritativeSaved = desired;
        authoritativeVersion += 1;
        return result(authoritativeSaved, authoritativeVersion, 'applied');
      }
      return result(authoritativeSaved, authoritativeVersion, 'converged');
    });

    const drain = await drainRelationshipGistOutbox({
      ownerUserId: USER_A,
      activeUserId: USER_A,
      send,
    }, { storage, createId });

    expect(drain.status).toBe('drained');
    expect(drain.rebased).toBe(1);
    expect(send).toHaveBeenCalledTimes(3);
    expect(authoritativeSaved).toBe(false);
    expect(authoritativeVersion).toBe(2);
    expect(await readRelationshipGistOutbox(USER_A, storage)).toEqual([]);
  });

  it('retains a failed offline mutation and retries only after its bounded delay', async () => {
    const storage = createMemoryStorage();
    let now = 1_000;
    await enqueueRelationshipGistMutation({
      ownerUserId: USER_A,
      ownerProfileId: PROFILE_A,
      gistId: GIST_ID,
      patch: { progress: 0.4, lastReadAt: now },
    }, { storage, now: () => now, createId: () => 'retry-operation' });
    const send = jest.fn<() => Promise<RelationshipGistMutationResult>>()
      .mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'NETWORK' }))
      .mockResolvedValueOnce(result(false, 0, 'not_requested'));

    const first = await drainRelationshipGistOutbox({
      ownerUserId: USER_A,
      activeUserId: USER_A,
      send,
    }, { storage, now: () => now });
    expect(first.status).toBe('deferred');
    expect(first.queue[0]).toMatchObject({ attemptCount: 1, status: 'pending', lastErrorCode: 'NETWORK' });

    const early = await drainRelationshipGistOutbox({
      ownerUserId: USER_A,
      activeUserId: USER_A,
      send,
    }, { storage, now: () => now + 4_999 });
    expect(early.status).toBe('deferred');
    expect(send).toHaveBeenCalledTimes(1);

    now += 5_000;
    const recovered = await drainRelationshipGistOutbox({
      ownerUserId: USER_A,
      activeUserId: USER_A,
      send,
    }, { storage, now: () => now });
    expect(recovered.status).toBe('drained');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('suppresses duplicate/converged deliveries without another local mutation', async () => {
    const storage = createMemoryStorage();
    await enqueueRelationshipGistMutation({
      ownerUserId: USER_A,
      ownerProfileId: PROFILE_A,
      gistId: GIST_ID,
      patch: { saved: true, expectedSavedVersion: 4 },
    }, { storage, createId: () => 'duplicate-operation' });

    const drain = await drainRelationshipGistOutbox({
      ownerUserId: USER_A,
      activeUserId: USER_A,
      send: async () => ({ ...result(true, 4, 'converged'), delivery: 'duplicate' }),
    }, { storage });

    expect(drain.processed).toBe(1);
    expect(drain.queue).toEqual([]);
  });

  it('serializes concurrent enqueues without dropping either pending operation', async () => {
    const storage = createMemoryStorage();
    await Promise.all([
      enqueueRelationshipGistMutation({
        ownerUserId: USER_A,
        ownerProfileId: PROFILE_A,
        gistId: GIST_ID,
        patch: { progress: 0.25 },
      }, { storage, createId: () => 'concurrent-a' }),
      enqueueRelationshipGistMutation({
        ownerUserId: USER_A,
        ownerProfileId: PROFILE_A,
        gistId: GIST_ID,
        patch: { progress: 0.5 },
      }, { storage, createId: () => 'concurrent-b' }),
    ]);

    const queue = await readRelationshipGistOutbox(USER_A, storage);
    expect(queue.map((mutation) => mutation.operationId).sort()).toEqual([
      'concurrent-a',
      'concurrent-b',
    ]);
  });

  it('preserves an enqueue that arrives while an earlier queue is draining', async () => {
    const storage = createMemoryStorage();
    await enqueueRelationshipGistMutation({
      ownerUserId: USER_A,
      ownerProfileId: PROFILE_A,
      gistId: GIST_ID,
      patch: { progress: 0.25 },
    }, { storage, createId: () => 'draining-operation' });

    let releaseSend = () => {};
    const sendGate = new Promise<void>((resolve) => { releaseSend = resolve; });
    const drainPromise = drainRelationshipGistOutbox({
      ownerUserId: USER_A,
      activeUserId: USER_A,
      send: async () => {
        await sendGate;
        return result(false, 0, 'not_requested');
      },
    }, { storage });
    const enqueuePromise = enqueueRelationshipGistMutation({
      ownerUserId: USER_A,
      ownerProfileId: PROFILE_A,
      gistId: GIST_ID,
      patch: { progress: 0.75 },
    }, { storage, createId: () => 'arrived-during-drain' });

    releaseSend();
    await Promise.all([drainPromise, enqueuePromise]);

    const queue = await readRelationshipGistOutbox(USER_A, storage);
    expect(queue).toHaveLength(1);
    expect(queue[0].operationId).toBe('arrived-during-drain');
  });

  it('does not overwrite a corrupt durable queue during recovery', async () => {
    const storage = createMemoryStorage();
    const key = `relationship-gist-outbox:v1:${USER_A}`;
    await storage.setItem(key, '{not-json');

    await expect(enqueueRelationshipGistMutation({
      ownerUserId: USER_A,
      ownerProfileId: PROFILE_A,
      gistId: GIST_ID,
      patch: { saved: true, expectedSavedVersion: 0 },
    }, { storage, createId: () => 'must-not-overwrite' })).rejects.toBeInstanceOf(
      RelationshipGistOutboxCorruptError,
    );
    await expect(storage.getItem(key)).resolves.toBe('{not-json');
  });
});
