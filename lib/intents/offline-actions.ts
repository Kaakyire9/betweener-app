import type { IntentRequest, IntentRequestStatus } from '@/hooks/useIntentRequests';
import { isLikelyNetworkError } from '@/lib/network';
import { updateIntentRequestsSnapshot } from '@/lib/offline/intent-store';
import {
  enqueueIntentRequestCancelMutation,
  enqueueIntentRequestCreateMutation,
  enqueueIntentRequestDecisionMutation,
} from '@/lib/offline/mutation-queue';
import { supabase } from '@/lib/supabase';

export type IntentRequestType = 'connect' | 'date_request' | 'like_with_note' | 'circle_intro';
export type IntentDecision = 'accept' | 'pass';

export type IntentActionResult =
  | { status: 'synced'; requestId?: string | null }
  | { status: 'queued'; requestId?: string | null };

export type CreateIntentRequestInput = {
  recipientId: string;
  type: IntentRequestType;
  message?: string | null;
  suggestedTime?: string | null;
  suggestedPlace?: string | null;
  metadata?: Record<string, unknown> | null;
  actorProfileId?: string | null;
  snapshotOwnerIds?: (string | null | undefined)[];
};

export type DecideIntentRequestInput = {
  requestId: string;
  decision: IntentDecision;
  insertAcceptanceSystemMessages?: boolean;
  snapshotOwnerIds?: (string | null | undefined)[];
};

type IntentSnapshotQueueState = 'queued' | 'failed';

const INTENT_REQUEST_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

const normalizeSnapshotOwnerIds = (ownerIds?: (string | null | undefined)[]) =>
  Array.from(new Set((ownerIds ?? []).map((value) => String(value ?? '').trim()).filter(Boolean)));

const sortIntentRequests = (items: IntentRequest[]) =>
  [...items].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));

const buildOfflineQueueMetadata = (
  action: 'create' | 'accept' | 'pass' | 'cancel',
  state: IntentSnapshotQueueState,
  queuedAt: string,
) => ({
  action,
  state,
  queued_at: queuedAt,
  failure_reason: null,
});

const clearOfflineQueueMetadata = (metadata?: Record<string, unknown> | null) => {
  if (!metadata || typeof metadata !== 'object') return metadata ?? null;
  const next = { ...metadata };
  delete (next as Record<string, unknown>).offline_queue;
  return Object.keys(next).length > 0 ? next : null;
};

const matchesCreateRequest = (
  item: IntentRequest,
  candidate: Pick<IntentRequest, 'actor_id' | 'recipient_id' | 'type' | 'message' | 'suggested_time' | 'suggested_place'>,
) =>
  item.actor_id === candidate.actor_id &&
  item.recipient_id === candidate.recipient_id &&
  item.type === candidate.type &&
  String(item.message ?? '') === String(candidate.message ?? '') &&
  String(item.suggested_time ?? '') === String(candidate.suggested_time ?? '') &&
  String(item.suggested_place ?? '') === String(candidate.suggested_place ?? '');

const buildOptimisticIntentRequest = ({
  id,
  actorProfileId,
  recipientId,
  type,
  message,
  suggestedTime,
  suggestedPlace,
  metadata,
  createdAtMs,
}: {
  id: string;
  actorProfileId: string;
  recipientId: string;
  type: IntentRequestType;
  message?: string | null;
  suggestedTime?: string | null;
  suggestedPlace?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAtMs: number;
}): IntentRequest => {
  const createdAt = new Date(createdAtMs).toISOString();
  return {
    id,
    actor_id: actorProfileId,
    recipient_id: recipientId,
    type,
    message: message ?? null,
    suggested_time: suggestedTime ?? null,
    suggested_place: suggestedPlace ?? null,
    status: 'pending',
    created_at: createdAt,
    expires_at: new Date(createdAtMs + INTENT_REQUEST_EXPIRY_MS).toISOString(),
    metadata: metadata ?? null,
  };
};

async function updateIntentSnapshotsForOwners(
  ownerIds: (string | null | undefined)[] | undefined,
  updater: (current: IntentRequest[] | null) => IntentRequest[] | null | Promise<IntentRequest[] | null>,
) {
  const normalizedOwnerIds = normalizeSnapshotOwnerIds(ownerIds);
  if (normalizedOwnerIds.length === 0) return;
  await Promise.all(
    normalizedOwnerIds.map((ownerId) =>
      updateIntentRequestsSnapshot<IntentRequest[]>(ownerId, updater).catch(() => null),
    ),
  );
}

async function addIntentRequestToSnapshots(
  ownerIds: (string | null | undefined)[] | undefined,
  request: IntentRequest,
) {
  await updateIntentSnapshotsForOwners(ownerIds, async (current) => {
    const next = (current ?? []).filter(
      (item) => item.id !== request.id && !matchesCreateRequest(item, request),
    );
    return sortIntentRequests([request, ...next]);
  });
}

async function patchIntentRequestInSnapshots(
  ownerIds: (string | null | undefined)[] | undefined,
  requestId: string,
  patch: {
    status?: IntentRequestStatus;
    metadataUpdater?: (
      current: Record<string, unknown> | null | undefined,
    ) => Record<string, unknown> | null;
  },
) {
  await updateIntentSnapshotsForOwners(ownerIds, async (current) => {
    if (!current || current.length === 0) return current;
    let touched = false;
    const next = current.map((item) => {
      if (item.id !== requestId) return item;
      touched = true;
      return {
        ...item,
        ...(patch.status ? { status: patch.status } : null),
        ...(patch.metadataUpdater ? { metadata: patch.metadataUpdater(item.metadata) } : null),
      };
    });
    return touched ? sortIntentRequests(next) : current;
  });
}

export async function createIntentRequestOfflineSafe(input: CreateIntentRequestInput): Promise<IntentActionResult> {
  try {
    const { data, error } = await supabase.rpc('rpc_create_intent_request', {
      p_recipient_id: input.recipientId,
      p_type: input.type,
      p_message: input.message ?? null,
      p_suggested_time: input.suggestedTime ?? null,
      p_suggested_place: input.suggestedPlace ?? null,
      p_metadata: input.metadata ?? {},
    });
    if (error) throw error;
    const requestId = typeof data === 'string' ? data : null;
    if (requestId && input.actorProfileId) {
      await addIntentRequestToSnapshots(
        input.snapshotOwnerIds,
        buildOptimisticIntentRequest({
          id: requestId,
          actorProfileId: input.actorProfileId,
          recipientId: input.recipientId,
          type: input.type,
          message: input.message ?? null,
          suggestedTime: input.suggestedTime ?? null,
          suggestedPlace: input.suggestedPlace ?? null,
          metadata: clearOfflineQueueMetadata(input.metadata ?? null),
          createdAtMs: Date.now(),
        }),
      );
    }
    return { status: 'synced', requestId };
  } catch (error) {
    if (!isLikelyNetworkError(error)) throw error;
    const queuedMutation = await enqueueIntentRequestCreateMutation({
      recipientId: input.recipientId,
      type: input.type,
      message: input.message ?? null,
      suggestedTime: input.suggestedTime ?? null,
      suggestedPlace: input.suggestedPlace ?? null,
      metadata: input.metadata ?? {},
    });
    if (input.actorProfileId) {
      await addIntentRequestToSnapshots(
        input.snapshotOwnerIds,
        buildOptimisticIntentRequest({
          id: `offline-intent-queued:${queuedMutation.id}`,
          actorProfileId: input.actorProfileId,
          recipientId: input.recipientId,
          type: input.type,
          message: input.message ?? null,
          suggestedTime: input.suggestedTime ?? null,
          suggestedPlace: input.suggestedPlace ?? null,
          metadata: {
            ...(input.metadata ?? {}),
            offline_queue: buildOfflineQueueMetadata(
              'create',
              'queued',
              new Date(queuedMutation.createdAt).toISOString(),
            ),
          },
          createdAtMs: queuedMutation.createdAt,
        }),
      );
    }
    return { status: 'queued', requestId: null };
  }
}

export async function decideIntentRequestOfflineSafe(input: DecideIntentRequestInput): Promise<IntentActionResult> {
  try {
    const { error } = await supabase.rpc('rpc_decide_intent_request', {
      p_request_id: input.requestId,
      p_decision: input.decision,
    });
    if (error) throw error;

    if (input.decision === 'accept' && input.insertAcceptanceSystemMessages !== false) {
      const { error: systemError } = await supabase.rpc('rpc_insert_request_acceptance_system_messages', {
        p_request_id: input.requestId,
      });
      if (systemError) throw systemError;
    }
    await patchIntentRequestInSnapshots(input.snapshotOwnerIds, input.requestId, {
      status: input.decision === 'accept' ? 'accepted' : 'passed',
      metadataUpdater: clearOfflineQueueMetadata,
    });
    return { status: 'synced', requestId: input.requestId };
  } catch (error) {
    if (!isLikelyNetworkError(error)) throw error;
    const queuedMutation = await enqueueIntentRequestDecisionMutation({
      requestId: input.requestId,
      decision: input.decision,
      insertAcceptanceSystemMessages: input.insertAcceptanceSystemMessages,
    });
    await patchIntentRequestInSnapshots(input.snapshotOwnerIds, input.requestId, {
      status: input.decision === 'accept' ? 'accepted' : 'passed',
      metadataUpdater: (current) => ({
        ...(current ?? {}),
        offline_queue: buildOfflineQueueMetadata(
          input.decision,
          'queued',
          new Date(queuedMutation.createdAt).toISOString(),
        ),
      }),
    });
    return { status: 'queued', requestId: input.requestId };
  }
}

export async function cancelIntentRequestOfflineSafe(
  requestId: string,
  options?: { snapshotOwnerIds?: (string | null | undefined)[] },
): Promise<IntentActionResult> {
  try {
    const { error } = await supabase.rpc('rpc_cancel_intent_request', {
      p_request_id: requestId,
    });
    if (error) throw error;
    await patchIntentRequestInSnapshots(options?.snapshotOwnerIds, requestId, {
      status: 'cancelled',
      metadataUpdater: clearOfflineQueueMetadata,
    });
    return { status: 'synced', requestId };
  } catch (error) {
    if (!isLikelyNetworkError(error)) throw error;
    const queuedMutation = await enqueueIntentRequestCancelMutation({ requestId });
    await patchIntentRequestInSnapshots(options?.snapshotOwnerIds, requestId, {
      status: 'cancelled',
      metadataUpdater: (current) => ({
        ...(current ?? {}),
        offline_queue: buildOfflineQueueMetadata(
          'cancel',
          'queued',
          new Date(queuedMutation.createdAt).toISOString(),
        ),
      }),
    });
    return { status: 'queued', requestId };
  }
}
