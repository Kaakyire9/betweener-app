import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/telemetry/logger";

export type ProfileGiftEventType =
  | "sent"
  | "revealed"
  | "archived"
  | "sender_profile_opened"
  | "recipient_profile_opened";

export async function logProfileGiftEvent(input: {
  giftId?: string | null;
  eventType: ProfileGiftEventType;
  metadata?: Record<string, unknown>;
}) {
  const { giftId, eventType, metadata = {} } = input;
  if (!giftId) return false;

  try {
    const { error } = await supabase.rpc("rpc_log_profile_gift_event" as any, {
      p_gift_id: giftId,
      p_event_type: eventType,
      p_metadata: metadata,
    } as any);

    if (error) {
      logger.warn("[gifts] log_profile_gift_event_failed", {
        giftId,
        eventType,
        message: String(error.message || error),
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.warn("[gifts] log_profile_gift_event_throw", {
      giftId,
      eventType,
      message: String((error as any)?.message || error || "unknown"),
    });
    return false;
  }
}
