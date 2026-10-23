import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import type {
  RelationshipGistEngagementSource,
  RelationshipGistReaction,
  RelationshipGistReaderEventType,
} from '@/features/relationship-gists/engagement/relationship-gist-engagement';

const KEY_PREFIX = 'relationship-gist-engagement-outbox:v1:';
const RETRY_MS = [5_000, 15_000, 60_000, 5 * 60_000, 30 * 60_000];
const TERMINAL_ERROR_CODES = new Set(['P0002']);
const locks = new Map<string, Promise<void>>();

export type RelationshipGistEngagementOutboxItem = {
  id: string;
  ownerUserId: string;
  gistId: string;
  revisionId: string;
  source: RelationshipGistEngagementSource;
  kind: 'reaction' | 'analytics';
  reaction?: RelationshipGistReaction | null;
  eventType?: RelationshipGistReaderEventType;
  progressBucket?: 0 | 25 | 50 | 75 | 100 | null;
  sessionId?: string | null;
  createdAt: number;
  attemptCount: number;
  nextAttemptAt: number;
};

export type RelationshipGistEngagementStorage = Pick<
  typeof AsyncStorage,
  'getItem' | 'setItem' | 'removeItem'
>;

export type RelationshipGistEngagementFailure = {
  itemId: string;
  code: string;
};

const errorCode = (error: unknown) => {
  if (error && typeof error === 'object') {
    const candidate = error as { code?: unknown; name?: unknown };
    if (typeof candidate.code === 'string' && candidate.code) return candidate.code;
    if (typeof candidate.name === 'string' && candidate.name) return candidate.name;
  }
  return 'unknown';
};

const key = (ownerUserId: string) => `${KEY_PREFIX}${ownerUserId}`;

const withLock = async <T>(ownerUserId: string, work: () => Promise<T>) => {
  const previous = locks.get(ownerUserId) ?? Promise.resolve();
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => gate);
  locks.set(ownerUserId, queued);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (locks.get(ownerUserId) === queued) locks.delete(ownerUserId);
  }
};

const valid = (item: any, ownerUserId: string): item is RelationshipGistEngagementOutboxItem =>
  item?.ownerUserId === ownerUserId
  && typeof item.id === 'string'
  && typeof item.gistId === 'string'
  && typeof item.revisionId === 'string'
  && (item.kind === 'reaction' || item.kind === 'analytics');

const readUnlocked = async (ownerUserId: string, storage: RelationshipGistEngagementStorage) => {
  const raw = await storage.getItem(key(ownerUserId));
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.some((item) => !valid(item, ownerUserId))) {
    throw new Error('relationship_gist_engagement_outbox_corrupt');
  }
  return parsed as RelationshipGistEngagementOutboxItem[];
};

const writeUnlocked = async (
  ownerUserId: string,
  items: RelationshipGistEngagementOutboxItem[],
  storage: RelationshipGistEngagementStorage,
) => {
  const owned = items.filter((item) => item.ownerUserId === ownerUserId);
  if (!owned.length) return storage.removeItem(key(ownerUserId));
  return storage.setItem(key(ownerUserId), JSON.stringify(owned));
};

export const readRelationshipGistEngagementOutbox = (
  ownerUserId: string,
  storage: RelationshipGistEngagementStorage = AsyncStorage,
) => withLock(ownerUserId, () => readUnlocked(ownerUserId, storage));

export async function enqueueRelationshipGistEngagement(
  input: Omit<RelationshipGistEngagementOutboxItem, 'id' | 'createdAt' | 'attemptCount' | 'nextAttemptAt'>,
  options: {
    storage?: RelationshipGistEngagementStorage;
    createId?: () => string;
    now?: () => number;
  } = {},
) {
  const storage = options.storage ?? AsyncStorage;
  const createId = options.createId ?? Crypto.randomUUID;
  const now = options.now ?? Date.now;
  return withLock(input.ownerUserId, async () => {
    let items = await readUnlocked(input.ownerUserId, storage);
    if (input.kind === 'reaction') {
      // Only the latest offline intent for this edition matters. Aggregate counts
      // remain server-authoritative and are never changed here.
      items = items.filter((item) => !(item.kind === 'reaction' && item.gistId === input.gistId));
    } else if (input.eventType === 'progress') {
      items = items.filter((item) => !(
        item.kind === 'analytics'
        && item.gistId === input.gistId
        && item.eventType === 'progress'
        && item.progressBucket === input.progressBucket
      ));
    }
    const item: RelationshipGistEngagementOutboxItem = {
      ...input,
      id: createId(),
      createdAt: now(),
      attemptCount: 0,
      nextAttemptAt: 0,
    };
    items.push(item);
    await writeUnlocked(input.ownerUserId, items, storage);
    return item;
  });
}

export async function drainRelationshipGistEngagementOutbox(input: {
  ownerUserId: string;
  activeUserId: string | null;
  send: (item: RelationshipGistEngagementOutboxItem) => Promise<unknown>;
}, options: { storage?: RelationshipGistEngagementStorage; now?: () => number } = {}) {
  const storage = options.storage ?? AsyncStorage;
  const now = options.now ?? Date.now;
  return withLock(input.ownerUserId, async () => {
    let items = await readUnlocked(input.ownerUserId, storage);
    if (input.activeUserId !== input.ownerUserId) {
      return { status: 'owner_mismatch' as const, processed: 0, discarded: 0, items, failures: [] };
    }
    let processed = 0;
    let discarded = 0;
    const failures: RelationshipGistEngagementFailure[] = [];
    for (let index = 0; index < items.length;) {
      const item = items[index];
      if (item.nextAttemptAt > now()) {
        index += 1;
        continue;
      }
      try {
        await input.send(item);
        items.splice(index, 1);
        processed += 1;
      } catch (error) {
        const code = errorCode(error);
        failures.push({ itemId: item.id, code });
        if (TERMINAL_ERROR_CODES.has(code)) {
          const before = items.length;
          items = items.filter((candidate) => !(
            candidate.gistId === item.gistId
            && candidate.revisionId === item.revisionId
          ));
          discarded += before - items.length;
        } else {
          const attemptCount = item.attemptCount + 1;
          items[index] = {
            ...item,
            attemptCount,
            nextAttemptAt: now() + RETRY_MS[Math.min(attemptCount - 1, RETRY_MS.length - 1)],
          };
          index += 1;
        }
      }
      await writeUnlocked(input.ownerUserId, items, storage);
    }
    return {
      status: items.length ? 'deferred' as const : 'drained' as const,
      processed,
      discarded,
      items,
      failures,
    };
  });
}
