import { describe, expect, it, jest } from '@jest/globals';

import { applyRelationshipGistMutation } from '@/features/relationship-gists/data/relationship-gist-repository';
import {
  enqueueRelationshipGistMutation,
  readRelationshipGistOutbox,
  type RelationshipGistOutboxStorage,
} from '@/features/relationship-gists/sync/relationship-gist-outbox';

const USER_A = '11111111-1111-4111-8111-111111111111';
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

describe('Relationship Gist Reader V2 isolation gate', () => {
  it('fails closed without invoking either the legacy or V2 RPC when disabled', async () => {
    const rpc = jest.fn(async () => ({ data: null, error: null }));
    const client = { rpc, from: jest.fn() };

    await expect(applyRelationshipGistMutation(client, {
      operationId: '88888888-1111-4111-8111-111111111111',
      ownerUserId: USER_A,
      gistId: GIST_ID,
      patch: { saved: true, expectedSavedVersion: 0 },
    }, { readerV2Enabled: false })).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });

    expect(rpc).not.toHaveBeenCalled();
  });

  it('uses only the owner-bound V2 RPC when enabled', async () => {
    const rpc = jest.fn(async (
      _name: string,
      _args?: Record<string, unknown>,
    ) => ({
      data: {
        delivery: 'processed',
        saved_outcome: 'applied',
        gist_id: GIST_ID,
        saved: true,
        saved_version: 1,
        progress: 0,
        reading_duration_ms: 0,
      },
      error: null,
    }));
    const client = { rpc, from: jest.fn() };

    await applyRelationshipGistMutation(client, {
      operationId: '88888888-1111-4111-8111-111111111111',
      ownerUserId: USER_A,
      gistId: GIST_ID,
      patch: { saved: true, expectedSavedVersion: 0 },
    }, { readerV2Enabled: true });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      'rpc_apply_relationship_gist_state_mutation_v2',
      expect.objectContaining({ p_owner_user_id: USER_A }),
    );
    expect(rpc).not.toHaveBeenCalledWith(
      'rpc_upsert_relationship_gist_user_state',
      expect.anything(),
    );
  });

  it('retains pending operations unchanged while synchronization is disabled', async () => {
    const storage = createMemoryStorage();
    await enqueueRelationshipGistMutation({
      ownerUserId: USER_A,
      ownerProfileId: PROFILE_A,
      gistId: GIST_ID,
      patch: { saved: false, expectedSavedVersion: 4 },
    }, { storage, createId: () => 'pending-while-disabled' });

    const before = await readRelationshipGistOutbox(USER_A, storage);
    const rpc = jest.fn(async () => ({ data: null, error: null }));
    await expect(applyRelationshipGistMutation({ rpc, from: jest.fn() }, before[0], {
      readerV2Enabled: false,
    })).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    const after = await readRelationshipGistOutbox(USER_A, storage);

    expect(after).toEqual(before);
    expect(rpc).not.toHaveBeenCalled();
  });
});
