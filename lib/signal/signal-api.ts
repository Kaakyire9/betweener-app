import { supabase } from "@/lib/supabase";
import type { SignalReasonKey } from "@/lib/signal/signal-reasons";

export type SignalSource = "vibes_card" | "profile" | "moment" | "intent";

export type SignalAccess = {
  plan: "FREE" | "SILVER" | "GOLD";
  limit: number;
  used: number;
  remaining: number;
  can_send: boolean;
};

export type SendSignalInput = {
  receiverProfileId: string;
  reasonKey: SignalReasonKey;
  note?: string | null;
  source?: SignalSource;
  sourceMomentId?: string | null;
};

export type SendSignalResult = {
  ok: true;
  signal: {
    id: string;
    reason_key: SignalReasonKey;
    reason: string;
    note: string | null;
    expires_at: string;
  };
  remainingSignals: number;
};

const normalizeAccess = (value: any): SignalAccess => ({
  plan: value?.plan === "GOLD" || value?.plan === "SILVER" ? value.plan : "FREE",
  limit: Number(value?.limit ?? 0),
  used: Number(value?.used ?? 0),
  remaining: Number(value?.remaining ?? 0),
  can_send: Boolean(value?.can_send),
});

export async function getSignalAccess() {
  const { data, error } = await supabase.rpc("rpc_get_signal_access");
  if (error) throw error;
  return normalizeAccess(data);
}

export async function sendSignal(input: SendSignalInput) {
  const { data, error } = await supabase.rpc("rpc_send_signal", {
    p_receiver_profile_id: input.receiverProfileId,
    p_reason_key: input.reasonKey,
    p_note: input.note?.trim() ? input.note.trim() : null,
    p_source: input.source ?? "profile",
    p_source_moment_id: input.sourceMomentId ?? null,
  });
  if (error) throw error;
  return data as SendSignalResult;
}

export function getSignalErrorMessage(error: unknown, recipientName?: string | null) {
  const raw =
    error && typeof error === "object" && "message" in error && typeof (error as any).message === "string"
      ? (error as any).message
      : String(error || "");

  if (/premium_required/i.test(raw)) return "Signals are available with Silver and Gold.";
  if (/signal_quota_exceeded/i.test(raw)) return "You have used your Signals for this week.";
  if (/duplicate_active_signal/i.test(raw)) {
    return `You already sent ${recipientName || "this person"} a Signal. It stays visible for 48 hours.`;
  }
  if (/blocked_or_unavailable/i.test(raw)) return "Unable to send a Signal to this profile.";
  if (/invalid_reason/i.test(raw)) return "Choose what stood out before sending.";
  if (/invalid_note/i.test(raw)) return "Keep the note under 120 characters.";
  return "Signal could not be sent. Please try again.";
}
