import AsyncStorage from '@react-native-async-storage/async-storage';
import { addEventListener as addNetInfoListener, fetch as fetchNetInfo } from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import { AppState } from 'react-native';

import { isNetworkConnectionAvailable } from '@/lib/network-state';
import { supabase } from '@/lib/supabase';

const QUEUE_KEY = 'offline:vibes-telemetry:v1';
const MAX_QUEUE_SIZE = 600;
const MAX_ATTEMPTS = 8;
const RETRY_DELAYS_MS = [2_000, 8_000, 30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000];

export type VibesServerSegment = 'for_you' | 'nearby' | 'active_now';
export type VibesExposureOutcome =
  | 'pass'
  | 'like'
  | 'signal'
  | 'intent'
  | 'profile_open'
  | 'intro_complete'
  | 'dismissed';

export type VibesTelemetryEventPayload = {
  clientEventId: string;
  viewerProfileId: string;
  targetProfileId: string;
  segment: VibesServerSegment;
  eventType: string;
  position: number | null;
  dwellMs: number | null;
  sessionId: string | null;
  requestId: string | null;
  recommendationId: string | null;
  metadata: Record<string, unknown>;
};

type VibesTelemetryMutation = {
  id: string;
  dedupeKey: string;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
} & (
  | { kind: 'event'; payload: VibesTelemetryEventPayload }
  | { kind: 'exposure_open'; payload: { recommendationId: string } }
  | {
      kind: 'exposure_close';
      payload: {
        recommendationId: string;
        dwellMs: number;
        outcome: VibesExposureOutcome | null;
        metadata: Record<string, unknown>;
      };
    }
);

let queueOperation: Promise<unknown> = Promise.resolve();
let drainInFlight: Promise<void> | null = null;

const withQueueLock = <T>(operation: () => Promise<T>): Promise<T> => {
  const next = queueOperation.then(operation, operation);
  queueOperation = next.catch(() => undefined);
  return next;
};

const readQueue = async (): Promise<VibesTelemetryMutation[]> => {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeQueue = async (queue: VibesTelemetryMutation[]) => {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE_SIZE)));
};

const enqueueMutation = (mutation: VibesTelemetryMutation) =>
  withQueueLock(async () => {
    const queue = await readQueue();
    const existingIndex = queue.findIndex((item) => item.dedupeKey === mutation.dedupeKey);

    if (existingIndex >= 0 && mutation.kind === 'exposure_close') {
      const existing = queue[existingIndex];
      if (existing.kind === 'exposure_close') {
        queue[existingIndex] = {
          ...mutation,
          createdAt: Math.min(existing.createdAt, mutation.createdAt),
          payload: {
            ...mutation.payload,
            dwellMs: Math.max(existing.payload.dwellMs, mutation.payload.dwellMs),
            outcome: mutation.payload.outcome ?? existing.payload.outcome,
            metadata: { ...existing.payload.metadata, ...mutation.payload.metadata },
          },
        };
      } else {
        queue[existingIndex] = mutation;
      }
    } else if (existingIndex < 0) {
      queue.push(mutation);
    }

    await writeQueue(queue);
  });

const executeMutation = async (mutation: VibesTelemetryMutation) => {
  if (mutation.kind === 'event') {
    const payload = mutation.payload;
    const { error } = await supabase.rpc('rpc_log_vibes_event_v5_3' as any, {
      p_client_event_id: payload.clientEventId,
      p_viewer_profile_id: payload.viewerProfileId,
      p_target_profile_id: payload.targetProfileId,
      p_segment: payload.segment,
      p_event_type: payload.eventType,
      p_position: payload.position,
      p_dwell_ms: payload.dwellMs,
      p_session_id: payload.sessionId,
      p_request_id: payload.requestId,
      p_recommendation_id: payload.recommendationId,
      p_metadata: payload.metadata,
    } as any);
    if (error) throw error;
    return;
  }

  if (mutation.kind === 'exposure_open') {
    const { error } = await supabase.rpc('rpc_mark_vibes_recommendation_seen' as any, {
      p_recommendation_id: mutation.payload.recommendationId,
    } as any);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.rpc('rpc_close_vibes_recommendation' as any, {
    p_recommendation_id: mutation.payload.recommendationId,
    p_dwell_ms: mutation.payload.dwellMs,
    p_outcome: mutation.payload.outcome,
    p_metadata: mutation.payload.metadata,
  } as any);
  if (error) throw error;
};

export const enqueueVibesEvent = async (
  payload: Omit<VibesTelemetryEventPayload, 'clientEventId'> & { clientEventId?: string },
) => {
  const clientEventId = payload.clientEventId ?? Crypto.randomUUID();
  await enqueueMutation({
    id: clientEventId,
    dedupeKey: `event:${clientEventId}`,
    kind: 'event',
    createdAt: Date.now(),
    attempts: 0,
    nextAttemptAt: 0,
    payload: { ...payload, clientEventId },
  });
  void drainVibesTelemetryQueue();
  return clientEventId;
};

export const enqueueVibesExposureOpen = async (recommendationId?: string | null) => {
  if (!recommendationId) return;
  await enqueueMutation({
    id: Crypto.randomUUID(),
    dedupeKey: `exposure-open:${recommendationId}`,
    kind: 'exposure_open',
    createdAt: Date.now(),
    attempts: 0,
    nextAttemptAt: 0,
    payload: { recommendationId },
  });
  void drainVibesTelemetryQueue();
};

export const enqueueVibesExposureClose = async (input: {
  recommendationId?: string | null;
  dwellMs: number;
  outcome?: VibesExposureOutcome | null;
  metadata?: Record<string, unknown>;
}) => {
  if (!input.recommendationId) return;
  await enqueueMutation({
    id: Crypto.randomUUID(),
    dedupeKey: `exposure-close:${input.recommendationId}`,
    kind: 'exposure_close',
    createdAt: Date.now(),
    attempts: 0,
    nextAttemptAt: 0,
    payload: {
      recommendationId: input.recommendationId,
      dwellMs: Math.max(0, Math.round(input.dwellMs)),
      outcome: input.outcome ?? null,
      metadata: input.metadata ?? {},
    },
  });
  void drainVibesTelemetryQueue();
};

export const drainVibesTelemetryQueue = async () => {
  if (drainInFlight) return drainInFlight;

  drainInFlight = (async () => {
    const network = await fetchNetInfo().catch(() => null);
    if (!network || !isNetworkConnectionAvailable(network)) return;

    await withQueueLock(async () => {
      const queue = await readQueue();
      if (queue.length === 0) return;

      const retained: VibesTelemetryMutation[] = [];
      const now = Date.now();

      for (const mutation of queue) {
        if (mutation.nextAttemptAt > now) {
          retained.push(mutation);
          continue;
        }

        try {
          await executeMutation(mutation);
        } catch {
          const attempts = mutation.attempts + 1;
          if (attempts < MAX_ATTEMPTS) {
            const retryDelay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)];
            retained.push({
              ...mutation,
              attempts,
              nextAttemptAt: Date.now() + retryDelay,
            });
          }
        }
      }

      await writeQueue(retained);
    });
  })().finally(() => {
    drainInFlight = null;
  });

  return drainInFlight;
};

export const startVibesTelemetryAutoDrain = () => {
  void drainVibesTelemetryQueue();

  const netInfoSubscription = addNetInfoListener((state) => {
    if (isNetworkConnectionAvailable(state)) {
      void drainVibesTelemetryQueue();
    }
  });
  const appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void drainVibesTelemetryQueue();
    }
  });
  const interval = setInterval(() => {
    if (AppState.currentState === 'active') {
      void drainVibesTelemetryQueue();
    }
  }, 30_000);

  return () => {
    netInfoSubscription();
    appStateSubscription.remove();
    clearInterval(interval);
  };
};
