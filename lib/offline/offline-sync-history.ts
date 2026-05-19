import type { FailedOfflineMutation, OfflineMutation } from '@/lib/offline/mutation-queue';
import {
  describeOfflineSyncMutation,
  type OfflineSyncScope,
} from '@/lib/offline/offline-sync-presenter';
import { readOfflineData, writeOfflineEnvelope } from '@/lib/offline/core';

const OFFLINE_SYNC_HISTORY_KEY = 'offline:sync-history:v1';
const MAX_OFFLINE_SYNC_HISTORY_ENTRIES = 60;

export type OfflineSyncHistoryEntry = {
  id: string;
  mutationId: string;
  mutationKind: OfflineMutation['kind'];
  eventType: 'completed' | 'failed';
  at: number;
  title: string;
  detail: string;
  icon: string;
  scope: OfflineSyncScope;
  failureReason?: string | null;
};

const isFailedMutation = (
  mutation: OfflineMutation | FailedOfflineMutation,
): mutation is FailedOfflineMutation => 'failedAt' in mutation;

export async function readOfflineSyncHistory(): Promise<OfflineSyncHistoryEntry[]> {
  const data = await readOfflineData<OfflineSyncHistoryEntry[]>(OFFLINE_SYNC_HISTORY_KEY);
  return Array.isArray(data) ? data : [];
}

export async function appendOfflineSyncHistoryEntry(params: {
  eventType: 'completed' | 'failed';
  mutation: OfflineMutation | FailedOfflineMutation;
}) {
  const descriptor = describeOfflineSyncMutation(params.mutation);
  const entry: OfflineSyncHistoryEntry = {
    id: `${params.eventType}:${params.mutation.id}:${Date.now()}`,
    mutationId: params.mutation.id,
    mutationKind: params.mutation.kind,
    eventType: params.eventType,
    at:
      params.eventType === 'failed' && isFailedMutation(params.mutation)
        ? params.mutation.failedAt
        : Date.now(),
    title: descriptor.title,
    detail: descriptor.detail,
    icon: descriptor.icon,
    scope: descriptor.scope,
    failureReason: isFailedMutation(params.mutation) ? params.mutation.failureReason : null,
  };

  const current = await readOfflineSyncHistory();
  const next = [entry, ...current].slice(0, MAX_OFFLINE_SYNC_HISTORY_ENTRIES);
  await writeOfflineEnvelope(OFFLINE_SYNC_HISTORY_KEY, next, {
    kind: 'offline-sync-history',
    staleAfterMs: 14 * 24 * 60 * 60 * 1000,
  });
}
