import {
  peekOfflineData,
  removeOfflineEnvelope,
  updateOfflineEnvelope,
  readOfflineState,
  writeOfflineEnvelope,
} from '@/lib/offline/core';
import { readOfflineSnapshot } from '@/lib/offline/chat-store';
import { removeCache } from '@/lib/persisted-cache';

const OFFLINE_VERSION = 1;

export const buildIntentRequestsStoreKey = (profileId: string) =>
  `offline:intents:requests:v${OFFLINE_VERSION}:${profileId}`;

export const buildIntentProfilesStoreKey = (profileId: string) =>
  `offline:intents:profiles:v${OFFLINE_VERSION}:${profileId}`;

export const buildIntentSignalsStoreKey = (profileId: string) =>
  `offline:intents:signals:v${OFFLINE_VERSION}:${profileId}`;

export const buildIntentProfileContextStoreKey = (profileId: string) =>
  `offline:intents:profile-context:v${OFFLINE_VERSION}:${profileId}`;

export const buildIntentSuggestedMovesStoreKey = (profileId: string) =>
  `offline:intents:suggested-moves:v${OFFLINE_VERSION}:${profileId}`;

const buildLegacyIntentRequestsCacheKey = (profileId: string) =>
  `cache:intent_requests:v1:${profileId}`;

const buildLegacySuggestedMovesCacheKey = (profileId: string) =>
  `cache:suggested_moves:v2:${profileId}`;

export async function readIntentRequestsSnapshot<T>(profileId: string): Promise<T | null> {
  return readOfflineSnapshot<T>(buildIntentRequestsStoreKey(profileId));
}

export async function readIntentRequestsSnapshotState<T>(profileId: string) {
  return readOfflineState<T>(buildIntentRequestsStoreKey(profileId));
}

export async function writeIntentRequestsSnapshot<T>(profileId: string, data: T): Promise<void> {
  await writeIntentRequestsEnvelope(profileId, data);
}

export async function updateIntentRequestsSnapshot<T>(
  profileId: string,
  updater: (current: T | null) => T | null | Promise<T | null>,
): Promise<T | null> {
  return updateOfflineEnvelope<T>(buildIntentRequestsStoreKey(profileId), updater, {
    kind: 'intent-requests-snapshot',
  });
}

export async function removeIntentRequestsSnapshot(profileId: string): Promise<void> {
  await removeOfflineEnvelope(buildIntentRequestsStoreKey(profileId));
}

export async function readIntentProfilesSnapshot<T>(profileId: string): Promise<T | null> {
  return readOfflineSnapshot<T>(buildIntentProfilesStoreKey(profileId));
}

export async function writeIntentProfilesSnapshot<T>(profileId: string, data: T): Promise<void> {
  await writeOfflineEnvelope(buildIntentProfilesStoreKey(profileId), data, {
    kind: 'intent-profiles-snapshot',
  });
}

export async function readIntentSignalsSnapshot<T>(profileId: string): Promise<T | null> {
  return readOfflineSnapshot<T>(buildIntentSignalsStoreKey(profileId));
}

export async function writeIntentSignalsSnapshot<T>(profileId: string, data: T): Promise<void> {
  await writeOfflineEnvelope(buildIntentSignalsStoreKey(profileId), data, {
    kind: 'intent-signals-snapshot',
  });
}

export async function readIntentProfileContextSnapshot<T>(profileId: string): Promise<T | null> {
  return readOfflineSnapshot<T>(buildIntentProfileContextStoreKey(profileId));
}

export async function writeIntentProfileContextSnapshot<T>(profileId: string, data: T): Promise<void> {
  await writeOfflineEnvelope(buildIntentProfileContextStoreKey(profileId), data, {
    kind: 'intent-profile-context-snapshot',
  });
}

export async function readIntentSuggestedMovesSnapshot<T>(profileId: string): Promise<T | null> {
  return readOfflineSnapshot<T>(buildIntentSuggestedMovesStoreKey(profileId));
}

export async function writeIntentSuggestedMovesSnapshot<T>(profileId: string, data: T): Promise<void> {
  await writeOfflineEnvelope(buildIntentSuggestedMovesStoreKey(profileId), data, {
    kind: 'intent-suggested-moves-snapshot',
  });
}

export async function migrateLegacyIntentRequestsSnapshot<T>(profileId: string): Promise<T | null> {
  const nextKey = buildIntentRequestsStoreKey(profileId);
  const existing = await readOfflineSnapshot<T>(nextKey);
  if (existing) return existing;

  const legacyKey = buildLegacyIntentRequestsCacheKey(profileId);
  const legacy = await peekOfflineData<T>(legacyKey);
  if (!legacy) return null;

  await writeIntentRequestsEnvelope(profileId, legacy);
  await removeCache(legacyKey);
  return legacy;
}

export async function migrateLegacySuggestedMovesSnapshot<T>(profileId: string): Promise<T | null> {
  const nextKey = buildIntentSuggestedMovesStoreKey(profileId);
  const existing = await readOfflineSnapshot<T>(nextKey);
  if (existing) return existing;

  const legacyKey = buildLegacySuggestedMovesCacheKey(profileId);
  const legacy = await peekOfflineData<T>(legacyKey);
  if (!legacy) return null;

  await writeIntentSuggestedMovesSnapshot(profileId, legacy);
  await removeCache(legacyKey);
  return legacy;
}

async function writeIntentRequestsEnvelope<T>(profileId: string, data: T) {
  await writeOfflineEnvelope(buildIntentRequestsStoreKey(profileId), data, {
    kind: 'intent-requests-snapshot',
  });
}
