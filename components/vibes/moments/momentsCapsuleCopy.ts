export const MOMENTS_CAPSULE_COPY = {
  eyebrow: "Community pulse",
  title: "Moments",
  emptySubtitle: "Share a moment to warm up discovery.",
  ownLabel: "You",
  liveStatus: "Live now",
  addStatus: "Add Moment",
  seeAll: "See all",
} as const;

export function formatMomentFirstName(name?: string | null, maxChars = 9) {
  const first = String(name || "Member").trim().split(/\s+/)[0] || "Member";
  if (first.length <= maxChars) return first;
  return `${first.slice(0, Math.max(1, maxChars - 1))}...`;
}
