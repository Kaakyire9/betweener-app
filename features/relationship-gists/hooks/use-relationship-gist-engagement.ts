import { addEventListener as addNetInfoListener, fetch as fetchNetInfo } from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  RELATIONSHIP_GIST_ANALYTICS_ENABLED,
  RELATIONSHIP_GIST_ENGAGEMENT_ENABLED,
  RELATIONSHIP_GIST_REACTIONS_ENABLED,
  RELATIONSHIP_GIST_REFLECTIONS_ENABLED,
} from '@/features/relationship-gists/config/relationship-gist-feature-flags';
import {
  deleteRelationshipGistReflection,
  fetchRelationshipGistEngagement,
  recordRelationshipGistReaderEvent,
  setRelationshipGistReaction,
  upsertRelationshipGistReflection,
} from '@/features/relationship-gists/engagement/relationship-gist-engagement-repository';
import {
  drainRelationshipGistEngagementOutbox,
  enqueueRelationshipGistEngagement,
  type RelationshipGistEngagementOutboxItem,
} from '@/features/relationship-gists/engagement/relationship-gist-engagement-outbox';
import type {
  RelationshipGistEngagementSnapshot,
  RelationshipGistEngagementSource,
  RelationshipGistReaction,
  RelationshipGistReaderEventType,
} from '@/features/relationship-gists/engagement/relationship-gist-engagement';
import { normalizeRelationshipGistReflection } from '@/features/relationship-gists/engagement/relationship-gist-engagement';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/telemetry/logger';

const isOnline = async () => {
  const state = await fetchNetInfo();
  return state.isConnected !== false && state.isInternetReachable !== false;
};

const engagementRetryNotice = (code: string | undefined) => {
  if (code === 'PGRST202' || code === '42883') {
    return 'Gist engagement is not available on this test backend yet.';
  }
  if (code === '42501' || code === 'PGRST301') {
    return 'Your session needs to be refreshed before engagement can sync.';
  }
  if (code === 'P0002') {
    return 'This Gist edition is no longer available for engagement.';
  }
  return 'Your response is saved on this device and will retry automatically.';
};

export function useRelationshipGistEngagement({
  userId,
  gistId,
  readerOpen,
  source = 'circles',
}: {
  userId: string | null;
  gistId: string | null;
  readerOpen: boolean;
  source?: RelationshipGistEngagementSource;
}) {
  const [snapshot, setSnapshot] = useState<RelationshipGistEngagementSnapshot | null>(null);
  const [pendingReaction, setPendingReaction] = useState<RelationshipGistReaction | null | undefined>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const activeUserRef = useRef(userId);
  const eventKeysRef = useRef(new Set<string>());
  const sessionIdRef = useRef(Crypto.randomUUID());
  activeUserRef.current = userId;

  const refresh = useCallback(async () => {
    if (!RELATIONSHIP_GIST_ENGAGEMENT_ENABLED || !userId || !gistId) return null;
    try {
      const next = await fetchRelationshipGistEngagement(supabase as any, gistId);
      if (activeUserRef.current === userId) {
        setSnapshot(next);
        setPendingReaction(undefined);
        setNotice(null);
      }
      return next;
    } catch (error) {
      logger.warn('[relationship-gist] engagement_load_failed', {
        code: String((error as any)?.code ?? 'unknown'),
      });
      if (activeUserRef.current === userId) setNotice('Engagement will be ready when you are online.');
      return null;
    }
  }, [gistId, userId]);

  const sendOutboxItem = useCallback((item: RelationshipGistEngagementOutboxItem) => {
    if (item.kind === 'reaction') {
      return setRelationshipGistReaction(supabase as any, {
        operationId: item.id,
        ownerUserId: item.ownerUserId,
        gistId: item.gistId,
        revisionId: item.revisionId,
        reaction: item.reaction ?? null,
        source: item.source,
      });
    }
    return recordRelationshipGistReaderEvent(supabase as any, {
      clientEventId: item.id,
      ownerUserId: item.ownerUserId,
      gistId: item.gistId,
      revisionId: item.revisionId,
      eventType: item.eventType!,
      progressBucket: item.progressBucket,
      source: item.source,
      sessionId: item.sessionId,
    });
  }, []);

  const drain = useCallback(async () => {
    if (!userId || !RELATIONSHIP_GIST_ENGAGEMENT_ENABLED || !(await isOnline())) return;
    try {
      const result = await drainRelationshipGistEngagementOutbox({
        ownerUserId: userId,
        activeUserId: activeUserRef.current,
        send: sendOutboxItem,
      });
      if ((result.processed > 0 || result.discarded > 0) && gistId) await refresh();
      if (result.failures.length && activeUserRef.current === userId) {
        const code = result.failures.at(-1)?.code;
        logger.warn(result.discarded > 0
          ? '[relationship-gist] engagement_rpc_discarded'
          : '[relationship-gist] engagement_rpc_deferred', {
          code: code ?? 'retry_backoff',
          pending: result.items.length,
          discarded: result.discarded,
        });
        setNotice(engagementRetryNotice(code));
      }
    } catch (error) {
      logger.warn('[relationship-gist] engagement_outbox_failed', {
        code: String((error as any)?.code ?? (error as Error)?.name ?? 'unknown'),
      });
      if (activeUserRef.current === userId) {
        setNotice(engagementRetryNotice(String((error as any)?.code ?? undefined)));
      }
    }
  }, [gistId, refresh, sendOutboxItem, userId]);

  const track = useCallback(async (
    eventType: RelationshipGistReaderEventType,
    progressBucket?: 0 | 25 | 50 | 75 | 100 | null,
  ) => {
    if (!RELATIONSHIP_GIST_ANALYTICS_ENABLED || !userId || !gistId || !snapshot?.revisionId) return;
    const semanticKey = `${gistId}:${eventType}:${progressBucket ?? ''}:${sessionIdRef.current}`;
    if (eventKeysRef.current.has(semanticKey)) return;
    eventKeysRef.current.add(semanticKey);
    try {
      await enqueueRelationshipGistEngagement({
        ownerUserId: userId,
        gistId,
        revisionId: snapshot.revisionId,
        source,
        kind: 'analytics',
        eventType,
        progressBucket,
        sessionId: sessionIdRef.current,
      });
      void drain();
    } catch (error) {
      logger.warn('[relationship-gist] analytics_queue_failed', {
        code: String((error as Error)?.name ?? 'unknown'),
      });
    }
  }, [drain, gistId, snapshot?.revisionId, source, userId]);

  useEffect(() => {
    setSnapshot(null);
    setPendingReaction(undefined);
    setNotice(null);
    eventKeysRef.current = new Set();
    sessionIdRef.current = Crypto.randomUUID();
    if (!RELATIONSHIP_GIST_ENGAGEMENT_ENABLED || !userId || !gistId) return;
    void refresh();
  }, [gistId, userId]); // reader-open is handled separately below

  useEffect(() => {
    if (!snapshot) return;
    void track('impression');
    if (readerOpen) void track('open');
  }, [readerOpen, snapshot?.revisionId, track]);

  useEffect(() => {
    if (!userId || !RELATIONSHIP_GIST_ENGAGEMENT_ENABLED) return;
    void drain();
    const unsubscribe = addNetInfoListener((state) => {
      if (state.isConnected !== false && state.isInternetReachable !== false) void drain();
    });
    return unsubscribe;
  }, [drain, userId]);

  const selectReaction = useCallback(async (reaction: RelationshipGistReaction) => {
    if (!RELATIONSHIP_GIST_REACTIONS_ENABLED || !userId || !gistId || !snapshot) return;
    const desired = (pendingReaction ?? snapshot.reaction) === reaction ? null : reaction;
    setPendingReaction(desired);
    try {
      await enqueueRelationshipGistEngagement({
        ownerUserId: userId,
        gistId,
        revisionId: snapshot.revisionId,
        source,
        kind: 'reaction',
        reaction: desired,
      });
      setNotice('Reaction saved on this device.');
      void drain();
    } catch (error) {
      setPendingReaction(undefined);
      setNotice('This reaction could not be saved on this device.');
      logger.warn('[relationship-gist] reaction_queue_failed', {
        code: String((error as Error)?.name ?? 'unknown'),
      });
    }
  }, [drain, gistId, pendingReaction, snapshot, source, userId]);

  const saveReflection = useCallback(async (body: string) => {
    if (!RELATIONSHIP_GIST_REFLECTIONS_ENABLED || !userId || !gistId || !snapshot || !(await isOnline())) {
      setNotice('Connect to the internet to save a private reflection.');
      return false;
    }
    const normalized = normalizeRelationshipGistReflection(body);
    if (!normalized) return false;
    setBusy(true);
    try {
      await upsertRelationshipGistReflection(supabase as any, {
        operationId: Crypto.randomUUID(), ownerUserId: userId,
        gistId, revisionId: snapshot.revisionId,
        body: normalized, source,
      });
      await refresh();
      return true;
    } catch (error) {
      setNotice('Your private reflection was not saved. Please try again.');
      logger.warn('[relationship-gist] reflection_save_failed', {
        code: String((error as any)?.code ?? 'unknown'),
      });
      return false;
    } finally {
      setBusy(false);
    }
  }, [gistId, refresh, snapshot, source, userId]);

  const removeReflection = useCallback(async () => {
    if (!RELATIONSHIP_GIST_REFLECTIONS_ENABLED || !userId || !gistId || !snapshot || !(await isOnline())) {
      setNotice('Connect to the internet to delete a private reflection.');
      return false;
    }
    setBusy(true);
    try {
      await deleteRelationshipGistReflection(supabase as any, {
        operationId: Crypto.randomUUID(), ownerUserId: userId,
        gistId, revisionId: snapshot.revisionId, source,
      });
      await refresh();
      return true;
    } catch (error) {
      setNotice('Your private reflection was not deleted. Please try again.');
      logger.warn('[relationship-gist] reflection_delete_failed', {
        code: String((error as any)?.code ?? 'unknown'),
      });
      return false;
    } finally {
      setBusy(false);
    }
  }, [gistId, refresh, snapshot, source, userId]);

  return {
    enabled: RELATIONSHIP_GIST_ENGAGEMENT_ENABLED,
    reactionsEnabled: RELATIONSHIP_GIST_REACTIONS_ENABLED,
    reflectionsEnabled: RELATIONSHIP_GIST_REFLECTIONS_ENABLED,
    snapshot,
    selectedReaction: pendingReaction === undefined ? snapshot?.reaction ?? null : pendingReaction,
    busy,
    notice,
    selectReaction,
    saveReflection,
    removeReflection,
    track,
    refresh,
  };
}
