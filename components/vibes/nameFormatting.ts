export type CardDisplayName = {
  name: string;
  ageLabel: string | null;
  accessibilityLabel: string;
};

const FALLBACK_NAME = "Someone nearby";

const compactWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

export function formatDisplayNameForCard(
  name: string | null | undefined,
  age?: number | null,
  maxChars = 24,
): CardDisplayName {
  const safeMax = Math.max(8, maxChars);
  const rawName = compactWhitespace(String(name || ""));
  const parts = rawName ? rawName.split(" ").filter(Boolean) : [];
  const preferred =
    parts.length >= 2 ? `${parts[0]} ${parts[1]}` : parts[0] || FALLBACK_NAME;
  const firstOnly = parts[0] || FALLBACK_NAME;
  const ageLabel = typeof age === "number" && Number.isFinite(age) && age > 0 ? String(age) : null;

  let displayName = preferred;
  if (displayName.length > safeMax) {
    displayName = `${displayName.slice(0, Math.max(1, safeMax - 1)).trimEnd()}…`;
  }
  if (displayName.length > safeMax && firstOnly) {
    displayName = firstOnly.length > safeMax
      ? `${firstOnly.slice(0, Math.max(1, safeMax - 1)).trimEnd()}…`
      : firstOnly;
  }

  return {
    name: displayName || FALLBACK_NAME,
    ageLabel,
    accessibilityLabel: ageLabel ? `${displayName}, ${ageLabel}` : displayName,
  };
}

