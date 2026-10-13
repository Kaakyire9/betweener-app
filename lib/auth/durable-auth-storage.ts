export class AuthStorageError extends Error {
  readonly code = 'auth_storage_failed';
  readonly operation: AuthStorageOperation;

  constructor(operation: AuthStorageOperation, cause: unknown) {
    super(`auth_storage_${operation}_failed`);
    this.name = 'AuthStorageError';
    this.operation = operation;
    (this as Error & { cause?: unknown }).cause = cause;
  }
}

export type AuthStorageOperation = 'getItem' | 'setItem' | 'removeItem';

type StorageAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

type DurableAuthStorageOptions = {
  slowMs?: number;
  now?: () => number;
  onSlow?: (operation: AuthStorageOperation, key: string, elapsedMs: number) => void;
  onError?: (operation: AuthStorageOperation, key: string) => void;
};

export const createDurableAuthStorage = (
  storage: StorageAdapter,
  {
    slowMs = 2_000,
    now = () => Date.now(),
    onSlow,
    onError,
  }: DurableAuthStorageOptions = {},
) => {
  const run = async <T,>(
    operation: AuthStorageOperation,
    key: string,
    task: () => Promise<T>,
  ) => {
    const startedAt = now();
    try {
      return await task();
    } catch (error) {
      onError?.(operation, key);
      throw new AuthStorageError(operation, error);
    } finally {
      const elapsedMs = now() - startedAt;
      if (elapsedMs >= slowMs) onSlow?.(operation, key, elapsedMs);
    }
  };

  return {
    getItem: (key: string) => run('getItem', key, () => storage.getItem(key)),
    setItem: (key: string, value: string) =>
      run('setItem', key, () => storage.setItem(key, value)),
    removeItem: (key: string) =>
      run('removeItem', key, () => storage.removeItem(key)),
  };
};
