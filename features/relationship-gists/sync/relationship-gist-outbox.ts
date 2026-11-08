import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import type { RelationshipGistMutationResult } from '@/features/relationship-gists/data/relationship-gist-repository';

export const RELATIONSHIP_GIST_OUTBOX_MAX_ATTEMPTS = 8;
export const RELATIONSHIP_GIST_OUTBOX_MAX_REBASES = 2;

const RETRY_DELAYS_MS = [
  5_000,
  15_000,
  45_000,
  2 * 60_000,
  5 * 60_000,
  15 * 60_000,
  30 * 60_000,
  60 * 60_000,
];

const OUTBOX_KEY_PREFIX = 'relationship-gist-outbox:v1:';
const ownerLocks = new Map<string, Promise<void>>();

export class RelationshipGistOutboxCorruptError extends Error {
  readonly code = 'RELATIONSHIP_GIST_OUTBOX_CORRUPT';

  constructor() {
    super('relationship_gist_outbox_corrupt');
    this.name = 'RelationshipGistOutboxCorruptError';
  }
}

export type RelationshipGistMutationPatch = {
  saved?: boolean;
  expectedSavedVersion?: number;
  progress?: number;
  lastReadAt?: number;
  markOpened?: boolean;
  lastPerspective?: string | null;
  lastAnchor?: string | null;
  lastAnchorOffset?: number | null;
  scrollCompleted?: boolean;
  readAcknowledged?: boolean;
  readingDurationDeltaMs?: number;
};

export type RelationshipGistOutboxMutation = {
  operationId: string;
  ownerUserId: string;
  ownerProfileId: string;
  gistId: string;
  patch: RelationshipGistMutationPatch;
  createdAt: number;
  attemptCount: number;
  rebaseCount: number;
  nextAttemptAt: number;
  status: 'pending' | 'failed';
  lastErrorCode: string | null;
};

export type RelationshipGistOutboxStorage = Pick<
  typeof AsyncStorage,
  'getItem' | 'setItem' | 'removeItem'
>;

export type RelationshipGistOutboxDrainResult = {
  status: 'idle' | 'drained' | 'owner_mismatch' | 'deferred';
  processed: number;
  rebased: number;
  failed: number;
  queue: RelationshipGistOutboxMutation[];
};

const getOutboxKey = (ownerUserId: string) => `${OUTBOX_KEY_PREFIX}${ownerUserId}`;

const getErrorCode = (error: unknown) => {
  const code = String((error as { code?: unknown } | null)?.code ?? '').trim();
  if (code) return code.slice(0, 80);
  return error instanceof Error ? error.name.slice(0, 80) : 'unknown';
};

const isValidMutation = (value: any, ownerUserId: string): value is RelationshipGistOutboxMutation =>
  value
  && value.ownerUserId === ownerUserId
  && typeof value.ownerProfileId === 'string'
  && typeof value.operationId === 'string'
  && typeof value.gistId === 'string'
  && value.patch
  && typeof value.createdAt === 'number';

const withOwnerLock = async <T>(ownerUserId: string, operation: () => Promise<T>): Promise<T> => {
  const previous = ownerLocks.get(ownerUserId) ?? Promise.resolve();
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => gate);
  ownerLocks.set(ownerUserId, queued);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (ownerLocks.get(ownerUserId) === queued) ownerLocks.delete(ownerUserId);
  }
};

const readOutboxUnlocked = async (
  ownerUserId: string,
  storage: RelationshipGistOutboxStorage,
): Promise<RelationshipGistOutboxMutation[]> => {
  const raw = await storage.getItem(getOutboxKey(ownerUserId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((item) => !isValidMutation(item, ownerUserId))) {
      throw new RelationshipGistOutboxCorruptError();
    }
    return parsed;
  } catch (error) {
    if (error instanceof RelationshipGistOutboxCorruptError) throw error;
    throw new RelationshipGistOutboxCorruptError();
  }
};

const writeOutboxUnlocked = async (
  ownerUserId: string,
  queue: RelationshipGistOutboxMutation[],
  storage: RelationshipGistOutboxStorage,
): Promise<void> => {
  const owned = queue.filter((item) => item.ownerUserId === ownerUserId);
  if (!owned.length) {
    await storage.removeItem(getOutboxKey(ownerUserId));
    return;
  }
  await storage.setItem(getOutboxKey(ownerUserId), JSON.stringify(owned));
};

export async function readRelationshipGistOutbox(
  ownerUserId: string,
  storage: RelationshipGistOutboxStorage = AsyncStorage,
): Promise<RelationshipGistOutboxMutation[]> {
  return withOwnerLock(ownerUserId, () => readOutboxUnlocked(ownerUserId, storage));
}

export async function writeRelationshipGistOutbox(
  ownerUserId: string,
  queue: RelationshipGistOutboxMutation[],
  storage: RelationshipGistOutboxStorage = AsyncStorage,
): Promise<void> {
  await withOwnerLock(ownerUserId, () => writeOutboxUnlocked(ownerUserId, queue, storage));
}

export async function enqueueRelationshipGistMutation(
  input: {
    ownerUserId: string;
    ownerProfileId: string;
    gistId: string;
    patch: RelationshipGistMutationPatch;
  },
  options: {
    storage?: RelationshipGistOutboxStorage;
    now?: () => number;
    createId?: () => string;
  } = {},
): Promise<RelationshipGistOutboxMutation> {
  const storage = options.storage ?? AsyncStorage;
  const now = options.now ?? Date.now;
  return withOwnerLock(input.ownerUserId, async () => {
    const queue = await readOutboxUnlocked(input.ownerUserId, storage);
    const mutation: RelationshipGistOutboxMutation = {
      operationId: (options.createId ?? Crypto.randomUUID)(),
      ownerUserId: input.ownerUserId,
      ownerProfileId: input.ownerProfileId,
      gistId: input.gistId,
      patch: input.patch,
      createdAt: now(),
      attemptCount: 0,
      rebaseCount: 0,
      nextAttemptAt: 0,
      status: 'pending',
      lastErrorCode: null,
    };
    queue.push(mutation);
    await writeOutboxUnlocked(input.ownerUserId, queue, storage);
    return mutation;
  });
}

export async function drainRelationshipGistOutbox(
  input: {
    ownerUserId: string;
    activeUserId: string | null;
    send: (mutation: RelationshipGistOutboxMutation) => Promise<RelationshipGistMutationResult>;
    onAuthoritativeState?: (
      result: RelationshipGistMutationResult,
      mutation: RelationshipGistOutboxMutation,
    ) => void | Promise<void>;
  },
  options: {
    storage?: RelationshipGistOutboxStorage;
    now?: () => number;
    createId?: () => string;
  } = {},
): Promise<RelationshipGistOutboxDrainResult> {
  const storage = options.storage ?? AsyncStorage;
  const now = options.now ?? Date.now;
  const createId = options.createId ?? Crypto.randomUUID;
  return withOwnerLock(input.ownerUserId, async () => {
    let queue = await readOutboxUnlocked(input.ownerUserId, storage);

    if (input.activeUserId !== input.ownerUserId) {
      return { status: 'owner_mismatch', processed: 0, rebased: 0, failed: 0, queue };
    }

    let processed = 0;
    let rebased = 0;
    let failed = 0;
    let deferred = false;

    for (let index = 0; index < queue.length;) {
      const mutation = queue[index];
      if (mutation.status === 'failed' || mutation.nextAttemptAt > now()) {
        deferred = true;
        index += 1;
        continue;
      }

      try {
        const result = await input.send(mutation);
        await input.onAuthoritativeState?.(result, mutation);

        if (
          result.savedOutcome === 'conflict'
          && typeof mutation.patch.saved === 'boolean'
          && result.saved !== mutation.patch.saved
        ) {
          if (mutation.rebaseCount >= RELATIONSHIP_GIST_OUTBOX_MAX_REBASES) {
            queue[index] = {
              ...mutation,
              status: 'failed',
              lastErrorCode: 'saved_version_conflict',
            };
            failed += 1;
            index += 1;
          } else {
            queue[index] = {
              ...mutation,
              operationId: createId(),
              patch: {
                ...mutation.patch,
                expectedSavedVersion: result.savedVersion,
              },
              attemptCount: 0,
              rebaseCount: mutation.rebaseCount + 1,
              nextAttemptAt: 0,
              lastErrorCode: null,
            };
            rebased += 1;
          }
        } else {
          queue.splice(index, 1);
          processed += 1;
        }
        await writeOutboxUnlocked(input.ownerUserId, queue, storage);
      } catch (error) {
        const attemptCount = mutation.attemptCount + 1;
        const terminal = attemptCount >= RELATIONSHIP_GIST_OUTBOX_MAX_ATTEMPTS;
        queue[index] = {
          ...mutation,
          attemptCount,
          status: terminal ? 'failed' : 'pending',
          nextAttemptAt: terminal
            ? Number.MAX_SAFE_INTEGER
            : now() + RETRY_DELAYS_MS[Math.min(attemptCount - 1, RETRY_DELAYS_MS.length - 1)],
          lastErrorCode: getErrorCode(error),
        };
        if (terminal) failed += 1;
        else deferred = true;
        index += 1;
        await writeOutboxUnlocked(input.ownerUserId, queue, storage);
      }
    }

    return {
      status: queue.length === 0 ? 'drained' : deferred || failed ? 'deferred' : 'idle',
      processed,
      rebased,
      failed,
      queue,
    };
  });
}
