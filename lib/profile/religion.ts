export const RELIGION_OPTIONS = [
  { value: "CHRISTIAN", label: "Christian" },
  { value: "MUSLIM", label: "Muslim" },
  { value: "TRADITIONALIST", label: "Traditionalist" },
  { value: "JEWISH", label: "Jewish" },
  { value: "HINDU", label: "Hindu" },
  { value: "BUDDHIST", label: "Buddhist" },
  { value: "SPIRITUAL", label: "Spiritual" },
  { value: "NONE", label: "No religion" },
  { value: "OTHER", label: "Other" },
] as const;

export type ReligionValue = (typeof RELIGION_OPTIONS)[number]["value"];

const RELIGION_BY_VALUE = new Map(RELIGION_OPTIONS.map((option) => [option.value, option]));
const RELIGION_BY_LABEL = new Map(RELIGION_OPTIONS.map((option) => [option.label.toLowerCase(), option]));

export const RELIGION_LABELS = RELIGION_OPTIONS.map((option) => option.label);

export function normalizeReligionForProfile(input?: string | null): ReligionValue {
  const raw = String(input || "").trim();
  if (!raw) return "OTHER";

  const upper = raw.toUpperCase().replace(/[\s-]+/g, "_");
  const byValue = RELIGION_BY_VALUE.get(upper as ReligionValue);
  if (byValue) return byValue.value;

  const byLabel = RELIGION_BY_LABEL.get(raw.toLowerCase());
  if (byLabel) return byLabel.value;

  if (upper === "NO_RELIGION" || upper === "NO_RELIGIOUS_AFFILIATION" || upper === "NONE") {
    return "NONE";
  }

  return "OTHER";
}

export function formatReligionLabel(input?: string | null): string {
  const raw = String(input || "").trim();
  if (!raw) return "";

  const normalized = normalizeReligionForProfile(raw);
  const option = RELIGION_BY_VALUE.get(normalized);
  return option?.label ?? raw;
}

export function isReligionEnumError(error: unknown): boolean {
  const code = String((error as any)?.code || "");
  const message = String((error as any)?.message || "").toLowerCase();
  return code === "22P02" && message.includes("enum religion");
}
