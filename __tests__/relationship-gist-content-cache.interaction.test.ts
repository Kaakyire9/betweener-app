import { describe, expect, it, jest } from '@jest/globals';

import {
  clearRelationshipGistContentCache,
  readRelationshipGistContentCache,
  writeRelationshipGistContentCache,
  type RelationshipGistContentStorage,
} from '@/features/relationship-gists/data/relationship-gist-content-cache';
import { loadRelationshipGistCatalog } from '@/features/relationship-gists/data/relationship-gist-catalog';
import type { RelationshipGist } from '@/features/relationship-gists/domain/relationship-gist';

const gist = (id: string, perspective = 'general'): RelationshipGist => ({
  id,
  title: `${perspective} guidance`,
  short_body: 'Short guidance.',
  body: 'Long-form guidance.',
  perspective,
  circle_id: null,
});

const createMemoryStorage = (): RelationshipGistContentStorage => {
  const values = new Map<string, string>();
  return {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
  } as RelationshipGistContentStorage;
};

describe('Relationship Gist content cache', () => {
  it('isolates cached content by account and supports explicit cleanup', async () => {
    const storage = createMemoryStorage();
    await writeRelationshipGistContentCache('user-a', [gist('gist-a')], storage);
    await writeRelationshipGistContentCache('user-b', [gist('gist-b')], storage);

    await expect(readRelationshipGistContentCache('user-a', storage)).resolves.toMatchObject({
      items: [expect.objectContaining({ id: 'gist-a' })],
    });
    await expect(readRelationshipGistContentCache('user-b', storage)).resolves.toMatchObject({
      items: [expect.objectContaining({ id: 'gist-b' })],
    });

    await clearRelationshipGistContentCache('user-a', storage);
    await expect(readRelationshipGistContentCache('user-a', storage)).resolves.toEqual({
      items: [], savedAt: null,
    });
    await expect(readRelationshipGistContentCache('user-b', storage)).resolves.toMatchObject({
      items: [expect.objectContaining({ id: 'gist-b' })],
    });
  });

  it('rejects corrupt or structurally invalid cache payloads', async () => {
    const corruptStorage: RelationshipGistContentStorage = {
      getItem: async () => '{bad-json',
      setItem: async () => undefined,
      removeItem: async () => undefined,
    };
    await expect(readRelationshipGistContentCache('user-a', corruptStorage)).resolves.toEqual({
      items: [], savedAt: null,
    });
  });

  it('returns network content without depending on Circle requests', async () => {
    const rpc = async () => ({ data: [gist('gist-a'), gist('circle-gist')], error: null });
    const client = {
      rpc,
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              or: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }),
            }),
          }),
        }),
      }),
    };
    const result = await loadRelationshipGistCatalog(client as any, 'user-a');
    expect(result.source).toBe('network');
    expect(result.items).toHaveLength(2);
    await clearRelationshipGistContentCache('user-a');
  });

  it('restores readable content without a network request after a cold start', async () => {
    await writeRelationshipGistContentCache('offline-user', [gist('offline-gist')]);
    const client = {
      rpc: jest.fn(async () => { throw new Error('network must not be used'); }),
      from: jest.fn(),
    };

    await expect(loadRelationshipGistCatalog(client as any, 'offline-user', {
      networkAllowed: false,
    })).resolves.toMatchObject({
      source: 'cache',
      items: [expect.objectContaining({ id: 'offline-gist' })],
      networkError: null,
    });
    expect(client.rpc).not.toHaveBeenCalled();
    await clearRelationshipGistContentCache('offline-user');
  });
});
