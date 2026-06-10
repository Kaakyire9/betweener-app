import { supabase } from '@/lib/supabase';
import {
  migrateLegacyIntentRequestsSnapshot,
  readIntentRequestsSnapshot,
  writeIntentRequestsSnapshot,
} from '@/lib/offline/intent-store';
import {
  getIntentOfflineMutationSnapshot,
  subscribeToOfflineMutationEvents,
  type OfflineMutation,
  type FailedOfflineMutation,
} from '@/lib/offline/mutation-queue';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type IntentRequestType = 'connect' | 'date_request' | 'like_with_note' | 'circle_intro';
export type IntentRequestStatus = 'pending' | 'accepted' | 'passed' | 'expired' | 'cancelled' | 'matched';

export type IntentRequest = {
  id: string;
  recipient_id: string;
  actor_id: string;
  type: IntentRequestType;
  message?: string | null;
  suggested_time?: string | null;
  suggested_place?: string | null;
  status: IntentRequestStatus;
  created_at: string;
  expires_at: string;
  metadata?: Record<string, unknown> | null;
};

const isExpired = (req: IntentRequest) => {
  if (req.status !== 'pending') return false;
  const ts = Date.parse(req.expires_at);
  return Number.isNaN(ts) ? false : ts < Date.now();
};

const isOfflineIntentRow = (item: IntentRequest) => item.id.startsWith('offline-intent-');

const queueActionForMutation = (mutation: OfflineMutation | FailedOfflineMutation) => {
  if (mutation.kind === 'intent_request_create') return 'create';
  if (mutation.kind === 'intent_request_cancel') return 'cancel';
  if (mutation.kind === 'intent_request_decision') return mutation.payload.decision;
  return null;
};

const buildQueuedCreateRow = (
  mutation: Extract<OfflineMutation | FailedOfflineMutation, { kind: 'intent_request_create' }>,
  userId: string,
  state: 'queued' | 'failed',
): IntentRequest => {
  const createdAt = new Date(mutation.createdAt).toISOString();
  return {
    id: `offline-intent-${state}:${mutation.id}`,
    actor_id: userId,
    recipient_id: mutation.payload.recipientId,
    type: mutation.payload.type,
    message: mutation.payload.message ?? null,
    suggested_time: mutation.payload.suggestedTime ?? null,
    suggested_place: mutation.payload.suggestedPlace ?? null,
    status: 'pending',
    created_at: createdAt,
    expires_at: new Date(mutation.createdAt + 7 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: {
      ...(mutation.payload.metadata ?? {}),
      offline_queue: {
        action: 'create',
        state,
        queued_at: createdAt,
        failure_reason: state === 'failed' ? (mutation as FailedOfflineMutation).failureReason : null,
      },
    },
  };
};

const hasEquivalentServerCreate = (items: IntentRequest[], row: IntentRequest) =>
  items.some((item) =>
    !isOfflineIntentRow(item) &&
    item.actor_id === row.actor_id &&
    item.recipient_id === row.recipient_id &&
    item.type === row.type &&
    item.status === 'pending' &&
    String(item.message ?? '') === String(row.message ?? ''),
  );

const applyIntentQueueOverlay = (
  sourceItems: IntentRequest[],
  userId: string,
  pending: OfflineMutation[],
  failed: FailedOfflineMutation[],
) => {
  const base = sourceItems.filter((item) => !isOfflineIntentRow(item));
  const byId = new Map(base.map((item) => [item.id, item]));

  const applyDecision = (mutation: OfflineMutation | FailedOfflineMutation, state: 'queued' | 'failed') => {
    if (mutation.kind !== 'intent_request_decision' && mutation.kind !== 'intent_request_cancel') return;
    const requestId = mutation.payload.requestId;
    const existing = byId.get(requestId);
    if (!existing) return;
    const action = queueActionForMutation(mutation);
    byId.set(requestId, {
      ...existing,
      metadata: {
        ...(existing.metadata ?? {}),
        offline_queue: {
          action,
          state,
          queued_at: new Date(mutation.createdAt).toISOString(),
          failure_reason: state === 'failed' ? (mutation as FailedOfflineMutation).failureReason : null,
        },
      },
    });
  };

  failed.forEach((mutation) => applyDecision(mutation, 'failed'));
  pending.forEach((mutation) => applyDecision(mutation, 'queued'));

  const next = Array.from(byId.values());
  const createRows = [
    ...failed
      .filter((mutation): mutation is Extract<FailedOfflineMutation, { kind: 'intent_request_create' }> => mutation.kind === 'intent_request_create')
      .map((mutation) => buildQueuedCreateRow(mutation, userId, 'failed')),
    ...pending
      .filter((mutation): mutation is Extract<OfflineMutation, { kind: 'intent_request_create' }> => mutation.kind === 'intent_request_create')
      .map((mutation) => buildQueuedCreateRow(mutation, userId, 'queued')),
  ];

  createRows.forEach((row) => {
    if (!hasEquivalentServerCreate(next, row)) next.push(row);
  });

  return next.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
};

export const useIntentRequests = (
  userId?: string | null,
  options?: { liveFetchEnabled?: boolean; snapshotOwnerIds?: (string | null | undefined)[] },
) => {
  const [items, setItems] = useState<IntentRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const liveFetchEnabled = options?.liveFetchEnabled !== false;
  const snapshotOwnerIdsSignature = JSON.stringify(
    [userId, ...(options?.snapshotOwnerIds ?? [])]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean),
  );
  const snapshotOwnerIds = useMemo(
    () =>
      Array.from(
        new Set(
          (JSON.parse(snapshotOwnerIdsSignature) as string[])
            .map((value) => String(value).trim())
            .filter(Boolean),
        ),
      ),
    [snapshotOwnerIdsSignature],
  );

  const persistSnapshot = useCallback(
    async (next: IntentRequest[]) => {
      if (snapshotOwnerIds.length === 0) return;
      await Promise.all(
        snapshotOwnerIds.map((ownerId) =>
          writeIntentRequestsSnapshot(ownerId, next).catch(() => undefined),
        ),
      );
    },
    [snapshotOwnerIds],
  );

  useEffect(() => {
    if (!liveFetchEnabled) {
      setLoading(false);
    }
  }, [liveFetchEnabled]);

  const reconcileOfflineQueue = useCallback(async (source?: IntentRequest[]) => {
    if (!userId) return;
    const snapshot = await getIntentOfflineMutationSnapshot();
    setItems((prev) => {
      const next = applyIntentQueueOverlay(source ?? prev, userId, snapshot.pending, snapshot.failed);
      void persistSnapshot(next);
      return next;
    });
  }, [persistSnapshot, userId]);

  // Cached-first: hydrate last known list quickly, then refresh in background.
  useEffect(() => {
    if (snapshotOwnerIds.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const ownerId of snapshotOwnerIds) {
        const cached =
          (await readIntentRequestsSnapshot<IntentRequest[]>(ownerId)) ??
          (await migrateLegacyIntentRequestsSnapshot<IntentRequest[]>(ownerId));
        if (cancelled || !cached || !Array.isArray(cached)) continue;
        setItems((prev) => (prev.length === 0 ? cached : prev));
        void reconcileOfflineQueue(cached);
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reconcileOfflineQueue, snapshotOwnerIds, userId]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    if (!liveFetchEnabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Best-effort cleanup; don't fail the screen if this errors.
      try {
        await supabase.rpc('rpc_mark_expired_intent_requests');
      } catch {}

      const { data, error } = await supabase
        .from('intent_requests')
        .select('*')
        .or(`recipient_id.eq.${userId},actor_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) return;
      const next = (data || []) as IntentRequest[];
      setItems(next);
      void persistSnapshot(next);
      void reconcileOfflineQueue(next);
    } finally {
      setLoading(false);
    }
  }, [liveFetchEnabled, persistSnapshot, reconcileOfflineQueue, userId]);

  useEffect(() => {
    if (liveFetchEnabled) {
      void refresh();
    }
    if (!userId) return;
    if (!liveFetchEnabled) return;

    const unsubscribeQueue = subscribeToOfflineMutationEvents((event) => {
      if (
        event.mutation.kind !== 'intent_request_create' &&
        event.mutation.kind !== 'intent_request_decision' &&
        event.mutation.kind !== 'intent_request_cancel'
      ) {
        return;
      }
      if (event.type === 'completed') {
        void refresh();
        return;
      }
      void reconcileOfflineQueue();
    });

    const incomingChannel = supabase
      .channel(`intent-requests:recipient:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'intent_requests', filter: `recipient_id=eq.${userId}` },
        () => void refresh(),
      )
      .subscribe();

    const outgoingChannel = supabase
      .channel(`intent-requests:actor:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'intent_requests', filter: `actor_id=eq.${userId}` },
        () => void refresh(),
      )
      .subscribe();

    return () => {
      unsubscribeQueue();
      supabase.removeChannel(incomingChannel);
      supabase.removeChannel(outgoingChannel);
    };
  }, [liveFetchEnabled, reconcileOfflineQueue, refresh, userId]);

  const incoming = useMemo(() => items.filter((item) => item.recipient_id === userId), [items, userId]);
  const sent = useMemo(() => items.filter((item) => item.actor_id === userId), [items, userId]);
  const badgeCount = useMemo(
    () => incoming.filter((item) => item.status === 'pending' && !isExpired(item)).length,
    [incoming],
  );

  const updateLocalIntent = useCallback(
    (requestId: string, patch: Partial<IntentRequest> | null) => {
      if (!userId || !requestId) return;
      setItems((prev) => {
        const next =
          patch === null
            ? prev.filter((item) => item.id !== requestId)
            : prev.map((item) => (item.id === requestId ? { ...item, ...patch } : item));
        void persistSnapshot(next);
        return next;
      });
    },
    [persistSnapshot, userId],
  );

  const addLocalIntent = useCallback(
    (request: IntentRequest) => {
      if (!userId || !request.id) return;
      setItems((prev) => {
        const next = [request, ...prev.filter((item) => item.id !== request.id)]
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
        void persistSnapshot(next);
        return next;
      });
    },
    [persistSnapshot, userId],
  );

  return {
    items,
    incoming,
    sent,
    loading,
    refresh,
    badgeCount,
    updateLocalIntent,
    addLocalIntent,
    reconcileOfflineQueue,
  };
};
