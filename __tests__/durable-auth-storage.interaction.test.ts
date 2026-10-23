import { expect, jest, test } from '@jest/globals';

import { createDurableAuthStorage } from '@/lib/auth/durable-auth-storage';

const createMemoryStorage = () => {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getItem: jest.fn(async (key: string) => values.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        values.delete(key);
      }),
    },
  };
};

test('a slow credential read remains pending and returns the durable value', async () => {
  const memory = createMemoryStorage();
  memory.values.set('session', 'persisted-session');
  let release: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  memory.storage.getItem.mockImplementation(async (key) => {
    await gate;
    return memory.values.get(key) ?? null;
  });
  const storage = createDurableAuthStorage(memory.storage);

  let settled = false;
  const pending = storage.getItem('session').finally(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);

  release?.();
  await expect(pending).resolves.toBe('persisted-session');
});

test('a credential write is not reported complete before persistence settles', async () => {
  const memory = createMemoryStorage();
  let release: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  memory.storage.setItem.mockImplementation(async (key, value) => {
    await gate;
    memory.values.set(key, value);
  });
  const storage = createDurableAuthStorage(memory.storage);

  let settled = false;
  const pending = storage.setItem('session', 'rotated-session').finally(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  expect(memory.values.has('session')).toBe(false);

  release?.();
  await pending;
  expect(memory.values.get('session')).toBe('rotated-session');
});

test('storage failures propagate as classified errors without becoming null', async () => {
  const memory = createMemoryStorage();
  memory.storage.getItem.mockRejectedValue(new Error('storage unavailable'));
  const storage = createDurableAuthStorage(memory.storage);

  await expect(storage.getItem('session')).rejects.toMatchObject({
    name: 'AuthStorageError',
    code: 'auth_storage_failed',
    operation: 'getItem',
  });
});
