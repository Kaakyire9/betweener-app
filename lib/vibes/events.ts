import { supabase } from '@/lib/supabase';
import type { VibesSegment } from '@/lib/vibes/discovery-logic';

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
  metadata?: Record<string, unknown>;
}) {
  const {
    viewerProfileId,
    targetProfileId,
    segment,
    eventType,
    position = null,
    dwellMs = null,
    metadata = {},
  } = input;

  if (!viewerProfileId || !targetProfileId || viewerProfileId === targetProfileId) return;

  try {
    await supabase.rpc('rpc_log_vibes_event' as any, {
      p_viewer_profile_id: viewerProfileId,
      p_target_profile_id: targetProfileId,
      p_segment: toServerSegment(segment),
      p_event_type: eventType,
      p_position: position,
      p_dwell_ms: dwellMs,
      p_metadata: metadata,
    } as any);
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[vibes] event log failed', eventType, error);
    }
  }
}
