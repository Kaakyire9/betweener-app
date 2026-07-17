import AsyncStorage from '@react-native-async-storage/async-storage';

export type OfflineEnvelope<T> = {
  v: 2;
  savedAt: number;
  staleAt: number | null;
  kind?: string;
  data: T;
};

type LegacyEnvelope<T> = {
  v: 1;
  savedAt: number;
  data: T;
};

export type OfflineReadState<T> = {
  data: T | null;
  savedAt: number | null;
  staleAt: number | null;
  isStale: boolean;
};

type OfflineWriteOptions = {
  staleAfterMs?: number | null;
  kind?: string;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const normalizeEnvelope = <T>(value: unknown): OfflineEnvelope<T> | null => {
  if (!isObjectRecord(value)) return null;

  if (
    value.v === 2 &&
    typeof value.savedAt === 'number' &&
    'data' in value
  ) {
    return {
      v: 2,
      savedAt: value.savedAt,
      staleAt: typeof value.staleAt === 'number' ? value.staleAt : null,
      kind: typeof value.kind === 'string' ? value.kind : undefined,
      data: value.data as T,
    };
  }

  if (
    value.v === 1 &&
    typeof value.savedAt === 'number' &&
    'data' in value
  ) {
    const legacy = value as LegacyEnvelope<T>;
    return {
      v: 2,
      savedAt: legacy.savedAt,
      staleAt: null,
      data: legacy.data,
    };
  }

  return null;
};

export async function readOfflineEnvelope<T>(key: string): Promise<OfflineEnvelope<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return normalizeEnvelope<T>(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function readOfflineState<T>(key: string): Promise<OfflineReadState<T>> {
  const envelope = await readOfflineEnvelope<T>(key);
  if (!envelope) {
    return {
      data: null,
      savedAt: null,
      staleAt: null,
      isStale: false,
    };
  }

  const staleAt = typeof envelope.staleAt === 'number' ? envelope.staleAt : null;
  return {
    data: envelope.data ?? null,
    savedAt: envelope.savedAt,
    staleAt,
    isStale: staleAt != null ? Date.now() >= staleAt : false,
  };
}

export async function readOfflineData<T>(
  key: string,
  options?: { allowStale?: boolean },
): Promise<T | null> {
  const state = await readOfflineState<T>(key);
  if (!state.data) return null;
  if (state.isStale && options?.allowStale === false) return null;
  return state.data;
}

export async function peekOfflineData<T>(key: string): Promise<T | null> {
  return readOfflineData<T>(key);
}

export async function writeOfflineEnvelope<T>(
  key: string,
  data: T,
  options?: OfflineWriteOptions,
): Promise<void> {
  try {
    const savedAt = Date.now();
    const staleAfterMs = options?.staleAfterMs;
    const payload: OfflineEnvelope<T> = {
      v: 2,
      savedAt,
      staleAt:
        typeof staleAfterMs === 'number' && staleAfterMs > 0
          ? savedAt + staleAfterMs
          : null,
      kind: options?.kind,
      data,
    };
    await AsyncStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore local offline store write failures
  }
}

export async function updateOfflineEnvelope<T>(
  key: string,
  updater: (current: T | null) => T | null | Promise<T | null>,
  options?: OfflineWriteOptions,
): Promise<T | null> {
  const current = await readOfflineData<T>(key);
  const next = await updater(current);
  if (next == null) {
    await removeOfflineEnvelope(key);
    return null;
  }
  await writeOfflineEnvelope(key, next, options);
  return next;
}

export async function removeOfflineEnvelope(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore local offline store delete failures
  }
}
