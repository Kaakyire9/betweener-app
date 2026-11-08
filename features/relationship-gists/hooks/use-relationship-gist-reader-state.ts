import { addEventListener as addNetInfoListener, fetch as fetchNetInfo } from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  applyRelationshipGistMutation,
  fetchRelationshipGistServerStates,
  type RelationshipGistMutationResult,
  type RelationshipGistServerStateRow,
} from '@/features/relationship-gists/data/relationship-gist-repository';
import { RELATIONSHIP_GIST_READER_V2_ENABLED } from '@/features/relationship-gists/config/relationship-gist-feature-flags';
import {
  drainRelationshipGistOutbox,
  enqueueRelationshipGistMutation,
  readRelationshipGistOutbox,
  type RelationshipGistMutationPatch,
  type RelationshipGistOutboxMutation,
} from '@/features/relationship-gists/sync/relationship-gist-outbox';
import {
  clampRelationshipGistProgress,
  getDefaultRelationshipGistLocalState,
  readRelationshipGistLocalState,
  writeRelationshipGistLocalStateStrict,
  type RelationshipGistLocalState,
  type RelationshipGistLocalStateMap,
} from '@/lib/relationship-gists/local-state';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/telemetry/logger';

const PROGRESS_SAVE_DELAY_MS = 800;

type OwnedState = {
  ownerUserId: string | null;
  map: RelationshipGistLocalStateMap;
};

type ReaderIdentity = {
  ownerUserId: string;
  ownerProfileId: string;
  epoch: number;
};

type PendingProgress = {
  identity: ReaderIdentity;
  gistId: string;
  patch: RelationshipGistMutationPatch;
};

const parseIso = (value?: string | null) => {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const rowToLocalState = (
  row: RelationshipGistServerStateRow,
  local?: RelationshipGistLocalState,
): RelationshipGistLocalState => {
  const fallback = local ?? getDefaultRelationshipGistLocalState(row.last_perspective);
  const serverProgress = clampRelationshipGistProgress(Number(row.progress ?? 0));
  const useServerAnchor = serverProgress >= fallback.progress;
  return {
    saved: row.saved === true,
    savedVersion: Math.max(0, Math.floor(Number(row.saved_version ?? fallback.savedVersion ?? 0))),
    progress: Math.max(fallback.progress, serverProgress),
    lastReadAt: Math.max(fallback.lastReadAt ?? 0, parseIso(row.last_read_at) ?? 0) || null,
    lastOpenedAt: Math.max(fallback.lastOpenedAt ?? 0, parseIso(row.last_opened_at) ?? 0) || null,
    lastPerspective: row.last_perspective ?? fallback.lastPerspective,
    lastAnchor: useServerAnchor ? row.last_anchor ?? fallback.lastAnchor : fallback.lastAnchor,
    lastAnchorOffset: useServerAnchor
      ? row.last_anchor_offset ?? fallback.lastAnchorOffset
      : fallback.lastAnchorOffset,
    scrollCompletedAt: Math.max(
      fallback.scrollCompletedAt ?? 0,
      parseIso(row.scroll_completed_at) ?? 0,
    ) || null,
    readAcknowledgedAt: Math.max(
      fallback.readAcknowledgedAt ?? 0,
      parseIso(row.read_acknowledged_at) ?? 0,
    ) || null,
    readingDurationMs: Math.max(
      fallback.readingDurationMs,
      Math.max(0, Math.floor(Number(row.reading_duration_ms ?? 0))),
    ),
    updatedAt: parseIso(row.updated_at) ?? fallback.updatedAt,
  };
};

export function useRelationshipGistReaderState({
  userId,
  profileId,
  activeGistId,
  perspective,
  readerOpen,
}: {
  userId: string | null;
  profileId: string | null;
  activeGistId: string | null;
  perspective: string;
  readerOpen: boolean;
}) {
  const [ownedState, setOwnedState] = useState<OwnedState>({ ownerUserId: null, map: {} });
  const [syncIssue, setSyncIssue] = useState<string | null>(null);
  const ownerRef = useRef<string | null>(userId);
  const profileRef = useRef<string | null>(profileId);
  const stateRef = useRef<RelationshipGistLocalStateMap>({});
  const authEpochRef = useRef(0);
  const drainingRef = useRef(false);
  const latestSavedIntentRef = useRef<Record<string, boolean>>({});
  const pendingProgressRef = useRef<PendingProgress | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readingSessionRef = useRef<{
    identity: ReaderIdentity;
    gistId: string;
    perspective: string;
    lastFlushedAt: number;
  } | null>(null);

  ownerRef.current = userId;
  profileRef.current = profileId;

  const visibleState = ownedState.ownerUserId === userId ? ownedState.map : {};

  const persistMap = useCallback(async (
    ownerUserId: string,
    nextMap: RelationshipGistLocalStateMap,
    epoch: number,
  ) => {
    const isActiveOwner = ownerRef.current === ownerUserId && authEpochRef.current === epoch;
    if (isActiveOwner) {
      stateRef.current = nextMap;
      setOwnedState({ ownerUserId, map: nextMap });
    }
    try {
      await writeRelationshipGistLocalStateStrict(ownerUserId, nextMap);
      return true;
    } catch (error) {
      if (isActiveOwner) {
        setSyncIssue('Reader changes are held in memory but could not be saved on this device.');
      }
      logger.warn('[relationship-gist] local_state_write_failed', {
        code: error instanceof Error ? error.name : 'unknown',
        ownerChanged: !isActiveOwner,
      });
      return false;
    }
  }, []);

  const mergeAuthoritativeState = useCallback(async (
    ownerUserId: string,
    result: RelationshipGistMutationResult,
    _mutation: RelationshipGistOutboxMutation,
    epoch: number,
  ) => {
    if (ownerRef.current !== ownerUserId || authEpochRef.current !== epoch) return;
    const previous = stateRef.current[result.gistId]
      ?? getDefaultRelationshipGistLocalState(result.lastPerspective);
    const latestSavedIntent = latestSavedIntentRef.current[result.gistId];
    const preserveLatestIntent = typeof latestSavedIntent === 'boolean'
      && latestSavedIntent !== result.saved;
    const nextEntry: RelationshipGistLocalState = {
      ...previous,
      saved: preserveLatestIntent ? latestSavedIntent : result.saved,
      savedVersion: result.savedVersion,
      progress: Math.max(previous.progress, result.progress),
      lastReadAt: Math.max(previous.lastReadAt ?? 0, parseIso(result.lastReadAt) ?? 0) || null,
      lastOpenedAt: Math.max(previous.lastOpenedAt ?? 0, parseIso(result.lastOpenedAt) ?? 0) || null,
      lastPerspective: result.lastPerspective ?? previous.lastPerspective,
      lastAnchor: result.lastAnchor ?? previous.lastAnchor,
      lastAnchorOffset: result.lastAnchorOffset ?? previous.lastAnchorOffset,
      scrollCompletedAt: Math.max(
        previous.scrollCompletedAt ?? 0,
        parseIso(result.scrollCompletedAt) ?? 0,
      ) || null,
      readAcknowledgedAt: Math.max(
        previous.readAcknowledgedAt ?? 0,
        parseIso(result.readAcknowledgedAt) ?? 0,
      ) || null,
      readingDurationMs: Math.max(previous.readingDurationMs, result.readingDurationMs),
      updatedAt: parseIso(result.updatedAt) ?? Date.now(),
    };
    if (!preserveLatestIntent && result.savedOutcome !== 'conflict') {
      delete latestSavedIntentRef.current[result.gistId];
    }
    await persistMap(ownerUserId, {
      ...stateRef.current,
      [result.gistId]: nextEntry,
    }, epoch);
  }, [persistMap]);

  const drainOutbox = useCallback(async () => {
    const ownerUserId = ownerRef.current;
    if (!ownerUserId || !profileRef.current || drainingRef.current) return;
    if (!RELATIONSHIP_GIST_READER_V2_ENABLED) return;
    const epoch = authEpochRef.current;
    const network = await fetchNetInfo();
    if (network.isConnected === false || network.isInternetReachable === false) return;
    if (ownerRef.current !== ownerUserId || authEpochRef.current !== epoch) return;

    drainingRef.current = true;
    try {
      const result = await drainRelationshipGistOutbox({
        ownerUserId,
        activeUserId: ownerRef.current,
        send: (mutation) => applyRelationshipGistMutation(supabase as any, mutation),
        onAuthoritativeState: (state, mutation) =>
          mergeAuthoritativeState(ownerUserId, state, mutation, epoch),
      });
      if (result.failed > 0) {
        setSyncIssue('Some reader changes are still waiting to sync.');
        logger.warn('[relationship-gist] outbox_terminal_items', { count: result.failed });
      } else if (result.queue.length === 0) {
        setSyncIssue(null);
      }
    } catch (error) {
      setSyncIssue('Reader changes will retry when the connection is ready.');
      logger.warn('[relationship-gist] outbox_drain_failed', {
        code: error instanceof Error ? error.name : 'unknown',
      });
    } finally {
      drainingRef.current = false;
    }
  }, [mergeAuthoritativeState]);

  const persistEntryForIdentity = useCallback(async (
    identity: ReaderIdentity,
    gistId: string,
    patch: RelationshipGistMutationPatch,
  ) => {
    if (!gistId) return;
    const { ownerUserId, ownerProfileId, epoch } = identity;
    const isActiveOwner = ownerRef.current === ownerUserId && authEpochRef.current === epoch;
    const currentMap = isActiveOwner
      ? stateRef.current
      : await readRelationshipGistLocalState(ownerUserId);

    const previous = currentMap[gistId]
      ?? getDefaultRelationshipGistLocalState(patch.lastPerspective ?? perspective);
    if (isActiveOwner && typeof patch.saved === 'boolean') {
      latestSavedIntentRef.current[gistId] = patch.saved;
    }
    const now = Date.now();
    const nextEntry: RelationshipGistLocalState = {
      ...previous,
      saved: patch.saved ?? previous.saved,
      progress: clampRelationshipGistProgress(
        typeof patch.progress === 'number'
          ? Math.max(previous.progress, patch.progress)
          : previous.progress,
      ),
      lastReadAt: patch.lastReadAt ?? previous.lastReadAt,
      lastOpenedAt: patch.markOpened ? now : previous.lastOpenedAt,
      lastPerspective: patch.lastPerspective ?? previous.lastPerspective,
      lastAnchor: patch.lastAnchor ?? previous.lastAnchor,
      lastAnchorOffset: patch.lastAnchorOffset ?? previous.lastAnchorOffset,
      scrollCompletedAt: patch.scrollCompleted ? now : previous.scrollCompletedAt,
      readAcknowledgedAt: patch.readAcknowledged ? now : previous.readAcknowledgedAt,
      readingDurationMs: previous.readingDurationMs + Math.max(0, patch.readingDurationDeltaMs ?? 0),
      updatedAt: now,
    };

    let queued = false;
    try {
      await enqueueRelationshipGistMutation({
        ownerUserId,
        ownerProfileId,
        gistId,
        patch: {
          ...patch,
          expectedSavedVersion: typeof patch.saved === 'boolean'
            ? previous.savedVersion
            : undefined,
        },
      });
      queued = true;
    } catch (error) {
      if (isActiveOwner) {
        setSyncIssue('Reader changes are visible locally but could not enter the sync queue.');
      }
      logger.warn('[relationship-gist] outbox_enqueue_failed', {
        code: error instanceof Error ? error.name : 'unknown',
        ownerChanged: !isActiveOwner,
      });
    }

    await persistMap(ownerUserId, {
      ...currentMap,
      [gistId]: nextEntry,
    }, epoch);
    if (
      queued
      && ownerRef.current === ownerUserId
      && authEpochRef.current === epoch
    ) {
      void drainOutbox();
    }
  }, [drainOutbox, persistMap, perspective]);

  const persistEntry = useCallback(async (
    gistId: string,
    patch: RelationshipGistMutationPatch,
  ) => {
    const ownerUserId = ownerRef.current;
    const ownerProfileId = profileRef.current;
    if (!ownerUserId || !ownerProfileId) return;
    await persistEntryForIdentity({
      ownerUserId,
      ownerProfileId,
      epoch: authEpochRef.current,
    }, gistId, patch);
  }, [persistEntryForIdentity]);

  const flushPendingProgress = useCallback(async () => {
    if (progressTimerRef.current) {
      clearTimeout(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    const pending = pendingProgressRef.current;
    pendingProgressRef.current = null;
    if (!pending) return;
    await persistEntryForIdentity(pending.identity, pending.gistId, pending.patch);
  }, [persistEntryForIdentity]);

  const queueProgress = useCallback((
    gistId: string,
    patch: Pick<
      RelationshipGistMutationPatch,
      'progress' | 'lastReadAt' | 'lastPerspective' | 'lastAnchor' | 'lastAnchorOffset' | 'scrollCompleted'
    >,
  ) => {
    const ownerUserId = ownerRef.current;
    const ownerProfileId = profileRef.current;
    if (!ownerUserId || !ownerProfileId) return;
    const identity: ReaderIdentity = {
      ownerUserId,
      ownerProfileId,
      epoch: authEpochRef.current,
    };
    const pending = pendingProgressRef.current;
    const sameOwnerAndGist = pending?.gistId === gistId
      && pending.identity.ownerUserId === identity.ownerUserId
      && pending.identity.epoch === identity.epoch;
    const previous = sameOwnerAndGist
      ? pending.patch
      : {};
    if (pending && !sameOwnerAndGist) {
      pendingProgressRef.current = null;
      void persistEntryForIdentity(pending.identity, pending.gistId, pending.patch);
    }
    pendingProgressRef.current = {
      identity,
      gistId,
      patch: {
        ...previous,
        ...patch,
        progress: Math.max(previous.progress ?? 0, patch.progress ?? 0),
        scrollCompleted: previous.scrollCompleted === true || patch.scrollCompleted === true,
      },
    };
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    progressTimerRef.current = setTimeout(() => {
      void flushPendingProgress();
    }, PROGRESS_SAVE_DELAY_MS);
  }, [flushPendingProgress, persistEntryForIdentity]);

  const flushReadingDuration = useCallback(async () => {
    const session = readingSessionRef.current;
    if (!session) return;
    const now = Date.now();
    const delta = Math.min(900_000, Math.max(0, now - session.lastFlushedAt));
    session.lastFlushedAt = now;
    if (delta < 1_000) return;
    await persistEntryForIdentity(session.identity, session.gistId, {
      readingDurationDeltaMs: delta,
      lastReadAt: now,
      lastPerspective: session.perspective,
    });
  }, [persistEntryForIdentity]);

  const toggleSaved = useCallback((gistId: string) => {
    const current = stateRef.current[gistId] ?? getDefaultRelationshipGistLocalState(perspective);
    return persistEntry(gistId, {
      saved: !current.saved,
      lastPerspective: perspective,
    });
  }, [persistEntry, perspective]);

  const acknowledgeRead = useCallback((gistId: string) => persistEntry(gistId, {
    progress: 1,
    readAcknowledged: true,
    lastReadAt: Date.now(),
    lastPerspective: perspective,
  }), [persistEntry, perspective]);

  useEffect(() => {
    authEpochRef.current += 1;
    const epoch = authEpochRef.current;
    ownerRef.current = userId;
    profileRef.current = profileId;
    stateRef.current = {};
    latestSavedIntentRef.current = {};
    setOwnedState({ ownerUserId: userId, map: {} });
    setSyncIssue(null);
    if (!userId) return;

    let cancelled = false;
    void (async () => {
      const stored = await readRelationshipGistLocalState(userId);
      if (cancelled || ownerRef.current !== userId || authEpochRef.current !== epoch) return;
      let hydrated = stored;

      if (profileId) {
        try {
          const { rows } = await fetchRelationshipGistServerStates(supabase as any);
          const existingOutbox = await readRelationshipGistOutbox(userId);
          const queuedGistIds = new Set(existingOutbox.map((item) => item.gistId));
          const queuedSavedIntentByGist = existingOutbox.reduce<Record<string, boolean>>(
            (intents, mutation) => {
              if (typeof mutation.patch.saved === 'boolean') {
                intents[mutation.gistId] = mutation.patch.saved;
              }
              return intents;
            },
            {},
          );

          for (const row of rows) {
            const gistId = String(row.gist_id ?? '');
            const local = stored[gistId];
            if (!gistId || !local || queuedGistIds.has(gistId)) continue;
            const serverUpdatedAt = parseIso(row.updated_at) ?? 0;
            if (local.updatedAt > serverUpdatedAt && local.saved !== (row.saved === true)) {
              await enqueueRelationshipGistMutation({
                ownerUserId: userId,
                ownerProfileId: profileId,
                gistId,
                patch: {
                  saved: local.saved,
                  expectedSavedVersion: Math.max(0, Number(row.saved_version ?? 0)),
                  lastPerspective: local.lastPerspective,
                },
              });
              queuedGistIds.add(gistId);
              queuedSavedIntentByGist[gistId] = local.saved;
            }
          }

          const serverIds = new Set<string>();
          hydrated = rows.reduce<RelationshipGistLocalStateMap>((next, row) => {
            const gistId = String(row.gist_id ?? '');
            if (!gistId) return next;
            serverIds.add(gistId);
            const merged = rowToLocalState(row, next[gistId]);
            next[gistId] = typeof queuedSavedIntentByGist[gistId] === 'boolean'
              ? { ...merged, saved: queuedSavedIntentByGist[gistId] }
              : merged;
            return next;
          }, { ...stored });

          for (const [gistId, local] of Object.entries(stored)) {
            if (
              !serverIds.has(gistId)
              && !queuedGistIds.has(gistId)
              && (local.saved || local.progress > 0 || local.lastOpenedAt != null)
            ) {
              await enqueueRelationshipGistMutation({
                ownerUserId: userId,
                ownerProfileId: profileId,
                gistId,
                patch: {
                  saved: local.saved,
                  expectedSavedVersion: local.savedVersion,
                  progress: local.progress,
                  lastReadAt: local.lastReadAt ?? undefined,
                  markOpened: local.lastOpenedAt != null,
                  lastPerspective: local.lastPerspective,
                  lastAnchor: local.lastAnchor,
                  lastAnchorOffset: local.lastAnchorOffset,
                  scrollCompleted: local.scrollCompletedAt != null,
                  readAcknowledged: local.readAcknowledgedAt != null,
                },
              });
            }
          }
        } catch (error) {
          setSyncIssue('Showing reader state saved on this device.');
          logger.warn('[relationship-gist] state_hydration_failed', {
            code: error instanceof Error ? error.name : 'unknown',
          });
        }
      }

      if (cancelled || ownerRef.current !== userId || authEpochRef.current !== epoch) return;
      await persistMap(userId, hydrated, epoch);
      void drainOutbox();
    })();

    return () => {
      cancelled = true;
    };
  }, [drainOutbox, persistMap, profileId, userId]);

  useEffect(() => {
    if (!readerOpen || !activeGistId || !userId || !profileId) {
      if (readingSessionRef.current) void flushReadingDuration();
      readingSessionRef.current = null;
      return;
    }
    readingSessionRef.current = {
      identity: {
        ownerUserId: userId,
        ownerProfileId: profileId,
        epoch: authEpochRef.current,
      },
      gistId: activeGistId,
      perspective,
      lastFlushedAt: Date.now(),
    };
    void persistEntry(activeGistId, {
      markOpened: true,
      lastPerspective: perspective,
    });
    return () => {
      void flushReadingDuration();
      readingSessionRef.current = null;
    };
  }, [activeGistId, flushReadingDuration, persistEntry, perspective, profileId, readerOpen, userId]);

  useEffect(() => {
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (readerOpen && activeGistId && userId && profileId) {
          readingSessionRef.current = {
            identity: {
              ownerUserId: userId,
              ownerProfileId: profileId,
              epoch: authEpochRef.current,
            },
            gistId: activeGistId,
            perspective,
            lastFlushedAt: Date.now(),
          };
        }
        void drainOutbox();
        return;
      }
      void flushPendingProgress();
      void flushReadingDuration();
      readingSessionRef.current = null;
    });
    const netInfo = addNetInfoListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) void drainOutbox();
    });
    return () => {
      appState.remove();
      netInfo();
    };
  }, [
    activeGistId,
    drainOutbox,
    flushPendingProgress,
    flushReadingDuration,
    perspective,
    profileId,
    readerOpen,
    userId,
  ]);

  useEffect(() => () => {
    void flushPendingProgress();
    void flushReadingDuration();
  }, [flushPendingProgress, flushReadingDuration]);

  return {
    stateMap: visibleState,
    syncIssue,
    persistEntry,
    queueProgress,
    flushPendingProgress,
    flushReadingDuration,
    toggleSaved,
    acknowledgeRead,
    drainOutbox,
  };
}
