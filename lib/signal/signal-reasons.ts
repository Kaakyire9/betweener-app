import type { Match } from "@/types/match";

export type SignalReasonKey =
  | "energy_stood_out"
  | "feels_intentional"
  | "shared_real_vibe"
  | "intro_caught_me"
  | "noticed_music"
  | "profile_feels_different"
  | "moment_stood_out"
  | "story_caught_me"
  | "music_overlap"
  | "sparked_curiosity"
  | "shared_interests";

export type SignalReason = {
  key: SignalReasonKey;
  label: string;
  context?: "default" | "profile" | "moment";
};

export const DEFAULT_SIGNAL_REASONS: SignalReason[] = [
  { key: "energy_stood_out", label: "Your energy stood out", context: "default" },
  { key: "feels_intentional", label: "This feels intentional", context: "default" },
  { key: "shared_real_vibe", label: "We share a real vibe", context: "default" },
  { key: "profile_feels_different", label: "Your profile feels different", context: "profile" },
];

export const MOMENT_SIGNAL_REASONS: SignalReason[] = [
  { key: "moment_stood_out", label: "That Moment stood out", context: "moment" },
  { key: "story_caught_me", label: "Your story caught me", context: "moment" },
  { key: "sparked_curiosity", label: "This sparked curiosity", context: "moment" },
];

const hasMusic = (values: unknown[]) =>
  values.some((value) => String(value || "").toLowerCase().includes("music"));

export function getSignalReasonsForProfile(match?: Match | null, source: "vibes_card" | "profile" | "moment" | "intent" = "profile") {
  const reasons = source === "moment" ? [...MOMENT_SIGNAL_REASONS] : [...DEFAULT_SIGNAL_REASONS];
  const interests = Array.isArray((match as any)?.interests) ? ((match as any).interests as unknown[]) : [];
  const commonInterests = Array.isArray((match as any)?.commonInterests) ? ((match as any).commonInterests as unknown[]) : [];
  const hasShared = commonInterests.length > 0;
  const hasIntro = Boolean((match as any)?.profileVideo || (match as any)?.profileVideoPath);

  if (hasIntro && !reasons.some((reason) => reason.key === "intro_caught_me")) {
    reasons.splice(1, 0, { key: "intro_caught_me", label: "Your intro caught me", context: "profile" });
  }

  if (hasMusic([...interests, ...commonInterests]) && !reasons.some((reason) => reason.key === "noticed_music")) {
    reasons.splice(2, 0, { key: "noticed_music", label: "I noticed your music", context: "profile" });
  }

  if (hasShared && !reasons.some((reason) => reason.key === "shared_interests")) {
    reasons.splice(2, 0, { key: "shared_interests", label: "I noticed our shared interests", context: "profile" });
  }

  return reasons.slice(0, 6);
}
