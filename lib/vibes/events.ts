import type { VibesSegment } from '@/lib/vibes/discovery-logic';
import { enqueueVibesEvent } from '@/lib/vibes/telemetry-queue';

export type VibesEventType =
  | 'card_seen'
  | 'profile_opened'
  | 'full_profile_opened'
  | 'intro_played'
  | 'intro_completed'
  | 'profile_saved'
  | 'pass'
  | 'like'
  | 'signal_opened'
  | 'signal_sent'
  | 'intent_opened'
  | 'intent_sent'
  | 'undo';

const toServerSegment = (segment: VibesSegment) =>
  segment === 'activeNow' ? 'active_now' : segment === 'nearby' ? 'nearby' : 'for_you';

export async function logVibesEvent(input: {
  viewerProfileId?: string | null;
  targetProfileId?: string | null;
  segment: VibesSegment;
  eventType: VibesEventType;
  position?: number | null;
  dwellMs?: number | null;
  sessionId?: string | null;
  requestId?: string | null;
  recommendationId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const {
    viewerProfileId,
    targetProfileId,
    segment,
    eventType,
    position = null,
    dwellMs = null,
    sessionId = null,
    requestId = null,
    recommendationId = null,
    metadata = {},
  } = input;

  if (!viewerProfileId || !targetProfileId || viewerProfileId === targetProfileId) return;

  try {
    await enqueueVibesEvent({
      viewerProfileId,
      targetProfileId,
      segment: toServerSegment(segment),
      eventType,
      position,
      dwellMs,
      sessionId,
      requestId,
      recommendationId,
      metadata,
    });
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[vibes] telemetry enqueue failed', eventType, error);
    }
  }
}
